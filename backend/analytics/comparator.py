"""
Session Comparator for Traffic Signal Optimization.

Side-by-side KPI comparison and episode curve retrieval for two training sessions.
"""
from __future__ import annotations

import logging
from typing import Optional

from backend.analytics.session_store import SessionStore

logger = logging.getLogger(__name__)


def _session_stats(episodes: list[dict]) -> dict:
    """
    Compute aggregate stats from a list of episode dicts (as stored in the DB).

    Returns averages and totals that mirror the comparator's session summary.
    """
    n = len(episodes)
    if n == 0:
        return {
            "avg_wait_s": 0.0,
            "avg_throughput_vph": 0.0,
            "avg_green_utilisation": 0.0,
            "total_collisions": 0,
        }

    avg_wait_s = sum(
        (e.get("avg_wait_time_s") or 0.0) for e in episodes
    ) / n
    avg_throughput_vph = sum(
        (e.get("throughput") or 0.0) for e in episodes
    ) / n
    avg_green_utilisation = sum(
        (e.get("green_utilisation_pct") or 0.0) for e in episodes
    ) / n / 100.0  # stored as percentage, return as fraction
    total_collisions = sum(
        (e.get("collision_count") or 0) for e in episodes
    )

    return {
        "avg_wait_s": avg_wait_s,
        "avg_throughput_vph": avg_throughput_vph,
        "avg_green_utilisation": avg_green_utilisation,
        "total_collisions": total_collisions,
    }


class SessionComparator:
    """
    Side-by-side KPI comparison between two training sessions.
    """

    def __init__(self, session_store: SessionStore):
        self._store = session_store

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compare(self, session_id_a: str, session_id_b: str) -> dict:
        """
        Compare two sessions and return a structured comparison dict.

        Both sessions must exist in the DB; episodes are loaded and
        aggregated on-the-fly.
        """
        # Load session metadata
        meta_a = self._store.get_session(session_id_a) or {}
        meta_b = self._store.get_session(session_id_b) or {}

        # Load all episodes for each session (no limit for comparison)
        episodes_a = self._store.get_episodes(session_id_a, limit=10_000)
        episodes_b = self._store.get_episodes(session_id_b, limit=10_000)

        stats_a = _session_stats(episodes_a)
        stats_b = _session_stats(episodes_b)

        session_a = {
            "session_id": session_id_a,
            "status": meta_a.get("status", "unknown"),
            "total_episodes": meta_a.get("total_episodes", len(episodes_a)),
            "best_reward": meta_a.get("best_reward"),
            "avg_wait_s": stats_a["avg_wait_s"],
            "avg_throughput_vph": stats_a["avg_throughput_vph"],
            "avg_green_utilisation": stats_a["avg_green_utilisation"],
            "total_collisions": stats_a["total_collisions"],
        }

        session_b = {
            "session_id": session_id_b,
            "status": meta_b.get("status", "unknown"),
            "total_episodes": meta_b.get("total_episodes", len(episodes_b)),
            "best_reward": meta_b.get("best_reward"),
            "avg_wait_s": stats_b["avg_wait_s"],
            "avg_throughput_vph": stats_b["avg_throughput_vph"],
            "avg_green_utilisation": stats_b["avg_green_utilisation"],
            "total_collisions": stats_b["total_collisions"],
        }

        # Winner: lower avg_wait_s wins; tie if difference < 1.0 s
        delta_wait = stats_a["avg_wait_s"] - stats_b["avg_wait_s"]
        if abs(delta_wait) < 1.0:
            winner = "tie"
        elif delta_wait > 0:
            winner = "b"   # b has lower wait
        else:
            winner = "a"   # a has lower wait

        deltas = {
            "wait_s": delta_wait,                                          # a - b
            "throughput_vph": stats_b["avg_throughput_vph"] - stats_a["avg_throughput_vph"],  # b - a
            "green_util": stats_b["avg_green_utilisation"] - stats_a["avg_green_utilisation"],
            "collisions": stats_a["total_collisions"] - stats_b["total_collisions"],           # a - b
        }

        if winner == "a":
            recommendation = (
                f"Session A performs better with {abs(delta_wait):.1f}s lower wait time."
            )
        elif winner == "b":
            recommendation = (
                f"Session B performs better with {abs(delta_wait):.1f}s lower wait time."
            )
        else:
            recommendation = (
                "Sessions perform comparably — consider other metrics for selection."
            )

        return {
            "session_a": session_a,
            "session_b": session_b,
            "winner": winner,
            "deltas": deltas,
            "recommendation": recommendation,
        }

    def get_episode_curves(self, session_id: str) -> dict:
        """
        Returns time-series data for plotting episode-level trends.
        """
        episodes = self._store.get_episodes(session_id, limit=10_000)

        ep_numbers: list[int] = []
        rewards: list[float] = []
        wait_times: list[float] = []
        throughput: list[float] = []

        for ep in episodes:
            ep_numbers.append(ep.get("episode_number", 0))
            rewards.append(ep.get("total_reward") or 0.0)
            wait_times.append(ep.get("avg_wait_time_s") or 0.0)
            throughput.append(float(ep.get("throughput") or 0))

        return {
            "episodes": ep_numbers,
            "rewards": rewards,
            "wait_times": wait_times,
            "throughput": throughput,
        }
