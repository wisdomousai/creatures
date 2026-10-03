"""Oops, the crew's robot blue tang: a toy robot, not a fish in a robot suit. A tall,
laterally flat oval of smooth plates (a fat coin standing on its edge), cut into three
segments (head, trunk, tail stock) on a chain of joints with dark rings in the seams, so
it bends in steps as it swims. Ribbed fins made of rounded blades: a tall dorsal sail and
a smaller anal fan, little pectoral fins that flutter on ball joints and a crescent tail fin in two lobes on bones of their own, so it sweeps.

The face is a tall visor screen wrapped round the front of the head, so the big round
eyes sit at its corners, where a fish's eyes are, and still show from the side; the small
mouth is drawn at its middle, on the snout. On top of the head sits a little beacon on a
stalk and three thought-bubble lights rising from it, tucked away in the head until the
site pops them up (a forgetful fish's "hold on, what was I..." and its lightbulb).

On each flank a swirl of twelve round plates winds inward, each its own material (Dot0 on
the outside to Dot11 in the middle), so the site can run a light round it. In the colour
look the shell is royal blue, the swirl plates go from deep navy to glowing cyan, and the
tail stock, tail fin and pectoral fins are yellow. Faces -Y like the rest of the crew;
about 0.47 m from nose to tail tip and 0.4 m tall.
"""

import math

import numpy as np
from mathutils import Matrix, Vector

import kit
import looks

FACE = 'tang'
PREVIEW = dict(lift=0.0, width=0.5)

# The body's cross-section is a superellipse: 1 is an ellipse, lower is boxier.
E = 0.7
ZC = 0.215

D = {
    # The body's outline, nose to tail stock: (y, half-width, half-height, centre z). The
    # first and last are the tips, closed to a point. Tall and thin: a coin on its edge.
    'body': [
        (-0.196, 0.0, 0.0, ZC),
        (-0.191, 0.016, 0.03, ZC),
        (-0.18, 0.031, 0.058, ZC),
        (-0.162, 0.042, 0.09, ZC),
        (-0.134, 0.050, 0.118, ZC),
        (-0.096, 0.055, 0.136, ZC),
        (-0.05, 0.057, 0.141, ZC),
        (-0.004, 0.055, 0.133, ZC),
        (0.04, 0.047, 0.11, ZC),
        (0.078, 0.037, 0.078, ZC),
        (0.104, 0.029, 0.05, ZC),
        (0.12, 0.024, 0.038, ZC),
        (0.129, 0.0, 0.0, ZC),
    ],
    # (part, from y, to y, bone, role in the colour look or None); gaps between are the seams.
    'segments': [
        ('Head', -0.2, -0.094, 'head', None),
        ('Trunk', -0.088, 0.052, 'body', None),
        ('Stock', 0.058, 0.13, 'spine.1', 'Yellow'),
    ],
    # The swirl: eight plates winding in from the upper front, (angle from, step) in
    # radians round its centre (y, height above the body's middle), radius from r0 to r1.
    'swirl': dict(centre=(-0.014, 0.0), r0=0.078, r1=0.02, a0=-2.4, turns=1.3, n=12, plate=(0.0175, 0.0085),
                  thick=0.0042, e=0.85),
    # The visor wraps round the front of the head at this height, back to y_back on each side.
    'visor': dict(z=0.235, hz=0.066, y_back=-0.1, bezel=0.003),
    'bolt': dict(r=0.0055),
    # Fins: blades fanned from a hub, (angle, length) each; angles in degrees.
    'pectoral': dict(y=-0.09, height=-0.45, blades=((-30, 0.056), (-5, 0.064), (20, 0.056)), width=0.03,
                     thick=0.007, drop=0.35),
    # The dorsal sail: blades rooted along the back, (y, angle back from upright, length).
    'dorsal': dict(rays=((-0.082, -22, 0.05), (-0.058, -10, 0.07), (-0.034, 2, 0.082), (-0.01, 14, 0.086),
                         (0.014, 26, 0.082), (0.036, 38, 0.072), (0.054, 50, 0.058)),
                   split=-0.014, width=0.05, thick=0.006),
    # The anal fan below: (y, angle back from straight down, length).
    'anal': dict(rays=((-0.03, -14, 0.042), (-0.006, 0, 0.056), (0.018, 14, 0.062), (0.04, 28, 0.056),
                       (0.056, 42, 0.046)),
                 split=0.016, width=0.046, thick=0.006),
    # The tail's crescent: blades fanned from the hub, (angle up from straight back, length);
    # the lower lobe mirrors it.
    'tail': dict(y=0.136, blades=((50, 0.158), (33, 0.15), (17, 0.122), (3, 0.09)), width=0.05, thick=0.006),
    'thought': dict(dome=(0.0, -0.125, 0.345), r=0.0125, bubbles=((0.0, -0.148, 0.372, 0.0075),
                                                                (0.0, -0.158, 0.396, 0.0105),
                                                                (0.0, -0.172, 0.426, 0.0155))),
    'bubbles': dict(at=(0, -0.19, 0.215), radii=(0.014, 0.011, 0.016, 0.012, 0.009)),
}


# ---------- The body's shape ----------


def catmull(points, n):
    """A smooth curve through the points (tuples of any length), n samples per span."""
    P = [tuple(p) for p in points]
    P = [tuple(2 * a - b for a, b in zip(P[0], P[1])), *P, tuple(2 * a - b for a, b in zip(P[-1], P[-2]))]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t
                                    + (3 * b - a - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(P[-2])
    return out


RINGS = np.array(catmull(D['body'], 6))
NOSE = float(RINGS[0, 0])
HEAD_Y = -0.10  # a point inside the head, to tell outward from inward


def section(y):
    """(half-width, half-height, centre z) of the body at y."""
    ys = RINGS[:, 0]
    return tuple(float(np.interp(y, ys, RINGS[:, i])) for i in (1, 2, 3))


def surface(y, theta, out=0.0):
    """A point on the body at y, `theta` round it (radians, 0 at its left side, + up),
    and the outward normal there; `out` pushes the point out along the normal."""

    def at(y, th):
        hw, hh, zc = section(y)
        return Vector((hw * kit.spow(math.cos(th), E), y, zc + hh * kit.spow(math.sin(th), E)))

    p = at(y, theta)
    du = at(y, theta + 1e-4) - at(y, theta - 1e-4)
    dv = at(y + 1e-4, theta) - at(y - 1e-4, theta)
    n = du.cross(dv).normalized()
    if n.dot(Vector((p.x, 0, p.z - section(y)[2]))) < 0:
        n = -n
    return p + n * out, n


def flank(y, share, out=0.0):
    """surface() on the body's left side, `share` of the half-height above (or below) its middle."""
    return surface(y, math.asin(math.copysign(abs(share) ** (1 / E), share)), out)


def loft(name, y0, y1, grow=1.0, n=40):
    """The body between y0 and y1, as a closed shape (the ends to be cut off)."""
    ys = [y for y in RINGS[:, 0] if y0 < y < y1]
    ys = [max(y0, RINGS[0, 0]), *ys, min(y1, RINGS[-1, 0])]
    verts, faces = [], []
    for y in ys:
        hw, hh, zc = section(y)
        for i in range(n):
            th = 2 * math.pi * i / n
            verts.append((grow * hw * kit.spow(math.cos(th), E), y, zc + grow * hh * kit.spow(math.sin(th), E)))
    for j in range(len(ys) - 1):
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    for end, y in ((0, ys[0]), (len(ys) - 1, ys[-1])):
        pole = len(verts)
        verts.append((0, y, section(y)[2]))
        faces += [(end * n + i, end * n + (i + 1) % n, pole) for i in range(n)]
    return kit.mesh_object(name, verts, faces)


def segment(name, y0, y1):
    """A slice of the body, cut flat at the seams."""
    obj = loft(name, y0 - 0.01, y1 + 0.01)
    if y0 > RINGS[0, 0]:
        kit.cut(obj, (0, 1, 0), y0)
    if y1 < RINGS[-1, 0]:
        kit.cut(obj, (0, -1, 0), -y1)
    return obj


# ---------- Parts ----------


def orient(obj, origin, x, y, z):
    """Turn a part built round the origin so its local axes lie along x, y, z, and move it to `origin`."""
    x, y, z = Vector(x).normalized(), Vector(y).normalized(), Vector(z).normalized()
    m = Matrix((
        (x.x, y.x, z.x, origin[0]),
        (x.y, y.y, z.y, origin[1]),
        (x.z, y.z, z.z, origin[2]),
        (0, 0, 0, 1),
    ))
    obj.data.transform(m)
    obj.data.update()
    return obj


def blade(name, root, direction, normal, length, width, thick, taper=-0.3):
    """A fin blade: a flat rounded paddle from `root` along `direction`, a little wider
    at its tip, its flat face toward `normal`."""
    d, n = Vector(direction).normalized(), Vector(normal).normalized()
    obj = kit.superellipsoid(name, (width / 2, thick / 2, length / 2), 0.5, 0.5, seg=(20, 12), taper=taper)
    return orient(obj, Vector(root) + d * length * 0.48, d.cross(n) * -1, n, d)


def hsection(z, y_back, steps=240):
    """The head's outline at height z, seen from above, as (x, y): from y_back on its
    right side, round the nose, and back to y_back on its left."""
    half = []
    for y in np.linspace(y_back, RINGS[0, 0], steps):
        hw, hh, zc = section(y)
        k = abs(z - zc) / hh if hh > 1e-6 else 2
        if k >= 1:
            break
        half.append((hw * (1 - k ** (2 / E)) ** (E / 2), float(y)))
    tip = half[-1][1] - 0.0015
    return [(-x, y) for x, y in half] + [(0.0, tip)] + [(x, y) for x, y in reversed(half)]


def wrap(name, z, hz, y_back, out, inside=0.008, ns=48, nz=8):
    """A curved slab lying on the head round its front, `hz` either side of height z,
    `out` proud of the shell: the visor's screen, or its bezel. UVs run along it (u from
    its right end to its left) and up it, for the face. Its ends are rounded off."""
    rows = []
    for j in range(nz):
        v = j / (nz - 1)
        zz = z - hz + 2 * hz * v
        pts = kit.resample([(x, y, 0) for x, y in hsection(zz, y_back)], ns)
        rows.append((zz, v, [Vector(p) for p in pts]))
    verts, uvs, faces = [], [], []
    for layer, off in ((0, out), (1, -inside)):
        for zz, v, pts in rows:
            for i, p in enumerate(pts):
                t = pts[min(i + 1, ns - 1)] - pts[max(i - 1, 0)]
                nrm = Vector((t.y, -t.x, 0)).normalized()
                if nrm.dot(Vector((p.x, p.y - HEAD_Y, 0))) < 0:
                    nrm = -nrm
                u = i / (ns - 1)
                # Round the ends: pull the top and bottom rows in near each end.
                k = (1 - abs(2 * u - 1) ** 6) ** (1 / 6)
                q = p + nrm * off
                verts.append((q.x, q.y, z + (zz - z) * k))
                uvs.append((u, 0.5 + (zz - z) / (2 * hz)))
    per = nz * ns
    for layer in (0, 1):
        base = layer * per
        for j in range(nz - 1):
            for i in range(ns - 1):
                a = base + j * ns + i
                faces.append((a, a + 1, a + ns + 1, a + ns))
    edge = [(0, i) for i in range(ns)] + [(j, ns - 1) for j in range(nz)] + \
           [(nz - 1, i) for i in range(ns - 1, -1, -1)] + [(j, 0) for j in range(nz - 1, -1, -1)]
    for (j0, i0), (j1, i1) in zip(edge, edge[1:]):
        a, b = j0 * ns + i0, j1 * ns + i1
        if a != b:
            faces.append((a, b, b + per, a + per))
    obj = kit.mesh_object(name, verts, faces)
    uv = obj.data.uv_layers.new(name='UVMap')
    co = [tuple(round(c, 6) for c in v) for v in verts]
    lookup = {c: uvs[i] for i, c in enumerate(co) if i < per}
    for loop in obj.data.loops:
        key = tuple(round(c, 6) for c in obj.data.vertices[loop.vertex_index].co)
        uv.data[loop.index].uv = lookup.get(key, (0.5, 0.5))
    return obj


def arc_length(z, y_back):
    pts = [Vector((x, y, 0)) for x, y in hsection(z, y_back)]
    return sum((b - a).length for a, b in zip(pts, pts[1:]))


def swirl_points():
    """Where the swirl's plates sit: (y, share of the half-height there, radius)."""
    s = D['swirl']
    out = []
    for i in range(s['n']):
        u = i / (s['n'] - 1)
        r = s['r0'] + (s['r1'] - s['r0']) * u ** 0.9
        a = s['a0'] + s['turns'] * 2 * math.pi * u
        y = s['centre'][0] + r * math.cos(a) * 1.05
        z = s['centre'][1] + r * math.sin(a) * 1.25
        hh = section(y)[1]
        share = max(-0.86, min(0.86, z / hh))
        out.append((y, share, s['plate'][0] + (s['plate'][1] - s['plate'][0]) * u))
    return out


def rig_bones():
    zc = ZC
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # The trunk: the fish turns about its middle.
        ('body', (0, -0.06, zc), (0, -0.01, zc), 'root'),
        ('head', (0, -0.1, zc), (0, -0.2, zc), 'body'),
        ('spine.1', (0, 0.0, zc), (0, 0.13, zc), 'body'),
        ('tail', (0, 0.134, zc), (0, 0.2, zc), 'spine.1'),
        ('mouth', (0, -0.19, zc), (0, -0.2, zc), 'head'),
        ('tail.U', (0, 0.134, zc + 0.006), (0, 0.16, zc + 0.11), 'tail'),
        ('tail.D', (0, 0.134, zc - 0.006), (0, 0.16, zc - 0.11), 'tail'),
    ]
    do = D['dorsal']
    top = lambda y: section(y)[2] + section(y)[1]  # noqa: E731
    bones.append(('dorsal', (0, do['rays'][0][0], top(do['rays'][0][0])), (0, do['split'], top(do['split']) + 0.05), 'body'))
    bones.append(('dorsal.2', (0, do['split'], top(do['split'])), (0, do['rays'][-1][0], top(do['rays'][-1][0]) + 0.05),
                  'dorsal'))
    an = D['anal']
    bot = lambda y: section(y)[2] - section(y)[1]  # noqa: E731
    bones.append(('anal', (0, an['rays'][0][0], bot(an['rays'][0][0])), (0, an['split'], bot(an['split']) - 0.05), 'body'))
    bones.append(('anal.2', (0, an['split'], bot(an['split'])), (0, an['rays'][-1][0], bot(an['rays'][-1][0]) - 0.05),
                  'anal'))
    pe = D['pectoral']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        p, _ = flank(pe['y'], pe['height'])
        bones.append((f'fin.{sfx}', (side * p.x, p.y, p.z), (side * (p.x + 0.04), p.y + 0.03, p.z - 0.02), 'body'))
    th = D['thought']
    x, y, z = th['dome']
    bones.append(('thought', (x, y, z - 0.01), (x, y, z + 0.02), 'head'))
    for i, (bx, by, bz, _) in enumerate(th['bubbles']):
        bones.append((f'thought.{i}', (bx, by, bz), (bx, by, bz + 0.02), 'head'))
    b = D['bubbles']
    for i in range(len(b['radii'])):
        x, y, z = b['at']
        bones.append((f'bubble.{i}', (x, y, z), (x, y, z + 0.03), None))
    return bones


def refine(add, m):
    """The finer hardware: bezels round the swirl plates, rivets round the seams, ribs and
    hinge pins on every fin, the tail's lit spine, gill vents and the beacon's collar."""
    sw = D['swirl']
    X = Vector((1, 0, 0))
    # Each swirl plate sits in a dark bezel, a little wider and thinner.
    for i, (y, share, r) in enumerate(swirl_points()):
        for side, sfx in ((1, 'L'), (-1, 'R')):
            p, n = flank(y, share, sw['thick'] * 0.05)
            p.x *= side
            n.x *= side
            along = Vector((0, 1, 0))
            obj = kit.superellipsoid(f'SwirlBezel.{i}.{sfx}', (r * 1.3, r * 1.3, sw['thick'] * 0.8), sw['e'], sw['e'],
                                     seg=(16, 4))
            add(orient(obj, p, along, n.cross(along), n), m['joint'], 'body')

    # Rivets round each seam ring, above and below the flank bolts.
    segs = D['segments']
    for (_, _, y1, _, _), (name, y0, _, bone, _) in zip(segs, segs[1:]):
        y = (y1 + y0) / 2
        for k, deg in enumerate((50, 130, 230, 310)):
            for side, sfx in ((1, 'L'), (-1, 'R')):
                p, _ = surface(y, math.radians(deg), 0.001)
                p.x *= side
                add(kit.superellipsoid(f'Rivet.{name}.{k}.{sfx}', (0.0038,) * 3, seg=(8, 5), location=p), m['joint'], bone)

    # A collar round the snout and a round cap on its tip.
    y = -0.178
    hw, hh, zc = section(y)
    add(kit.superellipsoid('SnoutBand', (hw * 1.03, 0.005, hh * 1.03), E, E, seg=(24, 6), location=(0, y, zc)),
        m['joint'], 'head')
    add(kit.superellipsoid('SnoutCap', (0.007, 0.005, 0.007), seg=(10, 6), location=(0, NOSE + 0.001, ZC)),
        m['joint'], 'head')

    # Gill vents: three slits on each side of the crown.
    for k, y in enumerate((-0.16, -0.15, -0.14)):
        for side, sfx in ((1, 'L'), (-1, 'R')):
            p, n = surface(y, math.radians(78), 0.0005)
            p.x *= side
            n.x *= side
            slit = kit.superellipsoid(f'Gill.{k}.{sfx}', (0.0085, 0.0011, 0.0022), 0.5, 0.5, seg=(10, 4))
            add(orient(slit, p, X, n.cross(X), n), m['joint'], 'head')

    # Fin ribs (a narrow raised spine down each blade) and hinge pins at the roots.
    do = D['dorsal']
    for k, (y, deg, length) in enumerate(do['rays']):
        a = math.radians(deg)
        hw, hh, zc = section(y)
        root = Vector(((k % 2) * 0.004 - 0.002, y, zc + hh * 0.93))
        bone = 'dorsal' if y < do['split'] else 'dorsal.2'
        add(blade(f'DorsalRib.{k}', root, Vector((0, math.sin(a), math.cos(a))), (1, 0, 0), length * 0.94,
                  do['width'] * 0.1, do['thick'] * 1.7, taper=0), m['joint'], bone)
        add(kit.superellipsoid(f'DorsalPin.{k}', (0.0065, 0.0045, 0.0065), seg=(8, 5), location=root + Vector((0, 0, 0.003))),
            m['joint'], bone)
    an = D['anal']
    for k, (y, deg, length) in enumerate(an['rays']):
        a = math.radians(deg)
        hw, hh, zc = section(y)
        root = Vector(((k % 2) * 0.004 - 0.002, y, zc - hh * 0.93))
        bone = 'anal' if y < an['split'] else 'anal.2'
        add(blade(f'AnalRib.{k}', root, Vector((0, math.sin(a), -math.cos(a))), (1, 0, 0), length * 0.94,
                  an['width'] * 0.1, an['thick'] * 1.7, taper=0), m['joint'], bone)
        add(kit.superellipsoid(f'AnalPin.{k}', (0.0065, 0.0045, 0.0065), seg=(8, 5), location=root - Vector((0, 0, 0.003))),
            m['joint'], bone)
    ta = D['tail']
    root = Vector((0, ta['y'], ZC))
    for k, (deg, length) in enumerate(ta['blades']):
        for sign, bone, tag in ((1, 'tail.U', 'U'), (-1, 'tail.D', 'D')):
            a = math.radians(deg)
            add(blade(f'TailRib.{tag}.{k}', root, Vector((0, math.cos(a), sign * math.sin(a))), (1, 0, 0), length * 0.94,
                      ta['width'] * 0.1, ta['thick'] * 1.7, taper=0), m['joint'], bone)
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'TailPin.{sfx}', (0.005, 0.005, 0.005), seg=(8, 5), location=(side * 0.014, ta['y'], ZC)),
            m['joint'], 'tail')
    pe = D['pectoral']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        p, n = flank(pe['y'], pe['height'], 0.006)
        p.x *= side
        add(kit.torus(f'FinRing.{sfx}', 0.0105, 0.0026, seg=(20, 6), location=p + Vector((side * 0.006, 0, 0)),
                      rotation=(0, math.pi / 2, 0)), m['joint'], f'fin.{sfx}')
        for k, (deg, length) in enumerate(pe['blades']):
            a = math.radians(deg)
            add(blade(f'FinRib.{sfx}.{k}', p + Vector((side * 0.006 * k, 0, 0)),
                      Vector((side * 0.15, math.cos(a), -math.sin(a) * 0.9)), (side, 0, 0), length * 0.92,
                      pe['width'] * 0.1, pe['thick'] * 1.7, taper=0), m['joint'], f'fin.{sfx}')

    # The tang's scalpel spine: a small lit plate in a bezel on each side of the stock.
    y = 0.088
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for name, size, out, mat in (('SpineBezel', (0.0135, 0.0075, 0.0018), 0.0004, m['joint']),
                                     ('SpinePlate', (0.0105, 0.0052, 0.0022), 0.0016, m['glow'])):
            p, n = flank(y, 0.0, out)
            p.x *= side
            n.x *= side
            obj = kit.superellipsoid(f'{name}.{sfx}', size, 0.5, 0.5, seg=(12, 4))
            add(orient(obj, p, (0, 1, 0), n.cross(Vector((0, 1, 0))), n), mat, 'spine.1')

    # The beacon: a collar on the stalk, and each thought light in a bezel ring.
    th = D['thought']
    x, y, z = th['dome']
    add(kit.superellipsoid('ThoughtStalk', (0.0032, 0.0032, 0.014), seg=(8, 5), location=(x, y, z - 0.024)),
        m['joint'], 'thought')
    add(kit.superellipsoid('ThoughtCollar', (0.0105, 0.0105, 0.0028), 0.5, 0.5, seg=(14, 4), location=(x, y, z - 0.009)),
        m['joint'], 'thought')
    add(kit.torus('ThoughtRing', th['r'] * 1.05, 0.0022, seg=(16, 6), location=(x, y, z - 0.004)), m['joint'], 'thought')
    for i, (bx, by, bz, r) in enumerate(th['bubbles']):
        add(kit.torus(f'ThoughtBubbleRing.{i}', r * 1.08, r * 0.2, seg=(16, 6), location=(bx, by, bz - r * 0.15)),
            m['joint'], f'thought.{i}')


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The body, segment by segment; a dark joint ring in each seam.
    segs = D['segments']
    for name, y0, y1, bone, role in segs:
        add(segment(name, y0, y1), m['role'](role) if role else m['shell'], bone)
    for (_, _, y1, _, _), (name, y0, _, bone, _) in zip(segs, segs[1:]):
        y = (y1 + y0) / 2
        hw, hh, zc = section(y)
        add(kit.superellipsoid(f'Seam.{name}', (hw * 0.88, 0.0065, hh * 0.88), E, E, seg=(32, 8), location=(0, y, zc)),
            m['joint'], bone)
        # A bolt on each flank in the seam, so the joints read as hardware.
        for side, sfx in ((1, 'L'), (-1, 'R')):
            add(kit.superellipsoid(f'Bolt.{name}.{sfx}', (D['bolt']['r'],) * 3, seg=(10, 6),
                                   location=(side * hw * 0.92, y, zc)), m['joint'], bone)

    # The swirl: round plates winding in on each flank, each a light.
    sw = D['swirl']
    for i, (y, share, r) in enumerate(swirl_points()):
        for side, sfx in ((1, 'L'), (-1, 'R')):
            p, n = flank(y, share, sw['thick'] * 0.3)
            p.x *= side
            n.x *= side
            along = Vector((0, 1, 0))
            obj = kit.superellipsoid(f'Swirl.{i}.{sfx}', (r, r, sw['thick']), sw['e'], sw['e'], seg=(16, 4))
            add(orient(obj, p, along, n.cross(along), n), m['dot'](i), 'body')

    # The visor, wrapped round the front of the head; its bezel just behind it.
    v = D['visor']
    add(wrap('TangScreen', v['z'], v['hz'], v['y_back'], 0.004), m['face'], 'head')
    add(wrap('TangBezel', v['z'], v['hz'] + v['bezel'], v['y_back'] + v['bezel'], 0.0025), m['bezel'], 'head')

    # Pectoral fins: a small fan of blades each side, flat against the flank, on a ball joint.
    pe = D['pectoral']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        p, n = flank(pe['y'], pe['height'], 0.006)
        p.x *= side
        root = Vector(p)
        add(kit.superellipsoid(f'FinBall.{sfx}', (0.011,) * 3, seg=(16, 10), location=root), m['joint'], f'fin.{sfx}')
        for k, (deg, length) in enumerate(pe['blades']):
            a = math.radians(deg)
            add(blade(f'Fin.{sfx}.{k}', root + Vector((side * 0.006 * k, 0, 0)), Vector((side * 0.15, math.cos(a), -math.sin(a) * 0.9)),
                      (side, 0, 0), length, pe['width'], pe['thick']), m['role']('Yellow', 'joint'), f'fin.{sfx}')

    # The dorsal sail and the anal fan: ribs fanned along the back and the belly.
    do = D['dorsal']
    for k, (y, deg, length) in enumerate(do['rays']):
        a = math.radians(deg)
        hw, hh, zc = section(y)
        add(blade(f'Dorsal.{k}', Vector(((k % 2) * 0.004 - 0.002, y, zc + hh * 0.93)), Vector((0, math.sin(a), math.cos(a))), (1, 0, 0),
                  length, do['width'], do['thick']), m['role']('Fin', 'joint'), 'dorsal' if y < do['split'] else 'dorsal.2')
    an = D['anal']
    for k, (y, deg, length) in enumerate(an['rays']):
        a = math.radians(deg)
        hw, hh, zc = section(y)
        add(blade(f'Anal.{k}', Vector(((k % 2) * 0.004 - 0.002, y, zc - hh * 0.93)), Vector((0, math.sin(a), -math.cos(a))), (1, 0, 0),
                  length, an['width'], an['thick']), m['role']('Fin', 'joint'), 'anal' if y < an['split'] else 'anal.2')

    # The tail: a hub on the end of the stock and a crescent of blades in two lobes.
    ta = D['tail']
    root = Vector((0, ta['y'], ZC))
    add(kit.superellipsoid('TailHub', (0.02, 0.013, 0.03), 0.6, 0.6, seg=(20, 10), location=root), m['joint'], 'tail')
    for k, (deg, length) in enumerate(ta['blades']):
        for sign, bone, tag in ((1, 'tail.U', 'U'), (-1, 'tail.D', 'D')):
            a = math.radians(deg)
            add(blade(f'Tail.{tag}.{k}', root, Vector((0, math.cos(a), sign * math.sin(a))), (1, 0, 0), length,
                      ta['width'], ta['thick'], taper=-0.2), m['role']('Yellow', 'joint'), bone)

    # The thought bubbles: a beacon on a stalk, and three lights rising from it, tucked
    # away in the head until the site pops them up.
    th = D['thought']
    x, y, z = th['dome']
    add(kit.superellipsoid('ThoughtBase', (0.006, 0.006, 0.006), seg=(12, 8), location=(x, y, z - 0.014)),
        m['joint'], 'thought')
    add(kit.superellipsoid('Thought', (th['r'],) * 3, seg=(18, 12), location=(x, y, z)), m['beacon'], 'thought')
    for i, (bx, by, bz, r) in enumerate(th['bubbles']):
        add(kit.superellipsoid(f'ThoughtBubble.{i}', (r,) * 3, seg=(16, 10), location=(bx, by, bz)), m['beacon'],
            f'thought.{i}')

    # Bubbles, hidden in the head until the site blows them.
    bu = D['bubbles']
    for i, r in enumerate(bu['radii']):
        add(kit.superellipsoid(f'Bubble.{i}', (r,) * 3, seg=(16, 10), location=bu['at']), m['beacon'], f'bubble.{i}')

    refine(add, m)

    return looks.finish(kit.armature('TangRig', rig_bones()), parts, skin, m)


if __name__ == '__main__':
    print('visor arc', arc_length(D['visor']['z'], D['visor']['y_back']), 'height', 2 * D['visor']['hz'])
