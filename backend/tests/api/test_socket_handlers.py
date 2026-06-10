"""
Socket.IO handler tests — Task 20.

Uses Flask-SocketIO test client with an in-memory SQLite database.
"""
from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    """Create a SocketIO test client configured for testing."""
    from backend.app import create_app, socketio
    from flask_socketio import SocketIOTestClient

    test_config = {
        "TESTING": True,
        "SECRET_KEY": "test-secret",
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    }
    app = create_app(test_config)
    app.config["TESTING"] = True

    sock_client = SocketIOTestClient(app, socketio)
    yield sock_client
    sock_client.disconnect()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_received(client, event_name: str) -> dict | None:
    """Return first received payload matching event_name, or None."""
    received = client.get_received()
    for msg in received:
        if msg.get("name") == event_name:
            args = msg.get("args", [])
            return args[0] if args else {}
    return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_connect_emits_hello(client):
    """On connect the server should emit server:hello with version field."""
    received = client.get_received()
    hello_msgs = [m for m in received if m.get("name") == "server:hello"]
    assert hello_msgs, "Expected server:hello event on connect"
    payload = hello_msgs[0]["args"][0]
    assert payload["version"] == "1.0.0"
    assert payload["status"] == "ready"


def test_preset_load_valid(client):
    """Loading a known preset_id returns preset:loaded with sim_config."""
    # Clear any connect events first
    client.get_received()

    client.emit("preset:load", {"preset_id": "hyd_rush_am"})
    payload = _get_received(client, "preset:loaded")
    assert payload is not None, "Expected preset:loaded event"
    assert payload["preset_id"] == "hyd_rush_am"
    assert "sim_config" in payload
    assert "adverse_config" in payload
    assert payload["name"] == "Hyderabad AM Rush Hour"


def test_preset_load_invalid(client):
    """Loading an unknown preset_id returns preset:error."""
    client.get_received()

    client.emit("preset:load", {"preset_id": "does_not_exist_xyz"})
    payload = _get_received(client, "preset:error")
    assert payload is not None, "Expected preset:error event"
    assert "error" in payload
    assert "does_not_exist_xyz" in payload["error"]


def test_config_update(client):
    """Emitting config:update returns config:updated with same field/value."""
    client.get_received()

    client.emit("config:update", {
        "session_id": "sess-001",
        "field": "traffic_volume_vph",
        "value": 1500,
    })
    payload = _get_received(client, "config:updated")
    assert payload is not None, "Expected config:updated event"
    assert payload["session_id"] == "sess-001"
    assert payload["field"] == "traffic_volume_vph"
    assert payload["value"] == 1500


def test_demo_start(client):
    """demo:start emits both preset:loaded and demo:ready."""
    client.get_received()

    client.emit("demo:start", {})
    received = client.get_received()

    event_names = [m.get("name") for m in received]
    assert "preset:loaded" in event_names, f"Expected preset:loaded, got: {event_names}"
    assert "demo:ready" in event_names, f"Expected demo:ready, got: {event_names}"

    # Verify demo:ready payload
    demo_ready = next(m for m in received if m["name"] == "demo:ready")
    payload = demo_ready["args"][0]
    assert payload["preset"] == "hyd_rush_am"
    assert "description" in payload


def test_report_generate_emits_ready(client):
    """report:generate emits report:ready with a content_url."""
    client.get_received()

    client.emit("report:generate", {
        "session_id": "sess-report-001",
        "format": "html",
    })
    payload = _get_received(client, "report:ready")
    assert payload is not None, "Expected report:ready event"
    assert payload["session_id"] == "sess-report-001"
    assert payload["format"] == "html"
    assert "/api/sessions/sess-report-001/report/html" in payload["content_url"]


def test_sim_start_emits_started(client):
    """sim:start with a session_id emits sim:started."""
    client.get_received()

    client.emit("sim:start", {
        "session_id": "sess-sim-001",
        "sim_config": {},
        "adverse_config": {},
    })
    payload = _get_received(client, "sim:started")
    assert payload is not None, "Expected sim:started event"
    assert payload["session_id"] == "sess-sim-001"
    assert payload["status"] == "running"


def test_sim_stop(client):
    """sim:stop emits sim:stopped and sets status to stopped."""
    from backend.analytics.session_store import SessionStore
    from backend.config import SimulationConfig, AdverseConfig
    store = SessionStore()
    store.create_session("sess-sim-001", SimulationConfig(), AdverseConfig())

    client.get_received()

    client.emit("sim:stop", {"session_id": "sess-sim-001"})
    payload = _get_received(client, "sim:stopped")
    assert payload is not None, "Expected sim:stopped event"
    assert payload["session_id"] == "sess-sim-001"

    session = store.get_session("sess-sim-001")
    assert session is not None
    assert session["status"] == "stopped"


def test_sim_start_missing_session_id(client):
    """sim:start without session_id emits sim:error."""
    client.get_received()

    client.emit("sim:start", {"sim_config": {}, "adverse_config": {}})
    payload = _get_received(client, "sim:error")
    assert payload is not None, "Expected sim:error event"
    assert "error" in payload


def test_preset_count():
    """Sanity check: ALL_PRESETS contains at least 34 presets."""
    from backend.config_presets import ALL_PRESETS
    assert len(ALL_PRESETS) >= 34, f"Expected >=34 presets, found {len(ALL_PRESETS)}"


def test_list_presets_returns_summaries():
    """list_presets() returns summaries without sim_config/adverse_config."""
    from backend.config_presets import list_presets
    summaries = list_presets()
    assert len(summaries) >= 34
    for s in summaries:
        assert "id" in s
        assert "name" in s
        assert "group" in s
        assert "sim_config" not in s
        assert "adverse_config" not in s


def test_list_presets_by_group():
    """list_presets_by_group() returns dict keyed by group with correct entries."""
    from backend.config_presets import list_presets_by_group
    grouped = list_presets_by_group()
    assert "A_time_of_day" in grouped
    assert "G_research" in grouped
    assert len(grouped["A_time_of_day"]) == 7


def test_get_preset_config():
    """get_preset_config() returns sim_config and adverse_config dicts."""
    from backend.config_presets import get_preset_config
    cfg = get_preset_config("hyd_rush_pm")
    assert cfg is not None
    assert "sim_config" in cfg
    assert "adverse_config" in cfg
    assert cfg["sim_config"]["traffic_volume_vph"] == 2000


def test_get_preset_config_unknown():
    """get_preset_config() returns None for unknown preset."""
    from backend.config_presets import get_preset_config
    assert get_preset_config("nonexistent_preset") is None


def test_session_state_helpers():
    """get/set_session_state functions behave correctly."""
    from backend.api.socket_handlers import get_session_state, set_session_state, _session_states

    sid = "test-state-session-xyz"
    # Clean up in case of leftover state
    _session_states.pop(sid, None)

    default = get_session_state(sid)
    assert default == {"paused": False, "running": False}

    set_session_state(sid, running=True)
    state = get_session_state(sid)
    assert state["running"] is True
    assert state["paused"] is False

    set_session_state(sid, paused=True)
    state = get_session_state(sid)
    assert state["paused"] is True
    assert state["running"] is True  # unchanged

    # cleanup
    _session_states.pop(sid, None)
