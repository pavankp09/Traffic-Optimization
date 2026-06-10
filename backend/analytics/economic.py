"""
Economic Calculator for Traffic Signal Optimization.

Computes fuel savings, CO2 avoidance, time-value savings, and city-wide
projections when comparing RL-controlled vs baseline (fixed-time) signal
operation in Hyderabad.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional

from backend.config import AppConfig, APP_CONFIG as DEFAULT_APP_CONFIG
from backend.simulation.vehicle_types import VEHICLE_TYPES
from backend.analytics.metrics import EpisodeMetrics


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class VehicleEconomics:
    type_id: str
    count: int
    wait_saved_s: float           # per vehicle average wait reduction
    fuel_saved_l: float           # total fuel saved (litres) across all vehicles of this type
    fuel_cost_saved_inr: float    # rupee value of fuel saved
    co2_avoided_kg: float         # total CO2 avoided (kg)
    time_value_saved_inr: float   # wait time * wage rate for all vehicles of this type


@dataclass
class EconomicSummary:
    session_id: str
    baseline_avg_wait_s: float
    rl_avg_wait_s: float
    wait_reduction_s: float           # per vehicle wait reduction

    # Per vehicle (single intersection, single trip)
    fuel_saved_l_per_veh: float
    co2_avoided_kg_per_veh: float
    fuel_cost_saved_inr_per_veh: float
    time_value_saved_inr_per_veh: float
    total_saving_inr_per_veh: float   # fuel_cost + time_value per vehicle

    # Fleet totals (all vehicles in episode)
    total_fuel_saved_l: float
    total_co2_avoided_kg: float
    total_co2_avoided_tonne: float
    total_fuel_cost_saved_inr: float
    total_time_value_saved_inr: float
    total_saving_inr: float

    # Carbon credits
    carbon_credit_value_inr: float    # co2_tonnes * 2000 INR/tonne

    # City-wide projection
    city_intersections: int
    city_daily_saving_inr: float      # total_saving * city_intersections * daily_trips_factor
    city_annual_saving_inr: float     # city_daily * 365
    city_annual_co2_avoided_tonne: float

    # Per vehicle breakdown by type
    per_type: dict  # dict[str, VehicleEconomics]


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class EconomicCalculator:
    """
    Computes economic benefit of RL-based signal control vs fixed-time baseline.
    Calibrated for Hyderabad, India (GHMC standards).
    """

    def __init__(
        self,
        app_config: Optional[AppConfig] = None,
        vehicle_types: Optional[dict] = None,
    ):
        self.config = app_config if app_config is not None else DEFAULT_APP_CONFIG
        self.vehicle_types = vehicle_types if vehicle_types is not None else VEHICLE_TYPES

    # ------------------------------------------------------------------
    def compute(
        self,
        session_id: str,
        baseline_metrics: EpisodeMetrics,
        rl_metrics: EpisodeMetrics,
        city_intersections: int = 650,           # Hyderabad GHMC signal count
        daily_trips_per_intersection: int = 5000,  # avg vehicles/day through intersection
    ) -> EconomicSummary:
        """
        Compute full economic summary comparing RL vs baseline episode metrics.

        Parameters
        ----------
        session_id : str
            Identifier for the training/evaluation session.
        baseline_metrics : EpisodeMetrics
            Metrics from the fixed-time baseline controller episode.
        rl_metrics : EpisodeMetrics
            Metrics from the RL-controlled episode.
        city_intersections : int
            Number of signalised intersections in the city (default: 650 for GHMC).
        daily_trips_per_intersection : int
            Average vehicles passing through one intersection per day.

        Returns
        -------
        EconomicSummary
        """
        cfg = self.config

        baseline_avg_wait = baseline_metrics.avg_wait_s
        rl_avg_wait = rl_metrics.avg_wait_s
        wait_reduction_s = max(0.0, baseline_avg_wait - rl_avg_wait)

        n_vehicles = max(rl_metrics.n_vehicles, 1)

        # ---- Per-type computation ----------------------------------------
        per_type: dict[str, VehicleEconomics] = {}

        for type_id, rl_vm in rl_metrics.per_type.items():
            count = rl_vm.count
            rl_wait = rl_vm.avg_wait_s

            # Baseline wait for this type; fall back to overall baseline avg
            if type_id in baseline_metrics.per_type:
                baseline_wait = baseline_metrics.per_type[type_id].avg_wait_s
            else:
                baseline_wait = baseline_metrics.avg_wait_s

            type_wait_saved_s = max(0.0, baseline_wait - rl_wait)

            # Vehicle type profile (skip types not in VEHICLE_TYPES)
            if type_id not in self.vehicle_types:
                profile = None
            else:
                profile = self.vehicle_types[type_id]

            if profile is not None:
                # Fuel saved: idle consumption * time saved * vehicle count
                fuel_saved_l = (
                    profile.idle_fuel_l_per_hr * type_wait_saved_s / 3600.0 * count
                )

                # CO2 avoided
                co2_avoided_kg = fuel_saved_l * profile.co2_factor_kg_per_l

                # Fuel cost saved based on fuel type
                if profile.fuel_type == "petrol":
                    price_per_l = cfg.petrol_price_inr_per_l
                elif profile.fuel_type == "diesel":
                    price_per_l = cfg.diesel_price_inr_per_l
                else:
                    # electric, CNG, etc. — treat as zero fuel cost benefit
                    price_per_l = 0.0

                fuel_cost_saved_inr = fuel_saved_l * price_per_l
            else:
                # Unknown vehicle type — zero contribution
                fuel_saved_l = 0.0
                co2_avoided_kg = 0.0
                fuel_cost_saved_inr = 0.0

            # Time value saved
            time_value_saved_inr = (
                type_wait_saved_s / 3600.0 * count * cfg.avg_wage_inr_per_hr
            )

            per_type[type_id] = VehicleEconomics(
                type_id=type_id,
                count=count,
                wait_saved_s=type_wait_saved_s,
                fuel_saved_l=fuel_saved_l,
                fuel_cost_saved_inr=fuel_cost_saved_inr,
                co2_avoided_kg=co2_avoided_kg,
                time_value_saved_inr=time_value_saved_inr,
            )

        # ---- Fleet totals ------------------------------------------------
        total_fuel_saved_l = sum(v.fuel_saved_l for v in per_type.values())
        total_co2_avoided_kg = sum(v.co2_avoided_kg for v in per_type.values())
        total_co2_avoided_tonne = total_co2_avoided_kg / 1000.0
        total_fuel_cost_saved_inr = sum(v.fuel_cost_saved_inr for v in per_type.values())
        total_time_value_saved_inr = sum(v.time_value_saved_inr for v in per_type.values())
        total_saving_inr = total_fuel_cost_saved_inr + total_time_value_saved_inr

        # ---- Per-vehicle averages ----------------------------------------
        fuel_saved_l_per_veh = total_fuel_saved_l / n_vehicles
        co2_avoided_kg_per_veh = total_co2_avoided_kg / n_vehicles
        fuel_cost_saved_inr_per_veh = total_fuel_cost_saved_inr / n_vehicles
        time_value_saved_inr_per_veh = total_time_value_saved_inr / n_vehicles
        total_saving_inr_per_veh = fuel_cost_saved_inr_per_veh + time_value_saved_inr_per_veh

        # ---- Carbon credits -----------------------------------------------
        carbon_credit_value_inr = total_co2_avoided_tonne * cfg.carbon_credit_inr_per_tonne

        # ---- City-wide projection -----------------------------------------
        # Scale: total_saving is for n_vehicles at 1 intersection for 1 episode.
        # Extrapolate to daily_trips_per_intersection vehicles per intersection.
        trips_scale = daily_trips_per_intersection / n_vehicles
        city_daily_saving_inr = total_saving_inr * city_intersections * trips_scale
        city_annual_saving_inr = city_daily_saving_inr * 365.0
        city_annual_co2_avoided_tonne = (
            total_co2_avoided_tonne * city_intersections * trips_scale * 365.0
        )

        return EconomicSummary(
            session_id=session_id,
            baseline_avg_wait_s=baseline_avg_wait,
            rl_avg_wait_s=rl_avg_wait,
            wait_reduction_s=wait_reduction_s,
            fuel_saved_l_per_veh=fuel_saved_l_per_veh,
            co2_avoided_kg_per_veh=co2_avoided_kg_per_veh,
            fuel_cost_saved_inr_per_veh=fuel_cost_saved_inr_per_veh,
            time_value_saved_inr_per_veh=time_value_saved_inr_per_veh,
            total_saving_inr_per_veh=total_saving_inr_per_veh,
            total_fuel_saved_l=total_fuel_saved_l,
            total_co2_avoided_kg=total_co2_avoided_kg,
            total_co2_avoided_tonne=total_co2_avoided_tonne,
            total_fuel_cost_saved_inr=total_fuel_cost_saved_inr,
            total_time_value_saved_inr=total_time_value_saved_inr,
            total_saving_inr=total_saving_inr,
            carbon_credit_value_inr=carbon_credit_value_inr,
            city_intersections=city_intersections,
            city_daily_saving_inr=city_daily_saving_inr,
            city_annual_saving_inr=city_annual_saving_inr,
            city_annual_co2_avoided_tonne=city_annual_co2_avoided_tonne,
            per_type=per_type,
        )


# ---------------------------------------------------------------------------
# Formatting helper
# ---------------------------------------------------------------------------

def format_economic_summary(summary: EconomicSummary) -> dict:
    """
    Returns human-readable formatted dict for UI display.

    All monetary values are formatted to 2 decimal places with INR symbol.
    Volume/weight values include appropriate units.
    Large numbers use comma separators.

    Example output keys:
        "fuel_saved_l_per_veh": "0.23 L"
        "co2_avoided_kg_per_veh": "0.54 kg"
        "fuel_cost_saved_inr_per_veh": "₹24.38"
        "total_saving_inr": "₹12,500.00"
    """
    def inr(value: float) -> str:
        return f"₹{value:,.2f}"

    def litres(value: float) -> str:
        return f"{value:,.3f} L"

    def kg(value: float) -> str:
        return f"{value:,.3f} kg"

    def tonne(value: float) -> str:
        return f"{value:,.4f} t"

    def seconds(value: float) -> str:
        return f"{value:.2f} s"

    return {
        "session_id": summary.session_id,
        "baseline_avg_wait_s": seconds(summary.baseline_avg_wait_s),
        "rl_avg_wait_s": seconds(summary.rl_avg_wait_s),
        "wait_reduction_s": seconds(summary.wait_reduction_s),

        # Per-vehicle
        "fuel_saved_l_per_veh": litres(summary.fuel_saved_l_per_veh),
        "co2_avoided_kg_per_veh": kg(summary.co2_avoided_kg_per_veh),
        "fuel_cost_saved_inr_per_veh": inr(summary.fuel_cost_saved_inr_per_veh),
        "time_value_saved_inr_per_veh": inr(summary.time_value_saved_inr_per_veh),
        "total_saving_inr_per_veh": inr(summary.total_saving_inr_per_veh),

        # Fleet totals
        "total_fuel_saved_l": litres(summary.total_fuel_saved_l),
        "total_co2_avoided_kg": kg(summary.total_co2_avoided_kg),
        "total_co2_avoided_tonne": tonne(summary.total_co2_avoided_tonne),
        "total_fuel_cost_saved_inr": inr(summary.total_fuel_cost_saved_inr),
        "total_time_value_saved_inr": inr(summary.total_time_value_saved_inr),
        "total_saving_inr": inr(summary.total_saving_inr),

        # Carbon credits
        "carbon_credit_value_inr": inr(summary.carbon_credit_value_inr),

        # City projections
        "city_intersections": str(summary.city_intersections),
        "city_daily_saving_inr": inr(summary.city_daily_saving_inr),
        "city_annual_saving_inr": inr(summary.city_annual_saving_inr),
        "city_annual_co2_avoided_tonne": tonne(summary.city_annual_co2_avoided_tonne),
    }
