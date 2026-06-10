# RL Decision Dashboard — Design Spec

**Date:** 2026-06-03
**Goal:** Add live XAI decision visibility during RL training and a full post-training episode replay panel, both showing the 26-dim observation, action probability heatmap, feature importance, and reward breakdown per decision.

---

## Overview

Two surfaces share one data pipeline:

| Surface | When visible | Purpose |
|---|---|---|
| **XAI LIVE sidebar tab** | During training | Real-time decision feed, inference canvas checkpoints |
| **Decision Replay page** | After training | Episode scrubber, full decision detail, XAI drill-down |

Additionally, every 10 training episodes the canvas shows a live `_SimWorld` inference run with the current model weights — identical to SIM LIVE but triggered automatically.

---

## Architecture & Data Flow

```
Training loop (mock_env step)
        │
        ▼
DecisionCaptureCallback  (new, in trainer.py)
  ├─ extracts obs[26], action, probs[35], value, reward_parts from info
  ├─ computes feature importance: Jacobian of chosen action logit w.r.t obs
  ├─ emits  training:decision  →  XAI LIVE sidebar (real-time)
  └─ appends to  DecisionStore[session_id][episode][decisions[]]

Every 10 episodes:
InferenceCheckpointCallback  (new, in trainer.py)
  └─ calls inference_fn(model)  →  _SimWorld 200 steps  →  sim:frame events  →  canvas

After training:
  GET /api/decisions/<session_id>          →  episode summary list
  GET /api/decisions/<session_id>/<ep>     →  full 40-decision episode
        │
        ▼
Decision Replay page  (new frontend route)
```

**Memory footprint:** 40 decisions/ep × 139 eps × ~300 bytes = ~1.6 MB. Pure in-memory, no DB changes.

---

## Data Schema Per Decision

```python
Decision = {
    "step":          int,          # 1..40 within episode
    "episode":       int,
    "obs": [                       # 26 entries, each:
        {"label": "N Queue (veh)", "value": 12.3, "normalised": 0.71},
        ...
    ],
    "action": {
        "phase":     int,          # 0..4
        "phase_name": "N+S Green",
        "duration_s": 30,
        "action_idx": 3,           # flat 0..34
    },
    "probs":         [float × 35], # reshaped to [5][7] for heatmap
    "importance":    [float × 26], # abs(Jacobian), normalised 0..1
    "value":         float,        # V(s) from PPO critic
    "reward_total":  float,
    "reward_parts": {
        "delta_queue":  float,
        "flow_eff":     float,
        "switch":       float,
        "imbalance":    float,
        "starvation":   float,
        "baseline_gap": float,
        "all_red":      float,
    }
}
```

**26-dim observation labels (canonical, defined once in `decision_store.py`):**
```python
OBS_LABELS = [
    "N Queue (veh)", "N Wait (s)", "N Arrival Rate", "N Just Served",
    "S Queue (veh)", "S Wait (s)", "S Arrival Rate", "S Just Served",
    "E Queue (veh)", "E Wait (s)", "E Arrival Rate", "E Just Served",
    "W Queue (veh)", "W Wait (s)", "W Arrival Rate", "W Just Served",
    "N Queue Δ", "S Queue Δ", "E Queue Δ", "W Queue Δ",
    "Phase 0 (N+S)", "Phase 1 (E+W)", "Phase 2 (N+E)",
    "Phase 3 (S+W)", "Phase 4 (All-Red)",
    "Episode Progress",
]

PHASE_NAMES  = ["N+S Green", "E+W Green", "N+E Green", "S+W Green", "All Red"]
DURATIONS    = [15, 20, 25, 30, 40, 50, 60]
```

---

## Backend Changes

### 1. `backend/rl/decision_store.py` (new, ~70 lines)

Thread-safe in-memory store:
```python
class DecisionStore:
    _data: dict   # {session_id: {ep_num: {"decisions": [], "summary": {}}}}
    _lock: threading.Lock

    def append(session_id, ep_num, decision: dict) -> None
    def finalise_episode(session_id, ep_num, summary: dict) -> None
    def get_episodes(session_id) -> list[dict]          # summary list
    def get_episode(session_id, ep_num) -> dict         # full decisions
    def clear(session_id) -> None

STORE = DecisionStore()   # module-level singleton
```

### 2. `backend/rl/trainer.py` — two new callbacks

**`DecisionCaptureCallback(BaseCallback)`:**
```
__init__(session_id, emit_fn)
_on_step():
    obs_t  = torch.FloatTensor(self.locals["obs_tensor"])
    action = int(self.locals["actions"][0])
    reward = float(self.locals["rewards"][0])
    info   = self.locals["infos"][0]

    with torch.no_grad():
        dist   = model.policy.get_distribution(obs_t)
        probs  = dist.distribution.probs[0].tolist()      # [35]
        value  = model.policy.predict_values(obs_t)[0].item()

    # Feature importance via Jacobian
    obs_t.requires_grad_(True)
    logits = model.policy.evaluate_actions(obs_t, actions_t)[1]  # action logits
    logits[0, action].backward()
    importance = obs_t.grad[0].abs().tolist()
    importance = [v / (max(importance) + 1e-8) for v in importance]  # normalise

    decision = build_decision(obs_t, action, probs, value, importance,
                              info["reward_parts"], reward, ep_num, step)
    STORE.append(session_id, ep_num, decision)
    emit_fn("training:decision", decision)
```

**`InferenceCheckpointCallback(BaseCallback)`:**
```
__init__(session_id, inference_fn, check_every=10)
_on_step():
    if episode_end and episode_num % check_every == 0:
        inference_fn(self.model)
```

### 3. `backend/rl/mock_env.py` — expose reward components

Add to `step()` info dict:
```python
info["reward_parts"] = {
    "delta_queue":  round(-2.0 * delta_queue_norm, 3),
    "flow_eff":     round(cfg.reward_wt_flow_efficiency * flow_efficiency, 3),
    "switch":       round(-cfg.reward_wt_switch * lost_penalty, 3),
    "imbalance":    round(-cfg.reward_wt_pressure * imbalance_penalty, 3),
    "starvation":   round(-cfg.reward_wt_starvation * starvation_penalty, 3),
    "baseline_gap": round(baseline_bonus, 3),
    "all_red":      round(-2.0 * all_red_penalty, 3),
}
```

### 4. `backend/api/socket_handlers.py` — 3 additions

**Inference closure (created at training start):**
```python
def _make_inference_fn(session_id, emit_fn):
    def _inference_fn(model):
        emit_fn("training:inference_start", {"session_id": session_id})
        world = _SimWorld(fixed_time=False, policy_fn=_make_policy_fn(model))
        for _ in range(200):
            world.step()
            emit_fn("sim:frame", world.to_frame())
        emit_fn("training:inference_end", {"session_id": session_id})
    return _inference_fn
```

Pass to trainer via `extra_callbacks`:
```python
inference_fn = _make_inference_fn(session_id, sio.emit)
trainer = PPOTrainer(
    ...
    extra_callbacks=[
        _StopCallback(), _PaceCallback(), _PlateauCallback(),
        DecisionCaptureCallback(session_id, sio.emit),
        InferenceCheckpointCallback(session_id, inference_fn, check_every=10),
    ],
)
```

**Two REST endpoints (added to `backend/api/routes.py`):**
```
GET /api/decisions/<session_id>
→ 200 [{ep, total_reward, mean_wait, throughput, n_decisions}, ...]

GET /api/decisions/<session_id>/<int:ep_num>
→ 200 {summary: {...}, decisions: [Decision × 40]}
→ 404 if session or episode not found
```

---

## Frontend Changes

### New files

**`frontend/src/store/decisionStore.ts`** (Zustand)
```typescript
interface DecisionStore {
  liveDecisions: Decision[]          // current episode, live
  currentEpisode: number
  currentDecision: number
  episodes: EpisodeSummary[]         // from REST
  episodeCache: Record<number, Decision[]>
  isInferenceRunning: boolean
  selectedDecision: Decision | null

  appendDecision(d: Decision): void
  setCurrentEpisode(ep: number): void
  setCurrentDecision(idx: number): void
  fetchEpisodes(sessionId: string): Promise<void>
  fetchEpisodeData(sessionId: string, ep: number): Promise<void>
  setInferenceRunning(v: boolean): void
}
```

**`frontend/src/components/ActionProbHeatmap.tsx`**
- 5×7 CSS grid
- Cell colour: `rgba(34,211,238, probability)` (cyan opacity)
- Chosen action cell: `border: 2px solid #22d3ee; font-weight: bold`
- Row labels: PHASE_NAMES, column labels: DURATIONS
- Hover tooltip: exact probability value

**`frontend/src/components/FeatureImportanceBars.tsx`**
- Top 8 features sorted by importance descending
- Each row: label chip + `importance%` badge + coloured bar
- Bar colour: `#f59e0b` (amber) for top 3, `#60a5fa` (blue) for rest
- Shows value next to label in muted text

**`frontend/src/components/DecisionDetailModal.tsx`**
- Full-screen modal, `backdrop-blur-md bg-black/60`
- 3-column grid: Observation | Heatmap | Importance + Reward
- **Observation panel:** Arms collapsible (`<details>`). Each row: label + value + `<progress>` bar. Phase one-hot as 5 pill chips. Episode progress bar at bottom.
- **Reward breakdown:** Each component as `+`/`−` colour chip with label and magnitude bar. Total in larger bold text.
- **Value estimate:** Single chip: `V(s) = −94.2`
- Bottom nav: `← Prev  [18 / 40]  Next →` with keyboard arrow support

**`frontend/src/components/XaiDecisionSidebar.tsx`**
- Header: `Episode #42 · Decision 18/40 · Reward −127.3` with live pulse dot
- Decision feed (newest top, 10 visible, auto-scroll):
  - Phase pill (colour-coded by arm: N+S=green, E+W=amber, all-red=red)
  - Duration badge
  - Top-2 importance features in muted text
  - Reward chip (`+0.8` green, `−1.4` red)
  - Click → `DecisionDetailModal`
- Inference banner (when running): `Inference checkpoint — see canvas →` + progress bar
- Empty state: `Training starting…` spinner

**`frontend/src/components/EpisodeTimeline.tsx`**
- SVG 100% width × 80px
- Sparkline: `<polyline>` of normalised rewards, `<linearGradient>` fill red→green
- Episode ticks: `<line>` marks every episode
- Convergence marker: dashed vertical line at convergence episode
- Playhead: draggable `<circle>` + `<line>`, snaps to nearest episode on mouseup
- Hover: `<title>` tooltip `Episode 42 · −127.3 · Wait: 230s`
- Controlled: `currentEp`, `onSelect(ep)` props

**`frontend/src/pages/DecisionReplay.tsx`**

Layout (flex column, full page):
```
┌─────────────────────────────────────────────────────┐
│ TOP BAR: session info + episode summary KPIs        │
├──────────────────┬──────────────────────────────────┤
│ DECISION LIST    │ DECISION DETAIL PANEL            │
│ (ep decisions,   │ (3-col layout, always visible,  │
│  scrollable,     │  same content as modal but       │
│  35% width)      │  no backdrop)                   │
│                  │                                  │
│ ← [18/40] →     │                                  │
├──────────────────┴──────────────────────────────────┤
│ EPISODE TIMELINE (EpisodeTimeline component)        │
│ ◄  Episode 42 / 139  ►   Reward: −127.3            │
└─────────────────────────────────────────────────────┘
```

Decision list card (left panel): phase badge + reward chip + top-2 importance preview. Selected card: `ring-2 ring-cyan-400`. Click → updates right panel. Keyboard: up/down arrows navigate decisions.

### Modified files

**`frontend/src/hooks/useSocket.ts`** — add 3 listeners:
```typescript
socket.on("training:decision",        d  => decisionStore.appendDecision(d))
socket.on("training:inference_start", () => decisionStore.setInferenceRunning(true))
socket.on("training:inference_end",   () => decisionStore.setInferenceRunning(false))
```

**`frontend/src/pages/Dashboard.tsx`** (or SimulationManager) — add XAI LIVE tab to right sidebar tab group during training. Tab label: `XAI` with pulsing dot when `liveDecisions.length > 0`.

**`frontend/src/App.tsx`** — add route:
```typescript
<Route path="/decisions/:sessionId" element={<DecisionReplay />} />
```

Add "View Decisions" link on session card in Simulations page → navigates to `/decisions/<session_id>`.

---

## What Is Not Changing

- Canvas renderer — no changes; inference checkpoint uses existing `sim:frame` path
- DB schema — no migrations
- mock_env observation format — only `info` dict gains `reward_parts`
- SB3 training hyperparameters — unchanged
- All existing socket events — unchanged
- KPI cards, training chart, insight cards — unchanged
