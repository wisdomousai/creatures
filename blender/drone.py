"""Whirr, the crew's robot hover drone: a toy robot, not a quadcopter from a catalogue. A
round hull with a belt of little lights, a domed head on top with a wide screen visor and
a beacon on a stub, four small ducted rotors on stubby arms (the ducts lit, the blades
their own bones so they spin), a claw hanging on a short arm under the belly, a searchlight
lamp under the chin and two skid runners to land on.

Hidden inside, for the acts: a light beam (the searchlight), a camera-flash star, and a
little package the claw can hold (all scaled to nothing until an act calls them up).
The lights are Dot0 (the lamp), Dot1..Dot4 (the four rotor rings, front left, front
right, back left, back right) and Dot5..Dot7 (the belt, left to right). Faces -Y like the
rest of the crew; about 0.5 m from the skids to the top of the beacon.
"""

import math

import kit
import looks

FACE = 'drone'
PREVIEW = dict(lift=0.1, width=0.6)

D = {
    'hull': dict(radii=(0.165, 0.145, 0.07), center=(0, 0, 0.235), e1=0.4, e2=0.55),
    'band': dict(radii=(0.172, 0.152, 0.012), center=(0, 0, 0.245)),
    'head': dict(radii=(0.145, 0.125, 0.112), center=(0, 0, 0.335), e1=0.5, e2=0.6),
    # 2:1, like the drone's face layout (512 x 256)
    'screen': dict(radii=(0.11, 0.03, 0.055), center=(0, -0.115, 0.345), bezel=0.008),
    'cap': dict(radii=(0.05, 0.05, 0.016), center=(0, 0.03, 0.442)),
    'beacon': dict(base=(0, 0.03, 0.44), tip=(0, 0.03, 0.492), bulb=0.03),
    # Rotors: duct centres (x, y, z); ring radius; blade half-length.
    'rotor': dict(x=0.215, y=0.1, z=0.275, ring=0.064, tube=0.011, blade=0.056),
    'lit': dict(major=0.048, minor=0.0055),
    'skid': dict(x=0.105, front=-0.14, back=0.14, z=0.013, r=0.011),
    'lamp': dict(z=0.185, radii=(0.03, 0.03, 0.013)),
    'lights': dict(z=0.225, x=0.06, radii=(0.017, 0.01, 0.008)),
    'arm': dict(top=0.17, bottom=0.105, y=-0.01, r=0.013),
    'palm': dict(radii=(0.03, 0.02, 0.017), z=0.092),
    'pkg': dict(radii=(0.033, 0.03, 0.03), z=0.05),
}
SIDES = (('L', 1), ('R', -1))
ROTORS = (('FL', 1, -1), ('FR', -1, -1), ('BL', 1, 1), ('BR', -1, 1))


def rotor_at(sx, sy):
    r = D['rotor']
    return (sx * r['x'], sy * r['y'], r['z'])


def hull_front(z):
    """How far forward (-y) the hull's surface is at height z, on the middle line."""
    h = D['hull']
    dz = min(abs(z - h['center'][2]) / h['radii'][2], 0.999)
    phi = math.asin(dz ** (1 / h['e1']))
    return h['radii'][1] * math.cos(phi) ** h['e1']


def hull_scale(z):
    """How much of its widest girth the hull has at height z (1 at the waist)."""
    h = D['hull']
    dz = min(abs(z - h['center'][2]) / h['radii'][2], 0.999)
    return math.cos(math.asin(dz ** (1 / h['e1']))) ** h['e1']


def rig_bones():
    a, r = D['arm'], D['rotor']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.2), (0, 0, 0.3), 'root'),
        ('head', (0, 0, 0.3), (0, 0, 0.44), 'body'),
        ('beacon', D['beacon']['base'], (D['beacon']['tip'][0], D['beacon']['tip'][1], D['beacon']['tip'][2] + 0.03),
         'head'),
        ('arm', (0, a['y'], a['top']), (0, a['y'], a['bottom']), 'body'),
        ('claw.L', (0.016, a['y'], 0.09), (0.03, a['y'], 0.04), 'arm'),
        ('claw.R', (-0.016, a['y'], 0.09), (-0.03, a['y'], 0.04), 'arm'),
        ('pkg', (0, a['y'], 0.07), (0, a['y'], 0.03), 'arm'),
        ('beam', (0, -hull_front(D['lamp']['z']), D['lamp']['z']), (0, -hull_front(D['lamp']['z']), -0.06), 'body'),
        ('flash', (0, -0.17, 0.2), (0, -0.17, 0.25), 'body'),
    ]
    for name, sx, sy in ROTORS:
        x, y, z = rotor_at(sx, sy)
        bones.append((f'rotor.{name}', (x, y, z), (x, y, z + 0.04), 'body'))
    return bones


def star(name, points, outer, inner, thick, location):
    """A flat starburst standing in the XZ plane, thin in Y (the camera flash)."""
    verts = []
    n = points * 2
    for side in (-1, 1):
        for i in range(n):
            rad = outer if i % 2 == 0 else inner
            a = 2 * math.pi * i / n
            verts.append((rad * math.sin(a), side * thick, rad * math.cos(a)))
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    obj = kit.mesh_object(name, verts, faces, location)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def detail(add, m):
    """The refinement: seams, vents, a hatch with screws, grilles, hubs, joints, springs, a fin."""
    h, hd, r, sk = D['hull'], D['head'], D['rotor'], D['skid']
    a = D['arm']

    def screw(name, loc, bone, rot=(math.pi / 2, 0, 0), rad=0.0055):
        add(kit.superellipsoid(name, (rad, rad, rad * 0.6), seg=(10, 6), location=loc, rotation=rot), m['joint'], bone)

    # Hull panel seams (thin rings above and below the belt) and side vents.
    for i, z in enumerate((0.208, 0.277)):
        k = hull_scale(z)
        ring = kit.torus(f'Seam.{i}', 1.0, 0.0022, seg=(40, 4), location=(0, 0, z))
        kit.stretch(ring, h['radii'][0] * k * 1.004, h['radii'][1] * k * 1.004, 1)
        add(ring, m['bezel'], 'body')
    for sx in (1, -1):
        for i, z in enumerate((0.205, 0.216, 0.227)):
            add(kit.superellipsoid(f'Vent.{sx}.{i}', (0.003, 0.03, 0.003), 0.3, 0.5, seg=(12, 6),
                                   location=(sx * (h['radii'][0] * hull_scale(z) - 0.001), 0.0, z)), m['bezel'], 'body')

    # A hatch on the back with four screws, and a little fin above it (no numbers on it).
    by = h['radii'][1] * hull_scale(0.225) - 0.004
    add(kit.superellipsoid('Hatch', (0.045, 0.007, 0.03), 0.3, 0.3, seg=(20, 8), location=(0, by + 0.004, 0.225)),
        m['role']('Hatch', 'bezel'), 'body')
    for sx in (1, -1):
        for dz in (1, -1):
            screw(f'HatchScrew.{sx}.{dz}', (sx * 0.035, by + 0.011, 0.225 + dz * 0.021), 'body', rad=0.0045)
    add(kit.superellipsoid('Fin', (0.005, 0.03, 0.03), 0.4, 0.4, seg=(12, 6), location=(0, 0.16, 0.298),
                           rotation=(-0.35, 0, 0)), m['role']('Fin', 'joint'), 'body')
    add(kit.superellipsoid('FinFoot', (0.014, 0.02, 0.01), 0.4, 0.6, seg=(12, 6), location=(0, 0.14, 0.275)),
        m['bezel'], 'body')

    # Head: a panel seam, a camera lens under the visor, side bolts and an antenna whisker.
    hs = hd['radii']
    zs = 0.385
    k = math.cos(math.asin(min(abs(zs - hd['center'][2]) / hs[2], 0.999) ** (1 / hd['e1']))) ** hd['e1']
    ring = kit.torus('HeadSeam', 1.0, 0.002, seg=(36, 4), location=(0, 0, zs))
    kit.stretch(ring, hs[0] * k * 1.004, hs[1] * k * 1.004, 1)
    add(ring, m['bezel'], 'head')
    add(kit.torus('LensRing', 0.011, 0.0032, seg=(20, 6), location=(0, -0.112, 0.288), rotation=(math.pi / 2 * 0.9, 0, 0)),
        m['bezel'], 'head')
    add(kit.superellipsoid('Lens', (0.0085, 0.0085, 0.006), seg=(16, 10), location=(0, -0.114, 0.288),
                           rotation=(math.pi / 2 * 0.9, 0, 0)), m['joint'], 'head')
    for sx in (1, -1):
        add(kit.superellipsoid(f'EarPuck.{sx}', (0.01, 0.026, 0.026), 0.4, 0.5, seg=(16, 10),
                               location=(sx * 0.143, 0.0, 0.335)), m['bezel'], 'head')
        screw(f'EarScrew.{sx}', (sx * 0.152, 0.0, 0.335), 'head', rot=(0, math.pi / 2, 0), rad=0.005)
    whisk, _ = kit.tube('Whisker', kit.spline([(0.07, 0.07, 0.425), (0.1, 0.08, 0.47), (0.115, 0.075, 0.53)], 12),
                        0.0025, ring=6)
    add(whisk, m['joint'], 'head')
    add(kit.superellipsoid('WhiskerTip', (0.007,) * 3, seg=(10, 8), location=(0.115, 0.075, 0.535)), m['dot'](0), 'head')
    add(kit.torus('CapRing', 0.052, 0.004, seg=(32, 6), location=(0, 0.03, 0.436)), m['bezel'], 'head')

    # Rotors: a second thin rim, a guard grille with struts, hub caps, blade tips, joint bolts.
    for name, sx, sy in ROTORS:
        x, y, z = rotor_at(sx, sy)
        add(kit.torus(f'Rim.{name}', r['ring'], 0.0055, seg=(32, 5), location=(x, y, z + 0.011)), m['bezel'], 'body')
        for j, ang in enumerate((math.pi / 4, -math.pi / 4)):
            add(kit.superellipsoid(f'Grille.{name}.{j}', (r['ring'] - 0.004, 0.0022, 0.0022), 0.3, 0.3, seg=(8, 4),
                                   location=(x, y, z - 0.012), rotation=(0, 0, ang)), m['bezel'], 'body')
        add(kit.torus(f'GrilleRing.{name}', r['ring'] * 0.5, 0.0022, seg=(20, 4), location=(x, y, z - 0.012)),
            m['bezel'], 'body')
        add(kit.superellipsoid(f'Post.{name}', (0.006, 0.006, 0.014), 0.4, 0.6, seg=(10, 6),
                               location=(x, y, z - 0.002)), m['joint'], 'body')
        add(kit.superellipsoid(f'HubCap.{name}', (0.008, 0.008, 0.008), seg=(12, 8), location=(x, y, z + 0.02)),
            m['joint'], f'rotor.{name}')
        for j, (tx, ty) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
            add(kit.superellipsoid(f'Tip.{name}.{j}', (0.007, 0.007, 0.0045), 0.5, 0.6, seg=(10, 6),
                                   location=(x + tx * (r['blade'] - 0.006), y + ty * (r['blade'] - 0.006), z + 0.012)),
                m['bezel'], f'rotor.{name}')
        add(kit.superellipsoid(f'Elbow.{name}', (0.017, 0.017, 0.017), seg=(14, 10),
                               location=(sx * 0.125, sy * 0.06, 0.25)), m['bezel'], 'body')
        screw(f'ElbowBolt.{name}', (sx * 0.125, sy * 0.06, 0.267), 'body', rot=(0, 0, 0), rad=0.005)
        add(kit.superellipsoid(f'Knuckle.{name}', (0.014, 0.014, 0.014), seg=(12, 8),
                               location=(x - sx * 0.03, y - sy * 0.03, z - 0.004)), m['bezel'], 'body')

    # Skids: end caps, and three little spring coils on each strut.
    for sx in (1, -1):
        x = sx * sk['x']
        for e, y in enumerate((sk['front'] - 0.005, sk['back'] + 0.005)):
            add(kit.superellipsoid(f'SkidCap.{sx}.{e}', (0.014, 0.014, 0.014), seg=(12, 8), location=(x, y, 0.07)),
                m['bezel'], 'body')
        for e, y in enumerate((-0.07, 0.07)):
            for i, t in enumerate((0.35, 0.5, 0.65)):
                px = sx * 0.085 + (x - sx * 0.085) * t
                add(kit.torus(f'Coil.{sx}.{e}.{i}', 0.0095, 0.0028, seg=(10, 4),
                              location=(px, y * (1 + 0.05 * t), 0.17 + (sk['z'] + 0.006 - 0.17) * t)), m['bezel'], 'body')
        add(kit.superellipsoid(f'SkidFoot.{sx}', (0.013, 0.05, 0.007), 0.4, 0.5, seg=(12, 6),
                               location=(x, 0.0, sk['z'] - 0.006)), m['role']('Foot', 'bezel'), 'body')

    # Claw: a wrist ring, knuckle balls and finger pads, screws on the palm.
    pm = D['palm']
    add(kit.torus('WristRing', 0.025, 0.0045, seg=(24, 6), location=(0, a['y'], a['bottom'] - 0.014)), m['bezel'], 'arm')
    add(kit.torus('ArmRing', 0.016, 0.0035, seg=(20, 6), location=(0, a['y'], a['top'] - 0.012)), m['bezel'], 'body')
    for sfx, sx in SIDES:
        add(kit.superellipsoid(f'KnuckleA.{sfx}', (0.0105, 0.0105, 0.0105), seg=(12, 8),
                               location=(sx * 0.02, a['y'], 0.085)), m['joint'], 'arm')
        add(kit.superellipsoid(f'Mid.{sfx}', (0.0095, 0.0095, 0.0095), seg=(12, 8),
                               location=(sx * 0.034, a['y'], 0.062)), m['joint'], f'claw.{sfx}')
        add(kit.superellipsoid(f'Pad.{sfx}', (0.0075, 0.0055, 0.0075), 0.5, 0.5, seg=(12, 8),
                               location=(sx * 0.008, a['y'] - 0.005, 0.03)), m['joint'], f'claw.{sfx}')
        screw(f'PalmScrew.{sfx}', (sx * 0.02, a['y'] - 0.017, pm['z'] + 0.004), 'arm', rad=0.0035)


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Hull, with a band round its waist and a belt of three little lights on the front.
    h = D['hull']
    add(kit.superellipsoid('Hull', h['radii'], h['e1'], h['e2'], seg=(56, 28), location=h['center']), m['shell'], 'body')
    b = D['band']
    add(kit.superellipsoid('Band', b['radii'], 0.3, 0.55, seg=(56, 8), location=b['center']), m['bezel'], 'body')
    li = D['lights']
    for i, x in enumerate((li['x'], 0, -li['x'])):
        add(kit.superellipsoid(f'Belt.{i}', li['radii'], 0.5, 0.6, seg=(16, 10),
                               location=(x, -hull_front(li['z']) - 0.002, li['z'])), m['dot'](5 + i), 'body')
    for sx in (1, -1):
        add(kit.superellipsoid(f'Bolt.{sx}', (0.007, 0.007, 0.005), seg=(10, 6),
                               location=(sx * 0.115, -0.1, 0.262), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')

    # Head: a dome with a wide screen visor, a cap and the beacon on its stub.
    hd = D['head']
    add(kit.superellipsoid('Head', hd['radii'], hd['e1'], hd['e2'], seg=(56, 32), location=hd['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Drone', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    c = D['cap']
    add(kit.superellipsoid('Cap', c['radii'], 0.4, 1.0, seg=(32, 10), location=c['center']), m['joint'], 'head')
    bc = D['beacon']
    stem, _ = kit.tube('BeaconStem', [bc['base'], bc['tip']], 0.008, ring=10)
    add(stem, m['joint'], 'beacon')
    add(kit.superellipsoid('Bulb', (bc['bulb'],) * 3, seg=(24, 16),
                           location=(bc['tip'][0], bc['tip'][1], bc['tip'][2] + bc['bulb'] * 0.8)),
        m['beacon'], 'beacon')

    # Four ducted rotors on stubby arms: a duct ring, a lit ring inside it, two blades on a hub.
    r, lit = D['rotor'], D['lit']
    for name, sx, sy in ROTORS:
        x, y, z = rotor_at(sx, sy)
        arm, _ = kit.tube(f'RotorArm.{name}', [(sx * 0.125, sy * 0.06, 0.25), (x, y, z - 0.004)], 0.012, ring=12)
        add(arm, m['joint'], 'body')
        add(kit.torus(f'Duct.{name}', r['ring'], r['tube'], seg=(40, 8), location=(x, y, z)), m['role']('Duct'), 'body')
        add(kit.torus(f'Lit.{name}', lit['major'], lit['minor'], seg=(32, 6), location=(x, y, z - 0.002)),
            m['dot'](1 + [n for n, _, _ in ROTORS].index(name)), 'body')
        add(kit.superellipsoid(f'Blade.{name}.a', (r['blade'], 0.008, 0.003), 0.3, 0.5, seg=(20, 8),
                               location=(x, y, z + 0.012)), m['shell'], f'rotor.{name}')
        add(kit.superellipsoid(f'Blade.{name}.b', (r['blade'], 0.008, 0.003), 0.3, 0.5, seg=(20, 8),
                               location=(x, y, z + 0.012), rotation=(0, 0, math.pi / 2)), m['shell'], f'rotor.{name}')
        add(kit.superellipsoid(f'Hub.{name}', (0.013, 0.013, 0.008), 0.4, 1.0, seg=(20, 8), location=(x, y, z + 0.012)),
            m['bezel'], f'rotor.{name}')

    # Searchlight under the chin, its beam, and the camera flash.
    lp = D['lamp']
    fy = hull_front(lp['z'])
    add(kit.superellipsoid('Lamp', lp['radii'], 0.5, 0.8, seg=(24, 12), location=(0, -fy + 0.004, lp['z']),
                           rotation=(math.pi / 2 * 0.8, 0, 0)), m['dot'](0), 'body')
    add(kit.superellipsoid('LampRim', (lp['radii'][0] + 0.007, lp['radii'][1] + 0.007, 0.007), 0.4, 1.0, seg=(24, 8),
                           location=(0, -fy + 0.0, lp['z']), rotation=(math.pi / 2 * 0.8, 0, 0)), m['bezel'], 'body')
    add(kit.lathe('Beam', [(0.0, lp['z']), (0.09, -0.06), (0.0, -0.06)], seg=10, location=(0, -fy, 0)),
        m['flame'], 'beam')
    add(star('Flash', 8, 0.06, 0.02, 0.003, (0, -0.17, 0.2)), m['flame'], 'flash')

    # Skids: two runners with struts up into the hull.
    sk = D['skid']
    for sx in (1, -1):
        x = sx * sk['x']
        path = [(x, sk['front'] - 0.005, 0.07), (x, sk['front'] + 0.02, 0.02), (x, sk['front'] + 0.05, sk['z']),
                (x, sk['back'] - 0.05, sk['z']), (x, sk['back'] - 0.02, 0.02), (x, sk['back'] + 0.005, 0.07)]
        add(kit.tube(f'Skid.{sx}', kit.spline(path, 24), sk['r'], ring=10)[0], m['joint'], 'body')
        for y in (-0.07, 0.07):
            strut, _ = kit.tube(f'Strut.{sx}.{y}', [(sx * 0.085, y, 0.17), (x, y * 1.05, sk['z'] + 0.006)], 0.007, ring=8)
            add(strut, m['joint'], 'body')

    # The claw on its short arm: wrist ball, palm, two curved fingers, and the package.
    a, pm = D['arm'], D['palm']
    arm, _ = kit.tube('ClawArm', [(0, a['y'], a['top']), (0, a['y'], a['bottom'])], a['r'], ring=12)
    add(arm, m['joint'], 'arm')
    add(kit.superellipsoid('Wrist', (0.022, 0.022, 0.02), seg=(20, 12), location=(0, a['y'], a['bottom'])), m['bezel'],
        'arm')
    add(kit.superellipsoid('Palm', pm['radii'], 0.5, 0.6, seg=(24, 12), location=(0, a['y'], pm['z'])), m['shell'],
        'arm')
    for sfx, sx in SIDES:
        finger, _ = kit.tube(f'Finger.{sfx}', kit.spline([(sx * 0.02, a['y'], 0.085), (sx * 0.034, a['y'], 0.062),
                                                          (sx * 0.026, a['y'], 0.04), (sx * 0.008, a['y'], 0.03)], 10),
                             [0.009, 0.009, 0.008, 0.007, 0.006, 0.006, 0.006, 0.006, 0.006, 0.006], ring=8)
        add(finger, m['bezel'], f'claw.{sfx}')
    pk = D['pkg']
    add(kit.superellipsoid('Package', pk['radii'], 0.3, 0.3, seg=(20, 12), location=(0, a['y'], pk['z'])),
        m['role']('Package', 'joint'), 'pkg')
    add(kit.superellipsoid('Strap', (pk['radii'][0] + 0.002, 0.008, pk['radii'][2] + 0.002), 0.3, 0.3, seg=(20, 8),
                           location=(0, a['y'], pk['z'])), m['bezel'], 'pkg')

    detail(add, m)

    return looks.finish(kit.armature('DroneRig', rig_bones()), parts, skin, m)
