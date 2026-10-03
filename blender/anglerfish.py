"""Dusk, the crew's robot anglerfish: a round, dark-shelled deep-sea fish with a screen face
set high on its front and a big toy underbite below it: a hinged lower jaw (jaw) that juts
out past the face, its dark tray ringed with blunt ivory teeth, a few little ones hanging from
the upper lip. Over its head a bendy rod of four rounded segments (lure.1 .. lure.4) arcs
forward and down, ending in the lure: a round bulb that is the beacon (so it changes colour
with the mood) in a lit halo ring (Dot1). It is the fish's own light: when it goes out, the
fish is in the dark.

Two round flippers, a rounded dorsal fin with three little lamps (Dot2), two rows of flank
lamps (Dot0) and a panel seam round the middle; a short tail stalk (tail.1, tail.2) ending in
a rounded fan. Cute, not scary: the teeth are chunky pegs and the mouth is wide, not deep.
Faces -Y like the rest of the crew; about 0.4 m tall with the lure and 0.55 m long, and it
floats: its origin is under the belly.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'anglerfish'
PREVIEW = dict(lift=0.04, width=0.5)

HULL = dict(c=(0, 0.02, 0.15), r=(0.13, 0.15, 0.125), e=(0.78, 0.86))
SCREEN = dict(c=(0, -0.114, 0.178), r=(0.082, 0.02, 0.05), bezel=0.007)
JAW_PIVOT = Vector((0, -0.075, 0.1))
LURE = [(0, -0.03, 0.268), (0, -0.04, 0.335), (0, -0.09, 0.39), (0, -0.16, 0.39), (0, -0.195, 0.352)]
TAIL = [(0, 0.15, 0.15), (0, 0.215, 0.15), (0, 0.28, 0.15)]
LURE_BONES = ('lure.1', 'lure.2', 'lure.3', 'lure.4')


def rig_bones():
    v = Vector
    sc = v(SCREEN['c'])
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', HULL['c'], (HULL['c'][0], HULL['c'][1], HULL['c'][2] + 0.1), 'root'),
        ('face', sc, sc + v((0, -0.05, 0)), 'body'),
        ('jaw', JAW_PIVOT, JAW_PIVOT + v((0, -0.12, 0)), 'body'),
        ('dorsal', (0, 0.1, 0.26), (0, 0.14, 0.31), 'body'),
        ('fin.L', (0.12, -0.02, 0.12), (0.19, 0.0, 0.09), 'body'),
        ('fin.R', (-0.12, -0.02, 0.12), (-0.19, 0.0, 0.09), 'body'),
    ]
    b, _ = seakit.chain('lure', 'body', LURE)
    bones += b
    b, _ = seakit.chain('tail', 'body', TAIL)
    bones += b
    return bones


def hull(name, grow=0.0):
    h = HULL
    obj = seakit.pod(name, h['c'], tuple(r * (1 + grow) for r in h['r']), h['e'], seg=(44, 28))
    kit.apply_transforms(obj)
    return obj


def side_x(y, z):
    """About how far out the flank is at (y, z)."""
    h = HULL
    k = 1 - ((y - h['c'][1]) / h['r'][1]) ** 2 - ((z - h['c'][2]) / h['r'][2]) ** 2
    return h['r'][0] * math.sqrt(max(k, 0.0)) * 1.04


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    fin = m['role']('Fin', 'joint')
    tooth = m['role']('Tooth', 'joint')
    h = HULL
    line = h['c'][2] - 0.045
    add(kit.cut(hull('Hull'), (0, 0, 1), line), m['shell'], 'body')
    add(kit.cut(hull('Belly'), (0, 0, -1), -line), m['role']('Belly'), 'body')
    seam = kit.cut(hull('Seam', 0.02), (0, 0, 1), line - 0.004)
    add(kit.cut(seam, (0, 0, -1), -line - 0.004), m['bezel'], 'body')
    ring = kit.cut(hull('Panel', 0.016), (0, 1, 0), 0.075 - 0.004)
    add(kit.cut(ring, (0, -1, 0), -(0.075 + 0.004)), m['bezel'], 'body')

    # The face, high on the front.
    s = SCREEN
    glass, rim = kit.screen('Angler', s['r'], s['c'], s['bezel'], e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')

    # The mouth: a dark socket under the screen, the jaw's tray, and its teeth.
    add(seakit.pod('Socket', (0, -0.1, 0.108), (0.092, 0.03, 0.026), (0.6, 0.8), seg=(24, 10)), m['bezel'], 'body')
    for i, x in enumerate((-0.058, -0.02, 0.02, 0.058)):
        add(seakit.pod(f'Upper{i}', (x, -0.122, 0.105), (0.0105, 0.0105, 0.015), (0.8, 0.8), seg=(12, 8)), tooth, 'body')
    add(seakit.pod('Tray', (0, -0.145, 0.085), (0.1, 0.07, 0.03), (0.6, 0.8), seg=(32, 14)), m['shell'], 'jaw')
    add(seakit.pod('Gum', (0, -0.145, 0.108), (0.088, 0.058, 0.008), (0.6, 0.9), seg=(28, 8)), m['bezel'], 'jaw')
    add(seakit.pod('Chin', (0, -0.2, 0.082), (0.052, 0.022, 0.026), (0.7, 0.8), seg=(20, 10)), m['shell'], 'jaw')
    for i in range(7):
        a = math.radians(-78 + i * 26)
        add(seakit.pod(f'Tooth{i}', (0.084 * math.sin(a), -0.145 - 0.06 * math.cos(a), 0.12),
                       (0.0125, 0.0125, 0.018), (0.8, 0.8), seg=(12, 8)), tooth, 'jaw')
    add(seakit.pod('JawHingeL', (0.09, -0.075, 0.1), (0.014, 0.014, 0.014), (0.8, 0.8), seg=(12, 8)), m['bezel'], 'body')
    add(seakit.pod('JawHingeR', (-0.09, -0.075, 0.1), (0.014, 0.014, 0.014), (0.8, 0.8), seg=(12, 8)), m['bezel'], 'body')

    # The lure: collar, a bendy rod of four segments, and the bulb in a lit halo.
    add(kit.torus('LureCollar', 0.022, 0.007, seg=(24, 8), location=LURE[0]), m['bezel'], 'body')
    radii = (0.0095, 0.0085, 0.0075, 0.0068)
    seakit.chain_pods('Rod', LURE, radii, add, m['joint'], bone='lure', e=(0.7, 0.9), seg=(14, 8), overlap=0.1)
    for i in range(1, 4):
        add(seakit.pod(f'RodJoint{i}', LURE[i], (0.0105, 0.0105, 0.0105), (0.8, 0.8), seg=(12, 8)), m['bezel'],
            f'lure.{i}')
    tip = Vector(LURE[-1])
    add(seakit.pod('Socket2', tip + Vector((0, 0, 0.004)), (0.02, 0.02, 0.014), (0.8, 0.8), seg=(16, 10)), m['bezel'],
        'lure.4')
    add(seakit.pod('Bulb', tip + Vector((0, 0, -0.026)), (0.032, 0.032, 0.034), (0.95, 0.95), seg=(24, 16)),
        m['beacon'], 'lure.4')
    add(kit.torus('Halo', 0.041, 0.0055, seg=(32, 8), location=tip + Vector((0, 0, -0.026))), m['dot'](1), 'lure.4')

    # Flippers, a dorsal fin with lamps, flank lamps.
    for sfx, sx in (('L', 1), ('R', -1)):
        add(seakit.pod(f'Hub{sfx}', (sx * 0.125, -0.02, 0.12), (0.016, 0.016, 0.016), (0.7, 0.7), seg=(16, 10)),
            m['bezel'], f'fin.{sfx}')
        add(seakit.fan(f'Flipper{sfx}', (sx * 0.125, -0.02, 0.12), (sx * 0.8, 0.45, -0.35), (0.036, 0.008, 0.06),
                       (0, 0, 1)), fin, f'fin.{sfx}')
        for i, y in enumerate((-0.04, 0.03, 0.1)):
            z = 0.145 - 0.012 * i
            x = side_x(y, z)
            add(seakit.flat_on(f'Lamp{sfx}{i}', (sx * x, y, z), (sx * 0.9, 0.0, 0.2), (0.0125, 0.0125, 0.007), seg=14),
                m['dot'](0), 'body')
    add(seakit.fan('DorsalFin', (0, 0.1, 0.262), (0, 0.7, 0.7), (0.02, 0.008, 0.07), (1, 0, 0), taper=0.6),
        fin, 'dorsal')
    add(seakit.pod('DorsalHub', (0, 0.1, 0.262), (0.022, 0.03, 0.016), (0.7, 0.8), seg=(16, 10)), m['bezel'], 'dorsal')
    for i in range(3):
        add(seakit.pod(f'Dorsal{i}', (0, 0.0 + i * 0.045, 0.272 - 0.002 * i), (0.0095, 0.0095, 0.0095), (0.9, 0.9),
                       seg=(12, 8)), m['dot'](2), 'body')

    # The tail: a stalk with a ring, and a rounded fan of two lobes.
    t0, t1, t2 = (Vector(p) for p in TAIL)
    add(seakit.bar('Stalk', t0 + Vector((0, -0.03, 0)), t1 + Vector((0, 0.01, 0)), 0.06, e=(0.7, 0.9)), m['shell'],
        'tail.1')
    add(kit.torus('StalkRing', 0.05, 0.0065, seg=(24, 8), location=t1 + Vector((0, 0.02, 0)), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'tail.1')
    add(seakit.bar('Peduncle', t1, t2, 0.035, e=(0.7, 0.9)), m['shell'], 'tail.2')
    for sfx, sz in (('U', 1), ('D', -1)):
        add(seakit.fan(f'Tail{sfx}', t2, (0, 0.85, sz * 0.55), (0.05, 0.009, 0.085), (1, 0, 0), taper=0.45), fin, 'tail.2')
    add(seakit.pod('TailHub', t2, (0.016, 0.016, 0.016), (0.7, 0.7), seg=(16, 10)), m['bezel'], 'tail.2')

    return looks.finish(kit.armature('AnglerRig', rig_bones()), parts, skin, m)
