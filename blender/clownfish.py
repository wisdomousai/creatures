"""Zest, the crew's robot clownfish: a small round orange fish, plump at the front and tapering
to a rounded tail, with the crew's screen face set into its front. Three white bands round
the body (Dot0 behind the face, Dot1 midway, Dot2 near the tail), each lit and edged in dark
lines either side, so a shimmer can run down them. Rounded fins: a tall sail of a dorsal
(dorsal), two round pectorals (fin.L, fin.R) and a round tail fan on two bones (tail.1, tail.2).

A little anemone waits beside it on bones of its own: a round cushion (anemone) with nine lit
stalks (anemone.0 .. anemone.8, Dot3 at their tips), for the site to bring in and put away
again. Faces -Y like the rest of the crew; about 0.28 m tall and 0.36 m long, and it floats: its
origin is under its belly.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'clownfish'
PREVIEW = dict(lift=0.04, width=0.4, turn=-65)

HULL = dict(c=(0, 0.02, 0.115), r=(0.092, 0.12, 0.1), e=(0.85, 0.9), taper=0.45)
SCREEN = dict(c=(0, -0.093, 0.128), r=(0.068, 0.02, 0.046), bezel=0.007)
BANDS = ((-0.045, 0), (0.03, 1), (0.1, 2))
TAIL = [(0, 0.125, 0.115), (0, 0.17, 0.115), (0, 0.215, 0.115)]
ANEM = Vector((0.2, 0.0, 0.05))


def hull(name, grow=0.0):
    h = HULL
    obj = kit.superellipsoid(name, (h['r'][0] * (1 + grow), h['r'][2] * (1 + grow), h['r'][1] * (1 + grow)), *h['e'],
                             seg=(40, 40), taper=h['taper'], location=h['c'], rotation=(-math.pi / 2, 0, 0))
    kit.apply_transforms(obj)
    return obj


def scale_at(y):
    """The hull's cross-section at y, as a share of its widest radii."""
    h = HULL
    s = max(-0.999, min(0.999, (y - h['c'][1]) / h['r'][1]))
    sin = abs(s) ** (1 / h['e'][0])
    return (1 - sin * sin) ** (h['e'][0] / 2) * (1 - h['taper'] * s / 2)


def stalk_points():
    pts = [(0, 0)] + [(0.045 * math.cos(2 * math.pi * i / 8), 0.045 * math.sin(2 * math.pi * i / 8)) for i in range(8)]
    return [pts[(i + 1) % 9] for i in range(9)]  # stalk 8 is the middle one


def rig_bones():
    v = Vector
    sc = v(SCREEN['c'])
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', HULL['c'], (0, HULL['c'][1], HULL['c'][2] + 0.1), 'root'),
        ('face', sc, sc + v((0, -0.05, 0)), 'body'),
        ('dorsal', (0, 0.04, 0.2), (0, 0.06, 0.27), 'body'),
        ('fin.L', (0.09, -0.03, 0.1), (0.15, 0.0, 0.08), 'body'),
        ('fin.R', (-0.09, -0.03, 0.1), (-0.15, 0.0, 0.08), 'body'),
        ('anemone', ANEM, ANEM + v((0, 0, 0.03)), 'root'),
    ]
    b, _ = seakit.chain('tail', 'body', TAIL)
    bones += b
    for i, (x, y) in enumerate(stalk_points()):
        p = ANEM + v((x, y, 0.035))
        bones.append((f'anemone.{i}', p, p + v((0, 0, 0.075)), 'anemone'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    fin = m['role']('Fin', 'joint')
    h = HULL
    add(hull('Hull'), m['shell'], 'body')
    s = SCREEN
    glass, rim = kit.screen('Clown', s['r'], s['c'], s['bezel'], e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')

    # The bands: a lit disc a hair bigger than the body there, edged with a dark one either side.
    for y, dot in BANDS:
        f = scale_at(y)
        rx, rz = h['r'][0] * f, h['r'][2] * f
        band = kit.superellipsoid(f'Band{dot}', (rx * 1.015, rz * 1.015, 0.024), 0.5, 0.9, seg=(40, 8),
                                  location=(0, y, h['c'][2]), rotation=(math.pi / 2, 0, 0))
        add(band, m['dot'](dot), 'body')
        for sgn in (-1, 1):
            edge = kit.superellipsoid(f'Edge{dot}{sgn}', (rx * 1.02, rz * 1.02, 0.0035), 0.5, 0.9, seg=(40, 6),
                                      location=(0, y + sgn * 0.0275, h['c'][2]), rotation=(math.pi / 2, 0, 0))
            add(edge, m['bezel'], 'body')

    # Fins, all rounded.
    add(seakit.fan('DorsalFin', (0, 0.04, 0.2), (0, 0.12, 1), (0.085, 0.009, 0.07), (1, 0, 0), taper=0.5), fin, 'dorsal')
    add(seakit.pod('DorsalBase', (0, 0.04, 0.2), (0.02, 0.07, 0.014), (0.7, 0.8), seg=(16, 10)), m['bezel'], 'dorsal')
    for sfx, sx in (('L', 1), ('R', -1)):
        add(seakit.pod(f'Hub{sfx}', (sx * 0.09, -0.03, 0.1), (0.014, 0.014, 0.014), (0.7, 0.7), seg=(14, 8)), m['bezel'],
            f'fin.{sfx}')
        add(seakit.fan(f'Pectoral{sfx}', (sx * 0.09, -0.03, 0.1), (sx * 0.85, 0.35, -0.25), (0.04, 0.008, 0.055),
                       (0, 0, 1), taper=0.6), fin, f'fin.{sfx}')

    # The tail: a short stalk, and a round fan.
    t0, t1, t2 = (Vector(p) for p in TAIL)
    add(seakit.bar('Stalk', t0 + Vector((0, -0.03, 0)), t1 + Vector((0, 0.01, 0)), 0.045, e=(0.7, 0.9)), m['shell'], 'tail.1')
    add(seakit.bar('Peduncle', t1, t2, 0.03, e=(0.7, 0.9)), m['shell'], 'tail.2')
    add(seakit.fan('TailFan', t2 - Vector((0, 0.02, 0)), (0, 1, 0), (0.07, 0.008, 0.075), (1, 0, 0), taper=0.35), fin,
        'tail.2')
    add(seakit.pod('TailHub', t2, (0.016, 0.016, 0.016), (0.7, 0.7), seg=(14, 8)), m['bezel'], 'tail.2')

    # The anemone: a round cushion and nine lit stalks with a bead each.
    cushion = m['role']('Cushion', 'joint')
    stalk = m['role']('Stalk', 'joint')
    add(seakit.pod('Cushion', ANEM + Vector((0, 0, 0.012)), (0.085, 0.085, 0.035), (0.7, 0.8), seg=(28, 14)), cushion,
        'anemone')
    add(kit.torus('CushionRing', 0.082, 0.007, seg=(32, 8), location=ANEM + Vector((0, 0, 0.004))), m['bezel'], 'anemone')
    for i, (x, y) in enumerate(stalk_points()):
        base = ANEM + Vector((x, y, 0.035))
        top = base + Vector((0, 0, 0.065))
        add(seakit.bar(f'Tentacle{i}', base - Vector((0, 0, 0.01)), top, 0.0085), stalk, f'anemone.{i}')
        add(seakit.pod(f'Tip{i}', top + Vector((0, 0, 0.004)), (0.0125, 0.0125, 0.0125), (0.9, 0.9), seg=(12, 8)),
            m['dot'](3), f'anemone.{i}')

    return looks.finish(kit.armature('ClownRig', rig_bones()), parts, skin, m)
