"""
Common base classes, helpers, and constants for mock simulations.
"""
from __future__ import annotations

import logging
import math
import random
from collections import deque, defaultdict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_VEHICLE_TYPES = [
    "car", "car", "car",
    "two_wheeler", "two_wheeler",
    "auto_rickshaw", "auto_rickshaw",
    "cab", "ev_scooter",
    "delivery_bike", "tsrtc_bus", "truck",
]

_PHASE_GREEN: dict[int, set] = {
    0: {"N", "S"},  # N-S straight green
    1: set(),       # N-S yellow
    2: {"E", "W"},  # E-W straight green
    3: set(),       # E-W yellow
    4: set(),       # all-red
}

_PHASE_DURATIONS = [28.0, 4.0, 28.0, 4.0, 2.0]

_STOP_DIST = 19.8
_MOVE_SPEED = 14.0
_SPAWN_DIST = 78.0

_CROSS_CONFLICTS: dict[str, frozenset] = {
    "N": frozenset({"E", "W"}),
    "S": frozenset({"E", "W"}),
    "E": frozenset({"N", "S"}),
    "W": frozenset({"N", "S"}),
}

_LANE_OFFSETS: dict[str, list] = {
    "N": [3.7, 7.9, 12.1],
    "S": [-3.7, -7.9, -12.1],
    "E": [3.7, 7.9, 12.1],
    "W": [-3.7, -7.9, -12.1],
}

_N_LANES = 3
_LANE_INNER = 3.7

_LANE_RANGE: dict[str, tuple[float, float]] = {
    "N": (1.6, 13.8),
    "S": (-13.8, -1.6),
    "E": (1.6, 13.8),
    "W": (-13.8, -1.6),
}

_VEH_LEN: dict[str, float] = {
    "car": 4.0, "cab": 4.2, "ev_scooter": 2.2, "two_wheeler": 2.0,
    "delivery_bike": 2.2, "auto_rickshaw": 3.0, "e_rickshaw": 3.2,
    "tsrtc_bus": 9.5, "school_bus": 7.5, "truck": 8.5,
}

_LAT_FREEDOM: dict[str, float] = {
    "two_wheeler": 3.5,
    "delivery_bike": 3.5,
    "ev_scooter": 3.0,
    "auto_rickshaw": 2.0,
    "e_rickshaw": 1.8,
    "car": 1.2,
    "cab": 1.2,
    "tsrtc_bus": 0.3,
    "school_bus": 0.3,
    "truck": 0.3,
}

_VEH_WIDTH: dict[str, float] = {
    "two_wheeler": 0.8,
    "delivery_bike": 0.8,
    "ev_scooter": 0.9,
    "auto_rickshaw": 1.7,
    "e_rickshaw": 1.7,
    "car": 1.8,
    "cab": 1.8,
    "tsrtc_bus": 2.4,
    "school_bus": 2.4,
    "truck": 2.6,
}

_TYPE_SPEED: dict[str, float] = {
    "two_wheeler": 18.0,
    "delivery_bike": 17.0,
    "ev_scooter": 14.0,
    "auto_rickshaw": 12.0,
    "e_rickshaw": 8.0,
    "car": 14.0,
    "cab": 14.0,
    "tsrtc_bus": 10.0,
    "school_bus": 9.0,
    "truck": 10.0,
}

_RED_RUN_PROB: dict[str, float] = {
    "two_wheeler": 0.0,
    "delivery_bike": 0.0,
    "ev_scooter": 0.0,
    "auto_rickshaw": 0.0,
    "e_rickshaw": 0.0,
    "car": 0.0,
    "cab": 0.0,
    "tsrtc_bus": 0.0,
    "school_bus": 0.0,
    "truck": 0.0,
}

_BIKE_TYPES = frozenset({"two_wheeler", "delivery_bike", "ev_scooter"})
_MIN_BIKE_GAP = 2.8
_LAT_STEER_RATE = 6.0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_arm_angle(arm: str, intersection_type: str) -> float:
    if intersection_type in ("y_junction", "y_junction_free_left"):
        if arm == "N": return -math.pi / 2
        if arm == "E": return math.pi / 6
        if arm == "W": return 5 * math.pi / 6
    elif intersection_type in ("six_arm", "six_arm_free_left"):
        if arm == "E": return 0
        if arm == "S": return math.pi / 3
        if arm == "W": return math.pi
        if arm == "N": return 5 * math.pi / 3
    if arm == "N": return -math.pi / 2
    if arm == "S": return math.pi / 2
    if arm == "E": return 0
    if arm == "W": return math.pi
    return 0.0


def get_exit_arm(spawn_arm: str, turn_dir: str, intersection_type: str) -> str:
    if turn_dir in ("uturn", "mid_uturn"):
        return spawn_arm

    if intersection_type in ("y_junction", "y_junction_free_left"):
        if spawn_arm == "N": return "W" if turn_dir == "left" else "E"
        if spawn_arm == "E": return "N" if turn_dir == "left" else "W"
        if spawn_arm == "W": return "E" if turn_dir == "left" else "N"
    elif intersection_type in ("six_arm", "six_arm_free_left"):
        if turn_dir == "straight":
            if spawn_arm == "N": return "S"
            if spawn_arm == "S": return "W"
            if spawn_arm == "E": return "W"
            if spawn_arm == "W": return "E"
        elif turn_dir == "left":
            if spawn_arm == "N": return "E"
            if spawn_arm == "S": return "E"
            if spawn_arm == "E": return "S"
            if spawn_arm == "W": return "N"
        else:
            if spawn_arm == "N": return "W"
            if spawn_arm == "S": return "N"
            if spawn_arm == "E": return "N"
            if spawn_arm == "W": return "S"
    elif intersection_type in ("t_junction", "t_junction_free_left"):
        if spawn_arm == "N": return "E" if turn_dir == "left" else "W"
        if spawn_arm == "E": return "N" if turn_dir == "right" else "W"
        if spawn_arm == "W": return "N" if turn_dir == "left" else "E"
    if spawn_arm == "N": return "W" if turn_dir == "right" else ("E" if turn_dir == "left" else "S")
    if spawn_arm == "S": return "E" if turn_dir == "right" else ("W" if turn_dir == "left" else "N")
    if spawn_arm == "E": return "N" if turn_dir == "right" else ("S" if turn_dir == "left" else "W")
    if spawn_arm == "W": return "S" if turn_dir == "right" else ("N" if turn_dir == "left" else "E")
    return "N"


def intersect_lines(p1: tuple[float, float], d1: tuple[float, float], p2: tuple[float, float], d2: tuple[float, float]) -> tuple[float, float]:
    denom = d1[0] * (-d2[1]) - d1[1] * (-d2[0])
    if abs(denom) < 1e-5:
        return ((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)
    t1 = ((p2[0] - p1[0]) * (-d2[1]) - (p2[1] - p1[1]) * (-d2[0])) / denom
    return (p1[0] + t1 * d1[0], p1[1] + t1 * d1[1])


def _allowed_turns_for_arm(lane_layout: dict | None, arm: str) -> set | None:
    if lane_layout is None:
        return None
    lane_dirs = lane_layout.get("lane_directions")
    if not lane_dirs or arm not in lane_dirs:
        return None
    allowed: set[str] = set()
    for ld in lane_dirs[arm]:
        if ld in ("straight", "left", "right", "uturn", "mid_uturn"):
            allowed.add(ld)
        elif ld == "free_left":
            allowed.add("left")
        elif ld == "straight_left":
            allowed.update({"straight", "left"})
        elif ld == "straight_right":
            allowed.update({"straight", "right"})
    return allowed or None


def generate_number_plate() -> str:
    import string
    states = ["TS", "AP", "MH", "KA", "DL", "HR", "UP", "TN", "KL", "GJ"]
    state = random.choice(states)
    district = f"{random.randint(1, 99):02d}"
    letters = "".join(random.choice(string.ascii_uppercase) for _ in range(2))
    digits = f"{random.randint(1000, 9999)}"
    return f"{state}{district}{letters}{digits}"


def _lane_layout_from_config(config: dict) -> dict:
    return {
        "n_lanes": config.get("n_lanes", 3),
        "lane_config": config.get("lane_config"),
        "lane_directions": config.get("lane_directions"),
        "lane_signals": config.get("lane_signals"),
        "turn_distribution_mode": config.get("turn_distribution_mode"),
        "arm_turn_ratios": config.get("arm_turn_ratios"),
        "lane_turn_ratios": config.get("lane_turn_ratios"),
        "u_turn_phase": config.get("u_turn_phase", False),
    }


def _lane_count(layout: dict | None, arm: str) -> int:
    if not layout:
        return 3
    # Check custom lane layout n_lanes override
    if layout.get("lane_directions") and arm in layout.get("lane_directions"):
        return len(layout["lane_directions"][arm])
    lane_config = layout.get("lane_config")
    if lane_config and arm in lane_config:
        return lane_config[arm]
    val = layout.get("n_lanes") or layout.get("lanes_per_arm")
    if val is not None:
        try:
            return int(val)
        except:
            pass
    return 3


def _spawn_spec(vid_counter: int, arm: str | None = None, lane: int | None = None, intersection_type: str = "four_way", type_weights: dict | None = None, lane_layout: dict | None = None, u_turn_phase: bool = False) -> dict:
    if intersection_type in ("t_junction", "t_junction_free_left", "y_junction", "y_junction_free_left"):
        arms = ["N", "E", "W"]
        weights = [0.4, 0.3, 0.3]
    else:
        arms = ["N", "S", "E", "W"]
        weights = [0.32, 0.32, 0.18, 0.18]

    arm = arm or random.choices(arms, weights=weights, k=1)[0]
    n_lanes = _lane_count(lane_layout, arm)
    
    custom_dir = None
    custom_signal = "standard"
    is_custom_design = False
    
    if lane_layout is not None and lane_layout.get("lane_directions"):
        is_custom_design = True
        if lane is None:
            lane = random.randint(0, n_lanes - 1)
        else:
            lane = lane % n_lanes
        
        lane_dirs = lane_layout.get("lane_directions")
        if arm in lane_dirs:
            dirs = lane_dirs[arm]
            if 0 <= lane < len(dirs):
                custom_dir = dirs[lane]
                
        lane_sigs = lane_layout.get("lane_signals")
        if lane_sigs and arm in lane_sigs:
            sigs = lane_sigs[arm]
            if 0 <= lane < len(sigs):
                custom_signal = sigs[lane]

    if is_custom_design and custom_dir is not None:
        if custom_dir == "straight":
            turn = "straight"
        elif custom_dir == "left":
            turn = "left"
        elif custom_dir == "right":
            turn = "right"
        elif custom_dir == "uturn":
            turn = "uturn"
        elif custom_dir == "free_left":
            turn = "left"
        elif custom_dir == "straight_left":
            turn = random.choice(["straight", "left"])
        elif custom_dir == "straight_right":
            turn = random.choice(["straight", "right"])
        else:
            turn = "straight"
            
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
            "n_lanes": n_lanes,
            "type_id": type_id,
            "turn": turn,
            "intersection_type": intersection_type,
            "number_plate": generate_number_plate(),
            "is_custom_design": True,
            "lane_signal": custom_signal,
            "free_left": (custom_dir == "free_left" or custom_signal == "none"),
        }

    if lane is not None:
        lane = lane % n_lanes

    has_free_left = intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left")
    left_allowed = True
    if intersection_type in ("t_junction", "t_junction_free_left") and arm == "E":
        left_allowed = False

    if lane_layout is not None and lane_layout.get("turn_distribution_mode") == "arm":
        _arm_allowed = _allowed_turns_for_arm(lane_layout, arm)
        allowed_turns: set[str] = _arm_allowed if _arm_allowed is not None else {"straight", "left", "right", "uturn", "mid_uturn"}

        if u_turn_phase:
            allowed_turns.add("mid_uturn")

        ratios = lane_layout.get("arm_turn_ratios")
        arm_ratio = ratios.get(arm) if ratios else None
        if arm_ratio and sum(arm_ratio.values()) > 0.0:
            choices = []
            weights = []
            for choice, weight in arm_ratio.items():
                if choice in allowed_turns:
                    choices.append(choice)
                    weights.append(weight)

            if not choices or sum(weights) == 0.0:
                turn = "straight"
            else:
                turn = random.choices(choices, weights=weights, k=1)[0]
            
            if lane is None:
                if turn == "left" and n_lanes > 2:
                    lane = 2
                elif turn == "mid_uturn":
                    lane = random.randint(0, n_lanes - 1)
                else:
                    lane = random.randint(0, min(1, n_lanes - 1))

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
                "n_lanes": n_lanes,
                "type_id": type_id,
                "turn": turn,
                "intersection_type": intersection_type,
                "number_plate": generate_number_plate(),
                "free_left": (turn == "left" and has_free_left),
                "u_turn_phase": u_turn_phase,
            }

    if lane_layout is not None and lane_layout.get("lane_turn_ratios"):
        ratios = lane_layout.get("lane_turn_ratios")
        arm_ratios = ratios.get(arm)
        if arm_ratios and len(arm_ratios) > 0:
            if lane is None:
                lane = random.randint(0, n_lanes - 1)
            lane_idx = lane % len(arm_ratios)
            lane_ratio = arm_ratios[lane_idx]
            if lane_ratio and sum(lane_ratio.values()) > 0.0:
                choices = list(lane_ratio.keys())
                weights = list(lane_ratio.values())
                turn = random.choices(choices, weights=weights, k=1)[0]
                
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
                    "n_lanes": n_lanes,
                    "type_id": type_id,
                    "turn": turn,
                    "intersection_type": intersection_type,
                    "number_plate": generate_number_plate(),
                    "free_left": (turn == "left" and has_free_left),
                    "u_turn_phase": u_turn_phase,
                }

    r = random.random()
    is_uturn = False
    if u_turn_phase and (intersection_type not in ("y_junction", "y_junction_free_left", "roundabout", "roundabout_free_left")):
        if lane is None:
            if r < 0.18:
                is_uturn = True
                turn = "uturn"
                lane = 0
        elif lane == 0:
            if r < 0.25:
                is_uturn = True
                turn = "uturn"

    if is_uturn:
        pass
    elif has_free_left and left_allowed:
        if lane is not None:
            if lane == 2:
                turn = "left"
            else:
                if intersection_type in ("t_junction", "t_junction_free_left"):
                    if arm == "N":
                        turn = "right"
                    else:
                        turn = "straight"
                elif intersection_type in ("roundabout", "roundabout_free_left"):
                    turn = "straight" if r < 0.85 else "right"
                else:
                    turn = "straight" if r < 0.88 else "right"
        else:
            if intersection_type in ("t_junction", "t_junction_free_left"):
                if arm == "N":
                    turn = "left" if r < 0.5 else "right"
                else:
                    turn = "straight" if r < 0.8 else "left"
            elif intersection_type in ("roundabout", "roundabout_free_left"):
                turn = "straight" if r < 0.75 else ("right" if r < 0.88 else "left")
            else:
                turn = "straight" if r < 0.75 else ("right" if r < 0.85 else "left")

            if turn == "left" and n_lanes > 2:
                lane = 2
            else:
                lane = random.randint(0, min(1, n_lanes - 1))
    else:
        if lane is None:
            lane = random.randint(0, n_lanes - 1)
        
        if intersection_type in ("t_junction", "t_junction_free_left"):
            if arm == "N":
                turn = "left" if r < 0.5 else "right"
            elif arm == "E":
                turn = "straight" if r < 0.8 else "right"
            else:
                turn = "straight" if r < 0.8 else "left"
        elif intersection_type in ("y_junction", "y_junction_free_left"):
            turn = "left" if r < 0.5 else "right"
        elif intersection_type in ("roundabout", "roundabout_free_left"):
            turn = "straight" if r < 0.75 else ("right" if r < 0.88 else "left")
        else:
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
        "n_lanes": n_lanes,
        "type_id": type_id,
        "turn": turn,
        "intersection_type": intersection_type,
        "number_plate": generate_number_plate(),
        "u_turn_phase": u_turn_phase,
    }


def _vehicle_from_spec(spec: dict) -> _MockVehicle:
    v = _MockVehicle(spec["vid"], spec["arm"], spec["lane"], spec.get("intersection_type", "four_way"), n_lanes=spec.get("n_lanes", 3))
    v.type_id = spec["type_id"]
    half = _VEH_LEN.get(v.type_id, 4.0) / 2.0
    v.stop_zone = _STOP_DIST + half + 1.0
    v.through_dist = _STOP_DIST + half - 1.5
    v.turn_dir = spec["turn"]
    v.number_plate = spec.get("number_plate", "")
    
    v.is_custom_design = spec.get("is_custom_design", False)
    v.signal_type = spec.get("lane_signal", "standard")
    if spec.get("free_left"):
        v.free_left = True
    v.u_turn_phase = spec.get("u_turn_phase", False)
        
    return v


def _is_spawn_clear(world, v: _MockVehicle) -> bool:
    v_hl = _VEH_LEN.get(v.type_id, 4.0) / 2.0
    v_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
    theta = get_arm_angle(v.arm, v.intersection_type)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    
    v_long = v.x * cos_t + v.y * sin_t
    v_lat = -v.x * sin_t + v.y * cos_t
    
    for other in world.vehicles:
        if other.arm != v.arm or other.through or other.turning:
            continue
        o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0
        o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0
        
        o_long = other.x * cos_t + other.y * sin_t
        o_lat = -other.x * sin_t + other.y * cos_t
        
        lat_overlap = abs(v_lat - o_lat) < (v_hw + o_hw + 0.4)
        long_dist = abs(v_long - o_long)
            
        if lat_overlap and long_dist < (v_hl + o_hl + 3.0):
            return False
    return True


# ---------------------------------------------------------------------------
# Classes
# ---------------------------------------------------------------------------
class _MockVehicle:
    def __init__(self, vid: str, arm: str | None = None, lane: int = 0, intersection_type: str = "four_way", n_lanes: int = 3):
        self.id = vid
        self.type_id = random.choice(_VEHICLE_TYPES)
        self.arm = arm or random.choice(["N", "S", "E", "W"])
        self.lane = lane
        self.n_lanes = n_lanes
        self.wait_time = 0.0
        self.through = False
        self.intersection_type = intersection_type
        self.angle: float | None = None  # overrides frontend ARM_ANGLE when set
        self.stuck_s = 0.0  # accumulated sim-seconds at speed=0 (ghost-creep safety counter)
        self.number_plate = generate_number_plate()
        self.spawn_time = 0.0

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
        self.weave_phase = random.uniform(0, 2 * math.pi)
        self.red_runner: bool = False
        self.free_left: bool = False
        self.is_custom_design: bool = False
        self.signal_type: str = "standard"
        self.u_turn_phase: bool = False  # True only when world has u_turn_phase enabled

        # Correct side of road for this arm
        lo = 1.6
        hi = 1.6 + max(1, self.n_lanes) * 4.2 - 0.4

        my_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
        if self.type_id in _BIKE_TYPES or self.type_id == "auto_rickshaw":
            # No lane discipline: random anywhere within this arm's road side
            offset = random.uniform(lo + my_hw + 0.1, hi - my_hw - 0.1)
        else:
            freedom = _LAT_FREEDOM.get(self.type_id, 1.0)
            num_l = max(1, self.n_lanes)
            offsets = [3.7 + i * 4.2 for i in range(num_l)]
            base = offsets[lane % num_l]
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
        self.spawn_time = 0.0

    def _setup_turn(self, intersection_type: str = "four_way", lane_layout: dict | None = None) -> None:
        if self.turn_dir == "straight" or self.b_p0 is not None:
            return
        r = 11.0
        a = self.arm
        td = self.turn_dir
        
        has_free_left = intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left")
        if has_free_left and td == "left":
            self.free_left = True

        self.exit_arm = get_exit_arm(a, td, intersection_type)
        exit_theta = get_arm_angle(self.exit_arm, intersection_type)
        self.exit_dx = math.cos(exit_theta)
        self.exit_dy = math.sin(exit_theta)

        if td == "mid_uturn" and self.u_turn_phase:
            self.exit_lane = 0
            num_l = max(1, self.n_lanes)
            offsets = [3.7 + i * 4.2 for i in range(num_l)]
            exit_lane_center = offsets[self.exit_lane]
            self.exit_lat_drift = -exit_lane_center
            self.b_p0 = (self.x, self.y)
            d_exit = 24.0
            target_x = d_exit * math.cos(exit_theta) - self.exit_lat_drift * math.sin(exit_theta)
            target_y = d_exit * math.sin(exit_theta) + self.exit_lat_drift * math.cos(exit_theta)
            self.b_p2 = (target_x, target_y)
            midpoint = ((self.b_p0[0] + self.b_p2[0]) / 2.0, (self.b_p0[1] + self.b_p2[1]) / 2.0)
            dir_center_x = -math.cos(exit_theta)
            dir_center_y = -math.sin(exit_theta)
            d_turn = 5.0
            self.b_p1 = (
                midpoint[0] + d_turn * dir_center_x,
                midpoint[1] + d_turn * dir_center_y
            )
            self.turning = True
            self.turn_t = 0.0
            return

        if td == "mid_uturn" and not self.u_turn_phase:
            td = "uturn"

        if td == "uturn":
            self.exit_lane = 0
            num_l = max(1, self.n_lanes)
            offsets = [3.7 + i * 4.2 for i in range(num_l)]
            exit_lane_center = offsets[self.exit_lane]
            self.exit_lat_drift = -exit_lane_center
            self.b_p0 = (self.x, self.y)
            d_exit = 22.0
            target_x = d_exit * math.cos(exit_theta) - self.exit_lat_drift * math.sin(exit_theta)
            target_y = d_exit * math.sin(exit_theta) + self.exit_lat_drift * math.cos(exit_theta)
            self.b_p2 = (target_x, target_y)
            midpoint = ((self.b_p0[0] + self.b_p2[0]) / 2.0, (self.b_p0[1] + self.b_p2[1]) / 2.0)
            dir_center_x = -math.cos(exit_theta)
            dir_center_y = -math.sin(exit_theta)
            d_turn = 8.0
            self.b_p1 = (
                midpoint[0] + d_turn * dir_center_x,
                midpoint[1] + d_turn * dir_center_y
            )
            self.turning = True
            self.turn_t = 0.0
            return

        exit_n_lanes = _lane_count(lane_layout, self.exit_arm)
        num_l = max(1, exit_n_lanes)
        offsets = [3.7 + i * 4.2 for i in range(num_l)]
        if has_free_left and td == "left":
            self.exit_lane = min(1, num_l - 1)
        else:
            self.exit_lane = self.lane % num_l
            
        exit_lane_center = 7.9 if (has_free_left and td == "left" and num_l > 1) else offsets[self.exit_lane]

        spawn_num_l = max(1, self.n_lanes)
        spawn_offsets = [3.7 + i * 4.2 for i in range(spawn_num_l)]
        start_lane_center = spawn_offsets[self.lane % spawn_num_l]
        deviation = self.lat_drift - start_lane_center
        exit_lat_mag = exit_lane_center + deviation

        ex_lo = 1.6
        ex_hi = 1.6 + num_l * 4.2 - 0.4
        ex_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
        exit_lat_mag = max(ex_lo + ex_hw, min(ex_hi - ex_hw, exit_lat_mag))
        self.exit_lat_drift = -exit_lat_mag

        self.b_p0 = (self.x, self.y)
        d_exit = 22.0 if self.free_left else r
        target_x = d_exit * math.cos(exit_theta) - self.exit_lat_drift * math.sin(exit_theta)
        target_y = d_exit * math.sin(exit_theta) + self.exit_lat_drift * math.cos(exit_theta)
        self.b_p2 = (target_x, target_y)

        if self.free_left:
            spawn_theta = get_arm_angle(a, intersection_type)
            corner_scale = _STOP_DIST * 1.05
            self.b_p1 = (
                math.cos(spawn_theta) * corner_scale + math.cos(exit_theta) * corner_scale,
                math.sin(spawn_theta) * corner_scale + math.sin(exit_theta) * corner_scale,
            )
        else:
            spawn_theta = get_arm_angle(a, intersection_type)
            self.b_p1 = intersect_lines(
                self.b_p0, 
                (-math.cos(spawn_theta), -math.sin(spawn_theta)), 
                self.b_p2, 
                (math.cos(exit_theta), math.sin(exit_theta))
            )

        self.turning = True
        self.turn_t = 0.0

    def _find_best_lane(self, active_arm_vehicles: list) -> float | None:
        if self.turning or self.through:
            return None

        theta = get_arm_angle(self.arm, self.intersection_type)
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)

        my_long = self.x * cos_t + self.y * sin_t
        my_lat = -self.x * sin_t + self.y * cos_t
        num_l = max(1, self.n_lanes)
        offsets = [3.7 + i * 4.2 for i in range(num_l)]
        
        LOOK_AHEAD = 35.0
        lane_clearance = [LOOK_AHEAD] * num_l
        my_hl = _VEH_LEN.get(self.type_id, 4.0) / 2.0
        
        for lane_idx in range(num_l):
            lane_center = offsets[lane_idx]
            
            if lane_idx != self.lane % num_l:
                is_lane_safe = True
                for v in active_arm_vehicles:
                    if v is self:
                        continue
                    v_long = v.x * cos_t + v.y * sin_t
                    v_lat = -v.x * sin_t + v.y * cos_t
                    v_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                    v_hl = _VEH_LEN.get(v.type_id, 4.0) / 2.0
                    
                    if abs(v_lat - lane_center) < (v_hw + 1.0):
                        long_diff = my_long - v_long
                        if -my_hl - v_hl - 2.0 < long_diff < 12.0:
                            is_lane_safe = False
                            break
                if not is_lane_safe:
                    lane_clearance[lane_idx] = -1.0
                    continue

            clearance = LOOK_AHEAD
            for other in active_arm_vehicles:
                if other is self:
                    continue
                o_long = other.x * cos_t + other.y * sin_t
                o_lat = -other.x * sin_t + other.y * cos_t
                o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0
                o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0

                if abs(o_lat - lane_center) < (o_hw + 1.0):
                    long_dist = my_long - o_long
                    if long_dist > 0:
                        bumper_gap = long_dist - my_hl - o_hl
                        if bumper_gap < clearance:
                            clearance = bumper_gap
            lane_clearance[lane_idx] = clearance

        best_idx = self.lane % num_l
        best_clearance = lane_clearance[best_idx]
        for idx in range(num_l):
            if lane_clearance[idx] > best_clearance + 5.0:
                best_clearance = lane_clearance[idx]
                best_idx = idx

        if best_idx != self.lane % num_l:
            return offsets[best_idx]
        return None

    def _find_lateral_gap(self, active_arm_vehicles: list) -> float | None:
        theta = get_arm_angle(self.arm, self.intersection_type)
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)

        my_long = self.x * cos_t + self.y * sin_t
        my_lat = -self.x * sin_t + self.y * cos_t
        num_l = max(1, self.n_lanes)
        offsets = [3.7 + i * 4.2 for i in range(num_l)]
        
        my_hl = _VEH_LEN.get(self.type_id, 4.0) / 2.0
        my_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
        
        candidates = []
        if self.lane % num_l > 0:
            candidates.append(offsets[self.lane % num_l - 1])
        if self.lane % num_l < num_l - 1:
            candidates.append(offsets[self.lane % num_l + 1])
            
        random.shuffle(candidates)
        for target_lat in candidates:
            blocked = False
            for other in active_arm_vehicles:
                if other is self:
                    continue
                o_long = other.x * cos_t + other.y * sin_t
                o_lat = -other.x * sin_t + other.y * cos_t
                o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0
                o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0
                
                lat_overlap = abs(target_lat - o_lat) < (my_hw + o_hw + 0.3)
                long_dist = abs(my_long - o_long)
                if lat_overlap and long_dist < (my_hl + o_hl + 1.5):
                    blocked = True
                    break
            if not blocked:
                return target_lat
        return None

    @staticmethod
    def _beval(p0, p1, p2, t: float) -> tuple:
        t2 = 1.0 - t
        x = t2 * t2 * p0[0] + 2.0 * t2 * t * p1[0] + t * t * p2[0]
        y = t2 * t2 * p0[1] + 2.0 * t2 * t * p1[1] + t * t * p2[1]
        return (x, y)

    @staticmethod
    def _btangent(p0, p1, p2, t: float) -> tuple:
        dx = 2.0 * (1.0 - t) * (p1[0] - p0[0]) + 2.0 * t * (p2[0] - p1[0])
        dy = 2.0 * (1.0 - t) * (p1[1] - p0[1]) + 2.0 * t * (p2[1] - p1[1])
        return (dx, dy)

    def update(self, dt: float, green_arms: set, same_lane: list,
               vehicles_in_box: list, intersection_type: str = "four_way",
               ped_blocking: bool = False, side_blocked: bool = False,
               lane_layout: dict | None = None) -> bool:
        if ped_blocking or (side_blocked and not self.through):
            self.speed = 0.0
            return self._check_exit()

        if not self.through:
            is_ns_arm = self.arm in ("N", "S")
            is_ew_arm = self.arm in ("E", "W")
            ns_right_on = ("N_right" in green_arms or "S_right" in green_arms)
            ew_right_on = ("E_right" in green_arms or "W_right" in green_arms)
            if (is_ns_arm and ew_right_on) or (is_ew_arm and ns_right_on):
                self.speed = 0.0
                return self._check_exit()

        if not self.through and self.turn_dir in ("right", "uturn", "mid_uturn"):
            is_mid_uturn_bypass = (self.turn_dir == "mid_uturn" and getattr(self, "u_turn_phase", False))
            if not is_mid_uturn_bypass:
                if intersection_type in ("four_way_protected_right", "four_way_arrow", "four_way", "4way_cross"):
                    right_on = (f"{self.arm}_right" in green_arms or f"{self.arm}_uturn" in green_arms)
                    if not right_on:
                        self.red_runner = False
                        theta = get_arm_angle(self.arm, intersection_type)
                        v_long = self.x * math.cos(theta) + self.y * math.sin(theta)
                        if v_long <= self.stop_zone:
                            self.speed = 0.0
                            return self._check_exit()

        if self.roundabout_state == "circulating":
            if ped_blocking or (side_blocked and not self.through):
                self.speed = 0.0
                return self._check_exit()

            if self.speed < 0.1:
                self.wait_time += dt

            num_l = max(1, self.n_lanes)
            R = 12.4 - (self.lane % num_l) * 1.4 - 0.8
            lead_dist = float("inf")
            half_self = _VEH_LEN.get(self.type_id, 4.0) / 2.0

            for other in same_lane:
                if other is self:
                    continue
                if other.roundabout and other.roundabout_state == "circulating":
                    if other.lane % num_l == self.lane % num_l:
                        angle_diff = (other.roundabout_phi - self.roundabout_phi) % (2 * math.pi)
                        if 0 < angle_diff < math.pi * 2 / 3:
                            gap = R * angle_diff - half_self - _VEH_LEN.get(other.type_id, 4.0) / 2.0
                            if gap < lead_dist:
                                lead_dist = gap

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

            d_phi = (self.speed * dt) / R
            self.roundabout_phi += d_phi

            self.x = R * math.cos(self.roundabout_phi)
            self.y = R * math.sin(self.roundabout_phi)
            self.dx = -math.sin(self.roundabout_phi)
            self.dy = math.cos(self.roundabout_phi)
            self.angle = self.roundabout_phi + math.pi / 2.0

            if self.roundabout_phi >= self.roundabout_target_phi - 0.1:
                self.roundabout_state = "exit"
                self.arm = self.exit_arm
                exit_theta = get_arm_angle(self.exit_arm, intersection_type)
                self.dx = math.cos(exit_theta)
                self.dy = math.sin(exit_theta)
                self.angle = math.atan2(self.dy, self.dx)

                offsets = [3.7 + i * 4.2 for i in range(num_l)]
                w = offsets[self.lane % num_l]
                self.lat_drift = -w
                self.x = R * math.cos(exit_theta) - self.lat_drift * math.sin(exit_theta)
                self.y = R * math.sin(exit_theta) + self.lat_drift * math.cos(exit_theta)

            return self._check_exit()

        if self.speed < 0.1 and not self.through:
            self.wait_time += dt

        if self.turning:
            hl_self = _VEH_LEN.get(self.type_id, 4.0) / 2.0
            TURN_CLEAR = 4.0
            speed_mult = 1.0
            is_free_left_turn = getattr(self, 'free_left', False)

            tx, ty = self.exit_dx, self.exit_dy
            proj_self = self.x * tx + self.y * ty

            for other in same_lane:
                if other is self:
                    continue

                if other.turning and other.exit_arm != self.exit_arm:
                    if is_free_left_turn or getattr(other, 'free_left', False):
                        continue
                    if (other.turn_t, other.id) < (self.turn_t, self.id):
                        continue
                    ddx = self.x - other.x
                    ddy = self.y - other.y
                    dist = math.hypot(ddx, ddy)
                    gap = dist - hl_self - _VEH_LEN.get(other.type_id, 4.0) / 2.0
                    if gap <= 0:
                        speed_mult = 0.0
                        break
                    if gap < TURN_CLEAR:
                        speed_mult = min(speed_mult, gap / TURN_CLEAR)
                    continue

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
                            if gap <= 0.8:
                                speed_mult = 0.0
                                break
                            if gap < TURN_CLEAR:
                                speed_mult = min(speed_mult, gap / TURN_CLEAR)
                    continue

                if not is_free_left_turn and not other.turning and other in vehicles_in_box and other.arm != self.arm:
                    ddx = self.x - other.x
                    ddy = self.y - other.y
                    dist = math.hypot(ddx, ddy)
                    gap = dist - hl_self - _VEH_LEN.get(other.type_id, 4.0) / 2.0
                    if gap <= 0:
                        speed_mult = 0.0
                        break
                    if gap < TURN_CLEAR:
                        speed_mult = min(speed_mult, gap / TURN_CLEAR)

            if speed_mult < 0.30 and speed_mult > 0.0:
                min_gap = float("inf")
                for other in same_lane:
                    if other is self:
                        continue
                    if other.turning and other.exit_arm != self.exit_arm:
                        if is_free_left_turn or getattr(other, 'free_left', False):
                            continue
                        if (other.turn_t, other.id) < (self.turn_t, self.id):
                            continue
                        ddx = self.x - other.x
                        ddy = self.y - other.y
                        gap = math.hypot(ddx, ddy) - hl_self - _VEH_LEN.get(other.type_id, 4.0) / 2.0
                        min_gap = min(min_gap, gap)
                    elif not is_free_left_turn and not other.turning and other in vehicles_in_box and other.arm != self.arm:
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
            MIN_TURN_RATE = 0.004 if is_free_left_turn else 0.0
            self.turn_t = min(1.0, self.turn_t + max(dt * self.speed / 25.0, MIN_TURN_RATE * dt))
            bx, by = self._beval(self.b_p0, self.b_p1, self.b_p2, self.turn_t)
            self.x, self.y = bx, by
            tx_tan, ty_tan = self._btangent(self.b_p0, self.b_p1, self.b_p2, self.turn_t)
            self.angle = math.atan2(ty_tan, tx_tan)
            if self.turn_t >= 1.0:
                self.arm = self.exit_arm
                self.lane = self.exit_lane
                self.lat_drift = self.exit_lat_drift
                self.dx, self.dy = self.exit_dx, self.exit_dy
                self.angle = math.atan2(self.dy, self.dx)
                self.turning = False
                self.through = True
            return self._check_exit()

        if not self.through:
            theta = get_arm_angle(self.arm, intersection_type)
            v_long = self.x * math.cos(theta) + self.y * math.sin(theta)
            
            is_mid_uturn_bypass = (self.turn_dir == "mid_uturn" and getattr(self, "u_turn_phase", False))
            is_free_left = getattr(self, "free_left", False) or (self.lane == 2 and self.turn_dir == "left" and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"))
            if is_mid_uturn_bypass:
                commit_d = 26.0
            elif is_free_left:
                commit_d = 22.0
            else:
                commit_d = self.through_dist

            if v_long < commit_d:
                is_arm_green = (self.arm in green_arms or f"{self.arm}_{self.turn_dir}" in green_arms)
                if self.turn_dir in ("uturn", "mid_uturn"):
                    is_arm_green = is_arm_green or (f"{self.arm}_uturn" in green_arms or f"{self.arm}_right" in green_arms)
                if is_arm_green and self.arm in green_arms:
                    _allowed = _allowed_turns_for_arm(lane_layout, self.arm)
                    if _allowed is not None and self.turn_dir not in _allowed:
                        is_arm_green = False

                is_red_runner = getattr(self, "red_runner", False)
                is_free_left = getattr(self, "free_left", False) or (self.lane == 2 and self.turn_dir == "left" and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"))
                is_mid_uturn_bypass = (self.turn_dir == "mid_uturn" and getattr(self, "u_turn_phase", False))
                is_uturn_bypass = (self.turn_dir == "uturn" and getattr(self, "signal_type", "standard") == "none")

                is_red_uturn = False
                if self.turn_dir == "uturn" or (self.turn_dir == "mid_uturn" and not getattr(self, "u_turn_phase", False)):
                    is_uturn_signal_bypass = getattr(self, "signal_type", "standard") == "none"
                    is_green_uturn = (self.arm in green_arms or f"{self.arm}_uturn" in green_arms or f"{self.arm}_right" in green_arms)
                    if not is_uturn_signal_bypass and not is_green_uturn:
                        is_red_uturn = True

                is_allowed_to_commit = (
                    is_arm_green or
                    is_red_runner or
                    is_free_left or
                    is_mid_uturn_bypass or
                    is_uturn_bypass
                )

                is_box_clear = True
                if is_allowed_to_commit and not is_red_uturn and self.stuck_s <= 12.0:
                    opposite_arm = {"N": "S", "S": "N", "E": "W", "W": "E"}.get(self.arm)
                    for other in vehicles_in_box:
                        if other is not self and other.arm != self.arm:
                            if other.arm == opposite_arm and other.turn_dir == "straight":
                                continue
                            is_box_clear = False
                            break

                if is_allowed_to_commit and not is_red_uturn and is_box_clear:
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
                        R = 12.4 - (self.lane % max(1, self.n_lanes)) * 1.4 - 0.8
                        self.x = R * math.cos(entry_phi)
                        self.y = R * math.sin(entry_phi)
                        self.dx = -math.sin(entry_phi)
                        self.dy = math.cos(entry_phi)
                        self.angle = entry_phi + math.pi / 2.0
                        return self._check_exit()
                    elif self.turn_dir != "straight":
                        self._setup_turn(intersection_type, lane_layout)
                        return self._check_exit()

        theta = get_arm_angle(self.arm, intersection_type)
        v_long = self.x * math.cos(theta) + self.y * math.sin(theta)
        at_stop = (v_long <= self.stop_zone) and not self.through

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
            else:
                is_arm_green = (self.arm in green_arms or f"{self.arm}_{self.turn_dir}" in green_arms)
                if self.turn_dir in ("uturn", "mid_uturn"):
                    is_arm_green = is_arm_green or (f"{self.arm}_uturn" in green_arms or f"{self.arm}_right" in green_arms)
                if is_arm_green and self.arm in green_arms:
                    _allowed = _allowed_turns_for_arm(lane_layout, self.arm)
                    if _allowed is not None and self.turn_dir not in _allowed:
                        is_arm_green = False
                if not is_arm_green:
                    is_free_left = getattr(self, "free_left", False) or (self.lane == 2 and self.turn_dir == "left" and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"))
                    is_uturn_bypass = (
                        (self.turn_dir == "uturn" and getattr(self, "signal_type", "standard") == "none") or
                        (self.turn_dir == "mid_uturn" and getattr(self, "u_turn_phase", False))
                    )
                    if is_free_left:
                        pass
                    elif is_uturn_bypass:
                        pass
                    else:
                        self.speed = 0.0
                        return False

        if at_stop and not self.through and self.turn_dir != "straight":
            exit_arm = get_exit_arm(self.arm, self.turn_dir, intersection_type)
            exit_n_lanes = _lane_count(lane_layout, exit_arm)
            num_l = max(1, exit_n_lanes)
            if (intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left")) and self.turn_dir == "left":
                exit_lane = min(1, num_l - 1)
            else:
                exit_lane = self.lane % num_l

            exit_blocked = False
            for other in same_lane:
                if other is self:
                    continue
                if other.arm == exit_arm and other.lane % num_l == exit_lane:
                    other_theta = get_arm_angle(other.arm, intersection_type)
                    other_long = other.x * math.cos(other_theta) + other.y * math.sin(other_theta)
                    is_in_box = other.through and other_long < 19.8
                    is_just_outside_and_slow = other_long >= 19.8 and other_long < 31.8 and other.speed < 0.5
                    if is_in_box or is_just_outside_and_slow:
                        exit_blocked = True
                        break
            
            if exit_blocked:
                self.speed = 0.0
                return False

        is_arm_green = (self.arm in green_arms or f"{self.arm}_{self.turn_dir}" in green_arms)
        if is_arm_green and self.arm in green_arms:
            _allowed_eg = _allowed_turns_for_arm(lane_layout, self.arm)
            if _allowed_eg is not None and self.turn_dir not in _allowed_eg:
                is_arm_green = False
        if at_stop and is_arm_green:
            is_free_left = getattr(self, "free_left", False) or (self.lane == 2 and self.turn_dir == "left" and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"))
            is_uturn_bypass = (
                (self.turn_dir == "uturn" and getattr(self, "signal_type", "standard") == "none") or
                (self.turn_dir == "mid_uturn" and getattr(self, "u_turn_phase", False))
            )
 
            if is_free_left:
                pass
            elif is_uturn_bypass:
                pass
            elif self.stuck_s <= 12.0:
                opposite_arm = {"N": "S", "S": "N", "E": "W", "W": "E"}.get(self.arm)
                for other in vehicles_in_box:
                    if other is not self and other.arm != self.arm:
                        if other.arm == opposite_arm and other.turn_dir == "straight":
                            continue
                        self.speed = 0.0
                        return False
 
        is_left_green = (self.arm in green_arms or f"{self.arm}_left" in green_arms)
        if at_stop and self.turn_dir == "left" and is_left_green:
            is_free_left = getattr(self, "free_left", False) or (self.lane == 2 and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"))
            if is_free_left:
                pass
            elif self.stuck_s <= 12.0:
                conflicting = _CROSS_CONFLICTS.get(self.arm, frozenset())
                for v in vehicles_in_box:
                    is_conflict_green = (v.arm in green_arms or f"{v.arm}_straight" in green_arms)
                    if (v is not self
                            and v.turn_dir == "straight"
                            and v.arm in conflicting
                            and is_conflict_green):
                        self.speed = 0.0
                        return False

        SAFE_GAP = 2.0
        BRAKE_GAP = 8.0
        half_self = _VEH_LEN.get(self.type_id, 4.0) / 2.0
        lead_dist = float("inf")
        lead_hl = 0.0

        tx, ty = self.dx, self.dy
        proj_self = self.x * tx + self.y * ty

        for other in same_lane:
            if other is self:
                continue

            if other.roundabout and self.roundabout:
                continue

            other_dx = other.exit_dx if other.turning else other.dx
            other_dy = other.exit_dy if other.turning else other.dy

            if other.turning and other.exit_arm == self.arm:
                theta = get_arm_angle(self.arm, intersection_type)
                o_theta = get_arm_angle(other.arm, intersection_type)
                o_long = other.x * math.cos(o_theta) + other.y * math.sin(o_theta)
                my_long = self.x * math.cos(theta) + self.y * math.sin(theta)
                
                if not self.through and my_long > 32.0 and o_long < _STOP_DIST:
                    ddx = self.x - other.x
                    ddy = self.y - other.y
                    dist = math.hypot(ddx, ddy)
                    o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0
                    gap = dist - half_self - o_hl
                    if gap < lead_dist:
                        lead_dist = gap
                        lead_hl = o_hl
                continue

            if other.arm == self.arm and not other.turning and not other.through and not self.through:
                long_dist = proj_self - (other.x * tx + other.y * ty)
                if long_dist > 0.0 and long_dist < 32.0:
                    lx, ly = -ty, tx
                    lat_self = self.x * lx + self.y * ly
                    lat_other = other.x * lx + other.y * ly
                    
                    v_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
                    o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0
                    if abs(lat_self - lat_other) < (v_hw + o_hw + 0.3):
                        o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0
                        gap = long_dist - half_self - o_hl
                        if gap < lead_dist:
                            lead_dist = gap
                            lead_hl = o_hl
                continue

            if not self.through and self.turn_dir == "straight" and other.through and other.turning and other.exit_arm == self.arm:
                lx, ly = -ty, tx
                lat_self = self.x * lx + self.y * ly
                lat_other = other.x * lx + other.y * ly
                v_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
                o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0
                if abs(lat_self - lat_other) < (v_hw + o_hw + 0.5):
                    ddx = self.x - other.x
                    ddy = self.y - other.y
                    dist = math.hypot(ddx, ddy)
                    o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0
                    gap = dist - half_self - o_hl
                    if gap < lead_dist and gap > -2.0:
                        lead_dist = gap
                        lead_hl = o_hl
                continue

            if self.through and not self.turning and other.through and not other.turning and other.arm == self.arm:
                long_dist = (other.x * tx + other.y * ty) - proj_self
                if long_dist > 0.0 and long_dist < 32.0:
                    lx, ly = -ty, tx
                    lat_self = self.x * lx + self.y * ly
                    lat_other = other.x * lx + other.y * ly
                    v_hw = _VEH_WIDTH.get(self.type_id, 1.8) / 2.0
                    o_hw = _VEH_WIDTH.get(other.type_id, 1.8) / 2.0
                    if abs(lat_self - lat_other) < (v_hw + o_hw + 0.3):
                        o_hl = _VEH_LEN.get(other.type_id, 4.0) / 2.0
                        gap = long_dist - half_self - o_hl
                        if gap < lead_dist:
                            lead_dist = gap
                            lead_hl = o_hl
                continue

        base_speed = _TYPE_SPEED.get(self.type_id, 14.0)
        
        is_free_left = getattr(self, "free_left", False) or (self.lane == 2 and self.turn_dir == "left" and intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"))
        is_uturn_bypass = (
            (self.turn_dir == "uturn" and getattr(self, "signal_type", "standard") == "none") or
            (self.turn_dir == "mid_uturn" and getattr(self, "u_turn_phase", False))
        )
        
        if is_free_left or is_uturn_bypass:
            max_allowed_speed = base_speed
        else:
            max_allowed_speed = base_speed
            
        if lead_dist < 28.0:
            bumper_gap = lead_dist
            if bumper_gap <= SAFE_GAP:
                self.speed = 0.0
            elif bumper_gap < BRAKE_GAP:
                ratio = (bumper_gap - SAFE_GAP) / (BRAKE_GAP - SAFE_GAP)
                self.speed = max_allowed_speed * ratio
            else:
                self.speed = max_allowed_speed
        else:
            self.speed = max_allowed_speed

        self.x += self.dx * self.speed * dt
        self.y += self.dy * self.speed * dt
        return self._check_exit()

    def _dist_ahead(self, other: _MockVehicle) -> float:
        return math.hypot(self.x - other.x, self.y - other.y)

    def _check_exit(self) -> bool:
        if abs(self.x) > 85.0 or abs(self.y) > 85.0:
            return True
        return False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type_id,
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "angle": round(self.angle if self.angle is not None else 0.0, 3),
            "speed": round(self.speed, 2),
            "arm": self.arm,
            "lane": self.lane,
            "turning": self.turning,
            "through": self.through,
            "turn_dir": self.turn_dir,
            "number_plate": self.number_plate,
        }


class _MockPedestrian:
    def __init__(self, arm: str, intersection_type: str = "four_way"):
        self.arm = arm
        self.intersection_type = intersection_type
        self.id = f"ped-{random.randint(1000, 9999)}"
        self.state = "waiting_1"
        self.progress = 0.0
        self.speed = 2.5 + random.random() * 1.5

        # Calculate coordinates based on arm
        theta = get_arm_angle(arm, intersection_type)
        self.cos_t = math.cos(theta)
        self.sin_t = math.sin(theta)

        # Spawn at outer sidewalk edge (lat = -13.8wu)
        self.lat = -13.8 if arm in ("S", "W") else 13.8
        self.long = _STOP_DIST - 1.5

    def position_dict(self) -> dict:
        x = self.long * self.cos_t - self.lat * self.sin_t
        y = self.long * self.sin_t + self.lat * self.cos_t
        return {"x": x, "y": y}

    def to_dict(self) -> dict:
        pos = self.position_dict()
        return {
            "id": self.id,
            "arm": self.arm,
            "x": round(pos["x"], 2),
            "y": round(pos["y"], 2),
            "state": self.state,
        }

    def update(self, dt: float, signal_phase: int, nearest_vehicle_dist: float, remaining_s: float = 999.0) -> bool:
        # Check green signal for pedestrians
        is_protected = getattr(self, "intersection_type", "four_way") in ("four_way_protected_right", "four_way_arrow")
        if is_protected:
            ped_green = (signal_phase == 8)
        else:
            ped_green = (signal_phase == 4)

        if self.state == "waiting_1":
            if ped_green and remaining_s >= 6.0 and nearest_vehicle_dist > 8.0:
                self.state = "crossing_1"
            return False

        elif self.state == "crossing_1":
            step_lat = self.speed * dt
            # Move towards center (crossing first half of road)
            if self.arm in ("S", "W"):
                self.lat += step_lat
                if self.lat >= -1.6:
                    self.lat = -1.6
                    self.state = "waiting_median"
            else:
                self.lat -= step_lat
                if self.lat <= 1.6:
                    self.lat = 1.6
                    self.state = "waiting_median"
            return False

        elif self.state == "waiting_median":
            if ped_green and remaining_s >= 6.0 and nearest_vehicle_dist > 8.0:
                self.state = "crossing_2"
            elif not ped_green:
                pass
            else:
                self.state = "crossing_2"
            return False

        elif self.state == "crossing_2":
            step_lat = self.speed * dt
            if self.arm in ("S", "W"):
                self.lat += step_lat
                if self.lat >= 13.8:
                    self.state = "finished"
                    return True
            else:
                self.lat -= step_lat
                if self.lat <= -13.8:
                    self.state = "finished"
                    return True
            return False

        return False


class _SimWorld:
    """One intersection simulation with a pluggable signal controller."""

    def __new__(cls, fixed_time: bool, min_green: float = 8.0, max_green: float = 35.0,
                policy_fn=None, websters: bool = False, intersection_type: str = "four_way",
                replay_decisions=None, replay_episode_num=None, n_lanes: int = 3, lane_layout: dict | None = None):
        
        if cls is not _SimWorld:
            return super().__new__(cls)
            
        u_turn_phase = False
        if lane_layout:
            u_turn_phase = lane_layout.get("u_turn_phase", False)
            
        if u_turn_phase:
            from backend.services.simulation.mock.mock_u_turn import UTurnSimWorld
            subclass = UTurnSimWorld
        elif intersection_type in ("four_way", "4way_cross", "four_way_protected_right", "four_way_arrow"):
            from backend.services.simulation.mock.mock_four_way import FourWaySimWorld
            subclass = FourWaySimWorld
        elif intersection_type in ("t_junction", "t_junction_free_left"):
            from backend.services.simulation.mock.mock_t_junction import TJunctionSimWorld
            subclass = TJunctionSimWorld
        elif intersection_type in ("y_junction", "y_junction_free_left"):
            from backend.services.simulation.mock.mock_y_junction import YJunctionSimWorld
            subclass = YJunctionSimWorld
        elif intersection_type in ("roundabout", "roundabout_free_left"):
            from backend.services.simulation.mock.mock_roundabout import RoundaboutSimWorld
            subclass = RoundaboutSimWorld
        elif intersection_type in ("six_arm", "six_arm_free_left"):
            from backend.services.simulation.mock.mock_six_arm import SixArmSimWorld
            subclass = SixArmSimWorld
        else:
            from backend.services.simulation.mock.mock_four_way import FourWaySimWorld
            subclass = FourWaySimWorld
            
        return super().__new__(subclass)

    def __init__(self, fixed_time: bool, min_green: float = 8.0, max_green: float = 35.0,
                 policy_fn=None, websters: bool = False, intersection_type: str = "four_way",
                 replay_decisions=None, replay_episode_num=None, n_lanes: int = 3, lane_layout: dict | None = None):
        self.fixed_time = fixed_time
        self.websters = websters
        self.min_green = min_green
        self.max_green = max_green
        self.policy_fn = policy_fn
        self.intersection_type = intersection_type
        self.replay_decisions = replay_decisions
        self.replay_episode_num = replay_episode_num
        self.replay_finished = False
        self.n_lanes = n_lanes
        self.lane_layout = lane_layout
        self.vehicles: list[_MockVehicle] = []
        self.phase = 0
        self.phase_elapsed = 0.0
        self.phase_queue = []

        # Type-specific signal setup hook
        self._setup_phases()

        self.cur_duration = self.phase_durations_list[0]

        # Performance metrics tracking
        self.sim_clock = 0.0
        self.exited_count = 0
        self.total_wait_time = 0.0
        self.exited_history: list[tuple[float, int]] = []
        self.wait_history: list[tuple[float, float]] = []
        self.pedestrians: list = []
        self._ped_spawn_debt: float = 0.0
        self._ped_spawn_ratio: float = 1.0 / 8.0
        
        self.phase_vehicle_counts = defaultdict(lambda: defaultdict(int))
        self.phase_durations = defaultdict(float)
        self.phase_events = []
        self.current_phase_event = {
            "sim_time": 0.0,
            "phase_id": self.phase,
            "duration": 0.0,
            "vehicle_counts": {}
        }

    def _setup_phases(self):
        """Set up standard/default phase lists and durations.
        To be overridden by specialized subclasses.
        """
        self.is_protected_right = False
        self.phase_durations_list = [28.0, 4.0, 28.0, 4.0, 2.0]
        self.phase_green_map = {
            0: {"N", "S"},
            1: set(),
            2: {"E", "W"},
            3: set(),
            4: set(),
        }

    def add(self, v: _MockVehicle) -> None:
        self.vehicles.append(v)

    def _queued(self, arm: str) -> int:
        n = 0
        for v in self.vehicles:
            if v.arm == arm and not v.through:
                d = math.hypot(v.x, v.y)
                if d < 30.0:
                    n += 1
        return n

    def _decide_next(self) -> None:
        if self.current_phase_event:
            self.current_phase_event["duration"] = self.phase_elapsed
            self.phase_events.append(self.current_phase_event)
        
        self._original_decide_next()
        
        self.current_phase_event = {
            "sim_time": self.sim_clock,
            "phase_id": self.phase,
            "duration": 0.0,
            "vehicle_counts": {}
        }

    def _get_protected_subphases(self, axis: str, total_duration: float) -> list[tuple[int, float]]:
        """Hook for 4-way protected right-turns. Defaults to empty."""
        return []

    def _apply_red_runners(self) -> None:
        """Apply red-light runners logic. To be overridden by subclasses."""
        if self.phase in (0, 2):
            for v in self.vehicles:
                if not v.through and v.arm not in _PHASE_GREEN.get(self.phase, set()):
                    v.red_runner = random.random() < _RED_RUN_PROB.get(v.type_id, 0.0)
                else:
                    v.red_runner = False

    def _get_green_movements(self) -> set:
        """Returns arms displaying green for current phase."""
        if self.intersection_type in ("roundabout", "roundabout_free_left"):
            return {"N", "S", "E", "W"}
        return _PHASE_GREEN.get(self.phase, set())

    def _check_early_termination(self) -> None:
        """Checks early termination conditions for green lights."""
        if (not self.fixed_time and self.replay_decisions is None and self.phase in (0, 2)
                and self.phase_elapsed >= self.min_green):
            green_arms = _PHASE_GREEN[self.phase]
            red_arms = {"E", "W"} if self.phase == 0 else {"N", "S"}
            green_q = sum(self._queued(a) for a in green_arms)
            red_q = sum(self._queued(a) for a in red_arms)
            if green_q == 0 and red_q > 0:
                self._decide_next()
                self.phase_elapsed = 0.0

    def _original_decide_next(self) -> None:
        if getattr(self, "phase_queue", None):
            self.phase, self.cur_duration = self.phase_queue.pop(0)
            self._apply_red_runners()
            return

        green_phases = {0, 2}
        if self.phase in green_phases:
            self.phase = self.phase + 1
            self.cur_duration = 4.0
            self._apply_red_runners()
            return

        if self.replay_decisions is not None:
            idx = getattr(self, "replay_idx", 0)
            if idx < len(self.replay_decisions):
                d = self.replay_decisions[idx]
                mock_phase = d["action"]["phase"]
                duration = d["action"]["duration_s"]
                setattr(self, "replay_idx", idx + 1)
                
                if mock_phase == 0:
                    self.phase = 0
                elif mock_phase == 1:
                    self.phase = 2
                elif mock_phase in (2, 3):
                    ns = self._queued("N") + self._queued("S")
                    ew = self._queued("E") + self._queued("W")
                    self.phase = 0 if ns >= ew else 2
                else:
                    self.phase = 4
                self.cur_duration = float(duration)
            else:
                self.replay_finished = True
            self._apply_red_runners()
            return

        if self.fixed_time:
            self.phase = (self.phase + 1) % len(self.phase_durations_list)
            self.cur_duration = self.phase_durations_list[self.phase]
            self._apply_red_runners()
            return

        if self.policy_fn is not None:
            try:
                mock_phase, next_dur = self.policy_fn(self)
                duration = float(max(self.min_green, min(self.max_green, next_dur)))
                
                if mock_phase == 0:
                    self.phase = 0
                elif mock_phase == 1:
                    self.phase = 2
                elif mock_phase in (2, 3):
                    ns = self._queued("N") + self._queued("S")
                    ew = self._queued("E") + self._queued("W")
                    self.phase = 0 if ns >= ew else 2
                else:
                    self.phase = 4
                self.cur_duration = duration
                
                self._apply_red_runners()
                return
            except Exception as exc:
                logger.warning("RL policy_fn failed (%s) — falling back to heuristic", exc)

        self._run_heuristic()
        self._apply_red_runners()

    def _run_heuristic(self) -> None:
        ns = self._queued("N") + self._queued("S")
        ew = self._queued("E") + self._queued("W")
        total = ns + ew or 1
        if self.phase == 0:
            self.phase = 1
            self.cur_duration = 4.0
        elif self.phase == 1:
            self.phase = 2
            ratio = ew / total
            self.cur_duration = self.min_green + ratio * (self.max_green - self.min_green)
        elif self.phase == 2:
            self.phase = 3
            self.cur_duration = 4.0
        elif self.phase == 3:
            self.phase = 4
            self.cur_duration = 2.0
        else:
            self.phase = 0
            ratio = ns / total
            self.cur_duration = self.min_green + ratio * (self.max_green - self.min_green)

    def step(self, dt: float) -> None:
        self.sim_clock += dt
        self.phase_elapsed += dt
        self.phase_durations[self.phase] += dt

        self._check_early_termination()

        if self.phase_elapsed >= self.cur_duration:
            self._decide_next()
            self.phase_elapsed = 0.0

        green = self._get_green_movements()

        lane_map: dict[str, list] = {}
        for v in self.vehicles:
            lane_map.setdefault(f"{v.arm}_{v.lane}", []).append(v)
        in_box = [
            v for v in self.vehicles
            if v.through and abs(v.x) < 14.4 and abs(v.y) < 14.4
        ]
        arm_active_veh: dict[str, list] = {}
        for v in self.vehicles:
            if not v.through and not v.turning:
                arm_active_veh.setdefault(v.arm, []).append(v)
        _GHOST_SPEED = _MOVE_SPEED * 0.25

        ped_stop_zones: list[tuple[str, float, float, float]] = []
        for ped in self.pedestrians:
            if ped.state in ("crossing_1", "crossing_2"):
                pos = ped.position_dict()
                ped_stop_zones.append((ped.arm, pos["x"], pos["y"], 9.0))

        arm_veh: dict[str, list] = {}
        for v in self.vehicles:
            theta = get_arm_angle(v.arm, self.intersection_type)
            cos_t = math.cos(theta)
            sin_t = math.sin(theta)
            v_long = v.x * cos_t + v.y * sin_t
            v_lat = -v.x * sin_t + v.y * cos_t
            v_hl = _VEH_LEN.get(v.type_id, 4.0) / 2.0
            v_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
            arm_veh.setdefault(v.arm, []).append((v_long, v_lat, v_hl, v_hw, v))

        to_remove: list = []
        for v in self.vehicles:
            theta = get_arm_angle(v.arm, self.intersection_type)
            cos_t = math.cos(theta)
            sin_t = math.sin(theta)
            lo = 1.6
            hi = 1.6 + max(1, v.n_lanes) * 4.2 - 0.4
            v_long = v.x * cos_t + v.y * sin_t
            v_lat = -v.x * sin_t + v.y * cos_t
            v_hl = _VEH_LEN.get(v.type_id, 4.0) / 2.0
            v_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0

            ped_blocking = False
            if not v.through:
                for (parm, px, py, prad) in ped_stop_zones:
                    if parm != v.arm:
                        continue
                    p_long = px * cos_t + py * sin_t
                    p_lat = -px * sin_t + py * cos_t
                    ahead = p_long < v_long
                    if ahead and (v_long - p_long) < prad and abs(p_lat - v_lat) < (v_hw + 1.8):
                        v.speed = 0.0
                        ped_blocking = True
                        break

            if not v.through and not v.turning and not ped_blocking:
                min_gap = v_hl + 1.0
                closest_ahead = 999.0
                for (o_long, o_lat, o_hl, o_hw, other) in arm_veh.get(v.arm, []):
                    if other is v:
                        continue
                    long_dist = v_long - o_long
                    lat_gap = abs(o_lat - v_lat) - (v_hw + o_hw)
                    if long_dist > 0 and long_dist < 15.0 and lat_gap < 0.5:
                        gap = long_dist - v_hl - o_hl
                        closest_ahead = min(closest_ahead, gap)

                if closest_ahead < min_gap:
                    escape = v._find_lateral_gap(arm_active_veh.get(v.arm, []))
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

            side_blocked = False
            if not v.turning and not ped_blocking and not v.through:
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
                    lane_target = v._find_best_lane(arm_active_veh.get(v.arm, []))
                    num_l = max(1, v.n_lanes)
                    offsets = [3.7 + i * 4.2 for i in range(num_l)]
                    if lane_target is not None:
                        if self.intersection_type in ("four_way_free_left", "t_junction_free_left", "roundabout_free_left"):
                            arm_lane2 = offsets[2] if num_l > 2 else -999.0
                            if v.turn_dir != "left" and abs(lane_target - arm_lane2) < 2.0:
                                lane_target = None

                    if lane_target is not None:
                        target = lane_target
                        steer_rate = _LAT_STEER_RATE * 2.0
                        if lane_target in offsets:
                            new_lane_idx = offsets.index(lane_target)
                            if new_lane_idx != v.lane:
                                old_center = offsets[v.lane % num_l]
                                deviation = v.lat_drift - old_center
                                v.lane = new_lane_idx
                                v.lat_drift = lane_target + deviation
                    else:
                        if v.type_id in _BIKE_TYPES or v.type_id == "auto_rickshaw":
                            v.weave_phase += dt * 0.5
                            mid = (lo + hi) / 2.0
                            amp = (hi - lo) / 2.0 * 0.6
                            target = mid + amp * math.sin(v.weave_phase)
                        else:
                            v.weave_phase += dt * 0.2
                            base = offsets[v.lane % num_l]
                            freedom = _LAT_FREEDOM.get(v.type_id, 1.0) * 0.35
                            target = base + freedom * math.sin(v.weave_phase)
                        steer_rate = _LAT_STEER_RATE

                my_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                target = max(lo + my_hw + 0.1, min(hi - my_hw - 0.1, target))
                delta = target - v_lat
                move = min(abs(delta), steer_rate * dt) * (1 if delta > 0 else -1) if steer_rate > 0.0 else 0.0
                
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

            if v.type_id in _BIKE_TYPES and not v.through and not v.turning:
                is_ns_arm = v.arm in ("N", "S")
                is_ew_arm = v.arm in ("E", "W")
                ns_right_on = ("N_right" in green or "S_right" in green)
                ew_right_on = ("E_right" in green or "W_right" in green)
                is_perp_right_on = (is_ns_arm and ew_right_on) or (is_ew_arm and ns_right_on)
                
                is_right_turner = v.turn_dir in ("right", "uturn", "mid_uturn")
                right_on = (f"{v.arm}_right" in green or f"{v.arm}_uturn" in green)
                is_right_blocked = is_right_turner and getattr(self, "is_protected_right", False) and not right_on
                
                if not is_perp_right_on and not is_right_blocked:
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

            if v.red_runner and not v.through and not v.turning:
                is_ns_arm = v.arm in ("N", "S")
                is_ew_arm = v.arm in ("E", "W")
                ns_right_on = ("N_right" in green or "S_right" in green)
                ew_right_on = ("E_right" in green or "W_right" in green)
                is_perp_right_on = (is_ns_arm and ew_right_on) or (is_ew_arm and ns_right_on)
                
                is_right_turner = v.turn_dir in ("right", "uturn", "mid_uturn")
                right_on = (f"{v.arm}_right" in green or f"{v.arm}_uturn" in green)
                is_right_blocked = is_right_turner and getattr(self, "is_protected_right", False) and not right_on
                
                if is_perp_right_on or is_right_blocked:
                    v.red_runner = False
                
                if v.red_runner:
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

            if v.speed == 0.0 and not v.turning and not v.through:
                if v.arm in green and v.stuck_s > 3.0:
                    escape = v._find_lateral_gap(arm_active_veh.get(v.arm, []))
                    if escape is not None:
                        my_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
                        escape = max(lo + my_hw + 0.1, min(hi - my_hw - 0.1, escape))
                        delta = escape - v_lat
                        steer = min(abs(delta), _LAT_STEER_RATE * dt * 3) * (1 if delta > 0 else -1)
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

            exited = v.update(dt, green, self.vehicles, in_box, self.intersection_type, ped_blocking=ped_blocking, side_blocked=side_blocked, lane_layout=getattr(self, "lane_layout", None))

            my_hw = _VEH_WIDTH.get(v.type_id, 1.8) / 2.0
            if not v.turning and not v.through:
                num_l = max(1, v.n_lanes)
                lo_h = 1.6
                hi_h = 1.6 + num_l * 4.2 - 0.4
                clamped_lat = max(lo_h + my_hw, min(hi_h - my_hw, v_lat))
                move = clamped_lat - v_lat
                if move != 0.0:
                    v.x += move * (-sin_t)
                    v.y += move * cos_t
            elif v.through and not v.turning:
                dist_to_center = math.hypot(v.x, v.y)
                if dist_to_center > 14.4:
                    exit_theta = get_arm_angle(v.arm, self.intersection_type)
                    cos_ex = math.cos(exit_theta)
                    sin_ex = math.sin(exit_theta)
                    v_lat_ex = -v.x * sin_ex + v.y * cos_ex
                    if v.exit_arm is not None:
                        num_l = max(1, v.n_lanes)
                        lo_h = -(1.6 + num_l * 4.2 - 0.4)
                        hi_h = -1.6
                        clamped_lat = max(lo_h + my_hw, min(hi_h - my_hw, v_lat_ex))
                    else:
                        num_l = max(1, v.n_lanes)
                        lo_h = 1.6
                        hi_h = 1.6 + num_l * 4.2 - 0.4
                        clamped_lat = max(lo_h + my_hw, min(hi_h - my_hw, v_lat_ex))
                    move = clamped_lat - v_lat_ex
                    if move != 0.0:
                        v.x += move * (-sin_ex)
                        v.y += move * cos_ex

            _TIER1_S = 2.0
            _TIER2_S = 5.0
            _TIER3_S = 10.0

            if v.speed == 0.0:
                is_stuck_green = False
                if self.is_protected_right:
                    is_stuck_green = (v.arm in green or f"{v.arm}_{v.turn_dir}" in green) and not v.through
                else:
                    is_stuck_green = (v.arm in green) and not v.through
                should_track = v.through or is_stuck_green

                if should_track:
                    v.stuck_s += dt

                    if v.stuck_s >= _TIER3_S:
                        exited = True

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
                                v.arm = v.exit_arm
                                v.lane = v.exit_lane
                                v.lat_drift = v.exit_lat_drift
                                v.dx, v.dy = v.exit_dx, v.exit_dy
                                v.angle = None
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

                    elif v.stuck_s >= _TIER1_S:
                        if v.turning and v.b_p0 is not None:
                            v.speed = _GHOST_SPEED
                            v.turn_t = min(1.0, v.turn_t + dt * _GHOST_SPEED / 25.0)
                            bx, by = v._beval(v.b_p0, v.b_p1, v.b_p2, v.turn_t)
                            v.x, v.y = bx, by
                            tx_tan, ty_tan = v._btangent(v.b_p0, v.b_p1, v.b_p2, v.turn_t)
                            v.angle = math.atan2(ty_tan, tx_tan)
                            if v.turn_t >= 1.0:
                                v.arm = v.exit_arm
                                v.lane = v.exit_lane
                                v.lat_drift = v.exit_lat_drift
                                v.dx, v.dy = v.exit_dx, v.exit_dy
                                v.angle = None
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

        seen = set()
        for v in to_remove:
            if id(v) not in seen:
                seen.add(id(v))
                self.vehicles.remove(v)
                self.exited_count += 1
                self.total_wait_time += v.wait_time
                self.exited_history.append((self.sim_clock, 1))
                self.wait_history.append((self.sim_clock, v.wait_time))
                self.phase_vehicle_counts[self.phase][v.type_id] += 1
                if self.current_phase_event:
                    counts = self.current_phase_event["vehicle_counts"]
                    counts[v.type_id] = counts.get(v.type_id, 0) + 1
                
                # Check DB write helper
                if getattr(self, "session_store", None) and getattr(self, "session_id", None):
                    crossing_time = self.sim_clock - getattr(v, "spawn_time", 0.0)
                    world_key = getattr(self, "world_key", "unknown")
                    if world_key == "baseline":
                        run_type = "baseline"
                        algorithm = getattr(self, "baseline_controller", "fixed_time")
                    else:
                        run_type = "rl"
                        algorithm = getattr(self, "algorithm", "RL")

                    try:
                        self.session_store.save_vehicle_crossing(
                            session_id=self.session_id,
                            simulation_id=getattr(self, "simulation_id", "unknown"),
                            vehicle_id=v.id,
                            vehicle_type=v.type_id,
                            number_plate=getattr(v, "number_plate", ""),
                            entry_time=getattr(v, "spawn_time", 0.0),
                            exit_time=self.sim_clock,
                            crossing_duration=crossing_time,
                            run_type=run_type,
                            algorithm=algorithm
                        )
                    except Exception as db_err:
                        logger.warning("Failed to save vehicle crossing to db: %s", db_err)

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

        peds_done = []
        for ped in self.pedestrians:
            nearest_dist = 999.0
            for v in self.vehicles:
                if v.arm != ped.arm or v.through:
                    continue
                pos = ped.position_dict()
                vdist = math.hypot(v.x - pos["x"], v.y - pos["y"])
                nearest_dist = min(nearest_dist, vdist)
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
        cutoff = self.sim_clock - 300.0
        self.exited_history = [e for e in self.exited_history if e[0] >= cutoff]
        self.wait_history = [w for w in self.wait_history if w[0] >= cutoff]

        avg_wait_s = (self.total_wait_time / self.exited_count) if self.exited_count > 0 else 0.0
        throughput_vph = (self.exited_count / max(self.sim_clock, 0.001) * 3600.0)

        recent_exits = len(self.exited_history)
        denom_clock = min(self.sim_clock, 300.0)
        instant_tput_vph = (recent_exits / max(denom_clock, 0.001) * 3600.0)

        if self.wait_history:
            instant_wait_s = sum(w[1] for w in self.wait_history) / len(self.wait_history)
        else:
            instant_wait_s = avg_wait_s

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
