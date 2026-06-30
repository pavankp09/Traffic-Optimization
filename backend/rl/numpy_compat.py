import sys
import zipfile
import json
import io
import pathlib

# 1. Apply numpy._core alias early
try:
    import numpy as np
    if not hasattr(np, "_core"):
        import numpy.core as core
        np._core = core
        sys.modules['numpy._core'] = core
        import numpy.core.numeric as numeric
        sys.modules['numpy._core.numeric'] = numeric
        for sub in ["multiarray", "umath", "function"]:
            try:
                m = __import__(f"numpy.core.{sub}", fromlist=[""])
                sys.modules[f"numpy._core.{sub}"] = m
            except ImportError:
                pass
except ImportError:
    pass

# 2. Patch BitGenerator constructor in numpy.random._pickle
try:
    import numpy.random._pickle as pickle_module
    if not hasattr(pickle_module, "_original_ctor"):
        pickle_module._original_ctor = pickle_module.__bit_generator_ctor
        def patched_ctor(bit_generator_name='MT19937'):
            if not isinstance(bit_generator_name, str):
                name = getattr(bit_generator_name, "__name__", str(bit_generator_name))
            else:
                name = bit_generator_name
            
            if "PCG64DXSM" in name:
                name = "PCG64DXSM"
            elif "PCG64" in name:
                name = "PCG64"
            elif "MT19937" in name:
                name = "MT19937"
            elif "Philox" in name:
                name = "Philox"
            elif "SFC64" in name:
                name = "SFC64"
            return pickle_module._original_ctor(name)
        pickle_module.__bit_generator_ctor = patched_ctor
except Exception:
    pass

# Helper to parse gym spaces from json
def parse_space_from_json(space_dict):
    if space_dict is None:
        return None
    try:
        from gymnasium import spaces
    except ImportError:
        return None
    import numpy as np
    
    space_type = space_dict.get(":type:", "")
    if "Box" in space_type:
        shape = tuple(space_dict.get("_shape", []))
        try:
            low = float(space_dict.get("low_repr", 0.0))
        except ValueError:
            low = 0.0
        try:
            high = float(space_dict.get("high_repr", 1.0))
        except ValueError:
            high = 1.0
        dtype_str = space_dict.get("dtype", "float32")
        dtype = np.float32 if dtype_str == "float32" else np.float64
        return spaces.Box(low=low, high=high, shape=shape, dtype=dtype)
    elif "Discrete" in space_type:
        n = int(space_dict.get("n", 1))
        start = int(space_dict.get("start", 0))
        return spaces.Discrete(n, start=start)
    return None

def extract_spaces_from_zip(path):
    try:
        if isinstance(path, (str, pathlib.Path)):
            with zipfile.ZipFile(path, 'r') as archive:
                data_bytes = archive.read('data')
        elif hasattr(path, 'read'):
            pos = path.tell() if hasattr(path, 'seek') else None
            with zipfile.ZipFile(path, 'r') as archive:
                data_bytes = archive.read('data')
            if pos is not None:
                path.seek(pos)
        else:
            return None, None
            
        data = json.loads(data_bytes.decode('utf-8'))
        obs_space = parse_space_from_json(data.get("observation_space"))
        act_space = parse_space_from_json(data.get("action_space"))
        return obs_space, act_space
    except Exception:
        return None, None

# 3. Patch BaseAlgorithm.load in stable_baselines3
try:
    from stable_baselines3.common.base_class import BaseAlgorithm
    if not hasattr(BaseAlgorithm, "_original_load_func"):
        BaseAlgorithm._original_load_func = BaseAlgorithm.load.__func__
        
        @classmethod
        def patched_load(cls, path, env=None, device="auto", custom_objects=None, **kwargs):
            if custom_objects is None:
                custom_objects = {}
            
            # Extract spaces from the zip dynamically if not provided in custom_objects
            if "observation_space" not in custom_objects or "action_space" not in custom_objects:
                obs_space, act_space = extract_spaces_from_zip(path)
                if obs_space is not None and "observation_space" not in custom_objects:
                    custom_objects["observation_space"] = obs_space
                if act_space is not None and "action_space" not in custom_objects:
                    custom_objects["action_space"] = act_space
                    
            if "lr_schedule" not in custom_objects:
                custom_objects["lr_schedule"] = lambda _: 0.0
            if "clip_range" not in custom_objects:
                custom_objects["clip_range"] = lambda _: 0.0
                
            return cls._original_load_func(cls, path, env=env, device=device, custom_objects=custom_objects, **kwargs)
            
        BaseAlgorithm.load = patched_load
except Exception:
    pass
