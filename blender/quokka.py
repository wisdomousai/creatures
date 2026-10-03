"""Beam, the crew's robot quokka: a small wallaby, upright. He sits up on long flat hind feet
(strong thighs, a short shin, a heel and a foot as long as his shin and thigh together) with a
pear of a body that narrows to the shoulders, short front paws held up in front of his chest on
ball joints, a round head with a short pale muzzle and a dark nose, small round ears set high
(smaller than a bear's), and a thin tail that tapers as it lies along the floor behind him on
two bones. The screen face is the quokka's famous smile (the layout always has a mouth; the site
shows 'happy' unless something is wrong), and the signature is the cheeks: two round lit discs
(Dot0) either side of the face that glow and flash like a camera when he beams. He hops on his
hind feet; he does not walk on all fours (quokka.ts).

A leaf (`toy`, on the head bone) is kept in the model for nibbling and put away otherwise.
Faces -Y like the rest of the crew; about 0.36 m to the ear tops. Small, so the paper look's
outline is thinner (0.0022, as Nibbs).
"""

import math

import kit
import looks
import fluffkit as fk

FACE = 'quokka'
PREVIEW = dict(lift=0.0, width=0.6, turn=18)

D = {
    'body': dict(radii=(0.078, 0.084, 0.115), center=(0, 0.04, 0.135), e=0.85, taper=0.4),
    'head': dict(radii=(0.072, 0.072, 0.064), center=(0, -0.045, 0.282), e=0.75),
    # 1.76:1, like the quokka's face layout (448 x 256)
    'screen': dict(radii=(0.052, 0.016, 0.0295), center=(0, -0.106, 0.292), bezel=0.005),
    'muzzle': dict(radii=(0.036, 0.036, 0.026), center=(0, -0.112, 0.243)),
    'nose': dict(radii=(0.017, 0.012, 0.012), center=(0, -0.145, 0.25)),
    'cheek': dict(x=0.068, y=-0.092, z=0.258, r=0.015),
    'ear': dict(x=0.046, y=-0.03, z=0.334, r=0.0175, half=0.008, splay=0.35),
    # front paws held up in front: shoulder, elbow, paw
    'arm': dict(x=0.062, shoulder=(-0.04, 0.2), elbow=(0.012, -0.085, 0.163), paw=(-0.04, -0.112, 0.19), r=0.015),
    'hip': dict(x=0.07, y=0.07, top=0.105, heel=(0.1, 0.034)),
    'foot': dict(radii=(0.026, 0.078, 0.016), center_y=0.04),
    # thin and tapering, lying along the floor behind him
    'tail': [(0, 0.11, 0.08), (0, 0.2, 0.04), (0, 0.36, 0.014)],
    'leaf': dict(r=0.045, center=(0, -0.165, 0.19)),
}


def rig_bones():
    a, h, e = D['arm'], D['hip'], D['ear']
    bones = fk.standard_bones(hips=(0, 0.075, 0.12), chest=(0, -0.04, 0.2), neck=(0, -0.04, 0.24),
                              head_top=(0, -0.045, 0.348))
    pts = kit.spline(D['tail'], 3)
    bones.append(('tail.1', pts[0], pts[1], 'body'))
    bones.append(('tail.2', pts[1], pts[2], 'tail.1'))
    lf = D['leaf']['center']
    bones.append(('toy', lf, (lf[0], lf[1] - 0.02, lf[2]), 'head'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - 0.02), (side * e['x'] * 1.1, e['y'], e['z'] + 0.025), 'head'))
        bones.append((f'leg.F{sfx}', (side * a['x'], a['shoulder'][0], a['shoulder'][1]),
                      (side * a['x'] * 0.8, a['paw'][1], a['paw'][2]), 'body'))
        bones.append((f'leg.B{sfx}', (side * h['x'], h['y'], h['top']), (side * h['x'], h['y'], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.003

    # Body: a pear that narrows to the shoulders, a pale belly plate, a belt seam, a little hatch
    # on the back.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(36, 26), taper=b['taper'])
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.12, taper=b['taper'], n=64), 'body', seam)
    pod('Belly', (0.05, 0.014, 0.07), (0, -0.046, 0.13), m['role']('Belly'), 'body', e=0.4, seg=(28, 16))
    R.pod('Hatch', (0.036, 0.008, 0.036), (0, 0.118, 0.17), m['bezel'], 'body', e=0.3, seg=(20, 14))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.024, 0.124, 0.17 + sz * 0.024), 0.0045)

    # Tail: thin, tapering to a point, lying along the floor behind him on two bones.
    pts = kit.spline(D['tail'], 16)
    tail, ts = kit.tube('Tail', pts, [0.026 - 0.019 * (i / 15) ** 0.8 for i in range(16)], ring=12)
    R.add(tail, m['role']('Belly'), kit.chain(ts, ['tail.1', 'tail.2']))
    R.ring('TailBand', tuple(pts[6]), 0.02, 0.0035, tuple(pts[7]), 'joint', 'tail.1', seg=(20, 6))
    R.ring('TailBand2', tuple(pts[11]), 0.0135, 0.0035, tuple(pts[12]), 'joint', 'tail.2', seg=(20, 6))

    # Head: a round pod, the screen, a short pale muzzle with a dark nose, lit cheeks.
    h = D['head']
    hx, hy, hz = h['center']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(40, 28))
    sc = D['screen']
    R.screen('Quokka', sc['radii'], sc['center'], sc['bezel'])
    mz, n = D['muzzle'], D['nose']
    pod('Muzzle', mz['radii'], mz['center'], m['role']('Belly'), 'head', e=0.65, seg=(24, 16))
    pod('Nose', n['radii'], n['center'], m['role']('Nose'), 'head', e=0.6, seg=(16, 12))
    R.seam('CrownSeam', [(0, hy - h['radii'][1] * math.cos(math.radians(a)) * 0.98, hz + h['radii'][2] * math.sin(math.radians(a)) * 1.02)
                         for a in range(50, 140, 8)], 'head', seam)
    c = D['cheek']
    for side in (-1, 1):
        at = (side * c['x'], c['y'], c['z'])
        R.puck(f'Cheek.{side}', c['r'], 0.006, at, m['dot'](0), 'head', rot=(math.pi / 2, side * 0.9, 0), seg=(22, 6))
        R.add(kit.torus(f'CheekRim.{side}', c['r'] + 0.003, 0.003, seg=(24, 6), location=(at[0] - side * 0.0015, at[1] - 0.0015, at[2]),
                        rotation=(math.pi / 2, side * 0.9, 0)), m['joint'], 'head')
        for j, dz in enumerate((0.008, -0.004)):
            R.stud(f'Whisker.{side}.{j}', (side * 0.036, -0.15, 0.24 + dz), 0.0025, 'head')

    # Ears: small round domes with a pink inside, set high, each on a hinge ball.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        rot = (math.pi / 2, side * e['splay'], 0)
        at = (side * e['x'], e['y'], e['z'])
        R.puck(f'Ear.{sfx}', e['r'], e['half'], at, m['role']('Ear'), f'ear.{sfx}', rot=rot)
        R.puck(f'EarIn.{sfx}', e['r'] * 0.62, e['half'] * 0.5, (at[0], at[1] - e['half'] * 0.9, at[2]),
               m['role']('Cheek'), f'ear.{sfx}', rot=rot, seg=(20, 6))
        R.ball(f'EarHinge.{sfx}', 0.008, (at[0] * 0.92, at[1] + 0.007, at[2] - e['r'] * 0.8), m['joint'], f'ear.{sfx}', seg=(12, 8))

    # Arms: short, held up in front of his chest on ball joints (shoulder, elbow), a little
    # paw with three fingers. Hind legs: a strong thigh, a short shin to the heel, and a long
    # flat foot reaching forward.
    a, hp = D['arm'], D['hip']
    pad = m['role']('Pad')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'leg.F{sfx}'
        sh = (side * a['x'], a['shoulder'][0], a['shoulder'][1])
        el = (side * a['elbow'][0] * 1.0 + side * 0.0, a['elbow'][1], a['elbow'][2])
        el = (side * (a['x'] + a['elbow'][0]), a['elbow'][1], a['elbow'][2])
        pw = (side * (a['x'] * 0.8), a['paw'][1], a['paw'][2])
        R.ball(f'Shoulder.{sfx}', a['r'] * 1.35, sh, m['joint'], bone)
        R.tube(f'Upper.{sfx}', [sh, el], a['r'], m['shell'], bone)
        R.ball(f'Elbow.{sfx}', a['r'] * 1.2, el, m['joint'], bone)
        R.tube(f'Fore.{sfx}', [el, pw], a['r'] * 0.9, m['shell'], bone)
        R.pod(f'Hand.{sfx}', (0.017, 0.016, 0.015), (pw[0], pw[1] - 0.008, pw[2] + 0.002), m['role']('Belly'), bone, e=0.6, seg=(18, 12))
        for j in (-1, 0, 1):
            R.pod(f'Finger.{sfx}.{j}', (0.0055, 0.0055, 0.005), (pw[0] + j * 0.0085, pw[1] - 0.025, pw[2] + 0.002), pad, bone, seg=(10, 6))

        bone = f'leg.B{sfx}'
        x, y = side * hp['x'], hp['y']
        R.pod(f'Thigh.{sfx}', (0.03, 0.055, 0.058), (x + side * 0.004, y + 0.004, hp['top'] - 0.005), m['shell'], bone, e=0.75, seg=(28, 18))
        R.puck(f'Hub.{sfx}', 0.018, 0.009, (x + side * 0.034, y, hp['top'] - 0.005), m['joint'], bone, rot=(0, math.pi / 2, 0), seg=(18, 6))
        R.tube(f'Shin.{sfx}', [(x, y + 0.012, hp['top'] - 0.035), (x, hp['heel'][0], hp['heel'][1] + 0.004)], 0.02, m['shell'], bone)
        R.ball(f'Heel.{sfx}', 0.019, (x, hp['heel'][0], hp['heel'][1]), m['joint'], bone, seg=(14, 10))
        fo = D['foot']
        R.pod(f'Foot.{sfx}', fo['radii'], (x, fo['center_y'], fo['radii'][2]), m['role']('Belly'), bone, e=0.45, e2=0.7, seg=(28, 12))
        R.pod(f'FootPad.{sfx}', (fo['radii'][0] * 0.76, fo['radii'][1] * 0.86, 0.005), (x, fo['center_y'], 0.003), pad, bone, e=0.4, e2=0.6, seg=(20, 6))
        for j in (-1, 0, 1):
            R.pod(f'Toe.{sfx}.{j}', (0.0075, 0.0075, 0.0055), (x + j * 0.012, fo['center_y'] - fo['radii'][1] * 0.95, 0.007), pad, bone, seg=(10, 6))

    # The leaf: a broad pod with a rib, for nibbling.
    lf = D['leaf']
    cx, cy, cz = lf['center']
    pod('Leaf', (lf['r'], 0.006, 0.022), (cx, cy, cz), m['role']('Leaf'), 'toy', e=0.7, e2=1.0, seg=(24, 10))
    R.tube('LeafRib', [(cx - lf['r'] * 0.9, cy - 0.006, cz), (cx + lf['r'] * 0.9, cy - 0.006, cz)], 0.0028, m['joint'], 'toy', ring=6)

    return looks.finish(kit.armature('QuokkaRig', rig_bones()), R.parts, R.skin, m, outline=0.0022)
