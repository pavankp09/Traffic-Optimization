# Indian Traffic Geometry & Pedestrian System — Design Spec

**Date:** 2026-06-04
**Approach:** B — Full Indian scenario (canvas + behavior + pedestrians + signal phases)

---

## Overview

Adds full Indian traffic realism to the simulation:
1. **Canvas:** Slip road triangular islands, yellow-black zebra crossings, pedestrian signal heads
2. **Vehicle behavior:** Type-specific lateral freedom, gap-detection for bikes threading through traffic, red-light advance (queue creep), red-light running, speed variance
3. **Pedestrian system:** `_MockPedestrian` class, Indian compliance model (15% obey signal), staggered crossing, random crossing points
4. **Signal phases:** Free-left bypass (no queuing), pedestrian phase after each green, mock_env updates

SUMO `.net.xml` templates for all free-left types already exist. No SUMO changes needed.

---

## Section 1 — Canvas Rendering (renderer.ts)

### 1.1 Free-left slip road geometry

Triggered when `hasFreeLeft = true`. For each corner of the intersection:
- Draw filled dark triangle `#0a0e15` (channelised island) at the corner
- Draw one curved slip lane of asphalt (width = `LANE_W_PX = 21px`) connecting approach to exit, bypassing the stop line
- White edge markings `rgba(255,255,255,0.4)` along the slip lane kerbs
- Vehicles on slip lanes never render near signal heads

### 1.2 Indian pedestrian crossings

Drawn at stop line on each arm when `pedestrian_crossings !== 'disabled'`:
- **Zebra stripes:** 8 alternating stripes, colors `#d97706` (amber) and `#111827` (dark), each 18px wide, spanning full road width
- **Footpath waiting area:** 24×24px hatched rectangle at each end of the crossing, fill `#1f2937`, diagonal lines `rgba(255,255,255,0.1)`
- **Pedestrian signal head:** Small 2-light box (12×24px) mounted beside the vehicle signal post — red standing figure / green walking figure SVG icon

### 1.3 Vehicle rendering — no z-tricks, actual positions

Vehicles are rendered in spawn order at their true (x, y) world positions. Two-wheelers are narrower (0.8 wu rendered width) vs cars (1.8 wu). Gap-detection in Section 2 ensures bikes are literally in empty spaces — no visual overlap occurs from simulation correctness, not rendering tricks.

### 1.4 Pedestrian agent rendering

Each `_MockPedestrian` renders as a 5px filled circle:
- `#06b6d4` cyan: walking (compliant)
- `#f59e0b` amber: waiting at median
- `#ef4444` red: non-compliant crossing

---

## Section 2 — Indian Vehicle Behavior (_SimWorld in socket_handlers.py)

### 2.1 Type-specific lateral freedom

New `_LAT_FREEDOM` dict replaces the uniform `lat_drift = random.uniform(-1.0, 1.0)`:

```python
_LAT_FREEDOM: dict[str, float] = {
    "two_wheeler":    3.5,   # full road width
    "delivery_bike":  3.5,
    "ev_scooter":     3.0,
    "auto_rickshaw":  2.0,
    "e_rickshaw":     1.8,
    "car":            1.2,
    "cab":            1.2,
    "tsrtc_bus":      0.3,
    "school_bus":     0.3,
    "truck":          0.3,
}
```

Applied as: `self.lat_drift = random.uniform(-freedom, freedom)` on spawn.

### 2.2 Gap-detection for two-wheelers

Every tick, vehicles with `type_id in ("two_wheeler", "delivery_bike", "ev_scooter")` run gap-detection:

```
Algorithm:
1. Collect all same-arm vehicles within ±15 wu longitudinally of self
2. Sort them by their current lateral position
3. Build gap list: between each adjacent pair (and road edges), gap = space between outer edges
   - outer edge of vehicle = lateral_pos ± (vehicle_width/2)
   - road outer edges = ±(ROAD_HALF_PX / scale) = ±14.4 wu
4. Find gap with width ≥ 2.8 wu (minimum bike passable gap)
5. Steer toward center of widest available gap at lateral rate 2.0 wu/tick
6. If no gap ≥ 2.8 wu: steer toward kerb edge (road outer)
```

`_VEH_WIDTH` dict:
```python
_VEH_WIDTH: dict[str, float] = {
    "two_wheeler": 0.8, "delivery_bike": 0.8, "ev_scooter": 0.9,
    "auto_rickshaw": 1.7, "e_rickshaw": 1.7,
    "car": 1.8, "cab": 1.8,
    "tsrtc_bus": 2.4, "school_bus": 2.4, "truck": 2.6,
}
```

### 2.3 Red-light advance (queue creep)

Two-wheelers within 30 wu of the stop line during red phase: advance at `_MOVE_SPEED * 0.3` longitudinally while gap-seeking laterally. Stop only when they hit the physical stop line or a vehicle directly ahead with gap < 1.0 wu.

Implementation: in `_MockVehicle.step()` (or the equivalent update), add:
```python
if is_red and self.type_id in _BIKE_TYPES and dist_to_stop < 30.0:
    # creep forward through gaps
    if self._gap_ahead(world_vehicles) > 1.0:
        self._advance(speed=_MOVE_SPEED * 0.3, dt=dt)
```

### 2.4 Red-light running

On each red-phase transition, per vehicle:
```python
_RED_RUN_PROB: dict[str, float] = {
    "two_wheeler": 0.20, "delivery_bike": 0.18, "ev_scooter": 0.15,
    "auto_rickshaw": 0.08, "e_rickshaw": 0.05,
    "car": 0.03, "cab": 0.02,
    "tsrtc_bus": 0.0, "school_bus": 0.0, "truck": 0.0,
}
```
If triggered: vehicle advances through stop line at `_MOVE_SPEED * 0.4`, ignoring the signal, marked `through=True`.

### 2.5 Speed variance per type

```python
_TYPE_SPEED: dict[str, float] = {
    "two_wheeler": 18.0, "delivery_bike": 17.0, "ev_scooter": 14.0,
    "auto_rickshaw": 12.0, "e_rickshaw": 8.0,
    "car": 14.0, "cab": 14.0,
    "tsrtc_bus": 10.0, "school_bus": 9.0, "truck": 10.0,
}
```

On spawn: `self.speed = _TYPE_SPEED[self.type_id] * random.gauss(1.0, 0.15)` (±15% variance).

---

## Section 3 — Pedestrian System

### 3.1 _MockPedestrian class

```python
class _MockPedestrian:
    id: str
    arm: str               # which arm they're crossing
    cross_y: float         # longitudinal position of crossing (random along arm)
    lateral: float         # current lateral position
    state: str             # "waiting" | "crossing_1" | "at_median" | "crossing_2" | "done"
    compliant: bool        # 15% True (waits for signal), 85% False (gap-seeker)
    wait_time: float
    speed: float = 1.2     # wu/s walking speed
```

### 3.2 Spawn rate

1 pedestrian per 8 vehicle spawns. Distributed across arms proportional to vehicle demand on that arm. Crossing point `cross_y` is uniform random along the arm (not just at zebra positions).

### 3.3 Compliance model

```
compliant=True (15%):
  - State "waiting": stays at footpath until pedestrian signal turns green
  - Then transitions to "crossing_1"

compliant=False (85%):
  - State "waiting": check gap — nearest vehicle on this arm
  - If nearest_vehicle_distance > 18 wu: transition to "crossing_1"
  - Else: continue waiting
```

### 3.4 Staggered crossing (Indian behavior)

All pedestrians (compliant or not):
1. `crossing_1`: cross to road median (lateral = 0), walking at 1.2 wu/s
2. `at_median`: pause 1.0–3.0s (random)
3. `crossing_2`: cross from median to opposite footpath
4. `done`: remove from world

### 3.5 Vehicle interaction

Any vehicle approaching within 6 wu of a pedestrian in `crossing_1` or `crossing_2` state reduces its speed to `_MOVE_SPEED * 0.2` for the duration of proximity. This creates authentic "vehicle yielding to pedestrian" and "pedestrian darting between vehicles" behavior depending on timing.

### 3.6 Pedestrian frame data

Pedestrians emitted in `sim:frame` as a new `pedestrians` array alongside `vehicles`:
```python
{
  "id": "ped_001",
  "arm": "N",
  "x": 3.7,        # lateral position
  "y": -25.0,      # longitudinal position
  "state": "crossing_1",
  "compliant": False,
}
```

---

## Section 4 — Signal Phase + mock_env Updates

### 4.1 Free-left bypass in _SimWorld

Vehicles with `turn_dir == "left"` on free-left intersection types: skip the signal queue entirely. On spawn they are assigned `free_left=True` and advance directly into the turning bezier path at `_MOVE_SPEED * 0.7` without stopping at the stop line. The stop line queue never includes free-left vehicles.

```python
self.free_left = (
    turn_dir == "left"
    and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left")
)
```

### 4.2 Pedestrian phase in signal cycle

After each major green phase (N-S or E-W), a 7s pedestrian phase fires:
- Vehicle signals: amber for 4s → all-red for 3s
- Pedestrian signals: green walk for 7s (compliant pedestrians use this window)
- `_PHASE_DURATIONS` updated to `[28.0, 4.0, 7.0, 28.0, 4.0, 7.0, 2.0]` (N-S green, N-S yellow, N-S ped, E-W green, E-W yellow, E-W ped, all-red)

### 4.3 mock_env updates

`PHASE_GREEN` updated for free-left types (left turns contribute throughput passively):
```python
# Free-left: left-turning vehicles clear automatically, so effective
# throughput includes free-left turns. Served count += free_left_count * 0.7
```

`pedestrian_walk_seconds` (already in Stage 2 config) now directly maps to the 7s pedestrian phase window. The `startup_lost_time_s` for pedestrian phase = 0 (pedestrians start immediately).

---

## File Map

| File | Change |
|---|---|
| `frontend/src/canvas/renderer.ts` | `drawIntersection`: slip road islands, zebra crossings, pedestrian signal heads; `drawPedestrian()` new function |
| `backend/api/socket_handlers.py` | `_MockVehicle`: `_LAT_FREEDOM`, `_VEH_WIDTH`, `_TYPE_SPEED`, `_RED_RUN_PROB`, gap-detection; `_MockPedestrian` new class; `_SimWorld.step()`: ped spawn, ped movement, vehicle-ped interaction; frame serialization add `pedestrians` |
| `frontend/src/components/SimCanvas.tsx` | Pass `pedestrians` from frame to canvas drawing |
| `frontend/src/types/index.ts` | Add `PedestrianFrame` type |
| `backend/rl/mock_env.py` | `PHASE_GREEN` free-left throughput bonus; `_PHASE_DURATIONS` + pedestrian phase |

---

## What Is NOT Changing

- SUMO templates (already exist)
- `intersection_builder.py` (already maps all types)
- `demand_generator.py` (vehicle routes unchanged; free-left routing is handled at _SimWorld level)
- DB schema
- Training pipeline
- KPI cards
