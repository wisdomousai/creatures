"""The crew's robot donkey: a sturdy grey toy on the hoof kit, a barrel body with a pale belly
panel and a dark cross of plates over the shoulders and down the back, a long head with a pale
muzzle plate and a screen face, a short upright mane of plates along the crest, a tuft on the
end of a long tail, and its signature, two very long upright ears with a lit tip each (Dot2 the
left, Dot3 the right) that it flicks, pins back and brays with. Lights: the tail tip (Dot0),
the ear hinges (Dot1) and the ear tips (Dot2, Dot3). Faces -Y like the rest of the crew;
about 1.1 m to the ear tips.
"""

import math

from mathutils import Vector

import hoofkit as hk
import kit

FACE = 'donkey'
PREVIEW = dict(lift=0.0, width=0.7)

NECK = dict(points=[(0, -0.18, 0.6), (0, -0.26, 0.68), (0, -0.31, 0.77)], r=(0.1, 0.082), base=(-0.16, 0.62))

P = dict(
    face=FACE,
    body=dict(radii=(0.15, 0.31, 0.17), center=(0, 0.06, 0.54), e=0.55),
    hips=(0.32, 0.54),
    neck=NECK,
    head=dict(radii=(0.1, 0.125, 0.105), center=(0, -0.37, 0.79), e=0.62),
    # 1.6:1, like the donkey's face layout (512 x 320)
    screen=dict(radii=(0.078, 0.026, 0.049), center=(0, -0.482, 0.81), bezel=0.008),
    muzzle=dict(radii=(0.062, 0.07, 0.05), center=(0, -0.462, 0.715), e=0.5, role='Muzzle'),
    nose=dict(radii=(0.034, 0.012, 0.022), center=(0, -0.53, 0.713), e=0.6),
    jaw=dict(radii=(0.045, 0.055, 0.018), center=(0, -0.462, 0.655), pivot=(0, -0.37, 0.69), pin=0.09, e=0.5,
             role='Muzzle'),
    # The signature: long upright ears, tipped with a light each.
    ear=dict(dir=(0.28, -0.02, 1.0), length=0.24, width=0.068, thick=0.018, x=0.062, y=-0.325, z=0.87, e=0.6,
             taper=0.62, spin=0.0),
    mane=dict(n=6, along=(0.25, 1.0), size=0.06, width=0.016, lean=0.1, grow=0.0),
    leg=dict(x=0.1, front=-0.16, back=0.3, top=0.44, knee=0.23, r=(0.042, 0.034), ball=0.046,
             hoof=dict(radii=(0.04, 0.05, 0.028), split=True)),
    tail=dict(points=[(0, 0.38, 0.62), (0, 0.45, 0.56), (0, 0.47, 0.42), (0, 0.47, 0.3)], bones=3, r=(0.024, 0.012),
              tuft=dict(r=0.036, squash=(1, 1.1, 1.8), role='Tuft')),
    bones_extra=[],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [ear_tips, belly, cross, face_bits], name='Donkey')


def ear_tips(add, m, c):
    """A lit tip on each ear (Dot2 left, Dot3 right): a small capsule on the end of the plate."""
    e = P['ear']
    for side, dot in ((1, 2), (-1, 3)):
        d = Vector((side * e['dir'][0], e['dir'][1], e['dir'][2])).normalized()
        root = Vector((side * e['x'], e['y'], e['z']))
        tip = root + d * e['length'] * 0.93
        add(kit.superellipsoid(f'EarTip.{side}', (0.017, 0.011, 0.026), 0.7, 0.7, seg=(14, 10), location=tuple(tip),
                               rotation=(0, math.atan2(d.x, d.z) * 1.0, 0)),
            m['dot'](dot), 'ear.L' if side > 0 else 'ear.R')


def belly(add, m, c):
    """A pale panel under the barrel in a rim."""
    p, n = c.body_point((0, 0, -1.0), lift=-0.024)
    c.panel('Belly', p, n, (0.07, 0.17, 0.016), m['role']('Belly', 'joint'), 'body', e=0.5)


def cross(add, m, c):
    """The donkey's dark cross: a stripe down the spine and one over the shoulders."""
    dark = m['role']('Cross', 'joint')
    p, n = c.body_point((0, 0.25, 1.0), lift=-0.006)
    c.panel('Spine', p, n, (0.02, 0.2, 0.012), dark, 'body', e=0.5)
    p, n = c.body_point((0, -0.45, 1.0), lift=-0.006)
    c.panel('Shoulders', p, n, (0.1, 0.022, 0.012), dark, 'body', e=0.5)


def face_bits(add, m, c):
    """Nostrils on the nose plate, rivets on the cheeks."""
    nz = P['nose']
    cx, cy, cz = nz['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.007, 0.004, 0.01), 0.6, 0.6, seg=(8, 6),
                               location=(side * 0.016, cy - nz['radii'][1] + 0.001, cz - 0.002)), m['bezel'], 'head')
        c.bolt(f'Cheek.Bolt.{side}', (side * 0.1, -0.4, 0.75), 0.0075, 'head')
