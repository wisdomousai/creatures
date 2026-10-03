"""Prism, the crew's robot butterfly: a tiny upright body (a screen-faced head, a fuzzy thorax,
a banded abdomen, two club-tipped antennae, six hair-thin legs) carrying two huge pairs of wings
that are stained glass: each wing a dark leading plate with lit cells set into it, every cell its
own material (Dot0 to Dot6, shared left and right, so the site can set each cell's colour and
brightness and make the glass shimmer; Dot7 is the abdomen's bands). The wings stand in the
plane facing the viewer, hinged at the thorax on bones of their own (fore `wing.L`/`wing.R`,
hind `hind.L`/`hind.R`), so they can open flat, flutter, or close up behind the body like a
resting butterfly's. Faces -Y like the rest of the crew; about 0.55 m to the antenna tips and
0.66 m across.
"""

import math

import bugkit
import kit
import looks
from bugkit import SIDES, ball

FACE = 'butterfly'
PREVIEW = dict(lift=0.0, width=0.7)

D = {
    'abdomen': dict(radii=(0.03, 0.032, 0.08), center=(0, 0.03, 0.15)),
    'thorax': dict(radii=(0.05, 0.045, 0.062), center=(0, 0.0, 0.255)),
    'head': dict(radii=(0.068, 0.054, 0.06), center=(0, -0.045, 0.352), e=(0.55, 0.6)),
    # 4:3, like the butterfly's face layout (256 x 192)
    'screen': dict(radii=(0.05, 0.02, 0.0375), center=(0, -0.085, 0.354), bezel=0.006),
    'antenna': [(0.03, -0.075, 0.4), (0.07, -0.1, 0.48), (0.115, -0.085, 0.55)],
    'legs': [-0.025, 0.0, 0.025],
    'leg': dict(hip=(0.03, 0.2), knee=(0.07, 0.11), foot=(0.078, 0.01)),
    'fore': dict(a=(0.045, 0.045, 0.285), b=(0.34, 0.05, 0.5), width=0.27),
    'hind': dict(a=(0.045, 0.05, 0.245), b=(0.26, 0.055, 0.06), width=0.21),
}
# Cells of each wing: (along 0..1, across -1..1, length, breadth, which Dot).
FORE_CELLS = [
    (0.17, 0.0, 0.24, 0.6, 0),
    (0.48, 0.5, 0.3, 0.4, 1),
    (0.48, -0.42, 0.3, 0.42, 2),
    (0.78, 0.3, 0.26, 0.38, 3),
    (0.8, -0.32, 0.24, 0.36, 1),
    (0.95, 0.0, 0.08, 0.28, 3),
]
HIND_CELLS = [
    (0.2, 0.0, 0.26, 0.56, 4),
    (0.55, 0.32, 0.3, 0.42, 5),
    (0.56, -0.34, 0.3, 0.42, 6),
    (0.87, 0.0, 0.2, 0.4, 5),
]


def shrink(cells, k=0.8):
    return [(u, v, cl * k, cb * k, d) for u, v, cl, cb, d in cells]


def rig_bones():
    f, h = D['fore'], D['hind']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.01, 0.15), (0, 0.0, 0.32), 'root'),
        ('abdomen', (0, 0.01, 0.22), (0, 0.04, 0.08), 'body'),
        ('head', (0, -0.03, 0.31), (0, -0.045, 0.41), 'body'),
    ]
    for side, sfx in SIDES:
        bones.append((f'wing.{sfx}', bugkit.mirror(f['a'], side), bugkit.mirror(f['b'], side), 'body'))
        bones.append((f'hind.{sfx}', bugkit.mirror(h['a'], side), bugkit.mirror(h['b'], side), 'body'))
        bones += bugkit.antenna_bones(side, sfx, D['antenna'])
    lg = D['leg']
    bones += bugkit.leg_bones(D['legs'], lg['hip'], lg['knee'], lg['foot'])
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    a = D['abdomen']
    add(kit.superellipsoid('Abdomen', a['radii'], 0.9, 0.9, seg=(32, 24), location=a['center'], taper=0.25),
        m['shell'], 'abdomen')
    ax, ay, az = a['center']
    for i, f in enumerate((-0.35, 0.15, 0.6)):
        r = a['radii'][0] * (1 - abs(f) ** 2.2) ** 0.45 * (1 + 0.25 * -f * 0.25)
        add(kit.stretch(kit.torus(f'Band{i}', r + 0.0015, 0.0075, seg=(32, 8), location=(0, ay, az + f * a['radii'][2])),
                        sz=1.4), m['dot'](7), 'abdomen')

    t = D['thorax']
    add(kit.superellipsoid('Thorax', t['radii'], 0.8, 0.9, seg=(32, 22), location=t['center']),
        m['role']('Fuzz'), 'body')
    add(kit.torus('Belt', 0.047, 0.006, seg=(32, 6), location=(0, 0, 0.225)), m['joint'], 'body')
    for side, sfx in SIDES:
        add(ball(f'Hinge.{sfx}', (side * 0.05, 0.04, 0.28), 0.016, seg=(12, 8)), m['joint'], f'wing.{sfx}')
        add(ball(f'HindHinge.{sfx}', (side * 0.05, 0.045, 0.24), 0.013, seg=(12, 8)), m['joint'], f'hind.{sfx}')

    h = D['head']
    hx, hy, hz = h['center']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(36, 24), location=h['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Butterfly', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for bx in (-1, 1):
        add(kit.superellipsoid(f'Cheek.{bx}', (0.016, 0.008, 0.012), 0.5, 0.6, seg=(12, 8),
                               location=(bx * 0.058, hy - 0.04, hz - 0.022)), m['bezel'], 'head')
    add(kit.superellipsoid('Chin', (0.032, 0.008, 0.006), 0.4, 0.6, seg=(14, 6),
                           location=(0, hy - 0.044, hz - 0.052)), m['joint'], 'head')
    add(kit.superellipsoid('Lamp', (0.011, 0.011, 0.008), 0.8, 1.0, seg=(14, 8),
                           location=(0, hy - 0.008, hz + h['radii'][2] - 0.001)), m['beacon'], 'head')

    bugkit.antennae(add, m, D['antenna'], r=(0.0075, 0.0055), tip=0.017, club=True)

    # Stained glass: a dark leading plate and lit cells, fore and hind, on bones of their own.
    f, hd = D['fore'], D['hind']
    for side, sfx in SIDES:
        bugkit.panel(add, m, f'Wing.{sfx}', bugkit.mirror(f['a'], side), bugkit.mirror(f['b'], side), f['width'],
                     0.012, shrink(FORE_CELLS), f'wing.{sfx}', frame='joint', e=(0.8, 0.95))
        bugkit.panel(add, m, f'Hind.{sfx}', bugkit.mirror(hd['a'], side), bugkit.mirror(hd['b'], side), hd['width'],
                     0.012, shrink(HIND_CELLS), f'hind.{sfx}', frame='joint', e=(0.8, 0.95))

    lg = D['leg']
    bugkit.legs(add, m, D['legs'], lg['hip'], lg['knee'], lg['foot'], r=0.0065, pad=(0.012, 0.016, 0.005))

    return looks.finish(kit.armature('ButterflyRig', rig_bones()), parts, skin, m)
