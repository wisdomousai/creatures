"""The crew's robot goat kid: a lean, springy toy on the hoof kit, a cream barrel on slim dark
legs with ball-joint knees and little split hooves, a tan face with a screen, two upright
ears that stick out sideways and up, a pair of small curved horn nubs each tipped with a lit
cap (Dot2, they glow when it butts), a beard plate of three small stacked plates under the
chin, a dark stripe plate down its back and a short perky tail pointing up. Lights: the tail
tip (Dot0), the ear hinges (Dot1) and the horn caps (Dot2). Faces -Y like the rest of the
crew; about 0.58 m to the horn tips.
"""

import math

from mathutils import Vector

import hoofkit as hk
import kit

FACE = 'goat'
PREVIEW = dict(lift=0.0, width=0.5)

P = dict(
    face=FACE,
    body=dict(radii=(0.11, 0.17, 0.105), center=(0, 0.04, 0.315), e=0.6),
    hips=(0.19, 0.315),
    neck=dict(points=[(0, -0.1, 0.34), (0, -0.14, 0.395), (0, -0.165, 0.44)], r=(0.062, 0.052), base=(-0.09, 0.345),
              role='Face'),
    head=dict(radii=(0.095, 0.1, 0.092), center=(0, -0.215, 0.445), e=0.62, role='Face'),
    # 1.6:1, like the goat's face layout (512 x 320)
    screen=dict(radii=(0.078, 0.026, 0.049), center=(0, -0.308, 0.46), bezel=0.008),
    muzzle=dict(radii=(0.046, 0.05, 0.036), center=(0, -0.275, 0.4), e=0.5, role='Face'),
    nose=dict(radii=(0.026, 0.012, 0.016), center=(0, -0.318, 0.402), e=0.6),
    jaw=dict(radii=(0.032, 0.044, 0.014), center=(0, -0.275, 0.355), pivot=(0, -0.215, 0.375), pin=0.07, e=0.5,
             role='Face'),
    # Upright ears that stick out sideways and a little up (a goat's, not a lamb's flop).
    ear=dict(dir=(1, 0.05, 0.42), length=0.115, width=0.052, thick=0.016, x=0.085, y=-0.19, z=0.5, e=0.6, taper=0.55,
             spin=1.57),
    horns=dict(x=0.052, y=-0.195, z=0.53, length=0.07, r=0.0165, start=14, end=-62, lean=22),
    leg=dict(x=0.065, front=-0.1, back=0.2, top=0.25, knee=0.145, r=(0.03, 0.025), ball=0.034, role='Leg',
             hoof=dict(radii=(0.028, 0.034, 0.02), split=True)),
    tail=dict(points=[(0, 0.205, 0.37), (0, 0.235, 0.41), (0, 0.245, 0.46)], bones=2, r=(0.02, 0.014),
              tuft=dict(r=0.026, squash=(0.8, 1, 1.3), role='Beard')),
    bones_extra=[],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [horn_caps, beard, back_stripe, face_bits], name='Goat')


def horn_caps(add, m, c):
    """A lit cap on the tip of each horn nub (Dot2), so the nubs glow when it butts."""
    hs = P['horns']
    for side in (1, -1):
        pts = hk.horn_path((side * hs['x'], hs['y'], hs['z']), hs['length'], hs['start'], hs['end'],
                           hs.get('lean', 0), side)
        tip, prev = Vector(pts[-1]), Vector(pts[-2])
        d = (tip - prev).normalized()
        add(kit.superellipsoid(f'HornCap.{side}', (0.012, 0.012, 0.013), 0.8, 0.8, seg=(14, 10),
                               location=tuple(tip + d * 0.004)), m['dot'](2), 'head')


def beard(add, m, c):
    """The beard plate: three small plates stacked down from the chin, each smaller, on the jaw."""
    for k, (z, r) in enumerate(((0.345, 0.024), (0.322, 0.019), (0.302, 0.013))):
        add(kit.superellipsoid(f'Beard.{k}', (r, 0.01, r * 0.8), 0.6, 0.6, seg=(14, 8),
                               location=(0, -0.288 + 0.002 * k, z)), m['role']('Beard', 'shell'), 'jaw')


def back_stripe(add, m, c):
    """A dark stripe plate down the spine, a row of three flat plates."""
    for k, y in enumerate((-0.08, 0.04, 0.16)):
        p, n = c.body_point((0, y / 0.17, 1.0), lift=-0.004)
        c.panel(f'Stripe.{k}', p, n, (0.034, 0.05, 0.01), m['role']('Stripe', 'joint'), 'body', e=0.5)


def face_bits(add, m, c):
    """Nostrils on the nose, rivets on the cheeks."""
    nz = P['nose']
    cx, cy, cz = nz['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.005, 0.004, 0.006), 0.6, 0.6, seg=(8, 6),
                               location=(side * 0.011, cy - nz['radii'][1] + 0.001, cz - 0.002)), m['bezel'], 'head')
        c.bolt(f'Cheek.Bolt.{side}', (side * 0.095, -0.245, 0.425), 0.0065, 'head')
