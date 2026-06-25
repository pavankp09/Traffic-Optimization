from __future__ import annotations

try:
    import torch
except ImportError:
    pass

import os
import platform
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Iterable

# Dynamic alias for numpy._core to core for SB3/Pickle compatibility
# between environments running different NumPy versions (1.x vs 2.x).
try:
    import numpy as np
    if not hasattr(np, "_core"):
        import numpy.core as core
        sys.modules['numpy._core'] = core
        import numpy.core.numeric as numeric
        sys.modules['numpy._core.numeric'] = numeric
except ImportError:
    pass

PROJECT_ROOT = Path(__file__).resolve().parent
VENV_DIR = PROJECT_ROOT / ".venv"
BACKEND_REQUIREMENTS = PROJECT_ROOT / "backend" / "requirements.txt"
TORCH_PACKAGES = {"torch", "torchvision", "torchaudio"}
BACKEND_MARKER = VENV_DIR / ".uv-backend"
if sys.version_info < (3, 10):
    # PyTorch versions supporting Python 3.9 (such as EC2 default environments)
    TORCH_REQUIREMENTS = {
        "cuda": ["torch==2.1.2+cu121", "torchvision==0.16.2+cu121", "torchaudio==2.1.2+cu121"],
        "cpu": ["torch==2.1.2", "torchvision==0.16.2", "torchaudio==2.1.2"],
    }
else:
    TORCH_REQUIREMENTS = {
        "cuda": ["torch==2.11.0+cu128", "torchvision==0.26.0+cu128", "torchaudio==2.11.0+cu128"],
        "cpu": ["torch==2.11.0", "torchvision==0.26.0", "torchaudio==2.11.0"],
    }


def choose_torch_backend(platform_name: str | None = None, has_nvidia_gpu: bool | None = None) -> str:
    """Pick CUDA on NVIDIA Linux/Windows machines, CPU everywhere else."""
    platform_name = (platform_name or platform.system()).lower()
    if platform_name == "darwin":
        return "cpu"
    if has_nvidia_gpu is None:
        has_nvidia_gpu = probe_nvidia_smi()
    return "cuda" if has_nvidia_gpu else "cpu"


def probe_nvidia_smi() -> bool:
    """Return True when nvidia-smi is present and succeeds."""
    try:
        result = subprocess.run(
            ["nvidia-smi"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return result.returncode == 0
    except (FileNotFoundError, OSError):
        return False


def read_requirement_lines(requirements_path: str | Path) -> list[str]:
    return Path(requirements_path).read_text(encoding="utf-8").splitlines()


def filter_requirement_lines(lines: Iterable[str]) -> list[str]:
    cleaned: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        pkg = stripped.split("==", 1)[0].split(">=", 1)[0].split("<=", 1)[0].split("~=", 1)[0].split("!=", 1)[0].split("[", 1)[0].strip().lower().replace("_", "-")
        if pkg in TORCH_PACKAGES:
            continue
        cleaned.append(stripped)
    return cleaned


def venv_python_path() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def uv_marker_path() -> Path:
    return VENV_DIR / ".uv-bootstrap"


def backend_marker_path() -> Path:
    return BACKEND_MARKER


def read_backend_marker() -> str | None:
    path = backend_marker_path()
    if not path.exists():
        return None
    value = path.read_text(encoding="utf-8").strip().lower()
    return value if value in {"cpu", "cuda"} else None


def write_backend_marker(backend: str) -> None:
    backend_marker_path().write_text(f"{backend}\n", encoding="utf-8")


def in_project_venv() -> bool:
    try:
        return str(Path(sys.prefix).resolve()).lower() == str(VENV_DIR.resolve()).lower()
    except Exception:
        return False


def uv_command() -> str:
    return "uv"


def build_uv_install_commands(
    venv_python: str | Path,
    torch_backend: str,
    requirement_lines: Iterable[str] | None = None,
) -> list[list[str]]:
    """Build a single uv install command with pinned torch wheels first."""
    lines = list(requirement_lines) if requirement_lines is not None else read_requirement_lines(BACKEND_REQUIREMENTS)
    base_reqs = filter_requirement_lines(lines)
    python_path = str(venv_python)
    uv = uv_command()
    torch_reqs = TORCH_REQUIREMENTS.get(torch_backend, TORCH_REQUIREMENTS["cpu"])

    cmd = [
        uv,
        "pip",
        "install",
        "--python",
        python_path,
        "--upgrade",
        "--link-mode=copy",
    ]
    if torch_backend == "cuda":
        cmd.extend([
            "--index-url",
            "https://download.pytorch.org/whl/cu128",
            "--extra-index-url",
            "https://pypi.org/simple",
            "--index-strategy",
            "unsafe-best-match",
        ])
    else:
        cmd.extend([
            "--index-url",
            "https://download.pytorch.org/whl/cpu",
            "--extra-index-url",
            "https://pypi.org/simple",
        ])

    cmd.extend([*torch_reqs, *base_reqs])
    return [cmd]


def runtime_ready(venv_python: str | Path, torch_backend: str) -> bool:
    check_script = """
import importlib
import sys

core = [
    "flask",
    "flask_socketio",
    "flask_cors",
    "sqlalchemy",
    "gymnasium",
    "stable_baselines3",
    "numpy",
]
for module_name in core:
    importlib.import_module(module_name)

import torch
backend = sys.argv[1]
if backend == "cuda":
    raise SystemExit(0 if torch.cuda.is_available() else 2)

raise SystemExit(0)
"""
    result = subprocess.run(
        [str(venv_python), "-c", check_script, torch_backend],
        cwd=PROJECT_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def ensure_local_runtime() -> None:
    uv = uv_command()
    if not shutil_which(uv):
        raise RuntimeError("uv is required but was not found on PATH")

    os.environ.setdefault("UV_LINK_MODE", "copy")

    python_path = venv_python_path()
    if not python_path.exists():
        print("[Bootstrap] Creating local virtual environment with uv...")
        subprocess.run([uv, "venv", str(VENV_DIR), "--allow-existing"], cwd=PROJECT_ROOT, check=True)

    desired_backend = choose_torch_backend()
    marker_backend = read_backend_marker()

    # Check if the runtime is already functional with the marker backend (or CPU fallback)
    # to avoid endlessly attempting to re-install CUDA packages if CUDA is unavailable.
    is_ready = False
    if marker_backend and runtime_ready(python_path, marker_backend):
        is_ready = True
    elif marker_backend is None and runtime_ready(python_path, "cpu"):
        is_ready = True

    if is_ready:
        if not in_project_venv():
            script_path = str(Path(__file__).resolve())
            result = subprocess.run([str(python_path), script_path], cwd=PROJECT_ROOT, check=False)
            raise SystemExit(result.returncode)
        return

    marker_path = uv_marker_path()

    print(f"[Bootstrap] Installing Python dependencies with uv ({desired_backend})...")
    for command in build_uv_install_commands(python_path, desired_backend):
        subprocess.run(command, cwd=PROJECT_ROOT, check=True)
    marker_path.write_text("uv-managed\n", encoding="utf-8")
    actual_backend = desired_backend if runtime_ready(python_path, desired_backend) else "cpu"
    write_backend_marker(actual_backend)

    if not in_project_venv():
        script_path = str(Path(__file__).resolve())
        result = subprocess.run([str(python_path), script_path], cwd=PROJECT_ROOT, check=False)
        raise SystemExit(result.returncode)


def start_frontend() -> None:
    try:
        frontend_dir = PROJECT_ROOT / "frontend"
        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        node_modules = frontend_dir / "node_modules"

        if not node_modules.exists():
            subprocess.run([npm, "install", "--silent"], cwd=frontend_dir, check=True)

        subprocess.run([npm, "run", "dev"], cwd=frontend_dir, check=True)
    except Exception as e:
        print(f"[Info] Frontend dev server start skipped (port 8005 may be in use): {e}")


def start_backend() -> None:
    try:
        import torch
    except ImportError:
        pass

    from backend.app import create_app, socketio
    from backend.rl.device import get_torch_runtime_info

    app = create_app()
    print("[OK] Backend running at http://localhost:8004")
    runtime = get_torch_runtime_info()
    device_label = "CUDA" if runtime.get("device") == "cuda" else "CPU"
    extra = f" ({runtime.get('device_name')})" if runtime.get("device_name") else ""
    print(f"[OK] Torch runtime: {device_label}{extra}")

    # Safely start background warmup thread after all imports and runtime checks are done
    try:
        from backend.api.socket_handlers import _warmup_imports_and_models
        threading.Thread(target=_warmup_imports_and_models, daemon=True).start()
    except Exception as e:
        print(f"[Warning] Failed to start background warmup thread: {e}")

    socketio.run(app, host="0.0.0.0", port=8004, debug=False, allow_unsafe_werkzeug=True)


def shutil_which(command: str) -> str | None:
    from shutil import which
    return which(command)


def main() -> None:
    try:
        ensure_local_runtime()
        print("[Traffic] VeloCity starting...")
        
        # Only start frontend dev server if build folder (dist) doesn't exist
        # This allows serving the built frontend directly from Flask in production
        dist_dir = PROJECT_ROOT / "frontend" / "dist"
        if not dist_dir.exists():
            print("[Info] Frontend 'dist' folder not found. Starting frontend dev server...")
            threading.Thread(target=start_frontend, daemon=True).start()
        else:
            print("[Info] Frontend 'dist' folder found. Flask will serve frontend assets on port 8004.")
            
        start_backend()
    except BaseException as e:
        import traceback
        traceback.print_exc()
        sys.exit(2)


if __name__ == "__main__":
    main()
