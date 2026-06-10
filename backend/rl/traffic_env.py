"""
Custom Gymnasium environment for traffic signal control.
State: 22-dim normalised vector (see state_extractor.py)
Action: Discrete(35) = 5 phases x 7 durations
Reward: multi-term formula penalising wait/queue, rewarding throughput
"""
from __future__ import annotations
import os
import numpy as np
import gymnasium as gym
from gymnasium import spaces
from typing import Optional, Tuple, Dict, Any

from backend.config import SimulationConfig, AdverseConfig
from backend.simulation.sumo_env import SumoEnv
from backend.simulation.intersection_builder import IntersectionBuilder
from backend.simulation.demand_generator import DemandGenerator
from backend.simulation.state_extractor import StateExtractor
from backend.simulation.adverse_injector import AdverseInjector

# Phase definitions: 5 phases for Hyderabad 5-phase scheme
PHASES = [0, 1, 2, 3, 4]  # N-S straight, E-W straight, right-turn, U-turn, pedestrian

# Duration choices in seconds
DURATIONS = [15, 20, 25, 30, 40, 50, 60]

N_PHASES = len(PHASES)       # 5
N_DURATIONS = len(DURATIONS) # 7
N_ACTIONS = N_PHASES * N_DURATIONS  # 35

# Maps phase index to the primary arm it serves; phase 4 (pedestrian) serves all
PHASE_TO_ARM: dict = {0: "N", 1: "S", 2: "E", 3: "W", 4: None}


def action_to_phase_duration(action: int) -> Tuple[int, float]:
    """Decode flat action index to (phase_index, duration_s)."""
    phase_idx = action // N_DURATIONS
    dur_idx = action % N_DURATIONS
    return PHASES[phase_idx], float(DURATIONS[dur_idx])


class TrafficEnv(gym.Env):
    """
    Gymnasium environment wrapping SUMO + TraCI for RL training.
    One episode = one full simulation run (warm-up + training window).
    """

    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        sim_config: SimulationConfig,
        adverse_config: Optional[AdverseConfig] = None,
        episode_duration_s: float = 1800.0,
        output_dir: str = "/tmp/tso_rl",
        port: int = 8813,
        seed: int = 42,
        baseline_wait: float = 0.0,
    ):
        super().__init__()
        self.sim_config = sim_config
        self.adverse_config = adverse_config or AdverseConfig()
        self.episode_duration_s = episode_duration_s
        self.output_dir = output_dir
        self.port = port
        self._seed = seed

        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(22,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(N_ACTIONS)

        self._sumo: Optional[SumoEnv] = None
        self._state_extractor: Optional[StateExtractor] = None
        self._adverse: Optional[AdverseInjector] = None
        self._current_phase = 0
        self._phase_elapsed = 0.0
        self._current_duration = 30.0
        self._step_count = 0
        self._total_steps = int(episode_duration_s / sim_config.step_length_seconds)
        self._episode_reward = 0.0
        self._baseline_wait = 60.0  # updated after each episode
        self._prev_throughput = 0
        self._tl_id = "center"
        self._baseline_wait: float = baseline_wait
        self._arm_last_green: dict = {"N": 0, "S": 0, "E": 0, "W": 0}

    # ------------------------------------------------------------------
    # Gymnasium interface
    # ------------------------------------------------------------------

    def reset(self, *, seed=None, options=None) -> Tuple[np.ndarray, Dict]:
        super().reset(seed=seed)
        if self._sumo is not None:
            self._sumo.stop()

        os.makedirs(self.output_dir, exist_ok=True)
        builder = IntersectionBuilder(self.sim_config, output_dir=self.output_dir)
        net_file, _ = builder.build()
        self._tl_id = IntersectionBuilder.get_tl_id_from_net(net_file)

        gen = DemandGenerator(self.sim_config, seed=self._seed)
        rou_file = os.path.join(self.output_dir, "routes.rou.xml")
        gen.generate(rou_file, duration_s=self.episode_duration_s)

        self._sumo = SumoEnv(
            net_file=net_file,
            rou_file=rou_file,
            step_length=self.sim_config.step_length_seconds,
            sim_speed_multiplier=self.sim_config.sim_speed_multiplier,
            junction_id=self._tl_id,
            seed=self._seed,
        )
        self._sumo.start(port=self.port)

        self._state_extractor = StateExtractor(
            max_phase_duration=float(self.sim_config.max_green_seconds),
        )
        self._adverse = AdverseInjector(self.adverse_config, seed=self._seed)
        self._current_phase = 0
        self._phase_elapsed = 0.0
        self._current_duration = float(self.sim_config.min_green_seconds)
        self._step_count = 0
        self._episode_reward = 0.0
        self._arm_last_green = {"N": 0, "S": 0, "E": 0, "W": 0}

        # Warm-up: step without RL control
        warmup_steps = int(self.sim_config.warm_up_seconds / self.sim_config.step_length_seconds)
        for _ in range(warmup_steps):
            self._sumo.step()
            self._step_count += 1

        frame = self._sumo.step()
        self._step_count += 1
        state, _ = self._state_extractor.extract(frame, self._current_phase, self._phase_elapsed)
        return state, {}

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        assert self._sumo is not None, "Call reset() before step()"

        phase, duration = action_to_phase_duration(action)

        # Compute phase-change flag before the loop so it can be passed to _compute_reward
        num_changes = 1 if phase != self._current_phase else 0
        active_arm = PHASE_TO_ARM.get(phase)

        action_freq = max(1, int(self.sim_config.action_frequency_seconds / self.sim_config.step_length_seconds))
        reward_acc = 0.0

        for _ in range(action_freq):
            if self._step_count >= self._total_steps:
                break
            try:
                self._sumo.set_phase(self._tl_id, phase, duration)
            except Exception:
                pass

            frame = self._sumo.step()
            self._step_count += 1
            self._phase_elapsed += self.sim_config.step_length_seconds

            # Update arm starvation counters: reset active arm, increment all others
            for arm in self._arm_last_green:
                if arm == active_arm:
                    self._arm_last_green[arm] = 0
                else:
                    self._arm_last_green[arm] += 1

            vehicles_per_arm = {
                arm: sum(1 for v in frame.vehicles if v.arm == arm)
                for arm in ["N", "S", "E", "W"]
            }
            adverse_events = self._adverse.tick(
                self._step_count,
                self.sim_config.step_length_seconds,
                self._total_steps,
                vehicles_per_arm,
                signal_phase=phase,
            )

            r = self._compute_reward(frame, phase, adverse_events, num_changes)
            reward_acc += r

        self._current_phase = phase
        self._current_duration = duration
        self._phase_elapsed = 0.0

        state, frame_dict = self._state_extractor.extract(
            frame, self._current_phase, self._phase_elapsed, self._adverse.severity
        )
        self._episode_reward += reward_acc

        terminated = self._step_count >= self._total_steps
        truncated = False

        info = {
            "episode_reward": self._episode_reward,
            "step": self._step_count,
            "phase": phase,
            "duration": duration,
            "adverse_severity": self._adverse.severity,
            "frame": frame_dict,
        }
        return state, reward_acc, terminated, truncated, info

    def _compute_reward(self, frame, phase: int, adverse_events, num_changes: int = 0) -> float:
        # Per-arm queue counts (waiting vehicles only)
        arm_queues = {
            arm: sum(1 for v in frame.vehicles if v.arm == arm and v.waiting)
            for arm in ["N", "S", "E", "W"]
        }
        waits = [v.wait_time for v in frame.vehicles if v.waiting]

        queue_sum = sum(arm_queues.values()) / 50.0
        wait_sum = sum(waits) / max(len(waits), 1) / 120.0

        # Flow efficiency: vehicles cleared per unit of green time vs saturation capacity
        SATURATION_RATE = 0.5  # veh/s ≈ 1800 vph
        green_seconds = max(self.sim_config.action_frequency_seconds, 1)
        flow_efficiency = frame.throughput_this_step / max(green_seconds * SATURATION_RATE, 1.0)

        # Pressure imbalance: penalise holding green on a clear arm while red arms back up
        active_arm = PHASE_TO_ARM.get(phase)
        if active_arm is not None:
            pressure_red = sum(q for arm, q in arm_queues.items() if arm != active_arm)
            pressure_green = arm_queues.get(active_arm, 0)
            pressure_penalty = max(0.0, pressure_red - pressure_green) / 50.0
        else:
            pressure_penalty = 0.0

        # Starvation guard: penalise each arm waiting longer than threshold with queued vehicles
        starvation_penalty = sum(
            1 for arm in ["N", "S", "E", "W"]
            if self._arm_last_green[arm] > self.sim_config.starvation_threshold_steps
            and arm_queues[arm] > 3
        )

        # Comparative shaping: explicit reward for beating baseline wait time
        if self._baseline_wait > 0.0 and waits:
            mean_wait = sum(waits) / len(waits)
            baseline_bonus = 0.5 * (self._baseline_wait - mean_wait) / self._baseline_wait
        else:
            baseline_bonus = 0.0

        # Adverse events
        collision_penalty = sum(1 for e in adverse_events if e.event_type == "collision")
        ped_conflict = sum(1 for e in adverse_events if "pedestrian" in e.event_type)
        emergency_cleared = sum(1 for e in adverse_events if e.event_type == "emergency_cleared")

        reward = (
            - self.sim_config.reward_wt_queue            * queue_sum
            - self.sim_config.reward_wt_wait             * wait_sum
            + self.sim_config.reward_wt_flow_efficiency  * flow_efficiency
            - self.sim_config.reward_wt_pressure         * pressure_penalty
            - self.sim_config.reward_wt_starvation       * starvation_penalty
            + baseline_bonus
            - self.sim_config.reward_wt_switch           * num_changes
            - self.sim_config.reward_wt_collision        * collision_penalty
            - self.sim_config.reward_wt_pedestrian       * ped_conflict
            + self.sim_config.reward_wt_emergency        * emergency_cleared
        )
        return float(reward)

    def close(self):
        if self._sumo:
            self._sumo.stop()
            self._sumo = None

    def render(self):
        pass  # Rendering handled by frontend canvas


def make_env(sim_config: SimulationConfig, adverse_config: Optional[AdverseConfig] = None, **kwargs) -> TrafficEnv:
    """Factory function for SB3 compatibility."""
    return TrafficEnv(sim_config, adverse_config, **kwargs)
