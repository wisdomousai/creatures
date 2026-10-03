"""Mochi, the crew's robot Ragdoll: big and soft-looking, the heaviest and roundest of the cats. A
broad round head and a deep body, a ruff of chunky rounded plates round the neck and cheeks,
overlapping plates down the flanks like a long coat, thick legs ending in big white mittens
and a long plume of a tail built of plates. Colour-pointed: the mask round the screen, the
ears, legs and tail are the dark points. Her screen eyes are blue (the glow of the colour
look). The collar tag is the beacon. Faces -Y like the rest of the crew; about 0.74 m to the
ear tips.
"""

import math

from mathutils import Vector

import catkit
import kit

FACE = 'ragdoll'
PREVIEW = dict(lift=0.0, width=0.8)

P = dict(
    face=FACE,
    head=dict(radii=(0.225, 0.175, 0.165), center=(0, -0.3, 0.485), e=0.62),
    screen=dict(radii=(0.158, 0.1, 0.11), center=(0, -0.4, 0.485), bezel=0.011, e=0.5),
    neckpart=dict(radii=(0.16, 0.14, 0.16), center=(0, -0.17, 0.4), e=0.7, tilt=-0.2),
    body=dict(radii=(0.2, 0.31, 0.185), center=(0, 0.06, 0.3), e=0.62),
    ear=dict(x=0.15, y=-0.3, z=0.625, tilt=0.36, inset=0.028,
             profile=[(0.0, 0.105), (0.026, 0.098), (0.062, 0.065), (0.085, 0.0)]),
    leg=dict(x=0.115, front=-0.12, back=0.26, top=0.22, bottom=0.05, r=0.056, role='Point'),
    paw=dict(radii=(0.07, 0.085, 0.045), e=0.45),
    tail=[(0, 0.32, 0.3), (0, 0.46, 0.34), (0, 0.55, 0.42), (0, 0.58, 0.54), (0, 0.55, 0.66)],
    tail_r=(0.06, 0.05),
    tail_bones=4,
    tail_rings=[(0.0, 0.0)],
    hips=(0.28, 0.3),
    neck=(-0.17, 0.4),
    collar=dict(center=(0, -0.17, 0.4), major=0.17, minor=0.017, tilt=0.35),
    tag=dict(r=0.03, center=(0, -0.3, 0.24)),
    whiskers=0.06,
)


def mask(add, m, c):
    """The dark mask round the screen: a broad plate behind it, and chunky cheek plates."""
    sc = P['screen']
    sx, sy, sz = sc['radii']
    cx, cy, cz = sc['center']
    add(kit.superellipsoid('Mask', (sx + 0.04, sy, sz + 0.04), 0.4, 0.5, seg=(40, 20), location=(cx, cy + 0.016, cz)),
        m['role']('Mask'), 'head')
    hc = P['head']['center']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k in range(3):
            p, n = c.head_point((side * (1.0 - 0.1 * k), -0.2 - 0.12 * k, -0.28 - 0.17 * k))
            c.panel(f'Cheek.{sfx}{k}', p, n, (0.052 - 0.006 * k, 0.04, 0.02), m['role']('Fluff', 'joint'), 'head',
                    e=0.5, lift=0.002)
        # A tuft of plates between the ears.
    for k, x in enumerate((-0.06, 0.0, 0.06)):
        p, n = c.head_point((x, -0.05, 1.0))
        c.panel(f'Crown{k}', p, n, (0.04, 0.035, 0.014), m['role']('Mask'), 'head', e=0.5, lift=0.0)


def ruff(add, m, c):
    """A ruff of chunky plates round the neck: two rings, the outer one longer."""
    fl = m['role']('Fluff', 'joint')
    cx, cy, cz = P['collar']['center']
    for ring, (rad, size, n_) in enumerate(((0.18, 0.062, 12), (0.205, 0.07, 14))):
        for i in range(n_):
            a = 2 * math.pi * (i + 0.5 * ring) / n_
            # Round the neck (axis tilted forward), the front half open to the chest.
            normal = Vector((math.sin(a), -0.55 * math.cos(a) * 0.0 - 0.35, math.cos(a))).normalized()
            if math.cos(a) < -0.9:
                continue
            p = Vector((cx + rad * math.sin(a) * 0.95, cy - 0.01 + 0.03 * ring, cz + rad * math.cos(a) * 0.85 - 0.02 - 0.04 * ring))
            c.panel(f'Ruff{ring}.{i}', p, normal, (size, size * 0.8, 0.02), fl, 'body', e=0.5, lift=0.0, seg=(12, 8))


def coat(add, m, c):
    """Shingled plates down the flanks and over the rump, like a long coat."""
    fl = m['role']('Fluff', 'joint')
    b = P['body']
    for r, (ang, ys) in enumerate(((20, (-0.2, -0.04, 0.12, 0.28)), (48, (-0.12, 0.04, 0.2)), (75, (-0.2, -0.04, 0.12, 0.28)))):
        for side, sfx in ((1, 'L'), (-1, 'R')):
            for k, y in enumerate(ys):
                a = math.radians(ang)
                d = (side * math.cos(a) * b['radii'][0], y, math.sin(a) * b['radii'][2])
                p, n = c.body_point(d)
                c.panel(f'Coat.{sfx}{r}{k}', p, n, (0.06, 0.07, 0.018), fl, 'body', e=0.5, lift=0.003, seg=(12, 8))
    # Back: a row of plates down the spine, and a skirt of them over the rump.
    for k in range(5):
        p, n = c.body_point((0, -0.2 + 0.11 * k, 1.0))
        c.panel(f'Back{k}', p, n, (0.075, 0.06, 0.018), m['role']('Mask'), 'body', e=0.5, lift=0.003, seg=(12, 8))


def plume(add, m, c):
    """The tail: a pair of plates at intervals along it, all the way to a tuft at the tip."""
    pts = kit.spline(P['tail'], 26)
    r0, r1 = P['tail_r']
    n = P['tail_bones']
    for i in range(3, len(pts) - 2, 3):
        t = i / (len(pts) - 1)
        r = r0 + (r1 - r0) * t
        bone = f'tail.{min(int(t * n), n - 1) + 1}'
        a, b = Vector(pts[i - 1]), Vector(pts[i + 1])
        along = (b - a).normalized()
        for side in (1, -1):
            nrm = Vector((side, 0, 0))
            c.panel(f'Plume.{i}.{side}', Vector(pts[i]) + Vector((side * r * 0.65, 0, 0)), nrm,
                    (0.045 + 0.01 * (1 - t), 0.075, 0.02), m['role']('Tail'), bone, e=0.5, seg=(12, 8),
                    spin=math.atan2(along.z, along.y) * 0)
        up = Vector((0, -along.z, along.y)).normalized() * (-1)
        c.panel(f'PlumeTop.{i}', Vector(pts[i]) + up * r * 0.65, up, (0.05, 0.07, 0.02), m['role']('Tail'), bone,
                e=0.5, seg=(12, 8))


def mittens(add, m, c):
    """Big white mittens: a plate over each paw with a seam round the wrist."""
    for nm, x, y, top in catkit.leg_spots(P['leg']):
        bone = f'leg.{nm}'
        add(kit.torus(f'Mitten.{nm}', P['leg']['r'] * 1.12, 0.012, seg=(24, 8), location=(x, y, 0.1)),
            m['role']('Paw', 'joint'), bone)


def build(look='ink', flame=None):
    return catkit.build(look, flame, P, [mask, ruff, coat, plume, mittens], name='Ragdoll')
