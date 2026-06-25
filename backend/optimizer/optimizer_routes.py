"""
Flask Blueprint for Road Optimizer API.
All endpoints under /api/optimizer/
"""
from __future__ import annotations

import json
import logging
import threading
import uuid
from dataclasses import dataclass
from typing import Any

from flask import Blueprint, Response, jsonify, request, stream_with_context

from backend.optimizer.scenario_config import (
    NAMED_INTERSECTIONS,
    SCENARIO_TYPES,
    IntersectionProfile,
    ScenarioRequest,
)
from backend.optimizer.scenario_runner import run_scenario_stream
from backend.optimizer.llm_advisor import get_llm_recommendation

logger = logging.getLogger(__name__)

optimizer_bp = Blueprint("optimizer", __name__, url_prefix="/api/optimizer")

# In-memory job store (keyed by scenario_id)
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@optimizer_bp.route("/intersections", methods=["GET"])
def list_intersections():
    """Return pre-configured named intersections."""
    return jsonify({"intersections": NAMED_INTERSECTIONS})


@optimizer_bp.route("/scenario-types", methods=["GET"])
def list_scenario_types():
    """Return available scenario type definitions."""
    return jsonify({"scenario_types": SCENARIO_TYPES})


@optimizer_bp.route("/run-scenario", methods=["POST"])
def run_scenario():
    """
    Stream RL training progress for a single scenario via Server-Sent Events.

    Request body:
    {
        "intersection": { id, name, arms, lanes_per_arm, traffic_volume_vph, vehicle_mix, traffic_pattern },
        "scenario": { scenario_id, label, scenario_type, training_depth, phase_scheme?, extra_arm_target?, user_overrides? }
    }
    """
    body = request.get_json(force=True) or {}

    inter_data = body.get("intersection", {})
    scen_data = body.get("scenario", {})

    if not inter_data or not scen_data:
        return jsonify({"error": "intersection and scenario are required"}), 400

    profile = IntersectionProfile(
        intersection_id=inter_data.get("id", "custom"),
        name=inter_data.get("name", "Custom"),
        arms=int(inter_data.get("arms", 4)),
        lanes_per_arm=int(inter_data.get("lanes_per_arm", 3)),
        traffic_volume_vph=int(inter_data.get("traffic_volume_vph", 2000)),
        vehicle_mix=inter_data.get("vehicle_mix", "hyderabad_mixed"),
        traffic_pattern=inter_data.get("traffic_pattern", "uniform"),
    )

    scenario = ScenarioRequest(
        scenario_id=scen_data.get("scenario_id", str(uuid.uuid4())),
        label=scen_data.get("label", "Scenario"),
        scenario_type=scen_data.get("scenario_type", "baseline"),
        training_depth=scen_data.get("training_depth", "quick"),
        phase_scheme=scen_data.get("phase_scheme"),
        extra_arm_target=scen_data.get("extra_arm_target"),
        user_overrides=scen_data.get("user_overrides", {}),
        evaluation_model=scen_data.get("evaluation_model"),
    )

    # Mark job as running
    with _lock:
        _jobs[scenario.scenario_id] = {"status": "running", "result": None}

    def generate():
        try:
            for event in run_scenario_stream(profile, scenario):
                if event.get("event") == "done":
                    with _lock:
                        _jobs[scenario.scenario_id] = {
                            "status": "done",
                            "result": event.get("result"),
                        }
                elif event.get("event") == "error":
                    with _lock:
                        _jobs[scenario.scenario_id] = {
                            "status": "error",
                            "error": event.get("message"),
                        }
                yield _sse(event)
        except Exception as e:
            logger.exception("Scenario runner error: %s", e)
            with _lock:
                _jobs[scenario.scenario_id] = {"status": "error", "error": str(e)}
            yield _sse({"event": "error", "message": str(e)})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@optimizer_bp.route("/scenario-status/<scenario_id>", methods=["GET"])
def scenario_status(scenario_id: str):
    """Poll endpoint for scenario result (alternative to SSE)."""
    with _lock:
        job = _jobs.get(scenario_id)
    if job is None:
        return jsonify({"error": "scenario_id not found"}), 404
    return jsonify(job)


@optimizer_bp.route("/recommend", methods=["POST"])
def recommend():
    """
    Call LLM with completed scenario results and return recommendation.

    Request body:
    {
        "intersection_name": "HITEC City Signal",
        "scenarios": [ { scenario_id, label, scenario_type, kpi: {...} }, ... ]
    }
    """
    body = request.get_json(force=True) or {}
    intersection_name = body.get("intersection_name", "Unknown Intersection")
    scenarios = body.get("scenarios", [])

    if not scenarios:
        return jsonify({"error": "No scenarios provided"}), 400

    model = body.get("model", "gpt-4o")

    completed = [s for s in scenarios if s.get("kpi") is not None]
    if len(completed) < 1:
        return jsonify({"error": "At least one completed scenario with KPI data is required"}), 400

    result = get_llm_recommendation(intersection_name, completed, model)
    return jsonify(result)


@optimizer_bp.route("/intersections/<intersection_id>", methods=["GET"])
def get_intersection(intersection_id: str):
    """Return a single named intersection by ID."""
    match = next((i for i in NAMED_INTERSECTIONS if i["id"] == intersection_id), None)
    if not match:
        return jsonify({"error": "Not found"}), 404
    return jsonify(match)
