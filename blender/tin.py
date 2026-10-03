"""Clatter, a 1950s tin wind-up toy robot: a squat can of a body, rivetted at the rims, with
a chest window that shows three gears turning and sparks between them; a big winding key
with two wing loops in its back that turns as it walks; stiff straight legs on flat tin
feet; corrugated tin arms ending in pincers; and a silver dome head with a screen face, two
ear knobs and two stiff antennae with lit balls.

Rig: root, body (the can), head, ant.L/R, key, gear1..3 (they spin on the site), arm.L/R
(one stiff bone each) and leg.L/R (stiff, from the hip). Dot0..Dot2 are the sparks in the
window, Dot3 the antenna balls. Faces -Y like the rest of the crew; about 0.86 m to the
tips of the antennae.
"""

import math

import kit
import toykit
from toykit import mirror_x

FACE = 'tin'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'can': dict(radii=(0.165, 0.165, 0.15), center=(0, 0, 0.37), e1=0.22, e2=1.0),
    'head': dict(radii=(0.13, 0.13, 0.11), center=(0, 0, 0.615), e1=0.8, e2=1.0),
    'screen': dict(radii=(0.098, 0.06, 0.07), center=(0, -0.085, 0.612), bezel=0.009, e=0.32),
    'leg': dict(x=0.085, top=0.23, bottom=0.05, r=0.028),
    'arm': dict(x=0.2, top=0.47, bottom=0.255, r=0.021),
    'window': dict(z=0.385, y=-0.157),
    'key': dict(z=0.38, y0=0.15, y1=0.27),
}


def rig_bones():
    k = D['key']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.22), (0, 0, 0.5), 'root'),
        ('head', (0, 0, 0.52), (0, 0, 0.73), 'body'),
        ('key', (0, k['y0'], k['z']), (0, k['y1'], k['z']), 'body'),
    ]
    for i, (cx, cz) in enumerate(GEARS):
        bones.append((f'gear{i + 1}', (cx, -0.19, cz), (cx, -0.19, cz + 0.02), 'body'))
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        a, lg = D['arm'], D['leg']
        bones += [
            (f'ant.{s}', f((0.05, 0, 0.71)), f((0.065, 0, 0.85)), 'head'),
            (f'arm.{s}', f((a['x'] - 0.025, 0, a['top'])), f((a['x'], 0, a['bottom'])), 'body'),
            (f'leg.{s}', f((lg['x'], 0, lg['top'])), f((lg['x'], 0, lg['bottom'])), 'root'),
        ]
    return bones


# The three gears in the chest window: (x, z, radius, teeth).
GEARS = ((-0.03, 0.405), (0.038, 0.375), (-0.042, 0.332))
GEAR_R = (0.04, 0.03, 0.02)
GEAR_TEETH = (12, 9, 6)


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m = p.m
    add = p.add

    # Legs: stiff straight shafts with a ribbed sleeve, ankle pins, flat tin feet.
    lg = D['leg']
    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        add(kit.superellipsoid(f'Leg.{side}', (lg['r'], lg['r'], 0.09), 0.5, 1.0, seg=(20, 12),
                               location=(x, 0, 0.14)), m['joint'], f'leg.{s}')
        for j, z in enumerate((0.1, 0.135, 0.17)):
            add(kit.torus(f'LegRib.{side}.{j}', lg['r'] + 0.001, 0.0045, seg=(20, 6), location=(x, 0, z)),
                m['bezel'], f'leg.{s}')
        add(kit.superellipsoid(f'Hip.{side}', (0.04, 0.04, 0.022), 0.4, 1.0, seg=(20, 8), location=(x, 0, 0.225)),
            m['role']('Key', 'joint'), f'leg.{s}')
        add(kit.superellipsoid(f'Foot.{side}', (0.052, 0.085, 0.03), 0.4, 0.5, seg=(24, 12),
                               location=(x, -0.03, 0.03)), m['role']('Foot', 'bezel'), f'leg.{s}')
        add(kit.superellipsoid(f'Toe.{side}', (0.045, 0.03, 0.022), 0.5, 0.6, seg=(20, 8),
                               location=(x, -0.092, 0.036)), m['role']('Key', 'joint'), f'leg.{s}')
        p.bolt(f'Ankle.{side}', (x + side * 0.03, 0, 0.065), f'leg.{s}', 0.008)

    # The can: a squat cylinder with two seams, rivets round both rims, a hip plate under it.
    c = D['can']
    add(kit.superellipsoid('Can', c['radii'], c['e1'], c['e2'], seg=(48, 28), location=c['center']), m['shell'], 'body')
    add(kit.superellipsoid('HipPlate', (0.13, 0.13, 0.014), 0.4, 1.0, seg=(32, 8), location=(0, 0, 0.222)),
        m['joint'], 'body')
    for nm, z in (('SeamHi', 0.455), ('SeamLo', 0.285)):
        add(kit.torus(nm, 0.1635, 0.0048, seg=(48, 6), location=(0, 0, z)), m['bezel'], 'body')
    p.ring_of_bolts('RivetHi', 0.1625, 0.488, 20, 'body', 0.0065, mat=m['bezel'])
    p.ring_of_bolts('RivetLo', 0.1625, 0.252, 20, 'body', 0.0065, mat=m['bezel'])
    # Corrugation: three raised ribs round the back half of the can.
    for j, z in enumerate((0.33, 0.37, 0.41)):
        add(kit.torus(f'Rib.{j}', 0.1645, 0.0035, seg=(48, 6), location=(0, 0, z)), m['joint'], 'body')

    # The chest window: a raised panel with a dark recess, a frame of four bars, three gears
    # turning in it, and sparks between them.
    w = D['window']
    add(kit.superellipsoid('Panel', (0.098, 0.022, 0.088), 0.3, 0.3, seg=(28, 14), location=(0, w['y'], w['z'])),
        m['role']('Key', 'joint'), 'body')
    add(kit.superellipsoid('Recess', (0.074, 0.004, 0.068), 0.3, 0.3, seg=(24, 12), location=(0, -0.1805, w['z'])),
        m['bezel'], 'body')
    for nm, (cx, cz, rx, rz) in {'T': (0, w['z'] + 0.073, 0.082, 0.007), 'B': (0, w['z'] - 0.073, 0.082, 0.007),
                                 'L': (0.079, w['z'], 0.007, 0.07), 'R': (-0.079, w['z'], 0.007, 0.07)}.items():
        add(kit.superellipsoid(f'Frame{nm}', (rx, 0.007, rz), 0.4, 0.5, seg=(16, 8), location=(cx, -0.188, cz)),
            m['joint'], 'body')
    for i, (cx, cz) in enumerate(((0.079, w['z'] + 0.073), (-0.079, w['z'] + 0.073), (0.079, w['z'] - 0.073),
                                  (-0.079, w['z'] - 0.073))):
        p.bolt(f'FrameBolt.{i}', (cx, -0.196, cz), 'body', 0.0065, m['bezel'], rot=(math.pi / 2, 0, 0))
    for i, ((cx, cz), r, teeth) in enumerate(zip(GEARS, GEAR_R, GEAR_TEETH)):
        toykit.gear(p, f'Gear{i + 1}', (cx, -0.19, cz), r, teeth, f'gear{i + 1}',
                    m['role']('Gear', 'joint') if i != 1 else m['role']('Key', 'joint'),
                    tooth_mat=m['role']('Gear', 'joint'))
    for i, (sx, sz) in enumerate(((0.004, 0.37), (-0.07, 0.37), (0.06, 0.42))):
        add(kit.superellipsoid(f'Spark.{i}', (0.0085, 0.0085, 0.0085), seg=(12, 8), location=(sx, -0.2, sz)),
            m['dot'](i), 'body')

    # The winding key in the back: a plate with bolts, a stem, a cross bar and two wing loops.
    k = D['key']
    add(kit.superellipsoid('KeyPlate', (0.05, 0.012, 0.05), 0.4, 0.4, seg=(24, 8), location=(0, 0.158, k['z']),
                           rotation=(0, 0, 0)), m['joint'], 'body')
    for i, (bx, bz) in enumerate(((0.035, 0.035), (-0.035, 0.035), (0.035, -0.035), (-0.035, -0.035))):
        p.bolt(f'KeyBolt.{i}', (bx, 0.168, k['z'] + bz), 'body', 0.0055, m['bezel'], rot=(-math.pi / 2, 0, 0))
    stem, _ = kit.tube('KeyStem', [(0, 0.16, k['z']), (0, 0.26, k['z'])], 0.0105, ring=12)
    add(stem, m['role']('Key', 'joint'), 'key')
    add(kit.superellipsoid('KeyBar', (0.012, 0.012, 0.045), 0.5, 0.6, seg=(16, 10), location=(0, 0.262, k['z'])),
        m['role']('Key', 'joint'), 'key')
    for side in (1, -1):
        add(kit.torus(f'KeyLoop.{side}', 0.042, 0.0105, seg=(32, 10),
                      location=(side * 0.05, 0.268, k['z']), rotation=(math.pi / 2, 0, 0)),
            m['role']('Key', 'joint'), 'key')

    # The dome head, its collar, the screen, ear knobs with lit rings.
    h = D['head']
    add(kit.superellipsoid('Neck', (0.085, 0.085, 0.02), 0.4, 1.0, seg=(28, 8), location=(0, 0, 0.525)), m['joint'],
        'body')
    add(kit.superellipsoid('Dome', h['radii'], h['e1'], h['e2'], seg=(48, 30), location=h['center']),
        m['role']('Dome'), 'head')
    add(kit.torus('Collar', 0.118, 0.0095, seg=(40, 8), location=(0, 0, 0.545)), m['bezel'], 'head')
    p.ring_of_bolts('DomeRivet', 0.122, 0.565, 14, 'head', 0.0055, mat=m['bezel'])
    sc = D['screen']
    glass, rim = kit.screen('Tin', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Ear.{side}', (0.034, 0.034, 0.024), 0.5, 1.0, seg=(24, 10),
                               location=(side * 0.132, 0.0, 0.612), rotation=(0, math.pi / 2, 0)),
            m['role']('Key', 'joint'), 'head')
        add(kit.torus(f'EarRing.{side}', 0.021, 0.006, seg=(24, 8), location=(side * 0.155, 0, 0.612),
                      rotation=(0, math.pi / 2, 0)), m['glow'], 'head')
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.superellipsoid(f'AntBase.{side}', (0.02, 0.02, 0.011), 0.4, 1.0, seg=(20, 8),
                               location=f((0.05, 0, 0.714))), m['joint'], 'head')
        rod, _ = kit.tube(f'Ant.{side}', [f((0.05, 0, 0.714)), f((0.065, 0, 0.84))], 0.0065, ring=8)
        add(rod, m['joint'], f'ant.{s}')
        add(kit.superellipsoid(f'AntBall.{side}', (0.02, 0.02, 0.02), seg=(20, 14), location=f((0.067, 0, 0.862))),
            m['dot'](3), f'ant.{s}')

    # Arms: shoulder discs, corrugated tin sleeves, and two-fingered pincers.
    a = D['arm']
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.superellipsoid(f'Shoulder.{side}', (0.03, 0.03, 0.026), 0.5, 1.0, seg=(20, 10),
                               location=f((a['x'] - 0.03, 0, a['top'] - 0.005)), rotation=(0, math.pi / 2, 0)),
            m['role']('Key', 'joint'), 'body')
        add(kit.superellipsoid(f'Arm.{side}', (a['r'], a['r'], 0.11), 0.5, 1.0, seg=(18, 12),
                               location=f((a['x'], 0, 0.36))), m['joint'], f'arm.{s}')
        for j, z in enumerate((0.31, 0.34, 0.37, 0.4, 0.43)):
            add(kit.torus(f'ArmRib.{side}.{j}', a['r'] + 0.0012, 0.0042, seg=(18, 6), location=f((a['x'], 0, z))),
                m['shell'], f'arm.{s}')
        add(kit.superellipsoid(f'Wrist.{side}', (0.032, 0.032, 0.026), 0.5, 0.7, seg=(20, 10),
                               location=f((a['x'], -0.004, 0.245))), m['role']('Key', 'joint'), f'arm.{s}')
        for dx in (0.015, -0.015):
            add(kit.superellipsoid(f'Claw.{side}.{dx}', (0.0105, 0.042, 0.013), 0.5, 0.6, seg=(14, 8),
                                   location=f((a['x'] + dx, -0.04, 0.218)), rotation=(0, 0, 0)),
                m['bezel'], f'arm.{s}')

    return p.finish(kit.armature('TinRig', rig_bones()))
