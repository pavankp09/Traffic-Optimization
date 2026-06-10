"""
Model Zoo for Traffic Signal Optimizer.
Maps preset_id -> pre-trained model path.
"""
from __future__ import annotations

import os
from typing import Optional


# Pre-trained model zoo: maps preset_id -> relative model path (under models/ dir)
MODEL_ZOO: dict[str, str] = {
    "hyd_rush_hour":   "zoo/hyderabad_rush_hour_v1.zip",
    "hyd_normal":      "zoo/hyderabad_normal_v1.zip",
    "hyd_night":       "zoo/hyderabad_night_v1.zip",
    "hyd_midnight":    "zoo/hyderabad_midnight_v1.zip",
    "hyd_weekend":     "zoo/hyderabad_weekend_v1.zip",
    "hyd_hitec_city":  "zoo/hyderabad_hitec_city_v1.zip",
    "hyd_old_city":    "zoo/hyderabad_old_city_v1.zip",
    "hyd_festival":    "zoo/hyderabad_festival_v1.zip",
    "hyd_monsoon":     "zoo/hyderabad_monsoon_v1.zip",
    "hyd_school_zone": "zoo/hyderabad_school_zone_v1.zip",
    "western_rush":    "zoo/western_rush_v1.zip",
    "industrial_peak": "zoo/industrial_peak_v1.zip",
}


def get_zoo_model_path(preset_id: str, model_dir: str = "models") -> Optional[str]:
    """
    Returns full path to pre-trained model for the given preset_id.
    Returns None if preset_id is not in MODEL_ZOO or the file doesn't exist on disk.
    """
    relative = MODEL_ZOO.get(preset_id)
    if relative is None:
        return None

    full_path = os.path.join(model_dir, relative)
    if not os.path.isfile(full_path):
        return None

    return full_path


def list_zoo_models(model_dir: str = "models") -> list[dict]:
    """
    Returns a list of all zoo model entries.
    Each entry: {"preset_id": str, "path": str, "available": bool}
    'available' is True if the .zip file exists on disk.
    """
    results = []
    for preset_id, relative in MODEL_ZOO.items():
        full_path = os.path.join(model_dir, relative)
        results.append({
            "preset_id": preset_id,
            "path": full_path,
            "available": os.path.isfile(full_path),
        })
    return results


def zoo_model_exists(preset_id: str, model_dir: str = "models") -> bool:
    """Returns True if the model file exists on disk for the given preset_id."""
    return get_zoo_model_path(preset_id, model_dir) is not None
