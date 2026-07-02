"""
Hyderabad vehicle type profiles for SUMO simulation.
Each type defines physics, fuel consumption, CO2, and rendering properties.
"""
from dataclasses import dataclass
from typing import Dict


@dataclass
class VehicleTypeProfile:
    type_id: str
    display_name: str
    length_m: float          # vehicle length in metres
    width_m: float
    max_speed_ms: float      # m/s
    accel_ms2: float         # acceleration m/s²
    decel_ms2: float         # deceleration m/s²
    min_gap_m: float         # minimum gap to leader
    tau_s: float             # driver reaction time seconds
    idle_fuel_l_per_hr: float  # fuel consumed while idling
    co2_factor_kg_per_l: float  # kg CO2 per litre of fuel (0 for EV)
    fuel_type: str           # petrol|diesel|electric
    color_hex: str           # hex for canvas rendering
    sumo_vclass: str         # SUMO vehicle class
    sigma: float = 0.5       # driver imperfection (0=perfect, 1=max random)


# All 10 Hyderabad vehicle types
VEHICLE_TYPES: Dict[str, VehicleTypeProfile] = {
    "two_wheeler": VehicleTypeProfile(
        type_id="two_wheeler",
        display_name="Motorcycle / Scooter",
        length_m=2.2,
        width_m=0.8,
        max_speed_ms=13.9,   # 50 km/h urban
        accel_ms2=2.5,
        decel_ms2=4.0,
        min_gap_m=0.8,
        tau_s=0.9,
        idle_fuel_l_per_hr=0.35,
        co2_factor_kg_per_l=2.31,
        fuel_type="petrol",
        color_hex="#FACC15",  # yellow
        sumo_vclass="motorcycle",
        sigma=0.7,
    ),
    "car": VehicleTypeProfile(
        type_id="car",
        display_name="Car / SUV",
        length_m=4.5,
        width_m=1.8,
        max_speed_ms=13.9,
        accel_ms2=1.8,
        decel_ms2=3.5,
        min_gap_m=1.5,
        tau_s=1.0,
        idle_fuel_l_per_hr=0.80,
        co2_factor_kg_per_l=2.31,
        fuel_type="petrol",
        color_hex="#60A5FA",  # blue
        sumo_vclass="passenger",
        sigma=0.5,
    ),
    "ev_scooter": VehicleTypeProfile(
        type_id="ev_scooter",
        display_name="Electric Scooter (Ola/Ather)",
        length_m=1.9,
        width_m=0.7,
        max_speed_ms=11.1,   # 40 km/h
        accel_ms2=2.2,
        decel_ms2=3.8,
        min_gap_m=0.7,
        tau_s=0.9,
        idle_fuel_l_per_hr=0.0,  # electric
        co2_factor_kg_per_l=0.0,
        fuel_type="electric",
        color_hex="#34D399",  # green
        sumo_vclass="motorcycle",
        sigma=0.6,
    ),
    "auto_rickshaw": VehicleTypeProfile(
        type_id="auto_rickshaw",
        display_name="Auto Rickshaw (CNG)",
        length_m=3.3,
        width_m=1.4,
        max_speed_ms=11.1,   # 40 km/h
        accel_ms2=1.2,
        decel_ms2=3.0,
        min_gap_m=1.0,
        tau_s=1.1,
        idle_fuel_l_per_hr=0.55,
        co2_factor_kg_per_l=1.89,  # CNG
        fuel_type="cng",
        color_hex="#FB923C",  # orange
        sumo_vclass="taxi",
        sigma=0.6,
    ),
    "e_rickshaw": VehicleTypeProfile(
        type_id="e_rickshaw",
        display_name="E-Rickshaw",
        length_m=2.8,
        width_m=1.2,
        max_speed_ms=6.9,    # 25 km/h
        accel_ms2=0.8,
        decel_ms2=2.5,
        min_gap_m=0.9,
        tau_s=1.2,
        idle_fuel_l_per_hr=0.0,
        co2_factor_kg_per_l=0.0,
        fuel_type="electric",
        color_hex="#A78BFA",  # purple
        sumo_vclass="taxi",
        sigma=0.5,
    ),
    "cab": VehicleTypeProfile(
        type_id="cab",
        display_name="Cab / Taxi (Ola/Uber)",
        length_m=4.5,
        width_m=1.8,
        max_speed_ms=13.9,
        accel_ms2=1.8,
        decel_ms2=3.5,
        min_gap_m=1.5,
        tau_s=1.0,
        idle_fuel_l_per_hr=0.85,
        co2_factor_kg_per_l=2.31,
        fuel_type="petrol",
        color_hex="#F9A8D4",  # pink
        sumo_vclass="taxi",
        sigma=0.4,
    ),
    "delivery_bike": VehicleTypeProfile(
        type_id="delivery_bike",
        display_name="Delivery Bike (Swiggy/Zomato)",
        length_m=2.2,
        width_m=0.8,
        max_speed_ms=11.1,
        accel_ms2=2.0,
        decel_ms2=3.5,
        min_gap_m=0.8,
        tau_s=0.9,
        idle_fuel_l_per_hr=0.38,
        co2_factor_kg_per_l=2.31,
        fuel_type="petrol",
        color_hex="#FCD34D",  # amber
        sumo_vclass="motorcycle",
        sigma=0.8,  # more aggressive
    ),
    "tsrtc_bus": VehicleTypeProfile(
        type_id="tsrtc_bus",
        display_name="TSRTC City Bus",
        length_m=12.0,
        width_m=2.5,
        max_speed_ms=11.1,
        accel_ms2=0.8,
        decel_ms2=2.5,
        min_gap_m=2.5,
        tau_s=1.3,
        idle_fuel_l_per_hr=1.80,
        co2_factor_kg_per_l=2.68,  # diesel
        fuel_type="diesel",
        color_hex="#F87171",  # red
        sumo_vclass="bus",
        sigma=0.3,
    ),
    "school_bus": VehicleTypeProfile(
        type_id="school_bus",
        display_name="School Bus",
        length_m=9.0,
        width_m=2.4,
        max_speed_ms=8.3,    # 30 km/h school zone
        accel_ms2=0.7,
        decel_ms2=2.2,
        min_gap_m=2.0,
        tau_s=1.4,
        idle_fuel_l_per_hr=1.60,
        co2_factor_kg_per_l=2.68,
        fuel_type="diesel",
        color_hex="#FDE68A",  # light yellow
        sumo_vclass="bus",
        sigma=0.2,
    ),
    "truck": VehicleTypeProfile(
        type_id="truck",
        display_name="Truck / Goods Vehicle",
        length_m=8.5,
        width_m=2.5,
        max_speed_ms=11.1,
        accel_ms2=0.6,
        decel_ms2=2.0,
        min_gap_m=2.5,
        tau_s=1.5,
        idle_fuel_l_per_hr=2.10,
        co2_factor_kg_per_l=2.68,
        fuel_type="diesel",
        color_hex="#94A3B8",  # slate
        sumo_vclass="truck",
        sigma=0.4,
    ),
}


def get_profile(type_id: str) -> VehicleTypeProfile:
    """Return vehicle type profile by ID. Raises KeyError if not found."""
    if type_id not in VEHICLE_TYPES:
        raise KeyError(f"Unknown vehicle type: {type_id!r}. Valid: {list(VEHICLE_TYPES)}")
    return VEHICLE_TYPES[type_id]


def mix_to_counts(total_vph: int, mix_pcts: Dict[str, float]) -> Dict[str, int]:
    """
    Convert percentage mix to vehicle counts per hour.
    mix_pcts: {type_id: percentage} — must sum to 100.
    """
    total = sum(mix_pcts.values())
    if abs(total - 100.0) > 0.5:
        raise ValueError(f"Vehicle mix percentages must sum to 100, got {total:.1f}")
    return {t: max(0, round(total_vph * pct / 100)) for t, pct in mix_pcts.items()}


HYDERABAD_MIXED_MIX = {
    "two_wheeler": 40.0,
    "car": 25.0,
    "ev_scooter": 10.0,
    "auto_rickshaw": 10.0,
    "e_rickshaw": 5.0,
    "cab": 4.0,
    "delivery_bike": 3.0,
    "tsrtc_bus": 2.0,
    "school_bus": 0.0,
    "truck": 1.0,
}

WESTERN_MIXED_MIX = {
    "two_wheeler": 5.0,
    "car": 75.0,
    "ev_scooter": 2.0,
    "auto_rickshaw": 0.0,
    "e_rickshaw": 0.0,
    "cab": 5.0,
    "delivery_bike": 3.0,
    "tsrtc_bus": 8.0,
    "school_bus": 0.0,
    "truck": 2.0,
}

VEHICLE_MIX_PRESETS = {
    "hyderabad_mixed": HYDERABAD_MIXED_MIX,
    "western_mixed": WESTERN_MIXED_MIX,
    "cars_only": {t: (100.0 if t == "car" else 0.0) for t in VEHICLE_TYPES},
    "rush_hour": {
        "two_wheeler": 45.0, "car": 30.0, "ev_scooter": 8.0,
        "auto_rickshaw": 8.0, "e_rickshaw": 3.0, "cab": 3.0,
        "delivery_bike": 1.0, "tsrtc_bus": 1.0, "school_bus": 0.0, "truck": 1.0,
    },
    "hitec_city": {
        "two_wheeler": 30.0, "car": 40.0, "ev_scooter": 12.0,
        "auto_rickshaw": 5.0, "e_rickshaw": 2.0, "cab": 8.0,
        "delivery_bike": 2.0, "tsrtc_bus": 1.0, "school_bus": 0.0, "truck": 0.0,
    },
    "old_city": {
        "two_wheeler": 55.0, "car": 15.0, "ev_scooter": 8.0,
        "auto_rickshaw": 14.0, "e_rickshaw": 4.0, "cab": 1.0,
        "delivery_bike": 2.0, "tsrtc_bus": 1.0, "school_bus": 0.0, "truck": 0.0,
    },
    "industrial": {
        "two_wheeler": 28.0, "car": 20.0, "ev_scooter": 5.0,
        "auto_rickshaw": 8.0, "e_rickshaw": 2.0, "cab": 2.0,
        "delivery_bike": 5.0, "tsrtc_bus": 5.0, "school_bus": 0.0, "truck": 25.0,
    },
}
