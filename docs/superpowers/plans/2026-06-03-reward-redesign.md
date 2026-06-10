# Reward Redesign (MaxPressure Hybrid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve ≥15% improvement in both avg wait delay and throughput by replacing the weak throughput signal with flow-efficiency + pressure-imbalance + starvation-guard reward terms and increasing training budget.

**Architecture:** Three files change — `config.py` adds 4 new reward weight fields; `traffic_env.py` gains a `PHASE_TO_ARM` constant, `baseline_wait` init param, `_arm_last_green` starvation state, and a fully rewritten `_compute_reward`; `trainer.py` gets `ent_coef` bumped and `total_timesteps` tripled. No new files, no DB migrations, no schema changes.

**Tech Stack:** Python, Gymnasium, Stable-Baselines3 PPO, pytest, unittest.mock

---

## File Map

| File | Change |
|---|---|
| `backend/config.py` | Add `reward_wt_flow_efficiency`, `reward_wt_pressure`, `reward_wt_starvation`, `starvation_threshold_steps` |
| `backend/rl/traffic_env.py` | Add `PHASE_TO_ARM` constant; add `baseline_wait` param + `_arm_last_green` state to `__init__` + `reset`; update `step` to track starvation counters and pass `num_changes` to reward; rewrite `_compute_reward` |
| `backend/rl/trainer.py` | `ent_coef 0.01→0.05`; `total_timesteps default 500_000→1_500_000` |
| `backend/tests/rl/test_traffic_env.py` | Update existing `test_compute_reward_no_events`; add tests for each new reward component |

---

## Task 1: Add new reward config fields

**Files:**
- Modify: `backend/config.py`

- [ ] **Step 1: Add four fields to `SimulationConfig`**

In `backend/config.py`, after `reward_wt_switch: float = 0.15` (line 74), add:

```python
    reward_wt_flow_efficiency: float = 3.0
    reward_wt_pressure: float = 1.5
    reward_wt_starvation: float = 0.8
    starvation_threshold_steps: int = 60
```

- [ ] **Step 2: Verify instantiation**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2"
python -c "from backend.config import SimulationConfig; c = SimulationConfig(); print(c.reward_wt_flow_efficiency, c.reward_wt_pressure, c.reward_wt_starvation, c.starvation_threshold_steps)"
```

Expected output: `3.0 1.5 0.8 60`

- [ ] **Step 3: Commit**

```bash
git add backend/config.py
git commit -m "feat(config): add flow_efficiency, pressure, starvation reward weight fields"
```

---

## Task 2: Add `PHASE_TO_ARM`, `baseline_wait`, and `_arm_last_green` to `TrafficEnv`

**Files:**
- Modify: `backend/rl/traffic_env.py`
- Test: `backend/tests/rl/test_traffic_env.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/rl/test_traffic_env.py`:

```python
def test_phase_to_arm_mapping():
    from backend.rl.traffic_env import PHASE_TO_ARM
    assert PHASE_TO_ARM[0] == "N"
    assert PHASE_TO_ARM[1] == "S"
    assert PHASE_TO_ARM[2] == "E"
    assert PHASE_TO_ARM[3] == "W"
    assert PHASE_TO_ARM[4] is None


def test_arm_last_green_init():
    env = TrafficEnv(SimulationConfig())
    assert set(env._arm_last_green.keys()) == {"N", "S", "E", "W"}
    assert all(v == 0 for v in env._arm_last_green.values())


def test_baseline_wait_stored():
    env = TrafficEnv(SimulationConfig(), baseline_wait=8.8)
    assert env._baseline_wait == 8.8


def test_baseline_wait_default_zero():
    env = TrafficEnv(SimulationConfig())
    assert env._baseline_wait == 0.0
```

- [ ] **Step 2: Run to confirm they fail**

```bash
python -m pytest backend/tests/rl/test_traffic_env.py::test_phase_to_arm_mapping backend/tests/rl/test_traffic_env.py::test_arm_last_green_init backend/tests/rl/test_traffic_env.py::test_baseline_wait_stored backend/tests/rl/test_traffic_env.py::test_baseline_wait_default_zero -v
```

Expected: 4 FAILs (ImportError or AttributeError).

- [ ] **Step 3: Add `PHASE_TO_ARM` constant to `traffic_env.py`**

After line 29 (`N_ACTIONS = N_PHASES * N_DURATIONS  # 35`), add:

```python
# Maps phase index to the primary arm it serves; phase 4 (pedestrian) serves all
PHASE_TO_ARM: dict[int, str | None] = {0: "N", 1: "S", 2: "E", 3: "W", 4: None}
```

- [ ] **Step 4: Add `baseline_wait` param and `_arm_last_green` to `__init__`**

Change the `__init__` signature from:
```python
    def __init__(
        self,
        sim_config: SimulationConfig,
        adverse_config: Optional[AdverseConfig] = None,
        episode_duration_s: float = 1800.0,
        output_dir: str = "/tmp/tso_rl",
        port: int = 8813,
        seed: int = 42,
    ):
```
to:
```python
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
```

After `self._tl_id = "center"` (last line of `__init__`), add:
```python
        self._baseline_wait: float = baseline_wait
        self._arm_last_green: dict[str, int] = {"N": 0, "S": 0, "E": 0, "W": 0}
```

- [ ] **Step 5: Reset `_arm_last_green` in `reset()`**

In `reset()`, after `self._episode_reward = 0.0`, add:
```python
        self._arm_last_green = {"N": 0, "S": 0, "E": 0, "W": 0}
```

- [ ] **Step 6: Run the new tests — expect PASS**

```bash
python -m pytest backend/tests/rl/test_traffic_env.py::test_phase_to_arm_mapping backend/tests/rl/test_traffic_env.py::test_arm_last_green_init backend/tests/rl/test_traffic_env.py::test_baseline_wait_stored backend/tests/rl/test_traffic_env.py::test_baseline_wait_default_zero -v
```

Expected: 4 PASSes.

- [ ] **Step 7: Run full env test suite — must still pass**

```bash
python -m pytest backend/tests/rl/test_traffic_env.py -v
```

Expected: all existing tests pass (no regressions).

- [ ] **Step 8: Commit**

```bash
git add backend/rl/traffic_env.py backend/tests/rl/test_traffic_env.py
git commit -m "feat(env): add PHASE_TO_ARM, baseline_wait param, _arm_last_green starvation state"
```

---

## Task 3: Update `step()` to track starvation counters and pass `num_changes`

**Files:**
- Modify: `backend/rl/traffic_env.py`
- Test: `backend/tests/rl/test_traffic_env.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/rl/test_traffic_env.py`:

```python
def test_arm_last_green_increments_for_non_active_arm():
    """After one step with phase=0 (arm N), arms S/E/W should increment."""
    from backend.rl.traffic_env import TrafficEnv, PHASE_TO_ARM
    from unittest.mock import MagicMock, patch
    from backend.simulation.sumo_env import SimFrame

    env = TrafficEnv(SimulationConfig())

    # Minimal mocks so step() doesn't need SUMO
    mock_frame = SimFrame(
        step=1, sim_time=5.0, vehicles=[], signals=[],
        queue_per_lane={}, wait_per_lane={}, throughput_this_step=0, collision_ids=[],
    )
    mock_sumo = MagicMock()
    mock_sumo.step.return_value = mock_frame
    mock_state_extractor = MagicMock()
    mock_state_extractor.extract.return_value = (
        np.zeros(22, dtype=np.float32), {}
    )
    mock_adverse = MagicMock()
    mock_adverse.tick.return_value = []
    mock_adverse.severity = 0.0

    env._sumo = mock_sumo
    env._state_extractor = mock_state_extractor
    env._adverse = mock_adverse
    env._total_steps = 100
    env._arm_last_green = {"N": 0, "S": 0, "E": 0, "W": 0}

    # action=0 → phase=0 (arm N), duration=15s
    env.step(0)

    # N was active: counter stays 0; others increment by action_freq steps
    assert env._arm_last_green["N"] == 0
    assert env._arm_last_green["S"] > 0
    assert env._arm_last_green["E"] > 0
    assert env._arm_last_green["W"] > 0
```

- [ ] **Step 2: Run to confirm it fails**

```bash
python -m pytest backend/tests/rl/test_traffic_env.py::test_arm_last_green_increments_for_non_active_arm -v
```

Expected: FAIL (counter not updated yet).

- [ ] **Step 3: Add `num_changes=0` to `_compute_reward` signature (body unchanged)**

`step()` is about to call `_compute_reward` with a 4th argument. Add the parameter now so the signature accepts it before the body is rewritten in Task 4.

Find in `backend/rl/traffic_env.py`:
```python
    def _compute_reward(self, frame, phase: int, adverse_events) -> float:
```
Replace with:
```python
    def _compute_reward(self, frame, phase: int, adverse_events, num_changes: int = 0) -> float:
```

Body is unchanged at this point — `num_changes` is accepted but not yet used.

- [ ] **Step 4: Update `step()` — move `num_changes` before the loop and add starvation tracking inside the loop**

Replace the existing `step()` method with:

```python
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
```

- [ ] **Step 5: Run the starvation test — expect PASS**

```bash
python -m pytest backend/tests/rl/test_traffic_env.py::test_arm_last_green_increments_for_non_active_arm -v
```

Expected: PASS.

- [ ] **Step 6: Run full env test suite**

```bash
python -m pytest backend/tests/rl/test_traffic_env.py -v
```

Expected: all tests pass. Note: `test_compute_reward_no_events` and `test_compute_reward_collision_penalty` call `_compute_reward(frame, 0, [])` — this still works because `num_changes` defaults to 0 in the new signature (added in Task 4).

- [ ] **Step 7: Commit**

```bash
git add backend/rl/traffic_env.py backend/tests/rl/test_traffic_env.py
git commit -m "feat(env): update step() to track _arm_last_green and pass num_changes to reward"
```

---

## Task 4: Rewrite `_compute_reward` with MaxPressure Hybrid terms

**Files:**
- Modify: `backend/rl/traffic_env.py`
- Test: `backend/tests/rl/test_traffic_env.py`

- [ ] **Step 1: Write failing tests for each new reward component**

Add to `backend/tests/rl/test_traffic_env.py`:

```python
# ---------------------------------------------------------------------------
# Helpers shared by reward component tests
# ---------------------------------------------------------------------------

def _make_frame(throughput=0, vehicles=None):
    from backend.simulation.sumo_env import SimFrame
    return SimFrame(
        step=1, sim_time=5.0, vehicles=vehicles or [], signals=[],
        queue_per_lane={}, wait_per_lane={},
        throughput_this_step=throughput, collision_ids=[],
    )


def _make_vehicle(arm="N", waiting=False, wait_time=0.0):
    v = MagicMock()
    v.arm = arm
    v.waiting = waiting
    v.wait_time = wait_time
    return v


# ---------------------------------------------------------------------------
# Flow efficiency
# ---------------------------------------------------------------------------

def test_flow_efficiency_increases_reward_with_throughput():
    """Higher throughput on the same green phase yields higher reward."""
    env = TrafficEnv(SimulationConfig())
    frame_low = _make_frame(throughput=1)
    frame_high = _make_frame(throughput=10)
    r_low = env._compute_reward(frame_low, 0, [], num_changes=0)
    r_high = env._compute_reward(frame_high, 0, [], num_changes=0)
    assert r_high > r_low, "Higher throughput must yield higher reward"


# ---------------------------------------------------------------------------
# Pressure imbalance
# ---------------------------------------------------------------------------

def test_pressure_penalty_applied_when_red_queues_exceed_green():
    """Reward is lower when red arms have larger queues than the active arm."""
    env = TrafficEnv(SimulationConfig())
    # phase=0 → active arm=N; queue vehicles on S, E, W (red arms)
    vehicles_balanced = [_make_vehicle("N", waiting=True)] * 5 + \
                        [_make_vehicle("S", waiting=True)] * 5
    vehicles_imbalanced = [_make_vehicle("N", waiting=True)] * 1 + \
                          [_make_vehicle("S", waiting=True)] * 15 + \
                          [_make_vehicle("E", waiting=True)] * 10
    frame_bal = _make_frame(throughput=3, vehicles=vehicles_balanced)
    frame_imbal = _make_frame(throughput=3, vehicles=vehicles_imbalanced)
    r_bal = env._compute_reward(frame_bal, 0, [], num_changes=0)
    r_imbal = env._compute_reward(frame_imbal, 0, [], num_changes=0)
    assert r_imbal < r_bal, "Large red-arm queues vs small green-arm queue must reduce reward"


# ---------------------------------------------------------------------------
# Starvation guard
# ---------------------------------------------------------------------------

def test_starvation_penalty_fires_when_arm_neglected():
    """Reward is lower when an arm with a queue has been starved beyond threshold."""
    cfg = SimulationConfig()
    env_normal = TrafficEnv(cfg)
    env_starved = TrafficEnv(cfg)

    # Artificially age the S arm beyond the starvation threshold
    env_starved._arm_last_green["S"] = cfg.starvation_threshold_steps + 1

    vehicles = [_make_vehicle("S", waiting=True)] * 5  # queue on S
    frame = _make_frame(throughput=2, vehicles=vehicles)

    r_normal = env_normal._compute_reward(frame, 0, [], num_changes=0)
    r_starved = env_starved._compute_reward(frame, 0, [], num_changes=0)
    assert r_starved < r_normal, "Starvation beyond threshold must reduce reward"


# ---------------------------------------------------------------------------
# Baseline comparative shaping
# ---------------------------------------------------------------------------

def test_baseline_bonus_positive_when_wait_below_baseline():
    """Agent beating baseline wait time earns a positive bonus."""
    env = TrafficEnv(SimulationConfig(), baseline_wait=20.0)
    vehicles = [_make_vehicle("N", waiting=True, wait_time=5.0)]  # well below baseline
    frame = _make_frame(throughput=3, vehicles=vehicles)
    r = env._compute_reward(frame, 0, [], num_changes=0)
    # Compare with baseline_wait=0 (no bonus)
    env_no_bl = TrafficEnv(SimulationConfig(), baseline_wait=0.0)
    r_no_bl = env_no_bl._compute_reward(frame, 0, [], num_changes=0)
    assert r > r_no_bl, "Beating baseline wait must add a positive bonus"


# ---------------------------------------------------------------------------
# Switch penalty
# ---------------------------------------------------------------------------

def test_switch_penalty_reduces_reward_on_phase_change():
    """Changing phase (num_changes=1) yields lower reward than staying (num_changes=0)."""
    env = TrafficEnv(SimulationConfig())
    frame = _make_frame(throughput=3)
    r_no_switch = env._compute_reward(frame, 0, [], num_changes=0)
    r_switch = env._compute_reward(frame, 0, [], num_changes=1)
    assert r_switch < r_no_switch, "Phase change must reduce reward by switch penalty"


# ---------------------------------------------------------------------------
# Backwards-compat: existing signature still works
# ---------------------------------------------------------------------------

def test_compute_reward_positional_only_still_works():
    """Old call site _compute_reward(frame, phase, events) must not break."""
    env = TrafficEnv(SimulationConfig())
    frame = _make_frame(throughput=5)
    r = env._compute_reward(frame, 0, [])
    assert isinstance(r, float)
```

- [ ] **Step 2: Run to confirm they fail**

```bash
python -m pytest backend/tests/rl/test_traffic_env.py::test_flow_efficiency_increases_reward_with_throughput backend/tests/rl/test_traffic_env.py::test_pressure_penalty_applied_when_red_queues_exceed_green backend/tests/rl/test_traffic_env.py::test_starvation_penalty_fires_when_arm_neglected backend/tests/rl/test_traffic_env.py::test_baseline_bonus_positive_when_wait_below_baseline backend/tests/rl/test_traffic_env.py::test_switch_penalty_reduces_reward_on_phase_change backend/tests/rl/test_traffic_env.py::test_compute_reward_positional_only_still_works -v
```

Expected: failures (old `_compute_reward` signature + missing terms).

- [ ] **Step 3: Replace `_compute_reward` in `traffic_env.py`**

Replace the existing `_compute_reward` method (lines 194–215) with:

```python
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

        # Starvation guard: penalise each arm that has been waiting longer than threshold
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
            - self.sim_config.reward_wt_queue        * queue_sum
            - self.sim_config.reward_wt_wait         * wait_sum
            + self.sim_config.reward_wt_flow_efficiency * flow_efficiency
            - self.sim_config.reward_wt_pressure     * pressure_penalty
            - self.sim_config.reward_wt_starvation   * starvation_penalty
            + baseline_bonus
            - self.sim_config.reward_wt_switch       * num_changes
            - self.sim_config.reward_wt_collision    * collision_penalty
            - self.sim_config.reward_wt_pedestrian   * ped_conflict
            + self.sim_config.reward_wt_emergency    * emergency_cleared
        )
        return float(reward)
```

- [ ] **Step 4: Update the existing `test_compute_reward_no_events` assertion**

The old test asserts `r >= 0` based on the old formula. With the new formula and `throughput=5`, `action_frequency_seconds=5`: `flow_efficiency = 5/(5*0.5) = 2.0`, reward = `3.0 * 2.0 = 6.0` with no penalties — still positive. The assertion holds unchanged, but update the comment to reflect the new formula:

Find in `test_traffic_env.py`:
```python
    assert r >= 0  # 5 throughput / 10 = 0.5 * 2.0 = 1.0 with no penalties
```
Replace with:
```python
    assert r >= 0  # flow_efficiency=5/(5*0.5)=2.0, reward=3.0*2.0=6.0 with no penalties
```

- [ ] **Step 5: Run all new reward tests — expect PASS**

```bash
python -m pytest backend/tests/rl/test_traffic_env.py::test_flow_efficiency_increases_reward_with_throughput backend/tests/rl/test_traffic_env.py::test_pressure_penalty_applied_when_red_queues_exceed_green backend/tests/rl/test_traffic_env.py::test_starvation_penalty_fires_when_arm_neglected backend/tests/rl/test_traffic_env.py::test_baseline_bonus_positive_when_wait_below_baseline backend/tests/rl/test_traffic_env.py::test_switch_penalty_reduces_reward_on_phase_change backend/tests/rl/test_traffic_env.py::test_compute_reward_positional_only_still_works -v
```

Expected: 6 PASSes.

- [ ] **Step 6: Run full env test suite — no regressions**

```bash
python -m pytest backend/tests/rl/test_traffic_env.py -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/rl/traffic_env.py backend/tests/rl/test_traffic_env.py
git commit -m "feat(env): MaxPressure hybrid reward — flow efficiency, pressure penalty, starvation guard, baseline shaping"
```

---

## Task 5: Update `trainer.py` hyperparameters

**Files:**
- Modify: `backend/rl/trainer.py`
- Test: `backend/tests/rl/test_trainer.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/rl/test_trainer.py` inside `class TestPPOTrainer`:

```python
    def test_ppo_ent_coef_is_0_05(
        self,
        sim_config,
        adverse_config,
        session_id,
        db_url,
        model_dir,
        emit_fn,
    ):
        """PPO model must be built with ent_coef=0.05."""
        with patch("backend.rl.trainer.make_env", return_value=MockTrafficEnv()):
            trainer = PPOTrainer(
                sim_config=sim_config,
                adverse_config=adverse_config,
                session_id=session_id,
                db_url=db_url,
                model_dir=model_dir,
                total_timesteps=200,
                emit_fn=emit_fn,
            )
            trainer._ensure_db()
            env = MockTrafficEnv()
            model = trainer._build_model(env)

        assert hasattr(model, "ent_coef"), "PPO model must have ent_coef attribute"
        assert abs(model.ent_coef - 0.05) < 1e-6, (
            f"Expected ent_coef=0.05, got {model.ent_coef}"
        )

    def test_default_total_timesteps_is_1_500_000(self):
        """Default total_timesteps must be 1_500_000."""
        import inspect
        sig = inspect.signature(PPOTrainer.__init__)
        default = sig.parameters["total_timesteps"].default
        assert default == 1_500_000, (
            f"Expected default total_timesteps=1_500_000, got {default}"
        )
```

- [ ] **Step 2: Run to confirm they fail**

```bash
python -m pytest backend/tests/rl/test_trainer.py::TestPPOTrainer::test_ppo_ent_coef_is_0_05 backend/tests/rl/test_trainer.py::TestPPOTrainer::test_default_total_timesteps_is_1_500_000 -v
```

Expected: 2 FAILs.

- [ ] **Step 3: Update `total_timesteps` default in `PPOTrainer.__init__`**

In `backend/rl/trainer.py`, change:
```python
        total_timesteps: int = 500_000,
```
to:
```python
        total_timesteps: int = 1_500_000,
```

- [ ] **Step 4: Update `ent_coef` in `_build_model` PPO branch**

In `backend/rl/trainer.py`, in the `else` branch of `_build_model` (PPO), change:
```python
                ent_coef=0.01,
```
to:
```python
                ent_coef=0.05,
```

- [ ] **Step 5: Run the new trainer tests — expect PASS**

```bash
python -m pytest backend/tests/rl/test_trainer.py::TestPPOTrainer::test_ppo_ent_coef_is_0_05 backend/tests/rl/test_trainer.py::TestPPOTrainer::test_default_total_timesteps_is_1_500_000 -v
```

Expected: 2 PASSes.

- [ ] **Step 6: Run full trainer test suite — no regressions**

```bash
python -m pytest backend/tests/rl/test_trainer.py -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/rl/trainer.py backend/tests/rl/test_trainer.py
git commit -m "feat(trainer): ent_coef 0.01→0.05, total_timesteps 500K→1.5M for better exploration and coverage"
```

---

## Task 6: Full regression pass

- [ ] **Step 1: Run the entire test suite**

```bash
python -m pytest backend/tests/ -v --tb=short
```

Expected: all tests pass. Any failure here must be investigated and fixed before considering the implementation complete.

- [ ] **Step 2: Verify `make_env` factory passes `baseline_wait` correctly**

```bash
python -c "
from backend.config import SimulationConfig, AdverseConfig
from backend.rl.traffic_env import make_env
env = make_env(SimulationConfig(), AdverseConfig(), baseline_wait=8.8)
print('baseline_wait stored:', env._baseline_wait)
print('arm_last_green keys:', list(env._arm_last_green.keys()))
print('PASS')
"
```

Expected output:
```
baseline_wait stored: 8.8
arm_last_green keys: ['N', 'S', 'E', 'W']
PASS
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: full regression pass — MaxPressure hybrid reward redesign complete"
```
