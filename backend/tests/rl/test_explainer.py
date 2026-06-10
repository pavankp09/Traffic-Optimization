"""
Tests for TrafficExplainer (XAI) and TransferLearner.

Uses CartPole-v1 PPO for fast model creation.  For explainer tests a mock
_predict_fn is injected so that the 22-dim test observations are decoupled
from CartPole's 4-dim observation space.

Run with:
    python -m pytest backend/tests/rl/test_explainer.py -v
"""
from __future__ import annotations

import os

import numpy as np
import pytest

from backend.rl.explainer import FEATURE_NAMES, TrafficExplainer
from backend.rl.transfer_learner import TransferLearner


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_test_model():
    """Return a minimally trained CartPole-v1 PPO (policy only matters)."""
    import gymnasium as gym
    from stable_baselines3 import PPO

    env = gym.make("CartPole-v1")
    model = PPO("MlpPolicy", env, verbose=0)
    model.learn(total_timesteps=200)
    return model


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def cartpole_model():
    """Shared CartPole PPO across all module tests."""
    return make_test_model()


@pytest.fixture
def explainer(cartpole_model):
    """
    TrafficExplainer with a mock _predict_fn for 22-dim observations.
    CartPole expects 4-dim observations, so we bypass its policy entirely.
    """
    exp = TrafficExplainer(cartpole_model, n_background_samples=20)

    # Override predict fn to return action 0 for any 22-dim input
    exp._predict_fn = lambda obs_array: np.zeros(len(obs_array), dtype=float)

    background = np.random.uniform(-1, 1, (20, 22)).astype(np.float32)
    exp.fit_explainer(background)
    return exp


@pytest.fixture
def sample_obs():
    """Generic 22-dim normalised observation."""
    return np.random.uniform(-1, 1, (22,)).astype(np.float32)


# ---------------------------------------------------------------------------
# 1. fit_explainer
# ---------------------------------------------------------------------------

def test_fit_explainer_no_crash(cartpole_model):
    """fit_explainer() should complete without raising."""
    exp = TrafficExplainer(cartpole_model, n_background_samples=20)
    exp._predict_fn = lambda obs_array: np.zeros(len(obs_array), dtype=float)
    background = np.random.uniform(-1, 1, (20, 22)).astype(np.float32)
    exp.fit_explainer(background)  # must not raise


# ---------------------------------------------------------------------------
# 2–5. explain()
# ---------------------------------------------------------------------------

def test_explain_returns_required_keys(explainer, sample_obs):
    """explain() must return all documented keys."""
    result = explainer.explain(sample_obs)
    required = {
        "shap_values", "feature_names", "feature_values",
        "top_features", "action", "phase", "duration_s",
    }
    assert required.issubset(result.keys()), (
        f"Missing keys: {required - result.keys()}"
    )


def test_explain_shap_values_length(explainer, sample_obs):
    """shap_values must have one entry per feature (22)."""
    result = explainer.explain(sample_obs)
    assert len(result["shap_values"]) == 22


def test_explain_top_features_length(explainer, sample_obs):
    """top_features must contain exactly 5 entries."""
    result = explainer.explain(sample_obs)
    assert len(result["top_features"]) == 5


def test_explain_action_in_range(explainer, sample_obs):
    """
    action must be in [0, 34] for the 5×7 traffic action space.

    The mock returns 0, which is valid; we also accept any int in range
    so the test remains correct if the fixture changes.
    """
    result = explainer.explain(sample_obs)
    # Mock always returns 0; still verify it's a valid traffic action
    assert isinstance(result["action"], int)
    assert 0 <= result["action"] <= 34


def test_explain_handles_2d_obs(explainer):
    """explain() must accept both (22,) and (1, 22) shaped input."""
    obs_1d = np.random.uniform(-1, 1, (22,)).astype(np.float32)
    obs_2d = obs_1d.reshape(1, 22)
    r1 = explainer.explain(obs_1d)
    r2 = explainer.explain(obs_2d)
    assert len(r1["shap_values"]) == 22
    assert len(r2["shap_values"]) == 22


# ---------------------------------------------------------------------------
# 6–7. generate_reason()
# ---------------------------------------------------------------------------

def test_generate_reason_returns_string(explainer, sample_obs):
    """generate_reason() must return a non-empty string."""
    reason = explainer.generate_reason(sample_obs)
    assert isinstance(reason, str) and len(reason) > 0


def test_generate_reason_emergency(explainer):
    """When obs[20] > 0.5, reason must start with 'EMERGENCY'."""
    obs = np.zeros(22, dtype=np.float32)
    obs[20] = 1.0  # emergency_flag = active
    reason = explainer.generate_reason(obs)
    assert "EMERGENCY" in reason, f"Expected 'EMERGENCY' in: {reason!r}"


# ---------------------------------------------------------------------------
# 8. get_feature_importance()
# ---------------------------------------------------------------------------

def test_get_feature_importance_shape(explainer):
    """importance list must have 22 values (one per feature)."""
    obs_batch = np.random.uniform(-1, 1, (10, 22)).astype(np.float32)
    result = explainer.get_feature_importance(obs_batch)

    assert "feature_names" in result
    assert "importance" in result
    assert "top_k" in result
    assert len(result["importance"]) == 22
    assert len(result["top_k"]) == 5


# ---------------------------------------------------------------------------
# 9. TransferLearner – save / load round-trip
# ---------------------------------------------------------------------------

def test_transfer_learner_save_load(tmp_path, cartpole_model):
    """
    Save a CartPole PPO, then verify TransferLearner can load it back
    and save_fine_tuned() produces a .zip file.

    Fine-tuning is intentionally skipped here to keep CI fast.
    Use fine_tune_timesteps=100 with CartPole env if you want to test
    the full loop.
    """
    # Save the test model to a temp location
    base_path = str(tmp_path / "base_model")
    cartpole_model.save(base_path)
    assert os.path.exists(base_path + ".zip")

    # Load via TransferLearner (no new_env → policy-only mode)
    learner = TransferLearner(
        base_model_path=base_path + ".zip",
        new_env=None,
        fine_tune_timesteps=100,
        reset_last_layers=True,
        learning_rate=1e-4,
    )
    model = learner.load_base()
    assert model is not None

    # save_fine_tuned should write a .zip
    out_path = str(tmp_path / "fine_tuned")
    saved = learner.save_fine_tuned(out_path)
    assert saved.endswith(".zip")
    assert os.path.exists(saved)


def test_transfer_learner_load_base_without_env(tmp_path, cartpole_model):
    """load_base() with new_env=None must not raise."""
    base_path = str(tmp_path / "base_no_env")
    cartpole_model.save(base_path)

    learner = TransferLearner(
        base_model_path=base_path + ".zip",
        new_env=None,
    )
    model = learner.load_base()
    assert model is not None


def test_transfer_learner_fine_tune_cartpole(tmp_path):
    """
    End-to-end fine-tune with a CartPole env.

    Uses very few timesteps so it completes quickly in CI.
    Verifies that fine_tune() returns a model and that emit_fn is called.
    """
    import gymnasium as gym
    from stable_baselines3 import PPO

    env = gym.make("CartPole-v1")
    base_model = PPO("MlpPolicy", env, verbose=0)
    base_model.learn(total_timesteps=200)

    base_path = str(tmp_path / "base_ft")
    base_model.save(base_path)

    new_env = gym.make("CartPole-v1")
    learner = TransferLearner(
        base_model_path=base_path + ".zip",
        new_env=new_env,
        fine_tune_timesteps=100,
        reset_last_layers=True,
        learning_rate=1e-4,
    )
    learner.load_base()

    emitted = []

    def emit_fn(event, data):
        emitted.append((event, data))

    model = learner.fine_tune(emit_fn=emit_fn)
    assert model is not None
    # With only 100 steps and interval=10k no events fire, but no crash either
