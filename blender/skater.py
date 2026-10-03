"""Skip, a play-friend: a compact humanoid robot on inline roller skates (three wheels a
boot, hubs lit like running lights), in a big rounded helmet with a ridge fin, a brim, ear
guards and a wide visor screen, with knee pads, elbow pads and wrist guards, shorts and a
small badge on the chest. Knees bend (thigh and shin are separate bones), so he can crouch,
push off, glide and skid.

Rig: root, body, head, upper_arm / forearm / hand L/R (Bolt's and Nova's bone names, so the
shared play poses work), leg.L/R (thigh), shin.L/R, boot.L/R and wheel0..2.L/R. Dot0 is the
chest badge, Dot1 the ear lights, Dot2 the helmet fin's stripe, Dot3 the wheel hubs. Faces
-Y; about 0.84 m to the top of the fin.
"""

import math

import kit
import toykit
from toykit import mirror_x

FACE = 'skater'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'head': dict(radii=(0.135, 0.125, 0.115), center=(0, 0, 0.705), e1=0.75, e2=0.9),
    'screen': dict(radii=(0.108, 0.06, 0.054), center=(0, -0.088, 0.7), bezel=0.008, e=0.3),
    'torso': dict(radii=(0.095, 0.072, 0.09), center=(0, 0, 0.52)),
    'shoulder': (0.115, 0.0, 0.575),
    'elbow': (0.125, 0.0, 0.445),
    'wrist': (0.13, -0.004, 0.32),
    'hip': (0.052, 0.0, 0.44),
    'knee': (0.052, 0.0, 0.29),
    'ankle': (0.052, 0.0, 0.14),
    'wheel': dict(r=0.03, half=0.011, ys=(-0.062, 0.0, 0.062), z=0.03),
}


def rig_bones():
    sh, el, wr = D['shoulder'], D['elbow'], D['wrist']
    hp, kn, an = D['hip'], D['knee'], D['ankle']
    w = D['wheel']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.12), None),
        ('body', (0, 0, 0.44), (0, 0, 0.6), 'root'),
        ('head', (0, 0, 0.62), (0, 0, 0.84), 'body'),
    ]
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        bones += [
            (f'upper_arm.{s}', f(sh), f(el), 'body'),
            (f'forearm.{s}', f(el), f(wr), f'upper_arm.{s}'),
            (f'hand.{s}', f(wr), f((wr[0], wr[1], wr[2] - 0.05)), f'forearm.{s}'),
            (f'leg.{s}', f(hp), f(kn), 'root'),
            (f'shin.{s}', f(kn), f(an), f'leg.{s}'),
            (f'boot.{s}', f(an), f((an[0], -0.07, 0.06)), f'shin.{s}'),
        ]
        for i, y in enumerate(w['ys']):
            bones.append((f'wheel{i}.{s}', f((an[0], y, w['z'])), f((an[0], y, w['z'] + 0.02)), f'boot.{s}'))
    return bones


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m, add = p.m, p.add
    hp, kn, an, w = D['hip'], D['knee'], D['ankle'], D['wheel']

    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * hp[0]
        # Thigh, knee pad, shin, high-top boot.
        thigh, _ = kit.tube(f'Thigh.{side}', [(x, 0, hp[2] - 0.01), (x, 0, kn[2])], 0.025, ring=14)
        add(thigh, m['joint'], f'leg.{s}')
        shin, _ = kit.tube(f'Shin.{side}', [(x, 0, kn[2]), (x, 0, an[2] + 0.02)], 0.021, ring=14)
        add(shin, m['joint'], f'shin.{s}')
        add(kit.superellipsoid(f'KneeBall.{side}', (0.026, 0.026, 0.026), seg=(14, 10), location=(x, 0, kn[2])),
            m['bezel'], f'leg.{s}')
        add(kit.superellipsoid(f'KneePad.{side}', (0.04, 0.034, 0.042), 0.6, 0.7, seg=(24, 14),
                               location=(x, -0.016, kn[2] + 0.004)), m['role']('Helmet'), f'leg.{s}')
        add(kit.torus(f'KneeRim.{side}', 0.034, 0.0055, seg=(24, 6), location=(x, -0.044, kn[2] + 0.004),
                      rotation=(math.pi / 2, 0, 0)), m['role']('Skate', 'bezel'), f'leg.{s}')
        add(kit.superellipsoid(f'Boot.{side}', (0.042, 0.08, 0.055), 0.45, 0.55, seg=(28, 16),
                               location=(x, -0.012, 0.105)), m['role']('Pad', 'bezel'), f'boot.{s}')
        add(kit.torus(f'Cuff.{side}', 0.034, 0.007, seg=(24, 6), location=(x, 0.0, 0.158)), m['role']('Skate', 'bezel'),
            f'boot.{s}')
        add(kit.superellipsoid(f'BootToe.{side}', (0.036, 0.034, 0.03), 0.5, 0.6, seg=(18, 10),
                               location=(x, -0.066, 0.085)), m['role']('Skate', 'bezel'), f'boot.{s}')
        add(kit.superellipsoid(f'Frame.{side}', (0.012, 0.1, 0.016), 0.4, 0.5, seg=(20, 8), location=(x, 0, 0.056)),
            m['joint'], f'boot.{s}')
        for k in range(3):
            add(kit.superellipsoid(f'Strap.{side}.{k}', (0.044, 0.008, 0.004), 0.4, 0.5, seg=(12, 6),
                                   location=(x, -0.045 + 0.027 * k, 0.15 - 0.003 * k)), m['joint'], f'boot.{s}')
        for i, y in enumerate(w['ys']):
            add(kit.superellipsoid(f'Axle.{side}.{i}', (0.028, 0.0055, 0.0055), seg=(12, 6), location=(x, y, w['z'])),
                m['bezel'], f'boot.{s}')
            for k in (1, -1):
                add(kit.superellipsoid(f'Wheel.{side}.{i}.{k}', (w['r'], w['r'], w['half']), 0.5, 0.9, seg=(22, 8),
                                       location=(x + k * 0.017, y, w['z']), rotation=(0, math.pi / 2, 0)),
                    m['role']('Wheel', 'bezel'), f'wheel{i}.{s}')
                add(kit.superellipsoid(f'Hub.{side}.{i}.{k}', (0.013, 0.013, 0.004), 0.5, 1.0, seg=(14, 6),
                                       location=(x + k * 0.017 + k * 0.0105, y, w['z']), rotation=(0, math.pi / 2, 0)),
                    m['dot'](3), f'wheel{i}.{s}')

    # Shorts, torso, badge, neck.
    t = D['torso']
    add(kit.superellipsoid('Shorts', (0.098, 0.072, 0.052), 0.5, 0.8, seg=(28, 14), location=(0, 0, 0.445)),
        m['role']('Pad'), 'body')
    add(kit.superellipsoid('Torso', t['radii'], 0.55, 0.8, seg=(32, 20), taper=0.1, location=t['center']), m['shell'],
        'body')
    add(kit.torus('Belt', 0.092, 0.0085, seg=(32, 8), location=(0, 0, 0.482)), m['role']('Skate', 'bezel'), 'body')
    add(kit.torus('BadgeRim', 0.027, 0.0055, seg=(24, 6), location=(0, -0.066, 0.545), rotation=(math.pi / 2, 0, 0)),
        m['role']('Skate', 'bezel'), 'body')
    add(kit.superellipsoid('Badge', (0.022, 0.006, 0.022), 0.5, 0.9, seg=(20, 8), location=(0, -0.0675, 0.545)),
        m['dot'](0), 'body')
    add(kit.superellipsoid('Neck', (0.04, 0.04, 0.022), 0.5, 1.0, seg=(20, 8), location=(0, 0, 0.615)), m['joint'],
        'body')

    # The helmet: shell, visor, brim, fin, ear guards, vents, strap.
    h = D['head']
    add(kit.superellipsoid('Helmet', h['radii'], h['e1'], h['e2'], seg=(48, 30), location=h['center']),
        m['role']('Helmet'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Skip', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(kit.superellipsoid('Brim', (0.112, 0.055, 0.011), 0.4, 0.6, seg=(28, 10), location=(0, -0.095, 0.762),
                           rotation=(-0.18, 0, 0)), m['role']('Skate', 'bezel'), 'head')
    add(kit.superellipsoid('Fin', (0.011, 0.115, 0.032), 0.5, 0.5, seg=(24, 10), location=(0, 0.0, 0.812)),
        m['role']('Skate', 'bezel'), 'head')
    add(kit.superellipsoid('FinStripe', (0.0125, 0.075, 0.008), 0.5, 0.5, seg=(18, 6), location=(0, 0.0, 0.824)),
        m['dot'](2), 'head')
    for k in range(3):
        add(kit.superellipsoid(f'Vent.{k}', (0.03, 0.007, 0.004), 0.4, 0.5, seg=(12, 6),
                               location=(0, 0.04 + 0.025 * k, 0.805 - 0.012 * k), rotation=(-0.35 - 0.2 * k, 0, 0)),
            m['bezel'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'EarGuard.{side}', (0.022, 0.05, 0.05), 0.6, 0.9, seg=(22, 14),
                               location=(side * 0.133, 0.005, 0.69)), m['role']('Pad'), 'head')
        add(kit.torus(f'EarLight.{side}', 0.026, 0.0055, seg=(24, 8), location=(side * 0.156, 0.005, 0.69),
                      rotation=(0, math.pi / 2, 0)), m['dot'](1), 'head')
    add(kit.torus('Chin', 0.12, 0.0065, seg=(40, 6), location=(0, 0.0, 0.628), rotation=(0, 0, 0)), m['bezel'], 'head')

    # Arms with elbow pads, wrist guards and mitten hands.
    sh, el, wr = D['shoulder'], D['elbow'], D['wrist']
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.superellipsoid(f'Shoulder.{side}', (0.028, 0.028, 0.028), seg=(16, 10), location=f(sh)), m['joint'],
            'body')
        p.hose(f'Arm.{side}', [f(sh), f(el), f(wr)], 0.0165, [f'upper_arm.{s}', f'forearm.{s}'], m['shell'], n=14)
        add(kit.superellipsoid(f'ElbowPad.{side}', (0.03, 0.03, 0.034), 0.6, 0.8, seg=(20, 12),
                               location=f((el[0], el[1] - 0.006, el[2]))), m['role']('Helmet'), f'forearm.{s}')
        add(kit.superellipsoid(f'Guard.{side}', (0.026, 0.026, 0.026), 0.5, 1.0, seg=(20, 8),
                               location=f((wr[0], wr[1], wr[2] + 0.012))), m['role']('Pad'), f'hand.{s}')
        add(kit.superellipsoid(f'Hand.{side}', (0.03, 0.028, 0.036), 0.6, 0.7, seg=(20, 14),
                               location=f((wr[0], wr[1] - 0.004, wr[2] - 0.026))), m['role']('Skate', 'bezel'),
            f'hand.{s}')

    return p.finish(kit.armature('SkaterRig', rig_bones()))
