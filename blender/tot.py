"""Dimple, a toddler robot: a huge round head with a big screen face on a tiny wobbly body,
stubby legs in round booties, a puffy nappy, short mitten arms held up for balance, a
curly topknot antenna with a lit bulb, and a pacifier clipped on its tummy whose bulb
glows (Dot2). Two lit teardrops sit on the cheeks (Dot3) and slide down when it cries.

Rig: root, body (pivots at the nappy), head, knot, upper_arm/forearm L/R, leg.L/R,
tear.L/R. Faces -Y; about 0.62 m to the top of the topknot.
"""

import math

import kit
import toykit
from toykit import mirror_x

FACE = 'tot'
PREVIEW = dict(lift=0.0, width=0.45)

D = {
    'head': dict(radii=(0.2, 0.18, 0.17), center=(0, 0, 0.35), e1=0.85, e2=0.95),
    'screen': dict(radii=(0.15, 0.07, 0.1125), center=(0, -0.125, 0.35), bezel=0.01, e=0.32),
    'body': dict(radii=(0.085, 0.07, 0.085), center=(0, 0, 0.165)),
    'nappy': dict(radii=(0.105, 0.088, 0.052), center=(0, 0, 0.105)),
    'shoulder': (0.085, 0.0, 0.205),
    'elbow': (0.13, -0.012, 0.165),
    'wrist': (0.155, -0.03, 0.135),
    'leg': dict(x=0.045, top=0.1, bottom=0.04),
    'tear': (0.1, -0.188, 0.27),
}


def rig_bones():
    sh, el, wr = D['shoulder'], D['elbow'], D['wrist']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.08), None),
        ('body', (0, 0, 0.1), (0, 0, 0.24), 'root'),
        ('head', (0, 0, 0.21), (0, 0, 0.52), 'body'),
        ('knot', (0, 0, 0.5), (0, 0, 0.6), 'head'),
    ]
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        lg = D['leg']
        bones += [
            (f'upper_arm.{s}', f(sh), f(el), 'body'),
            (f'forearm.{s}', f(el), f(wr), f'upper_arm.{s}'),
            (f'leg.{s}', (side * lg['x'], 0, lg['top']), (side * lg['x'], 0, lg['bottom']), 'root'),
            (f'tear.{s}', f(D['tear']), f((D['tear'][0], D['tear'][1], D['tear'][2] - 0.04)), 'head'),
        ]
    return bones


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m, add = p.m, p.add

    # Booties and stubby legs.
    lg = D['leg']
    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{side}', [(x, 0, lg['top']), (x, 0, 0.05)], 0.02, ring=12)
        add(leg, m['joint'], f'leg.{s}')
        add(kit.superellipsoid(f'Bootie.{side}', (0.036, 0.05, 0.028), 0.6, 0.7, seg=(24, 16),
                               location=(x, -0.012, 0.028)), m['role']('Bootie'), f'leg.{s}')
        add(kit.torus(f'Cuff.{side}', 0.024, 0.006, seg=(20, 6), location=(x, 0, 0.056)), m['role']('Trim', 'joint'),
            f'leg.{s}')

    # Body, a puffy nappy with tabs and a seam, and the pacifier clip.
    b, n = D['body'], D['nappy']
    add(kit.superellipsoid('Body', b['radii'], 0.8, 0.9, seg=(32, 20), location=b['center']), m['shell'], 'body')
    add(kit.superellipsoid('Nappy', n['radii'], 0.6, 0.9, seg=(36, 16), location=n['center']), m['role']('Nappy'),
        'body')
    add(kit.torus('NappySeam', 0.098, 0.006, seg=(36, 6), location=(0, 0, 0.138)), m['role']('Trim', 'joint'), 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'Tab.{side}', (0.016, 0.006, 0.014), 0.4, 0.5, seg=(12, 6),
                               location=(side * 0.045, -0.088, 0.128)), m['role']('Trim', 'joint'), 'body')
    # Pacifier: a shield on a loop, a ring handle and a lit teat.
    add(kit.superellipsoid('PacShield', (0.036, 0.008, 0.026), 0.4, 0.5, seg=(20, 8), location=(0, -0.072, 0.17)),
        m['role']('Pacifier', 'bezel'), 'body')
    add(kit.torus('PacRing', 0.02, 0.0055, seg=(24, 8), location=(0, -0.082, 0.17), rotation=(math.pi / 2, 0, 0)),
        m['role']('Pacifier', 'bezel'), 'body')
    add(kit.superellipsoid('Teat', (0.016, 0.02, 0.016), 0.9, 0.9, seg=(18, 12), location=(0, -0.058, 0.17)),
        m['dot'](2), 'body')
    add(kit.superellipsoid('PacClip', (0.01, 0.01, 0.012), seg=(12, 8), location=(0, -0.064, 0.2)), m['joint'],
        'body')

    # The big head: shell, ear pods with lit rings, rim seam, a screen.
    h = D['head']
    add(kit.superellipsoid('Neck', (0.05, 0.05, 0.03), 0.5, 1.0, seg=(20, 8), location=(0, 0, 0.21)), m['joint'],
        'body')
    add(kit.superellipsoid('Head', h['radii'], h['e1'], h['e2'], seg=(52, 32), location=h['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Tot', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Ear.{side}', (0.03, 0.062, 0.062), 0.6, 0.9, seg=(24, 14),
                               location=(side * 0.2, 0.0, 0.35)), m['role']('Trim', 'joint'), 'head')
        add(kit.torus(f'EarRing.{side}', 0.034, 0.0065, seg=(24, 8), location=(side * 0.228, 0, 0.35),
                      rotation=(0, math.pi / 2, 0)), m['glow'], 'head')
    add(kit.torus('HeadSeam', 0.17, 0.0045, seg=(48, 6), location=(0, 0.01, 0.43), rotation=(0.45, 0, 0)),
        m['joint'], 'head')
    # Topknot: a curl of wire with a lit bulb.
    pts = [(0, 0, 0.505), (0.012, 0, 0.545), (0.0, 0.016, 0.575), (-0.022, 0, 0.592), (-0.012, -0.018, 0.612)]
    stalk, ts = kit.tube('Knot', kit.spline(pts, 12), 0.0065, ring=8)
    add(stalk, m['joint'], kit.chain(ts, ['head', 'knot']))
    add(kit.superellipsoid('KnotBulb', (0.022, 0.022, 0.022), seg=(18, 12), location=(-0.012, -0.02, 0.624)),
        m['beacon'], 'knot')
    # Tears.
    for side, s in ((1, 'L'), (-1, 'R')):
        t = D['tear']
        add(kit.superellipsoid(f'Tear.{side}', (0.014, 0.011, 0.022), 0.9, 0.9, seg=(14, 10),
                               location=(side * t[0], t[1], t[2])), m['dot'](3), f'tear.{s}')

    # Arms: short hoses with mitten hands.
    sh, el, wr = D['shoulder'], D['elbow'], D['wrist']
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.superellipsoid(f'Shoulder.{side}', (0.024, 0.024, 0.024), seg=(16, 10), location=f(sh)),
            m['joint'], 'body')
        p.hose(f'Arm.{side}', [f(sh), f(el), f(wr)], 0.0165, [f'upper_arm.{s}', f'forearm.{s}'], m['shell'], n=8)
        add(kit.superellipsoid(f'Hand.{side}', (0.03, 0.028, 0.032), 0.7, 0.7, seg=(20, 14),
                               location=f((wr[0] + 0.006, wr[1] - 0.006, wr[2] - 0.014))), m['role']('Trim', 'joint'),
            f'forearm.{s}')

    return p.finish(kit.armature('TotRig', rig_bones()))
