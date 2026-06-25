"""
Model Manager for Traffic Signal Optimizer.
Handles save/load/version management of SB3 PPO models.
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from typing import Optional

from stable_baselines3 import PPO

logger = logging.getLogger(__name__)


class ModelManager:
    """
    Manages versioned SB3 PPO model files on disk.

    Models are stored as:
        {model_dir}/{name}_v{version}.zip
    Metadata JSON stored alongside:
        {model_dir}/{name}_v{version}.json
    """

    def __init__(self, model_dir: str = "models"):
        self.model_dir = model_dir
        os.makedirs(self.model_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _next_version(self, name: str) -> int:
        """Return next available version number (max existing + 1, minimum 1)."""
        return self.get_latest_version(name) + 1

    def _zip_path(self, name: str, version: int) -> str:
        return os.path.join(self.model_dir, f"{name}_v{version}.zip")

    def _json_path(self, name: str, version: int) -> str:
        return os.path.join(self.model_dir, f"{name}_v{version}.json")

    def _load_metadata(self, name: str, version: int) -> dict:
        json_path = self._json_path(name, version)
        if os.path.isfile(json_path):
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as exc:
                logger.warning("Failed to load metadata %s: %s", json_path, exc)
        return {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def save(self, model: PPO, name: str, metadata: dict = None) -> str:
        """
        Save model to {model_dir}/{name}_v{version}.zip.
        Auto-increments version number.
        Saves metadata JSON alongside.

        Returns full path to .zip file.
        """
        os.makedirs(self.model_dir, exist_ok=True)

        version = self._next_version(name)
        zip_path = self._zip_path(name, version)
        json_path = self._json_path(name, version)

        # SB3 PPO.save() adds .zip automatically if the path doesn't end with .zip
        # We pass path without .zip extension to avoid double .zip
        base_path = zip_path[:-4] if zip_path.endswith(".zip") else zip_path
        model.save(base_path)

        # Build and save metadata
        meta = {
            "name": name,
            "version": version,
            "saved_at": datetime.utcnow().isoformat(),
        }
        if metadata:
            meta.update(metadata)
        # Ensure name and version are not overwritten by caller
        meta["name"] = name
        meta["version"] = version

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, default=str)

        logger.info("Model saved: %s (version %d)", zip_path, version)
        return zip_path

    def load(self, name: str, version: int = None) -> PPO:
        """
        Load PPO model from {model_dir}/{name}_v{version}.zip.
        If version=None, loads the latest version.

        Raises FileNotFoundError if not found.
        """
        algo_dir = os.path.join(self.model_dir, name)
        new_path = os.path.join(algo_dir, "latest.zip")
        
        # If latest.zip doesn't exist, search for latest*.zip in the algorithm folder
        if not os.path.isfile(new_path) and os.path.isdir(algo_dir):
            import glob
            matches = glob.glob(os.path.join(algo_dir, "latest*.zip"))
            if matches:
                matches.sort()  # Sort chronologically by timestamp in name
                new_path = matches[-1]

        if os.path.isfile(new_path):
            from backend.rl.device import cuda_lock
            with cuda_lock:
                model = PPO.load(new_path, env=None)
            logger.info("Model loaded from layout: %s", new_path)
            return model

        if version is None:
            version = self.get_latest_version(name)
            if version == 0:
                raise FileNotFoundError(
                    f"No models found for name '{name}' in '{self.model_dir}'"
                )

        zip_path = self._zip_path(name, version)
        if not os.path.isfile(zip_path):
            raise FileNotFoundError(
                f"Model not found: {zip_path}"
            )

        from backend.rl.device import cuda_lock
        with cuda_lock:
            model = PPO.load(zip_path, env=None)
        logger.info("Model loaded: %s", zip_path)
        return model

    def list_models(self) -> list[dict]:
        """
        Returns list of dicts for all models in model_dir.
        Each dict: {"name": str, "version": int, "path": str, "metadata": dict, "saved_at": str}
        Sorted by name then version.
        """
        results = []

        if not os.path.isdir(self.model_dir):
            return results

        for root, dirs, files in os.walk(self.model_dir):
            for filename in files:
                if not filename.endswith(".zip"):
                    continue

                path = os.path.join(root, filename)
                rel_path = os.path.relpath(path, self.model_dir)
                parts = rel_path.split(os.sep)

                if len(parts) >= 2:
                    algo_name = parts[0]
                    if filename == "latest.zip":
                        name = algo_name
                        version = 999999
                        try:
                            mtime = os.path.getmtime(path)
                            saved_at = datetime.utcfromtimestamp(mtime).isoformat()
                        except Exception:
                            saved_at = datetime.utcnow().isoformat()
                        metadata = {}
                    elif filename.startswith("latest_") and filename.endswith(".zip"):
                        name = algo_name
                        ts_str = filename[7:-4]
                        try:
                            version = int(ts_str.replace("_", ""))
                        except ValueError:
                            version = 1
                        
                        try:
                            dt = datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
                            saved_at = dt.isoformat()
                        except Exception:
                            try:
                                mtime = os.path.getmtime(path)
                                saved_at = datetime.utcfromtimestamp(mtime).isoformat()
                            except Exception:
                                saved_at = datetime.utcnow().isoformat()
                        metadata = {}
                    else:
                        match = re.match(r'^(.+)_v(\d+)\.zip$', filename)
                        if match:
                            name = match.group(1)
                            version = int(match.group(2))
                        else:
                            name = filename[:-4]
                            version = 1
                        metadata = self._load_metadata(name, version)
                        saved_at = metadata.get("saved_at", "")
                else:
                    match = re.match(r'^(.+)_v(\d+)\.zip$', filename)
                    if match:
                        name = match.group(1)
                        version = int(match.group(2))
                    else:
                        name = filename[:-4]
                        version = 1
                    metadata = self._load_metadata(name, version)
                    saved_at = metadata.get("saved_at", "")

                results.append({
                    "name": name,
                    "version": version,
                    "path": path,
                    "metadata": metadata,
                    "saved_at": saved_at,
                })

        results.sort(key=lambda x: (x["name"], x["version"]))
        return results

    def delete(self, name: str, version: int) -> bool:
        """
        Delete model .zip and .json files.
        Returns True if deleted, False if not found.
        """
        zip_path = self._zip_path(name, version)
        json_path = self._json_path(name, version)

        zip_exists = os.path.isfile(zip_path)
        json_exists = os.path.isfile(json_path)

        if not zip_exists and not json_exists:
            return False

        if zip_exists:
            os.remove(zip_path)
        if json_exists:
            os.remove(json_path)

        logger.info("Model deleted: %s v%d", name, version)
        return True

    def get_latest_version(self, name: str) -> int:
        """
        Returns the latest version number for the given model name.
        Returns 0 if no models found.
        """
        if not os.path.isdir(self.model_dir):
            return 0

        versions = []
        for filename in os.listdir(self.model_dir):
            # Use the spec's regex pattern
            matches = re.findall(r'_v(\d+)\.zip$', filename)
            if matches:
                # Verify the name prefix matches
                prefix = f"{name}_v"
                if filename.startswith(prefix):
                    versions.append(int(matches[0]))

        return max(versions) if versions else 0

    def export_summary(self) -> dict:
        """
        Returns summary of all models in model_dir.
        {"total_models": int, "model_names": list[str], "model_dir": str}
        """
        models = self.list_models()
        names = sorted(set(m["name"] for m in models))
        return {
            "total_models": len(models),
            "model_names": names,
            "model_dir": self.model_dir,
        }
