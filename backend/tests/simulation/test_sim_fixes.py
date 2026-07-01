"""Tests verifying the u-turn phase gating and free-left turn Bezier curve fixes."""
import sys
from unittest.mock import MagicMock

# Mock out heavy ML/torch/RL modules to prevent access violations on Windows/pytest
# and ensure these unit tests run extremely fast.
sys.modules['torch'] = MagicMock()
sys.modules['stable_baselines3'] = MagicMock()
sys.modules['backend.rl.numpy_compat'] = MagicMock()

import math
import pytest
from backend.api.socket_handlers import (
    _MockVehicle, _vehicle_from_spec, _spawn_spec, _SimWorld, _STOP_DIST
)

def test_uturn_phase_gating():
    # 1. Spawn spec with u_turn_phase=False should not spawn any uturn vehicles by default.
    # The normal spawning chooses standard turns (straight, left, right).
    # Let's verify that when u_turn_phase is False, _spawn_spec doesn't assign "uturn"
    for i in range(100):
        spec = _spawn_spec(
            vid_counter=i,
            intersection_type="four_way",
            u_turn_phase=False
        )
        assert spec["turn"] != "uturn"

    # 2. Spawn spec with u_turn_phase=True can spawn uturn vehicles (with probability or when lane=0)
    uturn_found = False
    for i in range(500):
        spec = _spawn_spec(
            vid_counter=i,
            lane=0,
            intersection_type="four_way",
            u_turn_phase=True
        )
        if spec["turn"] == "uturn":
            uturn_found = True
            # Check vehicle from spec preserves u_turn_phase flag
            v = _vehicle_from_spec(spec)
            assert v.u_turn_phase is True
            break
    assert uturn_found, "Should spawn at least one U-turn vehicle when u_turn_phase=True"

def test_uturn_bypass_gating_at_red_signal():
    # If u_turn_phase is False, vehicle with turn="uturn" (e.g. manually set or custom)
    # should NOT bypass red signal and should stop (speed = 0.0).
    v = _MockVehicle("v", arm="N", lane=0, intersection_type="four_way")
    v.turn_dir = "mid_uturn"
    v.u_turn_phase = False  # explicitly disable
    
    # Position vehicle inside the stop line / stop zone
    theta = -math.pi / 2  # N arm angle
    v.x = 3.7
    v.y = -v.stop_zone + 1.0
    
    # Run update under red signal (green_arms empty)
    green_arms = set()
    exited = v.update(
        dt=0.1,
        green_arms=green_arms,
        same_lane=[],
        vehicles_in_box=[],
        intersection_type="four_way"
    )
    assert v.speed == 0.0, "Mid U-turn vehicle should stop at red signal when u_turn_phase is disabled"

    # If u_turn_phase is True, it should bypass red signal
    v2 = _MockVehicle("v2", arm="N", lane=0, intersection_type="four_way")
    v2.turn_dir = "mid_uturn"
    v2.u_turn_phase = True
    v2.x = 3.7
    v2.y = -v2.stop_zone + 1.0
    
    v2.update(
        dt=0.1,
        green_arms=green_arms,
        same_lane=[],
        vehicles_in_box=[],
        intersection_type="four_way"
    )
    assert v2.speed > 0.0, "Mid U-turn vehicle should bypass red signal when u_turn_phase is enabled"

def test_free_left_bezier_points():
    # Under free-left intersection, left-turning vehicles should stay on the road surface
    # by using the outer corner of the intersection as the Bezier control point b_p1.
    spec = {
        "vid": "v_fl",
        "arm": "N",
        "lane": 2,
        "n_lanes": 3,
        "type_id": "car",
        "turn": "left",
        "intersection_type": "four_way_free_left",
        "free_left": True,
        "u_turn_phase": False
    }
    v = _vehicle_from_spec(spec)
    assert v.free_left is True
    
    # Trigger turn setup
    # Make vehicle commit to intersection by placing it close to center
    v.x = 12.1
    v.y = -10.0  # inside commit distance
    v._setup_turn(intersection_type="four_way_free_left")
    
    assert v.turning is True
    assert v.b_p1 is not None
    
    # Expected b_p1 for N (approach) -> E (exit) left turn is the NE corner:
    # (1.05 * _STOP_DIST, -1.05 * _STOP_DIST)
    expected_x = 1.05 * _STOP_DIST
    expected_y = -1.05 * _STOP_DIST
    
    assert math.isclose(v.b_p1[0], expected_x, rel_tol=1e-3)
    assert math.isclose(v.b_p1[1], expected_y, rel_tol=1e-3)

def test_lane_turn_ratios_spawning():
    # 1. Test custom lane turn ratios where lane 0 is 100% left and lane 1 is 100% right
    lane_layout = {
        "lane_turn_ratios": {
            "N": [
                {"straight": 0.0, "left": 1.0, "right": 0.0, "uturn": 0.0},  # Lane 0
                {"straight": 0.0, "left": 0.0, "right": 1.0, "uturn": 0.0},  # Lane 1
            ]
        }
    }
    
    # Spawn in Lane 0 -> must be "left"
    for i in range(50):
        spec = _spawn_spec(
            vid_counter=i,
            arm="N",
            lane=0,
            intersection_type="four_way",
            lane_layout=lane_layout
        )
        assert spec["lane"] == 0
        assert spec["turn"] == "left"

    # Spawn in Lane 1 -> must be "right"
    for i in range(50):
        spec = _spawn_spec(
            vid_counter=i,
            arm="N",
            lane=1,
            intersection_type="four_way",
            lane_layout=lane_layout
        )
        assert spec["lane"] == 1
        assert spec["turn"] == "right"

    # 2. Test fallback to default when ratios are missing or empty
    spec_fallback = _spawn_spec(
        vid_counter=999,
        arm="N",
        lane=0,
        intersection_type="four_way",
        lane_layout={}  # empty
    )
    # Turn should be generated under fallback rules (straight, right, left, uturn depending on config)
    assert spec_fallback["turn"] in ("straight", "left", "right", "uturn")

def test_arm_turn_ratios_spawning():
    # Test arm-specific distributions where N is 100% left
    lane_layout = {
        "turn_distribution_mode": "arm",
        "arm_turn_ratios": {
            "N": {"straight": 0.0, "left": 1.0, "right": 0.0, "uturn": 0.0}
        }
    }
    
    # Vehicle should always get turn == "left" and should get lane == 2 (if n_lanes > 2)
    for i in range(50):
        spec = _spawn_spec(
            vid_counter=i,
            arm="N",
            lane=None,
            intersection_type="four_way_free_left",
            lane_layout=lane_layout
        )
        assert spec["turn"] == "left"
        assert spec["lane"] == 2

def test_mid_uturn_spawning_and_routing():
    # 1. Spawning check: arm-level distribution mode with 100% mid_uturn
    lane_layout = {
        "turn_distribution_mode": "arm",
        "arm_turn_ratios": {
            "N": {"straight": 0.0, "left": 0.0, "right": 0.0, "uturn": 0.0, "mid_uturn": 1.0}
        }
    }
    spec = _spawn_spec(
        vid_counter=101,
        arm="N",
        lane=None,
        intersection_type="four_way",
        lane_layout=lane_layout
    )
    assert spec["turn"] == "mid_uturn"
    # Option A3: should spawn in any lane (not restricted to innermost/Lane 0)
    assert 0 <= spec["lane"] <= 2

    # 2. Physics & routing commit checks:
    # Scenario A: mid_uturn vehicle when u_turn_phase is True (should bypass red signal, commit at d=26)
    v_active = _MockVehicle("v_active", arm="N", lane=0, intersection_type="four_way")
    v_active.type_id = "car"
    v_active.through_dist = 20.3
    v_active.stop_zone = 22.8
    v_active.turn_dir = "mid_uturn"
    v_active.u_turn_phase = True
    v_active.x = 3.7
    v_active.y = -25.0  # inside commit distance (commit_d = 26.0)
    
    green_arms = set()  # red signal
    v_active.update(dt=0.1, green_arms=green_arms, same_lane=[], vehicles_in_box=[], intersection_type="four_way")
    assert v_active.through is True, "Mid U-turn vehicle should commit and bypass red light if u_turn_phase is enabled"
    assert v_active.turning is True
    # Verify early turn start (d_exit is 24.0, BP2 target should be at y = -24.0)
    assert math.isclose(v_active.b_p2[1], -24.0, rel_tol=1e-3)

    # Scenario B: mid_uturn vehicle when u_turn_phase is False (should obey red signal, stop at signal stop-line)
    v_stopped = _MockVehicle("v_stopped", arm="N", lane=0, intersection_type="four_way")
    v_stopped.type_id = "car"
    v_stopped.through_dist = 20.3
    v_stopped.stop_zone = 22.8
    v_stopped.turn_dir = "mid_uturn"
    v_stopped.u_turn_phase = False
    v_stopped.x = 3.7
    v_stopped.y = -v_stopped.stop_zone + 1.0  # inside stop zone
    
    v_stopped.update(dt=0.1, green_arms=green_arms, same_lane=[], vehicles_in_box=[], intersection_type="four_way")
    assert v_stopped.speed == 0.0, "Mid U-turn vehicle should stop under red signal if u_turn_phase is disabled"

    # Scenario C: mid_uturn vehicle when u_turn_phase is False, but signal is green (should commit and turn at signal itself with d_exit = 28.0)
    v_green = _MockVehicle("v_green", arm="N", lane=0, intersection_type="four_way")
    v_green.type_id = "car"
    v_green.through_dist = 20.3
    v_green.stop_zone = 22.8
    v_green.turn_dir = "mid_uturn"
    v_green.u_turn_phase = False
    v_green.x = 3.7
    v_green.y = -19.5  # inside calibrated commit distance (through_dist = 20.3)
    
    green_arms_c = {"N_right"}
    v_green.update(dt=0.1, green_arms=green_arms_c, same_lane=[], vehicles_in_box=[], intersection_type="four_way")
    assert v_green.through is True, "Mid U-turn vehicle should commit if signal is green and u_turn_phase is disabled"
    assert v_green.turning is True
    # Verify signal-level turn start (BP2 target should be at y = -22.0)
    assert math.isclose(v_green.b_p2[1], -22.0, rel_tol=1e-3)


def test_protected_right_turn_phasing():
    # Initialize a _SimWorld under protected right turn mode
    world = _SimWorld(fixed_time=True, intersection_type="four_way_protected_right")
    
    assert world.is_protected_right is True
    assert len(world.phase_durations_list) == 9
    assert world.phase == 0
    
    # 1. Test phase sequence transitions: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 0
    expected_transitions = [1, 2, 3, 4, 5, 6, 7, 8, 0]
    for exp in expected_transitions:
        world._decide_next()
        assert world.phase == exp, f"Expected phase {exp}, but got {world.phase}"
        
    # Reset to phase 0
    world.phase = 0
    
    # 2. Physics check - Phase 0 (N-S Straight Green, Right Turn Red)
    green_0 = world.phase_green_map[0]
    assert "N_straight" in green_0
    assert "N_left" in green_0
    assert "N_right" not in green_0
    
    # North straight vehicle in Phase 0 (should proceed)
    v_straight = _MockVehicle("v_str", arm="N", lane=1, intersection_type="four_way_protected_right")
    v_straight.turn_dir = "straight"
    v_straight.x = 3.7
    v_straight.y = -v_straight.stop_zone + 1.0  # inside stop zone
    v_straight.update(dt=0.1, green_arms=green_0, same_lane=[], vehicles_in_box=[], intersection_type="four_way_protected_right")
    assert v_straight.speed > 0.0, "Straight vehicle should proceed in Phase 0"
    
    # North right-turn vehicle in Phase 0 (should stop)
    v_right = _MockVehicle("v_rgt", arm="N", lane=0, intersection_type="four_way_protected_right")
    v_right.turn_dir = "right"
    v_right.x = 1.6
    v_right.y = -v_right.stop_zone + 1.0  # inside stop zone
    v_right.update(dt=0.1, green_arms=green_0, same_lane=[], vehicles_in_box=[], intersection_type="four_way_protected_right")
    assert v_right.speed == 0.0, "Right-turn vehicle should be stopped by red arrow in Phase 0"
    
    # 3. Physics check - Phase 2 (N-S Right Green, Straight Red)
    green_2 = world.phase_green_map[2]
    assert "N_right" in green_2
    assert "N_straight" not in green_2
    
    # North straight vehicle in Phase 2 (should stop)
    v_straight_2 = _MockVehicle("v_str_2", arm="N", lane=1, intersection_type="four_way_protected_right")
    v_straight_2.turn_dir = "straight"
    v_straight_2.x = 3.7
    v_straight_2.y = -v_straight_2.stop_zone + 1.0
    v_straight_2.update(dt=0.1, green_arms=green_2, same_lane=[], vehicles_in_box=[], intersection_type="four_way_protected_right")
    assert v_straight_2.speed == 0.0, "Straight vehicle should stop under red straight signal in Phase 2"
    
    # North right-turn vehicle in Phase 2 (should proceed)
    v_right_2 = _MockVehicle("v_rgt_2", arm="N", lane=0, intersection_type="four_way_protected_right")
    v_right_2.turn_dir = "right"
    v_right_2.x = 1.6
    v_right_2.y = -v_right_2.stop_zone + 1.0
    v_right_2.update(dt=0.1, green_arms=green_2, same_lane=[], vehicles_in_box=[], intersection_type="four_way_protected_right")
    assert v_right_2.speed > 0.0, "Right-turn vehicle should proceed under green right arrow in Phase 2"


def test_stop_line_outer_lanes_and_spawn_filtering():
    # 1. Spawning check: arm-specific distribution where N is 50% left, 50% right.
    # But N lanes are all configured as 'straight'.
    # Allowed turns should filter out left and right, spawning only straight!
    lane_layout = {
        "turn_distribution_mode": "arm",
        "arm_turn_ratios": {
            "N": {"straight": 0.0, "left": 0.5, "right": 0.5, "uturn": 0.0}
        },
        "lane_directions": {
            "N": ["straight", "straight", "straight"]
        }
    }
    
    for i in range(50):
        spec = _spawn_spec(
            vid_counter=i,
            arm="N",
            lane=None,
            intersection_type="four_way",
            lane_layout=lane_layout
        )
        assert spec["turn"] == "straight", f"Expected straight turn due to filtering, but got {spec['turn']}"
        
    # 2. Stop check for outer lane vehicles
    # Create a vehicle in outer lane 2 (x = 12.1) at the stop zone but NOT past commit_d
    # For a car: stop_zone = 22.8, through_dist = 20.3
    # At the stop line (y = -20.8 → v_long = 20.8): inside stop_zone but outside through_dist
    v_outer = _MockVehicle("v_outer", arm="N", lane=2, intersection_type="four_way")
    v_outer.type_id = "car"
    v_outer.stop_zone = 22.8
    v_outer.through_dist = 20.3
    v_outer.turn_dir = "straight"
    v_outer.x = 12.1
    v_outer.y = -20.8  # v_long = 20.8 → inside stop_zone (22.8) but outside through_dist (20.3)
    
    green_arms = set()  # red signal
    v_outer.update(dt=0.1, green_arms=green_arms, same_lane=[], vehicles_in_box=[], intersection_type="four_way")
    assert v_outer.speed == 0.0, "Outer lane vehicle should stop at red signal"
def test_centralized_phase_scheduling():
    # Create an adaptive SimWorld (fixed_time=False) for protected intersection
    world = _SimWorld(fixed_time=False, intersection_type="four_way_arrow")
    assert world.is_protected_right is True
    assert world.phase_queue == []
    
    # 1. Test demand-aware subphase splitting when straight has demand but right has none
    # Mock vehicles in straight lanes of North arm
    v_str = _MockVehicle("v_str", arm="N", lane=1, intersection_type="four_way_arrow")
    v_str.turn_dir = "straight"
    v_str.x = 3.7
    v_str.y = -25.0
    world.add(v_str)
    
    # Check split of NS green for 30s
    seq = world._get_protected_subphases("NS", 30.0)
    # Since only straight has demand: should return straight green and straight yellow
    assert len(seq) == 2
    assert seq[0] == (0, 30.0)  # Straight Green
    assert seq[1] == (1, 4.0)   # Straight Yellow
    
    # 2. Add right-turn demand to S arm
    v_rgt = _MockVehicle("v_rgt", arm="S", lane=0, intersection_type="four_way_arrow")
    v_rgt.turn_dir = "right"
    v_rgt.x = -3.7
    v_rgt.y = 25.0
    world.add(v_rgt)
    
    seq2 = world._get_protected_subphases("NS", 30.0)
    # Both straight and right have demand: should return straight green, straight yellow, right green, right yellow
    assert len(seq2) == 4
    # Check that they split total_duration 30s with a 10s cap on right-turn green
    assert seq2[0] == (0, 20.0)  # Straight Green (20.0s)
    assert seq2[1] == (1, 4.0)   # Straight Yellow
    assert seq2[2] == (2, 10.0)  # Right Green (10.0s)
    assert seq2[3] == (3, 4.0)   # Right Yellow
    
    # 3. Test queue transitions in _original_decide_next
    # Reset world queue and start sequence
    world.phase_queue = seq2
    world._decide_next()  # Pop first item
    assert world.phase == 0
    assert world.cur_duration == 20.0
    
    world._decide_next()  # Pop second item
    assert world.phase == 1
    assert world.cur_duration == 4.0
    
    world._decide_next()  # Pop third item
    assert world.phase == 2
    assert world.cur_duration == 10.0
    
    world._decide_next()  # Pop fourth item
    assert world.phase == 3
    assert world.cur_duration == 4.0
    
    assert world.phase_queue == []
def test_commitment_gating_on_red():
    # 1. Vehicle approaching red light should NOT commit (through remains False)
    v_red = _MockVehicle("v_red", arm="N", lane=1, intersection_type="four_way")
    v_red.type_id = "car"
    v_red.x = 3.7
    v_red.y = -v_red.through_dist + 0.5  # v_long is less than commit_d (20.3) -> e.g. 19.8
    v_red.through = False
    
    green_arms = set()  # red signal
    v_red.update(dt=0.1, green_arms=green_arms, same_lane=[], vehicles_in_box=[], intersection_type="four_way")
    assert v_red.through is False, "Vehicle should not commit on red light even if v_long < commit_d"
    assert v_red.speed == 0.0, "Vehicle should be stopped at stop zone"

    # 2. Vehicle approaching green light SHOULD commit (through becomes True)
    v_green = _MockVehicle("v_green", arm="N", lane=1, intersection_type="four_way")
    v_green.type_id = "car"
    v_green.x = 3.7
    v_green.y = -v_green.through_dist + 0.5  # inside commit_d
    v_green.through = False
    
    green_arms_active = {"N"}  # green signal
    v_green.update(dt=0.1, green_arms=green_arms_active, same_lane=[], vehicles_in_box=[], intersection_type="four_way")
    assert v_green.through is True, "Vehicle should commit on green light when v_long < commit_d"
    assert v_green.speed > 0.0, "Vehicle should proceed on green light"

def test_exit_lane_blocker_checking():
    # 1. Right-turning vehicle at stop line should stop if exit lane is blocked
    v_turn = _MockVehicle("v_turn", arm="N", lane=0, intersection_type="four_way_arrow")
    v_turn.type_id = "car"
    v_turn.turn_dir = "right"
    # Position it at the stop zone
    v_turn.x = 1.6
    v_turn.y = -v_turn.stop_zone + 1.0  # inside stop zone
    v_turn.through = False
    
    # Blocker in Westbound exit arm (target arm of N right turn), exit lane 0
    # Center is at (0,0), stop line is at _STOP_DIST = 19.8.
    # Blocker position is outbound on West: negative x, small y.
    v_blocker = _MockVehicle("v_blocker", arm="W", lane=0, intersection_type="four_way_arrow")
    v_blocker.type_id = "car"
    v_blocker.through = True
    v_blocker.x = -22.0  # close to box (outbound)
    v_blocker.y = 3.7
    v_blocker.speed = 0.0
    
    # N is green
    green_arms = {"N_right"}
    v_turn.update(dt=0.1, green_arms=green_arms, same_lane=[v_turn, v_blocker], vehicles_in_box=[], intersection_type="four_way_arrow")
    assert v_turn.speed == 0.0, "Right-turning vehicle should stop because exit lane is blocked"

def test_box_blocked_commitment_gating():
    # Vehicle approaching green light should NOT commit if box has a perpendicular blocker
    v_green = _MockVehicle("v_green", arm="N", lane=1, intersection_type="four_way")
    v_green.type_id = "car"
    v_green.x = 3.7
    v_green.y = -v_green.through_dist + 0.5  # inside commit_d
    v_green.through = False
    
    # Blocker from E arm (perpendicular) in the middle of the box
    v_blocker = _MockVehicle("v_blocker", arm="E", lane=1, intersection_type="four_way")
    v_blocker.type_id = "car"
    v_blocker.through = True
    v_blocker.x = 2.0  # inside box
    v_blocker.y = -3.7
    v_blocker.speed = 0.0
    
    green_arms_active = {"N"}  # green signal
    v_green.update(dt=0.1, green_arms=green_arms_active, same_lane=[], vehicles_in_box=[v_blocker], intersection_type="four_way")
    assert v_green.through is False, "Vehicle should not commit on green light if box is blocked"
    assert v_green.speed == 0.0, "Vehicle should stop at stop line"


def test_right_signal_perpendicular_blocking():
    green_arms_active = {"N_right", "S_right"}
    v_perp = _MockVehicle("v_perp", arm="E", lane=1, intersection_type="four_way_protected_right")
    v_perp.type_id = "car"
    v_perp.x = v_perp.stop_zone + 5.0
    v_perp.y = -3.7
    v_perp.speed = 10.0
    v_perp.through = False
    v_perp.update(dt=0.1, green_arms=green_arms_active, same_lane=[], vehicles_in_box=[], intersection_type="four_way_protected_right")
    assert v_perp.speed == 0.0, "Perpendicular vehicle should stop when right signal is active on cross street"


def test_right_signal_red_gating():
    green_arms_active = {"N_straight", "N_left", "S_straight", "S_left"}
    v_right = _MockVehicle("v_r", arm="N", lane=0, intersection_type="four_way_protected_right")
    v_right.type_id = "car"
    v_right.turn_dir = "right"
    v_right.x = 1.6
    v_right.y = -v_right.stop_zone + 0.5
    v_right.speed = 5.0
    v_right.red_runner = True
    v_right.through = False
    v_right.update(dt=0.1, green_arms=green_arms_active, same_lane=[], vehicles_in_box=[], intersection_type="four_way_protected_right")
    assert v_right.red_runner is False, "Red runner should be disabled for right turner when right signal is red"
    assert v_right.speed == 0.0, "Right-turning vehicle should not move right (speed = 0) when right signal is red"


if __name__ == "__main__":
    test_uturn_phase_gating()
    test_uturn_bypass_gating_at_red_signal()
    test_free_left_bezier_points()
    test_lane_turn_ratios_spawning()
    test_arm_turn_ratios_spawning()
    test_mid_uturn_spawning_and_routing()
    test_protected_right_turn_phasing()
    test_stop_line_outer_lanes_and_spawn_filtering()
    test_centralized_phase_scheduling()
    test_commitment_gating_on_red()
    test_exit_lane_blocker_checking()
    test_box_blocked_commitment_gating()
    test_right_signal_perpendicular_blocking()
    test_right_signal_red_gating()
    print("ALL VERIFICATION TESTS PASSED SUCCESSFULLY!")




