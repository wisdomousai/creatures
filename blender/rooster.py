"""Tango, the crew's robot rooster: a tall, proud toy on long yellow legs, chest out. An egg-shaped
body tipped breast-up with a breast lamp (Dot0), a neck with a ring of gold hackle plates round its
base, a head with a face plate round the screen, a short beak on its own jaw bone, a big red comb of
five domes with the beacon behind it and two red wattles. Folded wings with a light on each tip
(Dot1). His signature is the tail: a fan of seven tall plates that arch up and back over him, each
a light of its own (Dot2 to Dot8, left to right) so a run of light can sweep across them. Faces -Y
like the rest of the crew; about 0.7 m to the top of his comb (the tail reaches as high).
"""

import math

import birdkit
import kit
import looks

FACE = 'rooster'
PREVIEW = dict(lift=0.0, width=0.5)
TILT = -0.5

D = {
    'body': dict(radii=(0.14, 0.17, 0.15), center=(0, 0.03, 0.31)),
    'neck': dict(a=(0, -0.065, 0.38), b=(0, -0.115, 0.52)),
    'head': dict(radii=(0.088, 0.082, 0.08), center=(0, -0.125, 0.58), e=(0.9, 0.9)),
    'plate': dict(radii=(0.07, 0.03, 0.055), center=(0, -0.203, 0.585)),
    'screen': dict(radii=(0.058, 0.02, 0.036), center=(0, -0.22, 0.59), bezel=0.006),
    'bill': dict(a=(0, -0.215, 0.545), b=(0, -0.278, 0.535)),
    'jaw': dict(pivot=(0, -0.2, 0.525), a=(0, -0.21, 0.526), b=(0, -0.26, 0.518)),
    'wing': dict(shoulder=(0.135, -0.03, 0.4), tip=(0.145, 0.17, 0.27)),
    'tail': dict(base=(0, 0.16, 0.33), tip=(0, 0.24, 0.62)),
    'leg': dict(x=0.065, top=(0.0, 0.2), bottom=(0.0, 0.0)),
}
FEATHERS = 7


def rig_bones():
    w, lg, t, j = D['wing'], D['leg'], D['tail'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.08, 0.2), (0, 0.0, 0.4), 'root'),
        ('head', (0, -0.07, 0.42), (0, -0.12, 0.66), 'body'),
        ('jaw', j['pivot'], (0, -0.27, j['pivot'][2]), 'head'),
        ('tail', t['base'], t['tip'], 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        sx, sy, sz = w['shoulder']
        tx, ty, tz = w['tip']
        bones.append((f'wing.{sfx}', (side * sx, sy, sz), (side * tx, ty, tz), 'body'))
        bones.append((f'leg.{sfx}', (side * lg['x'], lg['top'][0], lg['top'][1]),
                      (side * lg['x'], lg['bottom'][0], 0.0), 'body'))
    return bones


def feather(add, m, i, n, bone='tail'):
    """Plate i of the tail fan: blades laid end to end along an arch that rises and sweeps back over
    him; the middle ones tallest, the outer ones shorter and a little splayed, so from the side the
    fan is a crescent of nested sickles. Each plate is its own light."""
    t = D['tail']
    u = (i - (n - 1) / 2) / ((n - 1) / 2)  # -1 left .. 1 right
    reach = 1.15 - 0.45 * abs(u) ** 1.3
    spread = u * 0.32
    arch = [(0.0, 0.0), (0.03, 0.14), (0.08, 0.27), (0.16, 0.37), (0.26, 0.42), (0.35, 0.38)]
    pts = []
    for a, b in arch:
        a, b = a * reach, b * reach
        pts.append((t['base'][0] + u * 0.058 + a * math.sin(spread) * 0.6, t['base'][1] + 0.02 + a * math.cos(spread),
                    t['base'][2] + 0.02 + b))
    mat = m['dot'](2 + i)
    for k in range(len(pts) - 1):
        w = 0.09 * (1 - 0.14 * k)
        add(birdkit.blade(f'Tail.{i}.{k}', pts[k], pts[k + 1], 0.017, w, e=(0.8, 0.9), seg=(16, 8), taper=0.0), mat,
            bone)


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
    add(birdkit.studs('SeamRivets', [(0.142 * math.cos(a), b['center'][1] + 0.001 + 0.05 * math.sin(a),
                                      b['center'][2] + 0.15 * math.sin(a) * 0.9) for a in (0.4, 0.8, 2.34, 2.74)],
                      0.0075), m['bezel'], 'body')
    # The breast lamp, out in front.
    add(birdkit.ball('Lamp', (0, -0.153, 0.345), 0.02, seg=(14, 8)), m['dot'](0), 'body')

    # The neck, and a ring of gold hackle plates fanned round its base.
    nk = D['neck']
    neck, _ = kit.tube('Neck', [nk['a'], nk['b']], [0.065, 0.05], ring=14)
    add(neck, m['shell'], 'head')
    for k in range(10):
        ang = 2 * math.pi * k / 10
        r0, r1 = 0.058, 0.098
        a = (r0 * math.cos(ang), -0.08 + r0 * math.sin(ang) * 1.05, 0.46)
        z1 = 0.4 - 0.01 * math.sin(ang)
        c = (r1 * math.cos(ang), -0.08 + r1 * math.sin(ang) * 1.05, z1)
        add(birdkit.blade(f'Hackle.{k}', a, c, 0.044, 0.01, e=(0.8, 0.9), seg=(14, 8)), m['role']('Hackle', 'shell'),
            'body')

    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(40, 28), location=h['center']), m['shell'],
        'head')
    hx, hy, hz = h['center']
    pl = D['plate']
    add(kit.superellipsoid('FacePlate', pl['radii'], 0.5, 0.6, seg=(28, 14), location=pl['center']),
        m['role']('Bill', 'joint'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Rooster', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(birdkit.studs('CheekBolts', [(side * 0.092, hy + 0.0, hz - 0.012) for side in (1, -1)], 0.0075), m['bezel'],
        'head')
    add(birdkit.ball('Beacon', (0, hy + 0.082, hz + 0.052), 0.0115), m['beacon'], 'head')

    # The big comb: five red domes along the crown, the middle one tallest. Two wattles under the beak.
    for i, (y, z, ry, rz) in enumerate(((-0.172, 0.642, 0.022, 0.032), (-0.135, 0.665, 0.027, 0.047),
                                         (-0.095, 0.678, 0.03, 0.06), (-0.057, 0.662, 0.027, 0.047),
                                         (-0.025, 0.635, 0.021, 0.03))):
        add(kit.superellipsoid(f'Comb.{i}', (0.013, ry, rz), 0.7, 0.8, seg=(16, 10), location=(0, y, z)),
            m['role']('Comb', 'shell'), 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Wattle.{side}', (0.011, 0.012, 0.03), 0.7, 0.8, seg=(14, 10),
                               location=(side * 0.016, -0.212, 0.5)), m['role']('Wattle', 'shell'), 'head')

    bk, jw = D['bill'], D['jaw']
    add(birdkit.segment('Bill', bk['a'], bk['b'], 0.02, 0.013, e=(0.7, 0.85), over=1.1, taper=0.25),
        m['role']('Bill', 'joint'), 'head')
    add(birdkit.segment('Jaw', jw['a'], jw['b'], 0.015, 0.009, e=(0.7, 0.85), over=1.1),
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

    # The tail: a fan of tall arching plates, each a light.
    for i in range(FEATHERS):
        feather(add, m, i, FEATHERS)
    t = D['tail']
    add(birdkit.ball('TailPin', (0, t['base'][1] + 0.01, t['base'][2] + 0.02), 0.016), m['bezel'], 'tail')

    # Long yellow legs with a spur, three toes forward and one back.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{sfx}', [(x, lg['top'][0], lg['top'][1]), (x, lg['bottom'][0], 0.015)], 0.019, ring=8)
        add(leg, m['role']('Foot', 'joint'), f'leg.{sfx}')
        add(birdkit.ball(f'Knee.{sfx}', (x, 0.0, 0.1), 0.027, seg=(10, 6)), m['bezel'], f'leg.{sfx}')
        add(birdkit.segment(f'Spur.{sfx}', (x, 0.012, 0.075), (x, 0.04, 0.06), 0.007, 0.007, e=(0.7, 0.9), seg=(8, 6)),
            m['role']('Bill', 'joint'), f'leg.{sfx}')
        for k, ang in enumerate((-0.5, 0.0, 0.5, math.pi)):
            ln = 0.062 if k < 3 else 0.036
            tip = (x + math.sin(ang) * ln, -math.cos(ang) * ln, 0.009)
            add(birdkit.segment(f'Toe.{sfx}{k}', (x, 0.0, 0.01), tip, 0.009, 0.009, e=(0.7, 0.9), seg=(10, 6)),
                m['role']('Foot', 'joint'), f'leg.{sfx}')

    return looks.finish(kit.armature('RoosterRig', rig_bones()), parts, skin, m)
