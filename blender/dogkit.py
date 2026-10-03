"""Parts the breed dogs share (greatdane, corgi, husky, chihuahua, labrador): the little
pieces every robot dog is made of, so each breed's file is about its proportions and its
few signature details. Every function takes the breed's `add(obj, material, bone)` and the
look's materials `m`, like the older dogs' build() does.
"""

import math

import kit


def ball(name, c, r, seg=(10, 6)):
    """A rivet, bolt or button."""
    return kit.superellipsoid(name, (r, r, r), seg=seg, location=c)


def ring(name, c, major, minor, rot=(0, 0, 0), seg=(20, 6)):
    """A collar, cuff or seam ring; its axis is local Z before `rot`."""
    return kit.torus(name, major, minor, seg=seg, location=c, rotation=rot)


def cut_scale(d, r, e):
    """How much a superellipsoid's section shrinks `d` from its middle along an axis of
    radius `r`, so a band can sit flush on the shell there."""
    return max(0.05, (1 - min(1, abs(d) / r) ** (2 / e)) ** (e / 2))


def seam(add, m, name, center, radii, e, dy, bone, dz=0.03, rivets=True):
    """A panel seam round a shell at `dy` along its length, with a rivet each side."""
    cx, cy, cz = center
    rx, ry, rz = radii
    k = cut_scale(dy, ry, e)
    add(kit.superellipsoid(f'Seam.{name}', (rx * k + 0.003, 0.0035, rz * k + 0.003), e, e, seg=(36, 8),
                           location=(cx, cy + dy, cz)), m['joint'], bone)
    if rivets:
        for sx in (1, -1):
            for q in (-1, 1):
                add(ball(f'Rivet.{name}.{sx}.{q}', (cx + sx * (rx * k + 0.0015), cy + dy, cz + q * dz), 0.0055,
                         seg=(8, 5)), m['bezel'], bone)


def vents(add, m, name, x, y, z, bone, n=3, length=0.03, gap=0.012):
    """A few slots in a flank, at x (the side's sign carries the facing)."""
    for k in range(n):
        add(kit.superellipsoid(f'Vent.{name}.{k}', (0.004, length, 0.003), 0.4, 0.4, seg=(12, 6),
                               location=(x, y, z + (k - (n - 1) / 2) * gap)), m['bezel'], bone)


def head(add, m, name, h, sc, boxy, bone='head'):
    """The head shell, with its screen face and the bezel behind it."""
    add(kit.superellipsoid('Head', h['radii'], boxy, boxy, seg=(32, 22), location=h["center"]), m['shell'], bone)
    glass, rim = kit.screen(name, sc['radii'], sc['center'], sc['bezel'], e=boxy)
    add(glass, m['face'], bone)
    add(rim, m['bezel'], bone)


def cheek_bolts(add, m, x, y, z, r=0.009, bone='head'):
    for side in (1, -1):
        add(ball(f'Bolt.{side}', (side * x, y, z), r, seg=(12, 8)), m['bezel'], bone)


def nose_bits(add, m, nose_c, nose_r, bone='head'):
    """Nostril vents and a collar round the nose."""
    ny, nz = nose_c[1], nose_c[2]
    add(kit.superellipsoid('NoseCollar', (nose_r[0] + 0.005, 0.005, nose_r[2] + 0.005), 0.5, 0.6, seg=(18, 8),
                           location=(0, ny + nose_r[1] - 0.001, nz)), m['joint'], bone)
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (nose_r[0] * 0.2,) * 3, seg=(8, 6),
                               location=(side * nose_r[0] * 0.4, ny - nose_r[1] + 0.0005, nz - nose_r[2] * 0.1)),
            m['shell'], bone)


def jaw_pins(add, m, x, pivot, r=0.009, bone='head'):
    """The hinge of the jaw, a pin and ring each side."""
    for side in (1, -1):
        add(ball(f'JawPin.{side}', (side * x, pivot[1], pivot[2]), r, seg=(12, 8)), m['bezel'], bone)
        add(ring(f'JawRing.{side}', (side * (x + r * 0.9), pivot[1], pivot[2]), r * 1.3, r * 0.3,
                 rot=(0, math.pi / 2, 0), seg=(16, 6)), m['joint'], bone)


def ear_hinge(add, m, side, sfx, x, y, z, bone, r=0.014):
    """A hinge puck at the root of an ear: rides the head, with a pin on the ear."""
    add(kit.superellipsoid(f'EarHinge.{sfx}', (r * 0.8, r, r), 0.8, 0.5, seg=(14, 8),
                           location=(side * x, y, z)), m['bezel'], 'head')
    add(ball(f'EarPin.{sfx}', (side * (x + r * 0.7), y, z), r * 0.5, seg=(10, 6)), m['joint'], bone)


def paw(add, m, name, lx, y, pw, bone, back=0.01, toes=True, mat=None):
    """A rounded paw on its sole, a pad underneath, toe beads across the front."""
    px, py, pz = pw
    add(kit.superellipsoid(f'Paw.{name}', pw, 0.45, 0.6, seg=(20, 10), location=(lx, y - back, pz)),
        mat or m['joint'], bone)
    add(kit.superellipsoid(f'Pad.{name}', (px * 0.92, py * 0.92, 0.005), 0.5, 0.5, seg=(20, 6),
                           location=(lx, y - back, 0.0035)), m['bezel'], bone)
    if toes:
        for k in (-1, 0, 1):
            add(ball(f'Toe.{name}.{k}', (lx + k * px * 0.4, y - back - py + 0.004 + abs(k) * px * 0.1, pz * 0.7),
                     px * 0.17, seg=(8, 5)), m['bezel'], bone)


def leg(add, m, name, lx, y, top, r, pw, bone, rings=(0.2, 0.6)):
    """A one-piece leg: a tube from the body to the paw with a couple of joint rings."""
    px, py, pz = pw
    tube, _ = kit.tube(f'Leg.{name}', [(lx, y, top), (lx, y, pz)], r, ring=12)
    add(tube, m['shell'], bone)
    for q, f in enumerate(rings):
        add(ring(f'LegRing.{name}.{q}', (lx, y, top + (pz - top) * f), r + 0.002, 0.0055, seg=(20, 6)),
            m['joint'], bone)


def leg2(add, m, name, lx, y, top, knee, r, ball_r, pw, bones):
    """A two-piece leg with a ball joint at the knee: thigh on bones[0], shin on bones[1]."""
    px, py, pz = pw
    thigh, _ = kit.tube(f'Thigh.{name}', [(lx, y, top), (lx, y, knee)], r[0], ring=12)
    add(thigh, m['shell'], bones[0])
    add(kit.superellipsoid(f'Knee.{name}', (ball_r,) * 3, seg=(16, 10), location=(lx, y, knee)), m['joint'],
        bones[1])
    shin, _ = kit.tube(f'Shin.{name}', [(lx, y, knee), (lx, y, pz)], r[1], ring=12)
    add(shin, m['shell'], bones[1])
    add(ring(f'KneeCup.{name}', (lx, y, knee + ball_r * 0.65), r[0] * 0.95, 0.006, seg=(18, 6)), m['joint'],
        bones[0])
    pin, _ = kit.tube(f'KneePin.{name}', [(lx - ball_r * 0.95, y, knee), (lx + ball_r * 0.95, y, knee)], 0.0065,
                      ring=8)
    add(pin, m['shell'], bones[1])
    for sx in (1, -1):
        add(ball(f'KneeCap.{name}.{sx}', (lx + sx * ball_r, y, knee), 0.0105, seg=(10, 6)), m['bezel'], bones[1])
    add(ring(f'Ankle.{name}', (lx, y, pz + 0.05), r[1] + 0.003, 0.005, seg=(16, 6)), m['joint'], bones[1])


def tail_bones(points, n, parent='body'):
    """n bones along a tail's spline, and the spline's points."""
    pts = kit.spline(points, n + 1)
    bones = []
    for i in range(n):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent if i == 0 else f'tail.{i}'))
    return bones, pts


def tail(add, m, points, r, n, parent_bones=None, cap=0.0, rings=True, ring_r=None):
    """A tail tube over its bones tail.1..n, radius tapering from r[0] to r[1], with rings
    at the joints and an optional round cap on the tip."""
    pts = kit.spline(points, 14)
    r0, r1 = r
    radii = [r0 + (r1 - r0) * (i / (len(pts) - 1)) for i in range(len(pts))]
    tube, ts = kit.tube('Tail', pts, radii, ring=12)
    names = [f'tail.{i + 1}' for i in range(n)]
    add(tube, m['shell'], kit.chain(ts, names))
    if rings:
        for q in range(n):
            idx = int(len(pts) * (q + 0.5) / n) if q else 1
            idx = min(idx, len(pts) - 2)
            a, b = pts[idx - 1], pts[idx + 1]
            ang = -math.atan2(b[1] - a[1], b[2] - a[2])
            add(ring(f'TailRing.{q}', pts[idx], radii[idx] + 0.002, 0.0045, rot=(ang, 0, 0), seg=(18, 6)),
                m['joint'], names[q])
    return pts


def collar(add, m, center, major, minor, tilt, tag, bone='head'):
    """A collar round the neck with its tag (a light that takes the beacon's colour) and a
    stud each side. `tag` is the tag's radius."""
    add(ring('Collar', center, major, minor, rot=(tilt, 0, 0), seg=(32, 8)), m['role']('Collar', 'joint'), bone)
    cy = center[1] - major * math.cos(tilt)
    cz = center[2] - major * math.sin(tilt)
    add(kit.superellipsoid('Tag', (tag, tag * 0.22, tag), 1.0, 1.0, seg=(20, 10),
                           location=(0, cy - tag * 0.15, cz - tag * 0.9), rotation=(0.15, 0, 0)), m['beacon'], bone)
    add(ring('TagRim', (0, cy - tag * 0.2, cz - tag * 0.9), tag * 1.12, tag * 0.16,
             rot=(math.pi / 2 + 0.15, 0, 0), seg=(24, 8)), m['bezel'], bone)
    add(ball('TagLoop', (0, cy - 0.001, cz - tag * 0.05), tag * 0.22, seg=(10, 6)), m['bezel'], bone)
    for side in (1, -1):
        a = 0.95
        add(ball(f'Stud.{side}', (center[0] + side * major * math.sin(a),
                                  center[1] - major * math.cos(a) * math.cos(tilt),
                                  center[2] - major * math.cos(a) * math.sin(tilt)), minor * 0.9, seg=(10, 6)),
            m['bezel'], bone)
