"""
Config presets library for Traffic Signal Optimizer.
34 presets across 7 groups, calibrated for Hyderabad, India.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional

from backend.config import DEFAULT_SIM_CONFIG, DEFAULT_ADVERSE_CONFIG

# ---------------------------------------------------------------------------
# Base dicts (start with defaults, override per preset)
# ---------------------------------------------------------------------------
BASE = asdict(DEFAULT_SIM_CONFIG)
BASE_ADV = asdict(DEFAULT_ADVERSE_CONFIG)


# ---------------------------------------------------------------------------
# Preset dataclass
# ---------------------------------------------------------------------------
@dataclass
class Preset:
    id: str
    name: str
    group: str          # A_time_of_day | B_location | C_vehicle_mix | D_seasonal | E_events | F_adverse | G_research
    description: str
    sim_config: dict
    adverse_config: dict
    tags: list


# ---------------------------------------------------------------------------
# Group A: Hyderabad Time of Day (7 presets)
# ---------------------------------------------------------------------------
PRESETS_A: dict[str, Preset] = {
    "hyd_rush_am": Preset(
        id="hyd_rush_am",
        name="Hyderabad AM Rush Hour",
        group="A_time_of_day",
        description="Peak morning traffic 8-10 AM — high volume, mixed modes, directional bias towards city center",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1800,
            "pct_car": 30.0,
            "pct_two_wheeler": 40.0,
            "pct_auto_rickshaw": 15.0,
            "pct_tsrtc_bus": 10.0,
            "pct_truck": 5.0,
            "pct_ev_scooter": 0.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 0.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "traffic_pattern": "morning_peak",
            "vehicle_mix": "custom",
            "warm_up_seconds": 120,
        },
        adverse_config={
            **BASE_ADV,
            "red_light_run_probability": 0.08,
            "collision_probability": 0.03,
        },
        tags=["rush", "morning", "hyderabad"],
    ),
    "hyd_rush_pm": Preset(
        id="hyd_rush_pm",
        name="Hyderabad PM Rush Hour",
        group="A_time_of_day",
        description="Peak evening traffic 5-8 PM — highest daily volume, heavy mix, outbound bias",
        sim_config={
            **BASE,
            "traffic_volume_vph": 2000,
            "pct_car": 30.0,
            "pct_two_wheeler": 38.0,
            "pct_auto_rickshaw": 15.0,
            "pct_tsrtc_bus": 10.0,
            "pct_truck": 5.0,
            "pct_ev_scooter": 0.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 2.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "traffic_pattern": "evening_peak",
            "vehicle_mix": "custom",
        },
        adverse_config={
            **BASE_ADV,
            "red_light_run_probability": 0.07,
            "collision_probability": 0.04,
            "aggressive_weaving": "low",
        },
        tags=["rush", "evening", "hyderabad"],
    ),
    "hyd_normal": Preset(
        id="hyd_normal",
        name="Hyderabad Normal Hour",
        group="A_time_of_day",
        description="Midday normal traffic 11 AM - 4 PM — moderate volume, uniform distribution",
        sim_config={
            **BASE,
            "traffic_volume_vph": 900,
            "traffic_pattern": "uniform",
            "vehicle_mix": "hyderabad_mixed",
        },
        adverse_config={**BASE_ADV},
        tags=["normal", "midday", "hyderabad"],
    ),
    "hyd_night": Preset(
        id="hyd_night",
        name="Hyderabad Night",
        group="A_time_of_day",
        description="Night traffic 10 PM - 12 AM — reduced volume, higher truck proportion",
        sim_config={
            **BASE,
            "traffic_volume_vph": 300,
            "pct_car": 30.0,
            "pct_two_wheeler": 35.0,
            "pct_auto_rickshaw": 10.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 15.0,
            "pct_ev_scooter": 0.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 5.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "traffic_pattern": "uniform",
            "vehicle_mix": "custom",
        },
        adverse_config={
            **BASE_ADV,
            "time_of_day": "night",
            "speeding_fleet_pct": 0.1,
        },
        tags=["night", "low_volume", "hyderabad"],
    ),
    "hyd_midnight": Preset(
        id="hyd_midnight",
        name="Hyderabad Midnight",
        group="A_time_of_day",
        description="Deep night traffic 12 AM - 5 AM — very low volume, mostly trucks and cabs",
        sim_config={
            **BASE,
            "traffic_volume_vph": 80,
            "pct_car": 20.0,
            "pct_two_wheeler": 20.0,
            "pct_auto_rickshaw": 5.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 30.0,
            "pct_ev_scooter": 0.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 20.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "traffic_pattern": "uniform",
            "vehicle_mix": "custom",
        },
        adverse_config={
            **BASE_ADV,
            "time_of_day": "night",
            "speeding_fleet_pct": 0.15,
        },
        tags=["midnight", "very_low_volume", "hyderabad"],
    ),
    "hyd_weekend": Preset(
        id="hyd_weekend",
        name="Hyderabad Weekend",
        group="A_time_of_day",
        description="Weekend mid-morning traffic — moderate volume, leisure-oriented, more evenly distributed",
        sim_config={
            **BASE,
            "traffic_volume_vph": 700,
            "pct_car": 35.0,
            "pct_two_wheeler": 35.0,
            "pct_auto_rickshaw": 12.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 3.0,
            "pct_ev_scooter": 5.0,
            "pct_e_rickshaw": 3.0,
            "pct_cab": 2.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "traffic_pattern": "bidirectional",
            "vehicle_mix": "custom",
        },
        adverse_config={**BASE_ADV},
        tags=["weekend", "leisure", "hyderabad"],
    ),
    "hyd_early_morning": Preset(
        id="hyd_early_morning",
        name="Hyderabad Early Morning",
        group="A_time_of_day",
        description="Early morning traffic 5-8 AM — low volume ramp-up, delivery vehicles, fitness commuters",
        sim_config={
            **BASE,
            "traffic_volume_vph": 150,
            "pct_car": 20.0,
            "pct_two_wheeler": 40.0,
            "pct_auto_rickshaw": 10.0,
            "pct_tsrtc_bus": 10.0,
            "pct_truck": 5.0,
            "pct_ev_scooter": 5.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 5.0,
            "pct_delivery_bike": 5.0,
            "pct_school_bus": 0.0,
            "traffic_pattern": "uniform",
            "vehicle_mix": "custom",
        },
        adverse_config={
            **BASE_ADV,
            "time_of_day": "dusk",
        },
        tags=["early_morning", "low_volume", "hyderabad"],
    ),
}


# ---------------------------------------------------------------------------
# Group B: Hyderabad Locations (6 presets)
# ---------------------------------------------------------------------------
PRESETS_B: dict[str, Preset] = {
    "hyd_hitec_city": Preset(
        id="hyd_hitec_city",
        name="HITEC City IT Corridor",
        group="B_location",
        description="HITEC City tech hub — high EV and cab ratio, sharp peaks at 9-11 AM and 6-9 PM",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1600,
            "pct_car": 25.0,
            "pct_two_wheeler": 25.0,
            "pct_auto_rickshaw": 5.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 2.0,
            "pct_ev_scooter": 20.0,
            "pct_e_rickshaw": 3.0,
            "pct_cab": 15.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "traffic_pattern": "morning_peak",
            "vehicle_mix": "custom",
            "osm_lat": 17.4474,
            "osm_lon": 78.3762,
        },
        adverse_config={**BASE_ADV},
        tags=["hitec", "it_corridor", "ev", "cabs", "hyderabad"],
    ),
    "hyd_old_city": Preset(
        id="hyd_old_city",
        name="Old City — Charminar Area",
        group="B_location",
        description="Charminar heritage area — very high auto-rickshaw and two-wheeler density, frequent pedestrian conflicts",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1200,
            "pct_car": 10.0,
            "pct_two_wheeler": 50.0,
            "pct_auto_rickshaw": 30.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 2.0,
            "pct_ev_scooter": 0.0,
            "pct_e_rickshaw": 3.0,
            "pct_cab": 0.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "pedestrian_crossings": "all_arms",
            "osm_lat": 17.3616,
            "osm_lon": 78.4747,
        },
        adverse_config={
            **BASE_ADV,
            "pedestrian_vehicle_conflict": "medium",
            "auto_midroad_pickup": "high",
            "street_vendor_encroachment": "minor",
        },
        tags=["old_city", "charminar", "auto_rickshaw", "pedestrian", "hyderabad"],
    ),
    "hyd_sr_nagar": Preset(
        id="hyd_sr_nagar",
        name="SR Nagar — Residential School Zone",
        group="B_location",
        description="SR Nagar residential area — school zone morning and evening spikes, moderate volume",
        sim_config={
            **BASE,
            "traffic_volume_vph": 600,
            "pct_car": 35.0,
            "pct_two_wheeler": 35.0,
            "pct_auto_rickshaw": 15.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 0.0,
            "pct_ev_scooter": 5.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 0.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 5.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "morning_peak",
            "osm_lat": 17.4436,
            "osm_lon": 78.4428,
        },
        adverse_config={
            **BASE_ADV,
            "school_zone": "am_only",
            "pedestrian_vehicle_conflict": "low",
        },
        tags=["sr_nagar", "residential", "school_zone", "hyderabad"],
    ),
    "hyd_lb_nagar": Preset(
        id="hyd_lb_nagar",
        name="LB Nagar — Outer Ring Road",
        group="B_location",
        description="LB Nagar ORR junction — heavy trucks, high speeds, arterial road characteristics",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1400,
            "pct_car": 25.0,
            "pct_two_wheeler": 30.0,
            "pct_auto_rickshaw": 10.0,
            "pct_tsrtc_bus": 10.0,
            "pct_truck": 20.0,
            "pct_ev_scooter": 0.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 5.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "bidirectional",
            "driver_speed_variance": "high",
            "overloaded_vehicles": "5pct",
            "osm_lat": 17.3470,
            "osm_lon": 78.5561,
        },
        adverse_config={
            **BASE_ADV,
            "speeding_fleet_pct": 0.1,
            "rear_end_risk": True,
        },
        tags=["lb_nagar", "outer_ring_road", "trucks", "high_speed", "hyderabad"],
    ),
    "hyd_secunderabad": Preset(
        id="hyd_secunderabad",
        name="Secunderabad — Rail Commuter Hub",
        group="B_location",
        description="Secunderabad station area — bus-dominated, strong peak at 8-9 AM with commuter surge",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1100,
            "pct_car": 15.0,
            "pct_two_wheeler": 25.0,
            "pct_auto_rickshaw": 20.0,
            "pct_tsrtc_bus": 30.0,
            "pct_truck": 3.0,
            "pct_ev_scooter": 2.0,
            "pct_e_rickshaw": 5.0,
            "pct_cab": 0.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "morning_peak",
            "bus_lanes": True,
            "osm_lat": 17.4399,
            "osm_lon": 78.4983,
        },
        adverse_config={
            **BASE_ADV,
            "pedestrian_vehicle_conflict": "medium",
            "illegal_parking_vehicles": 3,
        },
        tags=["secunderabad", "rail_hub", "bus_dominated", "hyderabad"],
    ),
    "hyd_gachibowli": Preset(
        id="hyd_gachibowli",
        name="Gachibowli — IT Area",
        group="B_location",
        description="Gachibowli IT corridor — similar to HITEC City but with more residential mix and gated communities",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1400,
            "pct_car": 30.0,
            "pct_two_wheeler": 28.0,
            "pct_auto_rickshaw": 8.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 2.0,
            "pct_ev_scooter": 15.0,
            "pct_e_rickshaw": 2.0,
            "pct_cab": 10.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "morning_peak",
            "osm_lat": 17.4401,
            "osm_lon": 78.3489,
        },
        adverse_config={**BASE_ADV},
        tags=["gachibowli", "it_area", "residential_mix", "hyderabad"],
    ),
}


# ---------------------------------------------------------------------------
# Group C: Vehicle Mix Scenarios (5 presets)
# ---------------------------------------------------------------------------
PRESETS_C: dict[str, Preset] = {
    "mix_ev_dominated": Preset(
        id="mix_ev_dominated",
        name="EV-Dominated Mix",
        group="C_vehicle_mix",
        description="60% electric vehicles — e-rickshaws and EV scooters dominate, future city scenario",
        sim_config={
            **BASE,
            "traffic_volume_vph": 800,
            "pct_car": 10.0,
            "pct_two_wheeler": 10.0,
            "pct_auto_rickshaw": 5.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 0.0,
            "pct_ev_scooter": 40.0,
            "pct_e_rickshaw": 20.0,
            "pct_cab": 10.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "uniform",
        },
        adverse_config={**BASE_ADV},
        tags=["ev", "electric", "future", "green"],
    ),
    "mix_heavy_vehicles": Preset(
        id="mix_heavy_vehicles",
        name="Heavy Vehicle Mix",
        group="C_vehicle_mix",
        description="40% heavy vehicles (trucks and buses) — industrial corridor or freight route scenario",
        sim_config={
            **BASE,
            "traffic_volume_vph": 700,
            "pct_car": 20.0,
            "pct_two_wheeler": 20.0,
            "pct_auto_rickshaw": 5.0,
            "pct_tsrtc_bus": 20.0,
            "pct_truck": 20.0,
            "pct_ev_scooter": 5.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 10.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "bidirectional",
            "overloaded_vehicles": "5pct",
        },
        adverse_config={
            **BASE_ADV,
            "rear_end_risk": True,
        },
        tags=["heavy_vehicles", "trucks", "buses", "freight"],
    ),
    "mix_two_wheelers": Preset(
        id="mix_two_wheelers",
        name="Two-Wheeler Dominated",
        group="C_vehicle_mix",
        description="70% two-wheelers — typical old city or narrow-road scenario",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1000,
            "pct_car": 10.0,
            "pct_two_wheeler": 70.0,
            "pct_auto_rickshaw": 10.0,
            "pct_tsrtc_bus": 3.0,
            "pct_truck": 2.0,
            "pct_ev_scooter": 2.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 3.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "morning_peak",
        },
        adverse_config={
            **BASE_ADV,
            "aggressive_weaving": "low",
            "illegal_uturn": True,
        },
        tags=["two_wheelers", "motorcycles", "narrow_roads"],
    ),
    "mix_cars_only": Preset(
        id="mix_cars_only",
        name="Car-Dominated (Western Suburb)",
        group="C_vehicle_mix",
        description="90% cars — western suburb or affluent area, low auto-rickshaw and two-wheeler presence",
        sim_config={
            **BASE,
            "traffic_volume_vph": 900,
            "pct_car": 90.0,
            "pct_two_wheeler": 5.0,
            "pct_auto_rickshaw": 0.0,
            "pct_tsrtc_bus": 2.0,
            "pct_truck": 0.0,
            "pct_ev_scooter": 2.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 1.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "uniform",
        },
        adverse_config={**BASE_ADV},
        tags=["cars_only", "western_suburb", "affluent"],
    ),
    "mix_bus_priority": Preset(
        id="mix_bus_priority",
        name="Bus Priority Corridor",
        group="C_vehicle_mix",
        description="30% buses — rapid transit corridor or BRT scenario with dedicated lanes",
        sim_config={
            **BASE,
            "traffic_volume_vph": 800,
            "pct_car": 20.0,
            "pct_two_wheeler": 20.0,
            "pct_auto_rickshaw": 10.0,
            "pct_tsrtc_bus": 30.0,
            "pct_truck": 3.0,
            "pct_ev_scooter": 5.0,
            "pct_e_rickshaw": 5.0,
            "pct_cab": 7.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "bus_lanes": True,
            "traffic_pattern": "bidirectional",
        },
        adverse_config={**BASE_ADV},
        tags=["bus_priority", "brt", "public_transit"],
    ),
}


# ---------------------------------------------------------------------------
# Group D: Seasonal (4 presets)
# ---------------------------------------------------------------------------
PRESETS_D: dict[str, Preset] = {
    "season_monsoon": Preset(
        id="season_monsoon",
        name="Monsoon Season (Jun–Sep)",
        group="D_seasonal",
        description="Hyderabad monsoon — reduced speeds, waterlogging, camera visibility issues, Jun-Sep",
        sim_config={
            **BASE,
            "traffic_volume_vph": 900,
            "weather": "heavy_rain",
            "traffic_pattern": "uniform",
            "driver_speed_variance": "high",
        },
        adverse_config={
            **BASE_ADV,
            "waterlogging": "minor",
            "camera_dropout": "intermittent",
            "collision_probability": 0.05,
        },
        tags=["monsoon", "rain", "seasonal", "hyderabad"],
    ),
    "season_summer": Preset(
        id="season_summer",
        name="Summer — Peak Heat (Mar–May)",
        group="D_seasonal",
        description="Hyderabad summer heat — vehicle overheating, AC load, reduced efficiency, Mar-May",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1000,
            "weather": "clear",
            "traffic_pattern": "morning_peak",
            "incident_simulation": "random_breakdown",
        },
        adverse_config={
            **BASE_ADV,
            "collision_probability": 0.02,
            "time_of_day": "daytime",
        },
        tags=["summer", "heat", "seasonal", "hyderabad"],
    ),
    "season_winter_fog": Preset(
        id="season_winter_fog",
        name="Winter Fog (Jan–Feb)",
        group="D_seasonal",
        description="Low-visibility winter morning fog — reduced speeds, higher collision risk, Jan-Feb",
        sim_config={
            **BASE,
            "traffic_volume_vph": 850,
            "weather": "fog",
            "traffic_pattern": "morning_peak",
            "driver_speed_variance": "high",
        },
        adverse_config={
            **BASE_ADV,
            "collision_probability": 0.06,
            "rear_end_risk": True,
            "camera_obstruction": "partial",
            "time_of_day": "dusk",
        },
        tags=["winter", "fog", "visibility", "seasonal"],
    ),
    "season_festival": Preset(
        id="season_festival",
        name="Festival Season (Diwali/Dussehra)",
        group="D_seasonal",
        description="Festival traffic surge — 40% extra demand, late-night peak, fireworks and crowds",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1400,
            "pct_car": 35.0,
            "pct_two_wheeler": 40.0,
            "pct_auto_rickshaw": 15.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 0.0,
            "pct_ev_scooter": 3.0,
            "pct_e_rickshaw": 2.0,
            "pct_cab": 0.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "evening_peak",
        },
        adverse_config={
            **BASE_ADV,
            "mass_event": "festival",
            "red_light_run_probability": 0.06,
            "street_vendor_encroachment": "minor",
        },
        tags=["festival", "diwali", "dussehra", "surge", "seasonal"],
    ),
}


# ---------------------------------------------------------------------------
# Group E: Events (4 presets)
# ---------------------------------------------------------------------------
PRESETS_E: dict[str, Preset] = {
    "event_cricket_match": Preset(
        id="event_cricket_match",
        name="Cricket Match Day",
        group="E_events",
        description="Stadium traffic surge before/after match — evening peak, heavy cab and auto-rickshaw use",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1900,
            "pct_car": 30.0,
            "pct_two_wheeler": 25.0,
            "pct_auto_rickshaw": 20.0,
            "pct_tsrtc_bus": 10.0,
            "pct_truck": 0.0,
            "pct_ev_scooter": 0.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 15.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "evening_peak",
        },
        adverse_config={
            **BASE_ADV,
            "mass_event": "sports",
            "illegal_parking_vehicles": 5,
            "pedestrian_vehicle_conflict": "medium",
        },
        tags=["cricket", "stadium", "sports_event", "surge"],
    ),
    "event_political_rally": Preset(
        id="event_political_rally",
        name="Political Rally / VIP Convoy",
        group="E_events",
        description="VIP convoy with road closures — police presence, partial blockages, rerouting traffic",
        sim_config={
            **BASE,
            "traffic_volume_vph": 700,
            "traffic_pattern": "uniform",
            "incident_simulation": "blocked_lane",
        },
        adverse_config={
            **BASE_ADV,
            "vip_convoy": True,
            "wrong_way_driver": "rare",
            "illegal_parking_vehicles": 8,
            "signal_failure_mode": "stuck_phase",
            "signal_failure_trigger": "manual",
        },
        tags=["political", "vip_convoy", "road_closure", "police"],
    ),
    "event_school_exam": Preset(
        id="event_school_exam",
        name="School Exam Rush",
        group="E_events",
        description="Major board exam morning — parents dropping children, high two-wheeler and auto activity",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1100,
            "pct_car": 30.0,
            "pct_two_wheeler": 35.0,
            "pct_auto_rickshaw": 20.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 0.0,
            "pct_ev_scooter": 0.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 5.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 5.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "morning_peak",
        },
        adverse_config={
            **BASE_ADV,
            "school_zone": "am_only",
            "pedestrian_vehicle_conflict": "low",
            "illegal_parking_vehicles": 4,
        },
        tags=["school_exam", "morning_rush", "children", "education"],
    ),
    "event_market_day": Preset(
        id="event_market_day",
        name="Weekly Market Day",
        group="E_events",
        description="Weekly market day traffic — high auto-rickshaw and pedestrian flow, vendor encroachment",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1000,
            "pct_car": 15.0,
            "pct_two_wheeler": 35.0,
            "pct_auto_rickshaw": 35.0,
            "pct_tsrtc_bus": 5.0,
            "pct_truck": 5.0,
            "pct_ev_scooter": 0.0,
            "pct_e_rickshaw": 5.0,
            "pct_cab": 0.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "bidirectional",
            "pedestrian_crossings": "all_arms",
        },
        adverse_config={
            **BASE_ADV,
            "street_vendor_encroachment": "major",
            "pedestrian_vehicle_conflict": "high",
            "auto_midroad_pickup": "high",
            "illegal_parking_vehicles": 6,
        },
        tags=["market", "weekly_market", "pedestrian", "vendors"],
    ),
}


# ---------------------------------------------------------------------------
# Group F: Adverse Scenarios (4 presets)
# ---------------------------------------------------------------------------
PRESETS_F: dict[str, Preset] = {
    "adverse_high_collision": Preset(
        id="adverse_high_collision",
        name="High Collision Risk",
        group="F_adverse",
        description="High collision probability scenario — stress test for accident detection and recovery",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1200,
            "traffic_pattern": "morning_peak",
            "incident_simulation": "random_breakdown",
        },
        adverse_config={
            **BASE_ADV,
            "collision_probability": 0.15,
            "rear_end_risk": True,
            "pedestrian_vehicle_conflict": "high",
            "aggressive_weaving": "high",
            "speeding_fleet_pct": 0.2,
            "collision_duration_seconds": 90,
            "collision_recovery": "manual_clear",
        },
        tags=["collision", "high_risk", "adverse", "stress_test"],
    ),
    "adverse_signal_failure": Preset(
        id="adverse_signal_failure",
        name="Signal Failure — Stuck Red",
        group="F_adverse",
        description="High probability of signal failure stuck in red — tests fallback and recovery logic",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1000,
            "traffic_pattern": "morning_peak",
        },
        adverse_config={
            **BASE_ADV,
            "signal_failure_mode": "stuck_phase",
            "signal_failure_trigger": "random",
            "failure_recovery_seconds": 120,
            "power_fluctuation": "flicker",
            "communication_lag_ms": 500,
        },
        tags=["signal_failure", "infrastructure", "adverse", "recovery"],
    ),
    "adverse_heavy_rain": Preset(
        id="adverse_heavy_rain",
        name="Heavy Rain + Waterlogging",
        group="F_adverse",
        description="Heavy rain with severe waterlogging — reduced speeds, camera dropout, high collision risk",
        sim_config={
            **BASE,
            "traffic_volume_vph": 700,
            "weather": "heavy_rain",
            "traffic_pattern": "uniform",
            "driver_speed_variance": "high",
        },
        adverse_config={
            **BASE_ADV,
            "waterlogging": "severe",
            "camera_dropout": "extended",
            "camera_obstruction": "partial",
            "collision_probability": 0.08,
            "sensor_failure": "random_noise",
        },
        tags=["heavy_rain", "waterlogging", "camera_failure", "adverse"],
    ),
    "adverse_vip_convoy": Preset(
        id="adverse_vip_convoy",
        name="VIP Convoy — High Severity",
        group="F_adverse",
        description="High-severity VIP convoy — full signal override, total blockage, police enforcement",
        sim_config={
            **BASE,
            "traffic_volume_vph": 500,
            "traffic_pattern": "uniform",
            "emergency_preemption": True,
            "incident_simulation": "blocked_lane",
        },
        adverse_config={
            **BASE_ADV,
            "vip_convoy": True,
            "signal_failure_mode": "stuck_phase",
            "signal_failure_trigger": "manual",
            "communication_lag_ms": 200,
            "illegal_parking_vehicles": 10,
            "wrong_way_driver": "occasional",
        },
        tags=["vip_convoy", "high_severity", "emergency", "adverse"],
    ),
}


# ---------------------------------------------------------------------------
# Group G: Research / Benchmark (4 presets)
# ---------------------------------------------------------------------------
PRESETS_G: dict[str, Preset] = {
    "research_stress_test": Preset(
        id="research_stress_test",
        name="Research — Stress Test",
        group="G_research",
        description="Maximum volume with all adverse conditions — absolute worst-case benchmark",
        sim_config={
            **BASE,
            "traffic_volume_vph": 3000,
            "pct_car": 25.0,
            "pct_two_wheeler": 35.0,
            "pct_auto_rickshaw": 15.0,
            "pct_tsrtc_bus": 10.0,
            "pct_truck": 10.0,
            "pct_ev_scooter": 2.0,
            "pct_e_rickshaw": 0.0,
            "pct_cab": 3.0,
            "pct_delivery_bike": 0.0,
            "pct_school_bus": 0.0,
            "vehicle_mix": "custom",
            "traffic_pattern": "morning_peak",
            "weather": "heavy_rain",
            "incident_simulation": "random_breakdown",
            "driver_speed_variance": "high",
            "overloaded_vehicles": "15pct",
        },
        adverse_config={
            **BASE_ADV,
            "collision_probability": 0.12,
            "rear_end_risk": True,
            "red_light_run_probability": 0.1,
            "signal_failure_mode": "random_glitch",
            "signal_failure_trigger": "random",
            "waterlogging": "minor",
            "pedestrian_vehicle_conflict": "high",
            "aggressive_weaving": "high",
            "speeding_fleet_pct": 0.15,
        },
        tags=["stress_test", "maximum_load", "all_adverse", "benchmark"],
    ),
    "research_minimal": Preset(
        id="research_minimal",
        name="Research — Minimal / Ideal",
        group="G_research",
        description="100 VPH, no adverse, ideal conditions — baseline for algorithm comparison",
        sim_config={
            **BASE,
            "traffic_volume_vph": 100,
            "traffic_pattern": "uniform",
            "weather": "clear",
            "incident_simulation": "none",
            "driver_speed_variance": "none",
            "overloaded_vehicles": "none",
        },
        adverse_config={
            **BASE_ADV,
            "collision_probability": 0.0,
            "red_light_run_probability": 0.0,
            "signal_failure_mode": "none",
            "signal_failure_trigger": "never",
            "waterlogging": "none",
        },
        tags=["minimal", "ideal", "baseline", "benchmark"],
    ),
    "research_5arm": Preset(
        id="research_5arm",
        name="Research — 6-Arm Complex Intersection",
        group="G_research",
        description="Complex 6-arm intersection — tests multi-phase signal logic and unusual geometry",
        sim_config={
            **BASE,
            "traffic_volume_vph": 1000,
            "intersection_type": "6arm_complex",
            "phase_scheme": "6phase",
            "traffic_pattern": "morning_peak",
            "lanes_per_arm": 2,
        },
        adverse_config={**BASE_ADV},
        tags=["6arm", "complex_intersection", "multi_phase", "research"],
    ),
    "research_roundabout": Preset(
        id="research_roundabout",
        name="Research — Roundabout",
        group="G_research",
        description="Roundabout intersection type — no signal phases, pure yield-based flow control",
        sim_config={
            **BASE,
            "traffic_volume_vph": 800,
            "intersection_type": "roundabout",
            "phase_scheme": "2phase",
            "traffic_pattern": "bidirectional",
            "lanes_per_arm": 2,
        },
        adverse_config={
            **BASE_ADV,
            "aggressive_weaving": "low",
        },
        tags=["roundabout", "yield_control", "no_signals", "research"],
    ),
}


# ---------------------------------------------------------------------------
# Combined registry
# ---------------------------------------------------------------------------
ALL_PRESETS: dict[str, Preset] = {
    **PRESETS_A,
    **PRESETS_B,
    **PRESETS_C,
    **PRESETS_D,
    **PRESETS_E,
    **PRESETS_F,
    **PRESETS_G,
}


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def get_preset(preset_id: str) -> Optional[Preset]:
    """Return a Preset by ID, or None if not found."""
    return ALL_PRESETS.get(preset_id)


def list_presets() -> list[dict]:
    """Return summary list (no sim_config/adverse_config) for all presets."""
    return [
        {
            "id": p.id,
            "name": p.name,
            "group": p.group,
            "description": p.description,
            "tags": p.tags,
        }
        for p in ALL_PRESETS.values()
    ]


def list_presets_by_group() -> dict[str, list[dict]]:
    """Return preset summaries grouped by group key."""
    result: dict[str, list[dict]] = {}
    for p in ALL_PRESETS.values():
        result.setdefault(p.group, []).append(
            {
                "id": p.id,
                "name": p.name,
                "group": p.group,
                "description": p.description,
                "tags": p.tags,
            }
        )
    return result


def get_preset_config(preset_id: str) -> Optional[dict]:
    """Return {"sim_config": dict, "adverse_config": dict} or None."""
    p = get_preset(preset_id)
    if p is None:
        return None
    return {"sim_config": p.sim_config, "adverse_config": p.adverse_config}
