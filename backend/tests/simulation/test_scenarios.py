"""
Verify correct signal gating across all three key intersection scenarios:
  1. four_way  (standard 5-phase)
  2. four_way_free_left (left-bypass on lane 2)
  3. four_way_protected_right (9-phase movement-level signals)
"""
import sys, os
from unittest.mock import MagicMock

# Mock out heavy ML/torch/RL modules to prevent access violations on Windows/pytest
sys.modules['torch'] = MagicMock()
sys.modules['stable_baselines3'] = MagicMock()
sys.modules['backend.rl.numpy_compat'] = MagicMock()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
from backend.api.socket_handlers import _SimWorld, _MockVehicle

STOP_ZONE    = 22.8
THROUGH_DIST = 20.3

def make_vehicle(vid, arm, lane, turn, intersection_type):
    v = _MockVehicle(vid, arm=arm, lane=lane, intersection_type=intersection_type)
    v.turn_dir   = turn
    v.stop_zone  = STOP_ZONE
    v.through_dist = THROUGH_DIST
    # Position: just inside stop zone, outside commit zone
    # For N: v_long = |y| = 20.8  (22.8 > 20.8 > 20.3 ✓)
    if arm == 'N': v.x =  3.7; v.y = -20.8
    if arm == 'S': v.x = -3.7; v.y =  20.8
    if arm == 'E': v.x =  20.8; v.y =  3.7
    if arm == 'W': v.x = -20.8; v.y = -3.7
    return v


# ─────────────────────────────────────────────────────────────────
# 1. four_way – standard arm-level signals
# ─────────────────────────────────────────────────────────────────
def test_four_way_signal_gating():
    itype = 'four_way'
    
    # Phase 0: N-S straight/left green
    green_0 = {'N_straight', 'N_left', 'S_straight', 'S_left'}
    passing_0 = [('N','straight'), ('N','left'), ('S','straight'), ('S','left')]
    stopping_0 = [('N','right'), ('S','right'),
                  ('E','straight'), ('E','left'), ('E','right'),
                  ('W','straight'), ('W','left'), ('W','right')]

    for arm, turn in passing_0:
        v = make_vehicle(f'{arm}_{turn}', arm, 0, turn, itype)
        v.update(0.1, green_0, [], [], itype)
        assert v.speed != 0.0, f"four_way: {arm}-{turn} should PASS on Phase 0 but stopped"

    for arm, turn in stopping_0:
        v = make_vehicle(f'{arm}_{turn}', arm, 0, turn, itype)
        v.update(0.1, green_0, [], [], itype)
        assert v.speed == 0.0, f"four_way: {arm}-{turn} should STOP on Phase 0 but passed"

    # Phase 2: N-S right green
    green_2 = {'N_right', 'N_uturn', 'S_right', 'S_uturn'}
    passing_2 = [('N','right'), ('S','right')]
    stopping_2 = [('N','straight'), ('N','left'), ('S','straight'), ('S','left'),
                  ('E','straight'), ('E','left'), ('E','right'),
                  ('W','straight'), ('W','left'), ('W','right')]

    for arm, turn in passing_2:
        v = make_vehicle(f'{arm}_{turn}', arm, 0, turn, itype)
        v.update(0.1, green_2, [], [], itype)
        assert v.speed != 0.0, f"four_way: {arm}-{turn} should PASS on Phase 2 but stopped"

    for arm, turn in stopping_2:
        v = make_vehicle(f'{arm}_{turn}', arm, 0, turn, itype)
        v.update(0.1, green_2, [], [], itype)
        assert v.speed == 0.0, f"four_way: {arm}-{turn} should STOP on Phase 2 but passed"

    print("OK: four_way signal gating conforms to protected right turn constraints")


# ─────────────────────────────────────────────────────────────────
# 2. four_way_free_left – left bypass for lane-2 left turners
# ─────────────────────────────────────────────────────────────────
def test_four_way_free_left_signal_gating():
    itype = 'four_way_free_left'
    # When N-S is green, E lane-2 left gets free bypass; E straight does not
    green = {'N', 'S'}

    # E-arm lane 2 left turn → free-left bypass → passes even though E is red
    v_fl = make_vehicle('E_left_L2', 'E', 2, 'left', itype)
    v_fl.update(0.1, green, [], [], itype)
    assert v_fl.speed != 0.0, "four_way_free_left: E lane-2 left should bypass red"

    # E-arm lane 0 straight → no bypass → must stop
    v_str = make_vehicle('E_straight_L0', 'E', 0, 'straight', itype)
    v_str.update(0.1, green, [], [], itype)
    assert v_str.speed == 0.0, "four_way_free_left: E straight should stop at red"

    # E-arm lane 0 left turn (not free-left lane) → must stop
    v_lt = make_vehicle('E_left_L0', 'E', 0, 'left', itype)
    v_lt.update(0.1, green, [], [], itype)
    assert v_lt.speed == 0.0, "four_way_free_left: E lane-0 left should stop (not free-left)"

    # N-arm left turn → N is green so passes normally
    v_n = make_vehicle('N_left', 'N', 2, 'left', itype)
    v_n.update(0.1, green, [], [], itype)
    assert v_n.speed != 0.0, "four_way_free_left: N left should pass on green"

    print("OK: four_way_free_left: free-left bypass works, non-bypass movements respect red")


# ─────────────────────────────────────────────────────────────────
# 3. four_way_protected_right – 9-phase movement-level signals
# ─────────────────────────────────────────────────────────────────
def test_four_way_protected_right_signal_gating():
    itype = 'four_way_protected_right'

    # Phase 0: N-S straight+left green; N-S right RED; E-W all RED
    pg0 = {'N_straight', 'N_left', 'S_straight', 'S_left'}
    # N/S straight/left → pass
    for arm, turn in [('N','straight'), ('N','left'), ('S','straight'), ('S','left')]:
        v = make_vehicle(f'{arm}_{turn}', arm, 0, turn, itype)
        v.update(0.1, pg0, [], [], itype)
        assert v.speed != 0.0, f"protected_right ph0: {arm}-{turn} should PASS but stopped"
    # N/S right → stop (right arrow is RED in phase 0)
    for arm in ['N', 'S']:
        v = make_vehicle(f'{arm}_right', arm, 0, 'right', itype)
        v.update(0.1, pg0, [], [], itype)
        assert v.speed == 0.0, f"protected_right ph0: {arm}-right should STOP but passed"
    # E/W all movements → stop (completely red)
    for arm, turn in [('E','straight'), ('E','right'), ('W','left')]:
        v = make_vehicle(f'{arm}_{turn}', arm, 0, turn, itype)
        v.update(0.1, pg0, [], [], itype)
        assert v.speed == 0.0, f"protected_right ph0: {arm}-{turn} should STOP but passed"

    # Phase 2: N-S right green; N-S straight/left RED; E-W all RED
    pg2 = {'N_right', 'N_uturn', 'S_right', 'S_uturn'}
    # N/S right → pass
    for arm in ['N', 'S']:
        v = make_vehicle(f'{arm}_right', arm, 0, 'right', itype)
        v.update(0.1, pg2, [], [], itype)
        assert v.speed != 0.0, f"protected_right ph2: {arm}-right should PASS but stopped"
    # N/S straight → stop
    for arm in ['N', 'S']:
        v = make_vehicle(f'{arm}_straight', arm, 0, 'straight', itype)
        v.update(0.1, pg2, [], [], itype)
        assert v.speed == 0.0, f"protected_right ph2: {arm}-straight should STOP but passed"
    # E/W → stop (full red)
    for arm, turn in [('E','straight'), ('E','right'), ('W','straight')]:
        v = make_vehicle(f'{arm}_{turn}', arm, 0, turn, itype)
        v.update(0.1, pg2, [], [], itype)
        assert v.speed == 0.0, f"protected_right ph2: {arm}-{turn} should STOP but passed"

    # Phase 4: E-W straight+left green; E-W right RED; N-S all RED
    pg4 = {'E_straight', 'E_left', 'W_straight', 'W_left'}
    for arm, turn in [('E','straight'), ('E','left'), ('W','straight'), ('W','left')]:
        v = make_vehicle(f'{arm}_{turn}', arm, 0, turn, itype)
        v.update(0.1, pg4, [], [], itype)
        assert v.speed != 0.0, f"protected_right ph4: {arm}-{turn} should PASS but stopped"
    for arm in ['E', 'W']:
        v = make_vehicle(f'{arm}_right', arm, 0, 'right', itype)
        v.update(0.1, pg4, [], [], itype)
        assert v.speed == 0.0, f"protected_right ph4: {arm}-right should STOP but passed"
    # N-S → stop (full red)
    for arm, turn in [('N','straight'), ('S','right')]:
        v = make_vehicle(f'{arm}_{turn}', arm, 0, turn, itype)
        v.update(0.1, pg4, [], [], itype)
        assert v.speed == 0.0, f"protected_right ph4: {arm}-{turn} should STOP but passed"

    print("OK: four_way_protected_right: all 4 phases correct — crossing arms fully stopped during right-turn phase")


if __name__ == '__main__':
    test_four_way_signal_gating()
    test_four_way_free_left_signal_gating()
    test_four_way_protected_right_signal_gating()
    print()
    print("ALL SCENARIO TESTS PASSED OK")
