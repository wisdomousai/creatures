"""Hum, the crew's robot baby whale: Nari's cousin without the tusk and much rounder, a big
bulbous head that is nearly half of her, a stubby body behind it that tapers to a tail stalk
curling up into a wide pair of flukes. The head carries a big screen face and a blowhole with a
column of five lit rings waiting inside it (spout.0 .. spout.4, as Nari's), and under the chin
a pleated throat: five lit pleats (Dot0 at the chin .. Dot4 down at the chest) round a 'throat'
bone that swells when she sings. Two small pectoral fins, a cream belly under a seam, a tiny
dorsal bump with a back lamp (Dot5) and a beacon.

Faces -Y; about 0.26 m tall and 0.5 m long; afloat: her origin is just under her belly.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'babywhale'
PREVIEW = dict(lift=0.05, width=0.55)

BODY = dict(radii=(0.092, 0.16, 0.09), center=(0, 0.06, 0.105))
HEAD = dict(radii=(0.118, 0.098, 0.108), center=(0, -0.06, 0.118))
SCREEN = dict(radii=(0.076, 0.02, 0.052), center=(0, -0.152, 0.128), bezel=0.007)
BLOW = Vector((0, -0.05, 0.222))
TAIL = ((0, 0.2, 0.115), (0, 0.255, 0.15), (0, 0.3, 0.2))
PLEATS = 5


def rig_bones():
    c = Vector(BODY['center'])
    sc = Vector(SCREEN['center'])
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', c, c + Vector((0, 0, 0.1)), 'root'),
        ('face', sc, sc + Vector((0, -0.05, 0)), 'body'),
        ('throat', (0, -0.1, 0.07), (0, -0.1, 0.12), 'body'),
        ('fin.L', (0.1, -0.06, 0.06), (0.15, -0.04, 0.035), 'body'),
        ('fin.R', (-0.1, -0.06, 0.06), (-0.15, -0.04, 0.035), 'body'),
        ('tail.1', TAIL[0], TAIL[1], 'body'),
        ('tail.2', TAIL[1], TAIL[2], 'tail.1'),
    ]
    for i in range(5):
        bones.append((f'spout.{i}', BLOW + Vector((0, 0, 0.002)), BLOW + Vector((0, 0, 0.03)), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    shell = m['shell']
    belly = m['role']('Belly')
    fin = m['role']('Fin', 'joint')

    # The body (tapering toward the tail) and the big round head, both split into a back and a
    # cream belly by a seam.
    def body_pod(name, grow=0.0):
        r = BODY['radii']
        obj = kit.superellipsoid(name, (r[0] * (1 + grow), r[2] * (1 + grow), r[1] * (1 + grow)), 0.85, 0.9,
                                 seg=(36, 48), taper=0.55, location=BODY['center'], rotation=(-math.pi / 2, 0, 0))
        kit.apply_transforms(obj)
        return obj

    def head_pod(name, grow=0.0):
        r = HEAD['radii']
        return seakit.pod(name, HEAD['center'], (r[0] * (1 + grow), r[1] * (1 + grow), r[2] * (1 + grow)),
                          (0.9, 0.92), seg=(40, 24))

    line = 0.085
    sm = 0.004
    add(kit.cut(body_pod('Hull'), (0, 0, 1), line), shell, 'body')
    add(kit.cut(body_pod('BodyBelly'), (0, 0, -1), -line), belly, 'body')
    seam = kit.cut(body_pod('Seam', 0.02), (0, 0, 1), line - sm)
    add(kit.cut(seam, (0, 0, -1), -line - sm), m['bezel'], 'body')
    hline = 0.06
    add(kit.cut(head_pod('Head'), (0, 0, 1), hline), shell, 'body')
    add(kit.cut(head_pod('HeadBelly'), (0, 0, -1), -hline), belly, 'throat')
    hseam = kit.cut(head_pod('HeadSeam', 0.02), (0, 0, 1), hline - sm)
    add(kit.cut(hseam, (0, 0, -1), -hline - sm), m['bezel'], 'body')

    # The face.
    sc = SCREEN
    glass, rim = kit.screen('Whale', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')

    # The throat's pleats: lit half rings round the chin, each a little wider than the last.
    hc = Vector(HEAD['center'])
    for i in range(PLEATS):
        y = hc.y - 0.07 + 0.034 * i
        u = (y - hc.y) / HEAD['radii'][1]
        rad = HEAD['radii'][0] * math.sqrt(max(0.05, 1 - u * u)) + 0.003
        ring = kit.torus(f'Pleat{i}', rad, 0.0058, seg=(36, 8), location=(0, y, hc.z - 0.006 * (i == 0)),
                         rotation=(math.pi / 2, 0, 0))
        kit.apply_transforms(ring)
        add(kit.cut(ring, (0, 0, -1), -(hc.z - 0.02)), m['dot'](i), 'throat')

    # The blowhole, with the spout's rings waiting inside it.
    add(kit.torus('BlowRing', 0.017, 0.0055, seg=(24, 8), location=BLOW), m['bezel'], 'body')
    add(seakit.pod('Blowhole', BLOW + Vector((0, 0, -0.003)), (0.016, 0.016, 0.004), (0.6, 1.0), seg=(20, 6)),
        m['joint'], 'body')
    for i in range(5):
        k = 1 - i * 0.14
        add(kit.torus(f'Spout{i}', 0.022 * k, 0.0062 * k, seg=(24, 8), location=BLOW + Vector((0, 0, 0.002))),
            m['beacon'], f'spout.{i}')
        add(seakit.pod(f'Drop{i}', BLOW + Vector((0, 0, 0.004)), (0.007 * k,) * 3, (0.9, 0.9), seg=(12, 8)),
            m['beacon'], f'spout.{i}')

    # A dorsal bump with a lamp, and a beacon behind it.
    add(seakit.pod('Dorsal', (0, 0.11, 0.19), (0.014, 0.03, 0.017), (0.7, 0.8), seg=(18, 10)), fin, 'body')
    add(seakit.pod('Lamp', (0, 0.15, 0.178), (0.0095,) * 3, (0.9, 0.9), seg=(12, 8)), m['dot'](5), 'body')
    add(seakit.pod('Beacon', (0, 0.0, 0.2), (0.0125,) * 3, (0.9, 0.9), seg=(14, 10)), m['beacon'], 'body')

    # Pectoral fins: small rounded paddles at the sides.
    for sfx, s in (('L', 1), ('R', -1)):
        add(seakit.pod(f'Hub{sfx}', (s * 0.1, -0.06, 0.06), (0.016,) * 3, (0.7, 0.7), seg=(16, 10)), m['bezel'],
            f'fin.{sfx}')
        add(seakit.fan(f'Flipper{sfx}', (s * 0.1, -0.06, 0.06), (s * 0.8, 0.45, -0.5), (0.03, 0.0075, 0.054),
                       (0, 0, 1)), fin, f'fin.{sfx}')

    # The tail: a stalk curling up to a wide pair of flukes.
    tail = m['role']('Fluke', 'joint')
    t0, t1, t2 = (Vector(p) for p in TAIL)
    add(seakit.bar('Stalk', t0 + Vector((0, -0.03, -0.01)), t1 + Vector((0, 0.005, 0.004)), 0.036), shell, 'tail.1')
    add(seakit.bar('Stalk2', t1, t2, 0.024), shell, 'tail.2')
    add(kit.torus('StalkRing', 0.026, 0.005, seg=(24, 8), location=t1, rotation=seakit.aim((0, 0, 0), t2 - t1)),
        m['bezel'], 'tail.2')
    for sfx, s in (('L', 1), ('R', -1)):
        add(seakit.fan(f'Fluke{sfx}', t2, (s * 1.0, 0.85, 0.0), (0.07, 0.015, 0.075), (0, 0, 1)), tail, 'tail.2')
    add(seakit.pod('FlukeHub', t2, (0.02, 0.02, 0.014), (0.7, 0.7), seg=(16, 10)), m['bezel'], 'tail.2')

    return looks.finish(kit.armature('BabywhaleRig', rig_bones()), parts, skin, m)
