"""Roz, the crew's robot Bengal: an athletic young adult, long and muscular, built to climb and
leap. A long low body that rises toward the hips on long legs with heavy thighs, a small
wedge of a head with a wide whisker pad and short rounded ears, and a thick tail with a dark
tip. The signature is the coat: rosettes, each a small plate with a lit core, in two rows
along each flank (Dot5 her left, Dot6 her right) and a cluster on the crown. The collar tag
is the beacon. Faces -Y like the rest of the crew; about 0.7 m to the ear tips.
"""

import math

import catkit
import kit

FACE = 'bengal'
PREVIEW = dict(lift=0.0, width=0.8)

P = dict(
    face=FACE,
    head=dict(radii=(0.15, 0.128, 0.122), center=(0, -0.34, 0.52), e=0.5),
    screen=dict(radii=(0.122, 0.092, 0.085), center=(0, -0.388, 0.52), bezel=0.009, e=0.45),
    neckpart=dict(radii=(0.098, 0.15, 0.105), center=(0, -0.2, 0.45), e=0.6, tilt=-0.45),
    body=dict(radii=(0.125, 0.31, 0.125), center=(0, 0.05, 0.335), e=0.5, tilt=0.07),
    ear=dict(x=0.095, y=-0.34, z=0.64, tilt=0.3, inset=0.024,
             profile=[(0.0, 0.088), (0.02, 0.084), (0.05, 0.055), (0.07, 0.0)]),
    leg=dict(x=0.082, x_back=0.092, front=-0.17, back=0.27, top=0.32, top_front=0.3, bottom=0.04, r=0.034,
             r_top=0.04, r_top_back=0.056, hock=0.03),
    paw=dict(radii=(0.05, 0.062, 0.032), e=0.45),
    tail=[(0, 0.33, 0.34), (0, 0.47, 0.34), (0, 0.58, 0.3), (0, 0.64, 0.22), (0, 0.65, 0.13)],
    tail_r=(0.05, 0.04),
    tail_bones=4,
    tail_rings=[(0.3, 0.38), (0.5, 0.58), (0.7, 0.78), (0.88, 1.01)],
    hips=(0.27, 0.32),
    neck=(-0.22, 0.42),
    collar=dict(center=(0, -0.2, 0.45), major=0.108, tilt=0.5),
    tag=dict(r=0.024, center=(0, -0.27, 0.31)),
    whiskers=0.06,
    bones_extra=[('ripple', (0.1, -0.46, 0.0), (0.1, -0.46, 0.05), 'root')],
)


def rosettes(add, m, c):
    """Rosettes along the flanks: two staggered rows each side, plate and lit core."""
    plate = m['role']('Spot', 'joint')
    rows = [(0.0, [-0.22, -0.1, 0.02, 0.14, 0.26]), (34.0, [-0.16, -0.04, 0.08, 0.2])]
    for side, dot in ((1, 5), (-1, 6)):
        k = 0
        for ang, ys in rows:
            for y in ys:
                a = math.radians(ang + 6 * math.sin(y * 20 + side))
                b = P['body']
                d = (side * math.cos(a) * b['radii'][0], y - 0.0, math.sin(a) * b['radii'][2])
                p, n = c.body_point(d)
                big = 1.0 - 0.18 * (abs(y) > 0.2)
                sfx = 'L' if side > 0 else 'R'
                c.panel(f'Rosette.{sfx}{k}', p, n, (0.03 * big, 0.024 * big, 0.0045), plate, 'body', e=0.5,
                        spin=0.4 * math.sin(k * 2.1), lift=-0.0015)
                c.panel(f'RosetteLight.{sfx}{k}', p, n, (0.0135 * big, 0.0105 * big, 0.0042), m['dot'](dot), 'body',
                        e=0.6, spin=0.4 * math.sin(k * 2.1), lift=0.0042)
                k += 1


def muscle(add, m, c):
    """Heavy shoulders and thighs, a deep chest plate, a spine row."""
    sh = m['shell']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Shoulder.{sfx}', (0.05, 0.095, 0.1), 0.6, 0.6, seg=(24, 16),
                               location=(side * 0.105, -0.13, 0.335)), sh, 'body')
        add(kit.superellipsoid(f'Thigh.{sfx}', (0.058, 0.11, 0.105), 0.6, 0.6, seg=(24, 16),
                               location=(side * 0.105, 0.26, 0.305)), sh, 'body')
    add(kit.superellipsoid('Chest', (0.08, 0.04, 0.09), 0.5, 0.6, seg=(24, 12), location=(0, -0.232, 0.335)),
        m['joint'], 'body')
    for i in range(5):
        y = -0.12 + 0.095 * i
        p, n = c.body_point((0, y, 1.0))
        c.panel(f'Spine{i}', p, n, (0.03, 0.03, 0.006), m['role']('Spot', 'joint'), 'body', lift=0.0)


def head_marks(add, m, c):
    """A cluster of lit rosette plates on the crown, a brow ridge over the screen, whisker pads."""
    for i, (x, dy, dz) in enumerate(((0.0, 0.02, 1.0), (0.06, 0.1, 0.95), (-0.06, 0.1, 0.95))):
        d = (x, P['head']['radii'][1] * (-0.1 + dy), dz * P['head']['radii'][2])
        p, n = c.head_point((x * 2.0, dy * 2.0 - 0.15, dz))
        c.panel(f'CrownRosette{i}', p, n, (0.02, 0.016, 0.004), m['role']('Spot', 'joint'), 'head', lift=-0.001)
        c.panel(f'CrownLight{i}', p, n, (0.009, 0.007, 0.004), m['dot'](7), 'head', lift=0.003)
    hc = P['head']['center']
    sc = P['screen']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Brow.{sfx}', (0.05, 0.012, 0.01), 0.5, 0.6, seg=(16, 8),
                               location=(side * 0.055, sc['center'][1] - 0.075, sc['center'][2] + sc['radii'][2] + 0.01),
                               rotation=(0, side * -0.2, 0)), m['joint'], 'head')
        add(kit.superellipsoid(f'WhiskerPad.{sfx}', (0.05, 0.04, 0.034), 0.6, 0.6, seg=(20, 12),
                               location=(side * 0.055, hc[1] - 0.095, hc[2] - 0.075)), m['role']('Cheek', 'joint'), 'head')


def puddle(add, m, c):
    """A puddle on the floor ahead of her left paw, on a bone of its own (turned with her, shrunk to
    nothing by the site until she wants a drink): a pale disc and two lit rings (Dot8)."""
    x, y = 0.1, -0.46
    add(kit.superellipsoid('Puddle', (0.16, 0.125, 0.006), 0.5, 0.8, seg=(28, 8), location=(x, y, 0.006)),
        m['role']('Water', 'bezel'), 'ripple')
    for i, r in enumerate((0.07, 0.115)):
        add(kit.torus(f'Ripple{i}', r, 0.0045, seg=(30, 6), location=(x, y, 0.013)), m['dot'](8), 'ripple')


def build(look='ink', flame=None):
    return catkit.build(look, flame, P, [rosettes, muscle, head_marks, puddle], name='Bengal')
