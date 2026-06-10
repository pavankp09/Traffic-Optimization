"""
Session Store for Traffic Signal Optimization.

Persists training sessions, episodes, metrics, and insight cards to SQLite
via SQLAlchemy ORM.
"""
from __future__ import annotations

import dataclasses
import json
import logging
from typing import Optional

from sqlalchemy import create_engine, desc
from sqlalchemy.orm import Session

from backend.config import SimulationConfig, AdverseConfig
from backend.analytics.metrics import EpisodeMetrics
from backend.analytics.economic import EconomicSummary
from backend.db.models import (
    init_db,
    TrainingSession,
    Episode,
    MetricRecord,
    InsightCard,
)

logger = logging.getLogger(__name__)


def _orm_to_dict(obj) -> dict:
    """Convert an ORM row to a plain dict using table column metadata."""
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


class SessionStore:
    """
    Persists training sessions, episodes, and metrics to SQLite via SQLAlchemy.
    """

    def __init__(self, db_url: str = "sqlite:///backend/db/traffic.db"):
        self._engine = create_engine(db_url, echo=False)
        init_db(db_url)  # ensure all tables exist

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def create_session(
        self,
        session_id: str,
        sim_config: SimulationConfig,
        adverse_config: AdverseConfig,
    ) -> str:
        """
        Creates a TrainingSession row in the DB.

        The session_id is stored in the ``notes`` field (used as a string
        identifier) and the numeric primary key is managed by the ORM.
        Sim and adverse configs are stored as JSON.

        Returns the session_id passed in.
        """
        sim_json = json.dumps(dataclasses.asdict(sim_config), default=str)
        adverse_json = json.dumps(dataclasses.asdict(adverse_config), default=str)

        try:
            with Session(self._engine) as session:
                row = TrainingSession(
                    sim_config=json.loads(sim_json),
                    adverse_config=json.loads(adverse_json),
                    status="running",
                    total_episodes=0,
                    baseline_type=getattr(sim_config, "baseline_controller", "fixed_time"),
                    notes=session_id,  # store string session_id here
                )
                session.add(row)
                session.commit()
                logger.info("Created session %s (pk=%s)", session_id, row.id)
        except Exception:
            logger.exception("Failed to create session %s", session_id)
            raise

        return session_id

    def save_or_update_session(
        self,
        session_id: str,
        sim_config: SimulationConfig,
        adverse_config: AdverseConfig,
    ) -> str:
        """
        Creates or updates a TrainingSession row in the DB with new configurations.
        """
        sim_json = json.dumps(dataclasses.asdict(sim_config), default=str)
        adverse_json = json.dumps(dataclasses.asdict(adverse_config), default=str)

        try:
            with Session(self._engine) as session:
                row = (
                    session.query(TrainingSession)
                    .filter(TrainingSession.notes == session_id)
                    .first()
                )
                if row is None:
                    row = TrainingSession(
                        sim_config=json.loads(sim_json),
                        adverse_config=json.loads(adverse_json),
                        status="running",
                        total_episodes=0,
                        baseline_type=getattr(sim_config, "baseline_controller", "fixed_time"),
                        notes=session_id,
                    )
                    session.add(row)
                else:
                    row.sim_config = json.loads(sim_json)
                    row.adverse_config = json.loads(adverse_json)
                    row.baseline_type = getattr(sim_config, "baseline_controller", "fixed_time")
                session.commit()
                logger.info("Saved/Updated session %s (pk=%s)", session_id, row.id)
        except Exception:
            logger.exception("Failed to save or update session %s", session_id)
            raise

        return session_id

    def update_session_status(
        self,
        session_id: str,
        status: str,
        total_episodes: int = None,
        best_reward: float = None,
    ) -> None:
        """Updates TrainingSession status and optional aggregated fields."""
        try:
            with Session(self._engine) as session:
                row = (
                    session.query(TrainingSession)
                    .filter(TrainingSession.notes == session_id)
                    .first()
                )
                if row is None:
                    logger.warning(
                        "update_session_status: session %s not found", session_id
                    )
                    return
                row.status = status
                if total_episodes is not None:
                    row.total_episodes = total_episodes
                if best_reward is not None:
                    row.best_reward = best_reward
                session.commit()
        except Exception:
            logger.exception(
                "Failed to update status for session %s", session_id
            )
            raise

    # ------------------------------------------------------------------
    # Episode / metric persistence
    # ------------------------------------------------------------------

    def save_episode(
        self,
        session_id: str,
        episode_num: int,
        metrics: EpisodeMetrics,
        reward: float,
        economic_summary: Optional[EconomicSummary] = None,
    ) -> str:
        """
        Saves an Episode row and a MetricRecord row atomically.

        Returns the Episode DB id as a string.
        """
        try:
            with Session(self._engine) as session:
                # Resolve integer FK
                ts_row = (
                    session.query(TrainingSession)
                    .filter(TrainingSession.notes == session_id)
                    .first()
                )
                if ts_row is None:
                    raise ValueError(
                        f"save_episode: TrainingSession not found for {session_id}"
                    )
                ts_pk = ts_row.id

                # Episode row
                episode_row = Episode(
                    session_id=ts_pk,
                    episode_number=episode_num,
                    total_reward=reward,
                    avg_wait_time_s=metrics.avg_wait_s,
                    throughput=int(metrics.throughput_vph),
                    green_utilisation_pct=metrics.green_utilisation * 100.0,
                    collision_count=metrics.collision_count,
                    violation_count=metrics.violation_count,
                    convergence_pct=metrics.signal_efficiency * 100.0,
                )
                session.add(episode_row)
                session.flush()  # get episode_row.id before committing

                # MetricRecord row — store full EpisodeMetrics as JSON
                eco = economic_summary
                metric_row = MetricRecord(
                    session_id=ts_pk,
                    episode_number=episode_num,
                    avg_wait_rl_s=metrics.avg_wait_s,
                    throughput_rl=int(metrics.throughput_vph),
                    green_utilisation_pct=metrics.green_utilisation * 100.0,
                    signal_efficiency_pct=metrics.signal_efficiency * 100.0,
                    collision_count=metrics.collision_count,
                    fuel_saved_l=(eco.total_fuel_saved_l if eco else None),
                    co2_avoided_kg=(eco.total_co2_avoided_kg if eco else None),
                    fuel_cost_saved_inr=(eco.total_fuel_cost_saved_inr if eco else None),
                    time_value_saved_inr=(eco.total_time_value_saved_inr if eco else None),
                    total_economic_inr_per_hr=(eco.total_saving_inr if eco else None),
                )
                session.add(metric_row)
                session.commit()

                episode_id = str(episode_row.id)
                logger.debug(
                    "Saved episode %s/%s (db id=%s)", session_id, episode_num, episode_id
                )
                return episode_id
        except Exception:
            logger.exception(
                "Failed to save episode %s for session %s", episode_num, session_id
            )
            raise

    # ------------------------------------------------------------------
    # Insight persistence
    # ------------------------------------------------------------------

    def save_insight(self, insight: dict) -> str:
        """Saves an InsightCard dict to the DB. Returns the insight DB id."""
        try:
            with Session(self._engine) as session:
                # Resolve integer FK
                ts_row = (
                    session.query(TrainingSession)
                    .filter(TrainingSession.notes == insight["session_id"])
                    .first()
                )
                if ts_row is None:
                    raise ValueError(
                        f"save_insight: TrainingSession not found for "
                        f"{insight['session_id']}"
                    )
                row = InsightCard(
                    session_id=ts_row.id,
                    episode_number=insight["episode_number"],
                    icon=insight["icon"],
                    message=insight["message"],
                    card_type=insight["card_type"],
                )
                session.add(row)
                session.commit()
                logger.debug("Saved insight card id=%s", row.id)
                return str(row.id)
        except Exception:
            logger.exception("Failed to save insight card")
            raise

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------

    def get_session(self, session_id: str) -> Optional[dict]:
        """Returns TrainingSession as dict, or None if not found."""
        try:
            with Session(self._engine) as session:
                row = (
                    session.query(TrainingSession)
                    .filter(TrainingSession.notes == session_id)
                    .first()
                )
                if row is None:
                    return None
                return _orm_to_dict(row)
        except Exception:
            logger.exception("Failed to get session %s", session_id)
            raise

    def get_episodes(self, session_id: str, limit: int = 100) -> list[dict]:
        """Returns list of Episode dicts ordered by episode_number, limited."""
        try:
            with Session(self._engine) as session:
                ts_row = (
                    session.query(TrainingSession)
                    .filter(TrainingSession.notes == session_id)
                    .first()
                )
                if ts_row is None:
                    return []
                rows = (
                    session.query(Episode)
                    .filter(Episode.session_id == ts_row.id)
                    .order_by(Episode.episode_number)
                    .limit(limit)
                    .all()
                )
                return [_orm_to_dict(r) for r in rows]
        except Exception:
            logger.exception("Failed to get episodes for session %s", session_id)
            raise

    def get_insights(self, session_id: str) -> list[dict]:
        """Returns all InsightCard dicts for session ordered by episode_number."""
        try:
            with Session(self._engine) as session:
                ts_row = (
                    session.query(TrainingSession)
                    .filter(TrainingSession.notes == session_id)
                    .first()
                )
                if ts_row is None:
                    return []
                rows = (
                    session.query(InsightCard)
                    .filter(InsightCard.session_id == ts_row.id)
                    .order_by(InsightCard.episode_number)
                    .all()
                )
                return [_orm_to_dict(r) for r in rows]
        except Exception:
            logger.exception("Failed to get insights for session %s", session_id)
            raise

    def list_sessions(self, limit: int = 20) -> list[dict]:
        """Returns most recent sessions as list of dicts, ordered by created_at desc."""
        try:
            with Session(self._engine) as session:
                rows = (
                    session.query(TrainingSession)
                    .order_by(desc(TrainingSession.created_at))
                    .limit(limit)
                    .all()
                )
                return [_orm_to_dict(r) for r in rows]
        except Exception:
            logger.exception("Failed to list sessions")
            raise

    def delete_session(self, session_id: str) -> bool:
        """
        Deletes a session and all related records (cascaded by ORM).
        Returns True if the session was found and deleted, False otherwise.
        """
        try:
            with Session(self._engine) as session:
                row = (
                    session.query(TrainingSession)
                    .filter(TrainingSession.notes == session_id)
                    .first()
                )
                if row is None:
                    return False
                session.delete(row)
                session.commit()
                logger.info("Deleted session %s", session_id)
                return True
        except Exception:
            logger.exception("Failed to delete session %s", session_id)
            raise
