"""Coco, the crew's robot scarlet macaw: a big, bright, chatty toy robot, not a macaw in a
robot suit. A chunky barrel of a body stood upright on short sturdy legs, a big
rounded-box head with a screen face set in a pale bare-skin face plate, and a big hooked
beak in two halves, the lower one on its own bone so it opens to talk.

The wings are layered fans: a wing case that hugs each side over five long slats, all
hinged at the shoulder, two yellow and three blue with a lit tip on every one (one
material per slat, Dot0 at the top to Dot4 at the bottom, the same on both wings). The
tail is two very long feathers, each three plates end to end, red with a lit blue tip
(Dot5). A crest of five plates lies back along the top of the head and rises when he is
excited, its tips lit (Dot6). The feet are zygodactyl: two toes forward, two back.
Three small lights float in front of the beak for talking (they are scaled to nothing
until he talks) and a walnut in two halves with a glowing kernel hides in the beak, on
its own bones (scaled to nothing unless he cracks one). Faces -Y like the rest of the
crew; about 0.6 m to the top of his head.
"""

import math

from mathutils import Matrix, Vector

import kit
import looks

FACE = 'macaw'
PREVIEW = dict(lift=0.0, width=0.5)

# The body's tip: breast up, rump down (radians about X). Wings and tail are laid out in
# the body's own frame (see on_body) so they follow it.
TILT = -0.42

D = {
    # A fat teardrop along its own axis: a deep breast tapering to the rump (see body()).
    'body': dict(length=0.36, width=0.12, height=0.135, center=(0, 0.035, 0.23)),
    'neck': dict(points=[(0, -0.055, 0.32), (0, -0.09, 0.41)], r=0.078),
    # Round over the top, squarer in plan so the face plate sits flat on the front.
    'head': dict(radii=(0.108, 0.108, 0.1), center=(0, -0.1, 0.48), e=(0.8, 0.62), tip=0.1),
    # The pale face plate, and the screen set into it (the head's own untipped frame).
    'plate': dict(radii=(0.096, 0.03, 0.078), at=(0, -0.085, 0.02), e=(0.4, 0.45)),
    'screen': dict(radii=(0.074, 0.02, 0.034), at=(0, -0.107, 0.052), bezel=0.007),
    # The beak: two faceted halves meeting flat, the upper a big hook over the lower.
    'beak': dict(base=(0, -0.165, 0.412), length=0.15, width=0.08, upper=0.085, lower=0.058, hook=0.09),
    'case': dict(scale=(1.1, 1.05, 1.07), side=0.035, below=-0.02, front=-0.14, back=0.09),
    # Wings, in the body's frame: the shoulder hinge; slats as (degrees down from the
    # body's axis, length, degrees in toward the tail, how far out) from their own
    # hinge on the flank, top slat first. The first two are the yellow band.
    'wing': dict(shoulder=(0.1, -0.1, 0.035), hinge=(0.115, -0.03, -0.005), lit=0.3, slat=(0.006, 0.034),
                 slats=[(3, 0.3, 9, 0.018), (8, 0.34, 9, 0.012), (13, 0.38, 9, 0.006), (18, 0.4, 9, 0.0),
                        (23, 0.37, 9, -0.006)]),
    # Tail: two long feathers from under the rump (degrees below the body's axis; the
    # feathers part by the second number), each in three plates end to end.
    'tail': dict(root=(0, 0.16, -0.03), angle=-20, parts=[0.15, 0.14, 0.13], gap=0.006, slat=(0.03, 0.006)),
    # Crest: plates hinged across the top of the head (across, up from the head's centre).
    'crest': dict(centre=(0, -0.065, 0.55), plates=[-46, -23, 0, 23, 46], length=0.11, width=0.026),
    'leg': dict(x=0.05, hip=(0.03, 0.125), ankle=(0.0, 0.032), r=0.022),
    'toes': dict(front=[-17, 17], back=[-17, 17], length=0.062, rear=0.05, r=0.012),
    # The walnut, split in two, held in the beak (the site moves it), and the lights he
    # talks with, in front of the beak.
    'nut': dict(r=0.026),
    # Refinement: (local y, scales in the row, angle between them) for the breast; the
    # back's rows also carry a colour; seam rings and rivet stations along the barrel.
    'refine': dict(
        scale=(0.02, 0.013),
        breast=[-0.172, -0.15, -0.128, -0.105, -0.08, -0.055],
        back=[(-0.115, 3, 0.4, 'band'), (-0.075, 4, 0.36, 'band'), (0.06, 3, 0.4, 'flight'), (0.1, 3, 0.36, 'flight')],
        seams=[-0.1, -0.02, 0.055, 0.115],
        rivets=[-0.09, -0.04, 0.01, 0.06],
    ),
    'talk': [((0.0, -0.27, 0.51), 0.009), ((0.0, -0.3, 0.55), 0.012), ((0.0, -0.335, 0.595), 0.015)],
}

TURN = Matrix.Rotation(TILT, 3, 'X')


def on_body(p):
    """A point in the body's own frame (x out to its left, y back along it, z up from
    its axis) in the model."""
    return tuple(Vector(D['body']['center']) + TURN @ Vector(p))


def body(name, scale=(1, 1, 1)):
    """The body: a teardrop turned about its own axis, deep at the breast and tapering
    to the rump, a little taller than wide; set on the model, tipped breast up."""
    b = D['body']
    half = b['length'] / 2
    profile = []
    for i in range(25):
        u = (1 - math.cos(math.pi * i / 24)) / 2  # 0 at the breast, 1 at the rump
        r = b['width'] * math.sin(math.pi * u ** 0.75) ** 0.5
        profile.append((r, half - b['length'] * u))
    obj = kit.lathe(name, profile, seg=40)
    obj.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
    sx, sy, sz = scale
    kit.stretch(obj, sx, sy, sz * b['height'] / b['width'])
    obj.location = b['center']
    obj.rotation_euler = (TILT, 0, 0)
    return obj


def mirror(p, side):
    return side * p[0], p[1], p[2]


def add3(a, b):
    return tuple(u + v for u, v in zip(a, b))


def beak_tip():
    b = D['beak']
    x, y, z = b['base']
    return x, y - b['length'] * 0.8, z - b['hook'] * 0.9


def half_beak(name, lower=False):
    """One half of the beak: rings of a faceted half-section along a curved line from the
    base to a point, closed flat where the halves meet, flat-shaded so the facets catch the
    light. The upper half hooks far down over the lower one's short, upturned tip."""
    b = D['beak']
    x0, y0, z0 = b['base']
    w0 = b['width']
    h0 = b['lower'] if lower else b['upper']
    length = b['length'] * (0.62 if lower else 1.0)
    section = [(-1, -0.3), (-0.85, 0.45), (0, 1), (0.85, 0.45), (1, -0.3), (0, -0.55)] if not lower else \
        [(-0.94, 0), (-0.55, -0.75), (0, -1), (0.55, -0.75), (0.94, 0)]
    n = 8
    verts, faces = [], []

    def centre(t):
        if lower:
            return y0 - length * t, z0 + 0.004 * t
        return y0 - length * (t - 0.22 * t ** 3), z0 - b['hook'] * t ** 2.8

    for i in range(n):
        t = i / n
        y, z = centre(t)
        w = w0 * (1 - t ** 1.6) ** 0.6
        h = h0 * (1 - t ** 1.5) ** 0.7
        verts += [(x0 + w * sx, y, z + h * sz) for sx, sz in section]
    m = len(section)
    for i in range(n - 1):
        for k in range(m):
            a, c = i * m + k, i * m + (k + 1) % m
            faces.append((a, c, c + m, a + m))
    ty, tz = centre(1.0)
    verts.append((x0, ty, tz - (0.006 if not lower else -0.012)))
    last = (n - 1) * m
    faces += [(last + k, last + (k + 1) % m, len(verts) - 1) for k in range(m)]
    faces.append(tuple(range(m))[::-1])
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def slat_axis(down, inward, side):
    """Which way a slat points, in the body's frame: back, tipped down and turned in."""
    d, i = math.radians(down), math.radians(inward)
    return Vector((-side * math.sin(i) * math.cos(d), math.cos(i) * math.cos(d), -math.sin(d)))


def plate(name, a, b, radii, up=Vector((0, 0, 1)), seg=(16, 8)):
    """A rounded plate from a to b (model points): thickness across `up`, width along it."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    thick, width = radii
    obj = kit.superellipsoid(name, (thick, (b - a).length / 2, width), 0.35, 0.35, seg=seg)
    z = (up - axis * up.dot(axis)).normalized()
    x = axis.cross(z)
    obj.data.transform(Matrix((x, axis, z)).transposed().to_4x4())
    obj.location = (a + b) / 2
    return obj


def small(*a, **k):
    """A plate for fine detail: fewer rings."""
    return plate(*a, seg=(10, 5), **k)


def ball(name, centre, r, seg=(16, 10), e=1.0):
    return kit.superellipsoid(name, (r,) * 3, e, e, seg=seg, location=centre)


def orient(obj, axis):
    """Turn a part's mesh so its own Z points along `axis` (model space)."""
    obj.data.transform(Vector(axis).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4())
    return obj


def radius_at(y):
    """The body's half-width at local height y along its axis (as in body())."""
    b = D['body']
    u = min(max((b['length'] / 2 + y) / b['length'], 0.0), 1.0)
    return b['width'] * math.sin(math.pi * u ** 0.75) ** 0.5


def body_point(y, angle, lift=0.0, side=1.0):
    """A point on the body's skin at local y, `angle` radians round from the top (0 = top,
    pi = underneath), pushed out by `lift`; returns (model point, outward normal)."""
    ez = D['body']['height'] / D['body']['width']
    r = radius_at(y)
    p = Vector((side * r * math.sin(angle), y, r * ez * math.cos(angle)))
    slope = (radius_at(y + 0.003) - radius_at(y - 0.003)) / 0.006
    n = Vector((side * math.sin(angle), -slope, math.cos(angle) / ez)).normalized()
    return Vector(on_body(p + n * lift)), TURN @ n


def shingle(name, centre, normal, w, h, thick, e=0.45):
    """A small rounded scale lying on the skin: wide across the body, short along it."""
    axis = TURN @ Vector((0, 1, 0))
    x = axis.cross(normal).normalized()
    y = normal.cross(x)
    obj = kit.superellipsoid(name, (w, h, thick), e, e, seg=(8, 4))
    obj.data.transform(Matrix((x, y, normal)).transposed().to_4x4())
    obj.location = centre
    return obj


def slats(side):
    """(hinge, tip) of each wing slat, in the model."""
    w = D['wing']
    out = []
    for down, length, inward, lift in w['slats']:
        hx, hy, hz = w['hinge']
        hinge = Vector((side * (hx + lift), hy, hz))
        out.append((on_body(hinge), on_body(hinge + slat_axis(down, inward, side) * length)))
    return out


def tail_line(side):
    """(start, end) of a tail feather's whole length, in the model: two feathers, one to
    each side of the middle, from the same root."""
    t = D['tail']
    d = math.radians(t['angle'])
    f = math.radians(3.0) * side
    axis = Vector((math.sin(f) * math.cos(d), math.cos(f) * math.cos(d), -math.sin(d)))
    root = Vector(t['root']) + Vector((side * 0.018, 0, 0))
    return on_body(root), on_body(root + axis * (sum(t['parts']) + 2 * t['gap']))


def rig_bones():
    lg, b = D['leg'], D['beak']
    hinge = (0, b['base'][1] + 0.012, b['base'][2])
    tip = beak_tip()
    cr = D['crest']['centre']
    troot = on_body(D['tail']['root'])
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # Pivots at the hips, so he can bob and bow over his feet.
        ('body', (0, 0.03, 0.14), (0, -0.05, 0.34), 'root'),
        ('head', (0, -0.08, 0.4), (0, -0.1, 0.57), 'body'),
        ('jaw', hinge, (0, hinge[1] - 0.12, hinge[2]), 'head'),
        ('crest', cr, add3(cr, (0, 0.05, 0.02)), 'head'),
        ('tail', troot, add3(troot, (0, 0.1, -0.05)), 'body'),
        ('nut', tip, add3(tip, (0, 0, 0.05)), 'head'),
        ('nut.a', tip, add3(tip, (0.03, 0, 0)), 'nut'),
        ('nut.b', tip, add3(tip, (-0.03, 0, 0)), 'nut'),
    ]
    for k, (p, _) in enumerate(D['talk']):
        bones.append((f'talk.{k + 1}', p, add3(p, (0, 0, 0.03)), 'head'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a, z = tail_line(side)
        bones.append((f'tail.{sfx}', a, z, 'tail'))
        s = on_body(mirror(D['wing']['shoulder'], side))
        bones.append((f'wing.{sfx}', s, add3(s, (0, 0.1, -0.05)), 'body'))
        for k, (a, z) in enumerate(slats(side)):
            bones.append((f'wing.{sfx}.{k + 1}', a, z, f'wing.{sfx}'))
        bones.append((f'leg.{sfx}', (side * lg['x'], *lg['hip']), (side * lg['x'], *lg['ankle']), 'root'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    band = m['role']('Band', 'joint')
    flight = m['role']('Flight', 'joint')
    patch = m['role']('Patch', 'bezel')
    beak = m['role']('Beak', 'bezel')

    # Body and neck, with a collar between.
    add(body('Body'), m['shell'], 'body')
    n = D['neck']
    neck, ts = kit.tube('Neck', kit.resample(n['points'], 6), n['r'], ring=24)
    add(neck, m['shell'], kit.chain(ts, ['body', 'head']))
    add(kit.torus('Collar', 0.088, 0.013, location=(0, -0.075, 0.37), rotation=(0.25, 0, 0)), m['joint'], 'body')

    # Head: the pale plate with the screen set in it, four bolts, and the beak.
    h = D['head']
    tip = Matrix.Rotation(h['tip'], 3, 'X')
    hc = Vector(h['center'])

    def on_head(p):
        return hc + tip @ Vector(p)

    add(kit.superellipsoid('Head', h['radii'], *h['e'], seg=(40, 28), location=h['center'],
                           rotation=(h['tip'], 0, 0)), m['shell'], 'head')
    pl = D['plate']
    add(kit.superellipsoid('Plate', pl['radii'], *pl['e'], seg=(32, 20), location=on_head(pl['at']),
                           rotation=(h['tip'], 0, 0)), patch, 'head')
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(ball(f'Bolt.{sx}.{sz}', on_head((sx * 0.088, -0.112, 0.02 + sz * 0.042)), 0.006, seg=(10, 6)),
                m['joint'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Macaw', sc['radii'], (0, 0, 0), sc['bezel'], e=0.4)
    for part in (glass, rim):
        part.location = on_head(Vector(sc['at']) + part.location)
        part.rotation_euler = (h['tip'], 0, 0)
        add(part, m['face'] if part is glass else m['bezel'], 'head')
    add(half_beak('Beak'), beak, 'head')
    add(half_beak('Jaw', lower=True), m['role']('Jaw', 'joint'), 'jaw')

    # Crest: plates fanned across the crown, lying back; the tips are lit.
    cr = D['crest']
    cx, cy, cz = cr['centre']
    for k, a in enumerate(cr['plates']):
        ang = math.radians(a)
        rise = math.radians(22)
        base = (cx + 0.05 * math.sin(ang), cy + 0.03 * (1 - math.cos(ang)), cz - 0.012 * abs(math.sin(ang)))
        d = Vector((math.sin(ang) * 0.5, math.cos(ang) * math.cos(rise), math.sin(rise)))
        mid = Vector(base) + d * cr['length'] * 0.6
        end = Vector(base) + d * cr['length']
        w = cr['width'] * (1 - 0.25 * abs(a) / 46)
        up = Vector((math.cos(ang), -math.sin(ang), 0))
        add(plate(f'Crest.{k}', base, mid, (0.005, w), up), m['shell'], 'crest')
        add(plate(f'CrestTip.{k}', mid.lerp(end, 0.05), end, (0.005, w * 0.8), up), m['dot'](6), 'crest')

    # Wings: a case hugging the body over five slats with lit tips.
    w, c = D['wing'], D['case']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        case = body(f'Case.{sfx}', c['scale'])
        kit.cut(case, (side, 0, 0), c['side'])
        kit.cut(case, (0, 0, 1), c['below'])
        kit.cut(case, (0, 1, 0), c['front'])
        kit.cut(case, (0, -1, 0), -c['back'])
        add(case, m['shell'], 'body')
        for k, (a, z) in enumerate(slats(side)):
            cut = Vector(a).lerp(Vector(z), 1 - w['lit'])
            up = TURN @ Vector((0, 0, 1))
            mat = band if k < 2 else flight
            add(plate(f'Slat.{sfx}.{k}', a, cut.lerp(Vector(z), 0.03), w['slat'], up), mat, f'wing.{sfx}.{k + 1}')
            add(plate(f'SlatTip.{sfx}.{k}', cut, z, w['slat'], up), m['dot'](k), f'wing.{sfx}.{k + 1}')

    # Tail: two long feathers, each three plates end to end: red, red, and a blue one
    # with a lit tip.
    t = D['tail']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a, z = tail_line(side)
        axis = (Vector(z) - Vector(a)).normalized()
        at = Vector(a)
        th, wd0 = t['slat']
        for k, ln in enumerate(t['parts']):
            end = at + axis * ln
            wd = wd0 * (1.0, 0.95, 0.75)[k]
            if k < 2:
                add(plate(f'Tail.{sfx}.{k}', at, end, (th, wd), Vector((1, 0, 0))), m['shell'], f'tail.{sfx}')
            else:
                add(plate(f'Tail.{sfx}.{k}', at, at.lerp(end, 0.55), (th, wd), Vector((1, 0, 0))), flight,
                    f'tail.{sfx}')
                add(plate(f'TailTip.{sfx}', at.lerp(end, 0.52), end, (th, wd * 0.8), Vector((1, 0, 0))),
                    m['dot'](5), f'tail.{sfx}')
            at = end + axis * t['gap']
    # Two short cover plates over the roots.
    root = Vector(on_body(t['root']))
    axis = (Vector(tail_line(1)[1]) - Vector(tail_line(1)[0])).normalized()
    for side in (1, -1):
        off = Vector((side * 0.025, 0, 0.014))
        add(plate(f'Cover.{side}', root + off, root + axis * 0.1 + off, (0.008, 0.026), Vector((1, 0, 0))),
            m['shell'], 'tail')

    # Legs: a cuff where they leave the body, a shin, a ball ankle, and zygodactyl
    # toes: two forward and two back, each with a knuckle.
    lg, to = D['leg'], D['toes']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        hip, ankle = (x, *lg['hip']), (x, *lg['ankle'])
        add(kit.tube(f'Shin.{sfx}', [hip, ankle], lg['r'], ring=12)[0], m['joint'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Cuff.{sfx}', (0.03, 0.03, 0.026), 0.5, 1.0, seg=(20, 10),
                               location=(x, 0.03, 0.115)), m['shell'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Ankle.{sfx}', (0.02,) * 3, seg=(16, 10), location=ankle), m['joint'], f'leg.{sfx}')
        foot = (x, ankle[1], to['r'])
        for k, a in enumerate(to['front']):
            r = math.radians(a)
            end = (x + math.sin(r) * to['length'], ankle[1] - math.cos(r) * to['length'], to['r'])
            add(kit.tube(f'Toe.{sfx}.{k}', [foot, end], to['r'], ring=10)[0], m['joint'], f'leg.{sfx}')
            add(ball(f'Knuckle.{sfx}.{k}', tuple((u + v) / 2 for u, v in zip(foot, end)), to['r'] * 1.3,
                     seg=(12, 8)), m['shell'], f'leg.{sfx}')
        for k, a in enumerate(to['back']):
            r = math.radians(a)
            end = (x + math.sin(r) * to['rear'], ankle[1] + math.cos(r) * to['rear'], to['r'])
            add(kit.tube(f'Toe.{sfx}.b{k}', [foot, end], to['r'], ring=10)[0], m['joint'], f'leg.{sfx}')


    # ---- Refinement: layered plates, seams, hinges, grips ----
    r = D['refine']

    # Breast: shingled rows of scarlet scales over the chest, each row a little wider.
    for row, y in enumerate(r['breast']):
        rr = radius_at(y)
        span = 2 * r['scale'][0] * 1.05 / rr
        count = int(2 * 1.25 / span) + 1
        for j in range(count):
            a = (j - (count - 1) / 2) * span
            p, n = body_point(y, math.pi + a, 0.002)
            add(shingle(f'Breast.{row}.{j}', p, n, r['scale'][0], r['scale'][1], 0.006),
                m['shell'], 'body')
    # Seam rings round the barrel.
    for k, y in enumerate(r['seams']):
        ring = kit.torus(f'Seam.{k}', radius_at(y) + 0.0015, 0.0032, seg=(28, 4))
        ring.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
        ring.data.transform(Matrix.Diagonal((1, 1, D['body']['height'] / D['body']['width'], 1)))
        ring.data.transform(Matrix.Translation((0, y, 0)))
        ring.location = D['body']['center']
        ring.rotation_euler = (TILT, 0, 0)
        add(ring, m['joint'], 'body')
    # Back: yellow mantle scales high up, blue rump scales low, in shingled rows.
    for row, (y, count, span, mat) in enumerate(r['back']):
        for j in range(count):
            a = (j - (count - 1) / 2) * span
            p, n = body_point(y, a, 0.002)
            add(shingle(f'Mantle.{row}.{j}', p, n, r['scale'][0] * 1.05, r['scale'][1], 0.006),
                band if mat == 'band' else flight, 'body')
    # Rivets along each wing case.
    for side in (1, -1):
        for k, y in enumerate(r['rivets']):
            p, _ = body_point(y, math.radians(84), 0.004, side)
            add(ball(f'Rivet.{side}.{k}', p, 0.0055, seg=(8, 5)), m['joint'], 'body')
    add(kit.torus('Collar2', 0.083, 0.008, location=(0, -0.083, 0.395), rotation=(0.25, 0, 0)), m['bezel'], 'body')

    # Face plate: rows of little line-dots above the screen and beside the beak (no words),
    # and the beak hinge on each cheek with its bolt.
    for k in range(7):
        x = (k - 3) * 0.02
        add(ball(f'DotRow.{k}', on_head((x, -0.109 + 0.0035 * (abs(k - 3) / 3) ** 2, 0.096)), 0.0036, seg=(8, 5)),
            m['joint'], 'head')
    for sx in (-1, 1):
        for k in range(3):
            add(ball(f'Cheek.{sx}.{k}', on_head((sx * (0.052 + k * 0.014), -0.113 + 0.006 * k, -0.018)), 0.0034, seg=(8, 5)),
                m['joint'], 'head')
    bx, by, bz = D['beak']['base']
    for sx in (-1, 1):
        hinge = (sx * (D['beak']['width'] + 0.004), by + 0.02, bz - 0.006)
        add(kit.superellipsoid(f'Hinge.{sx}', (0.007, 0.016, 0.016), 0.6, 0.6, seg=(12, 8), location=hinge),
            m['bezel'], 'head')
        add(ball(f'HingeBolt.{sx}', add3(hinge, (sx * 0.007, 0, 0)), 0.0055, seg=(8, 5)), m['joint'], 'head')
    # Nostril cere on the beak's top, with two vented nostrils.
    add(kit.superellipsoid('Cere', (0.05, 0.02, 0.012), 0.5, 0.5, seg=(16, 8),
                           location=(bx, by - 0.026, bz + 0.078), rotation=(0.3, 0, 0)), patch, 'head')
    for sx in (-1, 1):
        add(kit.superellipsoid(f'Nostril.{sx}', (0.011, 0.007, 0.007), 0.6, 0.6, seg=(10, 6),
                               location=(sx * 0.024, by - 0.03, bz + 0.088), rotation=(0.3, 0, 0)), m['joint'], 'head')
        for k in range(2):
            add(small(f'Vent.{sx}.{k}', (sx * (0.038 + 0.008 * k), by - 0.018, bz + 0.086),
                      (sx * (0.038 + 0.008 * k), by - 0.04, bz + 0.09), (0.0025, 0.004)), m['joint'], 'head')
    # Tongue plate in the lower half (shows when the beak opens wide).
    add(small('Tongue', (0, by - 0.006, bz - 0.016), (0, by - 0.068, bz - 0.012), (0.004, 0.017)),
        m['beacon'], 'jaw')

    # Crest: a clasp across its base with a pin at each end, and shorter under-plates.
    cx, cy, cz = D['crest']['centre']
    add(small('CrestClasp', (-0.062, cy, cz - 0.012), (0.062, cy, cz - 0.012), (0.006, 0.011)), m['joint'], 'head')
    for sx in (-1, 1):
        add(ball(f'CrestPin.{sx}', (sx * 0.066, cy, cz - 0.012), 0.0065, seg=(8, 5)), m['bezel'], 'head')
    for k, a in enumerate([-34.5, -11.5, 11.5, 34.5]):
        ang = math.radians(a)
        base = Vector((cx + 0.05 * math.sin(ang), cy + 0.028 * (1 - math.cos(ang)), cz - 0.014))
        d = Vector((math.sin(ang) * 0.5, math.cos(ang) * math.cos(math.radians(14)), math.sin(math.radians(14))))
        add(small(f'CrestUnder.{k}', base, base + d * 0.07, (0.004, 0.02), Vector((math.cos(ang), -math.sin(ang), 0))),
            m['shell'], 'crest')

    # Wings: a rib and bolt on each slat, and a hinge pin through the shoulder with a washer.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, (a, z) in enumerate(slats(side)):
            up = TURN @ Vector((0, 0, 1))
            cut = Vector(a).lerp(Vector(z), 1 - D['wing']['lit'])
            add(small(f'Rib.{sfx}.{k}', Vector(a).lerp(Vector(z), 0.05), cut.lerp(Vector(a), 0.1), (0.0088, 0.0035), up),
                m['bezel'], f'wing.{sfx}.{k + 1}')
            add(ball(f'SlatBolt.{sfx}.{k}', Vector(a) + (Vector(z) - Vector(a)).normalized() * 0.014 + up * 0.007,
                     0.0045, seg=(8, 5)), m['joint'], f'wing.{sfx}.{k + 1}')
        hx, hy, hz = D['wing']['hinge']
        pin = Vector(on_body((side * (hx + 0.028), hy, hz)))
        washer = kit.superellipsoid(f'Pin.{sfx}', (0.006, 0.0125, 0.0125), 0.5, 0.5, seg=(14, 8))
        washer.data.transform(TURN.to_4x4())
        washer.location = pin
        add(washer, m['bezel'], f'wing.{sfx}')
        add(ball(f'PinBolt.{sfx}', pin + TURN @ Vector((side * 0.008, 0, 0)), 0.0065, seg=(8, 5)), m['joint'], f'wing.{sfx}')

    # Tail: a joint band and bolt at each feather joint and at the root.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a, z = tail_line(side)
        axis = (Vector(z) - Vector(a)).normalized()
        at = Vector(a)
        th, wd0 = D['tail']['slat']
        for k, ln in enumerate(D['tail']['parts']):
            wd = wd0 * (1.0, 0.95, 0.75)[k]
            add(small(f'TailBand.{sfx}.{k}', at + axis * 0.004, at + axis * 0.02, (th + 0.004, wd + 0.005),
                      Vector((1, 0, 0))), m['bezel'], f'tail.{sfx}')
            add(ball(f'TailBolt.{sfx}.{k}', at + axis * 0.012 + Vector((side * (th + 0.006), 0, 0)), 0.0042, seg=(8, 5)),
                m['joint'], f'tail.{sfx}')
            at = at + axis * (ln + D['tail']['gap'])

    # Legs: rings up the shin (one yellow), and on the feet a grip pad, toe rings and claw caps.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * D['leg']['x']
        for k, z in enumerate((0.052, 0.078, 0.098)):
            add(kit.torus(f'LegRing.{sfx}.{k}', 0.0225 if k != 1 else 0.0238, 0.0055, seg=(16, 4), location=(x, 0.0, z)),
                band if k == 1 else m['bezel'], f'leg.{sfx}')
        foot = Vector((x, D['leg']['ankle'][1], D['toes']['r']))
        to = D['toes']
        for k, ang in enumerate(to['front']):
            rr = math.radians(ang)
            d = Vector((math.sin(rr), -math.cos(rr), 0))
            end = foot + d * to['length']
            ring = kit.torus(f'ToeRing.{sfx}.{k}', to['r'] * 1.25, 0.0034, seg=(10, 4))
            orient(ring, d)
            ring.location = foot + d * to['length'] * 0.66
            add(ring, m['bezel'], f'leg.{sfx}')
            claw = kit.tube(f'Claw.{sfx}.{k}', [end - d * 0.004, end + d * 0.014 - Vector((0, 0, 0.008))],
                            [to['r'] * 1.15, to['r'] * 0.15], ring=8)[0]
            add(claw, m['role']('Claw', 'bezel'), f'leg.{sfx}')
        for k, ang in enumerate(to['back']):
            rr = math.radians(ang)
            d = Vector((math.sin(rr), math.cos(rr), 0))
            end = foot + d * to['rear']
            claw = kit.tube(f'ClawB.{sfx}.{k}', [end - d * 0.004, end + d * 0.012 - Vector((0, 0, 0.007))],
                            [to['r'] * 1.15, to['r'] * 0.15], ring=8)[0]
            add(claw, m['role']('Claw', 'bezel'), f'leg.{sfx}')
        add(small(f'Sole.{sfx}', (x, foot.y - 0.048, 0.0025), (x, foot.y + 0.04, 0.0025), (0.003, 0.028), Vector((0, 0, 1))),
            m['bezel'], f'leg.{sfx}')
        for k in range(3):
            add(small(f'Grip.{sfx}.{k}', (x - 0.022, foot.y - 0.03 + k * 0.026, 0.0055),
                      (x + 0.022, foot.y - 0.03 + k * 0.026, 0.0055), (0.0025, 0.004), Vector((0, 0, 1))),
                m['joint'], f'leg.{sfx}')

    # The lights he talks with: three dots rising away from the beak.
    for k, (p, r) in enumerate(D['talk']):
        add(ball(f'Talk.{k}', p, r, seg=(12, 8)), m['beacon'], f'talk.{k + 1}')

    # The walnut, in two halves round a glowing kernel, held at the beak's tip.
    tx, ty, tz = beak_tip()
    nr = D['nut']['r']
    for side, bone in ((1, 'nut.a'), (-1, 'nut.b')):
        half = kit.superellipsoid(f'Walnut.{side}', (nr,) * 3, 0.85, 0.85, seg=(14, 8), location=(tx, ty, tz))
        kit.cut(half, (side, 0, 0), 0.0)
        add(half, m['role']('Nut', 'joint'), bone)
    add(ball('Kernel', (tx, ty, tz), nr * 0.5, seg=(10, 6)), m['beacon'], 'nut')

    return looks.finish(kit.armature('MacawRig', rig_bones()), parts, skin, m)
