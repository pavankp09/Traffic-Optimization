"""
Input configuration parser for Traffic Signal Simulation.
Parses, cleans, and merges client/frontend configuration dictionary into dataclasses.
Provides robust fallback defaults if any field is missing or None.
"""
from __future__ import annotations

import dataclasses
import logging
from backend.config import SimulationConfig, AdverseConfig

logger = logging.getLogger(__name__)


def _safe_cast(value, target_type, default):
    if value is None:
        return default
    try:
        if target_type is bool:
            if isinstance(value, str):
                return value.lower() in ("true", "1", "yes", "on")
            return bool(value)
        if target_type is int:
            return int(float(value))
        if target_type is float:
            return float(value)
        return target_type(value)
    except Exception as exc:
        logger.warning(
            "Casting value %r to type %r failed, using default %r. Error: %s",
            value, target_type, default, exc
        )
        return default


def parse_simulation_config(sim_dict: dict | None) -> SimulationConfig:
    """Parse, clean, and merge a simulation configuration dict, applying defaults.

    Tolerates unknown keys (ignores them).
    If no value or None is received, returns standard SimulationConfig().
    """
    if not sim_dict or not isinstance(sim_dict, dict):
        return SimulationConfig()

    fields_info = {f.name: f.type for f in dataclasses.fields(SimulationConfig)}
    
    clean_dict = {}
    for key, val in sim_dict.items():
        if key in fields_info:
            target_type = fields_info[key]
            # Handle optional fields or union types
            if hasattr(target_type, "__origin__"):
                # Handle typing.Optional or typing.Union
                args = target_type.__args__
                non_none_args = [t for t in args if t is not type(None)]
                target_type = non_none_args[0] if non_none_args else str
            
            # Find the default value if possible
            default_val = None
            for f in dataclasses.fields(SimulationConfig):
                if f.name == key:
                    if f.default is not dataclasses.MISSING:
                        default_val = f.default
                    elif f.default_factory is not dataclasses.MISSING:
                        default_val = f.default_factory()
                    break

            clean_dict[key] = _safe_cast(val, target_type, default_val)

    # Instantiate using standard class fields
    return SimulationConfig(**clean_dict)


def parse_adverse_config(adverse_dict: dict | None) -> AdverseConfig:
    """Parse, clean, and merge an adverse events configuration dict, applying defaults.

    Tolerates unknown keys (ignores them).
    If no value or None is received, returns standard AdverseConfig().
    """
    if not adverse_dict or not isinstance(adverse_dict, dict):
        return AdverseConfig()

    fields_info = {f.name: f.type for f in dataclasses.fields(AdverseConfig)}

    clean_dict = {}
    for key, val in adverse_dict.items():
        if key in fields_info:
            target_type = fields_info[key]
            # Handle optional fields or union types
            if hasattr(target_type, "__origin__"):
                args = target_type.__args__
                non_none_args = [t for t in args if t is not type(None)]
                target_type = non_none_args[0] if non_none_args else str

            default_val = None
            for f in dataclasses.fields(AdverseConfig):
                if f.name == key:
                    if f.default is not dataclasses.MISSING:
                        default_val = f.default
                    elif f.default_factory is not dataclasses.MISSING:
                        default_val = f.default_factory()
                    break

            clean_dict[key] = _safe_cast(val, target_type, default_val)

    return AdverseConfig(**clean_dict)
