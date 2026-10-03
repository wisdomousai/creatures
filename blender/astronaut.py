"""Orbit, a small spacesuit robot: a big round bubble helmet with the screen face behind a
gold-rimmed visor, a wide backpack with two tanks and lit gauges, a chest panel of lit buttons
with a hose to each side, pudgy gloved arms with striped sleeves and chunky lunar boots, and a
little antenna with a beacon on the helmet.

Rig: root, body, head (the helmet), antenna, upper_arm/forearm/hand L/R, leg.L/R, and props
on bones of their own, scaled to nothing until a trick wants them: flag (a pole and a flag
with a lit star, Dot3) and dust.1..3 (puffs of moon dust under the boots). Dot0..Dot2 are the
chest buttons and gauges. Faces -Y; about 0.74 m to the tip of the antenna.
"""

import math

import jobkit
import kit
import toykit

FACE = 'astronaut'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'helmet': dict(radii=(0.165, 0.155, 0.16), center=(0, 0, 0.53)),
    'visor': dict(radii=(0.122, 0.06, 0.092), center=(0, -0.1, 0.525), bezel=0.008, e=0.4),
    'body': dict(radii=(0.115, 0.09, 0.115), center=(0, 0, 0.285)),
    'shoulder': (0.125, 0, 0.345),
    'elbow': (0.17, -0.01, 0.265),
    'wrist': (0.18, -0.03, 0.195),
    'tip': (0.18, -0.034, 0.16),
    'leg': dict(x=0.065, top=0.2, bottom=0.07),
    'flag': (0.32, -0.04),
}


def rig_bones():
    sh, el, wr, tp = D['shoulder'], D['elbow'], D['wrist'], D['tip']
    lg = D['leg']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.2), (0, 0, 0.4), 'root'),
        ('head', (0, 0, 0.39), (0, 0, 0.7), 'body'),
        ('antenna', (0.06, 0.04, 0.665), (0.08, 0.04, 0.78), 'head'),
    ]
    for side, s in ((1, 'L'), (-1, 'R')):
        bones += jobkit.arm_bones(side, s, sh, el, wr, tp)
        bones.append((f'leg.{s}', (side * lg['x'], 0, lg['top']), (side * lg['x'], 0, lg['bottom']), 'root'))
    fx, fy = D['flag']
    bones.append(('flag', (fx, fy, 0), (fx, fy, 0.3), 'root'))
    for i in (1, 2, 3):
        bones.append((f'dust.{i}', (0, -0.03, 0.03), (0, -0.03, 0.06), 'root'))
    return bones


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m, add = p.m, p.add
    lg = D['leg']

    # Chunky lunar boots: a fat leg, a big rounded boot with a ridged sole.
    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        jobkit.leg(p, side, s, x, lg['top'], 0.08, 0.034, m['shell'])
        add(kit.superellipsoid(f'Boot.{side}', (0.058, 0.075, 0.05), 0.6, 0.8, seg=(24, 14),
                               location=(x, -0.012, 0.062)), m['role']('Boot'), f'leg.{s}')
        add(kit.superellipsoid(f'Sole.{side}', (0.062, 0.085, 0.015), 0.4, 0.7, seg=(24, 8),
                               location=(x, -0.012, 0.016)), m['joint'], f'leg.{s}')
        add(kit.torus(f'Ankle.{side}', 0.04, 0.0075, seg=(24, 6), location=(x, 0, 0.1)), m['role']('Trim', 'joint'),
            f'leg.{s}')
        for k in range(3):
            add(kit.superellipsoid(f'Tread.{side}.{k}', (0.05, 0.007, 0.007), 0.5, 0.5, seg=(10, 6),
                                   location=(x, -0.07 - 0.0, 0.03 + 0.012 * k)), m['bezel'], f'leg.{s}')

    # Torso: a white shell, a chest panel with lit buttons, a stripe, hoses to each side.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], 0.7, 0.8, seg=(36, 22), location=b['center']), m['shell'], 'body')
    add(kit.torus('Belt', 0.112, 0.01, seg=(40, 6), location=(0, 0, 0.215)), m['role']('Stripe', 'joint'), 'body')
    add(kit.superellipsoid('Panel', (0.07, 0.014, 0.05), 0.4, 0.4, seg=(20, 12), location=(0, -0.088, 0.29)),
        m['bezel'], 'body')
    for i, x in enumerate((-0.04, 0.0, 0.04)):
        add(kit.superellipsoid(f'Button.{i}', (0.012, 0.007, 0.012), seg=(12, 8), location=(x, -0.1, 0.295)),
            m['dot'](i), 'body')
    add(kit.superellipsoid('Dial', (0.025, 0.006, 0.006), 0.5, 0.5, seg=(10, 6), location=(0, -0.1, 0.262)),
        m['glow'], 'body')
    for side in (1, -1):
        hose, _ = kit.tube(f'Hose.{side}', kit.spline([(side * 0.05, -0.085, 0.33), (side * 0.11, -0.095, 0.3),
                                                       (side * 0.13, -0.04, 0.27), (side * 0.12, 0.05, 0.3)], 10),
                           0.0095, ring=10)
        add(hose, m['role']('Stripe', 'joint'), 'body')
    add(kit.torus('Collar', 0.1, 0.014, seg=(40, 8), location=(0, 0, 0.385)), m['role']('Trim', 'joint'), 'body')

    # Backpack: a wide plate, two tanks, lit gauges.
    add(kit.superellipsoid('Pack', (0.125, 0.05, 0.125), 0.45, 0.45, seg=(24, 14), location=(0, 0.125, 0.3)),
        m['role']('Pack', 'joint'), 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'Tank.{side}', (0.04, 0.04, 0.13), 0.5, 1.0, seg=(20, 14),
                               location=(side * 0.07, 0.15, 0.33)), m['role']('Tank'), 'body')
        add(kit.torus(f'TankBand.{side}', 0.041, 0.006, seg=(20, 6), location=(side * 0.07, 0.15, 0.29)),
            m['role']('Trim', 'joint'), 'body')
        add(kit.superellipsoid(f'Gauge.{side}', (0.026, 0.01, 0.026), 0.5, 1.0, seg=(18, 8),
                               location=(side * 0.116, 0.1, 0.34), rotation=(0, 0, side * -0.5)), m['bezel'], 'body')
        add(kit.superellipsoid(f'GaugeLight.{side}', (0.015, 0.006, 0.015), 0.5, 1.0, seg=(14, 8),
                               location=(side * 0.12 - side * 0.002, 0.092, 0.34), rotation=(0, 0, side * -0.5)),
            m['dot'](1 if side > 0 else 2), 'body')

    # The helmet: a big sphere, a gold collar ring, a gold rim round the visor, ear pods.
    h = D['helmet']
    add(kit.superellipsoid('Helmet', h['radii'], 1.0, 1.0, seg=(52, 32), location=h['center']), m['shell'], 'head')
    v = D['visor']
    glass, rim = kit.screen('Visor', v['radii'], v['center'], v['bezel'], e=v['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    ring = kit.torus('VisorRim', 1.0, 0.052, seg=(48, 10))
    kit.stretch(ring, 0.138, 0.118, 0.138)
    ring.rotation_euler = (math.pi / 2, 0, 0)
    ring.location = (0, -0.1, 0.525)
    add(ring, m['role']('Trim', 'joint'), 'head')
    add(kit.torus('NeckRing', 0.1, 0.014, seg=(40, 8), location=(0, 0, 0.405)), m['role']('Trim', 'joint'), 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Pod.{side}', (0.03, 0.045, 0.045), 0.6, 0.8, seg=(20, 12),
                               location=(side * 0.163, 0, 0.53)), m['role']('Trim', 'joint'), 'head')
        add(kit.torus(f'PodRing.{side}', 0.026, 0.005, seg=(24, 6), location=(side * 0.19, 0, 0.53),
                      rotation=(0, math.pi / 2, 0)), m['glow'], 'head')
    # The antenna: a stalk and a beacon ball.
    stalk, _ = kit.tube('Antenna', [(0.06, 0.04, 0.66), (0.08, 0.04, 0.745)], 0.0065, ring=8)
    add(stalk, m['joint'], 'antenna')
    add(kit.superellipsoid('Beacon', (0.02, 0.02, 0.02), seg=(18, 12), location=(0.08, 0.04, 0.765)), m['beacon'],
        'antenna')
    add(kit.superellipsoid('AntBase', (0.02, 0.02, 0.012), 0.4, 1.0, seg=(18, 8), location=(0.06, 0.04, 0.652)),
        m['role']('Trim', 'joint'), 'head')

    # Arms: pudgy white sleeves with a stripe, gold cuffs and big mitts.
    sh, el, wr, tp = D['shoulder'], D['elbow'], D['wrist'], D['tip']
    for side, s in ((1, 'L'), (-1, 'R')):
        f = jobkit.side_fn(side)
        jobkit.arm(p, side, s, sh, el, wr, 0.027, mat=m['shell'], ball=0.036)
        add(kit.torus(f'Sleeve.{side}', 0.029, 0.0075, seg=(20, 6), location=f((0.15, -0.006, 0.3))),
            m['role']('Stripe', 'joint'), f'upper_arm.{s}')
        add(kit.torus(f'Cuff.{side}', 0.031, 0.0085, seg=(20, 6), location=f(wr)), m['role']('Trim', 'joint'),
            f'forearm.{s}')
        add(kit.superellipsoid(f'Mitt.{side}', (0.042, 0.038, 0.042), 0.7, 0.7, seg=(20, 14),
                               location=f((wr[0], wr[1] - 0.004, wr[2] - 0.028))), m['role']('Glove', 'shell'),
            f'hand.{s}')

    # The flag: a pole, a flag with a lit star, a base plate; and puffs of moon dust.
    fx, fy = D['flag']
    pole, _ = kit.tube('Pole', [(fx, fy, 0.0), (fx, fy, 0.3)], 0.005, ring=8)
    add(pole, m['bezel'], 'flag')
    add(kit.superellipsoid('FlagBase', (0.02, 0.02, 0.008), 0.5, 1.0, seg=(16, 6), location=(fx, fy, 0.006)),
        m['joint'], 'flag')
    add(kit.superellipsoid('FlagCloth', (0.07, 0.004, 0.045), 0.4, 0.4, seg=(20, 10),
                           location=(fx + 0.07, fy, 0.25)), m['role']('Flag', 'shell'), 'flag')
    add(kit.superellipsoid('FlagStar', (0.016, 0.006, 0.016), seg=(14, 8), location=(fx + 0.04, fy - 0.003, 0.255)),
        m['dot'](0), 'flag')
    add(kit.superellipsoid('FlagTop', (0.009, 0.009, 0.009), seg=(10, 8), location=(fx, fy, 0.305)), m['beacon'],
        'flag')
    for i in (1, 2, 3):
        add(kit.superellipsoid(f'Dust.{i}', (0.02, 0.02, 0.015), seg=(12, 8), location=(0, -0.03, 0.03)),
            m['role']('Dust', 'joint'), f'dust.{i}')

    return p.finish(kit.armature('AstronautRig', rig_bones()))
