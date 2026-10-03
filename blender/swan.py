"""Grace, the crew's robot swan: a plump boat of a body made of smooth layered plates,
the long S-curved neck as a chain of five segments (each hinge wearing a cuff), a small
screen-faced head with a beak plate and a black knob, wings of five overlapping feather
plates each on a three-bone arm (folded along her back, they spread, flap and arch up
into the busking display), an upturned tail fan, short legs on big webbed paddle feet,
and a brooch on her chest that lights in the beacon's colour. The tip of every primary
feather has a light. Faces -Y like the rest of the crew; about 0.66 m to the top of her
head.
"""

import math

from mathutils import Matrix, Vector

import kit
import looks

FACE = 'swan'
PREVIEW = dict(lift=0.0, width=0.7)

D = {
    'body': dict(radii=(0.125, 0.235, 0.1), center=(0, 0.03, 0.125), e=0.85, taper=0.06),
    # The neck's centre line (y, z), base to head, and its radius at each end.
    'neck': dict(points=[(0, -0.11, 0.17), (0, -0.185, 0.23), (0, -0.215, 0.33), (0, -0.175, 0.44),
                         (0, -0.15, 0.52), (0, -0.185, 0.575)], r=(0.062, 0.036)),
    'head': dict(radii=(0.054, 0.064, 0.05), center=(0, -0.2, 0.6), tilt=0.14),
    # Head-local (the head's own frame, facing -Y): the screen, a 8:5 visor like the face layout.
    'screen': dict(radii=(0.046, 0.03, 0.029), center=(0, -0.052, 0.012), bezel=0.006),
    'beak': dict(radii=(0.022, 0.07, 0.012), center=(0, -0.115, -0.026)),
    'jaw': dict(radii=(0.017, 0.058, 0.005), center=(0, -0.11, -0.042), pivot=(0, -0.055, -0.038)),
    'knob': dict(radii=(0.012, 0.018, 0.011), center=(0, -0.07, -0.008)),
    # Five feather plates a wing, inner (over the spine) to outer: length, and where they
    # start along the arm. They lie fanned a little and overlap like tiles.
    'wing': dict(shoulder=(0.04, -0.075, 0.215), x0=0.035, dx=0.021, width=0.07,
                 lengths=(0.33, 0.325, 0.3, 0.265, 0.22), fan=(0.0, 0.0, 0.02, 0.05, 0.09)),
    'tail': dict(center=(0, 0.255, 0.165), n=3),
    'leg': dict(x=0.075, top=(0.02, 0.08), ankle=(0.0, 0.02), r=0.018),
    'brooch': dict(center=(0, -0.203, 0.135), r=0.02),
}
E = D['body']['e']


def body_point(z, th, side=1):
    """The body's surface at height z and azimuth th (0 at the left side, + toward the back)."""
    b = D['body']
    rx, ry, rz = b['radii']
    s = max(-0.999, min(0.999, (z - b['center'][2]) / rz))
    sin_phi = kit.spow(s, 1 / E)
    cp = kit.spow(math.sqrt(1 - sin_phi ** 2), E)
    k = 1 - b['taper'] * s / 2
    return Vector((side * rx * cp * kit.spow(math.cos(th), E) * k,
                   b['center'][1] + ry * cp * kit.spow(math.sin(th), E) * k, z))


def body_top(x, y):
    """Height of the body's top surface at (x, y)."""
    b = D['body']
    rx, ry, rz = b['radii']
    a = (abs(x) / rx) ** (2 / E) + (abs(y - b['center'][1]) / ry) ** (2 / E)
    a = min(a ** (E / E), 0.999)
    return b['center'][2] + rz * (1 - a) ** (E / 2)


def frame(p, e_y, e_z):
    """A 4x4 at p with its Y along e_y and Z along e_z."""
    e_y, e_z = e_y.normalized(), e_z.normalized()
    e_x = e_y.cross(e_z).normalized()
    e_z = e_x.cross(e_y)
    m = Matrix((e_x, e_y, e_z)).transposed().to_4x4()
    m.translation = p
    return m


def flatten(obj):
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    obj.data.update()
    return obj


def band(name, r, h):
    """A short cuff round the neck: a band with rounded edges, axis Z."""
    e = h * 0.35
    return kit.lathe(name, [(r - e, h / 2), (r, h / 2 - e), (r, -h / 2 + e), (r - e, -h / 2)], seg=32)


def paddle(name, side, cx, y, thick=0.012):
    """A webbed foot: a fan with three scalloped toes, chamfered, lying flat."""
    pts = [(0.0, 0.03), (0.03, 0.02), (0.062, -0.035), (0.05, -0.088), (0.03, -0.09), (0.02, -0.082), (0.0, -0.104),
           (-0.02, -0.082), (-0.03, -0.09), (-0.05, -0.088), (-0.062, -0.035), (-0.03, 0.02)]
    rings = [(0.0, 0.84, 0.0), (0.0, 1.0, 0.0), (thick * 0.55, 1.0, 0.0), (thick, 0.78, 0.0)]
    verts, faces = [], []
    for z, k, _ in rings:
        verts += [(side * cx + px * k, y + py * k + (0.006 if k < 1 else 0.0) * (1 - k), z) for px, py in pts]
    n = len(pts)
    for r in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            faces.append((r * n + i, r * n + j, (r + 1) * n + j, (r + 1) * n + i))
    top = len(verts)
    verts.append((side * cx, y - 0.01, thick + 0.001))
    bottom = top + 1
    verts.append((side * cx, y - 0.01, -0.0))
    for i in range(n):
        j = (i + 1) % n
        faces.append(((len(rings) - 1) * n + i, (len(rings) - 1) * n + j, top))
        faces.append((j, i, bottom))
    return flatten(kit.mesh_object(name, verts, faces))


def stud(name, p, r=0.0042, seg=(8, 6)):
    """A small round bolt head, flattened a little, sitting at p."""
    return kit.superellipsoid(name, (r, r, r * 0.7), 1, 1, seg=seg, location=tuple(p))


def rig_bones():
    n = D['neck']
    pts = kit.spline(n['points'], 41)
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.03, 0.11), (0, 0.03, 0.27), 'root'),
        ('tail', (0, 0.22, 0.16), (0, 0.32, 0.24), 'body'),
    ]
    parent = 'body'
    for k in range(5):
        name = f'neck.{k + 1}'
        bones.append((name, pts[k * 8], pts[k * 8 + 8], parent))
        parent = name
    hc = D['head']['center']
    bones.append(('head', pts[40], (hc[0], hc[1], hc[2] + 0.05), parent))
    hm = head_matrix()
    bones.append(('jaw', tuple(hm @ Vector(D['jaw']['pivot'])), tuple(hm @ Vector((0, -0.16, -0.05))), 'head'))
    w = D['wing']
    sx, sy, sz = w['shoulder']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ys = [sy, sy + 0.1, sy + 0.21, sy + 0.33]
        parent = 'body'
        for k in range(3):
            name = f'wing.{sfx}.{k + 1}'
            bones.append((name, (side * sx, ys[k], sz + 0.01 * k), (side * sx, ys[k + 1], sz + 0.01 * (k + 1)), parent))
            parent = name
        lg = D['leg']
        bones.append((f'leg.{sfx}', (side * lg['x'], lg['top'][0], lg['top'][1]),
                      (side * lg['x'], lg['ankle'][0], lg['ankle'][1]), 'root'))
        bones.append((f'foot.{sfx}', (side * lg['x'], lg['ankle'][0], lg['ankle'][1]),
                      (side * lg['x'], lg['ankle'][0] - 0.09, 0.012), f'leg.{sfx}'))
    return bones


def head_matrix():
    h = D['head']
    return Matrix.Translation(h['center']) @ Matrix.Rotation(h['tilt'], 4, 'X')


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Hull.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], E, E, seg=(52, 36), taper=b['taper'], location=b['center']),
        m['shell'], 'body')
    # A waterline trim all round, and the layered flank plates over the hull's lower half.
    rx, ry, rz = b['radii']
    ring = kit.torus('Waterline', 1.0, 0.007, seg=(64, 8), location=(0, b['center'][1], b['center'][2] - 0.028))
    kit.stretch(ring, sx=rx * 1.005, sy=ry * 1.005)
    add(ring, m['role']('Ring', 'joint'), 'body')
    for side in (1, -1):
        for row, (z, tilt) in enumerate(((0.118, 0.0), (0.082, 0.0))):
            for i in range(5 - row):
                th = -0.25 + i * 0.36 + (0.21 if row else 0.0)
                p = body_point(z, th, side)
                q = body_point(z, th + 0.01, side)
                t = q - body_point(z, th - 0.01, side)
                n = Vector((p.x - 0, p.y - b['center'][1], 0)).normalized()
                n = (n + Vector((0, 0, -0.35 if row else -0.1))).normalized()
                plate = kit.superellipsoid(f'Plate.{side}.{row}.{i}', (0.026, 0.065 - 0.008 * row, 0.007), 0.9, 0.85,
                                           seg=(20, 8))
                plate.matrix_basis = frame(p + n * 0.003, t, n)
                kit.apply_transforms(plate)
                add(plate, m['role']('Plate'), 'body')
    # The tail fan: five stepped plates turned up at the stern, on a hub pin.
    t = D['tail']
    mid = (t['n'] - 1) / 2
    for k in range(t['n']):
        off = abs(k - mid)
        a = (k - mid) * 0.26
        plate = kit.superellipsoid(f'Tail.{k}', (0.026, 0.085 - 0.012 * off, 0.006), 0.9, 0.85, seg=(20, 10))
        plate.matrix_basis = Matrix.Translation((math.sin(a) * 0.05, t['center'][1] + math.cos(a) * 0.035,
                                                 t['center'][2] + 0.008 * off - 0.006 * (off == 0))) @ Matrix.Rotation(
            -a, 4, 'Z') @ Matrix.Rotation(0.5 - 0.06 * off, 4, 'X')
        kit.apply_transforms(plate)
        add(plate, m['role']('Plate' if k % 2 == 0 else 'Quill'), 'tail')
        if off < 2.1:
            rim = kit.superellipsoid(f'TailRim.{k}', (0.03, 0.089 - 0.012 * off, 0.004), 0.9, 0.85, seg=(20, 10))
            rim.matrix_basis = Matrix.Translation((math.sin(a) * 0.05, t['center'][1] + math.cos(a) * 0.035,
                                                 t['center'][2] + 0.008 * off - 0.006 * (off == 0) - 0.003)) @ Matrix.Rotation(
                -a, 4, 'Z') @ Matrix.Rotation(0.5 - 0.06 * off, 4, 'X')
            kit.apply_transforms(rim)
            add(rim, m['role']('Ring', 'joint'), 'tail')
    add(stud('TailPin', (0, t['center'][1] - 0.02, t['center'][2] + 0.012), 0.009), m['joint'], 'tail')
    # Seam bolts along the waterline, and a row of studs on the flank.
    for side in (1, -1):
        for i in range(9):
            th = -0.5 + i * 0.38
            q = body_point(b['center'][2] - 0.028, th, side)
            q += Vector((q.x, q.y - b['center'][1], 0)).normalized() * 0.006
            add(stud(f'Bolt.{side}.{i}', q, 0.0038), m['bezel'], 'body')
    # A seam ridge down the middle of the back, under the wings.
    spine, _ = kit.tube('Spine', [(0, -0.09 + 0.04 * k, body_top(0, -0.09 + 0.04 * k) + 0.002) for k in range(9)],
                        0.004, ring=6)
    add(spine, m['joint'], 'body')

    # The neck: one tube on five bones, and a cuff over each hinge.
    n = D['neck']
    pts = kit.spline(n['points'], 41)
    radii = [n['r'][0] + (n['r'][1] - n['r'][0]) * (i / 40) ** 0.8 for i in range(41)]
    neck, ts = kit.tube('Neck', pts, radii, ring=18)
    add(neck, m['shell'], kit.chain(ts, [f'neck.{k + 1}' for k in range(5)]))
    for k in range(1, 5):
        i = k * 8
        tan = Vector(pts[i + 1]) - Vector(pts[i - 1])
        cuff = band(f'Cuff.{k}', radii[i] + 0.004, 0.022)
        cuff.matrix_basis = Matrix.Translation(pts[i]) @ Vector((0, 0, 1)).rotation_difference(tan).to_matrix().to_4x4()
        kit.apply_transforms(cuff)
        add(cuff, m['role']('Ring', 'joint'), f'neck.{k + 1}')
        rot = Vector((0, 0, 1)).rotation_difference(tan).to_matrix()
        for j in range(6):
            ang = j * math.pi / 3 + 0.3
            loc = Vector(pts[i]) + rot @ Vector((math.cos(ang), math.sin(ang), 0)) * (radii[i] + 0.0055)
            add(stud(f'Rivet.{k}.{j}', loc, 0.0034), m['bezel'], f'neck.{k + 1}')
    # A collar where the neck meets the chest, and the chest brooch.
    collar = band('Collar', radii[0] + 0.008, 0.02)
    collar.matrix_basis = Matrix.Translation(pts[1]) @ Vector((0, 0, 1)).rotation_difference(
        Vector(pts[2]) - Vector(pts[0])).to_matrix().to_4x4()
    kit.apply_transforms(collar)
    add(collar, m['role']('Ring', 'joint'), 'neck.1')
    br = D['brooch']
    c = br['center']
    add(kit.superellipsoid('BroochRim', (br['r'] + 0.006, 0.008, br['r'] + 0.006), 0.5, 0.5, seg=(24, 8),
                           location=(c[0], c[1] + 0.0, c[2])), m['joint'], 'body')
    for j in range(8):
        ang = j * math.pi / 4
        add(stud(f'Filigree.{j}', (c[0] + math.cos(ang) * (br['r'] + 0.011), c[1] - 0.002,
                                    c[2] + math.sin(ang) * (br['r'] + 0.011)), 0.0032), m['bezel'], 'body')
    add(kit.superellipsoid('Brooch', (br['r'], 0.012, br['r']), 0.6, 0.6, seg=(24, 8),
                           location=(c[0], c[1] - 0.004, c[2])), m['beacon'], 'body')

    # Head, screen, beak and knob (built in the head's own frame, then tipped into place).
    def head(obj, mat, bone='head'):
        obj.matrix_basis = head_matrix() @ obj.matrix_basis
        kit.apply_transforms(obj)
        return add(obj, mat, bone)

    h = D['head']
    head(kit.superellipsoid('Head', h['radii'], 0.75, 0.75, seg=(44, 30)), m['shell'])
    sc = D['screen']
    glass, rim = kit.screen('Swan', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    head(glass, m['face'])
    head(rim, m['bezel'])
    bk, jw, kn = D['beak'], D['jaw'], D['knob']
    beak = kit.superellipsoid('Beak', bk['radii'], 0.6, 0.6, seg=(32, 14), location=bk['center'])
    kit.stretch(beak, sx=1.0, sy=1.0, sz=1.0)
    head(beak, m['role']('Beak', 'joint'))
    head(kit.superellipsoid('Jaw', jw['radii'], 0.6, 0.6, seg=(28, 10), location=jw['center']),
         m['role']('Beak', 'joint'), 'jaw')
    for sd in (1, -1):
        head(kit.superellipsoid(f'Nostril.{sd}', (0.0025, 0.009, 0.002), 1, 1, seg=(10, 6),
                                location=(sd * 0.008, -0.105, -0.0135)), m['bezel'])
        head(kit.superellipsoid(f'HingePin.{sd}', (0.005, 0.005, 0.005), 1, 1, seg=(10, 6),
                                location=(sd * 0.02, jw['pivot'][1] - 0.004, jw['pivot'][2] + 0.006)), m['bezel'])
        head(kit.superellipsoid(f'BeakSeam.{sd}', (0.0018, 0.05, 0.0018), 1, 1, seg=(8, 6),
                                location=(sd * 0.021, -0.11, -0.03)), m['bezel'])
    bezel = kit.torus('KnobBezel', 0.013, 0.0032, seg=(24, 6), location=(0, kn['center'][1], kn['center'][2] - 0.007))
    kit.stretch(bezel, sx=1.0, sy=1.45, sz=1.0)
    head(bezel, m['bezel'])
    head(kit.superellipsoid('Knob', kn['radii'], 0.8, 0.8, seg=(24, 12), location=kn['center']),
         m['role']('Knob', 'bezel'))

    # Wings: five overlapping feather plates, each bent along the three-bone arm.
    w = D['wing']
    sx, sy, sz = w['shoulder']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones = [f'wing.{sfx}.{k}' for k in (1, 2, 3)]
        for i, (length, fan) in enumerate(zip(w['lengths'], w['fan'])):
            x = w['x0'] + i * w['dx']
            yc = sy + length / 2 - 0.02
            z = body_top(x, yc) + 0.012
            # Plates lie on the body's curve: tipped outward by its slope across, and along.
            slope_x = (body_top(x + 0.01, yc) - body_top(x - 0.01, yc)) / 0.02
            feather = kit.superellipsoid(f'Feather.{sfx}{i}', (w['width'] / 2, length / 2, 0.0065), 0.9, 0.82,
                                         seg=(22, 10))
            feather.matrix_basis = Matrix.Translation((side * x, yc, z)) @ Matrix.Rotation(
                -fan * side, 4, 'Z') @ Matrix.Rotation(-math.atan(slope_x) * side, 4, 'Y')
            kit.apply_transforms(feather)
            # Bone weights follow the plate along the arm.
            span = (0.35 + sy) - sy
            tv = [min(max((v.co.y - sy) / 0.33, 0.0), 1.0) for v in feather.data.vertices]
            add(feather, m['role']('Quill' if i < 4 else 'Wing', 'joint' if i < 2 else 'shell'),
                kit.chain(tv, bones))
            # A thin rim plate beneath (a lighter edge), and a rib down the middle.
            rimf = kit.superellipsoid(f'FeatherRim.{sfx}{i}', (w['width'] / 2 + 0.004, length / 2 + 0.004, 0.004),
                                      0.9, 0.82, seg=(16, 8))
            rimf.matrix_basis = Matrix.Translation((side * x, yc, z - 0.0035)) @ Matrix.Rotation(
                -fan * side, 4, 'Z') @ Matrix.Rotation(-math.atan(slope_x) * side, 4, 'Y')
            kit.apply_transforms(rimf)
            tvr = [min(max((v.co.y - sy) / 0.33, 0.0), 1.0) for v in rimf.data.vertices]
            add(rimf, m['role']('Ring', 'joint'), kit.chain(tvr, bones))
            ca, sa = math.cos(fan), math.sin(fan)
            rib, _ = kit.tube(f'Rib.{sfx}{i}', [(side * (x + sa * d), yc + ca * d, z + 0.0062)
                                                 for d in (-length * 0.42, 0.0, length * 0.4)], 0.0028, ring=4)
            tvb = [min(max((v.co.y - sy) / 0.33, 0.0), 1.0) for v in rib.data.vertices]
            add(rib, m['bezel'], kit.chain(tvb, bones))
            # A light in the tip of every plate.
            ty = yc + length / 2 * math.cos(fan) - 0.012
            tx = x + length / 2 * math.sin(fan)
            bead = kit.superellipsoid(f'Tip.{sfx}{i}', (0.011, 0.011, 0.008), 1, 1, seg=(16, 8),
                                      location=(side * tx, ty, z + 0.004))
            add(bead, m['dot'](i), bones[2])
        # Layered shoulder coverts: three small plates stepped over the hinge.
        for j in range(3):
            cv = kit.superellipsoid(f'Covert.{sfx}{j}', (0.032 - 0.004 * j, 0.03, 0.006), 0.9, 0.85, seg=(16, 8))
            cx = sx + 0.01 + 0.012 * j
            cy = sy + 0.005 + 0.024 * j
            cv.matrix_basis = Matrix.Translation((side * cx, cy, body_top(cx, cy) + 0.024 + 0.003 * j))
            kit.apply_transforms(cv)
            add(cv, m['role']('Ring' if j == 1 else 'Plate', 'joint' if j == 1 else 'shell'), bones[0])
        # The hinge at the shoulder.
        add(kit.superellipsoid(f'Shoulder.{sfx}', (0.022, 0.022, 0.016), 0.6, 0.6, seg=(20, 10),
                               location=(side * (sx + 0.0), sy - 0.005, sz + 0.005)), m['joint'], bones[0])

    # Legs and the big webbed paddles.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{sfx}', [(x, *lg['top']), (x, *lg['ankle'])], lg['r'], ring=10)
        add(leg, m['role']('Foot', 'joint'), f'leg.{sfx}')
        add(paddle(f'Foot.{sfx}', side, lg['x'], lg['ankle'][0] - 0.005), m['role']('Foot', 'joint'), f'foot.{sfx}')
        ring_ = band(f'Ankle.{sfx}', lg['r'] + 0.006, 0.014)
        ring_.matrix_basis = Matrix.Translation((x, lg['ankle'][0], lg['ankle'][1] + 0.012))
        kit.apply_transforms(ring_)
        add(ring_, m['role']('Ring', 'bezel'), f'leg.{sfx}')
        add(stud(f'Knee.{sfx}', (x + side * lg['r'] * 1.0, lg['top'][0], lg['top'][1] - 0.005), 0.007), m['bezel'],
            f'leg.{sfx}')
        for k, ang in enumerate((-0.42, 0.0, 0.42)):
            y0 = lg['ankle'][0] + 0.012
            ridge, _ = kit.tube(f'Ridge.{sfx}{k}', [(x, y0, 0.014),
                                                    (x + math.sin(ang) * 0.06, y0 - math.cos(ang) * 0.1, 0.014)],
                                0.0045, ring=6)
            add(ridge, m['bezel'], f'foot.{sfx}')
            add(kit.superellipsoid(f'Claw.{sfx}{k}', (0.0075, 0.009, 0.006), 0.8, 0.8, seg=(10, 6),
                                   location=(x + math.sin(ang) * 0.066, y0 - math.cos(ang) * 0.105, 0.012)),
                m['role']('Claw', 'bezel'), f'foot.{sfx}')

    return looks.finish(kit.armature('SwanRig', rig_bones()), parts, skin, m)
