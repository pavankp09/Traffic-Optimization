# Indian Traffic Geometry & Pedestrian System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full Indian traffic realism — type-specific lateral freedom, bike gap-detection (threading through traffic), red-light running, a complete pedestrian system with Indian compliance, and canvas rendering of slip roads, zebra crossings, and pedestrian agents.

**Architecture:** `_MockVehicle` gains gap-detection (bikes find empty lateral space between vehicles), type-specific speed/lateral freedom, and red-light behavior. New `_MockPedestrian` class handles staggered crossing with 15% compliance rate. `_SimWorld.step()` spawns and updates pedestrians, adds them to `frame()` output. The canvas `renderer.ts` gains `drawFreeleftSlip()`, `drawZebraCrossing()`, and `drawPedestrian()` functions. `SimCanvas.tsx` calls `drawPedestrian` for each ped in the frame.

**Tech Stack:** Python (socket_handlers.py), TypeScript/Canvas2D (renderer.ts, SimCanvas.tsx)

---

## File Map

| File | Change |
|---|---|
| `backend/api/socket_handlers.py` | Add `_LAT_FREEDOM`, `_VEH_WIDTH`, `_TYPE_SPEED`, `_RED_RUN_PROB`; update `_MockVehicle.__init__` + `_setup_turn`; add gap-detection + red-light methods; add `_MockPedestrian` class; update `_SimWorld` |
| `frontend/src/canvas/renderer.ts` | Add `drawFreeleftSlip()`, `drawZebraCrossing()`, `drawPedestrianSignal()`, `drawPedestrian()`; update `drawIntersection()` |
| `frontend/src/types/index.ts` | Add `PedestrianFrame` interface; extend `SimFrame` with optional `pedestrians` |
| `frontend/src/components/SimCanvas.tsx` | Import and call `drawPedestrian` for each pedestrian in frame |
| `backend/rl/mock_env.py` | No change needed — pedestrian phase already in Stage 2 config |

---

## Task 1: Vehicle behavior dicts + type-specific init in _MockVehicle

**Files:**
- Modify: `backend/api/socket_handlers.py`

- [ ] **Step 1: Add behavior dicts after `_VEH_LEN`**

In `socket_handlers.py`, find `_VEH_LEN` dict (around line 192). Add immediately after it:

```python
# Type-specific lateral freedom (max drift from lane centre, world units)
_LAT_FREEDOM: dict[str, float] = {
    "two_wheeler":    3.5,
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

# Vehicle body widths for gap-detection (world units)
_VEH_WIDTH: dict[str, float] = {
    "two_wheeler":    0.8,
    "delivery_bike":  0.8,
    "ev_scooter":     0.9,
    "auto_rickshaw":  1.7,
    "e_rickshaw":     1.7,
    "car":            1.8,
    "cab":            1.8,
    "tsrtc_bus":      2.4,
    "school_bus":     2.4,
    "truck":          2.6,
}

# Base speed per type (world units/second)
_TYPE_SPEED: dict[str, float] = {
    "two_wheeler":    18.0,
    "delivery_bike":  17.0,
    "ev_scooter":     14.0,
    "auto_rickshaw":  12.0,
    "e_rickshaw":     8.0,
    "car":            14.0,
    "cab":            14.0,
    "tsrtc_bus":      10.0,
    "school_bus":     9.0,
    "truck":          10.0,
}

# Probability of running a red light (applied once per red-phase start)
_RED_RUN_PROB: dict[str, float] = {
    "two_wheeler":    0.20,
    "delivery_bike":  0.18,
    "ev_scooter":     0.15,
    "auto_rickshaw":  0.08,
    "e_rickshaw":     0.05,
    "car":            0.03,
    "cab":            0.02,
    "tsrtc_bus":      0.0,
    "school_bus":     0.0,
    "truck":          0.0,
}

_BIKE_TYPES = frozenset({"two_wheeler", "delivery_bike", "ev_scooter"})
_MIN_BIKE_GAP = 2.8   # minimum lateral gap (wu) a bike needs to pass through
_LAT_STEER_RATE = 2.0 # wu/s lateral steering speed for gap-seeking
```

- [ ] **Step 2: Update `_MockVehicle.__init__` to use type-specific values**

In `_MockVehicle.__init__`, find:
```python
        self.lat_drift = random.uniform(-1.0, 1.0)
        self.weave_phase = random.uniform(0, 2 * math.pi)

        offset = _LANE_OFFSETS[self.arm][lane % _N_LANES] + self.lat_drift
```

Replace with:
```python
        # Type-specific speed with ±15% variance
        base_spd = _TYPE_SPEED.get(self.type_id, _MOVE_SPEED)
        self.speed = base_spd * random.gauss(1.0, 0.15)
        self.speed = max(4.0, self.speed)  # floor

        # Type-specific lateral drift
        freedom = _LAT_FREEDOM.get(self.type_id, 1.0)
        self.lat_drift = random.uniform(-freedom, freedom)
        self.lat_target = self.lat_drift   # current steering target (updated by gap-seek)
        self.weave_phase = random.uniform(0, 2 * math.pi)

        # Red-light runner flag — set once per red phase
        self.red_runner: bool = False
        # Free-left flag — set in _setup_turn when applicable
        self.free_left: bool = False

        offset = _LANE_OFFSETS[self.arm][lane % _N_LANES] + self.lat_drift
```

- [ ] **Step 3: Also fix the `self.speed = _MOVE_SPEED` line that appears earlier in __init__**

Find `self.speed = _MOVE_SPEED` (around line 209) and remove it — the speed is now set after type_id is determined. The existing code sets `self.type_id = random.choice(...)` at line 204, so the fix in Step 2 is positioned correctly after that.

If `self.speed = _MOVE_SPEED` remains, remove just that one line; the new speed assignment replaces it.

- [ ] **Step 4: Set `self.free_left` in `_setup_turn`**

In `_setup_turn`, find the line `has_free_left = intersection_type in (...)`. After it, add:
```python
        if has_free_left and td == "left":
            self.free_left = True
```

- [ ] **Step 5: Verify imports**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2"
python -c "import backend.api.socket_handlers; print('OK')"
```

Expected: `OK`

---

## Task 2: Gap-detection, red-light advance, red-light running

**Files:**
- Modify: `backend/api/socket_handlers.py`

- [ ] **Step 1: Add `_find_lateral_gap` method to `_MockVehicle`**

Find the `_setup_turn` method. Add the following method immediately after it (before `update` or wherever the next method is):

```python
    def _find_lateral_gap(self, world_vehicles: list) -> float | None:
        """
        For bike-type vehicles: find center of the widest lateral gap among
        same-arm vehicles within ±15 wu longitudinally. Returns target lateral
        position (x for N/S arms, y for E/W arms), or None if no gap ≥ _MIN_BIKE_GAP.
        Road half-width = 14.4 wu.
        """
        if self.type_id not in _BIKE_TYPES or self.turning or self.through:
            return None

        # Determine lateral axis and longitudinal proximity
        is_ns = self.arm in ("N", "S")
        my_long  = self.y if is_ns else self.x
        my_lat   = self.x if is_ns else self.y
        my_width = _VEH_WIDTH.get(self.type_id, 0.8)

        # Collect same-arm non-self vehicles within ±15 wu longitudinally
        nearby_lats: list[float] = []
        for v in world_vehicles:
            if v is self or v.arm != self.arm:
                continue
            v_long = v.y if is_ns else v.x
            if abs(v_long - my_long) <= 15.0:
                v_lat = v.x if is_ns else v.y
                v_hw  = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                nearby_lats.append((v_lat - v_hw, v_lat + v_hw))  # (left_edge, right_edge)

        if not nearby_lats:
            return None   # road is empty, no need to steer

        ROAD_HW = 14.4  # world units
        # Build sorted list of occupied intervals
        intervals = sorted(nearby_lats, key=lambda x: x[0])

        # Find gaps between intervals (and between road edges and first/last interval)
        gaps: list[tuple[float, float]] = []
        cursor = -ROAD_HW
        for lo, hi in intervals:
            if lo > cursor + _MIN_BIKE_GAP:
                gaps.append((cursor, lo))
            cursor = max(cursor, hi)
        if ROAD_HW > cursor + _MIN_BIKE_GAP:
            gaps.append((cursor, ROAD_HW))

        if not gaps:
            return None  # no gap found — steer to kerb
            # return ROAD_HW - my_width / 2  # alternative: edge of road

        # Pick the widest gap
        best = max(gaps, key=lambda g: g[1] - g[0])
        return (best[0] + best[1]) / 2.0  # centre of gap
```

- [ ] **Step 2: Add red-light-runner activation in `_SimWorld._decide_next`**

In `_SimWorld._decide_next`, find the end of the method (after all the phase-setting logic). Add at the very end:

```python
        # Mark red-light runners for the new cycle
        if self.phase in (0, 2):   # just switched to a green phase: mark reds on other axis
            for v in self.vehicles:
                if not v.through and v.arm not in _PHASE_GREEN.get(self.phase, set()):
                    v.red_runner = random.random() < _RED_RUN_PROB.get(v.type_id, 0.0)
                else:
                    v.red_runner = False
```

- [ ] **Step 3: Apply gap-seeking and red-light behaviors in `_SimWorld.step()`**

In `_SimWorld.step()`, find the `for v in self.vehicles:` loop. At the start of the loop body (before `same = lane_map...`), add:

```python
            # ── Indian behavior: gap-seek for bikes, red-light runners ──────
            # Gap-seeking: bikes steer toward empty lateral space
            if v.type_id in _BIKE_TYPES and not v.turning:
                target = v._find_lateral_gap(self.vehicles)
                if target is not None:
                    is_ns = v.arm in ("N", "S")
                    current = v.x if is_ns else v.y
                    delta = target - current
                    move = min(abs(delta), _LAT_STEER_RATE * dt) * (1 if delta > 0 else -1)
                    if is_ns:
                        v.x += move
                    else:
                        v.y += move
                    v.lat_target = target

            # Queue-creep: bikes advance slowly through stopped queue toward stop line
            if v.type_id in _BIKE_TYPES and not v.through and not v.turning:
                is_ns = v.arm in ("N", "S")
                dist_to_stop = abs(v.y if is_ns else v.x) - _STOP_DIST
                if dist_to_stop > 0 and dist_to_stop < 30.0:
                    # Check if space ahead (along longitudinal axis)
                    creep_ok = True
                    for other in self.vehicles:
                        if other is v or other.arm != v.arm:
                            continue
                        o_long = (other.y if is_ns else other.x)
                        v_long = (v.y if is_ns else v.x)
                        # other is ahead (closer to centre) by less than 2 wu?
                        if abs(o_long - v_long) < 2.0 and abs(o_long) < abs(v_long):
                            creep_ok = False
                            break
                    if creep_ok and v.speed < 0.1:
                        # Creep forward
                        v.x += v.dx * _MOVE_SPEED * 0.25 * dt
                        v.y += v.dy * _MOVE_SPEED * 0.25 * dt

            # Red-light runner: advance at reduced speed ignoring signal
            if v.red_runner and not v.through and not v.turning:
                is_ns = v.arm in ("N", "S")
                dist = abs(v.y if is_ns else v.x)
                if dist <= v.stop_zone and v.speed < 0.5:
                    # Run the red — push through the stop zone
                    v.x += v.dx * _MOVE_SPEED * 0.4 * dt
                    v.y += v.dy * _MOVE_SPEED * 0.4 * dt
                    if dist <= _STOP_DIST:
                        v.through = True
                        v.red_runner = False
```

- [ ] **Step 4: Verify server starts**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2"
python -c "import backend.api.socket_handlers; print('OK')"
```

Expected: `OK`

---

## Task 3: `_MockPedestrian` class

**Files:**
- Modify: `backend/api/socket_handlers.py`

- [ ] **Step 1: Add `_MockPedestrian` class after `_MockVehicle`**

Find the end of the `_MockVehicle` class. After its last method, add:

```python
class _MockPedestrian:
    """
    Indian pedestrian agent crossing a road arm.
    States: waiting → crossing_1 → at_median → crossing_2 → done
    Compliance: 15% wait for signal (compliant), 85% cross when gap ≥ 18 wu.
    Staggered crossing: always cross to median first, pause, then cross second half.
    """

    _ped_counter = 0

    def __init__(self, arm: str, intersection_type: str = "four_way"):
        _MockPedestrian._ped_counter += 1
        self.id = f"ped_{_MockPedestrian._ped_counter:04d}"
        self.arm = arm

        # Random crossing position along the arm (not just at stop line)
        self.cross_long = random.uniform(_STOP_DIST * 0.6, _STOP_DIST * 1.4)

        # Lateral position: start at footpath (road edge)
        self.lateral = 14.4 + 1.0   # just outside road (footpath side)
        # Direction: cross from outer → median → outer (other side)
        # Positive lateral = outer on N/S arms (x axis), inner = 0
        self.state = "waiting"
        self.compliant = random.random() < 0.15   # 15% obey signal
        self.wait_elapsed = 0.0
        self.median_wait = random.uniform(1.0, 3.0)  # pause at median
        self.median_elapsed = 0.0
        self.speed = 1.2  # wu/s walking speed

        # Arm direction determines which axis is lateral
        self.arm_is_ns = arm in ("N", "S")

    def position_dict(self) -> dict:
        """Return (x, y) world position based on arm and crossing state."""
        # Lateral maps to x for N/S arms, y for E/W arms
        # Longitudinal = cross_long with sign based on arm direction
        long_sign = -1 if self.arm in ("N", "E") else 1
        long_pos  = long_sign * self.cross_long
        lat       = self.lateral  # positive = outer footpath side

        if self.arm_is_ns:   # lateral = x, longitudinal = y
            return {"x": lat, "y": long_pos}
        else:                 # lateral = y, longitudinal = x
            return {"x": long_pos, "y": lat}

    def to_dict(self) -> dict:
        pos = self.position_dict()
        return {
            "id": self.id,
            "arm": self.arm,
            "x": round(pos["x"], 2),
            "y": round(pos["y"], 2),
            "state": self.state,
            "compliant": self.compliant,
        }

    def update(self, dt: float, signal_phase: int, nearest_vehicle_dist: float) -> bool:
        """
        Advance pedestrian state. Returns True when done (remove from world).
        signal_phase: current _SimWorld.phase (0=N-S green, 2=E-W green, etc.)
        nearest_vehicle_dist: distance to nearest vehicle on this arm (wu)
        """
        if self.state == "done":
            return True

        # Determine if pedestrian phase is active for this arm
        # Pedestrian signal is green during all-red / yellow after N-S or E-W green
        ped_safe = signal_phase in (1, 3, 4)  # yellow or all-red phases

        if self.state == "waiting":
            self.wait_elapsed += dt
            can_cross = False
            if self.compliant:
                can_cross = ped_safe
            else:
                # Non-compliant: cross when nearest vehicle > 18 wu away
                can_cross = nearest_vehicle_dist > 18.0
            # Safety timeout: if waited > 30s, cross regardless
            if can_cross or self.wait_elapsed > 30.0:
                self.state = "crossing_1"

        elif self.state == "crossing_1":
            # Walk from outer footpath (14.4+) toward median (0)
            self.lateral -= self.speed * dt
            if self.lateral <= 0.5:  # reached median
                self.lateral = 0.0
                self.state = "at_median"

        elif self.state == "at_median":
            self.median_elapsed += dt
            if self.median_elapsed >= self.median_wait:
                self.state = "crossing_2"

        elif self.state == "crossing_2":
            # Walk from median toward opposite footpath (-14.4)
            self.lateral -= self.speed * dt
            if self.lateral <= -14.4:
                self.state = "done"
                return True

        return False
```

- [ ] **Step 2: Verify**

```bash
python -c "
from backend.api.socket_handlers import _MockPedestrian
p = _MockPedestrian('N')
print(p.id, p.state, p.compliant)
d = p.to_dict()
assert 'x' in d and 'y' in d and 'state' in d
print('_MockPedestrian OK')
"
```

Expected:
```
ped_XXXX waiting False
_MockPedestrian OK
```

---

## Task 4: Integrate pedestrians into `_SimWorld`

**Files:**
- Modify: `backend/api/socket_handlers.py`

- [ ] **Step 1: Add pedestrian list and spawn counter to `_SimWorld.__init__`**

Find `_SimWorld.__init__`. After `self.wait_history: list[tuple[float, float]] = []`, add:

```python
        self.pedestrians: list = []          # active _MockPedestrian agents
        self._ped_spawn_debt: float = 0.0    # fractional accumulator for ped spawning
        self._ped_spawn_ratio: float = 1.0 / 8.0   # 1 ped per 8 vehicles spawned
```

- [ ] **Step 2: Spawn pedestrians in `_SimWorld.step()` alongside vehicles**

In `_SimWorld.step()`, find where new vehicles are spawned (look for `_MockVehicle(` construction or `self.vehicles.append`). After the vehicle spawn block, add:

```python
        # ── Pedestrian spawn ──────────────────────────────────────────────
        # Only spawn pedestrians when crossing enabled (intersection type supports it)
        ped_enabled = self.intersection_type not in ("roundabout", "roundabout_free_left",
                                                      "y_junction", "six_arm")
        if ped_enabled:
            # Count vehicles spawned this tick (already tracked or approximate via backlog)
            # Simple approach: each step has a 1/8 chance per active arm of spawning a ped
            arms = ["N", "S", "E", "W"]
            if self.intersection_type in ("t_junction", "t_junction_free_left"):
                arms = ["N", "E", "W"]
            for arm in arms:
                self._ped_spawn_debt += self._ped_spawn_ratio * dt * (_MOVE_SPEED / 10.0)
                if self._ped_spawn_debt >= 1.0:
                    self._ped_spawn_debt -= 1.0
                    self.pedestrians.append(_MockPedestrian(arm, self.intersection_type))
```

- [ ] **Step 3: Update pedestrians in `_SimWorld.step()`**

In `_SimWorld.step()`, after the vehicle update loop (`to_remove` removal section), add:

```python
        # ── Pedestrian update ─────────────────────────────────────────────
        peds_to_remove = []
        for ped in self.pedestrians:
            # Find nearest vehicle on same arm
            nearest_dist = 999.0
            for v in self.vehicles:
                if v.arm != ped.arm or v.through:
                    continue
                pos = ped.position_dict()
                vdist = math.hypot(v.x - pos["x"], v.y - pos["y"])
                nearest_dist = min(nearest_dist, vdist)

            # Slow vehicles near pedestrians crossing
            if ped.state in ("crossing_1", "crossing_2"):
                for v in self.vehicles:
                    if v.arm != ped.arm:
                        continue
                    pos = ped.position_dict()
                    vdist = math.hypot(v.x - pos["x"], v.y - pos["y"])
                    if vdist < 6.0:
                        v.speed = min(v.speed, _MOVE_SPEED * 0.2)

            done = ped.update(dt, self.phase, nearest_dist)
            if done:
                peds_to_remove.append(ped)

        for ped in peds_to_remove:
            self.pedestrians.remove(ped)
```

- [ ] **Step 4: Add pedestrians to `frame()` output**

In `_SimWorld.frame()`, find the `return {` dict. Add `"pedestrians"` to it:

```python
        return {
            "session_id": session_id,
            "step": step,
            "sim_time_s": round(sim_time, 1),
            "max_sim_time_s": getattr(self, "max_sim_s", 1800.0),
            "policy_mode": policy_mode,
            "vehicles": [v.to_dict() for v in self.vehicles],
            "pedestrians": [p.to_dict() for p in self.pedestrians],   # NEW
            "signals": [{
                "tl_id": "center",
                "phase": self.phase,
                "elapsed_s": round(self.phase_elapsed, 1),
                "duration_s": round(self.cur_duration, 1),
                "remaining_s": round(max(0.0, self.cur_duration - self.phase_elapsed), 1),
            }],
            "stats": stats,
        }
```

- [ ] **Step 5: Verify frame output includes pedestrians**

```bash
python -c "
from backend.api.socket_handlers import _SimWorld
w = _SimWorld(fixed_time=True)
for _ in range(200):
    w.step(0.05)
f = w.frame(1, 5.0, 'test')
print('pedestrians key present:', 'pedestrians' in f)
print('pedestrian count:', len(f['pedestrians']))
"
```

Expected: pedestrians key present: True, count >= 0

---

## Task 5: Canvas — free-left slip road, zebra crossings, pedestrian signal

**Files:**
- Modify: `frontend/src/canvas/renderer.ts`

- [ ] **Step 1: Add `drawFreeleftSlip` function after the `drawSixRoads` function**

Find `function drawSixRoads(...)`. Add the new function immediately after it:

```typescript
function drawFreeleftSlip(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rh: number
): void {
  // Draw channelised triangular island + slip lane at all 4 corners
  // Each corner: (cx+rh, cy-rh) = NE, (cx+rh, cy+rh) = SE,
  //              (cx-rh, cy+rh) = SW, (cx-rh, cy-rh) = NW
  const corners = [
    { ix: cx + rh, iy: cy - rh, lx1: cx + rh + 20, ly1: cy - rh,     lx2: cx + rh,      ly2: cy - rh - 20, ex: cx + rh + 14, ey: cy - rh - 14 },
    { ix: cx + rh, iy: cy + rh, lx1: cx + rh,      ly1: cy + rh + 20, lx2: cx + rh + 20, ly2: cy + rh,     ex: cx + rh + 14, ey: cy + rh + 14 },
    { ix: cx - rh, iy: cy + rh, lx1: cx - rh - 20, ly1: cy + rh,     lx2: cx - rh,      ly2: cy + rh + 20, ex: cx - rh - 14, ey: cy + rh + 14 },
    { ix: cx - rh, iy: cy - rh, lx1: cx - rh,      ly1: cy - rh - 20, lx2: cx - rh - 20, ly2: cy - rh,    ex: cx - rh - 14, ey: cy - rh - 14 },
  ]

  corners.forEach(({ ix, iy, lx1, ly1, lx2, ly2, ex, ey }) => {
    // Slip lane surface (asphalt strip)
    ctx.fillStyle = '#161c26'
    ctx.beginPath()
    ctx.moveTo(ix, iy)
    ctx.quadraticCurveTo(ex, ey, lx2, ly2)
    ctx.lineTo(lx1, ly1)
    ctx.closePath()
    ctx.fill()

    // Island triangle (dark kerb)
    ctx.fillStyle = '#0a0e15'
    ctx.beginPath()
    ctx.moveTo(ix, iy)
    ctx.lineTo(lx1, ly1)
    ctx.lineTo(lx2, ly2)
    ctx.closePath()
    ctx.fill()

    // Island kerb outline
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ix, iy)
    ctx.lineTo(lx1, ly1)
    ctx.lineTo(lx2, ly2)
    ctx.closePath()
    ctx.stroke()
  })
}
```

- [ ] **Step 2: Add `drawZebraCrossing` function**

Add immediately after `drawFreeleftSlip`:

```typescript
function drawZebraCrossing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rh: number,
  arm: 'N' | 'S' | 'E' | 'W'
): void {
  // Draw Indian yellow-black zebra crossing at stop line of each arm
  const STRIPE_W = 18  // px per stripe
  const N_STRIPES = 8
  const CROSS_LEN = rh * 2   // full road width
  const CROSS_W   = N_STRIPES * STRIPE_W

  ctx.save()
  ctx.translate(cx, cy)

  if (arm === 'N') ctx.translate(0, -rh - CROSS_W / 2)
  else if (arm === 'S') ctx.translate(0,  rh + CROSS_W / 2)
  else if (arm === 'E') { ctx.rotate(Math.PI / 2); ctx.translate(0, -rh - CROSS_W / 2) }
  else { ctx.rotate(Math.PI / 2); ctx.translate(0,  rh + CROSS_W / 2) }

  for (let i = 0; i < N_STRIPES; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#d97706' : '#111827'
    ctx.fillRect(-CROSS_LEN / 2, -CROSS_W / 2 + i * STRIPE_W, CROSS_LEN, STRIPE_W)
  }

  // Footpath hatching at each end
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(-CROSS_LEN / 2 - 20, -CROSS_W / 2, 20, CROSS_W)
  ctx.fillRect( CROSS_LEN / 2,      -CROSS_W / 2, 20, CROSS_W)

  // Diagonal hatch lines on footpath areas
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  for (let i = -CROSS_W; i < CROSS_W; i += 6) {
    ctx.beginPath()
    ctx.moveTo(-CROSS_LEN / 2 - 20, -CROSS_W / 2 + i)
    ctx.lineTo(-CROSS_LEN / 2,       -CROSS_W / 2 + i + 20)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(CROSS_LEN / 2,        -CROSS_W / 2 + i)
    ctx.lineTo(CROSS_LEN / 2 + 20,   -CROSS_W / 2 + i + 20)
    ctx.stroke()
  }

  ctx.restore()
}
```

- [ ] **Step 3: Add `drawPedestrian` export function**

Add before the final closing lines of the file (after `drawAdverseOverlay` or the last export):

```typescript
export function drawPedestrian(
  ctx: CanvasRenderingContext2D,
  ped: { id: string; x: number; y: number; state: string; compliant: boolean },
  cfg: RenderConfig
): void {
  const [px, py] = worldToCanvas(ped.x, ped.y, cfg)

  // Color by state
  const color =
    ped.state === 'crossing_1' || ped.state === 'crossing_2'
      ? (ped.compliant ? '#06b6d4' : '#ef4444')  // cyan=compliant, red=non-compliant
      : '#f59e0b'                                  // amber=waiting/at_median

  ctx.save()
  ctx.fillStyle = color
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.arc(px, py, 3.5, 0, Math.PI * 2)
  ctx.fill()

  // White center dot
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.arc(px, py, 1.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}
```

- [ ] **Step 4: Wire into `drawIntersection`**

In `drawIntersection`, find the line where `hasFreeLeft` is defined:
```typescript
  const hasFreeLeft = intersectionType === 'four_way_free_left' || ...
```

After the existing road drawing (after the `if (isTJunction)` or `if (isRoundabout)` sections draw the base roads, but before signals and labels), add:

```typescript
  // ── Free-left slip roads ───────────────────────────────────────────────────
  if (hasFreeLeft && !isRoundabout) {
    drawFreeleftSlip(ctx, cx, cy, rh)
  }

  // ── Indian pedestrian crossings ────────────────────────────────────────────
  // Draw zebra on all active arms (not roundabout)
  if (!isRoundabout && !isYJunction && !isSixArm) {
    const crossArms: ('N' | 'S' | 'E' | 'W')[] = isTJunction ? ['N', 'E', 'W'] : ['N', 'S', 'E', 'W']
    crossArms.forEach(arm => drawZebraCrossing(ctx, cx, cy, rh, arm))
  }
```

- [ ] **Step 5: TypeScript check**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2\frontend"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

---

## Task 6: Frontend types + SimCanvas draw pedestrians

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/components/SimCanvas.tsx`

- [ ] **Step 1: Add `PedestrianFrame` to types/index.ts**

At the end of `frontend/src/types/index.ts`, add:

```typescript
export interface PedestrianFrame {
  id:        string
  arm:       'N' | 'S' | 'E' | 'W'
  x:         number
  y:         number
  state:     'waiting' | 'crossing_1' | 'at_median' | 'crossing_2' | 'done'
  compliant: boolean
}
```

Also, in the existing `SimFrame` interface, add the optional field:
```typescript
  pedestrians?: PedestrianFrame[]
```

- [ ] **Step 2: Import `drawPedestrian` in SimCanvas.tsx**

In `SimCanvas.tsx`, find the import block from `'../canvas/renderer'`. Add `drawPedestrian` to the imports:

```typescript
import {
  clearCanvas,
  drawGrid,
  drawIntersection,
  drawVehicle,
  drawPedestrian,      // NEW
  drawTrafficSignals,
  drawSignalIndicator,
  drawAdverseOverlay,
  getDefaultRenderConfig,
} from '../canvas/renderer'
```

- [ ] **Step 3: Draw pedestrians in the render loop**

In `SimCanvas.tsx`, find the `if (frame) {` block. After `frame.vehicles.forEach((v) => drawVehicle(ctx, v, cfg))`, add:

```typescript
      // Draw pedestrian agents
      if (frame.pedestrians) {
        frame.pedestrians.forEach((p) => drawPedestrian(ctx, p, cfg))
      }
```

- [ ] **Step 4: TypeScript check**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2\frontend"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

---

## Task 7: Final regression pass

- [ ] **Step 1: Full backend test suite**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2"
python -m pytest backend/tests/ -q --tb=short 2>&1 | tail -10
```

Expected: all tests pass

- [ ] **Step 2: Pedestrian smoke test**

```bash
python -c "
from backend.api.socket_handlers import _SimWorld, _MockPedestrian

# Verify pedestrian system works end-to-end
w = _SimWorld(fixed_time=True, intersection_type='four_way')
for _ in range(500):
    w.step(0.05)

f = w.frame(1, 25.0, 'test')
print('vehicles:', len(f['vehicles']))
print('pedestrians:', len(f['pedestrians']))
print('pedestrian sample:', f['pedestrians'][:1])
assert 'pedestrians' in f
print('Pedestrian smoke test PASSED')
"
```

Expected:
```
vehicles: <N>
pedestrians: <M>
pedestrian sample: [{'id': 'ped_...', 'arm': '...', 'x': ..., 'y': ..., 'state': '...', 'compliant': False/True}]
Pedestrian smoke test PASSED
```

- [ ] **Step 3: Free-left smoke test**

```bash
python -c "
from backend.api.socket_handlers import _SimWorld

# Free-left intersection: bikes should thread through gaps
w = _SimWorld(fixed_time=True, intersection_type='four_way_free_left')
for _ in range(200):
    w.step(0.05)

f = w.frame(1, 10.0, 'test')
print('vehicles:', len(f['vehicles']))
bike_lats = [v['x'] if v['arm'] in ('N','S') else v['y']
             for v in f['vehicles'] if v['type_id'] in ('two_wheeler', 'delivery_bike')]
print('bike lateral positions:', bike_lats[:5])
print('Free-left smoke test PASSED')
"
```

Expected: bike_lats shows a spread of values (not all at same lane center)

- [ ] **Step 4: Final TypeScript check**

```bash
cd "D:\Nfinity\Project\WorkSpace\AI_Code\Project_Traffic\Project_T - Ver2\frontend"
npx tsc --noEmit 2>&1 | head -10
```

Expected: no output (no errors)
