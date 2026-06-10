"""Unit tests for SumoEnv (mock TraCI — no SUMO installation required)."""
import pytest
from unittest.mock import MagicMock, patch
from backend.simulation.sumo_env import SumoEnv, SimFrame, VehicleState


def make_env():
    return SumoEnv(
        net_file="test.net.xml",
        rou_file="test.rou.xml",
        step_length=0.5,
        junction_id="center",
    )


def test_lane_to_arm_north():
    assert SumoEnv._lane_to_arm("north_lane_0") == "N"


def test_lane_to_arm_south():
    assert SumoEnv._lane_to_arm("south_entry_1") == "S"


def test_lane_to_arm_east():
    assert SumoEnv._lane_to_arm("east_road_2") == "E"


def test_lane_to_arm_west():
    assert SumoEnv._lane_to_arm("west_main_0") == "W"


def test_lane_to_arm_intersection():
    assert SumoEnv._lane_to_arm(":center_junction_0") == "intersection"


def test_lane_to_arm_unknown():
    assert SumoEnv._lane_to_arm("some_random_lane") == "unknown"


def test_sumo_env_init():
    env = make_env()
    assert env.net_file == "test.net.xml"
    assert env.step_length == 0.5
    assert env._step_count == 0
    assert env._process is None


def test_start_connects_traci():
    """Verify SumoEnv.start() wires up traci without a real SUMO install."""
    import sys
    fake_traci = MagicMock()
    sys.modules["traci"] = fake_traci

    env = make_env()
    with patch("backend.simulation.sumo_env._find_sumo_home", return_value="/fake/sumo"), \
         patch("subprocess.Popen") as mock_popen, \
         patch("time.sleep"), \
         patch("os.path.isfile", return_value=False):
        mock_popen.return_value = MagicMock()
        env.start(port=18813)

    assert env._traci is fake_traci
    fake_traci.init.assert_called_once_with(port=18813)
    assert env._step_count == 0


def test_stop_safe_without_start():
    env = make_env()
    env.stop()  # should not raise


def test_find_sumo_home_from_env(monkeypatch, tmp_path):
    monkeypatch.setenv("SUMO_HOME", str(tmp_path))
    from backend.simulation.sumo_env import _find_sumo_home
    assert _find_sumo_home() == str(tmp_path)
