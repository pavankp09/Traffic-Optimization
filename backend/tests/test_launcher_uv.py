from __future__ import annotations


def test_choose_torch_backend_prefers_cuda_on_nvidia_linux():
    from run import choose_torch_backend

    assert choose_torch_backend(platform_name="Linux", has_nvidia_gpu=True) == "cuda"


def test_choose_torch_backend_uses_cpu_on_macos():
    from run import choose_torch_backend

    assert choose_torch_backend(platform_name="Darwin", has_nvidia_gpu=True) == "cpu"


def test_filter_requirements_removes_torch_packages():
    from run import filter_requirement_lines

    lines = [
        "flask==3.0.3",
        "torch==2.3.0",
        "torchvision==0.18.0",
        "torchaudio==2.3.0",
        "numpy==1.26.4",
    ]

    assert filter_requirement_lines(lines) == [
        "flask==3.0.3",
        "numpy==1.26.4",
    ]


def test_build_uv_install_commands_puts_torch_first():
    from run import build_uv_install_commands

    cmds = build_uv_install_commands(
        venv_python="/tmp/project/.venv/bin/python",
        torch_backend="cuda",
        requirement_lines=["flask==3.0.3", "torch==2.3.0", "numpy==1.26.4"],
    )

    assert len(cmds) == 1
    assert cmds[0][:5] == ["uv", "pip", "install", "--python", "/tmp/project/.venv/bin/python"]
    assert "--link-mode=copy" in cmds[0]
    assert "--index-url" in cmds[0]
    assert "https://download.pytorch.org/whl/cu128" in cmds[0]
    assert cmds[0].index("torch") < cmds[0].index("flask==3.0.3")
    assert cmds[0].index("torchvision") < cmds[0].index("flask==3.0.3")
    assert cmds[0].index("torchaudio") < cmds[0].index("flask==3.0.3")


def test_ensure_local_runtime_bootstraps_with_uv(monkeypatch, tmp_path):
    from pathlib import Path
    import run

    venv_dir = tmp_path / ".venv"
    venv_dir.mkdir()
    (venv_dir / ".uv-bootstrap").unlink(missing_ok=True)
    (tmp_path / "backend").mkdir()
    (tmp_path / "backend" / "requirements.txt").write_text("flask==3.0.3\nnumpy==1.26.4\n", encoding="utf-8")

    commands = []

    def fake_run(cmd, **kwargs):
        commands.append(list(cmd))

        class Result:
            returncode = 0

        return Result()

    monkeypatch.setattr(run, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(run, "VENV_DIR", venv_dir)
    monkeypatch.setattr(run, "BACKEND_REQUIREMENTS", tmp_path / "backend" / "requirements.txt")
    monkeypatch.setattr(run, "venv_python_path", lambda: venv_dir / "bin" / "python")
    monkeypatch.setattr(run, "shutil_which", lambda command: "/usr/bin/uv")
    monkeypatch.setattr(run, "runtime_ready", lambda venv_python, torch_backend: False)
    monkeypatch.setattr(run, "choose_torch_backend", lambda **kwargs: "cpu")
    monkeypatch.setattr(run.subprocess, "run", fake_run)

    try:
        run.ensure_local_runtime()
    except SystemExit:
        pass

    assert commands[0][:3] == ["uv", "venv", str(venv_dir)]
    assert commands[1][:5] == ["uv", "pip", "install", "--python", str(venv_dir / "bin" / "python")]
    assert "--link-mode=copy" in commands[1]
    assert commands[2][:2] == [str(venv_dir / "bin" / "python"), str(run.Path(run.__file__).resolve())]


def test_ensure_local_runtime_skips_when_backend_marker_is_ready(monkeypatch, tmp_path):
    import run

    venv_dir = tmp_path / ".venv"
    venv_dir.mkdir()
    python_path = venv_dir / "Scripts" / "python.exe"
    python_path.parent.mkdir(parents=True, exist_ok=True)
    python_path.write_text("", encoding="utf-8")
    (venv_dir / ".uv-backend").write_text("cpu\n", encoding="utf-8")

    commands = []

    def fake_run(cmd, **kwargs):
        commands.append(list(cmd))
        raise AssertionError("bootstrap should not reinstall when backend marker is ready")

    monkeypatch.setattr(run, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(run, "VENV_DIR", venv_dir)
    monkeypatch.setattr(run, "venv_python_path", lambda: python_path)
    monkeypatch.setattr(run, "shutil_which", lambda command: "/usr/bin/uv")
    monkeypatch.setattr(run, "choose_torch_backend", lambda **kwargs: "cpu")
    monkeypatch.setattr(run, "read_backend_marker", lambda: "cpu")
    monkeypatch.setattr(run, "runtime_ready", lambda venv_python, torch_backend: True)
    monkeypatch.setattr(run, "in_project_venv", lambda: True)
    monkeypatch.setattr(run.subprocess, "run", fake_run)

    run.ensure_local_runtime()

    assert commands == []


def test_baseline_policy_loader_skips_model_load():
    import backend.api.socket_handlers as handlers

    assert handlers._load_rl_policy("baseline") is None


def test_main_does_not_require_eventlet(monkeypatch):
    import run
    import builtins

    monkeypatch.setattr(run, "ensure_local_runtime", lambda: None)
    monkeypatch.setattr(run, "start_frontend", lambda: None)
    monkeypatch.setattr(run, "start_backend", lambda: None)
    monkeypatch.setattr(run.time, "sleep", lambda *_: None)

    created = []

    class DummyThread:
        def __init__(self, target, daemon):
            created.append(daemon)

        def start(self):
            return None

    monkeypatch.setattr(run.threading, "Thread", DummyThread)
    original_import = builtins.__import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "eventlet":
            raise AssertionError("eventlet should not be imported by run.main()")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", guarded_import)

    run.main()

    assert created == [True]
