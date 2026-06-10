import warnings

warnings.filterwarnings("ignore")

import eventlet

eventlet.monkey_patch()

import os
import subprocess
import sys
import threading
import time

# Ensure backend package is importable from project root
sys.path.insert(0, os.path.dirname(__file__))


BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8004"))
FRONTEND_HOST = os.getenv("FRONTEND_HOST", "0.0.0.0")
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "8005"))


def start_frontend():
    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    subprocess.run([npm, "install", "--silent"], cwd=frontend_dir, check=True)
    subprocess.run(
        [
            npm,
            "run",
            "dev",
            "--",
            "--host",
            FRONTEND_HOST,
            "--port",
            str(FRONTEND_PORT),
            "--strictPort",
        ],
        cwd=frontend_dir,
        check=True,
    )


def start_backend():
    from backend.app import create_app, socketio

    app = create_app()
    print(f"[OK] Backend running at http://{BACKEND_HOST}:{BACKEND_PORT}")
    # eventlet mode - WebSocket handled natively with zero warnings
    socketio.run(app, host=BACKEND_HOST, port=BACKEND_PORT, debug=False)


if __name__ == "__main__":
    print("[Traffic] Traffic Signal Optimizer starting...")

    fe_thread = threading.Thread(target=start_frontend, daemon=True)
    fe_thread.start()

    time.sleep(1)  # give frontend thread time to start npm install
    start_backend()
