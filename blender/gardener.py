"""Dibble, a little gardening robot: the head is a watering can (a round tin can with the
screen face on its front, a spout going up and out on one side and ending in a lit rose, a
handle arching over the top), on a rounded dungaree body with a seed packet in the pocket,
a trowel in the left hand, a glove on the right and tall wellington boots.

Rig: root, body, head (the can: it tips to pour), upper_arm/forearm/hand L/R, leg.L/R, and
the garden's props on bones of their own, scaled to nothing until a trick wants them:
sprout (a seedling that grows a lit bud, Dot2), flower (to sniff), hole and soil (for
digging), rain.1..3 (drops from the rose, Dot3). The rose face is the beacon. Faces -Y;
about 0.68 m to the top of the handle.
"""

import math

import jobkit
import kit
import toykit

FACE = 'gardener'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'can': dict(radii=(0.135, 0.12, 0.095), center=(0, 0, 0.525), e1=0.4, e2=1.0),
    'screen': dict(radii=(0.092, 0.05, 0.06), center=(0, -0.088, 0.53), bezel=0.008, e=0.32),
    'body': dict(radii=(0.105, 0.085, 0.115), center=(0, 0, 0.3)),
    'shoulder': (0.125, 0, 0.375),
    'elbow': (0.155, -0.012, 0.295),
    'wrist': (0.168, -0.03, 0.225),
    'tip': (0.168, -0.034, 0.19),
    'boot': dict(x=0.065, top=0.21, bottom=0.07),
    'spout': [(0.1, 0, 0.47), (0.18, 0, 0.5), (0.25, 0, 0.56), (0.29, 0, 0.63)],
    'rose': (0.298, 0, 0.655),
    'spot': (0.3, -0.03),   # the seedling, the hole and the water all go here
    'flower': (-0.1, -0.2),
}


def rig_bones():
    sh, el, wr, tp = D['shoulder'], D['elbow'], D['wrist'], D['tip']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.2), (0, 0, 0.4), 'root'),
        ('head', (0, 0, 0.42), (0, 0, 0.64), 'body'),
    ]
    for side, s in ((1, 'L'), (-1, 'R')):
        bt = D['boot']
        bones += jobkit.arm_bones(side, s, sh, el, wr, tp)
        bones.append((f'leg.{s}', (side * bt['x'], 0, bt['top']), (side * bt['x'], 0, bt['bottom']), 'root'))
    x, y = D['spot']
    fx, fy = D['flower']
    bones += [
        ('sprout', (x, y, 0.0), (x, y, 0.1), 'root'),
        ('hole', (x, y, 0.0), (x, y, 0.02), 'root'),
        ('soil', (x + 0.08, y - 0.06, 0.0), (x + 0.08, y - 0.06, 0.04), 'root'),
        ('flower', (fx, fy, 0.0), (fx, fy, 0.2), 'root'),
    ]
    for i in (1, 2, 3):
        bones.append((f'rain.{i}', (x, y, 0.19), (x, y, 0.22), 'root'))
    return bones


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m, add = p.m, p.add

    # Wellington boots: tall, round, with a rim and a flat sole.
    bt = D['boot']
    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * bt['x']
        jobkit.leg(p, side, s, x, bt['top'], 0.13, 0.018)
        add(kit.superellipsoid(f'Boot.{side}', (0.05, 0.05, 0.065), 0.55, 0.9, seg=(24, 16), location=(x, 0, 0.1)),
            m['role']('Boot'), f'leg.{s}')
        add(kit.superellipsoid(f'Toe.{side}', (0.05, 0.062, 0.04), 0.6, 0.8, seg=(24, 14),
                               location=(x, -0.04, 0.045)), m['role']('Boot'), f'leg.{s}')
        add(kit.superellipsoid(f'Sole.{side}', (0.054, 0.1, 0.012), 0.4, 0.7, seg=(24, 8),
                               location=(x, -0.025, 0.012)), m['joint'], f'leg.{s}')
        add(kit.torus(f'BootRim.{side}', 0.049, 0.007, seg=(24, 6), location=(x, 0, 0.158)), m['role']('Trim', 'joint'),
            f'leg.{s}')

    # Body: dungarees with a bib, straps, a pocket and a seed packet.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], 0.7, 0.8, seg=(36, 22), location=b['center']), m['shell'], 'body')
    add(kit.superellipsoid('Hips', (0.1, 0.082, 0.04), 0.5, 0.9, seg=(28, 10), location=(0, 0, 0.215)),
        m['role']('Overall', 'joint'), 'body')
    add(kit.superellipsoid('Bib', (0.072, 0.014, 0.065), 0.4, 0.4, seg=(20, 12), location=(0, -0.082, 0.31)),
        m['role']('Overall', 'joint'), 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'Strap.{side}', (0.012, 0.012, 0.075), 0.5, 0.5, seg=(12, 10),
                               location=(side * 0.055, -0.07, 0.38), rotation=(0, side * 0.2, 0)),
            m['role']('Overall', 'joint'), 'body')
        p.bolt(f'StrapBolt.{side}', (side * 0.056, -0.083, 0.345), 'body', 0.0085, m['bezel'], rot=(math.pi / 2, 0, 0))
    add(kit.superellipsoid('Pocket', (0.032, 0.008, 0.026), 0.4, 0.5, seg=(14, 8), location=(0, -0.095, 0.26)),
        m['bezel'], 'body')
    add(kit.superellipsoid('Seeds', (0.016, 0.006, 0.022), 0.3, 0.3, seg=(12, 8), location=(0.006, -0.1, 0.285),
                           rotation=(0, 0.2, 0)), m['role']('Petal', 'glow'), 'body')
    add(kit.superellipsoid('Neck', (0.05, 0.05, 0.03), 0.5, 1.0, seg=(20, 8), location=(0, 0, 0.405)), m['joint'],
        'body')

    # Arms: hoses; a glove on the right, a trowel on the left.
    sh, el, wr, tp = D['shoulder'], D['elbow'], D['wrist'], D['tip']
    for side, s in ((1, 'L'), (-1, 'R')):
        jobkit.arm(p, side, s, sh, el, wr, 0.0175, mat=m['shell'])
    gx = -wr[0]
    add(kit.superellipsoid('Glove', (0.034, 0.03, 0.036), 0.7, 0.7, seg=(20, 14), location=(gx, wr[1] - 0.004, 0.205)),
        m['role']('Glove', 'shell'), 'hand.R')
    add(kit.torus('Cuff', 0.026, 0.0065, seg=(20, 6), location=(gx, wr[1], 0.235)), m['role']('Trim', 'joint'),
        'hand.R')
    # The trowel: a grip in the fist, a shank and a flat scoop that points down and forward.
    tx, ty = wr[0], wr[1]
    add(kit.superellipsoid('Fist', (0.03, 0.028, 0.032), 0.7, 0.7, seg=(18, 12), location=(tx, ty - 0.004, 0.21)),
        m['role']('Glove', 'shell'), 'hand.L')
    add(kit.torus('CuffL', 0.026, 0.0065, seg=(20, 6), location=(tx, ty, 0.235)), m['role']('Trim', 'joint'), 'hand.L')
    grip, _ = kit.tube('Grip', [(tx, ty - 0.01, 0.235), (tx, ty - 0.02, 0.17)], 0.012, ring=10)
    add(grip, m['role']('Wood', 'joint'), 'hand.L')
    shank, _ = kit.tube('Shank', [(tx, ty - 0.02, 0.17), (tx, ty - 0.035, 0.13)], 0.0055, ring=8)
    add(shank, m['bezel'], 'hand.L')
    add(kit.superellipsoid('Blade', (0.03, 0.007, 0.052), 0.8, 0.5, seg=(18, 10), taper=0.5,
                           location=(tx, ty - 0.045, 0.085), rotation=(0.25, 0, 0)), m['role']('Steel', 'bezel'),
        'hand.L')

    # The watering-can head: a round tin can, rims, rivets, the screen, a cap.
    c = D['can']
    add(kit.superellipsoid('Can', c['radii'], c['e1'], c['e2'], seg=(52, 28), location=c['center']),
        m['role']('Can'), 'head')
    add(kit.torus('RimLo', 0.132, 0.0075, seg=(48, 6), location=(0, 0, 0.445)), m['role']('Trim', 'joint'), 'head')
    add(kit.torus('RimHi', 0.128, 0.0075, seg=(48, 6), location=(0, 0, 0.605)), m['role']('Trim', 'joint'), 'head')
    p.ring_of_bolts('CanRivet', 0.134, 0.457, 16, 'head', 0.0055, mat=m['bezel'])
    sc = D['screen']
    glass, rim = kit.screen('Can', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(kit.superellipsoid('Lid', (0.075, 0.075, 0.012), 0.4, 1.0, seg=(32, 8), location=(0.0, 0.0, 0.62)),
        m['role']('Trim', 'joint'), 'head')
    # The handle: an arch over the top, from the back rim up and over.
    arch, _ = kit.tube('Handle', kit.spline([(-0.085, 0.03, 0.6), (-0.1, 0.03, 0.68), (0, 0.03, 0.74),
                                              (0.1, 0.03, 0.68), (0.085, 0.03, 0.6)], 14), 0.0135, ring=12)
    add(arch, m['role']('Trim', 'joint'), 'head')
    # The spout: a pipe going up and out to the right of the picture, with a rose.
    sp, _ = kit.tube('Spout', kit.spline(D['spout'], 12), 0.02, ring=12)
    add(sp, m['role']('Can'), 'head')
    add(kit.superellipsoid('SpoutRoot', (0.032, 0.032, 0.032), seg=(16, 10), location=(0.115, 0, 0.475)),
        m['role']('Trim', 'joint'), 'head')
    add(kit.torus('SpoutBand', 0.023, 0.006, seg=(20, 6), location=(0.2, 0, 0.52), rotation=(0, 1.15, 0)),
        m['role']('Trim', 'joint'), 'head')
    rx, ry, rz = D['rose']
    add(kit.superellipsoid('Rose', (0.052, 0.052, 0.018), 0.6, 1.0, seg=(28, 10), location=(rx, ry, rz),
                           rotation=(0, 0.35, 0)), m['role']('Trim', 'joint'), 'head')
    add(kit.superellipsoid('RoseFace', (0.04, 0.04, 0.006), 0.5, 1.0, seg=(24, 8),
                           location=(rx + 0.0085, ry, rz + 0.0165), rotation=(0, 0.35, 0)), m['beacon'], 'head')

    # Props on bones of their own: a seedling with a lit bud, a flower, a hole and soil, drops.
    x, y = D['spot']
    stem, _ = kit.tube('Stem', [(x, y, 0.0), (x, y, 0.045), (x + 0.006, y, 0.075)], 0.0055, ring=8)
    add(stem, m['role']('Leaf', 'shell'), 'sprout')
    for side in (1, -1):
        add(kit.superellipsoid(f'SeedLeaf.{side}', (0.026, 0.009, 0.012), 0.8, 0.8, seg=(14, 8),
                               location=(x + side * 0.025, y, 0.05), rotation=(0, side * -0.5, 0)),
            m['role']('Leaf', 'shell'), 'sprout')
    add(kit.superellipsoid('Bud', (0.017, 0.017, 0.02), seg=(16, 10), location=(x + 0.006, y, 0.09)), m['dot'](2),
        'sprout')
    add(kit.superellipsoid('Hole', (0.065, 0.065, 0.004), 0.5, 1.0, seg=(28, 6), location=(x, y, 0.003)), m['bezel'],
        'hole')
    for i, (dx, dy, r) in enumerate(((0.0, 0.0, 0.032), (-0.03, -0.01, 0.024), (0.032, 0.01, 0.022))):
        add(kit.superellipsoid(f'Soil.{i}', (r, r, r * 0.6), seg=(16, 8), location=(x + 0.08 + dx, y - 0.06 + dy, r * 0.5)),
            m['role']('Soil', 'joint'), 'soil')
    fx, fy = D['flower']
    st, _ = kit.tube('FlowerStem', [(fx, fy, 0.0), (fx, fy, 0.08), (fx + 0.01, fy, 0.16)], 0.006, ring=8)
    add(st, m['role']('Leaf', 'shell'), 'flower')
    add(kit.superellipsoid('FlowerLeaf', (0.028, 0.01, 0.012), 0.8, 0.8, seg=(14, 8),
                           location=(fx - 0.026, fy, 0.06), rotation=(0, 0.5, 0)), m['role']('Leaf', 'shell'), 'flower')
    for k in range(6):
        a = 2 * math.pi * k / 6
        add(kit.superellipsoid(f'Petal.{k}', (0.02, 0.012, 0.02), seg=(12, 8),
                               location=(fx + 0.01 + 0.03 * math.cos(a), fy - 0.006, 0.17 + 0.03 * math.sin(a))),
            m['role']('Petal', 'glow'), 'flower')
    add(kit.superellipsoid('FlowerEye', (0.017, 0.014, 0.017), seg=(14, 8), location=(fx + 0.01, fy - 0.012, 0.17)),
        m['dot'](2), 'flower')
    for i in (1, 2, 3):
        add(kit.superellipsoid(f'Drop.{i}', (0.009, 0.009, 0.014), seg=(12, 8), location=(x, y, 0.2 + 0.006 * i)),
            m['dot'](3), f'rain.{i}')

    return p.finish(kit.armature('GardenerRig', rig_bones()))
