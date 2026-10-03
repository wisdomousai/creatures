"""Dusty, the crew's robot chinchilla: a plush grey toy robot with two huge round dish ears
(plates on hinges, each with a pink inner dish and a lit rim), a round body with a cream
belly plate, a screen face with big dark eyes, a button nose, long hind legs on big flat feet
and a long tail of stacked rings on four bones, three of them lit.

Lights: the dish rims (Dot0, both ears), the tail rings (Dot1..Dot3, root to tip) and the
dust (Dot4: five soft pods on bones `puff.1..5` that come out for a dust bath and are put
away otherwise). Faces -Y like the rest of the crew; about 0.4 m to the ear tops.
"""

import math

from mathutils import Vector

import kit
import fluffkit as fk
from fluffkit import mirror

FACE = 'chinchilla'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.098, 0.12, 0.105), center=(0, 0.02, 0.14), e=0.8, taper=0.12),
    'belly': dict(radii=(0.058, 0.074, 0.014), center=(0, -0.092, 0.125)),
    'head': dict(radii=(0.102, 0.09, 0.088), center=(0, -0.088, 0.232), e=0.62),
    # 2:1, like the chinchilla's face layout (512 x 256)
    'screen': dict(radii=(0.074, 0.02, 0.037), center=(0, -0.168, 0.245), bezel=0.007),
    'nose': dict(radii=(0.016, 0.01, 0.012), center=(0, -0.18, 0.214)),
    # The dish ears: big discs on edge, splayed out, a pink dish inside and a lit rim.
    'ear': dict(x=0.082, y=-0.062, z=0.335, r=0.074, half=0.011, splay=0.42, inner=0.054),
    'arm': dict(x=0.058, hip=(-0.07, 0.115), ankle=(-0.098, 0.03), r=0.014),
    'hip': dict(x=0.08, y=0.075, z=0.115),
    'knee': dict(x=0.092, y=0.06, z=0.068),
    'ankle': dict(x=0.082, y=0.05, z=0.03),
    'foot': dict(radii=(0.03, 0.056, 0.02), center=(0.082, 0.02, 0.02)),
    'tail': [(0, 0.12, 0.15), (0, 0.2, 0.16), (0, 0.27, 0.2), (0, 0.31, 0.26), (0, 0.325, 0.33)],
    'rings': 7,
}
PUFFS = [(-0.1, -0.09, 0.07), (0.1, -0.08, 0.06), (0.0, -0.17, 0.05), (-0.05, 0.14, 0.1), (0.07, 0.12, 0.12)]


def tail_pts():
    return kit.spline(D['tail'], D['rings'] + 1)


def rig_bones():
    e, h, a = D['ear'], D['hip'], D['arm']
    bones = fk.standard_bones(hips=(0, h['y'], h['z']), chest=(0, -0.07, 0.15), neck=(0, -0.07, 0.19),
                              head_top=(0, -0.085, 0.32))
    pts = tail_pts()
    bones.append(('tail.1', tuple(pts[0]), tuple(pts[2]), 'body'))
    bones.append(('tail.2', tuple(pts[2]), tuple(pts[4]), 'tail.1'))
    bones.append(('tail.3', tuple(pts[4]), tuple(pts[6]), 'tail.2'))
    bones.append(('tail.4', tuple(pts[6]), tuple(pts[7]), 'tail.3'))
    for i, (x, y, z) in enumerate(PUFFS):
        bones.append((f'puff.{i + 1}', (x, y, z), (x, y - 0.01, z), 'root'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - e['r'] * 0.8),
                      (side * e['x'] * 1.3, e['y'], e['z'] + e['r'] * 0.5), 'head'))
        bones.append((f'leg.F{sfx}', (side * a['x'], a['hip'][0], a['hip'][1]), (side * a['x'], a['ankle'][0], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * h['x'], h['y'], h['z']), (side * h['x'], h['y'] - 0.03, 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035

    # Body: a plump pear with a belt seam, a cream belly plate in a rim.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], taper=b['taper'], seg=(40, 28))
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.175, taper=b['taper'], n=64), 'body', seam)
    bl = D['belly']
    pod('Belly', bl['radii'], bl['center'], m['role']('Belly'), 'body', e=0.35, e2=1.0, seg=(32, 8),
        rot=(math.pi / 2, 0, 0))
    R.add(kit.torus('BellyRim', bl['radii'][0] + 0.004, 0.0048, seg=(36, 6),
                    location=(0, bl['center'][1] - 0.004, bl['center'][2]), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        R.stud(f'BellyScrew.{i}', (bl['radii'][0] * math.cos(a), bl['center'][1] - 0.012, bl['center'][2] + bl['radii'][0] * 1.1 * math.sin(a)), 0.0045)
    R.pod('Hatch', (0.045, 0.01, 0.05), (0, 0.14, 0.15), m['bezel'], 'body', e=0.3, seg=(24, 18))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.03, 0.149, 0.15 + sz * 0.034), 0.0052)

    # Head: a round box, the screen, a button nose, whisker studs.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(44, 30))
    sc = D['screen']
    R.screen('Chinchilla', sc['radii'], sc['center'], sc['bezel'])
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose', 'bezel'), 'head', e=0.6, seg=(20, 12))
    for side in (-1, 1):
        for j, (dz, dx) in enumerate(((0.012, 0.03), (0.0, 0.038), (-0.012, 0.03))):
            R.stud(f'Whisker.{side}.{j}', (side * (0.035 + dx * 0.5), -0.172, 0.2 + dz), 0.0035, 'head')
    R.seam('CrownSeam', [(0, -0.088 - 0.09 * math.cos(math.radians(a)) * 0.97, 0.232 + 0.088 * math.sin(math.radians(a)) * 1.01)
                         for a in range(40, 150, 8)], 'head', seam)

    # Ears: big dishes, a pink inner dish, a lit rim round it, screws, a hinge ball.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        rot = (math.pi / 2, side * e['splay'], 0)
        at = (side * e['x'], e['y'], e['z'])
        R.puck(f'Ear.{sfx}', e['r'], e['half'], at, m['shell'], bone, rot=rot, seg=(40, 8))
        front = fk.Vector((0, -e['half'] * 0.9, 0))
        front.rotate(fk.Euler(rot))
        fa = (at[0] + front.x, at[1] + front.y, at[2] + front.z)
        R.puck(f'EarDish.{sfx}', e['inner'], e['half'] * 0.55, fa, m['role']('Dish', 'joint'), bone, rot=rot, seg=(32, 6))
        rim = fk.Vector((0, -e['half'] * 1.6, 0))
        rim.rotate(fk.Euler(rot))
        R.add(kit.torus(f'EarLight.{sfx}', e['inner'] + 0.008, 0.0042, seg=(40, 6),
                        location=(at[0] + rim.x, at[1] + rim.y, at[2] + rim.z), rotation=rot), m['dot'](0), bone)
        for j in range(4):
            ang = math.pi / 4 + j * math.pi / 2
            v = fk.Vector((0.064 * math.cos(ang), 0.064 * math.sin(ang), -e['half'] * 1.0))
            v.rotate(fk.Euler(rot))
            R.stud(f'EarScrew.{sfx}.{j}', (at[0] + v.x, at[1] + v.y, at[2] + v.z), 0.0042, bone, face=rot)
        R.ball(f'EarHinge.{sfx}', 0.012, (side * e['x'] * 0.85, e['y'] + 0.006, e['z'] - e['r'] * 0.86), m['joint'], bone, seg=(14, 10))

    # Arms and hind legs.
    a, hp, kn, an, ft = D['arm'], D['hip'], D['knee'], D['ankle'], D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        R.leg(f'F{sfx}', (side * a['x'], a['hip'][0], a['hip'][1]), None,
              (side * a['x'], a['ankle'][0], a['ankle'][1] + 0.01), a['r'], f'leg.F{sfx}',
              dict(radii=(0.02, 0.026, 0.014), center=(side * a['x'], a['ankle'][0] - 0.005, 0.016)),
              toes=3)
        R.leg(f'B{sfx}', (side * hp['x'], hp['y'], hp['z']), (side * kn['x'], kn['y'], kn['z']),
              (side * an['x'], an['y'], an['z']), 0.02, f'leg.B{sfx}',
              dict(radii=ft['radii'], center=mirror(ft['center'], side)), toes=3)
        R.puck(f'HipDisc.{sfx}', 0.046, 0.014, (side * (hp['x'] + 0.014), hp['y'], hp['z']), m['shell'], f'leg.B{sfx}',
               rot=(0, math.pi / 2, 0), seg=(28, 8))
        R.puck(f'HipHub.{sfx}', 0.02, 0.01, (side * (hp['x'] + 0.027), hp['y'], hp['z']), m['joint'], f'leg.B{sfx}',
               rot=(0, math.pi / 2, 0), seg=(18, 6))

    # Tail: a chain of rings (flat discs on the path), the lit ones banded. One bone per two rings.
    pts = tail_pts()
    k = D['rings']
    bone_of = ['tail.1', 'tail.1', 'tail.2', 'tail.2', 'tail.3', 'tail.3', 'tail.4']
    for i in range(k):
        t = i / (k - 1)
        r = 0.052 - 0.02 * t
        a_, b_ = Vector(pts[i]), Vector(pts[i + 1])
        c = a_.lerp(b_, 0.0) if i < k else a_
        nxt = Vector(pts[min(i + 1, k)])
        prv = Vector(pts[max(i - 1, 0)])
        rot = tuple((nxt - prv).to_track_quat('Z', 'Y').to_euler())
        R.pod(f'TailRing.{i}', (r, r, 0.0235), tuple(c), m['role']('Ring') if i % 2 else m['shell'], bone_of[i], e=0.5, e2=1.0,
              seg=(26, 10), rot=rot)
        if i in (2, 4, 6):
            dot = {2: 1, 4: 2, 6: 3}[i]
            R.add(kit.torus(f'TailBand.{i}', r * 1.04, 0.0055, seg=(26, 6), location=tuple(c), rotation=rot), m['dot'](dot), bone_of[i])
    R.ball('TailHub', 0.03, tuple(Vector(pts[0]) - Vector((0, 0.01, 0))), m['joint'], 'body')

    # Dust: soft pods round him for the dust bath (lit, Dot4), on bones of their own.
    for i, (x, y, z) in enumerate(PUFFS):
        R.pod(f'Puff.{i + 1}', (0.04, 0.04, 0.032), (x, y, z), m['dot'](4), f'puff.{i + 1}', e=0.85, seg=(16, 12))

    return R.finish('ChinchillaRig', rig_bones())
