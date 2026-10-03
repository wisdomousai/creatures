"""Muffet, the crew's robot jumping spider: small, round and fuzzy, the cutest thing with eight
legs. A big chunky cephalothorax almost all face (a wide screen with two huge round eyes,
each in a shiny lens ring), a crown of three fur pods and four lit forehead eyes (Dot3), two
stubby colourful pedipalps in front (`palp.L.1/.2`, `palp.R.1/.2`, lit at the tips, Dot0 left
and Dot1 right), a round abdomen behind with a few lit spots (Dot2) on a bone of its own,
and eight short jointed legs, four a side, each a thigh up to a high knee and a shin down to
a pad (`leg.L.0` .. `leg.L.3`, `foot.L.0` ..), fanned out so the front pair can reach up.
Faces -Y; about 0.3 m tall, 0.6 m across the feet.
"""

import math

import bugkit
import kit
import looks
from bugkit import SIDES, ball

FACE = 'jumpingspider'
PREVIEW = dict(lift=0.0, width=0.52)

D = {
    'head': dict(radii=(0.118, 0.105, 0.092), center=(0, -0.01, 0.2), e=(0.7, 0.75)),
    'abdomen': dict(radii=(0.082, 0.095, 0.082), center=(0, 0.15, 0.2)),
    # 4:3, like the jumping spider's face layout (256 x 192)
    'screen': dict(radii=(0.088, 0.02, 0.066), center=(0, -0.104, 0.2), bezel=0.006),
    'hip_y': [-0.065, -0.022, 0.022, 0.065],
    'knee_dy': [-0.075, -0.03, 0.03, 0.085],
    'foot_dy': [-0.115, -0.05, 0.05, 0.13],
    'hip': (0.085, 0.16),
    'knee': (0.185, 0.235),
    'foot': (0.255, 0.0),
    'palp': [(0.04, -0.1, 0.13), (0.058, -0.15, 0.125), (0.06, -0.19, 0.105)],
}


def leg_geometry():
    d = D
    legs = []
    for k in range(4):
        y = d['hip_y'][k]
        legs.append(((d['hip'][0], y, d['hip'][1]), (d['knee'][0], y + d['knee_dy'][k], d['knee'][1]),
                     (d['foot'][0], y + d['foot_dy'][k], d['foot'][1])))
    return legs


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.0, 0.15), (0, 0.0, 0.3), 'root'),
        ('abdomen', (0, 0.1, 0.2), (0, 0.22, 0.2), 'body'),
    ]
    for side, sfx in SIDES:
        bones += [(f'palp.{sfx}.1', bugkit.mirror(D['palp'][0], side), bugkit.mirror(D['palp'][1], side), 'body'),
                  (f'palp.{sfx}.2', bugkit.mirror(D['palp'][1], side), bugkit.mirror(D['palp'][2], side),
                   f'palp.{sfx}.1')]
        for k, (h, kn, ft) in enumerate(leg_geometry()):
            bones += [(f'leg.{sfx}.{k}', bugkit.mirror(h, side), bugkit.mirror(kn, side), 'body'),
                      (f'foot.{sfx}.{k}', bugkit.mirror(kn, side), bugkit.mirror(ft, side), f'leg.{sfx}.{k}')]
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(40, 28), location=h['center']),
        m['role']('Head'), 'body')
    sc = D['screen']
    glass, rim = kit.screen('Spider', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'body')
    add(rim, m['bezel'], 'body')
    # Shiny lens rings round the two big eyes.
    for side in (-1, 1):
        ring = kit.torus(f'Lens.{side}', 0.04, 0.0075, seg=(36, 8),
                         location=(side * 0.0305 * 1.18 * 1.0, sc['center'][1] - 0.019, 0.2),
                         rotation=(math.radians(90), 0, 0))
        kit.stretch(ring, 1.0, 1.35, 1.0)
        add(ring, m['bezel'], 'body')
    # Crown of fur pods, cheek pods, and four small lit eyes on the brow.
    for k, (x, y, z, r) in enumerate(((-0.05, -0.0, 0.282, 0.034), (0.05, 0.0, 0.282, 0.034), (0, 0.03, 0.292, 0.036),
                                      (-0.105, -0.045, 0.14, 0.03), (0.105, -0.045, 0.14, 0.03))):
        add(ball(f'Fur{k}', (x, y, z), r, seg=(14, 10)), m['role']('Tuft', 'shell'), 'body')
    for k, (x, y, z, r) in enumerate(((-0.058, -0.082, 0.262, 0.0125), (0.058, -0.082, 0.262, 0.0125),
                                      (-0.026, -0.078, 0.282, 0.011), (0.026, -0.078, 0.282, 0.011))):
        add(ball(f'Eye{k}', (x, y, z), r, seg=(12, 8)), m['dot'](3), 'body')
    add(kit.torus('Neck', 0.07, 0.008, seg=(32, 6), location=(0, 0.085, 0.2), rotation=(math.radians(90), 0, 0)),
        m['joint'], 'body')

    # The abdomen with lit spots.
    a = D['abdomen']
    add(kit.superellipsoid('Abdomen', a['radii'], 0.9, 0.9, seg=(32, 22), location=a['center'], taper=0.0),
        m['role']('Fuzz'), 'abdomen')
    ax, ay, az = a['center']
    for k, (x, y) in enumerate(((0, -0.04), (-0.03, 0.0), (0.03, 0.0), (0, 0.045))):
        z = az + a['radii'][2] * math.sqrt(max(0.0, 1 - (x / a['radii'][0]) ** 2 - (y / a['radii'][1]) ** 2)) * 0.97
        add(kit.superellipsoid(f'Spot{k}', (0.016, 0.014, 0.008), 0.8, 0.9, seg=(14, 8),
                               location=(x, ay + y, z)), m['dot'](2), 'abdomen')
    add(ball('Spinneret', (0, ay + a['radii'][1] * 0.95, az - 0.01), 0.02, seg=(12, 8)), m['joint'], 'abdomen')

    # Pedipalps: two stubby jointed arms, lit at the tips.
    for side, sfx in SIDES:
        p = [bugkit.mirror(q, side) for q in D['palp']]
        tube, ts = kit.tube(f'Palp.{sfx}', kit.spline(p, 10), [0.017 - 0.004 * i / 9 for i in range(10)], ring=8)
        add(tube, m['joint'], kit.chain(ts, [f'palp.{sfx}.1', f'palp.{sfx}.2']))
        add(ball(f'PalpKnee.{sfx}', p[1], 0.022, seg=(12, 8)), m['role']('Palp', 'shell'), f'palp.{sfx}.1')
        add(ball(f'PalpTip.{sfx}', p[2], 0.026, seg=(16, 10)), m['dot'](0 if side > 0 else 1), f'palp.{sfx}.2')

    # Eight legs, the front pair a little thicker.
    for side, sfx in SIDES:
        for k, (hp, kn, ft) in enumerate(leg_geometry()):
            hp, kn, ft = (bugkit.mirror(q, side) for q in (hp, kn, ft))
            r = 0.019 if k == 0 else 0.0165
            upper, _ = kit.tube(f'Leg.{sfx}.{k}', [hp, kn], r, ring=8)
            add(upper, m['joint'], f'leg.{sfx}.{k}')
            lower, _ = kit.tube(f'Shin.{sfx}.{k}', [kn, ft], r * 0.85, ring=8)
            add(lower, m['joint'], f'foot.{sfx}.{k}')
            add(ball(f'Knee.{sfx}.{k}', kn, r * 1.5, seg=(12, 8)), m['role']('Knee', 'shell'), f'foot.{sfx}.{k}')
            add(kit.superellipsoid(f'Pad.{sfx}.{k}', (0.02, 0.026, 0.008), 0.4, 0.6, seg=(16, 8),
                                   location=(ft[0], ft[1], 0.008)), m['shell'], f'foot.{sfx}.{k}')
            add(ball(f'Hip.{sfx}.{k}', hp, r * 1.6, seg=(12, 8)), m['joint'], f'leg.{sfx}.{k}')

    return looks.finish(kit.armature('SpiderRig', rig_bones()), parts, skin, m, outline=0.004)
