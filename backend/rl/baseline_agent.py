"""
Baseline traffic signal controllers for comparison with RL agent.

Provides three classical controllers:
  - FixedTimeController: equal green time per phase, round-robin
  - WebstersController: Webster's optimal cycle length formula
  - SemiActuatedController: green extends when vehicles detected

All controllers implement the same interface as the RL agent (predict/reset/get_stats).
"""
from __future__ import annotations

import numpy as np
from abc import ABC, abstractmethod
from typing import Tuple, Dict, Any

# Mirror definitions from traffic_env.py
PHASES = [0, 1, 2, 3, 4]       # 5 phases
DURATIONS = [15, 20, 25, 30, 40, 50, 60]  # 7 durations in seconds

N_PHASES = len(PHASES)       # 5
N_DURATIONS = len(DURATIONS) # 7


def phase_duration_to_action(phase_idx: int, duration_s: int) -> int:
    """Convert (phase_idx, duration_s) to flat action index [0, 34].

    Uses closest duration in DURATIONS if exact match not found.
    """
    closest = min(DURATIONS, key=lambda d: abs(d - duration_s))
    dur_idx = DURATIONS.index(closest)
    return phase_idx * N_DURATIONS + dur_idx


# ---------------------------------------------------------------------------
# Abstract base class
# ---------------------------------------------------------------------------

class BaseController(ABC):
    """Common interface that all baseline controllers must implement."""

    name: str = "base"

    @abstractmethod
    def predict(self, obs: np.ndarray) -> Tuple[int, Dict[str, Any]]:
        """Return (action, info) where action ∈ [0, 34]."""
        ...

    @abstractmethod
    def reset(self) -> None:
        """Reset all internal state."""
        ...

    @abstractmethod
    def get_stats(self) -> Dict[str, Any]:
        """Return controller performance statistics."""
        ...


# ---------------------------------------------------------------------------
# Controller 1: Fixed-Time
# ---------------------------------------------------------------------------

class FixedTimeController(BaseController):
    """Fixed-cycle, equal green time per phase controller.

    Ignores observations entirely — serves as the simplest possible baseline.
    """

    name = "fixed_time"

    def __init__(
        self,
        n_phases: int = 5,
        green_per_phase_s: int = 30,
        cycle_offset: int = 0,
    ) -> None:
        self._n_phases = n_phases
        self._green_per_phase_s = green_per_phase_s
        self._cycle_offset = cycle_offset % n_phases

        # Internal state
        self._phase_idx: int = self._cycle_offset
        self._call_count: int = 0
        self._cycle_count: int = 0

    # ------------------------------------------------------------------
    # BaseController interface
    # ------------------------------------------------------------------

    def predict(self, obs: np.ndarray) -> Tuple[int, Dict[str, Any]]:  # noqa: ARG002
        """Return next phase in round-robin sequence with fixed green time."""
        phase_idx = self._phase_idx
        duration_s = self._green_per_phase_s

        action = phase_duration_to_action(phase_idx, duration_s)

        info: Dict[str, Any] = {
            "phase": phase_idx,
            "duration_s": duration_s,
            "controller": self.name,
        }

        # Advance to next phase
        self._call_count += 1
        next_phase = (self._phase_idx + 1) % self._n_phases
        if next_phase == self._cycle_offset:
            # Completed a full cycle
            self._cycle_count += 1
        self._phase_idx = next_phase

        return action, info

    def reset(self) -> None:
        self._phase_idx = self._cycle_offset
        self._call_count = 0
        self._cycle_count = 0

    def get_stats(self) -> Dict[str, Any]:
        avg_cycle = float(self._n_phases * self._green_per_phase_s)
        return {
            "total_cycles": self._cycle_count,
            "avg_cycle_time_s": avg_cycle,
        }


# ---------------------------------------------------------------------------
# Controller 2: Webster's
# ---------------------------------------------------------------------------

class WebstersController(BaseController):
    """Webster's optimal cycle length controller.

    Adapts phase durations from traffic volume inferred from the observation
    vector:
      obs[0:4]  — queue lengths per arm (N, S, E, W), used as demand proxy
      obs[8:12] — flow rates per arm (supplementary, not used here)
    """

    name = "websters"

    def __init__(
        self,
        n_phases: int = 5,
        min_green_s: int = 15,
        max_green_s: int = 60,
        lost_time_per_phase_s: float = 4.0,
        saturation_flow_pcu: int = 1800,
    ) -> None:
        self._n_phases = n_phases
        self._min_green_s = min_green_s
        self._max_green_s = max_green_s
        self._lost_time_per_phase_s = lost_time_per_phase_s
        self._saturation_flow_pcu = saturation_flow_pcu

        # Internal state
        self._phase_idx: int = 0
        self._call_count: int = 0
        self._cycle_count: int = 0
        self._green_history: list[float] = []
        self._cycle_history: list[float] = []

    # ------------------------------------------------------------------
    # Webster's formula helpers
    # ------------------------------------------------------------------

    def _compute_green(self, obs: np.ndarray, phase_idx: int) -> int:
        """Compute Webster-optimal green time for *phase_idx* given obs."""
        # obs[0:4] are normalised queue values in [-1, 1] / [0, 1]
        # Scale to vehicles/hr equivalent (treat 1.0 → 600 veh/hr)
        queues_raw = np.clip(obs[0:4], 0.0, 1.0)  # clamp to non-negative
        demands = queues_raw * 600.0  # veh/hr equivalent

        # Assign demand to phases: phases 0-3 map to arms 0-3 directly;
        # phase 4 (pedestrian) gets the average demand.
        phase_demands: list[float] = []
        for i in range(self._n_phases):
            if i < 4:
                phase_demands.append(float(demands[i]))
            else:
                phase_demands.append(float(np.mean(demands)))

        # y_i = demand_i / saturation_flow
        y_values = [d / self._saturation_flow_pcu for d in phase_demands]
        Y = sum(y_values)

        # Fallback: if all demands are zero use minimum green
        if Y == 0.0:
            return self._min_green_s

        # Clamp Y to avoid division by zero or negative cycle
        Y = min(Y, 0.9)

        # Total lost time
        L = self._n_phases * self._lost_time_per_phase_s

        # Optimal cycle length
        C_opt = (1.5 * L + 5.0) / (1.0 - Y)
        C_opt = float(np.clip(C_opt, 30.0, 180.0))

        # Green split for this phase
        y_i = y_values[phase_idx]
        if Y > 0:
            green_i = (C_opt - L) * (y_i / Y)
        else:
            green_i = self._min_green_s

        green_i = float(np.clip(green_i, self._min_green_s, self._max_green_s))
        return int(round(green_i))

    # ------------------------------------------------------------------
    # BaseController interface
    # ------------------------------------------------------------------

    def predict(self, obs: np.ndarray) -> Tuple[int, Dict[str, Any]]:
        phase_idx = self._phase_idx
        duration_s = self._compute_green(obs, phase_idx)

        action = phase_duration_to_action(phase_idx, duration_s)

        info: Dict[str, Any] = {
            "phase": phase_idx,
            "duration_s": duration_s,
            "controller": self.name,
        }

        # Track history
        self._green_history.append(float(duration_s))
        self._call_count += 1

        # Advance to next phase
        next_phase = (self._phase_idx + 1) % self._n_phases
        if next_phase == 0:
            cycle_s = sum(self._green_history[-self._n_phases:]) if len(self._green_history) >= self._n_phases else 0.0
            if cycle_s > 0:
                self._cycle_history.append(cycle_s)
            self._cycle_count += 1
        self._phase_idx = next_phase

        return action, info

    def reset(self) -> None:
        self._phase_idx = 0
        self._call_count = 0
        self._cycle_count = 0
        self._green_history = []
        self._cycle_history = []

    def get_stats(self) -> Dict[str, Any]:
        avg_green = float(np.mean(self._green_history)) if self._green_history else 0.0
        avg_cycle = float(np.mean(self._cycle_history)) if self._cycle_history else 0.0
        return {
            "total_cycles": self._cycle_count,
            "avg_green_s": avg_green,
            "avg_cycle_s": avg_cycle,
        }


# ---------------------------------------------------------------------------
# Controller 3: Semi-Actuated
# ---------------------------------------------------------------------------

class SemiActuatedController(BaseController):
    """Semi-actuated controller: green extends while vehicles are detected.

    The current phase green time grows by `extension_s` each call as long as
    vehicles are detected on that arm and max_green_s has not been reached.
    When no vehicles are detected (or max reached) the phase advances.
    """

    name = "semi_actuated"

    def __init__(
        self,
        n_phases: int = 5,
        min_green_s: int = 15,
        max_green_s: int = 60,
        extension_s: int = 5,
        detection_threshold: float = 0.1,
    ) -> None:
        self._n_phases = n_phases
        self._min_green_s = min_green_s
        self._max_green_s = max_green_s
        self._extension_s = extension_s
        self._detection_threshold = detection_threshold

        # Internal state
        self._phase_idx: int = 0
        self._current_green_s: int = min_green_s
        self._total_extensions: int = 0
        self._phase_calls: int = 0
        self._green_history: list[float] = []

    # ------------------------------------------------------------------
    # BaseController interface
    # ------------------------------------------------------------------

    def predict(self, obs: np.ndarray) -> Tuple[int, Dict[str, Any]]:
        phase_idx = self._phase_idx

        # Map phase to arm index (phase 4 uses arm 0 as proxy)
        arm_idx = phase_idx % 4
        queue_value = float(obs[arm_idx]) if len(obs) > arm_idx else 0.0
        queue_value = max(0.0, queue_value)  # clamp negative

        vehicle_detected = queue_value > self._detection_threshold
        at_max = self._current_green_s >= self._max_green_s

        if vehicle_detected and not at_max:
            # Extend green
            self._current_green_s = min(
                self._current_green_s + self._extension_s,
                self._max_green_s,
            )
            self._total_extensions += 1
        else:
            # Record green and advance to next phase
            self._green_history.append(float(self._current_green_s))
            self._phase_idx = (self._phase_idx + 1) % self._n_phases
            self._current_green_s = self._min_green_s

        duration_s = self._current_green_s
        action = phase_duration_to_action(phase_idx, duration_s)

        self._phase_calls += 1

        info: Dict[str, Any] = {
            "phase": phase_idx,
            "duration_s": duration_s,
            "controller": self.name,
            "vehicle_detected": vehicle_detected,
        }

        return action, info

    def reset(self) -> None:
        self._phase_idx = 0
        self._current_green_s = self._min_green_s
        self._total_extensions = 0
        self._phase_calls = 0
        self._green_history = []

    def get_stats(self) -> Dict[str, Any]:
        avg_green = float(np.mean(self._green_history)) if self._green_history else 0.0
        return {
            "total_extensions": self._total_extensions,
            "avg_green_s": avg_green,
            "phase_calls": self._phase_calls,
        }


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

def make_baseline(controller_type: str, **kwargs: Any) -> BaseController:
    """Create a baseline controller by name.

    Args:
        controller_type: One of "fixed_time", "websters", "semi_actuated".
        **kwargs: Forwarded to the controller's __init__.

    Returns:
        Instantiated controller implementing BaseController.

    Raises:
        ValueError: If controller_type is not recognised.
    """
    registry: Dict[str, type] = {
        "fixed_time": FixedTimeController,
        "websters": WebstersController,
        "semi_actuated": SemiActuatedController,
    }
    if controller_type not in registry:
        raise ValueError(
            f"Unknown controller_type {controller_type!r}. "
            f"Choose from: {list(registry.keys())}"
        )
    return registry[controller_type](**kwargs)
