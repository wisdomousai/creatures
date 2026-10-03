"""The crew's robot fawn: a small white-tailed deer fawn on long thin wobbly legs. A slight tan
barrel of a body with two rows of lit white spots down the back (Dot2), a smaller head than the
foal's on a thin neck with a long pale muzzle and a dark nose, big wide ears with a pink inside and
a light in each hinge (Dot1), cloven dark hooves, and a short white flag of a tail that stands up
and lights on the tip (Dot0). Smaller than Totter the foal (about 0.72 m to the ear tips, with the
spots and the deer face to tell them apart). Faces -Y like the rest of the crew.
"""

import hoofkit as hk
import kit

FACE = 'fawn'
PREVIEW = dict(lift=0.0, width=0.5)

NECK = [(0, -0.08, 0.37), (0, -0.12, 0.43), (0, -0.145, 0.5)]

P = dict(
    face=FACE,
    body=dict(radii=(0.072, 0.125, 0.072), center=(0, 0.04, 0.34), e=0.6),
    hips=(0.15, 0.34),
    neck=dict(points=NECK, r=(0.038, 0.032), base=(-0.075, 0.37)),
    head=dict(radii=(0.072, 0.088, 0.068), center=(0, -0.17, 0.545), e=0.62),
    # 1.5:1, like the fawn's face layout (512 x 340)
    screen=dict(radii=(0.052, 0.02, 0.034), center=(0, -0.248, 0.558), bezel=0.006),
    muzzle=dict(radii=(0.032, 0.056, 0.026), center=(0, -0.245, 0.508), e=0.5, role='Muzzle'),
    nose=dict(radii=(0.02, 0.011, 0.014), center=(0, -0.3, 0.505), e=0.55),
    ear=dict(dir=(0.82, -0.05, 0.55), length=0.125, width=0.07, thick=0.013, x=0.045, y=-0.145, z=0.595, e=0.6,
             taper=0.6),
    leg=dict(x=0.05, front=-0.075, back=0.14, top=0.3, knee=0.17, r=(0.019, 0.014), ball=0.022, role='Leg',
             hoof=dict(radii=(0.02, 0.026, 0.017), split=True)),
    tail=dict(points=[(0, 0.17, 0.375), (0, 0.205, 0.405), (0, 0.22, 0.45)], bones=2, r=(0.016, 0.02), role='Flag',
              tuft=dict(r=0.036, squash=(0.8, 0.55, 1.9), role='Flag')),
    bones_extra=[],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [spots, face_bits], name='Fawn')


def spots(add, m, c):
    """Two rows of lit white spots down each side of the back (Dot2), a little different in size."""
    import math

    for side in (1, -1):
        for row, (across, drop) in enumerate(((0.4, 0.0), (0.85, 0.0))):
            for k in range(3):
                yy = -0.09 + 0.09 * k + (0.045 if row else 0.0)
                z = math.sqrt(max(0.05, 1 - across * across)) + drop
                p, n = c.body_point((side * across, yy, z), lift=-0.001)
                s = 0.026 + 0.004 * ((k + row) % 2 == 0)
                c.panel(f'Spot.{side}.{row}.{k}', p, n, (s, s, 0.005), m['dot'](2), 'body', e=0.6)


def face_bits(add, m, c):
    nz = P['nose']
    cx, cy, cz = nz['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.005, 0.004, 0.007), 0.6, 0.6, seg=(8, 6),
                               location=(side * 0.012, cy - nz['radii'][1] + 0.001, cz - 0.002)), m['bezel'], 'head')
        c.bolt(f'Cheek.Bolt.{side}', (side * 0.074, -0.18, 0.54), 0.0065, 'head')
