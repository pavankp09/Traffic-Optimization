"""
Dataclasses for Road Optimizer scenario configuration.
Completely isolated from the main simulation pipeline.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Named Intersections — pre-configured Hyderabad locations
# ---------------------------------------------------------------------------

NAMED_INTERSECTIONS: list[dict] = [
    {
        "id": "hitec_city",
        "name": "HITEC City Signal",
        "city": "Hyderabad",
        "arms": 4,
        "lanes_per_arm": 3,
        "traffic_volume_vph": 3200,
        "vehicle_mix": "hyderabad_mixed",
        "traffic_pattern": "morning_peak",
        "description": "Heavy IT commuter corridor, 4-way cross with high two-wheeler volume",
    },
    {
        "id": "gachibowli",
        "name": "Gachibowli Junction",
        "city": "Hyderabad",
        "arms": 4,
        "lanes_per_arm": 3,
        "traffic_volume_vph": 2800,
        "vehicle_mix": "hyderabad_mixed",
        "traffic_pattern": "bidirectional",
        "description": "Mixed traffic, elevated flyover nearby causes complex weaving",
    },
    {
        "id": "jubilee_hills",
        "name": "Jubilee Hills Check Post",
        "city": "Hyderabad",
        "arms": 4,
        "lanes_per_arm": 2,
        "traffic_volume_vph": 2200,
        "vehicle_mix": "hyderabad_mixed",
        "traffic_pattern": "evening_peak",
        "description": "Residential + commercial mix, moderate volume",
    },
    {
        "id": "miyapur",
        "name": "Miyapur X-Roads",
        "city": "Hyderabad",
        "arms": 4,
        "lanes_per_arm": 3,
        "traffic_volume_vph": 3600,
        "vehicle_mix": "hyderabad_mixed",
        "traffic_pattern": "morning_peak",
        "description": "Metro interchange — highest volume, bus-heavy corridor",
    },
    {
        "id": "lb_nagar",
        "name": "LB Nagar X-Roads",
        "city": "Hyderabad",
        "arms": 4,
        "lanes_per_arm": 3,
        "traffic_volume_vph": 3000,
        "vehicle_mix": "hyderabad_mixed",
        "traffic_pattern": "bidirectional",
        "description": "High TSRTC bus volume, major south-east corridor",
    },
    {
        "id": "mehdipatnam",
        "name": "Mehdipatnam X-Roads",
        "city": "Hyderabad",
        "arms": 5,
        "lanes_per_arm": 2,
        "traffic_volume_vph": 2500,
        "vehicle_mix": "hyderabad_mixed",
        "traffic_pattern": "evening_peak",
        "description": "Complex 5-arm geometry with heavy pedestrian activity",
    },
    {
        "id": "custom",
        "name": "Custom Intersection",
        "city": "Custom",
        "arms": 4,
        "lanes_per_arm": 3,
        "traffic_volume_vph": 2000,
        "vehicle_mix": "hyderabad_mixed",
        "traffic_pattern": "uniform",
        "description": "User-defined intersection — configure all parameters",
    },
]

# ---------------------------------------------------------------------------
# Scenario type definitions
# ---------------------------------------------------------------------------

SCENARIO_TYPES: list[dict] = [
    {
        "type": "baseline",
        "label": "Baseline (Current State)",
        "description": "Run RL on the intersection exactly as configured — no structural changes.",
        "icon": "🏁",
        "color": "#64748b",
        "overrides": {},
    },
    {
        "type": "free_left",
        "label": "Add Free Left Turn",
        "description": "Add a channelised free left turn slip road — vehicles don't wait for signal.",
        "icon": "↙",
        "color": "#10b981",
        "overrides": {
            "intersection_type": "four_way_free_left",
            "dedicated_turn_lanes": "both",
            "turn_ratio_right": 0.30,
            "turn_ratio_straight": 0.55,
        },
    },
    {
        "type": "u_turn_mid",
        "label": "Add Mid-Block U-Turn",
        "description": "Introduce a dedicated U-turn bay in the middle of the intersection.",
        "icon": "↩",
        "color": "#6366f1",
        "overrides": {
            "u_turn_phase": True,
            "turn_ratio_uturn": 0.20,
            "turn_ratio_straight": 0.55,
            "turn_ratio_right": 0.25,
        },
    },
    {
        "type": "extra_arm",
        "label": "Add Extra Arm/Road",
        "description": "Convert to a higher-arm intersection (e.g. 4-way → 5-arm or 6-arm).",
        "icon": "➕",
        "color": "#f59e0b",
        "overrides": {},   # arm count bumped dynamically in runner
    },
    {
        "type": "remove_lane",
        "label": "Remove a Lane",
        "description": "Reduce lanes per arm by 1 — simulates road narrowing or parking encroachment.",
        "icon": "🔻",
        "color": "#ef4444",
        "overrides": {},   # lanes_per_arm decremented dynamically
    },
    {
        "type": "phase_change",
        "label": "Change Signal Phase Scheme",
        "description": "Switch between 2-phase, 4-phase, 5-phase, or 6-phase signal timing.",
        "icon": "🚦",
        "color": "#ec4899",
        "overrides": {},   # phase_scheme set by user choice
    },
    {
        "type": "add_pedestrian",
        "label": "Add Full Pedestrian Crossings",
        "description": "Enable pedestrian crossings on all arms — adds pedestrian signal phase.",
        "icon": "🚶",
        "color": "#14b8a6",
        "overrides": {
            "pedestrian_crossings": "all_arms",
            "pedestrian_walk_seconds": 30,
        },
    },
    {
        "type": "remove_pedestrian",
        "label": "Remove Pedestrian Crossings",
        "description": "Disable pedestrian phase entirely to maximise vehicle throughput.",
        "icon": "🚫",
        "color": "#94a3b8",
        "overrides": {
            "pedestrian_crossings": "disabled",
        },
    },
    {
        "type": "custom_design",
        "label": "Custom Lane Design",
        "description": "Configure lane counts, directions, and signal types at the individual lane level.",
        "icon": "🛠️",
        "color": "#3b82f6",
        "overrides": {},
    },
]


# ---------------------------------------------------------------------------
# Request / Result dataclasses
# ---------------------------------------------------------------------------

@dataclass
class IntersectionProfile:
    intersection_id: str
    name: str
    arms: int = 4
    lanes_per_arm: int = 3
    traffic_volume_vph: int = 2000
    vehicle_mix: str = "hyderabad_mixed"
    traffic_pattern: str = "uniform"


@dataclass
class ScenarioRequest:
    scenario_id: str          # uuid generated by frontend
    label: str
    scenario_type: str        # from SCENARIO_TYPES[*].type
    training_depth: str       # "quick" | "full"
    phase_scheme: Optional[str] = None      # for phase_change type
    extra_arm_target: Optional[int] = None  # for extra_arm type (new total arm count)
    user_overrides: dict = field(default_factory=dict)
    evaluation_model: Optional[str] = None


@dataclass
class KpiResult:
    avg_wait_s: float = 0.0
    avg_queue_len: float = 0.0
    throughput_vph: float = 0.0
    flow_efficiency: float = 0.0
    episode_reward: float = 0.0
    episodes_trained: int = 0
    convergence_episode: Optional[int] = None
    training_curve: list = field(default_factory=list)   # list of (episode, reward)
    fuel_index_ml_veh: float = 0.0
    carbon_index_g_veh: float = 0.0


@dataclass
class ScenarioResult:
    scenario_id: str
    label: str
    scenario_type: str
    training_depth: str
    status: str = "pending"   # pending | running | done | error
    error: Optional[str] = None
    kpi: Optional[KpiResult] = None
    sim_config_summary: dict = field(default_factory=dict)
