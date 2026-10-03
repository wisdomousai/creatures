"""Bit, the crew's robot kitten: a fluffy round tumbler, nearly all head and belly. A big
screen-faced head with small wide-set ears, a crest of three fins and a bolt on each cheek; a ball of a body on four stubby legs with white socks; a stub of a
tail ending in a pom. A collar with a bell that lights in the beacon's colour, and a toy
ball (a lit band round its middle) on a bone of its own that isn't parented to the body.
Faces -Y like the rest of the crew; about 0.47 m to the ear tips.

Built from the parts in cat.py. In the colour look Bit is a tuxedo: dark, with a white
blaze, bib, socks, tufts and tail tip.
"""

import math

from mathutils import Vector

import cat
import kit
import looks

FACE = 'kitten'
PREVIEW = dict(lift=0.0, width=0.5)
BOXY = 0.6

D = {
    'head': dict(radii=(0.2, 0.155, 0.155), center=(0, -0.1, 0.31)),
    'screen': dict(radii=(0.16, 0.105, 0.11), center=(0, -0.175, 0.31), bezel=0.01),
    'ear': dict(x=0.125, z=0.43, tilt=0.3, inset=0.024,
                profile=[(0.0, 0.105), (0.02, 0.09), (0.05, 0.04), (0.066, 0.0)]),
    'body': dict(radii=(0.125, 0.135, 0.115), center=(0, 0.035, 0.155), e=0.7),
    'leg': dict(x=0.065, front=-0.06, back=0.11, top=0.14, bottom=0.03, r=0.032),
    'paw': dict(radii=(0.042, 0.05, 0.028), e=0.45),
    'tail': [(0, 0.15, 0.17), (0, 0.21, 0.2), (0, 0.24, 0.26)],
    'tail_r': (0.03, 0.026),
    'pom': dict(r=0.045, center=(0, 0.25, 0.285)),
    'collar': dict(center=(0, -0.075, 0.225), major=0.11, minor=0.014, tilt=0.5),
    'bell': dict(r=0.026, center=(0, -0.18, 0.185)),
    'props': dict(ball=(0.25, -0.13)),
}
SOCK = 0.085  # legs are white below this height


def refine_bit(add, m):
    """Bit's finer detail (only her build calls this): layered fluff plates on the cheeks,
    crown, back and pom, seam rings round the belly with a vented chest plate, shoulder
    hubs, anklets, big pads and toe beads, ear hinges with a light, whisker pods with lit
    tips, a studded collar with the bell on a ring, and a tongue on its own bones (hidden
    until she yawns). Lights: Dot0 the pom, Dot1 the tail's collar, Dot3 the ear hinges,
    Dot4 the whisker tips."""
    hx, hy, hz = D['head']['center']
    b, lg = D['body'], D['leg']
    bx, by, bz = b['center']
    rx, ry, rz = b['radii']
    fluff = m['role']('Fluff', 'joint')
    # Cheek ruffs: three shingled plates each side, longest at the bottom.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k in range(3):
            add(kit.superellipsoid(f'Ruff.{sfx}{k}', (0.009, 0.034 - 0.006 * k, 0.017), 0.5, 0.7, seg=(14, 8),
                                   location=(side * (0.19 - 0.004 * k), hy - 0.03 - 0.03 * k, hz - 0.085 - 0.006 * k),
                                   rotation=(0.0, 0.0, side * 0.35)), fluff, 'head')
    # Crown fluff behind the crest: two rows of shingled plates.
    for row, (y, z, w) in enumerate(((0.005, 0.455, 0.03), (0.04, 0.44, 0.036))):
        for j, x in enumerate((-2, -1, 0, 1, 2)):
            add(kit.superellipsoid(f'Crown.{row}{j}', (w * 0.6, 0.022, 0.006), 0.5, 0.6, seg=(12, 6),
                                   location=(x * w * 1.05, y, z - 0.008 - 0.003 * abs(x)),
                                   rotation=(0.05 + 0.1 * row, 0, x * 0.1)), fluff, 'head')
    # Ears: a hinge puck on each shoulder of the head with a light on its outer face.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.024, 0.024, 0.011), 0.3, 1.0, seg=(16, 6),
                               location=(side * 0.186, -0.1, 0.42), rotation=(0, math.pi / 2, 0)), m['joint'],
            f'ear.{sfx}')
        add(kit.superellipsoid(f'EarLed.{sfx}', (0.007,) * 3, seg=(8, 6), location=(side * 0.198, -0.1, 0.42)),
            m['dot'](3), f'ear.{sfx}')
    # Whisker pods on the cheeks by the screen, three lit-tipped whiskers each.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        px, py, pz = side * 0.192, -0.16, 0.235
        add(kit.superellipsoid(f'Pod.{sfx}', (0.017, 0.022, 0.017), 0.5, 0.5, seg=(14, 8), location=(px, py, pz)),
            m['joint'], 'head')
        for k, dz in enumerate((0.032, 0.0, -0.032)):
            end = (side * 0.3, py - 0.045 - 0.006 * k, pz + dz * 1.7)
            add(kit.tube(f'Whisker.{sfx}{k}', [(px, py - 0.01, pz), (side * 0.245, py - 0.03, pz + dz), end], 0.003,
                         ring=6)[0], m['bezel'], 'head')
            add(kit.superellipsoid(f'Tip.{sfx}{k}', (0.008,) * 3, seg=(8, 6), location=end), m['dot'](4), 'head')
    # Body: seam rings, shingled back fluff, and a vented chest plate.
    for j, (dy, s) in enumerate(((-0.45, 0.9), (0.1, 1.0), (0.55, 0.92))):
        add(kit.superellipsoid(f'Seam.{j}', (rx * s * 1.012, rz * s * 1.012, 0.0035), b['e'], b['e'], seg=(32, 8),
                               location=(bx, by + dy * ry, bz), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    for row, y in enumerate((-0.02, 0.06, 0.14)):
        for j, x in enumerate((-1, 0, 1)):
            add(kit.superellipsoid(f'Back.{row}{j}', (0.03, 0.03, 0.006), 0.5, 0.6, seg=(12, 6),
                                   location=(x * 0.05, y, bz + rz * 0.985 - 0.012 * abs(x) - 0.008 * (row == 2)),
                                   rotation=(-0.12 + 0.05 * row, 0, x * 0.3)), fluff, 'body')
    add(kit.superellipsoid('Chest', (0.06, 0.006, 0.045), 0.4, 0.4, seg=(20, 6), location=(0, by - ry + 0.005, 0.095)),
        m['joint'], 'body')
    for k in (-1, 0, 1):
        add(kit.superellipsoid(f'Vent.{k}', (0.02, 0.002, 0.005), 0.4, 0.4, seg=(10, 4),
                               location=(0, by - ry - 0.0005, 0.095 + k * 0.016)), m['bezel'], 'body')
    # Legs: shoulder hubs with bolts, anklets, big pads and toe beads.
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        bone = f'leg.{name}'
        add(kit.superellipsoid(f'Hub.{name}', (0.028, 0.028, 0.008), 0.3, 1.0, seg=(16, 6),
                               location=(x * 0.116, y, lg['top'] - 0.012), rotation=(0, math.pi / 2, 0)),
            m['joint'], bone)
        add(kit.superellipsoid(f'HubBolt.{name}', (0.008,) * 3, seg=(8, 6),
                               location=(x * 0.124, y, lg['top'] - 0.012)), m['bezel'], bone)
        add(kit.torus(f'Anklet.{name}', lg['r'] + 0.003, 0.006, seg=(20, 6), location=(x * lg['x'], y, SOCK)),
            m['joint'], bone)
        py = y - 0.012
        add(kit.superellipsoid(f'Pad.{name}', (0.03, 0.036, 0.004), 0.5, 0.5, seg=(14, 6),
                               location=(x * lg['x'], py + 0.008, 0.002)), m['role']('Pad', 'bezel'), bone)
        for k in (-1, 0, 1):
            add(kit.superellipsoid(f'Toe.{name}.{k}', (0.012, 0.01, 0.01), seg=(8, 6),
                                   location=(x * lg['x'] + k * 0.022, py - 0.048, 0.024 - 0.004 * abs(k))),
                m['role']('Pad', 'bezel'), bone)
    # Collar: studs, and the bell hung on a ring.
    c = D['collar']
    cx, cy, cz = c['center']
    for a in (205, 225, 245, 295, 315, 335):
        r, t = math.radians(a), c['tilt']
        add(kit.superellipsoid(f'Stud.{a}', (0.008,) * 3, seg=(8, 6),
                               location=(cx + (c['major'] + 0.002) * math.cos(r),
                                         cy + (c['major'] + 0.002) * math.sin(r) * math.cos(t),
                                         cz + (c['major'] + 0.002) * math.sin(r) * math.sin(t))), m['bezel'], 'body')
    bl = D['bell']
    bcx, bcy, bcz = bl['center']
    add(kit.torus('BellRing', 0.012, 0.0035, seg=(14, 6), location=(0, bcy + 0.004, bcz + bl['r'] + 0.006),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'body')
    add(kit.superellipsoid('BellCap', (0.014, 0.014, 0.006), 0.3, 1.0, seg=(12, 6),
                           location=(0, bcy + 0.002, bcz + bl['r'] - 0.001)), m['joint'], 'body')
    # Tail: a lit collar at the join, and the pom as rings of petal plates round it.
    pts = [Vector(q) for q in kit.spline(D['tail'], 97)]
    r0, r1 = D['tail_r']
    cat.ring_at(add, 'TailBand', m['dot'](1), 'tail.2', pts, 48, (r0 + r1) / 2 + 0.003, 0.0055)
    pm = D['pom']
    px, py, pz = pm['center']
    for ring, (n, dz) in enumerate(((8, 0.0), (6, 0.028), (6, -0.028))):
        for i in range(n):
            a = 2 * math.pi * (i + 0.5 * ring) / n
            rr = pm['r'] * (0.92 if ring == 0 else 0.72)
            add(kit.superellipsoid(f'Petal.{ring}{i}', (0.017, 0.016, 0.008), 0.6, 0.7, seg=(10, 6),
                                   location=(px + rr * math.cos(a), py + rr * math.sin(a), pz + dz),
                                   rotation=(0, 0, a - math.pi / 2)), m['role']('Tip'), 'tail.2')
    add(kit.superellipsoid('PomLed', (0.011,) * 3, seg=(10, 8), location=(px, py + 0.002, pz + pm['r'] + 0.004)),
        m['dot'](0), 'tail.2')
    # The tongue (hidden until a yawn): a plate and a curling tip, on their own bones.
    add(kit.superellipsoid('Tongue', (0.016, 0.005, 0.03), 0.5, 0.5, seg=(12, 8), location=(0, -0.25, 0.18),
                           rotation=(0.35, 0, 0)), m['role']('Tongue', 'joint'), 'tongue')
    add(kit.superellipsoid('TongueTip', (0.014, 0.005, 0.014), 0.7, 0.7, seg=(12, 8), location=(0, -0.268, 0.136),
                           rotation=(0.35, 0, 0)), m['role']('Tongue', 'joint'), 'tongue.tip')


def rig_bones():
    e, lg = D['ear'], D['leg']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.13, 0.16), (0, -0.09, 0.17), 'root'),
        ('head', (0, -0.06, 0.24), (0, -0.1, 0.45), 'body'),
        ('ear.L', (e['x'], -0.1, e['z']), (e['x'] + 0.03, -0.1, e['z'] + 0.1), 'head'),
        ('ear.R', (-e['x'], -0.1, e['z']), (-e['x'] - 0.03, -0.1, e['z'] + 0.1), 'head'),
    ]
    bones += [('tongue', (0, -0.232, 0.205), (0, -0.262, 0.155), 'head'),
              ('tongue.tip', (0, -0.262, 0.155), (0, -0.274, 0.122), 'tongue')]
    bones += cat.tail_bones(D['tail'], 2)
    bones += cat.leg_bones(lg)
    (bx, by) = D['props']['ball']
    r = cat.BALL['r']
    bones.append(('ball', (bx, by, r), (bx, by, r + 0.08), None))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    h = D['head']
    cx, cy, cz = h['center']
    head = add(kit.superellipsoid('Head', h['radii'], BOXY, BOXY, seg=(56, 36), location=h['center']), m['shell'],
               'head')
    # A white blaze down the forehead to the screen.
    def head_region(p):
        if abs(p[0]) < 0.035 and p[2] > cz + 0.09 and p[1] < cy + 0.06:
            return m['role']('Blaze')
        if p[0] < -0.15 and p[2] > cz + 0.03 and p[1] > cy + 0.02:
            return m['role']('Spot', 'joint')  # a grey patch on the right side of the head
        return None

    cat.paint(head, head_region, [((cx + s * 0.035, cy, cz), (1, 0, 0)) for s in (-1, 1)] +
              [((cx, cy, cz + 0.09), (0, 0, 1)), ((cx, cy + 0.06, cz), (0, 1, 0)),
               ((cx - 0.15, cy, cz), (1, 0, 0)), ((cx, cy + 0.02, cz), (0, 1, 0)), ((cx, cy, cz + 0.03), (0, 0, 1))])
    sc = D['screen']
    glass, rim = kit.screen('Kitten', sc['radii'], sc['center'], sc['bezel'], e=BOXY)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    cat.ears(add, m, D['ear'], -0.1)

    # A crest of three fins.
    for i, (y, z, lean) in enumerate(((-0.16, 0.455, -0.35), (-0.095, 0.462, 0.0), (-0.03, 0.452, 0.35))):
        add(kit.superellipsoid(f'Crest.{i}', (0.013, 0.038, 0.05), 0.5, 0.6, seg=(16, 10), location=(0, y, z),
                               rotation=(lean, 0, 0)), m['role']('Tuft'), 'head')
    # A bolt low on each cheek.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Bolt.{sfx}', (0.011, 0.024, 0.024), 0.5, 0.8, seg=(16, 8),
                               location=(side * 0.196, -0.075, 0.245)), m['joint'], 'head')

    b = D['body']
    body = add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(48, 32), location=b['center']),
               m['shell'], 'body')
    bx, by, bz = b['center']
    rx, ry, rz = b['radii']
    # The bib: the chest, in front and low, with a clean edge.
    def body_region(p):
        if p[1] < by - 0.45 * ry and p[2] < bz + 0.35 * rz and abs(p[0]) < 0.75 * rx:
            return m['role']('Bib')
        if p[0] > 0.5 * rx and p[1] > by + 0.1 * ry and p[2] > bz - 0.3 * rz:
            return m['role']('Patch')  # a white patch on the left flank
        return None

    cat.paint(body, body_region,
              [((bx, by - 0.45 * ry, bz), (0, 1, 0)), ((bx, by, bz + 0.35 * rz), (0, 0, 1)),
               ((bx + 0.75 * rx, by, bz), (1, 0, 0)), ((bx - 0.75 * rx, by, bz), (1, 0, 0)),
               ((bx + 0.5 * rx, by, bz), (1, 0, 0)), ((bx, by + 0.1 * ry, bz), (0, 1, 0)),
               ((bx, by, bz - 0.3 * rz), (0, 0, 1))])

    c = D['collar']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(40, 10), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['role']('Collar', 'joint'), 'body')
    bl = D['bell']
    add(kit.superellipsoid('Bell', (bl['r'],) * 3, seg=(20, 14), location=bl['center']), m['beacon'], 'body')

    lg, pw = D['leg'], D['paw']
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        leg, _ = kit.tube(f'Leg.{name}', [(x * lg['x'], y, lg['top']), (x * lg['x'], y, lg['bottom'])], lg['r'],
                          ring=14)
        add(leg, m['shell'], f'leg.{name}')
        cat.paint(leg, lambda p: m['role']('Paw', 'joint') if p[2] < SOCK else None,
                  [((0, 0, SOCK), (0, 0, 1))])
        add(kit.superellipsoid(f'Paw.{name}', pw['radii'], pw['e'], 0.6, seg=(24, 12),
                               location=(x * lg['x'], y - 0.012, pw['radii'][2])), m['role']('Paw', 'joint'),
            f'leg.{name}')

    # A stub of a tail ending in a pom (a ring of it in the tail's own colour).
    cat.tail(add, m, D['tail'], D['tail_r'], ['tail.1', 'tail.2'], n=12, ring=12, rings=[])
    pm = D['pom']
    add(kit.superellipsoid('Pom', (pm['r'],) * 3, 0.8, 0.8, seg=(20, 14), location=pm['center']), m['role']('Tip'),
        'tail.2')

    (bx2, by2), r = D['props']['ball'], cat.BALL['r']
    add(kit.superellipsoid('Ball', (r, r, r), seg=(20, 14), location=(bx2, by2, r)), m['role']('Ball', 'joint'), 'ball')
    add(kit.torus('BallBand', r * 0.97, cat.BALL['band'], seg=(28, 8), location=(bx2, by2, r)), m['dot'](7), 'ball')

    refine_bit(add, m)
    return looks.finish(kit.armature('KittenRig', rig_bones()), parts, skin, m)
