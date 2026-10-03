"""Inch, the crew's robot caterpillar: a chain of round segments (a big screen-faced head and
six body segments tapering to the tail), each on a bone of its own, so the site can send waves
and arches down the chain (rippling, inching, rearing up). Each body segment has a lit lamp on
its back in a dark ring (Dot0 at the front to Dot5 at the tail, so a light can run down the
chain), a seam ring and a pair of stub legs, each on its own bone (`leg.L.1` ...), with a pad;
the tail has a lamp (Dot6). The head has short two-bone antennae with glowing tips, cheek and
chin plates and a crown lamp. For the joke: a cocoon (a silk-wrapped capsule on its own bone,
`cocoon`, a lit seam in it, Dot7) that the site grows round him, and two tiny useless wings on
his back (`tinywing.L`, `tinywing.R`), both scaled to nothing until the trick. Faces -Y like
the rest of the crew; about 0.4 m to the antenna tips and 0.6 m long.
"""

import math

import bugkit
import kit
import looks
from bugkit import SIDES, ball, blade

FACE = 'caterpillar'
PREVIEW = dict(lift=0.0, width=0.5)

# (y, radius) for the head and the six segments, front to back; they stand on stub legs.
HEAD = dict(y=-0.285, r=0.102)
SEGS = [(-0.19, 0.092), (-0.095, 0.094), (0.0, 0.092), (0.088, 0.085), (0.172, 0.075), (0.248, 0.062)]
LIFT = 0.036  # how far the segments' lowest points are off the floor


def zc(r):
    return r * 0.94 + LIFT


D = {
    'screen': dict(radii=(0.075, 0.03, 0.047), center=(0, -0.375, 0.145), bezel=0.007),
    'antenna': [(0.04, -0.3, 0.215), (0.062, -0.318, 0.265), (0.08, -0.33, 0.295)],
    'wing': dict(root=(0.03, -0.095, 0.205), tip=(0.13, -0.085, 0.33), width=0.085, thick=0.007),
    'cocoon': dict(radii=(0.135, 0.34, 0.14), center=(0, -0.02, 0.145)),
}


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('head', (0, -0.21, 0.12), (0, -0.3, 0.14), 'root'),
        ('cocoon', (0, -0.05, 0.14), (0, 0.2, 0.14), 'root'),
    ]
    for k, (y, r) in enumerate(SEGS, 1):
        bones.append((f'seg.{k}', (0, y - 0.04, zc(r) - 0.03), (0, y + 0.05, zc(r)), 'root'))
    for side, sfx in SIDES:
        w = D['wing']
        bones.append((f'tinywing.{sfx}', bugkit.mirror(w['root'], side), bugkit.mirror(w['tip'], side), 'seg.2'))
        bones += bugkit.antenna_bones(side, sfx, D['antenna'])
        for k, (y, r) in enumerate(SEGS, 1):
            bones.append((f'leg.{sfx}.{k}', (side * r * 0.62, y, 0.085), (side * r * 0.78, y, 0.01), f'seg.{k}'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The head, a bigger ball than the rest, with its screen, cheeks, chin and crown lamp.
    hy, hr = HEAD['y'], HEAD['r']
    hz = zc(hr) + 0.012
    add(kit.superellipsoid('Head', (hr * 1.08, hr, hr * 0.98), 0.85, 0.9, seg=(40, 28), location=(0, hy, hz)),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Caterpillar', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for bx in (-1, 1):
        add(kit.superellipsoid(f'Cheek.{bx}', (0.022, 0.012, 0.018), 0.5, 0.6, seg=(14, 8),
                               location=(bx * 0.095, hy - 0.052, hz - 0.032)), m['bezel'], 'head')
        add(kit.superellipsoid(f'Pod.{bx}', (0.013, 0.028, 0.028), 0.5, 0.6, seg=(14, 10),
                               location=(bx * (hr * 1.08 + 0.002), hy + 0.006, hz)), m['joint'], 'head')
    add(kit.superellipsoid('Chin', (0.05, 0.012, 0.008), 0.4, 0.6, seg=(16, 6),
                           location=(0, hy - 0.087, hz - 0.074)), m['joint'], 'head')
    add(kit.superellipsoid('Lamp', (0.017, 0.017, 0.012), 0.8, 1.0, seg=(16, 10),
                           location=(0, hy - 0.012, hz + hr * 0.98 + 0.0)), m['beacon'], 'head')
    bugkit.antennae(add, m, D['antenna'], r=(0.0105, 0.008), tip=0.022)

    # The body: six round segments, each with a seam ring in front, a lamp on its back, stubs.
    for k, (y, r) in enumerate(SEGS, 1):
        z = zc(r)
        bone = f'seg.{k}'
        add(kit.superellipsoid(f'Seg.{k}', (r * 1.04, r * 1.0, r * 0.94), 0.85, 0.9, seg=(30, 20),
                               location=(0, y, z)), m['shell'], bone)
        add(kit.torus(f'Seam.{k}', r * 0.78, 0.0085, seg=(32, 6), location=(0, y - r * 0.82, z),
                      rotation=(math.pi / 2, 0, 0)), m['joint'], bone)
        add(kit.superellipsoid(f'Ring.{k}', (0.04 * r / 0.09 + 0.01,) * 2 + (0.013,), 0.5, 1.0, seg=(24, 8),
                               location=(0, y - 0.004, z + r * 0.9)), m['joint'], bone)
        add(kit.superellipsoid(f'Dot{k - 1}', (0.029 * r / 0.09 + 0.006,) * 2 + (0.012,), 0.5, 1.0, seg=(24, 8),
                               location=(0, y - 0.004, z + r * 0.9 + 0.003)), m['dot'](k - 1), bone)
        # A bolt each side, and a small belly plate.
        for side in (-1, 1):
            add(bugkit.studs(f'Bolt.{k}.{side}', [(side * r * 0.97, y, z + r * 0.15)], 0.0065), m['bezel'], bone)
    # The tail lamp.
    ty, tr = SEGS[-1]
    add(kit.superellipsoid('TailLamp', (0.022, 0.016, 0.022), 0.7, 1.0, seg=(16, 10),
                           location=(0, ty + tr * 0.98, zc(tr) + 0.004)), m['dot'](6), 'seg.6')

    # Stub legs: a short rounded post and a pad each, three pairs of them for the front half.
    for side, sfx in SIDES:
        for k, (y, r) in enumerate(SEGS, 1):
            top, foot = (side * r * 0.62, y, 0.085), (side * r * 0.78, y, 0.012)
            add(bugkit.segment(f'Stub.{sfx}.{k}', top, foot, 0.019, 0.019, e=(0.8, 0.8), seg=(14, 8), over=1.0),
                m['joint'], f'leg.{sfx}.{k}')
            add(kit.superellipsoid(f'Pad.{sfx}.{k}', (0.026, 0.03, 0.008), 0.4, 0.6, seg=(14, 8),
                                   location=(foot[0], foot[1] - 0.004, 0.008)), m['shell'], f'leg.{sfx}.{k}')

    # The cocoon, for the joke: a silk capsule with wrapped bands and a lit seam. Scaled to
    # nothing until the trick.
    c = D['cocoon']
    cx, cy, cz = c['center']
    add(kit.superellipsoid('Cocoon', c['radii'], 0.9, 0.9, seg=(32, 22), location=c['center']),
        m['role']('Silk', 'bezel'), 'cocoon')
    for i, f in enumerate((-0.6, -0.2, 0.2, 0.6)):
        r = c['radii'][0] * (1 - abs(f) ** 2.2) ** 0.45
        add(kit.torus(f'Wrap.{i}', r + 0.002, 0.009, seg=(36, 6), location=(0, cy + f * c['radii'][1], cz),
                      rotation=(math.pi / 2, 0, 0)), m['joint'], 'cocoon')
    add(kit.superellipsoid('Crack', (0.012, 0.012, 0.1), 0.5, 1.0, seg=(12, 10),
                           location=(0, cy - c['radii'][1] * 0.1, cz + c['radii'][2] * 0.97)), m['dot'](7), 'cocoon')

    # Two tiny useless wings, for the joke.
    w = D['wing']
    for side, sfx in SIDES:
        add(blade(f'TinyWing.{sfx}', bugkit.mirror(w['root'], side), bugkit.mirror(w['tip'], side), w['width'],
                  w['thick'], e=(0.7, 0.9), taper=-0.2), m['role']('Wing', 'bezel'), f'tinywing.{sfx}')

    return looks.finish(kit.armature('CaterpillarRig', rig_bones()), parts, skin, m)
