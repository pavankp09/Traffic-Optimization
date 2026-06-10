"""
YOLOv8 vehicle detector + ByteTrack tracker stub.
Full implementation requires: pip install ultralytics supervision
Set enable_rtsp=True in SimulationConfig to activate live camera mode.
"""
from __future__ import annotations
import logging

logger = logging.getLogger(__name__)


class VehicleDetector:
    """
    RTSP camera → YOLOv8n detection → ByteTrack tracking → per-arm lane counts.

    Usage (when SUMO sim runs in RTSP mode)::

        detector = VehicleDetector(rtsp_url="rtsp://user:pass@ip/stream", confidence=0.5)
        detector.start()
        while running:
            counts = detector.get_lane_counts()   # {"N": 12, "S": 8, "E": 5, "W": 9}
            demand_gen.update_from_vision(counts)
            time.sleep(1.0)
        detector.stop()
    """

    SUPPORTED_CLASSES = [
        "car", "motorcycle", "bus", "truck",
        "bicycle", "auto_rickshaw", "e_rickshaw",
    ]

    def __init__(
        self,
        rtsp_url: str,
        confidence: float = 0.5,
        model_path: str = "yolov8n.pt",
        lane_roi: dict | None = None,
    ) -> None:
        self.rtsp_url = rtsp_url
        self.confidence = confidence
        self.model_path = model_path
        self.lane_roi = lane_roi or {}
        self._running = False
        self._lane_counts: dict[str, int] = {}
        self._thread = None

    def start(self) -> None:
        """Start capture and detection loop in background thread."""
        try:
            from ultralytics import YOLO  # noqa: F401
        except ImportError:
            raise RuntimeError(
                "ultralytics not installed. Run: pip install ultralytics supervision"
            )
        self._running = True
        import threading
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("VehicleDetector started for %s", self.rtsp_url)

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=3.0)

    def get_lane_counts(self) -> dict[str, int]:
        """Returns {arm: count} for DemandGenerator.update_from_vision()."""
        return dict(self._lane_counts)

    def _loop(self) -> None:  # pragma: no cover
        """Main detection loop — runs in background thread."""
        import cv2
        from ultralytics import YOLO
        model = YOLO(self.model_path)
        cap = cv2.VideoCapture(self.rtsp_url)
        while self._running and cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            results = model(frame, conf=self.confidence, verbose=False)
            counts: dict[str, int] = {"N": 0, "S": 0, "E": 0, "W": 0}
            for box in results[0].boxes:
                cx = float(box.xywh[0][0])
                cy = float(box.xywh[0][1])
                arm = self._assign_arm(cx, cy, frame.shape)
                if arm:
                    counts[arm] = counts.get(arm, 0) + 1
            self._lane_counts = counts
        cap.release()

    @staticmethod
    def _assign_arm(cx: float, cy: float, shape: tuple) -> str | None:
        """Map pixel centroid to N/S/E/W arm based on image quadrant."""
        h, w = shape[:2]
        mid_x, mid_y = w / 2, h / 2
        if abs(cx - mid_x) < w * 0.15 and abs(cy - mid_y) < h * 0.15:
            return None  # inside intersection box — skip
        if cy < mid_y and abs(cx - mid_x) < abs(cy - mid_y):
            return "N"
        if cy > mid_y and abs(cx - mid_x) < abs(cy - mid_y):
            return "S"
        if cx > mid_x:
            return "E"
        return "W"
