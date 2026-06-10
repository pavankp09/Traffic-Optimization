"""Tests for DemandGenerator."""
import os
import pytest
import xml.etree.ElementTree as ET
from backend.config import SimulationConfig
from backend.simulation.demand_generator import DemandGenerator, _poisson_intervals, _apply_pattern
import random


def test_poisson_intervals_produces_times():
    times = _poisson_intervals(0.5, 60.0, random.Random(42))
    assert len(times) > 0
    assert all(0 <= t < 60.0 for t in times)


def test_poisson_intervals_zero_rate():
    times = _poisson_intervals(0.0, 60.0, random.Random(42))
    assert times == []


def test_apply_pattern_uniform():
    assert _apply_pattern(500, 0, "uniform") == 500
    assert _apply_pattern(500, 1800, "uniform") == 500


def test_apply_pattern_morning_peak_ramps_up():
    low = _apply_pattern(1000, 0, "morning_peak")
    high = _apply_pattern(1000, 1800, "morning_peak")
    assert low < high


def test_generate_creates_valid_xml(tmp_path):
    config = SimulationConfig(
        traffic_volume_vph=300,
        vehicle_mix="hyderabad_mixed",
        arrival_distribution="uniform",
        warm_up_seconds=0,
    )
    gen = DemandGenerator(config, seed=42)
    out = str(tmp_path / "routes.rou.xml")
    result = gen.generate(out, duration_s=120.0)
    assert os.path.isfile(result)
    tree = ET.parse(result)
    root = tree.getroot()
    assert root.tag == "routes"


def test_generate_contains_vehicles(tmp_path):
    config = SimulationConfig(traffic_volume_vph=600, warm_up_seconds=0)
    gen = DemandGenerator(config, seed=1)
    out = str(tmp_path / "routes.rou.xml")
    gen.generate(out, duration_s=120.0)
    tree = ET.parse(out)
    vehicles = tree.getroot().findall("vehicle")
    assert len(vehicles) > 0


def test_generate_contains_vtypes(tmp_path):
    config = SimulationConfig(vehicle_mix="hyderabad_mixed", warm_up_seconds=0)
    gen = DemandGenerator(config, seed=0)
    out = str(tmp_path / "routes.rou.xml")
    gen.generate(out, duration_s=60.0)
    tree = ET.parse(out)
    vtypes = tree.getroot().findall("vType")
    assert len(vtypes) > 0


def test_custom_mix(tmp_path):
    config = SimulationConfig(
        vehicle_mix="custom",
        pct_car=100.0,
        pct_two_wheeler=0.0,
        pct_ev_scooter=0.0,
        pct_auto_rickshaw=0.0,
        pct_e_rickshaw=0.0,
        pct_cab=0.0,
        pct_delivery_bike=0.0,
        pct_tsrtc_bus=0.0,
        pct_school_bus=0.0,
        pct_truck=0.0,
        warm_up_seconds=0,
    )
    gen = DemandGenerator(config, seed=5)
    out = str(tmp_path / "routes.rou.xml")
    gen.generate(out, duration_s=60.0)
    tree = ET.parse(out)
    vehicles = tree.getroot().findall("vehicle")
    for v in vehicles:
        assert v.get("type") == "car"


def test_update_from_vision_adjusts_volume():
    config = SimulationConfig(traffic_volume_vph=100)
    gen = DemandGenerator(config)
    gen.update_from_vision({"N": 20, "S": 15, "E": 18, "W": 12})
    assert config.traffic_volume_vph != 100
