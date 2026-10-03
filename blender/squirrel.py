"""Chip, the crew's robot squirrel: a toy robot, not a squirrel in a robot suit. A small
egg of a body sitting up on two big thigh discs with long flat feet, short segmented
arms with mitten paws held at the chest, and a boxy head with a screen face, a short
muzzle with two buck teeth under it, and round ears with a fin on top for the tufts.

The tail is the signature: a big S of chunky plates threaded on a chain of bones,
rising behind his back and curling over it, with a lit disc in every seam between two
plates. The seams come in bands from root to tip, each its own material (Dot0 at the
root to Dot7 at the tip), so the site can run lights up and down the tail. He holds a
hex nut between his paws (on its own bone, so the site can hide it, bury it and dig it
up again). Rims on the plates and a bezel round every lit seam disc, cheek hatches, whisker
pods, dialled thigh discs with bolts, toe caps, ringed arms, a vented belly with a belt and a
tool pouch, layered ear tufts, and a heap of dirt on its own bone for the digging.
Faces -Y like the rest of the crew; about 0.56 m to the top of the tail.
"""

import math

from mathutils import Euler, Vector

import kit
import looks

FACE = 'squirrel'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    # Big thigh discs either side of the hips, turning on the hip axle; long flat feet.
    'hip': (0.0, 0.035, 0.085),
    'thigh': dict(x=0.068, r=0.068, width=0.032),
    'hub': dict(r=0.03, width=0.01),
    'foot': dict(radii=(0.026, 0.062, 0.016), x=0.07, y=-0.035, e=0.4),
    # An egg of a body, leaning forward a little, with a pale belly panel.
    'body': dict(radii=(0.082, 0.078, 0.118), center=(0, 0.005, 0.175), e=0.55, lean=0.3, taper=0.12),
    'belly': dict(radii=(0.052, 0.03, 0.082), center=(0, -0.052, 0.168), e=0.5),
    'collar': dict(major=0.052, minor=0.009, center=(0, -0.032, 0.272), tilt=0.45),
    'head': dict(radii=(0.092, 0.08, 0.074), center=(0, -0.052, 0.34), e=0.4),
    # 2:1, like the squirrel's face layout (512 x 256)
    'screen': dict(radii=(0.072, 0.02, 0.038), center=(0, -0.131, 0.35), bezel=0.007),
    'muzzle': dict(radii=(0.034, 0.03, 0.022), center=(0, -0.137, 0.294), e=0.5),
    'nose': dict(radii=(0.012, 0.008, 0.008), center=(0, -0.166, 0.306)),
    'teeth': dict(radii=(0.0075, 0.005, 0.012), x=0.0085, y=-0.155, z=0.27),
    'ears': dict(x=0.058, y=-0.045, z=0.415, radii=(0.03, 0.012, 0.034), tilt=0.28),
    'tuft': dict(length=0.07, width=0.026, lean=0.35),
    # Cheek pods on the sides of the muzzle: small bumps that swell when he stuffs them.
    'cheek': dict(x=0.068, y=-0.1, z=0.3, radii=(0.026, 0.03, 0.03)),
    'shoulder': (0.06, -0.065, 0.245),
    'paw': dict(at=(0.028, -0.13, 0.205), radii=(0.017, 0.016, 0.02), arm_r=0.013),
    'nut': dict(center=(0, -0.152, 0.205), r=0.022, hole=0.01, width=0.012),
    # The tail: an S through these points (y back, z up), plates along it.
    'tail': [(0, 0.07, 0.085), (0, 0.15, 0.09), (0, 0.2, 0.16), (0, 0.205, 0.26), (0, 0.185, 0.36),
             (0, 0.15, 0.45), (0, 0.09, 0.51), (0, 0.03, 0.51)],
    # Plates: how many, their radius at the tip end (root, fullest, tip), how much wider
    # across the tail, their length (a share of the gap from one to the next), how narrow
    # the root end is, and the bevel on their edges.
    'plates': dict(n=9, radius=(0.05, 0.115, 0.06), peak=0.5, width=1.2, overlap=1.55, flare=0.72, bevel=0.022),
    # The lights in the sides of the plates: where along (-0.5 root end, 0.5 tip end), how
    # far they sit in and stand out, and their radius.
    'led': dict(at=0.12, inset=0.003, depth=0.006, size=0.012),
    'bones': 5,
    'bands': 5,
}


def tail_frames(n):
    """n points evenly along the tail curve, each with its tangent and how far along it is."""
    pts = [Vector(p) for p in kit.spline(D['tail'], 96)]
    lengths = [0.0]
    for a, b in zip(pts, pts[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    out = []
    for i in range(n):
        t = i / (n - 1)
        d = lengths[-1] * t
        j = min(max(k for k, L in enumerate(lengths) if L <= d), len(pts) - 2)
        f = (d - lengths[j]) / max(lengths[j + 1] - lengths[j], 1e-9)
        out.append((pts[j].lerp(pts[j + 1], f), (pts[j + 1] - pts[j]).normalized(), t))
    return out


def plate_radius(t):
    """Small at the root, fullest a little past the middle, a bit smaller at the tip."""
    r0, r1, r2 = D['plates']['radius']
    peak = D['plates']['peak']
    if t < peak:
        u = t / peak
        return r0 + (r1 - r0) * math.sin(u * math.pi / 2)
    u = (t - peak) / (1 - peak)
    return r1 + (r2 - r1) * u * u


def along(tangent):
    """The Euler turn that points a part's +Z along the tangent."""
    return Vector((0, 0, 1)).rotation_difference(tangent).to_euler()


def flared(name, r, length, pl, location, rotation):
    """A tail plate: a short section of hose along its +Z, flaring from the root end to the
    tip end, its edges rounded."""
    b, root, h = pl['bevel'], pl['flare'] * r, length / 2
    profile = [(0.0, h), (r - b, h), (r, h - b), (root, -h + b), (root - b, -h), (0.0, -h)]
    obj = kit.lathe(name, profile, seg=28, location=location, rotation=rotation)
    return kit.stretch(obj, sx=pl['width'])


def tail_bone(t):
    return f'tail.{min(D["bones"] - 1, int(t * D["bones"])) + 1}'


def hex_nut(name, r, hole, width, location):
    """A hex nut facing the viewer: six flat sides round a round hole, flat-shaded."""
    verts, faces = [], []
    n_in = 12
    for y in (-width / 2, width / 2):
        verts += [(r * math.cos(math.pi / 3 * k), y, r * math.sin(math.pi / 3 * k)) for k in range(6)]
    for y in (-width / 2, width / 2):
        verts += [(hole * math.cos(2 * math.pi * k / n_in), y, hole * math.sin(2 * math.pi * k / n_in))
                  for k in range(n_in)]
    fo, bo, fi, bi = 0, 6, 12, 12 + n_in
    for k in range(6):
        faces.append((fo + k, bo + k, bo + (k + 1) % 6, fo + (k + 1) % 6))  # outer sides
    # Front and back faces: each hex corner fans to two hole points.
    for outer, inner, flip in ((fo, fi, False), (bo, bi, True)):
        for k in range(6):
            a, b = outer + k, outer + (k + 1) % 6
            i0, i1, i2 = inner + 2 * k, inner + (2 * k + 1) % n_in, inner + (2 * k + 2) % n_in
            quads = [(a, i0, i1), (a, i1, b), (b, i1, i2)]
            faces += [q[::-1] if flip else q for q in quads]
    for k in range(n_in):
        faces.append((fi + k, fi + (k + 1) % n_in, bi + (k + 1) % n_in, bi + k))  # the hole
    obj = kit.mesh_object(name, verts, faces, location)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def fin(name, base, length, width, lean, side):
    """An ear tuft: a flat faceted blade standing up off the ear, leaning back and out."""
    x, y, z = base
    tip = (x + side * length * 0.25, y + length * lean, z + length)
    w, t = width / 2, 0.004
    verts = [(x - w, y - t, z), (x + w, y - t, z), (x + w, y + t, z), (x - w, y + t, z),
             (x + side * w * 0.2 + (tip[0] - x) * 0.55, y + length * lean * 0.55, z + length * 0.55 + 0.0),
             tip]
    # Base quad, and a two-stage blade: wide at the ear, a notch, then to the tip.
    faces = [(0, 3, 2, 1), (0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 1, 5), (1, 2, 5), (2, 3, 5), (3, 0, 5)]
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def rig_bones():
    hx, hy, hz = D['hip']
    sx, sy, sz = D['shoulder']
    px, py, pz = D['paw']['at']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # Pivots on the hip axle, so pitching it sits him up (-) or down on all fours (+).
        ('body', (0, hy, hz), (0, -0.04, 0.28), 'root'),
        ('head', (0, -0.035, 0.275), (0, -0.06, 0.42), 'body'),
        ('ear.L', (D['ears']['x'], D['ears']['y'], D['ears']['z'] - 0.02),
         (D['ears']['x'], D['ears']['y'], D['ears']['z'] + 0.06), 'head'),
        ('ear.R', (-D['ears']['x'], D['ears']['y'], D['ears']['z'] - 0.02),
         (-D['ears']['x'], D['ears']['y'], D['ears']['z'] + 0.06), 'head'),
        ('cheek.L', (D['cheek']['x'], D['cheek']['y'], D['cheek']['z']),
         (D['cheek']['x'], D['cheek']['y'], D['cheek']['z'] + 0.02), 'head'),
        ('cheek.R', (-D['cheek']['x'], D['cheek']['y'], D['cheek']['z']),
         (-D['cheek']['x'], D['cheek']['y'], D['cheek']['z'] + 0.02), 'head'),
        ('arm.L', (sx, sy, sz), (px, py, pz), 'body'),
        ('arm.R', (-sx, sy, sz), (-px, py, pz), 'body'),
        # The nut rides between the paws, on the left one.
        ('nut', D['nut']['center'], (0, D['nut']['center'][1] - 0.04, D['nut']['center'][2]), 'arm.L'),
        # A heap of dirt by his paws, scaled to nothing until he digs.
        ('dirt', (0, -0.15, 0.02), (0, -0.15, 0.06), 'root'),
        # Legs hang from the hip axle and stay on the ground as the body tips.
        ('leg.L', (D['thigh']['x'], hy, hz), (D['foot']['x'], D['foot']['y'], 0), 'root'),
        ('leg.R', (-D['thigh']['x'], hy, hz), (-D['foot']['x'], D['foot']['y'], 0), 'root'),
    ]
    # The tail: a chain along the curve.
    joints = tail_frames(D['bones'] + 1)
    parent = 'body'
    for i in range(D['bones']):
        name = f'tail.{i + 1}'
        bones.append((name, tuple(joints[i][0]), tuple(joints[i + 1][0]), parent))
        parent = name
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Thigh discs on the hip axle, a hub in each, and long flat feet.
    hx, hy, hz = D['hip']
    th, hb, ft = D['thigh'], D['hub'], D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * th['x']
        add(kit.superellipsoid(f'Thigh.{sfx}', (th['r'], th['r'], th['width']), 0.3, 1.0, seg=(36, 8),
                               location=(x, hy, hz), rotation=(0, math.pi / 2, 0)), m['shell'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Hub.{sfx}', (hb['r'], hb['r'], hb['width']), 0.3, 1.0, seg=(24, 6),
                               location=(x + side * th['width'] * 0.95, hy, hz), rotation=(0, math.pi / 2, 0)),
            m['joint'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Foot.{sfx}', ft['radii'], ft['e'], 0.5, seg=(24, 12),
                               location=(side * ft['x'], ft['y'], ft['radii'][2])), m['joint'], f'leg.{sfx}')

    # Body: an egg leaning forward, the belly panel on its front, a collar ring at the neck.
    b, bl, c = D['body'], D['belly'], D['collar']
    add(kit.superellipsoid('Body', b['radii'], b['e'], 0.8, seg=(40, 28), taper=b['taper'], location=b['center'],
                           rotation=(b['lean'], 0, 0)), m['shell'], 'body')
    add(kit.superellipsoid('Belly', bl['radii'], bl['e'], 0.8, seg=(28, 20), location=bl['center'],
                           rotation=(b['lean'], 0, 0)), m['role']('Belly', 'joint'), 'body')
    add(kit.torus('Collar', c['major'], c['minor'], seg=(32, 8), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['joint'], 'body')

    # Head: screen face, a short muzzle with a button nose and two buck teeth under it.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(40, 28), location=h['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Squirrel', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    mz, n, te = D['muzzle'], D['nose'], D['teeth']
    add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(24, 16), location=mz['center']), m['shell'],
        'head')
    add(kit.superellipsoid('Nose', n['radii'], 0.6, 0.8, seg=(14, 8), location=n['center']), m['bezel'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Tooth.{side}', te['radii'], 0.3, 0.3, seg=(10, 8),
                               location=(side * te['x'], te['y'], te['z'])), m['role']('Tooth', 'glow'), 'head')

    # Cheek pods: a puck with a lit ring, on their own bones.
    ck = D['cheek']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        at = (side * ck['x'], ck['y'], ck['z'])
        add(kit.superellipsoid(f'Cheek.{sfx}', ck['radii'], 0.6, 0.8, seg=(20, 12), location=at),
            m['role']('Plate', 'shell'), f'cheek.{sfx}')
        add(kit.superellipsoid(f'CheekLed.{sfx}', (0.004, 0.011, 0.011), 0.8, 1.0, seg=(12, 8),
                               location=(at[0] + side * (ck['radii'][0] - 0.001), at[1] - 0.004, at[2])),
            m['dot'](D['bands'] - 1), f'cheek.{sfx}')

    # Ears: round, flat, tipped out, each with a fin standing up off it for the tuft.
    e, tf = D['ears'], D['tuft']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * e['x']
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], 0.6, 0.8, seg=(24, 14), location=(x, e['y'], e['z']),
                               rotation=(0, side * e['tilt'], 0)), m['shell'], f'ear.{sfx}')
        add(kit.superellipsoid(f'InnerEar.{sfx}', (e['radii'][0] * 0.6, 0.004, e['radii'][2] * 0.6), 0.6, 0.8,
                               seg=(16, 10), location=(x, e['y'] - e['radii'][1], e['z'] - 0.002),
                               rotation=(0, side * e['tilt'], 0)), m['joint'], f'ear.{sfx}')
        top = (x + side * e['radii'][2] * math.sin(e['tilt']) * 0.8, e['y'] + 0.002,
               e['z'] + e['radii'][2] * math.cos(e['tilt']) * 0.8)
        add(fin(f'Tuft.{sfx}', top, tf['length'], tf['width'], tf['lean'], side), m['joint'], f'ear.{sfx}')

    # Arms: a ball at the shoulder, a short forearm, a mitten paw at the chest.
    pw = D['paw']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        s = Vector((side * D['shoulder'][0], *D['shoulder'][1:]))
        p = Vector((side * pw['at'][0], *pw['at'][1:]))
        add(kit.superellipsoid(f'Shoulder.{sfx}', (pw['arm_r'] * 1.6,) * 3, seg=(16, 10), location=s), m['joint'],
            f'arm.{sfx}')
        add(kit.tube(f'Arm.{sfx}', [s, p], pw['arm_r'], ring=12)[0], m['shell'], f'arm.{sfx}')
        add(kit.superellipsoid(f'Paw.{sfx}', pw['radii'], 0.5, 0.6, seg=(18, 12), location=p), m['joint'],
            f'arm.{sfx}')

    # The nut.
    nt = D['nut']
    add(hex_nut('Nut', nt['r'], nt['hole'], nt['width'], nt['center']), m['role']('Nut', 'bezel'), 'nut')

    # Tail: flared plates along the curve, each sitting in the one before like the
    # sections of a hose, a cap on the tip, and a round light in each side of every plate;
    # the bands run root to tip.
    pl, ld = D['plates'], D['led']
    frames = tail_frames(pl['n'])
    pitch = sum((b[0] - a[0]).length for a, b in zip(frames, frames[1:])) / (pl['n'] - 1)
    length = pitch * pl['overlap']
    for i, (q, tangent, t) in enumerate(frames):
        r = plate_radius(t)
        turn = along(tangent)
        bone = tail_bone(t)
        add(flared(f'Plate.{i}', r, length, pl, q, turn), m['role']('Plate', 'shell'), bone)
        band = min(D['bands'] - 1, i * D['bands'] // pl['n'])
        z = length * ld['at']
        reach = r * pl['width'] * (1 - (1 - pl['flare']) * (0.5 - ld['at']))
        for side in (1, -1):
            at = q + tangent * z + Vector((side * (reach - ld['inset']), 0, 0))
            add(kit.superellipsoid(f'Led.{i}.{side}', (ld['depth'], ld['size'], ld['size']), 0.8, 1.0, seg=(14, 8),
                                   location=at, rotation=turn), m['dot'](band), bone)
            # A bezel ring round the light, its axis across the tail.
            face = (turn.to_matrix() @ Euler((0, math.pi / 2, 0)).to_matrix()).to_euler()
            add(kit.torus(f'LedRing.{i}.{side}', ld['size'] * 1.35, 0.0035, seg=(16, 5),
                          location=at + Vector((side * 0.001, 0, 0)), rotation=face), m['role']('Rim', 'joint'), bone)
        # A rim round the tip end of the plate.
        rim = kit.torus(f'Rim.{i}', r - pl['bevel'] * 0.35, 0.0045, seg=(28, 5),
                        location=q + tangent * (length / 2 - pl['bevel'] * 0.6), rotation=turn)
        add(kit.stretch(rim, sx=pl['width']), m['role']('Rim', 'joint'), bone)
    q, tangent, t = frames[-1]
    r = plate_radius(t)
    add(kit.superellipsoid('TailCap', (r * pl['width'] * 0.8, r * 0.8, r * 0.35), 0.6, 1.0, seg=(28, 10),
                           location=q + tangent * length * 0.5, rotation=along(tangent)), m['role']('Plate', 'shell'),
        tail_bone(t))

    detail(add, m)
    return looks.finish(kit.armature('SquirrelRig', rig_bones()), parts, skin, m)


def bolt(add, m, name, at, rot, r=0.005, bone='body', mat='bezel'):
    """A round bolt head sitting on a surface: a low puck, axis along its local Z."""
    return add(kit.superellipsoid(name, (r, r, r * 0.55), 0.4, 1.0, seg=(10, 4), location=at, rotation=rot),
               m[mat], bone)


def detail(add, m):
    """The fine work: seams, bolts, pods, hatches, toes, rings, a belt and a pouch."""
    ax_x = (0, math.pi / 2, 0)
    ax_y = (math.pi / 2, 0, 0)
    hx, hy, hz = D['hip']
    th, ft = D['thigh'], D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'leg.{sfx}'
        face = side * (th['x'] + th['width'] * 0.9)
        # Thigh: a dial ring with a lit tick, bolts round it.
        add(kit.torus(f'Dial.{sfx}', 0.047, 0.003, seg=(30, 5), location=(face, hy, hz), rotation=ax_x),
            m['role']('Rim', 'joint'), bone)
        add(kit.superellipsoid(f'Tick.{sfx}', (0.003, 0.0035, 0.007), 0.8, 1.0, seg=(8, 6),
                               location=(face + side * 0.001, hy, hz + 0.047)), m['dot'](0), bone)
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            bolt(add, m, f'ThighBolt.{sfx}{k}', (face, hy + 0.055 * math.cos(a), hz + 0.055 * math.sin(a)),
                 (0, side * math.pi / 2, 0), 0.0055, bone)
        # Foot: a tread sole, three toes with claw caps, a heel bolt.
        fy, fz = ft['y'], ft['radii'][2]
        add(kit.superellipsoid(f'Sole.{sfx}', (ft['radii'][0] * 0.95, ft['radii'][1] * 0.95, 0.0045), 0.4, 0.5,
                               seg=(20, 6), location=(side * ft['x'], fy, 0.0035)), m['bezel'], bone)
        for k, dx in enumerate((-0.0135, 0, 0.0135)):
            tx = side * ft['x'] + dx
            add(kit.superellipsoid(f'Toe.{sfx}{k}', (0.0085, 0.013, 0.009), 0.5, 0.6, seg=(12, 8),
                                   location=(tx, fy - ft['radii'][1] + 0.006, 0.0105)), m['joint'], bone)
            add(kit.superellipsoid(f'Claw.{sfx}{k}', (0.0065, 0.007, 0.0065), 0.6, 0.7, seg=(10, 6),
                                   location=(tx, fy - ft['radii'][1] - 0.006, 0.0095)), m['bezel'], bone)
        bolt(add, m, f'Heel.{sfx}', (side * ft['x'], fy + 0.038, fz + 0.011), (0, 0, 0), 0.006, bone)

    # Belly: three vent slits, a belt round the waist with a pouch on the hip.
    b, bl = D['body'], D['belly']
    lean = Euler((b['lean'], 0, 0)).to_matrix()

    def on_belly(x, dz, off=0.001):
        return Vector(bl['center']) + lean @ Vector((x, -bl['radii'][1] - off, dz))

    for k, dz in enumerate((0.052, 0.038, 0.024)):
        add(kit.superellipsoid(f'Vent.{k}', (0.02, 0.0025, 0.0032), 0.5, 0.5, seg=(12, 6),
                               location=on_belly(0, dz, 0.0), rotation=(b['lean'], 0, 0)), m['bezel'], 'body')
    for side in (1, -1):
        bolt(add, m, f'BellyBolt.{side}', on_belly(side * 0.036, 0.048), (b['lean'] + math.pi / 2, 0, 0), 0.0045)
    add(kit.torus('Belt', 0.086, 0.0065, seg=(36, 6), location=(0, 0.005, 0.118), rotation=(b['lean'], 0, 0)),
        m['role']('Pouch', 'joint'), 'body')
    add(kit.superellipsoid('Buckle', (0.014, 0.005, 0.011), 0.4, 0.5, seg=(12, 6),
                           location=(0, -0.078, 0.12), rotation=(b['lean'], 0, 0)), m['bezel'], 'body')
    px = 0.084
    add(kit.superellipsoid('Pouch', (0.016, 0.028, 0.03), 0.5, 0.5, seg=(14, 10),
                           location=(px + 0.006, 0.0, 0.118)), m['role']('Pouch', 'joint'), 'body')
    add(kit.superellipsoid('PouchFlap', (0.018, 0.03, 0.013), 0.5, 0.5, seg=(14, 8),
                           location=(px + 0.008, 0.0, 0.14)), m['role']('Pouch', 'joint'), 'body')
    bolt(add, m, 'PouchBolt', (px + 0.0265, 0.0, 0.14), (0, math.pi / 2, 0), 0.006)

    # Head: side bolts, whisker pods (the middle ones lit), cheek hatches.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bolt(add, m, f'HeadBolt.{sfx}', (side * 0.0915, -0.045, 0.335), (0, side * math.pi / 2, 0), 0.0075, 'head')
        bolt(add, m, f'HeadBolt2.{sfx}', (side * 0.0915, -0.045, 0.372), (0, side * math.pi / 2, 0), 0.0055, 'head')
        for k, dz in enumerate((0.012, 0.0, -0.012)):
            reach = 0.05 + 0.004 * (1 - abs(k - 1))
            add(kit.superellipsoid(f'Whisker.{sfx}{k}', (0.0085, 0.006, 0.006), 0.7, 0.9, seg=(10, 6),
                                   location=(side * reach, -0.14, 0.292 + dz * 1.2)),
                m['dot'](D['bands'] - 1) if k == 1 else m['joint'], 'head')
        ck = D['cheek']
        # A little hatch on the front of the cheek pod: a plate and a bolt.
        hat = (side * (ck['x'] - 0.001), ck['y'] - ck['radii'][1] + 0.001, ck['z'] - 0.004)
        add(kit.superellipsoid(f'Hatch.{sfx}', (0.015, 0.0035, 0.013), 0.4, 0.5, seg=(14, 6), location=hat,
                               rotation=(0, 0, side * 0.3)), m['role']('Rim', 'joint'), f'cheek.{sfx}')
        bolt(add, m, f'HatchBolt.{sfx}', (hat[0] + side * 0.007, hat[1] - 0.003, hat[2] + 0.005), ax_y, 0.0035,
             f'cheek.{sfx}')

    # Ears: a bolt in the middle and a second, shorter blade in front of each tuft.
    e, tf = D['ears'], D['tuft']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * e['x']
        bolt(add, m, f'EarBolt.{sfx}', (x, e['y'] - e['radii'][1] - 0.001, e['z'] - 0.004), ax_y, 0.006, f'ear.{sfx}')
        top = (x + side * e['radii'][2] * math.sin(e['tilt']) * 0.8, e['y'] + 0.002,
               e['z'] + e['radii'][2] * math.cos(e['tilt']) * 0.8)
        add(fin(f'Tuft2.{sfx}', (top[0] - side * 0.009, top[1] - 0.006, top[2] - 0.004), tf['length'] * 0.62,
                tf['width'] * 0.7, tf['lean'], side), m['bezel'], f'ear.{sfx}')

    # Arms: a ring on the upper arm, a wrist cuff and three knuckle beads on each paw.
    pw = D['paw']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        s = Vector((side * D['shoulder'][0], *D['shoulder'][1:]))
        p = Vector((side * pw['at'][0], *pw['at'][1:]))
        d = (p - s).normalized()
        turn = Vector((0, 0, 1)).rotation_difference(d).to_euler()
        add(kit.torus(f'ArmRing.{sfx}', pw['arm_r'] * 1.25, 0.003, seg=(16, 5), location=s.lerp(p, 0.4),
                      rotation=turn), m['role']('Rim', 'joint'), f'arm.{sfx}')
        add(kit.torus(f'Cuff.{sfx}', pw['arm_r'] * 1.35, 0.0035, seg=(16, 5), location=s.lerp(p, 0.85),
                      rotation=turn), m['bezel'], f'arm.{sfx}')
        for k, dx in enumerate((-0.007, 0, 0.007)):
            add(kit.superellipsoid(f'Knuckle.{sfx}{k}', (0.0055, 0.006, 0.006), 0.8, 0.9, seg=(8, 6),
                                   location=(p.x + dx, p.y - 0.013, p.z + 0.004)), m['bezel'], f'arm.{sfx}')

    # Dirt: a heap of chunky lumps by his paws, on its own bone (nothing until he digs).
    for k, (x, y, z, r) in enumerate(((0, -0.15, 0.02, 0.02), (-0.03, -0.14, 0.014, 0.014),
                                       (0.03, -0.145, 0.016, 0.015), (0.012, -0.17, 0.011, 0.011),
                                       (-0.018, -0.168, 0.01, 0.01))):
        add(kit.superellipsoid(f'Dirt.{k}', (r, r, r * 0.8), 0.6, 0.7, seg=(10, 6), location=(x, y, z)),
            m['role']('Dirt', 'joint'), 'dirt')
