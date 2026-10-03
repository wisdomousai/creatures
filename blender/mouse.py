"""Crumb, the crew's robot mouse: a tiny round grey toy with two big round dish ears that light up
inside (Dot0), a pink button nose, three little lit whisker rods a side (Dot1), big back feet, and a long
thin tail of small segments on five bones with a light on the tip (Dot2). A wedge of cheese (`toy`,
with holes in it) is kept in the model for nibbling and put away otherwise. Faces -Y like the rest of
the crew; about 0.21 m to the ear tops.
"""

import math

from mathutils import Vector

import kit
import fluffkit as fk

FACE = 'mouse'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'body': dict(radii=(0.055, 0.07, 0.056), center=(0, 0.02, 0.07), e=0.85),
    'head': dict(radii=(0.056, 0.05, 0.047), center=(0, -0.06, 0.118), e=0.7),
    # 2:1, like the mouse's face layout (512 x 256)
    'screen': dict(radii=(0.037, 0.012, 0.018), center=(0, -0.104, 0.128), bezel=0.004),
    'muzzle': dict(radii=(0.022, 0.02, 0.017), center=(0, -0.108, 0.098)),
    'nose': dict(r=0.009, center=(0, -0.13, 0.102)),
    'ear': dict(x=0.062, y=-0.045, z=0.168, r=0.042, splay=0.55),
    'front': dict(x=0.04, hip=(-0.035, 0.072), ankle=(-0.04, 0.018)),
    'back': dict(x=0.045, hip=(0.065, 0.07), ankle=(0.07, 0.016)),
    'tail': [(0, 0.085, 0.05), (0, 0.13, 0.035), (0, 0.175, 0.032), (0, 0.215, 0.045), (0, 0.245, 0.07), (0, 0.255, 0.1)],
    'cheese': dict(r=0.034, half=0.016, center=(0, -0.1, 0.016)),
}


def rig_bones():
    e, f, b = D['ear'], D['front'], D['back']
    bones = fk.standard_bones(hips=(0, b['hip'][0], 0.075), chest=(0, -0.05, 0.09), neck=(0, -0.045, 0.1),
                              head_top=(0, -0.06, 0.17))
    pts = D['tail']
    parent = 'body'
    for i in range(5):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    c = D['cheese']['center']
    bones.append(('toy', c, (c[0], c[1], c[2] + 0.03), 'root'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * 0.045, e['y'], e['z'] - 0.035), (side * e['x'], e['y'], e['z'] + 0.02), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['ankle'][0], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['hip'][0], b['hip'][1]), (side * b['x'], b['ankle'][0], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0025
    pink = m['role']('Pink', 'joint')

    # Body: a round pod with a belt seam, a pale belly plate and a hatch behind.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(32, 22))
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.095, n=64), 'body', seam)
    pod('Belly', (0.036, 0.022, 0.04), (0, -0.045, 0.062), m['role']('Belly'), 'body', e=0.5, e2=0.8, seg=(24, 14), rot=(math.pi / 2, 0, 0))
    R.pod('Hatch', (0.026, 0.006, 0.026), (0, 0.089, 0.08), m['bezel'], 'body', e=0.3, seg=(20, 14))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.017, 0.094, 0.08 + sz * 0.017), 0.003)

    # Head: a small round pod, the screen, a pale muzzle, a pink nose button, whisker rods.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(34, 24))
    sc = D['screen']
    R.screen('Mouse', sc['radii'], sc['center'], sc['bezel'])
    mz = D['muzzle']
    pod('Muzzle', mz['radii'], mz['center'], m['role']('Belly'), 'head', e=0.6, seg=(22, 14))
    n = D['nose']
    R.ball('Nose', n['r'], n['center'], pink, 'head', seg=(16, 12))
    for side in (-1, 1):
        for j, dz in enumerate((0.01, 0.0, -0.01)):
            R.add(kit.tube(f'Whisker.{side}.{j}', [(side * 0.022, -0.118, 0.1 + dz * 0.5), (side * 0.078, -0.104, 0.1 + dz * 3.2)], 0.0015, ring=6)[0],
                  m['dot'](1), 'head')
    R.seam('CrownSeam', [(0, -0.06 - 0.05 * math.cos(math.radians(a)) * 0.97, 0.118 + 0.047 * math.sin(math.radians(a)) * 1.01)
                         for a in range(45, 150, 8)], 'head', seam)

    # Ears: big round dishes on hinges, a lit disc inside each.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        rot = (math.pi / 2, 0, side * e['splay'])
        nrm = Vector((side * math.sin(e['splay']), -math.cos(e['splay']), 0))
        at = Vector((side * e['x'], e['y'], e['z']))
        R.puck(f'Ear.{sfx}', e['r'], 0.0075, tuple(at), m['shell'], bone, rot=rot, seg=(32, 8), e=0.45)
        R.puck(f'EarIn.{sfx}', e['r'] * 0.68, 0.004, tuple(at + nrm * 0.0075), m['dot'](0), bone, rot=rot, seg=(28, 6), e=0.4)
        R.add(kit.torus(f'EarRim.{sfx}', e['r'] * 0.98, 0.0035, seg=(32, 6), location=tuple(at), rotation=rot), m['joint'], bone)
        R.ball(f'EarHinge.{sfx}', 0.0085, (side * 0.046, e['y'] + 0.004, e['z'] - 0.036), m['joint'], bone, seg=(12, 8))

    # Legs: short stubs, little hands, big back feet.
    f, bk = D['front'], D['back']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        R.leg(f'F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), None, (side * f['x'], f['ankle'][0], f['ankle'][1]), 0.0105, f'leg.F{sfx}',
              dict(radii=(0.0125, 0.017, 0.008), center=(side * f['x'], f['ankle'][0] - 0.008, 0.009)), shell=pink, pad=m['role']('Pad'), toes=3)
        R.leg(f'B{sfx}', (side * bk['x'], bk['hip'][0], bk['hip'][1]), None, (side * bk['x'], bk['ankle'][0], bk['ankle'][1]), 0.012, f'leg.B{sfx}',
              dict(radii=(0.014, 0.027, 0.008), center=(side * bk['x'], bk['ankle'][0] - 0.012, 0.009)), shell=pink, pad=m['role']('Pad'), toes=3)

    # Tail: a long thin chain of small segments, a light on the tip.
    pts = [Vector(p) for p in D['tail']]
    k = 0
    for i in range(5):
        a_, b_ = pts[i], pts[i + 1]
        rot = tuple((b_ - a_).to_track_quat('Z', 'Y').to_euler())
        length = (b_ - a_).length
        for j in range(2):
            f0 = (j + 0.5) / 2
            c = a_.lerp(b_, f0)
            r = 0.0075 - 0.0012 * (i + f0)
            mat = pink if (k % 2) else m['shell']
            R.pod(f'Tail.{k}', (r, r, length * 0.26), tuple(c), mat, f'tail.{i + 1}', e=0.8, seg=(14, 10), rot=rot)
            k += 1
    R.ball('TailHub', 0.015, tuple(pts[0] - Vector((0, 0.006, 0))), m['joint'], 'body', seg=(14, 10))
    R.ball('TailLamp', 0.0085, tuple(pts[5] + (pts[5] - pts[4]).normalized() * 0.008), m['dot'](2), 'tail.5', seg=(14, 10))

    # The cheese: a wedge with holes in it, on its own bone.
    ch = D['cheese']
    wedge = kit.superellipsoid('Cheese', (ch['r'], ch['r'], ch['half']), 0.3, 1.0, seg=(32, 6), location=ch['center'])
    kit.cut(wedge, (0.0, -1.0, 0.0), 0.0)
    kit.cut(wedge, (0.8, 0.6, 0.0), -0.0)
    wedge.data.transform(__import__('mathutils').Matrix.Translation((-0.02, 0.008, 0.0)))
    wedge.data.update()
    R.add(wedge, m['role']('Cheese'), 'toy')
    for j, (dx, dy, dz) in enumerate(((0.012, -0.004, 0.0), (0.02, -0.014, 0.0), (0.006, -0.019, 0.0))):
        R.add(kit.superellipsoid(f'Hole.{j}', (0.0042, 0.0042, 0.0042), seg=(10, 8),
                                 location=(ch['center'][0] + dx - 0.024, ch['center'][1] + dy + 0.008, ch['center'][2] + ch['half'] - 0.001)),
              m['role']('Hole', 'joint'), 'toy')

    return _finish(R)


def _finish(R):
    import looks
    return looks.finish(kit.armature('MouseRig', rig_bones()), R.parts, R.skin, R.m, outline=0.0017)
