"""Flask application factory for Traffic Signal Optimizer."""
try:
    import eventlet
    eventlet.monkey_patch()
    _has_eventlet = True
except ImportError:
    _has_eventlet = False

try:
    import torch
except ImportError:
    pass

import os
import sys

# Try to load environment variables from .env in the project root directory
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

# Diagnostics for systemd network/env troubleshooting
try:
    import socket
    import urllib.request
    import logging

    diag_logger = logging.getLogger("systemd_diagnostics")
    diag_logger.setLevel(logging.INFO)
    sh = logging.StreamHandler(sys.stderr)
    sh.setFormatter(logging.Formatter("[DIAGNOSTIC] %(message)s"))
    diag_logger.addHandler(sh)

    diag_logger.info("=== Systemd Service Diagnostics ===")
    diag_logger.info("Current Working Directory: %s", os.getcwd())
    diag_logger.info("Python Executable: %s", sys.executable)
    diag_logger.info("Environment variables containing proxy/http/aws/token/region:")
    for k, v in os.environ.items():
        kl = k.lower()
        if any(x in kl for x in ["proxy", "http", "aws", "token", "region"]):
            # Mask secrets
            val = v
            if any(x in kl for x in ["token", "secret", "key"]):
                val = v[:6] + "..." if len(v) > 6 else "..."
            diag_logger.info("  %s = %s", k, val)

    # Test DNS Resolution
    host = "bedrock-runtime.us-east-1.amazonaws.com"
    diag_logger.info("Testing DNS Resolution for %s...", host)
    try:
        ip = socket.gethostbyname(host)
        diag_logger.info("  DNS Success! Resolved %s to %s", host, ip)
    except Exception as e:
        diag_logger.error("  DNS Failed: %s", e)

    # Test TCP Connection
    diag_logger.info("Testing TCP Connection to %s:443...", host)
    try:
        s = socket.create_connection((host, 443), timeout=5)
        diag_logger.info("  TCP Connection Success!")
        s.close()
    except Exception as e:
        diag_logger.error("  TCP Connection Failed: %s", e)

    # Test HTTP Request via urllib
    url = f"https://{host}/"
    diag_logger.info("Testing HTTPS Request to %s...", url)
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=5) as response:
            diag_logger.info("  HTTPS Request Success! HTTP Status Code: %s", response.status)
    except Exception as e:
        diag_logger.error("  HTTPS Request Failed: %s", e)
    diag_logger.info("=== End of Systemd Diagnostics ===")
except Exception as diag_err:
    print(f"[DIAGNOSTIC ERROR] Failed to run diagnostics: {diag_err}", file=sys.stderr)


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

from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.config import APP_CONFIG
from backend.db.models import Base

socketio = SocketIO()
_db_engine = None
_SessionLocal = None


def get_db():
    """Return a new SQLAlchemy session."""
    global _SessionLocal
    if _SessionLocal is None:
        raise RuntimeError("App not initialised — call create_app() first")
    return _SessionLocal()


def create_app(config=None) -> Flask:
    global _db_engine, _SessionLocal

    # Silence Werkzeug HTTP request logs (keep only errors)
    import logging
    logging.getLogger("werkzeug").setLevel(logging.ERROR)

    # Locate the frontend dist directory relative to the backend app directory
    dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
    app = Flask(__name__, static_folder=None)
    app.config["SECRET_KEY"] = APP_CONFIG.secret_key

    # Support passing a plain dict for testing
    if isinstance(config, dict):
        app.config.update(config)
        db_url = config.get(
            "SQLALCHEMY_DATABASE_URI",
            config.get("database_url", APP_CONFIG.database_url),
        )
        cors_origins = config.get("cors_origins", APP_CONFIG.cors_origins)
    else:
        cfg = config or APP_CONFIG
        db_url = cfg.database_url
        cors_origins = cfg.cors_origins

    CORS(app, origins=cors_origins)

    # Database
    from backend.db.models import init_db
    _db_engine = init_db(db_url)
    _SessionLocal = sessionmaker(bind=_db_engine)

    # Blueprints
    from backend.api.routes import api_bp, _reset_store
    _reset_store()  # reset SessionStore singleton so it picks up new DB URL
    app.register_blueprint(api_bp, url_prefix="/api")

    # Road Optimizer blueprint
    from backend.optimizer.optimizer_routes import optimizer_bp
    app.register_blueprint(optimizer_bp)

    # Socket.IO
    # ping_timeout=120: browsers throttle JS timers to 1Hz when minimized.
    # Default 60s timeout causes disconnect on minimize. 120s survives any
    # minimize-restore cycle without dropping the WebSocket connection.
    cors_allowed = cors_origins
    if "*" in cors_origins:
        cors_allowed = "*"
    async_mode = "eventlet" if _has_eventlet else "threading"
    socketio.init_app(
        app,
        cors_allowed_origins=cors_allowed,
        async_mode=async_mode,
        allow_upgrades=True,
        logger=False,
        engineio_logger=False,
        ping_interval=25,
        ping_timeout=120,
    )
    from backend.api.socket_handlers import init_socket_handlers
    init_socket_handlers(socketio, app)

    # Serves the index.html at root, and falls back to it for SPA routing
    from flask import jsonify, send_from_directory
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path.startswith('api/'):
            return jsonify({"success": False, "error": "Not Found"}), 404
        # Serve static file if it exists in dist
        file_path = os.path.join(dist_dir, path)
        if path != "" and os.path.exists(file_path) and os.path.isfile(file_path):
            return send_from_directory(dist_dir, path)
        return send_from_directory(dist_dir, 'index.html')

    return app
