"""Shutter, the crew's robot camera: a boxy folding-camera body on two stubby legs, a bellows
neck of five pleats that runs out to a big round lens barrel, and the lens glass is his screen
face (two eyes and a smile behind the glass). A flash unit sits on top (`strobe`), a viewfinder
and a shutter button beside it, a slit under the bellows that a printed photo slides out of
(`photo`, kept inside the body when not wanted), and two arms with ball hands.

The bellows pleats are bones of their own (`bell.0` at the body to `bell.4` at the lens) so the
site can pull the neck in and push it out; `head` is the lens barrel with the screen. `body`
is the camera body. Faces -Y like the rest of the crew; about 0.5 m tall.
"""

import math

import birdkit
import kit
import looks

FACE = 'camerabot'
PREVIEW = dict(lift=0.0, width=0.46)

PLEATS = 5
D = {
    'body': dict(radii=(0.15, 0.095, 0.12), z=0.3),
    'plate': dict(radii=(0.153, 0.098, 0.011)),
    'pleat_y0': -0.105,
    'pleat_pitch': -0.016,
    'barrel': dict(r=0.112, half=0.045, y=-0.226, z=0.3),
    'screen': dict(radii=(0.092, 0.03, 0.092), center=(0, -0.264, 0.3), bezel=0.009),
    'strobe': dict(at=(0.075, -0.005, 0.452)),
    'slot': dict(at=(0, -0.0925, 0.215)),
    'photo': dict(at=(0, -0.052, 0.215), size=(0.045, 0.054, 0.0018)),
    'hip': (0.075, 0.0, 0.19),
    'knee': (0.082, -0.012, 0.108),
    'ankle': (0.082, -0.016, 0.048),
    'foot': dict(radii=(0.052, 0.068, 0.024), center=(0.082, -0.035, 0.024)),
    'shoulder': dict(x=0.158, z=0.35, r=0.026),
    'arm': [(0.16, 0.0, 0.35), (0.19, -0.005, 0.28), (0.205, -0.012, 0.215)],
    'arm_r': 0.0135,
    'hand': dict(center=(0.208, -0.014, 0.19), r=0.03),
}


def mirror_x(p):
    return (-p[0], *p[1:])


def pleat_y(k):
    return D['pleat_y0'] + D['pleat_pitch'] * k


def rig_bones():
    b = D['barrel']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('body', (0, 0, 0.19), (0, 0, 0.3), 'root'),
        ('head', (0, b['y'] + 0.04, b['z']), (0, b['y'] - 0.04, b['z']), 'body'),
        ('strobe', (D['strobe']['at'][0], 0, 0.44), (D['strobe']['at'][0], 0, 0.5), 'body'),
        ('photo', D['photo']['at'], (0, D['photo']['at'][1] - 0.04, D['photo']['at'][2]), 'body'),
    ]
    for k in range(PLEATS):
        y = pleat_y(k)
        bones.append((f'bell.{k}', (0, y + 0.006, b['z']), (0, y - 0.006, b['z']), 'body'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        hp, kn, an = f(D['hip']), f(D['knee']), f(D['ankle'])
        a = D['arm']
        hc = D['hand']['center']
        bones += [
            (f'leg.{sfx}', hp, kn, 'root'),
            (f'foot.{sfx}', kn, an, f'leg.{sfx}'),
            (f'upper_arm.{sfx}', f(a[0]), f(a[1]), 'body'),
            (f'forearm.{sfx}', f(a[1]), f(a[2]), f'upper_arm.{sfx}'),
            (f'hand.{sfx}', f(a[2]), f((hc[0], hc[1], hc[2] - 0.01)), f'forearm.{sfx}'),
        ]
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The camera body: a boxy shell with metal top and bottom plates, a slot, a grip panel.
    bd = D['body']
    add(kit.superellipsoid('Body', bd['radii'], 0.3, 0.35, seg=(40, 24), location=(0, 0, bd['z'])), m['shell'], 'body')
    pr = D['plate']['radii']
    for name, z in (('TopPlate', 0.42), ('BottomPlate', 0.18)):
        add(kit.superellipsoid(name, pr, 0.3, 0.35, seg=(40, 8), location=(0, 0, z)), m['joint'], 'body')
    add(kit.superellipsoid('Grip', (0.125, 0.012, 0.07), 0.3, 0.4, seg=(24, 10), location=(0, -0.088, 0.31)),
        m['bezel'], 'body')
    sl = D['slot']['at']
    add(kit.superellipsoid('Slot', (0.06, 0.012, 0.0058), 0.3, 0.5, seg=(20, 8), location=sl), m['bezel'], 'body')
    for sx in (1, -1):
        add(kit.superellipsoid(f'Lug.{sx}', (0.012, 0.016, 0.016), 0.5, 0.8, seg=(12, 8),
                               location=(sx * 0.152, 0.02, 0.39)), m['joint'], 'body')

    # The top: shutter button, viewfinder and dial.
    add(kit.superellipsoid('Button', (0.014, 0.014, 0.009), 0.5, 1.0, seg=(14, 8), location=(-0.1, 0.0, 0.437)),
        m['role']('Button', 'bezel'), 'body')
    add(kit.superellipsoid('Finder', (0.036, 0.03, 0.022), 0.4, 0.5, seg=(18, 10), location=(-0.045, -0.02, 0.448)),
        m['bezel'], 'body')
    add(kit.superellipsoid('FinderGlass', (0.024, 0.006, 0.011), 0.5, 0.6, seg=(16, 8),
                           location=(-0.045, -0.0495, 0.452)), m['joint'], 'body')
    add(kit.torus('Dial', 0.02, 0.0075, seg=(24, 8), location=(-0.12, -0.01, 0.43)), m['joint'], 'body')

    # The strobe: a flash housing with a lamp on its face.
    s = D['strobe']['at']
    add(kit.superellipsoid('Strobe', (0.05, 0.032, 0.026), 0.35, 0.5, seg=(24, 12), location=s), m['bezel'], 'strobe')
    add(kit.superellipsoid('StrobeLamp', (0.038, 0.01, 0.019), 0.4, 0.6, seg=(20, 10),
                           location=(s[0], s[1] - 0.031, s[2])), m['beacon'], 'strobe')

    # The photo: a card with a picture on it, tucked inside the body behind the slot.
    ph = D['photo']
    pa = ph['at']
    pw, pd, pt = ph['size']
    add(kit.superellipsoid('PhotoCard', (pw, pd, pt), 0.3, 0.3, seg=(16, 8), location=pa),
        m['role']('Card', 'joint'), 'photo')
    add(kit.superellipsoid('PhotoPic', (pw - 0.007, pd - 0.014, pt), 0.3, 0.3, seg=(16, 8),
                           location=(pa[0], pa[1] + 0.006, pa[2] + pt * 1.4)), m['bezel'], 'photo')

    # The bellows: five pleats, wide at the body, narrowing to the lens.
    for k in range(PLEATS):
        w = 0.122 - 0.007 * k
        hgt = 0.098 - 0.0065 * k
        scale = 1.0 if k % 2 == 0 else 0.9
        add(kit.superellipsoid(f'Pleat.{k}', (w * scale, 0.0105, hgt * scale), 0.35, 0.35, seg=(28, 12),
                               location=(0, pleat_y(k), D['barrel']['z'])),
            m['bezel'] if k % 2 == 0 else m['role']('Bellows', 'joint'), f'bell.{k}')

    # The lens barrel: a thick round housing, a rim ring, the glass screen with a bulge.
    b = D['barrel']
    add(kit.superellipsoid('Barrel', (b['r'], b['r'], b['half']), 0.45, 1.0, seg=(48, 20),
                           location=(0, b['y'], b['z']), rotation=(math.pi / 2, 0, 0)), m['shell'], 'head')
    add(kit.torus('LensRim', b['r'] - 0.004, 0.011, seg=(48, 10), location=(0, b['y'] - b['half'] + 0.006, b['z']),
                  rotation=(math.pi / 2, 0, 0)), m['joint'], 'head')
    add(kit.torus('FocusRing', b['r'] + 0.001, 0.006, seg=(48, 8), location=(0, b['y'] + 0.012, b['z']),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Shutter', sc['radii'], sc['center'], sc['bezel'], e=0.9)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    # Legs: a thigh, a knee ball, a shin, and a rounded foot.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        g = (lambda q: q) if side > 0 else mirror_x
        hp, kn, an = g(D['hip']), g(D['knee']), g(D['ankle'])
        up, _ = kit.tube(f'Thigh.{sfx}', [hp, kn], 0.02, ring=12)
        add(up, m['joint'], f'leg.{sfx}')
        lo, _ = kit.tube(f'Shin.{sfx}', [kn, an], 0.018, ring=12)
        add(lo, m['joint'], f'foot.{sfx}')
        add(birdkit.ball(f'Knee.{sfx}', kn, 0.026, seg=(14, 10)), m['shell'], f'foot.{sfx}')
        ft = D['foot']
        add(kit.superellipsoid(f'Foot.{sfx}', ft['radii'], 0.45, 0.6, seg=(24, 12), location=g(ft['center'])),
            m['bezel'], f'foot.{sfx}')

    # Arms: shoulder ball, a short arm, a ball hand.
    sh, hand = D['shoulder'], D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        g = (lambda q: q) if side > 0 else mirror_x
        add(birdkit.ball(f'Shoulder.{sfx}', g((sh['x'], 0, sh['z'])), sh['r'], seg=(18, 12)), m['joint'], 'body')
        arm, ts = kit.tube(f'Arm.{sfx}', kit.resample([g(q) for q in D['arm']], 10), D['arm_r'])
        bend = [min(max((u - 0.4) / 0.25, 0.0), 1.0) for u in ts]
        bend = [w_ * w_ * (3 - 2 * w_) for w_ in bend]
        add(arm, m['shell'], {f'upper_arm.{sfx}': [1 - w_ for w_ in bend], f'forearm.{sfx}': bend})
        add(birdkit.ball(f'Hand.{sfx}', g(hand['center']), hand['r'], seg=(18, 12)), m['joint'], f'hand.{sfx}')

    return looks.finish(kit.armature('CamerabotRig', rig_bones()), parts, skin, m)
