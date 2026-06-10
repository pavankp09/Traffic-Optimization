"""API tests for compare endpoints (legacy pair + ids multi-compare)."""
from __future__ import annotations

from backend.app import create_app
from backend.api.routes import _get_store
from backend.config import SimulationConfig, AdverseConfig
from backend.analytics.metrics import EpisodeMetrics


def _episode_metrics(session_id: str, avg_wait_s: float, throughput_vph: float, collisions: int, violations: int) -> EpisodeMetrics:
    return EpisodeMetrics(
        episode_id="ep",
        session_id=session_id,
        duration_s=3600,
        n_vehicles=int(max(throughput_vph, 1)),
        avg_wait_s=avg_wait_s,
        per_type={},
        per_arm={},
        throughput_vph=throughput_vph,
        green_utilisation=0.82,
        collision_count=collisions,
        violation_count=violations,
        signal_efficiency=throughput_vph / 1800.0,
        avg_phase_duration_s=30.0,
        adverse_events_count=collisions + violations,
        total_delay_veh_hrs=(avg_wait_s * max(throughput_vph, 1.0)) / 3600.0,
    )


def _seed_two_sessions():
    store = _get_store()
    sim_a = SimulationConfig()
    sim_b = SimulationConfig(traffic_volume_vph=max(sim_a.traffic_volume_vph + 200, 200))
    adverse = AdverseConfig()

    store.create_session("cmp_a", sim_a, adverse)
    store.create_session("cmp_b", sim_b, adverse)

    store.save_episode("cmp_a", 1, _episode_metrics("cmp_a", avg_wait_s=72.0, throughput_vph=520.0, collisions=2, violations=5), reward=120.0)
    store.save_episode("cmp_a", 2, _episode_metrics("cmp_a", avg_wait_s=64.0, throughput_vph=560.0, collisions=1, violations=3), reward=145.0)

    store.save_episode("cmp_b", 1, _episode_metrics("cmp_b", avg_wait_s=54.0, throughput_vph=640.0, collisions=0, violations=2), reward=180.0)
    store.save_episode("cmp_b", 2, _episode_metrics("cmp_b", avg_wait_s=48.0, throughput_vph=680.0, collisions=0, violations=1), reward=210.0)

    store.update_session_status("cmp_a", "completed", total_episodes=2, best_reward=145.0)
    store.update_session_status("cmp_b", "completed", total_episodes=2, best_reward=210.0)


def test_compare_ids_returns_rich_rows():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    with app.app_context():
        _seed_two_sessions()

    with app.test_client() as client:
        res = client.get("/api/compare?ids=cmp_a,cmp_b")
        assert res.status_code == 200
        data = res.get_json()
        assert isinstance(data, list)
        assert len(data) == 2
        assert {"sim_id", "throughput", "avg_wait", "scores", "incident_rate_per_1k"}.issubset(data[0].keys())


def test_compare_pair_still_supported():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    with app.app_context():
        _seed_two_sessions()

    with app.test_client() as client:
        res = client.get("/api/compare?session_a=cmp_a&session_b=cmp_b")
        assert res.status_code == 200
        payload = res.get_json()
        assert payload["success"] is True
        assert payload["data"]["session_a"]["session_id"] == "cmp_a"
        assert payload["data"]["session_b"]["session_id"] == "cmp_b"

