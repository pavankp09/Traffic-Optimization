# Traffic Signal Optimizer — System Design Spec
**Date:** 2026-05-30  
**Status:** Approved  
**Target:** Local machine MVP → Hyderabad pilot

---

## 1. Vision

An AI-powered traffic signal optimization platform that ingests real CCTV/IP camera feeds (or runs fully in simulation), uses YOLOv8 to analyze vehicle flow, trains a Reinforcement Learning agent (PPO) inside a SUMO microsimulation, and delivers a stunning real-time dashboard showing live vehicle movement, RL training progress, and quantified impact: signal timing improvements, wait time reduction, fuel savings, and CO2 avoided.

The client sees the RL agent *learning* in real time — vehicles moving, signals switching, queues shrinking — with before/after numbers that make the value undeniable.

---

## 2. Architecture

### Pattern: Modular Monolith
Single Python backend with clearly bounded modules. One `run.py` starts everything. Frontend is a standalone React app. No microservices overhead for MVP.

```
project_t/
├── backend/
│   ├── app.py                          # Flask + Socket.IO server
│   ├── config.py                       # All tuneable defaults + preset library
│   ├── vision/
│   │   ├── detector.py                 # YOLOv8n + ByteTrack on RTSP stream
│   │   ├── lane_mapper.py              # Maps detections to lanes
│   │   ├── vehicle_classifier.py       # Extended types: e-rickshaw, EV, delivery, school bus
│   │   └── feed_manager.py             # RTSP connect/reconnect, sim mode toggle
│   ├── simulation/
│   │   ├── sumo_env.py                 # TraCI lifecycle (start/step/stop)
│   │   ├── intersection_builder.py     # OSMnx → SUMO network generator
│   │   ├── demand_generator.py         # Synthetic or vision-fed vehicle demand
│   │   ├── state_extractor.py          # Vehicle positions, speeds, queues → JSON
│   │   ├── adverse_injector.py         # Injects collisions, violations, failures, hazards
│   │   └── vehicle_types.py            # Extended Hyderabad vehicle type profiles
│   ├── rl/
│   │   ├── traffic_env.py              # Gymnasium Env (enhanced 22-dim state)
│   │   ├── trainer.py                  # SB3 PPO training loop + callbacks
│   │   ├── baseline_agent.py           # Fixed-time / Webster's controller
│   │   ├── model_manager.py            # Save/load/version trained models
│   │   ├── model_zoo.py                # Pre-trained models per location preset
│   │   ├── transfer_learner.py         # Fine-tune existing model on new intersection
│   │   └── explainer.py                # XAI: feature importance + natural language reasons
│   ├── analytics/
│   │   ├── metrics.py                  # Wait time, throughput, fuel, CO2
│   │   ├── economic.py                 # ₹ saved, time cost, city-wide projection
│   │   ├── comparator.py               # Baseline vs RL delta + session comparison
│   │   ├── insight_generator.py        # Live training insight cards
│   │   ├── report_generator.py         # Auto PDF/HTML pilot report
│   │   └── session_store.py            # SQLite session + episode records
│   ├── api/
│   │   ├── routes.py                   # REST endpoints
│   │   └── socket_handlers.py          # Real-time Socket.IO events
│   └── db/
│       └── models.py                   # SQLAlchemy models
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx           # Main live training view
│   │   │   ├── CompareSession.tsx      # Side-by-side session comparison
│   │   │   └── PilotReport.tsx         # Auto-generated report preview
│   │   ├── components/
│   │   │   ├── canvas/
│   │   │   │   ├── SimulationCanvas.tsx       # Single canvas (normal mode)
│   │   │   │   ├── SplitScreenCanvas.tsx      # Baseline LEFT / RL RIGHT live comparison
│   │   │   │   ├── SignalStateOverlay.tsx      # Traffic light indicators
│   │   │   │   └── AdverseEventOverlay.tsx     # Collision/flood/failure visuals
│   │   │   ├── kpi/
│   │   │   │   ├── KPICards.tsx               # 4+2 animated metric cards
│   │   │   │   ├── EconomicProjector.tsx       # ₹ saved + city-wide impact slider
│   │   │   │   └── ImpactTicker.tsx            # Live scrolling ₹/CO2 counter
│   │   │   ├── training/
│   │   │   │   ├── RLTrainingChart.tsx         # Episode reward curve
│   │   │   │   ├── InsightCards.tsx            # Live AI insight feed
│   │   │   │   └── ConvergenceIndicator.tsx    # "Training 78% converged" progress
│   │   │   ├── explainability/
│   │   │   │   ├── AgentStatePanel.tsx         # Current state values bar chart
│   │   │   │   ├── DecisionReason.tsx          # Natural language "why this phase"
│   │   │   │   └── FeatureImportance.tsx       # Which inputs drove this action
│   │   │   ├── charts/
│   │   │   │   ├── BeforeAfterChart.tsx        # Baseline vs RL per-lane bars
│   │   │   │   ├── VehicleQueueHeatmap.tsx     # Lane queue depth heatmap
│   │   │   │   ├── PhaseTimeline.tsx           # Signal phase Gantt
│   │   │   │   └── SessionCompareTable.tsx     # Multi-session KPI diff table
│   │   │   ├── config/
│   │   │   │   ├── SimConfigPanel.tsx          # Full config accordion
│   │   │   │   ├── PresetSelector.tsx          # Grouped preset dropdown (30+)
│   │   │   │   ├── RequiredFieldGuard.tsx      # Red field validation + Start gating
│   │   │   │   └── HelpPopover.tsx             # Reusable ⓘ tooltip component
│   │   │   └── shared/
│   │   │       ├── QuickDemoButton.tsx         # One-click 90s auto-showcase
│   │   │       └── ExportButton.tsx            # JSON / CSV / PDF report
│   │   ├── hooks/
│   │   │   ├── useSocket.ts                    # Socket.IO connection + event bus
│   │   │   ├── useSimulation.ts                # Simulation state manager
│   │   │   └── useQuickDemo.ts                 # Quick demo orchestration
│   │   ├── store/
│   │   │   ├── simulationStore.ts              # Zustand: live sim state
│   │   │   ├── sessionStore.ts                 # Zustand: session history
│   │   │   └── configStore.ts                  # Zustand: config + preset state
│   │   └── utils/
│   │       ├── canvasRenderer.ts               # Vehicle + road drawing primitives
│   │       ├── metricsFormatter.ts             # Unit formatting (L, kg, ₹, sec)
│   │       ├── economicCalc.ts                 # ₹ savings + city projection math
│   │       └── reportBuilder.ts                # PDF report assembly
│   └── package.json
├── models/                                     # Pre-trained model zoo
│   ├── hitec_city_rush.zip
│   ├── mehdipatnam_peak.zip
│   └── generic_urban.zip
├── docs/superpowers/specs/
├── run.py                                      # Single entry point
├── requirements.txt
└── docker-compose.yml
```

---

## 3. Data Flow

### Simulation Mode (default)
```
SUMO (headless) ←→ TraCI
        ↓
  state_extractor  →  Gymnasium Env  →  PPO Agent
        ↓                                    ↓
  demand_generator                     signal_action
        ↑                                    ↓
  analytics/metrics              TraCI.setPhase()
        ↓
  Socket.IO broadcast
        ↓
  React Dashboard (100ms update interval, ~10fps)
```

### RTSP Mode
```
IP Camera (RTSP) → YOLOv8n → ByteTrack → lane_mapper
                                                ↓
                                    vehicle_counts_per_lane
                                                ↓
                                    demand_generator (real demand)
                                                ↓
                                  [same SUMO → RL pipeline]
```

---

## 4. RL Environment

### State Space (22-dim vector)
```python
# Per-lane features (4 lanes × 4 features = 16 dims)
queue_lane_[0-3]          # vehicles waiting (normalized 0-1, max=50)
wait_time_lane_[0-3]      # avg wait seconds (normalized 0-1, max=120s)
flow_rate_lane_[0-3]      # incoming vehicles/min (anticipate, not just react)
heavy_vehicle_ratio_[0-3] # trucks+buses ratio (heavier = longer clearance time)

# Intersection-level features (6 dims)
current_phase             # 0-4 (one-hot encoded, 5 phases)
phase_elapsed_norm        # 0.0-1.0 (elapsed / max_phase_duration)
time_of_day_norm          # 0.0-1.0 (hour/24) — enables peak vs off-peak policy
total_intersection_delay  # sum of all wait times / theoretical free-flow time
emergency_vehicle_flag    # 0/1 — preemption signal active
adverse_severity_norm     # 0.0-1.0 — combined active adverse scenario intensity
```

**Why this matters:** Without `flow_rate`, the agent reacts to queues that already formed — it can't anticipate. Without `time_of_day_norm`, it behaves identically at 3 AM and 9 AM and can never learn time-aware policies. Without `heavy_vehicle_ratio`, it gives a bus the same green duration as a two-wheeler. These three additions are what separate a research demo from a deployable system.

### Action Space (Discrete, 35 actions)
- Phase selection: 0–4 (N-S straight, E-W straight, right-turn protected, U-turn, pedestrian)
- Duration: 15s / 20s / 25s / 30s / 40s / 50s / 60s (7 choices)
- Combined: 5 × 7 = 35 discrete actions

### Reward Function
```python
reward = (
    -1.0 * sum(queue_lengths_normalized)       # penalize waiting vehicles
    -0.5 * sum(wait_times_normalized)          # penalize long waits
    +2.0 * throughput_this_step                # reward vehicles clearing
    -0.3 * num_phase_changes                   # penalize rapid switching
    -1.5 * collision_events                    # heavy penalty per collision
    -0.8 * pedestrian_conflict_events          # penalize pedestrian near-misses
    +0.5 * emergency_vehicle_cleared           # bonus: ambulance got green fast
    -0.2 * cycle_length_over_120s              # penalize exceeding GHMC cap
)
```

### Transfer Learning
```
Pre-trained model (HITEC City Rush Hour, 500 episodes)
        ↓  load weights
Fine-tune on new intersection (Mehdipatnam, 50 episodes)
        ↓  ~90% of original performance in 10% of training time
```
- `model_zoo.py` bundles pre-trained `.zip` models for each location preset
- `transfer_learner.py` freezes early layers, fine-tunes final policy layer only
- UI shows: "Using transfer learning from HITEC City model — estimated 50 episodes to convergence"

### PPO Hyperparameters (optimal defaults)
| Param | Value | Rationale |
|---|---|---|
| n_steps | 2048 | good balance for traffic timescales |
| batch_size | 64 | stable gradient updates |
| n_epochs | 10 | standard PPO |
| learning_rate | 3e-4 | Adam default |
| gamma | 0.99 | long-horizon reward — plans ~100 steps ahead |
| policy | MlpPolicy 64×64 | sufficient for 22-dim state |
| total_timesteps | 500 episodes | ~5 min training on CPU |
| ent_coef | 0.01 | encourages exploration of phase combinations |

---

## 5. Simulation Configuration Options

All options exposed in `SimConfigPanel` with a `ⓘ` help icon per row showing the description below.  
★ = optimal default (pre-selected, tuned for Hyderabad, India urban traffic).  
🔴 = required field — shown with red border + red asterisk label; Start button disabled until all red fields are filled.  
Grey fields = conditionally disabled (shown with tooltip explaining why).

### Required Fields (🔴) — minimum to start a session
1. **Intersection Type** — geometry must be known before network is built
2. **Traffic Volume** — must set demand before simulation can run
3. **Vehicle Mix** — determines entity types spawned in SUMO
4. **Data Source** — must choose SUMO-only or RTSP before pipeline starts
5. **RTSP Stream URL** — required only when Data Source = RTSP feed
6. **Training Episodes** — agent cannot train without a budget
7. **Baseline Controller** — required to compute before/after comparison

All other fields have safe defaults and are optional overrides.

---

### Default Calibration: Hyderabad, India
Hyderabad reference conditions used to set all defaults:
- Dominant vehicle type: **two-wheelers (motorcycles/scooters) ~45%**
- High informal lane usage, short headways, aggressive gap acceptance
- Typical busy corridor volume: **800–1000 vph** (Tank Bund, HITEC City, Mehdipatnam)
- Peak hours: **8–10 AM and 6–9 PM**, strong bidirectional surge pattern
- Signal cycle lengths: **90–120s** (GHMC standard)
- High driver speed variance due to mixed formal/informal behaviour
- U-turns common — 4-phase with protected U-turn phase is standard
- Auto-rickshaws as a distinct vehicle class (shorter than car, slower than bike)

---

### 5A. Intersection & Road Network

| Option | Req | Choices | Default ★ (Hyderabad) | Help Text (shown on ⓘ hover) |
|---|---|---|---|---|
| **Intersection Type** | 🔴 | 4-way cross, T-junction, Y-junction, 6-arm complex, Roundabout | **4-way cross** | Shape of the intersection. 4-way cross is the most common layout in Hyderabad's urban grid (HITEC City, Banjara Hills). Required — determines road network geometry before simulation can build. |
| **Lanes per Arm** | | 1, 2, 3, 4 | **3** | Number of lanes per road arm. Hyderabad's major corridors (Mehdipatnam, Kukatpally) typically have 3 lanes per direction. More lanes increase capacity but expand the RL state space. |
| **Dedicated Turn Lanes** | | Off, Left only, Right only, Both | **Right only** | India uses left-hand traffic — left turns are free-flow (no signal needed). Right-turn protected phase is the critical one. "Right only" matches standard GHMC intersection design. |
| **U-Turn Phase** | | Disabled, Enabled | **Enabled** | U-turns are extremely common at Hyderabad intersections and must have a dedicated phase to avoid conflicts. Unique to Indian traffic — not typical in Western signal design. |
| **Pedestrian Crossings** | | Disabled, At major arms only, At all arms | **At major arms only** | Hyderabad pedestrian crossings are active but often informal. Major arms only avoids over-constraining vehicle phases at low-pedestrian arms. |
| **Bus Lanes** | | Disabled, Enabled | **Disabled** | Dedicated TSRTC bus lanes exist on some corridors (MMTS feeder roads) but are rare at general intersections. Enable for BRTS/BRT pilot scenarios. |
| **Network Source** | | Built-in template, Import from OpenStreetMap, Upload SUMO .net.xml | **Built-in template** | Where to get the road network. OSM import via OSMnx pulls any real-world Hyderabad intersection by GPS coordinates. Built-in template is faster for demos. |
| **OSM Coordinates** | 🔴* | Lat/lon inputs | **17.3850° N, 78.4867° E** (HITEC City) | GPS of the target Hyderabad intersection to import from OpenStreetMap. Pre-filled with HITEC City flyover — change to any GHMC intersection. *Required only when Network Source = OpenStreetMap. |

---

### 5B. Traffic Demand

| Option | Req | Choices | Default ★ (Hyderabad) | Help Text |
|---|---|---|---|---|
| **Traffic Volume** | 🔴 | Low (200 vph), Medium (500 vph), High (900 vph), Very High (1200 vph), Custom | **900 vph (High)** | Total vehicles per hour across all arms. Hyderabad's HITEC City and Mehdipatnam corridors regularly see 800–1100 vph during peaks. High volume makes RL improvements most visible and impactful. Required field. |
| **Vehicle Mix** | 🔴 | Cars only, Hyderabad mixed ★, Western mixed, Rush hour heavy, HITEC City (high cabs), Old City (high two-wheelers), Industrial (high trucks), Custom % | **Hyderabad mixed** | Hyderabad default: two-wheelers 40%, cars 25%, e-scooters 10%, auto-rickshaws 10%, e-rickshaws 5%, cabs/taxis 4%, delivery bikes 3%, TSRTC buses 2%, school buses 0%, trucks 1%. Each type has distinct speed, length, acceleration and clearance-time profile. Required field. |
| **Custom Vehicle %** | 🔴* | Sliders per type (10 types) | **40/25/10/10/5/4/3/2/0/1** | Fine-tune ratios across all 10 Hyderabad vehicle types. Must sum to 100% — UI enforces this with live validation. *Required only when Vehicle Mix = Custom. |
| **Traffic Pattern** | | Uniform, Morning peak (8–10 AM) ★, Evening peak (6–9 PM), Bidirectional surge, Random | **Morning peak (8–10 AM)** | Hyderabad peak hours are 8–10 AM and 6–9 PM. Morning peak profile ramps demand from 400 → 900 vph over 20 minutes then holds. Peak patterns challenge RL to adapt to surge conditions. |
| **Arrival Distribution** | | Uniform, Poisson ★, Weibull | **Poisson** | How vehicles arrive at the intersection. Poisson (random independent arrivals) is the standard traffic engineering model, well-validated for Indian urban roads. |
| **Turn Ratios** | | Straight %, Right turn %, U-turn % sliders per arm | **60 / 25 / 15** | Hyderabad has high U-turn rates (~15%) at major intersections. Right turns take longer due to conflict with oncoming traffic. Adjust per arm for asymmetric intersections. |
| **Warm-up Period** | | None, 60s, 120s ★, 300s | **120s** | Simulation pre-fills vehicles before RL starts acting. 120s is needed for Hyderabad's high-volume scenario to reach steady-state queues — avoids RL training on unrealistically empty roads. |

---

### 5C. Signal & Phase Configuration

| Option | Req | Choices | Default ★ (Hyderabad) | Help Text |
|---|---|---|---|---|
| **Phase Scheme** | | 2-phase (N-S / E-W), 4-phase ★, 5-phase (with U-turn), 6-phase (protected turns + U-turn) | **5-phase** | Hyderabad intersections commonly use a 5-phase scheme: N-S straight, E-W straight, right-turn protected, U-turn, pedestrian. Matches GHMC signal card design. |
| **Minimum Green Time** | | 10s, 15s ★, 20s, 25s | **15s** | Shortest green phase RL can choose. Indian roads need slightly longer minimums than Western standards — two-wheelers at the front of queues react slowly and require additional clearance time. |
| **Maximum Green Time** | | 45s, 60s, 90s ★, 120s | **90s** | Longest green phase. Hyderabad signal cycles run 90–120s (GHMC standard) — longer than Western norms due to high volume. RL can hold up to 90s on a dominant phase. |
| **Yellow (Amber) Time** | | 3s, 4s ★, 5s | **4s** | Hyderabad uses 4s amber (vs 3s Western standard) to account for aggressive gap-acceptance behaviour — drivers need more warning time. Not controlled by RL; fixed safety value. |
| **All-Red Clearance** | | 1s, 2s ★, 3s, 4s | **2s** | All-red interval after amber. Extended to 2s for Hyderabad because two-wheelers and autos frequently run late amber. Safety-critical — not adjustable by RL. |
| **Pedestrian Walk Time** | | 15s, 20s, 30s ★, 45s | **30s** | Minimum pedestrian signal duration. Indian pedestrian groups are large and cross in waves — 30s allows full group clearance at busy Hyderabad crossings. |
| **Total Cycle Length Cap** | | 90s, 120s ★, 150s, 180s | **120s** | Maximum total signal cycle length. GHMC guidelines use 90–120s for major intersections. Prevents RL from creating excessively long cycles that frustrate drivers. |

---

### 5D. RL Agent & Training

| Option | Req | Choices | Default ★ (Hyderabad) | Help Text |
|---|---|---|---|---|
| **Algorithm** | | PPO ★, A2C, DQN (discrete), SAC-Discrete | **PPO** | PPO (Proximal Policy Optimisation) is the recommended default — stable, sample-efficient, and well-validated for traffic signal control. A2C is faster but less stable. DQN works well for simple intersections. SAC-Discrete is best for complex multi-phase scenarios. |
| **Reward Function** | | Minimize wait time ★, Maximize throughput, Minimize stops, Minimize queue, Balanced composite, Custom weights | **Minimize wait time** | What the agent optimises for. "Minimize wait time" directly targets the most frustrating aspect of Hyderabad traffic — long queues at peak hours. "Balanced composite" equally weights all four KPIs. Custom weights let you tune importance per metric. |
| **Training Episodes** | 🔴 | 100 (~1 min), 500 ★ (~5 min), 1000 (~10 min), 5000 (~50 min), Custom | **500** | Full simulation episodes to train. 500 episodes reliably shows RL beating the Hyderabad fixed-time baseline. Required — agent cannot train without a budget. |
| **Action Frequency** | | Every step, Every 5s ★, Every 10s, Every phase end | **Every 5s** | How often RL can change the signal. Every 5s is optimal for Indian traffic — frequent enough to respond to two-wheeler surges, stable enough to avoid rapid flickering that confuses drivers. |
| **Observation Window** | | Last 1 step ★, Last 5 steps (stacked), Last 10 steps | **Last 1 step** | How many past timesteps the agent sees. Single-step is fastest to train and sufficient for most intersection scenarios. Stack 5 steps only if you need the agent to detect demand trends over time. |
| **Normalise Observations** | | Yes ★, No | **Yes** | Scales all state values to [0,1]. Essential for Hyderabad scenarios where queue lengths can reach 40+ vehicles — without normalisation, large numbers dominate the gradient and slow learning. |
| **Learning Rate** | | 1e-4, 3e-4 ★, 1e-3, Custom | **3e-4** | Neural network optimiser step size. 3e-4 is the PPO standard (Adam optimiser default). Lower = more stable convergence but takes longer. Increase to 1e-3 only for quick experiments. |
| **Hidden Layer Size** | | 32×32, 64×64 ★, 128×128, 256×256 | **64×64** | Policy network architecture. 64×64 neurons is sufficient for the state space size (10–20 dims). Larger networks add GPU cost without meaningful improvement for single-intersection control. |
| **Discount Factor (γ)** | | 0.90, 0.95, 0.99 ★ | **0.99** | How much the agent values future rewards vs immediate. 0.99 means the agent plans ~100 steps ahead — appropriate for signal timing where a bad phase now causes queues 30–60 seconds later. |
| **Random Seed** | | Fixed (42) ★, Random, Custom | **Fixed (42)** | Fixed seed produces reproducible results across runs — critical when demonstrating improvement to stakeholders. Set to Random to test policy robustness across traffic conditions. |

---

### 5E. Simulation Engine

| Option | Req | Choices | Default ★ (Hyderabad) | Help Text |
|---|---|---|---|---|
| **Simulation Speed** | | 1× real-time, 5×, 10× ★, Max (headless) | **10×** | How fast SUMO runs. 10× shows live vehicle movement while training in ~5 minutes. Max (headless) trains fastest but disables canvas animation — use only for long training runs. |
| **Step Length** | | 0.1s, 0.5s ★, 1.0s | **0.5s** | Simulation time resolution. 0.5s is optimal — fine enough to model two-wheeler micro-gaps accurately, fast enough for training speed. 0.1s adds realism but triples training time. |
| **Car-Following Model** | | Krauss, IDM ★, EIDM | **IDM (Intelligent Driver Model)** | Physics model for vehicle following behaviour. IDM is better for Hyderabad — it models aggressive short-headway driving (tailgating) more accurately than Krauss which assumes polite Western driver behaviour. |
| **Lane Change Model** | | LC2013, SL2015 ★ | **SL2015** | Controls lane-changing behaviour. SL2015 is more aggressive (frequent lane changes, short gaps) — accurately represents informal lane discipline common in Hyderabad. Higher CPU cost than LC2013 but worth it for realism. |
| **Driver Speed Variance** | | None, Low (±10%), High (±30%) ★ | **High (±30%)** | Variance in individual driver speeds. High variance is realistic for Hyderabad — mix of slow auto-rickshaws, fast two-wheelers, and cautious cars creates wide speed distribution. Critical for realistic queue modelling. |
| **Lateral Behaviour** | | Standard lanes ★, Sublane model (Indian road sharing) | **Sublane model** | Enables within-lane lateral movement. Two-wheelers and autos in Hyderabad do not stay in fixed lanes — they fill gaps between cars. Sublane model captures this, making vehicle density estimates more accurate. |
| **Weather Condition** | | Clear ★, Light rain (−15% speed), Heavy rain (−30% speed), Fog | **Clear** | Modifies speed profiles. Hyderabad gets heavy monsoon rain (June–September) which significantly degrades intersection throughput. Use rain scenarios to test RL robustness during monsoon season. |
| **Incident Simulation** | | None ★, Random breakdown, Blocked lane, Random surge, Cattle/obstacle crossing | **None** | Disruptions to test RL robustness. "Cattle/obstacle crossing" is unique to Indian urban scenarios — randomly blocks one lane arm for 30–90s. Disabled by default for clean baseline comparison. |
| **Emergency Vehicle Preemption** | | Disabled ★, Enabled | **Disabled** | Dispatches emergency vehicles (ambulance/fire) requiring signal preemption. Enable to test RL failsafe override logic. Disabled for standard MVP demo. |
| **Speed Breakers Near Intersection** | | None ★, 20m upstream, 10m upstream, Both sides | **None** | Places speed humps on approach roads. Vehicles decelerate before reaching the stop line, compressing arrival clusters. Common at every Hyderabad school/hospital vicinity — affects queue formation differently than free-flow arrivals. |
| **Overloaded Vehicles** | | None ★, 5% of trucks, 15% of trucks | **None** | Overloaded trucks have slower acceleration, longer intersection clearance times, and higher breakdown probability. Very common on Hyderabad industrial corridors (ECIL, Nacharam). Increases heavy-vehicle clearing time by 30–50%. |

---

### 5F. Baseline Comparison

| Option | Req | Choices | Default ★ (Hyderabad) | Help Text |
|---|---|---|---|---|
| **Baseline Controller** | 🔴 | Fixed-time ★, Webster's optimised, Semi-actuated, Fully actuated, None | **Fixed-time** | The non-RL controller to compare against. Fixed-time matches how most Hyderabad intersections actually operate today (GHMC standard: fixed 90–120s cycles). Webster's calculates the theoretically optimal fixed cycle — a harder baseline that still shows RL winning. Required for before/after KPI calculation. |
| **Fixed Cycle Length** | | 60s, 90s, 120s ★, 150s, Custom | **120s** | Total baseline cycle length. 120s matches GHMC standard for high-volume intersections. RL improvement is measured against this. The longer the fixed cycle, the more RL can save by adapting dynamically. |

---

### 5G. Camera / Vision (RTSP Mode)

| Option | Req | Choices | Default ★ (Hyderabad) | Help Text |
|---|---|---|---|---|
| **RTSP Stream URL** | 🔴* | Text input | — | Full RTSP URL of the IP camera (e.g. rtsp://192.168.1.10:554/stream1). Most GHMC/TSEC surveillance cameras support RTSP. Must be reachable on the local network or VPN. *Required only when Data Source = RTSP feed. |
| **Detection Confidence** | | 0.3, 0.4, 0.5 ★, 0.7, 0.9 | **0.5** | YOLOv8 minimum score to register a vehicle detection. 0.5 balances accuracy vs missed detections. For crowded Hyderabad scenes with heavy occlusion (vehicles overlapping), lower to 0.4 to catch partially-hidden two-wheelers. |
| **Frame Processing Rate** | | Every frame, Every 2nd ★, Every 5th, Every 10th | **Every 2nd frame** | How often YOLOv8 runs on the camera feed. Every 2nd frame halves CPU load with negligible accuracy loss — vehicles at Hyderabad speeds (~30 km/h in traffic) move only a few pixels between frames. |
| **Track Persistence** | | 1s, 2s, 3s ★, 5s | **3s** | How long ByteTrack holds a vehicle ID after it leaves the frame. 3s prevents double-counting two-wheelers that briefly disappear behind trucks — common at dense Hyderabad intersections. |
| **Lane Zone Detection** | | Auto-detect ★, Manual draw, Upload zone JSON | **Auto-detect** | How to map camera pixels to road lanes. Auto uses perspective transform and edge detection. Manual lets you draw polygon zones on the live feed. Upload JSON reuses zones from a previous session. |
| **Camera Resolution** | | 480p, 720p ★, 1080p | **720p** | RTSP stream resolution. 720p is the sweet spot for Hyderabad CCTV infrastructure — most TSEC cameras output 720p. 1080p improves two-wheeler detection accuracy but doubles processing load. |
| **Camera Mounting Angle** | | Overhead (top-down), High side-angle ★, Low side-angle | **High side-angle** | Tells the perspective correction algorithm the camera's viewpoint. Most Hyderabad traffic cameras are pole-mounted at 5–8m height, 45–60° angle — use High side-angle for accurate lane mapping. |

---

### 5H. Metrics & Output

| Option | Req | Choices | Default ★ (Hyderabad) | Help Text |
|---|---|---|---|---|
| **Metrics Sampling Rate** | | Every step, Every 1s ★, Every 5s, Every 10s | **Every 1s** | How often metrics are calculated and streamed to the dashboard. Every 1s gives smooth KPI card updates. Higher rates can overwhelm the DB during long training runs. |
| **Export Format** | | JSON ★, CSV, SUMO XML, All formats | **JSON** | Result download format. JSON is easiest for developers. CSV opens directly in Excel — useful for sharing with GHMC/municipal clients. SUMO XML includes full per-vehicle trajectory data for academic analysis. |
| **Save Episode Videos** | | Disabled ★, Best episode only, Every 50 episodes, All | **Disabled** | Records simulation canvas as MP4. "Best episode only" saves the highest-reward episode — perfect for client presentations showing RL performance. Requires ffmpeg installed. |
| **Log Raw Trajectories** | | Disabled ★, Enabled | **Disabled** | Saves per-vehicle position/speed/wait every step to SQLite. Enables deep post-hoc analysis but generates ~50MB per 1000-episode run. Enable for academic / audit reporting. |
| **KPI Reference City** | | Hyderabad ★, Mumbai, Delhi, Bengaluru, Generic | **Hyderabad** | Sets the city-specific fuel price, CO2 intensity, and average vehicle idle consumption used in metric calculations. Hyderabad uses ₹106/L petrol and 0.8 L/hr idle rate as reference values. |

---

### 5I. Adverse & Negative Scenarios

All options disabled by default. Each has a ⓘ help icon. Enabling any scenario adds a visible **"Adverse Mode" warning badge** on the canvas. Multiple scenarios can be combined.

---

#### 5I-1. Collision & Accident Risk

| Option | Req | Choices | Default ★ | Help Text |
|---|---|---|---|---|
| **Vehicle–Vehicle Collision Probability** | | Off ★, Low (1% per near-miss), Medium (5%), High (15%), Custom % | **Off** | Probability that a near-miss event (vehicles sharing the same cell) results in a simulated collision. Collision freezes both vehicles in place for a configurable duration, blocking the lane. Tests how RL recovers from sudden capacity loss. |
| **Collision Duration (blockage)** | | 30s, 60s ★, 120s, 300s, Until manually cleared | **60s** | How long a collision blocks the lane before vehicles are removed. 60s reflects average Hyderabad accident clearance time for minor collisions. Active only when collision probability > 0. |
| **Rear-End Collision Risk** | | Off ★, Enabled | **Off** | Triggers rear-end collisions when a following vehicle is within minimum headway and the leader stops suddenly (e.g. on amber). Higher risk with aggressive IDM settings. Tests RL ability to reduce abrupt stops. |
| **Vehicle–Pedestrian Conflict** | | Off ★, Low, Medium, High | **Off** | Randomly spawns pedestrians mid-carriageway (jay-walking) forcing vehicles to brake. Very common at Hyderabad intersections. Measures whether RL reduces pedestrian conflict exposure by shortening vehicle speed variance near crossings. |
| **Collision Recovery Mode** | | Auto-clear ★, Manual clear button, Permanent until reset | **Auto-clear** | How collision blockages are resolved. Auto-clear removes vehicles after the blockage duration. Manual clear lets a user click to resolve — simulates dispatcher intervention. |

---

#### 5I-2. Traffic Violations

| Option | Req | Choices | Default ★ | Help Text |
|---|---|---|---|---|
| **Red Light Running Probability** | | Off ★, Low (2%), Medium (8%), High (20%), Custom % | **Off** | Percentage of vehicles that ignore a red signal and proceed. Very high in Hyderabad (especially two-wheelers). Tests RL's ability to add buffer time / all-red clearance to reduce conflict. |
| **Signal Jumping (amber anticipation)** | | Off ★, Low (5%), High (20%) | **Off** | Vehicles start moving before green appears (anticipating the signal change). Common at Hyderabad intersections. Increases rear-end risk on the cross-phase. |
| **Wrong-Way Driver** | | Off ★, Rare (0.1%), Occasional (1%) | **Off** | Spawns a vehicle travelling against traffic on one arm. Represents ghost vehicle events. RL cannot directly control this but throughput metrics show the disruption impact. |
| **Illegal U-Turn (mid-block)** | | Off ★, Enabled | **Off** | Vehicles perform U-turns at undesignated points, blocking lanes. Common in Hyderabad where designated U-turn infrastructure is absent. Adds unpredictable blockages to non-U-turn phases. |
| **Illegal Parking (lane blockage)** | | Off ★, 1 vehicle, 2 vehicles | **Off** | Permanently parks one or two vehicles in a lane arm, reducing capacity for the session duration. Tests RL adaptation to permanent capacity loss on one approach. |
| **Aggressive Lane Weaving** | | Off ★, Low, High | **Off** | Increases the frequency and aggression of lane changes. High setting simulates peak-hour Hyderabad two-wheeler filtering — vehicles constantly cutting between lanes, increasing conflict probability. |
| **Speeding Vehicles** | | Off ★, 10% of fleet, 25% of fleet | **Off** | A percentage of vehicles exceed the speed limit by 30–50%. Reduces reaction time and increases collision probability. Tests signal timing under reduced predictability. |
| **Auto-Rickshaw Mid-Road Pickup** | | Off ★, Low (1 per 5 min), High (1 per 2 min) | **Off** | Randomly stops an auto-rickshaw mid-lane to pick up or drop a passenger, blocking the lane for 15–45s. Extremely common in Hyderabad. Unlike illegal parking, this is a moving blockage that disappears — RL must handle transient capacity loss. |
| **Street Vendor Encroachment** | | Off ★, Minor (−10% lane width one arm), Major (−25% two arms) | **Off** | Reduces lane width on encroached arms. Vendors occupy road shoulder forcing vehicles to use fewer effective lanes. Common at Old City and market intersections. Minor encroachment reduces capacity; major encroachment can force single-file flow. |
| **School Zone Time Window** | | Off ★, AM only (8–9 AM), PM only (3–4 PM), Both | **Off** | Activates reduced speed zone and extra pedestrian crossing demand during school hours. Children crossing in large groups extends pedestrian phase to 45s. Vehicles decelerate to 20 km/h. Most impactful at KPHB, Jubilee Hills residential presets. |
| **Footpath Encroachment** | | Off ★, Enabled | **Off** | Footpath blocked forces pedestrians onto carriageway, increasing vehicle–pedestrian conflict events. Common across Hyderabad — footpaths routinely occupied by two-wheelers, vendors, and construction materials. |

---

#### 5I-3. Signal & Infrastructure Failures

| Option | Req | Choices | Default ★ | Help Text |
|---|---|---|---|---|
| **Signal Failure Mode** | | None ★, Full blackout (all dark), All-way flashing amber, Stuck phase (single phase loops), Random phase glitch | **None** | Simulates signal controller malfunction. "Full blackout" removes all signals — vehicles use gap acceptance only. "Stuck phase" locks one arm on green indefinitely. Tests RL failsafe and recovery behaviour. |
| **Signal Failure Trigger** | | Never ★, At episode 50%, Random time, Manual trigger button | **Never** | When the failure occurs. "Manual trigger" lets you press a button during live demo to show the system failing and recovering — high impact for client presentations. Active only when a Failure Mode is selected. |
| **Failure Recovery Time** | | 30s, 60s ★, 120s, 300s, Manual reset | **60s** | How long until the signal recovers. During recovery, RL falls back to a safe pre-programmed phase. Demonstrates system resilience. |
| **Power Fluctuation** | | None ★, Occasional flicker (signal blinks), Voltage sag (reduced green brightness), Full outage | **None** | Simulates electrical grid instability — realistic for Hyderabad where power fluctuations are common. Flicker causes brief signal misread by drivers. Full outage triggers the same response as Signal Failure. |
| **Sensor / Detector Failure** | | None ★, Loop detector dropout, All detectors fail, Random detector noise | **None** | Simulates failure of inductive loop detectors or cameras. "All detectors fail" forces RL to act on stale observations — tests robustness to partial observability. |
| **Communication Lag** | | None ★, 100ms, 500ms, 1000ms, Random jitter | **None** | Adds latency to the Socket.IO feed between backend and dashboard. Simulates real-world network delays in IoT deployments. Affects how current the UI display is vs actual signal state. |

---

#### 5I-4. Road & Environmental Hazards

| Option | Req | Choices | Default ★ | Help Text |
|---|---|---|---|---|
| **Waterlogging / Flooding** | | None ★, Minor (−20% speed one arm), Severe (lane closed), Flash flood (full blockage) | **None** | Hyderabad-specific: Musi River flooding and poor drainage cause frequent waterlogging during monsoon (June–September). Reduces speed or closes lanes dynamically. RL must reroute demand within the intersection. |
| **Pothole / Road Damage** | | None ★, One lane degraded (−30% speed), Multiple lanes | **None** | Speed reduction zone due to road damage. Common across Hyderabad arterials post-monsoon. Forces vehicles to slow, compressing queue formation differently than expected. |
| **Construction Zone** | | None ★, One lane closed (static), Moving works (alternating lanes) | **None** | Lane closure due to road works. "Moving works" alternates the closed lane every 5 minutes — RL must adapt dynamically to shifting capacity constraints. |
| **Dust Storm / Low Visibility** | | None ★, Moderate (−25% speed), Severe (−50% speed, 30% detection loss) | **None** | Reduces vehicle speeds and (in RTSP mode) degrades YOLOv8 detection confidence. Hyderabad experiences dust events in April–May before pre-monsoon rains. |
| **Night / Low Light Conditions** | | Daytime ★, Dusk (−10% speed), Night (−20% speed, higher violation rate) | **Daytime** | Night conditions increase violation rates (red-light running rises significantly after midnight in Hyderabad) and reduce camera detection confidence in RTSP mode. |
| **VIP / Convoy Movement** | | None ★, Enabled | **None** | Simulates a VIP convoy requiring one arm to hold green indefinitely for 60–120s. Common in Hyderabad (state capital). Tests RL behaviour when forced to override its own policy for external reasons. |
| **Mass Event / Crowd Spillover** | | None ★, Festival procession, Sports event surge, Emergency evacuation | **None** | Temporarily multiplies demand on 1–2 arms by 3–5× for 5–10 minutes. Hyderabad-relevant: Ganesh processions, cricket matches at Uppal stadium create sudden demand spikes RL must absorb. |

---

#### 5I-5. System & Sensor Adversity (RTSP Mode)

| Option | Req | Choices | Default ★ | Help Text |
|---|---|---|---|---|
| **Camera Feed Dropout** | | None ★, Brief (5s loss), Extended (30s loss), Intermittent (random) | **None** | Simulates RTSP stream disconnection. System falls back to last-known vehicle counts for up to 10s, then switches to SUMO-only mode. Tests graceful degradation of the vision pipeline. |
| **Camera Obstruction** | | None ★, Partial (50% frame blocked), Full (100% blocked) | **None** | Simulates physical obstruction of the camera (bird, banner, vandalism). Partial obstruction reduces detected vehicle count, introducing systematic undercount into the RL state. |
| **False Detection Injection** | | None ★, 5% phantom vehicles, 15% phantom vehicles | **None** | Injects fake vehicle detections into the YOLOv8 output to simulate model errors. Tests whether RL is robust to noisy observations — phantom vehicles inflate queue counts, causing over-long green phases. |
| **GPS / Timestamp Drift** | | None ★, Minor (±200ms), Major (±2s) | **None** | Adds timing error to the RTSP frame timestamps. Causes vehicle position extrapolation errors in ByteTrack. Major drift can cause track ID swaps — same vehicle appears as two different vehicles. |

---

#### 5I-6. Preset Library — Full Auto-Populate Specification

The **Load Preset** dropdown is the primary entry point for the config panel. Selecting a preset instantly fills every field in sections 5A–5I. Users can then fine-tune individual fields after loading. A "Modified" badge appears if any field differs from the loaded preset.

**UI behaviour:**
- Dropdown grouped by category (Hyderabad Time-of-Day / Hyderabad Location / Hyderabad Seasonal / Hyderabad Special Events / Adverse / Generic / Research)
- Each option shows a one-line description below its name in the dropdown
- Selecting a preset triggers a smooth field-fill animation (values count up/fade in)
- "Reset to Preset" button restores all fields to the last-loaded preset if user has modified fields
- Default on first load: **Hyderabad Rush Hour (Morning)**

---

##### GROUP A — Hyderabad Time-of-Day

| Preset | Vol | Vehicle Mix | Pattern | Phase | Cycle | Speed | Violations | Adverse | Description |
|---|---|---|---|---|---|---|---|---|---|
| **Hyderabad Rush Hour (Morning)** ★ | 900 vph | 45/30/12/8/5 | Morning peak 8–10 AM | 5-phase | 120s | High ±30% | None | None | HITEC City / Gachibowli peak. Worst congestion window. RL savings most visible here. |
| **Hyderabad Rush Hour (Evening)** | 950 vph | 45/30/12/8/5 | Evening peak 6–9 PM | 5-phase | 120s | High ±30% | Signal jump 10% | None | Higher than morning due to staggered office exit. Two-wheeler density peaks. |
| **Hyderabad Normal Hour** | 500 vph | 40/35/10/10/5 | Uniform | 4-phase | 90s | Low ±10% | None | None | Mid-day stable flow (11 AM–5 PM). Baseline reference for comparing peak savings. |
| **Hyderabad Off-Peak Evening** | 350 vph | 42/33/10/10/5 | Uniform | 4-phase | 90s | Low ±10% | None | None | Post-dinner lull (9–11 PM). Light traffic, RL cycle shortening is the dominant gain. |
| **Hyderabad Night Hour** | 150 vph | 30/45/5/5/15 | Uniform | 2-phase | 60s | Medium ±20% | Red-light run 15% | Night conditions | Midnight–4 AM. Cars and trucks dominate. High red-light running. RL extends green for sparse but fast arrivals. |
| **Hyderabad Late Night** | 80 vph | 25/50/5/5/15 | Uniform | 2-phase | 60s | Medium ±20% | Red-light run 20%, wrong-way rare | Night + comm lag 100ms | 1–5 AM. Very sparse flow. Tests whether RL shortens cycle aggressively to avoid unnecessary waiting. |
| **Hyderabad Early Morning** | 300 vph | 38/32/10/10/10 | Ramp-up (5–8 AM) | 4-phase | 90s | Low ±10% | None | None | Pre-peak ramp. Volume climbs steadily. RL must anticipate surge rather than react to it. |
| **Hyderabad Weekend Daytime** | 600 vph | 35/40/8/12/5 | Uniform + midday surge | 4-phase | 90s | Medium ±15% | None | None | Saturday/Sunday 10 AM–6 PM. More cars, fewer two-wheelers. Shopping mall and restaurant traffic. |
| **Hyderabad Weekend Night** | 400 vph | 28/48/5/8/11 | Evening surge 7–10 PM | 4-phase | 90s | High ±25% | Red-light run 12% | Night conditions | Weekend late evening — restaurants, events, pubs. Higher car mix, elevated violations. |

---

##### GROUP B — Hyderabad Location-Specific

Each location preset uses real traffic characteristics of that corridor.

| Preset | Vol | Vehicle Mix | Pattern | Phase | Cycle | Unique Config | Description |
|---|---|---|---|---|---|---|---|
| **HITEC City Tech Corridor** | 1000 vph | 35/45/8/7/5 | Morning + evening bidirectional | 5-phase | 120s | U-turn enabled, 3 lanes, sublane model | Office IT hub. Heavy car and cab traffic. Bidirectional surge — outbound = morning, inbound = evening. |
| **Mehdipatnam Junction** | 950 vph | 50/20/15/10/5 | Uniform high | 5-phase | 120s | Bus lanes enabled, heavy autos, pedestrian crossings all arms | Major bus terminus. Highest auto-rickshaw density in Hyderabad. Pedestrian spillover onto carriageway. |
| **Secunderabad Railway Station** | 800 vph | 30/25/20/15/10 | Surge on train arrival (every 20 min) | 5-phase | 120s | Arrival surge event every 1200s sim-time, heavy pedestrian conflict | Train arrival surges every ~20 min create burst demand. RL must handle periodic high-intensity spikes. |
| **Jubilee Hills / Banjara Hills** | 600 vph | 20/60/5/10/5 | Evening peak | 4-phase | 90s | High car mix, low two-wheelers, speed variance low | Affluent residential. High proportion of private cars. Lower two-wheeler chaos. Wider lanes (3 per arm). |
| **Old City / Charminar** | 750 vph | 60/15/15/8/2 | Uniform high all day | 5-phase + U-turn | 120s | Very high two-wheelers, pedestrian at all arms, narrow lanes (1-2), illegal parking 2 vehicles | Dense heritage area. Extremely high two-wheeler and pedestrian density. Narrow carriageway. Parking encroachment permanent. |
| **Kukatpally Housing Board (KPHB)** | 700 vph | 48/28/12/8/4 | Morning + evening residential peak | 4-phase | 90s | Residential pattern: outbound AM, inbound PM | Major residential colony. School traffic in AM (8–9 AM adds pedestrian phase). |
| **ECIL / Nacharam Industrial** | 850 vph | 30/25/10/10/25 | Shift-change surge (7 AM, 3 PM, 11 PM) | 4-phase | 90s | Heavy trucks 25%, 3 shift-change surges per episode | Industrial area. High truck proportion. Predictable shift-change demand spikes RL can learn to anticipate. |
| **Ameerpet Metro Junction** | 900 vph | 45/30/12/8/5 | All-day high, pedestrian surge every 15 min | 5-phase | 120s | Metro exit pedestrian surge every 900s sim-time, high pedestrian conflict | Near Ameerpet metro. Pedestrian surge every ~15 min as metro trains arrive. RL must manage pedestrian phases dynamically. |
| **Uppal / LB Nagar (ORR Entry)** | 1100 vph | 35/40/8/7/10 | Morning inbound, evening outbound | 5-phase | 120s | Outer ring road entry — high truck %, bidirectional peak | ORR feeder junction. Mix of inter-city trucks and city commuters. Longest queues in city during AM peak. |
| **Tolichowki / Masab Tank** | 700 vph | 52/25/12/8/3 | Morning peak strong | 5-phase | 120s | High two-wheelers, frequent U-turns, sublane model | Dense residential-commercial mix in South Hyderabad. Very high U-turn rate — U-turn phase is critical here. |

---

##### GROUP C — Hyderabad Seasonal

| Preset | Vol | Pattern | Weather | Road | Adverse Extras | Description |
|---|---|---|---|---|---|---|
| **Monsoon (June–September)** | 700 vph (−22% vs normal) | Morning peak | Heavy rain −30% speed | Waterlogging minor 2 arms, pothole one lane | Camera dropout intermittent (RTSP), dust none | Typical June–September conditions. Volume drops slightly as people delay trips. Queue times worsen despite lower volume due to speed reduction. |
| **Monsoon Flash Flood Event** | 500 vph (−44%) | Random surge then crash | Heavy rain | Waterlogging severe one arm (full closure), pothole 2 lanes | Camera obstruction partial | Extreme monsoon — one arm flooded. RL must operate on 3 arms only. Volume collapses as drivers avoid the area. |
| **Summer Heat (April–May)** | 850 vph | Morning peak early (7–9 AM, people travel early to beat heat) | Clear, speed variance very high ±40% | None | Dust storm occasional | Pre-monsoon heat. People travel earlier. High speed variance — some drivers very aggressive in AC cars, slow autos struggling in heat. |
| **Winter Fog (December–January)** | 600 vph | Uniform | Fog −30% speed, visibility 50m | None | Night conditions (morning fog is effectively low-light), comm lag 200ms | Hyderabad winter fog (rare but impactful when it occurs). Speed dramatically reduced. Camera detection confidence drops −25% in RTSP mode. |
| **Dust Storm (Pre-Monsoon)** | 650 vph | Afternoon | Dust severe −40% speed, detection loss 30% | None | Camera obstruction partial | Severe dust events occur in April–May. Dramatically reduces detection confidence and vehicle speeds. Tests RTSP pipeline robustness. |

---

##### GROUP D — Hyderabad Special Events

| Preset | Vol | Pattern | Adverse | Unique Config | Description |
|---|---|---|---|---|---|
| **Ganesh Chaturthi Procession** | 1200 vph + periodic road closure | Surge pattern: 2× volume spikes every 10 min | Mass event festival, illegal parking 2 vehicles, pedestrian conflict high | One arm closes for 3 min every 600s sim-time for procession | 10-day festival peak. Processions periodically block one road arm. RL must reroute demand and extend phases on clear arms. |
| **Cricket Match at Uppal Stadium** | 1100 vph (pre/post match surge) | Pre-match surge 2h before, post-match evacuation spike | Mass event sports, aggressive weaving high | 3× volume on Uppal arms for 30-min window | IPL/international matches create extreme localised demand spike on stadium approach roads. |
| **Bonalu Festival (Old City)** | 900 vph + procession | All-day high with hourly procession | Mass event festival, pedestrian conflict very high | Old City location preset + procession every 900s | Major Telangana Hindu festival. Old City area. Extreme pedestrian density and procession road closures. |
| **New Year's Eve (Late Night)** | 700 vph (late night, high cars) | Evening surge from 9 PM, post-midnight chaos | Night conditions, red-light run 25%, signal jump 20%, drunk-driver model | High car mix, low visibility, comm lag 500ms | Jubilee Hills / Banjara Hills area. High violation rate post-midnight. Tests RL under combined night + high violation + communication degradation. |
| **Independence Day Parade** | 400 vph (roads partially closed) | Morning only (7–10 AM), one arm fully blocked | VIP convoy enabled, signal preemption, mass event | N-S arm permanently closed (parade route), reduced to 3-arm operation | Parade along Tank Bund. One full arm closed to traffic. RL operates on reduced intersection geometry. |
| **Eid / Diwali Bazaar** | 1000 vph | All-day high, evening peak 1.5× | Pedestrian conflict high, illegal parking 2 vehicles | Very high pedestrian phase demand, narrow lanes (Old City preset) | Major shopping festivals. Pedestrians dominate. RL must allocate longer pedestrian phases without crushing vehicle throughput. |
| **IT Company Cab Surge** | 950 vph | Late night 11 PM – 1 AM (IT shift end) | Night + aggressive weaving | Very high car/cab mix 75%, low two-wheelers | HITEC City / Gachibowli. Night shift end cab surge — all white/grey cabs. Unique demand profile RL can learn to optimise for. |

---

##### GROUP E — Adverse & Stress Presets

| Preset | Config Summary | Purpose |
|---|---|---|
| **Hyderabad Worst-Case Peak** | 950 vph, morning peak, red-light 8%, signal jump 20%, waterlogging minor, high variance | Simulates HITEC City Friday 6 PM — absolute worst observed conditions |
| **Monsoon Crisis** | Heavy rain, flash flood one arm, pothole 2 lanes, dust moderate, camera dropout intermittent | Full monsoon resilience test — all weather systems active |
| **System Failure Demo** | Signal blackout at episode 50%, 60s recovery, sensor dropout, comm lag 500ms | **Live client demo preset** — trigger failure, watch RL recover in real time |
| **Accident Chain** | Collision probability 10%, rear-end enabled, pedestrian conflict medium, preemption enabled | Cascading incident response — RL must manage multiple simultaneous disruptions |
| **VIP + Festival Surge** | VIP convoy, mass event festival, illegal parking 2, aggressive weaving high | Worst-case special event scenario — all social disruptions combined |
| **Maximum Stress / Burndown** | 1200 vph, all violations high, all hazards, signal failure random, 1000 episodes | Ultimate robustness test — everything failing simultaneously |

---

##### GROUP F — Generic / International Reference

| Preset | Config Summary | Purpose |
|---|---|---|
| **Generic Urban (Western)** | 500 vph, car 80% truck 15% bike 5%, Krauss, LC2013, low variance, 4-phase, 90s, clear | Western city reference. Compare RL gains vs Hyderabad gains. |
| **Western Highway Ramp** | 1200 vph, 2-phase, high speed, IDM, cars 90%, uniform | High-speed on-ramp metering scenario. |
| **Generic Stress Test** | 1200 vph, max speed, 1000 episodes, all incidents, no adverse visual | Maximum throughput benchmark — no Hyderabad-specific constraints. |

---

##### GROUP G — Research & Academic Benchmarks

| Preset | Config Summary | Purpose |
|---|---|---|
| **Minimal Baseline (Clean)** | 400 vph, cars only, Krauss, 4-phase, fixed 90s baseline, no adverse, seed 42 | Cleanest possible comparison — eliminates all confounding variables. For academic papers. |
| **SUMO Traffic Light Benchmark** | 600 vph, standard SUMO defaults, 2-phase, Krauss, seed 0 | Replicates standard SUMO traffic light benchmark from literature for RL comparison papers. |
| **High Noise Robustness Test** | 600 vph, Poisson arrivals, high variance, false detection 15%, comm lag random, seed random | Tests how much RL degrades under observation noise — academic robustness evaluation. |
| **Multi-Episode Convergence Study** | 500 vph, mixed, 5000 episodes, log trajectories on, export all formats | Long training run for convergence analysis. All data logging enabled. |

---

## 6. Dashboard UI Sections

### A. Live Simulation Canvas (top, full width)
- HTML5 Canvas, 800×400px, dark background
- Road network drawn as gray lanes with white markings
- Vehicles: colored rectangles by type — blue=car, red=truck, yellow=two-wheeler, orange=auto-rickshaw, white=bus; move smoothly between positions at 10fps
- Traffic lights: colored circles at intersection arms (red/amber/green); flashing amber when signal failure active
- Queue depth: semi-transparent red overlay behind waiting vehicles, intensity scales with queue length
- Socket.IO update: 100ms interval (~10fps)
- Mode badge: "SIMULATION" or "LIVE FEED" top-right corner
- **Adverse scenario visual indicators** (shown when active):
  - Collision event: flashing orange X marker at collision point, lane turns red for blockage duration
  - Red-light runner: vehicle highlighted with blinking red outline as it crosses
  - Wrong-way vehicle: white vehicle with flashing hazard outline moving against traffic
  - Signal failure: traffic light icons replaced with flashing amber circles; "SIGNAL FAILURE" red banner
  - Waterlogging: blue wave overlay on affected lane arm
  - Construction zone: orange cone icons + yellow diagonal stripes on closed lane
  - VIP convoy: blue flashing light on convoy vehicles; "VIP MODE" badge
  - Camera dropout (RTSP): canvas dims to 40% opacity with "FEED LOST — using last known state" overlay
  - Collision recovery: green "LANE CLEARED" flash animation when blockage ends
- **"Adverse Mode" warning badge**: amber pill top-left showing count of active adverse scenarios (e.g. "⚠ 3 adverse scenarios active")

### B. Canvas Modes (toggle top-right of canvas area)

**Mode 1 — Single Canvas (default during training)**
- Full-width canvas showing the RL agent running live
- Adverse event overlays, signal states, vehicle movement at 10fps

**Mode 2 — Split-Screen Live Comparison (the client wow moment)**
- Left half: **Baseline controller** (fixed-time / Webster's) — label "FIXED TIMING"
- Right half: **RL agent** — label "AI OPTIMISED"
- Both run the **same traffic demand simultaneously** — identical vehicle arrivals, same random seed, pure signal strategy difference
- Queue depth overlay makes the difference unmistakable: left side red builds up, right side clears faster
- A thin centre divider shows **live delta**: "RL saving 18s/vehicle right now"
- Toggle button: "⊞ Split View" — activates Mode 2; "⊡ Single View" returns to Mode 1

**Mode 3 — Session Replay**
- Scrub through a completed episode like a video timeline
- Play/pause/speed controls (1×, 5×, 30×)
- Frame-by-frame stepping for post-analysis
- "Best Episode" button jumps to the highest-reward episode recording

---

### C. KPI Cards (4 standard + 2 adverse + 1 economic impact)
Each card: current value, delta vs baseline (green/red arrow), sparkline trend. Count-up animation from 0 on session start.

**Standard KPIs:**
1. **Signal Efficiency** — green utilization % (+X% vs fixed baseline)
2. **Avg Wait Time** — seconds/vehicle (−Xs saved vs baseline)
3. **Fuel Saved** — L/vehicle/hr (idle time model, Hyderabad ₹106/L reference)
4. **CO2 Avoided** — kg/hr

**Adverse KPIs** (amber cards, shown when adverse scenarios active):
5. **Collision Events** — count this session; "RL reduced by X% vs no-signal control"
6. **Violation Rate** — red-light runs + jumps per 100 vehicles

**Economic Impact Card** (always shown, expands on click):
7. **₹ Saved / Hour** — economic value of wait-time reduction at this intersection
   - Compact: "₹ 1,840/hr saved"
   - Expanded: breakdown by vehicle type, plus **city-wide projection slider**

---

### D. Economic Impact Projector (expands from card 7)
The most persuasive panel for municipal decision-makers.

- **This intersection**: ₹X/hr, ₹Y/day, ₹Z/year
- **City-wide slider**: "If deployed at N of Hyderabad's 1,200 GHMC intersections"
  - Slider: 1 → 1,200 intersections
  - Live update: Total ₹/year saved, Total CO2 avoided (tonnes/year), Total vehicle-hours saved/day
  - Reference line: "At 500 intersections = ₹43 crore/year savings"
- **Carbon credit value**: CO2 tonnes × ₹2,000/tonne (India carbon credit price)
- Vehicle type breakdown: cars vs two-wheelers vs trucks — who benefits most

---

### E. Agent Explainability Panel (XAI)
Builds client trust by making the RL agent transparent and auditable.

**State Visualiser** (live, updates each action):
- Horizontal bar chart: one bar per state dimension (queue, wait, flow per lane)
- Bars colour-coded: green=low, amber=medium, red=high
- Highest bar highlighted — the dominant signal driving the current decision

**Decision Reason Card** (natural language, auto-generated):
```
"Extended NORTH GREEN by 25s
 → North queue: 31 vehicles (highest arm, 3.2× average)
 → North wait: 52s avg (approaching GHMC 60s threshold)
 → Flow rate: 18 vehicles/min incoming (surge detected)
 → Time: 08:47 AM (morning peak — prioritising dominant arm)"
```

**Feature Importance Chart** (updates every 10 episodes):
- Bar chart: which state features most influenced policy decisions this episode
- Helps engineers understand what the agent learned to pay attention to

**Action History Timeline** (last 10 actions):
- Compact list: phase chosen, duration, reward received
- Colour by reward: red (below baseline), green (above baseline)

---

### F. RL Training Progress
- Recharts LineChart: episode reward over time (smooth line + dots at milestones)
- Horizontal dashed line: baseline reward level
- **Milestone annotations**:
  - "Beats baseline" — vertical green marker at first episode RL exceeds fixed-timing
  - "Convergence detected" — vertical blue marker when reward stabilises (variance < 5% over 50 eps)
  - "Best episode" — star marker at highest-reward episode
- Below chart: current episode, timestep, estimated time remaining, training status badge
- **ConvergenceIndicator**: circular progress "Training 78% converged" — estimated from reward variance trend
- **Live Insight Cards** (scrolling feed, right of chart):
  - 🤖 *"Agent learned: extend North green when queue > 20 — wait time −12s"*
  - 🏆 *"New best episode! Reward +18% vs baseline (episode 234)"*
  - 📈 *"Convergence detected — training 94% complete, 30 episodes remaining"*
  - ⚡ *"Peak hour pattern recognised — agent now pre-emptively extends main road green"*
  - 🎯 *"Transfer learning boost: +23% faster convergence vs training from scratch"*

---

### G. Before vs After Comparison Chart
- Recharts grouped BarChart, per-lane: Avg queue length + Avg wait time
- Baseline bars (grey) alongside RL bars (green) for each lane arm
- Delta label above each pair: "−34%" or "+8%"
- Metric toggle: Queue Length / Wait Time / Throughput / Fuel / CO2
- Updates every 10 episodes; animates on each update
- "Freeze snapshot" button captures current comparison for report export

---

### H. Phase Timeline (Gantt)
- Horizontal Gantt: last 60s of signal phases
- Two rows: BASELINE (top, grey tones) and RL (bottom, colour-coded per phase)
- Phase width = duration in seconds — visual difference is immediately obvious
- Hover on any phase block: tooltip showing phase name, duration, vehicles cleared, reward received

---

### I. Quick Demo Button
Single-click showcase designed for client presentations. No configuration required.

- Prominent button in header: **"▶ Quick Demo — Hyderabad Rush Hour"**
- Automatically: loads preset → starts simulation → runs 100 fast training episodes (Max speed) → switches to Split-Screen mode → animates KPI cards from 0 → ends on best-episode replay
- Total runtime: ~90 seconds
- On completion: "Demo complete — RL achieved 28% wait time reduction. Click Export Report."
- Can be interrupted at any time; resumes normal config mode on close

---

### J. Session Comparison View (separate page: `/compare`)
- Run two different configs and compare every metric side-by-side
- Left column: Session A config summary + all KPIs
- Right column: Session B config summary + all KPIs
- Delta column: green/red arrows for every metric
- "Load vs Current" button: compare a saved historical session against the current one
- Export comparison as PDF table

---

### K. Auto-Generated Pilot Report (`/report`)
One-click export after training. Formatted for GHMC / government submission.

**Sections auto-populated:**
1. **Executive Summary** — 3-bullet impact statement with headline numbers
2. **Methodology** — intersection details, RL algorithm, training config, baseline type
3. **Results** — before/after metrics table with percentage improvements per KPI
4. **Charts** — embedded: reward curve, before/after bars, phase timeline comparison
5. **City-Wide Projection** — impact at 100 / 500 / 1,200 intersections
6. **Recommendations** — auto-generated: suggested phase scheme, optimal cycle length, flagged bottleneck lanes
7. **Technical Appendix** — state space, reward function, hyperparameters

**Export formats:** PDF (WeasyPrint), HTML (shareable link), JSON (raw data)

---

### L. Sim Config Panel (sidebar/drawer)
- Opens with **Hyderabad Rush Hour preset** loaded — all required fields pre-filled, Start enabled immediately
- 🔴 Required fields: red left border + red asterisk label (`* Required`) when empty; turns green on valid input
- **Start button**: grey + disabled (tooltip: "Fill required fields") until all 🔴 fields valid; pulses green when ready
- Inline validation: RTSP URL checked on blur (format + optional network ping); numeric fields reject out-of-range immediately
- Collapsible accordion sections matching Section 5 groups (A–I)
- Every option row has a `ⓘ` icon; hover shows dark popover (300ms delay) with full help text from Section 5
- Incompatible options greyed out with tooltip explaining why
- "Default" pill badge next to each optimal value
- **Transfer Learning indicator**: if a pre-trained model exists for the loaded preset, shows "⚡ Pre-trained model available — ~50 episodes to convergence"
- Start / Pause / Stop / Reset buttons pinned to panel bottom
- "Apply & Restart" prompt if settings change mid-session
- Export: JSON / CSV / SUMO XML / PDF Report
- **"Load Preset" dropdown** — grouped, 30+ presets (full spec in Section 5I-6):
  - 🕐 Hyderabad Time-of-Day (9) · 📍 Location (10) · 🌧 Seasonal (5) · 🎉 Special Events (7)
  - ⚠ Adverse & Stress (6) · 🌍 Generic/International (3) · 🔬 Research/Academic (4)
- Preset selection: smooth 200ms field-fill animation
- **"Modified" badge** on any field differing from loaded preset
- **"Reset to Preset"** button in footer

---

### M. Sim Config Panel (sidebar/drawer)
- Opens with **Hyderabad Rush Hour preset** loaded — all required fields pre-filled, Start enabled immediately
- 🔴 Required fields: red left border + red asterisk label (`* Required`) when empty; border turns green on valid input
- **Start button**: disabled (grey, tooltip "Fill required fields") until all 🔴 fields are valid; turns green when ready
- Inline validation: RTSP URL validated on blur (format check + optional ping); numeric fields reject out-of-range values immediately
- Collapsible accordion sections matching Section 5 groups (A–H)
- Every option row has a `ⓘ` icon on the right; hovering/clicking shows a popover with the help text from Section 5
- Help popover: dark tooltip, max 200px wide, 300ms delay on hover (not on click on mobile)
- Options that are incompatible with current state are shown greyed out with a tooltip explaining why (e.g. "OSM Coordinates — only available when Network Source = OpenStreetMap")
- Default badge: a subtle "Default" pill shown next to the currently-optimal value
- Start / Pause / Stop / Reset buttons pinned to the bottom of the panel
- "Apply & Restart" prompt appears if settings change mid-session
- Export results as JSON / CSV / SUMO XML buttons
- **"Load Preset" dropdown** — grouped by category, 30+ presets total (full spec in Section 5I-6):
  - 🕐 **Hyderabad Time-of-Day** (9 presets): Rush Hour Morning ★, Rush Hour Evening, Normal Hour, Off-Peak Evening, Night Hour, Late Night, Early Morning, Weekend Daytime, Weekend Night
  - 📍 **Hyderabad Location** (10 presets): HITEC City, Mehdipatnam, Secunderabad Railway, Jubilee Hills, Old City Charminar, KPHB, ECIL Industrial, Ameerpet Metro, Uppal ORR, Tolichowki
  - 🌧 **Hyderabad Seasonal** (5 presets): Monsoon, Monsoon Flash Flood, Summer Heat, Winter Fog, Dust Storm
  - 🎉 **Hyderabad Special Events** (7 presets): Ganesh Chaturthi, Cricket Match, Bonalu, New Year's Eve, Independence Day, Eid/Diwali Bazaar, IT Cab Surge
  - ⚠ **Adverse & Stress** (6 presets): Worst-Case Peak, Monsoon Crisis, System Failure Demo, Accident Chain, VIP+Festival, Maximum Stress
  - 🌍 **Generic / International** (3 presets): Generic Urban Western, Highway Ramp, Generic Stress Test
  - 🔬 **Research & Academic** (4 presets): Minimal Baseline, SUMO Benchmark, Noise Robustness, Convergence Study
- Selecting a preset: all fields animate to their new values (200ms fade transition)
- **"Modified" badge** appears on any field that differs from the loaded preset
- **"Reset to Preset"** button in panel footer restores all fields instantly

---

## 7. Metrics Calculation

```python
# ── Core traffic metrics ─────────────────────────────────────────────────────

baseline_wait = fixed_time_controller.avg_wait_per_vehicle()   # seconds
rl_wait       = rl_controller.avg_wait_per_vehicle()
wait_saved_sec = baseline_wait - rl_wait                        # seconds saved

throughput_improvement = (rl_throughput - baseline_throughput) / baseline_throughput

green_util = vehicles_crossed_during_green / (green_duration * capacity_per_second)

# ── Environmental metrics ─────────────────────────────────────────────────────

# Idle fuel consumption by vehicle type (Hyderabad reference, L/hr)
IDLE_RATE = {
    'car': 0.80, 'two_wheeler': 0.35, 'ev_scooter': 0.00,
    'auto_rickshaw': 0.55, 'e_rickshaw': 0.00, 'cab': 0.85,
    'delivery_bike': 0.38, 'tsrtc_bus': 1.80, 'school_bus': 1.60,
    'truck': 2.10, 'tempo': 0.90
}

fuel_saved_L = sum(
    wait_saved_sec / 3600 * IDLE_RATE[vtype] * count
    for vtype, count in vehicle_counts.items()
)

# CO2 by fuel type (petrol: 2.31 kg/L, diesel: 2.68 kg/L, EV: 0)
co2_avoided_kg = fuel_saved_petrol * 2.31 + fuel_saved_diesel * 2.68

# ── Economic metrics (Hyderabad reference) ───────────────────────────────────

PETROL_PRICE_PER_L = 106.0      # ₹/L Hyderabad 2026
DIESEL_PRICE_PER_L = 93.0       # ₹/L
AVG_WAGE_PER_HR = {             # ₹/hr by segment
    'professional': 400,
    'blue_collar': 200,
    'auto_driver': 150,
    'weighted_avg': 250
}
CARBON_CREDIT_PRICE = 2000.0    # ₹/tonne CO2 (India carbon market)

fuel_cost_saved = fuel_saved_petrol * PETROL_PRICE_PER_L \
                + fuel_saved_diesel * DIESEL_PRICE_PER_L

vehicle_hours_saved = wait_saved_sec * total_vehicles_per_hour / 3600

time_value_saved = vehicle_hours_saved * AVG_WAGE_PER_HR['weighted_avg']

carbon_credit_value = (co2_avoided_kg / 1000) * CARBON_CREDIT_PRICE

total_economic_value_per_hour = fuel_cost_saved + time_value_saved + carbon_credit_value

# ── City-wide projection (Economic Projector slider) ─────────────────────────

def city_wide_projection(n_intersections: int, peak_hours_per_day: int = 16):
    annual_saving = (
        total_economic_value_per_hour
        * peak_hours_per_day
        * 300          # working days/year
        * n_intersections
    )
    annual_co2_tonnes = co2_avoided_kg / 1000 * peak_hours_per_day * 300 * n_intersections
    return {
        'annual_rupees': annual_saving,
        'annual_co2_tonnes': annual_co2_tonnes,
        'vehicle_hours_saved_per_day': vehicle_hours_saved * peak_hours_per_day * n_intersections,
        'crore_rupees': annual_saving / 1e7
    }
# At 500 intersections → ~₹43 crore/year, ~12,400 tonnes CO2/year avoided

# ── Adverse scenario metrics ─────────────────────────────────────────────────

collision_reduction_pct = (baseline_collisions - rl_collisions) / baseline_collisions * 100
violation_rate = (red_light_runs + signal_jumps) / total_vehicles * 100
conflict_exposure_reduction = (baseline_conflicts - rl_conflicts) / baseline_conflicts * 100
```

---

## 8. API Contracts

### REST
| Method | Path | Description |
|---|---|---|
| GET | `/api/config` | Get current sim config |
| POST | `/api/config` | Update sim config |
| GET | `/api/presets` | List all presets with metadata |
| GET | `/api/presets/:id` | Get full config for a preset |
| POST | `/api/simulation/start` | Start sim + training |
| POST | `/api/simulation/stop` | Stop gracefully |
| POST | `/api/simulation/reset` | Reset to defaults |
| POST | `/api/simulation/quick-demo` | Start auto-showcase sequence |
| GET | `/api/results/latest` | Latest session metrics + economic calcs |
| GET | `/api/results/sessions` | List all past sessions |
| GET | `/api/results/compare?a=id&b=id` | Side-by-side session comparison |
| GET | `/api/results/export?format=json\|csv\|xml` | Download results |
| GET | `/api/report/generate` | Generate pilot report (returns HTML/PDF) |
| POST | `/api/feed/connect` | Connect RTSP stream |
| GET | `/api/feed/status` | RTSP connection health |
| GET | `/api/models/zoo` | List pre-trained models available |
| POST | `/api/models/load/:name` | Load model for transfer learning |
| GET | `/api/explainer/state` | Current agent state + feature importance |
| GET | `/api/explainer/reason` | Latest natural-language decision reason |
| POST | `/api/adverse/trigger/:event` | Manually trigger an adverse event (demo use) |
| GET | `/api/projection?n=500` | City-wide economic projection for N intersections |

### Socket.IO Events (server → client)
| Event | Payload | Rate |
|---|---|---|
| `sim:frame` | `{vehicles:[...], signals:[...], step, baseline_vehicles:[...]}` | 100ms |
| `sim:frame_baseline` | `{vehicles:[...], signals:[...], step}` — split-screen only | 100ms |
| `rl:episode` | `{episode, reward, baseline_reward, phase_durations, convergence_pct}` | per episode |
| `rl:insight` | `{icon, message, episode}` — live insight card | on milestone |
| `rl:decision` | `{phase, duration, reason, state_values, feature_importance}` | per action |
| `metrics:update` | `{wait, fuel, co2, efficiency, economic_per_hr, collision_count, violation_rate}` | 1s |
| `training:beat_baseline` | `{episode, improvement_pct}` — first time RL wins | once |
| `training:converged` | `{episode, final_reward}` | once |
| `training:complete` | `{best_reward, best_episode, total_episodes, model_path}` | once |
| `adverse:event` | `{type, location, severity, duration}` — new adverse event triggered | on event |
| `feed:status` | `{connected, fps, vehicle_count, detection_confidence}` | 2s |
| `demo:step` | `{step, total_steps, message}` — quick demo progress | during demo |

---

## 9. Tech Stack (pinned versions)

| Layer | Package | Version | Purpose |
|---|---|---|---|
| **Python** | python | 3.11 | Runtime |
| **Web server** | flask + flask-socketio | 3.0 + 5.3 | REST API + real-time events |
| **ORM** | sqlalchemy | 2.0 | SQLite session storage |
| **RL** | stable-baselines3 | 2.3 | PPO / A2C / DQN agents |
| **RL env** | gymnasium | 0.29 | Custom traffic Gym environment |
| **Simulation** | SUMO | 1.18 | Traffic microsimulation |
| **TraCI** | traci (bundled with SUMO) | 1.18 | Python ↔ SUMO control |
| **Vision** | ultralytics (YOLOv8) | 8.2 | Vehicle detection |
| **Tracking** | supervision (ByteTrack) | 0.21 | Multi-object tracking |
| **CV** | opencv-python | 4.9 | Frame processing, perspective transform |
| **Map import** | osmnx | 1.9 | OpenStreetMap → SUMO network |
| **XAI** | shap | 0.45 | Feature importance for explainability panel |
| **Report** | weasyprint | 61.0 | PDF pilot report generation |
| **Frontend** | react + typescript | 18 + 5.4 | UI |
| **Styling** | tailwindcss | 3.4 | Utility CSS |
| **Charts** | recharts | 2.12 | All data visualisations |
| **State** | zustand | 4.5 | Global state management |
| **WS client** | socket.io-client | 4.7 | Real-time backend connection |
| **Animation** | framer-motion | 11.0 | KPI count-up, card transitions, canvas fade |
| **PDF export** | react-pdf | 3.4 | In-browser PDF report preview |

---

## 10. Success Criteria (MVP)

**Core Simulation**
- [ ] SUMO runs headless, streams vehicle positions at ≥10fps via Socket.IO
- [ ] All 10 Hyderabad vehicle types rendered with distinct colours and sizes on canvas
- [ ] Adverse events (collision, signal failure, waterlogging) visually represented on canvas in real time
- [ ] Split-screen mode runs baseline and RL agent simultaneously on same traffic demand

**RL Training**
- [ ] PPO agent trains in <10 minutes on CPU for 500 episodes (22-dim state)
- [ ] RL demonstrates ≥15% wait time reduction vs fixed-time baseline on Hyderabad Rush Hour preset
- [ ] Convergence detection triggers correctly (reward variance < 5% over 50 episodes)
- [ ] Transfer learning: fine-tune in ≤50 episodes from a pre-trained model
- [ ] All 3 reward function variants (min wait / max throughput / balanced) produce distinct agent behaviours

**Dashboard**
- [ ] All 6 KPI cards animate from 0 and update live during training
- [ ] Agent explainability panel: state bar chart + natural language reason updates every action
- [ ] Live insight cards fire on milestone events (beats baseline, convergence, best episode)
- [ ] Economic projector slider calculates city-wide ₹ impact correctly for any N intersections
- [ ] Quick Demo button completes full showcase in ≤90 seconds without any configuration
- [ ] Session comparison page shows KPI diff between any two saved sessions

**Configuration**
- [ ] All 30+ presets auto-populate every field on selection with 200ms animation
- [ ] Red required fields block Start button; turn green on valid input
- [ ] ⓘ help popover appears on every config row with correct help text
- [ ] "Modified" badge appears correctly when any field differs from loaded preset
- [ ] Incompatible fields grey out with explanatory tooltip

**Export & Reporting**
- [ ] Auto-generated Pilot Report PDF contains all 7 sections with real data
- [ ] JSON / CSV / SUMO XML export all work correctly
- [ ] City-wide projection numbers are mathematically correct vs manual calculation

**Vision (RTSP)**
- [ ] RTSP mode connects and maps detected vehicles to SUMO lane demand
- [ ] All 7 RTSP config options (confidence, frame rate, etc.) affect pipeline behaviour
- [ ] Camera dropout triggers graceful fallback to last-known vehicle counts

---

## 11. Out of Scope (MVP)

- Multi-intersection coordination (separate future module)
- Cloud deployment / Kubernetes
- Real-time map tile rendering (OSMnx for network import only — no live tiles)
- Mobile responsive layout
- User authentication / multi-user sessions
- Live deployment to physical traffic controllers (SCATS/SCOOT integration)
