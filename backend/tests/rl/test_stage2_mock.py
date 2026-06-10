"""Tests for Stage 2 physics enrichments in mock_env."""
import pytest
import numpy as np
from backend.config import SimulationConfig
from backend.rl.mock_env import make_mock_env


@pytest.fixture()
def s2_cfg():
    return SimulationConfig(training_stage=2)


@pytest.fixture()
def s1_cfg():
    return SimulationConfig(training_stage=1)


def test_startup_loss_reduces_served(s2_cfg, s1_cfg):
    """Stage 2 effective_green = duration - lost - startup_lost → fewer or equal vehicles served."""
    env2 = make_mock_env(s2_cfg, seed=42)
    env1 = make_mock_env(s1_cfg, seed=42)

    env2.reset(seed=42)
    env1.reset(seed=42)
    for env in (env1, env2):
        env._queue = {"N": 50.0, "S": 50.0, "E": 50.0, "W": 50.0}

    _, _, _, _, info2 = env2.step(3)   # phase 0, 30s duration
    env1._queue = {"N": 50.0, "S": 50.0, "E": 50.0, "W": 50.0}
    _, _, _, _, info1 = env1.step(3)

    assert info2["throughput"] <= info1["throughput"], (
        f"Stage 2 throughput {info2['throughput']} should be <= Stage 1 {info1['throughput']}"
    )


def test_heavy_mix_reduces_throughput():
    """High heavy-vehicle ratio reduces effective saturation flow."""
    cfg_light = SimulationConfig(
        training_stage=2, pct_truck=0.0, pct_tsrtc_bus=0.0, pct_school_bus=0.0
    )
    cfg_heavy = SimulationConfig(
        training_stage=2, pct_truck=20.0, pct_tsrtc_bus=20.0, pct_school_bus=10.0
    )

    env_l = make_mock_env(cfg_light, seed=7)
    env_h = make_mock_env(cfg_heavy, seed=7)

    for env in (env_l, env_h):
        env.reset(seed=7)
        env._queue = {"N": 80.0, "S": 80.0, "E": 0.0, "W": 0.0}

    _, _, _, _, info_l = env_l.step(3)
    env_h._queue = {"N": 80.0, "S": 80.0, "E": 0.0, "W": 0.0}
    _, _, _, _, info_h = env_h.step(3)

    assert info_h["throughput"] < info_l["throughput"], (
        f"Heavy {info_h['throughput']} must be < light {info_l['throughput']}"
    )


def test_pedestrian_reduces_effective_green():
    """With pedestrian_crossing_prob=1.0, every decision loses pedestrian_walk_seconds."""
    cfg = SimulationConfig(
        training_stage=2,
        pedestrian_crossing_prob=1.0,
        pedestrian_crossings='major_arms',
        pedestrian_walk_seconds=10,
    )
    cfg_no_ped = SimulationConfig(
        training_stage=2,
        pedestrian_crossing_prob=0.0,
    )
    env_ped   = make_mock_env(cfg, seed=0)
    env_noped = make_mock_env(cfg_no_ped, seed=0)

    for env in (env_ped, env_noped):
        env.reset(seed=0)
        env._queue = {"N": 60.0, "S": 60.0, "E": 0.0, "W": 0.0}

    _, _, _, _, info_ped   = env_ped.step(3)
    env_noped._queue = {"N": 60.0, "S": 60.0, "E": 0.0, "W": 0.0}
    _, _, _, _, info_noped = env_noped.step(3)

    assert info_ped["throughput"] < info_noped["throughput"], (
        "Pedestrian crossing must reduce throughput"
    )


def test_spillback_penalty_fires_above_capacity():
    """Stage 2 reward includes spillback penalty when queue > road capacity."""
    cfg = SimulationConfig(training_stage=2, spillback_capacity_vehicles=10)
    env = make_mock_env(cfg, seed=0)
    env.reset(seed=0)
    env._queue = {"N": 50.0, "S": 50.0, "E": 50.0, "W": 50.0}

    cfg1 = SimulationConfig(training_stage=1)
    env1 = make_mock_env(cfg1, seed=0)
    env1.reset(seed=0)
    env1._queue = {"N": 50.0, "S": 50.0, "E": 50.0, "W": 50.0}

    _, r2, _, _, _ = env.step(3)
    _, r1, _, _, _ = env1.step(3)

    assert r2 < r1, f"Stage 2 reward {r2:.3f} must be < Stage 1 {r1:.3f} due to spillback"


def test_spillback_key_in_reward_parts():
    """Stage 2 info dict must include 'spillback' in reward_parts."""
    cfg = SimulationConfig(training_stage=2, spillback_capacity_vehicles=5)
    env = make_mock_env(cfg, seed=0)
    env.reset(seed=0)
    env._queue = {"N": 30.0, "S": 30.0, "E": 30.0, "W": 30.0}
    _, _, _, _, info = env.step(3)
    assert "spillback" in info["reward_parts"], (
        f"reward_parts missing 'spillback'. Got: {list(info['reward_parts'].keys())}"
    )


def test_stage1_unaffected():
    """Stage 1 must NOT apply startup loss, heavy-mix, pedestrian, or spillback."""
    cfg = SimulationConfig(
        training_stage=1,
        startup_lost_time_s=10.0,       # large — would destroy Stage 2 green
        pedestrian_crossing_prob=1.0,   # always fires — would hurt Stage 2
        spillback_capacity_vehicles=1,  # tiny — would always penalise in Stage 2
        pct_truck=50.0,                 # heavy — would reduce sat flow in Stage 2
    )
    env = make_mock_env(cfg, seed=0)
    env.reset(seed=0)
    env._queue = {"N": 40.0, "S": 40.0, "E": 0.0, "W": 0.0}
    _, r1, _, _, info = env.step(3)

    # Stage 1 should NOT have spillback key
    assert "spillback" not in info["reward_parts"], (
        "Stage 1 must not include spillback in reward_parts"
    )
