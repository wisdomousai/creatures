"""Lofty, a play-friend: a beanpole of a humanoid robot on long telescoping legs (three nested
tubes that slide in and out of each other, so he can stretch up or fold down), a slim body
in two sliding sections, a vertical gauge of four lights up his chest, very long arms with
mitten hands, a small round head with a screen face and a periscope antenna.

Rig: root, body (pelvis), chest (slides up out of the body), head, ant, upper_arm /
forearm / hand L/R (the same names as Bolt and Nova, so the shared play poses reach for
things with them), leg.L/R (the top tube, from the hip), leg2 and leg3 (they slide out of
the one above), foot.L/R, and ball (a glowing ball he catches, scaled to nothing when not
in use). Dot0..Dot3 are the chest gauge, Dot4 the ball. Faces -Y; about 1.45 m.
"""

import math

import kit
import toykit
from toykit import mirror_x

FACE = 'lanky'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'head': dict(radii=(0.095, 0.085, 0.09), center=(0, 0, 1.175), e1=0.7, e2=0.9),
    'screen': dict(radii=(0.072, 0.04, 0.054), center=(0, -0.062, 1.175), bezel=0.007, e=0.3),
    'hip': 0.72,
    'leg': dict(x=0.05, r=(0.034, 0.027, 0.02)),
    'shoulder': (0.125, 0.0, 1.0),
    'elbow': (0.135, 0.0, 0.76),
    'wrist': (0.14, 0.0, 0.52),
    'hand': (0.14, -0.012, 0.49),
}


def rig_bones():
    sh, el, wr = D['shoulder'], D['elbow'], D['wrist']
    x = D['leg']['x']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.72), (0, 0, 0.9), 'root'),
        ('chest', (0, 0, 0.88), (0, 0, 1.06), 'body'),
        ('head', (0, 0, 1.08), (0, 0, 1.28), 'chest'),
        ('ant', (0, 0, 1.25), (0, 0, 1.43), 'head'),
        ('ball', (0, -0.07, 0.98), (0, -0.07, 1.0), 'chest'),
    ]
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        bones += [
            (f'upper_arm.{s}', f(sh), f(el), 'chest'),
            (f'forearm.{s}', f(el), f(wr), f'upper_arm.{s}'),
            (f'hand.{s}', f(wr), f((wr[0], wr[1], wr[2] - 0.08)), f'forearm.{s}'),
            (f'leg.{s}', (side * x, 0, 0.72), (side * x, 0, 0.4), 'root'),
            (f'leg2.{s}', (side * x, 0, 0.52), (side * x, 0, 0.22), f'leg.{s}'),
            (f'leg3.{s}', (side * x, 0, 0.36), (side * x, 0, 0.06), f'leg2.{s}'),
            (f'foot.{s}', (side * x, 0, 0.045), (side * x, -0.09, 0.02), f'leg3.{s}'),
        ]
    return bones


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m, add = p.m, p.add
    lg = D['leg']

    # Telescoping legs: three nested tubes with a collar where each slides out of the last.
    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        for k, (z0, z1, bone) in enumerate(((0.72, 0.4, f'leg.{s}'), (0.52, 0.2, f'leg2.{s}'),
                                            (0.36, 0.05, f'leg3.{s}'))):
            tube, _ = kit.tube(f'Leg{k}.{side}', [(x, 0, z0), (x, 0, z1)], lg['r'][k], ring=16)
            add(tube, m['role']('Sleeve', 'joint') if k != 1 else m['joint'], bone)
            if k < 2:
                add(kit.torus(f'Collar{k}.{side}', lg['r'][k] + 0.002, 0.0055, seg=(24, 8), location=(x, 0, z1 + 0.004)),
                    m['role']('Stripe', 'bezel'), bone)
        add(kit.superellipsoid(f'Hip.{side}', (0.04, 0.04, 0.04), seg=(18, 12), location=(x, 0, 0.72)),
            m['joint'], f'leg.{s}')
        add(kit.superellipsoid(f'Ankle.{side}', (0.026, 0.026, 0.026), seg=(14, 10), location=(x, 0, 0.06)),
            m['bezel'], f'leg3.{s}')
        add(kit.superellipsoid(f'Shoe.{side}', (0.05, 0.088, 0.03), 0.5, 0.6, seg=(24, 14), location=(x, -0.028, 0.032)),
            m['role']('Shoe', 'bezel'), f'foot.{s}')
        add(kit.superellipsoid(f'ShoeCap.{side}', (0.044, 0.03, 0.022), 0.5, 0.6, seg=(18, 8),
                               location=(x, -0.092, 0.038)), m['shell'], f'foot.{s}')

    # Slim body in two sliding sections, a chest gauge of four lights, shoulders.
    add(kit.superellipsoid('Pelvis', (0.085, 0.06, 0.045), 0.5, 0.8, seg=(28, 14), location=(0, 0, 0.745)),
        m['role']('Sleeve', 'joint'), 'body')
    low, _ = kit.tube('Waist', [(0, 0, 0.74), (0, 0, 0.96)], 0.052, ring=20)
    add(low, m['shell'], 'body')
    add(kit.superellipsoid('Chest', (0.07, 0.055, 0.12), 0.5, 0.8, seg=(32, 20), taper=0.0, location=(0, 0, 0.965)),
        m['shell'], 'chest')
    add(kit.torus('Belt', 0.056, 0.0075, seg=(28, 8), location=(0, 0, 0.9)), m['role']('Stripe', 'bezel'), 'chest')
    add(kit.superellipsoid('Gauge', (0.014, 0.008, 0.07), 0.4, 0.5, seg=(14, 8), location=(0, -0.052, 0.965)),
        m['bezel'], 'chest')
    for i in range(4):
        add(kit.superellipsoid(f'Light.{i}', (0.0095, 0.007, 0.0095), 0.6, 0.6, seg=(12, 8),
                               location=(0, -0.0585, 0.92 + 0.032 * i)), m['dot'](i), 'chest')
    add(kit.superellipsoid('Yoke', (0.14, 0.04, 0.022), 0.4, 0.6, seg=(28, 10), location=(0, 0, 1.045)),
        m['role']('Sleeve', 'joint'), 'chest')
    n, _ = kit.tube('Neck', [(0, 0, 1.04), (0, 0, 1.11)], 0.02, ring=12)
    add(n, m['joint'], 'chest')

    # Head: small, round, a screen, ears, a periscope antenna with a beacon.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e1'], h['e2'], seg=(40, 26), location=h['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Lofty', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Ear.{side}', (0.016, 0.034, 0.034), 0.6, 0.9, seg=(18, 12),
                               location=(side * 0.097, 0.0, 1.175)), m['role']('Sleeve', 'joint'), 'head')
        add(kit.torus(f'EarRing.{side}', 0.019, 0.004, seg=(20, 6), location=(side * 0.112, 0, 1.175),
                      rotation=(0, math.pi / 2, 0)), m['glow'], 'head')
    add(kit.superellipsoid('AntBase', (0.02, 0.02, 0.01), 0.4, 1.0, seg=(18, 8), location=(0, 0, 1.262)), m['joint'],
        'head')
    rod, _ = kit.tube('Ant', [(0, 0, 1.262), (0, 0, 1.40)], 0.0055, ring=8)
    add(rod, m['joint'], 'ant')
    add(kit.superellipsoid('Beacon', (0.02, 0.02, 0.02), seg=(18, 12), location=(0, 0, 1.418)), m['beacon'], 'ant')
    add(kit.torus('AntRing', 0.011, 0.003, seg=(16, 6), location=(0, 0, 1.33)), m['role']('Stripe', 'bezel'), 'ant')

    # Long arms with elbow rings and mitten hands.
    sh, el, wr, hd = D['shoulder'], D['elbow'], D['wrist'], D['hand']
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.superellipsoid(f'Shoulder.{side}', (0.03, 0.03, 0.03), seg=(16, 10), location=f(sh)), m['joint'],
            'chest')
        p.hose(f'Arm.{side}', [f(sh), f(el), f(wr)], 0.0165, [f'upper_arm.{s}', f'forearm.{s}'], m['shell'], n=20)
        add(kit.torus(f'Elbow.{side}', 0.022, 0.0055, seg=(18, 6), location=f(el)), m['role']('Stripe', 'bezel'),
            f'forearm.{s}')
        add(kit.torus(f'Wrist.{side}', 0.021, 0.005, seg=(18, 6), location=f((wr[0], wr[1], wr[2] + 0.005))),
            m['role']('Stripe', 'bezel'), f'hand.{s}')
        add(kit.superellipsoid(f'Hand.{side}', (0.034, 0.03, 0.045), 0.6, 0.7, seg=(22, 14), location=f(hd)),
            m['role']('Sleeve', 'joint'), f'hand.{s}')
        add(kit.superellipsoid(f'Thumb.{side}', (0.015, 0.015, 0.02), seg=(12, 8),
                               location=f((hd[0] - 0.026, hd[1] - 0.025, hd[2] + 0.01))), m['role']('Sleeve', 'joint'),
            f'hand.{s}')

    # The catching ball, tucked in the chest until it's wanted.
    add(kit.superellipsoid('Ball', (0.04, 0.04, 0.04), seg=(20, 14), location=(0, -0.07, 0.98)), m['dot'](4), 'ball')

    return p.finish(kit.armature('LankyRig', rig_bones()))
