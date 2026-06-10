"""Flask application factory for Traffic Signal Optimizer."""
import os
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

    app = Flask(__name__)
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
    _db_engine = create_engine(db_url, echo=False)
    Base.metadata.create_all(_db_engine)
    _SessionLocal = sessionmaker(bind=_db_engine)

    # Blueprints
    from backend.api.routes import api_bp, _reset_store
    _reset_store()  # reset SessionStore singleton so it picks up new DB URL
    app.register_blueprint(api_bp, url_prefix="/api")

    # Socket.IO
    # ping_timeout=120: browsers throttle JS timers to 1Hz when minimized.
    # Default 60s timeout causes disconnect on minimize. 120s survives any
    # minimize-restore cycle without dropping the WebSocket connection.
    socketio.init_app(
        app,
        cors_allowed_origins=cors_origins,
        async_mode=None,   # Auto-detect best async mode (eventlet/gevent/threading)
        logger=False,
        engineio_logger=False,
        ping_interval=25,
        ping_timeout=120,
    )
    from backend.api.socket_handlers import init_socket_handlers
    init_socket_handlers(socketio, app)

    return app
