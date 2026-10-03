"""Mango, the crew's robot toucan: a bold, goofy toy robot, not a toucan in a robot suit. A
black barrel of a body tipped breast-up with a pale bib plate and a chest lamp (Dot2), a
big rounded head with a bright blue face plate (the eye ring, grown into a plate) holding
the screen face, and the beak: huge, in banded segments (yellow, orange, red-orange,
orange, a dark tip) that curve down, the lower half on its own jaw bone so it clacks and
opens. A glowing berry (Dot0) on its own bone sits at the tip, scaled to nothing unless
he tosses one. Folded black wings with a lit tip (Dot1), a short tail with a red
undertail plate, and short strong legs with two toes forward and two back. Faces -Y like
the rest of the crew; about 0.54 m to the top of his head, the beak reaching 0.39 m out.
"""

import math

import birdkit
import kit
import looks

FACE = 'toucan'
PREVIEW = dict(lift=0.0, width=0.45)
TILT = -0.3

UPPER = [(0, -0.15, 0.39), (0, -0.24, 0.4), (0, -0.33, 0.395), (0, -0.42, 0.375), (0, -0.49, 0.34),
         (0, -0.54, 0.295)]
UPPER_R = [(0.045, 0.06), (0.047, 0.066), (0.043, 0.06), (0.036, 0.048), (0.028, 0.035)]
UPPER_ROLE = ['Band3', 'Band1', 'Band2', 'Band1', 'Tip']
LOWER = [(0, -0.16, 0.315), (0, -0.26, 0.307), (0, -0.35, 0.292), (0, -0.43, 0.268), (0, -0.48, 0.235)]
LOWER_R = [(0.037, 0.026), (0.036, 0.028), (0.031, 0.024), (0.025, 0.018)]
LOWER_ROLE = ['Band1', 'Band2', 'Band1', 'Tip']

D = {
    'body': dict(radii=(0.115, 0.15, 0.135), center=(0, 0.03, 0.25)),
    'head': dict(radii=(0.1, 0.095, 0.088), center=(0, -0.075, 0.45), e=(0.8, 0.78)),
    'plate': dict(radii=(0.082, 0.032, 0.066), center=(0, -0.158, 0.492)),
    'screen': dict(radii=(0.064, 0.026, 0.04), center=(0, -0.176, 0.495), bezel=0.006),
    'bib': dict(radii=(0.08, 0.03, 0.075), center=(0, -0.105, 0.3)),
    'wing': dict(shoulder=(0.118, -0.02, 0.33), tip=(0.125, 0.19, 0.18)),
    'tail': dict(base=(0, 0.16, 0.2), tip=(0, 0.28, 0.12)),
    'leg': dict(x=0.06, top=(0.02, 0.17), bottom=(0.0, 0.03)),
}


def rig_bones():
    w, lg, t = D['wing'], D['leg'], D['tail']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.08, 0.15), (0, 0.0, 0.3), 'root'),
        ('head', (0, -0.03, 0.38), (0, -0.07, 0.54), 'body'),
        ('jaw', (0, -0.15, 0.33), (0, -0.4, 0.31), 'head'),
        ('berry', (0, -0.5, 0.275), (0, -0.5, 0.305), 'jaw'),
        ('tail', t['base'], t['tip'], 'body'),
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
    add(kit.superellipsoid('Body', b['radii'], 0.85, 0.95, seg=(44, 28), taper=0.15, location=b['center'],
                           rotation=(TILT, 0, 0)), m['shell'], 'body')
    ring = kit.torus('Seam', b['radii'][0] + 0.002, 0.0055, seg=(40, 6), location=b['center'], rotation=(TILT, 0, 0))
    add(kit.stretch(ring, sy=b['radii'][2] / (b['radii'][0] + 0.002)), m['joint'], 'body')
    add(birdkit.studs('SeamRivets', [(0.117 * math.cos(a), b['center'][1] + 0.001, b['center'][2] + 0.137 * math.sin(a))
                                     for a in (0.4, 0.8, 2.34, 2.74)], 0.007), m['bezel'], 'body')
    bb = D['bib']
    add(kit.superellipsoid('Bib', bb['radii'], 0.5, 0.65, seg=(28, 12), location=bb['center'], rotation=(0.15, 0, 0)),
        m['role']('Bib', 'joint'), 'body')
    add(birdkit.ball('Lamp', (0, bb['center'][1] - 0.03, bb['center'][2] - 0.012), 0.016, seg=(14, 8)), m['dot'](2), 'body')
    add(kit.stretch(kit.torus('Collar', 0.1, 0.009, seg=(32, 6), location=(0, -0.07, 0.372), rotation=(0.25, 0, 0)),
                    sy=0.92), m['joint'], 'body')

    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(40, 28), location=h['center']), m['shell'],
        'head')
    hx, hy, hz = h['center']
    pl = D['plate']
    add(kit.superellipsoid('FacePlate', pl['radii'], 0.5, 0.6, seg=(32, 16), location=pl['center']),
        m['role']('Ring', 'bezel'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Toucan', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(birdkit.studs('CheekBolts', [(side * 0.103, hy + 0.0, hz - 0.012) for side in (1, -1)], 0.0075), m['bezel'],
        'head')
    add(birdkit.ball('Beacon', (0, hy + 0.01, hz + 0.09), 0.0125), m['beacon'], 'head')

    # The beak: banded segments curving down. The upper on the head, the lower on the jaw.
    for i in range(5):
        r = UPPER_R[i] if i < 4 else UPPER_R[3]
        a, c = UPPER[i], UPPER[i + 1]
        add(birdkit.segment(f'Beak.{i}', a, c, r[0], r[1], e=(0.4, 0.85), seg=(24, 12), over=1.1 if i < 4 else 1.16,
                            taper=0.0), m['role'](UPPER_ROLE[i], 'joint'), 'head')
    for i in range(4):
        r = LOWER_R[i]
        a, c = LOWER[i], LOWER[i + 1]
        add(birdkit.segment(f'Jaw.{i}', a, c, r[0], r[1], e=(0.4, 0.85), seg=(20, 10), over=1.1),
            m['role'](LOWER_ROLE[i], 'joint'), 'jaw')
    # A bright ridge along the top of the beak, and hinge pins at the corners.
    add(birdkit.segment('Ridge', (0, -0.2, 0.463), (0, -0.45, 0.405), 0.011, 0.008, e=(0.7, 0.9), seg=(12, 8)),
        m['role']('Band3', 'joint'), 'head')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(birdkit.ball(f'HingePin.{sfx}', (side * 0.044, -0.158, 0.335), 0.01, seg=(10, 6)), m['bezel'], 'head')
        add(birdkit.ball(f'Nostril.{sfx}', (side * 0.04, -0.215, 0.44), 0.0075, seg=(10, 6)), m['bezel'], 'head')
    add(birdkit.ball('Berry', (0, -0.5, 0.275), 0.03, seg=(16, 10)), m['dot'](0), 'berry')

    # Folded black wings with a lit tip.
    w = D['wing']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a = (side * w['shoulder'][0], w['shoulder'][1], w['shoulder'][2])
        tip = (side * w['tip'][0], w['tip'][1], w['tip'][2])
        add(birdkit.segment(f'Wing.{sfx}', a, tip, 0.02, 0.075, e=(0.6, 0.85), over=1.0), m['shell'], f'wing.{sfx}')
        add(birdkit.ball(f'WingTip.{sfx}', (tip[0] + side * 0.012, tip[1] + 0.005, tip[2] - 0.004), 0.016, seg=(12, 8)),
            m['dot'](1), f'wing.{sfx}')
        add(birdkit.ball(f'Shoulder.{sfx}', (a[0] + side * 0.01, a[1], a[2]), 0.032), m['joint'], f'wing.{sfx}')

    t = D['tail']
    for i, dx in enumerate((0.0, 0.035, -0.035)):
        tip = (dx * 1.6, t['tip'][1], t['tip'][2])
        add(birdkit.segment(f'Tail.{i}', (dx * 0.4, t['base'][1], t['base'][2]), tip, 0.034, 0.008, e=(0.6, 0.9)),
            m['shell'], 'tail')
    add(kit.superellipsoid('Undertail', (0.045, 0.04, 0.026), 0.6, 0.7, seg=(18, 10),
                           location=(0, t['base'][1] + 0.02, t['base'][2] - 0.045), rotation=(-0.6, 0, 0)),
        m['role']('Under', 'joint'), 'tail')
    add(birdkit.ball('TailPin', (0, t['base'][1] + 0.006, t['base'][2] + 0.01), 0.011), m['bezel'], 'tail')

    # Legs and zygodactyl feet: two toes forward, two back.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{sfx}', [(x, lg['top'][0], lg['top'][1]), (x, lg['bottom'][0], 0.03)], 0.02, ring=10)
        add(leg, m['role']('Foot', 'joint'), f'leg.{sfx}')
        add(kit.torus(f'Ankle.{sfx}', 0.024, 0.006, seg=(14, 6), location=(x, lg['bottom'][0], 0.06)), m['bezel'],
            f'leg.{sfx}')
        for k, ang in enumerate((-0.3, 0.3)):
            tip = (x + math.sin(ang) * 0.075, -math.cos(ang) * 0.075, 0.009)
            add(birdkit.segment(f'ToeF.{sfx}{k}', (x, 0.0, 0.012), tip, 0.011, 0.011, e=(0.7, 0.9), seg=(10, 6)),
                m['role']('Foot', 'joint'), f'leg.{sfx}')
        for k, ang in enumerate((-0.3, 0.3)):
            tip = (x + math.sin(ang) * 0.05, math.cos(ang) * 0.055, 0.009)
            add(birdkit.segment(f'ToeB.{sfx}{k}', (x, 0.0, 0.012), tip, 0.0105, 0.0105, e=(0.7, 0.9), seg=(10, 6)),
                m['role']('Foot', 'joint'), f'leg.{sfx}')

    return looks.finish(kit.armature('ToucanRig', rig_bones()), parts, skin, m)
