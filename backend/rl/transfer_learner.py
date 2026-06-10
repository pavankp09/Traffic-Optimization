"""
Transfer learning support for Traffic Signal Optimizer PPO models.

Loads a pretrained PPO, optionally resets output layers, then fine-tunes
on a new environment with a lower learning rate.
"""
from __future__ import annotations

import logging
from typing import Callable, Optional

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal progress callback
# ---------------------------------------------------------------------------

class _ProgressCallback(BaseCallback):
    """Emit progress events every *interval* timesteps during fine-tuning."""

    def __init__(
        self,
        total_timesteps: int,
        emit_fn: Callable,
        interval: int = 10_000,
    ):
        super().__init__(verbose=0)
        self.total_timesteps = total_timesteps
        self.emit_fn = emit_fn
        self.interval = interval

    def _on_step(self) -> bool:
        if self.num_timesteps % self.interval == 0:
            self.emit_fn(
                "transfer:progress",
                {
                    "timesteps": self.num_timesteps,
                    "total": self.total_timesteps,
                },
            )
        return True


# ---------------------------------------------------------------------------
# TransferLearner
# ---------------------------------------------------------------------------

class TransferLearner:
    """
    Load a pretrained SB3 PPO checkpoint, optionally reset the output
    layers (action_net / value_net) to force re-learning of the mapping
    while preserving shared feature-extraction weights, then fine-tune
    on a new environment.

    Parameters
    ----------
    base_model_path:
        Path to the pretrained ``.zip`` file produced by SB3.
    new_env:
        Gymnasium environment for fine-tuning.  Pass ``None`` to skip
        ``set_env()`` (policy-only usage, e.g. inference or export).
    fine_tune_timesteps:
        Number of environment steps for the fine-tuning phase.
    reset_last_layers:
        If ``True`` (default), re-initialise ``action_net`` and
        ``value_net`` with orthogonal weights before fine-tuning so that
        only the shared trunk is transferred.
    learning_rate:
        Optimizer learning rate used during fine-tuning.  Should be
        lower than the original training LR to avoid catastrophic
        forgetting.
    """

    def __init__(
        self,
        base_model_path: str,
        new_env,
        fine_tune_timesteps: int = 50_000,
        reset_last_layers: bool = True,
        learning_rate: float = 1e-4,
    ):
        self.base_model_path = base_model_path
        self.new_env = new_env
        self.fine_tune_timesteps = fine_tune_timesteps
        self.reset_last_layers = reset_last_layers
        self.learning_rate = learning_rate

        self._model: Optional[PPO] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def load_base(self) -> PPO:
        """
        Load the base model from *base_model_path*.

        If *new_env* is not ``None`` the model's environment is replaced
        via ``set_env()``.  The optimizer learning rate is updated to
        ``self.learning_rate`` and output layers are (optionally) reset.

        Returns
        -------
        PPO
            The loaded (and possibly modified) model, ready for
            fine-tuning or inference.
        """
        logger.info("Loading base model from %s", self.base_model_path)
        model = PPO.load(self.base_model_path)

        if self.new_env is not None:
            model.set_env(self.new_env)

        # Update the learning rate stored on the model so that when
        # learn() is called the correct LR schedule is used.
        model.learning_rate = self.learning_rate
        # Also patch the current optimizer parameter group directly so
        # any immediately-scheduled updates use the new rate.
        try:
            for param_group in model.policy.optimizer.param_groups:
                param_group["lr"] = self.learning_rate
        except Exception:  # noqa: BLE001
            pass  # optimizer may not exist yet for policy-only models

        self._maybe_reset_last_layers(model)
        self._model = model
        return model

    def fine_tune(self, emit_fn: Optional[Callable] = None) -> PPO:
        """
        Fine-tune the loaded model for *fine_tune_timesteps* steps.

        Parameters
        ----------
        emit_fn:
            Optional callable ``emit_fn(event_name: str, data: dict)``.
            When provided a ``"transfer:progress"`` event is emitted
            every 10 000 timesteps.

        Returns
        -------
        PPO
            The fine-tuned model.

        Raises
        ------
        RuntimeError
            If ``load_base()`` has not been called first.
        """
        if self._model is None:
            raise RuntimeError(
                "Call load_base() before fine_tune()."
            )

        callbacks = []
        if emit_fn is not None:
            callbacks.append(
                _ProgressCallback(
                    total_timesteps=self.fine_tune_timesteps,
                    emit_fn=emit_fn,
                    interval=10_000,
                )
            )

        logger.info(
            "Fine-tuning for %d timesteps (lr=%.2e)",
            self.fine_tune_timesteps,
            self.learning_rate,
        )
        self._model.learn(
            total_timesteps=self.fine_tune_timesteps,
            reset_num_timesteps=False,
            callback=callbacks if callbacks else None,
        )
        return self._model

    def save_fine_tuned(self, output_path: str) -> str:
        """
        Save the fine-tuned model to *output_path*.

        SB3's ``save()`` automatically appends ``.zip`` when the path
        does not already end with it.

        Parameters
        ----------
        output_path:
            Destination path (with or without ``.zip`` extension).

        Returns
        -------
        str
            Resolved path including the ``.zip`` extension.

        Raises
        ------
        RuntimeError
            If the model has not been loaded / fine-tuned yet.
        """
        if self._model is None:
            raise RuntimeError(
                "No model to save. Call load_base() first."
            )

        self._model.save(output_path)
        if not output_path.endswith(".zip"):
            output_path = output_path + ".zip"
        logger.info("Fine-tuned model saved to %s", output_path)
        return output_path

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _maybe_reset_last_layers(self, model: PPO) -> None:
        """
        Re-initialise the output layers of the policy network.

        When *reset_last_layers* is ``True``, the ``action_net`` and
        ``value_net`` linear layers are re-initialised with orthogonal
        weights (gain=0.01) and zero biases.  This keeps the shared
        feature-extraction trunk from the base model while forcing the
        agent to re-learn the action/value mapping on the new task.
        """
        if not self.reset_last_layers:
            return

        import torch.nn as nn

        if not hasattr(model, "policy"):
            return

        for attr in ("action_net", "value_net"):
            module = getattr(model.policy, attr, None)
            if module is None:
                continue
            if hasattr(module, "weight"):
                nn.init.orthogonal_(module.weight, gain=0.01)
                nn.init.constant_(module.bias, 0.0)
                logger.debug("Reset %s weights", attr)
