"""Tuft, the crew's robot moth: butterfly-sized and upright, but plump and soft where Prism is
glass and slim. A chubby thorax in a ruff of chunky fur pods (a ring round the neck and a few
on the chest), a short plump abdomen, a small screen-faced head, big feathery antennae (a stalk
over two bones with three rounded combs on it, lit at the tip) and two pairs of broad, soft,
sand-coloured wings (bones `wing.L/R`, `hind.L/R`) with a big eye-spot on each: a dark ring
round a lit disc (Dot0 on the fore wings, Dot2 on the hind), and a few lit cells along the
edges (Dot1). Resting, the wings fold flat and swept back over her body (see REST_FORE). A glowing orb waits to
one side on a bone of its own (`bulb`, Dot3, which the site scales to nothing until the moth
is drawn to it). Faces -Y; about 0.5 m to the antenna tips and 0.7 m across.
"""

import math

from mathutils import Vector

import bugkit
import kit
import looks
from bugkit import SIDES, along, ball

FACE = 'moth'

# How the wings fold at rest: (pitch, yaw, roll) in degrees, then the move (x, y, z) in metres,
# both in the site's character axes, for the left; the right is its mirror. They lay each wing
# back along her body, the eye-spot up, the inner edge on the midline and the outer edge sloping
# down, 40 degrees for the forewings and a steeper 48 for the hindwings under them. The site's
# moth.ts has the same numbers (REST_FORE, REST_HIND).
REST_FORE = (-50.272, 94.458, -44.075, 0.079, -0.064, 0.057)
REST_HIND = (-42.109, 95.385, 16.559, 0.03, -0.031, 0.03)


def mirrored(rest):
    p, y, r, x, up, z = rest
    return (p, -y, -r, -x, up, z)

# She is portrayed at rest, not flying: the wings folded flat and swept back over her body in a
# low tent, the forewings covering the hindwings (the same turns the site gives her at rest).
PREVIEW = dict(lift=0.0, width=0.75, turn=25, pose={
    'wing.L': REST_FORE, 'wing.R': mirrored(REST_FORE),
    'hind.L': REST_HIND, 'hind.R': mirrored(REST_HIND),
})

D = {
    'abdomen': dict(radii=(0.062, 0.066, 0.1), center=(0, 0.04, 0.135)),
    'thorax': dict(radii=(0.088, 0.08, 0.084), center=(0, 0.0, 0.25)),
    'head': dict(radii=(0.063, 0.052, 0.056), center=(0, -0.05, 0.345), e=(0.55, 0.6)),
    # 4:3, like the moth's face layout (256 x 192)
    'screen': dict(radii=(0.047, 0.02, 0.0352), center=(0, -0.088, 0.347), bezel=0.006),
    'antenna': [(0.03, -0.08, 0.385), (0.075, -0.11, 0.45), (0.115, -0.1, 0.51)],
    'legs': [-0.02, 0.0, 0.02],
    'leg': dict(hip=(0.03, 0.2), knee=(0.065, 0.11), foot=(0.072, 0.01)),
    'fore': dict(a=(0.05, 0.05, 0.275), b=(0.36, 0.06, 0.44), width=0.34),
    'hind': dict(a=(0.05, 0.055, 0.24), b=(0.27, 0.06, 0.1), width=0.24),
    'bulb': dict(c=(0.42, -0.06, 0.36), r=0.06),
}
# Lit cells along the wings' edges: (along 0..1, across -1..1, length, breadth, which Dot).
FORE_CELLS = [(0.93, 0.35, 0.1, 0.22, 1), (0.9, -0.1, 0.1, 0.22, 1), (0.82, -0.55, 0.1, 0.2, 1),
              (0.2, 0.55, 0.14, 0.2, 1)]
HIND_CELLS = [(0.92, 0.3, 0.12, 0.28, 1), (0.9, -0.3, 0.12, 0.28, 1)]


def rig_bones():
    f, h = D['fore'], D['hind']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.01, 0.15), (0, 0.0, 0.32), 'root'),
        ('abdomen', (0, 0.01, 0.2), (0, 0.04, 0.07), 'body'),
        ('head', (0, -0.03, 0.31), (0, -0.05, 0.4), 'body'),
        ('bulb', D['bulb']['c'], (D['bulb']['c'][0], D['bulb']['c'][1], D['bulb']['c'][2] + 0.1), 'root'),
    ]
    for side, sfx in SIDES:
        bones.append((f'wing.{sfx}', bugkit.mirror(f['a'], side), bugkit.mirror(f['b'], side), 'body'))
        bones.append((f'hind.{sfx}', bugkit.mirror(h['a'], side), bugkit.mirror(h['b'], side), 'body'))
        bones += bugkit.antenna_bones(side, sfx, D['antenna'])
    lg = D['leg']
    bones += bugkit.leg_bones(D['legs'], lg['hip'], lg['knee'], lg['foot'])
    return bones


def eye_spot(add, m, a, b, width, u, v, r, dot, bone):
    """A dark ring round a lit disc, set on the wing plate from a to b."""
    A, B = Vector(a), Vector(b)
    d = B - A
    axis = d.normalized()
    s = 1.0 if (A.x + B.x) >= 0 else -1.0
    across = Vector((-axis.z * s, 0.0, axis.x * s))
    c = A + axis * (u * d.length) + across * (v * width / 2)
    add(kit.superellipsoid('Ring', (r * 1.3, 0.008, r * 1.3), 0.9, 0.9, seg=(24, 6),
                           location=(c.x, c.y - 0.003, c.z)), m['shell'], bone)
    add(kit.superellipsoid('Disc', (r * 0.8, 0.008, r * 0.8), 0.9, 0.9, seg=(20, 6),
                           location=(c.x, c.y - 0.01, c.z)), m['dot'](dot), bone)
    add(kit.superellipsoid('Pupil', (r * 0.3, 0.008, r * 0.3), 0.9, 0.9, seg=(14, 6),
                           location=(c.x, c.y - 0.014, c.z + r * 0.15)), m['bezel'], bone)


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    a = D['abdomen']
    add(kit.superellipsoid('Abdomen', a['radii'], 0.9, 0.9, seg=(32, 22), location=a['center'], taper=0.2),
        m['role']('Fuzz'), 'abdomen')
    ax, ay, az = a['center']
    for i, f in enumerate((-0.4, 0.1, 0.55)):
        r = a['radii'][0] * (1 - abs(f) ** 2.2) ** 0.45
        add(kit.stretch(kit.torus(f'Band{i}', r + 0.002, 0.007, seg=(32, 8), location=(0, ay, az + f * a['radii'][2])),
                        sz=1.4), m['joint'], 'abdomen')

    t = D['thorax']
    add(kit.superellipsoid('Thorax', t['radii'], 0.8, 0.9, seg=(32, 22), location=t['center']),
        m['role']('Fuzz'), 'body')
    # The fur: a ruff of chunky pods round the neck and a few down the chest.
    for k in range(7):
        th = math.radians(-70 + 140 * k / 6)
        add(ball(f'Ruff{k}', (0.092 * math.sin(th), -0.062 * math.cos(th) - 0.004, 0.303 - 0.006 * abs(math.sin(th))),
                 0.032, seg=(14, 10)), m['role']('Tuft', 'shell'), 'body')
    for k, (x, z) in enumerate(((-0.048, 0.235), (0.048, 0.235), (0.0, 0.2))):
        add(ball(f'Chest{k}', (x, -0.07, z), 0.032, seg=(14, 10)), m['role']('Tuft', 'shell'), 'body')
    for side, sfx in SIDES:
        add(ball(f'Hinge.{sfx}', (side * 0.082, 0.04, 0.275), 0.019, seg=(12, 8)), m['joint'], 'body')
        add(ball(f'HindHinge.{sfx}', (side * 0.08, 0.045, 0.235), 0.016, seg=(12, 8)), m['joint'], 'body')

    h = D['head']
    hx, hy, hz = h['center']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(36, 24), location=h['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Moth', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for bx in (-1, 1):
        add(kit.superellipsoid(f'Cheek.{bx}', (0.016, 0.009, 0.013), 0.5, 0.6, seg=(12, 8),
                               location=(bx * 0.058, hy - 0.038, hz - 0.02)), m['bezel'], 'head')
    add(kit.superellipsoid('Lamp', (0.011, 0.011, 0.008), 0.8, 1.0, seg=(14, 8),
                           location=(0, hy - 0.006, hz + h['radii'][2] - 0.001)), m['beacon'], 'head')

    # Broad feathery antennae: the stalk over two bones, and five pairs of flat plumes angled
    # forward along it like a comb (a moth's are the broadest part of her head).
    bugkit.antennae(add, m, D['antenna'], r=(0.009, 0.006), tip=0.016, club=False)
    for side, sfx in SIDES:
        a3 = [bugkit.mirror(p, side) for p in D['antenna']]
        path = kit.spline(a3, 12)
        for k, (i, size) in enumerate(((2, 0.05), (4, 0.062), (6, 0.062), (8, 0.054), (10, 0.04))):
            p0, p1 = Vector(path[i - 1]), Vector(path[i + 1])
            d = (p1 - p0).normalized()
            perp = Vector((-d.z, 0.0, d.x))
            bone = f'antenna.{sfx}.1' if i < 6 else f'antenna.{sfx}.2'
            for w in (-1, 1):
                way = (perp * w * math.cos(0.7) + d * math.sin(0.7)).normalized()
                add(kit.superellipsoid(f'Comb.{sfx}.{k}.{w}', (0.012, 0.008, size), 0.8, 0.9, seg=(14, 10),
                                       location=tuple(Vector(path[i]) + way * size * 0.85),
                                       rotation=along((0, 0, 0), tuple(way))),
                    m['role']('Tuft', 'shell'), bone)

    # Broad soft wings, each with an eye-spot.
    f, hd = D['fore'], D['hind']
    wing = m['role']('Wing', 'shell')
    for side, sfx in SIDES:
        fa, fb = bugkit.mirror(f['a'], side), bugkit.mirror(f['b'], side)
        ha, hb = bugkit.mirror(hd['a'], side), bugkit.mirror(hd['b'], side)
        bugkit.panel(add, m, f'Wing.{sfx}', fa, fb, f['width'], 0.012, FORE_CELLS, f'wing.{sfx}',
                     frame=wing, e=(0.85, 0.95))
        bugkit.panel(add, m, f'Hind.{sfx}', ha, hb, hd['width'], 0.012, HIND_CELLS, f'hind.{sfx}',
                     frame=wing, e=(0.85, 0.95))
        eye_spot(add, m, fa, fb, f['width'], 0.58, 0.05, 0.062, 0, f'wing.{sfx}')
        eye_spot(add, m, ha, hb, hd['width'], 0.5, 0.0, 0.045, 2, f'hind.{sfx}')

    lg = D['leg']
    bugkit.legs(add, m, D['legs'], lg['hip'], lg['knee'], lg['foot'], r=0.0075, pad=(0.013, 0.017, 0.005))

    # The orb she is drawn to: a glowing ball in a halo of two rings.
    bl = D['bulb']
    add(ball('Bulb', bl['c'], bl['r'], seg=(24, 16)), m['dot'](3), 'bulb')
    for i, tilt in enumerate((0, 90)):
        add(kit.torus(f'Halo{i}', bl['r'] * 1.5, 0.006, seg=(32, 6), location=bl['c'],
                      rotation=(math.radians(tilt + 90), 0, 0)), m['joint'], 'bulb')

    return looks.finish(kit.armature('MothRig', rig_bones()), parts, skin, m, outline=0.0035)
