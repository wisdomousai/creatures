"""Earl, a teapot butler robot: a round porcelain teapot body with a screen face on its belly
and a bow tie, a lid that hops when it steams, a spout that is one arm and a loop handle that
is the other (it ends in a white glove and carries a tray with a cup and saucer), standing
on two little legs in spats.

Rig: root, body (pivots at the middle of the pot), lid, spout, handle (the tray and the
cup go with it), leg.L/R, stream (the tea falling from the spout while the pot is tipped, scaled to nothing until
he pours), cup2 (the guest's cup on the floor under it, scaled to nothing until then), lidsteam1..3 and cupsteam1..3 (puffs, scaled to nothing until used). Dot3 is the
tea, Dot4 the steam, the lid's knob is the beacon. Faces -Y; about 0.62 m to the knob.
"""

import math

import kit
import toykit

FACE = 'teapot'
PREVIEW = dict(lift=0.0, width=0.7)

D = {
    'pot': dict(radii=(0.17, 0.16, 0.15), center=(0, 0, 0.36), e1=0.8, e2=1.0),
    'screen': dict(radii=(0.096, 0.04, 0.06), center=(0, -0.128, 0.37), bezel=0.008, e=0.3),
    'lid': dict(radii=(0.092, 0.092, 0.05), z=0.525),
    'spout': [(0.14, 0, 0.36), (0.22, 0, 0.395), (0.29, 0, 0.46), (0.335, 0, 0.535)],
    'handle': [(-0.14, 0, 0.45), (-0.24, 0, 0.465), (-0.30, 0, 0.40), (-0.275, 0, 0.315), (-0.18, 0, 0.285)],
    'hand': (-0.29, -0.012, 0.31),
    'tray': (-0.29, -0.115, 0.30),
    'tip': (0.35, 0.0, 0.545),
    # Where the tip is once the pot is tipped to pour (about 22 degrees), and the guest's cup under it.
    'poured': (0.416, 0.0, 0.396),
    'cup2': (0.416, 0.0, 0.0),
    'leg': dict(x=0.07, top=0.23, bottom=0.05),
}
PUFFS = (3, 3)


def rig_bones():
    tray = D['tray']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.08), None),
        ('body', (0, 0, 0.3), (0, 0, 0.5), 'root'),
        ('lid', (0, 0, 0.5), (0, 0, 0.6), 'body'),
        ('spout', (0.15, 0, 0.4), (0.335, 0, 0.535), 'body'),
        ('handle', (-0.15, 0, 0.45), (-0.285, -0.01, 0.31), 'body'),
        ('stream', D['poured'], (D['poured'][0], 0, 0.07), 'root'),
        ('cup2', D['cup2'], (D['cup2'][0], 0, 0.05), 'root'),
    ]
    for i in (1, 2, 3):
        bones.append((f'lidsteam{i}', (0, 0, 0.6), (0, 0, 0.63), 'lid'))
        c2 = D['cup2']
        bones.append((f'cupsteam{i}', (c2[0], 0, 0.09), (c2[0], 0, 0.12), 'cup2'))
    for side, s in ((1, 'L'), (-1, 'R')):
        bones.append((f'leg.{s}', (side * D['leg']['x'], 0, D['leg']['top']),
                      (side * D['leg']['x'], 0, D['leg']['bottom']), 'root'))
    return bones


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m, add = p.m, p.add

    # Legs in spats, with oval feet.
    lg = D['leg']
    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{side}', [(x, 0, lg['top']), (x, 0, 0.06)], 0.02, ring=12)
        add(leg, m['joint'], f'leg.{s}')
        add(kit.superellipsoid(f'Foot.{side}', (0.04, 0.062, 0.03), 0.5, 0.7, seg=(24, 14),
                               location=(x, -0.02, 0.03)), m['role']('Glove', 'shell'), f'leg.{s}')
        add(kit.torus(f'Spat.{side}', 0.026, 0.006, seg=(20, 6), location=(x, 0, 0.07)), m['role']('Trim', 'joint'),
            f'leg.{s}')

    # The pot, a gold band, the screen and a bow tie.
    pt = D['pot']
    add(kit.superellipsoid('Pot', pt['radii'], pt['e1'], pt['e2'], seg=(52, 32), location=pt['center']), m['shell'],
        'body')
    add(kit.superellipsoid('Foot', (0.1, 0.1, 0.02), 0.4, 1.0, seg=(32, 8), location=(0, 0, 0.225)), m['joint'], 'body')
    add(kit.torus('Band', 0.157, 0.006, seg=(48, 6), location=(0, 0, 0.275)), m['role']('Trim', 'joint'), 'body')
    add(kit.torus('Collar', 0.108, 0.007, seg=(40, 6), location=(0, 0, 0.495)), m['role']('Trim', 'joint'), 'body')
    sc = D['screen']
    glass, rim = kit.screen('Teapot', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'body')
    add(rim, m['bezel'], 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'BowWing.{side}', (0.028, 0.01, 0.017), 0.5, 0.6, seg=(16, 8),
                               location=(side * 0.032, -0.15, 0.456), rotation=(0, side * 0.45, 0)),
            m['role']('Bow', 'bezel'), 'body')
    add(kit.superellipsoid('BowKnot', (0.011, 0.011, 0.011), seg=(12, 8), location=(0, -0.153, 0.456)),
        m['role']('Bow', 'bezel'), 'body')
    for i, (bx, bz) in enumerate(((0.12, 0.3), (-0.12, 0.3), (0.12, 0.25), (-0.12, 0.25))):
        p.bolt(f'Bolt.{i}', (bx, -0.1, bz), 'body', 0.0055, rot=(math.pi / 2, 0, 0))

    # The lid with a knob that is the beacon.
    ld = D['lid']
    add(kit.superellipsoid('Lid', ld['radii'], 0.7, 1.0, seg=(40, 20), location=(0, 0, ld['z'])), m['role']('Lid'),
        'lid')
    add(kit.torus('LidRim', 0.092, 0.008, seg=(40, 6), location=(0, 0, 0.508)), m['role']('Trim', 'joint'), 'lid')
    add(kit.superellipsoid('Knob', (0.02, 0.02, 0.02), seg=(18, 12), location=(0, 0, 0.585)), m['beacon'], 'lid')
    add(kit.superellipsoid('KnobBase', (0.026, 0.026, 0.01), 0.4, 1.0, seg=(20, 8), location=(0, 0, 0.568)),
        m['role']('Trim', 'joint'), 'lid')

    # The spout arm, flared at the tip, with a ball joint at its root.
    sp = D['spout']
    spout, _ = kit.tube('Spout', kit.spline(sp, 12), [0.036, 0.032, 0.026, 0.02] if False else 0.024, ring=14)
    add(spout, m['shell'], 'spout')
    add(kit.superellipsoid('SpoutJoint', (0.04, 0.04, 0.04), seg=(18, 12), location=(0.15, 0, 0.385)), m['joint'],
        'body')
    add(kit.torus('SpoutLip', 0.03, 0.007, seg=(24, 8), location=D['tip'], rotation=(0.25, 0.9, 0)),
        m['role']('Trim', 'joint'), 'spout')
    add(kit.torus('SpoutBand', 0.027, 0.0055, seg=(24, 6), location=(0.235, 0, 0.415), rotation=(0, 1.1, 0)),
        m['role']('Trim', 'joint'), 'spout')

    # The handle arm: a loop to a white glove, and the tray with cup and saucer.
    hd = D['handle']
    loop, ts = kit.tube('Handle', kit.spline(hd, 16), 0.019, ring=12)
    add(loop, m['shell'], 'handle')
    add(kit.superellipsoid('HandleJoint', (0.036, 0.036, 0.036), seg=(18, 12), location=(-0.15, 0, 0.45)),
        m['joint'], 'body')
    hx, hy, hz = D['hand']
    add(kit.superellipsoid('Glove', (0.034, 0.034, 0.036), 0.7, 0.7, seg=(20, 14), location=(hx, hy, hz)),
        m['role']('Glove', 'shell'), 'handle')
    tx, ty, tz = D['tray']
    add(kit.superellipsoid('Tray', (0.115, 0.115, 0.007), 0.3, 1.0, seg=(40, 8), location=(tx, ty, tz)),
        m['role']('Tray', 'joint'), 'handle')
    add(kit.torus('TrayRim', 0.113, 0.006, seg=(40, 6), location=(tx, ty, tz + 0.004)), m['role']('Trim', 'joint'),
        'handle')
    add(kit.superellipsoid('Saucer', (0.05, 0.05, 0.006), 0.4, 1.0, seg=(28, 8), location=(tx, ty, tz + 0.011)),
        m['role']('Cup', 'shell'), 'handle')
    add(kit.superellipsoid('Cup', (0.032, 0.032, 0.028), 0.6, 1.0, seg=(28, 14), location=(tx, ty, tz + 0.04)),
        m['role']('Cup', 'shell'), 'handle')
    add(kit.superellipsoid('Tea', (0.027, 0.027, 0.004), 0.5, 1.0, seg=(20, 6), location=(tx, ty, tz + 0.063)),
        m['dot'](3), 'handle')
    add(kit.torus('CupHandle', 0.014, 0.0045, seg=(16, 6), location=(tx + 0.036, ty, tz + 0.042),
                  rotation=(math.pi / 2, 0, 0)), m['role']('Cup', 'shell'), 'handle')

    # The tea stream and the steam puffs, scaled to nothing until they're wanted.
    po = D['poured']
    st, _ = kit.tube('Stream', [po, (po[0], 0, 0.075)], 0.0075, ring=8)
    add(st, m['dot'](3), 'stream')
    # The guest's cup, set down on the floor under the spout while he pours.
    cx = D['cup2'][0]
    add(kit.superellipsoid('Saucer2', (0.058, 0.058, 0.007), 0.4, 1.0, seg=(28, 8), location=(cx, 0, 0.008)),
        m['role']('Cup', 'shell'), 'cup2')
    add(kit.superellipsoid('Cup2', (0.04, 0.04, 0.034), 0.6, 1.0, seg=(28, 14), location=(cx, 0, 0.045)),
        m['role']('Cup', 'shell'), 'cup2')
    add(kit.superellipsoid('Tea2', (0.034, 0.034, 0.004), 0.5, 1.0, seg=(20, 6), location=(cx, 0, 0.076)),
        m['dot'](3), 'cup2')
    add(kit.torus('CupHandle2', 0.017, 0.005, seg=(16, 6), location=(cx + 0.044, 0, 0.047),
                  rotation=(math.pi / 2, 0, 0)), m['role']('Cup', 'shell'), 'cup2')
    for i in (1, 2, 3):
        add(kit.superellipsoid(f'LidPuff.{i}', (0.026,) * 3, seg=(14, 10), location=(0, 0, 0.6 + 0.005 * i)),
            m['dot'](4), f'lidsteam{i}')
        add(kit.superellipsoid(f'CupPuff.{i}', (0.022,) * 3, seg=(14, 10), location=(cx, 0, 0.09 + 0.003 * i)),
            m['dot'](4), f'cupsteam{i}')

    return p.finish(kit.armature('TeapotRig', rig_bones()))
