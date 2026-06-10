"""
SUMO microsimulation environment wrapper.
Manages TraCI lifecycle: start, step, stop, reset.
Runs SUMO headless via subprocess + TraCI socket connection.
"""
import os
import sys
import subprocess
import time
from typing import Optional, Dict, Any, List
from dataclasses import dataclass


def _find_sumo_home() -> str:
    """Locate SUMO installation from env or common paths."""
    if "SUMO_HOME" in os.environ:
        return os.environ["SUMO_HOME"]
    candidates = [
        r"C:\Program Files (x86)\Eclipse\Sumo",
        r"C:\Program Files\Eclipse\Sumo",
        "/usr/share/sumo",
        "/opt/homebrew/opt/sumo/share/sumo",
        "/usr/local/share/sumo",
    ]
    for path in candidates:
        if os.path.isdir(path):
            return path
    raise EnvironmentError(
        "SUMO_HOME not found. Install SUMO 1.18 and set SUMO_HOME environment variable."
    )


@dataclass
class VehicleState:
    vehicle_id: str
    type_id: str
    x: float
    y: float
    angle: float        # degrees, 0=north
    speed: float        # m/s
    lane_id: str
    arm: str            # N|S|E|W|intersection
    waiting: bool
    wait_time: float    # seconds


@dataclass
class SignalState:
    junction_id: str
    phase_index: int
    phase_duration: float   # seconds remaining
    state_string: str       # SUMO signal state string e.g. "GGGrrrGGGrrr"


@dataclass
class SimFrame:
    step: int
    sim_time: float
    vehicles: List[VehicleState]
    signals: List[SignalState]
    queue_per_lane: Dict[str, int]      # lane_id -> queue count
    wait_per_lane: Dict[str, float]     # lane_id -> avg wait seconds
    throughput_this_step: int
    collision_ids: List[str]            # vehicle IDs involved in collisions


class SumoEnv:
    """
    Wraps SUMO + TraCI for the RL training loop.

    Usage:
        env = SumoEnv(net_file, rou_file, step_length=0.5)
        env.start()
        frame = env.step()
        env.stop()
    """

    def __init__(
        self,
        net_file: str,
        rou_file: str,
        step_length: float = 0.5,
        sim_speed_multiplier: int = 10,
        junction_id: str = "center",
        gui: bool = False,
        seed: int = 42,
    ):
        self.net_file = net_file
        self.rou_file = rou_file
        self.step_length = step_length
        self.sim_speed_multiplier = sim_speed_multiplier
        self.junction_id = junction_id
        self.gui = gui
        self.seed = seed

        self._sumo_home: Optional[str] = None
        self._traci = None
        self._process: Optional[subprocess.Popen] = None
        self._step_count: int = 0
        self._prev_departed: int = 0

    def start(self, port: int = 8813) -> None:
        """Launch SUMO process and connect TraCI."""
        self._sumo_home = _find_sumo_home()
        tools_path = os.path.join(self._sumo_home, "tools")
        if tools_path not in sys.path:
            sys.path.insert(0, tools_path)

        import traci
        self._traci = traci

        binary = "sumo-gui" if self.gui else "sumo"
        if sys.platform == "win32":
            binary += ".exe"
        sumo_bin = os.path.join(self._sumo_home, "bin", binary)
        if not os.path.isfile(sumo_bin):
            sumo_bin = binary  # fallback to PATH

        cmd = [
            sumo_bin,
            "--net-file", self.net_file,
            "--route-files", self.rou_file,
            "--step-length", str(self.step_length),
            "--no-warnings", "true",
            "--no-step-log", "true",
            "--collision.action", "warn",
            "--seed", str(self.seed),
            "--remote-port", str(port),
        ]
        if not self.gui:
            cmd += ["--no-internal-links", "false"]

        self._process = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        time.sleep(0.5)
        traci.init(port=port)
        self._step_count = 0
        self._prev_departed = 0

    def step(self) -> SimFrame:
        """Advance simulation by one step_length and return frame."""
        traci = self._traci
        traci.simulationStep()
        self._step_count += 1

        vehicles = []
        queue_per_lane: Dict[str, int] = {}
        wait_per_lane: Dict[str, float] = {}

        for vid in traci.vehicle.getIDList():
            vtype = traci.vehicle.getTypeID(vid)
            x, y = traci.vehicle.getPosition(vid)
            angle = traci.vehicle.getAngle(vid)
            speed = traci.vehicle.getSpeed(vid)
            lane_id = traci.vehicle.getLaneID(vid)
            wait_time = traci.vehicle.getAccumulatedWaitingTime(vid)
            waiting = speed < 0.1

            arm = self._lane_to_arm(lane_id)
            vehicles.append(VehicleState(
                vehicle_id=vid,
                type_id=vtype,
                x=x, y=y, angle=angle, speed=speed,
                lane_id=lane_id, arm=arm,
                waiting=waiting, wait_time=wait_time,
            ))

            if waiting:
                queue_per_lane[lane_id] = queue_per_lane.get(lane_id, 0) + 1
            wait_per_lane[lane_id] = wait_per_lane.get(lane_id, 0.0) + wait_time

        # Average wait per lane
        lane_counts: Dict[str, int] = {}
        for v in vehicles:
            lane_counts[v.lane_id] = lane_counts.get(v.lane_id, 0) + 1
        for lane_id in wait_per_lane:
            count = lane_counts.get(lane_id, 1)
            wait_per_lane[lane_id] /= max(count, 1)

        signals = []
        for tl_id in traci.trafficlight.getIDList():
            phase = traci.trafficlight.getPhase(tl_id)
            remaining = traci.trafficlight.getNextSwitch(tl_id) - traci.simulation.getTime()
            state_str = traci.trafficlight.getRedYellowGreenState(tl_id)
            signals.append(SignalState(
                junction_id=tl_id,
                phase_index=phase,
                phase_duration=max(0.0, remaining),
                state_string=state_str,
            ))

        departed = traci.simulation.getDepartedNumber()
        throughput = max(0, departed - self._prev_departed)
        self._prev_departed = departed

        collision_ids = list(traci.simulation.getCollidingVehiclesIDList())

        return SimFrame(
            step=self._step_count,
            sim_time=traci.simulation.getTime(),
            vehicles=vehicles,
            signals=signals,
            queue_per_lane=queue_per_lane,
            wait_per_lane=wait_per_lane,
            throughput_this_step=throughput,
            collision_ids=collision_ids,
        )

    def set_phase(self, tl_id: str, phase_index: int, duration_s: float) -> None:
        """Command TraCI to set traffic light phase and duration."""
        self._traci.trafficlight.setPhase(tl_id, phase_index)
        self._traci.trafficlight.setPhaseDuration(tl_id, duration_s)

    def stop(self) -> None:
        """Close TraCI connection and terminate SUMO process."""
        try:
            if self._traci:
                self._traci.close()
        except Exception:
            pass
        if self._process:
            self._process.terminate()
            self._process.wait(timeout=5)
        self._step_count = 0

    def reset(self) -> None:
        """Stop and restart simulation from scratch."""
        self.stop()
        self.start()

    @property
    def sim_time(self) -> float:
        return self._traci.simulation.getTime() if self._traci else 0.0

    @staticmethod
    def _lane_to_arm(lane_id: str) -> str:
        """Heuristically map SUMO lane ID to cardinal arm or 'intersection'."""
        lid = lane_id.lower()
        if ":center" in lid or "junction" in lid:
            return "intersection"
        if "north" in lid or "_n_" in lid or lid.startswith("n_") or lid == "n":
            return "N"
        if "south" in lid or "_s_" in lid or lid.startswith("s_") or lid == "s":
            return "S"
        if "east" in lid or "_e_" in lid or lid.startswith("e_") or lid == "e":
            return "E"
        if "west" in lid or "_w_" in lid or lid.startswith("w_") or lid == "w":
            return "W"
        # Single-letter prefix with digit separator (e.g. "n0", "s1")
        if len(lid) >= 2 and lid[0] in "nsew" and (lid[1].isdigit() or lid[1] == "_"):
            mapping = {"n": "N", "s": "S", "e": "E", "w": "W"}
            return mapping[lid[0]]
        return "unknown"
