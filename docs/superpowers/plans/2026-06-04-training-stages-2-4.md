# Training Stages 2–4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three progressively realistic training modes — Enriched Mock (Stage 2), SUMO Physics (Stage 3), and Curriculum auto-progression (Stage 4) — selectable from the UI before training starts.

**Architecture:** Stage 2 enriches the existing `mock_env.py` with startup loss, vehicle-mix saturation, pedestrian time, and spillback penalty while keeping the 26-dim obs space so Stage 1 weights transfer directly. Stage 3 routes the existing `traffic_env.py` (SUMO wrapper) as the env_factory. Stage 4 orchestrates two sequential PPOTrainer calls: Stage 2 for the first 60% of timesteps, then Stage 3 for the remainder with Webster-on-SUMO BC warm-up. The `training_mode` is stored in `_session_states` and read by `_run_real_training` to select the correct code path. The frontend `TrainingModeSelector` component emits the mode in the `training:start` socket event.

**Tech Stack:** Python, SB3 PPO, SUMO/TraCI, React, TypeScript, Zustand, Socket.IO

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/config.py` | Modify | Add 5 Stage-2 physics config fields + `training_stage` field |
| `backend/rl/mock_env.py` | Modify | Stage 2: startup loss, vehicle-mix sat flow, pedestrian time, spillback penalty |
| `backend/rl/trainer.py` | Modify | Add `StageProgressCallback` (emits `training:stage_change` events) |
| `backend/api/socket_handlers.py` | Modify | Read `training_mode` from session state; route Stage 2/3/4 in `_run_real_training` |
| `backend/tests/rl/test_stage2_mock.py` | **Create** | Unit tests for all 4 Stage 2 physics features |
| `frontend/src/components/TrainingModeSelector.tsx` | **Create** | 4-card mode picker shown before training starts |
| `frontend/src/components/RLNeuralPanel.tsx` | Modify | Integrate TrainingModeSelector; show active stage badge during training |
| `frontend/src/hooks/useSimulation.ts` | Modify | Pass `training_mode` in `training:start` socket event |
| `frontend/src/hooks/useSocket.ts` | Modify | Handle `training:stage_change` event → update store |
| `frontend/src/store/sessionStore.ts` | Modify | Add `trainingStage: number` field |

---

## Task 1: Add Stage 2 config fields to backend/config.py

**Files:**
- Modify: `backend/config.py`

- [ ] **Step 1: Add fields to SimulationConfig after `starvation_threshold_steps`**

```python
    # Stage 2 physics enrichments (used by mock_env when training_stage >= 2)
    startup_lost_time_s: float = 2.0        # seconds before first vehicle moves after green
    saturation_flow_heavy_factor: float = 0.5  # heavy vehicles take this fraction extra headway
    pedestrian_crossing_prob: float = 0.15  # probability a pedestrian request fires each decision
    spillback_capacity_vehicles: int = 24   # max queue before spillback penalty triggers
    training_stage: int = 1                 # 1=Fast Mock, 2=Enriched, 3=SUMO, 4=Curriculum
```

- [ ] **Step 2: Verify instantiation**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2"
python -c "from backend.config import SimulationConfig; c = SimulationConfig(); print(c.startup_lost_time_s, c.training_stage)"
```

Expected: `2.0 1`

---

## Task 2: Stage 2 — startup lost time in mock_env

**Files:**
- Modify: `backend/rl/mock_env.py`
- Test: `backend/tests/rl/test_stage2_mock.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/rl/test_stage2_mock.py`:

```python
"""Tests for Stage 2 physics enrichments in mock_env."""
import pytest
import numpy as np
from backend.config import SimulationConfig
from backend.rl.mock_env import make_mock_env

@pytest.fixture()
def base_cfg():
    return SimulationConfig(training_stage=2)

@pytest.fixture()
def s1_cfg():
    return SimulationConfig(training_stage=1)


def test_startup_loss_reduces_served(base_cfg, s1_cfg):
    """Stage 2 effective_green = duration - lost - startup_lost → fewer vehicles served."""
    env2 = make_mock_env(base_cfg, seed=42)
    env1 = make_mock_env(s1_cfg, seed=42)

    env2.reset(seed=42); env1.reset(seed=42)
    # pre-load queues to ensure vehicles available
    for env in (env1, env2):
        env._queue = {"N": 50.0, "S": 50.0, "E": 50.0, "W": 50.0}

    # Phase 0 (N+S), duration 30s — same seed, same arrivals
    _, r2, _, _, info2 = env2.step(3)   # phase 0, 30s duration (action index 3)
    env1._queue = {"N": 50.0, "S": 50.0, "E": 50.0, "W": 50.0}
    _, r1, _, _, info1 = env1.step(3)

    # Stage 2 should serve fewer vehicles (startup loss steals 2s)
    # Both return reward, but served is embedded in reward signal
    # We check that Stage 2 throughput is lower
    assert info2["throughput"] <= info1["throughput"], (
        f"Stage 2 throughput {info2['throughput']} should be <= Stage 1 {info1['throughput']}"
    )
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2"
python -m pytest backend/tests/rl/test_stage2_mock.py::test_startup_loss_reduces_served -v
```

Expected: FAIL (logic not yet implemented)

- [ ] **Step 3: Implement startup lost time in mock_env.py**

In `mock_env.py`, find the `step()` method. Replace:
```python
        switched = phase != self._current_phase
        lost = _LOST_TIME_S if switched else 0.0
        effective_green = max(0.0, duration - lost)
```
With:
```python
        switched = phase != self._current_phase
        lost = _LOST_TIME_S if switched else 0.0
        # Stage 2: startup lost time — vehicles take time to start moving after green
        startup_loss = (
            self.sim_config.startup_lost_time_s
            if getattr(self.sim_config, 'training_stage', 1) >= 2
            else 0.0
        )
        effective_green = max(0.0, duration - lost - startup_loss)
```

- [ ] **Step 4: Run test — expect PASS**

```bash
python -m pytest backend/tests/rl/test_stage2_mock.py::test_startup_loss_reduces_served -v
```

---

## Task 3: Stage 2 — vehicle-mix saturation flow

**Files:**
- Modify: `backend/rl/mock_env.py`
- Test: `backend/tests/rl/test_stage2_mock.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/rl/test_stage2_mock.py`:

```python
def test_heavy_mix_reduces_throughput(base_cfg):
    """High heavy-vehicle ratio reduces effective saturation flow."""
    from backend.config import SimulationConfig

    cfg_light = SimulationConfig(
        training_stage=2, pct_truck=0.0, pct_tsrtc_bus=0.0, pct_school_bus=0.0
    )
    cfg_heavy = SimulationConfig(
        training_stage=2, pct_truck=20.0, pct_tsrtc_bus=20.0, pct_school_bus=10.0
    )

    env_l = make_mock_env(cfg_light, seed=7)
    env_h = make_mock_env(cfg_heavy, seed=7)

    for env in (env_l, env_h):
        env.reset(seed=7)
        env._queue = {"N": 80.0, "S": 80.0, "E": 0.0, "W": 0.0}

    _, _, _, _, info_l = env_l.step(3)   # phase 0, 30s
    env_h._queue = {"N": 80.0, "S": 80.0, "E": 0.0, "W": 0.0}
    _, _, _, _, info_h = env_h.step(3)

    # Heavy fleet must serve fewer vehicles per green phase
    assert info_h["throughput"] < info_l["throughput"], (
        f"Heavy {info_h['throughput']} must be < light {info_l['throughput']}"
    )
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python -m pytest backend/tests/rl/test_stage2_mock.py::test_heavy_mix_reduces_throughput -v
```

- [ ] **Step 3: Implement vehicle-mix saturation flow**

In `mock_env.py` `step()`, replace:
```python
        per_arm_capacity = _SAT_FLOW_PER_S * self._lanes * effective_green
```
With:
```python
        # Stage 2: heavy vehicles (bus, truck) take ~2× headway → reduce sat flow
        if getattr(self.sim_config, 'training_stage', 1) >= 2:
            heavy_pct = (
                getattr(self.sim_config, 'pct_tsrtc_bus', 2.0) +
                getattr(self.sim_config, 'pct_school_bus', 0.0) +
                getattr(self.sim_config, 'pct_truck', 1.0)
            )
            heavy_ratio = heavy_pct / 100.0
            factor = getattr(self.sim_config, 'saturation_flow_heavy_factor', 0.5)
            # Heavy vehicles reduce sat flow proportionally
            effective_sat_flow = _SAT_FLOW_PER_S * (1.0 - heavy_ratio * factor)
        else:
            effective_sat_flow = _SAT_FLOW_PER_S
        per_arm_capacity = effective_sat_flow * self._lanes * effective_green
```

- [ ] **Step 4: Run test — expect PASS**

```bash
python -m pytest backend/tests/rl/test_stage2_mock.py::test_heavy_mix_reduces_throughput -v
```

---

## Task 4: Stage 2 — pedestrian crossing time

**Files:**
- Modify: `backend/rl/mock_env.py`
- Test: `backend/tests/rl/test_stage2_mock.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/rl/test_stage2_mock.py`:

```python
def test_pedestrian_reduces_effective_green(base_cfg):
    """With pedestrian_crossing_prob=1.0, every decision loses pedestrian_walk_seconds."""
    from backend.config import SimulationConfig
    cfg = SimulationConfig(
        training_stage=2,
        pedestrian_crossing_prob=1.0,    # always fires
        pedestrian_crossings='major_arms',
        pedestrian_walk_seconds=10,
    )
    cfg_no_ped = SimulationConfig(
        training_stage=2,
        pedestrian_crossing_prob=0.0,    # never fires
    )
    env_ped   = make_mock_env(cfg, seed=0)
    env_noped = make_mock_env(cfg_no_ped, seed=0)

    for env in (env_ped, env_noped):
        env.reset(seed=0)
        env._queue = {"N": 60.0, "S": 60.0, "E": 0.0, "W": 0.0}

    _, _, _, _, info_ped   = env_ped.step(3)    # phase 0, 30s
    env_noped._queue = {"N": 60.0, "S": 60.0, "E": 0.0, "W": 0.0}
    _, _, _, _, info_noped = env_noped.step(3)

    assert info_ped["throughput"] < info_noped["throughput"], (
        "Pedestrian crossing must reduce throughput"
    )
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python -m pytest backend/tests/rl/test_stage2_mock.py::test_pedestrian_reduces_effective_green -v
```

- [ ] **Step 3: Implement pedestrian time in mock_env step()**

After computing `effective_green` (after startup loss), add:

```python
        # Stage 2: pedestrian crossing requests steal from effective green
        if (getattr(self.sim_config, 'training_stage', 1) >= 2
                and self.sim_config.pedestrian_crossings != 'disabled'):
            ped_prob = getattr(self.sim_config, 'pedestrian_crossing_prob', 0.0)
            if ped_prob > 0.0 and self._rng.random() < ped_prob:
                ped_walk = float(self.sim_config.pedestrian_walk_seconds)
                effective_green = max(0.0, effective_green - ped_walk)
```

- [ ] **Step 4: Run test — expect PASS**

```bash
python -m pytest backend/tests/rl/test_stage2_mock.py::test_pedestrian_reduces_effective_green -v
```

---

## Task 5: Stage 2 — spillback penalty in reward

**Files:**
- Modify: `backend/rl/mock_env.py`
- Test: `backend/tests/rl/test_stage2_mock.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/rl/test_stage2_mock.py`:

```python
def test_spillback_penalty_fires_above_capacity(base_cfg):
    """Stage 2 reward includes spillback penalty when queue > road capacity."""
    from backend.config import SimulationConfig
    cfg = SimulationConfig(training_stage=2, spillback_capacity_vehicles=10)
    env = make_mock_env(cfg, seed=0)
    env.reset(seed=0)
    # Force N queue far above capacity
    env._queue = {"N": 50.0, "S": 50.0, "E": 50.0, "W": 50.0}

    cfg1 = SimulationConfig(training_stage=1)
    env1 = make_mock_env(cfg1, seed=0)
    env1.reset(seed=0)
    env1._queue = {"N": 50.0, "S": 50.0, "E": 50.0, "W": 50.0}

    _, r2, _, _, _ = env.step(3)
    _, r1, _, _, _ = env1.step(3)

    # Stage 2 reward should be lower due to spillback penalty
    assert r2 < r1, f"Stage 2 reward {r2:.3f} must be < Stage 1 {r1:.3f} due to spillback"
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python -m pytest backend/tests/rl/test_stage2_mock.py::test_spillback_penalty_fires_above_capacity -v
```

- [ ] **Step 3: Implement spillback penalty in mock_env reward block**

In `mock_env.py` `step()`, find the reward computation block. Add spillback penalty before the `reward = (...)` line:

```python
        # Stage 2: spillback penalty when queue exceeds road capacity
        spillback_penalty = 0.0
        if getattr(self.sim_config, 'training_stage', 1) >= 2:
            cap = float(getattr(self.sim_config, 'spillback_capacity_vehicles', 24))
            spillback_penalty = sum(
                max(0.0, (q - cap) / max(cap, 1.0))
                for q in self._queue.values()
            )
```

Then add it to the reward formula:

```python
        reward = (
            - 2.0 * delta_queue_norm
            + self.sim_config.reward_wt_flow_efficiency * flow_efficiency
            - self.sim_config.reward_wt_switch * lost_penalty
            - self.sim_config.reward_wt_pressure * imbalance_penalty
            - self.sim_config.reward_wt_starvation * starvation_penalty
            - 2.0 * all_red_penalty
            - 0.8 * spillback_penalty                   # NEW: Stage 2 spillback
            + baseline_bonus
        )
```

Also expose spillback in `reward_parts` info dict:

```python
            "spillback": round(-0.8 * spillback_penalty, 3),
```

- [ ] **Step 4: Run all Stage 2 tests**

```bash
python -m pytest backend/tests/rl/test_stage2_mock.py -v
```

Expected: 4 PASSED

- [ ] **Step 5: Run full backend suite — no regressions**

```bash
python -m pytest backend/tests/ -q --tb=short 2>&1 | tail -10
```

---

## Task 6: StageProgressCallback in trainer.py

**Files:**
- Modify: `backend/rl/trainer.py`

- [ ] **Step 1: Add StageProgressCallback after InferenceCheckpointCallback**

```python
class StageProgressCallback(BaseCallback):
    """
    Emits training:stage_change events when curriculum training switches
    from Stage 2 (mock_env) to Stage 3 (SUMO). Used only in Stage 4.
    """

    def __init__(
        self,
        session_id: str,
        emit_fn: Optional[Callable] = None,
        switch_at_step: int = 0,
        from_stage: int = 2,
        to_stage: int = 3,
        verbose: int = 0,
    ):
        super().__init__(verbose=verbose)
        self.session_id   = session_id
        self.emit_fn      = emit_fn
        self.switch_at_step = switch_at_step
        self.from_stage   = from_stage
        self.to_stage     = to_stage
        self._emitted     = False

    def _on_step(self) -> bool:
        if not self._emitted and self.num_timesteps >= self.switch_at_step:
            self._emitted = True
            if self.emit_fn is not None:
                self.emit_fn("training:stage_change", {
                    "session_id": self.session_id,
                    "from_stage": self.from_stage,
                    "to_stage":   self.to_stage,
                    "at_step":    self.num_timesteps,
                })
                logger.info(
                    "Stage transition: Stage %d → Stage %d at step %d",
                    self.from_stage, self.to_stage, self.num_timesteps,
                )
        return True
```

- [ ] **Step 2: Verify import**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2"
python -c "from backend.rl.trainer import StageProgressCallback; print('OK')"
```

Expected: `OK`

---

## Task 7: Backend routing — read training_mode in socket_handlers

**Files:**
- Modify: `backend/api/socket_handlers.py`

- [ ] **Step 1: Store training_mode in session state at training:start**

Find `handle_training_start` (around line 1917). After `total_timesteps = data.get(...)`, add:

```python
            training_mode = data.get("training_mode", "stage1")   # stage1|stage2|stage3|stage4
```

Then update the `set_session_state` call at the bottom:

```python
            set_session_state(
                session_id,
                training=True,
                total_timesteps=total_timesteps,
                raw_sim_config=sim_dict,
                training_mode=training_mode,
            )
```

- [ ] **Step 2: Read training_mode in _run_real_training and route**

In `_run_real_training`, find where `env_factory=make_mock_env` is set. Replace the entire section before `trainer = PPOTrainer(` with:

```python
        from backend.rl.trainer import DecisionCaptureCallback, StageProgressCallback
        from backend.rl.decision_store import STORE as _decision_store
        from backend.config import SimulationConfig

        _decision_store.clear(session_id)

        training_mode = _session_states.get(session_id, {}).get("training_mode", "stage1")

        # ── Select env_factory and config enrichments by training mode ──────
        if training_mode in ("stage2", "stage4"):
            # Enrich sim_config for Stage 2 physics
            sim_config.training_stage = 2
            env_factory = make_mock_env
        elif training_mode == "stage3":
            # SUMO — use traffic_env factory
            from backend.rl.traffic_env import make_env as make_sumo_env
            sim_config.training_stage = 3
            env_factory = make_sumo_env
        else:
            # Stage 1 default
            sim_config.training_stage = 1
            env_factory = make_mock_env
```

- [ ] **Step 3: Stage 4 curriculum orchestration**

After the `if training_mode in ...` block, add Stage 4 special handling:

```python
        if training_mode == "stage4":
            _run_curriculum_training(
                session_id=session_id,
                sim_config=sim_config,
                adverse_config=adverse_config,
                total_steps=total_steps,
                emit_fn=sio.emit,
            )
            return
```

- [ ] **Step 4: Add _run_curriculum_training helper function** (add near _run_real_training)

```python
def _run_curriculum_training(
    session_id: str,
    sim_config,
    adverse_config,
    total_steps: int,
    emit_fn,
) -> None:
    """
    Stage 4 Curriculum: runs Stage 2 (mock enriched) for the first 60% of timesteps,
    then Stage 3 (SUMO) for the remaining 40% with Webster BC warm-up.
    """
    from backend.rl.trainer import PPOTrainer, DecisionCaptureCallback, StageProgressCallback
    from backend.rl.mock_env import make_mock_env, run_websters_baseline
    from backend.rl.decision_store import STORE as _decision_store
    from backend.rl.traffic_env import make_env as make_sumo_env
    import os

    split = 0.60
    stage2_steps = int(total_steps * split)
    stage3_steps = total_steps - stage2_steps

    _decision_store.clear(session_id)

    # ── Phase 1: Stage 2 enriched mock ──────────────────────────────────
    emit_fn("training:stage_change", {"session_id": session_id, "from_stage": 0, "to_stage": 2})
    sim_config.training_stage = 2

    base_s2 = run_websters_baseline(sim_config, n_decisions=200, seed=7)
    trainer_s2 = PPOTrainer(
        sim_config=sim_config,
        adverse_config=adverse_config,
        session_id=session_id,
        db_url="sqlite:///tso.db",
        model_dir="models",
        total_timesteps=stage2_steps,
        emit_fn=emit_fn,
        env_factory=make_mock_env,
        extra_callbacks=[
            DecisionCaptureCallback(session_id=session_id, emit_fn=emit_fn),
        ],
        baseline_wait=base_s2.get("mean_wait", 0.0),
        baseline_demonstrations=base_s2.get("demonstrations", []),
    )
    result_s2 = trainer_s2.train()
    stage2_model_path = result_s2.get("model_path")
    logger.info("Curriculum Stage 2 complete. model=%s", stage2_model_path)

    # ── Phase 2: Stage 3 SUMO (with Webster demos as BC warm-up) ───────
    emit_fn("training:stage_change", {"session_id": session_id, "from_stage": 2, "to_stage": 3})
    sim_config.training_stage = 3

    # Collect Webster demonstrations on the SUMO env for BC warm-up
    # (obs dim is 22, consistent with TrafficEnv — independent of Stage 2)
    try:
        from backend.rl.baseline_agent import WebstersController, phase_duration_to_action
        sumo_env = make_sumo_env(sim_config, adverse_config)
        ctrl = WebstersController()
        demos = []
        obs, _ = sumo_env.reset()
        ctrl.reset()
        for _ in range(200):
            action, _ = ctrl.predict(obs)
            demos.append((obs.copy(), int(action)))
            obs, _, terminated, truncated, _ = sumo_env.step(int(action))
            if terminated or truncated:
                obs, _ = sumo_env.reset()
                ctrl.reset()
        sumo_env.close()
        logger.info("Generated %d SUMO BC demos for Stage 3", len(demos))
    except Exception as exc:
        logger.warning("Stage 3 BC demo generation failed (%s) — training from scratch", exc)
        demos = []

    trainer_s3 = PPOTrainer(
        sim_config=sim_config,
        adverse_config=adverse_config,
        session_id=session_id,
        db_url="sqlite:///tso.db",
        model_dir="models",
        total_timesteps=stage3_steps,
        emit_fn=emit_fn,
        env_factory=make_sumo_env,
        extra_callbacks=[
            DecisionCaptureCallback(session_id=session_id, emit_fn=emit_fn),
        ],
        baseline_demonstrations=demos,
    )
    result_s3 = trainer_s3.train()

    # Register final model
    if result_s3.get("model_path"):
        active_model_key = _session_states.get(session_id, {}).get("model_key", "rl1")
        register_trained_model(active_model_key, result_s3["model_path"])
        emit_fn("training:model_saved", {
            "session_id":  session_id,
            "model_key":   active_model_key,
            "model_path":  result_s3["model_path"],
        })
    emit_fn("training:stage_change", {"session_id": session_id, "from_stage": 3, "to_stage": 0, "done": True})
```

- [ ] **Step 5: Verify server starts cleanly**

```bash
python run.py
```

Expected: no import errors. Ctrl+C after 3 seconds.

---

## Task 8: Frontend — add trainingStage to sessionStore

**Files:**
- Modify: `frontend/src/store/sessionStore.ts`

- [ ] **Step 1: Add trainingStage field**

In `sessionStore.ts`, find the state interface and add:

```typescript
  trainingStage:    number           // 0=idle 1=Stage1 2=Stage2 3=Stage3 4=Curriculum
  setTrainingStage: (s: number) => void
```

Add to the initial state:
```typescript
  trainingStage: 0,
```

Add the action implementation:
```typescript
  setTrainingStage: (s) => set({ trainingStage: s }),
```

- [ ] **Step 2: Add training:stage_change socket listener in useSocket.ts**

Find `socket.on('training:stopped', ...)`. Add immediately after it:

```typescript
  socket.on('training:stage_change', (data: { session_id?: string; from_stage: number; to_stage: number; done?: boolean }) => {
    const simStore = useSimulationStore.getState()
    const activeSid = simStore.sessionId
    if (activeSid && data.session_id && data.session_id !== activeSid) return
    const sessionStore = useSessionStore.getState()
    if (data.done) {
      sessionStore.setTrainingStage(0)
    } else {
      sessionStore.setTrainingStage(data.to_stage)
    }
  })
```

- [ ] **Step 3: TypeScript check**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2\frontend"
npx tsc --noEmit 2>&1 | head -15
```

Expected: no errors

---

## Task 9: Frontend — TrainingModeSelector component

**Files:**
- Create: `frontend/src/components/TrainingModeSelector.tsx`

- [ ] **Step 1: Create component**

```tsx
/**
 * TrainingModeSelector — 4-card picker shown in NRAL panel before training.
 * Emits the chosen mode via onSelect(mode).
 */
import React from 'react'

export type TrainingMode = 'stage1' | 'stage2' | 'stage3' | 'stage4'

interface ModeCard {
  id:    TrainingMode
  label: string
  sub:   string
  time:  string
  desc:  string
  color: string
  warn?: boolean
}

const MODES: ModeCard[] = [
  {
    id:    'stage1',
    label: 'Stage 1',
    sub:   'Fast Mock',
    time:  '~8 min',
    desc:  'Queue arithmetic. Good for quick experiments and baseline tuning.',
    color: '#60a5fa',
  },
  {
    id:    'stage2',
    label: 'Stage 2',
    sub:   'Enriched',
    time:  '~20 min',
    desc:  'Adds startup delay (2s), vehicle-mix capacity reduction, pedestrian crossing time, and spillback penalty.',
    color: '#34d399',
  },
  {
    id:    'stage3',
    label: 'Stage 3',
    sub:   'SUMO Physics',
    time:  '4–8 hrs',
    desc:  'Full vehicle simulation — real acceleration, lane changes, pedestrians. Requires SUMO installed.',
    color: '#f59e0b',
    warn:  true,
  },
  {
    id:    'stage4',
    label: 'Stage 4',
    sub:   'Curriculum',
    time:  '~45 min',
    desc:  'Auto-progression: Stage 2 (60%) → Stage 3 (40%). Stage 2 learns demand; Stage 3 refines with physics.',
    color: '#a78bfa',
  },
]

interface Props {
  selected: TrainingMode
  onChange: (m: TrainingMode) => void
}

export function TrainingModeSelector({ selected, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] text-gray-600 font-mono uppercase tracking-widest px-0.5">Training Mode</p>
      <div className="grid grid-cols-2 gap-1.5">
        {MODES.map(m => {
          const active = selected === m.id
          return (
            <button key={m.id} onClick={() => onChange(m.id)}
              className="text-left rounded-xl p-2.5 transition-all"
              style={{
                background:  active ? `${m.color}12` : 'rgba(255,255,255,0.02)',
                border:      `1px solid ${active ? m.color + '50' : 'rgba(255,255,255,0.06)'}`,
                boxShadow:   active ? `0 0 0 1px ${m.color}25` : 'none',
              }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold" style={{ color: active ? m.color : '#94a3b8' }}>
                    {m.label}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: `${m.color}15`, color: m.color }}>
                    {m.sub}
                  </span>
                </div>
                <span className="text-[8px] font-mono text-gray-600">{m.time}</span>
              </div>
              <p className="text-[9px] text-gray-500 leading-tight">{m.desc}</p>
              {m.warn && (
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-[8px]">⚠️</span>
                  <span className="text-[8px] text-amber-500 font-mono">Requires SUMO installation</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

---

## Task 10: Integrate TrainingModeSelector into RLNeuralPanel + useSimulation

**Files:**
- Modify: `frontend/src/components/RLNeuralPanel.tsx`
- Modify: `frontend/src/hooks/useSimulation.ts`

- [ ] **Step 1: Add training mode state and selector to RLNeuralPanel**

Add import at the top of `RLNeuralPanel.tsx`:
```typescript
import { TrainingModeSelector, type TrainingMode } from './TrainingModeSelector'
import { useSessionStore } from '../store/sessionStore'
```

Add state inside the component (after `const [showIntel, setShowIntel] = useState(false)`):
```typescript
  const [trainingMode, setTrainingMode] = useState<TrainingMode>('stage1')
  const trainingStage = useSessionStore(s => s.trainingStage)
```

- [ ] **Step 2: Show TrainingModeSelector before training, stage badge during training**

In the component body, find where `SecLabel` components are rendered in the body div. Add the selector block BEFORE the `Episode Metrics` section:

```tsx
        {/* Training mode selector — only when not training and not yet trained */}
        {!isTraining && !isTrained && (
          <div>
            <TrainingModeSelector selected={trainingMode} onChange={setTrainingMode} />
          </div>
        )}

        {/* Active stage badge — only during training */}
        {isTraining && trainingStage > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border"
            style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[9px] text-gray-400 font-mono uppercase tracking-widest">Active</span>
            <span className="text-[10px] font-bold text-cyan-300">Stage {trainingStage}</span>
            <span className="text-[9px] text-gray-600 font-mono">
              {trainingStage === 1 ? '— Fast Mock'
               : trainingStage === 2 ? '— Enriched Mock'
               : trainingStage === 3 ? '— SUMO Physics'
               : '— Curriculum'}
            </span>
          </div>
        )}
```

- [ ] **Step 3: Pass trainingMode to startTraining call**

Find the Redo button's `onClick`. Also find where `startTraining` is called for normal starts. The `startTraining` function needs to accept `trainingMode`. First check `useSimulation.ts` to see its signature, then update.

In `useSimulation.ts`, find the `startTraining` function. It should emit a `training:start` socket event. Update it to accept and forward `trainingMode`:

Find:
```typescript
  const startTraining = useCallback(
    (totalTimesteps?: number) => {
```
Replace with:
```typescript
  const startTraining = useCallback(
    (totalTimesteps?: number, trainingMode: string = 'stage1') => {
```

Find where the socket emit happens inside `startTraining`. Add `training_mode` to the payload:
```typescript
      emit('training:start', {
        session_id: sessionId,
        total_timesteps: totalTimesteps ?? simConfig.total_timesteps ?? 100_000,
        sim_config: simConfig,
        adverse_config: adverseConfig,
        training_mode: trainingMode,    // NEW
      })
```

- [ ] **Step 4: Call startTraining with trainingMode from RLNeuralPanel**

In `RLNeuralPanel.tsx`, find the Redo button `onClick`:
```typescript
              onClick={() => {
                useDecisionStore.getState().clearLive()
                startTraining(simConfig.total_timesteps)
              }}
```
Update to:
```typescript
              onClick={() => {
                useDecisionStore.getState().clearLive()
                startTraining(simConfig.total_timesteps, trainingMode)
              }}
```

In `Dashboard.tsx`, find the "Start Training" button that calls `startTraining`. Update to pass a default mode (stage1 — the dashboard button doesn't have a mode selector, that's in the NRAL panel):
```typescript
                  onClick={() => startTraining(simConfig.total_timesteps, 'stage1')}
```

- [ ] **Step 5: TypeScript check**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2\frontend"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

---

## Task 11: Final regression pass

- [ ] **Step 1: Full backend test suite**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2"
python -m pytest backend/tests/ -q --tb=short 2>&1 | tail -15
```

Expected: all tests pass

- [ ] **Step 2: Stage 2 quick smoke test**

```bash
python -c "
from backend.config import SimulationConfig
from backend.rl.mock_env import make_mock_env

cfg = SimulationConfig(
    training_stage=2,
    traffic_volume_vph=10000,
    pedestrian_crossing_prob=0.2,
    pct_tsrtc_bus=5.0,
    pct_truck=3.0,
)
env = make_mock_env(cfg, seed=0)
obs, _ = env.reset()
total = 0
for _ in range(40):
    obs, r, done, _, info = env.step(env.action_space.sample())
    total += r
    if done: break
print(f'Stage 2 episode reward: {total:.2f}')
print(f'reward_parts keys: {list(info[\"reward_parts\"].keys())}')
assert 'spillback' in info['reward_parts'], 'spillback missing from reward_parts'
print('Stage 2 smoke test PASSED')
"
```

Expected:
```
Stage 2 episode reward: <some number>
reward_parts keys: ['delta_queue', 'flow_eff', 'switch', 'imbalance', 'starvation', 'baseline_gap', 'all_red', 'spillback']
Stage 2 smoke test PASSED
```

- [ ] **Step 3: Frontend TypeScript final check**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2\frontend"
npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors
