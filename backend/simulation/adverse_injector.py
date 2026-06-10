"""
Adverse scenario injector for the Traffic Signal Optimizer simulation.
Each injector class represents one adverse scenario type.
AdverseInjector orchestrates all active scenarios and returns AdverseEvent objects each tick.
"""
import random
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from backend.config import AdverseConfig


@dataclass
class AdverseEvent:
    event_type: str          # collision|signal_failure|waterlogging|red_light_run|etc.
    severity: str            # low|medium|high
    location: str            # arm/lane identifier e.g. "N", "south_lane_1"
    duration_s: float        # expected duration in simulation seconds
    payload: Dict[str, Any] = field(default_factory=dict)


class CollisionInjector:
    def __init__(self, probability: float, duration_s: float, rng: random.Random):
        self.probability = probability
        self.duration_s = duration_s
        self.rng = rng
        self._active: Dict[str, float] = {}  # lane -> remaining_s

    def tick(self, step: int, step_length: float, vehicles_per_arm: Dict[str, int]) -> List[AdverseEvent]:
        events = []
        for arm, count in vehicles_per_arm.items():
            if count > 2 and self.rng.random() < self.probability * step_length:
                lane = f"{arm}_lane_{self.rng.randint(0, 2)}"
                if lane not in self._active:
                    self._active[lane] = self.duration_s
                    events.append(AdverseEvent(
                        event_type="collision",
                        severity="high",
                        location=lane,
                        duration_s=self.duration_s,
                        payload={"blocking_lane": lane, "arm": arm},
                    ))
        # Decrement active blockages
        to_remove = [l for l, t in self._active.items() if t <= step_length]
        for l in to_remove:
            del self._active[l]
            events.append(AdverseEvent(
                event_type="collision_cleared",
                severity="low",
                location=l,
                duration_s=0,
            ))
        self._active = {l: t - step_length for l, t in self._active.items() if l not in to_remove}
        return events


class RedLightRunInjector:
    def __init__(self, probability: float, jump_probability: float, rng: random.Random):
        self.probability = probability
        self.jump_probability = jump_probability
        self.rng = rng

    def tick(self, step: int, step_length: float, signal_phase: int, vehicles_per_arm: Dict[str, int]) -> List[AdverseEvent]:
        events = []
        for arm, count in vehicles_per_arm.items():
            if count > 0 and self.rng.random() < self.probability * step_length:
                events.append(AdverseEvent(
                    event_type="red_light_run",
                    severity="medium",
                    location=arm,
                    duration_s=2.0,
                    payload={"arm": arm, "phase": signal_phase},
                ))
            if count > 0 and self.rng.random() < self.jump_probability * step_length:
                events.append(AdverseEvent(
                    event_type="signal_jump",
                    severity="low",
                    location=arm,
                    duration_s=1.0,
                    payload={"arm": arm},
                ))
        return events


class SignalFailureInjector:
    def __init__(self, mode: str, trigger: str, recovery_s: float, rng: random.Random):
        self.mode = mode          # full_blackout|all_amber|stuck_phase|random_glitch
        self.trigger = trigger    # never|episode_50pct|random|manual
        self.recovery_s = recovery_s
        self.rng = rng
        self.active = False
        self.remaining_s = 0.0
        self.manual_trigger = False

    def tick(self, step: int, step_length: float, total_steps: int) -> List[AdverseEvent]:
        events = []
        if self.mode == "none":
            return events

        if not self.active:
            triggered = False
            if self.trigger == "episode_50pct" and step >= total_steps * 0.5 and step < total_steps * 0.5 + 1:
                triggered = True
            elif self.trigger == "random" and self.rng.random() < 0.0001 * step_length:
                triggered = True
            elif self.trigger == "manual" and self.manual_trigger:
                triggered = True
                self.manual_trigger = False

            if triggered:
                self.active = True
                self.remaining_s = self.recovery_s
                events.append(AdverseEvent(
                    event_type="signal_failure",
                    severity="high",
                    location="all",
                    duration_s=self.recovery_s,
                    payload={"mode": self.mode},
                ))
        else:
            self.remaining_s -= step_length
            if self.remaining_s <= 0:
                self.active = False
                events.append(AdverseEvent(
                    event_type="signal_restored",
                    severity="low",
                    location="all",
                    duration_s=0,
                    payload={"mode": self.mode},
                ))
        return events

    def trigger_manual(self):
        self.manual_trigger = True


class WaterloggingInjector:
    def __init__(self, level: str, rng: random.Random):
        # level: none|minor|severe|flash_flood
        self.level = level
        self.rng = rng
        self._active_arms: List[str] = []
        self._initialised = False

    def tick(self, step: int, step_length: float) -> List[AdverseEvent]:
        events = []
        if self.level == "none":
            return events
        if not self._initialised:
            self._initialised = True
            arms = ["N", "S", "E", "W"]
            if self.level == "minor":
                self._active_arms = self.rng.sample(arms, 1)
            elif self.level == "severe":
                self._active_arms = self.rng.sample(arms, 2)
            elif self.level == "flash_flood":
                self._active_arms = arms[:1]

            for arm in self._active_arms:
                sev = "medium" if self.level == "minor" else "high"
                events.append(AdverseEvent(
                    event_type="waterlogging",
                    severity=sev,
                    location=arm,
                    duration_s=-1,  # persists entire episode
                    payload={"level": self.level, "speed_reduction": 0.3 if self.level == "minor" else 0.6},
                ))
        return events


class AutoPickupInjector:
    def __init__(self, frequency: str, rng: random.Random):
        self.frequency = frequency  # off|low|high
        self.rng = rng
        self._cooldown = 0.0
        interval = {"off": 999999, "low": 300, "high": 120}
        self._interval = interval.get(frequency, 999999)

    def tick(self, step: int, step_length: float, vehicles_per_arm: Dict[str, int]) -> List[AdverseEvent]:
        events = []
        if self.frequency == "off":
            return events
        self._cooldown -= step_length
        if self._cooldown <= 0:
            arms_with_autos = [a for a, c in vehicles_per_arm.items() if c > 1]
            if arms_with_autos:
                arm = self.rng.choice(arms_with_autos)
                duration = self.rng.uniform(15, 45)
                events.append(AdverseEvent(
                    event_type="auto_pickup",
                    severity="low",
                    location=arm,
                    duration_s=duration,
                    payload={"arm": arm, "blocking_seconds": duration},
                ))
                self._cooldown = self._interval
        return events


class VIPConvoyInjector:
    def __init__(self, enabled: bool, rng: random.Random):
        self.enabled = enabled
        self.rng = rng
        self._triggered = False
        self._trigger_step = -1

    def tick(self, step: int, step_length: float, total_steps: int) -> List[AdverseEvent]:
        if not self.enabled or self._triggered:
            return []
        if self._trigger_step < 0:
            self._trigger_step = int(total_steps * self.rng.uniform(0.2, 0.4))
        if step >= self._trigger_step:
            self._triggered = True
            arm = self.rng.choice(["N", "S", "E", "W"])
            return [AdverseEvent(
                event_type="vip_convoy",
                severity="medium",
                location=arm,
                duration_s=90.0,
                payload={"arm": arm, "convoy_length": self.rng.randint(3, 8)},
            )]
        return []


class AdverseInjector:
    """
    Orchestrates all active adverse scenario injectors.
    Call tick() each simulation step to get the list of active events.
    Also exposes aggregate severity (0.0-1.0) for the RL state vector.
    """

    def __init__(self, config: AdverseConfig, seed: int = 42):
        self.config = config
        self.rng = random.Random(seed)
        self._severity = 0.0
        self._active_events: List[AdverseEvent] = []

        self.collision = CollisionInjector(
            config.collision_probability, config.collision_duration_seconds, self.rng
        )
        self.red_light = RedLightRunInjector(
            config.red_light_run_probability, config.signal_jump_probability, self.rng
        )
        self.signal_failure = SignalFailureInjector(
            config.signal_failure_mode, config.signal_failure_trigger,
            config.failure_recovery_seconds, self.rng
        )
        self.waterlogging = WaterloggingInjector(config.waterlogging, self.rng)
        self.auto_pickup = AutoPickupInjector(config.auto_midroad_pickup, self.rng)
        self.vip_convoy = VIPConvoyInjector(config.vip_convoy, self.rng)

    def tick(
        self,
        step: int,
        step_length: float,
        total_steps: int,
        vehicles_per_arm: Dict[str, int],
        signal_phase: int = 0,
    ) -> List[AdverseEvent]:
        """Returns all new adverse events triggered this step."""
        events: List[AdverseEvent] = []
        events += self.collision.tick(step, step_length, vehicles_per_arm)
        events += self.red_light.tick(step, step_length, signal_phase, vehicles_per_arm)
        events += self.signal_failure.tick(step, step_length, total_steps)
        events += self.waterlogging.tick(step, step_length)
        events += self.auto_pickup.tick(step, step_length, vehicles_per_arm)
        events += self.vip_convoy.tick(step, step_length, total_steps)

        self._active_events = [e for e in events if e.duration_s != 0]
        severity_map = {"low": 0.2, "medium": 0.5, "high": 1.0}
        if self._active_events:
            self._severity = min(
                sum(severity_map.get(e.severity, 0.3) for e in self._active_events) / 3.0,
                1.0,
            )
        else:
            self._severity = max(self._severity - 0.1 * step_length, 0.0)

        return events

    @property
    def severity(self) -> float:
        return self._severity

    def trigger_signal_failure(self) -> None:
        """Manual trigger for demo use."""
        self.signal_failure.trigger_manual()
