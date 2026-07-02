"""
Six-arm intersection mock simulation world subclass.
"""
from __future__ import annotations

import logging
from backend.services.simulation.mock.mock_common import _SimWorld

logger = logging.getLogger(__name__)


class SixArmSimWorld(_SimWorld):
    def _setup_phases(self):
        super()._setup_phases()
        self.is_protected_right = False
