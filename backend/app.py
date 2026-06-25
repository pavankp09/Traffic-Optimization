"""Flask application factory for Traffic Signal Optimizer."""
try:
    import os
    os.environ["EVENTLET_NO_GREENDNS"] = "yes"
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

# Comprehensive Diagnostics for systemd network/env troubleshooting
try:
    import socket
    import urllib.request
    import logging
    import os
    import sys
    import platform
    import subprocess

    diag_logger = logging.getLogger("systemd_diagnostics")
    diag_logger.setLevel(logging.INFO)
    sh = logging.StreamHandler(sys.stderr)
    sh.setFormatter(logging.Formatter("[DIAGNOSTIC] %(message)s"))
    diag_logger.addHandler(sh)

    diag_logger.info("==================================================")
    diag_logger.info("=== START COMPREHENSIVE SYSTEMD DIAGNOSTICS ===")
    diag_logger.info("==================================================")

    # 1. OS & Python Info
    diag_logger.info("--- OS & Python Info ---")
    diag_logger.info("Platform: %s", platform.platform())
    diag_logger.info("Python Executable: %s", sys.executable)
    diag_logger.info("Python Version: %s", sys.version)
    diag_logger.info("Current Working Directory: %s", os.getcwd())

    # 2. User & UID
    diag_logger.info("--- User & Process Info ---")
    try:
        diag_logger.info("UID/GID: %s / %s", os.getuid(), os.getgid())
        import pwd
        diag_logger.info("Effective User: %s", pwd.getpwuid(os.getuid()).pw_name)
    except Exception as e:
        diag_logger.info("Process User Info: %s", e)

    # 3. SELinux & AppArmor
    diag_logger.info("--- SELinux & AppArmor Info ---")
    # SELinux
    try:
        if os.path.exists("/sys/fs/selinux/enforce"):
            with open("/sys/fs/selinux/enforce", "r") as f:
                val = f.read().strip()
                diag_logger.info("SELinux Mode (sysfs): %s", "Enforcing" if val == "1" else "Permissive/Disabled")
        else:
            try:
                out = subprocess.check_output(["/usr/sbin/getenforce"], text=True).strip()
                diag_logger.info("SELinux Mode (getenforce): %s", out)
            except Exception:
                diag_logger.info("SELinux: Not active or files missing")
    except Exception as e:
        diag_logger.error("SELinux check error: %s", e)

    # AppArmor
    try:
        if os.path.exists("/sys/kernel/security/apparmor"):
            diag_logger.info("AppArmor: Active")
        else:
            diag_logger.info("AppArmor: Not active")
    except Exception as e:
        diag_logger.info("AppArmor check error: %s", e)

    # 4. Environment Variables
    diag_logger.info("--- Environment Variables ---")
    for k, v in os.environ.items():
        kl = k.lower()
        if any(x in kl for x in ["proxy", "http", "aws", "token", "region", "path"]):
            # Mask secrets
            val = v
            if any(x in kl for x in ["token", "secret", "key"]) and len(v) > 6:
                val = v[:6] + "..."
            elif any(x in kl for x in ["token", "secret", "key"]):
                val = "..."
            diag_logger.info("  %s = %s", k, val)

    # 5. Proxy Configuration
    diag_logger.info("--- Proxy Settings (urllib) ---")
    try:
        diag_logger.info("Proxies detected by urllib: %s", urllib.request.getproxies())
    except Exception as e:
        diag_logger.error("Failed to query urllib proxies: %s", e)

    # 6. Read /etc/resolv.conf and DNS configurations
    diag_logger.info("--- DNS Nameservers (/etc/resolv.conf) ---")
    resolv_path = "/etc/resolv.conf"
    nameservers = []
    if os.path.exists(resolv_path):
        try:
            with open(resolv_path, "r") as f:
                content = f.read()
            diag_logger.info("Contents of %s:\n%s", resolv_path, content)
            
            # Extract nameservers
            for line in content.splitlines():
                if line.strip().startswith("nameserver"):
                    parts = line.split()
                    if len(parts) > 1:
                        nameservers.append(parts[1])
        except Exception as e:
            diag_logger.error("Failed to read %s: %s", resolv_path, e)
    else:
        diag_logger.warning("%s does not exist", resolv_path)

    # 7. Network Connectivity Tests
    diag_logger.info("--- Network Connectivity Tests ---")
    
    # Test direct IP ping/connection (1.1.1.1 / 8.8.8.8) to check if routing works
    test_ips = [("1.1.1.1", 53), ("1.1.1.1", 443), ("8.8.8.8", 53)]
    for ip, port in test_ips:
        diag_logger.info("Testing TCP Connection to IP %s:%s...", ip, port)
        try:
            s = socket.create_connection((ip, port), timeout=3)
            diag_logger.info("  SUCCESS: Connected to %s:%s!", ip, port)
            s.close()
        except Exception as e:
            diag_logger.error("  FAILED: TCP connection to %s:%s: %s", ip, port, e)

    # Test UDP connectivity to nameservers
    for ns in nameservers:
        diag_logger.info("Testing UDP socket to DNS nameserver %s:53...", ns)
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(3)
            sock.connect((ns, 53))
            diag_logger.info("  SUCCESS: UDP socket connect to %s:53 succeeded", ns)
            sock.send(b"\x00")
            diag_logger.info("  SUCCESS: Sent payload byte to %s:53", ns)
            sock.close()
        except Exception as e:
            diag_logger.error("  FAILED: UDP socket test to %s:53: %s", ns, e)

    # 8. DNS Resolution Tests
    diag_logger.info("--- DNS Resolution Tests ---")
    hosts_to_resolve = [
        "google.com", 
        "bedrock-runtime.us-east-1.amazonaws.com"
    ]
    for h in hosts_to_resolve:
        diag_logger.info("Resolving host: %s...", h)
        try:
            ips = socket.getaddrinfo(h, 443, proto=socket.IPPROTO_TCP)
            resolved_ips = list(set([ip[4][0] for ip in ips]))
            diag_logger.info("  SUCCESS: Resolved %s to %s", h, resolved_ips)
        except Exception as e:
            diag_logger.error("  FAILED to resolve %s: %s", h, e)

    # 9. HTTPS Request Tests
    diag_logger.info("--- HTTPS Request Tests ---")
    test_urls = [
        "https://www.google.com",
        "https://bedrock-runtime.us-east-1.amazonaws.com"
    ]
    for u in test_urls:
        diag_logger.info("Sending HEAD request to %s...", u)
        try:
            req = urllib.request.Request(u, method="HEAD")
            with urllib.request.urlopen(req, timeout=3) as response:
                diag_logger.info("  SUCCESS: Status Code: %s", response.status)
        except Exception as e:
            diag_logger.error("  FAILED: HEAD request to %s: %s", u, e)

    # 10. boto3 Client test
    diag_logger.info("--- Boto3 Client Initialization Test ---")
    try:
        import boto3
        region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
        diag_logger.info("Attempting to construct boto3 bedrock-runtime client (region=%s)...", region)
        client = boto3.client("bedrock-runtime", region_name=region)
        diag_logger.info("  SUCCESS: constructed client of type: %s", type(client))
        diag_logger.info("  Active credentials provider: %s", client.meta.events)
    except Exception as e:
        diag_logger.error("  FAILED to init boto3 client: %s", e)

    diag_logger.info("==================================================")
    diag_logger.info("=== END COMPREHENSIVE SYSTEMD DIAGNOSTICS ===")
    diag_logger.info("==================================================")
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
