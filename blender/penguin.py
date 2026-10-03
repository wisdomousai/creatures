"""Waddle, the crew's robot penguin: a chubby, earnest toy robot, not a penguin in a
robot suit. A bowling-pin body of smooth plates (dark back, a raised pale belly plate
with a round chest lamp, a soft blush plate at the neck), a big rounded head with a
screen face and a small wedge beak on a jaw bone (so it can squawk), a collar ring
between head and body, stubby flippers on ball shoulder joints, a short tail wedge and
big flat paddle feet on short legs. Two lit cheek dots (Dot0, Dot1) sit either side of
the beak and three tiny belly lights (Dot3-5) in a row show mood. Three little glowing
pebbles (Dot2), each on its own bone and scaled to nothing until Waddle offers or
stacks them, lie on the floor in front of the feet. Faces -Y like the rest of the
crew; about 0.62 m tall.

Refined: panel seams round the back plates and a battery hatch with screws and a lamp,
a riveted collar with two little lamps, a screwed belly-plate rim, a plate crest on the
head, ear bolts, a hinge pin on the beak, ball shoulders with cuffs and flippers with
rim plates and tip caps, and paddle feet with ankle cuffs and three jointed toe caps.
"""

import math

import kit
import looks

FACE = 'penguin'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    # A fat egg: wide at the bottom, narrower at the top.
    'body': dict(radii=(0.19, 0.16, 0.22), center=(0, 0.02, 0.27), taper=0.28, e=(0.9, 0.95)),
    'belly': dict(radii=(0.12, 0.042, 0.15), center=(0, -0.13, 0.225), e=(0.6, 0.75)),
    'lamp': dict(radii=(0.024, 0.012, 0.024), center=(0, -0.17, 0.315)),
    'lights': dict(radii=(0.011, 0.007, 0.011), row=[(-0.05, 0.15), (0.0, 0.15), (0.05, 0.15)], y=-0.17),
    'blush': dict(radii=(0.1, 0.035, 0.05), center=(0, -0.118, 0.395), e=(0.55, 0.6)),
    'head': dict(radii=(0.155, 0.135, 0.115), center=(0, -0.02, 0.5), e=(0.8, 0.8)),
    'screen': dict(radii=(0.108, 0.05, 0.062), center=(0, -0.125, 0.525), bezel=0.008),
    'cheek': dict(radii=(0.02, 0.01, 0.02), x=0.11, y=-0.13, z=0.445),
    'beak': dict(radii=(0.05, 0.075, 0.02), center=(0, -0.185, 0.445)),
    'jaw': dict(radii=(0.04, 0.06, 0.014), center=(0, -0.175, 0.418), pivot=(0, -0.11, 0.425)),
    'collar': dict(major=0.125, minor=0.012, at=(0, -0.01, 0.4), squash=0.9),
    'flipper': dict(radii=(0.02, 0.07, 0.15), center=(0.222, 0.0, 0.27), shoulder=(0.19, 0.0, 0.385),
                    tip=(0.245, 0.01, 0.13), ball=0.036),
    'tail': dict(base=(0, 0.16, 0.13), tip=(0, 0.26, 0.07), radii=(0.05, 0.075, 0.02)),
    'leg': dict(x=0.085, top=(0.0, 0.14), bottom=(-0.01, 0.03), r=0.032),
    'foot': dict(radii=(0.072, 0.105, 0.017), y=-0.05),
    'pebble': dict(radii=(0.04, 0.033, 0.026), at=[(0.0, -0.335), (-0.09, -0.32), (0.09, -0.32)]),
}


def surface(obj, x, z, front=True, band=0.012):
    """The y of a part's front (or back) skin near (x, z), read off its mesh, so trim sits
    on the skin instead of being guessed."""
    ox, oy, oz = obj.location
    best = None
    for v in obj.data.vertices:
        vx, vy, vz = v.co.x + ox, v.co.y + oy, v.co.z + oz
        d = (vx - x) ** 2 + (vz - z) ** 2
        if (vy < oy) == front and (best is None or d < best[0] - 1e-9 or (abs(d - best[0]) < 1e-9 and abs(vy) > abs(best[1]))):
            best = (d, vy)
    return best[1]


def outline_at(obj, z):
    """(half width, front y, back y) of a part's skin at height z."""
    ox, oy, oz = obj.location
    near = min(abs(v.co.z + oz - z) for v in obj.data.vertices)
    vs = [(v.co.x + ox, v.co.y + oy) for v in obj.data.vertices if abs(v.co.z + oz - z) < near + 1e-5]
    return max(abs(x) for x, _ in vs), min(y for _, y in vs), max(y for _, y in vs)


def rig_bones():
    f, lg, j, t = D['flipper'], D['leg'], D['jaw'], D['tail']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.02, 0.15), (0, 0.02, 0.4), 'root'),
        ('head', (0, -0.02, 0.42), (0, -0.02, 0.62), 'body'),
        ('jaw', j['pivot'], (0, -0.25, j['pivot'][2]), 'head'),
        ('tail', t['base'], t['tip'], 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        sx, sy, sz = f['shoulder']
        tx, ty, tz = f['tip']
        bones.append((f'wing.{sfx}', (side * sx, sy, sz), (side * tx, ty, tz), 'body'))
        bones.append((f'leg.{sfx}', (side * lg['x'], lg['top'][0], lg['top'][1]),
                      (side * lg['x'], lg['bottom'][0], 0.0), 'root'))
    for i, (x, y) in enumerate(D['pebble']['at'], 1):
        bones.append((f'pebble.{i}', (x, y, 0.02), (x, y, 0.06), 'root'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'][0], b['e'][1], seg=(40, 28), taper=b['taper'],
                           location=b['center']), m['shell'], 'body')
    # The raised belly plate, with a round chest lamp and a row of mood lights on it.
    bl = D['belly']
    add(kit.superellipsoid('Belly', bl['radii'], bl['e'][0], bl['e'][1], seg=(32, 20), location=bl['center']),
        m['role']('Belly', 'joint'), 'body')
    lp = D['lamp']
    add(kit.superellipsoid('Lamp', lp['radii'], 0.5, 0.5, seg=(20, 10), location=lp['center']), m['beacon'],
        'body')
    li = D['lights']
    for i, (x, z) in enumerate(li['row']):
        add(kit.superellipsoid(f'BellyLight.{i}', li['radii'], 0.6, 0.6, seg=(14, 8), location=(x, li['y'], z)),
            m['dot'](3 + i), 'body')
    bs = D['blush']
    add(kit.superellipsoid('Blush', bs['radii'], bs['e'][0], bs['e'][1], seg=(28, 14), location=bs['center']),
        m['role']('Blush'), 'body')

    # Back plates: panel seams round the body, one down the spine, and a battery hatch.
    body = parts[0]
    for i, z in enumerate((0.12, 0.2, 0.31)):
        hw, yf, yb = outline_at(body, z)
        ring = kit.torus(f'Seam.{i}', hw * 0.985, 0.0035, seg=(40, 6), location=(0, (yf + yb) / 2, z))
        add(kit.stretch(ring, sy=(yb - yf) / 2 / hw), m['bezel'], 'body')
    spine = []
    for z in (0.09, 0.15, 0.22, 0.29, 0.36):
        spine.append((0, outline_at(body, z)[2] - 0.002, z))
    add(kit.tube('Spine', spine, 0.0035, ring=6)[0], m['bezel'], 'body')
    hz = 0.2
    hy = outline_at(body, hz)[2]
    add(kit.superellipsoid('HatchRim', (0.06, 0.016, 0.05), 0.35, 0.35, seg=(20, 10), location=(0, hy - 0.004, hz)),
        m['joint'], 'body')
    add(kit.superellipsoid('Hatch', (0.052, 0.014, 0.042), 0.35, 0.35, seg=(20, 10), location=(0, hy + 0.003, hz)),
        m['shell'], 'body')
    for i, (sx, sz) in enumerate(((-0.04, 0.03), (0.04, 0.03), (-0.04, -0.03), (0.04, -0.03))):
        add(kit.superellipsoid(f'HatchScrew.{i}', (0.006, 0.004, 0.006), seg=(10, 6),
                               location=(sx, hy + 0.016, hz + sz)), m['joint'], 'body')
    add(kit.superellipsoid('HatchLamp', (0.007, 0.004, 0.007), seg=(10, 6), location=(0, hy + 0.017, hz + 0.02)),
        m['glow'], 'body')
    add(kit.superellipsoid('HatchGrip', (0.02, 0.004, 0.005), 0.4, 0.5, seg=(12, 6),
                           location=(0, hy + 0.017, hz - 0.015)), m['joint'], 'body')
    # The belly plate's rim and its four corner screws.
    bel = parts[1]
    rim = kit.torus('BellyRim', bl['radii'][0] * 1.0, 0.005, seg=(40, 6))
    kit.stretch(rim, sy=bl['radii'][2] / bl['radii'][0])
    rim.rotation_euler = (math.pi / 2, 0, 0)
    rim.location = (0, bl['center'][1] - 0.012, bl['center'][2])
    add(rim, m['joint'], 'body')
    for i, (sx, sz) in enumerate(((-0.075, 0.115), (0.075, 0.115), (-0.075, 0.335), (0.075, 0.335))):
        y = surface(bel, sx, sz) - 0.001
        add(kit.superellipsoid(f'BellyScrew.{i}', (0.007, 0.004, 0.007), seg=(10, 6), location=(sx, y, sz)),
            m['bezel'], 'body')

    # Head, with the collar ring where it meets the body.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(40, 28), location=h['center']),
        m['shell'], 'head')
    head = parts[-1]
    # A seam round the head, ear bolts either side and a crest of three plates.
    hw, yf, yb = outline_at(head, 0.575)
    ring = kit.torus('HeadSeam', hw * 0.985, 0.0035, seg=(40, 6), location=(0, (yf + yb) / 2, 0.575))
    add(kit.stretch(ring, sy=(yb - yf) / 2 / hw), m['bezel'], 'head')
    for i, side in enumerate((1, -1)):
        hw2 = outline_at(head, 0.505)[0]
        add(kit.superellipsoid(f'EarPlate.{i}', (0.008, 0.03, 0.03), 0.4, 0.5, seg=(16, 8),
                               location=(side * (hw2 - 0.002), 0.0, 0.505)), m['joint'], 'head')
        add(kit.superellipsoid(f'EarBolt.{i}', (0.007, 0.011, 0.011), seg=(10, 6),
                               location=(side * (hw2 + 0.006), 0.0, 0.505)), m['bezel'], 'head')
    top = h['center'][2] + h['radii'][2]
    for i, (x, tilt, hgt) in enumerate(((-0.03, -0.35, 0.03), (0.0, 0.0, 0.042), (0.03, 0.35, 0.03))):
        add(kit.superellipsoid(f'Crest.{i}', (0.008, 0.026, hgt), 0.5, 0.6, seg=(14, 8),
                               location=(x * 0.8, 0.02, top + hgt * 0.45), rotation=(0.35, tilt * 0.6, 0)),
            m['joint'], 'head')
    c = D['collar']
    ring = kit.torus('Collar', c['major'], c['minor'], seg=(40, 8), location=c['at'])
    add(kit.stretch(ring, sy=c['squash']), m['joint'], 'body')
    for i in range(12):
        a = 2 * math.pi * i / 12
        add(kit.superellipsoid(f'Rivet.{i}', (0.006, 0.006, 0.006), seg=(8, 6),
                               location=(c['major'] * math.cos(a), c['at'][1] + c['major'] * c['squash'] * math.sin(a),
                                         c['at'][2] + c['minor'] * 0.9)), m['bezel'], 'body')
    for i, side in enumerate((1, -1)):
        add(kit.superellipsoid(f'CollarLamp.{i}', (0.009, 0.009, 0.009), seg=(10, 6),
                               location=(side * (c['major'] + 0.004), c['at'][1] - 0.01, c['at'][2])),
            m['glow'], 'body')
    sc = D['screen']
    glass, rim = kit.screen('Penguin', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    ck = D['cheek']
    for i, side in enumerate((1, -1)):
        add(kit.superellipsoid(f'Cheek.{i}', ck['radii'], 0.6, 0.6, seg=(14, 8),
                               location=(side * ck['x'], ck['y'], ck['z']), rotation=(0, 0, side * 0.2)),
            m['dot'](i), 'head')

    # A small wedge beak over a jaw, both pointing forward.
    bk, jw = D['beak'], D['jaw']
    add(kit.superellipsoid('Beak', bk['radii'], 0.5, 0.7, seg=(24, 12), location=bk['center'],
                           rotation=(0.1, 0, 0)), m['role']('Beak', 'joint'), 'head')
    add(kit.superellipsoid('Jaw', jw['radii'], 0.5, 0.7, seg=(20, 10), location=jw['center']),
        m['role']('Beak', 'joint'), 'jaw')

    for i, side in enumerate((1, -1)):
        add(kit.superellipsoid(f'BeakPin.{i}', (0.006, 0.01, 0.01), seg=(10, 6),
                               location=(side * 0.049, -0.14, 0.437)), m['bezel'], 'head')
    add(kit.superellipsoid('BeakRidge', (0.006, 0.05, 0.006), 0.5, 0.5, seg=(10, 6), location=(0, -0.185, 0.464)),
        m['bezel'], 'head')

    # Flippers on ball shoulder joints, with a cuff, a rim plate and a tip cap.
    f = D['flipper']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x, y, z = f['center']
        add(kit.superellipsoid(f'Flipper.{sfx}', f['radii'], 0.7, 0.9, seg=(28, 16), location=(side * x, y, z),
                               rotation=(0, 0, -side * 0.12)), m['role']('Flipper'), f'wing.{sfx}')
        sx, sy, sz = f['shoulder']
        add(kit.superellipsoid(f'Shoulder.{sfx}', (f['ball'],) * 3, seg=(16, 10),
                               location=(side * (sx + 0.005), sy, sz)), m['joint'], f'wing.{sfx}')
        cuff = kit.torus(f'Cuff.{sfx}', 0.075, 0.008, seg=(28, 6))
        add(kit.stretch(cuff, sx=0.38), m['bezel'], f'wing.{sfx}').location = (side * 0.214, 0.0, 0.338)
        rimp = kit.superellipsoid(f'FlipperRim.{sfx}', (0.011, f['radii'][1] + 0.006, f['radii'][2] + 0.006),
                                  0.7, 0.9, seg=(28, 16), location=(side * (x - 0.004), y, z),
                                  rotation=(0, 0, -side * 0.12))
        add(rimp, m['joint'], f'wing.{sfx}')
        add(kit.superellipsoid(f'FlipperCap.{sfx}', (0.012, 0.03, 0.02), 0.6, 0.7, seg=(12, 8),
                               location=(side * (f['tip'][0] - 0.004), f['tip'][1], f['tip'][2] + 0.005)),
            m['bezel'], f'wing.{sfx}')
        for k, sz2 in enumerate((0.3, 0.24)):
            add(kit.superellipsoid(f'FlipperScrew.{sfx}{k}', (0.005, 0.007, 0.007), seg=(8, 6),
                                   location=(side * (x + 0.02), -0.03, sz2)), m['bezel'], f'wing.{sfx}')

    # A short tail wedge.
    t = D['tail']
    add(kit.superellipsoid('Tail', t['radii'], 0.5, 0.6, seg=(20, 10), location=(0, 0.2, 0.1),
                           rotation=(-0.5, 0, 0)), m['shell'], 'tail')

    add(kit.superellipsoid('TailHinge', (0.02, 0.02, 0.02), seg=(12, 8), location=(0, 0.165, 0.13)), m['joint'],
        'tail')
    add(kit.superellipsoid('TailPlate', (0.028, 0.045, 0.008), 0.5, 0.6, seg=(12, 8), location=(0, 0.215, 0.098),
                           rotation=(-0.5, 0, 0)), m['joint'], 'tail')

    # Short legs and big flat paddle feet, with an ankle cuff and three jointed toe caps.
    lg, ft = D['leg'], D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        leg, _ = kit.tube(f'Leg.{sfx}', [(side * lg['x'], *lg['top']), (side * lg['x'], *lg['bottom'])], lg['r'],
                          ring=12)
        add(leg, m['role']('Feet', 'joint'), f'leg.{sfx}')
        add(kit.superellipsoid(f'Foot.{sfx}', ft['radii'], 0.3, 0.8, seg=(28, 8),
                               location=(side * lg['x'], ft['y'], ft['radii'][2])), m['role']('Feet', 'joint'),
            f'leg.{sfx}')
        ank = kit.torus(f'Ankle.{sfx}', lg['r'] + 0.003, 0.007, seg=(20, 6), location=(side * lg['x'], -0.006, 0.05))
        add(ank, m['bezel'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Heel.{sfx}', (0.03, 0.028, 0.02), 0.6, 0.6, seg=(12, 8),
                               location=(side * lg['x'], 0.0, 0.035)), m['role']('Feet', 'joint'), f'leg.{sfx}')
        for k, tx in enumerate((-0.042, 0.0, 0.042)):
            add(kit.superellipsoid(f'Toe.{sfx}{k}', (0.02, 0.03, 0.013), 0.4, 0.6, seg=(12, 8),
                                   location=(side * lg['x'] + tx, -0.128 + (0.008 if k == 1 else 0) * -1, 0.016)),
                m['role']('Toes', 'shell'), f'leg.{sfx}')
            add(kit.superellipsoid(f'Knuckle.{sfx}{k}', (0.008, 0.008, 0.005), seg=(8, 6),
                                   location=(side * lg['x'] + tx, -0.095, 0.027)), m['bezel'], f'leg.{sfx}')

    # Pebbles: glowing, each on its own bone, hidden until the site scales them up.
    pb = D['pebble']
    for i, (x, y) in enumerate(pb['at'], 1):
        add(kit.superellipsoid(f'Pebble.{i}', pb['radii'], 0.7, 0.7, seg=(16, 10),
                               location=(x, y, 0.02 + pb['radii'][2])), m['dot'](2), f'pebble.{i}')

    return looks.finish(kit.armature('PenguinRig', rig_bones()), parts, skin, m)
