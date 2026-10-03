"""Clink, a toy knight in tin armour: a round helmet whose visor (a brow plate and a chin plate
with an eye slit between) flips up to show the whole screen face, a plume of red pods on a
crest, a breastplate with pauldrons and a skirt of plates, tin boots with knee pods, a heater
shield with a lit emblem on the left forearm and a tiny lance with a pennant in the right hand.

Rig: root, body, head, visor (hinged at the brow), plume, upper_arm/forearm/hand L/R (the shield and lance ride the hands
rides the left forearm, the lance the right hand), leg.L/R. Dot0 is the shield's emblem, Dot1
the lance tip. The finial on the helmet is the beacon. Faces -Y; about 0.76 m to the plume.
"""

import math

import jobkit
import kit
import toykit

FACE = 'knight'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'helm': dict(radii=(0.14, 0.125, 0.125), center=(0, 0, 0.53), e1=0.8, e2=0.9),
    'screen': dict(radii=(0.095, 0.045, 0.065), center=(0, -0.078, 0.525), bezel=0.008, e=0.33),
    'body': dict(radii=(0.105, 0.085, 0.115), center=(0, 0, 0.29)),
    'shoulder': (0.125, 0, 0.365),
    'elbow': (0.17, -0.01, 0.295),
    'wrist': (0.185, -0.03, 0.225),
    'tip': (0.185, -0.034, 0.19),
    'leg': dict(x=0.06, top=0.2, bottom=0.07),
    'hinge': (0, -0.105, 0.605),
}


def rig_bones():
    sh, el, wr, tp = D['shoulder'], D['elbow'], D['wrist'], D['tip']
    lg = D['leg']
    hx, hy, hz = D['hinge']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.2), (0, 0, 0.4), 'root'),
        ('head', (0, 0, 0.41), (0, 0, 0.66), 'body'),
        ('visor', (hx, hy, hz), (hx, hy - 0.03, hz - 0.1), 'head'),
        ('plume', (0, 0, 0.64), (0, 0.06, 0.78), 'head'),
    ]
    for side, s in ((1, 'L'), (-1, 'R')):
        bones += jobkit.arm_bones(side, s, sh, el, wr, tp)
        bones.append((f'leg.{s}', (side * lg['x'], 0, lg['top']), (side * lg['x'], 0, lg['bottom']), 'root'))
    return bones


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m, add = p.m, p.add
    lg = D['leg']

    # Tin boots and greaves with a knee pod.
    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        jobkit.leg(p, side, s, x, lg['top'], 0.08, 0.022, m['shell'])
        add(kit.superellipsoid(f'Knee.{side}', (0.032, 0.032, 0.03), seg=(16, 10), location=(x, -0.012, 0.15)),
            m['role']('Armor', 'joint'), f'leg.{s}')
        add(kit.superellipsoid(f'Boot.{side}', (0.05, 0.075, 0.045), 0.55, 0.8, seg=(24, 14),
                               location=(x, -0.016, 0.052)), m['role']('Armor', 'joint'), f'leg.{s}')
        add(kit.torus(f'Cuff.{side}', 0.03, 0.007, seg=(20, 6), location=(x, 0, 0.1)), m['role']('Trim', 'bezel'),
            f'leg.{s}')

    # Breastplate with a ridge, a belt and buckle, a skirt of plates, big pauldrons.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], 0.7, 0.8, seg=(36, 22), location=b['center']), m['shell'], 'body')
    add(kit.superellipsoid('Ridge', (0.012, 0.012, 0.09), 0.5, 0.5, seg=(10, 10), location=(0, -0.085, 0.305)),
        m['role']('Trim', 'bezel'), 'body')
    add(kit.torus('Belt', 0.1, 0.011, seg=(40, 6), location=(0, 0, 0.225)), m['role']('Trim', 'bezel'), 'body')
    p.bolt('Buckle', (0, -0.093, 0.225), 'body', 0.013, m['beacon'], rot=(math.pi / 2, 0, 0))
    n = 9
    for k in range(n):
        a = math.pi * 0.2 + 2 * math.pi * 0.8 * k / (n - 1) - math.pi * 0.0
        add(kit.superellipsoid(f'Tasset.{k}', (0.032, 0.012, 0.035), 0.5, 0.6, seg=(12, 8),
                               location=(0.1 * math.cos(a + math.pi / 2), 0.1 * math.sin(a + math.pi / 2) * 0.82, 0.19),
                               rotation=(0, 0, a + math.pi)), m['role']('Armor', 'joint'), 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'Pauldron.{side}', (0.048, 0.045, 0.034), 0.8, 0.8, seg=(20, 12),
                               location=(side * 0.135, 0, 0.385), rotation=(0, side * 0.3, 0)),
            m['role']('Armor', 'joint'), 'body')
    for i, (bx, bz) in enumerate(((0.06, 0.33), (-0.06, 0.33), (0.075, 0.26), (-0.075, 0.26))):
        p.bolt(f'Rivet.{i}', (bx, -0.085, bz), 'body', 0.007, m['bezel'], rot=(math.pi / 2, 0, 0))
    add(kit.superellipsoid('Neck', (0.055, 0.055, 0.03), 0.5, 1.0, seg=(20, 8), location=(0, 0, 0.41)), m['joint'],
        'body')

    # The helmet: dome, a brim ring, the screen, ear studs, a crest, a finial, the plume.
    h = D['helm']
    add(kit.superellipsoid('Helm', h['radii'], h['e1'], h['e2'], seg=(52, 30), location=h['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Knight', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(kit.torus('Gorget', 0.12, 0.012, seg=(40, 8), location=(0, 0, 0.425)), m['role']('Trim', 'bezel'), 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Stud.{side}', (0.02, 0.03, 0.03), 0.6, 0.9, seg=(16, 10),
                               location=(side * 0.135, 0.0, 0.525)), m['role']('Trim', 'bezel'), 'head')
        add(kit.superellipsoid(f'Hinge.{side}', (0.015, 0.015, 0.015), seg=(12, 8),
                               location=(side * 0.118, -0.06, 0.6)), m['role']('Trim', 'bezel'), 'head')
    add(kit.superellipsoid('Crest', (0.014, 0.07, 0.022), 0.6, 0.6, seg=(12, 10), location=(0, 0.0, 0.64)),
        m['role']('Trim', 'bezel'), 'head')
    add(kit.superellipsoid('Finial', (0.02, 0.02, 0.02), seg=(16, 10), location=(0, -0.06, 0.66)), m['beacon'], 'head')
    for i, (y, z, r) in enumerate(((0.01, 0.675, 0.032), (0.04, 0.715, 0.034), (0.085, 0.735, 0.034),
                                   (0.13, 0.725, 0.03), (0.165, 0.69, 0.025))):
        add(kit.superellipsoid(f'Plume.{i}', (r, r * 1.15, r), seg=(14, 10), location=(0, y, z)),
            m['role']('Plume'), 'plume')

    # The visor: a brow plate above and a chin plate below, with the eyes showing between.
    hx, hy, hz = D['hinge']
    add(kit.superellipsoid('VisorBrow', (0.115, 0.016, 0.034), 0.45, 0.45, seg=(24, 10), location=(0, -0.135, 0.575)),
        m['role']('Visor', 'shell'), 'visor')
    add(kit.superellipsoid('VisorChin', (0.105, 0.016, 0.052), 0.45, 0.45, seg=(24, 10), location=(0, -0.132, 0.445)),
        m['role']('Visor', 'shell'), 'visor')
    for side in (1, -1):
        add(kit.superellipsoid(f'VisorSide.{side}', (0.012, 0.03, 0.09), 0.5, 0.5, seg=(12, 10),
                               location=(side * 0.112, -0.1, 0.52)), m['role']('Visor', 'shell'), 'visor')
    for k in range(3):
        add(kit.superellipsoid(f'VisorVent.{k}', (0.012, 0.004, 0.004), 0.5, 0.5, seg=(8, 6),
                               location=((k - 1) * 0.04, -0.152, 0.435)), m['bezel'], 'visor')

    # Arms with gauntlets; the shield on the left forearm, the lance in the right fist.
    sh, el, wr, tp = D['shoulder'], D['elbow'], D['wrist'], D['tip']
    for side, s in ((1, 'L'), (-1, 'R')):
        f = jobkit.side_fn(side)
        jobkit.arm(p, side, s, sh, el, wr, 0.0175, mat=m['shell'])
        add(kit.superellipsoid(f'Gauntlet.{side}', (0.032, 0.03, 0.034), 0.7, 0.7, seg=(18, 12),
                               location=f((wr[0], wr[1] - 0.004, wr[2] - 0.02))), m['role']('Armor', 'joint'),
            f'hand.{s}')
        add(kit.torus(f'Vambrace.{side}', 0.025, 0.007, seg=(20, 6), location=f((wr[0], wr[1], wr[2] + 0.02))),
            m['role']('Trim', 'bezel'), f'forearm.{s}')
    sx, sy, sz = 0.215, -0.075, 0.275
    add(kit.superellipsoid('ShieldRim', (0.08, 0.01, 0.1), 0.5, 0.4, seg=(24, 12), taper=-0.5,
                           location=(sx, sy + 0.008, sz)), m['role']('Trim', 'bezel'), 'hand.L')
    add(kit.superellipsoid('Shield', (0.072, 0.012, 0.092), 0.5, 0.4, seg=(24, 12), taper=-0.5,
                           location=(sx, sy, sz)), m['role']('Shield'), 'hand.L')
    add(kit.superellipsoid('Emblem', (0.026, 0.006, 0.034), 0.6, 0.6, seg=(16, 10), location=(sx, sy - 0.012, sz + 0.012)),
        m['dot'](0), 'hand.L')
    p.bolt('Boss', (sx, sy - 0.017, sz - 0.04), 'hand.L', 0.01, m['role']('Trim', 'bezel'), rot=(math.pi / 2, 0, 0))
    # The lance: a pole through the fist, a pennant, a point.
    lx, ly = -wr[0], wr[1] - 0.012
    pole, _ = kit.tube('Lance', [(lx, ly, 0.08), (lx, ly, 0.62)], 0.0085, ring=10)
    add(pole, m['role']('Wood', 'joint'), 'hand.R')
    add(kit.superellipsoid('LancePoint', (0.016, 0.016, 0.04), 0.8, 0.8, seg=(14, 10), taper=0.7,
                           location=(lx, ly, 0.655)), m['dot'](1), 'hand.R')
    add(kit.superellipsoid('Pennant', (0.008, 0.05, 0.022), 0.4, 0.4, seg=(14, 8), taper=0.5,
                           location=(lx, ly + 0.05, 0.585), rotation=(0, 0, 0)), m['role']('Plume'), 'hand.R')
    add(kit.superellipsoid('LanceButt', (0.014, 0.014, 0.014), seg=(12, 8), location=(lx, ly, 0.08)),
        m['role']('Trim', 'bezel'), 'hand.R')

    return p.finish(kit.armature('KnightRig', rig_bones()))
