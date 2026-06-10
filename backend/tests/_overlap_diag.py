"""Diagnostic: categorize intersection overlaps by type (cross-arm / same-lane /
turning) to locate the root cause before fixing. Throwaway script."""
import math
import random
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.api import socket_handlers as sh

_VEH_LEN = sh._VEH_LEN

# Approximate body widths (world units), much smaller than length.
_VEH_WID = {
    "car": 1.8, "cab": 1.8, "ev_scooter": 0.8, "two_wheeler": 0.8,
    "delivery_bike": 0.9, "auto_rickshaw": 1.4, "e_rickshaw": 1.5,
    "tsrtc_bus": 2.6, "school_bus": 2.5, "truck": 2.6,
}


def half(v):
    return _VEH_LEN.get(v.type_id, 4.0) / 2.0


def _heading(v):
    if v.angle is not None:
        return v.angle
    return math.atan2(v.dy, v.dx)


def _corners(v):
    hl = _VEH_LEN.get(v.type_id, 4.0) / 2.0
    hw = _VEH_WID.get(v.type_id, 1.8) / 2.0
    a = _heading(v)
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for lx, ly in ((hl, hw), (hl, -hw), (-hl, -hw), (-hl, hw)):
        pts.append((v.x + lx * ca - ly * sa, v.y + lx * sa + ly * ca))
    return pts


def _overlap_obb(a, b):
    """Separating-axis test on two oriented rectangles. True if they overlap."""
    ca, cb = _corners(a), _corners(b)
    for poly in (ca, cb):
        for i in range(4):
            x1, y1 = poly[i]
            x2, y2 = poly[(i + 1) % 4]
            # axis = edge normal
            ax, ay = -(y2 - y1), (x2 - x1)
            mag = math.hypot(ax, ay) or 1.0
            ax, ay = ax / mag, ay / mag
            amin = min(px * ax + py * ay for px, py in ca)
            amax = max(px * ax + py * ay for px, py in ca)
            bmin = min(px * ax + py * ay for px, py in cb)
            bmax = max(px * ax + py * ay for px, py in cb)
            if amax <= bmin + 0.15 or bmax <= amin + 0.15:  # 0.15 wu tolerance
                return False
    return True


def categorize(a, b):
    # both on bezier arc, or one of them turning
    if a.turning or b.turning:
        return "turning"
    if a.arm == b.arm and a.lane == b.lane:
        return "same_lane"
    perp = sh._CROSS_CONFLICTS.get(a.arm, frozenset())
    if b.arm in perp:
        return "cross_arm"
    return "other"


def run(seed, steps=6000, dt=0.1):
    random.seed(seed)
    world = sh._SimWorld(fixed_time=False)
    # prepopulate
    vid = [0]

    def spawn():
        vid[0] += 1
        spec = sh._spawn_spec(vid[0])
        return sh._vehicle_from_spec(spec)

    for _ in range(8):
        world.vehicles.append(spawn())

    counts = {"turning": 0, "same_lane": 0, "cross_arm": 0, "other": 0}
    examples = {}
    frames_all_stopped = 0
    cur_streak = 0
    max_streak = 0
    for step in range(steps):
        if step % 18 == 0 and len(world.vehicles) < 44:
            world.vehicles.append(spawn())
        world.step(dt)
        if world.vehicles and all(v.speed <= 0.01 for v in world.vehicles):
            frames_all_stopped += 1
            cur_streak += 1
            max_streak = max(max_streak, cur_streak)
        else:
            cur_streak = 0
        vs = world.vehicles
        for i in range(len(vs)):
            for j in range(i + 1, len(vs)):
                a, b = vs[i], vs[j]
                # cheap reject: bounding circles can't possibly touch
                d = math.hypot(a.x - b.x, a.y - b.y)
                if d > half(a) + half(b) + 1.0:
                    continue
                if _overlap_obb(a, b):
                    cat = categorize(a, b)
                    counts[cat] += 1
                    if cat not in examples:
                        examples[cat] = (
                            f"{a.arm}{a.lane}/{a.type_id}/through={a.through}/turn={a.turn_dir} "
                            f"@({a.x:.1f},{a.y:.1f}) vs "
                            f"{b.arm}{b.lane}/{b.type_id}/through={b.through}/turn={b.turn_dir} "
                            f"@({b.x:.1f},{b.y:.1f}) d={d:.2f}"
                        )
    return counts, examples, (frames_all_stopped, max_streak)


total = {"turning": 0, "same_lane": 0, "cross_arm": 0, "other": 0}
for s in (1, 7, 42, 99, 123):
    c, ex, (stopped, streak) = run(s)
    print(f"seed {s:3d}: {c} | frames_all_stopped={stopped} | max_streak={streak}")
    for k, v in ex.items():
        print(f"    e.g. {k}: {v}")
    for k in total:
        total[k] += c[k]
print("TOTAL:", total)
