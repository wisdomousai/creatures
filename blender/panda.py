"""Bao, the crew's robot panda cub: a round white toy robot with black legs and arms, black ears,
a black eye-patch plate round the screen face, a small black nose, and a belly plate with a
round lamp (Dot0). A stalk of bamboo (`toy`, with a light in each joint, Dot1) is kept in the
model for munching and put away otherwise. Faces -Y like the rest of the crew; about 0.42 m to
the ear tops.
"""

import math

import kit
import fluffkit as fk

FACE = 'panda'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.122, 0.112, 0.118), center=(0, 0.02, 0.15), e=0.85),
    'belly': dict(radii=(0.066, 0.07, 0.014), center=(0, -0.086, 0.14)),
    'lamp': dict(r=0.016, center=(0, -0.105, 0.14)),
    'head': dict(radii=(0.128, 0.104, 0.104), center=(0, -0.085, 0.305), e=0.7),
    # 2:1, like the panda's face layout (512 x 256)
    'screen': dict(radii=(0.07, 0.018, 0.035), center=(0, -0.176, 0.31), bezel=0.006),
    'patch': dict(radii=(0.092, 0.012, 0.05), center=(0, -0.172, 0.31)),
    'nose': dict(radii=(0.017, 0.011, 0.012), center=(0, -0.198, 0.262)),
    'ear': dict(x=0.092, y=-0.07, z=0.395, r=0.04),
    'front': dict(x=0.092, hip=(-0.07, 0.15), knee=(-0.08, 0.095), ankle=(-0.08, 0.036)),
    'back': dict(x=0.092, hip=(0.1, 0.13), knee=(0.108, 0.085), ankle=(0.104, 0.036)),
    'tail': dict(r=0.024, center=(0, 0.135, 0.075)),
    'stalk': dict(x=0.0, y=-0.17, z0=0.09, z1=0.34, r=0.013),
}


def rig_bones():
    e, f, b, s = D['ear'], D['front'], D['back'], D['stalk']
    bones = fk.standard_bones(hips=(0, b['hip'][0], 0.15), chest=(0, -0.06, 0.17), neck=(0, -0.07, 0.23),
                              head_top=(0, -0.085, 0.4))
    bones.append(('tail.1', (0, 0.12, 0.075), (0, 0.155, 0.08), 'body'))
    bones.append(('toy', (s['x'], s['y'], s['z0']), (s['x'], s['y'], s['z1']), 'body'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.85, e['y'], e['z'] - 0.03), (side * e['x'] * 1.2, e['y'], e['z'] + 0.04), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['ankle'][0], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['hip'][0], b['hip'][1]), (side * b['x'], b['ankle'][0], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035
    black = m['role']('Black', 'joint')

    # Body: a round white pod, a black shoulder band, a belly plate with a round lamp.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(36, 26))
    pod('Band', (b['radii'][0] * 1.012, 0.034, b['radii'][2] * 0.5), (0, -0.04, 0.2), black, 'body', e=0.75, seg=(30, 12), rot=(0, 0, 0))
    bl = D['belly']
    pod('Belly', bl['radii'], bl['center'], m['role']('Belly', 'shell'), 'body', e=0.35, e2=1.0, seg=(32, 8), rot=(math.pi / 2, 0, 0))
    R.add(kit.torus('BellyRim', bl['radii'][0] + 0.004, 0.0048, seg=(36, 6),
                    location=(0, bl['center'][1] - 0.004, bl['center'][2]), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    lp = D['lamp']
    R.puck('Lamp', lp['r'], 0.007, lp['center'], m['dot'](0), 'body', rot=(math.pi / 2, 0, 0), seg=(24, 6))
    R.add(kit.torus('LampRing', lp['r'] + 0.004, 0.0035, seg=(24, 6), location=(lp['center'][0], lp['center'][1] - 0.001, lp['center'][2]),
                    rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        R.stud(f'BellyScrew.{i}', (bl['radii'][0] * math.cos(a), bl['center'][1] - 0.012, bl['center'][2] + bl['radii'][0] * 1.05 * math.sin(a)), 0.0045)
    R.pod('Hatch', (0.05, 0.01, 0.05), (0, 0.133, 0.16), m['bezel'], 'body', e=0.3, seg=(24, 18))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.032, 0.142, 0.16 + sz * 0.034), 0.005)
    t = D['tail']
    R.ball('Tail', t['r'], t['center'], m['shell'], 'tail.1')

    # Head: a round white pod; the black eye-patch plate carries the screen; a small black nose.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(40, 28))
    pt = D['patch']
    pod('Patch', pt['radii'], pt['center'], black, 'head', e=0.4, e2=0.5, seg=(32, 12))
    sc = D['screen']
    R.screen('Panda', sc['radii'], sc['center'], sc['bezel'])
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose', 'bezel'), 'head', e=0.6, seg=(20, 12))
    R.seam('Philtrum', [(0, n['center'][1] + 0.0, n['center'][2] - n['radii'][2] * 0.9), (0, n['center'][1] + 0.004, n['center'][2] - 0.035)],
           'head', seam)
    R.seam('CrownSeam', [(0, -0.085 - 0.104 * math.cos(math.radians(a)) * 0.97, 0.305 + 0.104 * math.sin(math.radians(a)) * 1.01)
                         for a in range(45, 150, 8)], 'head', seam)

    # Ears: black balls on hinges.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        at = (side * e['x'], e['y'], e['z'])
        pod(f'Ear.{sfx}', (e['r'], e['r'] * 0.72, e['r']), at, black, bone, e=0.9, seg=(22, 16))
        R.ball(f'EarHinge.{sfx}', 0.011, (side * e['x'] * 0.8, e['y'] + 0.01, e['z'] - 0.035), m['joint'], bone, seg=(14, 10))

    # Black arms and legs, short and fat, on ball joints.
    f, bk = D['front'], D['back']
    pad = m['role']('Pad')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        R.leg(f'F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['knee'][0], f['knee'][1]),
              (side * f['x'], f['ankle'][0], f['ankle'][1]), 0.033, f'leg.F{sfx}',
              dict(radii=(0.038, 0.046, 0.02), center=(side * f['x'], f['ankle'][0] - 0.012, 0.02)), shell=black, pad=pad, toes=3)
        R.leg(f'B{sfx}', (side * bk['x'], bk['hip'][0], bk['hip'][1]), (side * bk['x'], bk['knee'][0], bk['knee'][1]),
              (side * bk['x'], bk['ankle'][0], bk['ankle'][1]), 0.035, f'leg.B{sfx}',
              dict(radii=(0.038, 0.048, 0.02), center=(side * bk['x'], bk['ankle'][0] - 0.01, 0.02)), shell=black, pad=pad, toes=3)

    # The bamboo stalk: three green lengths with a light in each joint, on the toy bone.
    s = D['stalk']
    green = m['role']('Bamboo', 'joint')
    zs = [s['z0'], s['z0'] + (s['z1'] - s['z0']) / 3, s['z0'] + 2 * (s['z1'] - s['z0']) / 3, s['z1']]
    for i in range(3):
        pod(f'Stalk.{i}', (s['r'], s['r'], (zs[i + 1] - zs[i]) * 0.5 - 0.003), (s['x'], s['y'], (zs[i] + zs[i + 1]) / 2), green, 'toy', e=0.7,
            seg=(14, 10))
    for i in (1, 2):
        R.add(kit.torus(f'Node.{i}', s['r'] * 1.2, 0.0045, seg=(18, 6), location=(s['x'], s['y'], zs[i])), m['dot'](1), 'toy')
    R.add(kit.torus('NodeTop', s['r'] * 1.2, 0.0045, seg=(18, 6), location=(s['x'], s['y'], s['z1'] - 0.012)), m['dot'](1), 'toy')

    return R.finish('PandaRig', rig_bones())
