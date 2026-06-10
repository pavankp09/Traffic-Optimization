"""
Insight Generator for Traffic Signal Optimization.

Detects training milestones and generates InsightCard dicts for Socket.IO
and database persistence.
"""
from __future__ import annotations

import logging
from typing import Optional

from backend.analytics.metrics import EpisodeMetrics

logger = logging.getLogger(__name__)


class InsightGenerator:
    """
    Detects milestones during training and generates InsightCard dicts.

    No DB interaction — callers (SessionStore / trainer callbacks) are
    responsible for persisting the returned dicts.
    """

    def __init__(self, session_id: str, baseline_avg_wait_s: float = 60.0):
        self.session_id = session_id
        self.baseline_avg_wait_s = baseline_avg_wait_s

        # Internal state — reset via reset()
        self._best_reward: float = float("-inf")
        self._baseline_beaten: bool = False
        self._50pct_achieved: bool = False
        self._zero_collision_fired: bool = False
        self._high_throughput_fired: bool = False
        self._green_efficiency_fired: bool = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check_episode(
        self,
        episode_num: int,
        metrics: EpisodeMetrics,
        reward: float,
    ) -> list[dict]:
        """
        Check for milestones in the given episode.

        Returns a (possibly empty) list of InsightCard dicts.
        Each dict contains all fields needed to construct an InsightCard row.
        """
        cards: list[dict] = []

        # Helper to build a card dict
        def _card(
            icon: str,
            message: str,
            card_type: str,
            metric_value: float = 0.0,
            metric_key: str = "",
        ) -> dict:
            return {
                "session_id": self.session_id,
                "episode_number": episode_num,
                "icon": icon,
                "message": message,
                "card_type": card_type,
                "metric_value": metric_value,
                "metric_key": metric_key,
            }

        # 1. First episode
        if episode_num == 1:
            cards.append(
                _card(
                    icon="🚀",
                    message="Training started — agent exploring the intersection",
                    card_type="milestone",
                    metric_value=float(episode_num),
                    metric_key="episode_number",
                )
            )

        # 2. Beats fixed-time baseline (first time)
        baseline = self.baseline_avg_wait_s
        if not self._baseline_beaten and metrics.avg_wait_s < baseline:
            self._baseline_beaten = True
            cards.append(
                _card(
                    icon="🏆",
                    message=(
                        f"RL agent beats fixed-time baseline! "
                        f"Wait: {metrics.avg_wait_s:.1f}s vs {baseline:.1f}s baseline"
                    ),
                    card_type="achievement",
                    metric_value=metrics.avg_wait_s,
                    metric_key="avg_wait_s",
                )
            )

        # 3. New best episode (check before updating _best_reward)
        if reward > self._best_reward:
            # Only emit a card after the very first episode to avoid duplicate
            # with the "Training started" card on episode 1.
            if episode_num > 1 or self._best_reward != float("-inf"):
                cards.append(
                    _card(
                        icon="⭐",
                        message=f"New best episode #{episode_num}! Reward: {reward:.1f}",
                        card_type="achievement",
                        metric_value=reward,
                        metric_key="reward",
                    )
                )
            self._best_reward = reward

        # 4. 50% wait reduction (first time)
        if not self._50pct_achieved and metrics.avg_wait_s < 0.5 * baseline:
            self._50pct_achieved = True
            cards.append(
                _card(
                    icon="🎯",
                    message=f"50% wait time reduction achieved! Now {metrics.avg_wait_s:.1f}s",
                    card_type="achievement",
                    metric_value=metrics.avg_wait_s,
                    metric_key="avg_wait_s",
                )
            )

        # 5. Zero collisions (only after episode 10, fires once)
        if (
            not self._zero_collision_fired
            and episode_num > 10
            and metrics.collision_count == 0
        ):
            self._zero_collision_fired = True
            cards.append(
                _card(
                    icon="🛡️",
                    message="Zero collision episode — optimal safety achieved",
                    card_type="achievement",
                    metric_value=0.0,
                    metric_key="collision_count",
                )
            )

        # 6. High throughput (first time > 1500 vph)
        if not self._high_throughput_fired and metrics.throughput_vph > 1500:
            self._high_throughput_fired = True
            cards.append(
                _card(
                    icon="📈",
                    message=f"High throughput milestone: {metrics.throughput_vph:.0f} vph",
                    card_type="milestone",
                    metric_value=metrics.throughput_vph,
                    metric_key="throughput_vph",
                )
            )

        # 7. Green efficiency > 90% (first time)
        if not self._green_efficiency_fired and metrics.green_utilisation > 0.9:
            self._green_efficiency_fired = True
            cards.append(
                _card(
                    icon="🟢",
                    message=(
                        f"Green time efficiency above 90%: "
                        f"{metrics.green_utilisation * 100:.1f}%"
                    ),
                    card_type="milestone",
                    metric_value=metrics.green_utilisation,
                    metric_key="green_utilisation",
                )
            )

        return cards

    def reset(self) -> None:
        """Reset all internal milestone state."""
        self._best_reward = float("-inf")
        self._baseline_beaten = False
        self._50pct_achieved = False
        self._zero_collision_fired = False
        self._high_throughput_fired = False
        self._green_efficiency_fired = False
