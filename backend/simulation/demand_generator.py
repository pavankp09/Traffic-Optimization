"""
Generates SUMO route files (.rou.xml) from simulation configuration.
Supports: 10 Hyderabad vehicle types, traffic patterns, Poisson/Weibull/uniform arrival,
turn ratios, warm-up period, and real vehicle counts from vision pipeline (RTSP mode).
"""
import math
import random
import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field

from backend.config import SimulationConfig
from backend.simulation.vehicle_types import (
    VEHICLE_TYPES, VEHICLE_MIX_PRESETS, VehicleTypeProfile, mix_to_counts
)


@dataclass
class VehicleDeparture:
    vehicle_id: str
    type_id: str
    depart_time: float     # seconds from sim start
    route_id: str
    depart_pos: str = "base"
    depart_speed: str = "0"


def _poisson_intervals(rate_per_sec: float, duration_s: float, rng: random.Random) -> List[float]:
    """Generate departure times using Poisson process."""
    times = []
    t = 0.0
    if rate_per_sec <= 0:
        return times
    while t < duration_s:
        t += rng.expovariate(rate_per_sec)
        if t < duration_s:
            times.append(t)
    return times


def _uniform_intervals(rate_per_sec: float, duration_s: float) -> List[float]:
    """Generate evenly spaced departure times."""
    if rate_per_sec <= 0:
        return []
    gap = 1.0 / rate_per_sec
    n = int(duration_s * rate_per_sec)
    return [i * gap for i in range(n)]


def _weibull_intervals(rate_per_sec: float, duration_s: float, rng: random.Random, k: float = 1.5) -> List[float]:
    """Generate departure times using Weibull distribution (clustered arrivals)."""
    times = []
    scale = 1.0 / (rate_per_sec * math.gamma(1 + 1 / k))
    t = 0.0
    while t < duration_s:
        t += rng.weibullvariate(scale, k)
        if t < duration_s:
            times.append(t)
    return times


def _apply_pattern(base_vph: int, t_sec: float, pattern: str) -> int:
    """Return adjusted vph at simulation time t_sec based on traffic pattern."""
    t_min = t_sec / 60.0
    if pattern == "uniform":
        return base_vph
    elif pattern == "morning_peak":
        # Ramp from 40% to 100% over first 20 min, hold, ramp down
        if t_min < 20:
            factor = 0.4 + 0.6 * (t_min / 20)
        elif t_min < 40:
            factor = 1.0
        else:
            factor = max(0.5, 1.0 - 0.025 * (t_min - 40))
        return int(base_vph * factor)
    elif pattern == "evening_peak":
        if t_min < 10:
            factor = 0.5 + 0.5 * (t_min / 10)
        elif t_min < 50:
            factor = 1.0
        else:
            factor = max(0.4, 1.0 - 0.03 * (t_min - 50))
        return int(base_vph * factor)
    elif pattern == "bidirectional":
        factor = 0.6 + 0.4 * abs(math.sin(math.pi * t_min / 30))
        return int(base_vph * factor)
    elif pattern == "random":
        factor = random.uniform(0.5, 1.2)
        return int(base_vph * factor)
    return base_vph


# Standard Hyderabad turn ratios per arm
DEFAULT_TURN_RATIOS = {
    "N": {"straight": 0.60, "right": 0.25, "uturn": 0.15},
    "S": {"straight": 0.60, "right": 0.25, "uturn": 0.15},
    "E": {"straight": 0.60, "right": 0.25, "uturn": 0.15},
    "W": {"straight": 0.60, "right": 0.25, "uturn": 0.15},
}

# Route definitions: arm → destination (for 4-way cross)
ROUTES_4WAY = {
    "N_straight": ("north_in", "south_out"),
    "N_right":    ("north_in", "east_out"),
    "N_uturn":    ("north_in", "north_out"),
    "S_straight": ("south_in", "north_out"),
    "S_right":    ("south_in", "west_out"),
    "S_uturn":    ("south_in", "south_out"),
    "E_straight": ("east_in", "west_out"),
    "E_right":    ("east_in", "south_out"),
    "E_uturn":    ("east_in", "east_out"),
    "W_straight": ("west_in", "east_out"),
    "W_right":    ("west_in", "north_out"),
    "W_uturn":    ("west_in", "west_out"),
}


class DemandGenerator:
    """
    Generates a SUMO .rou.xml file from SimulationConfig.
    Can also update vehicle counts dynamically (RTSP mode).
    """

    def __init__(self, config: SimulationConfig, seed: int = 42):
        self.config = config
        self.rng = random.Random(seed)
        self._vehicle_counter = 0

    def generate(self, output_path: str, duration_s: float = 3600.0) -> str:
        """Write .rou.xml to output_path and return the path."""
        root = ET.Element("routes")

        # Vehicle type definitions
        self._write_vtype_elements(root)

        # Route definitions
        self._write_route_elements(root)

        # Vehicle departure schedule
        departures = self._generate_departures(duration_s)
        for dep in sorted(departures, key=lambda d: d.depart_time):
            v = ET.SubElement(root, "vehicle")
            v.set("id", dep.vehicle_id)
            v.set("type", dep.type_id)
            v.set("route", dep.route_id)
            v.set("depart", f"{dep.depart_time:.2f}")
            v.set("departPos", dep.depart_pos)
            v.set("departSpeed", dep.depart_speed)

        tree = ET.ElementTree(root)
        ET.indent(tree, space="    ")
        with open(output_path, "wb") as f:
            tree.write(f, encoding="utf-8", xml_declaration=True)

        return output_path

    def _write_vtype_elements(self, root: ET.Element) -> None:
        """Add <vType> elements for all vehicle types in the mix."""
        mix = self._get_mix_pcts()
        for type_id, pct in mix.items():
            if pct <= 0:
                continue
            profile = VEHICLE_TYPES[type_id]
            vt = ET.SubElement(root, "vType")
            vt.set("id", type_id)
            vt.set("vClass", profile.sumo_vclass)
            vt.set("length", str(profile.length_m))
            vt.set("width", str(profile.width_m))
            vt.set("maxSpeed", str(profile.max_speed_ms))
            vt.set("accel", str(profile.accel_ms2))
            vt.set("decel", str(profile.decel_ms2))
            vt.set("minGap", str(profile.min_gap_m))
            vt.set("tau", str(profile.tau_s))
            vt.set("sigma", str(profile.sigma))
            vt.set("color", self._hex_to_sumo_color(profile.color_hex))

    def _write_route_elements(self, root: ET.Element) -> None:
        """Add <route> elements for each arm-direction combination."""
        for route_id, (from_edge, to_edge) in ROUTES_4WAY.items():
            r = ET.SubElement(root, "route")
            r.set("id", route_id)
            r.set("edges", f"{from_edge} {to_edge}")

    def _generate_departures(self, duration_s: float) -> List[VehicleDeparture]:
        """Generate all vehicle departure events for the simulation duration."""
        departures: List[VehicleDeparture] = []
        mix_pcts = self._get_mix_pcts()
        arms = ["N", "S", "E", "W"]

        # Time window step for pattern variation: 60 seconds
        step_s = 60.0
        t = self.config.warm_up_seconds
        while t < duration_s:
            window_end = min(t + step_s, duration_s)
            window_dur = window_end - t

            adjusted_vph = _apply_pattern(
                self.config.traffic_volume_vph, t, self.config.traffic_pattern
            )
            vph_per_arm = adjusted_vph / len(arms)
            rate_per_sec = vph_per_arm / 3600.0

            for arm in arms:
                type_departures = self._sample_arm_departures(
                    arm, rate_per_sec, window_dur, mix_pcts, offset=t
                )
                departures.extend(type_departures)

            t = window_end

        return departures

    def _sample_arm_departures(
        self,
        arm: str,
        rate_per_sec: float,
        duration_s: float,
        mix_pcts: Dict[str, float],
        offset: float = 0.0,
    ) -> List[VehicleDeparture]:
        """Generate departures for one arm using configured arrival distribution."""
        dist = self.config.arrival_distribution
        if dist == "poisson":
            times = _poisson_intervals(rate_per_sec, duration_s, self.rng)
        elif dist == "weibull":
            times = _weibull_intervals(rate_per_sec, duration_s, self.rng)
        else:
            times = _uniform_intervals(rate_per_sec, duration_s)

        departures = []
        type_ids = [t for t, p in mix_pcts.items() if p > 0]
        weights = [mix_pcts[t] for t in type_ids]

        turn_ratios = DEFAULT_TURN_RATIOS.get(arm, DEFAULT_TURN_RATIOS["N"])

        for t in times:
            type_id = self.rng.choices(type_ids, weights=weights, k=1)[0]
            direction = self.rng.choices(
                ["straight", "right", "uturn"],
                weights=[
                    turn_ratios["straight"],
                    turn_ratios["right"],
                    turn_ratios["uturn"],
                ],
                k=1,
            )[0]
            route_id = f"{arm}_{direction}"
            if route_id not in ROUTES_4WAY:
                route_id = f"{arm}_straight"

            self._vehicle_counter += 1
            departures.append(VehicleDeparture(
                vehicle_id=f"v_{self._vehicle_counter}",
                type_id=type_id,
                depart_time=offset + t,
                route_id=route_id,
            ))

        return departures

    def _get_mix_pcts(self) -> Dict[str, float]:
        """Resolve vehicle mix from config."""
        mix_name = self.config.vehicle_mix
        if mix_name == "custom":
            return {
                "two_wheeler": self.config.pct_two_wheeler,
                "car": self.config.pct_car,
                "ev_scooter": self.config.pct_ev_scooter,
                "auto_rickshaw": self.config.pct_auto_rickshaw,
                "e_rickshaw": self.config.pct_e_rickshaw,
                "cab": self.config.pct_cab,
                "delivery_bike": self.config.pct_delivery_bike,
                "tsrtc_bus": self.config.pct_tsrtc_bus,
                "school_bus": self.config.pct_school_bus,
                "truck": self.config.pct_truck,
            }
        return VEHICLE_MIX_PRESETS.get(mix_name, VEHICLE_MIX_PRESETS["hyderabad_mixed"])

    @staticmethod
    def _hex_to_sumo_color(hex_color: str) -> str:
        """Convert #RRGGBB to SUMO color string 'R,G,B,255'."""
        h = hex_color.lstrip("#")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return f"{r},{g},{b},255"

    def update_from_vision(self, lane_counts: Dict[str, int]) -> None:
        """
        RTSP mode: update internal demand model from real vehicle counts per lane.
        lane_counts: {arm: count_per_minute}
        """
        if lane_counts:
            total_per_min = sum(lane_counts.values())
            self.config.traffic_volume_vph = int(total_per_min * 60 / max(len(lane_counts), 1))
