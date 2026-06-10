# Traffic Signal Optimizer

AI-powered adaptive traffic signal control using Reinforcement Learning (PPO), SUMO microsimulation, and a live React dashboard — calibrated for Hyderabad, India (GHMC).

---

## Features

| Feature | Detail |
|---------|--------|
| **SUMO Microsimulation** | Real intersection layouts via TraCI; 10 Hyderabad vehicle types |
| **PPO RL Agent** | 22-dim state · Discrete(35) action space · Stable-Baselines3 |
| **Live Canvas** | 60fps vehicle movement, split-screen baseline vs RL comparison |
| **XAI Panel** | SHAP feature importance + natural-language decision explanations |
| **Economic Impact** | Fuel (Rs 106/L), CO2, time-value savings; 650-intersection city projection |
| **30+ Presets** | Time-of-day, location, seasonal, events, adverse scenarios |
| **Adverse Scenarios** | Collision risk, signal failure, waterlogging, VIP convoy, sensor noise |
| **PDF Pilot Report** | Auto-generated 7-section report (WeasyPrint) |
| **RTSP Camera Mode** | YOLOv8n + ByteTrack for live vehicle counting from CCTV feeds |

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| SUMO | 1.18+ (`SUMO_HOME` env var set) |

### Install

```bash
# Clone / open project
cd Project_T

# Backend dependencies
pip install -r backend/requirements.txt

# Frontend dependencies
cd frontend && npm install && cd ..
```

### Run

```bash
python run.py
```

- **Dashboard:** http://localhost:5173
- **API:**        http://localhost:5000/api/health

### Quick Demo

Click **Quick Demo** in the header — auto-loads Hyderabad Rush Hour preset, starts simulation, begins training, and enables split-screen comparison.

---

## Architecture

```
Project_T/
├── run.py                     # Starts Flask + Vite in parallel
├── backend/
│   ├── app.py                 # Flask factory, Socket.IO, blueprint registration
│   ├── config.py              # All defaults (Hyderabad GHMC calibrated)
│   ├── config_presets.py      # 34 presets across 7 groups
│   ├── api/
│   │   ├── routes.py          # 22 REST endpoints
│   │   └── socket_handlers.py # 12 Socket.IO event handlers
│   ├── rl/
│   │   ├── traffic_env.py     # Custom Gymnasium env (22-dim, Discrete 35)
│   │   ├── trainer.py         # PPO + EpisodeMetrics / Convergence / Insight callbacks
│   │   ├── baseline_agent.py  # Fixed-time, Webster's, semi-actuated
│   │   ├── model_manager.py   # Save / load / version SB3 models
│   │   ├── explainer.py       # SHAP XAI + natural-language reasons
│   │   └── transfer_learner.py
│   ├── simulation/
│   │   ├── sumo_env.py        # TraCI lifecycle wrapper
│   │   ├── intersection_builder.py
│   │   ├── demand_generator.py
│   │   ├── state_extractor.py # 22-dim state vector
│   │   ├── adverse_injector.py
│   │   ├── vehicle_types.py   # 10 vehicle profiles
│   │   └── templates/         # 5 SUMO .net.xml templates
│   ├── analytics/
│   │   ├── metrics.py         # Per-episode KPI computation
│   │   ├── economic.py        # Fuel / CO2 / Rs savings
│   │   ├── insight_generator.py
│   │   ├── session_store.py   # SQLite persistence
│   │   ├── comparator.py      # Side-by-side session diff
│   │   └── report_generator.py # PDF via WeasyPrint + Jinja2
│   ├── vision/
│   │   └── detector.py        # YOLOv8 + ByteTrack stub (RTSP mode)
│   └── db/models.py           # SQLAlchemy ORM
└── frontend/
    └── src/
        ├── pages/             # Dashboard · CompareSession · PilotReport
        ├── components/        # 18 React components
        ├── hooks/             # useSocket · useSimulation · useQuickDemo
        ├── store/             # Zustand: simulation · session · config
        ├── canvas/            # renderer.ts — pure Canvas 2D utilities
        └── types/             # TypeScript interfaces
```

---

## Hyderabad Defaults

| Parameter | Value |
|-----------|-------|
| Vehicle mix | Car 40% · Two-wheeler 25% · Auto-rickshaw 10% · EV scooter 10% · ... |
| Signal scheme | 5-phase incl. U-turn · 4s amber · 2s all-red · 120s cycle |
| Petrol price | Rs 106 / litre |
| Diesel price | Rs 93 / litre |
| Avg wage | Rs 250 / hr |
| Carbon credit | Rs 2,000 / tonne CO2 |
| City intersections | 650 (GHMC) |

---

## API Reference

### REST (22 endpoints)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/config/defaults` | Default sim + adverse config |
| POST | `/api/config/validate` | Validate config payload |
| GET | `/api/presets` | List all 34 presets |
| GET | `/api/presets/<id>` | Get full preset |
| POST | `/api/sessions` | Create training session |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/<id>` | Get session |
| DELETE | `/api/sessions/<id>` | Delete session |
| POST | `/api/sessions/<id>/train` | Start PPO training |
| GET | `/api/sessions/<id>/status` | Training status |
| POST | `/api/sessions/<id>/stop` | Stop training |
| GET | `/api/sessions/<id>/episodes` | Episode list |
| GET | `/api/sessions/<id>/metrics` | Aggregated metrics |
| GET | `/api/sessions/<id>/insights` | Insight cards |
| GET | `/api/sessions/<id>/economic` | Economic summary |
| GET | `/api/models` | Saved model list |
| POST | `/api/models/<id>/export` | Export model |
| GET | `/api/zoo` | Pre-trained model zoo |
| GET | `/api/sessions/<id>/report/html` | HTML pilot report |
| GET | `/api/sessions/<id>/report/pdf` | PDF pilot report |
| GET | `/api/compare?session_a=&session_b=` | Compare two sessions |

### Socket.IO Events

**Client to Server:** `sim:start` · `sim:stop` · `sim:pause` · `sim:resume` · `training:start` · `training:stop` · `preset:load` · `config:update` · `demo:start` · `report:generate` · `explain:request`

**Server to Client:** `sim:frame` · `training:episode` · `training:converged` · `training:insight` · `adverse:event` · `metrics:update` · `session:update`

---

## Tests

```bash
# All backend tests
python -m pytest backend/tests/ -v

# Smoke test only
python -m pytest backend/tests/test_smoke.py -v
```

---

## License

MIT
