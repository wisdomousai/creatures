"""Mellow, the crew's robot capybara: the calmest crewmate. A big barrel of a body (a long
rounded box, the widest and heaviest of the fluffy crew), a blunt square head with a screen set
high up (the eyes sit high on a capybara's face), a big dark snout plate under it, two small
round ears on top and four short legs on ball joints with flat three-toed paws.

Lights: two round flank lamps like portholes (Dot0, they breathe slowly), a lit orange (Dot1,
the signature) kept in the model on a bone of its own (`toy`) for the zen sit, a pool of light
(Dot2, a tub of it on the floor, `pool`) with three rings of steam above it (`steam.1..3`) for
the warm bath, and a tiny robot bird (`bird`, with `bwing.L/R`) that comes to sit on the orange.
A reed (`reed`) sticks out of the snout for the slow chew. Faces -Y like the rest of the crew;
about 0.36 m to the top of the head.
"""

import math

import kit
import fluffkit as fk

FACE = 'capybara'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    # A heavy barrel, longer than tall, the rump a touch higher than the shoulders (tilted).
    'body': dict(radii=(0.13, 0.23, 0.125), center=(0, 0.09, 0.17), e=0.5, e2=0.8, tilt=0.08),
    # The head is a long flat-topped brick; the screen sits high on its front face.
    'head': dict(radii=(0.088, 0.075, 0.068), center=(0, -0.17, 0.255), e=0.3),
    # 2.24:1, like the capybara's face layout (448 x 200)
    'screen': dict(radii=(0.07, 0.018, 0.0313), center=(0, -0.247, 0.288), bezel=0.006),
    # The muzzle: a square, flat-fronted block under the screen that sticks out in front of it.
    'nose': dict(radii=(0.07, 0.03, 0.04), center=(0, -0.255, 0.215), e=0.3),
    # Tiny round nubs at the top-back corners.
    'ear': dict(x=0.074, y=-0.12, z=0.322, r=0.017, half=0.008, splay=0.35),
    'front': dict(x=0.09, y=-0.075, top=0.115, bottom=0.03),
    'back': dict(x=0.094, y=0.22, top=0.115, bottom=0.03),
    'orange': dict(r=0.034, center=(0, -0.165, 0.352)),
    'pool': dict(radii=(0.2, 0.29, 0.1), center=(0, 0.03, 0.0)),
    'reed': dict(start=(0, -0.283, 0.2), end=(0, -0.343, 0.2)),
}
STEAM = [(0.0, -0.22, 0.34), (0.03, -0.19, 0.44), (-0.03, -0.17, 0.54)]
BIRD = dict(center=(0, -0.165, 0.425))


def rig_bones():
    f, b, o = D['front'], D['back'], D['orange']
    e = D['ear']
    bones = fk.standard_bones(hips=(0, 0.21, 0.17), chest=(0, -0.07, 0.17), neck=(0, -0.11, 0.2),
                              head_top=(0, -0.17, 0.325))
    bones.append(('tail.1', (0, 0.285, 0.18), (0, 0.31, 0.18), 'body'))
    bones.append(('toy', o['center'], (o['center'][0], o['center'][1], o['center'][2] + 0.04), 'head'))
    bones.append(('reed', D['reed']['start'], D['reed']['end'], 'head'))
    bones.append(('pool', (0, 0.02, 0.0), (0, 0.02, 0.05), 'root'))
    for i, (x, y, z) in enumerate(STEAM):
        bones.append((f'steam.{i + 1}', (x, y, z), (x, y, z + 0.02), 'root'))
    bc = BIRD['center']
    bones.append(('bird', bc, (bc[0], bc[1] - 0.02, bc[2]), 'head'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'bwing.{sfx}', (bc[0] + side * 0.012, bc[1] + 0.004, bc[2] + 0.004),
                      (bc[0] + side * 0.03, bc[1] + 0.004, bc[2] + 0.004), 'bird'))
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - 0.02), (side * e['x'] * 1.1, e['y'], e['z'] + 0.03), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['y'], f['top']), (side * f['x'], f['y'], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['y'], b['top']), (side * b['x'], b['y'], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035

    # Body: a heavy barrel of flat brown shell panels (belt seams, dark dorsal plates), a pale
    # belly plate, two flank lamps like portholes, a hatch with four screws on the rump. No tail.
    b = D['body']
    tilt = (b['tilt'], 0, 0)
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], e2=b['e2'], seg=(44, 30), rot=tilt)
    pod('Belly', (0.075, 0.12, 0.012), (0, 0.04, 0.062), m['role']('Belly'), 'body', e=0.35, e2=0.7, seg=(32, 8))
    for k, y in enumerate((-0.04, 0.06, 0.16, 0.26)):
        yf = (y - b['center'][1]) / b['radii'][1]
        sc_ = max(0.2, 1 - abs(yf) ** 2.2) ** 0.5
        arc = []
        for i in range(25):
            th = -0.3 + (math.pi + 0.6) * i / 24
            arc.append((b['radii'][0] * 1.005 * sc_ * kit.spow(math.cos(th), b['e2']),
                        y, b['center'][2] + (y - b['center'][1]) * b['tilt'] + b['radii'][2] * 1.005 * sc_ * kit.spow(math.sin(th), b['e'])))
        R.seam(f'Belt.{k}', arc, 'body', 0.0035)
    for side in (-1, 1):
        at = (side * (b['radii'][0] * 0.985), 0.09, 0.17)
        R.puck(f'Porthole.{side}', 0.03, 0.007, at, m['dot'](0), 'body', rot=(0, math.pi / 2, 0), seg=(24, 6))
        R.add(kit.torus(f'PortholeRim.{side}', 0.034, 0.0045, seg=(28, 6), location=(at[0] - side * 0.0015, at[1], at[2]),
                        rotation=(0, math.pi / 2, 0)), m['joint'], 'body')
    R.pod('Hatch', (0.06, 0.01, 0.05), (0, 0.295, 0.19), m['bezel'], 'body', e=0.3, seg=(24, 18))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.036, 0.303, 0.19 + sz * 0.034), 0.005)

    # Head: a long flat-topped brick, the screen high on its front face, a square dark muzzle
    # block in front of and under it with the nostrils high on its flat front, a crown seam.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(44, 30))
    sc = D['screen']
    R.screen('Capybara', sc['radii'], sc['center'], sc['bezel'])
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose'), 'head', e=n['e'], seg=(28, 18))
    front = n['center'][1] - n['radii'][1]
    for side in (-1, 1):
        R.pod(f'Nostril.{side}', (0.011, 0.005, 0.008), (side * 0.03, front + 0.002, n['center'][2] + 0.026),
              m['bezel'], 'head', e=0.7, seg=(12, 8))
    R.seam('Philtrum', [(0, front - 0.001, n['center'][2] + 0.018), (0, front - 0.001, n['center'][2] - 0.04)],
           'head', 0.003, 'bezel')
    R.seam('CrownSeam', [(x, h['center'][1] + 0.01, h['center'][2] + h['radii'][2] * 1.005) for x in (-0.07, -0.035, 0.0, 0.035, 0.07)],
           'head', seam)
    for side in (-1, 1):
        for j, dz in enumerate((0.012, 0.0, -0.012)):
            R.stud(f'Whisker.{side}.{j}', (side * n['radii'][0] * 0.97, n['center'][1] - 0.012, n['center'][2] - 0.012 + dz), 0.0032, 'head')

    # Ears: small round pucks splayed out, a hinge ball under each.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        rot = (0, side * e['splay'], 0)
        at = (side * e['x'], e['y'], e['z'])
        R.puck(f'Ear.{sfx}', e['r'], e['half'], at, m['role']('Ear'), f'ear.{sfx}', rot=rot)
        R.puck(f'EarIn.{sfx}', e['r'] * 0.6, e['half'] * 0.5, (at[0], at[1], at[2] + e['half'] * 0.9),
               m['role']('EarIn', 'joint'), f'ear.{sfx}', rot=rot, seg=(18, 6))
        R.ball(f'EarHinge.{sfx}', 0.009, (at[0] * 0.95, at[1], at[2] - e['half'] * 0.9), m['joint'], f'ear.{sfx}', seg=(12, 8))

    # Four short legs: ball hip, a stout tube, flat three-toed paws.
    f, bk = D['front'], D['back']
    pad = m['role']('Pad')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for pre, leg in (('F', f), ('B', bk)):
            x, y = side * leg['x'], leg['y']
            R.leg(f'{pre}{sfx}', (x, y, leg['top']), None, (x, y, leg['bottom']), 0.034, f'leg.{pre}{sfx}',
                  dict(radii=(0.04, 0.048, 0.02), center=(x, y - 0.012, 0.02)), pad=pad, toes=3)

    # The orange: a lit ball with a leaf and a nub, on the toy bone; sits on the head.
    o = D['orange']
    cx, cy, cz = o['center']
    pod('Orange', (o['r'], o['r'], o['r'] * 0.92), (cx, cy, cz), m['dot'](1), 'toy', e=0.95, seg=(24, 16))
    pod('OrangeNub', (0.007, 0.007, 0.004), (cx, cy, cz + o['r'] * 0.9), m['role']('Leaf'), 'toy', e=0.8, seg=(10, 6))
    pod('OrangeLeaf', (0.016, 0.008, 0.003), (cx + 0.014, cy, cz + o['r'] * 0.88), m['role']('Leaf'), 'toy', e=0.8, seg=(14, 6),
        rot=(0, 0.3, 0.3))

    # The reed: a thin green stalk out of the snout, for chewing.
    r = D['reed']
    R.tube('Reed', [r['start'], r['end']], 0.0042, m['role']('Leaf'), 'reed', ring=8)

    # The pool: a little tub on the floor (brown wooden walls, a pale rim round the top, a lit
    # water surface a hair below it with a ripple ring), put away unless he bathes.
    pl = D['pool']
    rx, ry, rz = pl['radii']
    cx, cy = pl['center'][0], pl['center'][1]
    tub = pod('Pool', pl['radii'], pl['center'], m['joint'], 'pool', e=0.25, e2=0.8, seg=(48, 20))
    kit.cut(tub, (0, 0, 1), 0.0)
    def loop(ax, ay, z, cy_=cy):
        return [(cx + ax * math.cos(2 * math.pi * i / 64), cy_ + ay * math.sin(2 * math.pi * i / 64), z) for i in range(65)]

    R.tube('PoolRim', loop(rx * 0.95, ry * 0.95, rz * 0.97), 0.0095, m['role']('Belly'), 'pool', ring=8)
    pod('PoolWater', (rx * 0.93, ry * 0.94, 0.008), (cx, cy, rz * 0.94), m['dot'](2), 'pool', e=0.3, e2=0.8, seg=(48, 8))
    for k, sc_ in enumerate((0.42, 0.68)):
        R.tube(f'PoolRipple.{k}', loop(rx * sc_, ry * sc_ * 0.8, rz * 0.94 + 0.009, cy - 0.01), 0.0045, m['role']('Belly'), 'pool', ring=6)

    # Steam: three lit rings that rise and fade away, each on a bone of its own.
    for i, (x, y, z) in enumerate(STEAM):
        R.add(kit.torus(f'Steam.{i + 1}', 0.034 - 0.004 * i, 0.0055, seg=(24, 6), location=(x, y, z), rotation=(math.pi / 2, 0, 0)), m['dot'](2), f'steam.{i + 1}')

    # The bird: a tiny round robot with a beak, two wing pucks and a chest lamp; it comes for
    # the zen sit.
    bc = BIRD['center']
    pod('BirdBody', (0.02, 0.024, 0.02), bc, m['role']('Bird'), 'bird', e=0.9, seg=(18, 12))
    pod('BirdHead', (0.014, 0.014, 0.014), (bc[0], bc[1] - 0.02, bc[2] + 0.017), m['role']('Bird'), 'bird', e=0.9, seg=(14, 10))
    pod('BirdBeak', (0.006, 0.011, 0.005), (bc[0], bc[1] - 0.037, bc[2] + 0.015), m['role']('Beak'), 'bird', e=0.7, seg=(10, 8))
    pod('BirdEye.L', (0.004, 0.003, 0.004), (bc[0] + 0.008, bc[1] - 0.032, bc[2] + 0.02), m['bezel'], 'bird', e=0.9, seg=(8, 6))
    pod('BirdEye.R', (0.004, 0.003, 0.004), (bc[0] - 0.008, bc[1] - 0.032, bc[2] + 0.02), m['bezel'], 'bird', e=0.9, seg=(8, 6))
    pod('BirdTail', (0.012, 0.014, 0.004), (bc[0], bc[1] + 0.03, bc[2] + 0.002), m['role']('Beak'), 'bird', e=0.7, seg=(10, 8),
        rot=(-0.3, 0, 0))
    R.puck('BirdLamp', 0.006, 0.003, (bc[0], bc[1] - 0.019, bc[2] - 0.005), m['dot'](2), 'bird', rot=(math.pi / 2, 0, 0), seg=(12, 4))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        R.pod(f'BirdWing.{sfx}', (0.014, 0.016, 0.003), (bc[0] + side * 0.024, bc[1] + 0.004, bc[2] + 0.004),
              m['role']('Bird'), f'bwing.{sfx}', e=0.7, seg=(14, 8), rot=(0, 0, side * 0.4))

    return R.finish('CapybaraRig', rig_bones())
