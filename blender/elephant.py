"""Mist, the crew's robot baby elephant: a round toy calf on four stubby
column legs with big round feet and toenails, a big round head, two dish ear flaps on hinges
(each with a pink inner panel and a lit rim), a trunk in four segments joined by ball
joints and collar rings that ends in a lit tip, two cream tusk nubs, and a thin tail with a
lit tuft. A forehead lamp is the beacon. The trunk's four bones (trunk.1..4) let it curl, rise
and sway; six tiny drops on bones of their own (spray.1..6, shrunk to nothing by the site until
she sprays) come out of the tip.

Same rig as the cats (root, body, head, ear.L/R, tail.1..2, leg.FL/FR/BL/BR) plus the trunk.
Lights: Dot0 the trunk tip, Dot1 the ear rims, Dot2 the tail tuft, Dot3 the toenails.
Faces -Y like the rest of the crew; about 0.62 m to the tops of the ears.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'elephant'
PREVIEW = dict(lift=0.0, width=0.7)

D = {
    'body': dict(radii=(0.165, 0.235, 0.155), center=(0, 0.05, 0.27), e=0.6),
    'neck': dict(radii=(0.12, 0.1, 0.11), center=(0, -0.14, 0.3), e=0.7),
    'head': dict(radii=(0.175, 0.15, 0.155), center=(0, -0.265, 0.395), e=0.72),
    'screen': dict(radii=(0.125, 0.07, 0.07), center=(0, -0.36, 0.425), bezel=0.009, e=0.45),
    'trunk': [(0, -0.365, 0.345), (0, -0.405, 0.265), (0, -0.44, 0.185), (0, -0.465, 0.11), (0, -0.47, 0.045)],
    'trunk_r': (0.054, 0.048, 0.042, 0.036, 0.031),
    'ear': dict(x=0.235, y=-0.215, z=0.455, r=0.15, half=0.011, flare=0.5),
    'legs': dict(x=0.105, front=-0.1, back=0.2, top=0.2, r=0.058),
    'foot': dict(radii=(0.072, 0.082, 0.032)),
    'tail': [(0, 0.285, 0.3), (0, 0.325, 0.24), (0, 0.335, 0.17)],
}
TRUNK = ('trunk.1', 'trunk.2', 'trunk.3', 'trunk.4')
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def rig_bones():
    lg, e = D['legs'], D['ear']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.2, 0.26), (0, -0.09, 0.3), 'root'),
        ('head', (0, -0.15, 0.3), (0, -0.27, 0.54), 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * 0.15, -0.325, 0.455), (side * 0.25, -0.24, 0.455), 'head'))
    tr = D['trunk']
    parent = 'head'
    for i, name in enumerate(TRUNK):
        bones.append((name, tr[i], tr[i + 1], parent))
        parent = name
    t = D['tail']
    bones.append(('tail.1', t[0], t[1], 'body'))
    bones.append(('tail.2', t[1], t[2], 'tail.1'))
    for name, side, end in LEGS:
        x = side * lg['x']
        bones.append((f'leg.{name}', (x, lg[end], lg['top']), (x, lg[end], 0.0), 'body'))
    for i in range(1, 7):
        bones.append((f'spray.{i}', (0, -0.5, 0.35), (0, -0.5, 0.36), 'root'))
    return bones


def ring_along(name, a, b, t, r, minor=0.0045):
    a, b = Vector(a), Vector(b)
    rot = (b - a).to_track_quat('Z', 'Y').to_euler()
    return kit.torus(name, r, minor, seg=(24, 6), location=tuple(a + (b - a) * t), rotation=tuple(rot))


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

    # ----- head: shell, screen, forehead lamp, tusk nubs
    h, sc = D['head'], D['screen']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(48, 32), location=h['center']), m['shell'],
        'head')
    glass, rim = kit.screen('Elephant', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    hc = h['center']
    add(kit.superellipsoid('Lamp', (0.032, 0.026, 0.02), 0.5, 0.7, seg=(18, 10),
                           location=(0, hc[1] + 0.005, hc[2] + h['radii'][2] - 0.002)), m['beacon'], 'head')
    add(kit.torus('LampRing', 0.035, 0.0045, seg=(24, 6), location=(0, hc[1] + 0.005, hc[2] + h['radii'][2] - 0.012)),
        m['bezel'], 'head')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        tusk = kit.lathe(f'Tusk.{sfx}', [(0.0, 0.03), (0.01, 0.027), (0.02, 0.014), (0.032, 0.0)], seg=14)
        tusk.location = (side * 0.07, -0.385, 0.32)
        tusk.rotation_euler = (math.radians(-125), 0, side * 0.2)
        add(tusk, m['role']('Tusk', 'bezel'), 'head')
        add(kit.superellipsoid(f'TuskCap.{sfx}', (0.016, 0.016, 0.01), 0.5, 0.7, seg=(12, 8),
                               location=(side * 0.07, -0.378, 0.335)), m['joint'], 'head')
        for k, dz in enumerate((-0.04, 0.04)):
            bolt(f'TempleBolt.{sfx}{k}', (side * 0.158, -0.33, 0.4 + dz), 0.0062, 'head', (0, 0, math.pi / 2))

    # ----- ears: dish flaps with an inner panel and a lit rim, on a hinge bar
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        c = (side * e['x'], e['y'], e['z'])
        rot = (0, math.pi / 2, -side * e['flare'])
        add(kit.superellipsoid(f'Ear.{sfx}', (e['r'], e['r'] * 0.96, e['half']), 0.35, 1.0, seg=(40, 8), location=c,
                               rotation=rot), m['shell'], f'ear.{sfx}')
        n = Vector((side * math.cos(e['flare']), -math.sin(e['flare']), 0))
        add(kit.superellipsoid(f'EarInner.{sfx}', (e['r'] * 0.72, e['r'] * 0.7, 0.006), 0.4, 1.0, seg=(32, 6),
                               location=tuple(Vector(c) + n * (e['half'] + 0.002)), rotation=rot),
            m['role']('Inner', 'joint'), f'ear.{sfx}')
        add(kit.torus(f'EarRim.{sfx}', e['r'] * 0.97, 0.0065, seg=(40, 8), location=tuple(Vector(c) + n * (e['half'] + 0.001)),
                      rotation=rot), m['dot'](1), f'ear.{sfx}')
        # Veins: three seams fanning from the hinge across the inner panel.
        up = Vector((0, 0, 1))
        flat = n.cross(up).normalized()  # across the flap, toward its hinge edge (sign aside)
        for k, a in enumerate((-0.5, 0.0, 0.5)):
            p0 = Vector(c) + n * (e['half'] + 0.006) + flat * (-e['r'] * 0.6 * side)
            p1 = Vector(c) + n * (e['half'] + 0.006) + (flat * math.cos(a) * side + up * math.sin(a)) * e['r'] * 0.6
            add(kit.tube(f'Vein.{sfx}{k}', [tuple(p0), tuple(p1)], 0.0028, ring=6)[0], m['joint'], f'ear.{sfx}')
        add(kit.tube(f'Hinge.{sfx}', [(side * 0.13, -0.31, 0.455), (side * 0.2, -0.285, 0.455)], 0.012, ring=10)[0],
            m['joint'], f'ear.{sfx}')
        add(kit.superellipsoid(f'HingeKnob.{sfx}', (0.017, 0.017, 0.017), seg=(14, 10),
                               location=(side * 0.153, -0.325, 0.455)), m['bezel'], f'ear.{sfx}')

    # ----- trunk: segments on ball joints, collar rings, a lit tip
    tr, rr = D['trunk'], D['trunk_r']
    for i, name in enumerate(TRUNK):
        a, b = tr[i], tr[i + 1]
        add(kit.tube(f'Trunk{i}', [a, b], [rr[i], rr[i + 1] * 1.04], ring=16)[0], m['role']('Trunk', 'shell'), name)
        add(kit.superellipsoid(f'TrunkBall{i}', (rr[i] * 1.12,) * 3, seg=(18, 12), location=a), m['joint'], name)
        add(ring_along(f'TrunkRing{i}', a, b, 0.55, rr[i] * 1.08), m['bezel'], name)
        add(ring_along(f'TrunkBand{i}', a, b, 0.88, rr[i + 1] * 1.06, 0.0034), m['joint'], name)
    add(kit.superellipsoid('TrunkTip', (0.034, 0.034, 0.026), 0.6, 0.8, seg=(20, 12),
                           location=(tr[-1][0], tr[-1][1] - 0.002, tr[-1][2] - 0.012)), m['dot'](0), 'trunk.4')
    add(kit.torus('TrunkTipRim', 0.032, 0.0042, seg=(24, 6), location=(tr[-1][0], tr[-1][1], tr[-1][2] + 0.002)),
        m['bezel'], 'trunk.4')
    # Two little nostril ports on the tip.
    for side in (-1, 1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.006, 0.006, 0.004), seg=(8, 6),
                               location=(side * 0.012, tr[-1][1] - 0.01, tr[-1][2] - 0.034)), m['bezel'], 'trunk.4')

    # ----- body: neck, torso, belly plate, seams, a riding blanket on the back
    b, nk = D['body'], D['neck']
    add(kit.superellipsoid('Neck', nk['radii'], nk['e'], nk['e'], seg=(28, 20), location=nk['center']), m['shell'],
        'body')
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(52, 36), location=b['center']), m['shell'],
        'body')
    add(kit.superellipsoid('Belly', (0.1, 0.02, 0.085), 0.4, 0.6, seg=(24, 14), location=(0, -0.168, 0.255)),
        m['role']('Belly', 'joint'), 'body')
    for dx in (-1, 1):
        for dz in (-1, 1):
            bolt(f'BellyBolt.{dx}{dz}', (dx * 0.075, -0.189, 0.255 + dz * 0.062), 0.0058, 'body', (math.pi / 2, 0, 0))
    for i, y in enumerate((-0.08, 0.13, 0.25)):
        k = max(1 - abs((y - b['center'][1]) / b['radii'][1]) ** (2 / b['e']), 0.01) ** (b['e'] / 2)
        pts = [(b['radii'][0] * k * 1.012 * kit.spow(math.cos(2 * math.pi * j / 48), b['e']), y,
                b['center'][2] + b['radii'][2] * k * 1.012 * kit.spow(math.sin(2 * math.pi * j / 48), b['e']))
               for j in range(49)]
        add(kit.tube(f'Seam{i}', pts, 0.0034, ring=6)[0], m['joint'], 'body')
    add(kit.superellipsoid('Blanket', (0.13, 0.14, 0.02), 0.3, 0.5, seg=(24, 16), location=(0, 0.06, 0.418)),
        m['role']('Blanket', 'bezel'), 'body')
    for dx in (-1, 1):
        for dy in (-1, 1):
            bolt(f'BlanketBolt.{dx}{dy}', (dx * 0.1, 0.06 + dy * 0.1, 0.436), 0.0058, 'body', (0, 0, 0))
    add(kit.tube('BlanketTrim', [(-0.135, 0.06, 0.416), (0.0, 0.06, 0.442), (0.135, 0.06, 0.416)], 0.0045, ring=8)[0],
        m['dot'](2), 'body')

    # ----- tail: a thin tube with a lit tuft
    t = D['tail']
    tube, ts = kit.tube('Tail', kit.spline(t, 14), [0.017 - 0.008 * i / 13 for i in range(14)], ring=10)
    add(tube, m['shell'], kit.chain(ts, ['tail.1', 'tail.2']))
    add(kit.superellipsoid('Tuft', (0.026, 0.02, 0.034), 0.6, 0.6, seg=(16, 10), location=(t[-1][0], t[-1][1] + 0.004,
                                                                                         t[-1][2] - 0.01)), m['dot'](2),
        'tail.2')
    add(kit.superellipsoid('TailHub', (0.03, 0.03, 0.03), seg=(14, 10), location=t[0]), m['joint'], 'body')

    # ----- legs: columns with hip balls, knee rings and round feet with toenails
    lg, ft = D['legs'], D['foot']
    for name, side, end in LEGS:
        x, y = side * lg['x'], lg[end]
        leg = f'leg.{name}'
        top, r = lg['top'], lg['r']
        add(kit.tube(f'Leg.{name}', [(x, y, top), (x, y, top * 0.5), (x, y, 0.035)], [r * 1.12, r, r * 1.0], ring=16)[0],
            m['shell'], leg)
        add(kit.superellipsoid(f'Hip.{name}', (r * 1.2, r * 1.2, r * 1.0), seg=(18, 12), location=(x, y, top)), m['joint'],
            leg)
        add(kit.torus(f'Knee.{name}', r * 1.06, 0.0052, seg=(28, 6), location=(x, y, top * 0.52)), m['bezel'], leg)
        add(kit.torus(f'Ankle.{name}', r * 1.1, 0.0052, seg=(28, 6), location=(x, y, 0.07)), m['joint'], leg)
        add(kit.superellipsoid(f'Foot.{name}', ft['radii'], 0.5, 0.6, seg=(26, 16), location=(x, y - 0.006, ft['radii'][2])),
            m['role']('Foot', 'joint'), leg)
        for k in (-1, 0, 1):
            ang = k * 0.5
            add(kit.superellipsoid(f'Nail.{name}{k}', (0.014, 0.01, 0.011), 0.6, 0.8, seg=(10, 8),
                                   location=(x + 0.07 * math.sin(ang) * 0.9, y - 0.006 - 0.078 * math.cos(ang) * 0.95, 0.03)),
                m['dot'](3), leg)

    # The spray: six drops on bones of their own, hidden by the site until she sprays.
    for i in range(1, 7):
        add(kit.superellipsoid(f'Spray.{i}', (0.013, 0.013, 0.016), seg=(10, 8), location=(0, -0.5, 0.355)),
            m['dot'](0), f'spray.{i}')

    return looks.finish(kit.armature('ElephantRig', rig_bones()), parts, skin, m)
