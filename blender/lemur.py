"""Zesty, the crew's robot ring-tailed lemur: a toy robot, not a lemur in a robot suit. A slim
grey body with a white belly plate and a winding-free back, a round head with a pointed white
muzzle and a dark eye mask (two big slanted patches round the screen, so the glowing eyes are big
amber discs in black), two round ears on hinges, slim arms on ball joints ending in little
hands with three finger beads, long legs with narrow feet, and, her signature, a very long
tail of eight segments on ball joints that goes up behind her in a question mark and is ringed
in alternating light grey and dark: each dark ring has a lit band round it (Dot2 to Dot5, so
the rings can light up in turn) and the tip is lit (Dot6).

Rig: root, body, head, ear.L/R, arm.L/R, forearm.L/R, thigh.L/R, shin.L/R, tail.1-8. Faces -Y
like the rest of the crew; about 0.58 m to the top of the head, and the tail goes up to 0.72.
"""

import math

from mathutils import Euler, Vector

import kit
import looks

FACE = 'lemur'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.09, 0.075, 0.125), center=(0, 0.0, 0.28), e=0.7, taper=0.12),
    'belly': dict(radii=(0.052, 0.085, 0.012), center=(0, -0.071, 0.265), rim=0.006),
    'head': dict(radii=(0.108, 0.098, 0.094), center=(0, -0.012, 0.5), e=0.66, taper=0.06),
    'lobes': dict(radii=(0.062, 0.02, 0.054), at=((0.052, -0.097, 0.508), (-0.052, -0.097, 0.508)), tilt=0.45),
    'muzzle': dict(radii=(0.04, 0.062, 0.036), center=(0, -0.082, 0.462)),
    'screen': dict(radii=(0.086, 0.02, 0.04), center=(0, -0.114, 0.512), bezel=0.008),
    'ear': dict(x=0.082, y=0.0, z=0.575, r=0.036, half=0.01, inner=0.023, splay=0.5),
    'shoulder': (0.098, -0.005, 0.355),
    'elbow': (0.128, -0.035, 0.235),
    'wrist': (0.132, -0.052, 0.125),
    'hand': dict(radii=(0.027, 0.03, 0.035), center=(0.134, -0.056, 0.098)),
    'arm_r': 0.0165,
    'hip': (0.05, 0.0, 0.2),
    'knee': (0.064, -0.045, 0.108),
    'ankle': (0.066, -0.02, 0.036),
    'leg_r': 0.02,
    'foot': dict(radii=(0.03, 0.05, 0.017), center=(0.066, -0.036, 0.018)),
    # The tail: eight segments going up behind her in a question mark (y, z).
    'tail': [(0.0, 0.075, 0.185), (0.012, 0.135, 0.205), (0.03, 0.19, 0.27), (0.052, 0.228, 0.355), (0.07, 0.24, 0.45),
             (0.08, 0.222, 0.545), (0.082, 0.18, 0.625), (0.074, 0.122, 0.675), (0.06, 0.058, 0.69)],
    'tail_r': 0.027,
    'seam': 0.003,
}


def mirror(p, side):
    return side * p[0], p[1], p[2]


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.19), (0, 0, 0.37), 'root'),
        ('head', (0, -0.01, 0.37), (0, -0.01, 0.6), 'body'),
    ]
    er = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * er['x']
        bones.append((f'ear.{sfx}', (x * 0.9, er['y'], er['z']), (x * 1.4, er['y'], er['z'] + 0.03), 'head'))
        bones.append((f'arm.{sfx}', mirror(D['shoulder'], side), mirror(D['elbow'], side), 'body'))
        bones.append((f'forearm.{sfx}', mirror(D['elbow'], side), mirror(D['wrist'], side), f'arm.{sfx}'))
        bones.append((f'thigh.{sfx}', mirror(D['hip'], side), mirror(D['knee'], side), 'root'))
        bones.append((f'shin.{sfx}', mirror(D['knee'], side), mirror(D['ankle'], side), f'thigh.{sfx}'))
    t = D['tail']
    for i in range(8):
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

    def stud(name, at, r=0.0048, bone='body', mat='joint', rot=(math.pi / 2, 0, 0)):
        add(kit.superellipsoid(name, (r, r * 0.6, r), 0.6, 1.0, seg=(10, 6), location=at, rotation=rot), m[mat], bone)

    # ----- body: slim, a white belly plate with a rim, a collar, a beacon
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(40, 30), taper=b['taper'], location=b['center']),
        m['shell'], 'body')
    add(kit.torus('Collar', 0.056, 0.011, seg=(32, 8), location=(0, -0.004, 0.375)), m['joint'], 'body')
    bl = D['belly']
    add(kit.superellipsoid('Belly', bl['radii'], 0.35, 1.0, seg=(40, 8), location=bl['center'],
                           rotation=(math.pi / 2, 0, 0)), m['role']('Belly'), 'body')
    add(kit.torus('BellyRim', bl['radii'][0] + bl['rim'] * 0.4, bl['rim'], seg=(40, 6),
                  location=(0, bl['center'][1] - 0.004, bl['center'][2]), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    add(kit.superellipsoid('Beacon', (0.017, 0.011, 0.017), 0.5, 0.8, seg=(18, 10),
                           location=(0, bl['center'][1] - 0.011, bl['center'][2] + 0.03)), m['beacon'], 'body')
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        stud(f'BellyStud.{i}', (bl['radii'][0] * 1.1 * math.cos(a), bl['center'][1] - 0.011,
                                bl['center'][2] - 0.03 + bl['radii'][1] * 0.75 * math.sin(a)), 0.0042)
    ring = [Vector((b['radii'][0] * 0.98 * math.cos(2 * math.pi * i / 48), b['radii'][1] * 0.98 * math.sin(2 * math.pi * i / 48),
                    0.2)) for i in range(49)]
    add(kit.tube('WaistSeam', ring, D['seam'], ring=6)[0], m['joint'], 'body')

    # ----- head: a round shell, the dark eye mask, a pointed white muzzle with a dark nose, the screen
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(44, 32), taper=h['taper'], location=h['center']),
        m['shell'], 'head')
    lb = D['lobes']
    for side, c in ((1, lb['at'][0]), (-1, lb['at'][1])):
        add(kit.superellipsoid(f'MaskLobe.{side}', lb['radii'], 0.5, 0.8, seg=(32, 16), location=c,
                               rotation=(0, side * lb['tilt'] * 0, side * lb['tilt'])), m['role']('Mask', 'bezel'), 'head')
    mz = D['muzzle']
    add(kit.superellipsoid('Muzzle', mz['radii'], 0.6, 0.7, seg=(32, 16), location=mz['center']), m['role']('Face'),
        'head')
    add(kit.superellipsoid('Nose', (0.016, 0.012, 0.011), 0.6, 0.8, seg=(12, 8),
                           location=(0, mz['center'][1] - mz['radii'][1] * 0.95, mz['center'][2] + 0.008)), m['bezel'],
        'head')
    my = mz['center'][1] - mz['radii'][1] * 0.9
    add(kit.tube('MouthLine', [(-0.02, my, mz['center'][2] - 0.012), (0, my - 0.003, mz['center'][2] - 0.016),
                               (0.02, my, mz['center'][2] - 0.012)], 0.0025, ring=6)[0], m['joint'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Lemur', sc['radii'], sc['center'], sc['bezel'], e=0.4, seg=(48, 28))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for i in range(5):
        a = math.radians(40 + i * 25)
        stud(f'Crown.{i}', (0, h['center'][1] - h['radii'][1] * math.cos(a) * 0.9,
                            h['center'][2] + h['radii'][2] * math.sin(a)), 0.0042, 'head')

    # ----- round ears on hinges, a lit disc each (Dot0 left, Dot1 right)
    er = D['ear']
    for side, sfx, dot in ((1, 'L', 0), (-1, 'R', 1)):
        x = side * er['x']
        rot = Euler((0, side * (math.pi / 2 - er['splay']), 0))
        add(kit.superellipsoid(f'Ear.{sfx}', (er['r'], er['r'] * 1.1, er['half']), 0.35, 1.0, seg=(32, 8),
                               location=(x, er['y'], er['z']), rotation=tuple(rot)), m['shell'], f'ear.{sfx}')
        top = Vector((0, 0, er['half'] * 0.9))
        top.rotate(rot)
        c = Vector((x, er['y'], er['z'])) + top
        add(kit.superellipsoid(f'EarLight.{sfx}', (er['inner'], er['inner'] * 1.1, er['half'] * 0.5), 0.4, 1.0,
                               seg=(24, 6), location=tuple(c), rotation=tuple(rot)), m['dot'](dot), f'ear.{sfx}')
        stud(f'EarHinge.{side}', (side * (er['x'] - er['r'] * 0.8), er['y'], er['z'] - 0.01), 0.006, 'head',
             rot=(0, math.pi / 2, 0))

    # ----- arms: slim, a ball at the shoulder, rings, little hands with finger beads
    r = D['arm_r']
    hd = D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        s, e, w = (mirror(D[k], side) for k in ('shoulder', 'elbow', 'wrist'))
        add(kit.superellipsoid(f'Shoulder.{sfx}', (r * 1.5,) * 3, seg=(20, 14), location=s), m['joint'], f'arm.{sfx}')
        add(kit.tube(f'Upper.{sfx}', [s, e], [r, r * 0.92], ring=12)[0], m['shell'], f'arm.{sfx}')
        add(kit.superellipsoid(f'Elbow.{sfx}', (r * 1.25,) * 3, seg=(18, 12), location=e), m['joint'], f'forearm.{sfx}')
        add(kit.tube(f'Lower.{sfx}', [e, w], [r * 0.92, r * 0.8], ring=12)[0], m['shell'], f'forearm.{sfx}')
        pt = Vector(e).lerp(Vector(w), 0.5)
        add(kit.torus(f'LowerRing.{sfx}', r * 1.0, 0.0035, seg=(20, 6), location=tuple(pt),
                      rotation=tuple((Vector(w) - Vector(e)).to_track_quat('Z', 'Y').to_euler())), m['bezel'], f'forearm.{sfx}')
        hc = mirror(hd['center'], side)
        add(kit.superellipsoid(f'Hand.{sfx}', hd['radii'], 0.75, 0.9, seg=(22, 14), location=hc), m['shell'],
            f'forearm.{sfx}')
        for k in range(3):
            add(kit.superellipsoid(f'Finger.{sfx}.{k}', (0.0085, 0.011, 0.0095), 0.7, 0.8, seg=(10, 6),
                                   location=(hc[0] + (k - 1) * 0.018, hc[1] - hd['radii'][1] * 0.88, hc[2] - 0.016)),
                m['role']('Mask', 'bezel'), f'forearm.{sfx}')

    # ----- legs: long and slim, a narrow foot
    r, ft = D['leg_r'], D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        hp, kn, an = (mirror(D[k], side) for k in ('hip', 'knee', 'ankle'))
        add(kit.superellipsoid(f'Hip.{sfx}', (r * 1.4,) * 3, seg=(20, 14), location=hp), m['joint'], f'thigh.{sfx}')
        add(kit.tube(f'Thigh.{sfx}', [hp, kn], r, ring=12)[0], m['shell'], f'thigh.{sfx}')
        add(kit.superellipsoid(f'Knee.{sfx}', (r * 1.2,) * 3, seg=(20, 14), location=kn), m['joint'], f'shin.{sfx}')
        add(kit.tube(f'Shin.{sfx}', [kn, an], r * 0.92, ring=12)[0], m['shell'], f'shin.{sfx}')
        fc = mirror(ft['center'], side)
        add(kit.superellipsoid(f'Foot.{sfx}', ft['radii'], 0.4, 0.55, seg=(24, 12), location=fc), m['shell'], f'shin.{sfx}')
        add(kit.superellipsoid(f'Sole.{sfx}', (ft['radii'][0] * 0.7, ft['radii'][1] * 0.7, 0.005), 0.4, 0.6, seg=(20, 6),
                               location=(fc[0], fc[1], 0.004)), m['role']('Mask', 'bezel'), f'shin.{sfx}')

    # ----- the ringed tail: eight segments on ball joints, light and dark in turn, each dark
    # ring wearing a lit band (Dot2..Dot5), the tip lit (Dot6)
    t, tr = D['tail'], D['tail_r']
    radii = [tr * (1 - 0.34 * i / 8) for i in range(9)]
    for i in range(8):
        a, b2 = t[i], t[i + 1]
        bone = f'tail.{i + 1}'
        dark = i % 2 == 1
        add(kit.tube(f'Tail.{i}', [a, b2], [radii[i], radii[i + 1]], ring=14)[0],
            m['role']('Ring', 'joint') if dark else m['shell'], bone)
        add(kit.superellipsoid(f'TailJoint.{i}', (radii[i] * 1.14,) * 3, seg=(16, 10), location=a), m['joint'], bone)
        if dark:
            mid = Vector(a).lerp(Vector(b2), 0.5)
            rr = (radii[i] + radii[i + 1]) / 2
            rot = tuple((Vector(b2) - Vector(a)).to_track_quat('Z', 'Y').to_euler())
            add(kit.torus(f'TailBand.{i}', rr * 1.0, rr * 0.28, seg=(24, 8), location=tuple(mid), rotation=rot),
                m['dot'](2 + i // 2), bone)
    end = t[8]
    add(kit.superellipsoid('TailTip', (0.026, 0.026, 0.026), seg=(18, 12), location=end), m['dot'](6), 'tail.8')

    return looks.finish(kit.armature('LemurRig', rig_bones()), parts, skin, m)
