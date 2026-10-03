"""Waddles, the crew's fat robot cat: a big round pear of a body that nearly sits on the
floor, a small head perched on the front of it with a double chin, small pointed ears,
little stub legs on white socks, and a thick tail with a rounded tip. A round belly plate
with a rim of screws holds the belly-button light (the beacon), and the coat is a
tuxedo's in the colour look: white belly, muzzle pods and socks. Faces -Y like the rest
of the crew; about 0.69 m to the ear tips.

Refined: a seamed double chin over a too-tight collar with a tag, ear rims and grilles,
whisker studs, cushion seams and a bolted hatch over the back, sock cuffs with toe
grooves and rubber soles, and a ringed tail with a capped tip.
"""

import math

import kit
import looks
from mathutils import Matrix, Vector

FACE = 'fatcat'
PREVIEW = dict(lift=0.0, width=0.65)

D = {
    'body': dict(radii=(0.27, 0.27, 0.235), center=(0, 0.05, 0.272), e=0.82),
    'belly': dict(radii=(0.155, 0.135, 0.02), center=(0, -0.213, 0.245), rim=0.011),
    'button': dict(r=0.022, center=(0, -0.24, 0.245)),
    'head': dict(radii=(0.165, 0.13, 0.12), center=(0, -0.235, 0.545), e=0.7),
    'screen': dict(radii=(0.128, 0.075, 0.08), center=(0, -0.32, 0.55), bezel=0.009),
    'cheek': dict(radii=(0.05, 0.05, 0.044), center=(0.118, -0.285, 0.495)),
    'chin': dict(radii=(0.085, 0.06, 0.04), center=(0, -0.27, 0.448)),
    'ear': dict(x=0.1, z=0.635, tilt=0.3, profile=[(0.0, 0.105), (0.03, 0.09), (0.06, 0.04), (0.08, 0.0)]),
    'leg': dict(x=0.14, front=-0.13, back=0.22, top=0.12, bottom=0.035, r=0.048),
    'paw': dict(radii=(0.058, 0.066, 0.035), e=0.45),
    'tail': [(0, 0.28, 0.23), (0, 0.38, 0.21), (0, 0.44, 0.27), (0, 0.44, 0.35), (0, 0.41, 0.41)],
    'tail_r': (0.058, 0.05),
    'vent': dict(radii=(0.08, 0.01, 0.013), center=(0, 0.312, 0.36), gap=0.036),
}


def section(radii, e, dz):
    """How much of its waist a superellipsoid has left `dz` above its centre (0..1)."""
    s = min(0.999, abs(dz / radii[2]) ** (1.0 / e))
    return (1 - s * s) ** (e / 2)


def band(name, rx, ry, e, minor, z, center=(0, 0), arc=None, seg=(72, 6)):
    """A thin ring hugging a superellipse waist (a seam, a collar); `arc` = (from, to)
    degrees for an open seam, a full ring when None. Returns (object, end points)."""
    nu, nv = seg
    a0, a1 = (0.0, 2 * math.pi) if arc is None else (math.radians(arc[0]), math.radians(arc[1]))
    count = nu if arc is None else nu + 1
    pts = []
    for i in range(count):
        th = a0 + (a1 - a0) * i / nu
        pts.append((center[0] + rx * kit.spow(math.cos(th), e), center[1] + ry * kit.spow(math.sin(th), e)))
    verts, faces = [], []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        px, py = pts[(i + 1) % n if arc is None else min(i + 1, n - 1)]
        qx, qy = pts[(i - 1) % n if arc is None else max(i - 1, 0)]
        tx, ty = px - qx, py - qy
        ln = math.hypot(tx, ty) or 1.0
        nx, ny = ty / ln, -tx / ln
        for j in range(nv):
            b = 2 * math.pi * j / nv
            verts.append((x + nx * minor * math.cos(b), y + ny * minor * math.cos(b), z + minor * math.sin(b)))
    for i in range(n if arc is None else n - 1):
        k = (i + 1) % n
        for j in range(nv):
            faces.append((i * nv + j, k * nv + j, k * nv + (j + 1) % nv, i * nv + (j + 1) % nv))
    return kit.mesh_object(name, verts, faces), (pts[0], pts[-1])


def rig_bones():
    lg, t, e = D['leg'], D['tail'], D['ear']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.28, 0.27), (0, -0.2, 0.3), 'root'),
        ('head', (0, -0.2, 0.42), (0, -0.235, 0.66), 'body'),
        ('ear.L', (e['x'], -0.235, e['z']), (e['x'] + 0.03, -0.235, e['z'] + 0.1), 'head'),
        ('ear.R', (-e['x'], -0.235, e['z']), (-e['x'] - 0.03, -0.235, e['z'] + 0.1), 'head'),
    ]
    pts = kit.spline(t, 4)
    parent = 'body'
    for i in range(3):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        bones.append((f'leg.{name}', (x * lg['x'], y, lg['top']), (x * lg['x'], y, 0.0), 'body'))
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
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(56, 36), location=b['center']), m['shell'], 'body')

    # Belly plate: a big round panel with a rim and a ring of screws, the button light in it.
    bl = D['belly']
    bx, by, bz = bl['center']
    rx, rz = bl['radii'][0], bl['radii'][1]
    add(kit.superellipsoid('Belly', bl['radii'], 0.4, 1.0, seg=(40, 8), location=bl['center'],
                           rotation=(math.pi / 2, 0, 0)), m['role']('Belly'), 'body')
    # The rim: a ring squashed to the plate's ellipse (a torus lies in XY; stand it up).
    rim = kit.torus('BellyRim', 1.0, bl['rim'], seg=(44, 6))
    kit.stretch(rim, rx, rz, 1.0)
    rim.data.transform(__import__('mathutils').Matrix.Rotation(math.pi / 2, 4, 'X'))
    rim.location = (bx, by - 0.008, bz)
    add(rim, m['joint'], 'body')
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        add(kit.superellipsoid(f'Screw.{k}', (0.009, 0.005, 0.009), 0.6, 1.0, seg=(12, 6),
                               location=(bx + rx * 0.84 * math.cos(a), by - 0.024, bz + rz * 0.84 * math.sin(a))),
            m['joint'], 'body')
    bt = D['button']
    add(kit.superellipsoid('Button', (bt['r'], 0.008, bt['r']), 0.6, 1.0, seg=(20, 8), location=bt['center']),
        m['beacon'], 'body')

    # Back: three vent slats.
    v = D['vent']
    for i in (-1, 0, 1):
        add(kit.superellipsoid(f'Vent.{i}', v['radii'], 0.4, 0.4, seg=(20, 8),
                               location=(v['center'][0], v['center'][1], v['center'][2] + i * v['gap'])),
            m['joint'], 'body')

    # Head: small, with round cheek pods, a double chin, a screen for a face, small ears.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(48, 32), location=h['center']), m['shell'], 'head')
    sc = D['screen']
    glass, bez = kit.screen('Fatcat', sc['radii'], sc['center'], sc['bezel'], e=0.5)
    add(glass, m['face'], 'head')
    add(bez, m['bezel'], 'head')
    ck = D['cheek']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Cheek.{sfx}', ck['radii'], 0.8, 0.8, seg=(24, 16),
                               location=(side * ck['center'][0], ck['center'][1], ck['center'][2])),
            m['role']('Muzzle'), 'head')
    ch = D['chin']
    add(kit.superellipsoid('Chin', ch['radii'], 0.7, 0.7, seg=(28, 16), location=ch['center']),
        m['role']('Muzzle'), 'head')
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ear = kit.stretch(kit.lathe(f'Ear.{sfx}', e['profile'], seg=24), sy=0.45)
        ear.location = (side * e['x'], -0.235, e['z'] - 0.03)
        ear.rotation_euler = (0, side * e['tilt'], 0)
        add(ear, m['shell'], f'ear.{sfx}')
        inner = kit.stretch(kit.lathe(f'InnerEar.{sfx}', [(r * 0.6, z * 0.7 + 0.012) for r, z in e['profile']],
                                      seg=24), sy=0.2)
        inner.location = (side * e['x'], -0.257, e['z'] - 0.03)
        inner.rotation_euler = (0, side * e['tilt'], 0)
        add(inner, m['joint'], f'ear.{sfx}')

    # Stub legs on white socks (the paws).
    lg, pw = D['leg'], D['paw']
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        leg, _ = kit.tube(f'Leg.{name}', [(x * lg['x'], y, lg['top']), (x * lg['x'], y, lg['bottom'])], lg['r'],
                          ring=14)
        add(leg, m['shell'], f'leg.{name}')
        add(kit.superellipsoid(f'Paw.{name}', pw['radii'], pw['e'], 0.6, seg=(28, 26),
                               location=(x * lg['x'], y - 0.012, pw['radii'][2])), m['role']('Sock', 'joint'),
            f'leg.{name}')

    pts = kit.spline(D['tail'], 24)
    r0, r1 = D['tail_r']
    tail, ts = kit.tube('Tail', pts, [r0 + (r1 - r0) * i / (len(pts) - 1) for i in range(len(pts))], ring=14)
    add(tail, m['shell'], kit.chain(ts, ['tail.1', 'tail.2', 'tail.3']))

    # Head: seamed double chin over a collar that is a little too tight, with a tag.
    def face_band(name, mat, dims, minor, z, grow):
        sc_ = section(dims['radii'], dims['e'], z - dims['center'][2]) * grow
        obj, _ = band(name, dims['radii'][0] * sc_, dims['radii'][1] * sc_, dims['e'], minor, z,
                      (dims['center'][0], dims['center'][1]))
        add(obj, mat, 'head')

    face_band('Collar', m['joint'], h, 0.011, 0.452, 1.05)
    face_band('CollarEdge', m['bezel'], h, 0.004, 0.437, 1.03)
    add(kit.torus('TagLoop', 0.011, 0.0025, seg=(20, 6), location=(0, -0.295, 0.42), rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'head')
    add(kit.superellipsoid('Tag', (0.027, 0.006, 0.027), 0.5, 1.0, seg=(24, 8), location=(0, -0.303, 0.385)),
        m['bezel'], 'head')
    add(kit.superellipsoid('TagDot', (0.008, 0.003, 0.008), 0.6, 1.0, seg=(12, 6), location=(0, -0.31, 0.385)),
        m['joint'], 'head')
    # Second chin, tucked under the first with a seam between.
    add(kit.superellipsoid('Chin2', (0.074, 0.054, 0.028), 0.7, 0.7, seg=(24, 12), location=(0, -0.268, 0.428)),
        m['role']('Muzzle'), 'head')
    obj, _ = band('ChinSeam', 0.083, 0.06, 0.7, 0.0035, 0.452, (0, -0.27))
    add(obj, m['joint'], 'head')

    # Screen bezel: a screw in each corner; a bolt on each side of the head.
    for sx in (1, -1):
        for sz in (1, -1):
            add(kit.superellipsoid(f'BezelScrew.{sx}.{sz}', (0.006, 0.004, 0.006), 0.6, 1.0, seg=(12, 6),
                                   location=(sx * 0.126, -0.305, 0.55 + sz * 0.069)), m['joint'], 'head')
    ck_ = D['cheek']
    for sx, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'HeadBolt.{sfx}', (0.005, 0.012, 0.012), 0.6, 1.0, seg=(14, 6),
                               location=(sx * 0.16, -0.235, 0.53)), m['joint'], 'head')
        # Muzzle pods carry three whisker studs.
        for k, dz in enumerate((-0.015, 0.0, 0.015)):
            add(kit.superellipsoid(f'Whisker.{sfx}.{k}', (0.005, 0.005, 0.005), 0.7, 0.7, seg=(10, 6),
                                   location=(sx * (ck_['center'][0] + 0.026 + 0.004 * abs(k - 1)),
                                             ck_['center'][1] - 0.04, ck_['center'][2] + dz * 1.2)),
                m['joint'], 'head')
    # Ears: a darker rim behind and a three-slat grille in front.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        rim = kit.stretch(kit.lathe(f'EarRim.{sfx}', [(r * 1.05, z * 1.02) for r, z in e['profile']], seg=24),
                          sy=0.4)
        rim.location = (side * e['x'], -0.226, e['z'] - 0.03)
        rim.rotation_euler = (0, side * e['tilt'], 0)
        add(rim, m['joint'], f'ear.{sfx}')
        for k, dz in enumerate((0.022, 0.038, 0.054)):
            w = 0.03 - 0.008 * k
            off = Matrix.Rotation(side * e['tilt'], 3, 'Y') @ Vector((0, -0.03, dz))
            add(kit.superellipsoid(f'Grille.{sfx}.{k}', (w, 0.003, 0.0035), 0.6, 0.6, seg=(12, 6),
                                   location=(side * e['x'] + off.x, -0.235 + off.y, e['z'] - 0.03 + off.z),
                                   rotation=(0, side * e['tilt'], 0)), m['shell'], f'ear.{sfx}')

    # Body: cushion seams over the back (a spine and two half-hoops) with rivets at the ends.
    def rivet(nm, x, y, z):
        add(kit.superellipsoid(nm, (0.008, 0.008, 0.008), 0.7, 0.7, seg=(12, 8), location=(x, y, z)),
            m['joint'], 'body')

    bo = D['body']
    for tag, z, arc in (('Top', 0.43, (-15, 195)), ('Low', 0.15, (-35, 215))):
        sc_ = section(bo['radii'], bo['e'], z - bo['center'][2]) * 1.012
        obj, ends = band(f'Hoop{tag}', bo['radii'][0] * sc_, bo['radii'][1] * sc_, bo['e'], 0.0042, z,
                         (bo['center'][0], bo['center'][1]), arc=arc, seg=(60, 6))
        add(obj, m['joint'], 'body')
        for k, (ex, ey) in enumerate(ends):
            rivet(f'HoopRivet.{tag}.{k}', ex, ey, z)
    # Spine seam: over the back from low at the rear to just behind the head.
    spine = []
    for i in range(22):
        phi = 0.3 + (1.5 - 0.3) * i / 12 if i <= 12 else 1.5 - (i - 12) * 0.05
        yy = bo['center'][1] + bo['radii'][1] * 1.01 * math.cos(phi) ** bo['e'] * (1 if i <= 12 else -1)
        zz = bo['center'][2] + bo['radii'][2] * 1.01 * math.sin(phi) ** bo['e']
        spine.append((0, yy, zz))
    spn, _ = kit.tube('Spine', spine, 0.0042, ring=6)
    add(spn, m['joint'], 'body')

    # A bolted hatch on the back, a little handle on it.
    def top_z(y):
        c = ((y - bo['center'][1]) / bo['radii'][1]) ** (1 / bo['e'])
        return bo['center'][2] + bo['radii'][2] * (1 - c * c) ** (bo['e'] / 2)

    hy = 0.15
    hz = top_z(hy)
    ang = math.atan((top_z(hy + 0.02) - hz) / 0.02)
    rot = Matrix.Rotation(ang, 3, 'X')
    hc = Vector((0, hy, hz))
    add(kit.superellipsoid('Hatch', (0.07, 0.052, 0.01), 0.35, 0.35, seg=(28, 10),
                           location=hc - Vector((0, 0, 0.003)), rotation=(ang, 0, 0)), m['joint'], 'body')
    for sx in (1, -1):
        for sy in (1, -1):
            o = rot @ Vector((sx * 0.052, sy * 0.036, 0.009))
            add(kit.superellipsoid(f'HatchBolt.{sx}.{sy}', (0.007, 0.007, 0.005), 0.6, 1.0, seg=(12, 6),
                                   location=hc + o, rotation=(ang, 0, 0)), m['bezel'], 'body')
    o = rot @ Vector((0, 0, 0.014))
    add(kit.superellipsoid('HatchHandle', (0.03, 0.007, 0.006), 0.5, 0.6, seg=(16, 8), location=hc + o,
                           rotation=(ang, 0, 0)), m['bezel'], 'body')
    # Hip plates on the flanks.
    for sx, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Hip.{sfx}', (0.05, 0.05, 0.008), 0.4, 1.0, seg=(28, 8),
                               location=(sx * 0.258, 0.11, 0.2), rotation=(0, math.pi / 2, 0)), m['joint'], 'body')
        add(kit.superellipsoid(f'HipBolt.{sfx}', (0.014, 0.014, 0.008), 0.6, 1.0, seg=(12, 6),
                               location=(sx * 0.268, 0.11, 0.2), rotation=(0, math.pi / 2, 0)), m['bezel'], 'body')
    # The button gets its own bezel ring.
    add(kit.torus('ButtonRing', 0.034, 0.005, seg=(32, 6), location=(0, -0.235, 0.245),
                  rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')

    # Socks: cuff rings, toe grooves and rubber soles.
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        add(kit.torus(f'Cuff.{name}', 0.05, 0.011, seg=(28, 6), location=(x * lg['x'], y, 0.08)),
            m['role']('Sock', 'joint'), f'leg.{name}')
        for k, dx in enumerate((-0.02, 0.0, 0.02)):
            add(kit.superellipsoid(f'Toe.{name}.{k}', (0.0035, 0.024, 0.0035), 0.6, 0.6, seg=(8, 6),
                                   location=(x * lg['x'] + dx, y - 0.012 - 0.038, 0.058)), m['joint'], f'leg.{name}')
        add(kit.superellipsoid(f'Sole.{name}', (0.052, 0.06, 0.009), 0.4, 0.4, seg=(24, 8),
                               location=(x * lg['x'], y - 0.012, 0.007)), m['joint'], f'leg.{name}')

    # Tail: rings along it, a capped tip.
    r0, r1 = D['tail_r']
    for i in (7, 12, 17):
        f = i / (len(pts) - 1)
        tan = Vector(pts[i + 1]) - Vector(pts[i - 1])
        eul = tan.to_track_quat('Z', 'Y').to_euler()
        add(kit.torus(f'TailRing.{i}', r0 + (r1 - r0) * f + 0.001, 0.0085, seg=(24, 6), location=pts[i],
                      rotation=(eul.x, eul.y, eul.z)), m['joint'],
            'tail.1' if f < 0.34 else 'tail.2' if f < 0.68 else 'tail.3')
    tip = Vector(pts[-1])
    tan = (Vector(pts[-1]) - Vector(pts[-3])).normalized()
    add(kit.superellipsoid('TailCap', (0.054, 0.054, 0.054), 0.9, 0.9, seg=(24, 16), location=tip - tan * 0.02),
        m['role']('Tip', 'joint'), 'tail.3')

    return looks.finish(kit.armature('FatcatRig', rig_bones()), parts, skin, m)
