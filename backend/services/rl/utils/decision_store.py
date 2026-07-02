"""
Thread-safe in-memory store for per-decision RL training data.

Keyed by session_id → episode_num → {decisions: [], summary: {}}.
Data is lost on server restart — acceptable for a research tool.
"""
from __future__ import annotations

import threading
from typing import Optional


class DecisionStore:
    """Stores decision-level data (obs, action, probs, importance, reward) per episode."""

    def __init__(self) -> None:
        # {session_id: {ep_num: {"decisions": list, "summary": dict}}}
        self._data: dict[str, dict[int, dict]] = {}
        self._lock = threading.Lock()

    def append(self, session_id: str, ep_num: int, decision: dict) -> None:
        """Append one decision record to the given session/episode."""
        with self._lock:
            session = self._data.setdefault(session_id, {})
            episode = session.setdefault(ep_num, {"decisions": [], "summary": {}})
            episode["decisions"].append(decision)

    def finalise_episode(self, session_id: str, ep_num: int, summary: dict) -> None:
        """Store episode-level summary (total_reward, mean_wait, throughput)."""
        with self._lock:
            session = self._data.setdefault(session_id, {})
            episode = session.setdefault(ep_num, {"decisions": [], "summary": {}})
            episode["summary"] = summary

    def get_episodes(self, session_id: str) -> list[dict]:
        """Return a list of episode summaries for the REST episode-list endpoint."""
        with self._lock:
            session = self._data.get(session_id, {})
            result = []
            for ep_num in sorted(session.keys()):
                ep = session[ep_num]
                summary = ep.get("summary", {})
                result.append({
                    "ep":          ep_num,
                    "total_reward": summary.get("total_reward", 0.0),
                    "mean_wait":   summary.get("mean_wait", 0.0),
                    "throughput":  summary.get("throughput", 0),
                    "n_decisions": len(ep["decisions"]),
                })
            return result

    def get_episode(self, session_id: str, ep_num: int) -> Optional[dict]:
        """Return full episode data (summary + decisions) or None if not found."""
        with self._lock:
            session = self._data.get(session_id)
            if session is None:
                return None
            return session.get(ep_num)

    def clear(self, session_id: str) -> None:
        """Remove all data for a session (called at training start to free memory)."""
        with self._lock:
            self._data.pop(session_id, None)


# Module-level singleton shared across socket_handlers and trainer callbacks
STORE = DecisionStore()
