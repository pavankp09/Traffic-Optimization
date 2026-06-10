"""
Tests for backend.analytics.report_generator — ReportGenerator and ReportData.

All tests use synthetic data; no SUMO, database, or WeasyPrint required
for the HTML tests.
"""
from __future__ import annotations

import pytest

from backend.analytics.metrics import EpisodeMetrics, ArmMetrics
from backend.analytics.economic import EconomicSummary
from backend.analytics.report_generator import ReportGenerator, ReportData


# ---------------------------------------------------------------------------
# Synthetic data helpers
# ---------------------------------------------------------------------------

def make_episode(
    episode_id: str = "ep_1",
    session_id: str = "sess_test",
    avg_wait_s: float = 60.0,
    throughput_vph: float = 800.0,
    green_utilisation: float = 0.65,
    collision_count: int = 2,
    violation_count: int = 3,
    signal_efficiency: float = 0.44,
    total_delay_veh_hrs: float = 10.0,
) -> EpisodeMetrics:
    """Build a minimal EpisodeMetrics for report tests."""
    return EpisodeMetrics(
        episode_id=episode_id,
        session_id=session_id,
        duration_s=3600,
        n_vehicles=800,
        avg_wait_s=avg_wait_s,
        per_type={},
        per_arm={},
        throughput_vph=throughput_vph,
        green_utilisation=green_utilisation,
        collision_count=collision_count,
        violation_count=violation_count,
        signal_efficiency=signal_efficiency,
        avg_phase_duration_s=30.0,
        adverse_events_count=0,
        total_delay_veh_hrs=total_delay_veh_hrs,
    )


def make_economic_summary(session_id: str = "sess_test") -> EconomicSummary:
    """Build a minimal EconomicSummary for report tests."""
    return EconomicSummary(
        session_id=session_id,
        baseline_avg_wait_s=60.0,
        rl_avg_wait_s=37.0,
        wait_reduction_s=23.0,
        fuel_saved_l_per_veh=0.25,
        co2_avoided_kg_per_veh=0.58,
        fuel_cost_saved_inr_per_veh=25.0,
        time_value_saved_inr_per_veh=18.0,
        total_saving_inr_per_veh=43.0,
        total_fuel_saved_l=200.0,
        total_co2_avoided_kg=462.0,
        total_co2_avoided_tonne=0.462,
        total_fuel_cost_saved_inr=20000.0,
        total_time_value_saved_inr=14400.0,
        total_saving_inr=34400.0,
        carbon_credit_value_inr=924.0,
        city_intersections=650,
        city_daily_saving_inr=111_800_000.0,
        city_annual_saving_inr=40_807_000_000.0,
        city_annual_co2_avoided_tonne=109_337.5,
        per_type={},
    )


def make_report_data() -> ReportData:
    """Build a complete ReportData using ReportGenerator.build_report_data."""
    baseline = make_episode(
        episode_id="ep_baseline",
        avg_wait_s=60.0,
        throughput_vph=800.0,
        collision_count=2,
    )
    rl_episodes = [
        make_episode(episode_id="ep_rl_1", avg_wait_s=45.0, throughput_vph=900.0, collision_count=1),
        make_episode(episode_id="ep_rl_2", avg_wait_s=37.0, throughput_vph=950.0, collision_count=0),
        make_episode(episode_id="ep_rl_3", avg_wait_s=40.0, throughput_vph=920.0, collision_count=0),
    ]
    economic = make_economic_summary()
    rewards = [100.0, 150.0, 145.0]

    rg = ReportGenerator()
    return rg.build_report_data(
        session_id="sess_test",
        location="Hyderabad - HITEC City Junction",
        baseline_metrics=baseline,
        rl_episode_metrics=rl_episodes,
        economic_summary=economic,
        episode_rewards=rewards,
        training_duration_s=3600.0,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestBuildReportData:
    def test_build_report_data_returns_dataclass(self):
        """build_report_data should return a ReportData instance."""
        data = make_report_data()
        assert isinstance(data, ReportData)

    def test_headline_metric_contains_pct(self):
        """Headline metric must contain the '%' character."""
        data = make_report_data()
        assert "%" in data.headline_metric

    def test_key_achievements_count(self):
        """Exactly 5 key achievements should be generated."""
        data = make_report_data()
        assert len(data.key_achievements) == 5

    def test_recommendations_generated(self):
        """At least 2 recommendations should always be present."""
        data = make_report_data()
        assert len(data.recommendations) >= 2

    def test_rl_best_metrics_lowest_wait(self):
        """rl_best_metrics should be the episode with the lowest avg_wait_s."""
        data = make_report_data()
        # ep_rl_2 has lowest avg_wait_s = 37.0
        assert data.rl_best_metrics.avg_wait_s == 37.0

    def test_delta_keys_present(self):
        """delta dict must contain expected keys."""
        data = make_report_data()
        for key in ("wait_reduction_s", "wait_reduction_pct", "throughput_gain_vph",
                    "green_util_improvement", "collision_reduction"):
            assert key in data.delta

    def test_total_episodes_matches_input(self):
        """total_episodes must match the count of RL episode metrics passed."""
        data = make_report_data()
        assert data.total_episodes == 3

    def test_hyperparameters_contains_algorithm(self):
        """Hyperparameters dict must contain the 'algorithm' key."""
        data = make_report_data()
        assert "algorithm" in data.hyperparameters


class TestRenderHtml:
    def test_render_html_returns_string(self):
        """render_html must return a non-empty string."""
        rg = ReportGenerator()
        data = make_report_data()
        html = rg.render_html(data)
        assert isinstance(html, str) and len(html) > 0

    def test_render_html_contains_section_headers(self):
        """HTML must contain all 7 section titles."""
        rg = ReportGenerator()
        data = make_report_data()
        html = rg.render_html(data)
        for header in (
            "Executive Summary",
            "Methodology",
            "Results",
            "Economic Impact",
            "City-Wide",
            "Recommendations",
            "Technical Appendix",
        ):
            assert header in html, f"Section header '{header}' not found in rendered HTML"

    def test_render_html_contains_session_id(self):
        """The session_id must appear in the rendered HTML."""
        rg = ReportGenerator()
        data = make_report_data()
        html = rg.render_html(data)
        assert data.session_id in html


class TestRenderPdf:
    def test_render_pdf_returns_bytes(self, tmp_path):
        """render_pdf must return non-empty bytes (skip if WeasyPrint unavailable)."""
        try:
            import weasyprint  # noqa: F401
        except ImportError:
            pytest.skip("WeasyPrint not installed")
        rg = ReportGenerator()
        data = make_report_data()
        pdf = rg.render_pdf(data)
        assert isinstance(pdf, bytes) and len(pdf) > 0

    def test_save_pdf_creates_file(self, tmp_path):
        """save_pdf must write a non-empty file and return its path."""
        try:
            import weasyprint  # noqa: F401
        except ImportError:
            pytest.skip("WeasyPrint not installed")
        rg = ReportGenerator()
        data = make_report_data()
        out = str(tmp_path / "report.pdf")
        result_path = rg.save_pdf(data, out)
        import os
        assert os.path.isfile(result_path)
        assert os.path.getsize(result_path) > 0
