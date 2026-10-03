"""Uno, the crew's robot unicyclist: a toy robot, not a circus performer in a robot suit. A
slim upright body (a saddle, a chunky torso, a boxy head with a screen face and a little
top hat) balanced on one fat wheel, with two thin rubber-hose arms and mitten hands held
out for balance.

The wheel has a chunky tyre with a ring of tread blocks and a hub with six lit pips
(Dot0..Dot5, going round), so you can see it turn; the hat's band is the mood beacon. The
wheel is its own bone (it spins as he rolls), the fork and the body ride one bone that
leans about the axle, and the body, head and hat each swing on top of that. Three
juggling balls hide in the chest, on bones of their own. Faces -Y like the rest of the
crew; about 0.72 m to the top of the hat.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'unicycle'
PREVIEW = dict(lift=0.0, width=0.3)

R = 0.105  # the wheel's radius
D = {
    'tyre': dict(r=R, half=0.034, e1=0.55),
    'lugs': dict(n=16, w=0.05, t=0.016, h=0.011),
    'hub': dict(r=0.062, half=0.041),
    'cap': dict(r=0.036, half=0.046),
    'pips': dict(n=6, at=0.049, r=0.0105),
    'fork': dict(x=0.058, top=0.238, r=0.009),
    'crown': dict(radii=(0.072, 0.034, 0.014), z=0.246),
    'post': dict(z=(0.246, 0.285), r=0.015),
    'seat': dict(radii=(0.078, 0.062, 0.028), z=0.297, e=0.4),
    'torso': dict(radii=(0.088, 0.066, 0.092), z=0.377, taper=0.12, e=0.45),
    'belt': dict(radii=(0.092, 0.07, 0.011), z=0.322),
    'chest': dict(r=0.02, z=0.395),
    'neck': dict(r=0.036, half=0.02, z=0.474),
    'head': dict(radii=(0.118, 0.092, 0.088), z=0.56, e=0.4),
    # 8:5, like the face layout (512 x 320)
    'screen': dict(radii=(0.092, 0.03, 0.0575), center=(0, -0.074, 0.565), bezel=0.008),
    'knob': dict(x=0.122, z=0.56, radii=(0.03, 0.03, 0.014)),
    'hat': dict(crown=(0.054, 0.05, 0.04), brim=(0.086, 0.078, 0.007), z=0.672, band=0.0095),
    'shoulder': dict(x=0.098, z=0.412, r=0.03),
    # Held out for balance: up and out from the shoulder, bent down at the elbow.
    'arm': [(0.100, 0.0, 0.412), (0.176, -0.006, 0.418), (0.232, -0.014, 0.404), (0.284, -0.022, 0.408),
            (0.322, -0.03, 0.428)],
    'elbow': (0.234, -0.014, 0.404),
    'arm_r': 0.0135,
    'hand': dict(radii=(0.031, 0.028, 0.034), center=(0.342, -0.034, 0.44), e=0.55, thumb=(0.335, -0.06, 0.455)),
    'spoke': dict(n=6, r0=0.03, r1=0.071, ring=0.0725),
    'ribs': dict(radii=(0.092, 0.079), x=0.0335),
    'valve': dict(at=0.079, angle=0.55, length=0.016),
    'guard': dict(r=0.128, span=58, half=0.027),
    'crank': dict(x=0.078, r=0.048, pedal=0.026),
    'spring': dict(turns=3.5, r=0.0085, wire=0.0032, z0=0.713, height=0.03, ball=0.0115),
    'ball': dict(r=0.032, at=(0, -0.01, 0.38)),
}


def mirror_x(p):
    return (-p[0], *p[1:])


def rig_bones():
    s, a = D['shoulder'], D['arm']
    hc = D['hand']['center']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.06), None),
        ('wheel', (0, 0, R), (0, -0.05, R), 'root'),
        # The fork and body lean about the axle.
        ('frame', (0, 0, R), (0, 0, D['crown']['z']), 'root'),
        ('body', (0, 0, D['seat']['z'] - 0.02), (0, 0, 0.46), 'frame'),
        ('head', (0, 0, 0.475), (0, 0, 0.64), 'body'),
        ('hat', (0, 0, D['hat']['z'] - 0.03), (0, 0, D['hat']['z'] + 0.06), 'head'),
        # The little spring and ball on top of the hat: it bobs on its own.
        ('topper', (0, 0, D['hat']['z'] + 0.043), (0, 0, D['hat']['z'] + 0.095), 'hat'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        bones += [
            (f'upper_arm.{sfx}', f((s['x'], 0, s['z'])), f(D['elbow']), 'body'),
            (f'forearm.{sfx}', f(D['elbow']), f(a[-1]), f'upper_arm.{sfx}'),
            (f'hand.{sfx}', f(a[-1]), f((hc[0] + 0.01, hc[1], hc[2] + 0.02)), f'forearm.{sfx}'),
        ]
    for i in range(3):
        x, y, z = D['ball']['at']
        bones.append((f'ball.{i}', (x, y, z), (x, y, z + 0.03), 'body'))
    return bones


def aim(direction):
    """Euler rotation that turns a torus (a ring in the XY plane) to lie around `direction`."""
    return Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized()).to_euler()


def detail(add, m):
    """The fine print: spokes and a valve, tyre ribs, a mudguard and cranks, saddle stitching
    and clamp, seams, bow tie, shoulder rings, cuffs, bolts, and the hat's edge and spring."""
    side_on = (0, math.pi / 2, 0)
    hb = D['hub']

    # Wheel: a lit-pip hub ringed by a rim with slim spokes, ribs down each tyre wall, a valve.
    sp, rb, vv = D['spoke'], D['ribs'], D['valve']
    for sx in (1, -1):
        x = sx * (hb['half'] * 0.75 + 0.004)
        add(kit.torus(f'RimRing.{sx}', sp['ring'], 0.0042, seg=(40, 6), location=(x, 0, R), rotation=side_on),
            m['bezel'], 'wheel')
        for i in range(sp['n']):
            a = 2 * math.pi * (i + 0.5) / sp['n']  # between the pips
            pts = [(x, -r * math.sin(a), R + r * math.cos(a)) for r in (sp['r0'], sp['r1'])]
            spoke, _ = kit.tube(f'Spoke.{sx}.{i}', pts, 0.0028, ring=6)
            add(spoke, m['shell'], 'wheel')
        for k, r in enumerate(rb['radii']):
            add(kit.torus(f'Rib.{sx}.{k}', r, 0.0032, seg=(48, 6), location=(sx * rb['x'], 0, R), rotation=side_on),
                m['shell'], 'wheel')
    a = vv['angle']
    vp = (0.048, -vv['at'] * math.sin(a), R + vv['at'] * math.cos(a))
    stem, _ = kit.tube('Valve', [(0.043, vp[1], vp[2]), (0.043 + vv['length'], vp[1], vp[2])], 0.0026, ring=6)
    add(stem, m['shell'], 'wheel')
    add(kit.superellipsoid('ValveCap', (0.005, 0.0045, 0.0045), 0.5, 0.5, seg=(10, 6),
                           location=(0.043 + vv['length'], vp[1], vp[2])), m['bezel'], 'wheel')

    # Fork: bolts on the crown, a mudguard arching over the wheel with a lit tail lamp.
    cr, g = D['crown'], D['guard']
    for sx in (1, -1):
        for sy in (-1, 1):
            add(kit.superellipsoid(f'CrownBolt.{sx}.{sy}', (0.0062, 0.0062, 0.004), 0.4, 1.0, seg=(12, 6),
                                   location=(sx * 0.042, sy * 0.017, cr['z'] + 0.0225)), m['shell'], 'frame')
    pts = []
    for i in range(15):
        u = math.radians(-g['span'] + 2 * g['span'] * i / 14)
        pts.append((0, g['r'] * math.sin(u), R + g['r'] * math.cos(u)))
    guard, _ = kit.tube('Guard', pts, 0.0085, ring=8)
    add(kit.stretch(guard, sx=g['half'] / 0.0085), m['bezel'], 'frame')
    for sx in (1, -1):  # stays that tie it to the fork
        stay, _ = kit.tube(f'Stay.{sx}', [(sx * 0.03, pts[1][1], pts[1][2]), (sx * D['fork']['x'], -0.012, R + 0.075)],
                           0.0032, ring=6)
        add(stay, m['joint'], 'frame')
    u = math.radians(g['span'])
    add(kit.superellipsoid('TailLamp', (0.013, 0.006, 0.009), 0.4, 0.5, seg=(12, 8),
                           location=(0, g['r'] * math.sin(u) + 0.006, R + g['r'] * math.cos(u) - 0.001),
                           rotation=(-u * 0.9, 0, 0)), m['glow'], 'frame')

    # Cranks turn with the wheel and carry little pedals (his feet stay tucked).
    cx = D['crank']
    for sx in (1, -1):
        end = (sx * cx['x'], 0, R - sx * cx['r'])
        crank, _ = kit.tube(f'Crank.{sx}', [(sx * cx['x'], 0, R), end], 0.0072, ring=8)
        add(crank, m['joint'], 'wheel')
        add(kit.superellipsoid(f'CrankBolt.{sx}', (0.011, 0.011, 0.004), 0.4, 1.0, seg=(16, 6),
                               location=(sx * (cx['x'] + 0.006), 0, R), rotation=side_on), m['shell'], 'wheel')
        add(kit.superellipsoid(f'Pedal.{sx}', (cx['pedal'] / 2, 0.013, 0.0045), 0.3, 0.3, seg=(14, 8),
                               location=(sx * (cx['x'] + cx['pedal'] / 2 - 0.004), end[1], end[2])), m['bezel'],
            'wheel')

    # Saddle: stitching round the top, a seat post clamp with a bolt.
    s = D['seat']
    for i in range(22):
        a = 2 * math.pi * i / 22
        add(kit.superellipsoid(f'Stitch.{i}', (0.0042, 0.0016, 0.0016), 0.5, 0.5, seg=(8, 5),
                               location=(0.056 * math.sin(a), -0.043 * math.cos(a), s['z'] + 0.0265),
                               rotation=(0, 0, -a)), m['bezel'], 'body')
    add(kit.torus('Clamp', 0.0185, 0.0055, seg=(24, 8), location=(0, 0, 0.262)), m['bezel'], 'frame')
    add(kit.superellipsoid('ClampBolt', (0.0055, 0.0055, 0.008), 0.4, 1.0, seg=(12, 6), location=(0.0245, 0, 0.262),
                           rotation=side_on), m['shell'], 'frame')

    # Torso: panel seams, a buckle, bolts, a bow tie under the chin.
    t, b = D['torso'], D['belt']
    front = -t['radii'][1] * 0.985
    for sx in (1, -1):
        add(kit.superellipsoid(f'Seam.{sx}', (0.0022, 0.004, 0.036), 0.4, 0.5, seg=(8, 8),
                               location=(sx * 0.048, front * 0.9, 0.398), rotation=(0, 0, sx * 0.34)),
            m['bezel'], 'body')
        for z in (0.355, 0.44):
            add(kit.superellipsoid(f'TorsoBolt.{sx}.{z}', (0.006, 0.006, 0.0035), 0.4, 1.0, seg=(10, 6),
                                   location=(sx * 0.056, front * 0.81, z), rotation=(math.pi / 2, 0, 0)),
                m['shell'], 'body')
    add(kit.superellipsoid('Buckle', (0.017, 0.006, 0.0125), 0.3, 0.4, seg=(12, 6),
                           location=(0, -b['radii'][1] * 0.985, b['z'])), m['shell'], 'body')
    bow_y, bow_z = -0.0575, 0.451
    for sx in (1, -1):
        add(kit.superellipsoid(f'Bow.{sx}', (0.0155, 0.006, 0.0105), 0.5, 0.6, seg=(12, 8),
                               location=(sx * 0.0175, bow_y, bow_z), rotation=(0, sx * 0.2, sx * 0.15)),
            m['role']('Bow', 'bezel'), 'body')
    add(kit.superellipsoid('BowKnot', (0.0072, 0.0072, 0.0072), seg=(10, 8), location=(0, bow_y - 0.002, bow_z)),
        m['role']('Bow', 'bezel'), 'body')

    # Head: a cap and a lit dot on each side knob, bolts by the screen.
    k, h = D['knob'], D['head']
    for sx in (1, -1):
        add(kit.superellipsoid(f'KnobCap.{sx}', (0.017, 0.017, 0.005), 0.4, 1.0, seg=(16, 6),
                               location=(sx * (k['x'] + 0.014), 0, k['z']), rotation=side_on), m['bezel'], 'head')
        add(kit.superellipsoid(f'KnobLight.{sx}', (0.005, 0.005, 0.004), 0.5, 1.0, seg=(10, 6),
                               location=(sx * (k['x'] + 0.018), 0, k['z']), rotation=side_on), m['glow'], 'head')
        for sz in (1, -1):
            add(kit.superellipsoid(f'HeadBolt.{sx}.{sz}', (0.0045, 0.0045, 0.0028), 0.4, 1.0, seg=(10, 6),
                                   location=(sx * 0.066, -0.052, h['z'] + sz * 0.056),
                                   rotation=(math.pi / 2, 0, 0)), m['shell'], 'head')

    # Shoulders: a ring where the arm leaves the ball; cuffs where the mitten starts.
    sh, ar = D['shoulder'], D['arm']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.torus(f'ShoulderRing.{side}', 0.0225, 0.0052, seg=(24, 8),
                      location=(side * (sh['x'] + 0.021), 0, sh['z']), rotation=side_on), m['bezel'], 'body')
        add(kit.superellipsoid(f'ElbowBolt.{side}', (0.011, 0.011, 0.005), 0.4, 1.0, seg=(12, 6),
                               location=f((D['elbow'][0], D['elbow'][1] - 0.012, D['elbow'][2])),
                               rotation=(math.pi / 2, 0, 0)), m['shell'], f'forearm.{sfx}')
        d = Vector(f(ar[-1])) - Vector(f(ar[-2]))
        pos = Vector(f(ar[-1])) - d.normalized() * 0.007
        add(kit.torus(f'Cuff.{side}', 0.0175, 0.0062, seg=(24, 8), location=tuple(pos), rotation=aim(d)),
            m['bezel'], f'forearm.{sfx}')

    # Hat: a rolled brim edge, and a spring topped with a ball.
    ht, sg = D['hat'], D['spring']
    brim = kit.torus('BrimEdge', 1.0, 0.0032, seg=(40, 6), location=(0, 0, ht['z'] - 0.02))
    add(kit.stretch(brim, ht['brim'][0] * 0.99, ht['brim'][1] * 0.99, 1.0), m['shell'], 'hat')
    pts = []
    for i in range(int(sg['turns'] * 10) + 1):
        u = i / (sg['turns'] * 10)
        a = 2 * math.pi * sg['turns'] * u
        pts.append((sg['r'] * math.cos(a), sg['r'] * math.sin(a), sg['z0'] + sg['height'] * u))
    coil, _ = kit.tube('Spring', pts, sg['wire'], ring=6)
    add(coil, m['joint'], 'topper')
    add(kit.superellipsoid('SpringBall', (sg['ball'],) * 3, seg=(14, 10),
                           location=(0, 0, sg['z0'] + sg['height'] + sg['ball'] * 0.8)), m['role']('Spring', 'bezel'),
        'topper')


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The wheel: tyre, tread blocks all the way round, a hub and six lit pips on each side.
    ty, lg, hb = D['tyre'], D['lugs'], D['hub']
    side_on = (0, math.pi / 2, 0)
    add(kit.superellipsoid('Tyre', (ty['r'], ty['r'], ty['half']), ty['e1'], 1.0, seg=(40, 14), location=(0, 0, R),
                           rotation=side_on), m['joint'], 'wheel')
    for k in range(lg['n']):
        a = 2 * math.pi * k / lg['n']
        r = ty['r'] + lg['h'] * 0.2
        add(kit.superellipsoid(f'Lug.{k}', (lg['w'] / 2, lg['t'] / 2, lg['h'] / 2), 0.3, 0.4, seg=(10, 6),
                               location=(0, -r * math.sin(a), R + r * math.cos(a)), rotation=(a, 0, 0)),
            m['shell'], 'wheel')
    for sx in (1, -1):
        add(kit.superellipsoid(f'Hub.{sx}', (hb['r'], hb['r'], hb['half'] * 0.5), 0.4, 1.0, seg=(32, 8),
                               location=(sx * hb['half'] * 0.75, 0, R), rotation=side_on), m['bezel'], 'wheel')
        add(kit.superellipsoid(f'Cap.{sx}', (D['cap']['r'], D['cap']['r'], 0.008), 0.4, 1.0, seg=(24, 8),
                               location=(sx * D['cap']['half'], 0, R), rotation=side_on), m['shell'], 'wheel')
        for i in range(D['pips']['n']):
            a = 2 * math.pi * i / D['pips']['n']
            p = D['pips']
            add(kit.superellipsoid(f'Pip.{sx}.{i}', (p['r'], p['r'], 0.0055), 0.5, 1.0, seg=(14, 6),
                                   location=(sx * (hb['half'] * 0.75 + hb['half'] * 0.3), -p['at'] * math.sin(a),
                                             R + p['at'] * math.cos(a)), rotation=side_on), m['dot'](i), 'wheel')

    # The fork: a strut each side of the wheel, up to a crown; a post to the saddle.
    fk, cr, ps = D['fork'], D['crown'], D['post']
    for sx in (1, -1):
        strut, _ = kit.tube(f'Fork.{sx}', [(sx * fk['x'], 0, R), (sx * fk['x'], 0, fk['top'])], fk['r'])
        add(strut, m['joint'], 'frame')
        add(kit.superellipsoid(f'Axle.{sx}', (0.017, 0.017, 0.007), 0.4, 1.0, seg=(20, 6),
                               location=(sx * (fk['x'] + 0.004), 0, R), rotation=side_on), m['shell'], 'frame')
    add(kit.superellipsoid('Crown', cr['radii'], 0.35, 0.5, seg=(28, 12), location=(0, 0, cr['z'])), m['joint'],
        'frame')
    post, _ = kit.tube('Post', [(0, 0, ps['z'][0]), (0, 0, ps['z'][1])], ps['r'])
    add(post, m['joint'], 'frame')

    # The saddle, a belt and the chest.
    s, t, b = D['seat'], D['torso'], D['belt']
    add(kit.superellipsoid('Seat', s['radii'], s['e'], s['e'], seg=(36, 20), location=(0, 0, s['z'])),
        m['role']('Saddle', 'shell'), 'body')
    add(kit.superellipsoid('Torso', t['radii'], t['e'], t['e'], seg=(40, 28), taper=t['taper'],
                           location=(0, 0, t['z'])), m['shell'], 'body')
    add(kit.superellipsoid('Belt', b['radii'], 0.3, t['e'], seg=(40, 8), location=(0, 0, b['z'])), m['bezel'],
        'body')
    c = D['chest']
    front = -t['radii'][1] * 0.93
    add(kit.superellipsoid('ChestBezel', (c['r'] * 1.4, c['r'] * 1.4, 0.008), 0.35, 1.0, seg=(24, 8),
                           location=(0, front + 0.002, c['z']), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    add(kit.superellipsoid('Chest', (c['r'], c['r'], 0.007), 0.35, 1.0, seg=(24, 8),
                           location=(0, front - 0.003, c['z']), rotation=(math.pi / 2, 0, 0)), m['glow'], 'body')

    # Head: a boxy head, the screen set into its front, a knob each side, a neck.
    n, h = D['neck'], D['head']
    add(kit.superellipsoid('Neck', (n['r'], n['r'], n['half']), 0.4, 1.0, seg=(24, 8), location=(0, 0, n['z'])),
        m['joint'], 'head')
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(48, 32), location=(0, 0, h['z'])), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Uno', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    k = D['knob']
    for sx in (1, -1):
        add(kit.superellipsoid(f'Knob.{sx}', k['radii'], 0.4, 1.0, seg=(20, 8), location=(sx * k['x'], 0, k['z']),
                               rotation=side_on), m['joint'], 'head')

    # The hat: a low crown, a brim and a beacon band.
    ht = D['hat']
    add(kit.superellipsoid('Brim', ht['brim'], 0.35, 1.0, seg=(32, 8), location=(0, 0, ht['z'] - 0.02)), m['bezel'],
        'hat')
    add(kit.superellipsoid('Crown2', ht['crown'], 0.22, 1.0, seg=(32, 12), location=(0, 0, ht['z'] + 0.005)),
        m['shell'], 'hat')
    add(kit.superellipsoid('Band', (ht['crown'][0] + 0.002, ht['crown'][1] + 0.002, ht['band']), 0.3, 1.0,
                           seg=(32, 8), location=(0, 0, ht['z'] - 0.012)), m['beacon'], 'hat')

    # Arms: shoulder ball, rubber-hose arm bent at the elbow, mitten hand.
    sh, hand = D['shoulder'], D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.superellipsoid(f'Shoulder.{side}', (sh['r'],) * 3, seg=(20, 14), location=f((sh['x'], 0, sh['z']))),
            m['joint'], 'body')
        arm, ts = kit.tube(f'Arm.{side}', kit.resample([f(q) for q in D['arm']], 14), D['arm_r'])
        bend = [min(max((u - 0.35) / 0.3, 0.0), 1.0) for u in ts]
        bend = [w * w * (3 - 2 * w) for w in bend]
        add(arm, m['shell'], {f'upper_arm.{sfx}': [1 - w for w in bend], f'forearm.{sfx}': bend})
        add(kit.superellipsoid(f'Hand.{side}', hand['radii'], hand['e'], hand['e'], seg=(24, 16),
                               location=f(hand['center'])), m['shell'], f'hand.{sfx}')
        add(kit.superellipsoid(f'Thumb.{side}', (0.014, 0.014, 0.017), seg=(12, 8), location=f(hand['thumb'])),
            m['shell'], f'hand.{sfx}')

    # Juggling balls, tucked away until wanted.
    bl = D['ball']
    for i in range(3):
        add(kit.superellipsoid(f'Ball.{i}', (bl['r'],) * 3, seg=(20, 14), location=bl['at']), m['role'](f'Ball{i}', 'joint'),
            f'ball.{i}')

    detail(add, m)

    return looks.finish(kit.armature('UnicycleRig', rig_bones()), parts, skin, m)
