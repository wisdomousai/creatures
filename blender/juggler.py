"""Caper, a juggling robot with four arms: a striped body, a ruffled collar of plates round the
neck, a round head with a pom-pom on a curl of wire, two arms at the shoulders and two more at the
waist, and round yellow shoes.

Rig: root, body, head, pom, upper_arm/forearm/hand L/R (the top pair), upper_arm2/forearm2/hand2
L/R (the lower pair), leg.L/R, and jball.1..5, five lit balls (Dot0..Dot4) on bones of their own,
scaled to nothing until she juggles. The pom-pom is the beacon. Faces -Y; about 0.66 m to the
pom-pom.
"""

import math

import jobkit
import kit
import toykit

FACE = 'juggler'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'head': dict(radii=(0.125, 0.11, 0.11), center=(0, 0, 0.525), e1=0.8, e2=0.9),
    'screen': dict(radii=(0.092, 0.05, 0.065), center=(0, -0.075, 0.525), bezel=0.008, e=0.33),
    'body': dict(radii=(0.1, 0.082, 0.12), center=(0, 0, 0.28)),
    'up': dict(sh=(0.115, 0, 0.365), el=(0.16, -0.01, 0.3), wr=(0.185, -0.03, 0.24), tip=(0.185, -0.034, 0.205)),
    'low': dict(sh=(0.095, 0, 0.255), el=(0.2, -0.01, 0.205), wr=(0.265, -0.03, 0.15), tip=(0.275, -0.034, 0.12)),
    'leg': dict(x=0.055, top=0.2, bottom=0.07),
    'ball': (0.0, -0.15, 0.3),
}


def rig_bones():
    lg = D['leg']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.2), (0, 0, 0.4), 'root'),
        ('head', (0, 0, 0.41), (0, 0, 0.64), 'body'),
        ('pom', (0, 0, 0.625), (0, 0, 0.7), 'head'),
    ]
    for side, s in ((1, 'L'), (-1, 'R')):
        u, lo = D['up'], D['low']
        bones += jobkit.arm_bones(side, s, u['sh'], u['el'], u['wr'], u['tip'])
        bones += jobkit.arm_bones(side, s, lo['sh'], lo['el'], lo['wr'], lo['tip'], pair='2')
        bones.append((f'leg.{s}', (side * lg['x'], 0, lg['top']), (side * lg['x'], 0, lg['bottom']), 'root'))
    bx, by, bz = D['ball']
    for i in range(1, 6):
        bones.append((f'jball.{i}', (bx, by, bz), (bx, by, bz + 0.03), 'root'))
    return bones


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m, add = p.m, p.add
    lg = D['leg']

    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        jobkit.leg(p, side, s, x, lg['top'], 0.08, 0.02)
        add(kit.superellipsoid(f'Shoe.{side}', (0.05, 0.07, 0.042), 0.6, 0.8, seg=(24, 14),
                               location=(x, -0.02, 0.045)), m['role']('Shoe'), f'leg.{s}')
        add(kit.superellipsoid(f'ShoePom.{side}', (0.013, 0.013, 0.013), seg=(12, 8), location=(x, -0.07, 0.07)),
            m['role']('Stripe', 'joint'), f'leg.{s}')

    # A striped body: three bulging bands round it.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], 0.7, 0.8, seg=(36, 22), location=b['center']), m['shell'], 'body')
    for i, (z, rx, ry) in enumerate(((0.215, 0.092, 0.075), (0.27, 0.104, 0.085), (0.325, 0.1, 0.082))):
        add(kit.superellipsoid(f'Band.{i}', (rx + 0.003, ry + 0.003, 0.0165), 0.4, 0.85, seg=(36, 10),
                               location=(0, 0, z)), m['role']('Stripe', 'joint'), 'body')
    p.bolt('Buckle', (0, -0.088, 0.268), 'body', 0.011, m['beacon'], rot=(math.pi / 2, 0, 0))

    # The ruff: a ring of plates, each tipped outward, alternating colours.
    n = 14
    for k in range(n):
        a = 2 * math.pi * k / n
        add(kit.superellipsoid(f'Ruff.{k}', (0.046, 0.016, 0.03), 0.6, 0.8, seg=(14, 8),
                               location=(0.1 * math.cos(a), 0.1 * math.sin(a), 0.4),
                               rotation=(0.0, -0.5, a + math.pi / 2)), m['role']('Ruff' if k % 2 else 'Ruff2', 'joint'),
            'body')
    add(kit.superellipsoid('Neck', (0.05, 0.05, 0.03), 0.5, 1.0, seg=(20, 8), location=(0, 0, 0.41)), m['joint'],
        'body')

    # Head, screen, ear knobs, a pom on a curl of wire.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e1'], h['e2'], seg=(48, 28), location=h['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Juggler', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Ear.{side}', (0.024, 0.04, 0.04), 0.6, 0.9, seg=(18, 12),
                               location=(side * 0.125, 0.0, 0.52)), m['role']('Stripe', 'joint'), 'head')
    wire, ts = kit.tube('Wire', kit.spline([(0, 0, 0.625), (0.012, 0, 0.665), (-0.006, 0.014, 0.69), (0.0, 0.0, 0.705)],
                                           12), 0.0055, ring=8)
    add(wire, m['joint'], kit.chain(ts, ['head', 'pom']))
    add(kit.superellipsoid('PomBall', (0.026, 0.026, 0.026), seg=(18, 12), location=(0.0, 0.0, 0.725)), m['beacon'],
        'pom')

    # Four arms, each ending in a mitt; the lower pair in the other colour.
    for pair, key, mit in (('', 'up', 'Glove'), ('2', 'low', 'Glove2')):
        a = D[key]
        for side, s in ((1, 'L'), (-1, 'R')):
            f = jobkit.side_fn(side)
            jobkit.arm(p, side, s, a['sh'], a['el'], a['wr'], 0.019, pair=pair, mat=m['shell'], ball=0.027)
            add(kit.torus(f'Cuff{pair}.{side}', 0.022, 0.0055, seg=(18, 6), location=f(a['wr'])),
                m['role']('Stripe', 'joint'), f'forearm{pair}.{s}')
            add(kit.superellipsoid(f'Mitt{pair}.{side}', (0.03, 0.027, 0.03), 0.7, 0.7, seg=(18, 12),
                                   location=f((a['wr'][0], a['wr'][1] - 0.004, a['wr'][2] - 0.02))),
                m['role'](mit, 'shell'), f'hand{pair}.{s}')

    # The balls, parked together until she needs them.
    bx, by, bz = D['ball']
    for i in range(1, 6):
        add(kit.superellipsoid(f'Ball.{i}', (0.03, 0.03, 0.03), seg=(18, 12), location=(bx, by, bz)), m['dot'](i - 1),
            f'jball.{i}')

    return p.finish(kit.armature('JugglerRig', rig_bones()))
