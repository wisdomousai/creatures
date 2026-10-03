"""Teeter, the crew's robot ballbot: a slim robot balancing on a single ball, no feet at all.
A big striped ball (its own bone, `orb`, so it can roll under him) sits in a cradle ring; a
slim tapering torso with a chest panel of three lamps rises from it, a round head with a wide
screen face and a beacon on a bendy stalk on top, and two long thin arms with ball hands that
hang by his sides and are thrown out for balance.

`body` is the bone everything above the ball hangs on, pivoting at the ball's centre: leaning
it tips the whole robot over the ball. The ball carries four lit pips (Dot0..Dot3) that roll
round with it and the chest panel the other three (Dot4..Dot6, top to bottom). Faces -Y like
the rest of the crew; about 0.78 m to the beacon.
"""

import math

import birdkit
import kit
import looks

FACE = 'ballbot'
PREVIEW = dict(lift=0.0, width=0.34)

D = {
    'ball': dict(r=0.125, z=0.125),
    'cradle': dict(R=0.08, r=0.02, z=0.222),
    'waist': dict(radii=(0.076, 0.068, 0.032), z=0.262),
    'torso': dict(radii=(0.098, 0.078, 0.14), z=0.405),
    'head': dict(radii=(0.138, 0.11, 0.096), z=0.64),
    # 7:5, like the face layout (448 x 320)
    'screen': dict(radii=(0.108, 0.03, 0.0771), center=(0, -0.104, 0.644), bezel=0.009),
    'stalk': [(0, 0.015, 0.73), (0, 0.035, 0.77), (0, 0.03, 0.805)],
    'beacon': dict(at=(0, 0.03, 0.82), r=0.021),
    'shoulder': dict(x=0.106, z=0.475, r=0.028),
    'arm': [(0.108, 0.0, 0.475), (0.134, 0.0, 0.39), (0.154, -0.004, 0.305)],
    'arm_r': 0.0125,
    'hand': dict(center=(0.157, -0.005, 0.276), r=0.032),
}


def mirror_x(p):
    return (-p[0], *p[1:])


def rig_bones():
    h = D['head']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('orb', (0, 0, D['ball']['z']), (0, 0, D['ball']['z'] + 0.05), 'root'),
        ('body', (0, 0, D['ball']['z']), (0, 0, 0.3), 'root'),
        ('head', (0, 0, 0.585), (0, 0, h['z'] + 0.1), 'body'),
        ('antenna', D['stalk'][0], D['stalk'][1], 'head'),
        ('antenna.2', D['stalk'][1], D['stalk'][2], 'antenna'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        a = D['arm']
        hc = D['hand']['center']
        bones += [
            (f'upper_arm.{sfx}', f(a[0]), f(a[1]), 'body'),
            (f'forearm.{sfx}', f(a[1]), f(a[2]), f'upper_arm.{sfx}'),
            (f'hand.{sfx}', f(a[2]), f((hc[0], hc[1], hc[2] - 0.01)), f'forearm.{sfx}'),
        ]
    return bones


def on_sphere(centre, r, elevation, azimuth):
    """A point on a sphere, azimuth from the front (-Y) round toward +X."""
    e, a = math.radians(elevation), math.radians(azimuth)
    return (centre[0] + r * math.cos(e) * math.sin(a), centre[1] - r * math.cos(e) * math.cos(a),
            centre[2] + r * math.sin(e))


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The ball: a plain sphere with three bands round it, so a roll shows, and four lit pips.
    b = D['ball']
    c = (0, 0, b['z'])
    add(birdkit.ball('Ball', c, b['r'], seg=(40, 28)), m['role']('Ball', 'shell'), 'orb')
    for n, rot in enumerate(((0, 0, 0), (math.pi / 2, 0, 0), (0, math.pi / 2, 0))):
        add(kit.torus(f'BallBand.{n}', b['r'] + 0.0005, 0.0065, seg=(48, 8), location=c, rotation=rot),
            m['bezel'], 'orb')
    for n, (el, az) in enumerate(((38, 0), (38, 90), (38, 180), (38, 270))):
        p = on_sphere(c, b['r'] + 0.001, el, az)
        add(kit.superellipsoid(f'BallPip.{n}', (0.0125, 0.0125, 0.006), 0.5, 1.0, seg=(12, 6), location=p,
                               rotation=(math.radians(90 - el), 0, math.radians(-az))), m['dot'](n), 'orb')

    # The cradle the ball sits in, and a waist joint above it.
    cr = D['cradle']
    add(kit.torus('Cradle', cr['R'], cr['r'], seg=(40, 10), location=(0, 0, cr['z'])), m['bezel'], 'body')
    for i in range(3):
        a = math.radians(90 + 120 * i)
        add(birdkit.ball(f'Roller.{i}', (0.078 * math.cos(a), 0.078 * math.sin(a), 0.212), 0.016, seg=(12, 8)),
            m['joint'], 'body')
    w = D['waist']
    add(kit.superellipsoid('Waist', w['radii'], 0.7, 1.0, seg=(32, 14), location=(0, 0, w['z'])), m['joint'], 'body')

    # The torso: a slim tapering bean with a belt and a chest panel of three lamps.
    t = D['torso']
    add(kit.superellipsoid('Torso', t['radii'], 0.6, 0.85, seg=(48, 32), taper=0.3, location=(0, 0, t['z'])),
        m['shell'], 'body')
    add(kit.torus('Belt', 0.092, 0.009, seg=(40, 8), location=(0, 0, 0.3)), m['bezel'], 'body')
    add(kit.superellipsoid('Panel', (0.048, 0.01, 0.075), 0.35, 0.6, seg=(24, 14), location=(0, -0.072, 0.41)),
        m['bezel'], 'body')
    for n, z in enumerate((0.455, 0.41, 0.365)):
        add(kit.superellipsoid(f'ChestLamp.{n}', (0.0125, 0.007, 0.0125), 0.5, 0.8, seg=(14, 8),
                               location=(0, -0.0795, z)), m['dot'](4 + n), 'body')
    add(kit.torus('NeckRing', 0.06, 0.013, seg=(32, 8), location=(0, 0, 0.545)), m['bezel'], 'body')

    # The head: a wide rounded dome with the screen, side lamps and a bendy beacon.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], 0.55, 0.7, seg=(48, 32), location=(0, 0, h['z'])), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Teeter', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for sx in (1, -1):
        add(kit.superellipsoid(f'Ear.{sx}', (0.013, 0.035, 0.035), 0.6, 1.0, seg=(16, 10),
                               location=(sx * 0.138, 0.0, h['z'] - 0.005)), m['joint'], 'head')
    stalk, ts = kit.tube('Stalk', kit.spline(D['stalk'], 10), 0.006, ring=8)
    add(stalk, m['joint'], kit.chain(ts, ['antenna', 'antenna.2']))
    add(birdkit.ball('Beacon', D['beacon']['at'], D['beacon']['r'], seg=(16, 10)), m['beacon'], 'antenna.2')

    # Arms: shoulder ball, a long thin arm, a ball hand.
    sh, hand = D['shoulder'], D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        g = (lambda q: q) if side > 0 else mirror_x
        add(birdkit.ball(f'Shoulder.{sfx}', g((sh['x'], 0, sh['z'])), sh['r'], seg=(18, 12)), m['joint'], 'body')
        arm, ts = kit.tube(f'Arm.{sfx}', kit.resample([g(q) for q in D['arm']], 10), D['arm_r'])
        bend = [min(max((u - 0.4) / 0.25, 0.0), 1.0) for u in ts]
        bend = [w_ * w_ * (3 - 2 * w_) for w_ in bend]
        add(arm, m['shell'], {f'upper_arm.{sfx}': [1 - w_ for w_ in bend], f'forearm.{sfx}': bend})
        add(birdkit.ball(f'Hand.{sfx}', g(hand['center']), hand['r'], seg=(18, 12)), m['joint'], f'hand.{sfx}')

    return looks.finish(kit.armature('BallbotRig', rig_bones()), parts, skin, m)
