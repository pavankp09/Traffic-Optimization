"""Tests for AdverseInjector and sub-injectors."""
import pytest
from backend.config import AdverseConfig
from backend.simulation.adverse_injector import (
    AdverseInjector, CollisionInjector, SignalFailureInjector,
    WaterloggingInjector, AutoPickupInjector
)
import random


def make_config(**kwargs):
    cfg = AdverseConfig()
    for k, v in kwargs.items():
        setattr(cfg, k, v)
    return cfg


def test_all_off_produces_no_events():
    injector = AdverseInjector(AdverseConfig(), seed=42)
    events = injector.tick(1, 0.5, 1000, {"N": 5, "S": 3, "E": 4, "W": 2})
    assert events == []
    assert injector.severity == 0.0


def test_waterlogging_minor_produces_event():
    cfg = make_config(waterlogging="minor")
    injector = AdverseInjector(cfg, seed=0)
    events = injector.tick(1, 0.5, 1000, {"N": 5})
    wl_events = [e for e in events if e.event_type == "waterlogging"]
    assert len(wl_events) >= 1


def test_waterlogging_only_fires_once():
    cfg = make_config(waterlogging="severe")
    injector = AdverseInjector(cfg, seed=0)
    e1 = injector.tick(1, 0.5, 1000, {"N": 5})
    e2 = injector.tick(2, 0.5, 1000, {"N": 5})
    wl1 = [e for e in e1 if e.event_type == "waterlogging"]
    wl2 = [e for e in e2 if e.event_type == "waterlogging"]
    assert len(wl1) >= 1
    assert len(wl2) == 0


def test_signal_failure_episode_50pct():
    cfg = make_config(
        signal_failure_mode="full_blackout",
        signal_failure_trigger="episode_50pct",
        failure_recovery_seconds=10.0,
    )
    injector = AdverseInjector(cfg, seed=0)
    events_before = injector.tick(49, 0.5, 100, {"N": 3})
    events_at = injector.tick(50, 0.5, 100, {"N": 3})
    fail_before = [e for e in events_before if e.event_type == "signal_failure"]
    fail_at = [e for e in events_at if e.event_type == "signal_failure"]
    assert len(fail_before) == 0
    assert len(fail_at) == 1


def test_signal_failure_recovers():
    cfg = make_config(
        signal_failure_mode="all_amber",
        signal_failure_trigger="episode_50pct",
        failure_recovery_seconds=1.0,
    )
    injector = AdverseInjector(cfg, seed=0)
    injector.tick(50, 0.5, 100, {"N": 1})  # triggers
    recovery_events = injector.tick(51, 1.0, 100, {"N": 1})  # should recover
    restored = [e for e in recovery_events if e.event_type == "signal_restored"]
    assert len(restored) == 1


def test_manual_signal_failure_trigger():
    cfg = make_config(signal_failure_mode="stuck_phase", signal_failure_trigger="manual")
    injector = AdverseInjector(cfg, seed=0)
    injector.trigger_signal_failure()
    events = injector.tick(10, 0.5, 1000, {"N": 2})
    fail_events = [e for e in events if e.event_type == "signal_failure"]
    assert len(fail_events) == 1


def test_severity_increases_with_events():
    cfg = make_config(waterlogging="flash_flood", signal_failure_mode="full_blackout",
                      signal_failure_trigger="manual")
    injector = AdverseInjector(cfg, seed=0)
    injector.trigger_signal_failure()
    injector.tick(1, 0.5, 1000, {"N": 5})
    assert injector.severity > 0.0


def test_collision_clears_after_duration():
    rng = random.Random(0)
    # Use step_length=1.0 so probability*step_length=1.0 guarantees a collision each tick.
    # duration_s=1.0 <= step_length=1.0, so the cleared event fires in the same tick.
    injector = CollisionInjector(probability=1.0, duration_s=1.0, rng=rng)
    events1 = injector.tick(1, 1.0, {"N": 10})
    events2 = injector.tick(2, 1.0, {"N": 10})
    cleared = [e for e in events1 + events2 if e.event_type == "collision_cleared"]
    assert len(cleared) >= 1
