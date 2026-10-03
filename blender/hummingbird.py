"""Zip, the crew's robot hummingbird: a tiny, buzzy toy robot, not a hummingbird in a robot
suit. A little egg of a body tipped breast-up and rump-down, a round head with a screen
face and a needle of a bill in two halves (the lower on its own bone, so it can sip), a
gorget plate on the throat with six lit domes (Dot0-5) that shimmer through the colours,
a crown beacon, a collar between head and body, two layered flat wings on ball shoulders
(each a main blade and a second one hinged on it, so they fan into a blur when he
hovers), a fan of three tail plates, and two tiny legs with grip feet. Faces -Y like the
rest of the crew; about 0.3 m tall, and the smallest of them.
"""

import math

import birdkit
import kit
import looks

FACE = 'hummingbird'
PREVIEW = dict(lift=0.0, width=0.3)
TILT = -0.55

D = {
    'body': dict(radii=(0.06, 0.1, 0.065), center=(0, 0.01, 0.15)),
    'neck': dict(points=[(0, -0.06, 0.2), (0, -0.08, 0.235)], r=0.04),
    'head': dict(radii=(0.052, 0.05, 0.047), center=(0, -0.085, 0.255), e=(0.8, 0.75)),
    'screen': dict(radii=(0.039, 0.022, 0.029), center=(0, -0.121, 0.262), bezel=0.005),
    'bill': dict(base=(0, -0.13, 0.226), tip=(0, -0.3, 0.216), r=(0.0105, 0.0022)),
    'jaw': dict(base=(0, -0.122, 0.2145), tip=(0, -0.255, 0.207), r=(0.0065, 0.002), pivot=(0, -0.12, 0.218)),
    'gorget': dict(radii=(0.037, 0.012, 0.032), center=(0, -0.1, 0.178)),
    'wing': dict(shoulder=(0.052, -0.005, 0.205), tip=(0.075, 0.2, 0.18), width=0.05, thick=0.008),
    'tail': dict(base=(0, 0.085, 0.118), tip=(0, 0.17, 0.065)),
    'leg': dict(x=0.03, top=(0.0, 0.095), bottom=(0.0, 0.012), r=0.008),
}


def rig_bones():
    w, lg, j = D['wing'], D['leg'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.06), None),
        ('body', (0, 0.05, 0.12), (0, 0.0, 0.22), 'root'),
        ('head', (0, -0.07, 0.22), (0, -0.09, 0.3), 'body'),
        ('jaw', j['pivot'], (0, -0.2, j['pivot'][2]), 'head'),
        ('tail', D['tail']['base'], D['tail']['tip'], 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        sx, sy, sz = w['shoulder']
        tx, ty, tz = w['tip']
        bones.append((f'wing.{sfx}', (side * sx, sy, sz), (side * tx, ty, tz), 'body'))
        bones.append((f'wing.{sfx}.2', (side * sx, sy, sz), (side * (tx - 0.004), ty * 0.85, tz), f'wing.{sfx}'))
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
    add(kit.superellipsoid('Body', b['radii'], 0.85, 0.95, seg=(40, 26), taper=0.18, location=b['center'],
                           rotation=(TILT, 0, 0)), m['shell'], 'body')
    # A seam round the middle with a few rivets, and a back plate of another tone.
    ring = kit.torus('Seam', b['radii'][0] + 0.002, 0.004, seg=(36, 6), location=b['center'], rotation=(TILT, 0, 0))
    add(kit.stretch(ring, sy=(b['radii'][2] * 0.98) / (b['radii'][0] + 0.002)), m['joint'], 'body')
    add(birdkit.studs('SeamRivets', [(0.062 * math.cos(a), b['center'][1] + 0.001, b['center'][2] + 0.067 * math.sin(a))
                                     for a in (0.5, 0.9, 2.24, 2.64)], 0.0045), m['bezel'], 'body')
    add(kit.superellipsoid('BackPlate', (0.04, 0.06, 0.011), 0.5, 0.7, seg=(24, 10),
                           location=(0, 0.045, 0.2), rotation=(TILT, 0, 0)), m['role']('Back', 'joint'), 'body')

    n = D['neck']
    neck, ts = kit.tube('Neck', kit.resample(n['points'], 5), n['r'], ring=16)
    add(neck, m['shell'], kit.chain(ts, ['body', 'head']))
    add(kit.stretch(kit.torus('Collar', 0.046, 0.0065, seg=(28, 6), location=(0, -0.068, 0.222), rotation=(0.2, 0, 0)),
                    sy=0.92), m['joint'], 'head')

    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(36, 24), location=h['center']),
        m['shell'], 'head')
    hx, hy, hz = h['center']
    add(birdkit.studs('CheekBolts', [(side * 0.054, hy + 0.004, hz - 0.012) for side in (1, -1)], 0.006),
        m['bezel'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Hummingbird', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(birdkit.ball('Beacon', (0, hy + 0.005, hz + 0.052), 0.0105), m['beacon'], 'head')

    # The needle: the upper bill on the head, the lower half on the jaw bone under it.
    bl, j = D['bill'], D['jaw']
    pts = kit.resample([bl['base'], bl['tip']], 7)
    rad = [bl['r'][0] + (bl['r'][1] - bl['r'][0]) * (i / 6) ** 0.7 for i in range(7)]
    add(kit.tube('Bill', pts, rad, ring=10)[0], m['role']('Bill', 'joint'), 'head')
    pts = kit.resample([j['base'], j['tip']], 6)
    rad = [j['r'][0] + (j['r'][1] - j['r'][0]) * (i / 5) ** 0.7 for i in range(6)]
    add(kit.tube('Jaw', pts, rad, ring=8)[0], m['role']('Bill', 'joint'), 'jaw')
    add(birdkit.ball('SipLamp', (0, bl['base'][1] - 0.012, bl['base'][2] + 0.012), 0.0065, seg=(10, 6)),
        m['beacon'], 'head')

    # The gorget: a plate on the throat with six lit domes in two rows.
    g = D['gorget']
    add(kit.superellipsoid('Gorget', g['radii'], 0.5, 0.6, seg=(28, 12), location=g['center'],
                           rotation=(0.45, 0, 0)), m['role']('Gorget', 'joint'), 'body')
    gx, gy, gz = g['center']
    for i, (x, z) in enumerate(((-0.022, 0.012), (0.0, 0.017), (0.022, 0.012), (-0.026, -0.012), (0.0, -0.007),
                                (0.026, -0.012))):
        add(kit.superellipsoid(f'Gem.{i}', (0.0085, 0.0055, 0.0085), 0.6, 0.6, seg=(12, 8),
                               location=(x, gy - 0.013, gz + z)), m['dot'](i), 'body')

    # Wings: two flat blades hinged at a ball shoulder, the second a little under the first.
    w = D['wing']
    sx, sy, sz = w['shoulder']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a = (side * sx, sy, sz)
        tip = (side * w['tip'][0], w['tip'][1], w['tip'][2])
        add(birdkit.blade(f'Wing.{sfx}', a, tip, w['width'], w['thick'], e=(0.6, 0.9), taper=-0.25), m['shell'],
            f'wing.{sfx}')
        tip2 = (side * (w['tip'][0] - 0.004), w['tip'][1] * 0.86, w['tip'][2] - 0.012)
        add(birdkit.blade(f'Wing2.{sfx}', (a[0], a[1], a[2] - 0.006), tip2, w['width'] * 0.82, w['thick'], e=(0.6, 0.9),
                          taper=-0.25), m['role']('Under', 'joint'), f'wing.{sfx}.2')
        add(birdkit.ball(f'Shoulder.{sfx}', (side * (sx + 0.006), sy, sz), 0.017), m['joint'], f'wing.{sfx}')
        add(birdkit.studs(f'WingBolt.{sfx}', [(side * (sx + 0.014), sy + 0.002, sz + 0.012)], 0.0045), m['bezel'],
            f'wing.{sfx}')

    # Tail: a fan of three plates.
    t = D['tail']
    for i, dx in enumerate((0.0, 0.028, -0.028)):
        tip = (dx * 1.8, t['tip'][1] + 0.01 * (i == 0), t['tip'][2] - 0.012 * (i == 0))
        add(birdkit.blade(f'Tail.{i}', (dx * 0.4, t['base'][1], t['base'][2]), tip, 0.03, 0.007, e=(0.6, 0.9)),
            m['shell'] if i == 0 else m['role']('Under', 'joint'), 'tail')
    add(birdkit.ball('TailPin', (0, t['base'][1] + 0.004, t['base'][2] + 0.004), 0.0075), m['bezel'], 'tail')

    # Two tiny legs with grip feet: three toes forward, one back.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{sfx}', [(x, lg['top'][0], lg['top'][1]), (x, lg['bottom'][0], 0.012)], lg['r'], ring=8)
        add(leg, m['joint'], f'leg.{sfx}')
        for k, ang in enumerate((-0.45, 0.0, 0.45, math.pi)):
            ln = 0.03 if k < 3 else 0.02
            tip = (x + math.sin(ang) * ln, -math.cos(ang) * ln, 0.006)
            add(birdkit.segment(f'Toe.{sfx}{k}', (x, 0.0, 0.006), tip, 0.0055, 0.0055, e=(0.7, 0.9), seg=(10, 6)),
                m['role']('Foot', 'joint'), f'leg.{sfx}')

    return looks.finish(kit.armature('HummingbirdRig', rig_bones()), parts, skin, m)
