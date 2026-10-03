"""Tansy, the crew's robot Abyssinian: slender and lithe, a tall, fine-boned cat on long thin legs
with a long thin tail, a small wedge of a head carrying very large ears, a long neck. The
signature is the ticked coat: the body, legs, neck and tail are banded all over with fine dark
lines (thin rings round each part, close together, like the bands on a hair), a dark line
down the spine, and the dark eyeliner that sweeps out from each side of the screen toward
the ears. Faces -Y like the rest of the crew; about 0.8 m to the ear tips.
"""

import math

from mathutils import Vector

import catkit
import kit

FACE = 'abyssinian'
PREVIEW = dict(lift=0.0, width=0.8)

P = dict(
    face=FACE,
    head=dict(radii=(0.14, 0.12, 0.12), center=(0, -0.32, 0.55), e=0.55),
    screen=dict(radii=(0.118, 0.085, 0.075), center=(0, -0.4, 0.55), bezel=0.008, e=0.45),
    neckpart=dict(radii=(0.072, 0.1, 0.12), center=(0, -0.22, 0.49), e=0.7, tilt=-0.5),
    body=dict(radii=(0.095, 0.27, 0.095), center=(0, 0.06, 0.34), e=0.55, tilt=0.03),
    ear=dict(x=0.098, y=-0.32, z=0.665, tilt=0.2, inset=0.022, sy=0.4,
             profile=[(0.0, 0.2), (0.03, 0.185), (0.07, 0.12), (0.098, 0.0)]),
    leg=dict(x=0.062, front=-0.16, back=0.28, top=0.32, bottom=0.04, r=0.026, r_top=0.032, r_top_back=0.04,
             hock=0.025),
    paw=dict(radii=(0.036, 0.05, 0.026), e=0.45),
    tail=[(0, 0.32, 0.36), (0, 0.5, 0.37), (0, 0.66, 0.32), (0, 0.78, 0.25), (0, 0.85, 0.16)],
    tail_r=(0.034, 0.016),
    tail_bones=4,
    tail_rings=[(0.9, 1.01)],
    hips=(0.28, 0.34),
    neck=(-0.2, 0.46),
    collar=dict(center=(0, -0.2, 0.48), major=0.084, minor=0.011, tilt=0.5),
    tag=dict(r=0.02, center=(0, -0.28, 0.4)),
    whiskers=0.055,
)


def ticks(add, m, c):
    """The ticking: fine dark rings round the body, neck, legs and tail, and a line down the spine."""
    tick = m['role']('Tick', 'joint')
    b = P['body']
    ys = [b['center'][1] - b['radii'][1] * 0.86 + 0.034 * i for i in range(int(b['radii'][1] * 1.72 / 0.034) + 1)]
    for i, y in enumerate(ys):
        pts = catkit.ring_about_y(b['center'], b['radii'], b['e'], y, lift=1.006, zmin=-0.02)
        if len(pts) > 6:
            c.seam(f'Tick.{i}', pts, 0.0024, tick, 'body')
    nk = P['neckpart']
    for i, y in enumerate((-0.27, -0.235, -0.2, -0.165)):
        pts = catkit.ring_about_y(nk['center'], nk['radii'], nk['e'], y, lift=1.01, zmin=-0.03)
        if len(pts) > 6:
            # The neck is tilted: lift the points to follow it a little.
            c.seam(f'NeckTick.{i}', pts, 0.0024, tick, 'body')
    # The spine line.
    spine = []
    for i in range(24):
        y = b['center'][1] - b['radii'][1] * 0.9 + (b['radii'][1] * 1.8) * i / 23
        p, n = c.body_point((0, y - b['center'][1], 1.0), lift=0.002)
        spine.append(tuple(p))
    c.seam('Spine', spine, 0.0045, tick, 'body')
    # Rings round each leg, and a pair round each ankle.
    for nm, x, y, top in catkit.leg_spots(P['leg']):
        bone = f'leg.{nm}'
        r = P['leg']['r']
        for k, z in enumerate((0.07, 0.1, 0.13, 0.16, 0.19, 0.22, 0.25, 0.28)):
            if z < top - 0.01:
                add(kit.torus(f'LegTick.{nm}{k}', r * (1.28 - 0.14 * (z - 0.07) / 0.2) + 0.002, 0.0022, seg=(16, 4),
                              location=(x, y, z)), tick, bone)
    # The tail: close rings all along it.
    pts = kit.spline(P['tail'], 40)
    r0, r1 = P['tail_r']
    n = P['tail_bones']
    for i in range(3, len(pts) - 3, 2):
        t = i / (len(pts) - 1)
        a, bb = Vector(pts[i - 1]), Vector(pts[i + 1])
        rot = Vector((0, 0, 1)).rotation_difference((bb - a).normalized()).to_euler()
        add(kit.torus(f'TailTick.{i}', r0 + (r1 - r0) * t + 0.0015, 0.0022, seg=(14, 4), location=tuple(pts[i]),
                      rotation=tuple(rot)), tick, f'tail.{min(int(t * n), n - 1) + 1}')


def face_marks(add, m, c):
    """The eyeliner: a dark line from each corner of the screen sweeping out and up, and a thin
    line over the brow; a lighter chin and chest bib; a dark nose bridge."""
    tick = m['role']('Tick', 'joint')
    sc = P['screen']
    cx, cy, cz = sc['center']
    sx, sy, sz = sc['radii']
    hc = P['head']['center']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = [(side * (sx * 0.78), cy - sy * 0.55, cz + 0.002), (side * (sx + 0.03), cy - sy * 0.35, cz + 0.012),
               (side * (sx + 0.065), cy - sy * 0.1, cz + 0.03), (side * (sx + 0.085), cy + 0.01, cz + 0.055)]
        c.seam(f'Liner.{sfx}', kit.spline(pts, 12), 0.0045, tick, 'head')
        # Brow line: over the screen, toward the ear.
        pts = [(side * 0.02, cy - sy * 0.35, cz + sz * 1.02), (side * 0.07, cy - sy * 0.2, cz + sz * 1.08),
               (side * 0.115, cy + 0.01, cz + sz * 1.2)]
        c.seam(f'Brow.{sfx}', kit.spline(pts, 10), 0.0035, tick, 'head')
    add(kit.superellipsoid('Bib', (0.05, 0.03, 0.07), 0.5, 0.6, seg=(20, 12), location=(0, -0.265, 0.36)),
        m['role']('Bib', 'joint'), 'body')


def build(look='ink', flame=None):
    return catkit.build(look, flame, P, [ticks, face_marks], name='Abyssinian')
