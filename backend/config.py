"""
Central configuration for Traffic Signal Optimizer.
All defaults calibrated for Hyderabad, India (GHMC standards).
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SimulationConfig:
    def __post_init__(self):
        """Apply backend overrides on top of whatever the frontend sent."""
        for k, v in BACKEND_OVERRIDES.items():
            if hasattr(self, k):
                setattr(self, k, v)

    # 5A - Intersection & Road Network
    intersection_type: str = "4way_cross"       # 4way_cross|four_way|t_junction|y_junction|6arm_complex|six_arm|roundabout|four_way_free_left|t_junction_free_left|roundabout_free_left
    lanes_per_arm: int = 3
    dedicated_turn_lanes: str = "right_only"    # off|left_only|right_only|both
    u_turn_phase: bool = True
    pedestrian_crossings: str = "major_arms"    # disabled|major_arms|all_arms
    bus_lanes: bool = False
    network_source: str = "builtin"             # builtin|osm|upload
    osm_lat: float = 17.4474                    # HITEC City, Hyderabad
    osm_lon: float = 78.3762

    # 5B - Traffic Demand
    traffic_volume_vph: int = 10000
    vehicle_mix: str = "hyderabad_mixed"        # hyderabad_mixed|cars_only|western_mixed|rush_hour|custom
    traffic_pattern: str = "uniform"       # uniform|morning_peak|evening_peak|bidirectional|random
    arrival_distribution: str = "poisson"       # poisson|weibull|uniform
    turn_ratio_straight: float = 0.60
    turn_ratio_right: float = 0.25
    turn_ratio_uturn: float = 0.15
    warm_up_seconds: int = 120

    # Custom vehicle mix percentages (must sum to 100)
    pct_two_wheeler: float = 40.0
    pct_car: float = 25.0
    pct_ev_scooter: float = 10.0
    pct_auto_rickshaw: float = 10.0
    pct_e_rickshaw: float = 5.0
    pct_cab: float = 4.0
    pct_delivery_bike: float = 3.0
    pct_tsrtc_bus: float = 2.0
    pct_school_bus: float = 0.0
    pct_truck: float = 1.0

    # 5C - Signal & Phase
    phase_scheme: str = "5phase"                # 2phase|4phase|5phase|6phase
    min_green_seconds: int = 15
    max_green_seconds: int = 90
    yellow_seconds: int = 4
    all_red_seconds: int = 2
    pedestrian_walk_seconds: int = 30
    total_cycle_cap_seconds: int = 120

    # 5D - RL Agent & Training
    algorithm: str = "PPO"                      # PPO|A2C|DQN|SAC_Discrete
    reward_function: str = "min_wait"           # min_wait|max_throughput|min_stops|min_queue|balanced|custom
    training_episodes: int = 500
    action_frequency_seconds: int = 5
    observation_window: int = 1
    normalise_observations: bool = True
    learning_rate: float = 3e-4
    hidden_layer_size: int = 64                 # 32|64|128|256
    discount_factor: float = 0.99
    random_seed: int = 42
    use_transfer_learning: bool = False
    base_model_preset_id: Optional[str] = None

    # Dynamic Reward Weights
    reward_wt_queue: float = 1.0
    reward_wt_wait: float = 0.5
    reward_wt_throughput: float = 2.0
    reward_wt_collision: float = 1.5
    reward_wt_pedestrian: float = 0.8
    reward_wt_emergency: float = 0.5
    reward_wt_switch: float = 0.15
    reward_wt_flow_efficiency: float = 3.0
    reward_wt_pressure: float = 1.5
    reward_wt_starvation: float = 0.8
    starvation_threshold_steps: int = 60

    # Stage 2 physics enrichments (used by mock_env when training_stage >= 2)
    startup_lost_time_s: float = 2.0        # seconds before first vehicle moves after green
    saturation_flow_heavy_factor: float = 0.5  # heavy vehicles take this fraction extra headway
    pedestrian_crossing_prob: float = 0.15  # probability a pedestrian request fires each decision
    spillback_capacity_vehicles: int = 24   # max queue before spillback penalty triggers
    training_stage: int = 1                 # 1=Fast Mock, 2=Enriched, 3=SUMO, 4=Curriculum

    # 5E - Simulation Engine
    sim_speed_multiplier: int = 10              # 1|5|10|0(max)
    step_length_seconds: float = 0.5
    car_following_model: str = "IDM"            # Krauss|IDM|EIDM
    lane_change_model: str = "SL2015"           # LC2013|SL2015
    driver_speed_variance: str = "high"         # none|low|high
    sublane_model: bool = True
    weather: str = "clear"                      # clear|light_rain|heavy_rain|fog|dust_storm
    incident_simulation: str = "none"           # none|random_breakdown|blocked_lane|surge|cattle
    emergency_preemption: bool = False
    speed_breakers: str = "none"                # none|20m_upstream|10m_upstream|both
    overloaded_vehicles: str = "none"           # none|5pct|15pct

    # 5F - Baseline
    baseline_controller: str = "fixed_time"    # fixed_time|websters|semi_actuated|fully_actuated
    fixed_cycle_length_seconds: int = 120

    # 5G - Camera / Vision
    rtsp_url: str = ""
    detection_confidence: float = 0.5
    frame_skip: int = 2
    track_persistence_seconds: float = 3.0
    lane_detection: str = "auto"               # auto|manual|upload_json
    camera_resolution: str = "720p"
    camera_mounting_angle: str = "high_side"   # overhead|high_side|low_side

    # 5H - Metrics & Output
    metrics_sampling_rate_seconds: float = 1.0
    export_format: str = "json"                # json|csv|sumo_xml|all
    save_episode_videos: str = "disabled"      # disabled|best_only|every_50|all
    log_raw_trajectories: bool = False
    kpi_reference_city: str = "hyderabad"

    # Data source mode
    data_source: str = "sumo_only"             # sumo_only|rtsp_feed


@dataclass
class AdverseConfig:
    # 5I-1 Collision
    collision_probability: float = 0.0          # 0.0 = off
    collision_duration_seconds: int = 60
    rear_end_risk: bool = False
    pedestrian_vehicle_conflict: str = "off"    # off|low|medium|high
    collision_recovery: str = "auto_clear"

    # 5I-2 Violations
    red_light_run_probability: float = 0.0
    signal_jump_probability: float = 0.0
    wrong_way_driver: str = "off"              # off|rare|occasional
    illegal_uturn: bool = False
    illegal_parking_vehicles: int = 0
    aggressive_weaving: str = "off"            # off|low|high
    speeding_fleet_pct: float = 0.0
    auto_midroad_pickup: str = "off"           # off|low|high
    street_vendor_encroachment: str = "off"    # off|minor|major
    school_zone: str = "off"                   # off|am_only|pm_only|both
    footpath_encroachment: bool = False

    # 5I-3 Signal & Infrastructure
    signal_failure_mode: str = "none"          # none|full_blackout|all_amber|stuck_phase|random_glitch
    signal_failure_trigger: str = "never"      # never|episode_50pct|random|manual
    failure_recovery_seconds: int = 60
    power_fluctuation: str = "none"            # none|flicker|sag|outage
    sensor_failure: str = "none"               # none|loop_dropout|all_fail|random_noise
    communication_lag_ms: int = 0

    # 5I-4 Road & Environmental
    waterlogging: str = "none"                 # none|minor|severe|flash_flood
    pothole_damage: str = "none"               # none|one_lane|multiple
    construction_zone: str = "none"            # none|static|moving
    dust_storm: str = "none"                   # none|moderate|severe
    time_of_day: str = "daytime"               # daytime|dusk|night
    vip_convoy: bool = False
    mass_event: str = "none"                   # none|festival|sports|evacuation

    # 5I-5 Sensor (RTSP)
    camera_dropout: str = "none"               # none|brief|extended|intermittent
    camera_obstruction: str = "none"           # none|partial|full
    false_detection_pct: float = 0.0
    gps_timestamp_drift: str = "none"          # none|minor|major


@dataclass
class AppConfig:
    host: str = "0.0.0.0"
    port: int = 5050
    debug: bool = True
    secret_key: str = "tso-dev-secret-2026"
    database_url: str = "sqlite:///backend/db/tso.db"
    cors_origins: list = field(default_factory=lambda: [
        "http://localhost:5174",  # Vite dev server
        "http://localhost:3000",  # fallback / alternate port
    ])

    # Hyderabad economic reference values
    petrol_price_inr_per_l: float = 106.0
    diesel_price_inr_per_l: float = 93.0
    avg_wage_inr_per_hr: float = 250.0
    carbon_credit_inr_per_tonne: float = 2000.0

    # SUMO installation
    sumo_home: str = ""                        # auto-detected if empty


# ---------------------------------------------------------------------------
# Backend overrides — force these values on every SimulationConfig instance,
# regardless of what the frontend CFG panel sends.
# Edit here to bypass the UI without touching the frontend.
# Set to {} to disable all overrides.
# ---------------------------------------------------------------------------
BACKEND_OVERRIDES: dict = {}

# Singleton defaults
DEFAULT_SIM_CONFIG = SimulationConfig()
DEFAULT_ADVERSE_CONFIG = AdverseConfig()
APP_CONFIG = AppConfig()
