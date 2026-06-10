"""
Unit tests for ModelManager and model_zoo utilities.
Uses a real lightweight PPO model trained on CartPole-v1.
"""
from __future__ import annotations

import json
import os

import gymnasium as gym
import pytest
from stable_baselines3 import PPO

from backend.rl.model_manager import ModelManager
from backend.rl.model_zoo import (
    MODEL_ZOO,
    get_zoo_model_path,
    list_zoo_models,
    zoo_model_exists,
)


# ---------------------------------------------------------------------------
# Shared fixture: lightweight PPO model
# ---------------------------------------------------------------------------

def make_test_model() -> PPO:
    env = gym.make("CartPole-v1")
    model = PPO("MlpPolicy", env, verbose=0)
    model.learn(total_timesteps=100)
    return model


# ---------------------------------------------------------------------------
# ModelManager tests
# ---------------------------------------------------------------------------

class TestModelManagerSave:
    def test_save_creates_zip_and_json(self, tmp_path):
        """Save model, verify .zip and .json files exist."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()

        saved_path = manager.save(model, "test_model")

        assert saved_path.endswith(".zip")
        assert os.path.isfile(saved_path), f"ZIP not found: {saved_path}"

        json_path = saved_path.replace(".zip", ".json")
        assert os.path.isfile(json_path), f"JSON not found: {json_path}"

    def test_save_auto_increments_version(self, tmp_path):
        """Save same name twice, verify v1 and v2 both exist."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()

        path1 = manager.save(model, "my_model")
        path2 = manager.save(model, "my_model")

        assert "my_model_v1.zip" in path1
        assert "my_model_v2.zip" in path2
        assert os.path.isfile(path1)
        assert os.path.isfile(path2)

    def test_save_stores_metadata_fields(self, tmp_path):
        """Metadata JSON contains expected fields after save."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()
        meta_in = {"total_timesteps": 100, "best_reward": -5.0, "preset_id": "hyd_rush_hour"}

        saved_path = manager.save(model, "meta_test", metadata=meta_in)
        json_path = saved_path.replace(".zip", ".json")

        with open(json_path, "r") as f:
            meta = json.load(f)

        assert meta["name"] == "meta_test"
        assert meta["version"] == 1
        assert "saved_at" in meta
        assert meta["total_timesteps"] == 100
        assert meta["best_reward"] == -5.0
        assert meta["preset_id"] == "hyd_rush_hour"


class TestModelManagerLoad:
    def test_load_latest(self, tmp_path):
        """Save two versions, load(name) returns a PPO instance (latest)."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()

        manager.save(model, "load_test")
        manager.save(model, "load_test")

        loaded = manager.load("load_test")
        assert isinstance(loaded, PPO)

    def test_load_specific_version(self, tmp_path):
        """Save two versions, load(name, version=1) loads v1 without error."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()

        manager.save(model, "versioned_model")
        manager.save(model, "versioned_model")

        loaded = manager.load("versioned_model", version=1)
        assert isinstance(loaded, PPO)

    def test_load_missing_raises(self, tmp_path):
        """Loading a non-existent model raises FileNotFoundError."""
        manager = ModelManager(model_dir=str(tmp_path))

        with pytest.raises(FileNotFoundError):
            manager.load("ghost_model")

    def test_load_missing_specific_version_raises(self, tmp_path):
        """Loading a specific version that doesn't exist raises FileNotFoundError."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()
        manager.save(model, "partial_model")

        with pytest.raises(FileNotFoundError):
            manager.load("partial_model", version=99)


class TestModelManagerList:
    def test_list_models_returns_sorted(self, tmp_path):
        """Save 3 models with two names, list returns sorted by name+version."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()

        manager.save(model, "beta_model")
        manager.save(model, "alpha_model")
        manager.save(model, "alpha_model")

        models = manager.list_models()
        assert len(models) == 3

        names_versions = [(m["name"], m["version"]) for m in models]
        assert names_versions == [
            ("alpha_model", 1),
            ("alpha_model", 2),
            ("beta_model", 1),
        ]

    def test_list_models_empty_dir(self, tmp_path):
        """Empty model_dir returns empty list."""
        manager = ModelManager(model_dir=str(tmp_path))
        assert manager.list_models() == []

    def test_list_models_has_required_keys(self, tmp_path):
        """Each entry in list_models() has required keys."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()
        manager.save(model, "key_test", metadata={"custom": "value"})

        models = manager.list_models()
        assert len(models) == 1
        entry = models[0]

        assert "name" in entry
        assert "version" in entry
        assert "path" in entry
        assert "metadata" in entry
        assert "saved_at" in entry


class TestModelManagerDelete:
    def test_delete_model(self, tmp_path):
        """Save and delete a model, verify files are gone and returns True."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()

        saved_path = manager.save(model, "to_delete")
        json_path = saved_path.replace(".zip", ".json")

        result = manager.delete("to_delete", version=1)

        assert result is True
        assert not os.path.isfile(saved_path)
        assert not os.path.isfile(json_path)

    def test_delete_missing_returns_false(self, tmp_path):
        """Deleting a non-existent model returns False."""
        manager = ModelManager(model_dir=str(tmp_path))

        result = manager.delete("nonexistent", version=1)
        assert result is False


class TestModelManagerVersioning:
    def test_get_latest_version_zero_when_empty(self, tmp_path):
        """Fresh directory returns 0 for get_latest_version."""
        manager = ModelManager(model_dir=str(tmp_path))
        assert manager.get_latest_version("any_model") == 0

    def test_get_latest_version_after_saves(self, tmp_path):
        """get_latest_version returns correct max version after multiple saves."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()

        manager.save(model, "versioned")
        manager.save(model, "versioned")
        manager.save(model, "versioned")

        assert manager.get_latest_version("versioned") == 3

    def test_get_latest_version_isolated_by_name(self, tmp_path):
        """get_latest_version only counts versions for the given name."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()

        manager.save(model, "model_a")
        manager.save(model, "model_a")
        manager.save(model, "model_b")

        assert manager.get_latest_version("model_a") == 2
        assert manager.get_latest_version("model_b") == 1


class TestModelManagerExport:
    def test_export_summary(self, tmp_path):
        """verify total_models count and model_names list."""
        manager = ModelManager(model_dir=str(tmp_path))
        model = make_test_model()

        manager.save(model, "rush_hour")
        manager.save(model, "rush_hour")
        manager.save(model, "night_time")

        summary = manager.export_summary()

        assert summary["total_models"] == 3
        assert set(summary["model_names"]) == {"rush_hour", "night_time"}
        assert summary["model_dir"] == str(tmp_path)

    def test_export_summary_empty(self, tmp_path):
        """Export summary on empty dir returns zeros."""
        manager = ModelManager(model_dir=str(tmp_path))
        summary = manager.export_summary()

        assert summary["total_models"] == 0
        assert summary["model_names"] == []
        assert summary["model_dir"] == str(tmp_path)


# ---------------------------------------------------------------------------
# Model Zoo tests
# ---------------------------------------------------------------------------

class TestModelZoo:
    def test_zoo_model_exists_false_for_missing(self, tmp_path):
        """zoo_model_exists returns False when zoo files don't exist."""
        result = zoo_model_exists("hyd_rush_hour", model_dir=str(tmp_path))
        assert result is False

    def test_zoo_model_exists_false_for_unknown_preset(self, tmp_path):
        """zoo_model_exists returns False for unknown preset_id."""
        result = zoo_model_exists("completely_unknown_preset", model_dir=str(tmp_path))
        assert result is False

    def test_list_zoo_models_returns_all_presets(self, tmp_path):
        """All 12 preset_ids appear in list_zoo_models result."""
        zoo_list = list_zoo_models(model_dir=str(tmp_path))

        preset_ids = {entry["preset_id"] for entry in zoo_list}
        expected_ids = set(MODEL_ZOO.keys())

        assert len(zoo_list) == 12
        assert preset_ids == expected_ids

    def test_list_zoo_models_available_false_when_missing(self, tmp_path):
        """All zoo models report available=False when zoo dir is empty."""
        zoo_list = list_zoo_models(model_dir=str(tmp_path))

        for entry in zoo_list:
            assert entry["available"] is False, (
                f"Expected available=False for {entry['preset_id']}, got True"
            )

    def test_list_zoo_models_has_required_keys(self, tmp_path):
        """Each zoo entry has preset_id, path, available keys."""
        zoo_list = list_zoo_models(model_dir=str(tmp_path))

        for entry in zoo_list:
            assert "preset_id" in entry
            assert "path" in entry
            assert "available" in entry

    def test_get_zoo_model_path_none_for_missing_file(self, tmp_path):
        """get_zoo_model_path returns None when file doesn't exist."""
        result = get_zoo_model_path("hyd_rush_hour", model_dir=str(tmp_path))
        assert result is None

    def test_get_zoo_model_path_none_for_unknown_preset(self, tmp_path):
        """get_zoo_model_path returns None for unknown preset_id."""
        result = get_zoo_model_path("unknown_preset", model_dir=str(tmp_path))
        assert result is None

    def test_get_zoo_model_path_returns_path_when_file_exists(self, tmp_path):
        """get_zoo_model_path returns full path when the file exists."""
        # Create the zoo directory and a dummy file
        zoo_dir = tmp_path / "zoo"
        zoo_dir.mkdir()
        dummy_file = zoo_dir / "hyderabad_rush_hour_v1.zip"
        dummy_file.write_bytes(b"fake zip content")

        result = get_zoo_model_path("hyd_rush_hour", model_dir=str(tmp_path))
        assert result is not None
        assert result.endswith("hyderabad_rush_hour_v1.zip")
        assert os.path.isfile(result)

    def test_model_zoo_has_correct_preset_count(self):
        """MODEL_ZOO constant has exactly 12 entries."""
        assert len(MODEL_ZOO) == 12

    def test_model_zoo_all_values_end_with_zip(self):
        """All MODEL_ZOO paths end with .zip."""
        for preset_id, path in MODEL_ZOO.items():
            assert path.endswith(".zip"), f"{preset_id} path doesn't end with .zip: {path}"

    def test_model_zoo_all_in_zoo_subdir(self):
        """All MODEL_ZOO paths are under the zoo/ subdirectory."""
        for preset_id, path in MODEL_ZOO.items():
            assert path.startswith("zoo/"), (
                f"{preset_id} path not under zoo/: {path}"
            )
