"""
U-turn intersection mock simulation world subclass.
"""
from __future__ import annotations

import logging
from backend.services.simulation.mock.mock_four_way import FourWaySimWorld

logger = logging.getLogger(__name__)


class UTurnSimWorld(FourWaySimWorld):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Ensure u_turn_phase is True in this simulation world
        self.u_turn_phase = True
