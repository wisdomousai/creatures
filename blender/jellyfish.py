"""Lumen, the crew's robot jellyfish: a toy robot, not a jellyfish in a robot suit. A domed
bell like a lit lampshade, a screen face on its front, two lit bands round it and a beacon
knob on top; a ring of round lappets at its margin, each a lamp; six long tentacles, each a
chain of five rounded segments with a lit bead on every one (Dot0 at the bell to Dot4 at
the tip, so a light can run down all six at once), and three shorter, fatter oral arms of
three segments between them.

Everything on a chain has a bone of its own, so the site can sway and trail the tentacles
like ribbons (a wave down each) and tangle them. The bell has its own bone to pulse (it
squashes, the tentacles pull in); the lappets and the lit bands ride on it. Dot5 is the
lappet lamps, Dot6 and Dot7 the two bands, so a pulse can run up the bell. Faces -Y like
the rest of the crew; about 0.36 m tall (bell on top, tentacles hanging), and it floats:
its origin is under the longest tentacle's tip.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'jellyfish'
PREVIEW = dict(lift=0.04, width=0.3)

ZB = 0.262  # the bell's centre height
D = {
    'bell': dict(radii=(0.116, 0.116, 0.118), e=(0.85, 1.0), cut=-0.022),
    'screen': dict(radii=(0.056, 0.013, 0.032), bezel=0.006, dz=0.012),
    'rim': dict(major=0.109, minor=0.0075),
    # Lappets: eight round lamps round the margin.
    'lappets': dict(n=8, r=0.112, size=(0.022, 0.022, 0.015)),
    # Lit bands round the bell: height above its centre, and Dot index.
    'bands': [(0.058, 0.0055, 6), (0.088, 0.0048, 7)],
    'knob': dict(r=0.017),
    # Tentacles: how many, how far from the axis, their segment lengths and radii.
    'tent': dict(n=6, r=0.082, turn=0.0, seg=0.042, radii=(0.0125, 0.0112, 0.0098, 0.0082, 0.0066),
                 flare=0.0035),
    'arms': dict(n=3, r=0.03, turn=90, seg=0.038, radii=(0.0155, 0.0135, 0.0105), flare=0.0015),
}


def bell_r(dz):
    """The bell's radius at dz above its centre."""
    h = D['bell']
    e1 = h['e'][0]
    rz = h['radii'][2]
    return h['radii'][0] * max(0.0, 1 - abs(dz / rz) ** (2 / e1)) ** (e1 / 2)


def hang(radial, angle, n, seg, flare, z0):
    """Points of a chain hanging from the bell's margin at `angle` (degrees round Z)."""
    a = math.radians(angle)
    out = Vector((math.cos(a), math.sin(a), 0))
    pts = []
    for i in range(n + 1):
        pts.append(tuple(out * (radial + flare * i) + Vector((0, 0, z0 - seg * i))))
    return pts


def chains():
    """(prefix, index, points, radii, dots) for every tentacle and oral arm."""
    t, a = D['tent'], D['arms']
    out = []
    for k in range(t['n']):
        out.append(('tent', k, hang(t['r'], t['turn'] + 360 * k / t['n'], 5, t['seg'], t['flare'], ZB - 0.016),
                    t['radii'], True))
    for k in range(a['n']):
        out.append(('arm', k, hang(a['r'], a['turn'] + 360 * k / a['n'], 3, a['seg'], a['flare'], ZB - 0.012),
                    a['radii'], False))
    return out


def rig_bones():
    sc = Vector((0, -0.12, ZB))
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, ZB), (0, 0, ZB + 0.1), 'root'),
        ('bell', (0, 0, ZB), (0, 0, ZB + 0.09), 'body'),
        ('face', sc, sc + Vector((0, -0.05, 0)), 'bell'),
        ('knob', (0, 0, ZB + 0.09), (0, 0, ZB + 0.12), 'bell'),
    ]
    for prefix, k, pts, _, _ in chains():
        b, _ = seakit.chain(f'{prefix}.{k}', 'body', pts)
        bones += b
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    bl = D['bell']
    # The bell: a dome, open below, its rim a ring.
    dome = seakit.pod('Bell', (0, 0, ZB), bl['radii'], bl['e'], seg=(40, 24))
    kit.apply_transforms(dome)
    kit.cut(dome, (0, 0, 1), ZB + bl['cut'])
    add(dome, m['role']('Bell'), 'bell')
    add(kit.torus('Rim', D['rim']['major'], D['rim']['minor'], seg=(48, 10),
                  location=(0, 0, ZB + bl['cut'])), m['joint'], 'bell')
    # Under the dome, a dark underside so the open rim reads as a bell.
    add(seakit.pod('Underside', (0, 0, ZB + bl['cut'] + 0.002), (0.108, 0.108, 0.006), (0.6, 1.0), seg=(32, 8)),
        m['bezel'], 'bell')

    # The face.
    sc = D['screen']
    glass, rim = kit.screen('Jelly', sc['radii'], (0, -bell_r(sc['dz']) + 0.006, ZB + sc['dz']), sc['bezel'], e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')

    # Lit bands round the bell.
    for dz, minor, dot in D['bands']:
        add(kit.torus(f'Band{dot}', bell_r(dz) + minor * 0.5, minor, seg=(48, 8), location=(0, 0, ZB + dz)),
            m['dot'](dot), 'bell')
    # The knob on top: the beacon.
    top = bl['radii'][2]
    add(seakit.pod('Knob', (0, 0, ZB + top + 0.004), (D['knob']['r'],) * 2 + (D['knob']['r'] * 0.9,), (0.9, 0.9),
                   seg=(20, 12)), m['beacon'], 'knob')
    add(kit.torus('KnobRing', D['knob']['r'] * 1.05, 0.0045, seg=(24, 8), location=(0, 0, ZB + top - 0.002)),
        m['bezel'], 'bell')

    # Lappets round the margin: round lamps, lit.
    lp = D['lappets']
    for i in range(lp['n']):
        a = 2 * math.pi * (i + 0.5) / lp['n']
        c = (math.cos(a) * lp['r'], math.sin(a) * lp['r'], ZB + bl['cut'] - 0.004)
        add(seakit.pod(f'Lappet{i}', c, lp['size'], (0.7, 0.8), seg=(16, 10),
                       rotation=(0, 0, a)), m['role']('Lappet', 'joint'), 'bell')
        add(seakit.pod(f'Lamp{i}', (c[0] * 1.012, c[1] * 1.012, c[2] - 0.001),
                       (0.0095, 0.0095, 0.0055), (0.8, 0.8), seg=(12, 8), rotation=(0, 0, a)),
            m['dot'](5), 'bell')

    # The tentacles and oral arms: a rounded segment on every bone, a lit bead on each.
    for prefix, k, pts, radii, tentacle in chains():
        mat = m['role']('Tentacle' if tentacle else 'Arm')
        name = f'{prefix}.{k}'
        seakit.chain_pods(f'{prefix}{k}_', pts, radii, add, mat, bone=name, e=(0.7, 0.9), seg=(14, 8), overlap=0.12)
        n = len(pts) - 1
        for i in range(n):
            a, b = Vector(pts[i]), Vector(pts[i + 1])
            mid = a.lerp(b, 0.5)
            r = radii[i]
            bead = seakit.pod(f'Bead{prefix}{k}_{i}', mid, (r * 1.22, r * 1.22, 0.0065), (0.7, 0.9), seg=(14, 6),
                              rotation=seakit.aim(a, b))
            add(bead, m['dot'](i if tentacle else i + 1), f'{name}.{i + 1}')
        if tentacle:
            # A tip lamp on the last one.
            tip = Vector(pts[-1])
            add(seakit.pod(f'Tip{k}', tip, (0.0075, 0.0075, 0.009), (0.8, 0.8), seg=(12, 8)),
                m['dot'](4), f'{name}.{n}')

    return looks.finish(kit.armature('JellyRig', rig_bones()), parts, skin, m)
