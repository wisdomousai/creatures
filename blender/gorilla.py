"""Boulder, the crew's robot young gorilla: a toy robot, not a gorilla in a robot suit. A broad barrel
body that is widest across the shoulders, a big dark chest plate with a lit pad in it (Dot0: it
flashes with every beat of the chest drum) in a ring of studs, a silver saddle panel on the back
in a trim of lights (Dot2), a rounded head with a heavy brow bar (a lit strip, Dot1) over the
screen, a dark muzzle plate and a crest on the crown, small round ears, very long strong arms on
ball joints that end in big knuckle fists, and short legs with broad flat feet. The beacon is on
his chest.

Rig: root, body, head, arm.L/R, forearm.L/R, thigh.L/R, shin.L/R. Faces -Y like the rest of the
crew; about 0.6 m to the top of the head.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'gorilla'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'body': dict(radii=(0.17, 0.13, 0.175), center=(0, 0.0, 0.33), e=0.62, taper=-0.1),
    'chest': dict(radii=(0.105, 0.105, 0.022), center=(0, -0.112, 0.37), rim=0.008),
    'saddle': dict(radii=(0.115, 0.115, 0.02), center=(0, 0.114, 0.34)),
    'head': dict(radii=(0.118, 0.108, 0.1), center=(0, -0.065, 0.555), e=0.65),
    'brow': dict(radii=(0.108, 0.034, 0.024), center=(0, -0.152, 0.598)),
    'muzzle': dict(radii=(0.074, 0.04, 0.045), center=(0, -0.153, 0.508)),
    'crest': dict(radii=(0.05, 0.08, 0.04), center=(0, -0.03, 0.645)),
    'screen': dict(radii=(0.082, 0.02, 0.04), center=(0, -0.159, 0.558), bezel=0.008),
    'ear': dict(x=0.12, y=-0.045, z=0.545, r=0.028),
    'shoulder': (0.2, -0.005, 0.44),
    'elbow': (0.262, -0.045, 0.255),
    'wrist': (0.272, -0.07, 0.1),
    'fist': dict(radii=(0.05, 0.05, 0.055), center=(0.272, -0.072, 0.06)),
    'arm_r': 0.036,
    'hip': (0.078, 0.02, 0.2),
    'knee': (0.088, -0.03, 0.115),
    'ankle': (0.092, -0.015, 0.04),
    'leg_r': 0.04,
    'foot': dict(radii=(0.05, 0.07, 0.026), center=(0.092, -0.04, 0.026)),
    'seam': 0.0035,
}


def mirror(p, side):
    return side * p[0], p[1], p[2]


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.2), (0, 0, 0.45), 'root'),
        ('head', (0, -0.03, 0.45), (0, -0.05, 0.66), 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'arm.{sfx}', mirror(D['shoulder'], side), mirror(D['elbow'], side), 'body'))
        bones.append((f'forearm.{sfx}', mirror(D['elbow'], side), mirror(D['wrist'], side), f'arm.{sfx}'))
        bones.append((f'thigh.{sfx}', mirror(D['hip'], side), mirror(D['knee'], side), 'root'))
        bones.append((f'shin.{sfx}', mirror(D['knee'], side), mirror(D['ankle'], side), f'thigh.{sfx}'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def stud(name, at, r=0.0058, bone='body', mat='joint', rot=(math.pi / 2, 0, 0)):
        add(kit.superellipsoid(name, (r, r * 0.6, r), 0.6, 1.0, seg=(10, 6), location=at, rotation=rot), m[mat], bone)

    # ----- body: a broad barrel, a collar, the chest plate with its lit pad and a ring of studs
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(40, 30), taper=b['taper'], location=b['center']),
        m['shell'], 'body')
    add(kit.torus('Collar', 0.085, 0.014, seg=(32, 8), location=(0, -0.008, 0.45)), m['joint'], 'body')
    ch = D['chest']
    add(kit.superellipsoid('Chest', ch['radii'], 0.4, 0.8, seg=(40, 10), location=ch['center'],
                           rotation=(math.pi / 2, 0, 0)), m['role']('Chest', 'joint'), 'body')
    add(kit.torus('ChestRim', ch['radii'][0] + ch['rim'] * 0.4, ch['rim'], seg=(40, 6),
                  location=(0, ch['center'][1] - 0.004, ch['center'][2]), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'body')
    add(kit.superellipsoid('ChestPad', (0.07, 0.07, 0.014), 0.45, 0.6, seg=(30, 8),
                           location=(0, ch['center'][1] - 0.012, ch['center'][2] + 0.005), rotation=(math.pi / 2, 0, 0)),
        m['dot'](0), 'body')
    add(kit.superellipsoid('Beacon', (0.02, 0.012, 0.02), 0.5, 0.8, seg=(18, 10),
                           location=(0, ch['center'][1] - 0.026, ch['center'][2] + 0.005)), m['beacon'], 'body')
    for i in range(10):
        a = 2 * math.pi * (i + 0.5) / 10
        stud(f'ChestStud.{i}', ((ch['radii'][0] + 0.016) * math.cos(a), ch['center'][1] - 0.012,
                                ch['center'][2] + (ch['radii'][1] + 0.016) * math.sin(a)), 0.0048)
    # A waist seam.
    ring = [Vector((b['radii'][0] * 0.9 * math.cos(2 * math.pi * i / 48), b['radii'][1] * 0.9 * math.sin(2 * math.pi * i / 48),
                    0.215)) for i in range(49)]
    add(kit.tube('WaistSeam', ring, D['seam'], ring=6)[0], m['joint'], 'body')

    # ----- the saddle: a silver panel on his back in a trim of lights
    sd = D['saddle']
    add(kit.superellipsoid('Saddle', sd['radii'], 0.35, 0.8, seg=(36, 10), location=sd['center'],
                           rotation=(math.pi / 2, 0, 0)), m['role']('Saddle', 'bezel'), 'body')
    for i in range(7):
        a = math.radians(-60 + 20 * i)
        add(kit.superellipsoid(f'SaddleLight.{i}', (0.0075, 0.006, 0.0075), 0.7, 0.7, seg=(10, 6),
                               location=(sd['radii'][0] * 0.82 * math.sin(a), sd['center'][1] + sd['radii'][2] * 0.95,
                                         sd['center'][2] + sd['radii'][1] * 0.82 * math.cos(a) * 0.9)),
            m['dot'](2), 'body')
    add(kit.torus('SaddleRim', sd['radii'][0] * 0.98, 0.0045, seg=(36, 6),
                  location=(0, sd['center'][1] + 0.004, sd['center'][2]), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')

    # ----- head: the shell, a heavy brow bar (lit strip), a dark muzzle, crest, ears, the screen
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(44, 32), location=h['center']), m['shell'], 'head')
    br = D['brow']
    add(kit.superellipsoid('Brow', br['radii'], 0.4, 0.7, seg=(32, 12), location=br['center']),
        m['role']('Brow', 'joint'), 'head')
    add(kit.superellipsoid('BrowLight', (br['radii'][0] * 0.7, 0.008, 0.006), 0.5, 0.8, seg=(24, 6),
                           location=(0, br['center'][1] - br['radii'][1] * 0.82, br['center'][2] + 0.004)), m['dot'](1),
        'head')
    mz = D['muzzle']
    add(kit.superellipsoid('Muzzle', mz['radii'], 0.55, 0.7, seg=(32, 16), location=mz['center']),
        m['role']('Face', 'joint'), 'head')
    for side in (-1, 1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.009, 0.006, 0.005), seg=(8, 6),
                               location=(side * 0.016, mz['center'][1] - mz['radii'][1] * 0.95, mz['center'][2] + 0.012)),
            m['bezel'], 'head')
    my = mz['center'][1] - mz['radii'][1] * 0.9
    add(kit.tube('MouthLine', [(-0.036, my, mz['center'][2] - 0.016), (-0.014, my - 0.006, mz['center'][2] - 0.022),
                               (0.014, my - 0.006, mz['center'][2] - 0.022), (0.036, my, mz['center'][2] - 0.016)],
                 0.003, ring=6)[0], m['bezel'], 'head')
    cr = D['crest']
    add(kit.superellipsoid('Crest', cr['radii'], 0.6, 0.8, seg=(24, 16), location=cr['center']),
        m['role']('Brow', 'joint'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Gorilla', sc['radii'], sc['center'], sc['bezel'], e=0.4, seg=(48, 28))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    er = D['ear']
    for side in (1, -1):
        add(kit.superellipsoid(f'Ear.{side}', (er['r'] * 0.45, er['r'], er['r']), 0.5, 0.8, seg=(16, 10),
                               location=(side * er['x'], er['y'], er['z'])), m['joint'], 'head')

    # ----- arms: long, thick, a ball at the shoulder, a ring at the elbow, knuckle fists
    r = D['arm_r']
    fs = D['fist']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        s, e, w = (mirror(D[k], side) for k in ('shoulder', 'elbow', 'wrist'))
        add(kit.superellipsoid(f'Shoulder.{sfx}', (r * 1.55,) * 3, seg=(22, 16), location=s), m['joint'], f'arm.{sfx}')
        add(kit.tube(f'Upper.{sfx}', [s, e], [r, r * 1.02], ring=14)[0], m['shell'], f'arm.{sfx}')
        add(kit.superellipsoid(f'Elbow.{sfx}', (r * 1.3,) * 3, seg=(20, 14), location=e), m['joint'], f'forearm.{sfx}')
        add(kit.tube(f'Lower.{sfx}', [e, w], [r * 1.08, r * 0.95], ring=14)[0], m['shell'], f'forearm.{sfx}')
        for t, mat, bone, a, b2 in ((0.5, 'joint', f'arm.{sfx}', s, e), (0.5, 'bezel', f'forearm.{sfx}', e, w)):
            pt = Vector(a).lerp(Vector(b2), t)
            add(kit.torus(f'Ring.{sfx}.{bone}', r * 1.15, 0.004, seg=(20, 6), location=tuple(pt),
                          rotation=tuple((Vector(b2) - Vector(a)).to_track_quat('Z', 'Y').to_euler())), m[mat], bone)
        hc = mirror(fs['center'], side)
        add(kit.superellipsoid(f'Fist.{sfx}', fs['radii'], 0.7, 0.85, seg=(24, 16), location=hc), m['shell'],
            f'forearm.{sfx}')
        for k in range(3):
            add(kit.superellipsoid(f'Knuckle.{sfx}.{k}', (0.012, 0.01, 0.012), 0.7, 0.8, seg=(10, 6),
                                   location=(hc[0] + (k - 1) * 0.026, hc[1] - fs['radii'][1] * 0.9, hc[2] + 0.004)),
                m['role']('Face', 'joint'), f'forearm.{sfx}')
        add(kit.superellipsoid(f'Cuff.{sfx}', (r * 1.2, r * 1.2, 0.01), 0.5, 0.8, seg=(20, 6),
                               location=(w[0], w[1], w[2] + 0.004)), m['bezel'], f'forearm.{sfx}')

    # ----- legs: short and strong, a flat broad foot
    r, ft = D['leg_r'], D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        hp, kn, an = (mirror(D[k], side) for k in ('hip', 'knee', 'ankle'))
        add(kit.superellipsoid(f'Hip.{sfx}', (r * 1.4,) * 3, seg=(20, 14), location=hp), m['joint'], f'thigh.{sfx}')
        add(kit.tube(f'Thigh.{sfx}', [hp, kn], r * 1.1, ring=12)[0], m['shell'], f'thigh.{sfx}')
        add(kit.superellipsoid(f'Knee.{sfx}', (r * 1.2,) * 3, seg=(20, 14), location=kn), m['joint'], f'shin.{sfx}')
        add(kit.tube(f'Shin.{sfx}', [kn, an], r, ring=12)[0], m['shell'], f'shin.{sfx}')
        fc = mirror(ft['center'], side)
        add(kit.superellipsoid(f'Foot.{sfx}', ft['radii'], 0.4, 0.55, seg=(24, 12), location=fc), m['shell'],
            f'shin.{sfx}')
        add(kit.superellipsoid(f'Sole.{sfx}', (ft['radii'][0] * 0.75, ft['radii'][1] * 0.75, 0.006), 0.4, 0.6, seg=(20, 6),
                               location=(fc[0], fc[1], 0.005)), m['role']('Face', 'joint'), f'shin.{sfx}')

    return looks.finish(kit.armature('GorillaRig', rig_bones()), parts, skin, m)
