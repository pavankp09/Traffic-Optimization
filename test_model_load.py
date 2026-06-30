import sys

f = open("test_output.txt", "w", encoding="utf-8", buffering=1)
sys.stdout = f
sys.stderr = f

print("Starting test_model_load.py")

try:
    print("Importing stable_baselines3...")
    from stable_baselines3 import PPO
    print("Imported stable_baselines3.")
    
    # Import numpy_compat to apply patches
    print("Importing backend.rl.numpy_compat...")
    import backend.rl.numpy_compat
    print("Imported backend.rl.numpy_compat successfully.")
    
    p = 'models/PPO/latest_20260624_123242.zip'
    print(f"Loading model from {p}...")
    
    model = PPO.load(p, device='cpu')
    print(f"Successfully loaded PPO model: {model}")
except BaseException as e:
    import traceback
    print(f"Caught exception: {e}")
    traceback.print_exc(file=sys.stdout)
finally:
    f.close()
