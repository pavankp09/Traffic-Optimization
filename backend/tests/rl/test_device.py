from __future__ import annotations


def test_get_torch_device_uses_cuda_when_available(monkeypatch):
    """Device helper should choose CUDA when PyTorch exposes a CUDA device."""
    import torch
    from backend.rl.device import get_torch_device

    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    monkeypatch.setattr(torch.cuda, "device_count", lambda: 1)
    monkeypatch.setattr(torch.cuda, "get_device_name", lambda index: "Test GPU")

    assert get_torch_device() == "cuda"


def test_get_torch_device_falls_back_to_cpu(monkeypatch):
    """CPU is the safe fallback when CUDA is unavailable."""
    import torch
    from backend.rl.device import get_torch_device

    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)

    assert get_torch_device() == "cpu"
