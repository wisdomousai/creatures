"""Pocket, the crew's robot hamster: a plump toy robot, not a hamster in a robot suit. A
round body pod with a seam round its middle and a cream belly plate, a wide rounded-box head
with a screen face, a button nose and two tiny puck ears, stub legs on ball joints and big
flat hind feet, a nub of a tail.

The signature is the cheeks: two big domes at the sides of the head, each on a bone of its
own so the site can swell them, and each one a light (Dot0 his left, Dot1 his right) that
glows brighter as they fill. Three small lamps on the brow (Dot2) say the rest of his mood.

Two things live in the model and come out only for a trick, each on bones of their own: a
running wheel (`toy`, a drum of two rims and bars that he runs inside; it spins about the
x axis) and a little pile of sunflower seeds (`pile.1..4`). Faces -Y like the rest of the
crew; about 0.31 m to the ear tips.
"""

import math

import kit
import fluffkit as fk
from fluffkit import mirror

FACE = 'hamster'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.108, 0.118, 0.098), center=(0, 0.02, 0.125), e=0.82),
    'belly': dict(radii=(0.06, 0.07, 0.014), center=(0, -0.088, 0.1)),
    'head': dict(radii=(0.118, 0.098, 0.084), center=(0, -0.082, 0.205), e=0.62),
    # 2:1, like the hamster's face layout (512 x 256)
    'screen': dict(radii=(0.072, 0.02, 0.036), center=(0, -0.167, 0.222), bezel=0.007),
    'nose': dict(radii=(0.016, 0.01, 0.012), center=(0, -0.183, 0.188)),
    'cheek': dict(radii=(0.05, 0.046, 0.046), x=0.098, y=-0.1, z=0.178),
    'ear': dict(x=0.068, y=-0.062, z=0.282, r=0.03, half=0.011, splay=0.3),
    'hip': dict(x=0.082, y=0.07, z=0.082),
    'foot': dict(radii=(0.032, 0.05, 0.02), center=(0.082, 0.04, 0.02)),
    'arm': dict(x=0.062, top=(-0.082, 0.1), bottom=(-0.098, 0.03), r=0.016),
    'paw': dict(radii=(0.022, 0.026, 0.014)),
    'tail': dict(r=0.02, center=(0, 0.14, 0.1)),
    'wheel': dict(r=0.2, half=0.145, bars=14),
}
SEEDS = [(-0.06, -0.27, 0.012, 0.4), (0.0, -0.285, 0.012, -0.2), (0.058, -0.268, 0.012, 0.9), (0.0, -0.245, 0.019, 0.1)]


def rig_bones():
    h, c, e, a = D['hip'], D['cheek'], D['ear'], D['arm']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # From the hips forward: pitching it (- up) sits him up on his haunches.
        ('body', (0, h['y'], h['z']), (0, -0.07, 0.13), 'root'),
        ('head', (0, -0.07, 0.17), (0, -0.082, 0.3), 'body'),
        ('tail.1', (0, 0.125, 0.1), (0, 0.17, 0.105), 'body'),
        ('toy', (0, 0, D['wheel']['r']), (0, -0.02, D['wheel']['r']), 'root'),
    ]
    for i, (x, y, z, _) in enumerate(SEEDS):
        bones.append((f'pile.{i + 1}', (x, y, z), (x, y - 0.01, z), 'root'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - 0.025), (side * e['x'] * 1.2, e['y'], e['z'] + 0.03), 'head'))
        bones.append((f'cheek.{sfx}', (side * c['x'] * 0.8, c['y'], c['z']), (side * c['x'] * 1.2, c['y'] - 0.01, c['z']), 'head'))
        bones.append((f'leg.F{sfx}', (side * a['x'], a['top'][0], a['top'][1]), (side * a['x'], a['bottom'][0], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * h['x'], h['y'], h['z']), (side * h['x'], h['y'] - 0.03, 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    add, pod = R.add, R.pod
    seam = 0.0035

    # Body: a plump pod, a belt seam round its middle, a cream belly plate with a rim.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(40, 28))
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.152, n=64), 'body', seam)
    bl = D['belly']
    pod('Belly', bl['radii'], bl['center'], m['role']('Belly'), 'body', e=0.35, e2=1.0, seg=(32, 8),
        rot=(math.pi / 2, 0, 0))
    R.add(kit.torus('BellyRim', bl['radii'][0] + 0.004, 0.005, seg=(36, 6),
                    location=(0, bl['center'][1] - 0.004, bl['center'][2]), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        R.stud(f'BellyScrew.{i}', (bl['radii'][0] * 1.0 * math.cos(a), bl['center'][1] - 0.012,
                                    bl['center'][2] + (bl['radii'][0] * 1.1) * math.sin(a)), 0.0045)
    # A hatch with four screws on his back, and the nub of a tail on its own bone.
    R.pod('Hatch', (0.05, 0.01, 0.052), (0, 0.133, 0.135), m['bezel'], 'body', e=0.3, seg=(24, 18))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.034, 0.142, 0.135 + sz * 0.036), 0.0055)
    t = D['tail']
    R.ball('Tail', t['r'], t['center'], m['role']('Belly'), 'tail.1')
    R.ring('TailRing', (0, t['center'][1] + 0.002, t['center'][2]), t['r'] * 0.95, 0.0035, (0, 1, t['center'][2]), 'joint',
           'tail.1', seg=(24, 6))

    # Head: a wide rounded box with the screen in front, a button nose, ear pucks.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(44, 30))
    sc = D['screen']
    R.screen('Hamster', sc['radii'], sc['center'], sc['bezel'])
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose', 'bezel'), 'head', e=0.6, seg=(20, 12))
    for side in (-1, 1):
        for j, (dz, dx) in enumerate(((0.012, 0.03), (0.0, 0.037), (-0.012, 0.03))):
            R.stud(f'Whisker.{side}.{j}', (side * (0.03 + dx * 0.5), -0.17, 0.176 + dz), 0.0035, 'head')
    R.seam('CrownSeam', [(0, -0.082 - 0.098 * math.cos(math.radians(a)) * 0.97, 0.205 + 0.084 * math.sin(math.radians(a)) * 1.01)
                         for a in range(38, 150, 8)], 'head', seam)
    # Three brow lamps (Dot2), lit with his mood.
    for j, x in enumerate((-0.026, 0.0, 0.026)):
        R.pod(f'Brow.{j}', (0.008, 0.005, 0.008), (x, -0.147, 0.268 + 0.002 * (j == 1)), m['dot'](2), 'head', e=0.7,
              seg=(12, 8), rot=(0.25, 0, 0))

    # Cheeks: two domes (the lights) in a rim, on bones that swell them.
    c = D['cheek']
    for side, sfx, dot in ((1, 'L', 0), (-1, 'R', 1)):
        at = (side * c['x'], c['y'], c['z'])
        R.pod(f'Cheek.{sfx}', c['radii'], at, m['dot'](dot), f'cheek.{sfx}', e=0.85, seg=(28, 20))
        R.add(kit.torus(f'CheekRim.{sfx}', c['radii'][1] * 0.98, 0.0055, seg=(30, 6),
                        location=(side * (c['x'] - c['radii'][0] * 0.55), c['y'], c['z']),
                        rotation=(0, math.pi / 2, 0)), m['joint'], 'head')
        R.stud(f'CheekBolt.{sfx}', (side * (c['x'] + c['radii'][0] * 0.88), c['y'] - 0.012, c['z'] + 0.02), 0.0055, 'head',
               face=(0, math.pi / 2, 0))

    # Ears: round pucks splayed out a little, with a pink disc inside.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        rot = (math.pi / 2, side * e['splay'], 0)
        at = (side * e['x'], e['y'], e['z'])
        R.puck(f'Ear.{sfx}', e['r'], e['half'], at, m['shell'], f'ear.{sfx}', rot=rot)
        R.puck(f'EarIn.{sfx}', e['r'] * 0.62, e['half'] * 0.5, (at[0], at[1] - e['half'] * 0.85, at[2]),
               m['role']('EarIn', 'joint'), f'ear.{sfx}', rot=rot, seg=(20, 6))
        R.ball(f'EarHinge.{sfx}', 0.008, (at[0] * 0.9, at[1] + 0.008, at[2] - e['r'] * 0.8), m['joint'], f'ear.{sfx}',
               seg=(12, 8))

    # Arms: short stubs on ball joints, round paws with a pad.
    a, pw = D['arm'], D['paw']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'leg.F{sfx}'
        top = (side * a['x'], *a['top'])
        low = (side * a['x'], a['bottom'][0], a['bottom'][1] + 0.012)
        R.ball(f'Shoulder.{sfx}', a['r'] * 1.35, top, m['joint'], bone)
        R.tube(f'Arm.{sfx}', [top, low], a['r'], m['shell'], bone)
        R.ring(f'Wrist.{sfx}', low, a['r'] * 1.08, 0.0045, (low[0], low[1], 0.0), 'joint', bone, seg=(20, 6))
        R.pod(f'Hand.{sfx}', pw['radii'], (side * a['x'], a['bottom'][0] - 0.004, 0.018), m['role']('Paw'), bone, e=0.6,
              seg=(20, 12))
        R.pod(f'HandPad.{sfx}', (0.013, 0.014, 0.004), (side * a['x'], a['bottom'][0] - 0.012, 0.007), m['role']('Pad', 'joint'),
              bone, e=0.5, seg=(14, 6))

    # Hind legs: a big hip disc, a short strut, a long flat foot with a pad.
    hp, ft = D['hip'], D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'leg.B{sfx}'
        R.puck(f'HipDisc.{sfx}', 0.05, 0.016, (side * (hp['x'] + 0.02), hp['y'], hp['z'] + 0.02), m['shell'], bone,
               rot=(0, math.pi / 2, 0), seg=(28, 8))
        R.puck(f'HipHub.{sfx}', 0.022, 0.01, (side * (hp['x'] + 0.036), hp['y'], hp['z'] + 0.02), m['joint'], bone,
               rot=(0, math.pi / 2, 0), seg=(18, 6))
        fc = mirror(ft['center'], side)
        R.pod(f'Foot.{sfx}', ft['radii'], fc, m['role']('Paw'), bone, e=0.45, e2=0.7, seg=(24, 12))
        R.pod(f'FootPad.{sfx}', (0.024, 0.04, 0.006), (fc[0], fc[1], 0.004), m['role']('Pad', 'joint'), bone, e=0.4,
              e2=0.6, seg=(20, 6))
        R.ball(f'Ankle.{sfx}', 0.014, (fc[0], fc[1] + 0.034, 0.028), m['joint'], bone)

    # The running wheel (a toy on its own bone): two rims and a drum of bars, a hub on
    # each side, the rims lit. It spins about the x axis.
    w = D['wheel']
    for side in (-1, 1):
        R.add(kit.torus(f'WheelRim.{side}', w['r'], 0.011, seg=(40, 6), location=(side * w['half'], 0, w['r']),
                        rotation=(0, math.pi / 2, 0)), m['role']('Wheel', 'joint'), 'toy')
        R.add(kit.torus(f'WheelLight.{side}', w['r'] * 0.84, 0.007, seg=(48, 6),
                        location=(side * w['half'], 0, w['r']), rotation=(0, math.pi / 2, 0)), m['dot'](3), 'toy')
    for k in range(w['bars']):
        a_ = 2 * math.pi * (k + 0.5) / w['bars']
        y, z = w['r'] * math.sin(a_), w['r'] + w['r'] * math.cos(a_)
        R.tube(f'Bar.{k}', [(-w['half'], y, z), (w['half'], y, z)], 0.0045, m['role']('Wheel', 'joint'), 'toy', ring=6)

    # Sunflower seeds (a pile on bones of their own): striped flat ovals.
    for i, (x, y, z, turn) in enumerate(SEEDS):
        R.pod(f'Seed.{i + 1}', (0.024, 0.016, 0.009), (x, y, z), m['role']('Seed', 'joint'), f'pile.{i + 1}', e=0.6, seg=(16, 10),
              rot=(0, 0, turn))
        R.pod(f'SeedStripe.{i + 1}', (0.017, 0.005, 0.0025), (x, y, z + 0.0085), m['bezel'], f'pile.{i + 1}', e=0.5,
              seg=(12, 6), rot=(0, 0, turn))

    return R.finish('HamsterRig', rig_bones())
