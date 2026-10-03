"""Nod, the crew's robot koala: a stocky grey toy robot with a big round head, two huge pom
ears with white insides, a big dark oval nose plate (the signature), a small sleepy screen face,
long strong arms and legs on ball joints for clinging, and a nub of a tail.

Lights: a leaf-green glow inside each ear (Dot0) and a round lamp in the belly plate (Dot1).
A eucalyptus leaf (`toy`, on the head bone) is kept in the model for chewing and put away
otherwise. Faces -Y like the rest of the crew; about 0.43 m to the ear tops.
"""

import math

from mathutils import Vector

import kit
import fluffkit as fk
from fluffkit import mirror

FACE = 'koala'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.108, 0.105, 0.115), center=(0, 0.025, 0.15), e=0.8),
    'belly': dict(radii=(0.064, 0.07, 0.014), center=(0, -0.078, 0.14)),
    'lamp': dict(r=0.016, center=(0, -0.097, 0.14)),
    'head': dict(radii=(0.118, 0.096, 0.092), center=(0, -0.085, 0.295), e=0.62),
    # 2:1, like the koala's face layout (512 x 256)
    'screen': dict(radii=(0.064, 0.018, 0.028), center=(0, -0.172, 0.305), bezel=0.006),
    'nose': dict(radii=(0.034, 0.02, 0.044), center=(0, -0.188, 0.262)),
    'ear': dict(x=0.1, y=-0.07, z=0.36, r=0.058, splay=0.3),
    'front': dict(x=0.088, hip=(-0.06, 0.155), knee=(-0.075, 0.095), ankle=(-0.075, 0.036)),
    'back': dict(x=0.088, hip=(0.1, 0.135), knee=(0.112, 0.085), ankle=(0.108, 0.036)),
    'tail': dict(r=0.022, center=(0, 0.13, 0.075)),
    'leaf': dict(r=0.07, center=(0, -0.205, 0.225)),
}


def rig_bones():
    e, f, b = D['ear'], D['front'], D['back']
    bones = fk.standard_bones(hips=(0, b['hip'][0], 0.15), chest=(0, -0.06, 0.17), neck=(0, -0.07, 0.23),
                              head_top=(0, -0.085, 0.395))
    bones.append(('tail.1', (0, 0.115, 0.075), (0, 0.15, 0.08), 'body'))
    lf = D['leaf']['center']
    bones.append(('toy', lf, (lf[0], lf[1] - 0.02, lf[2]), 'head'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.85, e['y'], e['z'] - 0.035), (side * e['x'] * 1.2, e['y'], e['z'] + 0.04), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['ankle'][0], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['hip'][0], b['hip'][1]), (side * b['x'], b['ankle'][0], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035

    # Body: a stocky pod with a belt seam, a pale belly plate with a round lamp in it.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(36, 26))
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.185, n=64), 'body', seam)
    bl = D['belly']
    pod('Belly', bl['radii'], bl['center'], m['role']('Belly'), 'body', e=0.35, e2=1.0, seg=(32, 8), rot=(math.pi / 2, 0, 0))
    R.add(kit.torus('BellyRim', bl['radii'][0] + 0.004, 0.0048, seg=(36, 6),
                    location=(0, bl['center'][1] - 0.004, bl['center'][2]), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    lp = D['lamp']
    R.puck('Lamp', lp['r'], 0.007, lp['center'], m['dot'](1), 'body', rot=(math.pi / 2, 0, 0), seg=(24, 6))
    R.add(kit.torus('LampRing', lp['r'] + 0.004, 0.0035, seg=(24, 6), location=(lp['center'][0], lp['center'][1] - 0.001, lp['center'][2]),
                    rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        R.stud(f'BellyScrew.{i}', (bl['radii'][0] * math.cos(a), bl['center'][1] - 0.012, bl['center'][2] + bl['radii'][0] * 1.05 * math.sin(a)), 0.0045)
    R.pod('Hatch', (0.05, 0.01, 0.05), (0, 0.128, 0.16), m['bezel'], 'body', e=0.3, seg=(24, 18))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.032, 0.137, 0.16 + sz * 0.034), 0.005)
    t = D['tail']
    R.ball('Tail', t['r'], t['center'], m['role']('Belly'), 'tail.1')

    # Head: a big round box, the small screen, the big oval nose plate.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(40, 28))
    sc = D['screen']
    R.screen('Koala', sc['radii'], sc['center'], sc['bezel'])
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose'), 'head', e=0.7, seg=(28, 18))
    pod('NoseShine', (0.009, 0.004, 0.016), (-0.01, n['center'][1] - n['radii'][1] * 0.9, n['center'][2] + 0.015), m['joint'], 'head',
        e=0.7, seg=(12, 8))
    R.seam('Philtrum', [(0, n['center'][1] - 0.012, n['center'][2] - n['radii'][2] * 0.95), (0, n['center'][1] + 0.0, n['center'][2] - 0.065)],
           'head', seam)
    R.seam('CrownSeam', [(0, -0.085 - 0.096 * math.cos(math.radians(a)) * 0.97, 0.295 + 0.092 * math.sin(math.radians(a)) * 1.01)
                         for a in range(45, 150, 8)], 'head', seam)
    for side in (-1, 1):
        for j, dz in enumerate((0.012, 0.0, -0.012)):
            R.stud(f'Whisker.{side}.{j}', (side * 0.07, -0.172, 0.25 + dz), 0.003, 'head')

    # Ears: big poms with a pale inside, a green glow in the middle of each, a hinge ball.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        at = (side * e['x'], e['y'], e['z'])
        pod(f'Ear.{sfx}', (e['r'], e['r'] * 0.7, e['r']), at, m['shell'], bone, e=0.85, seg=(26, 18))
        pod(f'EarIn.{sfx}', (e['r'] * 0.72, 0.014, e['r'] * 0.72), (at[0], at[1] - e['r'] * 0.62, at[2]), m['role']('Ear'), bone,
            e=0.5, e2=0.9, seg=(24, 8), rot=(0, 0, 0))
        R.puck(f'EarLight.{sfx}', 0.02, 0.006, (at[0], at[1] - e['r'] * 0.62 - 0.012, at[2]), m['dot'](0), bone, rot=(math.pi / 2, 0, 0), seg=(20, 6))
        R.ball(f'EarHinge.{sfx}', 0.012, (side * e['x'] * 0.8, e['y'] + 0.01, e['z'] - 0.045), m['joint'], bone, seg=(14, 10))

    # Arms and legs: long and strong, for clinging; paws with dark pads.
    f, bk = D['front'], D['back']
    pad = m['role']('Pad')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        R.leg(f'F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['knee'][0], f['knee'][1]),
              (side * f['x'], f['ankle'][0], f['ankle'][1]), 0.028, f'leg.F{sfx}',
              dict(radii=(0.036, 0.046, 0.02), center=(side * f['x'], f['ankle'][0] - 0.012, 0.02)), pad=pad, toes=3)
        R.leg(f'B{sfx}', (side * bk['x'], bk['hip'][0], bk['hip'][1]), (side * bk['x'], bk['knee'][0], bk['knee'][1]),
              (side * bk['x'], bk['ankle'][0], bk['ankle'][1]), 0.03, f'leg.B{sfx}',
              dict(radii=(0.036, 0.046, 0.02), center=(side * bk['x'], bk['ankle'][0] - 0.01, 0.02)), pad=pad, toes=3)

    # The eucalyptus leaf: a long thin pod with a rib, in front of his mouth, on the toy bone.
    lf = D['leaf']
    cx, cy, cz = lf['center']
    pod('Leaf', (lf['r'], 0.005, 0.026), (cx, cy, cz), m['role']('Leaf', 'joint'), 'toy', e=0.7, e2=1.0, seg=(24, 10), rot=(0, 0, 0))
    R.tube('LeafRib', [(cx - lf['r'] * 0.9, cy - 0.006, cz), (cx + lf['r'] * 0.9, cy - 0.006, cz)], 0.0028, m['joint'], 'toy', ring=6)

    return R.finish('KoalaRig', rig_bones())
