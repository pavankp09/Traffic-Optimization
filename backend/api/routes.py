"""REST API routes — Task 19: 22 endpoints via Flask Blueprint."""
from __future__ import annotations

import dataclasses
import threading
import uuid
import logging
import math
from flask import Blueprint, jsonify, request, current_app, Response

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Blueprint
# ---------------------------------------------------------------------------
api_bp = Blueprint("api", __name__)

# ---------------------------------------------------------------------------
# Module-level singletons (lazy-initialised on first request)
# ---------------------------------------------------------------------------
_store = None
_store_lock = threading.Lock()

_training_threads: dict[str, threading.Thread] = {}
_stop_flags: dict[str, threading.Event] = {}
_calculated_metrics: dict[str, dict] = {}


def _reset_store():
    """Reset the SessionStore singleton (used by create_app for test isolation)."""
    global _store
    with _store_lock:
        _store = None


def _get_store():
    """Return or create the SessionStore singleton.

    Uses SQLALCHEMY_DATABASE_URI from Flask app config when available so
    that test fixtures can inject an in-memory database.
    For sqlite:///:memory:, tables are ensured via the store's own engine.
    """
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                from backend.analytics.session_store import SessionStore
                from backend.db.models import Base
                try:
                    db_url = current_app.config.get(
                        "SQLALCHEMY_DATABASE_URI", "sqlite:///backend/db/traffic.db"
                    )
                except RuntimeError:
                    # No active app context (e.g. background thread before first request)
                    db_url = "sqlite:///backend/db/traffic.db"
                store = SessionStore(db_url=db_url)
                # For in-memory SQLite the store's own engine must hold the
                # schema, since init_db() creates a separate (empty) engine.
                Base.metadata.create_all(store._engine)
                _store = store
    return _store


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------

def ok(data):
    return jsonify({"success": True, "data": data, "error": None})


def err(msg, code=400):
    return jsonify({"success": False, "data": None, "error": msg}), code


# ---------------------------------------------------------------------------
# Config validation helper
# ---------------------------------------------------------------------------

def _validate_sim_config(cfg: dict) -> list[str]:
    errors = []
    total_vph = cfg.get("traffic_volume_vph", cfg.get("total_vph", 0))
    if not (isinstance(total_vph, (int, float)) and total_vph > 0):
        errors.append("traffic_volume_vph must be > 0")

    lanes = cfg.get("lanes_per_arm", cfg.get("n_lanes", 0))
    if not (isinstance(lanes, int) and lanes >= 1):
        errors.append("lanes_per_arm must be >= 1")

    # n_phases derived from phase_scheme or direct
    phase_scheme = cfg.get("phase_scheme", "")
    n_phases_map = {"2phase": 2, "4phase": 4, "5phase": 5, "6phase": 6}
    n_phases = cfg.get("n_phases", n_phases_map.get(phase_scheme, 2))
    if not (isinstance(n_phases, int) and n_phases >= 2):
        errors.append("n_phases (or phase_scheme) must yield >= 2 phases")

    sim_dur = cfg.get("simulation_duration_s", cfg.get("training_episodes", 0))
    # simulation_duration_s is not a field on SimulationConfig but check if present
    if "simulation_duration_s" in cfg:
        if not (isinstance(sim_dur, (int, float)) and sim_dur >= 0):
            errors.append("simulation_duration_s must be >= 0")

    return errors


# ---------------------------------------------------------------------------
# Health & Config
# ---------------------------------------------------------------------------

@api_bp.route("/health")
def health():
    return ok({"status": "ok", "version": "1.0.0"})


@api_bp.route("/config/defaults")
def config_defaults():
    from backend.config import DEFAULT_SIM_CONFIG, DEFAULT_ADVERSE_CONFIG
    return ok({
        "sim_config": dataclasses.asdict(DEFAULT_SIM_CONFIG),
        "adverse_config": dataclasses.asdict(DEFAULT_ADVERSE_CONFIG),
    })


@api_bp.route("/config/validate", methods=["POST"])
def config_validate():
    body = request.get_json(silent=True) or {}
    sim_cfg = body.get("sim_config", {})
    errors = _validate_sim_config(sim_cfg)
    return ok({"valid": len(errors) == 0, "errors": errors})


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------

@api_bp.route("/presets")
def list_presets():
    try:
        from backend.config_presets import list_presets as _list_presets
        presets = _list_presets()
    except ImportError:
        presets = []
    except Exception as exc:
        logger.warning("Failed to load presets: %s", exc)
        presets = []
    return ok(presets)


@api_bp.route("/presets/<preset_id>")
def get_preset(preset_id):
    try:
        from backend.config_presets import get_preset as _get_preset
        preset = _get_preset(preset_id)
        if preset is None:
            return err(f"Preset '{preset_id}' not found", 404)
        return ok(preset)
    except ImportError:
        return err("Presets module not available", 503)
    except Exception as exc:
        return err(str(exc), 500)


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@api_bp.route("/sessions", methods=["POST"])
def create_session():
    from backend.config import SimulationConfig, AdverseConfig
    body = request.get_json(silent=True) or {}
    session_id = body.get("session_id") or str(uuid.uuid4())

    sim_dict = body.get("sim_config", {})
    adverse_dict = body.get("adverse_config", {})

    # Build dataclass instances tolerantly (ignore unknown keys)
    sim_fields = {f.name for f in dataclasses.fields(SimulationConfig)}
    adverse_fields = {f.name for f in dataclasses.fields(AdverseConfig)}

    sim_cfg = SimulationConfig(**{k: v for k, v in sim_dict.items() if k in sim_fields})
    adverse_cfg = AdverseConfig(**{k: v for k, v in adverse_dict.items() if k in adverse_fields})

    store = _get_store()
    try:
        store.create_session(session_id, sim_cfg, adverse_cfg)
    except Exception as exc:
        return err(f"Failed to create session: {exc}", 500)

    return ok({"session_id": session_id})


@api_bp.route("/sessions")
def list_sessions():
    store = _get_store()
    try:
        sessions = store.list_sessions()
    except Exception as exc:
        return err(str(exc), 500)
    return ok(sessions)


@api_bp.route("/sessions/<session_id>")
def get_session(session_id):
    store = _get_store()
    try:
        session = store.get_session(session_id)
    except Exception as exc:
        return err(str(exc), 500)
    if session is None:
        return err(f"Session '{session_id}' not found", 404)
    return ok(session)


@api_bp.route("/sessions/<session_id>", methods=["DELETE"])
def delete_session(session_id):
    store = _get_store()
    try:
        deleted = store.delete_session(session_id)
    except Exception as exc:
        return err(str(exc), 500)
    if not deleted:
        return err(f"Session '{session_id}' not found", 404)
    return ok({"deleted": True})


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def _run_training(session_id, sim_config_dict, adverse_config_dict, total_timesteps, app):
    """Background training thread."""
    with app.app_context():
        try:
            from backend.config import SimulationConfig, AdverseConfig
            from backend.rl.trainer import PPOTrainer
            from backend.analytics.session_store import SessionStore

            store = SessionStore()

            sim_fields = {f.name for f in dataclasses.fields(SimulationConfig)}
            adverse_fields = {f.name for f in dataclasses.fields(AdverseConfig)}
            sim_cfg = SimulationConfig(
                **{k: v for k, v in sim_config_dict.items() if k in sim_fields}
            )
            adverse_cfg = AdverseConfig(
                **{k: v for k, v in adverse_config_dict.items() if k in adverse_fields}
            )

            stop_event = _stop_flags.get(session_id)

            trainer = PPOTrainer(
                session_id=session_id,
                sim_config=sim_cfg,
                adverse_config=adverse_cfg,
                total_timesteps=total_timesteps,
            )
            trainer.train()
            store.update_session_status(session_id, "completed")
        except Exception as exc:
            logger.exception("Training failed for session %s: %s", session_id, exc)
            try:
                from backend.analytics.session_store import SessionStore
                SessionStore().update_session_status(session_id, "error")
            except Exception:
                pass
        finally:
            _stop_flags.pop(session_id, None)
            _training_threads.pop(session_id, None)


@api_bp.route("/sessions/<session_id>/train", methods=["POST"])
def start_training(session_id):
    body = request.get_json(silent=True) or {}
    total_timesteps = int(body.get("total_timesteps", 500_000))

    # Verify session exists
    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return err(f"Session '{session_id}' not found", 404)

    # Don't start a second thread if already running
    if session_id in _training_threads and _training_threads[session_id].is_alive():
        return err("Training already running for this session", 409)

    sim_config_dict = session.get("sim_config") or {}
    adverse_config_dict = session.get("adverse_config") or {}

    stop_event = threading.Event()
    _stop_flags[session_id] = stop_event

    app = current_app._get_current_object()
    thread = threading.Thread(
        target=_run_training,
        args=(session_id, sim_config_dict, adverse_config_dict, total_timesteps, app),
        daemon=True,
        name=f"train-{session_id}",
    )
    _training_threads[session_id] = thread
    store.update_session_status(session_id, "training")
    thread.start()

    return ok({"session_id": session_id, "status": "started"})


@api_bp.route("/sessions/<session_id>/status")
def session_status(session_id):
    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return err(f"Session '{session_id}' not found", 404)

    is_running = (
        session_id in _training_threads
        and _training_threads[session_id].is_alive()
    )
    status = session.get("status", "idle")
    if status == "training" and not is_running:
        status = session.get("status", "idle")

    return ok({
        "session_id": session_id,
        "status": status,
        "total_episodes": session.get("total_episodes", 0),
        "best_reward": session.get("best_reward", 0.0),
    })


@api_bp.route("/sessions/<session_id>/stop", methods=["POST"])
def stop_training(session_id):
    stop_event = _stop_flags.get(session_id)
    if stop_event:
        stop_event.set()

    thread = _training_threads.get(session_id)
    if thread and thread.is_alive():
        thread.join(timeout=5.0)

    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return err(f"Session '{session_id}' not found", 404)

    store.update_session_status(session_id, "stopped")
    return ok({"stopped": True})


# ---------------------------------------------------------------------------
# Episodes & Metrics
# ---------------------------------------------------------------------------

@api_bp.route("/sessions/<session_id>/episodes")
def get_episodes(session_id):
    limit = request.args.get("limit", 100, type=int)
    store = _get_store()
    try:
        episodes = store.get_episodes(session_id, limit=limit)
    except Exception as exc:
        return err(str(exc), 500)
    return ok(episodes)


@api_bp.route("/sessions/<session_id>/metrics")
def get_metrics(session_id):
    store = _get_store()
    try:
        episodes = store.get_episodes(session_id)
    except Exception as exc:
        return err(str(exc), 500)

    if not episodes:
        return ok({
            "session_id": session_id,
            "total_episodes": 0,
            "avg_wait_s": None,
            "avg_throughput_vph": None,
            "avg_green_utilisation": None,
            "total_collisions": 0,
        })

    n = len(episodes)
    avg_wait = sum((e.get("avg_wait_time_s") or 0.0) for e in episodes) / n
    avg_throughput = sum((e.get("throughput") or 0.0) for e in episodes) / n
    avg_green = sum((e.get("green_utilisation_pct") or 0.0) for e in episodes) / n
    total_collisions = sum((e.get("collision_count") or 0) for e in episodes)

    return ok({
        "session_id": session_id,
        "total_episodes": n,
        "avg_wait_s": avg_wait,
        "avg_throughput_vph": avg_throughput,
        "avg_green_utilisation_pct": avg_green,
        "total_collisions": total_collisions,
    })


@api_bp.route("/sessions/<session_id>/insights")
def get_insights(session_id):
    store = _get_store()
    try:
        insights = store.get_insights(session_id)
    except Exception as exc:
        return err(str(exc), 500)
    return ok(insights)


@api_bp.route("/sessions/<session_id>/economic")
def get_economic(session_id):
    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return err(f"Session '{session_id}' not found", 404)

    # Return placeholder if no episodes yet
    episodes = store.get_episodes(session_id)
    if not episodes:
        return ok({
            "session_id": session_id,
            "status": "no_data",
            "total_fuel_saved_l": 0.0,
            "total_co2_avoided_kg": 0.0,
            "total_fuel_cost_saved_inr": 0.0,
            "total_time_value_saved_inr": 0.0,
            "total_saving_inr": 0.0,
        })

    # Aggregate from MetricRecord-like data stored in episodes
    n = len(episodes)
    total_saving = sum((e.get("total_economic_inr_per_hr") or 0.0) for e in episodes)
    return ok({
        "session_id": session_id,
        "status": "computed",
        "total_episodes": n,
        "total_saving_inr": total_saving,
    })


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

@api_bp.route("/models")
def list_models():
    try:
        from backend.rl.model_manager import ModelManager
        mm = ModelManager()
        models = mm.list_models()
    except Exception as exc:
        return err(str(exc), 500)
    return ok(models)


@api_bp.route("/models/<session_id>/export", methods=["POST"])
def export_model(session_id):
    body = request.get_json(silent=True) or {}
    output_path = body.get("output_path")

    try:
        from backend.rl.model_manager import ModelManager
        mm = ModelManager()
        # Try to find the model by session_id name
        if output_path:
            model_path = output_path
        else:
            model_path = f"models/{session_id}_exported.zip"

        # Try loading the model from the session model if it exists
        try:
            model = mm.load(session_id)
            saved = mm.save(model, session_id, metadata={"exported_for": session_id})
            model_path = saved
        except FileNotFoundError:
            return err(f"No model found for session '{session_id}'", 404)

    except Exception as exc:
        return err(str(exc), 500)

    return ok({"model_path": model_path})


@api_bp.route("/zoo")
def list_zoo():
    try:
        from backend.rl.model_zoo import list_zoo_models
        zoo_models = list_zoo_models()
    except ImportError:
        zoo_models = []
    except Exception as exc:
        return err(str(exc), 500)
    return ok(zoo_models)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def _make_placeholder_episode_metrics(session_id: str, e: dict):
    """Build a minimal EpisodeMetrics from a stored episode dict."""
    from backend.analytics.metrics import EpisodeMetrics
    return EpisodeMetrics(
        episode_id=str(e.get("id", "0")),
        session_id=session_id,
        duration_s=int(e.get("duration_s", 3600)),
        n_vehicles=int(e.get("throughput") or 0),
        avg_wait_s=float(e.get("avg_wait_time_s") or 0.0),
        per_type={},
        per_arm={},
        throughput_vph=float(e.get("throughput") or 0),
        green_utilisation=float(e.get("green_utilisation_pct") or 0.0) / 100.0,
        collision_count=int(e.get("collision_count") or 0),
        violation_count=int(e.get("violation_count") or 0),
        signal_efficiency=float(e.get("convergence_pct") or 0.0) / 100.0,
        avg_phase_duration_s=0.0,
        adverse_events_count=0,
        total_delay_veh_hrs=0.0,
    )


def _make_placeholder_economic_summary(session_id: str):
    """Return a zeroed EconomicSummary for sessions without computed economics."""
    from backend.analytics.economic import EconomicSummary
    return EconomicSummary(
        session_id=session_id,
        baseline_avg_wait_s=0.0,
        rl_avg_wait_s=0.0,
        wait_reduction_s=0.0,
        fuel_saved_l_per_veh=0.0,
        co2_avoided_kg_per_veh=0.0,
        fuel_cost_saved_inr_per_veh=0.0,
        time_value_saved_inr_per_veh=0.0,
        total_saving_inr_per_veh=0.0,
        total_fuel_saved_l=0.0,
        total_co2_avoided_kg=0.0,
        total_co2_avoided_tonne=0.0,
        total_fuel_cost_saved_inr=0.0,
        total_time_value_saved_inr=0.0,
        total_saving_inr=0.0,
        carbon_credit_value_inr=0.0,
        city_intersections=500,
        city_daily_saving_inr=0.0,
        city_annual_saving_inr=0.0,
        city_annual_co2_avoided_tonne=0.0,
        per_type={},
    )


@api_bp.route("/sessions/<session_id>/report/html")
def report_html(session_id):
    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return err(f"Session '{session_id}' not found", 404)

    episodes = store.get_episodes(session_id)
    if not episodes:
        html = (
            f"<html><body><h1>Report: {session_id}</h1>"
            "<p>No episodes recorded yet.</p></body></html>"
        )
        return Response(html, content_type="text/html")

    try:
        from backend.analytics.report_generator import ReportGenerator

        rg = ReportGenerator()
        rl_metrics = [_make_placeholder_episode_metrics(session_id, e) for e in episodes]
        eco = _make_placeholder_economic_summary(session_id)

        data = rg.build_report_data(
            session_id=session_id,
            location=session.get("notes", session_id),
            baseline_metrics=rl_metrics[0],
            rl_episode_metrics=rl_metrics,
            economic_summary=eco,
            episode_rewards=[e.get("total_reward", 0.0) for e in episodes],
        )
        html = rg.render_html(data)
    except Exception as exc:
        logger.exception("HTML report generation failed: %s", exc)
        html = (
            f"<html><body><h1>Report: {session_id}</h1>"
            f"<p>Error generating report: {exc}</p></body></html>"
        )

    return Response(html, content_type="text/html")


@api_bp.route("/sessions/<session_id>/report/pdf")
def report_pdf(session_id):
    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return err(f"Session '{session_id}' not found", 404)

    episodes = store.get_episodes(session_id)
    if not episodes:
        return err("No episodes recorded yet — cannot generate PDF", 422)

    try:
        from backend.analytics.report_generator import ReportGenerator

        rg = ReportGenerator()
        rl_metrics = [_make_placeholder_episode_metrics(session_id, e) for e in episodes]
        eco = _make_placeholder_economic_summary(session_id)

        data = rg.build_report_data(
            session_id=session_id,
            location=session.get("notes", session_id),
            baseline_metrics=rl_metrics[0],
            rl_episode_metrics=rl_metrics,
            economic_summary=eco,
            episode_rewards=[e.get("total_reward", 0.0) for e in episodes],
        )
        pdf_bytes = rg.render_pdf(data)
    except ImportError as exc:
        return err(f"PDF generation not available (weasyprint missing): {exc}", 503)
    except Exception as exc:
        logger.exception("PDF report generation failed: %s", exc)
        return err(str(exc), 500)

    return Response(pdf_bytes, content_type="application/pdf")


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------

@api_bp.route("/compare")
def compare_sessions():
    ids_raw = request.args.get("ids", "").strip()
    if ids_raw:
        ids = _parse_compare_ids(ids_raw)
        if len(ids) < 2:
            return err("At least two ids are required in ids query param", 400)

        store = _get_store()
        sims: list[dict] = []
        for sim_id in ids[:8]:
            session = store.get_session(sim_id)
            if session is None:
                continue

            runtime = _runtime_or_fallback(sim_id, session)
            episodes = store.get_episodes(sim_id, limit=10_000)
            sim_cfg = session.get("sim_config") or {}

            waits = [_to_float(e.get("avg_wait_time_s"), 0.0) for e in episodes]
            throughputs = [_to_float(e.get("throughput"), 0.0) for e in episodes]
            rewards = [_to_float(e.get("total_reward"), 0.0) for e in episodes]
            green_pct = [_to_float(e.get("green_utilisation_pct"), 0.0) for e in episodes]
            efficiency_pct = [_to_float(e.get("convergence_pct"), 0.0) for e in episodes]
            collisions = [_to_int(e.get("collision_count"), 0) for e in episodes]
            violations = [_to_int(e.get("violation_count"), 0) for e in episodes]

            avg_wait = _mean(waits) if waits else _to_float(runtime.get("avg_wait"), 0.0)
            p90_wait = _percentile(waits, 90.0) if waits else avg_wait
            wait_std = _stddev(waits) if waits else 0.0

            avg_throughput = _mean(throughputs) if throughputs else _to_float(runtime.get("throughput"), 0.0)
            avg_green_util_pct = _mean(green_pct)
            avg_efficiency_pct = _mean(efficiency_pct)

            total_collisions = sum(collisions)
            total_violations = sum(violations)
            total_exited = _to_int(runtime.get("exited"), 0)
            if throughputs:
                total_exited = max(total_exited, _to_int(max(throughputs), total_exited))

            duration_min = _to_float(runtime.get("sim_duration_min"), 0.0)
            if duration_min <= 0:
                duration_min = _to_float(sim_cfg.get("simulation_duration_s"), 0.0) / 60.0
            duration_min = max(0.0, duration_min)

            demand_vph = _to_float(sim_cfg.get("traffic_volume_vph", sim_cfg.get("total_vph", 0.0)), 0.0)
            expected_vehicles = demand_vph * (duration_min / 60.0)
            if expected_vehicles <= 0:
                expected_vehicles = _to_float(total_exited, 0.0)

            exit_rate = _safe_ratio(total_exited * 100.0, expected_vehicles, default=0.0)
            exit_rate = max(0.0, min(exit_rate, 200.0))

            calc = _compute_calculated_metrics(runtime)
            saturation = calc.get("saturation") or {"N": 0.0, "S": 0.0, "E": 0.0, "W": 0.0}
            tts = calc.get("time_to_starvation") or {"N": 60.0, "S": 60.0, "E": 60.0, "W": 60.0}
            avg_saturation = _mean([_to_float(v, 0.0) for v in saturation.values()])
            max_tts = max([_to_float(v, 0.0) for v in tts.values()] or [0.0])

            stability_score = max(0.0, 100.0 - min(100.0, _safe_ratio(wait_std, max(avg_wait, 1.0), 0.0) * 140.0))
            safety_score = max(0.0, 100.0 - (total_collisions * 12.0 + total_violations * 2.0))
            if demand_vph > 0:
                throughput_score = min(100.0, _safe_ratio(avg_throughput, max(demand_vph, 1.0), 0.0) * 100.0)
            else:
                throughput_score = min(100.0, avg_throughput / 12.0)
            delay_score = max(0.0, 100.0 - min(100.0, avg_wait))
            util_score = min(100.0, avg_green_util_pct)
            efficiency_score = (
                0.45 * throughput_score
                + 0.25 * util_score
                + 0.20 * stability_score
                + 0.10 * delay_score
            )

            created_at = session.get("created_at")
            created_str = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)
            queue = runtime.get("queue") or {"N": 0, "S": 0, "E": 0, "W": 0}

            by_arm = {}
            for arm in ["N", "S", "E", "W"]:
                by_arm[arm] = {
                    "queue": _to_float(queue.get(arm), 0.0),
                    "saturation": _to_float(saturation.get(arm), 0.0),
                    "tts": _to_float(tts.get(arm), 0.0),
                }

            best_reward = session.get("best_reward")
            if best_reward is None and rewards:
                best_reward = max(rewards)

            sims.append(
                {
                    "sim_id": sim_id,
                    "session_id": sim_id,
                    "created_at": created_str,
                    "intersection": sim_cfg.get("intersection_type", "four_way"),
                    "total_vehicles": int(round(expected_vehicles)),
                    "duration_min": int(round(duration_min)),
                    "throughput": round(avg_throughput, 1),
                    "avg_wait": round(avg_wait, 1),
                    "p90_wait": round(p90_wait, 1),
                    "wait_std": round(wait_std, 2),
                    "green_util_pct": round(avg_green_util_pct, 1),
                    "signal_efficiency_pct": round(avg_efficiency_pct, 1),
                    "total_exited": int(total_exited),
                    "exit_rate": round(exit_rate, 1),
                    "total_collisions": int(total_collisions),
                    "total_violations": int(total_violations),
                    "incident_rate_per_1k": round(_safe_ratio((total_collisions + total_violations) * 1000.0, max(total_exited, 1), 0.0), 2),
                    "best_reward": round(_to_float(best_reward, 0.0), 2) if best_reward is not None else None,
                    "queue": queue,
                    "saturation": saturation,
                    "avg_saturation": round(avg_saturation, 3),
                    "queue_gini": _to_float(calc.get("gini"), 0.0),
                    "pressure_mean": _to_float(calc.get("pressure_mean"), 0.0),
                    "max_time_to_starvation_s": round(max_tts, 1),
                    "trajectory_rows": _to_int(calc.get("trajectory_rows"), 0),
                    "type_counts": runtime.get("type_dist") or {},
                    "turn_counts": {},
                    "turn_pct": {},
                    "event_log": [],
                    "spawn_mix_mult": sim_cfg.get("spawn_mix_mult") or sim_cfg.get("spawn_multipliers") or {},
                    "analytics": {"by_arm": by_arm},
                    "scores": {
                        "efficiency": round(efficiency_score, 1),
                        "safety": round(safety_score, 1),
                        "stability": round(stability_score, 1),
                    },
                }
            )

        return jsonify(sims)

    session_a = request.args.get("session_a")
    session_b = request.args.get("session_b")

    if not session_a or not session_b:
        return err("Both session_a and session_b query params are required", 400)

    try:
        from backend.analytics.comparator import SessionComparator
        comparator = SessionComparator(session_store=_get_store())
        result = comparator.compare(session_a, session_b)
    except Exception as exc:
        return err(str(exc), 500)

    return ok(result)


# ---------------------------------------------------------------------------
# Add-on APIs for Simulation Manager + Analyzer
# ---------------------------------------------------------------------------

def _map_sim_status(raw: str) -> str:
    status = (raw or "").lower()
    if status in {"completed", "done"}:
        return "done"
    if status in {"running", "training"}:
        return "running"
    if status in {"stopped", "error"}:
        return status
    return "running"


def _to_float(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value, default=0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _stddev(values: list[float]) -> float:
    if len(values) <= 1:
        return 0.0
    m = _mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / len(values))


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    k = (len(s) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return s[int(k)]
    d0 = s[f] * (c - k)
    d1 = s[c] * (k - f)
    return d0 + d1


def _safe_ratio(numerator: float, denominator: float, default: float = 0.0) -> float:
    if denominator <= 0:
        return default
    return numerator / denominator


def _parse_compare_ids(raw_ids: str) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for token in (raw_ids or "").split(","):
        value = token.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _runtime_or_fallback(session_id: str, session_row: dict | None) -> dict:
    from backend.api.socket_handlers import get_runtime_snapshot, get_session_state

    snap = get_runtime_snapshot(session_id) or {}
    state = get_session_state(session_id)
    cfg = (session_row or {}).get("sim_config") or {}

    queue = snap.get("queue") or {"N": 0, "S": 0, "E": 0, "W": 0}
    sim_time = _to_float(snap.get("sim_time"), 0.0)
    exited = _to_int(snap.get("exited"), 0)
    throughput = _to_float(snap.get("throughput"), 0.0)
    if throughput <= 0 and sim_time > 0:
        throughput = (exited / sim_time) * 3600.0

    if snap:
        sim_status = snap.get("sim_status", "running")
    else:
        sim_status = "running" if state.get("running") else _map_sim_status((session_row or {}).get("status", "done"))

    duration_min = _to_int(_to_float(cfg.get("simulation_duration_s"), 0.0) / 60.0, 0)

    return {
        "sim_status": sim_status,
        "sim_time": round(sim_time, 1),
        "sim_duration_min": duration_min,
        "active": _to_int(snap.get("active"), 0),
        "exited": exited,
        "avg_wait": _to_float(snap.get("avg_wait"), 0.0),
        "throughput": round(throughput, 0),
        "queue": queue,
        "lights": snap.get("lights") or {"N": "red", "S": "red", "E": "red", "W": "red"},
        "queue_history": snap.get("queue_history") or [],
        "type_dist": snap.get("type_dist") or {},
    }


def _build_report_payload(store, session_id: str, session_row: dict, runtime: dict) -> dict:
    episodes = store.get_episodes(session_id, limit=500)
    total_exited = runtime.get("exited", 0)
    avg_wait = runtime.get("avg_wait", 0.0)
    throughput = runtime.get("throughput", 0.0)

    if episodes:
        avg_wait = sum(_to_float(e.get("avg_wait_time_s"), 0.0) for e in episodes) / len(episodes)
        throughput = sum(_to_float(e.get("throughput"), 0.0) for e in episodes) / len(episodes)
        total_exited = max(total_exited, _to_int(episodes[-1].get("throughput"), total_exited))

    queue = runtime.get("queue") or {"N": 0, "S": 0, "E": 0, "W": 0}
    bottleneck = max(queue, key=queue.get) if queue else "N"

    recommendations: list[str] = []
    if avg_wait > 70:
        recommendations.append("Increase dynamic green extension for the busiest arm during peak windows.")
    if throughput < 350:
        recommendations.append("Tune phase split ratio using latest queue-weighted demand profile.")
    if queue.get(bottleneck, 0) > 8:
        recommendations.append(f"Investigate lane discipline and turning conflicts on arm {bottleneck}.")
    if not recommendations:
        recommendations.append("Current control is stable. Continue monitoring with periodic recalibration.")

    waste_events = []
    history = runtime.get("queue_history") or []
    for point in history[-200:]:
        ns = _to_int(point.get("N"), 0) + _to_int(point.get("S"), 0)
        ew = _to_int(point.get("E"), 0) + _to_int(point.get("W"), 0)
        # Simple waste heuristic: one axis has zero queue while likely being served.
        if ns == 0 or ew == 0:
            waste_events.append({"t": point.get("t"), "arm": "NS" if ew > ns else "EW"})

    return {
        "session_id": session_id,
        "location": session_row.get("notes") or session_id,
        "total_exited": int(total_exited),
        "avg_wait_sec": round(avg_wait, 1),
        "throughput_vph": round(throughput, 0),
        "bottleneck_arm": bottleneck,
        "arm_avg_queue": queue,
        "recommendations": recommendations,
        "signal_waste_phases": waste_events,
    }


def _compute_calculated_metrics(runtime: dict) -> dict:
    queue = runtime.get("queue") or {"N": 0, "S": 0, "E": 0, "W": 0}
    history = runtime.get("queue_history") or []
    caps = {"N": 20.0, "S": 20.0, "E": 24.0, "W": 24.0}

    saturation = {
        arm: round(min(1.6, _to_float(queue.get(arm), 0.0) / caps[arm]), 3)
        for arm in ["N", "S", "E", "W"]
    }

    vals = [_to_float(queue.get(arm), 0.0) for arm in ["N", "S", "E", "W"]]
    mean_v = sum(vals) / 4.0 if vals else 0.0
    if mean_v <= 0:
        gini = 0.0
    else:
        abs_sum = 0.0
        for vi in vals:
            for vj in vals:
                abs_sum += abs(vi - vj)
        gini = abs_sum / (2 * len(vals) * len(vals) * mean_v)

    ns = _to_float(queue.get("N"), 0.0) + _to_float(queue.get("S"), 0.0)
    ew = _to_float(queue.get("E"), 0.0) + _to_float(queue.get("W"), 0.0)
    pressure_mean = ew - ns

    discharge_rate = {"N": 0.0, "S": 0.0, "E": 0.0, "W": 0.0}
    if len(history) >= 2:
        t0 = _to_float(history[0].get("t"), 0.0)
        t1 = _to_float(history[-1].get("t"), t0)
        span = max(1e-6, t1 - t0)
        for arm in ["N", "S", "E", "W"]:
            discharged = 0.0
            prev = _to_float(history[0].get(arm), 0.0)
            for p in history[1:]:
                curr = _to_float(p.get(arm), 0.0)
                discharged += max(prev - curr, 0.0)
                prev = curr
            discharge_rate[arm] = round(discharged / span, 3)

    tts = {}
    for arm in ["N", "S", "E", "W"]:
        q = _to_float(queue.get(arm), 0.0)
        rate = max(0.0, discharge_rate.get(arm, 0.0))
        tts[arm] = 60.0 if rate <= 0 else round(min(300.0, q / rate), 1)

    return {
        "saturation": saturation,
        "gini": round(gini, 4),
        "pressure_mean": round(pressure_mean, 2),
        "discharge_rate": discharge_rate,
        "time_to_starvation": tts,
        "trajectory_rows": len(history),
    }


@api_bp.route("/simulations")
def list_simulations_addon():
    page = max(1, request.args.get("page", 1, type=int))
    per_page = request.args.get("per_page", 20, type=int)
    per_page = max(1, min(per_page, 100))

    store = _get_store()
    sessions = store.list_sessions(limit=1000)
    total = len(sessions)
    total_pages = max(1, math.ceil(total / per_page))
    start = (page - 1) * per_page
    end = start + per_page
    items = sessions[start:end]

    sims = []
    for row in items:
        session_id = str(row.get("notes") or row.get("id"))
        runtime = _runtime_or_fallback(session_id, row)
        created_at = row.get("created_at")
        created_str = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)
        sim_cfg = row.get("sim_config") or {}
        sims.append(
            {
                "id": session_id,
                "created_at": created_str,
                "intersection": sim_cfg.get("intersection_type", "four_way"),
                "total_vehicles": runtime.get("exited", 0),
                "duration_min": runtime.get("sim_duration_min", 0),
                "throughput_vph": runtime.get("throughput", 0),
                "status": _map_sim_status(row.get("status", runtime.get("sim_status", "done"))),
            }
        )

    return jsonify(
        {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
            "sims": sims,
        }
    )


@api_bp.route("/status/<session_id>")
def analyzer_status(session_id):
    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return jsonify({"error": f"Session '{session_id}' not found"}), 404
    return jsonify(_runtime_or_fallback(session_id, session))


@api_bp.route("/report/<session_id>")
def analyzer_report(session_id):
    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return jsonify({"error": f"Session '{session_id}' not found"}), 404
    runtime = _runtime_or_fallback(session_id, session)
    payload = _build_report_payload(store, session_id, session, runtime)
    return jsonify(payload)


@api_bp.route("/debug/<session_id>")
def analyzer_debug(session_id):
    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return jsonify({"error": f"Session '{session_id}' not found"}), 404
    episodes = store.get_episodes(session_id, limit=10)
    return jsonify(
        {
            "session": session,
            "runtime": _runtime_or_fallback(session_id, session),
            "episodes_tail": episodes[-10:],
        }
    )


@api_bp.route("/calculate/<session_id>", methods=["GET", "POST"])
def analyzer_calculate(session_id):
    store = _get_store()
    session = store.get_session(session_id)
    if session is None:
        return jsonify({"error": f"Session '{session_id}' not found"}), 404

    if request.method == "GET":
        existing = _calculated_metrics.get(session_id)
        if existing is None:
            return jsonify({"error": "Not calculated yet"}), 404
        return jsonify(existing)

    runtime = _runtime_or_fallback(session_id, session)
    data = _compute_calculated_metrics(runtime)
    _calculated_metrics[session_id] = data
    return jsonify(data)


# ---------------------------------------------------------------------------
# Decision data endpoints (RL XAI dashboard)
# ---------------------------------------------------------------------------

@api_bp.route("/decisions/<session_id>", methods=["GET"])
def get_decision_episodes(session_id: str):
    """Return episode summary list for the Decision Replay page."""
    from backend.rl.decision_store import STORE
    episodes = STORE.get_episodes(session_id)
    return jsonify(episodes), 200


@api_bp.route("/decisions/<session_id>/<int:ep_num>", methods=["GET"])
def get_decision_episode(session_id: str, ep_num: int):
    """Return full decision data for one episode."""
    from backend.rl.decision_store import STORE
    episode = STORE.get_episode(session_id, ep_num)
    if episode is None:
        return jsonify({"error": "Episode not found"}), 404
    return jsonify(episode), 200
