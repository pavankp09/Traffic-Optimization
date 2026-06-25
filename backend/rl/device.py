import logging
import threading

logger = logging.getLogger(__name__)

# Global reentrant lock to serialize PyTorch CUDA initialization and operations on Windows
# to prevent concurrent thread-import/CUDA-context collisions that cause segfaults.
cuda_lock = threading.RLock()


def get_torch_device(prefer_gpu: bool = True) -> str:
    """Return "cuda" when PyTorch can use a CUDA GPU, otherwise "cpu"."""
    with cuda_lock:
        if not prefer_gpu:
            return "cpu"

        try:
            import torch

            if torch.cuda.is_available() and torch.cuda.device_count() > 0:
                try:
                    logger.info("Using CUDA device for RL: %s", torch.cuda.get_device_name(0))
                except Exception:
                    logger.info("Using CUDA device for RL")
                return "cuda"
        except Exception as exc:
            logger.debug("Torch CUDA check failed; using CPU: %s", exc)

        logger.info("Using CPU device for RL")
        return "cpu"


def get_torch_runtime_info(prefer_gpu: bool = True) -> dict[str, str | bool | None]:
    """Return a compact description of the local torch runtime.

    This is used by the websocket handshake so the frontend can show whether
    the app booted with CPU-only or CUDA-enabled PyTorch.
    """
    with cuda_lock:
        info: dict[str, str | bool | None] = {
            "device": "cpu",
            "cuda_available": False,
            "torch_version": None,
            "cuda_version": None,
            "device_name": None,
        }

        try:
            import torch

            info["torch_version"] = getattr(torch, "__version__", None)
            info["cuda_version"] = getattr(torch.version, "cuda", None)
            if prefer_gpu and torch.cuda.is_available() and torch.cuda.device_count() > 0:
                info["device"] = "cuda"
                info["cuda_available"] = True
                try:
                    info["device_name"] = torch.cuda.get_device_name(0)
                except Exception:
                    info["device_name"] = "CUDA device"
                return info
        except Exception as exc:
            logger.debug("Torch runtime inspection failed; defaulting to CPU: %s", exc)

        return info

