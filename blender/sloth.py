"""Lag, the crew's robot sloth: a slow robot on low power. He only lives on the top edge,
hanging from the frame line by his long arms, so he is built head down: z is how far
below the line a part hangs (the site turns everything on the top edge over, which
puts him the right way up), and his face is drawn turned round to match.

A rounded-box head with a pale face plate, the dark eye-mask panel set into it (with
its two slanted tails down the cheeks), a smile, brow and vent slits, and ear bolts
that light in the beacon's colour. Arms and legs in two segments with ball joints at
shoulder, elbow, hip and knee, shaggy sleeves of layered fur plates, cuffs, and long
hook claws with a knuckle in each (three on each hand, hooked over the line; two on
each foot). A boxy body wrapped in shingled fur fringes with seams, a solar panel with
a frame on his back, a short tail stub, a charging port on his belly, and a battery
gauge on his chest: four bars behind a frame with dividers and corner bolts, each bar
its own material (Dot0 at the bottom to Dot3 at the top) so the site can show his
charge. Faces -Y like the rest of the crew; about 0.72 m from the line to his toes.
"""

import math

import kit
import looks

FACE = 'sloth'
PREVIEW = dict(lift=0.8, width=0.45, hangs=True)

D = {
    'paw': dict(radii=(0.03, 0.028, 0.026), x=0.1, z=0.04),
    'shoulder': (0.125, 0.0, 0.27),
    'elbow': (0.115, -0.012, 0.155),
    'wrist': (0.1, 0.0, 0.075),
    'arm_r': 0.022,
    'head': dict(radii=(0.118, 0.1, 0.1), center=(0, -0.025, 0.19), e=0.45),
    'plate': dict(radii=(0.088, 0.03, 0.08), center=(0, -0.1, 0.2), e=0.4),
    # 16:5, like the sloth's face layout (512 x 160): the stripe across his eyes
    'screen': dict(radii=(0.1, 0.04, 0.031), center=(0, -0.106, 0.184), bezel=0.006),
    'smile': dict(y=-0.128, z=0.232, width=0.03, depth=0.01),
    'ears': dict(x=0.118, z=0.19, r=0.026, depth=0.018),
    'body': dict(radii=(0.14, 0.115, 0.155), center=(0, 0.01, 0.425), e=0.62, taper=-0.12),
    'waist': dict(major=0.132, minor=0.009, z=0.47),
    'gauge': dict(radii=(0.05, 0.015, 0.078), center=(0, -0.108, 0.41), bars=4, bar=(0.036, 0.01, 0.012)),
    'panel': dict(radii=(0.1, 0.012, 0.11), center=(0, 0.125, 0.42)),
    'hip': (0.085, 0.0, 0.55),
    'knee': (0.09, -0.006, 0.625),
    'foot': dict(radii=(0.03, 0.028, 0.026), at=(0.1, -0.015, 0.7)),
    'leg_r': 0.024,
    'cable': {'from': (0, -0.02, 0.092), 'to': (0, -0.02, 0.0)},
    'tail': dict(root=(0, 0.115, 0.545), tip=(0, 0.15, 0.56)),
}


def mirror(p, side):
    return side * p[0], p[1], p[2]


def lerp(a, b, t):
    return tuple(u + (v - u) * t for u, v in zip(a, b))


def rig_bones():
    pw, fo = D['paw'], D['foot']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.01, 0.26), (0, 0.01, 0.6), 'root'),
        ('head', (0, -0.01, 0.27), (0, -0.01, 0.12), 'body'),
        ('tail', D['tail']['root'], D['tail']['tip'], 'body'),
        # A tether from his crown to the line, folded away to nothing until he drops on it.
        ('cable', D['cable']['from'], D['cable']['to'], 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        el, wr = mirror(D['elbow'], side), mirror(D['wrist'], side)
        bones.append((f'arm.{sfx}', mirror(D['shoulder'], side), el, 'body'))
        bones.append((f'fore.{sfx}', el, wr, f'arm.{sfx}'))
        bones.append((f'hand.{sfx}', wr, (side * pw['x'], 0, pw['z'] - 0.02), f'fore.{sfx}'))
        kn = mirror(D['knee'], side)
        bones.append((f'leg.{sfx}', mirror(D['hip'], side), kn, 'body'))
        bones.append((f'shin.{sfx}', kn, mirror(fo['at'], side), f'leg.{sfx}'))
    return bones


def spow(x, e):
    return math.copysign(abs(x) ** e, x)


def hooks(name, base, reach, spread, bone, m, add):
    """Long curved claws from a hand or foot: `reach` is (dy, dz) to the tip, curling over,
    with a knuckle ball at the root and another where the claw bends."""
    x, y, z = base
    dy, dz = reach
    for k, dx in enumerate(spread):
        mid = (x + dx, y + dy * 0.3, z + dz * 0.85)
        pts = [(x + dx, y, z), mid, (x + dx, y + dy, z + dz)]
        add(kit.tube(f'{name}.{k}', kit.spline(pts, 10), [0.0085 - 0.005 * i / 9 for i in range(10)], ring=8)[0],
            m['role']('Claw', 'joint'), bone)
        add(kit.superellipsoid(f'{name}.Knuckle{k}', (0.0105,) * 3, seg=(10, 6), location=(x + dx, y, z)),
            m['joint'], bone)
        add(kit.superellipsoid(f'{name}.Bend{k}', (0.0075,) * 3, seg=(10, 6), location=mid), m['joint'], bone)


def ring(name, at, major, minor, bone, m, add, mat='joint', rotation=(0, 0, 0)):
    add(kit.torus(name, major, minor, seg=(24, 6), location=at, rotation=rotation), m[mat], bone)


def bolt(name, at, bone, m, add, r=0.0055, facing=(0, -1, 0)):
    """A little round bolt head: a squashed dome, turned to face along `facing`."""
    rot = (0, 0, math.pi / 2) if facing[0] else (0, 0, 0)
    add(kit.superellipsoid(name, (r, r * 0.55, r), 0.6, 0.6, seg=(10, 6), location=at, rotation=rot), m['joint'],
        bone)


def fur_sleeve(name, top, end, radius, bone, m, add):
    """A shaggy sleeve: a fat segment with a seam at each end and tufts staggered down
    it, layered like shingles."""
    a, b = lerp(top, end, 0.14), lerp(top, end, 0.86)
    add(kit.tube(f'{name}.Sleeve', [a, b], radius, ring=14)[0], m['role']('Fur'), bone)
    for t in (0.14, 0.86):
        ring(f'{name}.Seam{t}', lerp(top, end, t), radius * 0.98, 0.0032, bone, m, add)
    for i, t in enumerate((0.35, 0.65)):
        c = lerp(top, end, t)
        for j in range(4):
            th = math.pi * 2 * (j + 0.5 * (i % 2)) / 4
            add(kit.superellipsoid(f'{name}.Tuft{i}{j}', (0.011, 0.006, 0.017), 0.5, 0.5, seg=(10, 6),
                                   location=(c[0] + math.cos(th) * radius * 0.95, c[1] + math.sin(th) * radius * 0.95,
                                             c[2]),
                                   rotation=(0, 0, th + math.pi / 2)), m['role']('Fur'), bone)


def limb(name, top, mid, end, radius, upper, lower, m, add):
    """A two-segment limb: fur sleeve on the upper part, a plain lower part, ball joints
    at the top and the middle with a ring round the middle, a cuff at the end."""
    add(kit.tube(f'{name}.Upper', [top, mid], radius, ring=14)[0], m['shell'], upper)
    fur_sleeve(name, top, mid, radius * 1.4, upper, m, add)
    add(kit.tube(f'{name}.Lower', [mid, end], radius * 0.92, ring=14)[0], m['shell'], lower)
    add(kit.superellipsoid(f'{name}.Ball', (radius * 1.5,) * 3, seg=(20, 12), location=top), m['joint'], upper)
    add(kit.superellipsoid(f'{name}.Joint', (radius * 1.35,) * 3, seg=(20, 12), location=mid), m['joint'], lower)
    ring(f'{name}.Ring', mid, radius * 1.5, 0.004, lower, m, add, 'bezel')
    ring(f'{name}.Cuff', lerp(mid, end, 0.86), radius * 1.15, 0.0045, lower, m, add, 'bezel')
    bolt(f'{name}.Bolt', (mid[0] + math.copysign(radius * 1.3, top[0]), mid[1], mid[2]), lower, m, add,
         r=0.005, facing=(1, 0, 0))


def body_point(z, th, b):
    """A point on the body's surface at height z, angle th (-pi/2 is the front)."""
    cx, cy, cz = b['center']
    rx, ry, rz = b['radii']
    u = (z - cz) / rz
    k = 1.0 - b['taper'] * (spow(u, b['e']) / 2)
    sin_phi = min(1.0, abs(u) ** (1 / b['e']))
    cp = math.sqrt(1 - sin_phi**2) ** b['e']
    return cx + rx * cp * k * spow(math.cos(th), b['e']), cy + ry * cp * k * spow(math.sin(th), b['e'])


def fur_ring(name, z, count, size, b, m, add, skip=None, phase=0.0):
    """A fringe of overlapping fur shingles round the body at height z."""
    for i in range(count):
        th = 2 * math.pi * (i + phase) / count
        if skip and skip(th):
            continue
        x, y = body_point(z, th, b)
        add(kit.superellipsoid(f'{name}.{i}', size, 0.5, 0.5, seg=(10, 6),
                               location=(x + math.cos(th) * 0.003, y + math.sin(th) * 0.003, z),
                               rotation=(0, 0, th - math.pi / 2)), m['role']('Fur'), 'body')


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Arms up to the line: shoulder and elbow joints, fur sleeves, hands with three
    # knuckled hooks each, hooked over it.
    pw = D['paw']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        hand = (side * pw['x'], 0, pw['z'])
        sh = mirror(D['shoulder'], side)
        limb(f'Arm.{sfx}', sh, mirror(D['elbow'], side), mirror(D['wrist'], side), D['arm_r'], f'arm.{sfx}',
             f'fore.{sfx}', m, add)
        ring(f'ShoulderCap.{sfx}', (sh[0] + side * 0.012, sh[1], sh[2]), 0.028, 0.005, f'arm.{sfx}', m, add,
             'bezel', rotation=(0, math.pi / 2, 0))
        add(kit.superellipsoid(f'Hand.{sfx}', pw['radii'], 0.5, 0.6, seg=(24, 14), location=hand), m['shell'],
            f'hand.{sfx}')
        for k, dx in enumerate((-0.018, 0, 0.018)):
            add(kit.superellipsoid(f'Pad.{sfx}{k}', (0.008, 0.006, 0.006), seg=(10, 6),
                                   location=(hand[0] + dx, hand[1] - 0.024, hand[2] - 0.002)), m['bezel'],
                f'hand.{sfx}')
        hooks(f'Hook.{sfx}', (hand[0], hand[1] - 0.015, hand[2] - 0.015), (0.06, -0.08), (-0.018, 0, 0.018),
              f'hand.{sfx}', m, add)

    # Head: face plate, eye-mask panel with its cheek tails, visor band, smile, brow, vents,
    # ear bolts that light up.
    h, pl, sm, er = D['head'], D['plate'], D['smile'], D['ears']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(40, 32), location=h['center']), m['shell'],
        'head')
    add(kit.superellipsoid('Plate', pl['radii'], pl['e'], pl['e'], seg=(32, 24), location=pl['center']),
        m['bezel'], 'head')
    sc = D['screen']
    # The dark mask: a panel wider than the screen, with a tail slanting down and out on
    # each cheek (down the face is +z here).
    mx, my, mz = sc['center']
    add(kit.superellipsoid('Mask', (sc['radii'][0] + 0.013, 0.03, sc['radii'][2] + 0.013), 0.4, 0.4, seg=(32, 16),
                           location=(mx, my + 0.005, mz)), m['role']('Mask', 'joint'), 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'MaskTail.{side}', (0.03, 0.02, 0.012), 0.5, 0.5, seg=(16, 8),
                               location=(side * 0.075, my + 0.02, mz + 0.04),
                               rotation=(0, side * 0.6, 0)), m['role']('Mask', 'joint'), 'head')
    glass, rim = kit.screen('Sloth', sc['radii'], sc['center'], sc['bezel'], e=0.5, upside_down=True)
    add(glass, m['face'], 'head')
    add(rim, m['joint'], 'head')
    w = sm['width']
    smile = [(x, sm['y'], sm['z'] + sm['depth'] * (1 - (x / w) ** 2)) for x in (w * (i / 6 - 1) for i in range(13))]
    add(kit.tube('Smile', smile, 0.0045, ring=6)[0], m['joint'], 'head')
    # A brow line above the mask (above is smaller z), vent slits on the crown, plate bolts.
    add(kit.tube('Brow', [(-0.075, -0.112, 0.133), (0, -0.117, 0.126), (0.075, -0.112, 0.133)], 0.004, ring=6)[0],
        m['joint'], 'head')
    for i, x in enumerate((-0.03, 0, 0.03)):
        add(kit.tube(f'Vent{i}', [(x, -0.05, 0.092), (x, 0.0, 0.088), (x, 0.03, 0.093)], 0.0032, ring=6)[0],
            m['joint'], 'head')
    for side in (1, -1):
        for zz in (0.145, 0.255):
            bolt(f'PlateBolt.{side}{zz}', (side * 0.079, -0.121 + 0.004 * (zz > 0.2), zz), 'head', m, add,
                 r=0.0045)
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * er['x']
        add(kit.tube(f'Ear.{sfx}', [(x, -0.02, er['z']), (x + side * er['depth'], -0.02, er['z'])], er['r'],
                     ring=20)[0], m['joint'], 'head')
        ring(f'EarRim.{sfx}', (x + side * er['depth'] * 0.5, -0.02, er['z']), er['r'] * 1.02, 0.0035, 'head', m,
             add, 'bezel', rotation=(0, math.pi / 2, 0))
        add(kit.superellipsoid(f'EarLight.{sfx}', (0.008, er['r'] * 0.6, er['r'] * 0.6), seg=(16, 10),
                               location=(x + side * (er['depth'] + 0.01), -0.02, er['z'])), m['beacon'], 'head')

    # Body: a boxy torso wrapped in fur fringes and seams, the battery gauge and charging
    # port on the front, a framed solar panel on the back, a tail stub.
    b, wa, g, pn = D['body'], D['waist'], D['gauge'], D['panel']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(48, 40), taper=b['taper'],
                           location=b['center']), m['shell'], 'body')
    add(kit.torus('Waist', wa['major'], wa['minor'], seg=(48, 8), location=(0, 0.01, wa['z'])), m['joint'], 'body')

    def clear(th):  # keeps the gauge free of fur
        return math.sin(th) < -0.55 and abs(math.cos(th)) < 0.6

    fur_ring('FurCollar', 0.31, 12, (0.04, 0.008, 0.022), b, m, add, phase=0.0)
    fur_ring('FurSide', 0.44, 10, (0.04, 0.008, 0.024), b, m, add, skip=clear, phase=0.5)
    fur_ring('FurHem', 0.545, 12, (0.04, 0.008, 0.02), b, m, add, skip=lambda th: math.sin(th) < -0.85, phase=0.0)

    add(kit.superellipsoid('Gauge', g['radii'], 0.35, 0.35, seg=(24, 20), location=g['center']), m['bezel'], 'body')
    gx, gy, gz = g['center']
    step = 2 * g['radii'][2] / (g['bars'] + 0.5)
    for i in range(g['bars']):
        # Down the gauge is up the screen: Dot0, the last bar, is the furthest from the line.
        z = gz + g['radii'][2] - step * (i + 0.75)
        add(kit.superellipsoid(f'Dot{i}', g['bar'], 0.3, 0.3, seg=(16, 8), location=(gx, gy - 0.014, z)),
            m['dot'](i), 'body')
        if i:  # a divider between the bars
            add(kit.tube(f'GaugeDivider{i}', [(gx - 0.04, gy - 0.017, z + step / 2),
                                              (gx + 0.04, gy - 0.017, z + step / 2)], 0.0018, ring=6)[0],
                m['joint'], 'body')
    add(kit.superellipsoid('GaugeCap', (0.018, 0.012, 0.008), 0.4, 0.4, seg=(12, 8),
                           location=(gx, gy, gz - g['radii'][2] - 0.006)), m['bezel'], 'body')
    for sx in (-1, 1):
        for sz in (-1, 1):
            bolt(f'GaugeBolt.{sx}{sz}', (gx + sx * 0.043, gy - 0.014, gz + sz * 0.07), 'body', m, add, r=0.0045)
    # The charging port: a socket ring with a dark well and a pin, below the gauge.
    px, py, pz = 0.0, -0.105, 0.535
    add(kit.torus('PortRing', 0.014, 0.004, seg=(20, 6), location=(px, py, pz), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'body')
    add(kit.superellipsoid('PortWell', (0.011, 0.004, 0.011), 0.5, 0.5, seg=(14, 8), location=(px, py + 0.003, pz)),
        m['joint'], 'body')
    add(kit.superellipsoid('PortPin', (0.0025, 0.004, 0.006), 0.5, 0.5, seg=(8, 6),
                           location=(px, py - 0.002, pz)), m['bezel'], 'body')

    add(kit.superellipsoid('Panel', pn['radii'], 0.25, 0.25, seg=(24, 20), location=pn['center']), m['bezel'],
        'body')
    px, py, pz = pn['center']
    for dx in (-0.034, 0.034):
        add(kit.tube(f'PanelLine.{dx}', [(px + dx, py + 0.013, pz - 0.1), (px + dx, py + 0.013, pz + 0.1)], 0.003,
                     ring=6)[0], m['joint'], 'body')
    for dz in (-0.034, 0.034):
        add(kit.tube(f'PanelRow.{dz}', [(px - 0.09, py + 0.013, pz + dz), (px + 0.09, py + 0.013, pz + dz)], 0.003,
                     ring=6)[0], m['joint'], 'body')
    for sx in (-1, 1):
        for sz in (-1, 1):
            bolt(f'PanelBolt.{sx}{sz}', (px + sx * 0.088, py + 0.014, pz + sz * 0.098), 'body', m, add, r=0.005,
                 facing=(0, 1, 0))

    t = D['tail']
    add(kit.tube('Tail', [t['root'], lerp(t['root'], t['tip'], 0.6), t['tip']], [0.024, 0.02, 0.016], ring=14)[0],
        m['role']('Fur'), 'tail')
    ring('TailSeam', lerp(t['root'], t['tip'], 0.45), 0.028, 0.0035, 'tail', m, add, rotation=(0.8, 0, 0))

    # The tether: a ribbed cable from a plug on his crown up to a clip on the line.
    cb = D['cable']
    a, z = cb['from'], cb['to']
    add(kit.tube('Cable', [a, lerp(a, z, 0.5), z], 0.0055, ring=8)[0], m['joint'], 'cable')
    for i in range(1, 6):
        ring(f'CableRib{i}', lerp(a, z, i / 6.5), 0.0075, 0.0022, 'cable', m, add, 'bezel')
    add(kit.superellipsoid('CablePlug', (0.014, 0.014, 0.01), 0.5, 0.5, seg=(12, 8), location=a), m['bezel'],
        'cable')
    add(kit.superellipsoid('CableClip', (0.012, 0.006, 0.01), 0.5, 0.5, seg=(12, 8), location=(a[0], a[1], 0.006)),
        m['bezel'], 'cable')

    # Legs dangling: hip and knee joints, fur sleeves, feet with two knuckled hooks each.
    fo = D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        at = mirror(fo['at'], side)
        limb(f'Leg.{sfx}', mirror(D['hip'], side), mirror(D['knee'], side), at, D['leg_r'], f'leg.{sfx}',
             f'shin.{sfx}', m, add)
        add(kit.superellipsoid(f'Foot.{sfx}', fo['radii'], 0.5, 0.6, seg=(24, 14), location=at), m['shell'],
            f'shin.{sfx}')
        hooks(f'Toe.{sfx}', (at[0], at[1] - 0.015, at[2] + 0.02), (-0.045, 0.05), (-0.012, 0.012), f'shin.{sfx}', m,
              add)

    return looks.finish(kit.armature('SlothRig', rig_bones()), parts, skin, m)
