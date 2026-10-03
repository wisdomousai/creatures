"""Tick, the crew's robot alarm clock: a round drum whose domed glass is its face (the
dial and the real time behind the eyes, drawn by the site) inside a bezel ring set with
sixty minute studs, two rimmed bells on top (each on its own bone, so they shake when it
rings) with a centre bolt, a hammer on a pivot between them with a lit knob in the
beacon's colour, a hatch on top for a little lit cuckoo on a spring, a carrying handle,
a back plate with a winding key, two setting knobs and screws, side caps with tick
lamps, and two little splayed legs with soles to hop about on. Faces -Y like the rest
of the crew; about 0.5 m to the tops of the bells.
"""

import math

import kit
import looks

FACE = 'clock'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'drum': dict(radii=(0.17, 0.17, 0.075), center=(0, 0.01, 0.25)),
    # Round, like the clock's face layout (512 x 512); domed like a clock glass.
    'screen': dict(radii=(0.135, 0.028, 0.135), center=(0, -0.058, 0.25), bezel=0.012),
    'rim': dict(major=0.15, minor=0.013, center=(0, -0.062, 0.25)),
    # Bells: angle from upright, and the bell's (radius, height) profile, top to bottom.
    'bells': dict(angle=34, out=0.18, y=0.02,
                  profile=[(0, 0.072), (0.026, 0.069), (0.045, 0.059), (0.058, 0.043), (0.066, 0.024),
                           (0.071, 0.008), (0.075, 0.0), (0.064, -0.004), (0, -0.004)]),
    'hammer': dict(pivot=(0, 0.05, 0.4), length=0.075, ball=0.021),
    'legs': dict(x=0.085, top=0.12, foot=(0.13, -0.012, 0.022), radii=(0.036, 0.046, 0.022)),
    # Back plate (faces +Y), the winding key and the two setting knobs on it.
    'plate': dict(y=0.083, radius=0.115, screws=0.093),
    'key': dict(base=(0, 0.085, 0.255), length=0.065),
    'knobs': dict(x=0.062, y=0.085, z=0.185),
    # The cuckoo's hatch on top, and where the bird and its spring rest, hidden in the drum.
    'hatch': dict(x=0, y=-0.02, z=0.4225, radius=0.03),
    'bird': dict(y=-0.02, z=0.372, coil=(0.33, 0.372), scale=1.35),
    'studs': dict(radius=0.15, y=-0.075, n=60),
}


def bell_axis(side):
    a = math.radians(D['bells']['angle'])
    return side * math.sin(a), math.cos(a)


def bell_base(side):
    """Where a bell sits on the drum, on the line out from the drum's centre."""
    ax, az = bell_axis(side)
    cx, _, cz = D['drum']['center']
    out = D['bells']['out']
    return cx + ax * out, D['bells']['y'], cz + az * out


def rig_bones():
    h, lg, k, ht, bd = D['hammer'], D['legs'], D['key'], D['hatch'], D['bird']
    px, py, pz = h['pivot']
    kx, ky, kz = k['base']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.01, 0.1), (0, 0.01, 0.4), 'root'),
        ('hammer', (px, py, pz), (px, py, pz + h['length']), 'body'),
        ('key', (kx, ky, kz), (kx, ky + k['length'], kz), 'body'),
        # The lid hinges at its back edge and lifts at the front.
        ('lid', (ht['x'], ht['y'] + ht['radius'], ht['z']), (ht['x'], ht['y'] - ht['radius'], ht['z']), 'body'),
        ('coil', (0, bd['y'], bd['coil'][0]), (0, bd['y'], bd['coil'][1]), 'body'),
        ('bird', (0, bd['y'], bd['z'] - 0.02), (0, bd['y'], bd['z'] + 0.02), 'body'),
    ]
    kn = D['knobs']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ax, az = bell_axis(side)
        bx, by, bz = bell_base(side)
        bones.append((f'bell.{sfx}', (bx - ax * 0.03, by, bz - az * 0.03), (bx + ax * 0.06, by, bz + az * 0.06), 'body'))
        fx, fy, fz = lg['foot']
        bones.append((f'leg.{sfx}', (side * lg['x'], 0, lg['top']), (side * fx, fy, fz), 'root'))
        bones.append((f'knob.{sfx}', (side * kn['x'], kn['y'], kn['z']), (side * kn['x'], kn['y'] + 0.03, kn['z']),
                      'body'))
    return bones


def blocks(name, items):
    """Many small flat-shaded boxes as one mesh. Each item is (centre, half_a, half_b, half_c)
    with the three half-extent vectors along the box's own axes."""
    verts, faces = [], []
    for c, a, b, d in items:
        base = len(verts)
        for sa in (-1, 1):
            for sb in (-1, 1):
                for sc in (-1, 1):
                    verts.append(tuple(c[i] + sa * a[i] + sb * b[i] + sc * d[i] for i in range(3)))
        faces += [(base + i, base + j, base + k, base + l) for i, j, k, l in
                  ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3))]
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def helix(x, y, z0, z1, radius, turns, n=14):
    pts = []
    for i in range(int(turns * n) + 1):
        a = 2 * math.pi * i / n
        pts.append((x + radius * math.cos(a), y + radius * math.sin(a), z0 + (z1 - z0) * i / (turns * n)))
    return pts


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The drum, turned to face the front, with the dial glass and a rim round it.
    d = D['drum']
    add(kit.superellipsoid('Drum', d['radii'], 0.3, 1.0, seg=(64, 16), location=d['center'],
                           rotation=(math.pi / 2, 0, 0)), m['shell'], 'body')
    sc = D['screen']
    glass, bezel = kit.screen('Clock', sc['radii'], sc['center'], sc['bezel'], e=1.0)
    add(glass, m['face'], 'body')
    add(bezel, m['bezel'], 'body')
    r = D['rim']
    add(kit.torus('Rim', r['major'], r['minor'], seg=(64, 10), location=r['center'], rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'body')

    # Twin bells on short stalks: a rim and a band, a bracket plate at the foot, a bolt on top.
    b = D['bells']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ax, az = bell_axis(side)
        bx, by, bz = bell_base(side)
        tilt = (0, side * math.radians(b['angle']), 0)
        add(kit.lathe(f'Bell.{sfx}', b['profile'], seg=40, location=(bx, by, bz), rotation=tilt), m['role']('Bell'),
            f'bell.{sfx}')
        add(kit.tube(f'Stalk.{sfx}', [(bx - ax * 0.035, by, bz - az * 0.035), (bx, by, bz)], 0.012, ring=10)[0],
            m['joint'], f'bell.{sfx}')
        top = b['profile'][0][1]
        add(kit.torus(f'BellRim.{sfx}', 0.073, 0.0055, seg=(40, 8), location=(bx, by, bz), rotation=tilt),
            m['joint'], f'bell.{sfx}')
        add(kit.torus(f'BellBand.{sfx}', 0.0625, 0.0028, seg=(40, 6),
                      location=(bx + ax * 0.034, by, bz + az * 0.034), rotation=tilt), m['joint'], f'bell.{sfx}')
        add(kit.superellipsoid(f'BellPlate.{sfx}', (0.03, 0.03, 0.005), 0.4, 1.0, seg=(20, 8),
                               location=(bx - ax * 0.03, by, bz - az * 0.03), rotation=tilt), m['joint'], f'bell.{sfx}')
        add(kit.lathe(f'BellWasher.{sfx}', [(0.02, 0.004), (0.022, 0.0), (0, 0.0)], seg=20,
                      location=(bx + ax * (top - 0.002), by, bz + az * (top - 0.002)), rotation=tilt),
            m['joint'], f'bell.{sfx}')
        add(kit.lathe(f'BellBolt.{sfx}', [(0, 0.0125), (0.011, 0.0115), (0.012, 0.0), (0, 0.0)], seg=6,
                      location=(bx + ax * (top + 0.0015), by, bz + az * (top + 0.0015)), rotation=tilt),
            m['joint'], f'bell.{sfx}')

    # The hammer on its pivot, between the bells, with a knob in the beacon's colour and a
    # halo round it; a bracket on the drum for it to swing in.
    h = D['hammer']
    px, py, pz = h['pivot']
    end = (px, py, pz + h['length'])
    add(kit.tube('Hammer', [(px, py, pz - 0.02), end], 0.0075, ring=8)[0], m['joint'], 'hammer')
    add(kit.superellipsoid('HammerKnob', (h['ball'],) * 3, seg=(18, 12), location=end), m['beacon'], 'hammer')
    add(kit.torus('HammerHalo', h['ball'] + 0.003, 0.0035, seg=(24, 6), location=end, rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'hammer')
    add(kit.superellipsoid('HammerAxle', (0.012, 0.012, 0.012), seg=(14, 8), location=(px, py, pz)), m['joint'],
        'hammer')
    add(kit.superellipsoid('HammerCollar', (0.011, 0.011, 0.005), 0.5, 1.0, seg=(14, 6),
                           location=(px, py, pz + 0.032)), m['joint'], 'hammer')
    for side in (1, -1):
        add(kit.superellipsoid(f'HammerCheek.{side}', (0.004, 0.012, 0.016), 0.5, 0.6, seg=(12, 6),
                               location=(side * 0.017, py, pz - 0.006)), m['joint'], 'body')
    add(kit.superellipsoid('HammerFoot', (0.03, 0.02, 0.004), 0.4, 0.7, seg=(16, 6), location=(px, py, pz - 0.02)),
        m['joint'], 'body')

    # The hatch on top: a collar, a dark well, and a lid on a hinge; under it the bird.
    ht = D['hatch']
    add(kit.torus('HatchCollar', ht['radius'] + 0.003, 0.0038, seg=(28, 6),
                  location=(ht['x'], ht['y'], ht['z'] - 0.002)), m['joint'], 'body')
    add(kit.superellipsoid('HatchWell', (ht['radius'], ht['radius'], 0.001), 0.5, 1.0, seg=(20, 4),
                           location=(ht['x'], ht['y'], ht['z'] - 0.003)), m['bezel'], 'body')
    add(kit.superellipsoid('HatchLid', (ht['radius'], ht['radius'], 0.005), 0.5, 1.0, seg=(28, 8),
                           location=(ht['x'], ht['y'], ht['z'] + 0.002)), m['shell'], 'lid')
    add(kit.superellipsoid('HatchKnob', (0.006, 0.006, 0.004), seg=(10, 6),
                           location=(ht['x'], ht['y'] - ht['radius'] + 0.008, ht['z'] + 0.008)), m['joint'], 'lid')
    add(kit.superellipsoid('HatchPin', (0.012, 0.004, 0.004), seg=(10, 6),
                           location=(ht['x'], ht['y'] + ht['radius'] + 0.002, ht['z'] + 0.001)), m['joint'], 'body')
    bd = D['bird']
    by0, bz0, S = bd['y'], bd['z'], bd['scale']
    add(kit.tube('Coil', helix(0, by0, bd['coil'][0], bd['coil'][1], 0.008, 4), 0.0022, ring=6)[0], m['joint'], 'coil')
    add(kit.superellipsoid('BirdBody', (0.017 * S, 0.026 * S, 0.02 * S), seg=(16, 10), location=(0, by0, bz0)),
        m['dot'](0), 'bird')
    add(kit.superellipsoid('BirdHead', (0.012 * S,) * 3, seg=(14, 8),
                           location=(0, by0 - 0.012 * S, bz0 + 0.02 * S)), m['dot'](0), 'bird')
    add(kit.lathe('BirdBeak', [(0.005 * S, 0.0), (0, 0.014 * S)], seg=8,
                  location=(0, by0 - 0.022 * S, bz0 + 0.02 * S), rotation=(math.pi / 2, 0, 0)), m['joint'], 'bird')
    add(kit.superellipsoid('BirdTail', (0.007 * S, 0.016 * S, 0.005 * S), seg=(10, 6),
                           location=(0, by0 + 0.026 * S, bz0 + 0.008 * S)), m['joint'], 'bird')
    for side in (1, -1):
        add(kit.superellipsoid(f'BirdWing.{side}', (0.004 * S, 0.016 * S, 0.011 * S), seg=(10, 6),
                               location=(side * 0.018 * S, by0 + 0.002 * S, bz0 + 0.002 * S)), m['joint'], 'bird')

    # A carrying handle behind the hammer, over the drum's top and down its back.
    add(kit.tube('Handle', [(0, 0.078, 0.41), (0, 0.092, 0.434), (0, 0.112, 0.44), (0, 0.128, 0.424),
                            (0, 0.126, 0.39), (0, 0.098, 0.35)], 0.0085, ring=8)[0], m['joint'], 'body')

    # Seams and trim: the case seam, the back trim, sixty minute studs on the bezel.
    add(kit.torus('Seam', 0.171, 0.0045, seg=(64, 6), location=(0, 0.012, 0.25), rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'body')
    add(kit.torus('BackTrim', 0.148, 0.006, seg=(48, 6), location=(0, 0.082, 0.25), rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'body')
    st = D['studs']
    items = []
    for i in range(st['n']):
        a = 2 * math.pi * i / st['n']
        rx, rz = math.sin(a), math.cos(a)
        hour = i % 5 == 0
        rad, tan, dep = (0.0075, 0.0034, 0.0055) if hour else (0.0035, 0.0015, 0.0035)
        items.append(((st['radius'] * rx, st['y'], 0.25 + st['radius'] * rz), (rx * rad, 0, rz * rad),
                      (rz * tan, 0, -rx * tan), (0, dep, 0)))
    add(blocks('Studs', items), m['shell'], 'body')

    # Side caps with a tick lamp each (they blink in turn with the seconds).
    for side in (1, -1):
        add(kit.lathe(f'SideCap.{side}', [(0, 0.012), (0.024, 0.011), (0.03, 0.006), (0.031, 0.0), (0, 0.0)], seg=24,
                      location=(side * 0.163, 0.012, 0.25), rotation=(0, side * math.pi / 2, 0)), m['joint'], 'body')
        add(kit.superellipsoid(f'SideLamp.{side}', (0.011, 0.011, 0.007), seg=(14, 8),
                               location=(side * 0.177, 0.012, 0.25), rotation=(0, side * math.pi / 2, 0)),
            m['dot'](1 if side > 0 else 2), 'body')

    # The back plate with four screws, vents, the winding key and two setting knobs.
    pl = D['plate']
    add(kit.lathe('BackPlate', [(0, 0.011), (0.1, 0.011), (0.112, 0.007), (pl['radius'], 0.0), (0, 0.0)], seg=48,
                  location=(0, pl['y'], 0.25), rotation=(-math.pi / 2, 0, 0)), m['joint'], 'body')
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        add(kit.superellipsoid(f'Screw.{i}', (0.0075, 0.0035, 0.0075), seg=(10, 6),
                               location=(pl['screws'] * math.sin(a), pl['y'] + 0.011,
                                         0.25 + pl['screws'] * math.cos(a))), m['shell'], 'body')
    vents = [((0, pl['y'] + 0.011, 0.335 - i * 0.014), (0.032, 0, 0), (0, 0, 0.0028), (0, 0.0028, 0)) for i in range(3)]
    add(blocks('Vents', vents), m['shell'], 'body')
    k = D['key']
    kx, ky, kz = k['base']
    add(kit.superellipsoid('KeyBase', (0.02, 0.008, 0.02), 0.5, 1.0, seg=(16, 6), location=(kx, ky + 0.006, kz)),
        m['shell'], 'key')
    add(kit.tube('KeyStem', [(kx, ky + 0.004, kz), (kx, ky + 0.055, kz)], 0.0075, ring=8)[0], m['shell'], 'key')
    add(kit.superellipsoid('KeyBar', (0.046, 0.008, 0.008), seg=(14, 8), location=(kx, ky + 0.058, kz)),
        m['shell'], 'key')
    for side in (1, -1):
        add(kit.torus(f'KeyLoop.{side}', 0.016, 0.0058, seg=(20, 6), location=(side * 0.042, ky + 0.058, kz),
                      rotation=(math.pi / 2, 0, 0)), m['shell'], 'key')
    kn = D['knobs']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.lathe(f'SetKnob.{sfx}', [(0, 0.024), (0.011, 0.023), (0.013, 0.018), (0.012, 0.006), (0.008, 0.004),
                                         (0.008, 0.0), (0, 0.0)], seg=16,
                      location=(side * kn['x'], kn['y'] - 0.002, kn['z']), rotation=(-math.pi / 2, 0, 0)),
            m['shell'], f'knob.{sfx}')
        add(kit.superellipsoid(f'SetPointer.{sfx}', (0.0025, 0.0018, 0.008), seg=(6, 6),
                               location=(side * kn['x'], kn['y'] + 0.022, kn['z'] + 0.007)), m['joint'], f'knob.{sfx}')

    # Two little splayed legs: hip sockets, ankle bands, round feet with toe caps and soles.
    lg = D['legs']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        fx, fy, fz = lg['foot']
        add(kit.tube(f'Leg.{sfx}', [(side * lg['x'], 0, lg['top']), (side * fx, fy, fz + 0.01)], 0.013, ring=10)[0],
            m['joint'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Hip.{sfx}', (0.022, 0.022, 0.014), 0.6, 1.0, seg=(16, 8),
                               location=(side * lg['x'], 0, lg['top'] + 0.004)), m['shell'], f'leg.{sfx}')
        ax_, ay_, az_ = side * (lg['x'] * 0.3 + fx * 0.7), fy * 0.7, lg['top'] * 0.3 + (fz + 0.01) * 0.7
        add(kit.torus(f'Ankle.{sfx}', 0.0165, 0.0045, seg=(16, 6), location=(ax_, ay_, az_),
                      rotation=(0.0, side * math.radians(-32), 0.0)), m['shell'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Foot.{sfx}', lg['radii'], 0.5, 0.8, seg=(24, 12), location=(side * fx, fy - 0.01, fz)),
            m['joint'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Sole.{sfx}', (0.039, 0.049, 0.006), 0.4, 0.8, seg=(24, 6),
                               location=(side * fx, fy - 0.01, 0.005)), m['shell'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Toe.{sfx}', (0.026, 0.02, 0.014), 0.6, 0.8, seg=(16, 8),
                               location=(side * fx, fy - 0.038, 0.017)), m['shell'], f'leg.{sfx}')
        add(kit.superellipsoid(f'FootScrew.{sfx}', (0.006, 0.006, 0.003), seg=(8, 6),
                               location=(side * fx, fy + 0.008, 0.043)), m['shell'], f'leg.{sfx}')

    return looks.finish(kit.armature('ClockRig', rig_bones()), parts, skin, m)
