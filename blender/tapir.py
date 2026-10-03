"""Snoot, the crew's robot baby tapir: a round barrel on short legs in the baby's watermelon
pattern, as lit panels: three rows of dashes along each side and one down the spine (Dot2, Dot3,
Dot4 the side rows from the back up, Dot5 the spine, so a light can run over her) with round cream
spots between them. A wedge head with a screen face, small round ears with a pale rim, and her
signature, a short bendy snout in three segments on ball joints (snout.1..3) that ends in a lit
tip (Dot6) and a pair of nostrils. Built on the hoof kit (hoofkit.py), so it has the hoofed
animals' rig plus the snout bones, which are children of the head.

Lights: Dot0 the tail tip, Dot1 the ear hinges, Dot2-5 the stripes, Dot6 the snout tip.
Faces -Y like the rest of the crew; about 0.46 m to the top of the head.
"""

import math

import catkit
import hoofkit as hk
import kit

FACE = 'tapir'
PREVIEW = dict(lift=0.0, width=0.7)

SNOUT = [(0, -0.405, 0.305), (0, -0.445, 0.28), (0, -0.478, 0.245), (0, -0.498, 0.205)]
SNOUT_R = (0.05, 0.044, 0.038, 0.033)

P = dict(
    face=FACE,
    body=dict(radii=(0.175, 0.26, 0.18), center=(0, 0.06, 0.285), e=0.8),
    hips=(0.3, 0.285),
    neck=dict(points=[(0, -0.1, 0.3), (0, -0.2, 0.335)], r=(0.14, 0.12), base=(-0.1, 0.3)),
    head=dict(radii=(0.122, 0.155, 0.122), center=(0, -0.288, 0.35), e=0.7),
    screen=dict(radii=(0.092, 0.066, 0.056), center=(0, -0.368, 0.378), bezel=0.008, e=0.45),
    ear=dict(dir=(0.5, 0.05, 1.0), length=0.075, width=0.08, thick=0.022, x=0.082, y=-0.25, z=0.45, e=0.9,
             taper=0.1, spin=0.0, inner=False),
    leg=dict(x=0.105, front=-0.12, back=0.26, top=0.2, knee=0.11, r=(0.052, 0.046), ball=0.052,
             hoof=dict(radii=(0.042, 0.05, 0.028), split=True)),
    tail=dict(points=[(0, 0.32, 0.33), (0, 0.355, 0.31), (0, 0.37, 0.275)], bones=2, r=(0.022, 0.013)),
    bones_extra=[('snout.1', SNOUT[0], SNOUT[1], 'head'), ('snout.2', SNOUT[1], SNOUT[2], 'snout.1'),
                 ('snout.3', SNOUT[2], SNOUT[3], 'snout.2')],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [snout, stripes, bits], name='Tapir')


def snout(add, m, c):
    """Three segments on ball joints with collar rings, a pale lip, nostrils and a lit tip."""
    for i in range(3):
        a, b = SNOUT[i], SNOUT[i + 1]
        bone = f'snout.{i + 1}'
        add(kit.tube(f'Snout.{i}', [a, b], [SNOUT_R[i], SNOUT_R[i + 1] * 1.03], ring=16)[0],
            m['role']('Snout', 'shell'), bone)
        add(kit.superellipsoid(f'SnoutBall.{i}', (SNOUT_R[i] * 1.1,) * 3, seg=(18, 12), location=a), m['joint'], bone)
        mid = tuple((a[k] + b[k]) / 2 for k in range(3))
        d = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        ring = kit.torus(f'SnoutRing.{i}', SNOUT_R[i] * 1.06, 0.0045, seg=(24, 6), location=mid)
        catkit.orient(ring, mid, d)
        add(ring, m['bezel'], bone)
    tip = SNOUT[3]
    add(kit.superellipsoid('SnoutTip', (0.036, 0.034, 0.028), 0.6, 0.8, seg=(20, 12),
                           location=(0, tip[1] - 0.004, tip[2] - 0.012)), m['dot'](6), 'snout.3')
    for side in (-1, 1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.007, 0.006, 0.005), seg=(8, 6),
                               location=(side * 0.014, tip[1] - 0.026, tip[2] - 0.022)), m['bezel'], 'snout.3')


def stripes(add, m, c):
    """The baby's watermelon pattern as lit dashes along the body, and cream spots between."""
    b = P['body']
    rx, ry, rz = b['radii']
    rows = ((12, 2), (40, 3), (68, 4))  # degrees above the side's horizontal, light
    ys = [-0.62 + 0.22 * i for i in range(7)]
    for a_deg, dot in rows:
        a = math.radians(a_deg)
        for side in (1, -1):
            for k, yy in enumerate(ys):
                # The dashes bend with the barrel: shorter at the ends.
                d = (side * rx * math.cos(a), ry * yy, rz * math.sin(a))
                p, n = catkit.on_surface(b['center'], b['radii'], b['e'], d)
                shrink = 1 - 0.35 * abs(yy) ** 2
                c.panel(f'Stripe.{dot}.{side}.{k}', p, n, (0.011, 0.042 * shrink, 0.006), m['dot'](dot), 'body',
                        e=0.6, lift=-0.002, seg=(10, 6))
        # Round cream spots between the rows, offset by half a dash.
    for a_deg in (26, 54):
        a = math.radians(a_deg)
        for side in (1, -1):
            for k in range(6):
                yy = -0.54 + 0.22 * k + (0.04 if a_deg == 54 else 0)
                d = (side * rx * math.cos(a), ry * yy, rz * math.sin(a))
                p, n = catkit.on_surface(b['center'], b['radii'], b['e'], d)
                c.panel(f'Spot.{a_deg}.{side}.{k}', p, n, (0.0135, 0.0135, 0.006), m['role']('Spot', 'bezel'), 'body',
                        e=0.9, lift=-0.002, seg=(10, 6))
    # The spine row.
    for k, yy in enumerate(ys):
        d = (0, ry * yy, rz)
        p, n = catkit.on_surface(b['center'], b['radii'], b['e'], d)
        c.panel(f'Spine.{k}', p, n, (0.013, 0.042 * (1 - 0.35 * abs(yy) ** 2), 0.006), m['dot'](5), 'body', e=0.6,
                lift=-0.002, seg=(10, 6))


def bits(add, m, c):
    """A pale belly, a few spots on the cheeks, and a seam round the barrel."""
    p, n = c.body_point((0, 0, -1.0), lift=-0.026)
    c.panel('Belly', p, n, (0.09, 0.18, 0.016), m['role']('Belly', 'joint'), 'body', e=0.5)
    h = P['head']
    for side in (1, -1):
        for k, (dy, dz) in enumerate(((0.0, 0.03), (0.04, -0.01))):
            d = (side * h['radii'][0] * 0.95, h['radii'][1] * (-0.1 + dy * 3), h['radii'][2] * (0.2 + dz * 3))
            p, n = catkit.on_surface(h['center'], h['radii'], h['e'], d)
            c.panel(f'Cheek.{side}.{k}', p, n, (0.014, 0.014, 0.006), m['role']('Spot', 'bezel'), 'head', e=0.9,
                    lift=-0.002)
    for i, y in enumerate((0.0,)):
        pts = catkit.ring_about_y(P['body']['center'], P['body']['radii'], P['body']['e'], y + 0.06 + 0.02)
        c.seam(f'Seam{i}', pts, 0.0034, m['joint'], 'body')
