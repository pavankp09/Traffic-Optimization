"""SQLAlchemy ORM models for Traffic Signal Optimizer."""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, Float, String, Boolean, DateTime,
    JSON, ForeignKey, Text, create_engine
)
from sqlalchemy.orm import declarative_base, relationship, Session

Base = declarative_base()


class TrainingSession(Base):
    __tablename__ = "training_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    preset_id = Column(String(100), nullable=True)
    sim_config = Column(JSON, nullable=False)
    adverse_config = Column(JSON, nullable=False)
    status = Column(String(20), default="running")  # running|completed|stopped
    total_episodes = Column(Integer, default=0)
    best_episode = Column(Integer, nullable=True)
    best_reward = Column(Float, nullable=True)
    baseline_type = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)

    episodes = relationship("Episode", back_populates="session", cascade="all, delete-orphan")
    metrics = relationship("MetricRecord", back_populates="session", cascade="all, delete-orphan")
    adverse_events = relationship("AdverseEventRecord", back_populates="session", cascade="all, delete-orphan")
    insights = relationship("InsightCard", back_populates="session", cascade="all, delete-orphan")


class Episode(Base):
    __tablename__ = "episodes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=False)
    episode_number = Column(Integer, nullable=False)
    total_reward = Column(Float, nullable=False)
    baseline_reward = Column(Float, nullable=True)
    avg_wait_time_s = Column(Float, nullable=True)
    baseline_wait_time_s = Column(Float, nullable=True)
    throughput = Column(Integer, nullable=True)
    green_utilisation_pct = Column(Float, nullable=True)
    collision_count = Column(Integer, default=0)
    violation_count = Column(Integer, default=0)
    convergence_pct = Column(Float, default=0.0)
    phase_durations = Column(JSON, nullable=True)   # {phase_id: avg_duration_s}
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("TrainingSession", back_populates="episodes")


class MetricRecord(Base):
    __tablename__ = "metric_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=False)
    episode_number = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Traffic
    avg_wait_rl_s = Column(Float, nullable=True)
    avg_wait_baseline_s = Column(Float, nullable=True)
    wait_saved_s = Column(Float, nullable=True)
    throughput_rl = Column(Integer, nullable=True)
    throughput_baseline = Column(Integer, nullable=True)
    green_utilisation_pct = Column(Float, nullable=True)
    signal_efficiency_pct = Column(Float, nullable=True)

    # Environmental
    fuel_saved_l = Column(Float, nullable=True)
    co2_avoided_kg = Column(Float, nullable=True)

    # Economic
    fuel_cost_saved_inr = Column(Float, nullable=True)
    time_value_saved_inr = Column(Float, nullable=True)
    carbon_credit_inr = Column(Float, nullable=True)
    total_economic_inr_per_hr = Column(Float, nullable=True)

    # Adverse
    collision_count = Column(Integer, default=0)
    violation_rate_per_100 = Column(Float, default=0.0)

    session = relationship("TrainingSession", back_populates="metrics")


class AdverseEventRecord(Base):
    __tablename__ = "adverse_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=False)
    episode_number = Column(Integer, nullable=False)
    sim_step = Column(Integer, nullable=False)
    event_type = Column(String(50), nullable=False)   # collision|signal_failure|waterlogging|...
    severity = Column(String(20), nullable=True)       # low|medium|high
    location = Column(String(50), nullable=True)       # arm/lane identifier
    duration_s = Column(Float, nullable=True)
    payload = Column(JSON, nullable=True)

    session = relationship("TrainingSession", back_populates="adverse_events")


class InsightCard(Base):
    __tablename__ = "insight_cards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=False)
    episode_number = Column(Integer, nullable=False)
    icon = Column(String(10), nullable=False)           # emoji
    message = Column(Text, nullable=False)
    card_type = Column(String(30), nullable=False)      # beats_baseline|convergence|best_episode|learned_pattern
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("TrainingSession", back_populates="insights")


def init_db(database_url: str = "sqlite:///backend/db/tso.db"):
    """Create all tables. Safe to call multiple times."""
    engine = create_engine(database_url, echo=False)
    Base.metadata.create_all(engine)
    return engine
