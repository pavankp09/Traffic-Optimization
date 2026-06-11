"""
Socket.IO event handlers for Traffic Signal Optimizer.
All handlers are registered via init_socket_handlers(socketio, app).
"""
from __future__ import annotations

import logging
import math
import random
import threading
import time
import numpy as np
from collections import deque

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Server → Client event name constants
# ---------------------------------------------------------------------------
EVENTS = {
    "SIM_FRAME": "sim:frame",
    "TRAINING_EPISODE": "training:episode",
    "TRAINING_CONVERGED": "training:converged",
    "TRAINING_INSIGHT": "training:insight",
    "ADVERSE_EVENT": "adverse:event",
    "METRICS_UPDATE": "metrics:update",
    "SESSION_UPDATE": "session:update",
}

# ---------------------------------------------------------------------------
# Session state (module-level dict)
# ---------------------------------------------------------------------------
_session_states: dict[str, dict] = {}

# Background thread handles  (daemon threading.Thread objects)
_sim_greenlets: dict[str, object] = {}
_training_greenlets: dict[str, object] = {}
_runtime_snapshots: dict[str, dict] = {}

# Cache for pre-computed baseline data (keyed 'latest').
# Populated by the baseline:compute event (triggered from Baseline tab).
# Consumed by _run_real_training to avoid re-running baseline.
_baseline_cache: dict = {}  # 'latest' -> {mean_wait, throughput, demonstrations, controller}
_baseline_history: list[dict] = []  # List of all baseline run metrics and demonstrations



def get_session_state(session_id: str) -> dict:
    return _session_states.get(session_id, {"paused": False, "running": False})


def set_session_state(session_id: str, **kwargs) -> None:
    if session_id not in _session_states:
        _session_states[session_id] = {"paused": False, "running": False}
    _session_states[session_id].update(kwargs)


def get_runtime_snapshot(session_id: str) -> dict | None:
    """Return live runtime telemetry for a simulation session if available."""
    return _runtime_snapshots.get(session_id)


def _phase_to_lights(phase: int) -> dict[str, str]:
    """Map traffic signal phase to per-arm light colors."""
    if phase == 0:
        return {"N": "green", "S": "green", "E": "red", "W": "red"}
    if phase == 1:
        return {"N": "yellow", "S": "yellow", "E": "red", "W": "red"}
    if phase == 2:
        return {"N": "red", "S": "red", "E": "green", "W": "green"}
    if phase == 3:
        return {"N": "red", "S": "red", "E": "yellow", "W": "yellow"}
    return {"N": "red", "S": "red", "E": "red", "W": "red"}


def _update_runtime_snapshot(session_id: str, frame: dict) -> None:
    """Capture live status from the emitted frame for polling APIs."""
    snap = _runtime_snapshots.get(session_id)
    if snap is None:
        snap = {
            "session_id": session_id,
            "exited": 0,
            "prev_vehicle_ids": set(),
            "queue_history": deque(maxlen=900),
        }
        _runtime_snapshots[session_id] = snap

    vehicles = frame.get("vehicles", [])
    sim_time = float(frame.get("sim_time_s", 0.0) or 0.0)
    phase = int((frame.get("signals") or [{}])[0].get("phase", 4))

    curr_ids = {v.get("id") for v in vehicles if v.get("id") is not None}
    prev_ids = snap["prev_vehicle_ids"]
    exited_now = len(prev_ids - curr_ids)
    snap["exited"] += max(0, exited_now)
    snap["prev_vehicle_ids"] = curr_ids

    queue = {"N": 0, "S": 0, "E": 0, "W": 0}
    type_dist: dict[str, int] = {}
    wait_sum = 0.0

    for v in vehicles:
        arm = v.get("arm")
        if arm in queue and (v.get("speed", 0.0) or 0.0) < 1.0:
            queue[arm] += 1
        vt = str(v.get("type_id", "unknown"))
        type_dist[vt] = type_dist.get(vt, 0) + 1
        wait_sum += float(v.get("wait_time", 0.0) or 0.0)

    avg_wait = (wait_sum / len(vehicles)) if vehicles else 0.0
    throughput = (snap["exited"] / sim_time * 3600.0) if sim_time > 0 else 0.0

    snap["queue_history"].append(
        {
            "t": round(sim_time, 1),
            "N": int(queue["N"]),
            "S": int(queue["S"]),
            "E": int(queue["E"]),
            "W": int(queue["W"]),
        }
    )

    snap.update(
        {
            "session_id": session_id,
            "sim_time": round(sim_time, 1),
            "phase": phase,
            "lights": _phase_to_lights(phase),
            "queue": queue,
            "active": len(vehicles),
            "avg_wait": round(avg_wait, 1),
            "throughput": round(throughput, 0),
            "type_dist": type_dist,
            "queue_history": list(snap["queue_history"]),
            "sim_status": "running" if _session_states.get(session_id, {}).get("running") else "done",
        }
    )


# ---------------------------------------------------------------------------
# Mock simulation helpers
# ---------------------------------------------------------------------------

_VEHICLE_TYPES = [
    "car", "car", "car",
    "two_wheeler", "two_wheeler",
    "auto_rickshaw", "auto_rickshaw",
    "cab", "ev_scooter",
    "delivery_bike", "tsrtc_bus", "truck",
]

# Phase → arms currently showing green
_PHASE_GREEN: dict[int, set] = {
    0: {"N", "S"},  # N-S straight green
    1: set(),       # N-S yellow → all yield
    2: {"E", "W"},  # E-W straight green
    3: set(),       # E-W yellow → all yield
    4: set(),       # all-red
}
_PHASE_DURATIONS = [28.0, 4.0, 28.0, 4.0, 2.0]


def get_arm_angle(arm: str, intersection_type: str) -> float:
    import math
    if intersection_type in ("y_junction", "y_junction_free_left"):
        if arm == "N": return -math.pi / 2
        if arm == "E": return math.pi / 6      # SE
        if arm == "W": return 5 * math.pi / 6  # SW
    elif intersection_type in ("six_arm", "six_arm_free_left"):
        if arm == "E": return 0
        if arm == "S": return math.pi / 3      # SE
        if arm == "W": return math.pi
        if arm == "N": return 5 * math.pi / 3  # NE
    # Default 4-way / Roundabout / T-junction
    if arm == "N": return -math.pi / 2
    if arm == "S": return math.pi / 2
    if arm == "E": return 0
    if arm == "W": return math.pi
    return 0.0


def get_exit_arm(spawn_arm: str, turn_dir: str, intersection_type: str) -> str:
    if intersection_type in ("y_junction", "y_junction_free_left"):
        if spawn_arm == "N": return "W" if turn_dir == "left" else "E"
        if spawn_arm == "E": return "N" if turn_dir == "left" else "W"
        if spawn_arm == "W": return "E" if turn_dir == "left" else "N"
    elif intersection_type in ("six_arm", "six_arm_free_left"):
        if turn_dir == "straight":
            if spawn_arm == "N": return "S"  # NE -> SW
            if spawn_arm == "S": return "W"  # SE -> NW
            if spawn_arm == "E": return "W"  # E -> W
            if spawn_arm == "W": return "E"  # W -> E
        elif turn_dir == "left":
            if spawn_arm == "N": return "E"
            if spawn_arm == "S": return "E"
            if spawn_arm == "E": return "N"
            if spawn_arm == "W": return "N"
        else: # right
            if spawn_arm == "N": return "W"
            if spawn_arm == "S": return "S"
            if spawn_arm == "E": return "S"
            if spawn_arm == "W": return "S"
    elif intersection_type in ("t_junction", "t_junction_free_left"):
        if spawn_arm == "N": return "W" if turn_dir == "left" else "E"
        if spawn_arm == "E": return "N" if turn_dir == "left" else "W"
        if spawn_arm == "W": return "E" if turn_dir == "left" else "N"
    # 4-way default
    if spawn_arm == "N": return "E" if turn_dir == "right" else ("W" if turn_dir == "left" else "S")
    if spawn_arm == "S": return "W" if turn_dir == "right" else ("E" if turn_dir == "left" else "N")
    if spawn_arm == "E": return "S" if turn_dir == "right" else ("N" if turn_dir == "left" else "W")
    if spawn_arm == "W": return "N" if turn_dir == "right" else ("S" if turn_dir == "left" else "E")
    return "N"


def intersect_lines(p1: tuple[float, float], d1: tuple[float, float], p2: tuple[float, float], d2: tuple[float, float]) -> tuple[float, float]:
    denom = d1[0] * (-d2[1]) - d1[1] * (-d2[0])
    if abs(denom) < 1e-5:
        return ((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)
    t1 = ((p2[0] - p1[0]) * (-d2[1]) - (p2[1] - p1[1]) * (-d2[0])) / denom
    return (p1[0] + t1 * d1[0], p1[1] + t1 * d1[1])


_STOP_DIST  = 19.8  # world units from centre to stop line (STOP_PX=99 / scale=5 = 19.8)
_MOVE_SPEED = 14.0  # world units/s — increased for visible flow at 10k vph / 5× speed
_SPAWN_DIST = 78.0  # initial spawn distance — longer approach visible on wider canvas

# Arms that ACTUALLY cross each other's path in a 4-way intersection.
# N↔S share the same green phase but travel in opposite lanes — they are
# parallel, never conflict.  Same for E↔W.  Only perpendicular pairs conflict.
_CROSS_CONFLICTS: dict[str, frozenset] = {
    "N": frozenset({"E", "W"}),
    "S": frozenset({"E", "W"}),
    "E": frozenset({"N", "S"}),
    "W": frozenset({"N", "S"}),
}

# Lane lateral offsets per arm (left-hand traffic, India).
# Road half-width = 14.4 wu (STOP_PX=72, scale=5). Median = 1.6 wu (MEDIAN_PX=8).
# Three lanes per direction at 4.2 wu each (LANE_W_PX=21, scale=5).
# Lane centres from the centreline:
#   Lane 0 (inner)  = 1.6 + 2.1  = 3.7 wu
#   Lane 1 (middle) = 1.6 + 6.3  = 7.9 wu
#   Lane 2 (outer)  = 1.6 + 10.5 = 12.1 wu
_LANE_OFFSETS: dict[str, list] = {
    "N": [3.7, 7.9, 12.1],     # southbound: east side of road
    "S": [-3.7, -7.9, -12.1],  # northbound: west side
    "E": [3.7, 7.9, 12.1],     # westbound:  south side
    "W": [-3.7, -7.9, -12.1],  # eastbound:  north side
}
_N_LANES = 3

# Inner-lane lateral offset reused by the turn bezier.
_LANE_INNER = 3.7

# Valid lateral range per arm — vehicles must stay within their side of the road
# Median starts at 1.6wu from centre; outer edge is 13.8wu (leaving 0.6wu kerb buffer)
_LANE_RANGE: dict[str, tuple[float, float]] = {
    "N": ( 1.6,  13.8),   # N arm (southbound): positive x only
    "S": (-13.8, -1.6),   # S arm (northbound): negative x only
    "E": ( 1.6,  13.8),   # E arm (westbound):  positive y only
    "W": (-13.8, -1.6),   # W arm (eastbound):  negative y only
}

# Approximate vehicle body length (world units) for car-following gap
_VEH_LEN: dict[str, float] = {
    "car": 4.0, "cab": 4.2, "ev_scooter": 2.2, "two_wheeler": 2.0,
    "delivery_bike": 2.2, "auto_rickshaw": 3.0, "e_rickshaw": 3.2,
    "tsrtc_bus": 9.5, "school_bus": 7.5, "truck": 8.5,
}

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
_LAT_STEER_RATE = 6.0 # wu/s lateral steering speed for gap-seeking (aggressive Indian weave)


class _MockVehicle:
    """Synthetic vehicle with per-length stopping, turning, and bezier path support."""

    def __init__(self, vid: str, arm: str | None = None, lane: int = 0, intersection_type: str = "four_way"):
        self.id = vid
        self.type_id = random.choice(_VEHICLE_TYPES)
        self.arm = arm or random.choice(["N", "S", "E", "W"])
        self.lane = lane
        self.wait_time = 0.0
        self.through = False
        self.intersection_type = intersection_type
        self.angle: float | None = None  # overrides frontend ARM_ANGLE when set
        self.stuck_s = 0.0  # accumulated sim-seconds at speed=0 (ghost-creep safety counter)

        # Per-vehicle stop distances — front of vehicle aligns with stop line
        half_len = _VEH_LEN.get(self.type_id, 4.0) / 2.0
        # +1.0 buffer catches the worst-case discrete-step overshoot (step = speed*dt = 1 wu)
        self.stop_zone    = _STOP_DIST + half_len + 1.0
        # Commit once centre is well inside the box; must be < stop_zone - 1.0 (one step)
        self.through_dist = _STOP_DIST + half_len - 1.5

        # Turn: 88% straight, 5% right, 7% left (from driver's perspective).
        # Reduced from 25% → 12% total turns to keep the intersection box
        # clear and maintain continuous flow through the canvas.
        r = random.random()
        self.turn_dir: str = "straight" if r < 0.88 else ("right" if r < 0.93 else "left")

        # Roundabout setup:
        self.roundabout = intersection_type in ("roundabout", "roundabout_free_left")
        self.roundabout_state = "approach" if self.roundabout else None
        self.roundabout_phi = 0.0
        self.roundabout_target_phi = 0.0
        self.roundabout_exit_d = 0.0

        self.turning   = False          # True once bezier path is active
        self.turn_t    = 0.0            # 0 → 1 along bezier
        self.b_p0: tuple | None = None  # bezier control points
        self.b_p1: tuple | None = None
        self.b_p2: tuple | None = None
        self.exit_arm: str | None = None
        self.exit_dx = 0
        self.exit_dy = 0

        # Type-specific speed with ±15% variance
        base_spd = _TYPE_SPEED.get(self.type_id, _MOVE_SPEED)
        self.speed = max(4.0, base_spd * random.gauss(1.0, 0.15))

        # Indian lane discipline: bikes/autos ignore lanes completely —
        # they spawn at a random lateral position across the full road.
        # Cars/buses still use lane centres with drift.
        ROAD_HW = 14.4   # half road width in world units
        self.weave_phase = random.uniform(0, 2 * math.pi)
        self.red_runner: bool = False
        self.free_left: bool = False

        # Correct side of road for this arm
        lo, hi = 1.6, 13.8

        my_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
        if self.type_id in _BIKE_TYPES or self.type_id == "auto_rickshaw":
            # No lane discipline: random anywhere within this arm's road side
            offset = random.uniform(lo + my_hw + 0.1, hi - my_hw - 0.1)
        else:
            freedom = _LAT_FREEDOM.get(self.type_id, 1.0)
            base = 3.7 if (lane % _N_LANES == 0) else (7.9 if (lane % _N_LANES == 1) else 12.1)
            offset = max(lo + my_hw + 0.1, min(hi - my_hw - 0.1, base + random.uniform(-freedom, freedom)))

        self.lat_drift  = offset   # keep for reference
        self.lat_target = offset   # gap-seeking target
        spread = random.uniform(2, 18)

        # Generic geometry calculations based on angle
        theta = get_arm_angle(self.arm, intersection_type)
        self.dx = -math.cos(theta)
        self.dy = -math.sin(theta)

        w = abs(offset)
        d = _SPAWN_DIST + spread
        self.x = d * math.cos(theta) - w * math.sin(theta)
        self.y = d * math.sin(theta) + w * math.cos(theta)
        self.angle = math.atan2(self.dy, self.dx)

    # ------------------------------------------------------------------ #
    # Turn bezier setup (called once when vehicle commits to intersection) #
    # ------------------------------------------------------------------ #
    def _setup_turn(self, intersection_type: str = "four_way") -> None:
        if self.turn_dir == "straight" or self.b_p0 is not None:
            return
        r = 11.0  # exit-lane target distance from centre
        a = self.arm
        td = self.turn_dir
        
        has_free_left = intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left")
        if has_free_left and td == "left":
            self.free_left = True

        # 1. Determine exit arm and direction
        self.exit_arm = get_exit_arm(a, td, intersection_type)
        exit_theta = get_arm_angle(self.exit_arm, intersection_type)
        self.exit_dx = math.cos(exit_theta)
        self.exit_dy = math.sin(exit_theta)

        # 2. Determine target lane offset on exit arm.
        offsets = [3.7, 7.9, 12.1]
        if has_free_left and td == "left":
            self.exit_lane = 1
        else:
            self.exit_lane = self.lane % _N_LANES
            
        exit_lane_center = 7.9 if (has_free_left and td == "left") else offsets[self.exit_lane]

        # Calculate deviation relative to starting lane center
        start_lane_center = offsets[self.lane % _N_LANES]
        deviation = self.lat_drift - start_lane_center
        self.exit_lat_drift = exit_lane_center + deviation

        ex_lo, ex_hi = 1.6, 13.8
        ex_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
        self.exit_lat_drift = max(ex_lo + ex_hw, min(ex_hi - ex_hw, self.exit_lat_drift))

        # 3. Setup control points based on starting and exit arms
        self.b_p0 = (self.x, self.y)
        
        d_exit = 22.0 if self.free_left else r
        target_x = d_exit * math.cos(exit_theta) - self.exit_lat_drift * math.sin(exit_theta)
        target_y = d_exit * math.sin(exit_theta) + self.exit_lat_drift * math.cos(exit_theta)
        self.b_p2 = (target_x, target_y)

        # Find b_p1 as the intersection of start arm approach line and exit arm exit line
        spawn_theta = get_arm_angle(a, intersection_type)
        self.b_p1 = intersect_lines(
            self.b_p0, 
            (-math.cos(spawn_theta), -math.sin(spawn_theta)), 
            self.b_p2, 
            (math.cos(exit_theta), math.sin(exit_theta))
        )

        self.turning = True
        self.turn_t  = 0.0

    def _find_best_lane(self, world_vehicles: list) -> float | None:
        """
        Scan the 3 actual lanes on the current arm, measure the clearance
        ahead in each lane, and return the center of the lane with the most space.
        """
        if self.turning or self.through:
            return None

        theta = get_arm_angle(self.arm, self.intersection_type)
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)

        # Inward direction, longitudinal is distance to center, lateral is positive offset
        my_long = self.x * cos_t + self.y * sin_t
        my_lat  = -self.x * sin_t + self.y * cos_t
        offsets = [3.7, 7.9, 12.1]
        
        LOOK_AHEAD = 35.0
        lane_clearance = [LOOK_AHEAD, LOOK_AHEAD, LOOK_AHEAD]
        lane_width = 4.2
        my_hl = _VEH_LEN.get(self.type_id, 4.0) / 2.0
        
        for lane_idx in range(_N_LANES):
            lane_center = offsets[lane_idx]
            
            # If checking a different lane, make sure it is safe to enter (no vehicle beside or immediately behind/ahead)
            if lane_idx != self.lane % _N_LANES:
                is_lane_safe = True
                for v in world_vehicles:
                    if v is self or v.arm != self.arm or v.through or v.turning:
                        continue
                    v_long = v.x * cos_t + v.y * sin_t
                    v_lat  = -v.x * sin_t + v.y * cos_t
                    v_hw   = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                    v_hl   = _VEH_LEN.get(v.type_id, 4.0) / 2.0
                    
                    # Check if this vehicle is physically occupying/overlapping the target lane
                    if abs(v_lat - lane_center) < (v_hw + lane_width / 2.0 - 0.2):
                        # Calculate longitudinal difference
                        long_diff = abs(v_long - my_long)
                        # If vehicle is beside or too close behind/ahead in the target lane (e.g. 3.0 units buffer)
                        if long_diff < (my_hl + v_hl + 3.0):
                            is_lane_safe = False
                            break
                        # If vehicle is ahead (closer to center, so smaller long)
                        if v_long < my_long:
                            long_dist = my_long - v_long
                            if long_dist <= LOOK_AHEAD:
                                lane_clearance[lane_idx] = min(lane_clearance[lane_idx], long_dist)
                if not is_lane_safe:
                    lane_clearance[lane_idx] = -1.0
            else:
                # Own lane: only scan for blockers ahead
                for v in world_vehicles:
                    if v is self or v.arm != self.arm or v.through or v.turning:
                        continue
                    v_long = v.x * cos_t + v.y * sin_t
                    v_lat  = -v.x * sin_t + v.y * cos_t
                    v_hw   = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                    
                    if v_long >= my_long:
                        continue
                    long_dist = my_long - v_long
                    if long_dist > LOOK_AHEAD:
                        continue
                    
                    if abs(v_lat - lane_center) < (v_hw + lane_width / 2.0 - 0.2):
                        lane_clearance[lane_idx] = min(lane_clearance[lane_idx], long_dist)
                        
        # Find lane with the most clearance
        best_lane_idx = max(range(_N_LANES), key=lambda i: lane_clearance[i])
        best_clearance = lane_clearance[best_lane_idx]
        
        my_clearance = lane_clearance[self.lane % _N_LANES]
        
        # Only change lane if we actually have a blocker/vehicle ahead of us in our current lane
        if my_clearance > 20.0:
            return None
            
        # Only change lane if the target lane offers a significant advantage (e.g. > 4.0 units more clearance)
        if best_clearance < my_clearance + 4.0:
            return None
            
        return offsets[best_lane_idx]

    def _find_lateral_gap(self, world_vehicles: list) -> float | None:
        """
        Find a lateral offset on the current arm that has sufficient gap to any blocker.
        """
        theta = get_arm_angle(self.arm, self.intersection_type)
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)
        
        my_long = self.x * cos_t + self.y * sin_t
        my_lat  = -self.x * sin_t + self.y * cos_t
        lo, hi  = 1.6, 13.8
        
        # Scan lateral positions in candidate increments to find a clear path
        best_offset = None
        max_dist = -1.0
        
        steps = 15
        for i in range(steps + 1):
            cand = lo + (hi - lo) * (i / steps)
            
            # Check clearance at this candidate lateral position
            clearance = 35.0
            for v in world_vehicles:
                if v is self or v.arm != self.arm or v.through or v.turning:
                    continue
                v_long = v.x * cos_t + v.y * sin_t
                v_lat  = -v.x * sin_t + v.y * cos_t
                v_hl   = _VEH_LEN.get(v.type_id, 4.0) / 2.0
                v_hw   = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                
                # Check vehicles that are ahead of us
                if v_long >= my_long:
                    continue
                long_dist = my_long - v_long
                if long_dist > 35.0:
                    continue
                
                # Lateral overlap check
                my_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
                if abs(v_lat - cand) < (v_hw + my_hw + 0.3):
                    clearance = min(clearance, long_dist - v_hl)
                    
            if clearance > max_dist:
                max_dist = clearance
                best_offset = cand
                
        if max_dist > 6.0:
            return best_offset
        return None

    @staticmethod
    def _beval(p0, p1, p2, t: float) -> tuple:
        """Quadratic bezier position."""
        u = 1.0 - t
        return (u*u*p0[0] + 2*u*t*p1[0] + t*t*p2[0],
                u*u*p0[1] + 2*u*t*p1[1] + t*t*p2[1])

    @staticmethod
    def _btangent(p0, p1, p2, t: float) -> tuple:
        """Quadratic bezier tangent (unnormalised)."""
        u = 1.0 - t
        return (2*u*(p1[0]-p0[0]) + 2*t*(p2[0]-p1[0]),
                2*u*(p1[1]-p0[1]) + 2*t*(p2[1]-p1[1]))

    # ------------------------------------------------------------------ #
    # Per-frame update                                                     #
    # ------------------------------------------------------------------ #
    def update(self, dt: float, green_arms: set, same_lane: list,
               vehicles_in_box: list, intersection_type: str = "four_way",
               ped_blocking: bool = False, side_blocked: bool = False) -> bool:
        """Return True when the vehicle has fully exited the scene.
        """
        # Committed vehicles must NEVER stop for side_blocked — they must
        # always clear the intersection box.  Only approach vehicles respect it.
        if ped_blocking or (side_blocked and not self.through):
            self.speed = 0.0
            return self._check_exit()

        if self.roundabout_state == "circulating":
            if ped_blocking or (side_blocked and not self.through):
                self.speed = 0.0
                return self._check_exit()

            if self.speed < 0.1:
                self.wait_time += dt

            R = 12.4 - (self.lane % _N_LANES) * 1.4 - 0.8
            lead_dist = float("inf")
            half_self = _VEH_LEN.get(self.type_id, 4.0) / 2.0
            lead_hl = 0.0

            for other in same_lane:
                if other is self:
                    continue
                if other.roundabout and other.roundabout_state == "circulating":
                    if other.lane % _N_LANES == self.lane % _N_LANES:
                        angle_diff = (other.roundabout_phi - self.roundabout_phi) % (2 * math.pi)
                        if 0 < angle_diff < math.pi * 2 / 3:
                            gap = R * angle_diff - half_self - _VEH_LEN.get(other.type_id, 4.0) / 2.0
                            if gap < lead_dist:
                                lead_dist = gap
                                lead_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0

            SAFE_GAP = 2.0
            BRAKE_GAP = 8.0
            if lead_dist < 18.0:
                bumper_gap = lead_dist
                if bumper_gap <= SAFE_GAP:
                    self.speed = 0.0
                elif bumper_gap < BRAKE_GAP:
                    ratio = (bumper_gap - SAFE_GAP) / (BRAKE_GAP - SAFE_GAP)
                    self.speed = _MOVE_SPEED * ratio
                else:
                    self.speed = _MOVE_SPEED
            else:
                self.speed = _MOVE_SPEED

            # Move vehicle along circle
            d_phi = (self.speed * dt) / R
            self.roundabout_phi += d_phi

            self.x = R * math.cos(self.roundabout_phi)
            self.y = R * math.sin(self.roundabout_phi)
            self.dx = -math.sin(self.roundabout_phi)
            self.dy = math.cos(self.roundabout_phi)
            self.angle = self.roundabout_phi + math.pi / 2.0

            # Check exit transition
            if self.roundabout_phi >= self.roundabout_target_phi - 0.1:
                self.roundabout_state = "exit"
                self.arm = self.exit_arm
                exit_theta = get_arm_angle(self.exit_arm, intersection_type)
                self.dx = math.cos(exit_theta)
                self.dy = math.sin(exit_theta)
                self.angle = math.atan2(self.dy, self.dx)

                offsets = [3.7, 7.9, 12.1]
                w = offsets[self.lane % _N_LANES]
                self.lat_drift = w
                self.x = R * math.cos(exit_theta) - w * math.sin(exit_theta)
                self.y = R * math.sin(exit_theta) + w * math.cos(exit_theta)

            return self._check_exit()

        # Accumulate wait time if the vehicle was stopped in the previous step
        if self.speed < 0.1 and not self.through:
            self.wait_time += dt

        # ── Bezier turn (active) ───────────────────────────────────────
        # Turning vehicles slow / stop for nearby straight vehicles to avoid
        # overlaps, just like straight-running car-following.
        if self.turning:
            hl_self   = _VEH_LEN.get(self.type_id, 4.0) / 2.0
            TURN_CLEAR = 4.0  # world units — start braking below this gap
            speed_mult = 1.0
            
            tx, ty = self.exit_dx, self.exit_dy
            proj_self = self.x * tx + self.y * ty

            for other in same_lane:
                if other is self:
                    continue
                
                # Check 1: turn-vs-turn priority for crossing paths
                if other.turning and other.exit_arm != self.exit_arm:
                    if (other.turn_t, other.id) < (self.turn_t, self.id):
                        continue
                    ddx = self.x - other.x
                    ddy = self.y - other.y
                    dist = math.hypot(ddx, ddy)
                    gap  = dist - hl_self - _VEH_LEN.get(other.type_id, 4.0) / 2.0
                    if gap <= 0:
                        speed_mult = 0.0
                        break
                    if gap < TURN_CLEAR:
                        speed_mult = min(speed_mult, gap / TURN_CLEAR)
                    continue

                # Check 2: Same travel direction (sequential flow or merging onto exit arm)
                other_dx = other.exit_dx if other.turning else other.dx
                other_dy = other.exit_dy if other.turning else other.dy
                if other_dx == tx and other_dy == ty:
                    proj_other = other.x * tx + other.y * ty
                    # If other is ahead of self
                    if proj_other > proj_self:
                        # Check lateral overlap
                        lx, ly = -ty, tx
                        lat_self = self.x * lx + self.y * ly
                        lat_other = other.x * lx + other.y * ly
                        v_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
                        o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0
                        
                        if abs(lat_self - lat_other) < (v_hw + o_hw + 0.3):
                            o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0
                            gap = (proj_other - proj_self) - hl_self - o_hl
                            if gap <= 0.8:
                                speed_mult = 0.0
                                break
                            if gap < TURN_CLEAR:
                                speed_mult = min(speed_mult, gap / TURN_CLEAR)
                    continue

                # Check 3: Crossing straight vehicles from other arms in the box
                if not other.turning and other in vehicles_in_box and other.arm != self.arm:
                    ddx = self.x - other.x
                    ddy = self.y - other.y
                    dist = math.hypot(ddx, ddy)
                    gap  = dist - hl_self - _VEH_LEN.get(other.type_id, 4.0) / 2.0
                    if gap <= 0:
                        speed_mult = 0.0
                        break
                    if gap < TURN_CLEAR:
                        speed_mult = min(speed_mult, gap / TURN_CLEAR)

            # Turning vehicles creep forward at ≥30% speed to prevent gridlocks,
            # but MUST stop completely if they are about to overlap (gap <= 0.8 wu).
            if speed_mult < 0.30 and speed_mult > 0.0:
                # Find the minimum gap among all conflicting vehicles to be sure
                min_gap = float("inf")
                for other in same_lane:
                    if other is self:
                        continue
                    if other.turning and other.exit_arm != self.exit_arm:
                        if (other.turn_t, other.id) < (self.turn_t, self.id):
                            continue
                        ddx = self.x - other.x
                        ddy = self.y - other.y
                        gap = math.hypot(ddx, ddy) - hl_self - _VEH_LEN.get(other.type_id, 4.0) / 2.0
                        min_gap = min(min_gap, gap)
                    elif not other.turning and other in vehicles_in_box and other.arm != self.arm:
                        ddx = self.x - other.x
                        ddy = self.y - other.y
                        gap = math.hypot(ddx, ddy) - hl_self - _VEH_LEN.get(other.type_id, 4.0) / 2.0
                        min_gap = min(min_gap, gap)
                    else:
                        other_dx = other.exit_dx if other.turning else other.dx
                        other_dy = other.exit_dy if other.turning else other.dy
                        if other_dx == tx and other_dy == ty:
                            proj_other = other.x * tx + other.y * ty
                            if proj_other > proj_self:
                                lx, ly = -ty, tx
                                lat_self = self.x * lx + self.y * ly
                                lat_other = other.x * lx + other.y * ly
                                v_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
                                o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0
                                if abs(lat_self - lat_other) < (v_hw + o_hw + 0.3):
                                    o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0
                                    gap = (proj_other - proj_self) - hl_self - o_hl
                                    min_gap = min(min_gap, gap)

                if min_gap <= 0.8:
                    speed_mult = 0.0
                else:
                    speed_mult = max(0.30, speed_mult)

            self.speed = _MOVE_SPEED * 0.7 * speed_mult
            self.turn_t = min(1.0, self.turn_t + dt * self.speed / 25.0)
            bx, by = self._beval(self.b_p0, self.b_p1, self.b_p2, self.turn_t)
            self.x, self.y = bx, by
            # Update heading angle regardless of speed so vehicle faces turn direction
            tx_tan, ty_tan = self._btangent(self.b_p0, self.b_p1, self.b_p2, self.turn_t)
            self.angle = math.atan2(ty_tan, tx_tan)
            if self.turn_t >= 1.0:
                self.arm     = self.exit_arm
                self.lane    = self.exit_lane
                self.lat_drift = self.exit_lat_drift
                self.dx, self.dy = self.exit_dx, self.exit_dy
                self.angle   = math.atan2(self.dy, self.dx)
                self.turning = False
                self.through = True
            return self._check_exit()

        # ── Commit flag (set once, before stop-zone calc) ─────────────
        if not self.through:
            dist_from_centre = math.hypot(self.x, self.y)
            has_free_left = intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left")
            commit_d = 22.0 if (has_free_left and self.turn_dir == "left") else self.through_dist
            if dist_from_centre < commit_d:
                self.through = True
                if self.roundabout:
                    self.roundabout_state = "circulating"
                    entry_phi = get_arm_angle(self.arm, intersection_type)
                    self.roundabout_phi = entry_phi
                    self.exit_arm = get_exit_arm(self.arm, self.turn_dir, intersection_type)
                    exit_phi = get_arm_angle(self.exit_arm, intersection_type)
                    delta_phi = (exit_phi - entry_phi) % (2 * math.pi)
                    if delta_phi == 0.0:
                        delta_phi = 2 * math.pi
                    self.roundabout_target_phi = entry_phi + delta_phi
                    # Initialize circle coordinate position
                    R = 12.4 - (self.lane % _N_LANES) * 1.4 - 0.8
                    self.x = R * math.cos(entry_phi)
                    self.y = R * math.sin(entry_phi)
                    self.dx = -math.sin(entry_phi)
                    self.dy = math.cos(entry_phi)
                    self.angle = entry_phi + math.pi / 2.0
                    return self._check_exit()
                elif self.turn_dir != "straight":
                    self._setup_turn(intersection_type)
                    return self._check_exit()

        # ── Stop-zone / signal check ───────────────────────────────────
        dist_to_center = math.hypot(self.x, self.y)
        at_stop = (dist_to_center <= self.stop_zone) and not self.through

        # Scenario 1 — red signal / roundabout yield
        if at_stop:
            if self.roundabout:
                entry_phi = get_arm_angle(self.arm, intersection_type)
                yield_active = False
                for other in same_lane:
                    if other is self:
                        continue
                    if other.roundabout and other.roundabout_state == "circulating":
                        angle_diff = (entry_phi - other.roundabout_phi) % (2 * math.pi)
                        if 0 < angle_diff < math.pi / 3.0:
                            yield_active = True
                            break
                if yield_active:
                    self.speed = 0.0
                    return False
            elif self.arm not in green_arms:
                if self.lane == 2 and self.turn_dir == "left" and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"):
                    pass
                else:
                    self.speed = 0.0
                    return False

        # Scenario 3 — entry gate (deadlock-free intersection model).
        # Only one axis may occupy the box at a time. A green vehicle holds at
        # the stop line while ANY perpendicular vehicle is still committed inside
        # the box (a straggler from the just-ended phase). Because committed
        # vehicles never stop for cross traffic (see below), the box always
        # drains, so this gate releases promptly and can never deadlock.
        if at_stop and self.arm in green_arms:
            if self.lane == 2 and self.turn_dir == "left" and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"):
                pass
            elif self.stuck_s <= 3.0:   # timeout — after 3 s let vehicle proceed
                perp_arms = _CROSS_CONFLICTS.get(self.arm, frozenset())
                for other in vehicles_in_box:
                    if other is not self and other.arm in perp_arms:
                        self.speed = 0.0
                        return False

        # Scenario 4 — left-turn yield
        # Only yield to *currently-green* straight traffic from the arms that
        # actually cross this vehicle's turning path (perpendicular arms).
        # Stale committed vehicles from an ended phase are ignored so they don't
        # cause indefinite blocking.
        if at_stop and self.turn_dir == "left" and self.arm in green_arms:
            if self.lane == 2 and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"):
                pass
            elif self.stuck_s <= 3.0:   # timeout — same 3 s gate as Scenario 3
                conflicting = _CROSS_CONFLICTS.get(self.arm, frozenset())
                for v in vehicles_in_box:
                    if (v is not self
                            and v.turn_dir == "straight"
                            and v.arm in conflicting
                            and v.arm in green_arms):
                        self.speed = 0.0
                        return False

        # Committed vehicles NEVER stop for cross traffic — they always clear the
        # box. Overlaps are prevented upstream by the entry gate (Scenario 3),
        # which keeps the conflicting axis waiting at the stop line until the box
        # is empty. Letting a committed vehicle stop mid-box is exactly what
        # caused gridlock: two perpendicular vehicles each yielding to the other
        # froze the whole intersection.

        # ── Car-following — Scenario 2 (2D Physical Collision Avoidance) ──
        # Scan all vehicles in the world to find physical blockers directly ahead
        # of us on our path. This prevents overlaps on both approach and exit arms,
        # and during merges.
        SAFE_GAP  = 2.0
        BRAKE_GAP = 8.0
        half_self = _VEH_LEN.get(self.type_id, 4.0) / 2.0
        lead_dist = float("inf")
        lead_hl = 0.0

        tx, ty = self.dx, self.dy
        proj_self = self.x * tx + self.y * ty

        for other in same_lane:  # same_lane now contains all world vehicles
            if other is self:
                continue
            
            # Filter other vehicles to only check those moving in the same direction
            other_dx = other.exit_dx if other.turning else other.dx
            other_dy = other.exit_dy if other.turning else other.dy
            if other_dx != tx or other_dy != ty:
                continue

            # Project relative position along our forward travel vector
            proj_other = other.x * tx + other.y * ty

            # If other is ahead of us along our path
            if proj_other > proj_self:
                # Check lateral overlap
                lx, ly = -ty, tx
                lat_self = self.x * lx + self.y * ly
                lat_other = other.x * lx + other.y * ly
                v_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
                o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0

                if abs(lat_self - lat_other) < (v_hw + o_hw + 0.3):
                    long_dist = proj_other - proj_self
                    if long_dist < lead_dist:
                        lead_dist = long_dist
                        lead_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0

        if lead_dist < 18.0:
            bumper_gap = lead_dist - half_self - lead_hl

            if bumper_gap <= SAFE_GAP:
                self.speed = 0.0
                return self._check_exit()

            if bumper_gap < BRAKE_GAP:
                ratio = (bumper_gap - SAFE_GAP) / (BRAKE_GAP - SAFE_GAP)
                self.speed = _MOVE_SPEED * ratio
            else:
                self.speed = _MOVE_SPEED
                
            # Clamp movement to strictly respect the SAFE_GAP boundary
            max_move = max(0.0, bumper_gap - SAFE_GAP)
            move_dist = min(self.speed * dt, max_move)
            self.x += self.dx * move_dist
            self.y += self.dy * move_dist
            return self._check_exit()

        self.speed = _MOVE_SPEED
        self.x += self.dx * self.speed * dt
        self.y += self.dy * self.speed * dt
        return self._check_exit()

    def _dist_ahead(self, other: "_MockVehicle") -> float:
        return (other.x - self.x) * self.dx + (other.y - self.y) * self.dy

    def _check_exit(self) -> bool:
        e = _SPAWN_DIST + 12
        return math.hypot(self.x, self.y) > e

    def to_dict(self) -> dict:
        curr_x, curr_y = self.x, self.y
        if not self.turning and not self.through:
            import math
            lx, ly = -self.dy, self.dx
            long_pos = self.x * self.dx + self.y * self.dy
            weave = 0.15 * math.sin(self.weave_phase + long_pos * 0.2)
            curr_x = self.x + lx * weave
            curr_y = self.y + ly * weave

        d = {
            "id":        self.id,
            "type_id":   self.type_id,
            "x":         round(curr_x, 2),
            "y":         round(curr_y, 2),
            "speed":     round(self.speed, 2),
            "wait_time": round(self.wait_time, 1),
            "lane":      f"{self.arm.lower()}_{self.lane}",
            "arm":       self.arm,
            "turn":      self.turn_dir,
        }
        if self.angle is not None:
            d["angle"] = round(self.angle, 4)
        return d


class _MockPedestrian:
    """
    Indian pedestrian agent crossing a road arm.
    States: waiting → crossing_1 → at_median → crossing_2 → done
    Compliance: 15% wait for signal (compliant), 85% cross when gap >= 18 wu.
    Staggered crossing: always cross to median first, pause, then cross second half.
    """

    _ped_counter = 0

    def __init__(self, arm: str, intersection_type: str = "four_way"):
        _MockPedestrian._ped_counter += 1
        self.id = f"ped_{_MockPedestrian._ped_counter:04d}"
        self.arm = arm
        # Crossing position: cluster exactly on the zebra crossing stripes
        self.cross_long = random.uniform(16.0, 19.2)
        # Start at road edge (inner side of footpath) — just visible on canvas
        self.lateral = 13.0
        self.state = "waiting"
        self.compliant = random.random() < 0.15
        self.wait_elapsed = random.uniform(0, 3.0)  # stagger spawn times
        self.median_wait = random.uniform(0.5, 2.0)
        self.median_elapsed = 0.0
        self.speed = 1.8  # wu/s — faster walking for visibility
        self.arm_is_ns = arm in ("N", "S")

    def position_dict(self) -> dict:
        """Return world (x, y) based on arm and current lateral position."""
        long_sign = -1 if self.arm in ("N", "W") else 1
        long_pos  = long_sign * self.cross_long
        lat       = self.lateral
        if self.arm_is_ns:
            return {"x": lat, "y": long_pos}
        else:
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

    def update(self, dt: float, signal_phase: int, nearest_vehicle_dist: float, remaining_s: float = 999.0) -> bool:
        """Advance pedestrian state. Returns True when done."""
        if self.state == "done":
            return True

        # Check if the signal for this arm is red (unsafe for vehicles, safe for pedestrians).
        # N-S pedestrians can only start crossing during Phase 2 (E-W green).
        # E-W pedestrians can only start crossing during Phase 0 (N-S green).
        # In both cases, there must be enough time remaining in the phase to cross (clearance interval).
        ped_safe = False
        if self.arm in ("N", "S"):
            if signal_phase == 2 and remaining_s >= 6.0:
                ped_safe = True
        elif self.arm in ("E", "W"):
            if signal_phase == 0 and remaining_s >= 6.0:
                ped_safe = True

        # Pedestrians strictly only check safety when starting to cross from the curb.
        # If they have already started crossing, they must complete their crossing
        # to the other side without stopping in the middle (at the median) when the signal changes.
        if not ped_safe and self.state == "waiting":
            return False

        if self.state == "waiting":
            self.wait_elapsed += dt
            can_cross = self.compliant or \
                        (not self.compliant and nearest_vehicle_dist > 8.0) or \
                        self.wait_elapsed > 12.0
            if can_cross:
                self.state = "crossing_1"

        elif self.state == "crossing_1":
            self.lateral -= self.speed * dt
            if self.lateral <= 0.5:
                self.lateral = 0.0
                self.state = "at_median"

        elif self.state == "at_median":
            self.median_elapsed += dt
            if self.median_elapsed >= self.median_wait:
                self.state = "crossing_2"

        elif self.state == "crossing_2":
            self.lateral -= self.speed * dt
            if self.lateral <= -14.4:
                self.state = "done"
                return True

        return False


# --------------------------------------------------------------------------- #
# Shared-arrival helpers                                                        #
# Both worlds in the split view consume the SAME stream of arrivals (arm, lane, #
# vehicle type, turn) so the only variable between them is the signal           #
# controller — a fair apples-to-apples comparison.                             #
# --------------------------------------------------------------------------- #
# Demand is biased toward the N-S axis (morning-peak pattern, matching the RL
# training env). This asymmetry is what an adaptive controller exploits and a
# fixed-time one cannot — giving the split screen a clear visible difference.
_DEMAND_ARMS = ["N", "S", "E", "W"]
_DEMAND_WEIGHTS = [0.32, 0.32, 0.18, 0.18]


def _spawn_spec(vid_counter: int, arm: str | None = None, lane: int | None = None, intersection_type: str = "four_way", type_weights: dict | None = None) -> dict:
    # 1. Determine active arms and weights based on intersection type
    if intersection_type in ("t_junction", "t_junction_free_left", "y_junction", "y_junction_free_left"):
        # T-junction and Y-junction: North, East, West. No South!
        arms = ["N", "E", "W"]
        weights = [0.4, 0.3, 0.3]
    else:
        # 4-way cross, roundabout, etc.
        arms = ["N", "S", "E", "W"]
        weights = [0.32, 0.32, 0.18, 0.18]

    arm = arm or random.choices(arms, weights=weights, k=1)[0]
    
    has_free_left = intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left")
    left_allowed = True
    if intersection_type in ("t_junction", "t_junction_free_left") and arm == "E":
        left_allowed = False

    r = random.random()
    
    if has_free_left and left_allowed:
        if lane is not None:
            if lane == 2:
                # Lane 2 is the DEDICATED free-left slip lane — always left-turning.
                # Straight/right vehicles must never block this lane.
                turn = "left"
            else:
                # Lanes 0 and 1: no left-turns (keep the free-left lane clear)
                if intersection_type in ("t_junction", "t_junction_free_left"):
                    if arm == "N":
                        turn = "right"
                    else:  # W arm (E has left_allowed=False)
                        turn = "straight"
                elif intersection_type in ("roundabout", "roundabout_free_left"):
                    turn = "straight" if r < 0.85 else "right"
                else:  # 4-way
                    turn = "straight" if r < 0.88 else "right"
        else:
            # lane is None, decide turn first
            if intersection_type in ("t_junction", "t_junction_free_left"):
                if arm == "N":
                    turn = "left" if r < 0.5 else "right"
                else:  # W arm
                    turn = "straight" if r < 0.8 else "left"
            elif intersection_type in ("roundabout", "roundabout_free_left"):
                turn = "straight" if r < 0.75 else ("right" if r < 0.88 else "left")
            else:  # 4-way
                turn = "straight" if r < 0.75 else ("right" if r < 0.85 else "left")

            # Assign lane based on turn — left-turners go to lane 2, others stay in 0-1
            if turn == "left":
                lane = 2
            else:
                lane = random.randint(0, 1)
    else:
        # No free left or left is not allowed on this arm (e.g. E arm of T-junction)
        if lane is None:
            lane = random.randint(0, _N_LANES - 1)
        
        if intersection_type in ("t_junction", "t_junction_free_left"):
            if arm == "N":
                turn = "left" if r < 0.5 else "right"
            elif arm == "E":
                turn = "straight" if r < 0.8 else "right"
            else: # W
                turn = "straight" if r < 0.8 else "left"
        elif intersection_type in ("y_junction", "y_junction_free_left"):
            turn = "left" if r < 0.5 else "right"
        elif intersection_type in ("roundabout", "roundabout_free_left"):
            turn = "straight" if r < 0.75 else ("right" if r < 0.88 else "left")
        else: # 4-way
            turn = "straight" if r < 0.75 else ("right" if r < 0.85 else "left")

    if type_weights and sum(type_weights.values()) > 0.0:
        types_list = list(type_weights.keys())
        weights_list = list(type_weights.values())
        type_id = random.choices(types_list, weights=weights_list, k=1)[0]
    else:
        type_id = random.choice(_VEHICLE_TYPES)

    return {
        "vid": f"v{vid_counter}",
        "arm": arm,
        "lane": lane,
        "type_id": type_id,
        "turn": turn,
        "intersection_type": intersection_type,
    }


def _vehicle_from_spec(spec: dict) -> _MockVehicle:
    """Build a vehicle whose identity matches a shared spec, so both worlds get
    the same vehicle for the same arrival."""
    v = _MockVehicle(spec["vid"], spec["arm"], spec["lane"], spec.get("intersection_type", "four_way"))
    v.type_id = spec["type_id"]
    half = _VEH_LEN.get(v.type_id, 4.0) / 2.0
    v.stop_zone = _STOP_DIST + half + 1.0
    v.through_dist = _STOP_DIST + half - 1.5
    v.turn_dir = spec["turn"]
    return v


def _is_spawn_clear(world, v: _MockVehicle) -> bool:
    """Return True if the spawn zone for vehicle v is clear of any other vehicles."""
    v_hl = _VEH_LEN.get(v.type_id, 4.0) / 2.0
    v_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
    theta = get_arm_angle(v.arm, v.intersection_type)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    
    v_long = v.x * cos_t + v.y * sin_t
    v_lat  = -v.x * sin_t + v.y * cos_t
    
    for other in world.vehicles:
        if other.arm != v.arm or other.through or other.turning:
            continue
        o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0
        o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0
        
        o_long = other.x * cos_t + other.y * sin_t
        o_lat  = -other.x * sin_t + other.y * cos_t
        
        lat_overlap = abs(v_lat - o_lat) < (v_hw + o_hw + 0.4)
        long_dist = abs(v_long - o_long)
            
        if lat_overlap and long_dist < (v_hl + o_hl + 3.0):
            return False
    return True


class _SimWorld:
    """One intersection simulation with a pluggable signal controller.

    fixed_time=True   → naive controller cycling _PHASE_DURATIONS regardless of
                        demand (the baseline a fixed-time signal gives you).
    fixed_time=False  → adaptive controller / trained RL policy.
    websters=True     → Webster's optimal cycle length formula adapts green time
                        to arm queue lengths — smarter than fixed-time but rule-based.
    """

    def __init__(self, fixed_time: bool, min_green: float = 8.0, max_green: float = 35.0,
                 policy_fn=None, websters: bool = False, intersection_type: str = "four_way",
                 replay_decisions=None, replay_episode_num=None):
        self.fixed_time = fixed_time
        self.websters = websters
        self.min_green = min_green
        self.max_green = max_green
        self.policy_fn = policy_fn
        self.intersection_type = intersection_type
        self.replay_decisions = replay_decisions
        self.replay_episode_num = replay_episode_num
        self.replay_finished = False
        self.vehicles: list[_MockVehicle] = []
        self.phase = 0
        self.phase_elapsed = 0.0
        self.cur_duration = _PHASE_DURATIONS[0]

        # Performance metrics tracking
        self.sim_clock = 0.0
        self.exited_count = 0
        self.total_wait_time = 0.0
        self.exited_history: list[tuple[float, int]] = []
        self.wait_history: list[tuple[float, float]] = []
        self.pedestrians: list = []
        self._ped_spawn_debt: float = 0.0
        self._ped_spawn_ratio: float = 1.0 / 8.0

    def add(self, v: _MockVehicle) -> None:
        self.vehicles.append(v)

    def _queued(self, arm: str) -> int:
        """Vehicles waiting on an arm — not yet through and still near the
        stop line (far-off approaching traffic doesn't count toward demand)."""
        n = 0
        for v in self.vehicles:
            if v.arm == arm and not v.through:
                d = math.hypot(v.x, v.y)
                if d < 30.0:
                    n += 1
        return n

    def _decide_next(self) -> None:
        if self.replay_decisions is not None:
            idx = getattr(self, "replay_idx", 0)
            if idx < len(self.replay_decisions):
                d = self.replay_decisions[idx]
                mock_phase = d["action"]["phase"]
                duration = d["action"]["duration_s"]

                def _resolve_world_phase(mp: int, world) -> int:
                    if mp == 0:
                        return 0   # N+S green
                    if mp == 1:
                        return 2   # E+W green
                    if mp in (2, 3):
                        ns = world._queued("N") + world._queued("S")
                        ew = world._queued("E") + world._queued("W")
                        return 0 if ns >= ew else 2
                    return 4       # all-red

                self.phase = _resolve_world_phase(mock_phase, self)
                self.cur_duration = float(duration)
                setattr(self, "replay_idx", idx + 1)

                if self.phase in (0, 2):
                    for v in self.vehicles:
                        if not v.through and v.arm not in _PHASE_GREEN.get(self.phase, set()):
                            v.red_runner = random.random() < _RED_RUN_PROB.get(v.type_id, 0.0)
                        else:
                            v.red_runner = False
            else:
                self.replay_finished = True
            return

        if self.fixed_time:
            self.phase = (self.phase + 1) % len(_PHASE_DURATIONS)
            self.cur_duration = _PHASE_DURATIONS[self.phase]
            if self.phase in (0, 2):
                for v in self.vehicles:
                    if not v.through and v.arm not in _PHASE_GREEN.get(self.phase, set()):
                        v.red_runner = random.random() < _RED_RUN_PROB.get(v.type_id, 0.0)
                    else:
                        v.red_runner = False
            return

        if self.websters:
            # Webster's optimal green split: longer green to busier arm pair.
            ns = self._queued("N") + self._queued("S")
            ew = self._queued("E") + self._queued("W")
            total = ns + ew or 1
            # Yellow phases (1, 3) stay fixed at 4 s
            if self.phase in (1, 3):
                self.phase = 2 if self.phase == 1 else 0
                self.cur_duration = 4.0
                return
            # Proportional split between min_green and max_green
            if self.phase == 0:          # N-S was green → go yellow
                self.phase, self.cur_duration = 1, 4.0
            elif self.phase == 2:        # E-W was green → go yellow
                self.phase, self.cur_duration = 3, 4.0
            else:                        # Yellow → pick next green
                self.phase = 0 if ns >= ew else 2
                ratio = (ns / total) if self.phase == 0 else (ew / total)
                self.cur_duration = self.min_green + ratio * (self.max_green - self.min_green)
            return

        # ── Trained RL policy ─────────────────────────────────────────────
        # When a real trained model is attached, call it to pick the next
        # phase and duration — this is the actual neural network deciding.
        if self.policy_fn is not None and self.phase not in (0, 2):
            # Only call the policy when transitioning out of yellow/all-red
            # (same cadence as the mock_env episode — one decision per cycle).
            try:
                next_phase, next_dur = self.policy_fn(self)
                self.phase = next_phase
                self.cur_duration = float(max(self.min_green,
                                              min(self.max_green, next_dur)))
                return
            except Exception as exc:
                logger.warning("RL policy_fn failed (%s) — falling back to heuristic", exc)
                # Fall through to adaptive heuristic below.

        # ── Adaptive heuristic (fallback when no trained model) ───────────
        if self.phase == 0:        # N-S green → N-S yellow
            self.phase, self.cur_duration = 1, 4.0
        elif self.phase == 2:      # E-W green → E-W yellow
            self.phase, self.cur_duration = 3, 4.0
        else:                      # from yellow/all-red → choose busiest axis
            ns = self._queued("N") + self._queued("S")
            ew = self._queued("E") + self._queued("W")
            self.phase = 0 if ns >= ew else 2
            self.cur_duration = self.max_green

        # Mark red-light runners for the new cycle
        if self.phase in (0, 2):   # just switched to a green: mark reds on other axis
            for v in self.vehicles:
                if not v.through and v.arm not in _PHASE_GREEN.get(self.phase, set()):
                    v.red_runner = random.random() < _RED_RUN_PROB.get(v.type_id, 0.0)
                else:
                    v.red_runner = False

    def step(self, dt: float) -> None:
        self.sim_clock += dt
        self.phase_elapsed += dt
        # Early termination: end a green once it has run its minimum and the
        # served approach has emptied while the cross street is waiting.
        if (not self.fixed_time and self.replay_decisions is None and self.phase in (0, 2)
                and self.phase_elapsed >= self.min_green):
            green_arms = _PHASE_GREEN[self.phase]
            red_arms = {"E", "W"} if self.phase == 0 else {"N", "S"}
            green_q = sum(self._queued(a) for a in green_arms)
            red_q = sum(self._queued(a) for a in red_arms)
            if green_q == 0 and red_q > 0:
                self._decide_next()
                self.phase_elapsed = 0.0
        if self.phase_elapsed >= self.cur_duration:
            self._decide_next()
            self.phase_elapsed = 0.0
        if self.intersection_type in ("roundabout", "roundabout_free_left"):
            green = {"N", "S", "E", "W"}
        else:
            green = _PHASE_GREEN.get(self.phase, set())

        lane_map: dict[str, list] = {}
        for v in self.vehicles:
            lane_map.setdefault(f"{v.arm}_{v.lane}", []).append(v)
        in_box = [
            v for v in self.vehicles
            if v.through and abs(v.x) < 14.4 and abs(v.y) < 14.4
        ]
        _GHOST_SPEED = _MOVE_SPEED * 0.25  # creep speed (used by Tier 1 & Tier 2)

        # ── Pre-compute pedestrian hard-stop zones ─────────────────────────────
        ped_stop_zones: list[tuple[str, float, float, float]] = []
        for ped in self.pedestrians:
            if ped.state in ("crossing_1", "crossing_2"):
                pos = ped.position_dict()
                ped_stop_zones.append((ped.arm, pos["x"], pos["y"], 9.0))  # 9wu stop radius

        # ── Pre-compute 2D vehicle positions for overlap avoidance ─────────────
        # Build fast-lookup: arm → list of (long_pos, lat_pos, half_len, half_width, vehicle)
        arm_veh: dict[str, list] = {}
        for v in self.vehicles:
            theta = get_arm_angle(v.arm, self.intersection_type)
            cos_t = math.cos(theta)
            sin_t = math.sin(theta)
            v_long = v.x * cos_t + v.y * sin_t
            v_lat  = -v.x * sin_t + v.y * cos_t
            v_hl   = _VEH_LEN.get(v.type_id, 4.0) / 2.0
            v_hw   = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
            arm_veh.setdefault(v.arm, []).append((v_long, v_lat, v_hl, v_hw, v))

        to_remove: list = []
        for v in self.vehicles:
            theta = get_arm_angle(v.arm, self.intersection_type)
            cos_t = math.cos(theta)
            sin_t = math.sin(theta)
            lo, hi = 1.6, 13.8
            v_long = v.x * cos_t + v.y * sin_t
            v_lat  = -v.x * sin_t + v.y * cos_t
            v_hl   = _VEH_LEN.get(v.type_id, 4.0) / 2.0
            v_hw   = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0

            ped_blocking = False
            if not v.through:
                for (parm, px, py, prad) in ped_stop_zones:
                    if parm != v.arm:
                        continue
                    p_long = px * cos_t + py * sin_t
                    p_lat  = -px * sin_t + py * cos_t
                    # Only stop if pedestrian is AHEAD longitudinally (closer to centre)
                    ahead = p_long < v_long
                    if ahead and (v_long - p_long) < prad and abs(p_lat - v_lat) < (v_hw + 1.8):
                        v.speed = 0.0
                        ped_blocking = True
                        break

            # ── 2. 2D anti-overlap: check vehicle directly ahead ────────────
            if not v.through and not v.turning and not ped_blocking:
                min_gap = v_hl + 1.0   # minimum following gap (world units)
                closest_ahead = 999.0
                for (o_long, o_lat, o_hl, o_hw, other) in arm_veh.get(v.arm, []):
                    if other is v:
                        continue
                    # Is other vehicle ahead of us (closer to intersection)?
                    long_dist  = v_long - o_long   # positive = other is closer
                    lat_gap    = abs(o_lat - v_lat) - (v_hw + o_hw)  # negative = overlap
                    if long_dist > 0 and long_dist < 15.0 and lat_gap < 0.5:
                        # Other is ahead and overlapping laterally — following distance check
                        gap = long_dist - v_hl - o_hl
                        closest_ahead = min(closest_ahead, gap)

                if closest_ahead < min_gap:
                    # Too close to vehicle ahead → steer to a lateral gap instead of stopping
                    escape = v._find_lateral_gap(self.vehicles)
                    if escape is not None:
                        my_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                        escape = max(lo + my_hw + 0.1, min(hi - my_hw - 0.1, escape))
                        delta = escape - v_lat
                        steer = min(abs(delta), _LAT_STEER_RATE * dt * 2) * (1 if delta > 0 else -1)
                        if steer != 0.0:
                            new_lat = v_lat + steer
                            for (o_long, o_lat, o_hl, o_hw, other) in arm_veh.get(v.arm, []):
                                if other is v:
                                    continue
                                if abs(v_long - o_long) < (v_hl + o_hl + 0.2):
                                    if abs(new_lat - o_lat) < (my_hw + o_hw + 0.15):
                                        steer = 0.0
                                        break
                        if steer != 0.0:
                            v.x += steer * (-sin_t)
                            v.y += steer * cos_t
                            v_lat += steer

            # ── 3. Forward-space lane change (Indian overtaking) ─────────────
            # All vehicles scan ahead in multiple lateral zones and move to
            # whichever zone has the most clear road ahead — proper lane change.
            side_blocked = False
            if not v.turning and not ped_blocking and not v.through:
                # Check for lateral side-block with adjacent vehicles
                for (o_long, o_lat, o_hl, o_hw, other) in arm_veh.get(v.arm, []):
                    if other is v:
                        continue
                    long_diff = abs(v_long - o_long)
                    if long_diff < (v_hl + o_hl + 0.5):
                        lat_gap = abs(v_lat - o_lat) - (v_hw + o_hw)
                        if lat_gap < 0.2:
                            proj_v = v.x * v.dx + v.y * v.dy
                            proj_other = other.x * v.dx + other.y * v.dy
                            if proj_v < proj_other:
                                side_blocked = True
                                break

                if side_blocked:
                    target = v_lat
                    steer_rate = 0.0
                elif v.speed < 0.1:
                    target = v_lat
                    steer_rate = 0.0
                else:
                    lane_target = v._find_best_lane(self.vehicles)

                    if lane_target is not None:
                        # Guard: in free-left layouts, lane 2 is dedicated to left-turners.
                        # Prevent straight/right vehicles from drifting into it.
                        if self.intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"):
                            arm_lane2 = 12.1
                            if v.turn_dir != "left" and abs(lane_target - arm_lane2) < 2.0:
                                lane_target = None

                    offsets = [3.7, 7.9, 12.1]
                    if lane_target is not None:
                        # Clear lane found — steer into it faster (decisive lane change)
                        target     = lane_target
                        steer_rate = _LAT_STEER_RATE * 2.0
                        if lane_target in offsets:
                            new_lane_idx = offsets.index(lane_target)
                            if new_lane_idx != v.lane:
                                old_center = offsets[v.lane % _N_LANES]
                                deviation = v.lat_drift - old_center
                                v.lane = new_lane_idx
                                v.lat_drift = lane_target + deviation
                    else:
                        # No better lane: gentle drift / sinusoidal wander in place
                        if v.type_id in _BIKE_TYPES or v.type_id == "auto_rickshaw":
                            v.weave_phase += dt * 0.5
                            mid    = (lo + hi) / 2.0
                            amp    = (hi - lo) / 2.0 * 0.6
                            target = mid + amp * math.sin(v.weave_phase)
                        else:
                            v.weave_phase += dt * 0.2
                            base    = offsets[v.lane % _N_LANES]
                            freedom = _LAT_FREEDOM.get(v.type_id, 1.0) * 0.35
                            target  = base + freedom * math.sin(v.weave_phase)
                        steer_rate = _LAT_STEER_RATE

                my_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                target  = max(lo + my_hw + 0.1, min(hi - my_hw - 0.1, target))
                delta   = target - v_lat
                move    = min(abs(delta), steer_rate * dt) * (1 if delta > 0 else -1) if steer_rate > 0.0 else 0.0
                
                # Lateral collision prevention check
                if move != 0.0:
                    new_lat = v_lat + move
                    for (o_long, o_lat, o_hl, o_hw, other) in arm_veh.get(v.arm, []):
                        if other is v:
                            continue
                        if abs(v_long - o_long) < (v_hl + o_hl + 0.2):
                            if abs(new_lat - o_lat) < (my_hw + o_hw + 0.15):
                                move = 0.0
                                break

                if move != 0.0:
                    v.x += move * (-sin_t)
                    v.y += move * cos_t
                    v_lat += move
                v.lat_target = target

            # ── 4. Queue-creep: bikes thread forward through stopped queue ───
            if v.type_id in _BIKE_TYPES and not v.through and not v.turning:
                dist_to_stop = v_long - _STOP_DIST
                if 0 < dist_to_stop < 30.0 and v.speed < 0.1:
                    gap_ahead = True
                    for (o_long, o_lat, o_hl, o_hw, other) in arm_veh.get(v.arm, []):
                        if other is v:
                            continue
                        lat_ov = abs(o_lat - v_lat) - (v_hw + o_hw)
                        if lat_ov < 0.5 and o_long < v_long:
                            gap = (v_long - o_long) - v_hl - o_hl
                            if gap < 1.0:
                                gap_ahead = False
                                break
                    if gap_ahead:
                        v.x += v.dx * _MOVE_SPEED * 0.25 * dt
                        v.y += v.dy * _MOVE_SPEED * 0.25 * dt

            # ── 5. Red-light runner ──────────────────────────────────────────
            if v.red_runner and not v.through and not v.turning:
                dist = v_long
                if dist <= v.stop_zone and v.speed < 0.5:
                    blocked = False
                    for (o_long, o_lat, o_hl, o_hw, other) in arm_veh.get(v.arm, []):
                        if other is v:
                            continue
                        lat_ov = abs(o_lat - v_lat) - (v_hw + o_hw)
                        if lat_ov < 0.5 and o_long < v_long:
                            gap = (v_long - o_long) - v_hl - o_hl
                            if gap < 1.5:
                                blocked = True
                                break
                    if not blocked:
                        v.x += v.dx * _MOVE_SPEED * 0.4 * dt
                        v.y += v.dy * _MOVE_SPEED * 0.4 * dt
                        if dist <= _STOP_DIST:
                            v.through = True
                            v.red_runner = False

            # ── 6. Stuck escape — non-intersection vehicles blocked too long ─
            # NOTE: stuck_s is owned exclusively by the Safety Net section below.
            # Section 6 only READS stuck_s (never writes it).  This ensures that
            # red-light waiting (normal behaviour) never inflates the counter.
            if v.speed == 0.0 and not v.turning and not v.through:
                # Green signal but stuck > 3s → try hard lateral escape
                if v.arm in green and v.stuck_s > 3.0:
                    escape = v._find_lateral_gap(self.vehicles)
                    if escape is not None:
                        my_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                        escape = max(lo + my_hw + 0.1, min(hi - my_hw - 0.1, escape))
                        delta  = escape - v_lat
                        steer  = min(abs(delta), _LAT_STEER_RATE * dt * 3) * (1 if delta > 0 else -1)
                        if steer != 0.0:
                            new_lat = v_lat + steer
                            for (o_long, o_lat, o_hl, o_hw, other) in arm_veh.get(v.arm, []):
                                if other is v:
                                    continue
                                if abs(v_long - o_long) < (v_hl + o_hl + 0.2):
                                    if abs(new_lat - o_lat) < (my_hw + o_hw + 0.15):
                                        steer = 0.0
                                        break
                        if steer != 0.0:
                            v.x += steer * (-sin_t)
                            v.y += steer * cos_t
                            v_lat += steer

            exited = v.update(dt, green, self.vehicles, in_box, self.intersection_type, ped_blocking=ped_blocking, side_blocked=side_blocked)

            # ── HARD BOUNDARY CLAMP (runs after update, catches any drift) ─
            my_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
            if not v.turning and not v.through:
                # Approach vehicles: clamp to their arm's lane range
                lo_h, hi_h = 1.6, 13.8
                clamped_lat = max(lo_h + my_hw, min(hi_h - my_hw, v_lat))
                move = clamped_lat - v_lat
                if move != 0.0:
                    v.x += move * (-sin_t)
                    v.y += move * cos_t
            elif v.through and not v.turning:
                # Post-turn / through vehicles: once they have cleared the intersection
                # box (distance to center > 14.4wu) they're back on a straight road.
                dist_to_center = math.hypot(v.x, v.y)
                if dist_to_center > 14.4:
                    exit_theta = get_arm_angle(v.arm, self.intersection_type)
                    cos_ex = math.cos(exit_theta)
                    sin_ex = math.sin(exit_theta)
                    v_lat_ex = -v.x * sin_ex + v.y * cos_ex
                    lo_h, hi_h = 1.6, 13.8
                    clamped_lat = max(lo_h + my_hw, min(hi_h - my_hw, v_lat_ex))
                    move = clamped_lat - v_lat_ex
                    if move != 0.0:
                        v.x += move * (-sin_ex)
                        v.y += move * cos_ex

            # ══════════════════════════════════════════════════════════════
            # SAFETY NET — Tiered Stuck Resolution
            # Catches ANY vehicle stuck for any reason and applies escalating
            # force to guarantee the simulation NEVER permanently deadlocks.
            #
            #   Tier 1 (≥2 s)  – gentle ghost-creep forward
            #   Tier 2 (≥5 s)  – aggressive creep (2× speed, overlaps OK)
            #   Tier 3 (≥10 s) – force-exit (remove from simulation)
            #
            # Red-light waiting is NORMAL and is NOT counted as stuck.
            # ══════════════════════════════════════════════════════════════
            _TIER1_S = 2.0
            _TIER2_S = 5.0
            _TIER3_S = 10.0

            if v.speed == 0.0:
                is_stuck_green = (v.arm in green) and not v.through
                should_track = v.through or is_stuck_green

                if should_track:
                    v.stuck_s += dt

                    # ── Tier 3: Force-exit (ultimate safety net) ──────────
                    if v.stuck_s >= _TIER3_S:
                        exited = True

                    # ── Tier 2: Aggressive creep (2× speed, overlap OK) ──
                    elif v.stuck_s >= _TIER2_S:
                        fast = _GHOST_SPEED * 2.0
                        if v.turning and v.b_p0 is not None:
                            v.speed = fast
                            v.turn_t = min(1.0, v.turn_t + dt * fast / 25.0)
                            bx, by = v._beval(v.b_p0, v.b_p1, v.b_p2, v.turn_t)
                            v.x, v.y = bx, by
                            tx_tan, ty_tan = v._btangent(v.b_p0, v.b_p1, v.b_p2, v.turn_t)
                            v.angle = math.atan2(ty_tan, tx_tan)
                            if v.turn_t >= 1.0:
                                v.arm     = v.exit_arm
                                v.lane    = v.exit_lane
                                v.lat_drift = v.exit_lat_drift
                                v.dx, v.dy = v.exit_dx, v.exit_dy
                                v.angle   = None
                                v.turning = False
                                v.through = True
                        else:
                            if is_stuck_green:
                                v.through = True
                            v.x += v.dx * fast * dt
                            v.y += v.dy * fast * dt
                            v.speed = fast
                            if v._check_exit():
                                exited = True

                    # ── Tier 1: Gentle ghost-creep ────────────────────────
                    elif v.stuck_s >= _TIER1_S:
                        if v.turning and v.b_p0 is not None:
                            v.speed = _GHOST_SPEED
                            v.turn_t = min(1.0, v.turn_t + dt * _GHOST_SPEED / 25.0)
                            bx, by = v._beval(v.b_p0, v.b_p1, v.b_p2, v.turn_t)
                            v.x, v.y = bx, by
                            tx_tan, ty_tan = v._btangent(v.b_p0, v.b_p1, v.b_p2, v.turn_t)
                            v.angle = math.atan2(ty_tan, tx_tan)
                            if v.turn_t >= 1.0:
                                v.arm     = v.exit_arm
                                v.lane    = v.exit_lane
                                v.lat_drift = v.exit_lat_drift
                                v.dx, v.dy = v.exit_dx, v.exit_dy
                                v.angle   = None
                                v.turning = False
                                v.through = True
                        elif is_stuck_green:
                            v.through = True
                            v.x += v.dx * _GHOST_SPEED * dt
                            v.y += v.dy * _GHOST_SPEED * dt
                            v.speed = _GHOST_SPEED
                        else:
                            v.x += v.dx * _GHOST_SPEED * dt
                            v.y += v.dy * _GHOST_SPEED * dt
                            v.speed = _GHOST_SPEED
                            if v._check_exit():
                                exited = True
            else:
                if not ped_blocking:
                    v.stuck_s = 0.0

            if exited:
                to_remove.append(v)

        seen: set = set()
        for v in to_remove:
            if id(v) not in seen:
                seen.add(id(v))
                self.vehicles.remove(v)
                self.exited_count += 1
                self.total_wait_time += v.wait_time
                self.exited_history.append((self.sim_clock, 1))
                self.wait_history.append((self.sim_clock, v.wait_time))

        # ── Pedestrian spawn ──────────────────────────────────────────────
        ped_enabled = self.intersection_type not in (
            "roundabout", "roundabout_free_left", "y_junction", "six_arm"
        )
        if ped_enabled:
            arms = (["N", "E", "W"]
                    if self.intersection_type in ("t_junction", "t_junction_free_left")
                    else ["N", "S", "E", "W"])
            for arm in arms:
                self._ped_spawn_debt += self._ped_spawn_ratio * dt * (_MOVE_SPEED / 10.0)
            while self._ped_spawn_debt >= 1.0:
                self._ped_spawn_debt -= 1.0
                arm = random.choice(arms)
                self.pedestrians.append(_MockPedestrian(arm, self.intersection_type))

        # ── Pedestrian update ─────────────────────────────────────────────
        peds_done = []
        for ped in self.pedestrians:
            nearest_dist = 999.0
            for v in self.vehicles:
                if v.arm != ped.arm or v.through:
                    continue
                pos = ped.position_dict()
                vdist = math.hypot(v.x - pos["x"], v.y - pos["y"])
                nearest_dist = min(nearest_dist, vdist)
                # Slow vehicles near crossing pedestrians
                if vdist < 6.0 and ped.state in ("crossing_1", "crossing_2"):
                    v.speed = min(v.speed, _MOVE_SPEED * 0.2)

            remaining_s = max(0.0, self.cur_duration - self.phase_elapsed)
            done = ped.update(dt, self.phase, nearest_dist, remaining_s=remaining_s)
            if done:
                peds_done.append(ped)

        for ped in peds_done:
            if ped in self.pedestrians:
                self.pedestrians.remove(ped)

    def frame(self, step: int, sim_time: float, session_id: str = "") -> dict:
        # Clean up history older than 5 minutes (300 seconds)
        cutoff = self.sim_clock - 300.0
        self.exited_history = [e for e in self.exited_history if e[0] >= cutoff]
        self.wait_history = [w for w in self.wait_history if w[0] >= cutoff]

        # Cumulative calculations
        avg_wait_s = (self.total_wait_time / self.exited_count) if self.exited_count > 0 else 0.0
        throughput_vph = (self.exited_count / max(self.sim_clock, 0.001) * 3600.0)

        # Instantaneous calculations (rolling 5 minutes)
        recent_exits = len(self.exited_history)
        denom_clock = min(self.sim_clock, 300.0)
        instant_tput_vph = (recent_exits / max(denom_clock, 0.001) * 3600.0)

        if self.wait_history:
            instant_wait_s = sum(w[1] for w in self.wait_history) / len(self.wait_history)
        else:
            instant_wait_s = avg_wait_s

        # Count currently stopped vehicles (queue depth)
        in_queue = sum(1 for v in self.vehicles if v.speed < 0.1)

        stats = {
            "on_canvas": len(self.vehicles),
            "in_queue": in_queue,
            "exited": self.exited_count,
            "avg_wait_s": round(avg_wait_s, 1),
            "instant_wait_s": round(instant_wait_s, 1),
            "throughput_vph": round(throughput_vph, 0),
            "instant_tput_vph": round(instant_tput_vph, 0),
            "tick_ms": 25,
            "fps": 40
        }

        # policy_mode tells the frontend which controller is running:
        #   "fixed_time" → fixed-time baseline (static 30s cycles)
        #   "websters"   → Webster's adaptive cycle-length controller
        #   "model"      → trained RL neural network making decisions
        #   "heuristic"  → adaptive queue-comparison rule (no trained model)
        if self.fixed_time:
            policy_mode = "fixed_time"
        elif self.websters:
            policy_mode = "websters"
        elif self.policy_fn is not None:
            policy_mode = "model"
        else:
            policy_mode = "heuristic"

        return {
            "session_id": session_id,
            "step": step,
            "sim_time_s": round(sim_time, 1),
            "max_sim_time_s": getattr(self, "max_sim_s", 1800.0),
            "policy_mode": "replay" if self.replay_decisions is not None else policy_mode,
            "replay_episode": self.replay_episode_num,
            "vehicles": [v.to_dict() for v in self.vehicles],
            "pedestrians": [p.to_dict() for p in self.pedestrians],
            "signals": [{
                "tl_id": "center",
                "phase": self.phase,
                "elapsed_s": round(self.phase_elapsed, 1),
                "duration_s": round(self.cur_duration, 1),
                "remaining_s": round(max(0.0, self.cur_duration - self.phase_elapsed), 1),
            }],
            "stats": stats,
        }


def _compute_agg_stats(world, tk, sim_clock, backlog, queue_wait_accum,
                       tick_ms, window_s=300.0) -> dict:
    """Compute the rich aggregate stat block for one world, matching the
    reference app: On Canvas / In Queue / Exited / Avg Wait (cumul) /
    Instant Wait / Throughput / Instant Tput / Tick / FPS.

    Cumulative wait includes the virtual spawn-zone backlog, so the figure
    reflects true demand pressure — not just whoever is visible on screen.
    """
    vehicles = world.vehicles
    on_canvas = len(vehicles)
    curr_ids = set(str(v.id) for v in vehicles)

    # Detect vehicles that left the canvas since last frame; bank their wait.
    for vid in tk["prev_ids"]:
        if vid not in curr_ids:
            w = tk["prev_wait"].get(vid, 0.0)
            tk["cum_exited"] += 1
            tk["cum_exit_wait"] += w
            tk["exit_events"].append((sim_clock, w))
    tk["prev_wait"] = {str(v.id): (v.wait_time or 0.0) for v in vehicles}
    tk["prev_ids"] = curr_ids

    # Trim rolling window to the last `window_s` sim-seconds.
    cutoff = sim_clock - window_s
    while tk["exit_events"] and tk["exit_events"][0][0] < cutoff:
        tk["exit_events"].popleft()

    on_canvas_wait = sum((v.wait_time or 0.0) for v in vehicles)
    cum_exited = tk["cum_exited"]

    # Cumulative average wait across every vehicle in the system (exited +
    # on-canvas + still queued in the spawn zone).
    n_total = cum_exited + on_canvas + backlog
    sys_wait = tk["cum_exit_wait"] + on_canvas_wait + queue_wait_accum
    avg_wait = (sys_wait / n_total) if n_total > 0 else 0.0

    tput = (cum_exited / sim_clock * 3600.0) if sim_clock > 0 else 0.0

    win_events = tk["exit_events"]
    win_n = len(win_events)
    win_span = min(window_s, sim_clock) or 1.0
    instant_tput = win_n / win_span * 3600.0
    instant_wait = (sum(w for _, w in win_events) / win_n) if win_n else avg_wait

    fps = (1000.0 / tick_ms) if tick_ms and tick_ms > 0 else 0.0

    return {
        "on_canvas":        on_canvas,
        "in_queue":         on_canvas + int(round(backlog)),
        "exited":           cum_exited,
        "avg_wait_s":       round(avg_wait, 1),
        "instant_wait_s":   round(instant_wait, 1),
        "throughput_vph":   int(round(tput)),
        "instant_tput_vph": int(round(instant_tput)),
        "tick_ms":          round(tick_ms, 1) if tick_ms else 0.0,
        "fps":              round(fps, 1),
    }


# ---------------------------------------------------------------------------
# RL policy integration — load trained model and build real-time observations
# ---------------------------------------------------------------------------

# model_key → path on disk (persists across session_id changes)
_trained_model_paths: dict[str, str] = {}
# model_key → loaded SB3 model object (in-memory cache)
_loaded_policies: dict[str, object] = {}


def register_trained_model(model_key: str, model_path: str) -> None:
    """Record a freshly trained model path for the given RL model key.
    Called by the training thread after trainer.train() completes.
    Invalidates any cached in-memory policy so the new weights are reloaded."""
    _trained_model_paths[model_key] = model_path
    _loaded_policies.pop(model_key, None)
    logger.info("Registered trained model: %s → %s", model_key, model_path)


def _load_rl_policy(model_key: str):
    """Load the trained SB3 model for the given model key (cached after first load).
    Keyed by model_key (e.g. 'rl1') NOT session_id, so the policy survives
    across the session_id change between training and simulation."""
    if model_key in _loaded_policies:
        return _loaded_policies[model_key]

    model_path = _trained_model_paths.get(model_key)
    if not model_path:
        logger.debug("No trained model registered for %s — using heuristic", model_key)
        return None

    try:
        from stable_baselines3 import PPO
        model = PPO.load(model_path)
        _loaded_policies[model_key] = model
        logger.info("Loaded trained RL policy for %s from %s", model_key, model_path)
        return model
    except Exception as exc:
        logger.warning("Could not load RL model for %s (%s) — using heuristic", model_key, exc)
        return None


def _build_rl_obs(world, sim_config=None, arms=("N", "S", "E", "W")) -> "np.ndarray":
    """Build a 26-dimensional observation matching MockTrafficEnv._obs() schema
    from the live _SimWorld state so the trained policy can make real decisions.

    Observation layout (must match mock_env.py exactly):
        per arm [queue, wait_proxy, arrival_rate, just_served]  (16)
        per arm [delta_queue]  — trend growing/shrinking         (4)
        phase one-hot (5 phases)                                  (5)
        fraction of episode elapsed (capped at 1.0)               (1)
        Total: 26 dims
    """
    from backend.rl.mock_env import _QUEUE_NORM, _WAIT_NORM, _RATE_NORM, N_PHASES
    from backend.config import SimulationConfig

    if sim_config is None:
        sim_config = SimulationConfig()
    elif isinstance(sim_config, dict):
        import dataclasses
        sim_fields = {f.name for f in dataclasses.fields(SimulationConfig)}
        sim_config = SimulationConfig(**{k: v for k, v in sim_config.items() if k in sim_fields})

    # Compute expected arrival rates per arm
    active_arms = ["N", "E", "W"] if sim_config.intersection_type in ("t_junction", "t_junction_free_left") else list(arms)
    configured_vps = sim_config.traffic_volume_vph / 3600.0
    n_arms = len(active_arms)

    if sim_config.traffic_pattern in ("morning_peak", "evening_peak"):
        if n_arms == 3:
            w = {"N": 0.5, "E": 0.25, "W": 0.25, "S": 0.0}
        else:
            w = {"N": 0.35, "S": 0.35, "E": 0.15, "W": 0.15}
    else:
        w = {a: (1.0 / n_arms if a in active_arms else 0.0) for a in arms}

    arrival_rates = {a: configured_vps * w[a] * n_arms if a in active_arms else 0.0 for a in arms}

    feats: list[float] = []
    prev_queues = getattr(world, '_prev_queued_obs', {})
    curr_queues: dict[str, int] = {}

    # Arm-level features: queue, wait_proxy, arrival_rate, just_served (16 total)
    for arm in arms:
        queued = world._queued(arm)
        curr_queues[arm] = queued
        arrival_rate = arrival_rates[arm]
        wait_proxy = queued / max(arrival_rate, 1e-3)

        feats.append(min(queued / _QUEUE_NORM, 1.0))
        feats.append(min(wait_proxy / _WAIT_NORM, 1.0))
        feats.append(min(arrival_rate / _RATE_NORM, 1.0))
        
        # Map our _SimWorld phase to the set of arms that were green/served in this cycle.
        # world.phase: 0=N-S green, 1=N-S yellow, 2=E-W green, 3=E-W yellow, 4=all-red
        live_phase_green = {
            0: {"N", "S"},
            1: {"N", "S"},
            2: {"E", "W"},
            3: {"E", "W"},
            4: set(),
        }.get(world.phase, set())
        feats.append(1.0 if arm in live_phase_green else 0.0)


    # Delta queue per arm — improvement #4 (4 features, matches mock_env.py)
    for arm in arms:
        delta = curr_queues[arm] - prev_queues.get(arm, curr_queues[arm])
        feats.append(float(np.clip(delta / _QUEUE_NORM, -1.0, 1.0)))

    # Save current queues for next call's delta calculation
    world._prev_queued_obs = curr_queues

    # Phase one-hot (map our 5-phase scheme to mock_env's 5 phases)
    mock_phase = {0: 0, 1: 4, 2: 1, 3: 4, 4: 4}.get(world.phase, 4)
    phase_onehot = [1.0 if i == mock_phase else 0.0 for i in range(N_PHASES)]
    feats.extend(phase_onehot)

    # Elapsed fraction
    elapsed_frac = min(world.phase_elapsed / 60.0, 1.0)
    feats.append(elapsed_frac)

    return np.asarray(feats, dtype=np.float32)


def _run_mock_sim(sio, session_id: str) -> None:
    """Background thread: run the requested model world and emit its frames.

    model_key controls which world(s) run:
      'baseline' → only the fixed-time baseline world
      'rl1'/'rl2'/'rl3'/'rl4'/'custom' → only that RL world
      'all' (or unset) → all 6 worlds in lock-step (split-view / legacy)

    Baseline metrics are stored client-side after a baseline run so they are
    preserved when switching to RL tabs — RL runs do NOT re-run baseline.
    """
    from backend.analytics.session_store import SessionStore
    store = SessionStore()
    session = store.get_session(session_id)
    state_cfg = (_session_states.get(session_id, {}) or {}).get("raw_sim_config", {}) or {}

    def _safe_int(v, default: int) -> int:
        try:
            return int(v)
        except Exception:
            return default

    def _safe_float(v, default: float) -> float:
        try:
            return float(v)
        except Exception:
            return default

    mix_keys = {
        "pct_car": "car",
        "pct_two_wheeler": "two_wheeler",
        "pct_ev_scooter": "ev_scooter",
        "pct_auto_rickshaw": "auto_rickshaw",
        "pct_e_rickshaw": "e_rickshaw",
        "pct_cab": "cab",
        "pct_delivery_bike": "delivery_bike",
        "pct_tsrtc_bus": "tsrtc_bus",
        "pct_school_bus": "school_bus",
        "pct_truck": "truck",
    }
    type_weights = {}
    if session is not None:
        sim_config_db = session.get("sim_config") or {}
    else:
        sim_config_db = {}
    merged_cfg = {**sim_config_db, **state_cfg}
    for k, type_id in mix_keys.items():
        val = state_cfg.get(k) or sim_config_db.get(k)
        if val is not None:
            type_weights[type_id] = _safe_float(val, 0.0)
    if sum(type_weights.values()) <= 0.0:
        type_weights = None

    min_green = 8.0
    max_green = 35.0
    intersection_type = "four_way"
    if session is not None:
        sim_config = session.get("sim_config") or {}
        min_green = float(
            state_cfg.get("phase_min_green_s")
            or sim_config.get("phase_min_green_s")
            or sim_config.get("min_green_seconds")
            or 8.0
        )
        max_green = float(
            state_cfg.get("phase_max_green_s")
            or sim_config.get("phase_max_green_s")
            or sim_config.get("max_green_seconds")
            or 35.0
        )
        intersection_type = (
            state_cfg.get("intersection_type")
            or sim_config.get("intersection_type")
            or "four_way"
        )

    # Initial speed — may be overridden mid-run via sim:speed socket events
    _initial_speed = max(1, _safe_int(state_cfg.get("sim_speed_multiplier") or 1, 1))
    set_session_state(session_id, sim_speed=_initial_speed)
    raw_duration = state_cfg.get("simulation_duration_s")
    max_sim_s = _safe_float(raw_duration, 1800.0) if raw_duration is not None else 1800.0
    render_sleep_s = 0.05

    # ── Which model to simulate ──────────────────────────────────────────────
    model_key = (_session_states.get(session_id, {}) or {}).get("model_key", "all")
    replay_episode = (_session_states.get(session_id, {}) or {}).get("replay_episode")

    # ── Demand & capacity settings ──────────────────────────────────────────
    # total_vph sets the ARRIVAL rate (spawn_interval). The canvas holds at most
    # _SOFT_CAP vehicles; demand beyond that waits in each world's pending queue
    # (the backlog). When arrivals exceed what the junction can clear, that
    # backlog grows and its accrued wait drives realistic avg-wait figures —
    # exactly how a real oversaturated intersection behaves.
    total_vph = _safe_float(state_cfg.get("total_vph") or 10000.0, 10000.0)
    _spawn_interval_s = max(0.05, 3600.0 / total_vph)
    _SOFT_CAP = 52   # ~13 per arm visible — clean canvas; excess waits in backlog

    # ── Load replay decisions if replaying an episode ───────────────────────
    replay_decisions = None
    if replay_episode is not None:
        try:
            from backend.rl.decision_store import STORE
            recorded_episode = STORE.get_episode(session_id, int(replay_episode))
            if recorded_episode:
                replay_decisions = recorded_episode.get("decisions", [])
                logger.info("[sim] Replaying episode %s with %d decisions", replay_episode, len(replay_decisions))
            else:
                logger.warning("[sim] Episode %s not found in decision store", replay_episode)
        except Exception as e:
            logger.exception("Failed to load replay decisions")

    # ── Load trained RL policy (keyed by model_key, not session_id) ─────────
    # Lookup uses model_key so the policy persists across the session_id change
    # between training and the subsequent simulation run.
    _rl_model = _load_rl_policy(model_key)

    def _make_policy_fn(model):
        """Return a policy_fn(world) → (phase_idx, duration_s) closure."""
        from backend.rl.mock_env import action_to_phase_duration

        def _resolve_world_phase(mock_phase: int, world) -> int:
            """Map mock_env phase to SimWorld phase.

            Phases 0 (N+S) and 1 (E+W) map directly.
            Diagonal phases 2 (N+E) and 3 (S+W) are demand-aware:
            whichever axis (N+S vs E+W) has more queued vehicles gets green,
            so the agent's intent to serve the busier pair is honoured even
            though the SimWorld has no diagonal phases.
            Phase 4 (all-red) passes through.
            """
            if mock_phase == 0:
                return 0   # N+S green
            if mock_phase == 1:
                return 2   # E+W green
            if mock_phase in (2, 3):
                # Diagonal — pick whichever axis is more congested
                ns = world._queued("N") + world._queued("S")
                ew = world._queued("E") + world._queued("W")
                return 0 if ns >= ew else 2
            return 4       # all-red

        def _policy_fn(world) -> tuple:
            obs = _build_rl_obs(world, sim_config=merged_cfg)
            action, _ = model.predict(obs, deterministic=True)
            mock_phase, duration = action_to_phase_duration(int(action))
            world_phase = _resolve_world_phase(mock_phase, world)
            return world_phase, duration

        return _policy_fn

    _policy_fn = _make_policy_fn(_rl_model) if _rl_model is not None else None

    if _rl_model is not None:
        logger.info("[sim] Session %s: using trained RL policy for RL worlds", session_id)
    else:
        logger.info("[sim] Session %s: no trained model — using adaptive heuristic", session_id)

    # Assign the policy to whichever RL world matches the active model_key.
    def _rl_world(mk, **kw):
        """Create an RL _SimWorld, attaching the trained policy when available."""
        algo = state_cfg.get("rl_algorithm", "PPO")
        if mk == model_key and algo == "Same as Baseline":
            actual_kw = {**kw, "min_green": min_green, "max_green": max_green}
            return _SimWorld(
                fixed_time=(_baseline_ctrl != "websters"),
                websters=(_baseline_ctrl == "websters"),
                policy_fn=None,
                intersection_type=intersection_type,
                replay_decisions=replay_decisions if mk == model_key else None,
                replay_episode_num=replay_episode if mk == model_key else None,
                **actual_kw,
            )
        else:
            return _SimWorld(
                fixed_time=False,
                policy_fn=_policy_fn if mk == model_key and _policy_fn else None,
                intersection_type=intersection_type,
                replay_decisions=replay_decisions if mk == model_key else None,
                replay_episode_num=replay_episode if mk == model_key else None,
                **kw,
            )

    # Baseline world uses the controller selected by the user.
    _baseline_ctrl = (session.get("sim_config") or {}).get("baseline_controller", "fixed_time") if session else "fixed_time"
    base_world = _SimWorld(
        fixed_time=(_baseline_ctrl != "websters"),
        websters=(_baseline_ctrl == "websters"),
        min_green=min_green,
        max_green=max_green,
        intersection_type=intersection_type,
        replay_decisions=replay_decisions if model_key == "baseline" else None,
        replay_episode_num=replay_episode if model_key == "baseline" else None,
    )
    rl1_world    = _rl_world("rl1",    min_green=8.0,  max_green=35.0)
    rl2_world    = _rl_world("rl2",    min_green=6.0,  max_green=30.0)
    rl3_world    = _rl_world("rl3",    min_green=10.0, max_green=40.0)
    rl4_world    = _rl_world("rl4",    min_green=5.0,  max_green=25.0)
    custom_world = _rl_world("custom", min_green=min_green, max_green=max_green)

    # Only step the worlds we actually need for this run
    _ALL_WORLDS_MAP = {
        "baseline": base_world,
        "rl1": rl1_world,
        "rl2": rl2_world,
        "rl3": rl3_world,
        "rl4": rl4_world,
        "custom": custom_world,
    }
    if model_key in _ALL_WORLDS_MAP:
        # Single-model mode — only run the requested world
        _WORLDS = {model_key: _ALL_WORLDS_MAP[model_key]}
    else:
        # 'all' or unset → run all worlds (split-view / legacy)
        # In split-view, attach the trained policy to the matching world.
        _WORLDS = _ALL_WORLDS_MAP

    for w in _WORLDS.values():
        w.max_sim_s = max_sim_s

    step = 0
    vid_counter = 0
    spawn_timer = 0.0
    sim_clock = 0.0  # accumulated sim-seconds — independent of speed so the clock
                     # stays continuous when the user toggles sim:speed mid-run.

    # ── Aggregate-stats tracking (demand backlog + cumulative delay) ─────────
    # Only track the worlds we are actually simulating.
    from collections import deque as _deque
    _track = {k: {
        "prev_wait": {},          # vehicle id -> wait_time at previous frame
        "prev_ids": set(),
        "cum_exited": 0,          # total vehicles that have left the canvas
        "cum_exit_wait": 0.0,     # summed final wait_time of all exited vehicles
        "exit_events": _deque(),  # (sim_clock, wait_time) for rolling-window stats
        "pending": _deque(),      # PER-WORLD demand queue (vehicle specs not yet placed)
        "queue_wait": 0.0,        # summed wait accrued by this world's backlog
    } for k in _WORLDS}
    _tick_ema_ms = None    # EMA of real wall-clock ms per loop iteration
    _INSTANT_WINDOW_S = 300.0  # 5 sim-minutes
    # Per-world on-canvas cap. Demand that can't fit waits in that world's
    # pending queue and accrues wait — producing a realistic backlog when the
    # intersection can't clear vehicles as fast as they arrive.
    _PER_WORLD_CAP = _SOFT_CAP

    # Pre-populate all worlds — 1 vehicle per arm per lane across all 3 lanes.
    # Pre-populate all worlds — 1 vehicle per arm per lane across all 3 lanes.
    active_arms = ["N", "E", "W"] if intersection_type in ("t_junction", "t_junction_free_left", "y_junction", "y_junction_free_left") else ["N", "S", "E", "W"]
    for arm in active_arms:
        for lane in range(_N_LANES):
            lane_offsets = _LANE_OFFSETS.get(arm, [3.7, 7.9, 12.1])
            offset = lane_offsets[lane % _N_LANES]
            dist   = _SPAWN_DIST
            for _ in range(1):
                vid_counter += 1
                spec = _spawn_spec(vid_counter, arm, lane, intersection_type, type_weights=type_weights)
                half = _VEH_LEN.get(spec["type_id"], 4.0) / 2.0
                dist += half
                
                # Dynamic coordinate project based on arm angle
                theta = get_arm_angle(arm, intersection_type)
                w = abs(offset)
                pos_x = dist * math.cos(theta) - w * math.sin(theta)
                pos_y = dist * math.sin(theta) + w * math.cos(theta)
                pos = (pos_x, pos_y)
                
                dist += half + 4.0
                for world in _WORLDS.values():
                    v = _vehicle_from_spec(spec)
                    v.x, v.y = pos
                    world.add(v)

    try:
        while True:
            state = _session_states.get(session_id, {})
            if not state.get("running"):
                break
            if state.get("paused"):
                time.sleep(render_sleep_s)
                continue

            _tick_start = time.time()  # real wall-clock for Tick/FPS measurement

            # Re-read speed each tick so sim:speed events take effect immediately
            sim_speed = max(1, int(_session_states.get(session_id, {}).get("sim_speed", _initial_speed)))
            dt = render_sleep_s * sim_speed
            step += 1
            sim_clock += dt  # continuous wall-clock of simulated time

            # Physics substeps — the vehicle model is calibrated for dt≤0.1 s.
            _MAX_PHYS_DT = 0.10
            n_sub = max(1, int(round(dt / _MAX_PHYS_DT)))
            dt_sub = dt / n_sub

            # ── Per-world demand backlog ─────────────────────────────────────
            spawn_timer += dt
            while spawn_timer >= _spawn_interval_s:
                spawn_timer -= _spawn_interval_s
                vid_counter += 1
                spec = _spawn_spec(vid_counter, intersection_type=intersection_type, type_weights=type_weights)
                for k in _WORLDS:
                    _track[k]["pending"].append(spec)

            # Drain each world's pending queue onto its canvas (up to the cap),
            # then bank the wait accrued by whatever is still queued.
            for k, world in _WORLDS.items():
                pend = _track[k]["pending"]
                while pend and len(world.vehicles) < _PER_WORLD_CAP:
                    spec = pend[0]
                    v = _vehicle_from_spec(spec)
                    if _is_spawn_clear(world, v):
                        world.add(v)
                        pend.popleft()
                    else:
                        break
                _track[k]["queue_wait"] += len(pend) * dt

            for _ in range(n_sub):
                for world in _WORLDS.values():
                    world.step(dt_sub)

            # Attach rich aggregate stats and emit — only for active worlds
            def _stats_for(world, k):
                tk = _track[k]
                return _compute_agg_stats(
                    world, tk, sim_clock,
                    len(tk["pending"]), tk["queue_wait"],
                    _tick_ema_ms, _INSTANT_WINDOW_S,
                )

            frames = {}
            for k, world in _WORLDS.items():
                f = world.frame(step, sim_clock, session_id)
                f["stats"] = _stats_for(world, k)
                frames[k] = f

            # Emit primary frame (for the active model) and per-model event
            primary_key = model_key if model_key in frames else next(iter(frames))
            primary_frame = frames[primary_key]
            sio.emit("sim:frame", primary_frame)
            _update_runtime_snapshot(session_id, primary_frame)

            for k, f in frames.items():
                event_name = f"sim:frame:{k}"
                sio.emit(event_name, f)

            any_replay_finished = False
            for w in _WORLDS.values():
                if getattr(w, "replay_finished", False):
                    any_replay_finished = True
                    break

            if sim_clock >= max_sim_s or any_replay_finished:
                set_session_state(session_id, running=False, paused=False)
                snap = _runtime_snapshots.get(session_id)
                if snap is not None:
                    snap["sim_status"] = "done"
                try:
                    from backend.analytics.session_store import SessionStore
                    SessionStore().update_session_status(session_id, "completed")
                except Exception:
                    logger.debug("Could not persist completed status for %s", session_id)
                sio.emit("sim:stopped", {"session_id": session_id, "completed": True})
                break

            # Measure this iteration's real wall-clock cost for the Tick/FPS HUD.
            _tick_ms = (time.time() - _tick_start) * 1000.0
            _tick_ema_ms = _tick_ms if _tick_ema_ms is None else 0.2 * _tick_ms + 0.8 * _tick_ema_ms

            time.sleep(render_sleep_s)
    except Exception as exc:
        logger.exception("mock simulation thread crashed for %s", session_id)
        set_session_state(session_id, running=False, paused=False)
        sio.emit("sim:error", {"session_id": session_id, "error": f"Simulation crashed: {exc}"})
        sio.emit("sim:stopped", {"session_id": session_id})

    _sim_greenlets.pop(session_id, None)


def _make_inference_fn(session_id: str, emit_fn, model_key: str = "rl1"):
    """
    Return a closure that runs a short _SimWorld inference episode and streams
    sim:frame events to the canvas. Called by InferenceCheckpointCallback every
    N training episodes. Training pauses while this runs (~1-2s real time).
    """
    from backend.rl.mock_env import action_to_phase_duration

    def _resolve_world_phase_inf(mock_phase: int, world) -> int:
        if mock_phase == 0: return 0
        if mock_phase == 1: return 2
        if mock_phase in (2, 3):
            ns = world._queued("N") + world._queued("S")
            ew = world._queued("E") + world._queued("W")
            return 0 if ns >= ew else 2
        return 4

    def _inference_fn(model) -> None:
        try:
            from backend.analytics.session_store import SessionStore
            session = SessionStore().get_session(session_id)
            sim_config_db = (session.get("sim_config") or {}) if session else {}
            state_cfg = (_session_states.get(session_id, {}) or {}).get("raw_sim_config", {}) or {}
            merged_cfg = {**sim_config_db, **state_cfg}

            emit_fn("training:inference_start", {"session_id": session_id})

            def policy_fn(world):
                obs = _build_rl_obs(world, sim_config=merged_cfg)
                action, _ = model.predict(obs, deterministic=True)
                mock_phase, duration = action_to_phase_duration(int(action))
                world_phase = _resolve_world_phase_inf(mock_phase, world)
                return world_phase, duration

            world = _SimWorld(fixed_time=False, policy_fn=policy_fn)

            frame_event = f"sim:frame:{model_key}"
            dt = 0.05  # sim seconds per step — matches render_sleep_s in _run_mock_sim
            sim_clock = 0.0
            for step_i in range(200):
                world.step(dt)
                sim_clock += dt
                frame = world.frame(step_i + 1, sim_clock, session_id)
                emit_fn(frame_event, frame)

            emit_fn("training:inference_end", {"session_id": session_id})
        except Exception as exc:
            logger.warning("_make_inference_fn error (non-fatal): %s", exc)

    return _inference_fn


def _run_mock_training(sio, session_id: str) -> None:
    """Background thread: emit training:episode events, simulating RL improvement."""
    episode = 0
    best_reward = None
    # Starting baseline (poor performance, like fixed-time controller)
    base_wait = 85.0
    base_reward = -120.0
    base_throughput = 260

    while True:
        state = _session_states.get(session_id, {})
        if not state.get("training"):
            break

        time.sleep(0.4)  # one episode every ~0.4s for perfect fast live visual feedback of 500 episodes

        state = _session_states.get(session_id, {})
        if not state.get("training"):
            break

        episode += 1
        # Simulate gradual RL improvement with noise over 500 episodes
        progress = min(episode / 450.0, 1.0)  # normalised 0→1
        reward = base_reward + (base_reward * -0.85) * _sigmoid(progress * 8 - 4) + random.gauss(0, 6)
        mean_wait = base_wait * (1.0 - 0.72 * _sigmoid(progress * 8 - 4)) + random.gauss(0, 3)
        mean_wait = max(mean_wait, 8.0)
        throughput = int(base_throughput + (720 - base_throughput) * _sigmoid(progress * 8 - 4) + random.gauss(0, 20))
        throughput = max(throughput, base_throughput)

        payload = {
            "session_id": session_id,
            "episode": episode,
            "reward": round(reward, 2),
            "length": random.randint(3500, 3700),
            "metrics": {
                "mean_wait": round(mean_wait, 1),
                "throughput": throughput,
            },
        }
        sio.emit("training:episode", payload)

        # Milestone insights
        if episode == 1:
            sio.emit("training:insight", {
                "icon": "🚀", "message": "Training started",
                "episode": episode, "session_id": session_id,
            })
        if best_reward is None or reward > (best_reward or -999):
            if episode > 1:
                sio.emit("training:insight", {
                    "icon": "⭐", "message": f"New best reward: {reward:.1f}",
                    "episode": episode, "session_id": session_id,
                })
            best_reward = reward

        if episode == 50:
            sio.emit("training:insight", {
                "icon": "🏆", "message": "Agent beats fixed-time baseline!",
                "episode": episode, "session_id": session_id,
            })

        if episode == 150:
            sio.emit("training:insight", {
                "icon": "🎯", "message": "50% wait-time reduction achieved",
                "episode": episode, "session_id": session_id,
            })

        if episode == 300:
            sio.emit("training:insight", {
                "icon": "📈", "message": "80% green signal utilization reached",
                "episode": episode, "session_id": session_id,
            })

        # Converge after 500 episodes
        if episode >= 500:
            sio.emit("training:converged", {
                "session_id": session_id,
                "episode": episode,
            })
            sio.emit("training:insight", {
                "icon": "✅", "message": "Agent converged — stable policy learned",
                "episode": episode, "session_id": session_id,
            })
            set_session_state(session_id, training=False)
            break

    _training_greenlets.pop(session_id, None)


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _run_curriculum_training(
    session_id: str,
    sim_config,
    adverse_config,
    total_steps: int,
    emit_fn,
) -> None:
    """
    Stage 4 Curriculum: Stage 2 (enriched mock) for first 60% of timesteps,
    then Stage 3 (SUMO) for remaining 40% with Webster BC warm-up.
    """
    import threading
    from backend.rl.trainer import PPOTrainer, DecisionCaptureCallback
    from backend.rl.mock_env import make_mock_env, run_websters_baseline
    from backend.rl.decision_store import STORE as _decision_store

    split = 0.60
    stage2_steps = int(total_steps * split)
    stage3_steps = total_steps - stage2_steps

    _decision_store.clear(session_id)

    # ── Phase 1: Stage 2 enriched mock ──────────────────────────────────
    emit_fn("training:stage_change", {"session_id": session_id, "from_stage": 0, "to_stage": 2})
    sim_config.training_stage = 2

    base_s2 = run_websters_baseline(sim_config, n_decisions=200, seed=7)
    if not any(h is base_s2 for h in _baseline_history):
        _baseline_history.append(base_s2)
        logger.info("Saved curriculum Stage 2 baseline execution to history. Total saved runs: %d", len(_baseline_history))

    # Collect all demonstrations from baseline history
    combined_demos = []
    for hist_base in _baseline_history:
        combined_demos.extend(hist_base.get("demonstrations", []))

    # De-duplicate demonstrations by observation
    seen_obs = set()
    unique_demos = []
    for obs, action in combined_demos:
        obs_key = tuple(np.round(obs, 4))
        if obs_key not in seen_obs:
            seen_obs.add(obs_key)
            unique_demos.append((obs, action))

    logger.info(
        "Curriculum Stage 2 pre-training history: loaded %d baseline runs, %d total demonstrations, %d unique demonstrations for behavioral cloning",
        len(_baseline_history),
        len(combined_demos),
        len(unique_demos)
    )

    trainer_s2 = PPOTrainer(
        sim_config=sim_config,
        adverse_config=adverse_config,
        session_id=session_id,
        db_url="sqlite:///backend/db/tso.db",
        model_dir="models",
        total_timesteps=stage2_steps,
        emit_fn=emit_fn,
        env_factory=make_mock_env,
        extra_callbacks=[
            DecisionCaptureCallback(session_id=session_id, emit_fn=emit_fn),
        ],
        baseline_wait=base_s2.get("mean_wait", 0.0),
        baseline_demonstrations=unique_demos,
    )
    result_s2 = trainer_s2.train()
    logger.info("Curriculum Stage 2 complete. model=%s", result_s2.get("model_path"))

    # ── Phase 2: Stage 3 SUMO (with Webster demos as BC warm-up) ───────
    emit_fn("training:stage_change", {"session_id": session_id, "from_stage": 2, "to_stage": 3})
    sim_config.training_stage = 3

    try:
        from backend.rl.traffic_env import make_env as make_sumo_env
        from backend.rl.baseline_agent import WebstersController
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
        try:
            from backend.rl.traffic_env import make_env as make_sumo_env
        except Exception:
            logger.error("SUMO not available — aborting Stage 3")
            return

    trainer_s3 = PPOTrainer(
        sim_config=sim_config,
        adverse_config=adverse_config,
        session_id=session_id,
        db_url="sqlite:///backend/db/tso.db",
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

    if result_s3.get("model_path"):
        active_model_key = _session_states.get(session_id, {}).get("model_key", "rl1")
        register_trained_model(active_model_key, result_s3["model_path"])
        emit_fn("training:model_saved", {
            "session_id": session_id,
            "model_key":  active_model_key,
            "model_path": result_s3["model_path"],
        })

    emit_fn("training:stage_change", {
        "session_id": session_id, "from_stage": 3, "to_stage": 0, "done": True
    })


def _run_real_training(sio, session_id: str) -> None:
    """Background thread: run a genuine PPO training run on the SUMO-free
    point-queue env, streaming real episode/insight/convergence events.

    Falls back to the synthetic _run_mock_training if Stable-Baselines3 or the
    RL stack can't be imported/instantiated, so the demo never hard-fails.
    """
    try:
        from stable_baselines3.common.callbacks import BaseCallback
        from backend.config import SimulationConfig, AdverseConfig
        from backend.rl.trainer import PPOTrainer
        from backend.rl.mock_env import make_mock_env, run_fixed_time_baseline
    except Exception as exc:  # SB3 / RL stack unavailable
        logger.warning("Real RL unavailable (%s) — falling back to mock training", exc)
        _run_mock_training(sio, session_id)
        return

    # Stops model.learn() promptly when the user hits "Stop Training".
    class _StopCallback(BaseCallback):
        def _on_step(self) -> bool:
            return bool(_session_states.get(session_id, {}).get("training", False))

    # Paces episode emission so the live chart animates instead of filling
    # instantly (pure-Python episodes complete in well under a millisecond).
    class _PaceCallback(BaseCallback):
        def _on_step(self) -> bool:
            dones = self.locals.get("dones", [False])
            if (dones[0] if hasattr(dones, "__len__") else dones):
                time.sleep(0.12)
            return True

    # Plateau-based convergence: the strict coefficient-of-variation test in
    # ConvergenceCallback is unreachable on a stochastic reward, so we instead
    # declare convergence once learning flattens — the mean reward of the most
    # recent window stops improving meaningfully over the previous window.
    class _PlateauCallback(BaseCallback):
        WINDOW = 40
        MIN_EPISODES = 160
        IMPROVE_FRAC = 0.03   # < 3% gain window-over-window => plateaued

        def __init__(self, sim_config=None):
            super().__init__()
            self.sim_config = sim_config
            self._ep_reward = 0.0
            self._ep_num = 0
            self._rewards: list[float] = []
            self._done = False

        def _on_step(self) -> bool:
            rewards = self.locals.get("rewards", [0.0])
            self._ep_reward += float(rewards[0] if hasattr(rewards, "__len__") else rewards)
            dones = self.locals.get("dones", [False])
            if not (dones[0] if hasattr(dones, "__len__") else dones):
                return True

            self._ep_num += 1
            self._rewards.append(self._ep_reward)
            self._ep_reward = 0.0

            if self._done or self._ep_num < self.MIN_EPISODES:
                return True

            recent = self._rewards[-self.WINDOW:]
            prev = self._rewards[-2 * self.WINDOW:-self.WINDOW]
            if len(prev) < self.WINDOW:
                return True
            recent_mean = sum(recent) / len(recent)
            prev_mean = sum(prev) / len(prev)
            gain = (recent_mean - prev_mean) / (abs(prev_mean) + 1e-6)
            # Only declare convergence once the agent has actually learned —
            # i.e. recent reward is meaningfully better (higher, since reward is
            # negative) than its first window. This prevents calling a bad early
            # plateau "converged" while the policy is still worse than baseline.
            start_mean = sum(self._rewards[:self.WINDOW]) / self.WINDOW
            learned = recent_mean > start_mean * 0.5  # reward improved toward 0
            if learned and gain < self.IMPROVE_FRAC:
                if getattr(self.sim_config, "early_stopping", True):
                    self._done = True
                    sio.emit("training:converged", {"session_id": session_id, "episode": self._ep_num})
                    sio.emit("training:insight", {
                        "icon": "✅",
                        "message": "Agent converged — policy stabilised, no further gains",
                        "episode": self._ep_num,
                        "session_id": session_id,
                    })
                    return False  # stop learning
            return True

    try:
        from backend.analytics.session_store import SessionStore
        import dataclasses
        store = SessionStore()
        session = store.get_session(session_id)
        if session is not None:
            sim_dict = session.get("sim_config") or {}
            adverse_dict = session.get("adverse_config") or {}
            sim_fields = {f.name for f in dataclasses.fields(SimulationConfig)}
            adverse_fields = {f.name for f in dataclasses.fields(AdverseConfig)}
            sim_config = SimulationConfig(**{k: v for k, v in sim_dict.items() if k in sim_fields})
            adverse_config = AdverseConfig(**{k: v for k, v in adverse_dict.items() if k in adverse_fields})
        else:
            sim_config = SimulationConfig()
            adverse_config = AdverseConfig()

        if getattr(sim_config, "rl_algorithm", "PPO") == "Same as Baseline":
            logger.info("Training with 'Same as Baseline' is a no-op.")
            sio.emit("training:insight", {
                "session_id": session_id,
                "icon": "ℹ",
                "message": "Algorithm is set to 'Same as Baseline'. No neural network training required.",
                "episode": 1,
            })
            sio.emit("training:converged", {"session_id": session_id, "episode": 1})
            sio.emit("training:stopped", {"session_id": session_id})
            set_session_state(session_id, training=False)
            _training_greenlets.pop(session_id, None)
            try:
                from backend.analytics.session_store import SessionStore
                SessionStore().update_session_status(session_id, "done")
            except Exception:
                pass
            return

        # Use pre-computed baseline from the Baseline tab if available.
        # If user ran Baseline tab first, _baseline_cache['latest'] holds the
        # result (with demonstrations for BC).  Otherwise fall back to running
        # the configured controller fresh so training always has a reference.
        controller_type = getattr(sim_config, "baseline_controller", "fixed_time")
        base: dict = {"mean_wait": 0.0, "throughput": 0, "demonstrations": [], "controller": controller_type}
        try:
            from backend.rl.mock_env import run_websters_baseline
            cached = _baseline_cache.get("latest")
            if cached:
                base = cached
                logger.info(
                    "Using cached baseline (%s): mean_wait=%.1fs  throughput=%d  demos=%d",
                    base.get("controller"), base["mean_wait"], base["throughput"],
                    len(base.get("demonstrations", [])),
                )
                if not any(h is base for h in _baseline_history):
                    _baseline_history.append(base)
                    logger.info("Saved cached baseline execution to history. Total saved runs: %d", len(_baseline_history))
            else:
                # No cached baseline — compute fresh (fallback)
                logger.info("No cached baseline found, computing fresh (%s)…", controller_type)
                if controller_type == "websters":
                    base = run_websters_baseline(sim_config, n_decisions=200)
                else:
                    base = run_fixed_time_baseline(sim_config)
                base["controller"] = controller_type

            # Ensure this baseline run is in history
            if not any(h is base for h in _baseline_history):
                _baseline_history.append(base)
                logger.info("Saved fresh fallback baseline execution to history. Total saved runs: %d", len(_baseline_history))

            sio.emit("training:baseline", {
                "session_id": session_id,
                "metrics": {
                    "mean_wait": base["mean_wait"],
                    "throughput": base["throughput"],
                    "controller": base.get("controller", controller_type),
                },
            })
        except Exception:
            logger.exception("Baseline computation failed (non-fatal)")

        total_steps = _session_states.get(session_id, {}).get("total_timesteps", 80_000)
        logger.info(
            "TRAINING CONFIG: volume=%s vph  pattern=%s  timesteps=%s",
            sim_config.traffic_volume_vph,
            sim_config.traffic_pattern,
            total_steps,
        )
        from backend.rl.trainer import DecisionCaptureCallback, StageProgressCallback
        from backend.rl.decision_store import STORE as _decision_store

        _decision_store.clear(session_id)

        training_mode = _session_states.get(session_id, {}).get("training_mode", "stage1")

        # Route to correct env_factory and set training_stage on sim_config
        if training_mode == "stage4":
            # Curriculum: delegate to separate orchestrator, then return
            _run_curriculum_training(
                session_id=session_id,
                sim_config=sim_config,
                adverse_config=adverse_config,
                total_steps=total_steps,
                emit_fn=sio.emit,
            )
            return
        elif training_mode == "stage2":
            sim_config.training_stage = 2
            env_factory = make_mock_env
        elif training_mode == "stage3":
            from backend.rl.traffic_env import make_env as make_sumo_env
            sim_config.training_stage = 3
            env_factory = make_sumo_env
        else:  # stage1 default
            sim_config.training_stage = 1
            env_factory = make_mock_env

        # Collect all demonstrations from baseline history
        combined_demos = []
        for hist_base in _baseline_history:
            combined_demos.extend(hist_base.get("demonstrations", []))

        # De-duplicate demonstrations by observation
        seen_obs = set()
        unique_demos = []
        for obs, action in combined_demos:
            obs_key = tuple(np.round(obs, 4))
            if obs_key not in seen_obs:
                seen_obs.add(obs_key)
                unique_demos.append((obs, action))

        logger.info(
            "Pre-training history loaded: %d baseline runs, %d total demonstrations, %d unique demonstrations for behavioral cloning",
            len(_baseline_history),
            len(combined_demos),
            len(unique_demos)
        )

        trainer = PPOTrainer(
            sim_config=sim_config,
            adverse_config=adverse_config,
            session_id=session_id,
            total_timesteps=total_steps,
            emit_fn=sio.emit,
            env_factory=env_factory,
            extra_callbacks=[
                _StopCallback(),
                _PaceCallback(),
                _PlateauCallback(sim_config),
                DecisionCaptureCallback(session_id=session_id, emit_fn=sio.emit),
            ],
            baseline_wait=base.get("mean_wait", 0.0),
            baseline_demonstrations=unique_demos,
        )
        result = trainer.train()
        model_path = result.get("model_path")
        logger.info("Real training finished: %s  model_path=%s", result, model_path)

        if model_path:
            # Stage 2: SUMO Fine-tuning (Hybrid Step)
            try:
                logger.info("Starting Stage 2: SUMO Simulator Fine-tuning…")
                sio.emit("training:insight", {
                    "session_id": session_id,
                    "icon": "⚡",
                    "message": "Starting Stage 2: Fine-tuning agent policy on SUMO physics environment...",
                    "episode": result.get("total_episodes", 50) + 1,
                })
                from backend.rl.transfer_learner import TransferLearner
                from backend.rl.traffic_env import TrafficEnv
                
                # 1. Create the real SUMO environment
                sumo_env = TrafficEnv(
                    sim_config=sim_config,
                    adverse_config=adverse_config,
                    port=8819,  # Use 8819 to avoid conflicts with active simulations
                    baseline_wait=base.get("mean_wait", 0.0),
                )
                
                # 2. Fine-tune the model on realistic SUMO physics
                learner = TransferLearner(
                    base_model_path=model_path,
                    new_env=sumo_env,
                    fine_tune_timesteps=5000,  # Brief fine-tuning window (approx 20-30s)
                    learning_rate=1e-4,        # Lower learning rate to avoid forgetting
                    reset_last_layers=False,   # Do not reset, preserve mock-learned weights
                )
                learner.load_base()
                learner.fine_tune()
                
                # 3. Save the final hybrid model
                learner.save_fine_tuned(model_path)
                sumo_env.close()
                logger.info("Stage 2 SUMO Fine-tuning complete!")
                sio.emit("training:insight", {
                    "session_id": session_id,
                    "icon": "✅",
                    "message": "Stage 2 complete: Policy optimized for realistic SUMO physics.",
                    "episode": result.get("total_episodes", 50) + 2,
                })
            except Exception as sumo_exc:
                logger.warning("Stage 2 SUMO Fine-tuning failed (non-fatal, proceeding with pre-trained mock policy): %s", sumo_exc)

        # Register the trained model under the model_key (e.g. 'rl1') so that
        # _load_rl_policy() can find it even when the next simulation run uses
        # a different session_id.
        if model_path:
            active_model_key = _session_states.get(session_id, {}).get("model_key", "rl1")
            register_trained_model(active_model_key, model_path)
            sio.emit("training:model_saved",
                     {"session_id": session_id,
                      "model_key":  active_model_key,
                      "model_path": model_path})
    except Exception:
        logger.exception("Real training crashed — falling back to mock")
        if _session_states.get(session_id, {}).get("training"):
            _run_mock_training(sio, session_id)
            return

    sio.emit("training:stopped", {"session_id": session_id})
    set_session_state(session_id, training=False)
    _training_greenlets.pop(session_id, None)


# ---------------------------------------------------------------------------
# Handler registration
# ---------------------------------------------------------------------------

def init_socket_handlers(socketio, app) -> None:  # noqa: C901
    """Register all Socket.IO event handlers on the given socketio instance."""

    from flask_socketio import emit

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    @socketio.on("connect")
    def handle_connect():
        emit("server:hello", {"version": "1.0.0", "status": "ready"})

    @socketio.on("disconnect")
    def handle_disconnect():
        pass

    # ------------------------------------------------------------------
    # Simulation control
    # ------------------------------------------------------------------

    @socketio.on("sim:start")
    def handle_sim_start(data):
        try:
            session_id = data.get("session_id", "")
            if not session_id:
                emit("sim:error", {"error": "session_id is required"})
                return

            # Save or update the session configurations in the DB, clearing previous run
            from backend.analytics.session_store import SessionStore
            from backend.config import SimulationConfig, AdverseConfig
            import dataclasses

            store = SessionStore()
            sim_dict = data.get("sim_config") or {}
            adverse_dict = data.get("adverse_config") or {}

            sim_fields = {f.name for f in dataclasses.fields(SimulationConfig)}
            adverse_fields = {f.name for f in dataclasses.fields(AdverseConfig)}

            sim_cfg = SimulationConfig(**{k: v for k, v in sim_dict.items() if k in sim_fields})
            adverse_cfg = AdverseConfig(**{k: v for k, v in adverse_dict.items() if k in adverse_fields})

            try:
                if store.get_session(session_id) is not None:
                    store.delete_session(session_id)
                store.create_session(session_id, sim_cfg, adverse_cfg)
            except Exception as db_err:
                logger.warning("Database write skipped/failed in sim_start: %s", db_err)

            # Signal any existing sim thread to stop (it checks running flag)
            set_session_state(session_id, running=False)
            _sim_greenlets.pop(session_id, None)

            # model_key tells _run_mock_sim which world to simulate:
            # 'baseline', 'rl1', 'rl2', 'rl3', 'rl4', 'custom', or 'all'
            model_key = data.get("model_key") or "all"
            replay_episode = data.get("replay_episode")
            set_session_state(session_id, running=True, paused=False,
                              raw_sim_config=sim_dict, model_key=model_key,
                              replay_episode=replay_episode)
            emit("sim:started", {"session_id": session_id, "status": "running"})

            # Launch background sim loop as a daemon thread
            t = threading.Thread(target=_run_mock_sim, args=(socketio, session_id), daemon=True)
            t.start()
            _sim_greenlets[session_id] = t

        except Exception as exc:
            logger.exception("sim:start handler error")
            emit("sim:error", {"error": str(exc)})

    @socketio.on("sim:stop")
    def handle_sim_stop(data):
        session_id = data.get("session_id", "")
        # Setting running=False causes the thread loop to exit naturally
        set_session_state(session_id, running=False, paused=False)
        snap = _runtime_snapshots.get(session_id)
        if snap is not None:
            snap["sim_status"] = "done"
        _sim_greenlets.pop(session_id, None)
        # _trained_model_paths is keyed by model_key and must survive stop/restart
        # so subsequent simulation runs re-use the trained policy without
        # retraining. Only evict stale in-memory cached models (they reload lazily).
        # Do NOT clear _trained_model_paths here.
        try:
            from backend.analytics.session_store import SessionStore
            SessionStore().update_session_status(session_id, "stopped")
        except Exception:
            logger.debug("Could not persist completed status for %s", session_id)
        emit("sim:stopped", {"session_id": session_id, "completed": False})

    @socketio.on("sim:pause")
    def handle_sim_pause(data):
        session_id = data.get("session_id", "")
        set_session_state(session_id, paused=True)
        emit("sim:paused", {"session_id": session_id, "paused": True})

    @socketio.on("sim:resume")
    def handle_sim_resume(data):
        session_id = data.get("session_id", "")
        set_session_state(session_id, paused=False)
        emit("sim:resumed", {"session_id": session_id, "paused": False})

    @socketio.on("sim:speed")
    def handle_sim_speed(data):
        """Change simulation speed mid-run. multiplier: 1 | 5 | 10 | 20"""
        if not isinstance(data, dict):
            return
        session_id  = data.get("session_id", "")
        multiplier  = max(1, min(20, int(data.get("multiplier", 1))))
        if not session_id:
            return
        set_session_state(session_id, sim_speed=multiplier)
        logger.debug("sim:speed → session=%s multiplier=%s", session_id, multiplier)
        emit("sim:speed_set", {"session_id": session_id, "multiplier": multiplier})

    # ------------------------------------------------------------------
    # Config
    # ------------------------------------------------------------------

    @socketio.on("config:update")
    def handle_config_update(data):
        session_id = data.get("session_id", "")
        field = data.get("field", "")
        value = data.get("value")
        state = get_session_state(session_id)
        overrides = state.get("config_overrides", {})
        overrides[field] = value
        set_session_state(session_id, config_overrides=overrides)
        emit("config:updated", {"session_id": session_id, "field": field, "value": value})

    # ------------------------------------------------------------------
    # Baseline pre-computation (triggered from Baseline tab)
    # ------------------------------------------------------------------

    @socketio.on("baseline:compute")
    def handle_baseline_compute(data):
        """Run baseline controller, cache results for RL training re-use.

        Emits baseline:computed with metrics.  Demonstrations are kept
        server-side in _baseline_cache so they never travel over the wire.
        """
        try:
            from backend.config import SimulationConfig, AdverseConfig
            from backend.rl.mock_env import run_fixed_time_baseline, run_websters_baseline
            import dataclasses

            session_id = data.get("session_id", "")
            sim_dict = data.get("sim_config") or {}
            sim_fields = {f.name for f in dataclasses.fields(SimulationConfig)}
            sim_config = SimulationConfig(**{k: v for k, v in sim_dict.items() if k in sim_fields})

            controller_type = getattr(sim_config, "baseline_controller", "fixed_time")

            if controller_type == "websters":
                result = run_websters_baseline(sim_config, n_decisions=200)
            else:
                result = run_fixed_time_baseline(sim_config)

            result["controller"] = controller_type
            _baseline_cache["latest"] = result
            _baseline_history.append(result)
            logger.info("Saved baseline execution to history. Total saved runs: %d", len(_baseline_history))

            logger.info(
                "baseline:compute (%s): mean_wait=%.1fs  throughput=%d  demos=%d",
                controller_type, result["mean_wait"], result["throughput"],
                len(result.get("demonstrations", [])),
            )
            emit("baseline:computed", {
                "session_id": session_id,
                "mean_wait": result["mean_wait"],
                "throughput": result["throughput"],
                "controller": controller_type,
            })
        except Exception:
            logger.exception("baseline:compute failed")
            emit("baseline:computed", {"error": "Baseline computation failed"})

    # ------------------------------------------------------------------
    # Preset
    # ------------------------------------------------------------------

    @socketio.on("preset:load")
    def handle_preset_load(data):
        from backend.config_presets import get_preset
        preset_id = data.get("preset_id", "")
        preset = get_preset(preset_id)
        if preset is None:
            emit("preset:error", {"error": f"Unknown preset_id: '{preset_id}'"})
            return
        emit("preset:loaded", {
            "preset_id": preset.id,
            "name": preset.name,
            "sim_config": preset.sim_config,
            "adverse_config": preset.adverse_config,
        })

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    @socketio.on("training:start")
    def handle_training_start(data):
        try:
            session_id = data.get("session_id", "")
            total_timesteps = data.get("total_timesteps", 100_000)
            training_mode = data.get("training_mode", "stage1")

            # Save or update the session configurations in the DB, clearing previous run
            from backend.analytics.session_store import SessionStore
            from backend.config import SimulationConfig, AdverseConfig
            import dataclasses

            store = SessionStore()
            sim_dict = data.get("sim_config") or {}
            adverse_dict = data.get("adverse_config") or {}

            if sim_dict or adverse_dict:
                sim_fields = {f.name for f in dataclasses.fields(SimulationConfig)}
                adverse_fields = {f.name for f in dataclasses.fields(AdverseConfig)}

                sim_cfg = SimulationConfig(**{k: v for k, v in sim_dict.items() if k in sim_fields})
                adverse_cfg = AdverseConfig(**{k: v for k, v in adverse_dict.items() if k in adverse_fields})

                try:
                    if store.get_session(session_id) is not None:
                        store.delete_session(session_id)
                    store.create_session(session_id, sim_cfg, adverse_cfg)
                except Exception as db_err:
                    logger.warning("Database write skipped/failed in training_start: %s", db_err)

            # Signal any existing training thread to stop (it checks training flag)
            set_session_state(session_id, training=False)
            _training_greenlets.pop(session_id, None)

            set_session_state(
                session_id,
                training=True,
                total_timesteps=total_timesteps,
                raw_sim_config=sim_dict,
                training_mode=training_mode,
            )
            emit("training:started", {"session_id": session_id})

            # Launch real PPO training as a daemon thread (falls back to the
            # synthetic curve internally if the RL stack is unavailable).
            t = threading.Thread(target=_run_real_training, args=(socketio, session_id), daemon=True)
            t.start()
            _training_greenlets[session_id] = t

        except Exception as exc:
            logger.exception("training:start handler error")
            emit("training:error", {"error": str(exc)})

    @socketio.on("training:stop")
    def handle_training_stop(data):
        session_id = data.get("session_id", "")
        # Setting training=False causes the thread loop to exit naturally
        set_session_state(session_id, training=False)
        _training_greenlets.pop(session_id, None)
        emit("training:stopped", {"session_id": session_id})

    # ------------------------------------------------------------------
    # Demo
    # ------------------------------------------------------------------

    @socketio.on("demo:start")
    def handle_demo_start(data):
        from backend.config_presets import get_preset
        preset = get_preset("hyd_rush_am")
        if preset is not None:
            emit("preset:loaded", {
                "preset_id": preset.id,
                "name": preset.name,
                "sim_config": preset.sim_config,
                "adverse_config": preset.adverse_config,
            })
        emit("demo:ready", {
            "preset": "hyd_rush_am",
            "description": (
                "Quick 60-second demo using Hyderabad AM Rush Hour preset. "
                "Watch the RL agent optimise signal timings under peak morning traffic."
            ),
        })

    # ------------------------------------------------------------------
    # Report
    # ------------------------------------------------------------------

    @socketio.on("report:generate")
    def handle_report_generate(data):
        session_id = data.get("session_id", "")
        fmt = data.get("format", "html")
        content_url = f"/api/sessions/{session_id}/report/{fmt}"
        emit("report:ready", {
            "session_id": session_id,
            "format": fmt,
            "content_url": content_url,
        })

    # ------------------------------------------------------------------
    # XAI Explainer
    # ------------------------------------------------------------------

    @socketio.on("explain:request")
    def handle_explain_request(data):
        session_id = data.get("session_id", "")
        obs = data.get("obs", [])

        try:
            from backend.rl.explainer import TrafficExplainer  # type: ignore
            explainer = TrafficExplainer()
            result = explainer.explain(obs)
            reason = result.get("reason", "No explanation available.")
            top_features = result.get("top_features", [])
        except Exception:
            logger.debug("TrafficExplainer unavailable — using mock explanation")
            reason = (
                "Agent prioritised the arm with highest queue density "
                "to minimise total wait time."
            )
            top_features = [
                {"feature": "queue_length_arm_0", "importance": 0.42},
                {"feature": "wait_time_arm_1",    "importance": 0.31},
                {"feature": "throughput_arm_2",   "importance": 0.15},
            ]

        emit("explain:result", {
            "session_id": session_id,
            "reason": reason,
            "top_features": top_features,
        })
