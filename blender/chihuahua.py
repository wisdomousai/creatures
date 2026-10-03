"""Taco, the crew's robot chihuahua: tiny, a head nearly as big as the rest of him. A round
apple head with a huge screen for big eyes, a tiny muzzle and jaw, enormous ears held out
and up like satellite dishes, a small round body in a sweater band, spindly legs with
dainty paws, and a thin tail curled over his back.

His heart lamp is on his chest (Dot0, it flickers when he trembles) and the hinges of his
ears glow (Dot1); the oversized tag on his collar takes the beacon's colour. He has a
cushion of his own (a small tasselled pillow on a bone that isn't parented to the body,
stretched to nothing by the site until he wants it). Faces -Y; about 0.45 m to the ear tips.
"""

import math

import dogkit as dk
import kit
import looks

FACE = 'chihuahua'
PREVIEW = dict(lift=0.0, width=0.45)
BOXY = 0.8

D = {
    'body': dict(radii=(0.058, 0.09, 0.058), center=(0, 0.01, 0.15), e=0.6),
    'chest': dict(radii=(0.062, 0.065, 0.062), center=(0, -0.045, 0.155), e=0.6),
    'rump': dict(radii=(0.056, 0.07, 0.055), center=(0, 0.07, 0.15), e=0.6),
    'neck': dict(points=[(0, -0.06, 0.19), (0, -0.09, 0.24)], r=0.035),
    'head': dict(radii=(0.092, 0.085, 0.085), center=(0, -0.1, 0.285)),
    # 2:1, like the chihuahua's face layout (512 x 256)
    'screen': dict(radii=(0.08, 0.03, 0.04), center=(0, -0.172, 0.297), bezel=0.007),
    'muzzle': dict(radii=(0.028, 0.03, 0.022), center=(0, -0.195, 0.236), e=0.6),
    'nose': dict(radii=(0.016, 0.01, 0.012), center=(0, -0.227, 0.242)),
    'jaw': dict(radii=(0.022, 0.026, 0.009), center=(0, -0.19, 0.205), e=0.5, pivot=(0, -0.15, 0.218)),
    'ear': dict(radii=(0.013, 0.055, 0.082), x=0.082, y=-0.095, base=0.335, tilt=0.7, taper=0.9),
    'leg': dict(x=0.04, front=-0.075, back=0.1, top=0.13, r=0.0125),
    'paw': dict(radii=(0.025, 0.034, 0.016)),
    'tail': [(0, 0.125, 0.17), (0, 0.162, 0.2), (0, 0.168, 0.245), (0, 0.135, 0.272)],
    'tail_r': (0.015, 0.009),
    'collar': dict(center=(0, -0.075, 0.215), major=0.045, minor=0.009, tilt=0.5),
    # The cushion lies where the site sets it (the bone's rest place).
    'props': dict(cushion=(0.3, -0.1)),
    'cushion': dict(radii=(0.105, 0.085, 0.032)),
}
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def rig_bones():
    e, lg, j = D['ear'], D['leg'], D['jaw']
    z = 0.15
    s, c = math.sin(e['tilt']), math.cos(e['tilt'])
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, lg['back'], z), (0, -0.07, z + 0.01), 'root'),
        ('head', (0, -0.06, 0.19), (0, -0.1, 0.37), 'body'),
        ('jaw', j['pivot'], (0, -0.23, j['pivot'][2]), 'head'),
        ('ear.L', (e['x'], e['y'], e['base']), (e['x'] + 0.11 * s, e['y'], e['base'] + 0.11 * c), 'head'),
        ('ear.R', (-e['x'], e['y'], e['base']), (-e['x'] - 0.11 * s, e['y'], e['base'] + 0.11 * c), 'head'),
    ]
    tb, _ = dk.tail_bones(D['tail'], 2)
    bones += tb
    bx, by = D['props']['cushion']
    bones.append(('cushion', (bx, by, 0.03), (bx, by, 0.09), None))
    for name, x, end in LEGS:
        bones.append((f'leg.{name}', (x * lg['x'], lg[end], lg['top']), (x * lg['x'], lg[end], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    for key, name in (('body', 'Body'), ('chest', 'Chest'), ('rump', 'Rump')):
        s = D[key]
        add(kit.superellipsoid(name, s['radii'], s['e'], s['e'], seg=(28, 20), location=s['center']), m['shell'], 'body')
    bd = D['body']
    # A sweater: a wide band round the middle with a ribbed hem and a neck roll.
    trim = m['role']('Trim', 'joint')
    sk = dk.cut_scale(0.01, bd['radii'][1], bd['e'])
    add(kit.superellipsoid('Sweater', (bd['radii'][0] + 0.005, 0.05, bd['radii'][2] + 0.005), bd['e'], bd['e'],
                           seg=(28, 10), location=(0, 0.02, 0.15)), m['role']('Sweater', 'joint'), 'body')
    for k, dy in enumerate((-0.04, 0.0, 0.04)):
        add(kit.superellipsoid(f'Rib.{k}', (bd['radii'][0] + 0.007, 0.0045, bd['radii'][2] + 0.007), bd['e'], bd['e'],
                               seg=(28, 6), location=(0, 0.02 + dy, 0.15)), trim, 'body')
    dk.seam(add, m, 'Rear', D['rump']['center'], D['rump']['radii'], D['rump']['e'], 0.04, 'body', dz=0.025)
    for side in (1, -1):
        add(dk.ball(f'Hip.{side}', (side * (D['rump']['radii'][0] - 0.004), 0.1, 0.155), 0.007, seg=(8, 5)),
            m['bezel'], 'body')

    # His heart: a small round lamp on the chest.
    ch = D['chest']
    add(kit.superellipsoid('HeartRim', (0.022, 0.008, 0.022), 0.9, 0.9, seg=(18, 8),
                           location=(0, ch['center'][1] - ch['radii'][1] + 0.002, 0.15)), m['bezel'], 'body')
    add(kit.superellipsoid('Heart', (0.016, 0.008, 0.016), 0.9, 0.9, seg=(18, 8),
                           location=(0, ch['center'][1] - ch['radii'][1] - 0.002, 0.15)), m['dot'](0), 'body')

    n = D['neck']
    neck, _ = kit.tube('Neck', kit.spline(n['points'], 6), n['r'], ring=12)
    add(neck, m['shell'], 'head')
    c = D['collar']
    dk.collar(add, m, c['center'], c['major'], c['minor'], c['tilt'], 0.03)

    # The apple head with its huge screen; a dome on the crown; a tiny muzzle, nose and jaw.
    dk.head(add, m, 'Chihuahua', D['head'], D['screen'], BOXY)
    h = D['head']
    add(kit.superellipsoid('Dome', (0.05, 0.045, 0.02), 0.8, 0.8, seg=(20, 10),
                           location=(0, h['center'][1] + 0.005, h['center'][2] + h['radii'][2] - 0.004)),
        m['role']('Ear', 'joint'), 'head')
    mz, no, jw = D['muzzle'], D['nose'], D['jaw']
    add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(22, 14), location=mz['center']), m['shell'], 'head')
    add(kit.superellipsoid('Nose', no['radii'], 0.6, 0.8, seg=(14, 8), location=no['center']), m['bezel'], 'head')
    dk.nose_bits(add, m, no['center'], no['radii'])
    add(kit.superellipsoid('Jaw', jw['radii'], jw['e'], jw['e'], seg=(18, 10), location=jw['center']), m['shell'], 'jaw')
    dk.jaw_pins(add, m, 0.024, jw['pivot'], r=0.006)
    dk.cheek_bolts(add, m, h['radii'][0] + 0.001, -0.1, 0.27, r=0.007)

    # The ears: giant, held out and up, with a pink inside and a glowing hinge.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        s, cs = math.sin(e['tilt']), math.cos(e['tilt'])
        cx = side * (e['x'] + e['radii'][2] * s * 0.9)
        cz = e['base'] + e['radii'][2] * cs * 0.9
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], 0.7, 0.7, seg=(22, 16), taper=e['taper'],
                               location=(cx, e['y'], cz), rotation=(0, side * e['tilt'], 0)),
            m['role']('Ear', 'joint'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarPlate.{sfx}', (0.005, 0.04, 0.06), 0.6, 0.6, seg=(14, 10), taper=0.8,
                               location=(cx - side * 0.004 * cs, e['y'] - 0.016, cz + 0.002),
                               rotation=(0, side * e['tilt'], 0)), m['role']('EarPlate', 'bezel'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.012, 0.016, 0.016), 0.8, 0.8, seg=(14, 8),
                               location=(side * (e['x'] - 0.002), e['y'], e['base'] + 0.002)), m['dot'](1), 'head')

    lg, pw = D['leg'], D['paw']['radii']
    for name, x, end in LEGS:
        lx, y = x * lg['x'], lg[end]
        tube, _ = kit.tube(f'Leg.{name}', [(lx, y, lg['top']), (lx, y, pw[2])], lg['r'], ring=10)
        add(tube, m['shell'], f'leg.{name}')
        add(dk.ring(f'Cuff.{name}', (lx, y, 0.06), lg['r'] + 0.002, 0.0045, seg=(16, 6)), m['joint'], f'leg.{name}')
        add(dk.ball(f'Knee.{name}', (lx, y, 0.085), lg['r'] + 0.003, seg=(10, 6)), m['joint'], f'leg.{name}')
        dk.paw(add, m, name, lx, y, pw, f'leg.{name}', back=0.008)

    # A thin tail curled over his back.
    pts = dk.tail(add, m, D['tail'], D['tail_r'], 2, rings=False)
    add(dk.ball('TailTip', pts[-1], 0.011, seg=(10, 6)), m['bezel'], 'tail.2')
    add(dk.ring('TailRing', pts[len(pts) // 3], 0.016, 0.004, rot=(-0.7, 0, 0), seg=(14, 6)), m['joint'], 'tail.1')

    # His cushion: a puffy pillow with a button and a tassel at each corner.
    cu, (bx, by) = D['cushion'], D['props']['cushion']
    cush = m['role']('Cushion', 'shell')
    add(kit.superellipsoid('Cushion', cu['radii'], 0.5, 0.7, seg=(28, 14), location=(bx, by, cu['radii'][2])), cush, 'cushion')
    add(kit.superellipsoid('CushionSeam', (cu['radii'][0] + 0.002, cu['radii'][1] + 0.002, 0.004), 0.5, 0.7,
                           seg=(28, 6), location=(bx, by, cu['radii'][2])), m['role']('Trim', 'joint'), 'cushion')
    add(dk.ball('CushionButton', (bx, by, cu['radii'][2] * 2 - 0.004), 0.011, seg=(10, 6)), m['role']('Trim', 'joint'),
        'cushion')
    for sx in (1, -1):
        for sy in (1, -1):
            add(dk.ball(f'Tassel.{sx}.{sy}', (bx + sx * (cu['radii'][0] - 0.003), by + sy * (cu['radii'][1] - 0.003),
                                              cu['radii'][2]), 0.014, seg=(10, 6)), m['role']('Trim', 'joint'), 'cushion')

    return looks.finish(kit.armature('ChihuahuaRig', rig_bones()), parts, skin, m)
