"""
Tests for backend.analytics.metrics — MetricsCalculator and helpers.

All tests use synthetic data; no SUMO or database required.
"""
import pytest
from backend.analytics.metrics import (
    MetricsCalculator,
    EpisodeMetrics,
    VehicleMetrics,
    ArmMetrics,
    aggregate_session_metrics,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_frames(n_frames: int = 10, n_vehicles: int = 20) -> list:
    """Build synthetic frame dicts for testing."""
    frames = []
    for step in range(n_frames):
        vehicles = []
        for i in range(n_vehicles):
            vehicles.append({
                "id": f"veh_{i}",
                "type_id": ["car", "two_wheeler", "tsrtc_bus"][i % 3],
                "x": float(i * 5),
                "y": float(step),
                "speed": 0.0 if i % 3 == 0 else 5.0,  # 1/3 queued
                "wait_time": float(i * 2 + step),
                "lane": f"lane_{i}",
                "arm": ["N", "S", "E", "W"][i % 4],
            })
        frames.append({
            "vehicles": vehicles,
            "signals": [{"tl_id": "J0", "phase": step % 5, "elapsed_s": 15.0}],
            "step": step,
            "sim_time_s": float(step * 10),
        })
    return frames


def make_phase_log(n_phases: int = 5, duration_s: int = 30) -> list:
    return [{"phase": i, "duration_s": duration_s, "step": i * duration_s} for i in range(n_phases)]


def make_calculator() -> MetricsCalculator:
    """Return a MetricsCalculator with a minimal stub vehicle_types dict."""
    vehicle_types = {
        "car": None,
        "two_wheeler": None,
        "tsrtc_bus": None,
    }
    return MetricsCalculator(vehicle_types=vehicle_types)


def make_episode(
    episode_id: str = "ep_1",
    session_id: str = "sess_1",
    avg_wait_s: float = 30.0,
    throughput_vph: float = 600.0,
    green_utilisation: float = 0.7,
    collision_count: int = 2,
    violation_count: int = 3,
    total_delay_veh_hrs: float = 5.0,
) -> EpisodeMetrics:
    """Build a minimal EpisodeMetrics for delta / aggregate tests."""
    return EpisodeMetrics(
        episode_id=episode_id,
        session_id=session_id,
        duration_s=3600,
        n_vehicles=600,
        avg_wait_s=avg_wait_s,
        per_type={},
        per_arm={},
        throughput_vph=throughput_vph,
        green_utilisation=green_utilisation,
        collision_count=collision_count,
        violation_count=violation_count,
        signal_efficiency=throughput_vph / 1800.0,
        avg_phase_duration_s=30.0,
        adverse_events_count=collision_count + violation_count,
        total_delay_veh_hrs=total_delay_veh_hrs,
    )


# ---------------------------------------------------------------------------
# Test 1: returns EpisodeMetrics dataclass
# ---------------------------------------------------------------------------

def test_compute_episode_metrics_returns_dataclass():
    calc = make_calculator()
    frames = make_frames()
    result = calc.compute_episode_metrics("ep_1", "sess_1", frames, make_phase_log(), [])
    assert isinstance(result, EpisodeMetrics), "Expected EpisodeMetrics instance"


# ---------------------------------------------------------------------------
# Test 2: n_vehicles counts unique vehicle IDs
# ---------------------------------------------------------------------------

def test_n_vehicles_unique():
    calc = make_calculator()
    frames = make_frames(n_frames=10, n_vehicles=20)
    result = calc.compute_episode_metrics("ep_1", "sess_1", frames, make_phase_log(), [])
    assert result.n_vehicles == 20, (
        f"Expected 20 unique vehicles across 10 frames, got {result.n_vehicles}"
    )


# ---------------------------------------------------------------------------
# Test 3: throughput_vph is positive
# ---------------------------------------------------------------------------

def test_throughput_vph_positive():
    calc = make_calculator()
    frames = make_frames()
    result = calc.compute_episode_metrics("ep_1", "sess_1", frames, make_phase_log(), [])
    assert result.throughput_vph > 0, "throughput_vph should be positive"


# ---------------------------------------------------------------------------
# Test 4: per_type has expected vehicle type keys
# ---------------------------------------------------------------------------

def test_per_type_keys_present():
    calc = make_calculator()
    frames = make_frames()
    result = calc.compute_episode_metrics("ep_1", "sess_1", frames, make_phase_log(), [])
    for expected_key in ("car", "two_wheeler", "tsrtc_bus"):
        assert expected_key in result.per_type, (
            f"Expected type key '{expected_key}' in per_type, got keys: {list(result.per_type)}"
        )


# ---------------------------------------------------------------------------
# Test 5: per_arm covers all four arms
# ---------------------------------------------------------------------------

def test_per_arm_covers_four_arms():
    calc = make_calculator()
    frames = make_frames()
    result = calc.compute_episode_metrics("ep_1", "sess_1", frames, make_phase_log(), [])
    for arm in ("N", "S", "E", "W"):
        assert arm in result.per_arm, (
            f"Expected arm '{arm}' in per_arm, got keys: {list(result.per_arm)}"
        )


# ---------------------------------------------------------------------------
# Test 6: green_utilisation is bounded [0, 1]
# ---------------------------------------------------------------------------

def test_green_utilisation_bounded():
    calc = make_calculator()
    frames = make_frames()
    result = calc.compute_episode_metrics("ep_1", "sess_1", frames, make_phase_log(), [])
    assert 0.0 <= result.green_utilisation <= 1.0, (
        f"green_utilisation out of range: {result.green_utilisation}"
    )


# ---------------------------------------------------------------------------
# Test 7: collision_count from adverse events
# ---------------------------------------------------------------------------

def test_collision_count_from_adverse():
    calc = make_calculator()
    frames = make_frames()
    adverse = [
        {"event_type": "collision", "severity": 0.9},
        {"event_type": "rear_end", "severity": 0.5},
        {"event_type": "red_light_running", "severity": 0.3},
    ]
    result = calc.compute_episode_metrics("ep_1", "sess_1", frames, make_phase_log(), adverse)
    assert result.collision_count == 2, (
        f"Expected collision_count=2 (collision + rear_end), got {result.collision_count}"
    )
    assert result.violation_count == 1, (
        f"Expected violation_count=1 (red_light_running), got {result.violation_count}"
    )


# ---------------------------------------------------------------------------
# Test 8: compute_delta positive improvement
# ---------------------------------------------------------------------------

def test_compute_delta_positive_improvement():
    calc = make_calculator()
    baseline = make_episode(
        episode_id="baseline",
        avg_wait_s=40.0,
        throughput_vph=500.0,
        green_utilisation=0.6,
        collision_count=3,
        violation_count=4,
        total_delay_veh_hrs=8.0,
    )
    rl = make_episode(
        episode_id="rl",
        avg_wait_s=25.0,
        throughput_vph=650.0,
        green_utilisation=0.75,
        collision_count=1,
        violation_count=2,
        total_delay_veh_hrs=5.0,
    )
    delta = calc.compute_delta(baseline, rl)

    assert delta["wait_reduction_s"] > 0, "RL should reduce wait time"
    assert delta["throughput_gain_vph"] > 0, "RL should improve throughput"
    assert delta["green_util_improvement"] > 0, "RL should improve green utilisation"
    assert delta["collision_reduction"] > 0, "RL should reduce collisions"
    assert delta["violation_reduction"] > 0, "RL should reduce violations"
    assert delta["efficiency_gain"] > 0, "RL should improve signal efficiency"
    assert delta["delay_reduction_veh_hrs"] > 0, "RL should reduce total delay"


# ---------------------------------------------------------------------------
# Test 9: aggregate_session_metrics returns correct n_episodes
# ---------------------------------------------------------------------------

def test_aggregate_session_metrics():
    episodes = [
        make_episode(episode_id=f"ep_{i}", avg_wait_s=30.0 + i, throughput_vph=600.0 - i * 10)
        for i in range(3)
    ]
    agg = aggregate_session_metrics(episodes)
    assert agg["n_episodes"] == 3, f"Expected n_episodes=3, got {agg['n_episodes']}"
    assert "avg_wait_s" in agg
    assert "best_wait_s" in agg
    assert "avg_throughput_vph" in agg
    assert "total_collisions" in agg
    assert "total_violations" in agg
    assert "avg_signal_efficiency" in agg


# ---------------------------------------------------------------------------
# Test 10: compute_delta wait_reduction_pct formula
# ---------------------------------------------------------------------------

def test_compute_delta_wait_pct():
    calc = make_calculator()
    baseline = make_episode(episode_id="b", avg_wait_s=40.0)
    rl = make_episode(episode_id="r", avg_wait_s=30.0)

    delta = calc.compute_delta(baseline, rl)

    expected_pct = (40.0 - 30.0) / 40.0 * 100.0  # 25.0
    assert abs(delta["wait_reduction_pct"] - expected_pct) < 1e-6, (
        f"Expected wait_reduction_pct={expected_pct}, got {delta['wait_reduction_pct']}"
    )
    assert abs(delta["wait_reduction_s"] - 10.0) < 1e-6, (
        f"Expected wait_reduction_s=10.0, got {delta['wait_reduction_s']}"
    )
