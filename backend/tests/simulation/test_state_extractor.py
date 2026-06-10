"""Tests for StateExtractor."""
import numpy as np
import pytest
from backend.simulation.state_extractor import StateExtractor, ARMS
from backend.simulation.sumo_env import SimFrame, VehicleState, SignalState


def make_frame(vehicles=None, step=1, sim_time=10.0, throughput=5):
    return SimFrame(
        step=step,
        sim_time=sim_time,
        vehicles=vehicles or [],
        signals=[
            SignalState(
                junction_id="center",
                phase_index=0,
                phase_duration=25.0,
                state_string="GGGGrrrr",
            )
        ],
        queue_per_lane={},
        wait_per_lane={},
        throughput_this_step=throughput,
        collision_ids=[],
    )


def make_vehicle(arm="N", waiting=True, wait_time=30.0, type_id="car"):
    return VehicleState(
        vehicle_id="v1",
        type_id=type_id,
        x=10.0, y=20.0, angle=0.0, speed=0.0 if waiting else 5.0,
        lane_id=f"{arm.lower()}_lane_0",
        arm=arm,
        waiting=waiting,
        wait_time=wait_time,
    )


def test_state_vector_shape():
    extractor = StateExtractor()
    frame = make_frame()
    state, _ = extractor.extract(frame)
    assert state.shape == (22,)
    assert state.dtype == np.float32


def test_state_vector_normalised():
    extractor = StateExtractor()
    vehicles = [make_vehicle(arm, True, 60.0) for arm in ARMS for _ in range(5)]
    frame = make_frame(vehicles=vehicles)
    state, _ = extractor.extract(frame)
    assert np.all(state >= 0.0), "State has negative values"
    assert np.all(state <= 1.0), "State exceeds 1.0"


def test_queue_reflected_in_state():
    extractor = StateExtractor()
    vehicles = [make_vehicle("N", waiting=True, wait_time=30.0) for _ in range(10)]
    frame = make_frame(vehicles=vehicles)
    state, _ = extractor.extract(frame)
    north_queue_idx = 0  # N is index 0
    assert state[north_queue_idx] > 0.0


def test_no_vehicles_gives_zero_state():
    extractor = StateExtractor()
    frame = make_frame(vehicles=[])
    state, _ = extractor.extract(frame)
    # Queue, wait, flow dims should all be 0
    assert np.all(state[:16] == 0.0)


def test_heavy_vehicle_ratio():
    extractor = StateExtractor()
    vehicles = [
        make_vehicle("N", type_id="tsrtc_bus", waiting=True),
        make_vehicle("N", type_id="car", waiting=True),
    ]
    frame = make_frame(vehicles=vehicles)
    state, _ = extractor.extract(frame)
    heavy_ratio_N = state[12]  # heavy ratio for N arm
    assert 0.4 < heavy_ratio_N < 0.6  # 1 of 2 vehicles is heavy


def test_emergency_flag():
    extractor = StateExtractor()
    vehicles = [make_vehicle("N", type_id="ambulance")]
    frame = make_frame(vehicles=vehicles)
    state, _ = extractor.extract(frame)
    assert state[20] == 1.0


def test_adverse_severity_clamped():
    extractor = StateExtractor()
    frame = make_frame()
    state, _ = extractor.extract(frame, adverse_severity=2.5)
    assert state[21] == 1.0
    state2, _ = extractor.extract(frame, adverse_severity=-0.5)
    assert state2[21] == 0.0


def test_frame_dict_structure():
    extractor = StateExtractor()
    frame = make_frame(vehicles=[make_vehicle("N")])
    _, frame_dict = extractor.extract(frame)
    assert "vehicles" in frame_dict
    assert "signals" in frame_dict
    assert "queue_per_arm" in frame_dict
    assert "wait_per_arm" in frame_dict
    assert set(frame_dict["queue_per_arm"].keys()) == {"N", "S", "E", "W"}


def test_phase_elapsed_normalised():
    extractor = StateExtractor(max_phase_duration=90.0)
    frame = make_frame()
    state, _ = extractor.extract(frame, current_phase=2, phase_elapsed_s=45.0)
    assert abs(state[17] - 0.5) < 0.01  # 45/90 = 0.5
