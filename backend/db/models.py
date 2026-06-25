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
    vehicle_crossings = relationship("VehicleCrossing", back_populates="session", cascade="all, delete-orphan")
    simulation_runs = relationship("SimulationRun", back_populates="session", cascade="all, delete-orphan")


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
    fuel_index_ml_veh = Column(Float, nullable=True)
    carbon_index_g_veh = Column(Float, nullable=True)

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
    fuel_index_rl_ml_veh = Column(Float, nullable=True)
    fuel_index_baseline_ml_veh = Column(Float, nullable=True)
    carbon_index_rl_g_veh = Column(Float, nullable=True)
    carbon_index_baseline_g_veh = Column(Float, nullable=True)

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


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    simulation_id = Column(String(50), unique=True, nullable=False)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=False)
    sim_config = Column(JSON, nullable=False)
    adverse_config = Column(JSON, nullable=False)
    preset_name = Column(String(100), nullable=True)
    run_type = Column(String(30), nullable=True)
    model_name = Column(String(50), nullable=True)
    avg_wait_s = Column(Float, nullable=True)
    throughput = Column(Integer, nullable=True)
    green_util_pct = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    session = relationship("TrainingSession", back_populates="simulation_runs")
    vehicle_crossings = relationship("VehicleCrossing", back_populates="simulation_run", cascade="all, delete-orphan")


class VehicleCrossing(Base):
    __tablename__ = "vehicle_crossings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=False)
    simulation_id = Column(String(50), ForeignKey("simulation_runs.simulation_id"), nullable=True)
    vehicle_id = Column(String(50), nullable=False)
    vehicle_type = Column(String(30), nullable=False)
    number_plate = Column(String(20), nullable=False)
    entry_time = Column(Float, nullable=False)
    exit_time = Column(Float, nullable=False)
    crossing_duration = Column(Float, nullable=False)
    run_type = Column(String(30), nullable=True)
    algorithm = Column(String(30), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("TrainingSession", back_populates="vehicle_crossings")
    simulation_run = relationship("SimulationRun", back_populates="vehicle_crossings")


class CustomPreset(Base):
    __tablename__ = "custom_presets"

    id = Column(String(100), primary_key=True)
    name = Column(String(100), nullable=False)
    group_name = Column(String(50), default="custom")
    description = Column(Text, nullable=True)
    sim_config = Column(JSON, nullable=False)
    adverse_config = Column(JSON, nullable=True)
    tags = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


def init_db(database_url: str = "sqlite:///backend/db/tso.db"):
    """Create all tables. Safe to call multiple times."""
    import os
    if database_url.startswith("sqlite:///"):
        path = database_url[10:]
        if path and not path.startswith(":") and not os.path.isabs(path):
            backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            if path.startswith("backend/"):
                path = path[8:]
            elif path.startswith("backend\\"):
                path = path[8:]
            abs_path = os.path.abspath(os.path.join(backend_dir, path))
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)
            database_url = f"sqlite:///{abs_path}"

    engine = create_engine(database_url, echo=False)

    # Enable WAL mode for SQLite to prevent corruption and support high concurrency
    if "sqlite" in database_url:
        from sqlalchemy import event
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
            except Exception:
                pass
            finally:
                cursor.close()

    Base.metadata.create_all(engine)

    # In-place dynamic column migration for existing databases
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            columns_info = conn.execute(text("PRAGMA table_info(vehicle_crossings)")).fetchall()
            existing_cols = {col[1] for col in columns_info}
            if "run_type" not in existing_cols:
                conn.execute(text("ALTER TABLE vehicle_crossings ADD COLUMN run_type VARCHAR(30)"))
            if "algorithm" not in existing_cols:
                conn.execute(text("ALTER TABLE vehicle_crossings ADD COLUMN algorithm VARCHAR(30)"))
            if "simulation_id" not in existing_cols:
                conn.execute(text("ALTER TABLE vehicle_crossings ADD COLUMN simulation_id VARCHAR(50)"))

            # Migration for episodes
            columns_info_ep = conn.execute(text("PRAGMA table_info(episodes)")).fetchall()
            existing_cols_ep = {col[1] for col in columns_info_ep}
            if "fuel_index_ml_veh" not in existing_cols_ep:
                conn.execute(text("ALTER TABLE episodes ADD COLUMN fuel_index_ml_veh FLOAT"))
            if "carbon_index_g_veh" not in existing_cols_ep:
                conn.execute(text("ALTER TABLE episodes ADD COLUMN carbon_index_g_veh FLOAT"))

            # Migration for metric_records
            columns_info_mr = conn.execute(text("PRAGMA table_info(metric_records)")).fetchall()
            existing_cols_mr = {col[1] for col in columns_info_mr}
            if "fuel_index_rl_ml_veh" not in existing_cols_mr:
                conn.execute(text("ALTER TABLE metric_records ADD COLUMN fuel_index_rl_ml_veh FLOAT"))
            if "fuel_index_baseline_ml_veh" not in existing_cols_mr:
                conn.execute(text("ALTER TABLE metric_records ADD COLUMN fuel_index_baseline_ml_veh FLOAT"))
            if "carbon_index_rl_g_veh" not in existing_cols_mr:
                conn.execute(text("ALTER TABLE metric_records ADD COLUMN carbon_index_rl_g_veh FLOAT"))
            if "carbon_index_baseline_g_veh" not in existing_cols_mr:
                conn.execute(text("ALTER TABLE metric_records ADD COLUMN carbon_index_baseline_g_veh FLOAT"))

            # Migration for simulation_runs
            columns_info_sr = conn.execute(text("PRAGMA table_info(simulation_runs)")).fetchall()
            existing_cols_sr = {col[1] for col in columns_info_sr}
            if "preset_name" not in existing_cols_sr:
                conn.execute(text("ALTER TABLE simulation_runs ADD COLUMN preset_name VARCHAR(100)"))
            if "run_type" not in existing_cols_sr:
                conn.execute(text("ALTER TABLE simulation_runs ADD COLUMN run_type VARCHAR(30)"))
            if "model_name" not in existing_cols_sr:
                conn.execute(text("ALTER TABLE simulation_runs ADD COLUMN model_name VARCHAR(50)"))
            if "avg_wait_s" not in existing_cols_sr:
                conn.execute(text("ALTER TABLE simulation_runs ADD COLUMN avg_wait_s FLOAT"))
            if "throughput" not in existing_cols_sr:
                conn.execute(text("ALTER TABLE simulation_runs ADD COLUMN throughput INTEGER"))
            if "green_util_pct" not in existing_cols_sr:
                conn.execute(text("ALTER TABLE simulation_runs ADD COLUMN green_util_pct FLOAT"))
    except Exception:
        # Ignore errors if altering failed or db was in-memory/read-only
        pass

    # Seed built-in presets into custom_presets table if empty or missing
    try:
        from sqlalchemy.orm import Session
        from backend.config_presets import ALL_PRESETS
        with Session(engine) as session:
            for preset_id, preset in ALL_PRESETS.items():
                exists = session.query(CustomPreset).filter(CustomPreset.id == preset_id).first()
                if not exists:
                    cp = CustomPreset(
                        id=preset_id,
                        name=preset.name,
                        group_name=preset.group,
                        description=preset.description,
                        sim_config=preset.sim_config,
                        adverse_config=preset.adverse_config,
                        tags=preset.tags
                    )
                    session.add(cp)
                else:
                    exists.name = preset.name
                    exists.group_name = preset.group
                    exists.description = preset.description
                    exists.sim_config = preset.sim_config
                    exists.adverse_config = preset.adverse_config
                    exists.tags = preset.tags
            session.commit()
    except Exception:
        # Ignore errors if database is locked or read-only during seeding
        pass

    return engine
