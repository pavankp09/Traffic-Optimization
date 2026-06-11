"""
PPO Trainer for Traffic Signal Optimizer.
Wraps Stable-Baselines3 PPO with custom callbacks for DB persistence,
Socket.IO event emission, and convergence detection.
"""
from __future__ import annotations

import os
import json
import logging
from collections import deque
from typing import Callable, Optional

import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, CallbackList

from backend.config import SimulationConfig, AdverseConfig
from backend.db.models import Base, TrainingSession, Episode, InsightCard
from backend.rl.traffic_env import make_env

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom Callbacks
# ---------------------------------------------------------------------------

class EpisodeMetricsCallback(BaseCallback):
    """
    Records per-episode metrics to the database and emits Socket.IO events.
    Tracks: episode_reward, episode_length, mean_wait, throughput.
    """

    def __init__(
        self,
        session_id: str,
        db_url: str,
        emit_fn: Optional[Callable] = None,
        verbose: int = 0,
    ):
        super().__init__(verbose=verbose)
        self.session_id = session_id
        self.db_url = db_url
        self.emit_fn = emit_fn
        self._engine = create_engine(db_url, echo=False)

        self._episode_num = 0
        self._episode_reward = 0.0
        self._episode_length = 0

        # Exposed so PPOTrainer can inspect after training
        self.episodes_recorded: list[dict] = []

    def _on_step(self) -> bool:
        reward = self.locals.get("rewards", [0.0])
        reward_val = float(reward[0]) if hasattr(reward, "__len__") else float(reward)
        self._episode_reward += reward_val
        self._episode_length += 1

        dones = self.locals.get("dones", [False])
        done = bool(dones[0]) if hasattr(dones, "__len__") else bool(dones)

        if done:
            self._episode_num += 1
            infos = self.locals.get("infos", [{}])
            info = infos[0] if infos else {}

            mean_wait = float(info.get("mean_wait", 0.0))
            throughput = int(info.get("throughput", 0))

            metrics = {
                "mean_wait": mean_wait,
                "throughput": throughput,
            }

            # Persist to DB
            try:
                try:
                    sid = int(self.session_id)
                except (ValueError, TypeError):
                    with Session(self._engine) as db_session:
                        row = db_session.query(TrainingSession).filter(TrainingSession.notes == self.session_id).first()
                        sid = row.id if row is not None else None
                if sid is not None:
                    with Session(self._engine) as db_session:
                        episode_row = Episode(
                            session_id=sid,
                            episode_number=self._episode_num,
                            total_reward=self._episode_reward,
                            avg_wait_time_s=mean_wait,
                            throughput=throughput,
                        )
                        db_session.add(episode_row)
                        db_session.commit()
            except Exception as exc:
                logger.warning("EpisodeMetricsCallback DB write failed: %s", exc)

            payload = {
                "session_id": self.session_id,
                "episode": self._episode_num,
                "reward": self._episode_reward,
                "length": self._episode_length,
                "metrics": metrics,
            }

            if self.emit_fn is not None:
                self.emit_fn("training:episode", payload)

            self.episodes_recorded.append(payload)

            # Reset accumulators for next episode
            self._episode_reward = 0.0
            self._episode_length = 0

        return True

    def _on_training_end(self) -> None:
        pass


class ConvergenceCallback(BaseCallback):
    """
    Monitors rolling window of episode rewards.
    Convergence = coefficient of variation < 5% (std/|mean| < 0.05).
    Stops training when converged.
    """

    WINDOW = 50
    CV_THRESHOLD = 0.05

    def __init__(
        self,
        session_id: str,
        emit_fn: Optional[Callable] = None,
        verbose: int = 0,
    ):
        super().__init__(verbose=verbose)
        self.session_id = session_id
        self.emit_fn = emit_fn
        self.converged = False
        self._window: deque[float] = deque(maxlen=self.WINDOW)
        self._episode_reward = 0.0
        self._episode_num = 0

    def _on_step(self) -> bool:
        reward = self.locals.get("rewards", [0.0])
        reward_val = float(reward[0]) if hasattr(reward, "__len__") else float(reward)
        self._episode_reward += reward_val

        dones = self.locals.get("dones", [False])
        done = bool(dones[0]) if hasattr(dones, "__len__") else bool(dones)

        if done:
            self._episode_num += 1
            self._window.append(self._episode_reward)
            self._episode_reward = 0.0

            if len(self._window) >= self.WINDOW:
                arr = np.array(self._window)
                mean = np.mean(arr)
                std = np.std(arr)
                # Avoid division by zero; use absolute mean
                denom = abs(mean) if abs(mean) > 1e-8 else 1e-8
                cv = std / denom
                if cv < self.CV_THRESHOLD:
                    self.converged = True
                    payload = {
                        "session_id": self.session_id,
                        "episode": self._episode_num,
                    }
                    if self.emit_fn is not None:
                        self.emit_fn("training:converged", payload)
                    logger.info(
                        "Convergence detected at episode %d (CV=%.4f)",
                        self._episode_num,
                        cv,
                    )
                    return False  # Stop training

        return True


class InsightCallback(BaseCallback):
    """
    Emits insight card events at key training milestones.
    """

    BASELINE_REWARD_THRESHOLD = -50.0

    def __init__(
        self,
        session_id: str,
        db_url: str,
        emit_fn: Optional[Callable] = None,
        verbose: int = 0,
    ):
        super().__init__(verbose=verbose)
        self.session_id = session_id
        self.db_url = db_url
        self.emit_fn = emit_fn
        self._engine = create_engine(db_url, echo=False)

        self._episode_num = 0
        self._episode_reward = 0.0
        self._best_reward: Optional[float] = None
        self._beats_baseline_emitted = False
        self._converged_emitted = False
        self._start_emitted = False

    def _emit_insight(self, icon: str, message: str, card_type: str, episode: int) -> None:
        payload = {
            "icon": icon,
            "message": message,
            "episode": episode,
            "session_id": self.session_id,
        }
        if self.emit_fn is not None:
            self.emit_fn("training:insight", payload)

        # Persist to DB
        try:
            try:
                sid = int(self.session_id)
            except (ValueError, TypeError):
                with Session(self._engine) as db_session:
                    row = db_session.query(TrainingSession).filter(TrainingSession.notes == self.session_id).first()
                    sid = row.id if row is not None else None
            if sid is not None:
                with Session(self._engine) as db_session:
                    card = InsightCard(
                        session_id=sid,
                        episode_number=episode,
                        icon=icon,
                        message=message,
                        card_type=card_type,
                    )
                    db_session.add(card)
                    db_session.commit()
        except Exception as exc:
            logger.warning("InsightCallback DB write failed: %s", exc)

    def _on_step(self) -> bool:
        reward = self.locals.get("rewards", [0.0])
        reward_val = float(reward[0]) if hasattr(reward, "__len__") else float(reward)
        self._episode_reward += reward_val

        dones = self.locals.get("dones", [False])
        done = bool(dones[0]) if hasattr(dones, "__len__") else bool(dones)

        if done:
            self._episode_num += 1
            ep = self._episode_num
            ep_reward = self._episode_reward
            self._episode_reward = 0.0

            # Milestone: first episode
            if ep == 1 and not self._start_emitted:
                self._start_emitted = True
                self._emit_insight("🚀", "Training started", "learned_pattern", ep)

            # Milestone: beats baseline
            if (
                not self._beats_baseline_emitted
                and ep_reward > self.BASELINE_REWARD_THRESHOLD
            ):
                self._beats_baseline_emitted = True
                self._emit_insight(
                    "🏆",
                    "Agent beats fixed-time baseline!",
                    "beats_baseline",
                    ep,
                )

            # Milestone: new best episode
            if self._best_reward is None or ep_reward > self._best_reward:
                self._best_reward = ep_reward
                if ep > 1:  # skip duplicate with "started"
                    self._emit_insight(
                        "⭐",
                        f"New best episode! Reward: {ep_reward:.1f}",
                        "best_episode",
                        ep,
                    )

        return True

    def notify_converged(self, episode: int) -> None:
        """Called externally by PPOTrainer after convergence is detected."""
        if not self._converged_emitted:
            self._converged_emitted = True
            self._emit_insight(
                "✅",
                "Agent converged — stable policy learned",
                "convergence",
                episode,
            )


class DecisionCaptureCallback(BaseCallback):
    """
    Captures per-decision data (obs, action, probs, importance, value, reward_parts)
    during mock_env training and stores it in DecisionStore + emits via Socket.IO.
    """

    def __init__(
        self,
        session_id: str,
        emit_fn: Optional[Callable] = None,
        store=None,
        verbose: int = 0,
    ):
        super().__init__(verbose=verbose)
        self.session_id = session_id
        self.emit_fn = emit_fn
        # Allow injecting a custom store for testing; default to module singleton
        if store is None:
            from backend.rl.decision_store import STORE
            self._store = STORE
        else:
            self._store = store

        # Start at 1 to match EpisodeMetricsCallback numbering (it increments before emit)
        self._episode_num = 1
        self._step_in_episode = 0
        self._episode_reward = 0.0

    def _on_step(self) -> bool:
        try:
            import torch
            from backend.rl.mock_env import OBS_LABELS, PHASE_NAMES, DURATIONS, N_DURATIONS

            obs_np = self.locals.get("new_obs")
            if obs_np is None:
                return True

            action = int(self.locals.get("actions", [0])[0])
            reward = float(self.locals.get("rewards", [0.0])[0])
            infos = self.locals.get("infos", [{}])
            info = infos[0] if infos else {}
            reward_parts = info.get("reward_parts", {})
            done = bool(self.locals.get("dones", [False])[0])

            self._episode_reward += reward
            self._step_in_episode += 1

            # Build labeled observation
            obs_vec = obs_np[0].tolist() if hasattr(obs_np[0], "tolist") else list(obs_np[0])
            obs_labeled = [
                {"label": OBS_LABELS[i], "value": round(float(obs_vec[i]), 4),
                 "normalised": round(float(obs_vec[i]), 4)}
                for i in range(min(len(OBS_LABELS), len(obs_vec)))
            ]

            # Decode action
            phase_idx = action // N_DURATIONS
            dur_idx = action % N_DURATIONS
            action_info = {
                "phase":      phase_idx,
                "phase_name": PHASE_NAMES[phase_idx] if phase_idx < len(PHASE_NAMES) else str(phase_idx),
                "duration_s": DURATIONS[dur_idx] if dur_idx < len(DURATIONS) else 30,
                "action_idx": action,
            }

            # Policy inference (probs, value, importance)
            probs = [1.0 / 35] * 35
            value = 0.0
            importance = [0.0] * len(OBS_LABELS)

            try:
                obs_t = torch.FloatTensor(obs_np[0:1])

                with torch.no_grad():
                    dist = self.model.policy.get_distribution(obs_t)
                    probs = dist.distribution.probs[0].cpu().tolist()
                    value = float(self.model.policy.predict_values(obs_t)[0, 0].item())

                # Feature importance via Jacobian
                obs_t_grad = torch.FloatTensor(obs_np[0:1]).requires_grad_(True)
                features = self.model.policy.extract_features(obs_t_grad)
                latent_pi, _ = self.model.policy.mlp_extractor(features)
                action_logits = self.model.policy.action_net(latent_pi)
                action_logits[0, action].backward()
                if obs_t_grad.grad is not None:
                    raw = obs_t_grad.grad[0].abs().cpu().tolist()
                    max_val = max(raw) + 1e-8
                    importance = [v / max_val for v in raw]

            except Exception as exc:
                logger.debug("DecisionCaptureCallback policy inference failed: %s", exc)

            decision = {
                "step":         self._step_in_episode,
                "episode":      self._episode_num,
                "obs":          obs_labeled,
                "action":       action_info,
                "probs":        probs,
                "importance":   importance,
                "value":        round(value, 4),
                "reward_total": round(reward, 4),
                "reward_parts": reward_parts,
            }

            self._store.append(self.session_id, self._episode_num, decision)

            if self.emit_fn is not None:
                try:
                    self.emit_fn("training:decision", decision)
                except Exception:
                    pass

            if done:
                self._store.finalise_episode(
                    self.session_id,
                    self._episode_num,
                    {
                        "total_reward": round(self._episode_reward, 3),
                        "mean_wait":    float(info.get("mean_wait", 0.0)),
                        "throughput":   int(info.get("throughput", 0)),
                        "n_decisions":  self._step_in_episode,
                    },
                )
                self._episode_num += 1
                self._step_in_episode = 0
                self._episode_reward = 0.0

        except Exception as exc:
            logger.debug("DecisionCaptureCallback _on_step error (non-fatal): %s", exc)

        return True


class InferenceCheckpointCallback(BaseCallback):
    """
    Every `check_every` episodes, calls inference_fn(model) which spins a
    _SimWorld inference run and streams sim:frame:rl1 events to the canvas.
    Training pauses for the duration (~1-2 seconds real time).
    """

    def __init__(
        self,
        session_id: str,
        inference_fn: Optional[Callable] = None,
        check_every: int = 10,
        emit_fn: Optional[Callable] = None,
        verbose: int = 0,
    ):
        super().__init__(verbose=verbose)
        self.session_id = session_id
        self.inference_fn = inference_fn
        self.check_every = check_every
        self.emit_fn = emit_fn
        self._episode_num = 0

    def _on_step(self) -> bool:
        dones = self.locals.get("dones", [False])
        done = bool(dones[0]) if hasattr(dones, "__len__") else bool(dones)

        if done:
            self._episode_num += 1
            if (
                self.inference_fn is not None
                and self._episode_num % self.check_every == 0
            ):
                try:
                    logger.info(
                        "InferenceCheckpointCallback: running canvas inference at episode %d",
                        self._episode_num,
                    )
                    self.inference_fn(self.model)
                except Exception as exc:
                    logger.warning("Inference checkpoint failed (non-fatal): %s", exc)

        return True


class StageProgressCallback(BaseCallback):
    """
    Emits training:stage_change events when curriculum training switches
    from Stage 2 (mock_env) to Stage 3 (SUMO). Used only in Stage 4.
    """

    def __init__(
        self,
        session_id: str,
        emit_fn: Optional[Callable] = None,
        switch_at_step: int = 0,
        from_stage: int = 2,
        to_stage: int = 3,
        verbose: int = 0,
    ):
        super().__init__(verbose=verbose)
        self.session_id    = session_id
        self.emit_fn       = emit_fn
        self.switch_at_step = switch_at_step
        self.from_stage    = from_stage
        self.to_stage      = to_stage
        self._emitted      = False

    def _on_step(self) -> bool:
        if not self._emitted and self.num_timesteps >= self.switch_at_step:
            self._emitted = True
            if self.emit_fn is not None:
                self.emit_fn("training:stage_change", {
                    "session_id": self.session_id,
                    "from_stage": self.from_stage,
                    "to_stage":   self.to_stage,
                    "at_step":    self.num_timesteps,
                })
                logger.info(
                    "Stage transition: Stage %d → Stage %d at step %d",
                    self.from_stage, self.to_stage, self.num_timesteps,
                )
        return True


# ---------------------------------------------------------------------------
# PPOTrainer
# ---------------------------------------------------------------------------

class PPOTrainer:
    """
    Encapsulates PPO training for the Traffic Signal Optimizer.

    Parameters
    ----------
    sim_config      : SimulationConfig
    adverse_config  : AdverseConfig
    session_id      : str  — UUID matching TrainingSession.id in the DB
    db_url          : str  — SQLAlchemy database URL
    model_dir       : str  — directory for saved model files
    total_timesteps : int  — total environment steps for training
    emit_fn         : Optional[Callable] — socketio.emit or None (for testing)
    """

    def __init__(
        self,
        sim_config: SimulationConfig,
        adverse_config: AdverseConfig,
        session_id: str,
        db_url: str = "sqlite:///backend/db/traffic.db",
        model_dir: str = "models",
        total_timesteps: int = 500_000,
        emit_fn: Optional[Callable] = None,
        env_factory: Optional[Callable] = None,
        extra_callbacks: Optional[list] = None,
        baseline_wait: float = 0.0,
        baseline_demonstrations: Optional[list] = None,
    ):
        self.sim_config = sim_config
        self.adverse_config = adverse_config
        self.session_id = session_id
        self.db_url = db_url
        self.model_dir = model_dir
        self.total_timesteps = total_timesteps
        self.emit_fn = emit_fn
        # env_factory(sim_config, adverse_config) -> gym.Env. Defaults to the
        # SUMO-backed make_env; the API layer injects a SUMO-free env instead.
        self.env_factory = env_factory or make_env
        self.extra_callbacks = extra_callbacks or []
        # Baseline data for improvements #1 and #2
        self.baseline_wait = baseline_wait
        self.baseline_demonstrations = baseline_demonstrations or []

        self._env = None
        self._model: Optional[PPO] = None

        # Callbacks — exposed as instance attributes for test inspection
        self.episode_cb: Optional[EpisodeMetricsCallback] = None
        self.convergence_cb: Optional[ConvergenceCallback] = None
        self.insight_cb: Optional[InsightCallback] = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_engine(self):
        return create_engine(self.db_url, echo=False)

    def _ensure_db(self) -> None:
        """Create tables if they don't exist."""
        engine = self._get_engine()
        Base.metadata.create_all(engine)
        engine.dispose()

    def _update_session_status(self, status: str, **kwargs) -> None:
        engine = self._get_engine()
        with Session(engine) as db_session:
            row = None
            try:
                row = db_session.get(TrainingSession, int(self.session_id))
            except (ValueError, TypeError):
                pass
            if row is None:
                row = db_session.query(TrainingSession).filter(TrainingSession.notes == self.session_id).first()
            if row is not None:
                row.status = status
                for k, v in kwargs.items():
                    setattr(row, k, v)
                db_session.commit()
        engine.dispose()

    def _build_model(self, env):
        alg = getattr(self.sim_config, "rl_algorithm", getattr(self.sim_config, "algorithm", "PPO"))
        if alg == "SAC":
            alg = "DQN"  # Fallback discrete support
        lr = getattr(self.sim_config, "learning_rate", 3e-4)
        gamma = getattr(self.sim_config, "discount_factor", 0.99)
        hidden = getattr(self.sim_config, "hidden_layer_size", 64)
        net_arch = [hidden, hidden]

        if alg == "A2C":
            from stable_baselines3 import A2C
            return A2C(
                policy="MlpPolicy",
                env=env,
                learning_rate=lr,
                gamma=gamma,
                policy_kwargs={"net_arch": net_arch},
                verbose=0,
                seed=42,
            )
        elif alg == "DQN":
            from stable_baselines3 import DQN
            return DQN(
                policy="MlpPolicy",
                env=env,
                learning_rate=lr,
                gamma=gamma,
                policy_kwargs={"net_arch": net_arch},
                verbose=0,
                seed=42,
            )
        else:
            return PPO(
                policy="MlpPolicy",
                env=env,
                learning_rate=lr,
                n_steps=2048,
                batch_size=64,
                n_epochs=getattr(self.sim_config, "ppo_epochs", 500),
                gamma=gamma,
                gae_lambda=0.95,
                clip_range=0.2,
                ent_coef=0.01,
                vf_coef=0.5,
                max_grad_norm=0.5,
                policy_kwargs={"net_arch": net_arch},
                verbose=0,
                seed=42,
            )

    def _behavioral_cloning_warmup(self, model, demonstrations: list, n_epochs: int = 10, batch_size: int = 32) -> None:
        """Pre-train policy to imitate Webster's decisions using supervised learning.

        Uses cross-entropy loss to push the policy network toward Webster's
        action distribution before PPO fine-tuning begins. This gives RL a
        competent starting point instead of a random one.
        """
        try:
            import torch

            obs_arr = np.array([d[0] for d in demonstrations], dtype=np.float32)
            act_arr = np.array([d[1] for d in demonstrations], dtype=np.int64)
            obs_t = torch.FloatTensor(obs_arr)
            act_t = torch.LongTensor(act_arr)

            bc_optimizer = torch.optim.Adam(model.policy.parameters(), lr=1e-3)
            n = len(demonstrations)

            for epoch in range(n_epochs):
                idx = torch.randperm(n)
                total_loss = 0.0
                for start in range(0, n, batch_size):
                    batch_idx = idx[start:start + batch_size]
                    obs_batch = obs_t[batch_idx]
                    act_batch = act_t[batch_idx]

                    distribution = model.policy.get_distribution(obs_batch)
                    log_probs = distribution.log_prob(act_batch)
                    loss = -log_probs.mean()  # maximize log-prob of Webster's actions

                    bc_optimizer.zero_grad()
                    loss.backward()
                    bc_optimizer.step()
                    total_loss += loss.item()

                logger.info("BC warmup epoch %d/%d  loss=%.4f", epoch + 1, n_epochs, total_loss)

            logger.info(
                "Behavioral cloning warmup complete: %d demos over %d epochs",
                n, n_epochs,
            )
            if self.emit_fn:
                self.emit_fn("training:insight", {
                    "session_id": self.session_id,
                    "icon": "🎓",
                    "message": f"Webster's behavioral cloning complete ({n} demos). RL starts from a smart baseline.",
                    "episode": 0,
                })
        except Exception as exc:
            logger.warning("Behavioral cloning warmup failed (non-fatal): %s", exc)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def train(self) -> dict:
        """
        Run PPO training.

        Returns
        -------
        dict with keys: session_id, total_episodes, best_reward, converged, model_path
        """
        self._ensure_db()

        # Mark session as running
        try:
            self._update_session_status("running")
        except Exception as exc:
            logger.warning("Could not update session status to running: %s", exc)

        # Build environment — pass baseline_wait so env uses it for reward shaping (#1)
        # Direct parameter is cleaner than setting attribute post-creation
        self._env = self.env_factory(
            self.sim_config,
            self.adverse_config,
            baseline_wait=self.baseline_wait if self.baseline_wait > 0 else 0.0,
        )

        # Build model
        self._model = self._build_model(self._env)

        # Improvement #2: behavioral cloning warm-start if Webster's demos exist
        if self.baseline_demonstrations:
            self._behavioral_cloning_warmup(self._model, self.baseline_demonstrations)

        # Build callbacks
        self.episode_cb = EpisodeMetricsCallback(
            session_id=self.session_id,
            db_url=self.db_url,
            emit_fn=self.emit_fn,
        )
        self.convergence_cb = ConvergenceCallback(
            session_id=self.session_id,
            emit_fn=self.emit_fn,
        )
        self.insight_cb = InsightCallback(
            session_id=self.session_id,
            db_url=self.db_url,
            emit_fn=self.emit_fn,
        )
        callback_list = CallbackList(
            [self.episode_cb, self.convergence_cb, self.insight_cb, *self.extra_callbacks]
        )

        # Training
        try:
            self._model.learn(
                total_timesteps=self.total_timesteps,
                callback=callback_list,
                reset_num_timesteps=True,
            )
        except Exception as exc:
            logger.error("Training interrupted: %s", exc)

        # Post-training: notify convergence insight
        if self.convergence_cb.converged and self.insight_cb is not None:
            self.insight_cb.notify_converged(self.convergence_cb._episode_num)

        # Compute summary
        total_episodes = self.episode_cb._episode_num
        rewards = [ep["reward"] for ep in self.episode_cb.episodes_recorded]
        best_reward = float(max(rewards)) if rewards else 0.0
        converged = self.convergence_cb.converged

        # Save model
        model_path = self.save_model()

        # Update DB session
        try:
            self._update_session_status(
                "done",
                total_episodes=total_episodes,
                best_reward=best_reward,
            )
        except Exception as exc:
            logger.warning("Could not update session status to done: %s", exc)

        return {
            "session_id": self.session_id,
            "total_episodes": total_episodes,
            "best_reward": best_reward,
            "converged": converged,
            "model_path": model_path,
        }

    def save_model(self, path: str = None) -> str:
        """
        Save the SB3 model to disk.

        Returns the path where the model was saved.
        """
        if self._model is None:
            raise RuntimeError("No model to save — call train() first")

        os.makedirs(self.model_dir, exist_ok=True)
        if path is None:
            path = os.path.join(self.model_dir, f"{self.session_id}.zip")

        self._model.save(path)
        return path

    def load_model(self, path: str) -> None:
        """Load a previously saved SB3 model from path."""
        if self._env is None:
            self._env = make_env(self.sim_config, self.adverse_config)
        self._model = PPO.load(path, env=self._env)

    def predict(self, obs: np.ndarray) -> int:
        """
        Run inference with the trained model.

        Parameters
        ----------
        obs : np.ndarray of shape (22,)

        Returns
        -------
        int — action index in [0, 34]
        """
        if self._model is None:
            raise RuntimeError("No model available — call train() or load_model() first")
        action, _ = self._model.predict(obs, deterministic=True)
        return int(action)
