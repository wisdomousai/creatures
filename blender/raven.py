"""Nib, the crew's robot raven: a toy robot, not a raven in a robot suit. A sleek egg of
a body tipped breast up, a rounded-box head with a screen face under a visor brow, and
a big faceted beak in two halves, the lower one on its own bone so it opens to caw.

The wings are folding fans: on each side a plate that hugs the body (the wing case)
over three long slats, all hinged at the shoulder. Folded, the slats lie along the
body and step out past its tail end like a bird's folded flight feathers; the site
fans them out and swings the wing up to fly. The tip of every slat is lit, one
material per slat (Dot0 at the top to Dot2 at the bottom, the same on both wings), so
the site can run colours along the wing. The tail is a wedge of three slats, the
middle one longest, and the legs end in chunky three-and-one toes. The shiny thing he
collects is a hex nut with a sparkle on it, both in the beacon's colour, on their own
bones on the head (the site hides them until he finds one). Faces -Y like the rest of the crew;
about 0.5 m to the top of his head.
"""

import math

from mathutils import Matrix, Vector

import kit
import looks

FACE = 'raven'
PREVIEW = dict(lift=0.0, width=0.5)

# The body's tip: breast up, tail down (radians about X). Wings and tail are laid out
# in the body's own frame (see on_body) so they follow it.
TILT = -0.55

D = {
    # A teardrop along its own axis: a deep breast tapering to the rump (see body()).
    'body': dict(length=0.36, width=0.09, height=0.106, center=(0, 0.035, 0.195)),
    'neck': dict(points=[(0, -0.05, 0.26), (0, -0.1, 0.33)], r=0.064),
    # Tipped nose down a little, so the brow slopes into the beak.
    # Round over the top, squarer in plan so the screen sits flat on the front.
    'head': dict(radii=(0.075, 0.098, 0.072), center=(0, -0.13, 0.388), e=(0.7, 0.45), tip=0.12),
    # 16:7, like the raven's face layout (512 x 224); where it sits on the head, in the
    # head's own (untipped) frame.
    'screen': dict(radii=(0.064, 0.02, 0.028), at=(0, -0.083, 0.026), bezel=0.007),
    # The beak: two faceted halves meeting flat, drooping to a hooked tip.
    'beak': dict(base=(0, -0.155, 0.33), length=0.165, width=0.05, upper=0.062, lower=0.034, droop=0.04),
    # The wing case: the body's shape a little bigger, cut down to a plate on its side
    # (in the body's frame).
    'case': dict(scale=(1.1, 1.04, 1.07), side=0.03, below=-0.012, front=-0.13, back=0.085),
    # Wings, in the body's frame: the shoulder hinge; slats as (degrees down from the
    # body's axis, length, degrees in toward the tail, how far out) from their own
    # hinge on the flank, top slat first.
    'wing': dict(shoulder=(0.07, -0.1, 0.03), hinge=(0.09, -0.02, -0.008), lit=0.28, slat=(0.0055, 0.026),
                 slats=[(4, 0.32, 12, 0.014), (10, 0.29, 12, 0.007), (16, 0.26, 12, 0.0)]),
    # Tail: a wedge of three slats from under the rump (degrees below the body's axis;
    # the side slats fan out by the first number).
    'tail': dict(root=(0, 0.15, -0.02), angle=16, slats=[(0, 0.2), (15, 0.16), (-15, 0.16)], slat=(0.038, 0.006)),
    # The ruff: two fringes of pointed plates round the throat, hinged on their own bone
    # (centre, ring radius, how far down and out each row hangs, plates per row).
    'ruff': dict(centre=(0, -0.072, 0.292), r=0.062, rows=[(0.05, 0.02, 9, 0.016), (0.085, 0.032, 7, 0.02)]),
    'leg': dict(x=0.046, hip=(0.03, 0.14), ankle=(0.0, 0.03), r=0.013),
    'toes': dict(front=[-28, 0, 28], length=0.062, back=0.04, r=0.011),
    # The shiny thing, held in the beak (the site moves it).
    'nut': dict(r=0.022, hole=0.009, thick=0.012),
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
        r = b['width'] * math.sin(math.pi * u ** 0.8) ** 0.55
        profile.append((r, half - b['length'] * u))
    obj = kit.lathe(name, profile, seg=40)
    # Its axis from z to -y (the breast forward), then taller than wide.
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
    return x, y - b['length'] * 0.9, z - b['droop'] * 0.75


def half_beak(name, lower=False):
    """One half of the beak: rings of a faceted half-section from the base to a point,
    closed flat where the halves meet, flat-shaded so the facets catch the light."""
    b = D['beak']
    x0, y0, z0 = b['base']
    w0 = b['width']
    h0 = b['lower'] if lower else b['upper']
    length = b['length'] * (0.9 if lower else 1.0)
    # Across, then up (or down), for each corner of the section.
    section = [(-1, 0), (-0.72, 0.6), (0, 1), (0.72, 0.6), (1, 0)] if not lower else \
        [(-0.94, 0), (-0.55, -0.75), (0, -1), (0.55, -0.75), (0.94, 0)]
    n = 7
    verts, faces = [], []
    for i in range(n):
        t = i / n * (length / b['length'])
        y = y0 - b['length'] * t
        z = z0 - b['droop'] * t ** 2.2
        w = w0 * (1 - t) ** 0.85
        h = h0 * (1 - t) ** 0.7
        verts += [(x0 + w * sx, y, z + h * sz) for sx, sz in section]
    m = len(section)
    for i in range(n - 1):
        for k in range(m):
            a, c = i * m + k, i * m + (k + 1) % m
            faces.append((a, c, c + m, a + m))
    # The upper half hooks down over the lower one at the tip.
    t = length / b['length']
    tip = (x0, y0 - length, z0 - b['droop'] * t ** 2.2 - (0.012 if not lower else 0))
    verts.append(tip)
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


def plate(name, a, b, radii, up=Vector((0, 0, 1)), seg=(24, 10)):
    """A rounded plate from a to b (model points): thickness across `up`, width along it."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    thick, width = radii
    obj = kit.superellipsoid(name, (thick, (b - a).length / 2, width), 0.35, 0.35, seg=seg)
    # Local y along the plate, z its width (as near `up` as it can be), x its thickness.
    z = (up - axis * up.dot(axis)).normalized()
    x = axis.cross(z)
    obj.data.transform(Matrix((x, axis, z)).transposed().to_4x4())
    obj.location = (a + b) / 2
    return obj


def body_r(u):
    """The body's half-width at u along it (0 breast, 1 rump), before it is stretched."""
    return D['body']['width'] * math.sin(math.pi * u ** 0.8) ** 0.55


def skin_point(u, ang, out=0.0, belly=True):
    """A point on the body's skin in the body's frame: u along it, `ang` round it from the
    belly (or the back) line, pushed out by `out`; with the outward normal."""
    b = D['body']
    rx, rz = body_r(u), body_r(u) * b['height'] / b['width']
    sgn = -1 if belly else 1
    n = Vector((math.sin(ang), 0, sgn * math.cos(ang) * b['width'] / b['height'])).normalized()
    y = b['length'] * u - b['length'] / 2
    return Vector((rx * math.sin(ang), y, sgn * rz * math.cos(ang))) + n * out, n


def shingle(name, u, ang, length, wid, belly=True, lift=0.007):
    """A feather plate lying on the skin, its tip lifted and pointing toward the tail."""
    a, n = skin_point(u, ang, 0.001, belly)
    end, _ = skin_point(u + length / D['body']['length'], ang, lift, belly)
    tangent = n.cross(Vector((0, 1, 0))).normalized()
    return plate(name, on_body(a), on_body(end), (0.003, wid), TURN @ tangent, seg=(10, 6))


def toward(v):
    """Euler rotation turning a part built along local z to point along v."""
    return tuple(Vector((0, 0, 1)).rotation_difference(Vector(v).normalized()).to_euler())


def bolt(name, at, direction, r=0.007, height=0.004, seg=6):
    """A hex bolt head standing out of a surface along `direction`."""
    obj = kit.lathe(name, [(0, height), (r, height * 0.8), (r, 0), (0, 0)], seg=seg, location=at,
                    rotation=toward(direction))
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def beak_top(t):
    """The ridge along the top of the upper beak at t (0 base, 1 tip), in the model."""
    b = D['beak']
    x0, y0, z0 = b['base']
    return Vector((x0, y0 - b['length'] * t, z0 - b['droop'] * t ** 2.2 + b['upper'] * (1 - t) ** 0.7))


def nut(name, centre):
    """A hex nut, standing on edge across the beak."""
    n = D['nut']
    r, hole, th = n['r'], n['hole'], n['thick']
    obj = kit.lathe(name, [(hole, th / 2), (r, th / 2), (r, -th / 2), (hole, -th / 2), (hole, th / 2)], seg=6,
                    location=centre, rotation=(math.pi / 2, 0, math.pi / 6))
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def sparkle(name, centre, size):
    """A four-pointed glint, with shorter points front and back so it reads from any side."""
    verts, faces = [], []
    for axis, reach in ((0, size), (2, size), (1, size * 0.45)):
        for sign in (1, -1):
            tip = [0.0, 0.0, 0.0]
            tip[axis] = sign * reach
            base = len(verts)
            verts.append(tuple(tip))
            others = [a for a in range(3) if a != axis]
            for k in range(4):
                p = [0.0, 0.0, 0.0]
                p[others[0]] = size * 0.13 * math.cos(k * math.pi / 2)
                p[others[1]] = size * 0.13 * math.sin(k * math.pi / 2)
                verts.append(tuple(p))
            faces += [(base, base + 1 + k, base + 1 + (k + 1) % 4) for k in range(4)]
    obj = kit.mesh_object(name, verts, faces, location=centre)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
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


def tail_slats():
    t = D['tail']
    root = Vector(t['root'])
    out = []
    for fan, length in t['slats']:
        d, f = math.radians(t['angle']), math.radians(fan)
        axis = Vector((math.sin(f) * math.cos(d), math.cos(f) * math.cos(d), -math.sin(d)))
        out.append((on_body(root), on_body(root + axis * length)))
    return out


def rig_bones():
    lg, b = D['leg'], D['beak']
    hinge = (0, b['base'][1] + 0.01, b['base'][2])
    tip = beak_tip()
    root, _ = tail_slats()[0]
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # Pivots at the hips, so he can bob and bow over his feet.
        ('body', (0, 0.03, 0.15), (0, -0.05, 0.33), 'root'),
        ('head', (0, -0.09, 0.32), (0, -0.12, 0.47), 'body'),
        ('jaw', hinge, (0, hinge[1] - 0.12, hinge[2]), 'head'),
        ('tail', root, tail_slats()[0][1], 'body'),
        ('ruff', D['ruff']['centre'], add3(D['ruff']['centre'], (0, 0, 0.05)), 'body'),
        ('nut', tip, add3(tip, (0, 0, 0.05)), 'head'),
        ('glint', tip, add3(tip, (0, 0, 0.04)), 'nut'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'tail.{sfx}', root, tail_slats()[1 if side > 0 else 2][1], 'tail'))
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

    # Body and neck.
    add(body('Body'), m['shell'], 'body')
    n = D['neck']
    neck, ts = kit.tube('Neck', kit.resample(n['points'], 6), n['r'], ring=24)
    add(neck, m['role']('Sheen', 'shell'), kit.chain(ts, ['body', 'head']))

    # Head: the screen face under a brow, and the beak.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], *h['e'], seg=(40, 28), location=h['center'],
                           rotation=(h['tip'], 0, 0)), m['shell'], 'head')
    sc = D['screen']
    tip = Matrix.Rotation(h['tip'], 3, 'X')
    glass, rim = kit.screen('Raven', sc['radii'], (0, 0, 0), sc['bezel'], e=0.4)
    for part in (glass, rim):
        part.location = Vector(h['center']) + tip @ (Vector(sc['at']) + part.location)
        part.rotation_euler = (h['tip'], 0, 0)
        add(part, m['face'] if part is glass else m['bezel'], 'head')
    add(half_beak('Beak'), m['role']('Beak', 'bezel'), 'head')
    add(half_beak('Jaw', lower=True), m['role']('Beak', 'bezel'), 'jaw')

    # Wings: a case hugging the body over three slats with lit tips.
    w, c = D['wing'], D['case']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        case = body(f'Case.{sfx}', c['scale'])
        kit.cut(case, (side, 0, 0), c['side'])
        kit.cut(case, (0, 0, 1), c['below'])
        kit.cut(case, (0, 1, 0), c['front'])
        kit.cut(case, (0, -1, 0), -c['back'])
        add(case, m['role']('Sheen', 'shell'), 'body')
        for k, (a, z) in enumerate(slats(side)):
            cut = Vector(a).lerp(Vector(z), 1 - w['lit'])
            up = TURN @ Vector((0, 0, 1))
            add(plate(f'Slat.{sfx}.{k}', a, cut.lerp(Vector(z), 0.03), w['slat'], up), m['shell'], f'wing.{sfx}.{k + 1}')
            add(plate(f'SlatTip.{sfx}.{k}', cut, z, w['slat'], up), m['dot'](k), f'wing.{sfx}.{k + 1}')

    # Ruff: fringes of plates, the second row hanging lower and out, fanned over the breast.
    ru = D['ruff']
    cx, cy, cz = ru['centre']
    for row, (drop, out, count, wid) in enumerate(ru['rows']):
        for k in range(count):
            a = math.radians(-100 + 200 * k / (count - 1) + (10 if row else 0))
            # Around the front of the throat (a = 0 is straight ahead, -y).
            top = (cx + ru['r'] * math.sin(a), cy - ru['r'] * math.cos(a) * 0.95, cz - 0.006 * row)
            end = (cx + (ru['r'] + out) * math.sin(a), cy - (ru['r'] + out) * math.cos(a) * 0.95, cz - drop)
            add(plate(f'Ruff.{row}.{k}', top, end, (0.006, wid), Vector((math.sin(a), -math.cos(a), 0))), m['role']('Sheen', 'shell'), 'ruff')

    # Tail: a wedge of three slats.
    t = D['tail']
    up = TURN @ Vector((0, 0, 1))
    for k, (a, z) in enumerate(tail_slats()):
        # Lying flat, so width is across (x) and thickness is up.
        th, wd = t['slat']
        obj = plate(f'Tail.{k}', a, z, (wd, th), Vector((1, 0, 0)))
        add(obj, m['shell'], ('tail', 'tail.L', 'tail.R')[k])

    # Legs: a cuff where they leave the body, a shin, a ball ankle, three toes forward
    # and one back, each with a knuckle.
    lg, to = D['leg'], D['toes']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        hip, ankle = (x, *lg['hip']), (x, *lg['ankle'])
        add(kit.tube(f'Shin.{sfx}', [hip, ankle], lg['r'], ring=12)[0], m['joint'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Cuff.{sfx}', (0.026, 0.026, 0.022), 0.5, 1.0, seg=(20, 10),
                               location=(x, 0.022, 0.1)), m['shell'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Ankle.{sfx}', (0.018,) * 3, seg=(16, 10), location=ankle), m['joint'], f'leg.{sfx}')
        foot = (x, ankle[1], to['r'])
        for k, a in enumerate(to['front']):
            r = math.radians(a + side * 6)
            end = (x + math.sin(r) * to['length'], ankle[1] - math.cos(r) * to['length'], to['r'])
            add(kit.tube(f'Toe.{sfx}.{k}', [foot, end], to['r'], ring=10)[0], m['joint'], f'leg.{sfx}')
            add(kit.superellipsoid(f'Knuckle.{sfx}.{k}', (to['r'] * 1.35,) * 3, seg=(12, 8),
                                   location=tuple((u + v) / 2 for u, v in zip(foot, end))), m['shell'], f'leg.{sfx}')
        add(kit.tube(f'Toe.{sfx}.back', [foot, (x, ankle[1] + to['back'], to['r'])], to['r'], ring=10)[0], m['joint'],
            f'leg.{sfx}')

    # ---- Refinement: plates, pins, ridges and rings, all small and neat. ----
    shellm, sheen, joint = m['shell'], m['role']('Sheen', 'shell'), m['joint']
    beakm = m['role']('Beak', 'bezel')
    # Feather plates in shingled rows over the breast (belly side) and a strip down the back.
    for row, u in enumerate((0.16, 0.26, 0.36, 0.46, 0.56)):
        count = 5 if row % 2 == 0 else 4
        span_a = math.radians(64 if row < 4 else 44)
        for k in range(count):
            ang = -span_a + 2 * span_a * k / (count - 1)
            add(shingle(f'Breast.{row}.{k}', u, ang, 0.05, 0.02), sheen, 'body')
    for row, u in enumerate((0.3, 0.42, 0.54, 0.66, 0.78)):
        for k in range(3):
            add(shingle(f'Back.{row}.{k}', u, math.radians(-13 + 13 * k), 0.05, 0.011, belly=False), sheen, 'body')

    # Wing detail: a spine rib down every slat, a hinge pin at each shoulder, bolts on the case.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        up = TURN @ Vector((0, 0, 1))
        for k, (a, z) in enumerate(slats(side)):
            lo, hi = Vector(a), Vector(z)
            lift = up * 0.004
            add(plate(f'Rib.{sfx}.{k}', lo + lift, lo.lerp(hi, 1 - w['lit']) + lift, (0.0045, 0.0032), up, seg=(10, 6)),
                joint, f'wing.{sfx}.{k + 1}')
        hx, hy, hz = w['hinge']
        pin = Vector(on_body((side * (hx + 0.007), hy, hz)))
        out = TURN @ Vector((side, 0, 0))
        add(kit.lathe(f'Pin.{sfx}', [(0, 0.01), (0.012, 0.009), (0.012, 0), (0, 0)], seg=16, location=pin,
                      rotation=toward(out)), joint, f'wing.{sfx}')
        add(bolt(f'PinBolt.{sfx}', pin + out * 0.01, out, 0.006, 0.004), shellm, f'wing.{sfx}')
        for k, (fy, fz) in enumerate(((-0.06, -0.04), (0.02, 0.0))):
            add(bolt(f'CaseBolt.{sfx}.{k}', on_body((side * 0.098, fy, fz)), out, 0.0055, 0.004), joint, 'body')

    # Head: a visor brow with a light strip under it, cheek bolts, a collar ring on the neck.
    hc = Vector(h['center'])

    def on_head(p):
        return tuple(hc + tip @ Vector(p))
    add(plate('Brow', on_head((-0.066, -0.101, 0.044)), on_head((0.066, -0.101, 0.044)), (0.006, 0.015),
              tip @ Vector((0, -1, 0.3)), seg=(20, 8)), shellm, 'head')
    add(plate('BrowLight', on_head((-0.056, -0.1, 0.03)), on_head((0.056, -0.1, 0.03)), (0.0035, 0.004),
              tip @ Vector((0, -1, 0)), seg=(16, 6)), m['dot'](1), 'head')
    for side in (1, -1):
        add(bolt(f'Cheek.{side}', on_head((side * 0.073, -0.06, -0.01)), tip @ Vector((side, 0, 0)), 0.0065, 0.004),
            joint, 'head')
    add(kit.torus('Collar', 0.064, 0.0085, seg=(28, 8), location=(0, -0.093, 0.322),
                  rotation=toward((0, -0.05, 0.07))), joint, 'head')

    # Beak: a ridge along the top, a hinge bolt on each side, nostril vents.
    bk = D['beak']
    add(plate('Ridge', beak_top(0.04) + Vector((0, 0, 0.003)), beak_top(0.5) + Vector((0, 0, 0.004)), (0.005, 0.005),
              Vector((1, 0, 0)), seg=(10, 6)), beakm, 'head')
    bx, by, bz = bk['base']
    for side in (1, -1):
        hx = side * bk['width'] * 0.96
        add(kit.lathe(f'BeakHinge.{side}', [(0, 0.008), (0.011, 0.007), (0.011, 0), (0, 0)], seg=12,
                      location=(hx, by + 0.012, bz - 0.001), rotation=toward((side, 0, 0))), joint, 'head')
        add(bolt(f'BeakBolt.{side}', (hx + side * 0.008, by + 0.012, bz - 0.001), (side, 0, 0), 0.005, 0.003),
            shellm, 'head')
        add(kit.superellipsoid(f'Nostril.{side}', (0.0035, 0.011, 0.005), seg=(10, 6),
                               location=(side * 0.013, by - 0.028, bz + 0.03), rotation=(-0.25, 0, 0)), joint, 'head')

    # Tail: four more plates fanned between the three, and a hinge cap at the root.
    rt = Vector(t['root'])
    for k, (fan, length, bone) in enumerate(((7, 0.185, 'tail'), (-7, 0.185, 'tail'),
                                             (23, 0.14, 'tail.L'), (-23, 0.14, 'tail.R'))):
        d, f = math.radians(t['angle']), math.radians(fan)
        axis_t = Vector((math.sin(f) * math.cos(d), math.cos(f) * math.cos(d), -math.sin(d)))
        add(plate(f'TailPlate.{k}', on_body(rt), on_body(rt + axis_t * length), (t['slat'][1], t['slat'][0]),
                  Vector((1, 0, 0)), seg=(16, 8)), sheen, bone)
    add(kit.superellipsoid('TailCap', (0.02, 0.014, 0.016), 0.6, 0.6, seg=(14, 8),
                           location=tuple(Vector(on_body(rt)) + Vector((0, -0.004, 0.006)))), joint, 'tail')

    # Legs: rings on the shin and ankle, a bead per toe and a claw cap on every toe.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        hip, ankle = Vector((x, *lg['hip'])), Vector((x, *lg['ankle']))
        for k, f in enumerate((0.3, 0.62)):
            add(kit.torus(f'ShinRing.{sfx}.{k}', 0.0135, 0.0045, seg=(16, 6), location=tuple(hip.lerp(ankle, f)),
                          rotation=toward(ankle - hip)), shellm, f'leg.{sfx}')
        add(kit.torus(f'AnkleRing.{sfx}', 0.021, 0.005, seg=(18, 6), location=tuple(ankle + Vector((0, 0, 0.003))),
                      rotation=(math.pi / 2, 0, 0)), shellm, f'leg.{sfx}')
        foot = Vector((x, ankle.y, to['r']))
        for k, a in enumerate(to['front']):
            r = math.radians(a + side * 6)
            dirv = Vector((math.sin(r), -math.cos(r), 0))
            end = foot + dirv * to['length']
            add(kit.superellipsoid(f'ToeBead.{sfx}.{k}', (to['r'] * 1.15,) * 3, seg=(10, 6),
                                   location=tuple(foot.lerp(end, 0.82))), joint, f'leg.{sfx}')
            add(kit.lathe(f'Claw.{sfx}.{k}', [(0, 0.024), (to['r'] * 0.55, 0.012), (to['r'] * 1.05, 0)], seg=8,
                          location=tuple(end), rotation=toward(dirv + Vector((0, 0, -0.25)))), beakm, f'leg.{sfx}')
        endb = Vector((x, ankle.y + to['back'], to['r']))
        add(kit.lathe(f'Claw.{sfx}.back', [(0, 0.02), (to['r'] * 0.55, 0.01), (to['r'] * 1.05, 0)], seg=8,
                      location=tuple(endb), rotation=toward((0, 1, -0.25))), beakm, f'leg.{sfx}')

    # The shiny thing: a hex nut and its sparkle.
    tip = beak_tip()
    add(nut('Nut', tip), m['beacon'], 'nut')
    add(sparkle('Glint', (tip[0] + 0.02, tip[1] - 0.01, tip[2] + 0.025), 0.03), m['beacon'], 'glint')

    return looks.finish(kit.armature('RavenRig', rig_bones()), parts, skin, m)
