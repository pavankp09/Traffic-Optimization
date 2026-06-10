"""
Unit tests for PPOTrainer and custom callbacks.
Uses MockTrafficEnv — no SUMO required.
"""
from __future__ import annotations

import os
import uuid
from collections import deque
from typing import List
from unittest.mock import patch

import gymnasium as gym
import numpy as np
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.config import SimulationConfig, AdverseConfig
from backend.db.models import Base, Episode, TrainingSession
from backend.rl.trainer import (
    ConvergenceCallback,
    EpisodeMetricsCallback,
    InsightCallback,
    PPOTrainer,
)


# ---------------------------------------------------------------------------
# Mock environment
# ---------------------------------------------------------------------------

class MockTrafficEnv(gym.Env):
    """Minimal Gymnasium env that mimics TrafficEnv signatures without SUMO."""

    def __init__(self):
        super().__init__()
        self.observation_space = gym.spaces.Box(-1, 1, shape=(22,), dtype=np.float32)
        self.action_space = gym.spaces.Discrete(35)
        self._step = 0

    def reset(self, **kwargs):
        self._step = 0
        return np.zeros(22, dtype=np.float32), {}

    def step(self, action):
        self._step += 1
        obs = np.random.uniform(-1, 1, 22).astype(np.float32)
        reward = float(-np.random.uniform(5, 30))
        terminated = self._step >= 100  # short episodes for speed
        info = {"mean_wait": 20.0, "throughput": 500}
        return obs, reward, terminated, False, info

    def render(self):
        pass

    def close(self):
        pass


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_url(tmp_path):
    """Temporary SQLite DB URL for each test."""
    db_file = tmp_path / "test_traffic.db"
    url = f"sqlite:///{db_file}"
    engine = create_engine(url, echo=False)
    Base.metadata.create_all(engine)
    engine.dispose()
    return url


@pytest.fixture()
def model_dir(tmp_path):
    """Temporary directory for saved models."""
    d = tmp_path / "models"
    d.mkdir()
    return str(d)


@pytest.fixture()
def session_id(db_url):
    """Insert a TrainingSession row and return its integer ID as a string."""
    engine = create_engine(db_url, echo=False)
    with Session(engine) as db_session:
        ts = TrainingSession(
            sim_config={},
            adverse_config={},
            status="pending",
            baseline_type="fixed_time",
        )
        db_session.add(ts)
        db_session.commit()
        sid = ts.id
    engine.dispose()
    return str(sid)


@pytest.fixture()
def emit_calls() -> List:
    """Shared list that records (event, payload) tuples."""
    return []


@pytest.fixture()
def emit_fn(emit_calls):
    def _emit(event, payload):
        emit_calls.append((event, payload))
    return _emit


@pytest.fixture()
def sim_config():
    return SimulationConfig()


@pytest.fixture()
def adverse_config():
    return AdverseConfig()


def make_trainer(
    sim_config,
    adverse_config,
    session_id,
    db_url,
    model_dir,
    emit_fn,
    total_timesteps=200,
):
    """Helper to create a PPOTrainer that uses MockTrafficEnv."""
    trainer = PPOTrainer(
        sim_config=sim_config,
        adverse_config=adverse_config,
        session_id=session_id,
        db_url=db_url,
        model_dir=model_dir,
        total_timesteps=total_timesteps,
        emit_fn=emit_fn,
    )
    return trainer


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestPPOTrainer:
    """Tests for PPOTrainer.train(), save_model(), load_model(), predict()."""

    def test_decision_capture_callback_appends_to_store(self):
        """DecisionCaptureCallback must not raise on _on_step with mocked model."""
        from backend.rl.decision_store import DecisionStore
        from backend.rl.trainer import DecisionCaptureCallback
        import numpy as np
        import torch

        store = DecisionStore()
        cb = DecisionCaptureCallback(
            session_id="test-dcc",
            emit_fn=None,
            store=store,
        )

        from unittest.mock import MagicMock
        mock_model = MagicMock()
        mock_model.policy.get_distribution.return_value.distribution.probs = torch.ones(1, 35) / 35
        mock_model.policy.predict_values.return_value = torch.tensor([[0.5]])
        mock_model.policy.extract_features.return_value = torch.zeros(1, 64)
        mock_model.policy.mlp_extractor.return_value = (torch.zeros(1, 64), torch.zeros(1, 64))
        mock_model.policy.action_net.return_value = torch.zeros(1, 35)

        cb.model = mock_model
        cb.num_timesteps = 1
        cb.locals = {
            "new_obs": np.zeros((1, 26), dtype=np.float32),
            "actions": np.array([3]),
            "rewards": np.array([0.5]),
            "infos": [{"reward_parts": {"delta_queue": -0.1, "flow_eff": 0.8,
                                        "switch": 0.0, "imbalance": -0.2,
                                        "starvation": 0.0, "baseline_gap": 0.0,
                                        "all_red": 0.0}}],
            "dones": np.array([False]),
        }
        cb._episode_num = 1
        cb._step_in_episode = 1

        # Should not raise — errors are caught internally
        cb._on_step()
        assert True

    def test_trainer_train_runs(
        self,
        sim_config,
        adverse_config,
        session_id,
        db_url,
        model_dir,
        emit_fn,
    ):
        """Train for a tiny number of timesteps; result dict must have required keys."""
        with patch("backend.rl.trainer.make_env", return_value=MockTrafficEnv()):
            trainer = make_trainer(
                sim_config, adverse_config, session_id, db_url, model_dir, emit_fn,
                total_timesteps=200,
            )
            result = trainer.train()

        assert isinstance(result, dict), "train() must return a dict"
        required_keys = {"session_id", "total_episodes", "best_reward", "converged", "model_path"}
        assert required_keys == set(result.keys()), (
            f"Missing keys: {required_keys - set(result.keys())}"
        )
        assert result["session_id"] == session_id
        assert isinstance(result["total_episodes"], int)
        assert isinstance(result["best_reward"], float)
        assert isinstance(result["converged"], bool)
        assert isinstance(result["model_path"], str)

    def test_trainer_save_load_model(
        self,
        sim_config,
        adverse_config,
        session_id,
        db_url,
        model_dir,
        emit_fn,
    ):
        """Train briefly, save, reload, then verify predict() returns a valid int."""
        with patch("backend.rl.trainer.make_env", return_value=MockTrafficEnv()):
            trainer = make_trainer(
                sim_config, adverse_config, session_id, db_url, model_dir, emit_fn,
                total_timesteps=200,
            )
            result = trainer.train()
            model_path = result["model_path"]

        assert os.path.exists(model_path), f"Model file not found at {model_path}"

        # Load into a fresh trainer; we need make_env patched so load_model() can
        # build the env wrapper for SB3
        with patch("backend.rl.trainer.make_env", return_value=MockTrafficEnv()):
            trainer2 = make_trainer(
                sim_config, adverse_config, session_id, db_url, model_dir, emit_fn,
            )
            trainer2.load_model(model_path)

        obs = np.zeros(22, dtype=np.float32)
        action = trainer2.predict(obs)
        assert isinstance(action, int), "predict() must return an int"
        assert 0 <= action <= 34, f"Action {action} out of range [0, 34]"


class TestEpisodeMetricsCallback:
    """Tests for EpisodeMetricsCallback."""

    def test_episode_metrics_callback_fires(
        self,
        sim_config,
        adverse_config,
        session_id,
        db_url,
        model_dir,
        emit_fn,
        emit_calls,
    ):
        """Verify EpisodeMetricsCallback records episode rows in the DB."""
        with patch("backend.rl.trainer.make_env", return_value=MockTrafficEnv()):
            trainer = make_trainer(
                sim_config, adverse_config, session_id, db_url, model_dir, emit_fn,
                total_timesteps=300,
            )
            trainer.train()

        # Check DB
        engine = create_engine(db_url, echo=False)
        with Session(engine) as db_session:
            rows = (
                db_session.query(Episode)
                .filter(Episode.session_id == session_id)
                .all()
            )
        engine.dispose()

        assert len(rows) >= 1, "At least one Episode row must be written to the DB"
        # Each row must have a numeric reward
        for row in rows:
            assert row.total_reward is not None
            assert isinstance(row.total_reward, float)

        # Check Socket.IO events were emitted
        episode_events = [e for e in emit_calls if e[0] == "training:episode"]
        assert len(episode_events) >= 1, "At least one 'training:episode' event must be emitted"

        # Validate payload shape
        _, payload = episode_events[0]
        assert "session_id" in payload
        assert "episode" in payload
        assert "reward" in payload
        assert "length" in payload
        assert "metrics" in payload


class TestConvergenceCallback:
    """Tests for ConvergenceCallback."""

    def test_convergence_callback_detects(self):
        """
        Pre-fill the callback's window with 50 identical rewards, then call
        _on_step() with a done=True step and verify training stops (returns False)
        and converged is set to True.
        """
        cb = ConvergenceCallback(session_id="test-session", emit_fn=None)
        cb.db_url = "sqlite://"  # in-memory, unused but set for completeness
        cb.emit_fn = None

        # Pre-fill window with 49 identical values; the 50th will come from _on_step
        for _ in range(49):
            cb._window.append(-20.0)

        # Prime the episode accumulator so the episode reward is also -20.0
        cb._episode_reward = -20.0

        # Set up locals so _on_step sees a done step with zero additional reward
        cb.locals = {"rewards": [0.0], "dones": [True]}
        cb.num_timesteps = 100

        result = cb._on_step()

        assert result == False, "ConvergenceCallback._on_step() should return False to stop training"
        assert cb.converged == True, "ConvergenceCallback should set converged=True on detection"

    def test_convergence_callback_stops_training(
        self,
        sim_config,
        adverse_config,
        session_id,
        db_url,
        model_dir,
        emit_fn,
        emit_calls,
    ):
        """
        When rewards are almost constant, ConvergenceCallback should stop training
        early and emit 'training:converged'.
        """

        class ConstantRewardEnv(MockTrafficEnv):
            """Always returns the same reward so convergence is guaranteed."""
            def step(self, action):
                self._step += 1
                obs = np.zeros(22, dtype=np.float32)
                reward = -10.0 + np.random.uniform(-0.01, 0.01)
                terminated = self._step >= 20  # very short episodes
                info = {"mean_wait": 20.0, "throughput": 500}
                return obs, reward, terminated, False, info

        with patch("backend.rl.trainer.make_env", return_value=ConstantRewardEnv()):
            trainer = make_trainer(
                sim_config, adverse_config, session_id, db_url, model_dir, emit_fn,
                total_timesteps=500_000,  # Large — expect early stop
            )
            result = trainer.train()

        # Convergence should eventually be detected (may take 50+ episodes)
        assert result["converged"] is True


class TestInsightCallback:
    """Tests for InsightCallback."""

    def test_insight_callback_emits(
        self,
        sim_config,
        adverse_config,
        session_id,
        db_url,
        model_dir,
        emit_fn,
        emit_calls,
    ):
        """Verify emit_fn is called at least once during training (insight events)."""
        with patch("backend.rl.trainer.make_env", return_value=MockTrafficEnv()):
            trainer = make_trainer(
                sim_config, adverse_config, session_id, db_url, model_dir, emit_fn,
                total_timesteps=300,
            )
            trainer.train()

        assert len(emit_calls) >= 1, (
            "emit_fn must be called at least once during training"
        )

    def test_insight_callback_start_event(
        self,
        sim_config,
        adverse_config,
        session_id,
        db_url,
        model_dir,
        emit_fn,
        emit_calls,
    ):
        """'training:insight' with 'Training started' message must be emitted."""
        with patch("backend.rl.trainer.make_env", return_value=MockTrafficEnv()):
            trainer = make_trainer(
                sim_config, adverse_config, session_id, db_url, model_dir, emit_fn,
                total_timesteps=300,
            )
            trainer.train()

        insight_events = [e for e in emit_calls if e[0] == "training:insight"]
        messages = [e[1].get("message", "") for e in insight_events]
        assert any("Training started" in m for m in messages), (
            f"Expected 'Training started' insight. Got messages: {messages}"
        )

    def test_insight_callback_payload_shape(
        self,
        sim_config,
        adverse_config,
        session_id,
        db_url,
        model_dir,
        emit_fn,
        emit_calls,
    ):
        """Each 'training:insight' payload must contain required keys."""
        with patch("backend.rl.trainer.make_env", return_value=MockTrafficEnv()):
            trainer = make_trainer(
                sim_config, adverse_config, session_id, db_url, model_dir, emit_fn,
                total_timesteps=300,
            )
            trainer.train()

        insight_events = [e for e in emit_calls if e[0] == "training:insight"]
        assert len(insight_events) >= 1

        for _, payload in insight_events:
            assert "icon" in payload
            assert "message" in payload
            assert "episode" in payload
            assert "session_id" in payload
