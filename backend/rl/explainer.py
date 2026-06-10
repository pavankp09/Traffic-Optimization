"""
XAI Explainer for Traffic Signal Optimizer PPO agents.

Uses SHAP KernelExplainer (model-agnostic) to attribute each predicted
action to individual state features, and generates human-readable
natural-language explanations.
"""
from __future__ import annotations

import logging
from typing import List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature metadata
# ---------------------------------------------------------------------------

FEATURE_NAMES: List[str] = [
    "queue_north", "queue_south", "queue_east", "queue_west",
    "wait_north", "wait_south", "wait_east", "wait_west",
    "flow_north", "flow_south", "flow_east", "flow_west",
    "heavy_north", "heavy_south", "heavy_east", "heavy_west",
    "current_phase", "phase_elapsed", "time_of_day",
    "total_delay", "emergency_flag", "adverse_severity",
]

# Human-friendly labels used in generated explanations
_FEATURE_LABELS = {
    "queue_north": "queue on north arm",
    "queue_south": "queue on south arm",
    "queue_east": "queue on east arm",
    "queue_west": "queue on west arm",
    "wait_north": "wait time on north",
    "wait_south": "wait time on south",
    "wait_east": "wait time on east",
    "wait_west": "wait time on west",
    "flow_north": "flow rate north",
    "flow_south": "flow rate south",
    "flow_east": "flow rate east",
    "flow_west": "flow rate west",
    "heavy_north": "heavy vehicles north",
    "heavy_south": "heavy vehicles south",
    "heavy_east": "heavy vehicles east",
    "heavy_west": "heavy vehicles west",
    "current_phase": "current phase",
    "phase_elapsed": "phase elapsed time",
    "time_of_day": "time of day",
    "total_delay": "total network delay",
    "emergency_flag": "emergency vehicle",
    "adverse_severity": "adverse conditions",
}

# ---------------------------------------------------------------------------
# Action decoding (local copy to avoid SUMO import dependency)
# ---------------------------------------------------------------------------

_PHASES = [0, 1, 2, 3, 4]
_DURATIONS = [15, 20, 25, 30, 40, 50, 60]


def _decode_action(action: int) -> tuple[int, int]:
    """Return ``(phase_index, duration_s)`` for a flat action index."""
    phase_idx = action // len(_DURATIONS)
    dur_idx = action % len(_DURATIONS)
    return _PHASES[phase_idx], _DURATIONS[dur_idx]


# ---------------------------------------------------------------------------
# TrafficExplainer
# ---------------------------------------------------------------------------

class TrafficExplainer:
    """
    SHAP-based explainer for a trained SB3 PPO traffic signal agent.

    Wraps a ``shap.KernelExplainer`` fitted on a background dataset of
    observations and provides:

    * Per-observation SHAP value decomposition (``explain``).
    * Natural-language decision rationale (``generate_reason``).
    * Aggregate feature importance over a batch (``get_feature_importance``).

    Parameters
    ----------
    model:
        A trained ``stable_baselines3.PPO`` instance.
    n_background_samples:
        Expected size of the background dataset (informational; the
        actual background is provided to ``fit_explainer``).
    """

    def __init__(self, model, n_background_samples: int = 100):
        self.model = model
        self.n_background_samples = n_background_samples
        self._explainer = None  # set after fit_explainer()

    # ------------------------------------------------------------------
    # Prediction function (overridable in tests)
    # ------------------------------------------------------------------

    def _predict_fn(self, obs_array: np.ndarray) -> np.ndarray:
        """
        Return predicted action (as float) for each row in *obs_array*.

        This is the function passed to ``shap.KernelExplainer``.  It can
        be monkey-patched in tests to bypass env-dimension mismatches.
        """
        actions = []
        for obs in obs_array:
            action, _ = self.model.predict(
                obs.astype(np.float32), deterministic=True
            )
            actions.append(float(action))
        return np.array(actions)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def fit_explainer(self, background_obs: np.ndarray) -> None:
        """
        Fit a SHAP ``KernelExplainer`` on *background_obs*.

        Parameters
        ----------
        background_obs:
            Representative background observations, shape ``(n, 22)``.
            A larger background improves SHAP accuracy but increases
            computation time quadratically.
        """
        import shap

        background_obs = np.asarray(background_obs, dtype=np.float32)
        logger.info(
            "Fitting KernelExplainer on %d background samples",
            len(background_obs),
        )
        self._explainer = shap.KernelExplainer(
            self._predict_fn, background_obs
        )

    def explain(self, obs: np.ndarray) -> dict:
        """
        Compute SHAP values for a single observation.

        Parameters
        ----------
        obs:
            Observation array of shape ``(22,)`` or ``(1, 22)``.

        Returns
        -------
        dict with keys:
            ``shap_values``   – list of 22 floats
            ``feature_names`` – ``FEATURE_NAMES``
            ``feature_values``– raw observation values
            ``top_features``  – top-5 features sorted by ``|shap|``
            ``action``        – predicted action index
            ``phase``         – decoded phase index
            ``duration_s``    – decoded duration in seconds

        Raises
        ------
        RuntimeError
            If ``fit_explainer()`` has not been called first.
        """
        if self._explainer is None:
            raise RuntimeError("Call fit_explainer() before explain().")

        obs = np.asarray(obs, dtype=np.float32)
        if obs.ndim == 1:
            obs_2d = obs.reshape(1, -1)
        else:
            obs_2d = obs
            obs = obs.reshape(-1)

        # Predicted action
        action = int(self._predict_fn(obs_2d)[0])
        phase, duration_s = _decode_action(action)

        # SHAP values – KernelExplainer returns shape (1, n_features)
        shap_vals = self._explainer.shap_values(obs_2d, silent=True)
        shap_vals = np.asarray(shap_vals).reshape(-1)

        # Top-5 by absolute magnitude
        top_indices = np.argsort(np.abs(shap_vals))[::-1][:5]
        top_features = [
            {
                "name": FEATURE_NAMES[i],
                "shap": float(shap_vals[i]),
                "value": float(obs.reshape(-1)[i]),
            }
            for i in top_indices
        ]

        return {
            "shap_values": shap_vals.tolist(),
            "feature_names": FEATURE_NAMES,
            "feature_values": obs.reshape(-1).tolist(),
            "top_features": top_features,
            "action": action,
            "phase": phase,
            "duration_s": duration_s,
        }

    def generate_reason(self, obs: np.ndarray) -> str:
        """
        Produce a concise natural-language explanation for the agent's
        decision given *obs*.

        Rules
        -----
        * If ``obs[20] > 0.5`` (emergency flag): prefix with
          ``"EMERGENCY: "``.
        * If ``obs[21] > 0.5`` (adverse severity): mention adverse
          conditions.
        * List the top 2–3 contributing features with formatted values.
        * Always mention the selected phase and duration.
        """
        obs = np.asarray(obs, dtype=np.float32).reshape(-1)
        result = self.explain(obs)

        phase = result["phase"]
        duration_s = result["duration_s"]
        top = result["top_features"]

        emergency = float(obs[20]) > 0.5
        adverse = float(obs[21]) > 0.5

        if emergency:
            return (
                f"EMERGENCY: Prioritizing phase {phase} for {duration_s}s "
                f"due to emergency vehicle detected"
            )

        # Build feature description from top 2-3 features (skip flags)
        skip_names = {"emergency_flag", "adverse_severity"}
        feature_parts: List[str] = []
        for feat in top:
            if feat["name"] in skip_names:
                continue
            label = _FEATURE_LABELS.get(feat["name"], feat["name"])
            feature_parts.append(f"{label} ({feat['value']:.2f})")
            if len(feature_parts) >= 3:
                break

        feature_str = ", ".join(feature_parts) if feature_parts else "balanced demand"

        if adverse:
            return (
                f"Adjusted to phase {phase} for {duration_s}s under adverse conditions: "
                f"{feature_str}"
            )

        # Determine verb based on action context
        verb = "Selected"
        if obs[16] == phase:  # same phase as current
            verb = "Extended"
        else:
            verb = "Switched to"

        return f"{verb} phase {phase} for {duration_s}s: {feature_str}"

    def get_feature_importance(self, obs_batch: np.ndarray) -> dict:
        """
        Compute mean absolute SHAP values over a batch of observations.

        Parameters
        ----------
        obs_batch:
            Array of shape ``(n_obs, 22)``.

        Returns
        -------
        dict with keys:
            ``feature_names`` – ``FEATURE_NAMES``
            ``importance``    – mean ``|shap|`` per feature, **sorted
                                descending**
            ``top_k``         – top-5 entries as
                                ``[{"name": str, "importance": float}]``

        Raises
        ------
        RuntimeError
            If ``fit_explainer()`` has not been called first.
        """
        if self._explainer is None:
            raise RuntimeError(
                "Call fit_explainer() before get_feature_importance()."
            )

        obs_batch = np.asarray(obs_batch, dtype=np.float32)
        shap_matrix = self._explainer.shap_values(obs_batch, silent=True)
        shap_matrix = np.asarray(shap_matrix)  # (n_obs, 22)

        mean_abs = np.mean(np.abs(shap_matrix), axis=0)  # (22,)

        # Sort descending by importance
        sorted_indices = np.argsort(mean_abs)[::-1]
        sorted_importance = mean_abs[sorted_indices].tolist()
        sorted_names = [FEATURE_NAMES[i] for i in sorted_indices]

        top_k = [
            {"name": sorted_names[i], "importance": sorted_importance[i]}
            for i in range(min(5, len(sorted_names)))
        ]

        return {
            "feature_names": sorted_names,
            "importance": sorted_importance,
            "top_k": top_k,
        }
