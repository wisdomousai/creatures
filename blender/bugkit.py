"""Shared building blocks for the robot bugs (the bee, butterfly, caterpillar, firefly and
beetle; meant for whoever builds the moth, dragonfly, jumping spider, ant and grasshopper
next): the pieces every bug has, built the same way so the TS side (src/
bug.ts) can pose them the same way.

  * antennae: a tapering stalk over two bones (`antenna.L.1`, `antenna.L.2`, and the right
    side `R`) with a lit bulb on the tip in the beacon's colour, a socket and a knuckle.
  * legs: six, three a side, two bones each (`leg.L.0`, `foot.L.0` ...): a thigh out from
    the body, a knee ball, a shin down to the floor, a pad. Optional pods on the shin.
  * wing plates: a flat leaf from a shoulder, in one or two layers, and stained-glass
    panels: a dark leading plate with lit cells on it, each cell its own Dot material.

Bugs face -Y like the rest of the crew and stand on the floor at z = 0. Every function that
makes meshes takes `add(obj, material, bone)`, the same little helper each model defines.
"""

import math

from mathutils import Vector

import birdkit
import kit

ball = birdkit.ball
blade = birdkit.blade
segment = birdkit.segment
studs = birdkit.studs
along = birdkit.along

SIDES = ((1, 'L'), (-1, 'R'))


def mirror(p, side):
    return side * p[0], p[1], p[2]


def antenna_bones(side, sfx, pts, parent='head'):
    """The two bones of one antenna, from three points (base, knuckle, tip) on the left."""
    a = [mirror(p, side) for p in pts]
    return [(f'antenna.{sfx}.1', a[0], a[1], parent), (f'antenna.{sfx}.2', a[1], a[2], f'antenna.{sfx}.1')]


def antennae(add, m, pts, r=(0.011, 0.008), tip=0.026, head='head', club=False):
    """Both antennae: stalk over two bones, socket, knuckle, collar, and a glowing tip (the
    beacon's material, so it changes colour with the mood). `club` makes the tip an egg
    standing along the stalk instead of a ball."""
    for side, sfx in SIDES:
        a3 = [mirror(p, side) for p in pts]
        path = kit.spline(a3, 12)
        stalk, ts = kit.tube(f'Antenna.{sfx}', path, [r[0] + (r[1] - r[0]) * k / 11 for k in range(12)], ring=8)
        add(stalk, m['joint'], kit.chain(ts, [f'antenna.{sfx}.1', f'antenna.{sfx}.2']))
        add(kit.superellipsoid(f'Socket.{sfx}', (r[0] * 1.8, r[0] * 1.8, r[0] * 1.3), 0.6, 0.8, seg=(12, 8),
                               location=a3[0]), m['joint'], head)
        add(ball(f'Knuckle.{sfx}', a3[1], r[0] * 1.3, seg=(12, 8)), m['joint'], f'antenna.{sfx}.1')
        d = (Vector(a3[2]) - Vector(a3[1])).normalized()
        if club:
            add(kit.superellipsoid(f'Tip.{sfx}', (tip * 0.8, tip * 0.8, tip * 1.5), 0.9, 1.0, seg=(16, 10),
                                   location=Vector(path[-1]) + d * tip * 0.6, rotation=along((0, 0, 0), tuple(d))),
                m['beacon'], f'antenna.{sfx}.2')
        else:
            add(ball(f'Tip.{sfx}', path[-1], tip), m['beacon'], f'antenna.{sfx}.2')


def leg_bones(ys, hip, knee, foot, parent='body'):
    """Six legs, a pair at each y: hip, knee and foot are (x, z) on the left side (the foot
    a touch further forward than the knee is, as the ladybug's are)."""
    bones = []
    for side, sfx in SIDES:
        for k, y in enumerate(ys):
            kn = (side * knee[0], y, knee[1])
            bones += [(f'leg.{sfx}.{k}', (side * hip[0], y, hip[1]), kn, parent),
                      (f'foot.{sfx}.{k}', kn, (side * foot[0], y - 0.008, foot[1] + 0.004), f'leg.{sfx}.{k}')]
    return bones


def legs(add, m, ys, hip, knee, foot, r=0.012, pad=(0.02, 0.026, 0.008), pods=None, parent='body'):
    """The legs for leg_bones: tube thigh, knee ball, shin, rubber pad, little toe. `pods`
    maps a leg's index to (dot index, radii): a lit pod on its shin, one for each side
    (Dot index and index + 1), for a bee's pollen baskets."""
    for side, sfx in SIDES:
        for k, y in enumerate(ys):
            h = (side * hip[0], y, hip[1])
            kn = (side * knee[0], y, knee[1])
            ft = (side * foot[0], y - 0.008, foot[1] + 0.004)
            upper, _ = kit.tube(f'Leg.{sfx}.{k}', [h, kn], r, ring=8)
            add(upper, m['joint'], f'leg.{sfx}.{k}')
            lower, _ = kit.tube(f'Shin.{sfx}.{k}', [kn, ft], r * 0.85, ring=8)
            add(lower, m['joint'], f'foot.{sfx}.{k}')
            add(ball(f'Knee.{sfx}.{k}', kn, r * 1.35, seg=(12, 8)), m['joint'], f'foot.{sfx}.{k}')
            add(kit.superellipsoid(f'Pad.{sfx}.{k}', pad, 0.4, 0.6, seg=(16, 8),
                                   location=(ft[0], ft[1], pad[2]), rotation=(0, 0, 0)), m['shell'],
                f'foot.{sfx}.{k}')
            if pods and k in pods:
                dot, radii = pods[k]
                mid = ((kn[0] + ft[0]) / 2 + side * radii[0] * 0.8, (kn[1] + ft[1]) / 2 + radii[1] * 0.4,
                       (kn[2] + ft[2]) / 2 + 0.004)
                add(kit.superellipsoid(f'Pod.{sfx}.{k}', radii, 0.6, 0.7, seg=(16, 10), location=mid),
                    m['dot'](dot + (0 if side > 0 else 1)), f'foot.{sfx}.{k}')
                add(kit.superellipsoid(f'PodRim.{sfx}.{k}', (radii[0] * 1.08, radii[1] * 1.08, radii[2] * 0.3), 0.5, 0.6,
                                       seg=(16, 6), location=(mid[0], mid[1], mid[2] + radii[2] * 0.85)),
                    m['joint'], f'foot.{sfx}.{k}')


def panel(add, m, name, a, b, width, thick, cells, bone, frame='joint', e=(0.6, 0.9)):
    """A stained-glass wing plate: a dark leading plate laid from a to b (`width` across), and
    lit cells set into it. A cell is (along, across, length, breadth, dot): where its centre
    is (0..1 along the plate, -1..1 across it), how long and wide it is (as a share of the
    plate's length and width), and which Dot it lights with. Plates lie flat facing -Y when
    a and b are in the XZ plane (so the viewer sees them whole). `frame` is a material key
    or a material itself (a role's, for a wing with a colour of its own)."""
    add(blade(f'{name}.Lead', a, b, width, thick, e=e, seg=(24, 10)), m[frame] if isinstance(frame, str) else frame, bone)
    A, B = Vector(a), Vector(b)
    d = B - A
    length = d.length
    axis = d.normalized()
    # Across is the same way on both sides, mirrored: the right plate is the left one flipped.
    s = 1.0 if (A.x + B.x) >= 0 else -1.0
    across = Vector((-axis.z * s, 0.0, axis.x * s))
    for i, (u, v, cl, cb, dot) in enumerate(cells):
        centre = A + axis * (u * length) + across * (v * width / 2)
        add(kit.superellipsoid(f'{name}.Cell{i}', (cb * width / 2, thick * 0.9, cl * length / 2), 0.55, 0.7,
                               seg=(14, 6), location=tuple(centre + Vector((0, -thick * 0.45, 0))),
                               rotation=along((0, 0, 0), tuple(axis))), m['dot'](dot), bone)
