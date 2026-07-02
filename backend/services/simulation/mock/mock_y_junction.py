"""
Y-junction intersection mock simulation world subclass.
"""
from __future__ import annotations

import logging
from backend.services.simulation.mock.mock_common import _SimWorld

logger = logging.getLogger(__name__)


class YJunctionSimWorld(_SimWorld):
    def _setup_phases(self):
        super()._setup_phases()
        self.is_protected_right = False
        # Y-junction has N, E, W arms
        self.phase_green_map = {
            0: {"N"},
            1: set(),
            2: {"E", "W"},
            3: set(),
            4: set(),
        }
