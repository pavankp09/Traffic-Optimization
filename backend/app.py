"""Flask application factory for Traffic Signal Optimizer."""
try:
    import torch
except ImportError:
    pass

import os
import sys

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
    app = Flask(__name__, static_folder=dist_dir, static_url_path="")
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
    socketio.init_app(
        app,
        cors_allowed_origins=cors_allowed,
        async_mode=None,   # Auto-detect best async mode (eventlet/gevent/threading)
        allow_upgrades=True,
        logger=False,
        engineio_logger=False,
        ping_interval=25,
        ping_timeout=120,
    )
    from backend.api.socket_handlers import init_socket_handlers
    init_socket_handlers(socketio, app)

    # Serves the index.html at root, and falls back to it for SPA routing
    from flask import jsonify
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path.startswith('api/'):
            return jsonify({"success": False, "error": "Not Found"}), 404
        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return app.send_static_file(path)
        return app.send_static_file('index.html')

    return app
