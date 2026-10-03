"""Duke, the crew's robot Great Dane: a gentle giant, tall and slender. Very long legs with
ball-joint knees, a deep chest tucked up to a narrow waist and a slim rear, a long arched
neck, a long square muzzle with a big nose and a jaw that opens, loose jowls, upright
pointed ears and a long thin tail in three bones.

His heart is a lit plate on the chest (Dot0) and the tip of his tail glints (Dot1); the
tag on his collar takes the beacon's colour. A few plates on his flanks are his
harlequin patches. Faces -Y like the rest of the crew; about 1.2 m to the ear tips.
"""

import math

import dogkit as dk
import kit
import looks

FACE = 'greatdane'
PREVIEW = dict(lift=0.0, width=0.7)
BOXY = 0.45

D = {
    'rear': dict(radii=(0.105, 0.15, 0.105), center=(0, 0.15, 0.64), e=0.5),
    'waist': dict(radii=(0.092, 0.1, 0.092), center=(0, 0.0, 0.665), e=0.5),
    'chest': dict(radii=(0.13, 0.17, 0.165), center=(0, -0.12, 0.62), e=0.55),
    'neck': dict(points=[(0, -0.2, 0.72), (0, -0.25, 0.82), (0, -0.28, 0.9)], r=(0.09, 0.075, 0.065)),
    'head': dict(radii=(0.1, 0.12, 0.1), center=(0, -0.31, 0.97)),
    # 2:1, like the Great Dane's face layout (512 x 256)
    'screen': dict(radii=(0.074, 0.03, 0.037), center=(0, -0.425, 1.0), bezel=0.008),
    'muzzle': dict(radii=(0.062, 0.115, 0.055), center=(0, -0.44, 0.925), e=0.32),
    'nose': dict(radii=(0.038, 0.018, 0.028), center=(0, -0.562, 0.935)),
    'jaw': dict(radii=(0.05, 0.1, 0.02), center=(0, -0.44, 0.872), e=0.5, pivot=(0, -0.35, 0.89)),
    'jowl': dict(radii=(0.014, 0.055, 0.036), x=0.066, y=-0.46, z=0.9),
    'ear': dict(radii=(0.02, 0.042, 0.07), x=0.072, y=-0.285, base=1.04, tilt=0.12, taper=1.3),
    'leg': dict(x=0.088, front=-0.2, back=0.25, top=0.58, knee=0.3, r=(0.037, 0.03), ball=0.042),
    'paw': dict(radii=(0.046, 0.06, 0.028)),
    'tail': [(0, 0.28, 0.7), (0, 0.37, 0.64), (0, 0.45, 0.54), (0, 0.49, 0.42)],
    'tail_r': (0.036, 0.012),
    'collar': dict(center=(0, -0.235, 0.79), major=0.088, minor=0.014, tilt=0.5),
}
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def rig_bones():
    e, lg, j = D['ear'], D['leg'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, lg['back'], 0.64), (0, -0.2, 0.66), 'root'),
        ('head', (0, -0.2, 0.72), (0, -0.31, 1.08), 'body'),
        ('jaw', j['pivot'], (0, -0.55, j['pivot'][2]), 'head'),
        ('ear.L', (e['x'], e['y'], e['base']), (e['x'] + 0.012, e['y'], e['base'] + 0.14), 'head'),
        ('ear.R', (-e['x'], e['y'], e['base']), (-e['x'] - 0.012, e['y'], e['base'] + 0.14), 'head'),
    ]
    tb, _ = dk.tail_bones(D['tail'], 3)
    bones += tb
    for name, x, end in LEGS:
        y = lg[end]
        bones.append((f'leg.{name}', (x * lg['x'], y, lg['top']), (x * lg['x'], y, lg['knee']), 'body'))
        bones.append((f'shin.{name}', (x * lg['x'], y, lg['knee']), (x * lg['x'], y, 0.0), f'leg.{name}'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The body: a deep chest, a narrow waist, a slim rear.
    for key, name in (('rear', 'Rear'), ('waist', 'Waist'), ('chest', 'Chest')):
        s = D[key]
        add(kit.superellipsoid(name, s['radii'], s['e'], s['e'], seg=(32, 22), location=s['center']), m['shell'],
            'body')
    ch, wa, re = D['chest'], D['waist'], D['rear']

    # Seams where the three meet, and one across the chest; rivets along them.
    dk.seam(add, m, 'Chest', ch['center'], ch['radii'], ch['e'], 0.08, 'body', dz=0.05)
    dk.seam(add, m, 'Chest2', ch['center'], ch['radii'], ch['e'], -0.07, 'body', dz=0.05)
    dk.seam(add, m, 'Rear', re['center'], re['radii'], re['e'], -0.07, 'body', dz=0.04)
    # A spine of overlapping plates along the back.
    for k, (y, z, rx) in enumerate(((-0.17, 0.78, 0.04), (-0.07, 0.775, 0.036), (0.03, 0.755, 0.032),
                                    (0.13, 0.745, 0.03), (0.22, 0.73, 0.026))):
        add(kit.superellipsoid(f'Spine.{k}', (rx, 0.045, 0.01), 0.5, 0.5, seg=(18, 8), location=(0, y, z)),
            m['joint'], 'body')
    # Slots in each flank, a service hatch on the waist and a port on the rump.
    for side in (1, -1):
        dk.vents(add, m, f'Flank.{side}', side * (ch['radii'][0] - 0.004), -0.1, 0.64, 'body', n=4, length=0.035,
                 gap=0.016)
        add(kit.superellipsoid(f'Hatch.{side}', (0.005, 0.032, 0.026), 0.3, 0.3, seg=(16, 8),
                               location=(side * (wa['radii'][0] - 0.001), 0.0, 0.665)), m['joint'], 'body')
        add(dk.ball(f'HatchKnob.{side}', (side * (wa['radii'][0] + 0.004), 0.014, 0.665), 0.006), m['bezel'], 'body')
        # Harlequin patches: a few flat plates on the flank.
        add(kit.superellipsoid(f'Patch.{side}.0', (0.006, 0.05, 0.04), 0.5, 0.5, seg=(16, 10),
                               location=(side * (re['radii'][0] - 0.002), 0.16, 0.67), rotation=(0, 0, 0)),
            m['role']('Patch', 'joint'), 'body')
        add(kit.superellipsoid(f'Patch.{side}.1', (0.006, 0.03, 0.03), 0.5, 0.5, seg=(14, 8),
                               location=(side * (ch['radii'][0] - 0.004), -0.18, 0.7)),
            m['role']('Patch', 'joint'), 'body')
    # His heart: a framed, lit plate on the chest.
    add(kit.superellipsoid('HeartFrame', (0.056, 0.014, 0.066), 0.5, 0.5, seg=(24, 10),
                           location=(0, ch['center'][1] - ch['radii'][1] + 0.004, 0.6)), m['bezel'], 'body')
    add(kit.superellipsoid('Heart', (0.044, 0.014, 0.054), 0.5, 0.5, seg=(24, 10),
                           location=(0, ch['center'][1] - ch['radii'][1] - 0.0015, 0.6)), m['dot'](0), 'body')
    # Hip bolts.
    for side in (1, -1):
        add(dk.ball(f'HipBolt.{side}', (side * (re['radii'][0] - 0.004), 0.25, 0.66), 0.008, seg=(10, 6)),
            m['bezel'], 'body')

    # Long arched neck and the collar.
    n = D['neck']
    r0, r1, r2 = n['r']
    pts = kit.spline(n['points'], 10)
    radii = [r0 + (r2 - r0) * i / (len(pts) - 1) for i in range(len(pts))]
    neck, _ = kit.tube('Neck', pts, radii, ring=14)
    add(neck, m['shell'], 'head')
    dk.collar(add, m, D['collar']['center'], D['collar']['major'], D['collar']['minor'], D['collar']['tilt'], 0.034)

    # The head: screen face, long square muzzle with a big nose, a jaw, jowls.
    dk.head(add, m, 'Dane', D['head'], D['screen'], BOXY)
    mz, no, jw, jl = D['muzzle'], D['nose'], D['jaw'], D['jowl']
    add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(32, 20), location=mz['center']),
        m['shell'], 'head')
    add(kit.superellipsoid('MuzzleMask', (mz['radii'][0] + 0.003, 0.06, mz['radii'][2] * 0.8), mz['e'], mz['e'],
                           seg=(24, 14), location=(0, mz['center'][1] - 0.05, mz['center'][2] - 0.008)),
        m['role']('Mask', 'joint'), 'head')
    add(kit.superellipsoid('Nose', no['radii'], 0.6, 0.8, seg=(18, 12), location=no['center']), m['bezel'], 'head')
    dk.nose_bits(add, m, no['center'], no['radii'])
    add(kit.superellipsoid('Jaw', jw['radii'], jw['e'], jw['e'], seg=(24, 12), location=jw['center']),
        m['role']('Mask', 'joint'), 'jaw')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Jowl.{sfx}', jl['radii'], 0.6, 0.6, seg=(18, 10),
                               location=(side * jl['x'], jl['y'], jl['z'])), m['role']('Mask', 'joint'), 'head')
    dk.jaw_pins(add, m, 0.052, jw['pivot'])
    # The bridge of the muzzle: a plate along the top, whisker rivets either side.
    add(kit.superellipsoid('Bridge', (0.016, 0.09, 0.006), 0.5, 0.5, seg=(18, 8),
                           location=(0, mz['center'][1] + 0.01, mz['center'][2] + mz['radii'][2] - 0.002)),
        m['bezel'], 'head')
    for side in (1, -1):
        for q in range(3):
            add(dk.ball(f'Whisker.{side}.{q}', (side * 0.05, mz['center'][1] - 0.04 - q * 0.02, mz['center'][2] + 0.01),
                        0.0045, seg=(8, 6)), m['bezel'], 'head')
    h = D['head']
    dk.cheek_bolts(add, m, h['radii'][0] - 0.002, -0.3, 1.04)

    # Tall pointed ears, upright: a plate on the inside, a hinge puck at the root.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        cz = e['base'] + e['radii'][2] - 0.004
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], 0.7, 0.7, seg=(20, 16), taper=e['taper'],
                               location=(side * (e['x'] + 0.004), e['y'], cz),
                               rotation=(0, side * e['tilt'], 0)), m['role']('Ear', 'joint'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarPlate.{sfx}', (0.006, 0.026, 0.05), 0.6, 0.6, seg=(14, 10), taper=1.2,
                               location=(side * (e['x'] - 0.006), e['y'] - 0.016, cz - 0.004),
                               rotation=(0, side * e['tilt'], 0)), m['role']('EarPlate', 'bezel'), f'ear.{sfx}')
        dk.ear_hinge(add, m, side, sfx, e['x'], e['y'], e['base'] + 0.004, f'ear.{sfx}', r=0.016)

    # Legs: long thighs, ball knees, long shins, big paws.
    lg, pw = D['leg'], D['paw']['radii']
    for name, x, end in LEGS:
        lx, y = x * lg['x'], lg[end]
        dk.leg2(add, m, name, lx, y, lg['top'], lg['knee'], lg['r'], lg['ball'], pw, (f'leg.{name}', f'shin.{name}'))
        dk.paw(add, m, name, lx, y, pw, f'shin.{name}', back=0.012)

    # A long, thin tail, a light on the tip.
    pts = dk.tail(add, m, D['tail'], D['tail_r'], 3)
    add(kit.superellipsoid('TailTip', (0.02, 0.02, 0.026), seg=(14, 8), location=pts[-1]), m['dot'](1), 'tail.3')

    return looks.finish(kit.armature('GreatdaneRig', rig_bones()), parts, skin, m)
