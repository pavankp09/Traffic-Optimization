"""
Lightweight pure-Python Gymnasium environment for traffic-signal RL.

This is a real reinforcement-learning environment — PPO trains on it with
genuine gradient updates — but it uses a fast point-queue traffic model
instead of SUMO/TraCI, so it runs anywhere with no external simulator.

Model
-----
A 4-arm intersection (N, S, E, W). Each arm holds a queue of waiting
vehicles. Vehicles arrive as a Poisson process driven by the configured
demand. On each decision the agent picks a phase (which arms get green) and
a green duration; green arms discharge at a saturation flow rate while red
arms keep accumulating delay. A fixed lost-time (yellow + all-red) is paid
on every phase change, so needlessly switching phases is penalised — the
agent must learn to hold useful greens and serve the busiest arms.

Observation (26-dim, normalised)
    per arm N,S,E,W:  [queue, mean_wait, arrival_rate, just_served]   (16)
    per arm N,S,E,W:  [delta_queue]  — trend: growing/shrinking       (4)
    phase one-hot                                                      (5)
    fraction of episode elapsed                                        (1)

Action: Discrete(35) = 5 phases x 7 durations  (same scheme as traffic_env)

Reward (per decision):
    - queue        penalty   (absolute queue size)
    - imbalance    penalty   (unfair arm serving)   [improvement #3]
    - baseline_gap bonus     (improvement vs baseline wait)  [improvement #1]
    + throughput   bonus
    - lost-time    penalty   (phase-switch cost)
"""
from __future__ import annotations

import logging
import numpy as np
import gymnasium as gym
from gymnasium import spaces
from typing import Optional

from backend.config import SimulationConfig, AdverseConfig

logger = logging.getLogger(__name__)

# Phase -> set of arms that get green. Four productive phases + one all-red.
PHASE_GREEN: dict[int, frozenset] = {
    0: frozenset({"N", "S"}),   # north-south through
    1: frozenset({"E", "W"}),   # east-west through
    2: frozenset({"N", "E"}),   # diagonal pair
    3: frozenset({"S", "W"}),   # diagonal pair
    4: frozenset(),             # all-red / pedestrian
}
DURATIONS = [15, 20, 25, 30, 40, 50, 60]
N_PHASES = len(PHASE_GREEN)        # 5
N_DURATIONS = len(DURATIONS)       # 7
N_ACTIONS = N_PHASES * N_DURATIONS  # 35
ARMS = ["N", "S", "E", "W"]

_SAT_FLOW_PER_S = 0.5        # vehicles discharged per green-arm-lane per second
_LOST_TIME_S = 6.0           # yellow + all-red paid on each phase change
_QUEUE_NORM = 60.0           # normalisation cap for queue length
_WAIT_NORM = 120.0           # normalisation cap for mean wait (s)
_RATE_NORM = 1.0             # normalisation cap for per-arm arrival rate (veh/s)
_EPISODE_DECISIONS = 40      # agent decisions per episode
# Starvation is measured in *decisions* here (not 0.5 s sim-steps like the SUMO env),
# so it uses a small episode-appropriate threshold rather than config.starvation_threshold_steps.
_STARVATION_DECISIONS = 12   # an arm unserved for this many decisions is "starved"
                             # must be > a full phase cycle (N+S then E+W = 2 decisions minimum)
_ALL_RED_PHASE = 4           # phase index that serves no arm

OBS_LABELS: list[str] = [
    "N Queue (veh)", "N Wait (s)", "N Arrival Rate", "N Just Served",
    "S Queue (veh)", "S Wait (s)", "S Arrival Rate", "S Just Served",
    "E Queue (veh)", "E Wait (s)", "E Arrival Rate", "E Just Served",
    "W Queue (veh)", "W Wait (s)", "W Arrival Rate", "W Just Served",
    "N Queue Δ", "S Queue Δ", "E Queue Δ", "W Queue Δ",
    "Phase 0 (N+S)", "Phase 1 (E+W)", "Phase 2 (N+E)",
    "Phase 3 (S+W)", "Phase 4 (All-Red)",
    "Episode Progress",
]

PHASE_NAMES: list[str] = ["N+S Green", "E+W Green", "N+E Green", "S+W Green", "All Red"]


def action_to_phase_duration(action: int) -> tuple[int, float]:
    phase_idx = action // N_DURATIONS
    dur_idx = action % N_DURATIONS
    return phase_idx, float(DURATIONS[dur_idx])


class MockTrafficEnv(gym.Env):
    """Point-queue intersection environment for fast, SUMO-free RL training."""

    metadata = {"render_modes": []}

    def __init__(
        self,
        sim_config: SimulationConfig,
        adverse_config: Optional[AdverseConfig] = None,
        seed: int = 42,
        baseline_wait: float = 0.0,  # improvement #1: reference target from baseline run
    ):
        super().__init__()
        self.sim_config = sim_config
        self.adverse_config = adverse_config or AdverseConfig()

        # 26-dim obs: 16 (queue/wait/rate/served per arm) + 4 (delta_queue) + 5 (phase) + 1 (progress)
        # delta_queue can be negative (shrinking), so low=-1.0
        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(26,), dtype=np.float32)
        self.action_space = spaces.Discrete(N_ACTIONS)

        self._rng = np.random.default_rng(seed)
        self._baseline_wait = baseline_wait  # improvement #1: set from outside after baseline runs

        self._lanes = max(1, sim_config.lanes_per_arm)

        # Filter active arms depending on intersection type
        active_arms = ["N", "E", "W"] if sim_config.intersection_type in ("t_junction", "t_junction_free_left") else ARMS
        configured_vps = sim_config.traffic_volume_vph / 3600.0
        n_arms = len(active_arms)

        if sim_config.traffic_pattern in ("morning_peak", "evening_peak"):
            if n_arms == 3:
                w = {"N": 0.5, "E": 0.25, "W": 0.25, "S": 0.0}
            else:
                w = {"N": 0.35, "S": 0.35, "E": 0.15, "W": 0.15}
        else:
            w = {a: (1.0 / n_arms if a in active_arms else 0.0) for a in ARMS}
        # Set arrival rate: active arms get their share, inactive arms get 0
        self._arrival_rate = {a: configured_vps * w[a] * n_arms if a in active_arms else 0.0 for a in ARMS}

        # Episode state
        self._queue: dict[str, float] = {a: 0.0 for a in ARMS}
        self._prev_queue: dict[str, float] = {a: 0.0 for a in ARMS}  # improvement #4
        self._current_phase = 0
        self._just_served: dict[str, float] = {a: 0.0 for a in ARMS}
        self._since_served: dict[str, int] = {a: 0 for a in ARMS}  # decisions since last served
        self._decision = 0
        self._ep_throughput = 0
        self._ep_queue_area = 0.0
        self._ep_arrivals = 0.0
        self._ep_time = 0.0

    def _obs(self) -> np.ndarray:
        feats: list[float] = []
        # 16 features: queue, wait, rate, just_served per arm
        for a in ARMS:
            wait_proxy = self._queue[a] / max(self._arrival_rate[a], 1e-3)
            feats.append(min(self._queue[a] / _QUEUE_NORM, 1.0))
            feats.append(min(wait_proxy / _WAIT_NORM, 1.0))
            feats.append(min(self._arrival_rate[a] / _RATE_NORM, 1.0))
            feats.append(self._just_served[a])
        # improvement #4: 4 delta_queue features — tells RL if queues are growing or shrinking
        for a in ARMS:
            delta = self._queue[a] - self._prev_queue[a]
            feats.append(float(np.clip(delta / _QUEUE_NORM, -1.0, 1.0)))
        # 5 phase one-hot + 1 progress
        feats.extend([1.0 if i == self._current_phase else 0.0 for i in range(N_PHASES)])
        feats.append(self._decision / _EPISODE_DECISIONS)
        return np.asarray(feats, dtype=np.float32)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        if seed is not None:
            self._rng = np.random.default_rng(seed)
        active_arms = ["N", "E", "W"] if self.sim_config.intersection_type in ("t_junction", "t_junction_free_left") else ARMS
        self._queue = {a: float(self._rng.integers(2, 8)) if a in active_arms else 0.0 for a in ARMS}
        self._prev_queue = dict(self._queue)  # improvement #4
        self._current_phase = 0
        self._just_served = {a: 0.0 for a in ARMS}
        self._since_served = {a: 0 for a in ARMS}
        self._decision = 0
        self._ep_throughput = 0
        self._ep_queue_area = 0.0
        self._ep_arrivals = 0.0
        self._ep_time = 0.0
        return self._obs(), {}

    def step(self, action: int):
        phase, duration = action_to_phase_duration(int(action))
        green = PHASE_GREEN[phase]

        switched = phase != self._current_phase
        lost = _LOST_TIME_S if switched else 0.0
        # Stage 2: startup lost time — vehicles take time to start moving after green
        startup_loss = (
            self.sim_config.startup_lost_time_s
            if getattr(self.sim_config, 'training_stage', 1) >= 2
            else 0.0
        )
        effective_green = max(0.0, duration - lost - startup_loss)
        # Stage 2: pedestrian crossing requests steal from effective green
        if (getattr(self.sim_config, 'training_stage', 1) >= 2
                and self.sim_config.pedestrian_crossings != 'disabled'):
            ped_prob = getattr(self.sim_config, 'pedestrian_crossing_prob', 0.0)
            if ped_prob > 0.0 and self._rng.random() < ped_prob:
                ped_walk = float(self.sim_config.pedestrian_walk_seconds)
                effective_green = max(0.0, effective_green - ped_walk)

        # improvement #4: snapshot queue before changes for delta calculation
        self._prev_queue = dict(self._queue)

        served_total = 0.0
        self._just_served = {a: 0.0 for a in ARMS}

        # Stage 2: heavy vehicles (bus, truck) take ~2× headway → reduce sat flow
        if getattr(self.sim_config, 'training_stage', 1) >= 2:
            heavy_pct = (
                getattr(self.sim_config, 'pct_tsrtc_bus', 2.0) +
                getattr(self.sim_config, 'pct_school_bus', 0.0) +
                getattr(self.sim_config, 'pct_truck', 1.0)
            )
            heavy_ratio = heavy_pct / 100.0
            factor = getattr(self.sim_config, 'saturation_flow_heavy_factor', 0.5)
            effective_sat_flow = _SAT_FLOW_PER_S * (1.0 - heavy_ratio * factor)
        else:
            effective_sat_flow = _SAT_FLOW_PER_S
        per_arm_capacity = effective_sat_flow * self._lanes * effective_green
        for a in ARMS:
            arrivals = float(self._rng.poisson(self._arrival_rate[a] * duration))
            self._queue[a] += arrivals
            self._ep_arrivals += arrivals
            if a in green:
                served = min(self._queue[a], per_arm_capacity)
                self._queue[a] -= served
                served_total += served
                self._just_served[a] = 1.0

        # Track decisions since each arm was last served (for the starvation guard)
        for a in ARMS:
            if self._just_served[a] > 0.0:
                self._since_served[a] = 0
            else:
                self._since_served[a] += 1

        self._current_phase = phase
        self._decision += 1

        total_queue = sum(self._queue.values())
        self._ep_queue_area += total_queue * duration
        self._ep_time += duration
        self._ep_throughput += int(served_total)

        ep_mean_wait = self._ep_queue_area / max(self._ep_arrivals, 1.0)
        throughput_vph = self._ep_throughput / max(self._ep_time / 3600.0, 1e-6)

        # ---- reward computation ----
        prev_total = sum(self._prev_queue.values())
        lost_penalty = lost / _LOST_TIME_S if switched else 0.0

        # PRIMARY SIGNAL: delta queue normalised by arrival rate.
        # Works at ANY demand level — rewards slowing queue growth, not absolute size.
        # An agent that clears more than arrives gets positive delta; one that parks on
        # all-red gets a large negative delta proportional to how fast queues grew.
        expected_arrival = sum(self._arrival_rate[a] * duration for a in ARMS)
        delta_queue = total_queue - prev_total          # negative = queues shrank
        delta_queue_norm = delta_queue / max(expected_arrival, 1.0)  # −1 .. +1 range

        # Flow efficiency: fraction of green capacity used (secondary shaping).
        n_green = len(green)
        max_serve = per_arm_capacity * n_green
        flow_efficiency = served_total / max_serve if max_serve > 0 else 0.0

        # All-red penalty: explicitly discourage parking on phase 4.
        all_red_penalty = 1.0 if phase == _ALL_RED_PHASE else 0.0

        # Imbalance: fraction of total queue concentrated on one arm vs another.
        # Normalised by total_queue so it stays in [0,1] at any demand level.
        queues = list(self._queue.values())
        imbalance_penalty = (max(queues) - min(queues)) / max(total_queue, 1.0)

        # Starvation guard (threshold raised to 12 to survive a full phase cycle).
        starvation_penalty = sum(
            1 for a in ARMS
            if self._since_served[a] > _STARVATION_DECISIONS and self._queue[a] > 3
        )

        # Baseline shaping: reward beating the baseline's episode wait time.
        baseline_bonus = 0.0
        if self._baseline_wait > 0:
            improvement_ratio = (self._baseline_wait - ep_mean_wait) / self._baseline_wait
            baseline_bonus = 0.3 * float(np.clip(improvement_ratio, -1.0, 1.0))

        # Stage 2: spillback penalty when queue exceeds road capacity
        spillback_penalty = 0.0
        if getattr(self.sim_config, 'training_stage', 1) >= 2:
            cap = float(getattr(self.sim_config, 'spillback_capacity_vehicles', 24))
            spillback_penalty = sum(
                max(0.0, (q - cap) / max(cap, 1.0))
                for q in self._queue.values()
            )

        reward = (
            - 2.0 * delta_queue_norm                                  # primary: slow queue growth
            + self.sim_config.reward_wt_flow_efficiency * flow_efficiency  # efficient green use
            - self.sim_config.reward_wt_switch * lost_penalty         # penalise needless switching
            - self.sim_config.reward_wt_pressure * imbalance_penalty  # penalise arm starvation
            - self.sim_config.reward_wt_starvation * starvation_penalty
            - 2.0 * all_red_penalty                                   # hard penalty for all-red
            - 0.8 * spillback_penalty
            + baseline_bonus
        )

        terminated = self._decision >= _EPISODE_DECISIONS
        info = {
            "mean_wait": float(ep_mean_wait),
            "throughput": int(throughput_vph),
            "phase": phase,
            "duration": duration,
            "reward_parts": {
                "delta_queue":  round(-2.0 * delta_queue_norm, 3),
                "flow_eff":     round(self.sim_config.reward_wt_flow_efficiency * flow_efficiency, 3),
                "switch":       round(-self.sim_config.reward_wt_switch * lost_penalty, 3),
                "imbalance":    round(-self.sim_config.reward_wt_pressure * imbalance_penalty, 3),
                "starvation":   round(-self.sim_config.reward_wt_starvation * starvation_penalty, 3),
                "baseline_gap": round(baseline_bonus, 3),
                "all_red":      round(-2.0 * all_red_penalty, 3),
                **( {"spillback": round(-0.8 * spillback_penalty, 3)} if getattr(self.sim_config, 'training_stage', 1) >= 2 else {} ),
            },
        }
        return self._obs(), float(reward), terminated, False, info

    def close(self):
        pass


# ---------------------------------------------------------------------------
# Baseline runners
# ---------------------------------------------------------------------------

def run_fixed_time_baseline(
    sim_config: Optional[SimulationConfig] = None,
    adverse_config: Optional[AdverseConfig] = None,
    seed: int = 7,
) -> dict:
    """Run one episode of a fixed-time controller (N-S / E-W, 30 s each).

    Returns {'mean_wait', 'throughput', 'demonstrations': []}.
    demonstrations is empty because fixed-time decisions are hardcoded
    and not useful for behavioral cloning.
    """
    env = make_mock_env(sim_config, adverse_config, seed=seed)
    env.reset(seed=seed)
    fixed_dur_idx = DURATIONS.index(30)
    info: dict = {}
    for i in range(_EPISODE_DECISIONS):
        phase = 0 if (i % 2 == 0) else 1
        action = phase * N_DURATIONS + fixed_dur_idx
        _, _, term, _, info = env.step(action)
        if term:
            break
    return {
        "mean_wait": float(info.get("mean_wait", 0.0)),
        "throughput": int(info.get("throughput", 0)),
        "demonstrations": [],  # no BC for fixed-time
    }


def run_websters_baseline(
    sim_config: Optional[SimulationConfig] = None,
    adverse_config: Optional[AdverseConfig] = None,
    n_decisions: int = 200,
    seed: int = 7,
) -> dict:
    """Run Webster's adaptive controller and collect (obs, action) pairs.

    Webster's adapts green duration to queue lengths, so its decisions
    vary with traffic state — useful for behavioral cloning pre-training.

    Returns {'mean_wait', 'throughput', 'demonstrations': [(obs, action), ...]}.
    """
    from backend.rl.baseline_agent import WebstersController

    env = make_mock_env(sim_config, adverse_config, seed=seed)
    obs, _ = env.reset(seed=seed)

    ctrl = WebstersController(
        n_phases=N_PHASES,
        min_green_s=getattr(sim_config, "min_green_seconds", 15) if sim_config else 15,
        max_green_s=getattr(sim_config, "max_green_seconds", 60) if sim_config else 60,
    )

    demonstrations: list[tuple[np.ndarray, int]] = []
    info: dict = {}

    for _ in range(n_decisions):
        action, _ = ctrl.predict(obs)
        demonstrations.append((obs.copy(), int(action)))
        obs, _, terminated, _, info = env.step(action)
        if terminated:
            obs, _ = env.reset()
            ctrl.reset()

    logger.info(
        "Webster's baseline: mean_wait=%.1fs  throughput=%d vph  demos=%d",
        info.get("mean_wait", 0.0),
        info.get("throughput", 0),
        len(demonstrations),
    )
    return {
        "mean_wait": float(info.get("mean_wait", 0.0)),
        "throughput": int(info.get("throughput", 0)),
        "demonstrations": demonstrations,
    }


def make_mock_env(
    sim_config: Optional[SimulationConfig] = None,
    adverse_config: Optional[AdverseConfig] = None,
    baseline_wait: float = 0.0,
    **kwargs,
) -> MockTrafficEnv:
    """Factory matching the make_env signature used by PPOTrainer."""
    return MockTrafficEnv(
        sim_config or SimulationConfig(),
        adverse_config,
        baseline_wait=baseline_wait,
        **kwargs,
    )
