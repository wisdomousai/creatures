"""Bongo, the crew's robot monkey: a toy robot, not a monkey in a robot suit. A pear-shaped
body with a cream belly plate and a winding key on the back; a big rounded-box head with a
cream face plate and the screen set into it; two big dish ears (a round disc on a hinge, a
lit disc on each: Dot0 his left, Dot1 his right); very long arms on ball joints that reach
down past the knees to round hands; short legs with flat feet; and a long curly tail in
six ringed segments (the spiral of a wound spring) with a lit tip (Dot2) that can wrap
round things.

The pair of wind-up toy cymbals the site brings out for the clash are on bones of their
own (cymbal.L, cymbal.R, children of the forearms, shrunk to nothing until a trick); they
are brass discs with a knob and a lit rim (Dot3).

Rig: root, body, head, ear.L/R, arm.L/R, forearm.L/R, cymbal.L/R, thigh.L/R, shin.L/R,
tail.1-6. Faces -Y like the rest of the crew; about 0.55 m to the top of the head.
"""

import math

from mathutils import Euler, Vector

import kit
import looks

FACE = 'monkey'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.105, 0.09, 0.115), center=(0, 0.0, 0.25), e=0.7, taper=0.22),
    'belly': dict(radii=(0.062, 0.075, 0.014), center=(0, -0.083, 0.23), rim=0.007),
    'head': dict(radii=(0.14, 0.115, 0.108), center=(0, -0.01, 0.46), e=0.62, taper=0.08),
    # The mask: two lobes over the eyes and a round muzzle round the mouth.
    'mask': dict(lobe=(0.058, 0.022, 0.056), lobes=((0.052, -0.108, 0.478), (-0.052, -0.108, 0.478)),
                 muzzle=(0.056, 0.036, 0.042), muzzle_at=(0, -0.118, 0.415)),
    'screen': dict(radii=(0.086, 0.02, 0.04), center=(0, -0.13, 0.47), bezel=0.008),
    'ear': dict(x=0.15, y=-0.004, z=0.425, r=0.048, half=0.01, inner=0.032, splay=0.75),
    'shoulder': (0.122, -0.005, 0.335),
    'elbow': (0.175, -0.03, 0.185),
    'wrist': (0.185, -0.045, 0.045),
    'hand': dict(radii=(0.036, 0.036, 0.042), center=(0.187, -0.05, 0.02)),
    'arm_r': 0.022,
    'hip': (0.058, 0.0, 0.16),
    'knee': (0.07, -0.032, 0.095),
    'ankle': (0.074, -0.012, 0.04),
    'leg_r': 0.026,
    'foot': dict(radii=(0.038, 0.055, 0.022), center=(0.076, -0.03, 0.022)),
    # The tail's joints in (y, z), curling up and over like a watch spring.
    # 3D joints: the tail swings out to his right as it curls up and over, so the loop shows in
    # the three-quarter view as well as the side.
    'tail': [(0.0, 0.09, 0.17), (-0.02, 0.17, 0.19), (-0.05, 0.24, 0.26), (-0.08, 0.255, 0.36),
             (-0.08, 0.2, 0.44), (-0.05, 0.13, 0.45), (-0.03, 0.09, 0.4)],
    'tail_r': 0.026,
    'seam': 0.0035,
    'cymbal': dict(r=0.064, half=0.006, knob=0.014),
}


def mirror(p, side):
    return side * p[0], p[1], p[2]


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.16), (0, 0, 0.34), 'root'),
        ('head', (0, -0.01, 0.34), (0, -0.01, 0.56), 'body'),
    ]
    er = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * er['x']
        bones.append((f'ear.{sfx}', (x * 0.85, er['y'], er['z']), (x * 1.3, er['y'], er['z']), 'head'))
        bones.append((f'arm.{sfx}', mirror(D['shoulder'], side), mirror(D['elbow'], side), 'body'))
        bones.append((f'forearm.{sfx}', mirror(D['elbow'], side), mirror(D['wrist'], side), f'arm.{sfx}'))
        h = mirror(D['hand']['center'], side)
        bones.append((f'cymbal.{sfx}', h, (h[0], h[1] - 0.02, h[2]), f'forearm.{sfx}'))
        bones.append((f'thigh.{sfx}', mirror(D['hip'], side), mirror(D['knee'], side), 'root'))
        bones.append((f'shin.{sfx}', mirror(D['knee'], side), mirror(D['ankle'], side), f'thigh.{sfx}'))
    t = D['tail']
    for i in range(6):
        bones.append((f'tail.{i + 1}', t[i], t[i + 1], 'body' if i == 0 else f'tail.{i}'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def stud(name, at, r=0.0055, bone='body', mat='joint', rot=(math.pi / 2, 0, 0)):
        add(kit.superellipsoid(name, (r, r * 0.6, r), 0.6, 1.0, seg=(10, 6), location=at, rotation=rot), m[mat], bone)

    seam = D['seam']

    # Body, collar, belly plate with a rim and a ring of studs.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(40, 30), taper=b['taper'], location=b['center']),
        m['shell'], 'body')
    add(kit.torus('Collar', 0.066, 0.012, seg=(32, 8), location=(0, -0.004, 0.335)), m['joint'], 'body')
    bl = D['belly']
    add(kit.superellipsoid('Belly', bl['radii'], 0.35, 1.0, seg=(40, 8), location=bl['center'],
                           rotation=(math.pi / 2, 0, 0)), m['role']('Belly'), 'body')
    add(kit.torus('BellyRim', bl['radii'][0] + bl['rim'] * 0.4, bl['rim'], seg=(40, 6),
                  location=(bl['center'][0], bl['center'][1] - 0.004, bl['center'][2]), rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'body')
    add(kit.superellipsoid('Beacon', (0.02, 0.012, 0.02), 0.5, 0.8, seg=(18, 10),
                           location=(0, bl['center'][1] - 0.012, bl['center'][2] + 0.01)), m['beacon'], 'body')
    add(kit.torus('BeaconRim', 0.024, 0.0045, seg=(24, 6),
                  location=(0, bl['center'][1] - 0.013, bl['center'][2] + 0.01), rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'body')
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        stud(f'BellyStud.{i}', (bl['radii'][0] * 1.08 * math.cos(a), bl['center'][1] - 0.012,
                                bl['center'][2] + bl['radii'][0] * 1.08 * math.sin(a) * 1.0), 0.0042)
    # Waist seam.
    ring = [Vector((b['radii'][0] * 0.98 * math.cos(2 * math.pi * i / 48), b['radii'][1] * 0.98 * math.sin(2 * math.pi * i / 48),
                    0.2)) for i in range(49)]
    add(kit.tube('WaistSeam', ring, seam, ring=6)[0], m['joint'], 'body')

    # Back: a winding key and a hatch.
    add(kit.superellipsoid('Hatch', (0.05, 0.01, 0.055), 0.3, 0.3, seg=(24, 20), location=(0, 0.088, 0.26)),
        m['bezel'], 'body')
    add(kit.tube('KeyStem', [(0, 0.096, 0.26), (0, 0.13, 0.26)], 0.005, ring=8)[0], m['role']('Brass', 'joint'), 'body')
    for side in (-1, 1):
        add(kit.torus(f'KeyLoop.{side}', 0.016, 0.004, seg=(20, 6), location=(side * 0.016, 0.132, 0.26),
                      rotation=(math.pi / 2, 0, 0)), m['role']('Brass', 'joint'), 'body')

    # Head: a rounded box, the cream face plate with the screen set into it, a brow seam.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(44, 32), taper=h['taper'], location=h['center']),
        m['shell'], 'head')
    mk = D['mask']
    # The mask: two lobes over the eyes (a peanut) and a round muzzle round the mouth, lighter
    # than the head, with a rim and a nose and a mouth line on the muzzle.
    for k, c in enumerate(mk['lobes']):
        add(kit.superellipsoid(f'MaskLobe.{k}', mk['lobe'], 0.5, 0.8, seg=(32, 16), location=c), m['role']('Face'),
            'head')
    add(kit.superellipsoid('Muzzle', mk['muzzle'], 0.55, 0.7, seg=(32, 16), location=mk['muzzle_at']),
        m['role']('Face'), 'head')
    mx, my, mz = mk['muzzle_at']
    add(kit.superellipsoid('Nose', (0.012, 0.008, 0.008), 0.6, 0.8, seg=(12, 8),
                           location=(0, my - mk['muzzle'][1] * 0.95, mz + 0.012)), m['bezel'], 'head')
    add(kit.tube('MouthLine', [(-0.03, my - mk['muzzle'][1] * 0.9, mz - 0.01), (-0.012, my - mk['muzzle'][1] * 0.97, mz - 0.017),
                               (0.012, my - mk['muzzle'][1] * 0.97, mz - 0.017), (0.03, my - mk['muzzle'][1] * 0.9, mz - 0.01)],
                0.0028, ring=6)[0], m['joint'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Monkey', sc['radii'], sc['center'], sc['bezel'], e=0.4, seg=(48, 28))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    # A tuft cap of little studs along the crown.
    for i in range(7):
        a = math.radians(36 + i * 18)
        stud(f'Crown.{i}', (0, h['center'][1] - h['radii'][1] * math.cos(a) * 0.9, h['center'][2] + h['radii'][2] * math.sin(a) * 1.0),
             0.0048, 'head')

    # Dish ears: a big disc on a hinge with a lit disc and a ring round it.
    er = D['ear']
    for side, sfx, dot in ((1, 'L', 0), (-1, 'R', 1)):
        x = side * er['x']
        rot = Euler((0, side * (math.pi / 2 - er['splay']), 0))
        add(kit.superellipsoid(f'Ear.{sfx}', (er['r'], er['r'], er['half']), 0.35, 1.0, seg=(32, 8),
                               location=(x, er['y'], er['z']), rotation=tuple(rot)), m['shell'], f'ear.{sfx}')
        top = Vector((0, 0, er['half'] * 0.9))
        top.rotate(rot)
        c = Vector((x, er['y'], er['z'])) + top
        add(kit.superellipsoid(f'EarLight.{sfx}', (er['inner'], er['inner'], er['half'] * 0.5), 0.4, 1.0, seg=(28, 6),
                               location=tuple(c), rotation=tuple(rot)), m['dot'](dot), f'ear.{sfx}')
        add(kit.torus(f'EarRing.{sfx}', er['inner'] + 0.006, 0.004, seg=(32, 6), location=tuple(c * 1.0 + top * 0.2),
                      rotation=tuple(rot)), m['joint'], f'ear.{sfx}')
        stud(f'EarHinge.{side}', (side * (er['x'] - er['r'] * 0.78), er['y'], er['z']), 0.007, 'head',
             rot=(0, math.pi / 2, 0))

    # Arms: long, with a ball at the shoulder, a ring at the elbow, round hands.
    r = D['arm_r']
    hd = D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        s, e, w = (mirror(D[k], side) for k in ('shoulder', 'elbow', 'wrist'))
        add(kit.superellipsoid(f'Shoulder.{sfx}', (r * 1.4,) * 3, seg=(20, 14), location=s), m['joint'], f'arm.{sfx}')
        add(kit.tube(f'Upper.{sfx}', [s, e], [r, r * 0.92], ring=12)[0], m['shell'], f'arm.{sfx}')
        add(kit.superellipsoid(f'Elbow.{sfx}', (r * 1.25,) * 3, seg=(20, 14), location=e), m['joint'], f'forearm.{sfx}')
        add(kit.tube(f'Lower.{sfx}', [e, w], [r * 0.92, r * 0.82], ring=12)[0], m['shell'], f'forearm.{sfx}')
        for t in (0.5,):
            pt = Vector(s).lerp(Vector(e), t)
            add(kit.torus(f'UpperRing.{sfx}', r * 1.12, 0.0038, seg=(20, 6), location=tuple(pt),
                          rotation=tuple((Vector(e) - Vector(s)).to_track_quat('Z', 'Y').to_euler())),
                m['joint'], f'arm.{sfx}')
            pt = Vector(e).lerp(Vector(w), t)
            add(kit.torus(f'LowerRing.{sfx}', r * 1.0, 0.0038, seg=(20, 6), location=tuple(pt),
                          rotation=tuple((Vector(w) - Vector(e)).to_track_quat('Z', 'Y').to_euler())),
                m['bezel'], f'forearm.{sfx}')
        hc = mirror(hd['center'], side)
        add(kit.superellipsoid(f'Hand.{sfx}', hd['radii'], 0.75, 0.9, seg=(22, 14), location=hc), m['shell'],
            f'forearm.{sfx}')
        add(kit.superellipsoid(f'Palm.{sfx}', (hd['radii'][0] * 0.64, 0.01, hd['radii'][2] * 0.6), 0.5, 0.8,
                               seg=(18, 8), location=(hc[0], hc[1] - hd['radii'][1] * 0.86, hc[2] - 0.004)),
            m['role']('Face'), f'forearm.{sfx}')

    # The wind-up cymbals: brass discs held in the hands, on bones of their own.
    cy = D['cymbal']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        hc = mirror(hd['center'], side)
        rot = (0, side * math.pi / 2, 0)
        c = (hc[0] + side * 0.002, hc[1] - 0.02, hc[2] + 0.02)
        add(kit.superellipsoid(f'Cymbal.{sfx}', (cy['r'], cy['r'], cy['half']), 0.3, 1.0, seg=(32, 8), location=c,
                               rotation=rot), m['role']('Brass', 'joint'), f'cymbal.{sfx}')
        out = (c[0] + side * (cy['half'] + 0.004), c[1], c[2])
        add(kit.superellipsoid(f'CymbalKnob.{sfx}', (cy['knob'], cy['knob'], cy['half'] * 1.2), 0.5, 1.0, seg=(18, 8),
                               location=out, rotation=rot), m['dot'](3), f'cymbal.{sfx}')
        add(kit.torus(f'CymbalRim.{sfx}', cy['r'] * 0.8, 0.0035, seg=(32, 6), location=out, rotation=rot),
            m['joint'], f'cymbal.{sfx}')

    # Legs: short, a ball at the hip, a knee, a flat round foot.
    r, ft = D['leg_r'], D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        hp, kn, an = (mirror(D[k], side) for k in ('hip', 'knee', 'ankle'))
        add(kit.superellipsoid(f'Hip.{sfx}', (r * 1.3,) * 3, seg=(20, 14), location=hp), m['joint'], f'thigh.{sfx}')
        add(kit.tube(f'Thigh.{sfx}', [hp, kn], r, ring=12)[0], m['shell'], f'thigh.{sfx}')
        add(kit.superellipsoid(f'Knee.{sfx}', (r * 1.2,) * 3, seg=(20, 14), location=kn), m['joint'], f'shin.{sfx}')
        add(kit.tube(f'Shin.{sfx}', [kn, an], r, ring=12)[0], m['shell'], f'shin.{sfx}')
        fc = mirror(ft['center'], side)
        add(kit.superellipsoid(f'Foot.{sfx}', ft['radii'], 0.4, 0.55, seg=(24, 12), location=fc), m['shell'],
            f'shin.{sfx}')
        add(kit.superellipsoid(f'Sole.{sfx}', (ft['radii'][0] * 0.7, ft['radii'][1] * 0.7, 0.006), 0.4, 0.6, seg=(20, 6),
                               location=(fc[0], fc[1], 0.005)), m['role']('Face'), f'shin.{sfx}')

    # The curly tail: six ringed segments on ball joints, thinning to a lit tip.
    t, tr = D['tail'], D['tail_r']
    radii = [tr, tr * 0.93, tr * 0.86, tr * 0.79, tr * 0.72, tr * 0.65, tr * 0.58]
    for i in range(6):
        a, b2 = t[i], t[i + 1]
        bone = f'tail.{i + 1}'
        add(kit.tube(f'Tail.{i}', [a, b2], [radii[i], radii[i + 1]], ring=12)[0], m['shell'], bone)
        add(kit.superellipsoid(f'TailJoint.{i}', (radii[i] * 1.2,) * 3, seg=(18, 12), location=a), m['joint'], bone)
        mid = Vector(a).lerp(Vector(b2), 0.5)
        add(kit.torus(f'TailRing.{i}', radii[i] * 1.0, 0.0034, seg=(20, 6), location=tuple(mid),
                      rotation=tuple((Vector(b2) - Vector(a)).to_track_quat('Z', 'Y').to_euler())),
            m['bezel'], bone)
    end = t[6]
    add(kit.superellipsoid('TailTip', (0.03, 0.03, 0.03), seg=(20, 14), location=end), m['dot'](2), 'tail.6')

    return looks.finish(kit.armature('MonkeyRig', rig_bones()), parts, skin, m)
