"""Gertie, the crew's robot goose: a plump pale-grey barrel of a body on short orange legs with
webbed feet, a long neck of three jointed tubes (each hinge wearing a cuff, the middle one a lit collar,
Dot2) so it can stretch out, hang low or fold back over her back, a head with a face plate round the
screen, an orange beak on its own jaw bone, folded wings with a light on each tip (Dot1), a breast
lamp (Dot0) and a short upturned tail. Faces -Y like the rest of the crew; about 0.6 m to the top of
her head.
"""

import math

import birdkit
import kit
import looks

FACE = 'goose'
PREVIEW = dict(lift=0.0, width=0.5)
TILT = 0.16

D = {
    'body': dict(radii=(0.125, 0.265, 0.11), center=(0, 0.045, 0.175)),
    'neck': dict(points=[(0, -0.15, 0.2), (0, -0.245, 0.27), (0, -0.2, 0.355), (0, -0.215, 0.43), (0, -0.265, 0.49)],
                 r=(0.056, 0.032)),
    'head': dict(radii=(0.058, 0.066, 0.052), center=(0, -0.285, 0.535)),
    'plate': dict(radii=(0.05, 0.03, 0.042), center=(0, -0.328, 0.535)),
    'screen': dict(radii=(0.046, 0.02, 0.026), center=(0, -0.342, 0.54), bezel=0.006),
    'bill': dict(a=(0, -0.34, 0.515), b=(0, -0.415, 0.507)),
    'jaw': dict(pivot=(0, -0.335, 0.493), a=(0, -0.342, 0.493), b=(0, -0.405, 0.485)),
    'wing': dict(shoulder=(0.115, -0.08, 0.235), tip=(0.125, 0.24, 0.215)),
    'tail': dict(base=(0, 0.25, 0.21), tip=(0, 0.35, 0.31)),
    'leg': dict(x=0.07, top=(0.0, 0.1), bottom=(0.0, 0.0)),
}
NECK_BONES = 3


def rig_bones():
    w, lg, t, j = D['wing'], D['leg'], D['tail'], D['jaw']
    pts = kit.spline(D['neck']['points'], 41)
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.1, 0.15), (0, -0.04, 0.24), 'root'),
        ('tail', t['base'], t['tip'], 'body'),
    ]
    parent = 'body'
    cuts = (0, 14, 28, 40)
    for k in range(NECK_BONES):
        name = f'neck.{k + 1}'
        bones.append((name, pts[cuts[k]], pts[cuts[k + 1]], parent))
        parent = name
    bones.append(('head', pts[40], (0, -0.285, 0.6), parent))
    bones.append(('jaw', j['pivot'], (0, -0.405, j['pivot'][2]), 'head'))
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
    add(kit.superellipsoid('Body', b['radii'], 0.9, 0.95, seg=(44, 28), taper=0.1, location=b['center'],
                           rotation=(TILT, 0, 0)), m['shell'], 'body')
    ring = kit.torus('Seam', b['radii'][0] + 0.002, 0.006, seg=(40, 6), location=b['center'], rotation=(TILT, 0, 0))
    add(kit.stretch(ring, sy=b['radii'][2] / (b['radii'][0] + 0.002)), m['joint'], 'body')
    add(birdkit.studs('SeamRivets', [(0.142 * math.cos(a), b['center'][1] + 0.001 + 0.05 * math.sin(a),
                                      b['center'][2] + 0.15 * math.sin(a) * 0.9) for a in (0.4, 0.8, 2.34, 2.74)],
                      0.0075), m['bezel'], 'body')
    add(kit.superellipsoid('Breast', (0.105, 0.095, 0.1), 0.9, 0.9, seg=(28, 16), location=(0, -0.18, 0.185)), m['shell'], 'body')
    add(birdkit.ball('Lamp', (0, -0.272, 0.2), 0.02, seg=(14, 8)), m['dot'](0), 'body')

    # The neck: one tube on three bones, a cuff over each hinge; the middle hinge is a lit collar.
    n = D['neck']
    pts = kit.spline(n['points'], 41)
    radii = [n['r'][0] + (n['r'][1] - n['r'][0]) * (i / 40) ** 0.8 for i in range(41)]
    neck, ts = kit.tube('Neck', pts, radii, ring=16)
    add(neck, m['shell'], kit.chain(ts, [f'neck.{k + 1}' for k in range(NECK_BONES)]))
    for k, i in ((1, 14), (2, 28)):
        r = radii[i] + 0.006
        c = pts[i]
        cuff = kit.torus(f'Cuff.{k}', r, 0.0075, seg=(24, 6), location=tuple(c))
        add(cuff, m['dot'](2) if k == 1 else m['joint'], f'neck.{k + 1}' if k == 1 else f'neck.{k}')
    add(birdkit.ball('Collar', (0, pts[0][1], pts[0][2]), radii[0] + 0.006, seg=(20, 10)), m['joint'], 'neck.1')

    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], 0.9, 0.9, seg=(40, 28), location=h['center']), m['shell'], 'head')
    pl = D['plate']
    add(kit.superellipsoid('FacePlate', pl['radii'], 0.5, 0.6, seg=(28, 14), location=pl['center']),
        m['role']('Bill', 'joint'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Goose', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    hx, hy, hz = h['center']
    add(birdkit.studs('CheekBolts', [(side * 0.058, hy - 0.01, hz - 0.01) for side in (1, -1)], 0.0075),
        m['bezel'], 'head')
    add(birdkit.ball('Beacon', (0, hy + 0.04, hz + 0.045), 0.0115), m['beacon'], 'head')
    bk, jw = D['bill'], D['jaw']
    add(birdkit.segment('Bill', bk['a'], bk['b'], 0.024, 0.014, e=(0.7, 0.85), over=1.1, taper=0.2),
        m['role']('Bill', 'joint'), 'head')
    add(birdkit.segment('Jaw', jw['a'], jw['b'], 0.018, 0.009, e=(0.7, 0.85), over=1.1),
        m['role']('Bill', 'joint'), 'jaw')

    # Folded wings with a lit tip each, laid as three stepped plates.
    w = D['wing']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a = (side * w['shoulder'][0], w['shoulder'][1], w['shoulder'][2])
        tip = (side * w['tip'][0], w['tip'][1], w['tip'][2])
        add(birdkit.segment(f'Wing.{sfx}', a, tip, 0.024, 0.1, e=(0.6, 0.85)), m['role']('Wing', 'shell'),
            f'wing.{sfx}')
        add(birdkit.ball(f'WingTip.{sfx}', (tip[0] + side * 0.016, tip[1] + 0.005, tip[2] - 0.006), 0.017,
                         seg=(12, 8)), m['dot'](1), f'wing.{sfx}')
        add(birdkit.ball(f'Shoulder.{sfx}', (a[0] + side * 0.01, a[1], a[2]), 0.036), m['joint'], f'wing.{sfx}')

    # A short upturned tail: three plates.
    t = D['tail']
    for i, u in enumerate((-1, 0, 1)):
        a = (u * 0.03, t['base'][1] + 0.01, t['base'][2] + 0.01)
        bpt = (u * 0.06, t['tip'][1] - 0.01 * abs(u), t['tip'][2] - 0.015 * abs(u))
        add(birdkit.blade(f'Tail.{i}', a, bpt, 0.075, 0.016, e=(0.8, 0.9)), m['role']('Tail', 'shell'), 'tail')
    add(birdkit.ball('TailPin', (0, t['base'][1] + 0.01, t['base'][2] + 0.02), 0.016), m['bezel'], 'tail')

    # Short orange legs, big webbed feet.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{sfx}', [(x, lg['top'][0], lg['top'][1]), (x, lg['bottom'][0], 0.015)], 0.021, ring=8)
        add(leg, m['role']('Foot', 'joint'), f'leg.{sfx}')
        add(birdkit.ball(f'Knee.{sfx}', (x, 0.0, 0.1), 0.028, seg=(10, 6)), m['bezel'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Web.{sfx}', (0.055, 0.06, 0.007), 0.7, 0.8, seg=(16, 8),
                               location=(x, -0.045, 0.008)), m['role']('Foot', 'joint'), f'leg.{sfx}')
        for k, ang in enumerate((-0.5, 0.0, 0.5)):
            tip = (x + math.sin(ang) * 0.09, -math.cos(ang) * 0.09, 0.009)
            add(birdkit.segment(f'Toe.{sfx}{k}', (x, 0.0, 0.01), tip, 0.011, 0.009, e=(0.7, 0.9), seg=(10, 6)),
                m['role']('Foot', 'joint'), f'leg.{sfx}')

    return looks.finish(kit.armature('GooseRig', rig_bones()), parts, skin, m)
