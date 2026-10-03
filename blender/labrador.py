"""Maple, the crew's robot Labrador, a senior: broad, solid and a little saggy. A barrel of a
body with a belly that has sunk, thick legs on big paws (a brace on one hind knee), a thick
short neck, a blocky head carried low with a wide muzzle and a lighter grey panel over it,
soft hanging ears and a thick round otter tail that tapers to a rounded tip.

Her heart (Dot0) is a lamp on her chest that beats slowly and her tail tip glints (Dot1);
the tag on her collar takes the beacon's colour. She has a ball of her own, a tennis ball
on a bone that isn't parented to the body, stretched to nothing by the site until she
wants it. Faces -Y; about 0.65 m to the top of her head.
"""

import math

import dogkit as dk
import kit
import looks

FACE = 'labrador'
PREVIEW = dict(lift=0.0, width=0.7)
BOXY = 0.42

D = {
    'chest': dict(radii=(0.127, 0.16, 0.14), center=(0, -0.06, 0.37), e=0.58),
    'rump': dict(radii=(0.116, 0.15, 0.126), center=(0, 0.15, 0.36), e=0.58),
    'belly': dict(radii=(0.108, 0.21, 0.07), center=(0, 0.04, 0.275), e=0.6),
    'neck': dict(points=[(0, -0.17, 0.44), (0, -0.22, 0.51)], r=0.078),
    'head': dict(radii=(0.102, 0.1, 0.092), center=(0, -0.28, 0.545)),
    # 2:1, like the Labrador's face layout (512 x 256)
    'screen': dict(radii=(0.078, 0.03, 0.039), center=(0, -0.368, 0.56), bezel=0.008),
    'muzzle': dict(radii=(0.06, 0.078, 0.048), center=(0, -0.365, 0.495), e=0.4),
    'nose': dict(radii=(0.03, 0.014, 0.022), center=(0, -0.446, 0.5)),
    'jaw': dict(radii=(0.05, 0.072, 0.017), center=(0, -0.355, 0.45), e=0.5, pivot=(0, -0.285, 0.468)),
    'ear': dict(radii=(0.03, 0.05, 0.078), x=0.108, y=-0.265, top=0.6, e=0.55, tilt=0.14),
    'leg': dict(x=0.082, front=-0.17, back=0.22, top=0.3, r=0.037),
    'paw': dict(radii=(0.052, 0.064, 0.03)),
    'tail': [(0, 0.26, 0.4), (0, 0.35, 0.37), (0, 0.43, 0.32), (0, 0.48, 0.25)],
    'tail_r': (0.058, 0.024),
    'collar': dict(center=(0, -0.2, 0.47), major=0.1, minor=0.015, tilt=0.5),
    'props': dict(ball=(0.3, -0.1)),
    'ball': dict(r=0.04),
}
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def rig_bones():
    e, lg, j = D['ear'], D['leg'], D['jaw']
    z = 0.37
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, lg['back'], z), (0, -0.2, z + 0.02), 'root'),
        ('head', (0, -0.17, 0.44), (0, -0.28, 0.64), 'body'),
        ('jaw', j['pivot'], (0, -0.44, j['pivot'][2]), 'head'),
        ('ear.L', (e['x'] - 0.02, e['y'], e['top']), (e['x'] + 0.01, e['y'], e['top'] - 0.15), 'head'),
        ('ear.R', (-e['x'] + 0.02, e['y'], e['top']), (-e['x'] - 0.01, e['y'], e['top'] - 0.15), 'head'),
    ]
    tb, _ = dk.tail_bones(D['tail'], 3)
    bones += tb
    bx, by = D['props']['ball']
    bones.append(('ball', (bx, by, D['ball']['r']), (bx, by, D['ball']['r'] + 0.06), None))
    for name, x, end in LEGS:
        bones.append((f'leg.{name}', (x * lg['x'], lg[end], lg['top']), (x * lg['x'], lg[end], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []
    grey = m['role']('Grey', 'joint')

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    ch, ru, bl = D['chest'], D['rump'], D['belly']
    add(kit.superellipsoid('Chest', ch['radii'], ch['e'], ch['e'], seg=(32, 22), location=ch['center']), m['shell'], 'body')
    add(kit.superellipsoid('Rump', ru['radii'], ru['e'], ru['e'], seg=(32, 22), location=ru['center']), m['shell'], 'body')
    add(kit.superellipsoid('Belly', bl['radii'], bl['e'], bl['e'], seg=(32, 18), location=bl['center']), m['shell'], 'body')
    dk.seam(add, m, 'Chest', ch['center'], ch['radii'], ch['e'], 0.08, 'body', dz=0.05)
    dk.seam(add, m, 'Rump', ru['center'], ru['radii'], ru['e'], -0.06, 'body', dz=0.05)
    dk.seam(add, m, 'Rear', ru['center'], ru['radii'], ru['e'], 0.07, 'body', dz=0.05)
    # A sagging spine: plates that dip in the middle.
    for k, (y, z, rx) in enumerate(((-0.14, 0.505, 0.045), (-0.04, 0.495, 0.042), (0.06, 0.482, 0.04),
                                    (0.16, 0.482, 0.04), (0.25, 0.47, 0.034))):
        add(kit.superellipsoid(f'Spine.{k}', (rx, 0.045, 0.01), 0.5, 0.5, seg=(18, 8), location=(0, y, z)), m['joint'], 'body')
    for side in (1, -1):
        dk.vents(add, m, f'Side.{side}', side * (ch['radii'][0] - 0.004), -0.08, 0.37, 'body', n=4, length=0.035, gap=0.016)
        add(kit.superellipsoid(f'Hatch.{side}', (0.005, 0.034, 0.028), 0.3, 0.3, seg=(16, 8),
                               location=(side * (ru['radii'][0] - 0.0), 0.14, 0.36)), m['joint'], 'body')
        add(dk.ball(f'HatchKnob.{side}', (side * (ru['radii'][0] + 0.005), 0.155, 0.36), 0.0065), m['bezel'], 'body')
    # Her heart: a framed round lamp on the chest.
    add(kit.superellipsoid('HeartFrame', (0.04, 0.012, 0.04), 0.9, 0.9, seg=(22, 8),
                           location=(0, ch['center'][1] - ch['radii'][1] + 0.003, 0.37)), m['bezel'], 'body')
    add(kit.superellipsoid('Heart', (0.03, 0.012, 0.03), 0.9, 0.9, seg=(22, 8),
                           location=(0, ch['center'][1] - ch['radii'][1] - 0.002, 0.37)), m['dot'](0), 'body')

    n = D['neck']
    neck, _ = kit.tube('Neck', kit.spline(n['points'], 6), n['r'], ring=14)
    add(neck, m['shell'], 'head')
    c = D['collar']
    dk.collar(add, m, c['center'], c['major'], c['minor'], c['tilt'], 0.036)

    # The blocky head: screen, a wide muzzle with its grey panel, a nose and a jaw.
    dk.head(add, m, 'Labrador', D['head'], D['screen'], BOXY)
    h = D['head']
    mz, no, jw = D['muzzle'], D['nose'], D['jaw']
    add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(28, 18), location=mz['center']), m['shell'], 'head')
    add(kit.superellipsoid('MuzzlePanel', (mz['radii'][0] * 0.82, mz['radii'][1] * 0.9, 0.009), 0.5, 0.5, seg=(22, 8),
                           location=(0, mz['center'][1] - 0.003, mz['center'][2] + mz['radii'][2] - 0.003)), grey, 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'MuzzleSide.{side}', (0.008, mz['radii'][1] * 0.8, mz['radii'][2] * 0.7), 0.5, 0.5,
                               seg=(18, 8), location=(side * (mz['radii'][0] - 0.002), mz['center'][1] - 0.005, mz['center'][2] - 0.004)),
            grey, 'head')
        # Grey brows over the eyes.
        add(kit.superellipsoid(f'Brow.{side}', (0.026, 0.01, 0.007), 0.5, 0.5, seg=(14, 6),
                               location=(side * 0.04, D['screen']['center'][1] - D['screen']['radii'][1] + 0.005,
                                         D['screen']['center'][2] + D['screen']['radii'][2] + 0.006)), grey, 'head')
    add(kit.superellipsoid('Nose', no['radii'], 0.6, 0.8, seg=(16, 10), location=no['center']), m['bezel'], 'head')
    dk.nose_bits(add, m, no['center'], no['radii'])
    add(kit.superellipsoid('Jaw', jw['radii'], jw['e'], jw['e'], seg=(22, 12), location=jw['center']), grey, 'jaw')
    dk.jaw_pins(add, m, 0.052, jw['pivot'], r=0.009)
    dk.cheek_bolts(add, m, h['radii'][0] + 0.001, -0.29, 0.585, r=0.009)

    # Soft hanging ears with a hinge puck each.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], e['e'], e['e'], seg=(22, 16),
                               location=(side * e['x'], e['y'], e['top'] - e['radii'][2]),
                               rotation=(0, side * e['tilt'], 0)), m['role']('Ear', 'joint'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarPanel.{sfx}', (0.006, 0.032, 0.05), 0.5, 0.5, seg=(14, 10),
                               location=(side * (e['x'] + 0.026), e['y'], e['top'] - e['radii'][2] - 0.004),
                               rotation=(0, side * e['tilt'], 0)), m['role']('EarPanel', 'shell'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.013, 0.02, 0.02), 0.8, 0.5, seg=(14, 8),
                               location=(side * (e['x'] - 0.02), e['y'], e['top'] + 0.003)), m['bezel'], 'head')
        add(dk.ball(f'EarPin.{sfx}', (side * (e['x'] - 0.007), e['y'], e['top'] + 0.003), 0.007), m['joint'], f'ear.{sfx}')

    # Thick legs on big paws; a brace on the back left knee.
    lg, pw = D['leg'], D['paw']['radii']
    for name, x, end in LEGS:
        dk.leg(add, m, name, x * lg['x'], lg[end], lg['top'], lg['r'], pw, f'leg.{name}', rings=(0.3, 0.7))
        dk.paw(add, m, name, x * lg['x'], lg[end], pw, f'leg.{name}', back=0.012)
    bx, by = lg['x'], lg['back']
    for k, z in enumerate((0.2, 0.15)):
        add(dk.ring(f'Brace.{k}', (bx, by, z), lg['r'] + 0.006, 0.008, seg=(20, 8)), m['role']('Brace', 'bezel'), 'leg.BL')
    add(kit.superellipsoid('BraceStrap', (0.014, 0.008, 0.045), 0.5, 0.5, seg=(12, 8),
                           location=(bx, by - lg['r'] - 0.008, 0.175)), m['bezel'], 'leg.BL')

    # The otter tail: thick at the root, tapering to a round tip that glints.
    pts = dk.tail(add, m, D['tail'], D['tail_r'], 3)
    add(kit.superellipsoid('TailTip', (0.03, 0.03, 0.03), seg=(14, 8), location=pts[-1]), m['dot'](1), 'tail.3')

    # Her tennis ball: a sphere with the seam round it.
    bd, (bx, by) = D['ball'], D['props']['ball']
    add(kit.superellipsoid('Ball', (bd['r'],) * 3, seg=(24, 14), location=(bx, by, bd['r'])), m['role']('Ball', 'shell'), 'ball')
    add(dk.ring('BallSeam', (bx, by, bd['r']), bd['r'] * 0.99, 0.003, rot=(math.pi / 2, 0.4, 0), seg=(32, 6)),
        m['bezel'], 'ball')

    return looks.finish(kit.armature('LabradorRig', rig_bones()), parts, skin, m)
