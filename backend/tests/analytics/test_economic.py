"""
Tests for EconomicCalculator (backend/analytics/economic.py).
"""
import pytest

from backend.analytics.economic import EconomicCalculator, EconomicSummary, format_economic_summary
from backend.analytics.metrics import EpisodeMetrics, VehicleMetrics, ArmMetrics


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def make_arm(arm: str) -> ArmMetrics:
    return ArmMetrics(
        arm=arm,
        queue_len=5.0,
        avg_wait_s=30.0,
        flow_rate_vph=500.0,
        heavy_vehicle_ratio=0.1,
        green_time_used_s=25.0,
        green_time_total_s=30.0,
    )


def make_baseline() -> EpisodeMetrics:
    return EpisodeMetrics(
        episode_id="ep_baseline",
        session_id="sess_1",
        duration_s=3600,
        n_vehicles=500,
        avg_wait_s=60.0,
        per_type={
            "car": VehicleMetrics("car", 300, 65.0, 5.0, 800.0),
            "two_wheeler": VehicleMetrics("two_wheeler", 150, 55.0, 3.0, 400.0),
            "tsrtc_bus": VehicleMetrics("tsrtc_bus", 50, 70.0, 8.0, 100.0),
        },
        per_arm={arm: make_arm(arm) for arm in ["N", "S", "E", "W"]},
        throughput_vph=500.0,
        green_utilisation=0.7,
        collision_count=2,
        violation_count=5,
        signal_efficiency=0.28,
        avg_phase_duration_s=30.0,
        adverse_events_count=7,
        total_delay_veh_hrs=8.3,
    )


def make_rl() -> EpisodeMetrics:
    return EpisodeMetrics(
        episode_id="ep_rl",
        session_id="sess_1",
        duration_s=3600,
        n_vehicles=550,
        avg_wait_s=38.0,
        per_type={
            "car": VehicleMetrics("car", 320, 40.0, 4.0, 900.0),
            "two_wheeler": VehicleMetrics("two_wheeler", 170, 33.0, 2.5, 450.0),
            "tsrtc_bus": VehicleMetrics("tsrtc_bus", 60, 44.0, 6.0, 120.0),
        },
        per_arm={arm: make_arm(arm) for arm in ["N", "S", "E", "W"]},
        throughput_vph=550.0,
        green_utilisation=0.85,
        collision_count=0,
        violation_count=2,
        signal_efficiency=0.31,
        avg_phase_duration_s=28.0,
        adverse_events_count=4,
        total_delay_veh_hrs=5.8,
    )


@pytest.fixture
def calculator() -> EconomicCalculator:
    return EconomicCalculator()


@pytest.fixture
def summary(calculator) -> EconomicSummary:
    return calculator.compute(
        session_id="sess_1",
        baseline_metrics=make_baseline(),
        rl_metrics=make_rl(),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_compute_returns_summary(calculator):
    """compute() must return an EconomicSummary instance."""
    result = calculator.compute(
        session_id="sess_1",
        baseline_metrics=make_baseline(),
        rl_metrics=make_rl(),
    )
    assert isinstance(result, EconomicSummary)


def test_wait_reduction_positive(summary):
    """RL beats baseline → per-vehicle wait_reduction_s must be > 0."""
    assert summary.wait_reduction_s > 0.0


def test_fuel_saved_positive(summary):
    """Total fuel saved must be positive when RL reduces wait times."""
    assert summary.total_fuel_saved_l > 0.0


def test_co2_avoided_positive(summary):
    """CO2 avoided must be positive; tonne conversion must be exact /1000."""
    assert summary.total_co2_avoided_kg > 0.0
    assert summary.total_co2_avoided_tonne == pytest.approx(
        summary.total_co2_avoided_kg / 1000.0
    )


def test_fuel_cost_saved_positive(summary):
    """Fuel cost saved in INR must be positive."""
    assert summary.total_fuel_cost_saved_inr > 0.0


def test_time_value_saved_positive(summary):
    """Time value saved in INR must be positive."""
    assert summary.total_time_value_saved_inr > 0.0


def test_carbon_credit_formula(summary):
    """carbon_credit_value_inr == total_co2_avoided_tonne * 2000."""
    assert summary.carbon_credit_value_inr == pytest.approx(
        summary.total_co2_avoided_tonne * 2000.0
    )


def test_city_projection_scales(summary):
    """City daily saving must exceed single-episode total (650 intersections > 1)."""
    assert summary.city_daily_saving_inr > summary.total_saving_inr


def test_per_type_keys(summary):
    """per_type dict must contain exactly the vehicle types from RL metrics."""
    assert "car" in summary.per_type
    assert "two_wheeler" in summary.per_type
    assert "tsrtc_bus" in summary.per_type


def test_format_summary_has_rupee_symbol(summary):
    """format_economic_summary output must contain at least one ₹ symbol."""
    formatted = format_economic_summary(summary)
    all_values = " ".join(str(v) for v in formatted.values())
    assert "₹" in all_values


def test_zero_wait_reduction_no_crash(calculator):
    """When baseline and RL have the same avg_wait_s, no exception; savings == 0."""
    baseline = make_baseline()
    rl = make_rl()
    # Patch RL wait to match baseline exactly
    rl.avg_wait_s = baseline.avg_wait_s
    # Also patch per_type waits so per-type savings are also zero
    for type_id, vm in rl.per_type.items():
        if type_id in baseline.per_type:
            baseline_wait = baseline.per_type[type_id].avg_wait_s
        else:
            baseline_wait = baseline.avg_wait_s
        # Override rl per_type with matching wait
        rl.per_type[type_id] = VehicleMetrics(
            vm.type_id, vm.count, baseline_wait, vm.avg_queue_len, vm.throughput_vph
        )

    result = calculator.compute(
        session_id="sess_zero",
        baseline_metrics=baseline,
        rl_metrics=rl,
    )
    assert isinstance(result, EconomicSummary)
    assert result.total_fuel_saved_l == pytest.approx(0.0)
    assert result.total_co2_avoided_kg == pytest.approx(0.0)
    assert result.total_fuel_cost_saved_inr == pytest.approx(0.0)
    assert result.total_time_value_saved_inr == pytest.approx(0.0)
    assert result.total_saving_inr == pytest.approx(0.0)
