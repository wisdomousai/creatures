"""Boing, the crew's robot pogo-hopper: a toy robot on a big coil spring, not a bouncing
animal. A round egg of a body with a screen face, a belt of five lit pips, two stubby
mitten arms and a wobbling antenna, sitting on a fat spring that stands on a rubber foot
pad. He never walks; every step is a hop.

The spring is a helix in three bones (spring.lo, .mid, .hi) that the site squashes and
stretches and bends side to side, so it can compress on landing, ping up and wobble when
he lands badly. The belt's pips are Dot0..Dot4 going round (they fill up as the spring
charges); the antenna bulb is the mood beacon. The body bone pivots on the middle of the
egg, so a somersault turns about the belly. Faces -Y like the rest of the crew; about
0.72 m to the tip of the antenna.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'pogo'
PREVIEW = dict(lift=0.0, width=0.32)

SPRING = (0.03, 0.29)  # where the coil starts and ends, at rest
D = {
    'pad': dict(radii=(0.092, 0.092, 0.016), z=0.016),
    'tread': dict(major=0.084, minor=0.0075, z=0.02),
    'coil': dict(radius=0.052, wire=0.0095, turns=6, seg=18),
    'collar': dict(radius=0.062, half=0.012),
    'peg': dict(z=0.1, x=0.1, r=0.008, ball=0.017),
    'plate': dict(radii=(0.082, 0.082, 0.014), z=0.298),
    'body': dict(radii=(0.152, 0.142, 0.16), z=0.45, e1=0.8, e2=0.95, taper=0.16),
    'belt': dict(radii=(0.147, 0.137, 0.011), z=0.385),
    'pips': dict(angles=(-136, -68, 0, 68, 136), r=0.014),
    # 4:3, like the face layout (512 x 384)
    'screen': dict(radii=(0.077, 0.028, 0.0578), center=(0, -0.113, 0.52), bezel=0.008),
    'shoulder': dict(x=0.146, z=0.462, r=0.027),
    'arm': [(0.15, 0.0, 0.462), (0.192, -0.008, 0.436), (0.222, -0.014, 0.404)],
    'arm_r': 0.0165,
    'hand': dict(radii=(0.033, 0.03, 0.036), center=(0.232, -0.018, 0.382), e=0.55),
    'antenna': dict(base=0.605, mid=0.665, tip=0.725, bulb=0.03, r=0.006),
    'vent': dict(n=3, z=0.596, w=0.06),
}


def along(direction):
    """Euler rotation that turns a ring (built in the XY plane) to lie round `direction`."""
    return tuple(Vector(direction).normalized().to_track_quat('Z', 'Y').to_euler())


def mirror_x(p):
    return (-p[0], *p[1:])


def rig_bones():
    z0, z1 = SPRING
    third = (z1 - z0) / 3
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.03), None),
        ('spring.lo', (0, 0, z0), (0, 0, z0 + third), 'root'),
        ('spring.mid', (0, 0, z0 + third), (0, 0, z0 + 2 * third), 'root'),
        ('spring.hi', (0, 0, z0 + 2 * third), (0, 0, z1), 'root'),
        # Pivots on the middle of the egg.
        ('body', (0, 0, D['body']['z']), (0, 0, D['body']['z'] + 0.14), 'root'),
        ('antenna.1', (0, 0, D['antenna']['base']), (0, 0, D['antenna']['mid']), 'body'),
        ('antenna.2', (0, 0, D['antenna']['mid']), (0, 0, D['antenna']['tip'] + 0.02), 'antenna.1'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        bones.append((f'arm.{sfx}', f(D['arm'][0]), f((D['hand']['center'][0], D['hand']['center'][1], 0.36)), 'body'))
    return bones


def helix(c):
    """Points up a coil from the pad to the plate."""
    z0, z1 = SPRING[0] + 0.012, SPRING[1] - 0.012
    n = c['turns'] * c['seg']
    return [(c['radius'] * math.cos(2 * math.pi * i / c['seg']), c['radius'] * math.sin(2 * math.pi * i / c['seg']),
             z0 + (z1 - z0) * i / n) for i in range(n + 1)]


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The foot pad: a flat puck with a rubber tread ring round it.
    p, tr = D['pad'], D['tread']
    add(kit.superellipsoid('Pad', p['radii'], 0.3, 1.0, seg=(40, 10), location=(0, 0, p['z'])), m['joint'], 'root')
    add(kit.torus('Tread', tr['major'], tr['minor'], seg=(40, 8), location=(0, 0, tr['z'])), m['shell'], 'root')
    add(kit.superellipsoid('PadCap', (0.05, 0.05, 0.008), 0.4, 1.0, seg=(28, 8), location=(0, 0, 0.034)), m['bezel'],
        'root')

    # The spring: a helix through three bones, with a collar at each end.
    c, co = D['coil'], D['collar']
    coil, ts = kit.tube('Coil', helix(c), c['wire'], ring=8)
    add(coil, m['joint'], kit.chain(ts, ['spring.lo', 'spring.mid', 'spring.hi']))
    add(kit.superellipsoid('CollarLo', (co['radius'], co['radius'], co['half']), 0.35, 1.0, seg=(28, 8),
                           location=(0, 0, SPRING[0] + co['half'])), m['shell'], 'spring.lo')
    add(kit.superellipsoid('CollarHi', (co['radius'], co['radius'], co['half']), 0.35, 1.0, seg=(28, 8),
                           location=(0, 0, SPRING[1] - co['half'])), m['shell'], 'spring.hi')
    pg = D['peg']
    for sx in (1, -1):
        peg, _ = kit.tube(f'Peg.{sx}', [(sx * 0.03, 0, pg['z']), (sx * pg['x'], 0, pg['z'])], pg['r'], ring=8)
        add(peg, m['joint'], 'spring.lo')
        add(kit.superellipsoid(f'PegBall.{sx}', (pg['ball'],) * 3, seg=(16, 10),
                               location=(sx * (pg['x'] + 0.008), 0, pg['z'])), m['shell'], 'spring.lo')

    # The body: a plate, the egg, a belt with five lit pips.
    pl, b, bt = D['plate'], D['body'], D['belt']
    add(kit.superellipsoid('Plate', pl['radii'], 0.35, 1.0, seg=(32, 8), location=(0, 0, pl['z'])), m['joint'],
        'body')
    add(kit.superellipsoid('Egg', b['radii'], b['e1'], b['e2'], seg=(56, 36), taper=b['taper'],
                           location=(0, 0, b['z'])), m['shell'], 'body')
    add(kit.superellipsoid('Belt', bt['radii'], 0.3, 0.95, seg=(48, 8), taper=b['taper'] * 0.6,
                           location=(0, 0, bt['z'])), m['bezel'], 'body')
    pp = D['pips']
    for i, deg in enumerate(pp['angles']):
        a = math.radians(deg)
        rx, ry = bt['radii'][0] + 0.001, bt['radii'][1] + 0.001
        add(kit.superellipsoid(f'Pip.{i}', (pp['r'], 0.0085, pp['r'] * 0.8), 0.5, 0.6, seg=(14, 8),
                               location=(rx * math.sin(a), -ry * math.cos(a), bt['z']), rotation=(0, 0, a)),
            m['dot'](i), 'body')

    # The face, and three vent slats on top.
    sc = D['screen']
    glass, rim = kit.screen('Boing', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'body')
    add(rim, m['bezel'], 'body')
    v = D['vent']
    for k in range(v['n']):
        add(kit.superellipsoid(f'Vent.{k}', (v['w'] * (1 - 0.18 * abs(k - 1)), 0.008, 0.005), 0.4, 0.5, seg=(16, 6),
                               location=(0, 0.02 * (k - 1) + 0.018, v['z'] - 0.006 * abs(k - 1)),
                               rotation=(-0.25, 0, 0)), m['joint'], 'body')

    # Antenna: a stalk in two bones and a beacon bulb.
    a = D['antenna']
    add(kit.superellipsoid('AntennaBase', (0.03, 0.03, 0.011), 0.4, 1.0, seg=(24, 8), location=(0, 0, a['base'] - 0.004)),
        m['joint'], 'body')
    stem, sts = kit.tube('AntennaStem', [(0, 0, a['base']), (0, 0, a['tip'])], a['r'], ring=8)
    add(stem, m['joint'], kit.chain(sts, ['antenna.1', 'antenna.2']))
    add(kit.superellipsoid('Bulb', (a['bulb'],) * 3, seg=(20, 14), location=(0, 0, a['tip'] + a['bulb'] * 0.7)),
        m['beacon'], 'antenna.2')

    # Stubby arms: a shoulder ball, a short hose and a mitten.
    sh, hd = D['shoulder'], D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.superellipsoid(f'Shoulder.{side}', (sh['r'],) * 3, seg=(18, 12), location=f((sh['x'], 0, sh['z']))),
            m['joint'], 'body')
        arm, _ = kit.tube(f'Arm.{side}', kit.resample([f(q) for q in D['arm']], 8), D['arm_r'], ring=12)
        add(arm, m['shell'], f'arm.{sfx}')
        add(kit.superellipsoid(f'Hand.{side}', hd['radii'], hd['e'], hd['e'], seg=(24, 16), location=f(hd['center'])),
            m['shell'], f'arm.{sfx}')

    # --- Refinement: rims, caps, guard ring, seams, hatch, bezels, cuffs, rings, bolts ---
    def bolt(name, loc, bone, r=0.0065, mat=None):
        add(kit.superellipsoid(name, (r, r, r * 0.6), seg=(10, 6), location=loc), mat or m['joint'], bone)

    # Pad: a raised rim, an inner tread ring, six bolts round the top.
    add(kit.torus('PadRim', 0.089, 0.0055, seg=(40, 8), location=(0, 0, 0.033)), m['role']('Rubber', 'bezel'), 'root')
    add(kit.torus('PadInner', 0.064, 0.0045, seg=(36, 8), location=(0, 0, 0.0335)), m['role']('Rubber', 'bezel'),
        'root')
    for k in range(6):
        a = math.radians(30 + 60 * k)
        bolt(f'PadBolt.{k}', (0.077 * math.cos(a), 0.077 * math.sin(a), 0.0335), 'root', 0.0055)
    # Spring end caps where the coil meets the pad and the body, and a guard ring with lugs.
    add(kit.torus('CapLo', 0.058, 0.007, seg=(28, 8), location=(0, 0, SPRING[0] + 0.026)), m['role']('Guard', 'bezel'),
        'spring.lo')
    add(kit.torus('CapHi', 0.058, 0.007, seg=(28, 8), location=(0, 0, SPRING[1] - 0.026)), m['role']('Guard', 'bezel'),
        'spring.hi')
    add(kit.torus('GuardRing', 0.069, 0.0055, seg=(36, 8), location=(0, 0, 0.16)), m['role']('Guard', 'bezel'),
        'spring.mid')
    for k in range(4):
        a = math.radians(45 + 90 * k)
        lug, _ = kit.tube(f'GuardLug.{k}', [(0.056 * math.cos(a), 0.056 * math.sin(a), 0.16),
                                            (0.069 * math.cos(a), 0.069 * math.sin(a), 0.16)], 0.0045, ring=6)
        add(lug, m['role']('Guard', 'bezel'), 'spring.mid')
    # Body: seam rings above and below the belt, and a screwed hatch with slots on the back.
    for nm, z, rr in (('SeamLo', 0.335, 0.123), ('SeamHi', 0.565, 0.108)):
        add(kit.torus(nm, rr, 0.0038, seg=(48, 5), location=(0, 0, z)), m['joint'], 'body')
    add(kit.superellipsoid('Hatch', (0.05, 0.007, 0.042), 0.3, 0.3, seg=(20, 8), location=(0, 0.1405, 0.45),
                           rotation=(0, 0, 0)), m['role']('Hatch', 'bezel'), 'body')
    for k, (hx, hz) in enumerate(((-0.036, 0.42), (0.036, 0.42), (-0.036, 0.48), (0.036, 0.48))):
        bolt(f'HatchBolt.{k}', (hx, 0.147, hz), 'body', 0.0055)
    for k in range(3):
        add(kit.superellipsoid(f'HatchSlot.{k}', (0.026, 0.004, 0.0028), 0.4, 0.5, seg=(12, 6),
                               location=(0, 0.1485, 0.438 + 0.012 * k)), m['joint'], 'body')
    # Belt: a bezel ring round each pip.
    bt = D['belt']
    for i, deg in enumerate(D['pips']['angles']):
        a = math.radians(deg)
        rx, ry = bt['radii'][0] + 0.001, bt['radii'][1] + 0.001
        add(kit.torus(f'PipBezel.{i}', 0.0175, 0.0034, seg=(20, 6),
                      location=(rx * math.sin(a), -ry * math.cos(a) + 0.0015 * math.cos(a), bt['z']),
                      rotation=(math.pi / 2, 0, a)), m['bezel'], 'body')
    # Shoulders: a collar ring round each ball; mittens: a cuff ring at the wrist.
    sh = D['shoulder']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.torus(f'ShoulderRing.{side}', 0.031, 0.0048, seg=(24, 6), location=f((sh['x'] + 0.004, 0, sh['z'])),
                      rotation=(0, math.pi / 2, 0)), m['role']('Guard', 'bezel'), 'body')
        d = [D['arm'][2][i] - D['arm'][1][i] for i in range(3)]
        d = f(tuple(d))
        add(kit.torus(f'Cuff.{side}', 0.0215, 0.0055, seg=(20, 6), location=f((0.212, -0.0125, 0.4155)),
                      rotation=along(d)), m['role']('Guard', 'bezel'), f'arm.{sfx}')
    # Antenna: a coiled base and segment rings on the stalk.
    a = D['antenna']
    coil_pts = [(0.0125 * math.cos(2 * math.pi * i / 12), 0.0125 * math.sin(2 * math.pi * i / 12),
                 a['base'] + 0.03 * i / 48) for i in range(49)]
    ac, _ = kit.tube('AntennaCoil', coil_pts, 0.0025, ring=6)
    add(ac, m['joint'], 'body')
    add(kit.torus('StemRing.0', 0.0085, 0.0026, seg=(14, 6), location=(0, 0, 0.655)), m['role']('Guard', 'bezel'),
        'antenna.1')
    add(kit.torus('StemRing.1', 0.0085, 0.0026, seg=(14, 6), location=(0, 0, 0.7)), m['role']('Guard', 'bezel'),
        'antenna.2')
    add(kit.torus('BulbCollar', 0.0195, 0.0038, seg=(18, 6), location=(0, 0, a['tip'] + a['bulb'] * 0.15)),
        m['joint'], 'antenna.2')

    return looks.finish(kit.armature('PogoRig', rig_bones()), parts, skin, m)
