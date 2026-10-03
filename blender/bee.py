"""Dandy, the crew's robot bee: a round striped barrel of an abdomen under a golden thorax
and a big screen-faced head, with three lit bands round the barrel (Dot0 to Dot2, so the
site can light them one by one, or all together when he waggles), a stinger nub, two pairs
of little leaf wings on ball shoulders (a main blade and a smaller hind one hinged on it, so
they blur), two antennae in two bones each with glowing tips, six legs of two bones each,
and on the back pair a pollen basket, a lit pod on the shin (Dot3 left, Dot4 right) that
fills with light as he gathers. The abdomen is its own bone, tipped back a little, so it
can wag. Faces -Y like the rest of the crew; about 0.6 m to the antenna tips.
"""

import math

from mathutils import Vector

import bugkit
import kit
import looks
from bugkit import SIDES, ball, blade

FACE = 'bee'
PREVIEW = dict(lift=0.0, width=0.5)

TILT = 0.28  # the abdomen tipped back, top forward (radians about X)

D = {
    'abdomen': dict(radii=(0.12, 0.12, 0.14), center=(0, 0.035, 0.15), e=(0.8, 1.0)),
    'bands': (-0.42, 0.0, 0.42),
    'thorax': dict(radii=(0.088, 0.08, 0.072), center=(0, -0.045, 0.29)),
    'head': dict(radii=(0.108, 0.084, 0.088), center=(0, -0.088, 0.405), e=(0.55, 0.6)),
    # 4:3, like the bee's face layout (256 x 192)
    'screen': dict(radii=(0.082, 0.03, 0.0615), center=(0, -0.158, 0.408), bezel=0.008),
    'antenna': [(0.046, -0.1, 0.475), (0.082, -0.125, 0.55), (0.125, -0.12, 0.605)],
    'legs': [-0.07, 0.0, 0.07],
    'leg': dict(hip=(0.085, 0.2), knee=(0.152, 0.11), foot=(0.168, 0.012)),
    # Wings: from the shoulder out and up, flat to the viewer (the hind pair smaller, lower).
    'wing': dict(shoulder=(0.06, 0.02, 0.325), tip=(0.3, 0.07, 0.49), width=0.12, thick=0.01),
    'wing2': dict(tip=(0.23, 0.08, 0.335), width=0.075),
}


def rig_bones():
    w, w2 = D['wing'], D['wing2']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.02, 0.12), (0, -0.045, 0.31), 'root'),
        ('abdomen', (0, -0.01, 0.27), (0, 0.07, 0.04), 'body'),
        ('head', (0, -0.07, 0.34), (0, -0.088, 0.47), 'body'),
    ]
    for side, sfx in SIDES:
        sx, sy, sz = w['shoulder']
        bones.append((f'wing.{sfx}', (side * sx, sy, sz), bugkit.mirror(w['tip'], side), 'body'))
        bones.append((f'wing.{sfx}.2', (side * sx, sy + 0.006, sz - 0.01), bugkit.mirror(w2['tip'], side),
                      f'wing.{sfx}'))
        bones += bugkit.antenna_bones(side, sfx, D['antenna'])
    lg = D['leg']
    bones += bugkit.leg_bones(D['legs'], lg['hip'], lg['knee'], lg['foot'])
    return bones


def ring_radius(radii, e1, f):
    """The width of a superellipsoid, as a share of rx, at a height f (of rz) up it."""
    return (1 - abs(f) ** (2 / e1)) ** (e1 / 2)


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The abdomen: a barrel tipped back, a dark shell with three lit bands round it.
    a = D['abdomen']
    rx, ry, rz = a['radii']
    centre = Vector(a['center'])
    rot = (TILT, 0, 0)
    add(kit.superellipsoid('Abdomen', a['radii'], a['e'][0], a['e'][1], seg=(48, 32), location=a['center'],
                           rotation=rot), m['shell'], 'abdomen')
    from mathutils import Euler
    R = Euler(rot).to_matrix()
    for i, f in enumerate(D['bands']):
        major = rx * ring_radius(a['radii'], a['e'][0], f) - 0.004
        pos = centre + R @ Vector((0, 0, f * rz))
        band = kit.torus(f'Band{i}', major, 0.014, seg=(48, 10), location=tuple(pos), rotation=rot)
        add(kit.stretch(band, sz=1.2), m['dot'](i), 'abdomen')
    # Seams: a thin dark ring between the bands, a bolt or two, and a hatch on the back.
    for i, f in enumerate((-0.72, -0.21, 0.21, 0.72)):
        major = rx * ring_radius(a['radii'], a['e'][0], f) + 0.0005
        pos = centre + R @ Vector((0, 0, f * rz))
        add(kit.torus(f'Seam{i}', major, 0.0045, seg=(48, 6), location=tuple(pos), rotation=rot), m['joint'],
            'abdomen')
    # The stinger: a short rounded needle at the bottom back, with a ring where it plugs in.
    sp = centre + R @ Vector((0, 0.0, -rz * 0.96))
    add(kit.superellipsoid('Stinger', (0.016, 0.016, 0.04), 0.7, 1.0, seg=(16, 10),
                           location=(0, sp.y + 0.03, sp.z - 0.006), rotation=(0.55 + TILT, 0, 0), taper=0.3),
        m['joint'], 'abdomen')
    add(kit.superellipsoid('StingerCap', (0.027, 0.027, 0.009), 0.5, 1.0, seg=(18, 6),
                           location=(0, sp.y + 0.008, sp.z + 0.008), rotation=rot), m['bezel'], 'abdomen')
    # A back hatch with two bolts.
    add(kit.superellipsoid('Hatch', (0.05, 0.01, 0.045), 0.4, 0.5, seg=(18, 8),
                           location=(0, centre.y + ry * 0.95, centre.z + 0.0), rotation=rot), m['bezel'], 'abdomen')

    # The thorax, golden in the colour look, with a collar between it and the head.
    t = D['thorax']
    add(kit.superellipsoid('Thorax', t['radii'], 0.8, 0.9, seg=(36, 24), location=t['center']),
        m['role']('Fuzz'), 'body')
    tx, ty, tz = t['center']
    add(kit.torus('Belt', t['radii'][0] * 0.92, 0.008, seg=(40, 6), location=(0, ty, tz - 0.012)), m['joint'], 'body')
    add(kit.stretch(kit.torus('Collar', 0.07, 0.011, seg=(36, 8), location=(0, -0.07, 0.345),
                              rotation=(-0.15, 0, 0)), sy=0.9), m['joint'], 'body')
    for side, sfx in SIDES:
        add(ball(f'Socket.{sfx}', (side * 0.07, 0.015, 0.325), 0.021, seg=(14, 8)), m['joint'], f'wing.{sfx}')
        add(bugkit.studs(f'ThoraxBolt.{sfx}', [(side * 0.082, -0.02, 0.27)], 0.006), m['bezel'], 'body')

    # The head, with its screen, cheek plates, a chin plate and a crown lamp.
    h = D['head']
    hx, hy, hz = h['center']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(40, 28), location=h['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Bee', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for bx in (-1, 1):
        add(kit.superellipsoid(f'Cheek.{bx}', (0.024, 0.012, 0.018), 0.5, 0.6, seg=(14, 8),
                               location=(bx * 0.098, hy - 0.048, hz - 0.03)), m['bezel'], 'head')
        add(kit.superellipsoid(f'Pod.{bx}', (0.014, 0.03, 0.03), 0.5, 0.6, seg=(16, 10),
                               location=(bx * (h['radii'][0] + 0.003), hy + 0.008, hz)), m['joint'], 'head')
        add(bugkit.studs(f'PodBolt.{bx}', [(bx * (h['radii'][0] + 0.016), hy + 0.008, hz)], 0.0055), m['bezel'], 'head')
    add(kit.superellipsoid('Chin', (0.05, 0.012, 0.008), 0.4, 0.6, seg=(16, 6),
                           location=(0, hy - 0.063, hz - 0.082)), m['joint'], 'head')
    add(kit.superellipsoid('Plate', (0.06, 0.045, 0.008), 0.4, 0.5, seg=(24, 8),
                           location=(0, hy - 0.012, hz + h['radii'][2] - 0.006)), m['joint'], 'head')
    add(kit.superellipsoid('Lamp', (0.015, 0.015, 0.011), 0.8, 1.0, seg=(16, 10),
                           location=(0, hy - 0.016, hz + h['radii'][2] + 0.002)), m['beacon'], 'head')

    bugkit.antennae(add, m, D['antenna'], r=(0.0105, 0.0075), tip=0.026)

    # Wings: a leaf from each shoulder and a small hind leaf hinged on it.
    w, w2 = D['wing'], D['wing2']
    sx, sy, sz = w['shoulder']
    for side, sfx in SIDES:
        a0 = (side * sx, sy, sz)
        add(blade(f'Wing.{sfx}', a0, bugkit.mirror(w['tip'], side), w['width'], w['thick'], e=(0.6, 0.9),
                  taper=-0.2), m['role']('Wing', 'bezel'), f'wing.{sfx}')
        add(blade(f'Wing2.{sfx}', (side * sx, sy + 0.006, sz - 0.01), bugkit.mirror(w2['tip'], side), w2['width'],
                  w['thick'], e=(0.6, 0.9), taper=-0.2), m['role']('Wing', 'bezel'), f'wing.{sfx}.2')
        # A vein down the main blade.
        tip = Vector(bugkit.mirror(w['tip'], side))
        vein, _ = kit.tube(f'Vein.{sfx}', [Vector(a0) + Vector((0, -0.007, 0)), tip * 0.93 + Vector(a0) * 0.07
                                           + Vector((0, -0.007, 0))], 0.0045, ring=6)
        add(vein, m['joint'], f'wing.{sfx}')

    lg = D['leg']
    # The back pair carries the pollen baskets.
    bugkit.legs(add, m, D['legs'], lg['hip'], lg['knee'], lg['foot'], r=0.011, pad=(0.022, 0.03, 0.008),
                pods={2: (3, (0.027, 0.03, 0.04))})

    return looks.finish(kit.armature('BeeRig', rig_bones()), parts, skin, m)
