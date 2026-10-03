"""Cheep, the crew's robot robin: a small, round, wide-awake toy robot, not a robin in a robot
suit. A plump ball of a body tipped breast-up, with a big red breast plate carrying five
lit domes (Dot0-4: the red breast, the colour in its lights) over a pale belly plate, a big
round head with a red face plate round the screen, a small bill in two halves (the lower
on its own jaw bone, so it opens to sing), a cocked tail of two plates, folded brown wings
on ball shoulders, a crown beacon, and two thin legs with grip feet. Three tiny lit notes
(Dot5-7), each on its own bone and scaled to nothing until he sings, float in front of
the bill. Faces -Y like the rest of the crew; about 0.46 m to the top of his head.
"""

import math

import birdkit
import kit
import looks

FACE = 'robin'
PREVIEW = dict(lift=0.0, width=0.3)
TILT = -0.35

NOTES = [(0.0, -0.27, 0.42), (0.05, -0.28, 0.47), (-0.045, -0.26, 0.51)]

D = {
    'body': dict(radii=(0.125, 0.13, 0.12), center=(0, 0.02, 0.2)),
    'breast': dict(radii=(0.09, 0.04, 0.095), center=(0, -0.088, 0.245)),
    'belly': dict(radii=(0.07, 0.036, 0.05), center=(0, -0.09, 0.135)),
    'head': dict(radii=(0.105, 0.098, 0.092), center=(0, -0.07, 0.375), e=(0.9, 0.9)),
    'plate': dict(radii=(0.078, 0.03, 0.064), center=(0, -0.158, 0.382)),
    'screen': dict(radii=(0.058, 0.022, 0.0435), center=(0, -0.175, 0.386), bezel=0.006),
    'bill': dict(a=(0, -0.175, 0.355), b=(0, -0.235, 0.346)),
    'jaw': dict(pivot=(0, -0.165, 0.337), a=(0, -0.175, 0.336), b=(0, -0.22, 0.328)),
    'wing': dict(shoulder=(0.12, -0.01, 0.27), tip=(0.125, 0.17, 0.14)),
    'tail': dict(base=(0, 0.14, 0.2), tip=(0, 0.28, 0.27)),
    'leg': dict(x=0.05, top=(0.02, 0.1), bottom=(0.0, 0.0)),
}


def rig_bones():
    w, lg, t, j = D['wing'], D['leg'], D['tail'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.06, 0.12), (0, 0.0, 0.28), 'root'),
        ('head', (0, -0.04, 0.3), (0, -0.06, 0.47), 'body'),
        ('jaw', j['pivot'], (0, -0.23, j['pivot'][2]), 'head'),
        ('tail', t['base'], t['tip'], 'body'),
    ]
    for i, (x, y, z) in enumerate(NOTES, 1):
        bones.append((f'note.{i}', (x, y, z), (x, y, z + 0.02), 'root'))
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
    ring = kit.torus('Seam', b['radii'][0] + 0.002, 0.005, seg=(40, 6), location=b['center'], rotation=(TILT, 0, 0))
    add(kit.stretch(ring, sy=b['radii'][2] / (b['radii'][0] + 0.002)), m['joint'], 'body')
    add(birdkit.studs('SeamRivets', [(0.127 * math.cos(a), b['center'][1] + 0.001, b['center'][2] + 0.122 * math.sin(a))
                                     for a in (0.4, 0.8, 2.34, 2.74)], 0.0065), m['bezel'], 'body')

    # The red breast: a plate with five lit domes, over a pale belly plate.
    br = D['breast']
    add(kit.superellipsoid('Breast', br['radii'], 0.55, 0.65, seg=(32, 16), location=br['center'],
                           rotation=(0.2, 0, 0)), m['role']('Breast', 'joint'), 'body')
    bx, by, bz = br['center']
    for i, (x, z) in enumerate(((-0.04, 0.05), (0.0, 0.058), (0.04, 0.05), (-0.022, 0.0), (0.022, 0.0))):
        add(kit.superellipsoid(f'Gem.{i}', (0.0115, 0.007, 0.0115), 0.6, 0.6, seg=(12, 8),
                               location=(x, by - 0.037 + 0.006 * (z < 0.03), bz + z - 0.012)), m['dot'](i), 'body')
    bl = D['belly']
    add(kit.superellipsoid('Belly', bl['radii'], 0.5, 0.6, seg=(24, 12), location=bl['center'],
                           rotation=(0.1, 0, 0)), m['role']('Belly', 'joint'), 'body')

    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(40, 28), location=h['center']), m['shell'],
        'head')
    hx, hy, hz = h['center']
    pl = D['plate']
    add(kit.superellipsoid('FacePlate', pl['radii'], 0.5, 0.6, seg=(28, 14), location=pl['center']),
        m['role']('Breast', 'shell'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Robin', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(birdkit.studs('CheekBolts', [(side * 0.108, hy + 0.0, hz - 0.012) for side in (1, -1)], 0.007), m['bezel'],
        'head')
    add(birdkit.ball('Beacon', (0, hy + 0.01, hz + 0.093), 0.0115), m['beacon'], 'head')
    add(kit.stretch(kit.torus('Collar', 0.098, 0.008, seg=(32, 6), location=(0, -0.045, 0.31), rotation=(0.3, 0, 0)),
                    sy=0.93), m['joint'], 'head')

    bk, jw = D['bill'], D['jaw']
    add(birdkit.segment('Bill', bk['a'], bk['b'], 0.0185, 0.0135, e=(0.7, 0.85), over=1.1, taper=0.2),
        m['role']('Bill', 'joint'), 'head')
    add(birdkit.segment('Jaw', jw['a'], jw['b'], 0.0135, 0.008, e=(0.7, 0.85), over=1.1),
        m['role']('Bill', 'joint'), 'jaw')
    for side in (1, -1):
        add(birdkit.ball(f'HingePin.{side}', (side * 0.02, jw['pivot'][1] + 0.004, jw['pivot'][2]), 0.0065, seg=(8, 6)),
            m['bezel'], 'head')

    # Folded brown wings on ball shoulders.
    w = D['wing']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a = (side * w['shoulder'][0], w['shoulder'][1], w['shoulder'][2])
        tip = (side * w['tip'][0], w['tip'][1], w['tip'][2])
        add(birdkit.segment(f'Wing.{sfx}', a, tip, 0.018, 0.07, e=(0.6, 0.85)), m['role']('Wing', 'shell'),
            f'wing.{sfx}')
        add(birdkit.segment(f'Flight.{sfx}', (a[0] + side * 0.004, a[1] + 0.09, a[2] - 0.06),
                            (tip[0] + side * 0.005, tip[1] + 0.03, tip[2] - 0.03), 0.012, 0.04, e=(0.6, 0.85)),
            m['joint'], f'wing.{sfx}')
        add(birdkit.ball(f'Shoulder.{sfx}', (a[0] + side * 0.008, a[1], a[2]), 0.028), m['joint'], f'wing.{sfx}')

    # The cocked tail: two plates on a pin.
    t = D['tail']
    for i, dx in enumerate((0.0, 0.0)):
        tip = (0.012 * (i * 2 - 1), t['tip'][1] - 0.01 * i, t['tip'][2] - 0.01 * i)
        add(birdkit.blade(f'Tail.{i}', (0, t['base'][1], t['base'][2] + 0.006 * i), tip, 0.045 - 0.008 * i, 0.009,
                          e=(0.6, 0.9)), m['shell'] if i == 0 else m['role']('Wing', 'shell'), 'tail')
    add(birdkit.ball('TailPin', (0, t['base'][1] + 0.004, t['base'][2] + 0.004), 0.011), m['bezel'], 'tail')

    # Thin legs with grip feet: three toes forward, one back.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{sfx}', [(x, lg['top'][0], lg['top'][1]), (x, lg['bottom'][0], 0.012)], 0.0105, ring=8)
        add(leg, m['role']('Foot', 'joint'), f'leg.{sfx}')
        add(birdkit.ball(f'Knee.{sfx}', (x, 0.012, 0.05), 0.0165, seg=(10, 6)), m['bezel'], f'leg.{sfx}')
        for k, ang in enumerate((-0.45, 0.0, 0.45, math.pi)):
            ln = 0.04 if k < 3 else 0.028
            tip = (x + math.sin(ang) * ln, -math.cos(ang) * ln, 0.007)
            add(birdkit.segment(f'Toe.{sfx}{k}', (x, 0.0, 0.008), tip, 0.0068, 0.0068, e=(0.7, 0.9), seg=(10, 6)),
                m['role']('Foot', 'joint'), f'leg.{sfx}')

    # The song's notes: tiny lit balls in front of the bill.
    for i, pos in enumerate(NOTES, 1):
        add(birdkit.ball(f'Note.{i}', pos, 0.0125, seg=(10, 6)), m['dot'](4 + i), f'note.{i}')

    return looks.finish(kit.armature('RobinRig', rig_bones()), parts, skin, m)
