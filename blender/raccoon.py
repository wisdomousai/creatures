"""Mitts, the crew's robot raccoon: a stocky grey toy robot with a dark bandit-mask plate across
the screen face, a pale muzzle and a black nose button, round dark-rimmed ears on hinges, little
dexterous hands with four toes, a chest plate with a lamp (Dot0), and a big bushy tail of four
chunky pods ringed grey and dark with a lamp on the tip (Dot1). A smooth pebble with a light in
it (Dot2, the `toy` bone) is kept in the model for washing, and a puddle of light (Dot3, the
`puddle` bone) for it to be washed in, both put away otherwise. Faces -Y like the rest of the
crew; about 0.37 m to the ear tops.
"""

import math

from mathutils import Vector

import kit
import fluffkit as fk

FACE = 'raccoon'
PREVIEW = dict(lift=0.0, width=0.75)

D = {
    'body': dict(radii=(0.092, 0.13, 0.088), center=(0, 0.03, 0.135), e=0.78),
    'rump': dict(radii=(0.094, 0.088, 0.094), center=(0, 0.1, 0.19), e=0.75),
    'chest': dict(radii=(0.054, 0.04, 0.056), center=(0, -0.075, 0.12)),
    'lamp': dict(r=0.013, center=(0, -0.112, 0.12)),
    'head': dict(radii=(0.1, 0.09, 0.076), center=(0, -0.125, 0.195), e=0.62),
    # 2:1, like the raccoon's face layout (512 x 256)
    'screen': dict(radii=(0.064, 0.02, 0.032), center=(0, -0.19, 0.2), bezel=0.006),
    'mask': dict(radii=(0.094, 0.016, 0.044), center=(0, -0.186, 0.2)),
    'brow': dict(radii=(0.064, 0.014, 0.015), center=(0, -0.186, 0.253)),
    'muzzle': dict(radii=(0.026, 0.06, 0.021), center=(0, -0.222, 0.167)),
    'nose': dict(radii=(0.012, 0.011, 0.01), center=(0, -0.278, 0.172)),
    'ear': dict(x=0.074, y=-0.095, z=0.255, r=0.028),
    'front': dict(x=0.066, hip=(-0.06, 0.12), knee=(-0.075, 0.075), ankle=(-0.082, 0.034)),
    'back': dict(x=0.075, hip=(0.15, 0.17), knee=(0.168, 0.1), ankle=(0.16, 0.034)),
    'tail': [(0, 0.17, 0.17), (0, 0.29, 0.12), (0, 0.41, 0.095), (0, 0.52, 0.08), (0, 0.61, 0.075)],
    # Held in the hands when it washes, and the puddle on the floor in front.
    'pebble': dict(r=0.026, center=(0, -0.2, 0.03)),
    'puddle': dict(r=0.1, center=(0, -0.21, 0.0)),
}


def rig_bones():
    e, f, b = D['ear'], D['front'], D['back']
    bones = fk.standard_bones(hips=(0, b['hip'][0], 0.17), chest=(0, -0.09, 0.14), neck=(0, -0.08, 0.15),
                              head_top=(0, -0.125, 0.275))
    pts = D['tail']
    parent = 'body'
    for i in range(4):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    pb = D['pebble']['center']
    bones.append(('toy', pb, (pb[0], pb[1], pb[2] + 0.04), 'root'))
    pd = D['puddle']['center']
    bones.append(('puddle', (pd[0], pd[1], 0.004), (pd[0], pd[1], 0.03), 'root'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - 0.03), (side * e['x'] * 1.15, e['y'], e['z'] + 0.05), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['ankle'][0], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['hip'][0], b['hip'][1]), (side * b['x'], b['ankle'][0], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035
    dark = m['role']('Dark', 'joint')
    pale = m['role']('Pale')

    # Body: a stocky pod, a belt seam, a pale chest plate with a lamp.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(36, 24))
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.12, n=72), 'body', seam)
    rp = D['rump']
    pod('Rump', rp['radii'], rp['center'], m['shell'], 'body', e=rp['e'], seg=(30, 20))
    c = D['chest']
    pod('Chest', c['radii'], c['center'], pale, 'body', e=0.5, e2=0.8, seg=(28, 16), rot=(math.pi / 2, 0, 0))
    R.add(kit.torus('ChestRim', c['radii'][0] + 0.004, 0.0045, seg=(32, 6),
                    location=(0, c['center'][1] - 0.004, c['center'][2]), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    lp = D['lamp']
    R.puck('Lamp', lp['r'], 0.006, lp['center'], m['dot'](0), 'body', rot=(math.pi / 2, 0, 0), seg=(24, 6))
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        R.stud(f'ChestScrew.{i}', (c['radii'][0] * math.cos(a), c['center'][1] - 0.012, c['center'][2] + c['radii'][2] * 1.0 * math.sin(a)), 0.0042)
    R.pod('Hatch', (0.045, 0.01, 0.045), (0, 0.182, 0.2), m['bezel'], 'body', e=0.3, seg=(24, 18))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.03, 0.19, 0.2 + sz * 0.03), 0.005)
    for j, y in enumerate((-0.06, -0.01, 0.04)):
        R.pod(f'Back.{j}', (0.026, 0.024, 0.008), (0, y, 0.222), m['joint'], 'body', e=0.5, seg=(14, 8))

    # Head: a wide rounded box; a dark bandit-mask plate carries the screen; pale muzzle, dark nose.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(38, 26))
    mk = D['mask']
    pod('Mask', mk['radii'], mk['center'], dark, 'head', e=0.35, e2=0.5, seg=(32, 12))
    bw = D['brow']
    pod('Brow', bw['radii'], bw['center'], pale, 'head', e=0.35, e2=0.5, seg=(28, 10))
    sc = D['screen']
    R.screen('Raccoon', sc['radii'], sc['center'], sc['bezel'])
    mz = D['muzzle']
    pod('Muzzle', mz['radii'], mz['center'], pale, 'head', e=0.6, seg=(26, 16))
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose', 'bezel'), 'head', e=0.6, seg=(20, 12))
    for side in (-1, 1):
        pod(f'Cheek.{side}', (0.014, 0.024, 0.022), (side * 0.095, -0.16, 0.165), pale, 'head', e=0.6, seg=(18, 12), rot=(0, 0, side * 0.3))
        for j, dz in enumerate((0.012, 0.0, -0.012)):
            R.stud(f'Whisker.{side}.{j}', (side * 0.034, -0.262, 0.168 + dz), 0.003, 'head')
    R.seam('CrownSeam', [(0, -0.125 - 0.09 * math.cos(math.radians(a)) * 0.97, 0.195 + 0.076 * math.sin(math.radians(a)) * 1.01)
                         for a in range(45, 150, 8)], 'head', seam)

    # Ears: round grey pods with a dark inside, on hinges.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        at = (side * e['x'], e['y'], e['z'])
        pod(f'Ear.{sfx}', (e['r'], e['r'] * 0.55, e['r'] * 0.95), at, m['shell'], bone, e=0.8, seg=(22, 16), rot=(0, 0, -side * 0.3))
        pod(f'EarIn.{sfx}', (e['r'] * 0.58, 0.006, e['r'] * 0.55), (at[0] - side * 0.002, at[1] - e['r'] * 0.52, at[2] - 0.003), dark, bone,
            e=0.7, seg=(18, 10), rot=(0, 0, -side * 0.3))
        R.ball(f'EarHinge.{sfx}', 0.011, (side * e['x'] * 0.8, e['y'] + 0.006, e['z'] - 0.036), m['joint'], bone, seg=(14, 10))

    # Legs: dark hands (four toes) and feet.
    f, bk = D['front'], D['back']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        R.leg(f'F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['knee'][0], f['knee'][1]),
              (side * f['x'], f['ankle'][0], f['ankle'][1]), 0.02, f'leg.F{sfx}',
              dict(radii=(0.026, 0.05, 0.014), center=(side * f['x'], f['ankle'][0] - 0.02, 0.016)), shell=dark,
              pad=m['role']('Pad'), toes=5)
        R.leg(f'B{sfx}', (side * bk['x'], bk['hip'][0], bk['hip'][1]), (side * bk['x'], bk['knee'][0], bk['knee'][1]),
              (side * bk['x'], bk['ankle'][0], bk['ankle'][1]), 0.024, f'leg.B{sfx}',
              dict(radii=(0.03, 0.042, 0.018), center=(side * bk['x'], bk['ankle'][0] - 0.01, 0.018)), shell=dark,
              pad=m['role']('Pad'), toes=4)
        pod(f'Haunch.{sfx}', (0.03, 0.058, 0.058), (side * 0.09, 0.15, 0.17), m['shell'], f'leg.B{sfx}', e=0.7, seg=(20, 14))
        pod(f'Shoulder.{sfx}', (0.026, 0.048, 0.052), (side * 0.082, -0.058, 0.125), m['shell'], f'leg.F{sfx}', e=0.7, seg=(20, 14))

    # Tail: four chunky pods, grey and dark in turn, a lamp on the tip.
    pts = [Vector(p) for p in D['tail']]
    radii = [0.054, 0.066, 0.064, 0.05]
    for i in range(4):
        a_, b_ = pts[i], pts[i + 1]
        mid = a_.lerp(b_, 0.5)
        length = (b_ - a_).length
        rot = tuple((b_ - a_).to_track_quat('Z', 'Y').to_euler())
        mat = m['shell'] if i % 2 == 0 else dark
        R.pod(f'Tail.{i + 1}', (radii[i], radii[i], length * 0.62), tuple(mid), mat, f'tail.{i + 1}', e=0.75, seg=(22, 14), rot=rot)
    tip = pts[4] + (pts[4] - pts[3]).normalized() * 0.018
    R.ball('TailLamp', 0.016, tuple(tip), m['dot'](1), 'tail.4', seg=(14, 10))
    R.ball('TailHub', 0.032, tuple(pts[0] - Vector((0, 0.012, 0))), m['joint'], 'body')

    # The pebble: a smooth lit stone on its own bone, held in both hands to wash.
    pb = D['pebble']
    R.pod('Pebble', (pb['r'] * 1.1, pb['r'] * 0.9, pb['r']), pb['center'], m['dot'](2), 'toy', e=0.9, seg=(18, 12))
    R.add(kit.torus('PebbleBand', pb['r'] * 0.95, 0.004, seg=(20, 6), location=pb['center'], rotation=(0.5, 0.3, 0)), m['bezel'], 'toy')

    # The puddle of light: a flat disc and a rim on the floor, on its own bone.
    pd = D['puddle']
    R.puck('Puddle', pd['r'], 0.002, (pd['center'][0], pd['center'][1], 0.004), m['dot'](3), 'puddle', seg=(32, 6), e=0.3)
    R.add(kit.torus('PuddleRim', pd['r'] * 1.02, 0.0035, seg=(36, 6), location=(pd['center'][0], pd['center'][1], 0.006)), m['glow'], 'puddle')

    return R.finish('RaccoonRig', rig_bones())
