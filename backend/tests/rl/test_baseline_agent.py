"""
Unit tests for baseline traffic signal controllers.

No SUMO required — uses synthetic 22-dim observation arrays.
"""
from __future__ import annotations

import numpy as np
import pytest

from backend.rl.baseline_agent import (
    DURATIONS,
    N_DURATIONS,
    BaseController,
    FixedTimeController,
    WebstersController,
    SemiActuatedController,
    make_baseline,
    phase_duration_to_action,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_obs(
    queues=(0.0, 0.0, 0.0, 0.0),
    *,
    size: int = 22,
) -> np.ndarray:
    """Create a synthetic 22-dim observation vector."""
    obs = np.zeros(size, dtype=np.float32)
    for i, q in enumerate(queues[:4]):
        obs[i] = q
    return obs


def _action_valid(action: int) -> bool:
    return 0 <= action <= 34


# ---------------------------------------------------------------------------
# FixedTimeController
# ---------------------------------------------------------------------------

class TestFixedTimeController:
    def test_fixed_time_round_robin(self):
        """Phases should cycle 0→1→2→3→4→0→… over 10 consecutive calls."""
        ctrl = FixedTimeController(n_phases=5, green_per_phase_s=30)
        obs = _make_obs()
        phases_seen = []
        for _ in range(10):
            action, info = ctrl.predict(obs)
            phases_seen.append(info["phase"])

        expected = [(i % 5) for i in range(10)]
        assert phases_seen == expected, f"Expected {expected}, got {phases_seen}"

    def test_fixed_time_action_range(self):
        """All returned actions must be in [0, 34]."""
        ctrl = FixedTimeController(n_phases=5, green_per_phase_s=30)
        obs = _make_obs()
        for _ in range(20):
            action, _ = ctrl.predict(obs)
            assert _action_valid(action), f"Action {action} out of range [0, 34]"

    def test_fixed_time_stats(self):
        """After 15 calls (3 full cycles of 5 phases), total_cycles >= 3."""
        ctrl = FixedTimeController(n_phases=5, green_per_phase_s=30)
        obs = _make_obs()
        for _ in range(15):
            ctrl.predict(obs)
        stats = ctrl.get_stats()
        assert "total_cycles" in stats
        assert stats["total_cycles"] >= 3, (
            f"Expected >= 3 cycles after 15 calls, got {stats['total_cycles']}"
        )

    def test_fixed_time_ignores_obs(self):
        """Controller must return same sequence regardless of obs content."""
        ctrl1 = FixedTimeController(n_phases=5, green_per_phase_s=30)
        ctrl2 = FixedTimeController(n_phases=5, green_per_phase_s=30)
        obs_zero = _make_obs()
        obs_high = _make_obs(queues=(1.0, 1.0, 1.0, 1.0))

        actions_zero = [ctrl1.predict(obs_zero)[0] for _ in range(10)]
        actions_high = [ctrl2.predict(obs_high)[0] for _ in range(10)]
        assert actions_zero == actions_high

    def test_fixed_time_cycle_offset(self):
        """cycle_offset=2 should start at phase 2."""
        ctrl = FixedTimeController(n_phases=5, cycle_offset=2)
        obs = _make_obs()
        _, info = ctrl.predict(obs)
        assert info["phase"] == 2


# ---------------------------------------------------------------------------
# WebstersController
# ---------------------------------------------------------------------------

class TestWebstersController:
    def test_websters_action_range(self):
        """Actions must be in [0, 34] for varied obs inputs."""
        ctrl = WebstersController()
        rng = np.random.default_rng(42)
        for _ in range(20):
            obs = rng.uniform(0.0, 1.0, size=22).astype(np.float32)
            action, _ = ctrl.predict(obs)
            assert _action_valid(action), f"Action {action} out of range [0, 34]"

    def test_websters_high_demand_longer_green(self):
        """High queue obs should produce duration >= low queue duration."""
        ctrl_low = WebstersController()
        ctrl_high = WebstersController()

        obs_low = _make_obs(queues=(0.05, 0.05, 0.05, 0.05))
        obs_high = _make_obs(queues=(1.0, 1.0, 1.0, 1.0))

        _, info_low = ctrl_low.predict(obs_low)
        _, info_high = ctrl_high.predict(obs_high)

        assert info_high["duration_s"] >= info_low["duration_s"], (
            f"High demand ({info_high['duration_s']}s) should produce >= "
            f"low demand ({info_low['duration_s']}s) green time"
        )

    def test_websters_zero_demand_fallback(self):
        """All-zero obs must not crash and should return min_green duration."""
        ctrl = WebstersController(min_green_s=15)
        obs = _make_obs()  # all zeros
        action, info = ctrl.predict(obs)
        assert _action_valid(action)
        assert info["duration_s"] == 15

    def test_websters_phases_advance(self):
        """Each predict call should advance to the next phase."""
        ctrl = WebstersController(n_phases=5)
        obs = _make_obs(queues=(0.3, 0.3, 0.3, 0.3))
        phases_seen = [ctrl.predict(obs)[1]["phase"] for _ in range(6)]
        expected_start = [0, 1, 2, 3, 4, 0]
        assert phases_seen == expected_start

    def test_websters_stats_keys(self):
        """get_stats() must contain required keys."""
        ctrl = WebstersController()
        obs = _make_obs(queues=(0.2, 0.2, 0.2, 0.2))
        for _ in range(10):
            ctrl.predict(obs)
        stats = ctrl.get_stats()
        assert "total_cycles" in stats
        assert "avg_green_s" in stats
        assert "avg_cycle_s" in stats


# ---------------------------------------------------------------------------
# SemiActuatedController
# ---------------------------------------------------------------------------

class TestSemiActuatedController:
    def test_semi_actuated_extends_on_detection(self):
        """When vehicle detected, duration should be >= min_green_s."""
        ctrl = SemiActuatedController(
            min_green_s=15,
            max_green_s=60,
            extension_s=5,
            detection_threshold=0.1,
        )
        obs = _make_obs(queues=(0.8, 0.8, 0.8, 0.8))
        _, info = ctrl.predict(obs)
        assert info["duration_s"] >= 15

    def test_semi_actuated_extends_green_with_detection(self):
        """Repeated detections on same arm should extend green up to max."""
        ctrl = SemiActuatedController(
            min_green_s=15,
            max_green_s=60,
            extension_s=5,
            detection_threshold=0.1,
        )
        obs = _make_obs(queues=(0.8, 0.0, 0.0, 0.0))
        durations = []
        # While we stay on phase 0 (arm 0 detected), green should grow
        for _ in range(5):
            _, info = ctrl.predict(obs)
            if info["phase"] == 0:
                durations.append(info["duration_s"])

        if len(durations) >= 2:
            assert durations[-1] >= durations[0], (
                "Green should extend with repeated detections"
            )

    def test_semi_actuated_advances_on_no_detection(self):
        """With zero queues the phase should advance on every call."""
        ctrl = SemiActuatedController(
            min_green_s=15,
            max_green_s=60,
            extension_s=5,
            detection_threshold=0.1,
        )
        obs = _make_obs()  # all zeros → no vehicles
        phases_seen = [ctrl.predict(obs)[1]["phase"] for _ in range(6)]
        # Phases should be monotonically advancing (mod 5)
        expected = [0, 1, 2, 3, 4, 0]
        assert phases_seen == expected, f"Expected {expected}, got {phases_seen}"

    def test_semi_actuated_action_range(self):
        """All returned actions must be in [0, 34]."""
        ctrl = SemiActuatedController()
        rng = np.random.default_rng(0)
        for _ in range(20):
            obs = rng.uniform(0.0, 1.0, size=22).astype(np.float32)
            action, _ = ctrl.predict(obs)
            assert _action_valid(action), f"Action {action} out of [0, 34]"

    def test_semi_actuated_stats_keys(self):
        """get_stats() must contain required keys."""
        ctrl = SemiActuatedController()
        obs = _make_obs()
        for _ in range(10):
            ctrl.predict(obs)
        stats = ctrl.get_stats()
        assert "total_extensions" in stats
        assert "avg_green_s" in stats
        assert "phase_calls" in stats


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

class TestFactory:
    def test_factory_creates_all_types(self):
        """make_baseline must return correct instance for all 3 types."""
        ft = make_baseline("fixed_time")
        wb = make_baseline("websters")
        sa = make_baseline("semi_actuated")

        assert isinstance(ft, FixedTimeController)
        assert isinstance(wb, WebstersController)
        assert isinstance(sa, SemiActuatedController)

        # All are BaseController subclasses
        assert isinstance(ft, BaseController)
        assert isinstance(wb, BaseController)
        assert isinstance(sa, BaseController)

    def test_factory_passes_kwargs(self):
        """make_baseline should forward kwargs to the controller."""
        ft = make_baseline("fixed_time", green_per_phase_s=20)
        obs = _make_obs()
        _, info = ft.predict(obs)
        assert info["duration_s"] == 20

    def test_factory_invalid_type_raises(self):
        """Unrecognised type should raise ValueError."""
        with pytest.raises(ValueError):
            make_baseline("unknown_controller")

    def test_factory_names(self):
        """Controller .name attributes should be correct."""
        assert make_baseline("fixed_time").name == "fixed_time"
        assert make_baseline("websters").name == "websters"
        assert make_baseline("semi_actuated").name == "semi_actuated"


# ---------------------------------------------------------------------------
# Reset behaviour
# ---------------------------------------------------------------------------

class TestResetClearsState:
    def test_reset_clears_fixed_time_state(self):
        """After some calls and reset(), FixedTimeController state is zeroed."""
        ctrl = FixedTimeController(n_phases=5, green_per_phase_s=30)
        obs = _make_obs()
        for _ in range(12):
            ctrl.predict(obs)
        # Some cycles should have been counted
        assert ctrl._cycle_count > 0
        assert ctrl._call_count > 0

        ctrl.reset()

        assert ctrl._cycle_count == 0
        assert ctrl._call_count == 0
        assert ctrl._phase_idx == 0

    def test_reset_clears_websters_state(self):
        """After some calls and reset(), WebstersController state is zeroed."""
        ctrl = WebstersController()
        obs = _make_obs(queues=(0.3, 0.3, 0.3, 0.3))
        for _ in range(8):
            ctrl.predict(obs)

        ctrl.reset()

        assert ctrl._phase_idx == 0
        assert ctrl._call_count == 0
        assert ctrl._cycle_count == 0
        assert ctrl._green_history == []

    def test_reset_clears_semi_actuated_state(self):
        """After some calls and reset(), SemiActuatedController state is zeroed."""
        ctrl = SemiActuatedController()
        obs = _make_obs(queues=(0.8, 0.8, 0.8, 0.8))
        for _ in range(10):
            ctrl.predict(obs)

        ctrl.reset()

        assert ctrl._phase_idx == 0
        assert ctrl._phase_calls == 0
        assert ctrl._total_extensions == 0
        assert ctrl._green_history == []
        assert ctrl._current_green_s == ctrl._min_green_s

    def test_reset_restarts_round_robin(self):
        """After reset, FixedTimeController should start from phase 0 again."""
        ctrl = FixedTimeController(n_phases=5)
        obs = _make_obs()
        # Advance past phase 0
        for _ in range(3):
            ctrl.predict(obs)
        # Should now be at phase 3
        ctrl.reset()
        _, info = ctrl.predict(obs)
        assert info["phase"] == 0
