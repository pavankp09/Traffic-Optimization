import warnings
warnings.filterwarnings("ignore")

import eventlet
eventlet.monkey_patch()

import os
import sys
import subprocess
import threading
import time

# Ensure backend package is importable from project root
sys.path.insert(0, os.path.dirname(__file__))


def start_frontend():
    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    subprocess.run([npm, "install", "--silent"], cwd=frontend_dir, check=True)
    subprocess.run([npm, "run", "dev"], cwd=frontend_dir)


def start_backend():
    from backend.app import create_app, socketio

    app = create_app()
    print("[OK] Backend running at http://localhost:5050")
    # eventlet mode — WebSocket handled natively with zero warnings
    socketio.run(app, host="0.0.0.0", port=5050, debug=False)


if __name__ == "__main__":
    print("[Traffic] Traffic Signal Optimizer starting...")

    fe_thread = threading.Thread(target=start_frontend, daemon=True)
    fe_thread.start()

    time.sleep(1)  # give frontend thread time to start npm install
    start_backend()
