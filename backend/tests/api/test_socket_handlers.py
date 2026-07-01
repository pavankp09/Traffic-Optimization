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


def test_spawn_spec_respects_uniform_lane_count():
    """A 2-lane config should not create lane index 2."""
    from backend.api import socket_handlers as sh

    layout = sh._lane_layout_from_config({"n_lanes": 2})
    seen = {
        sh._spawn_spec(i, arm="N", intersection_type="four_way", lane_layout=layout)["lane"]
        for i in range(1, 100)
    }

    assert seen <= {0, 1}


def test_spawn_spec_respects_per_arm_lane_override():
    """Per-arm lane overrides allow North=3 while other arms remain at 2."""
    from backend.api import socket_handlers as sh

    layout = sh._lane_layout_from_config({"n_lanes": 2, "lane_config": {"N": 3}})

    assert sh._lane_count(layout, "N") == 3
    assert sh._lane_count(layout, "S") == 2
    assert sh._spawn_spec(1, arm="N", lane=2, intersection_type="four_way", lane_layout=layout)["lane"] == 2
    assert sh._spawn_spec(2, arm="S", lane=2, intersection_type="four_way", lane_layout=layout)["lane"] == 0


def test_four_way_turn_mapping_matches_driver_perspective():
    """Left/right turns should be relative to the vehicle's inbound heading."""
    from backend.api import socket_handlers as sh

    assert sh.get_exit_arm("N", "left", "four_way") == "E"
    assert sh.get_exit_arm("N", "right", "four_way") == "W"
    assert sh.get_exit_arm("S", "left", "four_way") == "W"
    assert sh.get_exit_arm("S", "right", "four_way") == "E"
    assert sh.get_exit_arm("E", "left", "four_way") == "S"
    assert sh.get_exit_arm("E", "right", "four_way") == "N"
    assert sh.get_exit_arm("W", "left", "four_way") == "N"
    assert sh.get_exit_arm("W", "right", "four_way") == "S"


def test_t_junction_turn_mapping_uses_open_arms_only():
    """T-junction turns should respect driver perspective and avoid closed south arm."""
    from backend.api import socket_handlers as sh

    assert sh.get_exit_arm("N", "left", "t_junction") == "E"
    assert sh.get_exit_arm("N", "right", "t_junction") == "W"
    assert sh.get_exit_arm("E", "straight", "t_junction") == "W"
    assert sh.get_exit_arm("E", "right", "t_junction") == "N"
    assert sh.get_exit_arm("W", "straight", "t_junction") == "E"
    assert sh.get_exit_arm("W", "left", "t_junction") == "N"


def test_turn_exits_land_on_outbound_side_of_destination_arm():
    """Completed turn targets must use the outbound half, not oncoming lanes."""
    import math
    from backend.api import socket_handlers as sh

    for arm in ("N", "S", "E", "W"):
        for turn, expected_exit in (("left", sh.get_exit_arm(arm, "left", "four_way")), ("right", sh.get_exit_arm(arm, "right", "four_way"))):
            vehicle = sh._MockVehicle(f"{arm}-{turn}", arm, lane=1, intersection_type="four_way")
            vehicle.type_id = "car"
            vehicle.turn_dir = turn
            vehicle.lat_drift = 7.9
            vehicle.x = vehicle.dx * (sh._STOP_DIST - 1.0)
            vehicle.y = vehicle.dy * (sh._STOP_DIST - 1.0)

            vehicle._setup_turn("four_way")
            assert vehicle.exit_arm == expected_exit

            theta = sh.get_arm_angle(expected_exit, "four_way")
            target_x, target_y = vehicle.b_p2
            exit_lateral = -target_x * math.sin(theta) + target_y * math.cos(theta)

            assert exit_lateral < 0, f"{arm} {turn} to {expected_exit} entered the oncoming side"


def test_sumo_fine_tuning_is_not_automatic_for_fast_training_modes():
    """Fast mock modes must not silently enter SUMO/TraCI after PPO completes."""
    from backend.api import socket_handlers as sh

    assert sh._should_run_sumo_fine_tuning("stage1") is False
    assert sh._should_run_sumo_fine_tuning("stage2") is False


def test_sumo_fine_tuning_requires_explicit_sumo_training_mode():
    """Only explicit SUMO training should use the SUMO fine-tuning path."""
    from backend.api import socket_handlers as sh

    assert sh._should_run_sumo_fine_tuning("stage3") is True
    assert sh._should_run_sumo_fine_tuning("stage4") is False
    assert sh._should_run_sumo_fine_tuning("") is False


def test_live_rl_simulation_honors_policy_phase_without_override():
    """Live simulation should reveal the policy decision, not correct it."""
    from backend.api import socket_handlers as sh

    world = sh._SimWorld(fixed_time=False, policy_fn=lambda _: (0, 30.0))
    world.phase = 1  # transitioning out of N-S yellow; next decision is due

    for idx, arm in enumerate(["E"] * 12 + ["W"] * 12):
        vehicle = sh._MockVehicle(f"veh-{idx}", arm=arm, lane=0)
        vehicle.x = 10.0
        vehicle.y = 0.0
        vehicle.through = False
        world.add(vehicle)

    world._decide_next()

    assert world.phase == 0


def test_live_rl_simulation_honors_all_red_policy_output():
    """All-red output is a model decision and must not be corrected live."""
    from backend.api import socket_handlers as sh

    world = sh._SimWorld(fixed_time=False, policy_fn=lambda _: (4, 30.0))
    world.phase = 1

    for idx, arm in enumerate(["E"] * 5 + ["W"] * 5 + ["N"] * 2):
        vehicle = sh._MockVehicle(f"veh-{idx}", arm=arm, lane=0)
        vehicle.x = 10.0
        vehicle.y = 0.0
        vehicle.through = False
        world.add(vehicle)

    world._decide_next()

    assert world.phase in (4, 8)


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
