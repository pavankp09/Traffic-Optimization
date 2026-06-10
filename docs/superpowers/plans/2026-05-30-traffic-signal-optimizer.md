# Traffic Signal Optimizer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a full-stack AI traffic signal optimization platform with SUMO simulation, PPO RL agent, YOLOv8 vision, and a React dashboard showing live vehicle movement, XAI explainability, and economic impact.

**Architecture:** Modular Python monolith (Flask + Socket.IO) + React/TypeScript frontend. SUMO runs headless via TraCI. PPO agent (Stable-Baselines3) trains in a custom Gymnasium environment with a 22-dim state. All real-time data streams via Socket.IO at 10fps.

**Tech Stack:** Python 3.11, Flask 3.0, Flask-SocketIO 5.3, SQLAlchemy 2.0, SUMO 1.18, Gymnasium 0.29, Stable-Baselines3 2.3, Ultralytics YOLOv8 8.2, OpenCV 4.9, OSMnx 1.9, React 18, TypeScript 5.4, Tailwind 3.4, Recharts 2.12, Zustand 4.5, Framer Motion 11, Socket.IO-client 4.7, WeasyPrint 61, SHAP 0.45.

**Spec:** docs/superpowers/specs/2026-05-30-traffic-signal-optimizer-design.md

---

## Phase 1 — Foundation

### Task 1: Project Scaffold & Requirements
**Files:**
- Create: `backend/__init__.py`
- Create: `backend/requirements.txt`
- Create: `frontend/package.json`
- Create: all `__init__.py` stubs for every backend module

Create directory tree, requirements.txt with all pinned versions, package.json with all frontend deps.

### Task 2: Config & Vehicle Type Profiles
**Files:**
- Create: `backend/config.py`
- Create: `backend/simulation/vehicle_types.py`

`config.py` holds all defaults (Hyderabad-calibrated). `vehicle_types.py` defines 10 vehicle type profiles: car, two_wheeler, ev_scooter, auto_rickshaw, e_rickshaw, cab, delivery_bike, tsrtc_bus, school_bus, truck — each with length, max_speed, accel, decel, idle_fuel_L_per_hr, co2_factor, color_hex.

### Task 3: Database Models
**Files:**
- Create: `backend/db/models.py`
- Create: `backend/db/__init__.py`
- Test: `backend/tests/test_models.py`

SQLAlchemy models: Session, Episode, VehicleSnapshot, MetricRecord, AdverseEvent, InsightCard.

### Task 4: Entry Point
**Files:**
- Create: `run.py`
- Create: `backend/app.py`

`run.py` starts Flask backend + Vite frontend dev server in parallel. `app.py` initialises Flask, Flask-SocketIO, SQLAlchemy, and registers blueprints.

---

## Phase 2 — Simulation Core

### Task 5: SUMO Environment Wrapper
**Files:**
- Create: `backend/simulation/sumo_env.py`
- Test: `backend/tests/simulation/test_sumo_env.py`

TraCI lifecycle: `start(config)`, `step()`, `stop()`, `reset()`. Returns raw vehicle data each step. Handles headless mode (no GUI). Configurable sim speed multiplier.

### Task 6: Intersection Builder
**Files:**
- Create: `backend/simulation/intersection_builder.py`
- Create: `backend/simulation/templates/` (4-way, T-junction, Y-junction, 6-arm, roundabout SUMO .net.xml templates)

Builds SUMO `.net.xml` + `.rou.xml` from config. Supports built-in templates and OSMnx import by lat/lon. Adds sublane model, speed breakers, dedicated turn/U-turn lanes per config.

### Task 7: Demand Generator
**Files:**
- Create: `backend/simulation/demand_generator.py`

Generates SUMO route files from: vehicle mix (10 types), volume (vph), pattern (uniform/morning-peak/evening-peak/bidirectional/random), arrival distribution (Poisson/Weibull/uniform), turn ratios, warm-up period. Accepts vision-fed real counts when in RTSP mode.

### Task 8: State Extractor
**Files:**
- Create: `backend/simulation/state_extractor.py`
- Test: `backend/tests/simulation/test_state_extractor.py`

Extracts 22-dim RL state vector + full vehicle frame (positions, speeds, types, lane assignments) from TraCI each step. Returns both: `rl_state: np.ndarray[22]` and `frame: dict` for Socket.IO broadcast.

### Task 9: Adverse Injector
**Files:**
- Create: `backend/simulation/adverse_injector.py`
- Test: `backend/tests/simulation/test_adverse_injector.py`

Implements all adverse scenario types: collision probability, rear-end risk, red-light running, signal failure modes, waterlogging, VIP convoy, auto-rickshaw mid-road pickup, street vendor encroachment, school zone, camera dropout. Each injector is a class with `tick(step)` → returns list of `AdverseEvent` objects.

---

## Phase 3 — RL Agent

### Task 10: Gymnasium Traffic Environment
**Files:**
- Create: `backend/rl/traffic_env.py`
- Test: `backend/tests/rl/test_traffic_env.py`

Custom `gymnasium.Env`. State: 22-dim (queues×4, wait×4, flow_rate×4, heavy_ratio×4, current_phase, phase_elapsed_norm, time_of_day_norm, total_delay, emergency_flag, adverse_severity). Action: Discrete(35) = 5 phases × 7 durations. Reward: multi-term formula from spec §4.

### Task 11: PPO Trainer + Callbacks
**Files:**
- Create: `backend/rl/trainer.py`
- Test: `backend/tests/rl/test_trainer.py`

SB3 PPO with `MlpPolicy 64×64`, all hyperparams from spec. Custom callbacks: `EpisodeMetricsCallback` (logs reward, phase_durations per episode), `ConvergenceCallback` (detects variance < 5% over 50 eps), `InsightCallback` (generates insight card events). Emits Socket.IO events after each episode.

### Task 12: Baseline Agent
**Files:**
- Create: `backend/rl/baseline_agent.py`
- Test: `backend/tests/rl/test_baseline_agent.py`

Fixed-time controller (equal green per phase, configurable cycle), Webster's method controller (calculates optimal cycle from volume data), semi-actuated controller. All implement same interface as RL agent for fair comparison.

### Task 13: Model Manager + Model Zoo
**Files:**
- Create: `backend/rl/model_manager.py`
- Create: `backend/rl/model_zoo.py`
- Create: `models/README.md`

Save/load/version SB3 models (`.zip`). Model zoo lists bundled pre-trained models per location preset. `model_zoo.py` maps preset_id → model path.

### Task 14: Transfer Learner + XAI Explainer
**Files:**
- Create: `backend/rl/transfer_learner.py`
- Create: `backend/rl/explainer.py`
- Test: `backend/tests/rl/test_explainer.py`

`transfer_learner.py`: loads base model, freezes early layers, fine-tunes on new env. `explainer.py`: uses SHAP values to compute feature importance per action; generates natural-language decision reason string from state + action.

---

## Phase 4 — Analytics

### Task 15: Metrics Calculator
**Files:**
- Create: `backend/analytics/metrics.py`
- Test: `backend/tests/analytics/test_metrics.py`

Calculates per-episode: avg_wait_per_vehicle (by type), throughput, green_utilisation, collision_count, violation_rate, signal_efficiency. Computes baseline vs RL deltas.

### Task 16: Economic Calculator
**Files:**
- Create: `backend/analytics/economic.py`
- Test: `backend/tests/analytics/test_economic.py`

Fuel saved (per vehicle type × IDLE_RATE × wait_saved), CO2 avoided (petrol×2.31 + diesel×2.68), fuel cost saved (₹106/L petrol, ₹93/L diesel), time value saved (wait_saved × vehicles × ₹250/hr), carbon credit value (₹2000/tonne), city-wide projection(n_intersections).

### Task 17: Insight Generator + Session Store + Comparator
**Files:**
- Create: `backend/analytics/insight_generator.py`
- Create: `backend/analytics/comparator.py`
- Create: `backend/analytics/session_store.py`

`insight_generator.py`: detects milestones (beats baseline, convergence, best episode, peak pattern learned) → returns `InsightCard` dicts with icon + message. `session_store.py`: persists sessions/episodes to SQLite. `comparator.py`: side-by-side KPI diff between two sessions.

### Task 18: Report Generator
**Files:**
- Create: `backend/analytics/report_generator.py`
- Create: `backend/analytics/report_template.html`
- Test: `backend/tests/analytics/test_report_generator.py`

Generates pilot report with 7 sections (executive summary, methodology, results table, charts as base64 PNGs, city-wide projection, recommendations, technical appendix). WeasyPrint renders to PDF. Returns PDF bytes + HTML string.

---

## Phase 5 — API Layer

### Task 19: REST Routes
**Files:**
- Create: `backend/api/routes.py`
- Test: `backend/tests/api/test_routes.py`

All 22 REST endpoints from spec §8. Uses Flask blueprints. Validates request bodies. Returns consistent `{success, data, error}` envelope.

### Task 20: Socket.IO Handlers + Preset Library
**Files:**
- Create: `backend/api/socket_handlers.py`
- Create: `backend/config_presets.py`
- Test: `backend/tests/api/test_socket_handlers.py`

All 14 Socket.IO server→client events from spec §8. `config_presets.py`: full Python dict of all 30+ presets (Groups A–G) with every field value populated.

---

## Phase 6 — Frontend Foundation

### Task 21: React Scaffold + Tailwind + Router
**Files:**
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/main.tsx`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/pages/Dashboard.tsx` (shell)
- Create: `frontend/src/pages/CompareSession.tsx` (shell)
- Create: `frontend/src/pages/PilotReport.tsx` (shell)

React 18 + Vite + TailwindCSS dark theme. React Router v6 with `/`, `/compare`, `/report` routes. Global dark background (`#0a0a0a`).

### Task 22: Zustand Stores + Type Definitions
**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/store/simulationStore.ts`
- Create: `frontend/src/store/sessionStore.ts`
- Create: `frontend/src/store/configStore.ts`

TypeScript types for all Socket.IO payloads, vehicle frames, KPI metrics, presets, adverse events. Zustand stores with typed state + actions.

### Task 23: Socket.IO Hook + Simulation Hook
**Files:**
- Create: `frontend/src/hooks/useSocket.ts`
- Create: `frontend/src/hooks/useSimulation.ts`
- Create: `frontend/src/hooks/useQuickDemo.ts`
- Test: `frontend/src/hooks/__tests__/useSocket.test.ts`

`useSocket`: connects to backend, maps all 14 events to store actions. `useSimulation`: exposes start/stop/reset/pause commands. `useQuickDemo`: orchestrates auto-showcase sequence (load preset → start → wait → switch to split → end).

---

## Phase 7 — Canvas & Visualization

### Task 24: Canvas Renderer Utilities
**Files:**
- Create: `frontend/src/utils/canvasRenderer.ts`
- Test: `frontend/src/utils/__tests__/canvasRenderer.test.ts`

Pure functions: `drawRoad(ctx, config)`, `drawVehicle(ctx, vehicle)`, `drawSignal(ctx, signal, state)`, `drawQueueOverlay(ctx, queue)`, `drawAdverseOverlay(ctx, event)`. Vehicle colours per type. Smooth interpolation between positions.

### Task 25: Single Canvas + Adverse Overlays
**Files:**
- Create: `frontend/src/components/canvas/SimulationCanvas.tsx`
- Create: `frontend/src/components/canvas/SignalStateOverlay.tsx`
- Create: `frontend/src/components/canvas/AdverseEventOverlay.tsx`

Uses `useAnimationFrame` loop reading from Zustand store. Renders road, vehicles, signals at 10fps. Adverse overlay shows: collision X, flood wave, construction cones, VIP lights, signal failure banner, camera-dropout dim.

### Task 26: Split-Screen Canvas
**Files:**
- Create: `frontend/src/components/canvas/SplitScreenCanvas.tsx`

Two side-by-side canvases sharing same traffic demand. Left = baseline, Right = RL. Centre divider shows live delta "RL saving Xs/vehicle". Toggle button between single/split/replay modes.

---

## Phase 8 — KPI, Training & XAI

### Task 27: KPI Cards + Economic Projector
**Files:**
- Create: `frontend/src/components/kpi/KPICards.tsx`
- Create: `frontend/src/components/kpi/EconomicProjector.tsx`
- Create: `frontend/src/components/kpi/ImpactTicker.tsx`
- Create: `frontend/src/utils/economicCalc.ts`

6 animated KPI cards (Framer Motion count-up). Economic projector: slider 1–1200 intersections → live ₹/year, CO2 tonnes/year, vehicle-hours saved. ImpactTicker: scrolling live ₹ counter.

### Task 28: RL Training Chart + Insight Cards + Convergence
**Files:**
- Create: `frontend/src/components/training/RLTrainingChart.tsx`
- Create: `frontend/src/components/training/InsightCards.tsx`
- Create: `frontend/src/components/training/ConvergenceIndicator.tsx`

Recharts LineChart with baseline dashed line, milestone annotations (beats-baseline, convergence, best-episode). Insight cards: animated feed with icons. Convergence: circular progress gauge.

### Task 29: XAI Panel
**Files:**
- Create: `frontend/src/components/explainability/AgentStatePanel.tsx`
- Create: `frontend/src/components/explainability/DecisionReason.tsx`
- Create: `frontend/src/components/explainability/FeatureImportance.tsx`

State bar chart (22 dims, colour-coded by value). Decision reason card (animated text update per action). Feature importance horizontal bars (SHAP values, updates every 10 episodes).

---

## Phase 9 — Config Panel

### Task 30: Help Popover + Required Field Guard
**Files:**
- Create: `frontend/src/components/config/HelpPopover.tsx`
- Create: `frontend/src/components/config/RequiredFieldGuard.tsx`

`HelpPopover`: dark popover on ⓘ hover (300ms delay). `RequiredFieldGuard`: wraps any field, shows red border + "* Required" label when empty, green when valid. Exposes validation state to parent.

### Task 31: SimConfigPanel — Sections A–D
**Files:**
- Create: `frontend/src/components/config/SimConfigPanel.tsx`
- Create: `frontend/src/components/config/sections/IntersectionSection.tsx`
- Create: `frontend/src/components/config/sections/DemandSection.tsx`
- Create: `frontend/src/components/config/sections/SignalSection.tsx`
- Create: `frontend/src/components/config/sections/RLSection.tsx`

Accordion sections A–D. Every field has ⓘ help popover. Required fields use RequiredFieldGuard. Incompatible fields greyed with tooltip. Default pill badge.

### Task 32: SimConfigPanel — Sections E–I + Preset Selector
**Files:**
- Create: `frontend/src/components/config/sections/SimEngineSection.tsx`
- Create: `frontend/src/components/config/sections/BaselineSection.tsx`
- Create: `frontend/src/components/config/sections/CameraSection.tsx`
- Create: `frontend/src/components/config/sections/MetricsOutputSection.tsx`
- Create: `frontend/src/components/config/sections/AdverseSection.tsx`
- Create: `frontend/src/components/config/PresetSelector.tsx`
- Create: `frontend/src/data/presets.ts`

Sections E–I (sim engine, baseline, camera, metrics, adverse — all 5 sub-sections of adverse). PresetSelector: grouped dropdown (7 groups, 30+ presets). Field-fill animation on preset select. Modified badge. Reset to Preset button. `presets.ts`: full data file with all 30+ preset configs.

---

## Phase 10 — Charts, Timeline & Comparison

### Task 33: Before/After Chart + Queue Heatmap + Phase Timeline
**Files:**
- Create: `frontend/src/components/charts/BeforeAfterChart.tsx`
- Create: `frontend/src/components/charts/VehicleQueueHeatmap.tsx`
- Create: `frontend/src/components/charts/PhaseTimeline.tsx`

BeforeAfterChart: Recharts grouped bars, baseline grey vs RL green, delta label. Heatmap: lane×time grid, intensity = queue depth. PhaseTimeline: Gantt with two rows (baseline vs RL), hover tooltip.

### Task 34: Session Comparison Page
**Files:**
- Create: `frontend/src/pages/CompareSession.tsx`
- Create: `frontend/src/components/charts/SessionCompareTable.tsx`

Load two sessions from history. Side-by-side KPI table with delta column (green/red arrows). Export comparison as PDF.

---

## Phase 11 — Report & Quick Demo

### Task 35: Pilot Report Page + All Exports
**Files:**
- Create: `frontend/src/pages/PilotReport.tsx`
- Create: `frontend/src/utils/reportBuilder.ts`
- Create: `frontend/src/components/shared/ExportButton.tsx`

Report page calls `/api/report/generate`, renders HTML preview in iframe, provides download PDF button. ExportButton handles JSON/CSV/XML/PDF downloads. reportBuilder assembles chart images for embedding.

### Task 36: Quick Demo Button + Orchestration
**Files:**
- Create: `frontend/src/components/shared/QuickDemoButton.tsx`
- Modify: `frontend/src/hooks/useQuickDemo.ts`

Prominent header button "▶ Quick Demo — Hyderabad Rush Hour". Calls `/api/simulation/quick-demo`. Listens to `demo:step` events to show progress. After completion shows "Demo complete" banner with export CTA.

---

## Phase 12 — Vision Pipeline

### Task 37: YOLOv8 Detector + Vehicle Classifier
**Files:**
- Create: `backend/vision/detector.py`
- Create: `backend/vision/vehicle_classifier.py`
- Test: `backend/tests/vision/test_detector.py`

YOLOv8n inference on frames. `vehicle_classifier.py` maps YOLO class IDs to Hyderabad vehicle types (two-wheeler, auto, etc.) using aspect ratio + size heuristics. Returns detections with type, bbox, confidence.

### Task 38: ByteTrack + Lane Mapper + Feed Manager
**Files:**
- Create: `backend/vision/lane_mapper.py`
- Create: `backend/vision/feed_manager.py`
- Test: `backend/tests/vision/test_lane_mapper.py`

ByteTrack (via supervision) tracks vehicle IDs across frames. `lane_mapper.py`: perspective transform + polygon zone assignment → vehicle count per lane. `feed_manager.py`: RTSP connect/reconnect, frame skip, dropout detection, fallback to last-known counts.

---

## Phase 13 — Dashboard Assembly & Integration

### Task 39: Dashboard Assembly
**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

Wires all components into final layout: header (title + Quick Demo + mode toggle), canvas area (single/split/replay), KPI row, training chart + insight feed, XAI panel, before/after chart + phase timeline, config panel sidebar. Responsive grid (Tailwind).

### Task 40: End-to-End Smoke Test + README
**Files:**
- Create: `backend/tests/test_e2e.py`
- Create: `README.md`

E2E test: start backend, POST `/api/simulation/start` with Hyderabad Rush Hour config, wait for 5 `rl:episode` Socket.IO events, assert metrics improved, stop. README: setup instructions (Python 3.11, SUMO install, npm install, run.py).
