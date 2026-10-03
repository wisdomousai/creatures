"""Stump, the crew's robot beaver: a round brown toy robot with a pale belly plate, two big lit front
teeth under a pale muzzle (Dot0), small round ears, stubby hands with four toes, big flat back feet
with a web between the toes, and a flat paddle tail (on two bones, `tail.1` a stub and `tail.2` the
paddle) crosshatched with lit grooves (Dot1). A little log (`toy`, with a pointed end it has been
gnawed to) is kept in the model for gnawing and a flash on the floor (`flash`, Dot2) for the tail
slap, both put away otherwise. Faces -Y like the rest of the crew; about 0.33 m to the ear tops.
"""

import math

from mathutils import Vector

import kit
import fluffkit as fk

FACE = 'beaver'
PREVIEW = dict(lift=0.0, width=0.75)

D = {
    'body': dict(radii=(0.118, 0.13, 0.108), center=(0, 0.035, 0.14), e=0.82),
    'belly': dict(radii=(0.07, 0.05, 0.07), center=(0, -0.07, 0.125)),
    'head': dict(radii=(0.122, 0.096, 0.094), center=(0, -0.11, 0.232), e=0.66),
    # 2:1, like the beaver's face layout (512 x 256)
    'screen': dict(radii=(0.07, 0.02, 0.034), center=(0, -0.19, 0.245), bezel=0.007),
    'muzzle': dict(radii=(0.058, 0.04, 0.036), center=(0, -0.196, 0.196)),
    'nose': dict(radii=(0.02, 0.012, 0.014), center=(0, -0.232, 0.208)),
    'tooth': dict(radii=(0.0125, 0.007, 0.022), x=0.0125, center=(0, -0.222, 0.158)),
    'ear': dict(x=0.088, y=-0.09, z=0.305, r=0.03),
    'front': dict(x=0.078, hip=(-0.055, 0.13), knee=(-0.062, 0.08), ankle=(-0.066, 0.032)),
    'back': dict(x=0.088, hip=(0.12, 0.13), knee=(0.13, 0.08), ankle=(0.126, 0.03)),
    'tail': [(0, 0.15, 0.1), (0, 0.235, 0.085), (0, 0.4, 0.062)],
    'paddle': dict(radii=(0.075, 0.095, 0.014), center=(0, 0.33, 0.066)),
    'log': dict(r=0.024, half=0.07, center=(0, -0.22, 0.08)),
    'flash': dict(r=0.07, center=(0, 0.42, 0.0)),
}


def rig_bones():
    e, f, b = D['ear'], D['front'], D['back']
    bones = fk.standard_bones(hips=(0, b['hip'][0], 0.14), chest=(0, -0.08, 0.17), neck=(0, -0.09, 0.19),
                              head_top=(0, -0.11, 0.33))
    pts = D['tail']
    bones.append(('tail.1', pts[0], pts[1], 'body'))
    bones.append(('tail.2', pts[1], pts[2], 'tail.1'))
    lg = D['log']['center']
    bones.append(('toy', lg, (lg[0], lg[1], lg[2] + 0.04), 'root'))
    fl = D['flash']['center']
    bones.append(('flash', (fl[0], fl[1], 0.01), (fl[0], fl[1], 0.04), 'root'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - 0.03), (side * e['x'] * 1.15, e['y'], e['z'] + 0.04), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['ankle'][0], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['hip'][0], b['hip'][1]), (side * b['x'], b['ankle'][0], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035
    dark = m['role']('Dark', 'joint')
    pale = m['role']('Belly')

    # Body: a round pod, a belt seam, a pale belly plate with a rim and studs.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(36, 24))
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.165, n=72), 'body', seam)
    bl = D['belly']
    pod('Belly', bl['radii'], bl['center'], pale, 'body', e=0.5, e2=0.8, seg=(28, 16), rot=(math.pi / 2, 0, 0))
    R.add(kit.torus('BellyRim', bl['radii'][0] + 0.004, 0.0045, seg=(32, 6),
                    location=(0, bl['center'][1] - 0.004, bl['center'][2]), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        R.stud(f'BellyScrew.{i}', (bl['radii'][0] * math.cos(a), bl['center'][1] - 0.012,
                                   bl['center'][2] + bl['radii'][2] * math.sin(a)), 0.0042)
    R.pod('Hatch', (0.045, 0.01, 0.045), (0, 0.162, 0.16), m['bezel'], 'body', e=0.3, seg=(24, 18))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.03, 0.17, 0.16 + sz * 0.03), 0.005)

    # Head: a wide rounded box, the screen, a pale muzzle with a dark nose and two big lit teeth.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(38, 26))
    sc = D['screen']
    R.screen('Beaver', sc['radii'], sc['center'], sc['bezel'])
    mz = D['muzzle']
    pod('Muzzle', mz['radii'], mz['center'], pale, 'head', e=0.6, seg=(26, 16))
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose', 'bezel'), 'head', e=0.6, seg=(20, 12))
    t = D['tooth']
    for side in (-1, 1):
        pod(f'Tooth.{side}', t['radii'], (side * t['x'], t['center'][1], t['center'][2]), m['dot'](0), 'head', e=0.4, e2=0.5,
            seg=(16, 12))
        R.seam(f'Whisker.{side}', [(side * 0.035, -0.228, 0.19), (side * 0.07, -0.222, 0.182)], 'head', 0.0028)
    R.seam('ToothSeam', [(0, -0.2285, 0.18), (0, -0.2285, 0.136)], 'head', 0.0022, 'bezel')
    R.seam('CrownSeam', [(0, -0.11 - 0.096 * math.cos(math.radians(a)) * 0.97, 0.232 + 0.094 * math.sin(math.radians(a)) * 1.01)
                         for a in range(45, 150, 8)], 'head', seam)

    # Ears: small round pods on hinges.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        at = (side * e['x'], e['y'], e['z'])
        pod(f'Ear.{sfx}', (e['r'], e['r'] * 0.6, e['r']), at, dark, bone, e=0.85, seg=(20, 14))
        R.ball(f'EarHinge.{sfx}', 0.01, (side * e['x'] * 0.82, e['y'] + 0.006, e['z'] - 0.028), m['joint'], bone, seg=(14, 10))

    # Legs: stubby hands, and big flat back feet with a web.
    f, bk = D['front'], D['back']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        R.leg(f'F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['knee'][0], f['knee'][1]),
              (side * f['x'], f['ankle'][0], f['ankle'][1]), 0.022, f'leg.F{sfx}',
              dict(radii=(0.028, 0.034, 0.016), center=(side * f['x'], f['ankle'][0] - 0.01, 0.018)), shell=dark,
              pad=m['role']('Pad'), toes=4)
        R.leg(f'B{sfx}', (side * bk['x'], bk['hip'][0], bk['hip'][1]), (side * bk['x'], bk['knee'][0], bk['knee'][1]),
              (side * bk['x'], bk['ankle'][0], bk['ankle'][1]), 0.026, f'leg.B{sfx}',
              dict(radii=(0.036, 0.05, 0.014), center=(side * bk['x'], bk['ankle'][0] - 0.02, 0.016)), shell=dark,
              pad=m['role']('Pad'), toes=0)
        # the web: a broad flat fan in front of the foot, three ribs across it
        pod(f'Web.{sfx}', (0.046, 0.03, 0.006), (side * bk['x'], bk['ankle'][0] - 0.062, 0.008), m['role']('Pad'), f'leg.B{sfx}', e=0.4,
            e2=0.7, seg=(20, 8))
        for j in (-1, 0, 1):
            R.pod(f'Toe.{sfx}.{j}', (0.011, 0.014, 0.009), (side * bk['x'] + j * 0.027, bk['ankle'][0] - 0.074, 0.011),
                  dark, f'leg.B{sfx}', seg=(12, 8))
        pod(f'Haunch.{sfx}', (0.034, 0.062, 0.06), (side * 0.104, 0.12, 0.14), m['shell'], f'leg.B{sfx}', e=0.7, seg=(20, 14))
        pod(f'Shoulder.{sfx}', (0.028, 0.048, 0.052), (side * 0.1, -0.055, 0.15), m['shell'], f'leg.F{sfx}', e=0.7, seg=(20, 14))

    # Tail: a stub and a flat paddle crosshatched with lit grooves.
    pts = [Vector(p) for p in D['tail']]
    R.tube('TailStub', [pts[0], pts[1]], 0.026, dark, 'tail.1', ring=12)
    R.ball('TailHub', 0.034, tuple(pts[0] - Vector((0, 0.01, 0))), m['joint'], 'body')
    pd = D['paddle']
    cx, cy, cz = pd['center']
    rx, ry, rz = pd['radii']
    pod('Paddle', pd['radii'], pd['center'], dark, 'tail.2', e=0.45, e2=0.7, seg=(30, 14), rot=(0.0, 0, 0))
    top = cz + rz * 0.98
    # grooves: two sets of diagonals, each clipped to stay inside an ellipse on the paddle's face
    ex, ey = rx * 0.8, ry * 0.8
    for k in range(-3, 4):
        u = k * 0.026
        for sgn in (-1, 1):
            inside = [t / 1000 for t in range(-200, 201, 4)
                      if ((u + sgn * 0.55 * t / 1000 * 1.0) / ex) ** 2 + (t / 1000 / ey) ** 2 <= 1.0]
            if len(inside) < 4:
                continue
            t0, t1 = inside[0], inside[-1]
            a = (cx + u + sgn * 0.55 * t0, cy + t0, top)
            b2 = (cx + u + sgn * 0.55 * t1, cy + t1, top)
            R.add(kit.tube(f'Groove.{k}.{sgn}', [a, b2], 0.0022, ring=6)[0], m['dot'](1), 'tail.2')
    rim = kit.torus('PaddleRim', rx * 0.86, 0.003, seg=(36, 6), location=(cx, cy, cz + rz * 0.9))
    rim.data.transform(__import__('mathutils').Matrix.Diagonal((1.0, ry / rx, 1.0, 1.0)))
    rim.data.update()
    R.add(rim, m['bezel'], 'tail.2')

    # The log: a little round log on its own bone, one end gnawed to a point.
    lg = D['log']
    R.pod('Log', (lg['r'], lg['r'], lg['half']), lg['center'], m['role']('Log', 'joint'), 'toy', e=0.6, seg=(20, 12), rot=(0, math.pi / 2, 0))
    R.pod('LogPoint', (lg['r'] * 0.7, lg['r'] * 0.7, 0.022), (lg['center'][0] + lg['half'] + 0.012, lg['center'][1], lg['center'][2]),
          m['role']('Wood', 'shell'), 'toy', e=0.9, seg=(14, 10), rot=(0, math.pi / 2, 0), taper=0.8)
    for sx in (-1, 0.1):
        R.add(kit.torus(f'LogRing.{sx}', lg['r'] * 1.02, 0.0028, seg=(18, 6),
                        location=(lg['center'][0] + sx * lg['half'] * 0.7, lg['center'][1], lg['center'][2]),
                        rotation=(0, math.pi / 2, 0)), m['bezel'], 'toy')

    # The flash on the floor where the paddle slaps: a lit ring and disc, on its own bone.
    fl = D['flash']
    R.puck('Flash', fl['r'] * 0.55, 0.002, (fl['center'][0], fl['center'][1], 0.006), m['dot'](2), 'flash', seg=(28, 6), e=0.3)
    R.add(kit.torus('FlashRing', fl['r'], 0.004, seg=(32, 6), location=(fl['center'][0], fl['center'][1], 0.006)), m['dot'](2), 'flash')

    return R.finish('BeaverRig', rig_bones())
