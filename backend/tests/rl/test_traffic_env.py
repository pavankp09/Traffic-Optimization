"""Tests for TrafficEnv — mocks SUMO so no installation required."""
import numpy as np
import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from backend.config import SimulationConfig, AdverseConfig
from backend.rl.traffic_env import TrafficEnv, action_to_phase_duration, N_ACTIONS


def test_action_decode_first():
    phase, dur = action_to_phase_duration(0)
    assert phase == 0
    assert dur == 15.0


def test_action_decode_last():
    phase, dur = action_to_phase_duration(N_ACTIONS - 1)
    assert phase == 4
    assert dur == 60.0


def test_action_decode_middle():
    phase, dur = action_to_phase_duration(7)
    assert phase == 1
    assert dur == 15.0


def test_observation_space():
    env = TrafficEnv(SimulationConfig())
    assert env.observation_space.shape == (22,)
    assert env.action_space.n == 35


def test_action_space_sample_valid():
    env = TrafficEnv(SimulationConfig())
    a = env.action_space.sample()
    assert 0 <= a < 35


def test_compute_reward_no_events():
    env = TrafficEnv(SimulationConfig())
    from backend.simulation.sumo_env import SimFrame
    frame = SimFrame(
        step=1, sim_time=10.0, vehicles=[], signals=[],
        queue_per_lane={}, wait_per_lane={}, throughput_this_step=5, collision_ids=[],
    )
    r = env._compute_reward(frame, 0, [])
    assert isinstance(r, float)
    assert r >= 0  # flow_efficiency=5/(5*0.5)=2.0, reward=3.0*2.0=6.0 with no penalties


def test_compute_reward_collision_penalty():
    from backend.simulation.adverse_injector import AdverseEvent
    env = TrafficEnv(SimulationConfig())
    from backend.simulation.sumo_env import SimFrame
    frame = SimFrame(step=1, sim_time=10.0, vehicles=[], signals=[],
                     queue_per_lane={}, wait_per_lane={}, throughput_this_step=0, collision_ids=[])
    event = AdverseEvent(event_type="collision", severity="high", location="N", duration_s=60.0)
    r_no_collision = env._compute_reward(frame, 0, [])
    r_with_collision = env._compute_reward(frame, 0, [event])
    assert r_with_collision < r_no_collision


def test_n_actions():
    assert N_ACTIONS == 35


def test_phase_to_arm_mapping():
    from backend.rl.traffic_env import PHASE_TO_ARM
    assert PHASE_TO_ARM[0] == "N"
    assert PHASE_TO_ARM[1] == "S"
    assert PHASE_TO_ARM[2] == "E"
    assert PHASE_TO_ARM[3] == "W"
    assert PHASE_TO_ARM[4] is None


def test_arm_last_green_init():
    env = TrafficEnv(SimulationConfig())
    assert set(env._arm_last_green.keys()) == {"N", "S", "E", "W"}
    assert all(v == 0 for v in env._arm_last_green.values())


def test_baseline_wait_stored():
    env = TrafficEnv(SimulationConfig(), baseline_wait=8.8)
    assert env._baseline_wait == 8.8


def test_baseline_wait_default_zero():
    env = TrafficEnv(SimulationConfig())
    assert env._baseline_wait == 0.0


# ---------------------------------------------------------------------------
# Helpers shared by reward component tests
# ---------------------------------------------------------------------------

def _make_frame(throughput=0, vehicles=None):
    from backend.simulation.sumo_env import SimFrame
    return SimFrame(
        step=1, sim_time=5.0, vehicles=vehicles or [], signals=[],
        queue_per_lane={}, wait_per_lane={},
        throughput_this_step=throughput, collision_ids=[],
    )


def _make_vehicle(arm="N", waiting=False, wait_time=0.0):
    v = MagicMock()
    v.arm = arm
    v.waiting = waiting
    v.wait_time = wait_time
    return v


def test_flow_efficiency_increases_reward_with_throughput():
    """Higher throughput on the same green phase yields higher reward."""
    env = TrafficEnv(SimulationConfig())
    frame_low = _make_frame(throughput=1)
    frame_high = _make_frame(throughput=10)
    r_low = env._compute_reward(frame_low, 0, [], num_changes=0)
    r_high = env._compute_reward(frame_high, 0, [], num_changes=0)
    assert r_high > r_low, "Higher throughput must yield higher reward"


def test_pressure_penalty_applied_when_red_queues_exceed_green():
    """Reward is lower when red arms have larger queues than the active arm."""
    env = TrafficEnv(SimulationConfig())
    vehicles_balanced = [_make_vehicle("N", waiting=True)] * 5 + \
                        [_make_vehicle("S", waiting=True)] * 5
    vehicles_imbalanced = [_make_vehicle("N", waiting=True)] * 1 + \
                          [_make_vehicle("S", waiting=True)] * 15 + \
                          [_make_vehicle("E", waiting=True)] * 10
    frame_bal = _make_frame(throughput=3, vehicles=vehicles_balanced)
    frame_imbal = _make_frame(throughput=3, vehicles=vehicles_imbalanced)
    r_bal = env._compute_reward(frame_bal, 0, [], num_changes=0)
    r_imbal = env._compute_reward(frame_imbal, 0, [], num_changes=0)
    assert r_imbal < r_bal, "Large red-arm queues vs small green-arm queue must reduce reward"


def test_starvation_penalty_fires_when_arm_neglected():
    """Reward is lower when an arm with a queue has been starved beyond threshold."""
    cfg = SimulationConfig()
    env_normal = TrafficEnv(cfg)
    env_starved = TrafficEnv(cfg)
    env_starved._arm_last_green["S"] = cfg.starvation_threshold_steps + 1
    vehicles = [_make_vehicle("S", waiting=True)] * 5
    frame = _make_frame(throughput=2, vehicles=vehicles)
    r_normal = env_normal._compute_reward(frame, 0, [], num_changes=0)
    r_starved = env_starved._compute_reward(frame, 0, [], num_changes=0)
    assert r_starved < r_normal, "Starvation beyond threshold must reduce reward"


def test_baseline_bonus_positive_when_wait_below_baseline():
    """Agent beating baseline wait time earns a positive bonus."""
    env = TrafficEnv(SimulationConfig(), baseline_wait=20.0)
    vehicles = [_make_vehicle("N", waiting=True, wait_time=5.0)]
    frame = _make_frame(throughput=3, vehicles=vehicles)
    r = env._compute_reward(frame, 0, [], num_changes=0)
    env_no_bl = TrafficEnv(SimulationConfig(), baseline_wait=0.0)
    r_no_bl = env_no_bl._compute_reward(frame, 0, [], num_changes=0)
    assert r > r_no_bl, "Beating baseline wait must add a positive bonus"


def test_switch_penalty_reduces_reward_on_phase_change():
    """Changing phase (num_changes=1) yields lower reward than staying (num_changes=0)."""
    env = TrafficEnv(SimulationConfig())
    frame = _make_frame(throughput=3)
    r_no_switch = env._compute_reward(frame, 0, [], num_changes=0)
    r_switch = env._compute_reward(frame, 0, [], num_changes=1)
    assert r_switch < r_no_switch, "Phase change must reduce reward by switch penalty"


def test_compute_reward_positional_only_still_works():
    """Old call site _compute_reward(frame, phase, events) must not break."""
    env = TrafficEnv(SimulationConfig())
    frame = _make_frame(throughput=5)
    r = env._compute_reward(frame, 0, [])
    assert isinstance(r, float)


def test_arm_last_green_increments_for_non_active_arm():
    """After one step with phase=0 (arm N), arms S/E/W should increment."""
    from backend.rl.traffic_env import PHASE_TO_ARM
    from backend.simulation.sumo_env import SimFrame

    env = TrafficEnv(SimulationConfig())

    mock_frame = SimFrame(
        step=1, sim_time=5.0, vehicles=[], signals=[],
        queue_per_lane={}, wait_per_lane={}, throughput_this_step=0, collision_ids=[],
    )
    mock_sumo = MagicMock()
    mock_sumo.step.return_value = mock_frame
    mock_state_extractor = MagicMock()
    mock_state_extractor.extract.return_value = (
        np.zeros(22, dtype=np.float32), {}
    )
    mock_adverse = MagicMock()
    mock_adverse.tick.return_value = []
    mock_adverse.severity = 0.0

    env._sumo = mock_sumo
    env._state_extractor = mock_state_extractor
    env._adverse = mock_adverse
    env._total_steps = 100
    env._arm_last_green = {"N": 0, "S": 0, "E": 0, "W": 0}

    # action=0 → phase=0 (arm N), duration=15s
    env.step(0)

    # N was active: counter stays 0; others increment by action_freq steps
    assert env._arm_last_green["N"] == 0
    assert env._arm_last_green["S"] > 0
    assert env._arm_last_green["E"] > 0
    assert env._arm_last_green["W"] > 0


def test_mock_env_reward_parts_in_info():
    from backend.rl.mock_env import make_mock_env, OBS_LABELS
    from backend.config import SimulationConfig
    env = make_mock_env(SimulationConfig(), seed=0)
    env.reset()
    _, _, _, _, info = env.step(0)
    assert "reward_parts" in info, "info must contain reward_parts"
    parts = info["reward_parts"]
    for key in ["delta_queue", "flow_eff", "switch", "imbalance", "starvation", "baseline_gap", "all_red"]:
        assert key in parts, f"reward_parts missing key: {key}"
        assert isinstance(parts[key], float), f"{key} must be float"

def test_obs_labels_length():
    from backend.rl.mock_env import OBS_LABELS
    assert len(OBS_LABELS) == 26, f"Expected 26 labels, got {len(OBS_LABELS)}"
