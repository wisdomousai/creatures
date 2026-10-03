"""Clod, the crew's robot wombat: a square chunky block of a toy robot (a wombat is nearly a
cube) with a broad flat head set low in front, the screen across it with two small eyes wide
apart, a big dark nose plate, small round ears, and four short strong legs on ball joints with
three chunky claws on each front paw. The signature is the rump: a square dark plate on the
back end (wombats really have one) with two lit lamps and four screws, which he turns on you.

Lights: the two rump lamps (Dot0) and six lit pellets of dirt (Dot1, `dirt.1..6`, each on a
bone of its own) that fly out behind him when he digs. A bank of earth (`burrow`, role Dirt) in
front of him that he digs into lives in the model too and is put away otherwise. Faces -Y like
the rest of the crew; about 0.29 m to the ear tops.
"""

import math

import kit
import fluffkit as fk

FACE = 'wombat'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'body': dict(radii=(0.142, 0.17, 0.125), center=(0, 0.05, 0.155), e=0.5),
    'head': dict(radii=(0.128, 0.1, 0.088), center=(0, -0.168, 0.2), e=0.5),
    # 2.43:1, like the wombat's face layout (512 x 208)
    'screen': dict(radii=(0.085, 0.02, 0.035), center=(0, -0.266, 0.218), bezel=0.006),
    'nose': dict(radii=(0.052, 0.03, 0.032), center=(0, -0.27, 0.158)),
    'ear': dict(x=0.092, y=-0.14, z=0.272, r=0.026, half=0.011, splay=0.45),
    'front': dict(x=0.1, y=-0.085, top=0.11, bottom=0.03),
    'back': dict(x=0.1, y=0.16, top=0.11, bottom=0.03),
    'rump': dict(radii=(0.105, 0.012, 0.092), center=(0, 0.222, 0.165)),
    'bank': dict(radii=(0.24, 0.19, 0.27), center=(0, -0.44, 0.0)),
}
PELLETS = 6


def pellet_rest(i):
    return (0.0, 0.1, 0.05)


def rig_bones():
    f, b, e = D['front'], D['back'], D['ear']
    bones = fk.standard_bones(hips=(0, 0.16, 0.155), chest=(0, -0.06, 0.17), neck=(0, -0.1, 0.2),
                              head_top=(0, -0.168, 0.29))
    bones.append(('tail.1', (0, 0.215, 0.13), (0, 0.24, 0.13), 'body'))
    bones.append(('burrow', (0, -0.44, 0.0), (0, -0.44, 0.05), 'root'))
    for i in range(PELLETS):
        x, y, z = pellet_rest(i)
        bones.append((f'dirt.{i + 1}', (x, y, z), (x, y, z + 0.01), 'root'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - 0.02), (side * e['x'] * 1.1, e['y'], e['z'] + 0.03), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['y'], f['top']), (side * f['x'], f['y'], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['y'], b['top']), (side * b['x'], b['y'], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035

    # Body: a rounded cube, a seam across the shoulders and one round the middle.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(44, 30))
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.19, n=64), 'body', seam)
    pod('Belly', (0.08, 0.11, 0.012), (0, 0.03, 0.047), m['role']('Pad', 'joint'), 'body', e=0.35, e2=0.7, seg=(32, 8))

    # The rump: a square dark plate with two lit lamps and four screws, and a nub of a tail.
    r = D['rump']
    pod('Rump', r['radii'], r['center'], m['role']('Rump'), 'body', e=0.3, seg=(28, 20))
    for sx in (-1, 1):
        R.pod(f'RumpLamp.{sx}', (0.022, 0.007, 0.016), (sx * 0.05, r['center'][1] + 0.012, r['center'][2] - 0.012), m['dot'](0),
              'body', e=0.45, seg=(16, 10))
        for sz in (-1, 1):
            R.stud(f'RumpScrew.{sx}.{sz}', (sx * 0.08, r['center'][1] + 0.013, r['center'][2] + sz * 0.065), 0.0055, face=(-math.pi / 2, 0, 0))
    R.pod('RumpPanel', (0.06, 0.006, 0.014), (0, r['center'][1] + 0.012, r['center'][2] + 0.045), m['joint'], 'body', e=0.4, seg=(18, 8))
    R.ball('Tail', 0.018, (0, 0.235, 0.12), m['role']('Rump'), 'tail.1')

    # Head: a broad flat box, the screen across the front, a big dark nose plate.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(44, 30))
    sc = D['screen']
    R.screen('Wombat', sc['radii'], sc['center'], sc['bezel'])
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose'), 'head', e=0.6, seg=(28, 18))
    pod('NoseShine', (0.012, 0.005, 0.008), (-0.018, n['center'][1] - n['radii'][1] * 0.9, n['center'][2] + 0.012), m['joint'], 'head',
        e=0.7, seg=(10, 6))
    R.seam('CrownSeam', [(0, -0.168 - 0.1 * math.cos(math.radians(a)) * 0.98, 0.2 + 0.088 * math.sin(math.radians(a)) * 1.02)
                         for a in range(40, 150, 8)], 'head', seam)
    for side in (-1, 1):
        for j, dz in enumerate((0.01, -0.004)):
            R.stud(f'Whisker.{side}.{j}', (side * 0.098, -0.262, 0.155 + dz), 0.003, 'head')

    # Ears: small round pucks.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        rot = (math.pi / 2, side * e['splay'], 0)
        at = (side * e['x'], e['y'], e['z'])
        R.puck(f'Ear.{sfx}', e['r'], e['half'], at, m['role']('Ear'), f'ear.{sfx}', rot=rot)
        R.puck(f'EarIn.{sfx}', e['r'] * 0.6, e['half'] * 0.5, (at[0], at[1] - e['half'] * 0.9, at[2]),
               m['joint'], f'ear.{sfx}', rot=rot, seg=(18, 6))
        R.ball(f'EarHinge.{sfx}', 0.009, (at[0] * 0.95, at[1] + 0.008, at[2] - e['r'] * 0.8), m['joint'], f'ear.{sfx}', seg=(12, 8))

    # Four short strong legs; the front paws are big, with three chunky claws.
    f, bk = D['front'], D['back']
    pad = m['role']('Pad')
    claw = m['role']('Claw')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for pre, leg in (('F', f), ('B', bk)):
            x, y = side * leg['x'], leg['y']
            big = pre == 'F'
            R.leg(f'{pre}{sfx}', (x, y, leg['top']), None, (x, y, leg['bottom']), 0.04 if big else 0.038, f'leg.{pre}{sfx}',
                  dict(radii=(0.05 if big else 0.042, 0.055 if big else 0.048, 0.022), center=(x, y - 0.014, 0.022)), pad=pad)
            for j in range(3):
                dx = (j - 1) * 0.026 if big else (j - 1) * 0.022
                pod(f'Claw.{pre}{sfx}.{j}', (0.009, 0.019, 0.0085), (x + dx, y - (0.07 if big else 0.058), 0.012), claw, f'leg.{pre}{sfx}',
                    e=0.6, seg=(12, 8))

    # The bank of earth he digs into: a rounded mound, flat at the floor, in front of him.
    k = D['bank']
    bank = pod('Bank', k['radii'], k['center'], m['role']('Dirt'), 'burrow', e=0.62, e2=0.9, seg=(36, 22))
    kit.cut(bank, (0, 0, 1), 0.0)
    for j, (dx, dz) in enumerate(((-0.1, 0.13), (0.09, 0.2), (0.0, 0.07))):
        R.pod(f'BankStone.{j}', (0.026, 0.012, 0.018), (dx, k['center'][1] + k['radii'][1] * 0.9, dz), m['joint'], 'burrow', e=0.6,
              seg=(12, 8))

    # Pellets of lit dirt: round, a little squashed, each on a bone of its own.
    for i in range(PELLETS):
        x, y, z = pellet_rest(i)
        R.pod(f'Dirt.{i + 1}', (0.017, 0.017, 0.015), (x, y, z), m['dot'](1), f'dirt.{i + 1}', e=0.8, seg=(12, 8))

    return R.finish('WombatRig', rig_bones())
