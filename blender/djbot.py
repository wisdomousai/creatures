"""Wax, the crew's robot DJ: a speaker cabinet with two big woofers on its front, a turntable
deck on top with a big spinning record (lit rim, label ring and a lit mark, Dot6) and a stout tone arm, and a screen head with a pair of big
headphones round it, all on two stubby legs.

The woofers are bones (`woofer.L`, `woofer.R`) so the cones can pump; each is ringed by three
lit rings (Dot0..Dot2 on the left, Dot3..Dot5 on the right, innermost first) that the site
runs outward with the beat. `record` is a bone that spins about the vertical axis, `tonearm`
swings over it from its rest. `body` is the cabinet, `head` the screen head with the
headphones and a beacon on the band. Faces -Y like the rest of the crew; about 0.69 m tall.
"""

import math

from mathutils import Matrix, Vector

import birdkit
import kit
import looks

FACE = 'djbot'
PREVIEW = dict(lift=0.0, width=0.46)

# The turntable is tipped toward the viewer, like a deck on a stand, so the record, its lit rim
# and the tone arm show from the site's camera instead of lying edge-on: everything on it is
# turned TILT degrees about the side axis through PIVOT (the back edge up, the front edge down).
TILT = 26
PIVOT = Vector((0, -0.012, 0.395))


def tilted(p):
    """A point of the flat turntable, tipped."""
    return tuple(Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(TILT), 4, 'X') @ Matrix.Translation(-PIVOT) @ Vector(p))


# The axis the record and its bone turn about (the deck's normal, tipped toward the viewer).
NORMAL = (0.0, -math.sin(math.radians(TILT)), math.cos(math.radians(TILT)))


D = {
    'cab': dict(radii=(0.17, 0.1, 0.105), z=0.255),
    'deck': dict(radii=(0.168, 0.118, 0.0085), z=0.388, y=-0.012),
    'platter': dict(at=(-0.03, -0.012, 0.406), r=0.114),
    'record': dict(at=(-0.03, -0.012, 0.412), r=0.108),
    'arm_base': (0.15, 0.065, 0.412),
    'arm_tip': (0.15, -0.09, 0.437),
    'woofer': dict(x=0.078, y=-0.1, z=0.25, r=0.056),
    'head': dict(radii=(0.122, 0.098, 0.088), z=0.535),
    # 16:9, like the face layout (512 x 288)
    'screen': dict(radii=(0.102, 0.03, 0.0574), center=(0, -0.0955, 0.54), bezel=0.009),
    'band': [(-0.138, 0.0, 0.535), (-0.125, 0.0, 0.615), (0.0, 0.0, 0.66), (0.125, 0.0, 0.615), (0.138, 0.0, 0.535)],
    'cup': dict(x=0.136, radii=(0.032, 0.052, 0.052)),
    'beacon': dict(at=(0, 0.0, 0.675), r=0.017),
    'hip': (0.085, 0.0, 0.15),
    'knee': (0.09, -0.01, 0.098),
    'ankle': (0.09, -0.012, 0.05),
    'foot': dict(radii=(0.052, 0.066, 0.024), center=(0.09, -0.03, 0.024)),
    'shoulder': dict(x=0.175, z=0.335, r=0.026),
    'arm': [(0.176, 0.0, 0.335), (0.206, -0.006, 0.265), (0.22, -0.014, 0.2)],
    'arm_r': 0.0135,
    'hand': dict(center=(0.223, -0.016, 0.176), r=0.03),
}


def mirror_x(p):
    return (-p[0], *p[1:])


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('body', (0, 0, 0.15), (0, 0, 0.3), 'root'),
        ('neck', (0, 0, 0.36), (0, 0, 0.48), 'body'),
        ('head', (0, 0, 0.48), (0, 0, 0.64), 'neck'),
        ('record', tilted(D['record']['at']), tilted(tuple(Vector(D['record']['at']) + Vector((0, 0, 0.03)))), 'body'),
        ('tonearm', tilted(D['arm_base']), tilted(tuple(Vector(D['arm_base']) + Vector((0, 0, 0.03)))), 'body'),
    ]
    w = D['woofer']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        hp, kn, an = f(D['hip']), f(D['knee']), f(D['ankle'])
        a = D['arm']
        hc = D['hand']['center']
        bones += [
            (f'woofer.{sfx}', f((w['x'], w['y'] + 0.02, w['z'])), f((w['x'], w['y'] - 0.02, w['z'])), 'body'),
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

    rot_x = (math.pi / 2, 0, 0)
    tip = Matrix.Translation(PIVOT) @ Matrix.Rotation(math.radians(TILT), 4, 'X') @ Matrix.Translation(-PIVOT)

    def tadd(obj, mat, bone):
        """Add a part of the turntable, tipped with it (its mesh moved, so its bone stays simple)."""
        obj.data.transform(tip @ obj.matrix_basis)
        obj.location, obj.rotation_euler = (0, 0, 0), (0, 0, 0)
        return add(obj, mat, bone)

    # The cabinet: a boxy speaker with a metal base rail, top deck, corner caps and a tweeter.
    c = D['cab']
    add(kit.superellipsoid('Cabinet', c['radii'], 0.3, 0.3, seg=(40, 24), location=(0, 0, c['z'])), m['shell'], 'body')
    add(kit.superellipsoid('Rail', (0.172, 0.102, 0.012), 0.3, 0.3, seg=(40, 8), location=(0, 0, 0.158)),
        m['joint'], 'body')
    dk = D['deck']
    tadd(kit.superellipsoid('Deck', dk['radii'], 0.3, 0.35, seg=(40, 8), location=(0, dk['y'], dk['z'])),
        m['bezel'], 'body')
    for sx in (1, -1):
        add(kit.superellipsoid(f'Handle.{sx}', (0.01, 0.04, 0.012), 0.5, 0.6, seg=(14, 8),
                               location=(sx * 0.172, 0.0, 0.3)), m['joint'], 'body')
    add(kit.superellipsoid('Tweeter', (0.022, 0.01, 0.022), 0.5, 1.0, seg=(20, 10),
                           location=(0, -0.1, 0.33), rotation=(0, 0, 0)), m['bezel'], 'body')
    for n, x in enumerate((-0.04, 0.0, 0.04)):
        add(kit.superellipsoid(f'Knob.{n}', (0.0095, 0.0095, 0.009), 0.6, 1.0, seg=(12, 8),
                               location=(x, -0.1, 0.19), rotation=rot_x), m['role']('Knob', 'joint'), 'body')

    # Two woofers, each a surround ring, a cone and a cap, ringed by three lit rings.
    w = D['woofer']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        cx = side * w['x']
        add(kit.torus(f'Surround.{sfx}', w['r'], 0.0085, seg=(40, 8), location=(cx, w['y'] + 0.003, w['z']),
                      rotation=rot_x), m['bezel'], 'body')
        add(kit.superellipsoid(f'Cone.{sfx}', (w['r'] - 0.004, w['r'] - 0.004, 0.02), 0.5, 1.0, seg=(40, 12),
                               location=(cx, w['y'] + 0.012, w['z']), rotation=(-math.pi / 2, 0, 0)),
            m['role']('Cone', 'bezel'), f'woofer.{sfx}')
        add(birdkit.ball(f'Cap.{sfx}', (cx, w['y'] - 0.002, w['z']), 0.017, seg=(16, 10)), m['joint'], f'woofer.{sfx}')
        for k, r in enumerate((0.069, 0.079, 0.089)):
            add(kit.torus(f'Ring.{sfx}.{k}', r, 0.0036, seg=(48, 6), location=(cx, w['y'] + 0.001, w['z']),
                          rotation=rot_x), m['dot'](k + (0 if side > 0 else 3)), 'body')

    # The turntable: a platter, the record with a label and grooves, the tone arm on its post.
    pl = D['platter']
    tadd(kit.superellipsoid('Platter', (pl['r'], pl['r'], 0.007), 0.4, 1.0, seg=(40, 8), location=pl['at']),
        m['joint'], 'body')
    rc = D['record']
    tadd(kit.superellipsoid('Record', (rc['r'], rc['r'], 0.003), 0.4, 1.0, seg=(40, 8), location=rc['at']),
        m['role']('Vinyl', 'bezel'), 'record')
    z = rc['at'][2] + 0.0032
    # Grooves, a lit rim and a lit label ring (Dot6) so the record reads from across the room, and
    # a lit mark that goes round with it (so the spin and the scratch show).
    for k, r in enumerate((0.09, 0.07, 0.052)):
        add(kit.torus(f'Groove.{k}', r, 0.0022, seg=(48, 4), location=(rc['at'][0], rc['at'][1], z)),
            m['joint'], 'record')
    tadd(kit.torus('RimLight', 0.1, 0.0032, seg=(56, 6), location=(rc['at'][0], rc['at'][1], z)), m['dot'](6), 'record')
    tadd(kit.superellipsoid('Label', (0.04, 0.04, 0.0036), 0.4, 1.0, seg=(24, 6),
                           location=(rc['at'][0], rc['at'][1], rc['at'][2] + 0.0015)),
        m['role']('Label', 'shell'), 'record')
    tadd(kit.torus('LabelRing', 0.034, 0.0028, seg=(36, 6), location=(rc['at'][0], rc['at'][1], z + 0.0006)),
        m['dot'](6), 'record')
    tadd(kit.superellipsoid('Mark', (0.011, 0.03, 0.0034), 0.4, 0.5, seg=(14, 8),
                           location=(rc['at'][0] + 0.07, rc['at'][1], z)), m['dot'](6), 'record')
    tadd(kit.superellipsoid('Spindle', (0.006, 0.006, 0.01), 0.5, 1.0, seg=(10, 6),
                           location=(rc['at'][0], rc['at'][1], rc['at'][2] + 0.007)), m['joint'], 'record')
    ab, at = D['arm_base'], D['arm_tip']
    tadd(kit.superellipsoid('ArmPost', (0.026, 0.026, 0.016), 0.5, 1.0, seg=(18, 8), location=(ab[0], ab[1], ab[2] - 0.006)),
        m['joint'], 'body')
    tube, _ = kit.tube('ToneArm', [(ab[0], ab[1], ab[2] + 0.012), (ab[0], (ab[1] + at[1]) / 2, at[2] + 0.004),
                                    (at[0], at[1], at[2])], 0.0085, ring=10)
    tadd(tube, m['role']('Label', 'shell'), 'tonearm')
    tadd(kit.superellipsoid('Cartridge', (0.019, 0.026, 0.009), 0.4, 0.6, seg=(14, 8),
                           location=(at[0], at[1] - 0.014, at[2] - 0.006)), m['bezel'], 'tonearm')
    tadd(kit.superellipsoid('Weight', (0.019, 0.019, 0.019), 0.6, 1.0, seg=(14, 8),
                           location=(ab[0], ab[1] + 0.038, ab[2] + 0.016)), m['bezel'], 'tonearm')

    # The head: a wide screen head, headphones round it, a beacon on the band.
    h = D['head']
    add(kit.superellipsoid('Neck', (0.042, 0.042, 0.055), 0.6, 1.0, seg=(20, 8), location=(0, 0, 0.425)), m['joint'],
        'neck')
    add(kit.superellipsoid('Head', h['radii'], 0.5, 0.6, seg=(48, 32), location=(0, 0, h['z'])), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Wax', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    band, _ = kit.tube('Band', kit.spline(D['band'], 14), 0.0105, ring=10)
    add(band, m['role']('Phones', 'bezel'), 'head')
    cp = D['cup']
    for sx in (1, -1):
        add(kit.superellipsoid(f'Cup.{sx}', cp['radii'], 0.5, 0.6, seg=(24, 14), location=(sx * cp['x'], 0.0, h['z'])),
            m['role']('Phones', 'bezel'), 'head')
        add(kit.torus(f'Pad.{sx}', 0.034, 0.008, seg=(28, 8), location=(sx * (cp['x'] - 0.026), 0.0, h['z']),
                      rotation=(0, math.pi / 2, 0)), m['joint'], 'head')
    add(birdkit.ball('Beacon', D['beacon']['at'], D['beacon']['r'], seg=(16, 10)), m['beacon'], 'head')

    # Legs.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        g = (lambda q: q) if side > 0 else mirror_x
        hp, kn, an = g(D['hip']), g(D['knee']), g(D['ankle'])
        up, _ = kit.tube(f'Thigh.{sfx}', [hp, kn], 0.021, ring=12)
        add(up, m['joint'], f'leg.{sfx}')
        lo, _ = kit.tube(f'Shin.{sfx}', [kn, an], 0.019, ring=12)
        add(lo, m['joint'], f'foot.{sfx}')
        add(birdkit.ball(f'Knee.{sfx}', kn, 0.027, seg=(14, 10)), m['shell'], f'foot.{sfx}')
        ft = D['foot']
        add(kit.superellipsoid(f'Foot.{sfx}', ft['radii'], 0.45, 0.6, seg=(24, 12), location=g(ft['center'])),
            m['bezel'], f'foot.{sfx}')

    # Arms: shoulder ball, slim arm, ball hand.
    sh, hand = D['shoulder'], D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        g = (lambda q: q) if side > 0 else mirror_x
        add(birdkit.ball(f'Shoulder.{sfx}', g((sh['x'], 0, sh['z'])), sh['r'], seg=(18, 12)), m['joint'], 'body')
        arm, ts = kit.tube(f'Arm.{sfx}', kit.resample([g(q) for q in D['arm']], 10), D['arm_r'])
        bend = [min(max((u - 0.4) / 0.25, 0.0), 1.0) for u in ts]
        bend = [w_ * w_ * (3 - 2 * w_) for w_ in bend]
        add(arm, m['shell'], {f'upper_arm.{sfx}': [1 - w_ for w_ in bend], f'forearm.{sfx}': bend})
        add(birdkit.ball(f'Hand.{sfx}', g(hand['center']), hand['r'], seg=(18, 12)), m['joint'], f'hand.{sfx}')

    return looks.finish(kit.armature('DjbotRig', rig_bones()), parts, skin, m)
