"""Dune, the crew's robot fennec fox kit: a small cream toy with a slim body, a small round head
with a short pointed muzzle, a big dark-eyed screen and, the signature, two GIANT ears (each
as tall as the whole head and body together nearly: big rounded plates with a pink rim and a
lit panel inside, Dot0) on hinges that swivel independently. Slim legs on ball joints, a
bushy tail on three bones with a black tip, a round lamp in the cream chest ruff (Dot1).

Kept in the model for tricks, each on bones of its own: a dune of sand in front of him (`dune`)
that he pounces into, and four puffs of sand (`sand.1..4`) that fly when he does. Faces -Y like
the rest of the crew; about 0.46 m to the ear tips. Small, so the paper look's outline is
thinner (0.0022).
"""

import math

import kit
import looks
import fluffkit as fk

FACE = 'fennec'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.07, 0.1, 0.073), center=(0, 0.04, 0.12), e=0.8),
    'head': dict(radii=(0.09, 0.08, 0.075), center=(0, -0.082, 0.2), e=0.75),
    # 1.56:1, like the fennec's face layout (448 x 288)
    'screen': dict(radii=(0.06, 0.018, 0.0385), center=(0, -0.152, 0.206), bezel=0.006),
    'muzzle': dict(radii=(0.031, 0.04, 0.026), center=(0, -0.168, 0.164)),
    'nose': dict(radii=(0.011, 0.009, 0.01), center=(0, -0.205, 0.172)),
    'ear': dict(x=0.062, y=-0.055, z=0.365, tilt=0.5),
    'front': dict(x=0.043, y=-0.045, hip=0.11, knee=0.068, ankle=0.03),
    'back': dict(x=0.05, y=0.11, hip=0.11, knee=0.068, ankle=0.03),
    'tail': [(0, 0.11, 0.115), (0, 0.25, 0.095), (0, 0.4, 0.095), (0, 0.54, 0.14)],
    'dune': dict(radii=(0.15, 0.13, 0.16), center=(0, -0.27, 0.0)),
}
SAND = [(-0.07, -0.19, 0.03), (0.0, -0.21, 0.03), (0.07, -0.19, 0.03), (0.03, -0.17, 0.02)]


def rig_bones():
    e, f, b = D['ear'], D['front'], D['back']
    bones = fk.standard_bones(hips=(0, 0.11, 0.12), chest=(0, -0.05, 0.15), neck=(0, -0.07, 0.17),
                              head_top=(0, -0.082, 0.27))
    pts = kit.spline(D['tail'], 4)
    parent = 'body'
    for i in range(3):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    bones.append(('dune', (0, -0.27, 0.0), (0, -0.27, 0.05), 'root'))
    for i, (x, y, z) in enumerate(SAND):
        bones.append((f'sand.{i + 1}', (x, y, z), (x, y, z + 0.01), 'root'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'], e['y'], e['z'] - 0.09), (side * (e['x'] + 0.05), e['y'], e['z'] + 0.1), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['y'], f['hip']), (side * f['x'], f['y'], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['y'], b['hip']), (side * b['x'], b['y'], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.003

    # Body: a slim pod, a cream chest ruff with a round lamp, a seam round the middle.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(36, 24))
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.165, n=64), 'body', seam)
    pod('Ruff', (0.05, 0.034, 0.055), (0, -0.045, 0.12), m['role']('Belly'), 'body', e=0.6, seg=(24, 16))
    R.puck('Lamp', 0.013, 0.006, (0, -0.074, 0.12), m['dot'](1), 'body', rot=(math.pi / 2, 0, 0), seg=(20, 6))
    R.add(kit.torus('LampRing', 0.0165, 0.003, seg=(24, 6), location=(0, -0.0745, 0.12), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    R.pod('Hatch', (0.034, 0.008, 0.034), (0, 0.138, 0.14), m['bezel'], 'body', e=0.3, seg=(20, 14))

    # Tail: bushy, thick in the middle, on three bones, black tip.
    pts = kit.spline(D['tail'], 24)
    rad = [(0.028 + 0.02 * math.sin(math.pi * 0.85 * i / 23)) * (1 - 0.32 * (i / 23)) for i in range(24)]
    tail, ts = kit.tube('Tail', pts, rad, ring=14)
    R.add(tail, m['shell'], kit.chain(ts, ['tail.1', 'tail.2', 'tail.3']))
    tip = pts[-1]
    pod('TailTip', (0.027, 0.058, 0.027), (tip[0], tip[1] + 0.02, tip[2] + 0.006), m['role']('TailTip'), 'tail.3', e=0.85, seg=(18, 12),
        rot=(0.28, 0, 0))

    # Head: a small round pod, the big dark screen, a short pointed muzzle, a nose.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(40, 28))
    sc = D['screen']
    R.screen('Fennec', sc['radii'], sc['center'], sc['bezel'])
    mz, n = D['muzzle'], D['nose']
    pod('Muzzle', mz['radii'], mz['center'], m['role']('Belly'), 'head', e=0.65, seg=(24, 16))
    pod('Nose', n['radii'], n['center'], m['role']('Nose'), 'head', e=0.6, seg=(14, 10))
    R.seam('CrownSeam', [(0, -0.082 - 0.076 * math.cos(math.radians(a)) * 0.98, 0.2 + 0.07 * math.sin(math.radians(a)) * 1.02)
                         for a in range(45, 150, 8)], 'head', seam)
    for side in (-1, 1):
        for j, dz in enumerate((0.008, -0.006)):
            R.stud(f'Whisker.{side}.{j}', (side * 0.035, -0.2, 0.165 + dz), 0.0028, 'head')

    # Giant ears: tall rounded cones, flattened, tilted out, a pink inside with a lit panel, a
    # hinge puck at each base.
    e = D['ear']
    prof = [(0.0, 0.2), (0.012, 0.196), (0.03, 0.172), (0.052, 0.11), (0.07, 0.04), (0.076, 0.0)]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        base = (side * e['x'], e['y'], e['z'] - 0.1)
        rot = (0, side * e['tilt'], 0)
        shell = kit.stretch(kit.lathe(f'Ear.{sfx}', prof, seg=28), sy=0.2)
        shell.location, shell.rotation_euler = base, rot
        R.add(shell, m['shell'], bone)
        rim = kit.stretch(kit.lathe(f'EarRim.{sfx}', [(r * 0.84, z * 0.88 + 0.006) for r, z in prof], seg=26), sy=0.2)
        rim.location, rim.rotation_euler = (base[0], base[1] - 0.0045, base[2]), rot
        R.add(rim, m['role']('EarIn'), bone)
        lit = kit.stretch(kit.lathe(f'EarLight.{sfx}', [(r * 0.56, z * 0.7 + 0.016) for r, z in prof], seg=24), sy=0.2)
        lit.location, lit.rotation_euler = (base[0], base[1] - 0.0085, base[2]), rot
        R.add(lit, m['dot'](0), bone)
        R.puck(f'EarHinge.{sfx}', 0.019, 0.013, (base[0] * 0.95, base[1] + 0.01, base[2] + 0.01), m['joint'], bone, rot=(math.pi / 2, 0, 0), seg=(18, 6))

    # Legs: slim, ball hip and knee, small paws.
    f, bk = D['front'], D['back']
    pad = m['role']('Pad')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for pre, leg, r in (('F', f, 0.015), ('B', bk, 0.017)):
            x, y = side * leg['x'], leg['y']
            R.leg(f'{pre}{sfx}', (x, y, leg['hip']), (x, y + (0.012 if pre == 'B' else 0.0), leg['knee']), (x, y, leg['ankle']), r,
                  f'leg.{pre}{sfx}', dict(radii=(0.022, 0.034, 0.015), center=(x, y - 0.012, 0.015)), pad=pad, toes=0)

    # The dune: a heap of sand in front of him, flat at the floor, and puffs of sand.
    dn = D['dune']
    heap = pod('Dune', dn['radii'], dn['center'], m['role']('Sand'), 'dune', e=0.6, e2=0.9, seg=(36, 22))
    kit.cut(heap, (0, 0, 1), 0.0)
    for i, (x, y, z) in enumerate(SAND):
        R.pod(f'Sand.{i + 1}', (0.014, 0.014, 0.012), (x, y, z), m['role']('Sand'), f'sand.{i + 1}', e=0.8, seg=(12, 8))

    return looks.finish(kit.armature('FennecRig', rig_bones()), R.parts, R.skin, m, outline=0.0022)
