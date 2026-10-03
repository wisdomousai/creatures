"""Biddy, the crew's robot hen: a plump, round, comfortable toy robot, not a hen in a robot
suit. A big egg-shaped body tipped breast-up, a golden shell with a breast lamp (Dot0), a
round head with a face plate round the screen, a short bill on its own jaw bone, a comb of
three red domes with the beacon behind it, a red wattle, folded wings with a light on each
tip (Dot1), a fan of upright tail plates in a dark tone and short thick yellow legs with
three toes forward and one back. A small egg on its own bone sits behind her, scaled to
nothing until she lays it for a joke. Faces -Y like the rest of the crew; about 0.48 m to
the top of her comb.
"""

import math

import birdkit
import kit
import looks

FACE = 'hen'
PREVIEW = dict(lift=0.0, width=0.4)
TILT = -0.18

D = {
    'body': dict(radii=(0.155, 0.17, 0.145), center=(0, 0.03, 0.2)),
    'head': dict(radii=(0.098, 0.09, 0.085), center=(0, -0.1, 0.39), e=(0.9, 0.9)),
    'plate': dict(radii=(0.078, 0.03, 0.062), center=(0, -0.178, 0.395)),
    'screen': dict(radii=(0.064, 0.022, 0.04), center=(0, -0.195, 0.4), bezel=0.006),
    'bill': dict(a=(0, -0.19, 0.355), b=(0, -0.245, 0.345)),
    'jaw': dict(pivot=(0, -0.175, 0.335), a=(0, -0.185, 0.336), b=(0, -0.232, 0.328)),
    'wing': dict(shoulder=(0.145, -0.01, 0.27), tip=(0.15, 0.2, 0.13)),
    'tail': dict(base=(0, 0.18, 0.24), tip=(0, 0.3, 0.44)),
    'leg': dict(x=0.06, top=(0.0, 0.1), bottom=(0.0, 0.0)),
    'egg': (0.21, 0.04, 0.042),
}


def rig_bones():
    w, lg, t, j = D['wing'], D['leg'], D['tail'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.08, 0.12), (0, 0.0, 0.28), 'root'),
        ('head', (0, -0.06, 0.32), (0, -0.09, 0.48), 'body'),
        ('jaw', j['pivot'], (0, -0.24, j['pivot'][2]), 'head'),
        ('tail', t['base'], t['tip'], 'body'),
        ('egg', (D['egg'][0], D['egg'][1], 0.0), (D['egg'][0], D['egg'][1], 0.08), 'root'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        sx, sy, sz = w['shoulder']
        tx, ty, tz = w['tip']
        bones.append((f'wing.{sfx}', (side * sx, sy, sz), (side * tx, ty, tz), 'body'))
        bones.append((f'leg.{sfx}', (side * lg['x'], lg['top'][0], lg['top'][1]),
                      (side * lg['x'], lg['bottom'][0], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], 0.9, 0.95, seg=(44, 28), taper=0.12, location=b['center'],
                           rotation=(TILT, 0, 0)), m['shell'], 'body')
    ring = kit.torus('Seam', b['radii'][0] + 0.002, 0.006, seg=(40, 6), location=b['center'], rotation=(TILT, 0, 0))
    add(kit.stretch(ring, sy=b['radii'][2] / (b['radii'][0] + 0.002)), m['joint'], 'body')
    add(birdkit.studs('SeamRivets', [(0.157 * math.cos(a), b['center'][1] + 0.001, b['center'][2] + 0.147 * math.sin(a))
                                     for a in (0.4, 0.8, 2.34, 2.74)], 0.0075), m['bezel'], 'body')
    add(birdkit.ball('Lamp', (0, -0.14, 0.225), 0.02, seg=(14, 8)), m['dot'](0), 'body')
    add(kit.stretch(kit.torus('Collar', 0.1, 0.01, seg=(32, 6), location=(0, -0.075, 0.32), rotation=(0.3, 0, 0)),
                    sy=0.93), m['joint'], 'body')

    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(40, 28), location=h['center']), m['shell'],
        'head')
    hx, hy, hz = h['center']
    pl = D['plate']
    add(kit.superellipsoid('FacePlate', pl['radii'], 0.5, 0.6, seg=(28, 14), location=pl['center']),
        m['role']('Bill', 'joint'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Hen', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(birdkit.studs('CheekBolts', [(side * 0.1, hy + 0.0, hz - 0.012) for side in (1, -1)], 0.0075), m['bezel'],
        'head')
    add(birdkit.ball('Beacon', (0, hy + 0.05, hz + 0.075), 0.0115), m['beacon'], 'head')

    # The comb: three red domes along the crown. The wattle hangs under the bill.
    for i, (y, z, ry, rz) in enumerate(((-0.145, 0.468, 0.022, 0.024), (-0.1, 0.482, 0.026, 0.034),
                                         (-0.055, 0.468, 0.022, 0.026))):
        add(kit.superellipsoid(f'Comb.{i}', (0.012, ry, rz), 0.7, 0.8, seg=(16, 10), location=(0, y, z)),
            m['role']('Comb', 'shell'), 'head')
    add(kit.superellipsoid('Wattle', (0.012, 0.012, 0.026), 0.7, 0.8, seg=(14, 10), location=(0, -0.2, 0.322)),
        m['role']('Wattle', 'shell'), 'head')

    bk, jw = D['bill'], D['jaw']
    add(birdkit.segment('Bill', bk['a'], bk['b'], 0.022, 0.014, e=(0.7, 0.85), over=1.1, taper=0.25),
        m['role']('Bill', 'joint'), 'head')
    add(birdkit.segment('Jaw', jw['a'], jw['b'], 0.016, 0.009, e=(0.7, 0.85), over=1.1),
        m['role']('Bill', 'joint'), 'jaw')

    # Folded wings with a light on each tip.
    w = D['wing']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a = (side * w['shoulder'][0], w['shoulder'][1], w['shoulder'][2])
        tip = (side * w['tip'][0], w['tip'][1], w['tip'][2])
        add(birdkit.segment(f'Wing.{sfx}', a, tip, 0.022, 0.09, e=(0.6, 0.85)), m['role']('Wing', 'shell'),
            f'wing.{sfx}')
        add(birdkit.ball(f'WingTip.{sfx}', (tip[0] + side * 0.014, tip[1] + 0.005, tip[2] - 0.006), 0.016,
                         seg=(12, 8)), m['dot'](1), f'wing.{sfx}')
        add(birdkit.ball(f'Shoulder.{sfx}', (a[0] + side * 0.01, a[1], a[2]), 0.034), m['joint'], f'wing.{sfx}')

    # The tail: a fan of upright plates.
    t = D['tail']
    for i, dx in enumerate((0.0, 0.05, -0.05, 0.1, -0.1)):
        top = (dx, t['tip'][1] + 0.02 * (abs(dx) > 0.06) , t['tip'][2] - 0.09 * abs(dx) / 0.05 * 0.6)
        add(birdkit.segment(f'Tail.{i}', (dx * 0.25, t['base'][1], t['base'][2]), top, 0.034, 0.008, e=(0.6, 0.9)),
            m['role']('Tail', 'shell'), 'tail')
    add(birdkit.ball('TailPin', (0, t['base'][1] + 0.005, t['base'][2] + 0.008), 0.012), m['bezel'], 'tail')

    # Short thick yellow legs: three toes forward, one back.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{sfx}', [(x, lg['top'][0], lg['top'][1]), (x, lg['bottom'][0], 0.015)], 0.014, ring=8)
        add(leg, m['role']('Foot', 'joint'), f'leg.{sfx}')
        add(birdkit.ball(f'Knee.{sfx}', (x, 0.0, 0.05), 0.02, seg=(10, 6)), m['bezel'], f'leg.{sfx}')
        for k, ang in enumerate((-0.5, 0.0, 0.5, math.pi)):
            ln = 0.055 if k < 3 else 0.034
            tip = (x + math.sin(ang) * ln, -math.cos(ang) * ln, 0.009)
            add(birdkit.segment(f'Toe.{sfx}{k}', (x, 0.0, 0.01), tip, 0.009, 0.009, e=(0.7, 0.9), seg=(10, 6)),
                m['role']('Foot', 'joint'), f'leg.{sfx}')

    # The egg, for the joke.
    ex, ey, ez = D['egg']
    add(kit.superellipsoid('Egg', (0.032, 0.032, 0.043), 0.9, 0.95, seg=(20, 14), location=(ex, ey, ez)),
        m['role']('Egg', 'shell'), 'egg')

    return looks.finish(kit.armature('HenRig', rig_bones()), parts, skin, m)
