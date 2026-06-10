"""
Extracts the 22-dimensional RL state vector from a SUMO SimFrame.
Also produces a Socket.IO-ready frame dict for frontend rendering.

State vector layout (22 dims, all normalised to [0,1]):
  [0-3]   queue_per_lane (N,S,E,W) — max=50 vehicles
  [4-7]   avg_wait_per_lane (N,S,E,W) — max=120s
  [8-11]  flow_rate_per_lane (N,S,E,W) — vehicles/min, max=30
  [12-15] heavy_vehicle_ratio_per_lane (N,S,E,W) — 0.0-1.0
  [16]    current_phase — normalised 0-1 (phase_idx / max_phases)
  [17]    phase_elapsed_norm — 0.0-1.0 (elapsed / max_duration)
  [18]    time_of_day_norm — 0.0-1.0 (sim_hour / 24)
  [19]    total_intersection_delay — sum(waits) / (n_vehicles * 120), capped 1.0
  [20]    emergency_vehicle_flag — 0 or 1
  [21]    adverse_severity_norm — 0.0-1.0
"""
import math
import time as wall_time
from typing import Dict, List, Optional, Tuple
import numpy as np

from backend.simulation.sumo_env import SimFrame, VehicleState

ARMS = ["N", "S", "E", "W"]
MAX_QUEUE = 50.0
MAX_WAIT_S = 120.0
MAX_FLOW_PER_MIN = 30.0
MAX_PHASES = 5.0

# Vehicle types considered "heavy" (longer clearance time)
HEAVY_TYPES = {"tsrtc_bus", "school_bus", "truck"}
EMERGENCY_TYPES = {"ambulance", "fire_truck", "police"}


class StateExtractor:
    """
    Converts raw SimFrame data into:
    1. A normalised 22-dim numpy state vector for the RL agent
    2. A JSON-serialisable frame dict for Socket.IO broadcast
    """

    def __init__(
        self,
        max_phase_duration: float = 90.0,
        sim_start_wall: Optional[float] = None,
        sim_duration_s: float = 3600.0,
    ):
        self.max_phase_duration = max_phase_duration
        self.sim_start_wall = sim_start_wall or wall_time.time()
        self.sim_duration_s = sim_duration_s
        self._flow_history: Dict[str, List[int]] = {arm: [] for arm in ARMS}
        self._last_step = 0

    def extract(
        self,
        frame: SimFrame,
        current_phase: int = 0,
        phase_elapsed_s: float = 0.0,
        adverse_severity: float = 0.0,
    ) -> Tuple[np.ndarray, dict]:
        """
        Returns (state_vector, frame_dict).

        state_vector: np.ndarray shape (22,) dtype float32, all in [0,1]
        frame_dict: JSON-serialisable dict for Socket.IO sim:frame event
        """
        arm_queues, arm_waits, arm_heavies, arm_counts = self._aggregate_by_arm(frame)
        arm_flows = self._compute_flow_rates(arm_counts, frame.step)
        emergency_flag = self._detect_emergency(frame)

        # time_of_day from sim_time (seconds → hour fraction)
        sim_hour = (frame.sim_time % 86400) / 3600.0
        time_of_day_norm = sim_hour / 24.0

        # total intersection delay
        total_delay = self._total_delay_norm(frame)

        vec = np.zeros(22, dtype=np.float32)
        for i, arm in enumerate(ARMS):
            vec[i]      = min(arm_queues.get(arm, 0) / MAX_QUEUE, 1.0)
            vec[i + 4]  = min(arm_waits.get(arm, 0.0) / MAX_WAIT_S, 1.0)
            vec[i + 8]  = min(arm_flows.get(arm, 0.0) / MAX_FLOW_PER_MIN, 1.0)
            vec[i + 12] = arm_heavies.get(arm, 0.0)

        vec[16] = min(current_phase / MAX_PHASES, 1.0)
        vec[17] = min(phase_elapsed_s / max(self.max_phase_duration, 1.0), 1.0)
        vec[18] = time_of_day_norm
        vec[19] = total_delay
        vec[20] = float(emergency_flag)
        vec[21] = min(max(adverse_severity, 0.0), 1.0)

        frame_dict = self._build_frame_dict(frame, arm_queues, arm_waits)
        self._last_step = frame.step

        return vec, frame_dict

    def _aggregate_by_arm(
        self, frame: SimFrame
    ) -> Tuple[Dict[str, int], Dict[str, float], Dict[str, float], Dict[str, int]]:
        """
        Returns per-arm: queue counts, avg wait times, heavy vehicle ratio, total count.
        """
        queues: Dict[str, int] = {arm: 0 for arm in ARMS}
        wait_totals: Dict[str, float] = {arm: 0.0 for arm in ARMS}
        heavy_counts: Dict[str, int] = {arm: 0 for arm in ARMS}
        total_counts: Dict[str, int] = {arm: 0 for arm in ARMS}

        for v in frame.vehicles:
            arm = v.arm
            if arm not in ARMS:
                continue
            total_counts[arm] += 1
            if v.waiting:
                queues[arm] += 1
            wait_totals[arm] += v.wait_time
            if v.type_id in HEAVY_TYPES:
                heavy_counts[arm] += 1

        avg_waits = {
            arm: wait_totals[arm] / max(total_counts[arm], 1)
            for arm in ARMS
        }
        heavy_ratio = {
            arm: heavy_counts[arm] / max(total_counts[arm], 1)
            for arm in ARMS
        }
        return queues, avg_waits, heavy_ratio, total_counts

    def _compute_flow_rates(
        self, arm_counts: Dict[str, int], step: int
    ) -> Dict[str, float]:
        """
        Estimate flow rate (vehicles/min) for each arm using a 10-step rolling window.
        """
        steps_elapsed = max(step - self._last_step, 1)
        for arm in ARMS:
            self._flow_history[arm].append(arm_counts.get(arm, 0))
            if len(self._flow_history[arm]) > 10:
                self._flow_history[arm].pop(0)

        flow_rates = {}
        for arm in ARMS:
            hist = self._flow_history[arm]
            avg_per_step = sum(hist) / max(len(hist), 1)
            flow_rates[arm] = avg_per_step * 60.0 / 0.5  # per step / step_length
        return flow_rates

    def _detect_emergency(self, frame: SimFrame) -> bool:
        """Return True if any emergency vehicle is in the frame."""
        return any(v.type_id in EMERGENCY_TYPES for v in frame.vehicles)

    def _total_delay_norm(self, frame: SimFrame) -> float:
        """Total wait time across all vehicles, normalised by (n_vehicles * max_wait)."""
        if not frame.vehicles:
            return 0.0
        total = sum(v.wait_time for v in frame.vehicles)
        max_possible = len(frame.vehicles) * MAX_WAIT_S
        return min(total / max(max_possible, 1.0), 1.0)

    def _build_frame_dict(
        self,
        frame: SimFrame,
        arm_queues: Dict[str, int],
        arm_waits: Dict[str, float],
    ) -> dict:
        """Build JSON-serialisable dict for Socket.IO sim:frame broadcast."""
        return {
            "step": frame.step,
            "sim_time": round(frame.sim_time, 1),
            "vehicles": [
                {
                    "id": v.vehicle_id,
                    "type": v.type_id,
                    "x": round(v.x, 2),
                    "y": round(v.y, 2),
                    "angle": round(v.angle, 1),
                    "speed": round(v.speed, 2),
                    "arm": v.arm,
                    "waiting": v.waiting,
                    "wait_time": round(v.wait_time, 1),
                }
                for v in frame.vehicles
            ],
            "signals": [
                {
                    "junction_id": s.junction_id,
                    "phase_index": s.phase_index,
                    "phase_duration": round(s.phase_duration, 1),
                    "state_string": s.state_string,
                }
                for s in frame.signals
            ],
            "queue_per_arm": {arm: arm_queues.get(arm, 0) for arm in ARMS},
            "wait_per_arm": {arm: round(arm_waits.get(arm, 0.0), 2) for arm in ARMS},
            "throughput": frame.throughput_this_step,
            "collision_ids": frame.collision_ids,
        }
