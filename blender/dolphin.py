"""Echo, the crew's robot dolphin: a sleek grey torpedo of a body, widest at a rounded melon
head and tapering to a tail stalk with two swept horizontal flukes (tail.1, tail.2). The screen
face is set into the melon over a short blunt beak with a little smile line either side; a
curved dorsal fin (dorsal), two flippers (fin.L, fin.R), a pale belly under a seam, a lit
blowhole on top (Dot1) and two lit stripes down each flank (Dot0, Dot2).

Four lit rings wait on bones of their own inside the melon (click.0 .. click.3, the beacon's
material so they show against any room): the site sends them out in front of it as the ripples
of a click, and puts them away again. Faces -Y like the rest of the crew; about 0.3 m tall and
0.72 m long, and it floats: its origin is under its belly.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'dolphin'
PREVIEW = dict(lift=0.05, width=0.6, turn=-68)

HULL = dict(c=(0, 0.05, 0.15), r=(0.085, 0.27, 0.09), e=(0.8, 0.88), taper=0.7)
SCREEN = dict(c=(0, -0.222, 0.168), r=(0.058, 0.02, 0.04), bezel=0.006)
TAIL = [(0, 0.25, 0.15), (0, 0.33, 0.15), (0, 0.41, 0.15)]
CLICKS = tuple(f'click.{i}' for i in range(4))


def hull(name, grow=0.0):
    h = HULL
    wide, long, tall = (r * (1 + grow) for r in (h['r'][0], h['r'][1], h['r'][2]))
    obj = kit.superellipsoid(name, (wide, tall, long) if False else (wide, tall, long), *h['e'], seg=(40, 56),
                             taper=h['taper'], location=h['c'], rotation=(-math.pi / 2, 0, 0))
    kit.apply_transforms(obj)
    return obj


def hull_x(y, dz=0.0):
    """How far out the flank is at y, dz above the hull's middle."""
    h = HULL
    s = (y - h['c'][1]) / h['r'][1]
    s = max(-0.999, min(0.999, s))
    sin = abs(s) ** (1 / h['e'][0])
    cp = (1 - sin * sin) ** (h['e'][0] / 2)
    k = 1 - h['taper'] * s / 2
    face = math.sqrt(max(0.0, 1 - (dz / h['r'][2]) ** 2))
    return h['r'][0] * cp * k * face


def rig_bones():
    v = Vector
    sc = v(SCREEN['c'])
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', HULL['c'], (0, HULL['c'][1], HULL['c'][2] + 0.1), 'root'),
        ('face', sc, sc + v((0, -0.05, 0)), 'body'),
        ('dorsal', (0, 0.05, 0.235), (0, 0.1, 0.29), 'body'),
        ('fin.L', (0.08, -0.1, 0.11), (0.16, -0.06, 0.07), 'body'),
        ('fin.R', (-0.08, -0.1, 0.11), (-0.16, -0.06, 0.07), 'body'),
    ]
    b, _ = seakit.chain('tail', 'body', TAIL)
    bones += b
    for i in range(4):
        bones.append((f'click.{i}', (0, -0.2, 0.168), (0, -0.25, 0.168), 'body'))
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
    line = h['c'][2] - 0.032
    add(kit.cut(hull('Hull'), (0, 0, 1), line), m['shell'], 'body')
    add(kit.cut(hull('Belly'), (0, 0, -1), -line), m['role']('Belly'), 'body')
    seam = kit.cut(hull('Seam', 0.018), (0, 0, 1), line - 0.004)
    add(kit.cut(seam, (0, 0, -1), -line - 0.004), m['bezel'], 'body')
    ring = kit.cut(hull('Panel', 0.014), (0, 1, 0), 0.0 - 0.004)
    add(kit.cut(ring, (0, -1, 0), 0.0 - 0.004), m['bezel'], 'body')

    # The melon, the face and the beak.
    add(seakit.pod('Melon', (0, -0.165, 0.168), (0.074, 0.07, 0.066), (0.8, 0.85), seg=(30, 18)), m['shell'], 'body')
    s = SCREEN
    glass, rim = kit.screen('Dolphin', s['r'], s['c'], s['bezel'], e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')
    add(seakit.pod('Beak', (0, -0.285, 0.124), (0.036, 0.058, 0.027), (0.7, 0.8), seg=(24, 14)), m['shell'], 'body')
    add(seakit.pod('Chin', (0, -0.285, 0.106), (0.032, 0.05, 0.016), (0.7, 0.8), seg=(20, 10)), m['role']('Belly'), 'body')
    for sfx, sx in (('L', 1), ('R', -1)):
        add(seakit.pod(f'Smile{sfx}', (sx * 0.0345, -0.29, 0.12), (0.004, 0.044, 0.005), (0.7, 0.8), seg=(12, 8),
                       rotation=(math.radians(8), 0, 0)), m['bezel'], 'body')
        add(seakit.pod(f'Dimple{sfx}', (sx * 0.037, -0.235, 0.111), (0.006, 0.01, 0.01), (0.8, 0.8), seg=(10, 8)), m['bezel'],
            'body')
    add(seakit.pod('Nose', (0, -0.343, 0.126), (0.012, 0.01, 0.01), (0.9, 0.9), seg=(10, 8)), m['bezel'], 'body')

    # Blowhole and flank stripes.
    add(kit.torus('BlowRing', 0.016, 0.0055, seg=(20, 8), location=(0, -0.085, 0.241)), m['bezel'], 'body')
    add(seakit.pod('Blowhole', (0, -0.085, 0.241), (0.015, 0.015, 0.005), (0.8, 0.8), seg=(14, 6)), m['dot'](1), 'body')
    for sx in (1, -1):
        for dz, dot, ys in ((0.03, 0, (-0.1, -0.04, 0.02, 0.08, 0.14)), (-0.005, 2, (-0.06, 0.0, 0.06, 0.12))):
            for i, y in enumerate(ys):
                x = hull_x(y, dz) * 1.02
                add(seakit.pod(f'Stripe{dot}{sx}{i}', (sx * x, y, h['c'][2] + dz), (0.0045, 0.033, 0.0065), (0.8, 0.8),
                               seg=(10, 6)), m['dot'](dot), 'body')

    # Fins: a swept dorsal, round-tipped flippers.
    add(seakit.fan('DorsalFin', (0, 0.05, 0.232), (0, 0.55, 0.85), (0.04, 0.008, 0.075), (1, 0, 0), taper=0.8), fin,
        'dorsal')
    add(seakit.pod('DorsalBase', (0, 0.05, 0.228), (0.02, 0.04, 0.016), (0.7, 0.8), seg=(16, 10)), m['bezel'], 'dorsal')
    for sfx, sx in (('L', 1), ('R', -1)):
        add(seakit.pod(f'Hub{sfx}', (sx * 0.08, -0.1, 0.11), (0.016, 0.016, 0.016), (0.7, 0.7), seg=(16, 10)), m['bezel'],
            f'fin.{sfx}')
        add(seakit.fan(f'Flipper{sfx}', (sx * 0.08, -0.1, 0.11), (sx * 0.75, 0.4, -0.5), (0.03, 0.007, 0.075), (0, 0, 1)),
            fin, f'fin.{sfx}')

    # Tail stalk and flukes.
    t0, t1, t2 = (Vector(p) for p in TAIL)
    add(seakit.bar('Stalk', t0 + Vector((0, -0.04, 0)), t1 + Vector((0, 0.01, 0)), 0.04, e=(0.7, 0.9)), m['shell'], 'tail.1')
    add(kit.torus('StalkRing', 0.033, 0.0055, seg=(24, 8), location=t1, rotation=(math.pi / 2, 0, 0)), m['bezel'], 'tail.1')
    add(seakit.bar('Peduncle', t1, t2, 0.026, e=(0.7, 0.9)), m['shell'], 'tail.2')
    for sfx, sx in (('L', 1), ('R', -1)):
        add(seakit.fan(f'Fluke{sfx}', t2, (sx * 0.9, 0.5, 0), (0.05, 0.008, 0.09), (0, 0, 1)), m['role']('Fluke', 'joint'),
            'tail.2')
    add(seakit.pod('FlukeHub', t2, (0.016, 0.016, 0.012), (0.7, 0.7), seg=(16, 10)), m['bezel'], 'tail.2')

    # The click's rings, waiting inside the melon.
    for i in range(4):
        add(kit.torus(f'Click{i}', 0.05 - 0.003 * i, 0.0065, seg=(36, 8), location=(0, -0.2, 0.168),
                      rotation=(math.pi / 2, 0, 0)), m['beacon'], f'click.{i}')
        # And a second, turned a quarter, so the pulse is a ring from the side as well as from ahead.
        add(kit.torus(f'ClickB{i}', 0.05 - 0.003 * i, 0.0065, seg=(36, 8), location=(0, -0.2, 0.168),
                      rotation=(math.pi / 2, 0, math.pi / 2)), m['beacon'], f'click.{i}')

    return looks.finish(kit.armature('DolphinRig', rig_bones()), parts, skin, m)
