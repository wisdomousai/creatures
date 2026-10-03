"""Pogo, the crew's robot bunny: a toy robot, not a rabbit in a robot suit. A round body
with a seam round its middle, big hip discs over two long flat hind feet (boots with
soles), short front legs, a puck of a tail, and a rounded-box head with a screen face,
a button nose over two cheek pads and a pair of square teeth.

The ears are what he's about. Each is three flat plates on a chain of bones, hinged
at knuckles, so the site can stand them up, fold one over, press them flat back or let
them hang. Every plate has a lit panel on its front, its own material (Dot0..Dot2 up
the left ear, base to tip, Dot3..Dot5 up the right), so the lights can run up and down
the ears in the colour of his mood. The body bone pivots at the hips, so he can sit up
tall on his hind feet; the muzzle rides on its own bone, for twitching. Faces -Y like
the rest of the crew; about 0.57 m to the ear tips.
"""

import math

from mathutils import Euler, Vector

import kit
import looks

FACE = 'bunny'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.105, 0.125, 0.11), center=(0, 0.03, 0.13), e=0.75),
    'band': dict(radii=(0.108, 0.128, 0.008), center=(0, 0.03, 0.13)),
    # Hips: a big disc on each side over the hind foot, with a hub.
    'hip': dict(r=0.066, width=0.02, x=0.1, y=0.055, z=0.086),
    'foot': dict(radii=(0.032, 0.07, 0.02), x=0.086, y=-0.012, z=0.024, e=0.45),
    'sole': dict(radii=(0.034, 0.072, 0.006), z=0.007),
    'arm': dict(x=0.047, top=(-0.07, 0.11), bottom=(-0.092, 0.02), r=0.016),
    'paw': dict(radii=(0.021, 0.027, 0.013)),
    'tail': dict(radii=(0.04, 0.04, 0.024), center=(0, 0.158, 0.105), e=0.45),
    'head': dict(radii=(0.088, 0.078, 0.071), center=(0, -0.07, 0.276), e=0.55),
    'collar': dict(major=0.052, minor=0.011, center=(0, -0.058, 0.212), tilt=0.35),
    # 2:1, like the bunny's face layout (512 x 256)
    'screen': dict(radii=(0.06, 0.02, 0.03), center=(0, -0.14, 0.292), bezel=0.007),
    'cheeks': dict(r=0.021, x=0.019, y=-0.146, z=0.232),
    'nose': dict(radii=(0.012, 0.008, 0.008), center=(0, -0.166, 0.25)),
    'teeth': dict(radii=(0.0065, 0.004, 0.009), x=0.0072, y=-0.153, z=0.207),
    # Ears: from a socket on the head, three plates (length, half-width), splayed out
    # and tipped back a little at rest.
    # A carrot snack that lives in the model: held out in front of the chest, hidden
    # (scaled away) unless he's eating. Leafy end toward the body, tip toward the mouth.
    'carrot': dict(length=0.125, r=0.025, at=(0, -0.135, 0.15), tilt=55),
    'vent': dict(z=0.208, y=0.085, gap=0.014, w=0.05, n=3),
    'whisker': dict(x=0.03, y=-0.15, z=0.244, length=0.05, r=0.0016),
    'ear': dict(x=0.042, y=-0.058, z=0.343, splay=11, back=8, thick=0.014, knuckle=0.0125,
                plates=[(0.06, 0.022), (0.086, 0.032), (0.076, 0.029)]),
}


def ear_frame(side):
    """The ear's turn at rest (an Euler) and its unit direction, base to tip."""
    e = D['ear']
    rot = Euler((-math.radians(e['back']), side * math.radians(e['splay']), 0), 'XYZ')
    return rot, rot.to_matrix() @ Vector((0, 0, 1))


def ear_joints(side):
    """Socket, knuckles and tip of one ear, base to tip."""
    e = D['ear']
    _, d = ear_frame(side)
    at = Vector((side * e['x'], e['y'], e['z']))
    out = [at.copy()]
    for length, _ in e['plates']:
        at = at + d * length
        out.append(at.copy())
    return out


def rig_bones():
    h, f, a = D['hip'], D['foot'], D['arm']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # From the hips forward: pitching it (- up) sits him up tall about his hips.
        ('body', (0, h['y'], h['z']), (0, -0.09, 0.15), 'root'),
        ('head', (0, -0.055, 0.21), (0, -0.07, 0.33), 'body'),
        ('muzzle', (0, -0.15, 0.235), (0, -0.175, 0.235), 'head'),
        ('tail', (0, 0.14, 0.105), (0, 0.19, 0.105), 'body'),
        ('carrot', D['carrot']['at'], (D['carrot']['at'][0], D['carrot']['at'][1] - 0.03, D['carrot']['at'][2] + 0.04),
         'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        j = ear_joints(side)
        parent = 'head'
        for i in range(3):
            bones.append((f'ear.{sfx}.{i + 1}', tuple(j[i]), tuple(j[i + 1]), parent))
            parent = f'ear.{sfx}.{i + 1}'
        bones.append((f'arm.{sfx}', (side * a['x'], *a['top']), (side * a['x'], *a['bottom']), 'body'))
        bones.append((f'leg.{sfx}', (side * h['x'], h['y'], h['z']), (side * f['x'], f['y'] - 0.05, f['z']), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Body, with a seam round its middle, a puck of a tail and a collar under the head.
    b, bd = D['body'], D['band']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(48, 28), location=b['center']), m['shell'],
        'body')
    add(kit.superellipsoid('Band', bd['radii'], 0.3, b['e'], seg=(48, 6), location=bd['center']), m['joint'], 'body')
    t = D['tail']
    add(kit.superellipsoid('Tail', t['radii'], t['e'], 1.0, seg=(24, 12), location=t['center'],
                           rotation=(math.pi / 2, 0, 0)), m['role']('Tail', 'bezel'), 'tail')
    c = D['collar']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(32, 8), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['joint'], 'body')

    # Hind legs: a hip disc with a hub, over a long flat foot on a sole.
    h, f, so = D['hip'], D['foot'], D['sole']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'leg.{sfx}'
        add(kit.superellipsoid(f'Hip.{sfx}', (h['r'], h['r'], h['width']), 0.35, 1.0, seg=(32, 8),
                               location=(side * h['x'], h['y'], h['z']), rotation=(0, math.pi / 2, 0)),
            m['shell'], bone)
        add(kit.superellipsoid(f'Hub.{sfx}', (h['r'] * 0.45, h['r'] * 0.45, h['width'] * 0.6), 0.35, 1.0,
                               seg=(20, 6), location=(side * (h['x'] + h['width'] * 0.75), h['y'], h['z']),
                               rotation=(0, math.pi / 2, 0)), m['joint'], bone)
        add(kit.superellipsoid(f'Foot.{sfx}', f['radii'], f['e'], 0.6, seg=(28, 12),
                               location=(side * f['x'], f['y'], f['z'])), m['shell'], bone)
        add(kit.superellipsoid(f'Sole.{sfx}', so['radii'], 0.3, 0.6, seg=(28, 6),
                               location=(side * f['x'], f['y'], so['z'])), m['joint'], bone)

    # A toe seam on each foot.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'leg.{sfx}'
        for k in (-1, 1):
            add(kit.superellipsoid(f'Toe.{sfx}.{k}', (0.0025, 0.022, 0.0015), 0.4, 0.4, seg=(8, 4),
                                   location=(side * f['x'] + k * 0.0115, f['y'] - 0.036, f['z'] + f['radii'][2] - 0.002)),
                m['joint'], bone)

    # Vent slots across the top of the back.
    v = D['vent']
    for k in range(v['n']):
        add(kit.superellipsoid(f'Vent.{k}', (v['w'] / 2 * (1 - 0.15 * abs(k - 1)), 0.0032, 0.003), 0.4, 0.4,
                               seg=(12, 4), location=(0, v['y'] + (k - 1) * v['gap'] * 0.55, v['z'] - 0.03 * abs(k - 1) * 0.3 + 0.0),
                               rotation=(0.5, 0, 0)), m['joint'], 'body')

    # Front legs: short, a ball at the shoulder, a paw puck.
    a, pw = D['arm'], D['paw']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        top, bottom = (side * a['x'], *a['top']), (side * a['x'], *a['bottom'])
        add(kit.tube(f'Arm.{sfx}', [top, bottom], a['r'], ring=12)[0], m['shell'], f'arm.{sfx}')
        add(kit.superellipsoid(f'Paw.{sfx}', pw['radii'], 0.45, 0.6, seg=(20, 10),
                               location=(bottom[0], bottom[1] - 0.006, pw['radii'][2])), m['joint'], f'arm.{sfx}')

    # Head: screen face, cheek pads with a button nose, two teeth.
    hd = D['head']
    add(kit.superellipsoid('Head', hd['radii'], hd['e'], hd['e'], seg=(40, 28), location=hd['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Bunny', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    ch, n, th = D['cheeks'], D['nose'], D['teeth']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Cheek.{sfx}', (ch['r'], ch['r'] * 0.85, ch['r'] * 0.9), 0.8, 0.8, seg=(20, 12),
                               location=(side * ch['x'], ch['y'], ch['z'])), m['shell'], 'muzzle')
        add(kit.superellipsoid(f'Tooth.{sfx}', th['radii'], 0.3, 0.3, seg=(8, 6),
                               location=(side * th['x'], th['y'], th['z'])), m['role']('Teeth', 'joint'), 'muzzle')
    add(kit.superellipsoid('Nose', n['radii'], 0.6, 0.7, seg=(16, 10), location=n['center']),
        m['role']('Nose', 'bezel'), 'muzzle')

    # Whiskers: short rods either side of the nose, twitching with it.
    w = D['whisker']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, (dz, ang) in enumerate(((0.008, 0.35), (-0.004, 0.0), (-0.016, -0.35))):
            end = (side * (w['x'] + w['length'] * math.cos(ang)), w['y'] - 0.006, w['z'] + dz + w['length'] * math.sin(ang))
            add(kit.tube(f'Whisker.{sfx}.{k}', [(side * w['x'], w['y'], w['z'] + dz), end], w['r'], ring=6)[0],
                m['joint'], 'muzzle')

    # The carrot: a faceted cone with rings, and a tuft of leaves at the fat end.
    ca = D['carrot']
    L, R = ca['length'], ca['r']
    tilt = math.radians(ca['tilt'])
    # Local Z runs leaf end (top) to tip (bottom); turned so the tip points forward and up.
    rot = (math.pi / 2 + tilt, 0, 0)
    add(kit.lathe('Carrot', [(0.0, L / 2 + 0.002), (R * 0.9, L / 2), (R, L * 0.32), (R * 0.72, -L * 0.1),
                             (R * 0.38, -L * 0.34), (0.0, -L / 2)], seg=8, location=ca['at'], rotation=rot),
        m['role']('Carrot', 'joint'), 'carrot')
    for k, z in enumerate((0.22, -0.02)):
        add(kit.torus(f'Ring.{k}', R * (0.98 - 0.32 * (0.5 - z) ** 1 * 0.9), 0.0025, seg=(12, 4),
                      location=tuple(Vector(ca['at']) + Euler(rot).to_matrix() @ Vector((0, 0, L * z))), rotation=rot),
            m['role']('Leaf', 'joint'), 'carrot')
    for k, a in enumerate((0, 2.1, 4.2)):
        d = Euler(rot).to_matrix()
        base = Vector(ca['at']) + d @ Vector((0, 0, L / 2))
        tip = base + d @ Vector((0.022 * math.cos(a), 0.022 * math.sin(a), 0.04))
        add(kit.tube(f'Leaf.{k}', [tuple(base), tuple(tip)], [0.0055, 0.0035], ring=6)[0],
            m['role']('Leaf', 'joint'), 'carrot')

    # Ears: a socket on the head, then three plates hinged at knuckles, each with a lit
    # panel on its front.
    e = D['ear']
    for side, sfx, first in ((1, 'L', 0), (-1, 'R', 3)):
        rot, d = ear_frame(side)
        across = rot.to_matrix() @ Vector((1, 0, 0))
        front = rot.to_matrix() @ Vector((0, -1, 0))
        j = ear_joints(side)
        add(kit.superellipsoid(f'Socket.{sfx}', (0.024, 0.02, 0.012), 0.4, 1.0, seg=(20, 6), location=tuple(j[0]),
                               rotation=rot), m['joint'], 'head')
        for i, (length, hw) in enumerate(e['plates']):
            bone = f'ear.{sfx}.{i + 1}'
            mid = (j[i] + j[i + 1]) / 2
            tip = i == 2
            # The last plate is rounder, for the tip; the others end square at the knuckles.
            add(kit.superellipsoid(f'Ear.{sfx}.{i}', (hw, e['thick'], length / 2 + (0 if tip else 0.004)),
                                   0.8 if tip else 0.45, 0.35, seg=(20, 12), location=tuple(mid), rotation=rot),
                m['shell'], bone)
            add(kit.superellipsoid(f'Panel.{sfx}.{i}', (hw * 0.62, 0.005, length * 0.36), 0.6 if tip else 0.4, 0.4,
                                   seg=(16, 8), location=tuple(mid + front * (e['thick'] - 0.001)), rotation=rot),
                m['dot'](first + i), bone)
            # A knuckle at the base of every plate: the hinge it bends on.
            k = j[i]
            span = hw * (0.8 if i else 1.0)
            add(kit.tube(f'Knuckle.{sfx}.{i}', [tuple(k - across * span), tuple(k + across * span)], e['knuckle'],
                         ring=12)[0], m['joint'], bone)

    # ---- Refinement: pins, rims, bolts, layered plates ----
    def ball(name, radii, at, mat, bone, e=0.5, rot=(0, 0, 0)):
        return add(kit.superellipsoid(name, radii, e, e, seg=(12, 6), location=tuple(at), rotation=rot), mat, bone)

    # Ears: a rim round every lit panel, a pin cap on either end of every knuckle, and
    # a pair of bolts on the two long plates.
    for side, sfx, first in ((1, 'L', 0), (-1, 'R', 3)):
        rot, d = ear_frame(side)
        across = rot.to_matrix() @ Vector((1, 0, 0))
        front = rot.to_matrix() @ Vector((0, -1, 0))
        j = ear_joints(side)
        for i, (length, hw) in enumerate(e['plates']):
            bone = f'ear.{sfx}.{i + 1}'
            mid = (j[i] + j[i + 1]) / 2
            tip = i == 2
            add(kit.superellipsoid(f'Rim.{sfx}.{i}', (hw * 0.62 + 0.006, 0.004, length * 0.36 + 0.006),
                                   0.6 if tip else 0.4, 0.4, seg=(16, 8),
                                   location=tuple(mid + front * (e['thick'] - 0.0035)), rotation=rot),
                m['bezel'], bone)
            span = hw * (0.8 if i else 1.0)
            for pin in (-1, 1):
                ball(f'Pin.{sfx}.{i}.{pin}', (0.0062, 0.0062, 0.0062), j[i] + across * pin * (span + 0.003), m['bezel'],
                     bone, 0.6)
            if i < 2:
                for pin in (-1, 1):
                    for up in (-1, 1):
                        ball(f'EarBolt.{sfx}.{i}.{pin}.{up}', (0.0034, 0.0022, 0.0034),
                             mid + across * pin * hw * 0.8 + d * up * length * 0.38 + front * (e['thick'] - 0.001),
                             m['joint'], bone, 0.5, rot)
        # A cap over the socket, on the side of the head.
        ball(f'Port.{sfx}', (0.006, 0.02, 0.02), (side * 0.0865, -0.05, 0.27), m['joint'], 'head', 0.4)
        ball(f'PortBolt.{sfx}', (0.0032, 0.007, 0.007), (side * 0.0925, -0.05, 0.27), m['bezel'], 'head', 0.6)

    # A fluffy tail: a puck of layered little plates, petals round its rim and a hub.
    t = D['tail']
    tail = m['role']('Tail', 'bezel')
    for k, (rr, hh, y) in enumerate(((0.032, 0.011, 0.184), (0.021, 0.009, 0.198))):
        add(kit.superellipsoid(f'TailPlate.{k}', (rr, rr, hh), 0.45, 1.0, seg=(20, 8),
                               location=(0, y, t['center'][2]), rotation=(math.pi / 2, 0, 0)), tail, 'tail')
    for k in range(9):
        a = 2 * math.pi * k / 9 + 0.2
        add(kit.superellipsoid(f'Fluff.{k}', (0.013, 0.013, 0.0085), 0.6, 0.6, seg=(10, 6),
                               location=(0.036 * math.cos(a), 0.172, t['center'][2] + 0.036 * math.sin(a)),
                               rotation=(0, -a, 0)), tail, 'tail')
    ball('TailHub', (0.008, 0.008, 0.005), (0, 0.208, t['center'][2]), m['joint'], 'tail', 0.5, (math.pi / 2, 0, 0))

    # Boots: toe caps, tread on the soles (lugs down the sides, bars underneath) and a
    # coiled spring at each heel.
    h, f, so = D['hip'], D['foot'], D['sole']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'leg.{sfx}'
        fx = side * f['x']
        add(kit.superellipsoid(f'ToeCap.{sfx}', (0.029, 0.02, 0.02), 0.5, 0.6, seg=(20, 10),
                               location=(fx, f['y'] - 0.06, f['z'] + 0.001)), m['role']('Toe', 'joint'), bone)
        for k in range(5):
            y = f['y'] - 0.045 + 0.02 * k
            add(kit.superellipsoid(f'Tread.{sfx}.{k}', (0.026, 0.0038, 0.0016), 0.4, 0.4, seg=(10, 4),
                                   location=(fx, y, 0.0012)), m['bezel'], bone)
            for lug in (-1, 1):
                ball(f'Lug.{sfx}.{k}.{lug}', (0.004, 0.0075, 0.005), (fx + lug * 0.0335, y, 0.009), m['bezel'], bone,
                     0.5)
        for k in range(3):
            add(kit.torus(f'Spring.{sfx}.{k}', 0.0105, 0.0026, seg=(14, 6),
                          location=(fx, f['y'] + 0.075 + 0.0075 * k, 0.024), rotation=(math.pi / 2, 0, 0)),
                m['bezel'], bone)
        ball(f'HeelPlate.{sfx}', (0.02, 0.006, 0.014), (fx, f['y'] + 0.063, 0.024), m['joint'], bone, 0.4)

        # Hips: a rim round the disc, the screws moved out onto its face, and a dial on
        # the hub with a needle.
        face = h['x'] + h['width'] + 0.0012
        add(kit.torus(f'HipRim.{sfx}', 0.058, 0.0032, seg=(36, 6), location=(side * face, h['y'], h['z']),
                      rotation=(0, math.pi / 2, 0)), m['bezel'], bone)
        add(kit.torus(f'Dial.{sfx}', 0.037, 0.0024, seg=(28, 6),
                      location=(side * (face + 0.0008), h['y'], h['z']), rotation=(0, math.pi / 2, 0)), m['bezel'], bone)
        for k in range(8):
            a = k * math.pi / 4
            ball(f'Tick.{sfx}.{k}', (0.0022, 0.0022, 0.0022), (side * (face + 0.001), h['y'] + 0.0445 * math.cos(a),
                                                               h['z'] + 0.0445 * math.sin(a)), m['joint'], bone)
        ball(f'Needle.{sfx}', (0.0028, 0.0035, 0.015), (side * (h['x'] + h['width'] * 0.75 + 0.014), h['y'] - 0.006,
                                                         h['z'] + 0.014), m['bezel'], bone, 0.5, (0.5, 0, 0))
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            ball(f'FaceScrew.{sfx}.{k}', (0.0042, 0.0065, 0.0065), (side * (face + 0.0005), h['y'] + 0.05 * math.cos(a),
                                                                    h['z'] + 0.05 * math.sin(a)), m['joint'], bone, 0.5)

    # Whisker pods, a belly plate with bolts and slots, a bow tie of plates.
    w = D['whisker']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ball(f'Pod.{sfx}', (0.0095, 0.007, 0.0095), (side * (w['x'] + 0.004), w['y'] - 0.006, w['z'] - 0.004),
             m['bezel'], 'muzzle', 0.6)
    add(kit.superellipsoid('Belly', (0.04, 0.014, 0.05), 0.45, 0.45, seg=(24, 10), location=(0, -0.089, 0.124)),
        m['role']('Belly', 'bezel'), 'body')
    for k in range(3):
        add(kit.superellipsoid(f'BellySlot.{k}', (0.02, 0.0028, 0.0022), 0.4, 0.4, seg=(10, 4),
                               location=(0, -0.1015, 0.104 + 0.012 * k)), m['joint'], 'body')
    for pin in (-1, 1):
        ball(f'BellyBolt.{pin}', (0.0042, 0.0032, 0.0042), (pin * 0.03, -0.1, 0.156), m['joint'], 'body', 0.5,
             (math.pi / 2, 0, 0))
    bow = m['role']('Bow', 'bezel')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'BowWing.{sfx}', (0.021, 0.006, 0.0125), 0.35, 0.5, seg=(14, 8),
                               location=(side * 0.0225, -0.11, 0.194), rotation=(0, side * 0.4, 0)), bow, 'body')
    add(kit.superellipsoid('BowKnot', (0.0085, 0.0075, 0.0085), 0.4, 0.4, seg=(12, 8), location=(0, -0.1125, 0.194)),
        m['joint'], 'body')

    return looks.finish(kit.armature('BunnyRig', rig_bones()), parts, skin, m)
