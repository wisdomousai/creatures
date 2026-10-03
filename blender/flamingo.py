"""Flo, the crew's robot flamingo: a tall, slender, haughty toy robot, not a flamingo in a
robot suit. A smooth pear of a body on two long thin legs of rounded segments with ball
joints and the backward knee, a long S-curved neck in five rounded segments on its own
bones (neck.1-5) with a lit ring at every joint (Dot0-4: the signature, the colour in its
lights), a small head with a screen face and a crown beacon, a bent bill in two halves
(the lower on its own bone) with a dark drooping tip, folded wing plates on the flanks
with dark flight plates, a stub of a tail, and big flat webbed feet. The chest lamp is
Dot5. Faces -Y like the rest of the crew; about 1.25 m to the top of her head.
"""

import math

import birdkit
import kit
import looks

FACE = 'flamingo'
PREVIEW = dict(lift=0.0, width=0.5)
TILT = -0.15

NECK = [(0, -0.12, 0.67), (0, -0.215, 0.77), (0, -0.235, 0.88), (0, -0.15, 0.975), (0, -0.115, 1.08),
        (0, -0.185, 1.155)]

D = {
    'body': dict(radii=(0.105, 0.19, 0.105), center=(0, 0.04, 0.6)),
    'head': dict(radii=(0.052, 0.056, 0.048), center=(0, -0.225, 1.2), e=(0.8, 0.8)),
    'screen': dict(radii=(0.043, 0.026, 0.0242), center=(0, -0.262, 1.205), bezel=0.005),
    'bill': dict(a=(0, -0.275, 1.188), b=(0, -0.345, 1.178), c=(0, -0.4, 1.118)),
    'jaw': dict(pivot=(0, -0.26, 1.165), a=(0, -0.3, 1.162), b=(0, -0.345, 1.158), c=(0, -0.385, 1.12)),
    'wing': dict(shoulder=(0.108, -0.04, 0.665), tip=(0.115, 0.2, 0.56)),
    'tail': dict(base=(0, 0.2, 0.62), tip=(0, 0.3, 0.57)),
    'leg': dict(x=0.06, hip=(0.03, 0.52), knee=(0.05, 0.27), ankle=(0.02, 0.045)),
}


def rig_bones():
    w, lg, j, t = D['wing'], D['leg'], D['jaw'], D['tail']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.12, 0.55), (0, 0.0, 0.7), 'root'),
    ]
    prev = 'body'
    for i in range(5):
        name = f'neck.{i + 1}'
        bones.append((name, NECK[i], NECK[i + 1], prev))
        prev = name
    bones += [
        ('head', NECK[5], (0, -0.2, 1.26), 'neck.5'),
        ('jaw', j['pivot'], (0, -0.4, j['pivot'][2]), 'head'),
        ('tail', t['base'], t['tip'], 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        sx, sy, sz = w['shoulder']
        tx, ty, tz = w['tip']
        bones.append((f'wing.{sfx}', (side * sx, sy, sz), (side * tx, ty, tz), 'body'))
        x = side * lg['x']
        bones.append((f'leg.{sfx}', (x, lg['hip'][0], lg['hip'][1]), (x, lg['knee'][0], lg['knee'][1]), 'body'))
        bones.append((f'shin.{sfx}', (x, lg['knee'][0], lg['knee'][1]), (x, lg['ankle'][0], lg['ankle'][1]),
                      f'leg.{sfx}'))
        bones.append((f'foot.{sfx}', (x, lg['ankle'][0], lg['ankle'][1]), (x, -0.07, 0.0), f'shin.{sfx}'))
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
    add(kit.superellipsoid('Body', b['radii'], 0.85, 0.95, seg=(44, 28), taper=0.2, location=b['center'],
                           rotation=(TILT, 0, 0)), m['shell'], 'body')
    ring = kit.torus('Seam', b['radii'][0] + 0.002, 0.0045, seg=(40, 6), location=b['center'], rotation=(TILT, 0, 0))
    add(kit.stretch(ring, sy=(b['radii'][2]) / (b['radii'][0] + 0.002)), m['joint'], 'body')
    add(birdkit.studs('SeamRivets', [(0.107 * math.cos(a), b['center'][1] + 0.001, b['center'][2] + 0.107 * math.sin(a))
                                     for a in (0.4, 0.8, 2.34, 2.74)], 0.006), m['bezel'], 'body')
    # A raised chest plate with a lamp, and a collar plate where the neck comes out.
    add(kit.superellipsoid('Chest', (0.06, 0.03, 0.07), 0.55, 0.65, seg=(24, 12), location=(0, -0.145, 0.6),
                           rotation=(0.1, 0, 0)), m['role']('Wing', 'joint'), 'body')
    add(birdkit.ball('Lamp', (0, -0.172, 0.625), 0.014, seg=(14, 8)), m['dot'](5), 'body')

    # The neck: five rounded segments, a ball joint and a lit ring at each joint.
    for i in range(5):
        a, c = NECK[i], NECK[i + 1]
        r = 0.036 - 0.003 * i
        add(birdkit.segment(f'Neck.{i + 1}', a, c, r, r, e=(0.7, 0.9), seg=(20, 12), over=1.02), m['shell'],
            f'neck.{i + 1}')
    for i in range(1, 5):
        j = NECK[i]
        r = 0.036 - 0.003 * i
        add(birdkit.ball(f'NeckJoint.{i}', j, r * 0.95, seg=(16, 10)), m['role']('Ring', 'joint'), f'neck.{i + 1}')
        tilt = birdkit.along(NECK[i - 1], NECK[i + 1])
        add(kit.torus(f'NeckRing.{i - 1}', r + 0.004, 0.0085, seg=(28, 8), location=j, rotation=tuple(tilt)),
            m['dot'](i - 1), f'neck.{i + 1}')
    j = NECK[0]
    add(kit.torus('NeckRing.4', 0.045, 0.0085, seg=(28, 8), location=(0, -0.115, 0.675),
                  rotation=tuple(birdkit.along((0, -0.1, 0.62), NECK[1]))), m['dot'](4), 'neck.1')

    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(36, 24), location=h['center']),
        m['shell'], 'head')
    hx, hy, hz = h['center']
    add(birdkit.studs('CheekBolts', [(side * 0.054, hy + 0.0, hz - 0.01) for side in (1, -1)], 0.006), m['bezel'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Flamingo', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(birdkit.ball('Beacon', (0, hy + 0.01, hz + 0.052), 0.0115), m['beacon'], 'head')

    # The bent bill: a thick base and a dark tip turned down; the lower half under it.
    bl, jw = D['bill'], D['jaw']
    add(birdkit.segment('Bill.A', bl['a'], bl['b'], 0.029, 0.021, e=(0.6, 0.8), over=1.05), m['role']('Bill', 'joint'),
        'head')
    add(birdkit.segment('Bill.B', bl['b'], bl['c'], 0.026, 0.018, e=(0.6, 0.8), over=1.12, taper=0.15),
        m['role']('Tip', 'joint'), 'head')
    add(birdkit.segment('Jaw.A', jw['a'], jw['b'], 0.021, 0.013, e=(0.6, 0.8), over=1.05), m['role']('Bill', 'joint'),
        'jaw')
    add(birdkit.segment('Jaw.B', jw['b'], jw['c'], 0.018, 0.011, e=(0.6, 0.8), over=1.1), m['role']('Tip', 'joint'),
        'jaw')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        px, py, pz = jw['pivot']
        add(birdkit.ball(f'HingePin.{sfx}', (side * 0.034, py + 0.004, pz), 0.009, seg=(10, 6)), m['bezel'], 'head')

    # Folded wings on the flanks: a rose plate over a dark flight plate.
    w = D['wing']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a = (side * w['shoulder'][0], w['shoulder'][1], w['shoulder'][2])
        tip = (side * w['tip'][0], w['tip'][1], w['tip'][2])
        add(birdkit.segment(f'Wing.{sfx}', a, tip, 0.018, 0.075, e=(0.6, 0.85), over=1.0),
            m['role']('Wing', 'shell'), f'wing.{sfx}')
        a2 = (a[0] + side * 0.004, a[1] + 0.1, a[2] - 0.045)
        tip2 = (tip[0] + side * 0.006, tip[1] + 0.03, tip[2] - 0.03)
        add(birdkit.segment(f'Flight.{sfx}', a2, tip2, 0.012, 0.045, e=(0.6, 0.85), over=1.0),
            m['role']('Flight', 'joint'), f'wing.{sfx}')
        add(birdkit.ball(f'Shoulder.{sfx}', (a[0] + side * 0.008, a[1], a[2]), 0.027), m['joint'], f'wing.{sfx}')

    t = D['tail']
    for i, dx in enumerate((0.0, 0.03, -0.03)):
        tip = (dx * 1.6, t['tip'][1] + (0.01 if i == 0 else 0), t['tip'][2])
        add(birdkit.segment(f'Tail.{i}', (dx * 0.5, t['base'][1], t['base'][2]), tip, 0.03, 0.007, e=(0.6, 0.9),
                            over=1.0), m['role']('Flight', 'joint') if i == 0 else m['shell'], 'tail')

    # The legs: thin rounded segments, ball joints at hip, knee and ankle; the knee points back.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        hip = (x, lg['hip'][0], lg['hip'][1])
        knee = (x, lg['knee'][0], lg['knee'][1])
        ankle = (x, lg['ankle'][0], lg['ankle'][1])
        add(birdkit.ball(f'Hip.{sfx}', hip, 0.032), m['joint'], f'leg.{sfx}')
        add(birdkit.segment(f'Thigh.{sfx}', hip, knee, 0.016, 0.016, e=(0.8, 0.9), seg=(14, 10)),
            m['role']('Leg', 'joint'), f'leg.{sfx}')
        add(birdkit.ball(f'Knee.{sfx}', knee, 0.024, seg=(14, 10)), m['role']('Ring', 'joint'), f'shin.{sfx}')
        add(birdkit.segment(f'Shin.{sfx}', knee, ankle, 0.0125, 0.0125, e=(0.8, 0.9), seg=(14, 10)),
            m['role']('Leg', 'joint'), f'shin.{sfx}')
        add(birdkit.ball(f'Ankle.{sfx}', ankle, 0.018, seg=(12, 8)), m['bezel'], f'foot.{sfx}')
        # Webbed foot: a flat plate and three toes forward, one back.
        add(kit.superellipsoid(f'Web.{sfx}', (0.05, 0.05, 0.004), 0.4, 0.8, seg=(20, 8),
                               location=(x, ankle[1] - 0.06, 0.006)), m['role']('Foot', 'joint'), f'foot.{sfx}')
        for k, ang in enumerate((-0.45, 0.0, 0.45)):
            tip = (x + math.sin(ang) * 0.1, ankle[1] - math.cos(ang) * 0.1, 0.008)
            add(birdkit.segment(f'Toe.{sfx}{k}', (x, ankle[1], 0.02), tip, 0.0085, 0.0085, e=(0.7, 0.9), seg=(10, 6)),
                m['role']('Foot', 'joint'), f'foot.{sfx}')
        add(birdkit.segment(f'Heel.{sfx}', (x, ankle[1], 0.02), (x, ankle[1] + 0.045, 0.008), 0.008, 0.008,
                            e=(0.7, 0.9), seg=(10, 6)), m['role']('Foot', 'joint'), f'foot.{sfx}')

    return looks.finish(kit.armature('FlamingoRig', rig_bones()), parts, skin, m)
