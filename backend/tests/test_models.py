"""Tests for database models."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from backend.db.models import Base, TrainingSession, Episode, MetricRecord, InsightCard, init_db


@pytest.fixture
def engine():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture
def db_session(engine):
    with Session(engine) as session:
        yield session


def test_create_training_session(db_session):
    sess = TrainingSession(
        preset_id="hitec_city_rush",
        sim_config={"traffic_volume_vph": 900},
        adverse_config={"collision_probability": 0.0},
        baseline_type="fixed_time",
    )
    db_session.add(sess)
    db_session.commit()
    assert sess.id is not None
    assert sess.status == "running"
    assert sess.total_episodes == 0


def test_episode_relationship(db_session):
    sess = TrainingSession(
        sim_config={}, adverse_config={}, baseline_type="fixed_time"
    )
    db_session.add(sess)
    db_session.flush()

    ep = Episode(
        session_id=sess.id,
        episode_number=1,
        total_reward=-150.5,
        baseline_reward=-200.0,
        avg_wait_time_s=45.2,
        baseline_wait_time_s=60.0,
    )
    db_session.add(ep)
    db_session.commit()

    loaded = db_session.get(TrainingSession, sess.id)
    assert len(loaded.episodes) == 1
    assert loaded.episodes[0].total_reward == -150.5


def test_metric_record(db_session):
    sess = TrainingSession(sim_config={}, adverse_config={}, baseline_type="fixed_time")
    db_session.add(sess)
    db_session.flush()

    metric = MetricRecord(
        session_id=sess.id,
        episode_number=1,
        avg_wait_rl_s=42.0,
        avg_wait_baseline_s=60.0,
        wait_saved_s=18.0,
        fuel_saved_l=0.004,
        co2_avoided_kg=0.0092,
        total_economic_inr_per_hr=1840.0,
    )
    db_session.add(metric)
    db_session.commit()
    assert metric.id is not None
    assert metric.wait_saved_s == 18.0


def test_insight_card(db_session):
    sess = TrainingSession(sim_config={}, adverse_config={}, baseline_type="fixed_time")
    db_session.add(sess)
    db_session.flush()

    card = InsightCard(
        session_id=sess.id,
        episode_number=50,
        icon="🏆",
        message="New best episode! Reward +18% vs baseline",
        card_type="beats_baseline",
    )
    db_session.add(card)
    db_session.commit()
    assert card.id is not None


def test_init_db_creates_tables():
    engine = init_db("sqlite:///:memory:")
    table_names = engine.dialect.get_table_names(engine.connect())
    assert "training_sessions" in table_names
    assert "episodes" in table_names
    assert "metric_records" in table_names
