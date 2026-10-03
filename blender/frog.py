"""Plink, the crew's robot tree frog: a squat toy on folded hind legs, a wide head with its screen face across the front and two eye
domes on top (each a ball with a lit lens, turned on its own bone), a throat sac under the
chin that the site inflates until it glows (Dot0), short arms with sticky round toe pads that
light up (Dot1 on the hands, Dot2 on the feet), a few lit spots down the back (Dot3), a
tongue on a bone of its own with a sticky ball on a bone of its own at the tip (hidden inside
the mouth until a trick), a pale belly plate and a stripe down each flank.

Rig: root, body, head, eye.L/R, tongue, ball, sac, arm.L/R, forearm.L/R, thigh.L/R,
shin.L/R, foot.L/R. Faces -Y like the rest of the crew; about 0.24 m to the top of the eyes.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'frog'
PREVIEW = dict(lift=0.0, width=0.4)

D = {
    'body': dict(radii=(0.105, 0.105, 0.09), center=(0, 0.05, 0.105), e=0.6),
    'head': dict(radii=(0.125, 0.09, 0.07), center=(0, -0.075, 0.14), e=0.55),
    'screen': dict(radii=(0.09, 0.03, 0.042), center=(0, -0.153, 0.135), bezel=0.008, e=0.4),
    'eye': dict(x=0.07, y=-0.07, z=0.2, r=0.045),
    'sac': dict(center=(0, -0.115, 0.09), r=0.06),
    'tongue': dict(root=(0, -0.15, 0.1), length=0.13, r=0.008),
    'arm': dict(shoulder=(0.085, -0.055, 0.085), elbow=(0.1, -0.085, 0.05), hand=(0.1, -0.12, 0.017), r=0.018),
    'hind': dict(hip=(0.09, 0.07, 0.1), knee=(0.145, -0.025, 0.125), ankle=(0.125, 0.115, 0.03),
                 toe=(0.115, -0.04, 0.012), r=(0.044, 0.03, 0.018)),
}
ARMS = (('L', 1), ('R', -1))


def m3(p, side):
    return side * p[0], p[1], p[2]


def rig_bones():
    d, a, h, t, e = D['body'], D['arm'], D['hind'], D['tongue'], D['eye']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('body', (0, 0.1, 0.09), (0, -0.06, 0.1), 'root'),
        ('head', (0, -0.05, 0.12), (0, -0.14, 0.14), 'body'),
        ('tongue', t['root'], (t['root'][0], t['root'][1] - t['length'], t['root'][2]), 'head'),
        ('ball', (0, t['root'][1] - t['length'], t['root'][2]), (0, t['root'][1] - t['length'] - 0.02, t['root'][2]),
         'head'),
        ('sac', D['sac']['center'], (0, D['sac']['center'][1] - 0.03, D['sac']['center'][2] - 0.03), 'head'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'eye.{sfx}', (side * e['x'], e['y'], e['z'] - 0.02), (side * e['x'], e['y'] - 0.01, e['z'] + 0.02),
                      'head'))
        bones.append((f'arm.{sfx}', m3(a['shoulder'], side), m3(a['elbow'], side), 'body'))
        bones.append((f'forearm.{sfx}', m3(a['elbow'], side), m3(a['hand'], side), f'arm.{sfx}'))
        bones.append((f'thigh.{sfx}', m3(h['hip'], side), m3(h['knee'], side), 'body'))
        bones.append((f'shin.{sfx}', m3(h['knee'], side), m3(h['ankle'], side), f'thigh.{sfx}'))
        bones.append((f'foot.{sfx}', m3(h['ankle'], side), m3(h['toe'], side), f'shin.{sfx}'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def bolt(name, at, r, bone, rot=(0, 0, 0)):
        add(kit.superellipsoid(name, (r, r * 0.6, r), 0.6, 0.6, seg=(10, 6), location=at, rotation=rot), m['joint'],
            bone)

    def ring(name, a, b, t, r, bone, minor=0.0042, mat='joint'):
        a, b = Vector(a), Vector(b)
        rot = (b - a).to_track_quat('Z', 'Y').to_euler()
        add(kit.torus(name, r, minor, seg=(22, 6), location=tuple(a + (b - a) * t), rotation=tuple(rot)), m[mat], bone)

    # ----- body: torso, belly plate, flank stripes, back lights, seams
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(44, 30), location=b['center']), m['shell'], 'body')
    add(kit.superellipsoid('Belly', (0.075, 0.02, 0.055), 0.4, 0.6, seg=(22, 12), location=(0, -0.085, 0.085)),
        m['role']('Belly', 'joint'), 'body')
    for dx in (-1, 1):
        for dz in (-1, 1):
            bolt(f'BellyBolt.{dx}{dz}', (dx * 0.055, -0.103, 0.085 + dz * 0.04), 0.0048, 'body', (math.pi / 2, 0, 0))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = []
        for i in range(9):
            y = -0.07 + 0.2 * i / 8
            k = max(1 - abs((y - b['center'][1]) / b['radii'][1]) ** (2 / b['e']), 0.02) ** (b['e'] / 2)
            pts.append((side * b['radii'][0] * k * 1.01, y, b['center'][2] + 0.01))
        add(kit.tube(f'Flank.{sfx}', pts, [0.002, 0.005, 0.0065, 0.007, 0.007, 0.0065, 0.005, 0.004, 0.002], ring=6)[0],
            m['role']('Stripe', 'joint'), 'body')
    for i, y in enumerate((-0.01, 0.055, 0.12)):
        add(kit.superellipsoid(f'Spot.{i}', (0.016 - 0.002 * i, 0.012, 0.007), 0.5, 0.6, seg=(14, 8),
                               location=(0, y, 0.188 - 0.004 * i)), m['dot'](3), 'body')
        add(kit.torus(f'SpotRing.{i}', 0.017 - 0.002 * i, 0.0032, seg=(18, 6), location=(0, y, 0.186 - 0.004 * i)),
            m['bezel'], 'body')
    for i, y in enumerate((-0.05, 0.1)):
        k = max(1 - abs((y - b['center'][1]) / b['radii'][1]) ** (2 / b['e']), 0.02) ** (b['e'] / 2)
        pts = [(b['radii'][0] * k * 1.012 * kit.spow(math.cos(2 * math.pi * j / 40), b['e']), y,
                b['center'][2] + b['radii'][2] * k * 1.012 * kit.spow(math.sin(2 * math.pi * j / 40), b['e']))
               for j in range(41)]
        add(kit.tube(f'Seam{i}', pts, 0.003, ring=6)[0], m['joint'], 'body')

    # ----- head: wide shell, screen, nostrils, cheek bolts
    h, sc = D['head'], D['screen']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(44, 28), location=h['center']), m['shell'], 'head')
    glass, rim = kit.screen('Frog', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for side in (-1, 1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.005, 0.004, 0.003), seg=(8, 6),
                               location=(side * 0.02, -0.15, 0.17)), m['joint'], 'head')
        bolt(f'Cheek.{side}', (side * 0.118, -0.07, 0.125), 0.0058, 'head', (0, 0, math.pi / 2))
    add(kit.tube('Mouth', [(-0.07, -0.168, 0.1), (-0.035, -0.172, 0.097), (0, -0.173, 0.096), (0.035, -0.172, 0.097),
                           (0.07, -0.168, 0.1)], 0.0032, ring=6)[0], m['joint'], 'head')

    # ----- eyes on top: a ball on a collar with a lit lens and a lid
    e = D['eye']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        c = (side * e['x'], e['y'], e['z'])
        add(kit.superellipsoid(f'Eye.{sfx}', (e['r'],) * 3, seg=(24, 16), location=c), m['bezel'], f'eye.{sfx}')
        add(kit.superellipsoid(f'Lens.{sfx}', (0.019, 0.011, 0.019), 0.5, 1, seg=(16, 8),
                               location=(c[0], c[1] - e['r'] * 0.86, c[2] + 0.006), rotation=(0.3, 0, 0)), m['beacon'],
            f'eye.{sfx}')
        add(kit.torus(f'LensRim.{sfx}', 0.022, 0.0036, seg=(20, 6), location=(c[0], c[1] - e['r'] * 0.8, c[2] + 0.006),
                      rotation=(math.pi / 2 + 0.3, 0, 0)), m['joint'], f'eye.{sfx}')
        lid = kit.cut(kit.superellipsoid(f'Lid.{sfx}', (e['r'] * 1.08,) * 3, seg=(24, 14), location=c), (0, 0.4, 1),
                      e['r'] * 0.12)
        add(lid, m['shell'], f'eye.{sfx}')
        add(kit.torus(f'Collar.{sfx}', e['r'] * 1.0, 0.0055, seg=(26, 6), location=(c[0], c[1], c[2] - e['r'] * 0.6)),
            m['joint'], 'head')

    # ----- throat sac, tongue and its sticky ball
    s = D['sac']
    add(kit.superellipsoid('Sac', (s['r'],) * 3, seg=(24, 16), location=s['center']), m['dot'](0), 'sac')
    add(kit.torus('SacBand', s['r'] * 0.86, 0.0034, seg=(24, 6), location=(s['center'][0], s['center'][1] - 0.01,
                                                                          s['center'][2] - 0.01),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'sac')
    tg = D['tongue']
    ry, rz = tg['root'][1], tg['root'][2]
    add(kit.tube('Tongue', [(0, ry, rz), (0, ry - tg['length'], rz)], tg['r'], ring=10)[0],
        m['role']('Tongue', 'joint'), 'tongue')
    add(kit.superellipsoid('Ball', (0.02, 0.02, 0.02), seg=(18, 12), location=(0, ry - tg['length'], rz)),
        m['role']('Tongue', 'joint'), 'ball')
    add(kit.torus('BallBand', 0.016, 0.0036, seg=(18, 6), location=(0, ry - tg['length'] - 0.004, rz),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'ball')

    # ----- arms: balls, tubes, hand pads with three lit toe pads
    a = D['arm']
    for sfx, side in ARMS:
        sh, el, hd = (m3(a[k], side) for k in ('shoulder', 'elbow', 'hand'))
        add(kit.superellipsoid(f'Shoulder.{sfx}', (a['r'] * 1.35,) * 3, seg=(16, 10), location=sh), m['joint'],
            f'arm.{sfx}')
        add(kit.tube(f'Upper.{sfx}', [sh, el], a['r'], ring=12)[0], m['shell'], f'arm.{sfx}')
        add(kit.superellipsoid(f'Elbow.{sfx}', (a['r'] * 1.2,) * 3, seg=(16, 10), location=el), m['joint'],
            f'forearm.{sfx}')
        add(kit.tube(f'Lower.{sfx}', [el, hd], a['r'] * 0.9, ring=12)[0], m['shell'], f'forearm.{sfx}')
        add(kit.superellipsoid(f'Hand.{sfx}', (0.03, 0.03, 0.011), 0.5, 0.8, seg=(18, 8), location=(hd[0], hd[1] - 0.01, 0.012)),
            m['role']('Pad', 'joint'), f'forearm.{sfx}')
        for k, ang in enumerate((-0.6, 0.0, 0.6)):
            add(kit.superellipsoid(f'FingerPad.{sfx}{k}', (0.0125, 0.0125, 0.0075), 0.6, 1, seg=(14, 6),
                                   location=(hd[0] + 0.036 * math.sin(ang), hd[1] - 0.012 - 0.034 * math.cos(ang), 0.009)),
                m['dot'](1), f'forearm.{sfx}')

    # ----- hind legs: thigh, shin, long foot with three lit pads
    hd = D['hind']
    r0, r1, r2 = hd['r']
    for sfx, side in ARMS:
        hp, kn, an, toe = (m3(hd[k], side) for k in ('hip', 'knee', 'ankle', 'toe'))
        add(kit.superellipsoid(f'Hip.{sfx}', (r0 * 1.25,) * 3, seg=(18, 12), location=hp), m['joint'], f'thigh.{sfx}')
        add(kit.tube(f'Thigh.{sfx}', [hp, kn], [r0, r1 * 1.05], ring=14)[0], m['shell'], f'thigh.{sfx}')
        add(kit.superellipsoid(f'Knee.{sfx}', (r1 * 1.25,) * 3, seg=(16, 10), location=kn), m['joint'], f'shin.{sfx}')
        add(kit.tube(f'Shin.{sfx}', [kn, an], [r1, r2 * 1.1], ring=12)[0], m['shell'], f'shin.{sfx}')
        add(kit.superellipsoid(f'Ankle.{sfx}', (r2 * 1.3,) * 3, seg=(14, 10), location=an), m['joint'], f'foot.{sfx}')
        ring(f'ThighRing.{sfx}', hp, kn, 0.5, r0 * 0.78, f'thigh.{sfx}')
        ring(f'ShinRing.{sfx}', kn, an, 0.5, r1 * 0.85, f'shin.{sfx}', mat='bezel')
        bolt(f'KneeBolt.{sfx}', (kn[0] + side * r1 * 1.15, kn[1], kn[2]), 0.0055, f'shin.{sfx}', (0, 0, math.pi / 2))
        add(kit.tube(f'Foot.{sfx}', [an, toe], [r2, r2 * 0.8], ring=10)[0], m['role']('Pad', 'joint'), f'foot.{sfx}')
        add(kit.superellipsoid(f'Sole.{sfx}', (0.034, 0.05, 0.008), 0.5, 0.8, seg=(18, 8),
                               location=(toe[0], (an[1] + toe[1]) / 2 - 0.01, 0.009)), m['role']('Pad', 'joint'),
            f'foot.{sfx}')
        for k, ang in enumerate((-0.55, 0.0, 0.55)):
            add(kit.superellipsoid(f'ToePad.{sfx}{k}', (0.0135, 0.0135, 0.008), 0.6, 1, seg=(14, 6),
                                   location=(toe[0] + 0.04 * math.sin(ang), toe[1] - 0.012 - 0.03 * math.cos(ang), 0.008)),
                m['dot'](2), f'foot.{sfx}')

    return looks.finish(kit.armature('FrogRig', rig_bones()), parts, skin, m)
