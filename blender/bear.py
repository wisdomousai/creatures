"""Bearing, the crew's robot teddy bear: a toy robot, not a bear in a robot suit. A big
rounded-box head with a screen for eyes, a short square snout with a button nose, and
two round puck ears on top; a pear-shaped body with a round belly plate; stubby arms
and legs in short segments on ball joints, round paws and flat feet with pads under
them. Panel seams run where a teddy has its stitching: over the crown of the head, round
the snout and round the belly plate. A hatch with four screws, a winding key and a round tail behind; a bow tie at his
collar; stitch studs along the seams, screws round the belly plate, toe beans on every paw.

The lights are a teddy's: a heart set in the middle of the belly plate is the beacon,
and the inner discs of the ears light up (Dot0 his left ear, Dot1 his right), so the
site can flash them on the beat when he dances. The legs have knees and ankles so he can
squat and kick, the arms elbows so he can fold them, clap and wave. Faces -Y like the
rest of the crew; about 0.62 m to the top of the ears.
"""

import math

from mathutils import Euler, Vector

import kit
import looks

FACE = 'bear'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    # A pear: narrow shoulders, a round belly.
    'body': dict(radii=(0.13, 0.112, 0.13), center=(0, 0.0, 0.245), e=0.72, taper=0.2),
    'belly': dict(radii=(0.075, 0.08, 0.016), center=(0, -0.104, 0.215), rim=0.008),
    # The heart light stands proud of the plate, in a heart-shaped socket.
    'heart': dict(width=0.05, depth=0.008, center=(0, -0.126, 0.222), socket=(1.32, 0.005, -0.118)),
    'collar': dict(major=0.07, minor=0.013, z=0.35),
    'head': dict(radii=(0.156, 0.125, 0.118), center=(0, -0.01, 0.46), e=0.62, taper=0.1),
    # 2:1, like the bear's face layout (512 x 256)
    'screen': dict(radii=(0.096, 0.02, 0.048), center=(0, -0.124, 0.485), bezel=0.008),
    'snout': dict(radii=(0.068, 0.054, 0.044), center=(0, -0.13, 0.392), e=0.55),
    'nose': dict(radii=(0.032, 0.018, 0.02), center=(0, -0.18, 0.414)),
    'ears': dict(x=0.114, y=-0.005, z=0.56, r=0.056, half=0.02, splay=0.32, inner=0.036),
    # Set forward on the body, so the paws meet in front of it (to clap, to fold his arms).
    'shoulder': (0.108, -0.025, 0.325),
    'elbow': (0.139, -0.032, 0.257),
    'wrist': (0.163, -0.039, 0.191),
    'paw': dict(radii=(0.037, 0.035, 0.04)),
    'arm_r': 0.026,
    'hip': (0.066, 0.0, 0.155),
    'knee': (0.068, -0.004, 0.098),
    'ankle': (0.07, -0.006, 0.048),
    'leg_r': 0.03,
    'foot': dict(radii=(0.042, 0.062, 0.026), center=(0.07, -0.024, 0.026)),
    'pad': dict(radii=(0.03, 0.044, 0.006)),
    'hatch': dict(radii=(0.058, 0.012, 0.064), center=(0, 0.102, 0.265)),
    'tail': dict(r=0.03, center=(0, 0.1, 0.155)),
    'seam': 0.0035,
    'waist': 0.192,
    'bow': dict(center=(0, -0.098, 0.326), wing=0.042, half=0.02),
    'key': dict(stem=(0, 0.114, 0.268), reach=0.038, loop=0.017),
}


def mirror(p, side):
    return side * p[0], p[1], p[2]


def rig_bones():
    ft = D['foot']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # Pivots at the hips, for leaning, swaying and bowing.
        ('body', (0, 0, 0.15), (0, 0, 0.36), 'root'),
        ('head', (0, -0.01, 0.35), (0, -0.01, 0.58), 'body'),
    ]
    er = D['ears']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * er['x']
        bones.append((f'ear.{sfx}', (x * 0.8, er['y'], er['z'] - 0.05), (x * 1.15, er['y'], er['z'] + 0.05), 'head'))
        bones.append((f'upper_arm.{sfx}', mirror(D['shoulder'], side), mirror(D['elbow'], side), 'body'))
        bones.append((f'forearm.{sfx}', mirror(D['elbow'], side), mirror(D['wrist'], side), f'upper_arm.{sfx}'))
        # The legs hang from the root, not the body, so they stay planted when he bows.
        bones.append((f'thigh.{sfx}', mirror(D['hip'], side), mirror(D['knee'], side), 'root'))
        bones.append((f'shin.{sfx}', mirror(D['knee'], side), mirror(D['ankle'], side), f'thigh.{sfx}'))
        toe = (side * ft['center'][0], ft['center'][1] - ft['radii'][1], ft['center'][2])
        bones.append((f'foot.{sfx}', mirror(D['ankle'], side), toe, f'shin.{sfx}'))
    return bones


def heart(name, width, depth, center, n=32):
    """A heart-shaped puck facing -Y, its front bevelled, flat-shaded like a cut gem."""
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        pts.append((16 * math.sin(t) ** 3, 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t)
                    - math.cos(4 * t)))
    s = width / 34
    cx, cy, cz = center
    mid = 1.5  # the middle of the heart, in the curve's units
    verts, faces = [], []
    for scale, dy in ((1.0, depth * 0.6), (1.0, -depth * 0.3), (0.72, -depth)):
        verts += [(cx + x * s * scale, cy + dy, cz + (mid + (z - mid) * scale) * s) for x, z in pts]
    verts += [(cx, cy - depth * 1.15, cz + mid * s), (cx, cy + depth * 0.6, cz + mid * s)]
    front, back = len(verts) - 2, len(verts) - 1
    for r in range(2):
        for k in range(n):
            a, b = r * n + k, r * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
    for k in range(n):
        faces.append((2 * n + k, 2 * n + (k + 1) % n, front))
        faces.append(((k + 1) % n, k, back))
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def crown_seam():
    """Points over the head from the top of the screen to the back of the neck, on the
    head's surface (the x = 0 meridian of its superellipsoid), lifted a hair off it."""
    h = D['head']
    rx, ry, rz = h['radii']
    cx, cy, cz = h['center']
    e, taper = h['e'], h['taper']
    pts = []
    # Front meridian up from above the screen, over the top, and down the back.
    for i in range(25):
        u = i / 24
        phi = math.radians(38 + 104 * u) if u < 1 else math.radians(142)
        # phi runs from the front (38 deg up) over the top (90) to the back (142).
        front = phi <= math.pi / 2
        a = phi if front else math.pi - phi
        sp = kit.spow(math.sin(a), e)
        cp = kit.spow(math.cos(a), e)
        k = 1.0 - taper * (sp / 2)
        y = ry * cp * k * (-1 if front else 1)
        pts.append(Vector((cx, cy + y * 1.012, cz + rz * sp * 1.012)))
    return pts


def bow_wing(name, side, wing, half, center):
    """One wing of a bow tie: a flat double pyramid, knot at the middle, faceted like the heart."""
    cx, cy, cz = center
    pts = [(0, 0, 0), (side * wing, 0.004, half), (side * wing, 0.004, -half)]
    verts = [(cx + x, cy + y, cz + z) for x, y, z in pts]
    verts += [(cx + side * wing * 0.55, cy - 0.011, cz), (cx + side * wing * 0.55, cy + 0.008, cz)]
    faces = [(0, 1, 3), (1, 2, 3), (2, 0, 3), (1, 0, 4), (2, 1, 4), (0, 2, 4)]
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def along(a, b):
    """Euler rotation turning a torus's axis (Z) to point from a to b."""
    return (Vector(b) - Vector(a)).to_track_quat('Z', 'Y').to_euler()


def waist_ring():
    """Points round the body at the waist seam, on its surface (an ellipse, lifted a hair)."""
    b = D['body']
    rx, ry, rz = b['radii']
    cz = b['center'][2]
    sp = (D['waist'] - cz) / rz
    x = abs(sp) ** (1 / b['e'])
    cp = math.sqrt(1 - x * x) ** b['e']
    k = 1.0 - b['taper'] * (sp / 2)
    return [Vector((rx * cp * k * 1.035 * math.cos(2 * math.pi * i / 48),
                    b['center'][1] + ry * cp * k * 1.035 * math.sin(2 * math.pi * i / 48), D['waist']))
            for i in range(49)]


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    seam = D['seam']

    # Body, with a collar ring where the head sits on it.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(40, 30), taper=b['taper'], location=b['center']),
        m['shell'], 'body')
    c = D['collar']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(32, 8), location=(0, -0.004, c['z'])), m['joint'], 'body')

    # Belly plate: a round panel with a rim, the heart light set in its middle.
    bl = D['belly']
    add(kit.superellipsoid('Belly', bl['radii'], 0.35, 1.0, seg=(40, 8), location=bl['center'],
                           rotation=(math.pi / 2, 0, 0)), m['role']('Belly'), 'body')
    rx, rz, _ = bl['radii']
    add(kit.torus('BellyRim', rx + bl['rim'] * 0.4, bl['rim'], seg=(40, 6),
                  location=(bl['center'][0], bl['center'][1] - 0.004, bl['center'][2]), rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'body')
    hr = D['heart']
    add(heart('Heart', hr['width'], hr['depth'], hr['center']), m['beacon'], 'body')
    # A dark socket round it, so the light stands out on any plate colour.
    hx, _, hz = hr['center']
    grow, depth, y = hr['socket']
    add(heart('HeartSocket', hr['width'] * grow, depth, (hx, y, hz)), m['bezel'], 'body')

    # Back: a hatch with four screws, and a round tail.
    ht = D['hatch']
    add(kit.superellipsoid('Hatch', ht['radii'], 0.3, 0.3, seg=(24, 20), location=ht['center']), m['bezel'], 'body')
    hx, hy, hz = ht['center']
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(kit.superellipsoid(f'Screw.{sx}.{sz}', (0.007, 0.004, 0.007), 0.6, 1.0, seg=(12, 6),
                                   location=(hx + sx * ht['radii'][0] * 0.7, hy + ht['radii'][1] + 0.001,
                                             hz + sz * ht['radii'][2] * 0.72)), m['joint'], 'body')
    tl = D['tail']
    add(kit.superellipsoid('Tail', (tl['r'],) * 3, seg=(20, 14), location=tl['center']), m['shell'], 'body')

    # Head: screen eyes, snout with a button nose, a seam over the crown.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(44, 32), taper=h['taper'], location=h['center']),
        m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Bear', sc['radii'], sc['center'], sc['bezel'], e=0.4, seg=(48, 28))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    sn, n = D['snout'], D['nose']
    add(kit.superellipsoid('Snout', sn['radii'], sn['e'], sn['e'], seg=(28, 20), location=sn['center']),
        m['role']('Snout'), 'head')
    add(kit.superellipsoid('Nose', n['radii'], 0.6, 0.8, seg=(20, 12), location=n['center']), m['bezel'], 'head')
    # The teddy's stitch from nose to mouth, and a small smile, as seams in the snout.
    sx, sy, sz = sn['center']
    front = sy - sn['radii'][1] * 0.93
    add(kit.tube('SnoutSeam', [(0, front, n['center'][2] - 0.014), (0, front + 0.001, sz - 0.004)], seam, ring=6)[0],
        m['joint'], 'head')
    w = 0.026
    smile = [(x, front + 0.004 * (x / w) ** 2, sz - 0.004 + 0.012 * (x / w) ** 2)
             for x in (w * (i / 6 - 1) for i in range(13))]
    add(kit.tube('Smile', smile, seam, ring=6)[0], m['joint'], 'head')
    add(kit.tube('CrownSeam', crown_seam(), seam, ring=6)[0], m['joint'], 'head')

    # Ears: round pucks splayed a little outward, with a disc inside that lights up.
    er = D['ears']
    for side, sfx, dot in ((1, 'L', 0), (-1, 'R', 1)):
        x = side * er['x']
        rot = (math.pi / 2, side * er['splay'], 0)
        add(kit.superellipsoid(f'Ear.{sfx}', (er['r'], er['r'], er['half']), 0.35, 1.0, seg=(28, 8),
                               location=(x, er['y'], er['z']), rotation=rot), m['shell'], f'ear.{sfx}')
        inner = Vector((0, 0, er['half'] * 0.85))
        inner.rotate(Euler(rot))
        add(kit.superellipsoid(f'EarLight.{sfx}', (er['inner'], er['inner'], er['half'] * 0.4), 0.4, 1.0,
                               seg=(24, 6), location=(x + inner.x, er['y'] + inner.y, er['z'] + inner.z),
                               rotation=rot), m['dot'](dot), f'ear.{sfx}')

    # Arms: a ball at the shoulder, two short segments with a ball at the elbow, round paws.
    r, pw = D['arm_r'], D['paw']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        s, e, wr = (mirror(D[k], side) for k in ('shoulder', 'elbow', 'wrist'))
        add(kit.superellipsoid(f'Shoulder.{sfx}', (r * 1.3,) * 3, seg=(20, 14), location=s), m['joint'],
            f'upper_arm.{sfx}')
        add(kit.tube(f'UpperArm.{sfx}', [s, e], r, ring=12)[0], m['shell'], f'upper_arm.{sfx}')
        add(kit.superellipsoid(f'Elbow.{sfx}', (r * 1.22,) * 3, seg=(20, 14), location=e), m['joint'],
            f'forearm.{sfx}')
        add(kit.tube(f'Forearm.{sfx}', [e, wr], r, ring=12)[0], m['shell'], f'forearm.{sfx}')
        paw = Vector(wr) + (Vector(wr) - Vector(e)).normalized() * 0.012
        add(kit.superellipsoid(f'Paw.{sfx}', pw['radii'], 0.8, 0.9, seg=(20, 14), location=tuple(paw)),
            m['shell'], f'forearm.{sfx}')
        add(kit.superellipsoid(f'PawPad.{sfx}', (pw['radii'][0] * 0.66, 0.01, pw['radii'][2] * 0.6), 0.5, 0.8,
                               seg=(18, 8), location=(paw.x, paw.y - pw['radii'][1] * 0.86, paw.z - 0.004)),
            m['role']('Pad', 'joint'), f'forearm.{sfx}')

    # Legs: a ball at the hip, a knee, and flat feet with pads.
    r, ft, pd = D['leg_r'], D['foot'], D['pad']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        hp, kn, an = (mirror(D[k], side) for k in ('hip', 'knee', 'ankle'))
        add(kit.superellipsoid(f'Hip.{sfx}', (r * 1.25,) * 3, seg=(20, 14), location=hp), m['joint'],
            f'thigh.{sfx}')
        add(kit.tube(f'Thigh.{sfx}', [hp, kn], r, ring=12)[0], m['shell'], f'thigh.{sfx}')
        add(kit.superellipsoid(f'Knee.{sfx}', (r * 1.2,) * 3, seg=(20, 14), location=kn), m['joint'], f'shin.{sfx}')
        add(kit.tube(f'Shin.{sfx}', [kn, an], r, ring=12)[0], m['shell'], f'shin.{sfx}')
        fc = mirror(ft['center'], side)
        add(kit.superellipsoid(f'Foot.{sfx}', ft['radii'], 0.4, 0.55, seg=(24, 12), location=fc), m['shell'],
            f'foot.{sfx}')
        add(kit.superellipsoid(f'Pad.{sfx}', pd['radii'], 0.4, 0.6, seg=(20, 6),
                               location=(fc[0], fc[1], 0.005)), m['role']('Pad', 'joint'),
            f'foot.{sfx}')

    def stud(name, at, r=0.0055, bone='body', mat='joint'):
        add(kit.superellipsoid(name, (r, r * 0.6, r), 0.6, 1.0, seg=(10, 6), location=at, rotation=(math.pi / 2, 0, 0)),
            m[mat], bone)

    # Plush details: a waist seam with stitch studs, studs along the crown, screws round the belly plate.
    add(kit.tube('WaistSeam', waist_ring(), seam, ring=6)[0], m['joint'], 'body')
    for i, pt in enumerate(waist_ring()[:48:4]):
        if not (-0.075 < pt.x < 0.075 and pt.y < 0):
            stud(f'WaistStud.{i}', tuple(pt * 1.0), 0.0045)
    for i, pt in enumerate(crown_seam()[2::3]):
        stud(f'CrownStud.{i}', tuple(pt), 0.0045, 'head')
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        bx, by, bz = bl['center']
        stud(f'BellyScrew.{i}', (bx + (rx + 0.0032) * math.cos(a), by - 0.011, bz + (rx + 0.0032) * math.sin(a)), 0.0048)

    # A bow tie at the collar, and a winding key on the hatch.
    bw = D['bow']
    for side in (-1, 1):
        add(bow_wing(f'Bow.{side}', side, bw['wing'], bw['half'], bw['center']), m['role']('Bow', 'joint'), 'body')
    bx, by, bz = bw['center']
    add(kit.superellipsoid('BowKnot', (0.011, 0.009, 0.011), 0.7, 0.7, seg=(14, 10), location=(bx, by - 0.006, bz)),
        m['role']('Bow', 'joint'), 'body')
    ky = D['key']
    sx, sy, sz = ky['stem']
    add(kit.tube('KeyStem', [(sx, sy, sz), (sx, sy + ky['reach'], sz)], 0.0055, ring=8)[0], m['role']('Key', 'joint'), 'body')
    for side in (-1, 1):
        add(kit.torus(f'KeyLoop.{side}', ky['loop'], 0.0045, seg=(20, 6),
                      location=(sx + side * ky['loop'], sy + ky['reach'] + 0.002, sz), rotation=(math.pi / 2, 0, 0)),
            m['role']('Key', 'joint'), 'body')
    add(kit.torus('TailRing', tl['r'] * 0.86, 0.0035, seg=(24, 6),
                  location=(0, tl['center'][1] + 0.012, tl['center'][2]), rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'body')

    # Snout: whisker studs and a bevelled muzzle rim.
    for side in (-1, 1):
        for j, (dz, dx) in enumerate(((0.012, 0.038), (0.001, 0.046), (-0.01, 0.038))):
            stud(f'Whisker.{side}.{j}', (side * dx, sn['center'][1] - sn['radii'][1] * 0.9, sn['center'][2] + dz), 0.0038, 'head')

    # Ear pucks: a ring round each inner light, screws round the rim, a hinge bolt at the base.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * er['x']
        rot = Euler((math.pi / 2, side * er['splay'], 0))
        top = Vector((0, 0, er['half'] * 0.98))
        top.rotate(rot)
        centre = Vector((x, er['y'], er['z'])) + top
        add(kit.torus(f'EarRing.{sfx}', er['inner'] + 0.005, 0.0038, seg=(28, 6), location=tuple(centre),
                      rotation=tuple(rot)), m['joint'], f'ear.{sfx}')
        for j in range(4):
            a = math.pi / 4 + j * math.pi / 2
            v = Vector((0.047 * math.cos(a), 0.047 * math.sin(a), er['half'] * 0.98))
            v.rotate(rot)
            stud(f'EarScrew.{sfx}.{j}', (x + v.x, er['y'] + v.y, er['z'] + v.z), 0.0042, f'ear.{sfx}')
        bolt = Vector((0, -er['r'] * 0.86, 0))
        bolt.rotate(rot)
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.011, 0.011, 0.011), 0.7, 0.7, seg=(12, 8),
                               location=(x + bolt.x, er['y'] + bolt.y, er['z'] + bolt.z)), m['joint'], f'ear.{sfx}')

    # Joint rings where the limb segments meet the balls, and toe beans on every paw.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        sh, el, wr = (mirror(D[k], side) for k in ('shoulder', 'elbow', 'wrist'))
        hp, kn, an = (mirror(D[k], side) for k in ('hip', 'knee', 'ankle'))
        rr = D['arm_r'] * 1.05
        for name, a, b, t, bone, rad in (
            ('ShoulderRing', sh, el, 0.28, f'upper_arm.{sfx}', rr), ('ElbowRing', el, wr, 0.2, f'forearm.{sfx}', rr),
            ('WristRing', el, wr, 0.92, f'forearm.{sfx}', rr),
            ('HipRing', hp, kn, 0.28, f'thigh.{sfx}', D['leg_r'] * 1.05),
            ('KneeRing', kn, an, 0.2, f'shin.{sfx}', D['leg_r'] * 1.05),
            ('AnkleRing', kn, an, 0.94, f'shin.{sfx}', D['leg_r'] * 1.05),
        ):
            p = Vector(a).lerp(Vector(b), t)
            add(kit.torus(f'{name}.{sfx}', rad, 0.0045, seg=(20, 6), location=tuple(p), rotation=tuple(along(a, b))),
                m['joint'], bone)
        pw = D['paw']['radii']
        wp = Vector(wr) + (Vector(wr) - Vector(el)).normalized() * 0.012
        for j, (dx, dz) in enumerate(((-0.015, 0.02), (0, 0.026), (0.015, 0.02))):
            add(kit.superellipsoid(f'PawBean.{sfx}.{j}', (0.0085, 0.006, 0.0095), seg=(10, 8),
                                   location=(wp.x + dx, wp.y - pw[1] * 0.83, wp.z + dz - 0.004)),
                m['role']('Pad', 'joint'), f'forearm.{sfx}')
        fc = mirror(D['foot']['center'], side)
        for j, dx in enumerate((-0.017, 0, 0.017)):
            add(kit.superellipsoid(f'ToeBean.{sfx}.{j}', (0.0085, 0.008, 0.005), seg=(10, 6),
                                   location=(fc[0] + dx, fc[1] - 0.038 - 0.006 * (j == 1), 0.004)),
                m['role']('Pad', 'joint'), f'foot.{sfx}')
        add(kit.tube(f'ToeSeam.{sfx}', [(fc[0] - 0.03, fc[1] - 0.045, 0.02), (fc[0], fc[1] - 0.052, 0.02),
                                        (fc[0] + 0.03, fc[1] - 0.045, 0.02)], seam, ring=6)[0], m['joint'], f'foot.{sfx}')

    return looks.finish(kit.armature('BearRig', rig_bones()), parts, skin, m)
