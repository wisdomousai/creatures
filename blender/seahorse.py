"""Bobbin, the crew's robot seahorse: a toy robot, not a seahorse in a robot suit. It swims
upright: a round head with a screen face and a short snout, a little three-pronged crown
on top (the middle prong the beacon), a neck curving into a plump chest (four lit belly
bands, Dot1 to Dot4, top to bottom), a back that narrows into a tail of eight rounded
segments curled forward into a spiral with a lamp in its tip (Dot5), a dorsal fin of two
fans on the back (a bone each, to flutter fast) and a small fan at each side of the neck.

The tail is a chain of bones (tail.1 .. tail.8) built already curled, so the site uncurls
it by turning the bones back, to hold on to the frame line or to swim straight. The crown's
side prongs are Dot0. Faces -Y like the rest of the crew; about 0.36 m tall, and it floats:
its origin is under the middle of the curl.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'seahorse'
PREVIEW = dict(lift=0.04, width=0.24)

TAIL = dict(origin=(0, 0.014, 0.1), start=24, bend=-37,
            lengths=(0.042, 0.04, 0.037, 0.034, 0.031, 0.028, 0.025, 0.022),
            radii=(0.033, 0.03, 0.027, 0.0245, 0.022, 0.0195, 0.017, 0.0145))
HY = -0.024  # the head sits forward of the neck's top, nodding forward


def tail_points():
    return seakit.curl(TAIL['origin'], TAIL['start'], TAIL['lengths'], TAIL['bend'])


def rig_bones():
    sc = Vector((0, -0.058 + HY, 0.296))
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.18), (0, 0, 0.26), 'root'),
        ('neck', (0, 0, 0.235), (0, -0.01 + HY, 0.268), 'body'),
        ('head', (0, -0.01 + HY, 0.268), (0, -0.01 + HY, 0.33), 'neck'),
        ('face', sc, sc + Vector((0, -0.05, 0)), 'head'),
        ('snout', (0, -0.05 + HY, 0.27), (0, -0.15 + HY, 0.255), 'head'),
        ('crown', (0, -0.005 + HY, 0.325), (0, -0.005 + HY, 0.36), 'head'),
        ('fin.L', (0.045, -0.005, 0.235), (0.085, 0.01, 0.245), 'body'),
        ('fin.R', (-0.045, -0.005, 0.235), (-0.085, 0.01, 0.245), 'body'),
        ('dorsal.1', (0, 0.05, 0.225), (0, 0.095, 0.24), 'body'),
        ('dorsal.2', (0, 0.048, 0.175), (0, 0.093, 0.185), 'body'),
    ]
    b, _ = seakit.chain('tail', 'body', tail_points())
    return bones + b


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Chest, with its lit belly bands round it; the back narrows below into the tail.
    chest = dict(c=(0, -0.018, 0.18), r=(0.054, 0.062, 0.072), e=(0.7, 0.85))
    add(seakit.pod('Chest', chest['c'], chest['r'], chest['e'], seg=(32, 20)), m['shell'], 'body')
    add(seakit.pod('Back', (0, 0.014, 0.125), (0.036, 0.04, 0.045), (0.8, 0.9), seg=(20, 12)), m['shell'], 'body')
    e1 = chest['e'][0]
    for i, dz in enumerate((0.052, 0.018, -0.016, -0.05)):
        rz = chest['r'][2]
        k = max(0.0, 1 - abs(dz / rz) ** (2 / e1)) ** (e1 / 2)
        add(kit.torus(f'Belly{i}', 0.056 * k + 0.0015, 0.0046, seg=(36, 8),
                      location=(0, chest['c'][1] - 0.001, chest['c'][2] + dz)),
            m['dot'](i + 1), 'body')
    # A seam down the back.
    add(seakit.pod('Spine', (0, 0.058, 0.175), (0.012, 0.009, 0.075), (0.6, 0.8), seg=(14, 10)),
        m['role']('Plate', 'joint'), 'body')

    # Neck and head.
    add(seakit.bar('Neck', (0, 0.006, 0.236), (0, -0.01 + HY, 0.274), 0.032), m['shell'], 'neck')
    add(seakit.pod('Head', (0, -0.012 + HY, 0.288), (0.053, 0.05, 0.046), (0.75, 0.85), seg=(32, 20)), m['shell'], 'head')
    glass, rim = kit.screen('Horse', (0.036, 0.012, 0.027), (0, -0.054 + HY, 0.297), 0.005, e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')

    # The snout: a short tube pointing forward and a little down, a lit-rimmed tip.
    add(seakit.bar('Snout', (0, -0.048 + HY, 0.272), (0, -0.138 + HY, 0.254), 0.0165), m['role']('Snout'), 'snout')
    add(kit.torus('SnoutRing', 0.0155, 0.0045, seg=(20, 8), location=(0, -0.122 + HY, 0.257),
                  rotation=seakit.aim((0, 0, 0), (0, -1, -0.2))), m['bezel'], 'snout')
    add(seakit.pod('Nose', (0, -0.146 + HY, 0.2535), (0.0125, 0.01, 0.0125), (0.8, 0.8), seg=(14, 10)),
        m['joint'], 'snout')

    # A crown of three round prongs on a band; the middle one is the beacon.
    add(kit.torus('CrownBand', 0.029, 0.0055, seg=(28, 8), location=(0, -0.006 + HY, 0.325)), m['bezel'], 'crown')
    for i, (x, z, r) in enumerate(((-0.02, 0.339, 0.0125), (0.02, 0.339, 0.0125))):
        add(seakit.bar(f'Prong{i}', (x * 0.8, -0.006 + HY, 0.326), (x, -0.006 + HY, z), 0.007), m['role']('Crown', 'joint'),
            'crown')
        add(seakit.pod(f'Gem{i}', (x, -0.006 + HY, z + 0.004), (r, r, r), (0.9, 0.9), seg=(14, 10)), m['dot'](0), 'crown')
    add(seakit.bar('ProngM', (0, -0.006 + HY, 0.326), (0, -0.006 + HY, 0.345), 0.0075), m['role']('Crown', 'joint'), 'crown')
    add(seakit.pod('Beacon', (0, -0.006 + HY, 0.352), (0.0145, 0.0145, 0.0145), (0.9, 0.9), seg=(16, 10)),
        m['beacon'], 'crown')

    # Fins: two fans down the back, a small one each side of the neck.
    fin = m['role']('Fin', 'joint')
    add(seakit.fan('Dorsal1', (0, 0.048, 0.225), (0, 1, 0.3), (0.032, 0.0045, 0.04), (1, 0, 0)), fin, 'dorsal.1')
    add(seakit.fan('Dorsal2', (0, 0.046, 0.176), (0, 1, 0.1), (0.032, 0.0045, 0.04), (1, 0, 0)), fin, 'dorsal.2')
    for sfx, s in (('L', 1), ('R', -1)):
        add(seakit.pod(f'Hub{sfx}', (s * 0.046, -0.005, 0.235), (0.011, 0.011, 0.011), (0.7, 0.7), seg=(14, 8)),
            m['bezel'], f'fin.{sfx}')
        add(seakit.fan(f'Pec{sfx}', (s * 0.046, -0.005, 0.235), (s * 0.5, 1, -0.15), (0.017, 0.004, 0.026), (1, 0, 0)),
            fin, f'fin.{sfx}')

    # The tail: eight rounded segments curled forward, a lamp at the tip.
    pts = tail_points()
    seakit.chain_pods('TailSeg', pts, TAIL['radii'], add, m['role']('Tail'), bone='tail', e=(0.7, 0.9), seg=(16, 10),
                      overlap=0.1)
    for i in (1, 3, 5):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        r = TAIL['radii'][i]
        add(seakit.pod(f'TailRing{i}', a.lerp(b, 0.5), (r * 1.18, r * 1.18, 0.0042), (0.7, 0.9), seg=(14, 6),
                       rotation=seakit.aim(a, b)), m['bezel'], f'tail.{i + 1}')
    tip = Vector(pts[-1])
    add(seakit.pod('TailLamp', tip, (0.011, 0.011, 0.011), (0.9, 0.9), seg=(14, 10)), m['dot'](5), 'tail.8')

    return looks.finish(kit.armature('SeahorseRig', rig_bones()), parts, skin, m)
