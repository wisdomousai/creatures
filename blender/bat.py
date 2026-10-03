"""Ping, the crew's robot bat: a small round toy that lives on the ceiling. A ball of a body
in rows of soft shingle plates, a ball of a head with a screen face, a tiny pair of fangs
over a dark mouth slot and a chin that drops for a yawn, and two big dish ears, satellite
dishes with a glowing feed bulb and three concentric rings of lights: the rings are what
lights up in sequence, outward from the middle, when Ping sends out a ping.

His wings are jointed fans: a shoulder, an arm to the wrist, and three finger struts in two
segments each that fan out from the wrist, with a membrane panel between each pair (skinned
to both struts, so it stretches as they spread and folds up tight like an umbrella as they
close) and a last panel from the outer strut to his side. The model is built with the wings
spread wide (the pose he flies in), facing the viewer flat on; the site folds them. Two hook
feet, each with a pad and three claws, hold the frame line.

He is built the right way up, standing on his hooks (z is up from them); the top edge turns
him over. His head sits on a neck bone at its own centre, so it can turn right round to show
the face upright while he hangs. Faces -Y like the rest of the crew; about 0.56 m from hooks
to ear tips, about 1.2 m across the wings.
"""

import math

from mathutils import Matrix, Vector

import kit
import looks

FACE = 'bat'
PREVIEW = dict(lift=0.57, width=0.5, hangs=True)

D = {
    'body': dict(radii=(0.125, 0.11, 0.12), center=(0, 0.005, 0.235), e=0.8),
    # Rows of shingles on the body: (z, how many round it); each tilts its free edge up
    # and out, toward the head, the way the fur of a hanging bat lies.
    'shingles': dict(rows=[(0.155, 9), (0.205, 10), (0.255, 10), (0.30, 8)], radii=(0.034, 0.011, 0.03), tilt=0.5),
    'head': dict(radii=(0.108, 0.092, 0.088), center=(0, -0.005, 0.46), e=0.75),
    # 8:5, like the bat's face layout (512 x 320).
    'screen': dict(radii=(0.084, 0.03, 0.0525), center=(0, -0.078, 0.467), bezel=0.006),
    'mouth': dict(radii=(0.036, 0.012, 0.011), center=(0, -0.078, 0.392), fang_x=0.017, fang=0.024),
    'jaw': dict(radii=(0.034, 0.012, 0.0075), center=(0, -0.073, 0.375), pivot=(0, -0.055, 0.392)),
    'bolts': dict(x=0.098, y=-0.028, z=0.43, r=0.011),
    # The dish ears: base on the head's side, dish centre, dish radius and depth, how much
    # taller than wide, and how far its tall side leans out.
    'ear': dict(base=(0.088, 0.0, 0.495), at=(0.155, -0.02, 0.53), R=0.068, depth=0.034, tall=1.45, lean=0.42,
                aim=(0.5, -0.75, 0.3), rings=(0.36, 0.66)),
    'shoulder': (0.105, 0.05, 0.315),
    'wrist': (0.27, 0.05, 0.40),
    # Fingers from the wrist: angle from horizontal (degrees, up is +), length, and where
    # the joint sits along them.
    'fingers': [(44, 0.30, 0.55), (7, 0.335, 0.55), (-33, 0.30, 0.55)],
    'hem': dict(top=(0.115, 0.05, 0.285), bottom=(0.095, 0.05, 0.135)),
    'scallop': 0.2,
    'arm_r': 0.011,
    'strut_r': 0.0085,
    'thick': 0.006,
    'hip': (0.05, 0.0, 0.125),
    'foot': (0.052, -0.008, 0.088),
    'leg_r': 0.013,
}
# Everything is modelled with the hooks 0.05 above the line and then lowered by this, so the
# legs are short and the claws reach past the line.
SHIFT = 0.05
LEFT, RIGHT = (1, 'L'), (-1, 'R')


def mirror(p, side):
    return side * p[0], p[1], p[2]


def lerp(a, b, t):
    return tuple(u + (v - u) * t for u, v in zip(a, b))


def finger_points(k):
    """Wrist, joint and tip of finger k (left wing), in the wing's plane."""
    ang, length, split = D['fingers'][k]
    wx, wy, wz = D['wrist']
    a = math.radians(ang)
    d = (math.cos(a), 0.0, math.sin(a))

    def pt(s):
        return (wx + d[0] * length * s, wy, wz + d[2] * length * s)

    return (wx, wy, wz), pt(split), pt(1.0)


def rig_bones():
    S, W = D['shoulder'], D['wrist']
    e = D['ear']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.005, 0.15), (0, 0.005, 0.33), 'root'),
        # The neck turns the whole head about its own middle (upright for the viewer while
        # he hangs); the head turns on it to look about.
        ('neck', (0, -0.005, 0.46), (0, -0.005, 0.53), 'body'),
        ('head', (0, -0.005, 0.46), (0, -0.005, 0.53), 'neck'),
        ('jaw', D['jaw']['pivot'], (0, -0.075, 0.375), 'head'),
    ]
    for side, sfx in (LEFT, RIGHT):
        bones.append((f'ear.{sfx}', mirror(e['base'], side), mirror(e['at'], side), 'head'))
        bones.append((f'sh.{sfx}', mirror(S, side), mirror(lerp(S, W, 0.3), side), 'body'))
        bones.append((f'arm.{sfx}', mirror(S, side), mirror(W, side), f'sh.{sfx}'))
        for k in range(3):
            w, j, t = finger_points(k)
            bones.append((f'f{k + 1}a.{sfx}', mirror(w, side), mirror(j, side), f'arm.{sfx}'))
            bones.append((f'f{k + 1}b.{sfx}', mirror(j, side), mirror(t, side), f'f{k + 1}a.{sfx}'))
        bones.append((f'leg.{sfx}', mirror(D['hip'], side), mirror(D['foot'], side), 'root'))
    down = lambda p: (p[0], p[1], p[2] - SHIFT)
    return [(n, down(h), down(t), par) for n, h, t, par in bones]


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def slab(name, grid, thick, rows, cols):
    """A thin closed slab from a grid of points (rows x cols) in the wing's plane, with
    thick either side of it in y. Returns the object and, per vertex, (row, col)."""
    verts, tags = [], []
    for s in (-1, 1):
        for r in range(rows):
            for c in range(cols):
                p = grid[r][c]
                verts.append((p[0], p[1] + s * thick / 2, p[2]))
                tags.append((r, c))
    n = rows * cols
    faces = []
    for r in range(rows - 1):
        for c in range(cols - 1):
            a, b, c2, d = r * cols + c, r * cols + c + 1, (r + 1) * cols + c + 1, (r + 1) * cols + c
            faces.append((a, b, c2, d))
            faces.append((n + d, n + c2, n + b, n + a))
    # Sides: the four edges of the grid.
    edge = [(r, 0) for r in range(rows)] + [(rows - 1, c) for c in range(1, cols)] + \
           [(r, cols - 1) for r in range(rows - 2, -1, -1)] + [(0, c) for c in range(cols - 2, 0, -1)]
    for i, (r, c) in enumerate(edge):
        r2, c2 = edge[(i + 1) % len(edge)]
        a, b = r * cols + c, r2 * cols + c2
        faces.append((a, n + a, n + b, b))
    obj = kit.mesh_object(name, verts, faces)
    assert len(obj.data.vertices) == len(verts), 'slab vertices merged'
    return obj, tags


def membrane(name, A, B, wA, wB, side, rows=9, cols=13):
    """A membrane panel between two struts. A and B are (start, end) lines in the wing's
    plane; the free edge between their ends is scalloped inward. wA(v) and wB(v) give the
    bone weights of each strut at a fraction v along it. Returns the object and weights."""
    dep = D['scallop']
    grid = []
    for r in range(rows):
        v0 = 0.05 + 0.95 * r / (rows - 1)
        row = []
        for c in range(cols):
            u = c / (cols - 1)
            v = v0 * (1 - dep * math.sin(math.pi * u) * smooth((v0 - 0.7) / 0.3))
            pa = Vector(lerp(A[0], A[1], v))
            pb = Vector(lerp(B[0], B[1], v))
            p = pa.lerp(pb, u)
            row.append((side * p.x, p.y, p.z))
        grid.append(row)
    obj, tags = slab(name, grid, D['thick'], rows, cols)
    weights = {}
    for i, (r, c) in enumerate(tags):
        u = c / (cols - 1)
        v = 0.05 + 0.95 * r / (rows - 1)
        for wf, k in ((wA, 1 - u), (wB, u)):
            for bone, w in wf(v).items():
                weights.setdefault(bone, [0.0] * len(tags))
                weights[bone][i] += w * k
    return obj, weights


def body_point(z, th):
    b = D['body']
    rx, ry, rz = b['radii']
    s = max(-0.999, min(0.999, (z - b['center'][2]) / rz))
    sin_phi = kit.spow(s, 1 / b['e'])
    cp = kit.spow(math.sqrt(1 - sin_phi ** 2), b['e'])
    return Vector((rx * cp * kit.spow(math.cos(th), b['e']),
                   b['center'][1] + ry * cp * kit.spow(math.sin(th), b['e']), z))


def body_normal(z, th, h=1e-3):
    n = (body_point(z, th + h) - body_point(z, th - h)).cross(body_point(z + h, th) - body_point(z - h, th))
    n.normalize()
    q = body_point(z, th) - Vector((0, D['body']['center'][1], z))
    return n if n.dot(q) > 0 else -n


def faceted(name, points, radii, sides, twist=0.0):
    """A faceted spike through the points, open at the base."""
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


def dish_profile(R, depth, t):
    """(radius, z) rows of a shallow bowl opening toward +z: the inner surface from its
    centre out to the rim, round the lip, then the outer surface back to the middle."""
    inner = [(0.0, -depth)] + [(R * f, -depth * (1 - f * f)) for f in (0.25, 0.5, 0.75, 0.93)]
    lip = [(R, 0.0), (R + t * 0.5, -t * 0.6)]
    outer = [(R * f, -depth * (1 - f * f) - t * (1.1 + 0.5 * f)) for f in (0.85, 0.6, 0.3)]
    return inner + lip + outer + [(0.0, -depth - t * 1.2)]


def aim_matrix(aim, lean):
    """Turn a dish (axis +z, tall along +y) to face `aim`, its tall side leaning out."""
    q = Vector(aim).to_track_quat('Z', 'Y')
    return q.to_matrix().to_4x4() @ Matrix.Rotation(lean, 4, 'Z')


def place(obj, mat, loc):
    """Turn a part (built at the origin, or a little off it) by mat, then move it to loc."""
    kit.apply_transforms(obj)
    obj.data.transform(mat)
    obj.location = loc
    kit.apply_transforms(obj)
    return obj


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.apply_transforms(obj)
        obj.data.transform(Matrix.Translation((0, 0, -SHIFT)))
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Body and its shingles.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(40, 32), location=b['center']), m['shell'], 'body')
    sh = D['shingles']
    for z, n in sh['rows']:
        for i in range(n):
            th = 2 * math.pi * (i + (0.5 if z in (0.205, 0.30) else 0)) / n
            p = body_point(z, th)
            # Leave the shoulders clear, where the wings join.
            if abs(p.x) > 0.085 and z > 0.27:
                continue
            nrm = body_normal(z, th)
            up = (Vector((0, 0, 1)) - nrm * nrm.z).normalized()
            x = nrm.cross(up)
            rot = Matrix((x, nrm, up)).transposed().to_4x4() @ Matrix.Rotation(-sh['tilt'], 4, 'X')
            obj = kit.superellipsoid(f'Shingle.{z}.{i}', sh['radii'], 0.55, 0.6, seg=(12, 8))
            place(obj, rot, p + nrm * 0.004)
            add(obj, m['role']('Fluff', 'shell'), 'body')
            # A slightly larger, flatter plate under it shows as a rim round the edge.
            rimp = kit.superellipsoid(f'ShingleRim.{z}.{i}', tuple(r * k for r, k in zip(sh['radii'], (1.16, 0.7, 1.14))),
                                      0.55, 0.6, seg=(12, 8))
            place(rimp, rot, p + nrm * 0.0015)
            add(rimp, m['joint'], 'body')

    # A belly plate on the front with bolts, a seam ring between body and head, a tiny
    # tail membrane between the feet on the back.
    add(kit.superellipsoid('Belly', (0.05, 0.012, 0.062), 0.5, 0.5, seg=(20, 12), location=(0, -0.108, 0.235)),
        m['bezel'], 'body')
    for k, (bx, bz) in enumerate(((-0.03, 0.19), (0.03, 0.19), (-0.03, 0.28), (0.03, 0.28))):
        add(kit.superellipsoid(f'BellyBolt.{k}', (0.0065, 0.005, 0.0065), seg=(10, 6), location=(bx, -0.119, bz)),
            m['joint'], 'body')
    add(kit.torus('NeckSeam', 0.064, 0.0085, seg=(32, 6), location=(0, 0, 0.372)), m['joint'], 'body')
    add(kit.superellipsoid('TailWeb', (0.052, 0.006, 0.04), 0.6, 0.6, seg=(16, 8), location=(0, 0.1, 0.145)),
        m['role']('Membrane', 'shell'), 'body')
    add(kit.superellipsoid('TailWebEdge', (0.056, 0.004, 0.006), 0.6, 0.6, seg=(16, 6), location=(0, 0.103, 0.107)),
        m['joint'], 'body')

    # Head, screen, mouth slot with fangs, chin.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(40, 32), location=h['center']), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Bat', sc['radii'], sc['center'], sc['bezel'], e=0.45)
    add(glass, m['face'], 'head')
    add(rim, m['joint'], 'head')
    mo = D['mouth']
    add(kit.superellipsoid('Mouth', mo['radii'], 0.5, 0.5, seg=(20, 12), location=mo['center']),
        m['role']('Mouth', 'bezel'), 'head')
    mx, my, mz = mo['center']
    for side in (1, -1):
        x = side * mo['fang_x']
        add(faceted(f'Fang.{side}', [(x, my - 0.004, mz + 0.004), (x, my - 0.007, mz - mo['fang'])], [0.0065, 0], 5),
            m['role']('Tooth', 'shell'), 'head')
    jw = D['jaw']
    add(kit.superellipsoid('Jaw', jw['radii'], 0.5, 0.5, seg=(20, 12), location=jw['center']),
        m['role']('Chin', 'joint'), 'jaw')
    bo = D['bolts']
    for side in (1, -1):
        add(kit.tube(f'Bolt.{side}', [(side * bo['x'], bo['y'], bo['z']), (side * (bo['x'] + 0.012), bo['y'], bo['z'])],
                     bo['r'], ring=6)[0], m['joint'], 'head')

    # Dish ears: bowl, rim ring, feed bulb, two light rings, and the stalk to the head.
    e = D['ear']
    for side, sfx in (LEFT, RIGHT):
        aim = (side * e['aim'][0], e['aim'][1], e['aim'][2])
        mat = aim_matrix(aim, -side * e['lean']) @ Matrix.Diagonal((1, e['tall'], 1, 1))
        loc = mirror(e['at'], side)
        R, dp = e['R'], e['depth']
        bowl = kit.lathe(f'Dish.{sfx}', dish_profile(R, dp, 0.007), seg=32)
        add(place(bowl, mat, loc), m['role']('Dish', 'shell'), f'ear.{sfx}')
        # Lights: Dot0 the feed bulb at the middle, Dot1 and Dot2 rings, Dot3 the rim.
        lift = 0.0035
        bulb = kit.superellipsoid(f'Feed.{sfx}', (0.012, 0.012, 0.012), seg=(14, 10), location=(0, 0, 0.022))
        add(place(bulb, mat, loc), m['dot'](0), f'ear.{sfx}')
        # Three struts from the rim hold the feed out over the dish, and a rivet every
        # so often round the rim.
        for k in range(3):
            a = 2 * math.pi * (k + 0.25) / 3
            strut = kit.tube(f'DishStrut.{sfx}{k}', [(R * math.cos(a), R * math.sin(a), 0.0), (0.004 * math.cos(a), 0.004 * math.sin(a), 0.016)],
                             0.0024, ring=6)[0]
            add(place(strut, mat, loc), m['joint'], f'ear.{sfx}')
        for k in range(10):
            a = 2 * math.pi * (k + 0.5) / 10
            rv = kit.superellipsoid(f'DishRivet.{sfx}{k}', (0.0042, 0.0042, 0.0034), seg=(8, 6),
                                    location=((R - 0.006) * math.cos(a), (R - 0.006) * math.sin(a), -0.0025))
            add(place(rv, mat, loc), m['bezel'], f'ear.{sfx}')
        for i, f in enumerate(e['rings']):
            ring = kit.torus(f'Ring{i + 1}.{sfx}', R * f, 0.0032, seg=(36, 6),
                             location=(0, 0, -dp * (1 - f * f) + lift))
            add(place(ring, mat, loc), m['dot'](i + 1), f'ear.{sfx}')
        rim_r = kit.torus(f'Rim.{sfx}', R + 0.001, 0.0034, seg=(36, 6), location=(0, 0, -0.0012))
        add(place(rim_r, mat, loc), m['dot'](3), f'ear.{sfx}')
        # The stalk from the head to the dish's back.
        back = Vector(loc) - Vector(aim).normalized() * (dp + 0.012)
        add(kit.tube(f'Stalk.{sfx}', [mirror(e['base'], side), tuple(back)], 0.011, ring=10)[0], m['joint'],
            f'ear.{sfx}')
        add(kit.superellipsoid(f'Ear.{sfx}.Ball', (0.02, 0.02, 0.02), seg=(16, 10), location=mirror(e['base'], side)),
            m['joint'], 'head')

    # Wings.
    S, W = D['shoulder'], D['wrist']
    fingers = [finger_points(k) for k in range(3)]
    for side, sfx in (LEFT, RIGHT):
        s_, w_ = mirror(S, side), mirror(W, side)
        add(kit.superellipsoid(f'Shoulder.{sfx}', (0.024, 0.024, 0.024), seg=(16, 10), location=s_), m['joint'],
            f'sh.{sfx}')
        add(kit.tube(f'Arm.{sfx}', [s_, w_], D['arm_r'], ring=10)[0], m['joint'], f'arm.{sfx}')
        add(kit.superellipsoid(f'Wrist.{sfx}', (0.019, 0.019, 0.019), seg=(16, 10), location=w_), m['bezel'],
            f'arm.{sfx}')
        wx, wy, wz = w_
        add(faceted(f'Thumb.{sfx}', [(wx, wy - 0.006, wz + 0.01), (wx + side * 0.006, wy - 0.02, wz + 0.038), (wx + side * 0.012, wy - 0.03, wz + 0.058)],
                    [0.0085, 0.0055, 0], 5), m['role']('Tooth', 'shell'), f'arm.{sfx}')
        add(kit.superellipsoid(f'WristCap.{sfx}', (0.011, 0.011, 0.011), seg=(10, 6), location=(wx, wy - 0.014, wz)),
            m['joint'], f'arm.{sfx}')
        for k, (w, j, t) in enumerate(fingers):
            a, bn = f'f{k + 1}a.{sfx}', f'f{k + 1}b.{sfx}'
            add(kit.tube(f'Strut.{sfx}{k}a', [mirror(w, side), mirror(j, side)], D['strut_r'], ring=8)[0],
                m['joint'], a)
            add(kit.tube(f'Strut.{sfx}{k}b', [mirror(j, side), mirror(t, side)],
                         [D['strut_r'], D['strut_r'] * 0.7], ring=8)[0], m['joint'], bn)
            add(kit.superellipsoid(f'Knuckle.{sfx}{k}', (0.0125, 0.0125, 0.0125), seg=(12, 8),
                                   location=mirror(j, side)), m['bezel'], a)
            add(kit.superellipsoid(f'Tip.{sfx}{k}', (0.0105, 0.0105, 0.0105), seg=(12, 8), location=mirror(t, side)),
                m['joint'], bn)

        def trim(name, A, B, wA, wB, side):
            """A hem line along a membrane's scalloped free edge, weighted like it."""
            n = 15
            pts = []
            for i in range(n):
                u = i / (n - 1)
                v = 1 - D['scallop'] * math.sin(math.pi * u)
                pt = Vector(lerp(A[0], A[1], v)).lerp(Vector(lerp(B[0], B[1], v)), u)
                pts.append((side * pt.x, pt.y - 0.004, pt.z))
            tb, ts_ = kit.tube(name, pts, 0.0036, ring=6)
            wts = {}
            for i, u in enumerate(ts_):
                for wf, kk in ((wA, 1 - u), (wB, u)):
                    for bone, w in wf(1.0).items():
                        wts.setdefault(bone, [0.0] * len(ts_))
                        wts[bone][i] += w * kk
            add(tb, m['joint'], None)
            skin[-1] = (tb, wts)

        def chain(k, sfx=sfx):
            split = D['fingers'][k][2]
            return lambda v: {f'f{k + 1}a.{sfx}': 1 - smooth((v - split + 0.12) / 0.24),
                              f'f{k + 1}b.{sfx}': smooth((v - split + 0.12) / 0.24)}

        def line(k):
            return fingers[k][0], fingers[k][2]

        for k in range(2):
            obj, wt = membrane(f'Membrane.{sfx}{k}', line(k), line(k + 1), chain(k), chain(k + 1), side)
            add(obj, m['role']('Membrane', 'shell'), None)
            skin[-1] = (obj, wt)
            trim(f'Hem.{sfx}{k}', line(k), line(k + 1), chain(k), chain(k + 1), side)
        hem = (D['hem']['top'], D['hem']['bottom'])
        obj, wt = membrane(f'Membrane.{sfx}2', line(2), hem, chain(2), lambda v: {'body': 1.0}, side)
        add(obj, m['role']('Membrane', 'shell'), None)
        skin[-1] = (obj, wt)
        trim(f'Hem.{sfx}2', line(2), hem, chain(2), lambda v: {'body': 1.0}, side)

    # Legs and hook feet.
    for side, sfx in (LEFT, RIGHT):
        hip, foot = mirror(D['hip'], side), mirror(D['foot'], side)
        add(kit.tube(f'Leg.{sfx}', [hip, foot], D['leg_r'], ring=10)[0], m['joint'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Hip.{sfx}', (0.02, 0.02, 0.02), seg=(14, 10), location=hip), m['joint'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Foot.{sfx}', (0.024, 0.022, 0.014), 0.5, 0.6, seg=(16, 10), location=foot),
            m['shell'], f'leg.{sfx}')
        add(kit.torus(f'Ankle.{sfx}', 0.0175, 0.0055, seg=(20, 6), location=tuple(lerp(hip, foot, 0.72))), m['bezel'],
            f'leg.{sfx}')
        x, y, z = foot
        add(kit.superellipsoid(f'Heel.{sfx}', (0.008, 0.008, 0.008), seg=(8, 6), location=(x, y + 0.02, z + 0.004)),
            m['joint'], f'leg.{sfx}')
        for k, dx in enumerate((-0.014, 0, 0.014)):
            pts = [(x + dx, y - 0.004, z - 0.008), (x + dx, y + 0.012, z - 0.034), (x + dx, y + 0.036, z - 0.05)]
            add(kit.tube(f'Claw.{sfx}{k}', kit.spline(pts, 8), [0.0075 - 0.005 * i / 7 for i in range(8)], ring=6)[0],
                m['joint'], f'leg.{sfx}')

    return looks.finish(kit.armature('BatRig', rig_bones()), parts, skin, m)
