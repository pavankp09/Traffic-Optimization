"""
Four-way intersection mock simulation world subclass.
"""
from __future__ import annotations

import math
import random
import logging
from backend.services.simulation.mock.mock_common import _SimWorld

logger = logging.getLogger(__name__)


class FourWaySimWorld(_SimWorld):
    def _setup_phases(self):
        self.is_protected_right = self.intersection_type in (
            "four_way_protected_right", "four_way_arrow", "four_way", "4way_cross"
        )
        if self.is_protected_right:
            self.phase_durations_list = [25.0, 4.0, 10.0, 4.0, 25.0, 4.0, 10.0, 4.0, 2.0]
            self.phase_green_map = {
                0: {"N_straight", "N_left", "S_straight", "S_left"},
                1: set(),
                2: {"N_right", "N_uturn", "S_right", "S_uturn"},
                3: set(),
                4: {"E_straight", "E_left", "W_straight", "W_left"},
                5: set(),
                6: {"E_right", "E_uturn", "W_right", "W_uturn"},
                7: set(),
                8: set(),
            }
        else:
            self.phase_durations_list = [28.0, 4.0, 28.0, 4.0, 2.0]
            self.phase_green_map = {
                0: {"N", "S"},
                1: set(),
                2: {"E", "W"},
                3: set(),
                4: set(),
            }

    def _get_green_movements(self) -> set:
        if self.is_protected_right:
            return self.phase_green_map.get(self.phase, set())
        from backend.services.simulation.mock.mock_common import _PHASE_GREEN
        return _PHASE_GREEN.get(self.phase, set())

    def _get_protected_subphases(self, axis: str, total_duration: float) -> list[tuple[int, float]]:
        def _get_demand(w, arm: str, turn_dirs: set[str]) -> int:
            n = 0
            for v in w.vehicles:
                if v.arm == arm and not v.through and v.turn_dir in turn_dirs:
                    d = math.hypot(v.x, v.y)
                    if d < 30.0:
                        n += 1
            return n

        if axis == "NS":
            sl_demand = _get_demand(self, "N", {"straight", "left"}) + _get_demand(self, "S", {"straight", "left"})
            r_demand = _get_demand(self, "N", {"right", "uturn", "mid_uturn"}) + _get_demand(self, "S", {"right", "uturn", "mid_uturn"})
            green_sl, green_r = 0, 2
            yellow_sl, yellow_r = 1, 3
        else:  # EW
            sl_demand = _get_demand(self, "E", {"straight", "left"}) + _get_demand(self, "W", {"straight", "left"})
            r_demand = _get_demand(self, "E", {"right", "uturn", "mid_uturn"}) + _get_demand(self, "W", {"right", "uturn", "mid_uturn"})
            green_sl, green_r = 4, 6
            yellow_sl, yellow_r = 5, 7

        if r_demand > 0:
            t_r = 10.0
            if sl_demand > 0:
                t_sl = max(5.0, total_duration - 10.0)
            else:
                t_sl = 0.0
        else:
            t_r = 0.0
            t_sl = max(5.0, total_duration)

        seq = []
        if t_sl > 0.0:
            seq.append((green_sl, t_sl))
            seq.append((yellow_sl, 4.0))
        if t_r > 0.0:
            seq.append((green_r, t_r))
            seq.append((yellow_r, 4.0))

        if not seq:
            seq.append((green_sl, total_duration))
            seq.append((yellow_sl, 4.0))

        return seq

    def _apply_red_runners(self) -> None:
        from backend.services.simulation.mock.mock_common import _RED_RUN_PROB, _PHASE_GREEN
        if self.is_protected_right:
            green_movements = self.phase_green_map.get(self.phase, set())
            for v in self.vehicles:
                if not v.through and not v.turning:
                    v_move_key = f"{v.arm}_{v.turn_dir}"
                    is_allowed = v.arm in green_movements or v_move_key in green_movements
                    if not is_allowed:
                        v.red_runner = random.random() < _RED_RUN_PROB.get(v.type_id, 0.0)
                    else:
                        v.red_runner = False
        else:
            if self.phase in (0, 2):
                for v in self.vehicles:
                    if not v.through and v.arm not in _PHASE_GREEN.get(self.phase, set()):
                        v.red_runner = random.random() < _RED_RUN_PROB.get(v.type_id, 0.0)
                    else:
                        v.red_runner = False

    def _check_early_termination(self) -> None:
        if (not self.fixed_time and not self.is_protected_right and self.replay_decisions is None and self.phase in (0, 2)
                and self.phase_elapsed >= self.min_green):
            from backend.services.simulation.mock.mock_common import _PHASE_GREEN
            green_arms = _PHASE_GREEN[self.phase]
            red_arms = {"E", "W"} if self.phase == 0 else {"N", "S"}
            green_q = sum(self._queued(a) for a in green_arms)
            red_q = sum(self._queued(a) for a in red_arms)
            if green_q == 0 and red_q > 0:
                self._decide_next()
                self.phase_elapsed = 0.0

    def _original_decide_next(self) -> None:
        if getattr(self, "phase_queue", None):
            self.phase, self.cur_duration = self.phase_queue.pop(0)
            self._apply_red_runners()
            return

        green_phases = {0, 2, 4, 6} if self.is_protected_right else {0, 2}
        if self.phase in green_phases:
            self.phase = self.phase + 1
            self.cur_duration = 4.0
            self._apply_red_runners()
            return

        if self.replay_decisions is not None:
            idx = getattr(self, "replay_idx", 0)
            if idx < len(self.replay_decisions):
                d = self.replay_decisions[idx]
                mock_phase = d["action"]["phase"]
                duration = d["action"]["duration_s"]
                setattr(self, "replay_idx", idx + 1)
                
                if self.is_protected_right:
                    if mock_phase == 0:
                        seq = self._get_protected_subphases("NS", duration)
                    elif mock_phase == 1:
                        seq = self._get_protected_subphases("EW", duration)
                    elif mock_phase in (2, 3):
                        ns = self._queued("N") + self._queued("S")
                        ew = self._queued("E") + self._queued("W")
                        axis = "NS" if ns >= ew else "EW"
                        seq = self._get_protected_subphases(axis, duration)
                    else:
                        seq = [(8, duration)]
                    
                    self.phase, self.cur_duration = seq.pop(0)
                    self.phase_queue = seq
                else:
                    if mock_phase == 0:
                        self.phase = 0
                    elif mock_phase == 1:
                        self.phase = 2
                    elif mock_phase in (2, 3):
                        ns = self._queued("N") + self._queued("S")
                        ew = self._queued("E") + self._queued("W")
                        self.phase = 0 if ns >= ew else 2
                    else:
                        self.phase = 4
                    self.cur_duration = float(duration)
            else:
                self.replay_finished = True
            self._apply_red_runners()
            return

        if self.fixed_time:
            self.phase = (self.phase + 1) % len(self.phase_durations_list)
            self.cur_duration = self.phase_durations_list[self.phase]
            self._apply_red_runners()
            return

        if self.policy_fn is not None:
            try:
                mock_phase, next_dur = self.policy_fn(self)
                duration = float(max(self.min_green, min(self.max_green, next_dur)))
                
                if self.is_protected_right:
                    if mock_phase == 0:
                        seq = self._get_protected_subphases("NS", duration)
                    elif mock_phase == 1:
                        seq = self._get_protected_subphases("EW", duration)
                    elif mock_phase in (2, 3):
                        ns = self._queued("N") + self._queued("S")
                        ew = self._queued("E") + self._queued("W")
                        axis = "NS" if ns >= ew else "EW"
                        seq = self._get_protected_subphases(axis, duration)
                    else:
                        seq = [(8, duration)]
                    
                    self.phase, self.cur_duration = seq.pop(0)
                    self.phase_queue = seq
                else:
                    if mock_phase == 0:
                        self.phase = 0
                    elif mock_phase == 1:
                        self.phase = 2
                    elif mock_phase in (2, 3):
                        ns = self._queued("N") + self._queued("S")
                        ew = self._queued("E") + self._queued("W")
                        self.phase = 0 if ns >= ew else 2
                    else:
                        self.phase = 4
                    self.cur_duration = duration
                
                self._apply_red_runners()
                return
            except Exception as exc:
                logger.warning("RL policy_fn failed (%s) — falling back to heuristic", exc)

        self._run_heuristic()
        self._apply_red_runners()

    def _run_heuristic(self) -> None:
        if self.is_protected_right:
            ns = self._queued("N") + self._queued("S")
            ew = self._queued("E") + self._queued("W")
            axis = "NS" if ns >= ew else "EW"
            seq = self._get_protected_subphases(axis, self.max_green)
            self.phase, self.cur_duration = seq.pop(0)
            self.phase_queue = seq
        else:
            super()._run_heuristic()
