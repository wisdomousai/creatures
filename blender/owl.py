"""Hoot, the crew's robot owl: an egg-shaped body with a pale chest plate stamped with
chevrons, panel wings folded at its sides, and a wide head on a bearing ring (a robot's
neck turns all the way round). The head carries a big pale facial disc with the screen
in it; two lens rings on the glass circle the eyes and light in the beacon's colour. A
faceted beak, two angular ear tufts on their own joints, a short tail fan, and hooked
talons gripping the frame line.

Refined: four feather plates a wing, each on its own bone so the wing can fan and flap; a
ring round the facial disc, brow plates, ear tufts with cups and inner spikes, cheek bolts, a
second neck ring, chest screws and lamps, thigh puffs, ankle rings and four-toed talons.

Faces -Y like the rest of the crew; about 0.72 m to the tips of the tufts.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'owl'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.15, 0.13, 0.19), center=(0, 0, 0.25), e=0.8, taper=0.14),
    'chest': dict(radii=(0.1, 0.03, 0.125), center=(0, -0.102, 0.24), e=0.7),
    # Chevrons down the chest plate: rows of (z, how many).
    'chevrons': [(0.31, 2), (0.26, 3), (0.21, 2), (0.16, 1)],
    'neck': dict(major=0.098, minor=0.016, z=0.43),
    'head': dict(radii=(0.175, 0.14, 0.125), center=(0, -0.005, 0.54), e=0.55),
    'disc': dict(radii=(0.155, 0.03, 0.108), center=(0, -0.118, 0.535), e=0.6),
    # A service plate on the back of the head, with vents (he shows it looking behind him).
    'plate': dict(radii=(0.085, 0.014, 0.052), center=(0, 0.127, 0.55), vents=(0.528, 0.55, 0.572)),
    # 2:1, like the owl's face layout (512 x 256); the lens rings sit round its eyes.
    'screen': dict(radii=(0.122, 0.028, 0.061), center=(0, -0.137, 0.545), bezel=0.007),
    'lens': dict(x=0.056, r=0.043, minor=0.0065),
    'beak': dict(base=(0, -0.155, 0.478), tip=(0, -0.19, 0.43), r=0.024),
    'tufts': dict(base=(0.112, -0.03, 0.635), tip=(0.165, 0.0, 0.725), r=0.034),
    # Each wing is three feather plates laid over the body's side, top one outermost:
    # a broad covert, then two longer quills fanning down and back, each rounded at the
    # shoulder and tapering to a point. (top z, tip z, azimuth at top and tip in radians
    # from the side toward the back, half-width, lift off the body, peel at the tip,
    # thickness, role.)
    'plumes': [
        (0.395, 0.1, -0.02, 0.9, 0.045, 0.003, 0.022, 0.011, 'Quill'),
        (0.4, 0.13, -0.18, 0.62, 0.055, 0.012, 0.028, 0.012, 'Quill'),
        (0.41, 0.19, -0.36, 0.3, 0.068, 0.022, 0.014, 0.014, 'Wing'),
        (0.385, 0.05, 0.12, 1.12, 0.036, 0.0, 0.026, 0.009, 'Quill'),
    ],
    # Each plume's bone: the first rides the wing itself, the rest fan out on their own.
    'feather_bones': ['wing', 'fea1', 'fea2', 'fea3'],
    'shoulder': (0.14, 0.0, 0.39),
    'tail': dict(radii=(0.065, 0.018, 0.055), center=(0, 0.125, 0.09), tilt=-0.7),
    'legs': dict(x=0.062, top=(-0.02, 0.1), foot=(-0.055, 0.022), r=0.018),
}


def faceted(name, points, radii, sides, twist=0.0):
    """A faceted spike through the points (a radius of 0 makes the point), open at the
    base, flat-shaded so the facets catch the light."""
    pts = [Vector(q) for q in points]
    axis = (pts[-1] - pts[0]).normalized()
    side = axis.cross(Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))).normalized()
    up = axis.cross(side)
    verts, faces = [], []
    for q, r in zip(pts, radii):
        if r == 0:
            verts.append(tuple(q))
        else:
            verts += [tuple(q + (side * math.cos(2 * math.pi * k / sides + twist)
                                 + up * math.sin(2 * math.pi * k / sides + twist)) * r) for k in range(sides)]
    for j in range(len(pts) - 1):
        a = j * sides
        if radii[j + 1] == 0:
            faces += [(a + k, a + (k + 1) % sides, a + sides) for k in range(sides)]
        else:
            faces += [(a + k, a + (k + 1) % sides, a + sides + (k + 1) % sides, a + sides + k) for k in range(sides)]
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def body_point(z, th):
    """The point on the body's surface at height z and azimuth th (0 at its left side,
    + toward the back), from the same formula as kit.superellipsoid."""
    b = D['body']
    rx, ry, rz = b['radii']
    s = max(-0.999, min(0.999, (z - b['center'][2]) / rz))
    sin_phi = kit.spow(s, 1 / b['e'])
    cp = kit.spow(math.sqrt(1 - sin_phi ** 2), b['e'])
    k = 1 - b['taper'] * s / 2
    return Vector((rx * cp * kit.spow(math.cos(th), b['e']) * k, ry * cp * kit.spow(math.sin(th), b['e']) * k, z))


def body_normal(z, th, h=1e-3):
    n = (body_point(z, th + h) - body_point(z, th - h)).cross(body_point(z + h, th) - body_point(z - h, th))
    n.normalize()
    q = body_point(z, th)
    return n if n.dot(Vector((q.x, q.y, 0))) > 0 else -n


def plume(name, z0, z1, a0, a1, width, lift, peel, thick, side, rows=22, ring=12):
    """A feather plate lying on the body's side: rounded at the top, widest a third of
    the way down, pointed at the tip, curving back as it goes down; the tip peels off."""
    def centre(u):
        return z0 + (z1 - z0) * u, a0 + (a1 - a0) * u ** 1.3

    def profile(u):  # 0 at both ends, a round top and a pointed tip
        return math.sqrt(max(u, 0)) * (1 - u) / 0.385

    def at(u, across, up):
        z, th = centre(u)
        f = profile(u)
        q = body_point(z, th)
        th += across * width * f / max(math.hypot(q.x, q.y), 1e-3)
        off = lift + peel * u * u + thick * math.sqrt(f) * (1 + up) / 2
        p = body_point(z, th) + body_normal(z, th) * off
        return (side * p.x, p.y, p.z)

    verts = [at(0, 0, 0)]
    for j in range(1, rows):
        u = j / rows
        verts += [at(u, math.cos(2 * math.pi * k / ring), math.sin(2 * math.pi * k / ring)) for k in range(ring)]
    verts.append(at(1, 0, 0))
    tip = len(verts) - 1
    faces = [(0, 1 + (k + 1) % ring, 1 + k) for k in range(ring)]
    for j in range(rows - 2):
        r0, r1 = 1 + j * ring, 1 + (j + 1) * ring
        faces += [(r0 + k, r0 + (k + 1) % ring, r1 + (k + 1) % ring, r1 + k) for k in range(ring)]
    last = 1 + (rows - 2) * ring
    faces += [(last + k, last + (k + 1) % ring, tip) for k in range(ring)]
    return kit.mesh_object(name, verts, faces)


def mirror(p, side):
    return side * p[0], p[1], p[2]


def rig_bones():
    t, lg = D['tufts'], D['legs']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.08), (0, 0, 0.42), 'root'),
        # The head turns about the neck's axis.
        # (from the head's own centre, so it can roll over for a bat-style hang)
        ('head', (0, 0, 0.54), (0, 0, 0.66), 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'tuft.{sfx}', mirror(t['base'], side), mirror(t['tip'], side), 'head'))
        sx, sy, sz = D['shoulder']
        bones.append((f'wing.{sfx}', (side * sx, sy, sz), (side * (sx + 0.02), sy + 0.02, 0.12), 'body'))
        for k, fb in enumerate(D['feather_bones'][1:]):
            bones.append((f'{fb}.{sfx}', (side * sx, sy, sz), (side * (sx + 0.02 + 0.01 * k), sy + 0.03, 0.12), f'wing.{sfx}'))
        bones.append((f'leg.{sfx}', (side * lg['x'], lg['top'][0], lg['top'][1]),
                      (side * lg['x'], lg['foot'][0], lg['foot'][1]), 'root'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Body, chest plate with chevrons, tail fan.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(48, 40), taper=b['taper'], location=b['center']),
        m['shell'], 'body')
    c = D['chest']
    add(kit.superellipsoid('Chest', c['radii'], c['e'], c['e'], seg=(32, 24), location=c['center']), m['bezel'], 'body')
    for z, n in D['chevrons']:
        for k in range(n):
            x = (k - (n - 1) / 2) * 0.05
            y = c['center'][1] - c['radii'][1] * 0.85
            pts = [(x - 0.018, y, z + 0.012), (x, y - 0.002, z - 0.006), (x + 0.018, y, z + 0.012)]
            add(kit.tube(f'Chevron.{z}.{k}', pts, 0.0045, ring=6)[0], m['joint'], 'body')
    t = D['tail']
    add(kit.superellipsoid('Tail', t['radii'], 0.5, 1.0, seg=(24, 10), location=t['center'], rotation=(t['tilt'], 0, 0)),
        m['role']('Wing'), 'body')

    # The neck's bearing ring.
    n = D['neck']
    add(kit.torus('Neck', n['major'], n['minor'], seg=(40, 10), location=(0, 0, n['z'])), m['joint'], 'body')

    # Head: facial disc, screen, lens rings, beak, tufts.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(48, 32), location=h['center']), m['shell'], 'head')
    dc = D['disc']
    add(kit.superellipsoid('Disc', dc['radii'], dc['e'], dc['e'], seg=(40, 28), location=dc['center']), m['bezel'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Owl', sc['radii'], sc['center'], sc['bezel'], e=0.45)
    add(glass, m['face'], 'head')
    add(rim, m['joint'], 'head')
    ln = D['lens']
    for side in (1, -1):
        cx, cy, cz = sc['center']
        add(kit.torus(f'Lens.{side}', ln['r'], ln['minor'], seg=(40, 8),
                      location=(side * ln['x'], cy - sc['radii'][1] * 0.8, cz), rotation=(math.pi / 2, 0, 0)),
            m['beacon'], 'head')
    pl = D['plate']
    add(kit.superellipsoid('Plate', pl['radii'], 0.35, 0.8, seg=(28, 16), location=pl['center']), m['bezel'], 'head')
    y = pl['center'][1] + pl['radii'][1] * 0.9
    for k, z in enumerate(pl['vents']):
        add(kit.tube(f'Vent.{k}', [(-0.045, y, z), (0.045, y, z)], 0.0055, ring=8)[0], m['joint'], 'head')
    bk = D['beak']
    add(faceted('Beak', [bk['base'], bk['tip']], [bk['r'], 0], 4, twist=math.pi / 4), m['role']('Beak', 'joint'),
        'head')
    tf = D['tufts']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(faceted(f'Tuft.{sfx}', [mirror(tf['base'], side), mirror(tf['tip'], side)], [tf['r'], 0], 4),
            m['joint'], f'tuft.{sfx}')

    # Wings: feather plates over the body's sides, each on its wing's bone.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, (*shape, role) in enumerate(D['plumes']):
            fb = D['feather_bones'][k]
            add(plume(f'Wing.{sfx}{k}', *shape, side), m['role'](role, 'joint' if role == 'Quill' else 'shell'),
                f'{fb}.{sfx}')
            # A small light at the tip of each quill (Dot3): the wing's signature.
            if k in (1, 3):
                z0, z1, a0, a1, w, lift, peel, thick, _ = (*shape, role)
                q = body_point(z1 + 0.02, a1) + body_normal(z1 + 0.02, a1) * (lift + peel + thick * 0.4)
                add(kit.superellipsoid(f'Tip.{sfx}{k}', (0.008, 0.008, 0.008), 1, 1, seg=(10, 8),
                                       location=(side * q.x, q.y, q.z)), m['dot'](3), f'{fb}.{sfx}')


    # ---- Refinements: seams, screws, lamps, rings ----
    c = D['chest']
    cy = c['center'][1] - c['radii'][1] * 0.75
    for sx in (-1, 1):
        for z in (0.335, 0.145):
            add(kit.superellipsoid(f'Screw.{sx}.{z}', (0.007, 0.004, 0.007), 0.5, 0.5, seg=(10, 6),
                                   location=(sx * 0.082, cy - 0.006, z), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    for i, x in enumerate((-0.04, 0, 0.04)):
        add(kit.superellipsoid(f'Lamp.{i}', (0.009, 0.006, 0.009), 0.6, 0.6, seg=(12, 8),
                               location=(x, cy - 0.012, 0.365)), m['dot'](i), 'body')
    # A belly seam and vent slots.
    add(kit.tube('BellySeam', [(-0.075, cy - 0.004, 0.115), (0, cy - 0.006, 0.108), (0.075, cy - 0.004, 0.115)], 0.0035, ring=6)[0],
        m['joint'], 'body')
    # Shoulder caps where the wings join.
    for side in (1, -1):
        add(kit.superellipsoid(f'Shoulder.{side}', (0.012, 0.022, 0.022), 0.5, 0.5, seg=(14, 10),
                               location=(side * 0.148, 0.0, 0.385)), m['bezel'], 'body')
        add(kit.superellipsoid(f'ShoulderBolt.{side}', (0.005, 0.007, 0.007), 0.5, 0.5, seg=(10, 6),
                               location=(side * 0.16, 0.0, 0.385)), m['joint'], 'body')
    # Two spare tail feathers, fanned out beside the tail.
    t = D['tail']
    for side in (1, -1):
        add(kit.superellipsoid(f'TailFan.{side}', (0.045, 0.014, 0.05), 0.5, 1.0, seg=(20, 8),
                               location=(side * 0.05, t['center'][1] - 0.004, t['center'][2] - 0.008),
                               rotation=(t['tilt'], 0, side * 0.42)), m['role']('Wing'), 'body')
    # A second, thinner neck ring under the first.
    n = D['neck']
    add(kit.torus('Neck2', n['major'] + 0.006, n['minor'] * 0.6, seg=(40, 8), location=(0, 0, n['z'] - 0.024)),
        m['bezel'], 'body')
    # Ring round the facial disc, brow plates, cheek bolts, cere.
    dc = D['disc']
    ring = kit.torus('DiscRing', 0.1, 0.0055, seg=(48, 8), location=(0, dc['center'][1] + 0.004, dc['center'][2]),
                     rotation=(math.pi / 2, 0, 0))
    kit.stretch(ring, 1.5, 1.0, 1.06)
    add(ring, m['role']('Quill', 'joint'), 'head')
    for side in (1, -1):
        pts = [(side * 0.018, -0.152, 0.607), (side * 0.07, -0.146, 0.604), (side * 0.118, -0.128, 0.58)]
        add(kit.tube(f'Brow.{side}', kit.spline(pts, 8), [0.011 - 0.005 * i / 7 for i in range(8)], ring=6)[0],
            m['joint'], 'head')
        add(kit.superellipsoid(f'Cheek.{side}', (0.006, 0.014, 0.014), 0.5, 0.5, seg=(12, 8),
                               location=(side * 0.174, -0.02, 0.5)), m['joint'], 'head')
        add(kit.superellipsoid(f'CheekBolt.{side}', (0.004, 0.006, 0.006), 0.5, 0.5, seg=(10, 6),
                               location=(side * 0.18, -0.02, 0.5)), m['bezel'], 'head')
    add(kit.superellipsoid('Cere', (0.02, 0.008, 0.01), 0.5, 0.5, seg=(14, 8), location=(0, -0.152, 0.492)),
        m['bezel'], 'head')
    # Tuft cups and inner spikes.
    tf = D['tufts']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bx, by, bz = mirror(tf['base'], side)
        add(kit.superellipsoid(f'TuftCup.{sfx}', (0.03, 0.026, 0.02), 0.6, 0.6, seg=(16, 10),
                               location=(bx * 0.97, by, bz - 0.005)), m['bezel'], f'tuft.{sfx}')
        inner = [mirror((tf['base'][0] - 0.03, tf['base'][1] + 0.005, tf['base'][2] - 0.005), side),
                 mirror((tf['tip'][0] - 0.05, tf['tip'][1] + 0.008, tf['tip'][2] - 0.045), side)]
        add(faceted(f'TuftInner.{sfx}', inner, [0.02, 0], 4), m['joint'], f'tuft.{sfx}')

    # Legs and talons, hooked over the line.
    lg = D['legs']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        top, foot = (x, *lg['top']), (x, *lg['foot'])
        add(kit.tube(f'Leg.{sfx}', [top, foot], lg['r'], ring=10)[0], m['joint'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Thigh.{sfx}', (0.03, 0.03, 0.032), 0.7, 0.7, seg=(16, 12),
                               location=(x, top[1], top[2] - 0.012)), m['role']('Wing'), f'leg.{sfx}')
        add(kit.torus(f'Ankle.{sfx}', 0.02, 0.006, seg=(16, 6), location=(x, foot[1], foot[2] + 0.025)),
            m['bezel'], f'leg.{sfx}')
        add(kit.tube(f'Hallux.{sfx}', [(x, foot[1], foot[2]), (x, foot[1] + 0.03, foot[2] - 0.012)], [0.008, 0.003], ring=6)[0],
            m['joint'], f'leg.{sfx}')
        for k, dx in enumerate((-0.022, 0, 0.022)):
            pts = [(x + dx * 0.4, foot[1], foot[2]), (x + dx, foot[1] - 0.035, foot[2] - 0.004),
                   (x + dx * 1.1, foot[1] - 0.05, foot[2] - 0.02)]
            add(kit.tube(f'Talon.{sfx}{k}', kit.spline(pts, 8), [0.008 - 0.005 * i / 7 for i in range(8)], ring=6)[0],
                m['joint'], f'leg.{sfx}')

    # ---- Second pass: breast plates, hinges, rings, rivets, knuckles ----
    def scale_at(name, z, th, size, mat, bone, lift=0.002):
        q = body_point(z, th)
        n = body_normal(z, th)
        q = q + n * lift
        rz = math.atan2(n.y, n.x) - math.pi / 2
        add(kit.superellipsoid(name, size, 0.6, 0.6, seg=(12, 8), location=(q.x, q.y, q.z),
                               rotation=(0.35, 0, rz)), mat, bone)

    # Layered breast plates: a collar of overlapping scales above the chest plate and two
    # rows round the belly below it, each row offset from the last.
    for row, (z, n, span_, size) in enumerate([(0.392, 9, 2.9, (0.03, 0.007, 0.02)),
                                                (0.072, 9, 2.9, (0.032, 0.007, 0.021)),
                                                (0.104, 8, 2.6, (0.03, 0.007, 0.02))]):
        for k in range(n):
            th = -math.pi / 2 - span_ / 2 + span_ * (k + (0.5 if row == 2 else 0)) / (n - 1 if row != 2 else n)
            if row == 2 and k == n - 1:
                continue
            scale_at(f'Scale.{row}.{k}', z, th, size, m['role']('Quill', 'joint') if row else m['bezel'], 'body',
                     0.003 * (row + 1) * 0.5)
    # Head bearing ring with notches, so a turned head shows it.
    add(kit.torus('HeadRing', 0.112, 0.0075, seg=(40, 8), location=(0, 0, 0.436)), m['bezel'], 'head')
    for k in range(6):
        a = 2 * math.pi * k / 6
        add(kit.superellipsoid(f'HeadNotch.{k}', (0.008, 0.008, 0.007), 0.5, 0.5, seg=(8, 6),
                               location=(0.112 * math.cos(a), 0.112 * math.sin(a), 0.436), rotation=(0, 0, a)),
            m['joint'], 'head')
    # Big round bezels round the lenses.
    cx, cy, cz = D['screen']['center']
    for side in (1, -1):
        add(kit.torus(f'EyeBezel.{side}', 0.052, 0.005, seg=(40, 8),
                      location=(side * D['lens']['x'], cy - D['screen']['radii'][1] * 0.72, cz),
                      rotation=(math.pi / 2, 0, 0)), m['bezel'], 'head')
    # A hinge line across the beak.
    bk = D['beak']
    bx, by, bz = [bk['base'][i] * 0.55 + bk['tip'][i] * 0.45 for i in range(3)]
    add(kit.tube('BeakHinge', [(-0.017, by - 0.001, bz + 0.002), (0, by - 0.004, bz + 0.002), (0.017, by - 0.001, bz + 0.002)],
                 0.0032, ring=6)[0], m['bezel'], 'head')
    # Tuft hinges and lit tips.
    tf = D['tufts']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bx, by, bz = mirror(tf['base'], side)
        add(kit.superellipsoid(f'TuftHinge.{sfx}', (0.011, 0.011, 0.011), 1, 1, seg=(12, 8),
                               location=(bx, by, bz - 0.004)), m['bezel'], f'tuft.{sfx}')
        tx, ty, tz = mirror(tf['tip'], side)
        add(kit.superellipsoid(f'TuftTip.{sfx}', (0.007, 0.007, 0.007), 1, 1, seg=(10, 8),
                               location=(tx * 0.99, ty, tz - 0.004)), m['dot'](3), f'tuft.{sfx}')
    # Rivets round each wing root.
    for side in (1, -1):
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            add(kit.superellipsoid(f'Rivet.{side}.{k}', (0.0035, 0.0035, 0.0035), 1, 1, seg=(8, 6),
                                   location=(side * 0.163, 0.024 * math.cos(a), 0.385 + 0.024 * math.sin(a))),
                m['bezel'], 'body')
    # Toe rings: a small knuckle band on each talon.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        foot = lg['foot']
        for k, dx in enumerate((-0.022, 0, 0.022)):
            add(kit.superellipsoid(f'Toe.{sfx}{k}', (0.0085, 0.008, 0.0085), 0.8, 0.8, seg=(10, 8),
                                   location=(x + dx * 0.55, foot[0] - 0.018, foot[1] - 0.001)), m['bezel'], f'leg.{sfx}')

    return looks.finish(kit.armature('OwlRig', rig_bones()), parts, skin, m)
