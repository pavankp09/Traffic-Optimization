"""
Metrics Calculator for Traffic Signal Optimization.

Computes per-episode and aggregate session metrics from simulation frame data.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import Optional


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class VehicleMetrics:
    type_id: str
    count: int
    avg_wait_s: float
    avg_queue_len: float
    throughput_vph: float


@dataclass
class ArmMetrics:
    arm: str                  # "N", "S", "E", "W"
    queue_len: float
    avg_wait_s: float
    flow_rate_vph: float
    heavy_vehicle_ratio: float
    green_time_used_s: float
    green_time_total_s: float


@dataclass
class EpisodeMetrics:
    episode_id: str
    session_id: str
    duration_s: int
    n_vehicles: int
    avg_wait_s: float
    per_type: dict                  # dict[str, VehicleMetrics]
    per_arm: dict                   # dict[str, ArmMetrics]
    throughput_vph: float
    green_utilisation: float        # actual_green_s / total_green_available_s
    collision_count: int
    violation_count: int
    signal_efficiency: float        # throughput_vph / 1800
    avg_phase_duration_s: float
    adverse_events_count: int
    total_delay_veh_hrs: float      # sum(wait_s) / 3600


# ---------------------------------------------------------------------------
# Heavy vehicle types
# ---------------------------------------------------------------------------
HEAVY_VEHICLE_TYPES = {"tsrtc_bus", "school_bus", "truck"}

# Saturation flow rate used as denominator for signal efficiency
SATURATION_FLOW_VPH = 1800.0


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class MetricsCalculator:
    """Compute traffic metrics from simulation episode data."""

    def __init__(self, vehicle_types: dict = None):
        if vehicle_types is None:
            from backend.simulation.vehicle_types import VEHICLE_TYPES
            vehicle_types = VEHICLE_TYPES
        self.vehicle_types = vehicle_types

    # ------------------------------------------------------------------
    def compute_episode_metrics(
        self,
        episode_id: str,
        session_id: str,
        frames: list,           # list of SimFrame dicts
        phase_log: list,        # [{"phase": int, "duration_s": int, "step": int}]
        adverse_events: list,   # [{"event_type": str, "severity": float}]
    ) -> EpisodeMetrics:
        """Compute full EpisodeMetrics from raw frame + phase + adverse-event data."""

        # ---- Duration --------------------------------------------------
        if frames:
            raw_duration = max(f.get("sim_time_s", 0.0) for f in frames)
        else:
            raw_duration = 0.0
        duration_s = int(max(raw_duration, 1.0))
        n_frames = max(len(frames), 1)

        # ---- Collect all vehicle observations --------------------------
        # unique_vehicles: id -> last observed type_id
        unique_vehicles: dict[str, str] = {}
        # all observations: list of vehicle dicts (one entry per frame per vehicle)
        all_obs: list[dict] = []

        for frame in frames:
            for v in frame.get("vehicles", []):
                vid = v.get("id", "")
                unique_vehicles[vid] = v.get("type_id", "unknown")
                all_obs.append(v)

        n_vehicles = len(unique_vehicles)

        # ---- avg_wait_s (mean across all observations) -----------------
        if all_obs:
            avg_wait_s = sum(v.get("wait_time", 0.0) for v in all_obs) / len(all_obs)
        else:
            avg_wait_s = 0.0

        # ---- total_delay_veh_hrs ---------------------------------------
        total_delay_veh_hrs = sum(v.get("wait_time", 0.0) for v in all_obs) / 3600.0

        # ---- per_type --------------------------------------------------
        type_obs: dict[str, list[dict]] = {}
        for v in all_obs:
            tid = v.get("type_id", "unknown")
            type_obs.setdefault(tid, []).append(v)

        per_type: dict[str, VehicleMetrics] = {}
        dur_hr = max(duration_s, 1) / 3600.0
        for tid, obs in type_obs.items():
            t_avg_wait = sum(o.get("wait_time", 0.0) for o in obs) / max(len(obs), 1)
            # unique count of this type
            t_count = sum(1 for uid, utype in unique_vehicles.items() if utype == tid)
            t_throughput = t_count / dur_hr
            # queue: vehicles with speed < 0.5
            t_queue = sum(1 for o in obs if o.get("speed", 0.0) < 0.5) / n_frames
            per_type[tid] = VehicleMetrics(
                type_id=tid,
                count=t_count,
                avg_wait_s=t_avg_wait,
                avg_queue_len=t_queue,
                throughput_vph=t_throughput,
            )

        # ---- per_arm ---------------------------------------------------
        arm_obs: dict[str, list[dict]] = {}
        for v in all_obs:
            arm = v.get("arm", "")
            if arm in ("N", "S", "E", "W"):
                arm_obs.setdefault(arm, []).append(v)

        per_arm: dict[str, ArmMetrics] = {}
        for arm in ("N", "S", "E", "W"):
            obs = arm_obs.get(arm, [])
            if obs:
                a_avg_wait = sum(o.get("wait_time", 0.0) for o in obs) / len(obs)
                a_queue = sum(1 for o in obs if o.get("speed", 0.0) < 0.5) / n_frames
                # flow_rate: vehicles with speed > 1.0, extrapolated to vph
                fast_count = sum(1 for o in obs if o.get("speed", 0.0) > 1.0)
                # fast_count observations across all frames -> avg per frame -> * frames_per_hour
                frames_per_hour = n_frames / max(duration_s / 3600.0, 1e-9)
                a_flow_rate = (fast_count / n_frames) * frames_per_hour
                heavy_count = sum(
                    1 for o in obs if o.get("type_id", "") in HEAVY_VEHICLE_TYPES
                )
                a_heavy_ratio = heavy_count / max(len(obs), 1)
            else:
                a_avg_wait = 0.0
                a_queue = 0.0
                a_flow_rate = 0.0
                a_heavy_ratio = 0.0

            per_arm[arm] = ArmMetrics(
                arm=arm,
                queue_len=a_queue,
                avg_wait_s=a_avg_wait,
                flow_rate_vph=a_flow_rate,
                heavy_vehicle_ratio=a_heavy_ratio,
                green_time_used_s=0.0,   # not tracked at per-arm level from frames alone
                green_time_total_s=float(duration_s),
            )

        # ---- throughput_vph --------------------------------------------
        throughput_vph = n_vehicles / dur_hr

        # ---- green_utilisation -----------------------------------------
        # total green s = sum of phase durations that are "green" (all phases count here)
        if phase_log:
            total_green_s = sum(p.get("duration_s", 0) for p in phase_log)
        else:
            total_green_s = duration_s  # assume full green if no log
        green_utilisation = min(total_green_s / max(duration_s, 1), 1.0)

        # ---- adverse event counts --------------------------------------
        collision_types = {"collision", "rear_end"}
        violation_types = {"red_light_running", "speed_violation"}
        collision_count = sum(
            1 for e in adverse_events if e.get("event_type", "") in collision_types
        )
        violation_count = sum(
            1 for e in adverse_events if e.get("event_type", "") in violation_types
        )
        adverse_events_count = len(adverse_events)

        # ---- signal_efficiency -----------------------------------------
        signal_efficiency = throughput_vph / SATURATION_FLOW_VPH

        # ---- avg_phase_duration_s --------------------------------------
        if phase_log:
            avg_phase_duration_s = sum(p.get("duration_s", 0) for p in phase_log) / len(phase_log)
        else:
            avg_phase_duration_s = 30.0

        return EpisodeMetrics(
            episode_id=episode_id,
            session_id=session_id,
            duration_s=duration_s,
            n_vehicles=n_vehicles,
            avg_wait_s=avg_wait_s,
            per_type=per_type,
            per_arm=per_arm,
            throughput_vph=throughput_vph,
            green_utilisation=green_utilisation,
            collision_count=collision_count,
            violation_count=violation_count,
            signal_efficiency=signal_efficiency,
            avg_phase_duration_s=avg_phase_duration_s,
            adverse_events_count=adverse_events_count,
            total_delay_veh_hrs=total_delay_veh_hrs,
        )

    # ------------------------------------------------------------------
    def compute_delta(
        self,
        baseline: EpisodeMetrics,
        rl: EpisodeMetrics,
    ) -> dict:
        """
        Compute improvement deltas (positive = RL better).
        """
        wait_reduction_s = baseline.avg_wait_s - rl.avg_wait_s
        wait_reduction_pct = (
            wait_reduction_s / max(baseline.avg_wait_s, 1e-9) * 100.0
        )
        return {
            "wait_reduction_s": wait_reduction_s,
            "throughput_gain_vph": rl.throughput_vph - baseline.throughput_vph,
            "green_util_improvement": rl.green_utilisation - baseline.green_utilisation,
            "collision_reduction": baseline.collision_count - rl.collision_count,
            "violation_reduction": baseline.violation_count - rl.violation_count,
            "efficiency_gain": rl.signal_efficiency - baseline.signal_efficiency,
            "delay_reduction_veh_hrs": baseline.total_delay_veh_hrs - rl.total_delay_veh_hrs,
            "wait_reduction_pct": wait_reduction_pct,
        }

    # ------------------------------------------------------------------
    def to_db_record(self, metrics: EpisodeMetrics) -> dict:
        """
        Convert EpisodeMetrics to a flat dict suitable for MetricRecord ORM creation.
        Nested dicts (per_type, per_arm) are serialized to JSON strings.
        """
        d = asdict(metrics)
        # Serialize nested dicts to JSON strings for storage
        d["per_type"] = json.dumps(d["per_type"])
        d["per_arm"] = json.dumps(d["per_arm"])
        return d


# ---------------------------------------------------------------------------
# Standalone aggregate function
# ---------------------------------------------------------------------------

def aggregate_session_metrics(episode_metrics_list: list) -> dict:
    """
    Aggregate metrics across multiple episodes.

    Returns summary dict with n_episodes, averages, totals, and bests.
    """
    n = len(episode_metrics_list)
    if n == 0:
        return {
            "n_episodes": 0,
            "avg_wait_s": 0.0,
            "best_wait_s": 0.0,
            "avg_throughput_vph": 0.0,
            "avg_green_utilisation": 0.0,
            "total_collisions": 0,
            "total_violations": 0,
            "avg_signal_efficiency": 0.0,
        }

    avg_wait_s = sum(e.avg_wait_s for e in episode_metrics_list) / n
    best_wait_s = min(e.avg_wait_s for e in episode_metrics_list)
    avg_throughput_vph = sum(e.throughput_vph for e in episode_metrics_list) / n
    avg_green_utilisation = sum(e.green_utilisation for e in episode_metrics_list) / n
    total_collisions = sum(e.collision_count for e in episode_metrics_list)
    total_violations = sum(e.violation_count for e in episode_metrics_list)
    avg_signal_efficiency = sum(e.signal_efficiency for e in episode_metrics_list) / n

    return {
        "n_episodes": n,
        "avg_wait_s": avg_wait_s,
        "best_wait_s": best_wait_s,
        "avg_throughput_vph": avg_throughput_vph,
        "avg_green_utilisation": avg_green_utilisation,
        "total_collisions": total_collisions,
        "total_violations": total_violations,
        "avg_signal_efficiency": avg_signal_efficiency,
    }
