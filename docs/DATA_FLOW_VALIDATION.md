# Data Flow Validation: Baseline → RL Training

**Date:** 2026-06-03  
**Status:** ✅ ALL CHECKS PASSED

---

## Executive Summary

All data is being passed correctly through the training pipeline. Fixed 2 issues:

1. **CRITICAL (Fixed):** `_build_rl_obs()` returned 22-dim instead of 26-dim
   - Missing: 4 delta_queue features (improvement #4)
   - Impact: Model inference would crash on shape mismatch
   - Status: ✅ Fixed - now returns 26-dim with delta_queue

2. **MODERATE (Fixed):** `trainer.train()` set `baseline_wait` post-creation instead of passing to factory
   - Impact: Fragile, relied on attribute setting
   - Status: ✅ Fixed - now passed directly to `make_mock_env()`

---

## Complete Data Flow Path

```
User runs baseline simulation in Baseline tab
    ↓
backend/api/socket_handlers.py::handle_baseline_compute()
    └─ Reads baseline_controller from sim_config
    └─ Calls run_websters_baseline() or run_fixed_time_baseline()
    └─ Gets: {mean_wait, throughput, demonstrations[]}
    ↓
_baseline_cache["latest"] = {
    mean_wait: float,
    throughput: int,
    demonstrations: list[tuple(np.ndarray[26], int)],
    controller: str
}
    ↓
User starts RL training
    ↓
backend/api/socket_handlers.py::training:start handler
    └─ Reads _baseline_cache["latest"]
    └─ Extracts: baseline_wait, baseline_demonstrations
    ↓
PPOTrainer.__init__() receives:
    ├─ baseline_wait: float (34.8)
    └─ baseline_demonstrations: list[40 x (obs[26], action[int])]
    ↓
trainer.train():
    ├─ Creates env = make_mock_env(sim_config, adverse_config, baseline_wait=34.8)
    │  └─ MockTrafficEnv.__init__(baseline_wait=34.8)
    │     └─ self._baseline_wait = 34.8
    │     └─ obs_space = Box(26,)
    │
    ├─ Calls _behavioral_cloning_warmup(model, demonstrations)
    │  └─ obs_arr = np.array([d[0] for d in demos]) → shape (40, 26) ✓
    │  └─ act_arr = np.array([d[1] for d in demos]) → shape (40,) ✓
    │  └─ BC trains policy to match Webster's behavior
    │
    └─ Calls model.learn(total_timesteps=500k)
       └─ env.step(action) produces:
          ├─ obs: (26,) array
          ├─ reward: includes baseline_bonus (improvement #1)
          ├─ info: {mean_wait, throughput, ...}
          └─ Training callback captures metrics
    ↓
After training, model saved under model_key
    ↓
User runs RL simulation
    ↓
backend/api/socket_handlers.py::_run_mock_sim()
    └─ Loads trained model (expects obs shape 26)
    └─ Calls _build_rl_obs(world) → produces obs[26] with delta_queue
    └─ Calls model.predict(obs[26]) → action[0-34] ✓ MATCH!
```

---

## Shape Verification Summary

| Component | Input | Output | Status |
|-----------|-------|--------|--------|
| `run_websters_baseline()` | - | obs[26], action[int] | ✅ 26-dim |
| `baseline_demonstrations` | - | list[(26), int] | ✅ 26-dim |
| `_behavioral_cloning_warmup()` | obs[n,26], action[n] | - | ✅ Correct format |
| `MockTrafficEnv.observation_space` | - | Box(26,) | ✅ 26-dim |
| `env.reset()` | - | obs[26] | ✅ 26-dim |
| `env.step(action)` | - | obs[26] | ✅ 26-dim |
| `_build_rl_obs(world)` | - | obs[26] | ✅ **FIXED** → 26-dim |
| `model.predict(obs)` | obs[26] | action[int] | ✅ Match |

---

## Reward Function Verification

```python
reward = (
    -sim_config.reward_wt_queue * queue_term           # ✅ 1.0 default
    + (sim_config.reward_wt_throughput / 5.0) * tput   # ✅ 2.0 default
    - sim_config.reward_wt_switch * lost_penalty       # ✅ 0.15 default
    - 0.2 * imbalance_penalty                          # ✅ Hardcoded
    + baseline_bonus                                    # ✅ From baseline_wait
)
```

All reward weights have default values in `SimulationConfig`. No crash risk.

---

## Improvements Activated

When Webster's baseline is selected:

```
Improvement #1: Baseline-referenced reward
   └─ baseline_bonus computed from (baseline_wait - current_wait) / baseline_wait
   └─ Motivates agent to beat baseline
   └─ ✅ Passed via baseline_wait parameter

Improvement #2: Behavioral cloning warmup
   └─ 40 Webster's demonstrations (obs[26], action[int])
   └─ Cross-entropy loss on 5 epochs
   └─ ✅ Passed via baseline_demonstrations parameter

Improvement #3: Queue imbalance penalty
   └─ -0.2 * (|queue_N - queue_S| + |queue_E - queue_W|) / total_queue
   └─ ✅ Hardcoded in reward function

Improvement #4: Delta queue observation
   └─ 4 features tracking queue trends per arm
   └─ ✅ FIXED - _build_rl_obs now includes this

Improvement #5: Use actual traffic_volume_vph
   └─ configured_vps = sim_config.traffic_volume_vph / 3600.0
   └─ ✅ Used in MockTrafficEnv._arrival_rate initialization
```

---

## Issues Fixed This Session

### Issue #1: _build_rl_obs Dimension Mismatch
**Severity:** CRITICAL  
**Description:** Returned 22-dim instead of 26-dim  
**Root Cause:** Missing delta_queue features (improvement #4)  
**Fix:** Added 4 delta_queue features to _build_rl_obs(), tracked via world._prev_queued_obs  
**Status:** ✅ FIXED

### Issue #2: baseline_wait Not Passed to make_mock_env
**Severity:** MODERATE  
**Description:** Set via attribute after creation instead of constructor parameter  
**Root Cause:** Historical code structure, still worked but fragile  
**Fix:** Pass baseline_wait directly: `make_mock_env(..., baseline_wait=self.baseline_wait)`  
**Status:** ✅ FIXED

---

## Testing Results

All shapes verified in isolation and in integration:

```
MockTrafficEnv obs: (26,)           ✓
Webster demo obs:   (26,)           ✓
Behavioral cloning input: (n, 26)   ✓
_build_rl_obs output: (26,)         ✓
Model input expects: (26,)          ✓

NO SHAPE MISMATCHES
```

---

## Conclusion

✅ **All data flows correctly from baseline computation through RL training.**

No crashes expected on:
- Behavioral cloning warmup (obs/action shapes match)
- Model inference (26-dim observations from _build_rl_obs)
- Reward calculation (all weights have defaults)
- Environment stepping (baseline_wait properly initialized)

Ready for production training runs.
