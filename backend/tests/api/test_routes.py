"""API route tests — Task 19.

Tests use Flask test client with an in-memory SQLite database.
Heavy dependencies (SB3, SUMO, WeasyPrint) are not exercised; only the
HTTP contract is verified.
"""
from __future__ import annotations

import json
import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def app():
    """Create a Flask app configured for testing."""
    from backend.app import create_app

    # Minimal test config — override DB so we start clean
    test_config = {
        "TESTING": True,
        "SECRET_KEY": "test-secret",
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    }
    application = create_app(test_config)
    application.config["TESTING"] = True
    yield application


@pytest.fixture
def client(app):
    """Return a Flask test client."""
    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Helper: create a session via API and return its session_id
# ---------------------------------------------------------------------------

def _create_session(client, session_id=None) -> str:
    body: dict = {}
    if session_id:
        body["session_id"] = session_id
    resp = client.post(
        "/api/sessions",
        data=json.dumps(body),
        content_type="application/json",
    )
    assert resp.status_code == 200, f"create_session failed: {resp.data}"
    data = resp.get_json()
    assert data["success"] is True
    return data["data"]["session_id"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["data"]["status"] == "ok"

    def test_health_response_structure(self, client):
        """Verify that all responses carry the success/data/error envelope."""
        resp = client.get("/api/health")
        data = resp.get_json()
        assert "success" in data
        assert "data" in data
        assert "error" in data
        assert data["error"] is None


class TestConfig:
    def test_config_defaults_returns_both_configs(self, client):
        resp = client.get("/api/config/defaults")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        payload = data["data"]
        assert "sim_config" in payload
        assert "adverse_config" in payload

    def test_config_validate_valid(self, client):
        """POST a minimal valid sim_config — should return valid=True."""
        body = {
            "sim_config": {
                "traffic_volume_vph": 900,
                "lanes_per_arm": 3,
                "phase_scheme": "4phase",
            },
            "adverse_config": {},
        }
        resp = client.post(
            "/api/config/validate",
            data=json.dumps(body),
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["data"]["valid"] is True
        assert data["data"]["errors"] == []

    def test_config_validate_invalid(self, client):
        """POST an invalid sim_config (vph=0) — should return valid=False with errors."""
        body = {
            "sim_config": {
                "traffic_volume_vph": 0,
                "lanes_per_arm": 3,
                "phase_scheme": "4phase",
            },
        }
        resp = client.post(
            "/api/config/validate",
            data=json.dumps(body),
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["data"]["valid"] is False
        assert len(data["data"]["errors"]) > 0


class TestPresets:
    def test_presets_returns_list(self, client):
        """GET /api/presets — may be empty if T20 not done, but must return a list."""
        resp = client.get("/api/presets")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert isinstance(data["data"], list)


class TestSessions:
    def test_create_session_returns_id(self, client):
        resp = client.post(
            "/api/sessions",
            data=json.dumps({}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert "session_id" in data["data"]
        assert len(data["data"]["session_id"]) > 0

    def test_create_session_with_explicit_id(self, client):
        sid = "test-explicit-session"
        resp = client.post(
            "/api/sessions",
            data=json.dumps({"session_id": sid}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"]["session_id"] == sid

    def test_get_session_after_create(self, client):
        sid = _create_session(client)
        resp = client.get(f"/api/sessions/{sid}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["data"] is not None

    def test_get_session_not_found(self, client):
        resp = client.get("/api/sessions/nonexistent-session-xyz")
        assert resp.status_code == 404
        data = resp.get_json()
        assert data["success"] is False

    def test_list_sessions(self, client):
        # Create at least one session so list is non-trivial
        _create_session(client)
        resp = client.get("/api/sessions")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert len(data["data"]) >= 1

    def test_delete_session(self, client):
        sid = _create_session(client)
        resp = client.delete(f"/api/sessions/{sid}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["data"]["deleted"] is True

        # Confirm it's gone
        get_resp = client.get(f"/api/sessions/{sid}")
        assert get_resp.status_code == 404


class TestTraining:
    def test_train_starts_background(self, client):
        """POST /train should return status='started' immediately."""
        sid = _create_session(client)
        resp = client.post(
            f"/api/sessions/{sid}/train",
            data=json.dumps({"total_timesteps": 100}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["data"]["status"] == "started"
        assert data["data"]["session_id"] == sid

    def test_session_status_after_train(self, client):
        """After starting training, /status endpoint should return a status field."""
        sid = _create_session(client)
        client.post(
            f"/api/sessions/{sid}/train",
            data=json.dumps({"total_timesteps": 100}),
            content_type="application/json",
        )
        resp = client.get(f"/api/sessions/{sid}/status")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert "status" in data["data"]
        assert "session_id" in data["data"]


class TestEpisodes:
    def test_get_episodes_returns_list(self, client):
        sid = _create_session(client)
        resp = client.get(f"/api/sessions/{sid}/episodes")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert isinstance(data["data"], list)

    def test_get_metrics_returns_dict(self, client):
        sid = _create_session(client)
        resp = client.get(f"/api/sessions/{sid}/metrics")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert isinstance(data["data"], dict)

    def test_get_insights_returns_list(self, client):
        sid = _create_session(client)
        resp = client.get(f"/api/sessions/{sid}/insights")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert isinstance(data["data"], list)


class TestModels:
    def test_list_models(self, client):
        resp = client.get("/api/models")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert isinstance(data["data"], list)

    def test_zoo_returns_list(self, client):
        resp = client.get("/api/zoo")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert isinstance(data["data"], list)


class TestCompare:
    def test_compare_missing_params(self, client):
        """GET /api/compare without query params should return 400."""
        resp = client.get("/api/compare")
        assert resp.status_code == 400
        data = resp.get_json()
        assert data["success"] is False
        assert data["error"] is not None

    def test_compare_missing_one_param(self, client):
        resp = client.get("/api/compare?session_a=abc")
        assert resp.status_code == 400

    def test_compare_two_sessions(self, client):
        sid_a = _create_session(client)
        sid_b = _create_session(client)
        resp = client.get(f"/api/compare?session_a={sid_a}&session_b={sid_b}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert "session_a" in data["data"]
        assert "session_b" in data["data"]
        assert "winner" in data["data"]


def test_get_decision_episodes_empty(client):
    """Empty list returned for unknown session."""
    resp = client.get("/api/decisions/unknown-session")
    assert resp.status_code == 200
    assert resp.json == []


def test_get_decision_episodes_populated(client):
    """Returns episode summaries after STORE is populated."""
    from backend.rl.decision_store import STORE
    STORE.clear("test-api-session")
    STORE.finalise_episode("test-api-session", 1, {
        "total_reward": -100.0, "mean_wait": 200.0, "throughput": 9000
    })
    resp = client.get("/api/decisions/test-api-session")
    assert resp.status_code == 200
    data = resp.json
    assert len(data) == 1
    assert data[0]["ep"] == 1
    assert data[0]["total_reward"] == -100.0


def test_get_decision_episode_not_found(client):
    """404 for missing episode."""
    resp = client.get("/api/decisions/no-session/99")
    assert resp.status_code == 404


def test_get_decision_episode_found(client):
    """Returns decisions + summary for existing episode."""
    from backend.rl.decision_store import STORE
    STORE.clear("test-ep-session")
    STORE.append("test-ep-session", 1, {"step": 1, "action": {"phase_name": "N+S Green"}})
    STORE.finalise_episode("test-ep-session", 1, {"total_reward": -80.0, "mean_wait": 180.0, "throughput": 9200})
    resp = client.get("/api/decisions/test-ep-session/1")
    assert resp.status_code == 200
    data = resp.json
    assert "decisions" in data
    assert "summary" in data
    assert len(data["decisions"]) == 1
