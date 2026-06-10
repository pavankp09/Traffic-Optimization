"""
E2E smoke test — verifies all major modules import and initialise correctly.
No SUMO, no real training — just import chains and Flask test client.
"""
import pytest


def test_config_imports():
    from backend.config import (
        DEFAULT_SIM_CONFIG, DEFAULT_ADVERSE_CONFIG, APP_CONFIG, SimulationConfig,
    )
    assert DEFAULT_SIM_CONFIG.traffic_volume_vph > 0
    assert DEFAULT_ADVERSE_CONFIG.collision_probability >= 0
    assert APP_CONFIG.petrol_price_inr_per_l == 106.0
    assert isinstance(DEFAULT_SIM_CONFIG, SimulationConfig)


def test_vehicle_types_loaded():
    from backend.simulation.vehicle_types import VEHICLE_TYPES, get_profile
    assert len(VEHICLE_TYPES) == 10
    car = get_profile("car")
    assert car.idle_fuel_l_per_hr > 0


def test_db_models_init(tmp_path):
    from backend.db.models import init_db, TrainingSession
    db_url = f"sqlite:///{tmp_path / 'test.db'}"
    init_db(db_url)  # should not raise


def test_baseline_agent_predict():
    import numpy as np
    from backend.rl.baseline_agent import make_baseline
    obs = np.zeros(22, dtype=np.float32)
    for ctrl_type in ("fixed_time", "websters", "semi_actuated"):
        ctrl = make_baseline(ctrl_type)
        action, info = ctrl.predict(obs)
        assert 0 <= action <= 34
        assert "phase" in info


def test_metrics_calculator_basic():
    from backend.analytics.metrics import MetricsCalculator
    calc = MetricsCalculator()
    frames = [
        {
            "vehicles": [
                {"id": f"v{i}", "type_id": "car", "x": float(i), "y": 0.0,
                 "speed": 0.0, "wait_time": 10.0, "lane": "l0", "arm": "N"}
                for i in range(5)
            ],
            "signals": [{"tl_id": "J0", "phase": 0, "elapsed_s": 10.0}],
            "step": 0, "sim_time_s": 10.0,
        }
    ]
    result = calc.compute_episode_metrics("ep1", "sess1", frames, [], [])
    assert result.n_vehicles == 5
    assert result.avg_wait_s >= 0


def test_economic_calculator_basic():
    from backend.analytics.metrics import EpisodeMetrics, ArmMetrics, VehicleMetrics
    from backend.analytics.economic import EconomicCalculator

    def arm(a: str) -> ArmMetrics:
        return ArmMetrics(a, 5.0, 30.0, 500.0, 0.1, 25.0, 30.0)

    baseline = EpisodeMetrics(
        "ep_b", "s1", 3600, 100, 60.0,
        {"car": VehicleMetrics("car", 100, 65.0, 5.0, 800.0)},
        {a: arm(a) for a in "NSEW"}, 800.0, 0.7, 2, 5, 0.28, 30.0, 7, 8.3,
    )
    rl = EpisodeMetrics(
        "ep_r", "s1", 3600, 110, 38.0,
        {"car": VehicleMetrics("car", 110, 40.0, 4.0, 900.0)},
        {a: arm(a) for a in "NSEW"}, 900.0, 0.85, 0, 2, 0.31, 28.0, 4, 5.8,
    )
    calc = EconomicCalculator()
    summary = calc.compute("s1", baseline, rl)
    assert summary.wait_reduction_s > 0
    assert summary.total_fuel_saved_l >= 0


def test_insight_generator_milestones():
    from backend.analytics.metrics import EpisodeMetrics, ArmMetrics, VehicleMetrics
    from backend.analytics.insight_generator import InsightGenerator

    def arm(a: str) -> ArmMetrics:
        return ArmMetrics(a, 3.0, 20.0, 400.0, 0.05, 20.0, 25.0)

    gen = InsightGenerator("sess_smoke", baseline_avg_wait_s=60.0)
    metrics = EpisodeMetrics(
        "ep1", "sess_smoke", 3600, 50, 50.0, {},
        {a: arm(a) for a in "NSEW"}, 600.0, 0.75, 0, 1, 0.33, 30.0, 2, 4.0,
    )
    cards = gen.check_episode(1, metrics, -30.0)
    # Episode 1 should trigger "Training started" card
    assert any(c["episode_number"] == 1 for c in cards)


def test_config_presets_loaded():
    from backend.config_presets import ALL_PRESETS, list_presets, get_preset
    assert len(ALL_PRESETS) >= 30
    summaries = list_presets()
    assert any(p["id"] == "hyd_rush_am" for p in summaries)
    preset = get_preset("hyd_rush_am")
    assert preset is not None
    assert preset.sim_config.get("traffic_volume_vph", preset.sim_config.get("total_vph", 0)) > 0


def test_flask_app_creates():
    from backend.app import create_app
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    assert app is not None
    with app.test_client() as client:
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.get_json()
        assert data["success"] is True


def test_report_generator_html():
    from backend.analytics.metrics import EpisodeMetrics, ArmMetrics, VehicleMetrics
    from backend.analytics.economic import EconomicCalculator
    from backend.analytics.report_generator import ReportGenerator

    def arm(a: str) -> ArmMetrics:
        return ArmMetrics(a, 5.0, 30.0, 500.0, 0.1, 25.0, 30.0)

    baseline = EpisodeMetrics(
        "ep_b", "s2", 3600, 100, 60.0,
        {"car": VehicleMetrics("car", 100, 65.0, 5.0, 800.0)},
        {a: arm(a) for a in "NSEW"}, 800.0, 0.7, 2, 5, 0.28, 30.0, 7, 8.3,
    )
    rl = EpisodeMetrics(
        "ep_r", "s2", 3600, 110, 38.0,
        {"car": VehicleMetrics("car", 110, 40.0, 4.0, 900.0)},
        {a: arm(a) for a in "NSEW"}, 900.0, 0.85, 0, 2, 0.31, 28.0, 4, 5.8,
    )
    economic = EconomicCalculator().compute("s2", baseline, rl)
    rg = ReportGenerator()
    data = rg.build_report_data("s2", "Test Junction", baseline, [rl], economic, [-30.0, -25.0])
    html = rg.render_html(data)
    assert "Executive Summary" in html
    assert "Economic Impact" in html
