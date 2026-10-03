"""Floe, the crew's robot polar bear cub: an all-white toy robot, round and chubby, with a longer snout
and a short neck (a collar ring in ice blue) than Bao the panda, small round ears, a black nose button
at the tip of a pale snout, a hexagonal lamp on the chest (Dot0), big paws whose pads are lit pale
blue (Dot1) so her feet glow when she plays with them, and a stub of a tail. Faces -Y like the rest of
the crew; about 0.4 m to the ear tops.
"""

import math

import kit
import fluffkit as fk

FACE = 'polarcub'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.12, 0.125, 0.116), center=(0, 0.03, 0.15), e=0.85),
    'chest': dict(radii=(0.06, 0.012, 0.06), center=(0, -0.093, 0.135)),
    'lamp': dict(r=0.02, center=(0, -0.1, 0.135)),
    'head': dict(radii=(0.118, 0.104, 0.098), center=(0, -0.12, 0.3), e=0.7),
    # 2:1, like the polar cub's face layout (512 x 256)
    'screen': dict(radii=(0.066, 0.018, 0.033), center=(0, -0.209, 0.318), bezel=0.006),
    'snout': dict(radii=(0.05, 0.05, 0.036), center=(0, -0.2, 0.262), e=0.7),
    'nose': dict(radii=(0.02, 0.014, 0.014), center=(0, -0.252, 0.274)),
    'ear': dict(x=0.082, y=-0.1, z=0.385, r=0.03),
    'front': dict(x=0.096, hip=(-0.07, 0.15), knee=(-0.08, 0.098), ankle=(-0.08, 0.038)),
    'back': dict(x=0.096, hip=(0.11, 0.13), knee=(0.118, 0.086), ankle=(0.114, 0.038)),
    'tail': dict(r=0.022, center=(0, 0.15, 0.1)),
}


def rig_bones():
    e, f, b = D['ear'], D['front'], D['back']
    bones = fk.standard_bones(hips=(0, b['hip'][0], 0.15), chest=(0, -0.07, 0.17), neck=(0, -0.07, 0.235),
                              head_top=(0, -0.12, 0.4))
    bones.append(('tail.1', (0, 0.13, 0.1), (0, 0.17, 0.105), 'body'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.85, e['y'], e['z'] - 0.025), (side * e['x'] * 1.2, e['y'], e['z'] + 0.03), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['ankle'][0], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['hip'][0], b['hip'][1]), (side * b['x'], b['ankle'][0], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035
    nose = m['role']('Nose', 'bezel')

    # Body: a round white pod with a belt seam, a hex lamp on the chest, a hatch behind.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(36, 26))
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.2, n=72), 'body', seam)
    lp = D['lamp']
    R.puck('Lamp', lp['r'], 0.007, lp['center'], m['dot'](0), 'body', rot=(math.pi / 2, 0, math.pi / 6), seg=(6, 6), e=0.3)
    R.add(kit.torus('LampRing', lp['r'] + 0.006, 0.0035, seg=(6, 6), location=(lp['center'][0], lp['center'][1] - 0.001, lp['center'][2]),
                    rotation=(math.pi / 2, 0, math.pi / 6)), m['joint'], 'body')
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        R.stud(f'ChestScrew.{i}', (0.045 * math.cos(a), lp['center'][1] - 0.012, lp['center'][2] + 0.045 * math.sin(a)), 0.0042)
    R.pod('Hatch', (0.05, 0.01, 0.05), (0, 0.153, 0.16), m['bezel'], 'body', e=0.3, seg=(24, 18))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.032, 0.161, 0.16 + sz * 0.034), 0.005)
    t = D['tail']
    R.ball('Tail', t['r'], (0, 0.16, 0.1), m['shell'], 'tail.1')

    # Head: a round pod on a short neck with an ice-blue collar; a longer pale snout, black nose.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(40, 28))
    R.tube('Neck', [(0, -0.06, 0.2), (0, -0.09, 0.26)], 0.062, m['shell'], 'body', ring=18)
    R.add(kit.torus('Collar', 0.07, 0.009, seg=(32, 8), location=(0, -0.078, 0.238), rotation=(-0.45, 0, 0)), m['joint'], 'body')
    sc = D['screen']
    R.screen('Polarcub', sc['radii'], sc['center'], sc['bezel'])
    sn = D['snout']
    pod('Snout', sn['radii'], sn['center'], m['shell'], 'head', e=sn['e'], seg=(28, 18))
    n = D['nose']
    pod('Nose', n['radii'], n['center'], nose, 'head', e=0.6, seg=(20, 12))
    R.seam('Philtrum', [(0, n['center'][1] + 0.008, n['center'][2] - 0.01), (0, n['center'][1] + 0.002, n['center'][2] - 0.03)], 'head', seam)
    R.seam('CrownSeam', [(0, -0.12 - 0.104 * math.cos(math.radians(a)) * 0.97, 0.3 + 0.098 * math.sin(math.radians(a)) * 1.01)
                         for a in range(45, 150, 8)], 'head', seam)

    # Ears: small round white pods on hinges.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        pod(f'Ear.{sfx}', (e['r'], e['r'] * 0.7, e['r']), (side * e['x'], e['y'], e['z']), m['shell'], bone, e=0.9, seg=(20, 14))
        R.ball(f'EarHinge.{sfx}', 0.01, (side * e['x'] * 0.78, e['y'] + 0.01, e['z'] - 0.03), m['joint'], bone, seg=(14, 10))

    # Big paws: white legs on icy ball joints, the pads lit.
    f, bk = D['front'], D['back']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        R.leg(f'F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['knee'][0], f['knee'][1]),
              (side * f['x'], f['ankle'][0], f['ankle'][1]), 0.036, f'leg.F{sfx}',
              dict(radii=(0.046, 0.056, 0.022), center=(side * f['x'], f['ankle'][0] - 0.014, 0.022)), pad=m['dot'](1), toes=0)
        R.leg(f'B{sfx}', (side * bk['x'], bk['hip'][0], bk['hip'][1]), (side * bk['x'], bk['knee'][0], bk['knee'][1]),
              (side * bk['x'], bk['ankle'][0], bk['ankle'][1]), 0.038, f'leg.B{sfx}',
              dict(radii=(0.046, 0.058, 0.022), center=(side * bk['x'], bk['ankle'][0] - 0.012, 0.022)), pad=m['dot'](1), toes=0)
        for j in (-1, 0, 1):
            R.stud(f'ClawF.{sfx}.{j}', (side * f['x'] + j * 0.02, f['ankle'][0] - 0.07, 0.016), 0.0055, f'leg.F{sfx}', 'bezel', (0, 0, 0))
            R.stud(f'ClawB.{sfx}.{j}', (side * bk['x'] + j * 0.02, bk['ankle'][0] - 0.07, 0.016), 0.0055, f'leg.B{sfx}', 'bezel', (0, 0, 0))

    return R.finish('PolarcubRig', rig_bones())
