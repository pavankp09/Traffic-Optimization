# Reward Redesign for 15–20% KPI Improvement

**Date:** 2026-06-03  
**Goal:** Achieve ≥15% improvement in both avg wait delay and throughput (vph) vs fixed-time baseline using Approach B (MaxPressure Hybrid Reward).

---

## Problem

Current RL agent (PPO) shows:
- Wait delay: +17% (barely at floor of target)
- Throughput: **−8%** (worse than baseline)
- Green utilisation: +70% (symptom of "park on one phase" local optimum)

Root causes:
1. `throughput_bonus = frame.throughput_this_step / 10.0` produces near-zero signal (0.1–0.3) — queue penalty dominates
2. Agent learns to hold one phase green indefinitely to reduce visible queue on that arm, starving other arms
3. `reward_wt_switch` defined in config but never applied in `_compute_reward`
4. `baseline_wait` passed to trainer but never reaches the reward function
5. Training converges too early at local optimum (500K steps, low entropy ent_coef=0.01)

---

## Architecture

Three files change. No new files, no DB migrations.

```
traffic_env.py   — reward logic + new arm-starvation state
config.py        — 6 new reward weight fields
trainer.py       — 2 hyperparameter updates + baseline_wait wiring
```

---

## Reward Function Redesign (`traffic_env.py`)

### New env state (added to `__init__`)

```python
self._arm_last_green: dict[str, int] = {"N": 0, "S": 0, "E": 0, "W": 0}
```

Updated in `step()` each simulation tick: increment all arms, reset the active arm's counter to 0 when its phase is green.

### `_compute_reward` replacement

Remove `throughput_bonus = frame.throughput_this_step / 10.0`.  
Add three new terms:

**1. Flow efficiency** (replaces throughput_bonus)
```python
SATURATION_RATE = 0.5  # veh/s ≈ 1800 vph per lane
green_seconds = self.sim_config.action_frequency_seconds
flow_efficiency = frame.throughput_this_step / max(green_seconds * SATURATION_RATE, 1.0)
# reward_wt_flow_efficiency = 3.0
```
Rewards vehicles cleared per unit of green time. Penalises holding a phase green after the arm has cleared.

**2. Pressure imbalance penalty**
```python
arm_queues = {arm: count for arm in ["N","S","E","W"]}
active_arm = PHASE_TO_ARM[phase]  # mapping: phase 0→N, 1→S, 2→E, 3→W, 4→all
pressure_red = sum(q for arm, q in arm_queues.items() if arm != active_arm)
pressure_green = arm_queues.get(active_arm, 0)
pressure_penalty = max(0, pressure_red - pressure_green) / 50.0
# reward_wt_pressure = 1.5 (applied as negative)
```
Penalises leaving cars stuck on red while the green arm is already clear.

**3. Arm starvation guard**
```python
starvation_penalty = sum(
    1 for arm in ["N","S","E","W"]
    if self._arm_last_green[arm] > self.sim_config.starvation_threshold_steps
    and arm_queues[arm] > 3
)
# reward_wt_starvation = 0.8 (applied as negative)
```
Prevents any arm being ignored for more than `starvation_threshold_steps` steps (default 60 = 30 seconds).

**4. Baseline comparative shaping** (wired from trainer)
```python
if self._baseline_wait > 0 and waits:
    mean_wait = sum(waits) / len(waits)
    baseline_bonus = 0.5 * (self._baseline_wait - mean_wait) / self._baseline_wait
else:
    baseline_bonus = 0.0
```
Explicitly rewards the agent for beating the measured baseline wait time.

**5. Switch penalty** (wiring the existing config field)
```python
# num_changes already computed in step() — pass it through to _compute_reward
switch_penalty = num_changes  # 0 or 1
# reward_wt_switch = 0.15 (applied as negative)
```

### Final reward formula
```
reward = (
    - reward_wt_queue      * queue_sum
    - reward_wt_wait       * wait_sum
    + reward_wt_flow_eff   * flow_efficiency
    - reward_wt_pressure   * pressure_penalty
    - reward_wt_starvation * starvation_penalty
    + baseline_bonus
    - reward_wt_switch     * switch_penalty
    - reward_wt_collision  * collision_penalty
    - reward_wt_pedestrian * ped_conflict
    + reward_wt_emergency  * emergency_cleared
)
```

---

## Config Changes (`config.py`)

Add to `SimulationConfig`:

```python
reward_wt_flow_efficiency: float = 3.0
reward_wt_pressure: float = 1.5
reward_wt_starvation: float = 0.8
starvation_threshold_steps: int = 60
```

Existing fields unchanged. `reward_wt_throughput` retained but its normalization inside `_compute_reward` is removed (flow_efficiency replaces it functionally).

---

## Training Changes (`trainer.py`)

**Hyperparameters (PPO branch in `_build_model`):**
```python
ent_coef=0.05,  # was 0.01 — wider early exploration, escapes local optima
```

**Default timesteps:**
```python
total_timesteps: int = 1_500_000  # was 500_000
```

**Baseline wait wiring:**  
`PPOTrainer.train()` already receives `baseline_wait`. Wire it into the env at construction:
```python
self._env = self.env_factory(
    self.sim_config,
    self.adverse_config,
    baseline_wait=self.baseline_wait,
)
```
`TrafficEnv.__init__` must accept `baseline_wait: float = 0.0` and store it as `self._baseline_wait`.

---

## PHASE_TO_ARM Mapping

New constant in `traffic_env.py`:
```python
PHASE_TO_ARM = {0: "N", 1: "S", 2: "E", 3: "W", 4: None}
# Phase 4 (pedestrian) — pressure_penalty skipped (active_arm=None)
```

---

## Expected Outcomes

| Metric | Current | Target |
|---|---|---|
| Avg Wait Delay | +17% vs baseline | ≥+20% |
| Throughput | −8% vs baseline | ≥+15% |
| Green Utilisation | 90.5% | 60–75% (balanced) |
| Signal Coordination | +43% | maintain |

---

## What Is Not Changing

- State space (22-dim observation vector) — unchanged
- Action space (Discrete 35) — unchanged
- SUMO environment, intersection builder, demand generator — unchanged
- Frontend, API, socket handlers — unchanged
- Database schema — unchanged
