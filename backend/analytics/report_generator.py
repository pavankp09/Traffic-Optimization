"""
Report Generator for Traffic Signal Optimization Pilot.

Generates HTML and PDF reports from training session results using
Jinja2 templating and WeasyPrint PDF rendering.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from jinja2 import Environment, FileSystemLoader

from backend.analytics.metrics import EpisodeMetrics, MetricsCalculator
from backend.analytics.economic import EconomicSummary


# ---------------------------------------------------------------------------
# Default template directory: same directory as this file
# ---------------------------------------------------------------------------
_DEFAULT_TEMPLATE_DIR = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------------------
# Data structure
# ---------------------------------------------------------------------------

@dataclass
class ReportData:
    session_id: str
    location: str                          # e.g. "Hyderabad - HITEC City Junction"
    generated_at: str                      # ISO datetime string
    total_episodes: int

    # Section 1: Executive Summary
    headline_metric: str                   # e.g. "38% average wait time reduction"
    key_achievements: list                 # 3-5 bullet points

    # Section 2: Methodology
    sim_config_summary: dict               # subset of sim config fields
    rl_approach: str                       # brief description

    # Section 3: Results
    baseline_metrics: EpisodeMetrics
    rl_best_metrics: EpisodeMetrics
    delta: dict                            # from metrics.compute_delta()
    episode_rewards: list                  # reward curve

    # Section 4: Economic Impact
    economic: EconomicSummary

    # Section 5: City-Wide Projection
    city_intersections: int
    city_annual_saving_inr: float
    city_annual_co2_tonne: float

    # Section 6: Recommendations
    recommendations: list                  # auto-generated based on results

    # Section 7: Technical Appendix
    state_space_description: str
    action_space_description: str
    hyperparameters: dict
    training_duration_s: float


# ---------------------------------------------------------------------------
# Default hyperparameters
# ---------------------------------------------------------------------------
_DEFAULT_HYPERPARAMETERS = {
    "algorithm": "PPO",
    "learning_rate": 3e-4,
    "n_steps": 2048,
    "batch_size": 64,
    "n_epochs": 10,
    "gamma": 0.99,
    "gae_lambda": 0.95,
    "clip_range": 0.2,
    "ent_coef": 0.01,
    "vf_coef": 0.5,
    "max_grad_norm": 0.5,
    "policy": "MlpPolicy",
    "framework": "Stable-Baselines3",
}

# Default sim config summary used when none is provided
_DEFAULT_SIM_CONFIG_SUMMARY = {
    "intersection_type": "4-arm signalised junction",
    "n_lanes": 2,
    "total_vph": 1200,
    "n_phases": 5,
}

_RL_APPROACH = (
    "Proximal Policy Optimization (PPO) with 22-dimensional state space and "
    "Discrete(35) action space, trained with Stable-Baselines3"
)

_STATE_SPACE_DESCRIPTION = (
    "22-dimensional state: queue lengths (x4), wait times (x4), flow rates (x4), "
    "heavy vehicle ratios (x4), current phase, phase elapsed, time of day, "
    "total delay, emergency flag, adverse severity"
)

_ACTION_SPACE_DESCRIPTION = (
    "Discrete(35) = 5 signal phases x 7 durations (15, 20, 25, 30, 40, 50, 60 seconds)"
)


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class ReportGenerator:
    """
    Generates HTML and PDF pilot reports for the traffic signal optimization project.
    """

    def __init__(
        self,
        template_dir: str = None,
        logo_path: str = None,
    ):
        self.template_dir = template_dir or _DEFAULT_TEMPLATE_DIR
        self.logo_path = logo_path

        env = Environment(
            loader=FileSystemLoader(self.template_dir),
            autoescape=False,
        )
        self._env = env

    # ------------------------------------------------------------------
    def build_report_data(
        self,
        session_id: str,
        location: str,
        baseline_metrics: EpisodeMetrics,
        rl_episode_metrics: list,    # list[EpisodeMetrics]
        economic_summary: EconomicSummary,
        episode_rewards: list,        # list[float]
        sim_config_dict: dict = None,
        training_duration_s: float = 0.0,
    ) -> ReportData:
        """
        Build a ReportData from raw training session results.

        Parameters
        ----------
        session_id : str
        location : str
        baseline_metrics : EpisodeMetrics
        rl_episode_metrics : list[EpisodeMetrics]  — all RL episodes
        economic_summary : EconomicSummary
        episode_rewards : list[float]  — reward per episode
        sim_config_dict : dict, optional  — full sim config; a subset is extracted
        training_duration_s : float
        """
        # Best RL episode = lowest avg_wait_s
        if rl_episode_metrics:
            rl_best_metrics = min(rl_episode_metrics, key=lambda e: e.avg_wait_s)
        else:
            rl_best_metrics = baseline_metrics

        # Compute delta
        calc = MetricsCalculator(vehicle_types={})
        delta = calc.compute_delta(baseline_metrics, rl_best_metrics)

        # Headline
        wait_pct = delta["wait_reduction_pct"]
        headline_metric = f"{wait_pct:.0f}% average wait time reduction"

        # Key achievements
        key_achievements = [
            (
                f"Wait time reduced from {baseline_metrics.avg_wait_s:.1f}s to "
                f"{rl_best_metrics.avg_wait_s:.1f}s per vehicle"
            ),
            f"Throughput improved by {delta['throughput_gain_vph']:.0f} vehicles/hour",
            f"Signal efficiency improved to {rl_best_metrics.signal_efficiency * 100:.1f}%",
            f"₹{economic_summary.total_saving_inr:,.0f} total economic saving per episode",
            f"{economic_summary.total_co2_avoided_kg:.1f} kg CO₂ avoided per episode",
        ]

        # Recommendations
        recommendations = _build_recommendations(rl_best_metrics)

        # Sim config summary
        if sim_config_dict is not None:
            sim_config_summary = {
                k: sim_config_dict[k]
                for k in ("intersection_type", "n_lanes", "total_vph", "n_phases")
                if k in sim_config_dict
            }
        else:
            sim_config_summary = dict(_DEFAULT_SIM_CONFIG_SUMMARY)

        # Hyperparameters overridden by actual training run config
        hyperparams = dict(_DEFAULT_HYPERPARAMETERS)
        if sim_config_dict is not None:
            for k in ("learning_rate", "hidden_layer_size"):
                if k in sim_config_dict and sim_config_dict[k] is not None:
                    hyperparams[k] = sim_config_dict[k]
            if "ppo_epochs" in sim_config_dict and sim_config_dict["ppo_epochs"] is not None:
                hyperparams["n_epochs"] = sim_config_dict["ppo_epochs"]
            if "discount_factor" in sim_config_dict and sim_config_dict["discount_factor"] is not None:
                hyperparams["gamma"] = sim_config_dict["discount_factor"]
            alg = sim_config_dict.get("rl_algorithm") or sim_config_dict.get("algorithm")
            if alg:
                hyperparams["algorithm"] = alg

        return ReportData(
            session_id=session_id,
            location=location,
            generated_at=datetime.now(tz=timezone.utc).isoformat(),
            total_episodes=len(rl_episode_metrics),
            headline_metric=headline_metric,
            key_achievements=key_achievements,
            sim_config_summary=sim_config_summary,
            rl_approach=_RL_APPROACH,
            baseline_metrics=baseline_metrics,
            rl_best_metrics=rl_best_metrics,
            delta=delta,
            episode_rewards=list(episode_rewards),
            economic=economic_summary,
            city_intersections=economic_summary.city_intersections,
            city_annual_saving_inr=economic_summary.city_annual_saving_inr,
            city_annual_co2_tonne=economic_summary.city_annual_co2_avoided_tonne,
            recommendations=recommendations,
            state_space_description=_STATE_SPACE_DESCRIPTION,
            action_space_description=_ACTION_SPACE_DESCRIPTION,
            hyperparameters=hyperparams,
            training_duration_s=training_duration_s,
        )

    # ------------------------------------------------------------------
    def render_html(self, data: ReportData) -> str:
        """
        Render ReportData to an HTML string using Jinja2 and report_template.html.

        Returns
        -------
        str  — complete HTML document
        """
        template = self._env.get_template("report_template.html")
        return template.render(data=data)

    # ------------------------------------------------------------------
    def render_pdf(self, data: ReportData) -> bytes:
        """
        Render ReportData to PDF bytes using WeasyPrint.

        Returns
        -------
        bytes  — PDF document
        """
        from weasyprint import HTML  # imported lazily so WeasyPrint is optional
        html_str = self.render_html(data)
        return HTML(string=html_str).write_pdf()

    # ------------------------------------------------------------------
    def save_pdf(self, data: ReportData, output_path: str) -> str:
        """
        Save PDF to output_path.

        Parameters
        ----------
        data : ReportData
        output_path : str  — destination file path (will be created/overwritten)

        Returns
        -------
        str  — absolute path to saved file
        """
        pdf_bytes = self.render_pdf(data)
        abs_path = os.path.abspath(output_path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "wb") as fh:
            fh.write(pdf_bytes)
        return abs_path


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_recommendations(rl_best_metrics: EpisodeMetrics) -> list:
    """Auto-generate recommendations from RL best metrics."""
    recs = []

    if rl_best_metrics.collision_count > 0:
        recs.append(
            "Install pedestrian detection to further reduce collision risk"
        )

    if rl_best_metrics.green_utilisation < 0.7:
        recs.append(
            "Consider extending minimum green time for under-utilized phases"
        )

    # Check heavy vehicle ratio across arms
    has_heavy_arm = any(
        arm_m.heavy_vehicle_ratio > 0.3
        for arm_m in rl_best_metrics.per_arm.values()
    )
    if has_heavy_arm:
        recs.append(
            "Add dedicated heavy vehicle phase for arms with >30% heavy traffic"
        )

    # Always-present recommendations
    recs.append(
        "Deploy model to live GHMC signal controller for real-world validation"
    )
    recs.append(
        "Expand to adjacent intersections to capture network-level benefits"
    )

    return recs
