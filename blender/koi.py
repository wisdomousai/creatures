"""Blip, the crew's robot koi: a toy robot, not a fish in a robot suit. A stout body cut
into four segments (head, two body segments, a tail stock) on a chain of joints, with
dark joint rings in the seams, so it bends in steps as it swims, like a jointed toy
fish. Panel fins made of rounded blades: a pair of pectoral fins that paddle, a dorsal
fin, and a big forked tail fan.

The face is a visor screen wrapped round the front of the head like a pair of
goggles, so the eyes sit at its corners, where a fish's eyes are, and still show from
the side. Under it, a round mouth on a short telescoping snout (it pushes out to
nibble) with two little barbels. Five bubbles hide inside the head, on bones of their
own, for the site to blow.

Along each flank run neat rows of rounded scale plates, and every plate is a light:
six bands of them from head to tail, each its own material (Dot0 behind the head to
Dot5 at the tail), so the site can ripple light along the body as it swims. Plates on
the back (a cap on the head, a saddle on each segment) take the koi's patches in the
colour look. Faces -Y like the rest of the crew; about 0.6 m from nose to tail.
"""

import math

import numpy as np
from mathutils import Matrix, Vector

import kit
import looks

FACE = 'koi'
PREVIEW = dict(lift=0.0, width=0.66)

# The body's cross-section is a superellipse: 1 is an ellipse, lower is boxier.
E = 0.75

D = {
    # The body's outline, nose to tail stock: (y, half-width, half-height, centre z). The
    # first and last are the tips, closed to a point.
    'body': [
        (-0.264, 0.0, 0.0, 0.150),
        (-0.261, 0.030, 0.034, 0.150),
        (-0.252, 0.050, 0.058, 0.151),
        (-0.235, 0.064, 0.074, 0.153),
        (-0.205, 0.076, 0.087, 0.155),
        (-0.165, 0.084, 0.096, 0.157),
        (-0.115, 0.088, 0.101, 0.158),
        (-0.065, 0.086, 0.100, 0.158),
        (-0.015, 0.079, 0.093, 0.158),
        (0.035, 0.068, 0.082, 0.158),
        (0.085, 0.054, 0.068, 0.158),
        (0.130, 0.041, 0.054, 0.158),
        (0.172, 0.031, 0.043, 0.158),
        (0.185, 0.0, 0.0, 0.158),
    ],
    # (part, from y, to y, bone, columns of scales); gaps between them are the seams.
    'segments': [
        ('Head', -0.27, -0.13, 'head', 0),
        ('Trunk', -0.124, -0.018, 'body', 4),
        ('Middle', -0.012, 0.078, 'spine.1', 3),
        ('Stock', 0.084, 0.174, 'spine.2', 3),
    ],
    # Plates on the back, a little proud of the shell: (part, from y, to y, above this
    # share of the half-height, bone, role in the colour look).
    'patches': [
        ('Cap', -0.212, -0.142, 0.66, 'head', 'Patch'),
        ('Saddle.1', -0.116, -0.026, 0.5, 'body', 'Patch'),
        ('Saddle.2', -0.004, 0.07, 0.5, 'spine.1', 'Sumi'),
        ('Saddle.3', 0.092, 0.166, 0.5, 'spine.2', 'Patch'),
    ],
    # Round scale plates in columns down each flank, `inset` from the seams, rows
    # staggered column to column (heights as shares of the half-height there). Sizes
    # shrink with the body toward the tail. One light band per column, head to tail.
    'scales': dict(rows=((-0.5, -0.18, 0.14), (-0.34, -0.02, 0.3)), r=0.0152, thick=0.004, e=0.85,
                   inset=0.016),
    # The visor wraps round the front of the head at this height, back to y_back on each side.
    'visor': dict(z=0.18, hz=0.03, y_back=-0.168, bezel=0.003),
    # Gill vents behind the visor: (y, share of the half-height) of each slit, and a bolt in each seam.
    'gills': dict(ys=(-0.152, -0.142, -0.132), share=-0.32, half=0.016, wide=0.0032, thick=0.003),
    'bolt': dict(r=0.0055, share=0.0),
    'mouth': dict(z=0.122, lip=(0.016, 0.0085), snout=0.02),
    'barbel': dict(r=0.0045, tip=0.0075),
    # Fins: blades fanned from a hub, (angle, length) each; angles in degrees.
    'pectoral': dict(y=-0.092, height=-0.85, blades=((14, 0.08), (40, 0.076), (66, 0.064)), width=0.03,
                     thick=0.008, drop=0.3),
    'dorsal': dict(y=-0.075, blades=((22, 0.086), (44, 0.078), (66, 0.064)), width=0.026, thick=0.008),
    'tail': dict(y=0.178, blades=((54, 0.15), (27, 0.128), (0, 0.094), (-27, 0.128), (-54, 0.15)), width=0.036,
                 thick=0.01),
    'bubbles': dict(at=(0, -0.19, 0.155), radii=(0.014, 0.011, 0.016, 0.012, 0.009)),
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
    """surface() on the body's left side, `share` of the half-height above (or below)
    its middle."""
    return surface(y, math.asin(math.copysign(abs(share) ** (1 / E), share)), out)


def loft(name, y0, y1, grow=1.0, n=32):
    """The body between y0 and y1, as a closed shape (the ends to be cut off), with its
    cross-section grown by `grow` (for the plates that sit on it)."""
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


def segment(name, y0, y1, grow=1.0):
    """A slice of the body, cut flat at the seams."""
    obj = loft(name, y0 - 0.01, y1 + 0.01, grow)
    if y0 > RINGS[0, 0]:
        kit.cut(obj, (0, 1, 0), y0)
    if y1 < RINGS[-1, 0]:
        kit.cut(obj, (0, -1, 0), -y1)
    return obj


# ---------- Parts ----------


def orient(obj, origin, x, y, z):
    """Turn a part built round the origin so its local axes lie along x, y, z, and move
    it to `origin`."""
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


def blade(name, root, direction, normal, length, width, thick):
    """A fin blade: a flat rounded paddle from `root` along `direction`, a little wider
    at its tip, its flat face toward `normal`."""
    d, n = Vector(direction).normalized(), Vector(normal).normalized()
    obj = kit.superellipsoid(name, (width / 2, thick / 2, length / 2), 0.5, 0.5, seg=(20, 12), taper=-0.35)
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
                if nrm.dot(Vector((p.x, p.y + 0.19, 0))) < 0:
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
    # Close the edges between the two layers.
    edge = [(0, i) for i in range(ns)] + [(j, ns - 1) for j in range(nz)] + \
           [(nz - 1, i) for i in range(ns - 1, -1, -1)] + [(j, 0) for j in range(nz - 1, -1, -1)]
    for (j0, i0), (j1, i1) in zip(edge, edge[1:]):
        a, b = j0 * ns + i0, j1 * ns + i1
        if a != b:
            faces.append((a, b, b + per, a + per))
    obj = kit.mesh_object(name, verts, faces)
    # UVs, per corner: the site draws the face on the canvas the screen shows.
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


def rig_bones():
    zc = D['body'][6][3]
    mz = D['mouth']['z']
    nose = RINGS[0, 0]
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # The trunk: the fish turns about its middle.
        ('body', (0, -0.07, zc), (0, -0.018, zc), 'root'),
        ('head', (0, -0.127, zc), (0, -0.24, zc), 'body'),
        ('mouth', (0, nose + 0.03, mz), (0, nose - 0.03, mz), 'head'),
        ('spine.1', (0, -0.015, zc), (0, 0.081, zc), 'body'),
        ('spine.2', (0, 0.081, zc), (0, 0.174, zc), 'spine.1'),
        ('tail', (0, 0.176, zc), (0, 0.33, zc), 'spine.2'),
    ]
    dz = D['dorsal']['y']
    hw, hh, dzc = section(dz)
    bones.append(('dorsal', (0, dz, dzc + hh * 0.9), (0, dz + 0.05, dzc + hh + 0.06), 'body'))
    pe = D['pectoral']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        p, _ = flank(pe['y'], pe['height'])
        bones.append((f'fin.{sfx}', (side * p.x, p.y, p.z), (side * (p.x + 0.05), p.y + 0.03, p.z - 0.02), 'body'))
        bones.append((f'barbel.{sfx}', (side * 0.02, nose - 0.004, mz - 0.004),
                      (side * 0.042, nose + 0.012, mz - 0.04), 'mouth'))
    b = D['bubbles']
    for i in range(len(b['radii'])):
        x, y, z = b['at']
        bones.append((f'bubble.{i}', (x, y, z), (x, y, z + 0.03), None))
    return bones


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
    for name, y0, y1, bone, _ in segs:
        add(segment(name, y0, y1), m['shell'], bone)
    for (_, _, y1, _, _), (name, y0, _, bone, _) in zip(segs, segs[1:]):
        y = (y1 + y0) / 2
        hw, hh, zc = section(y)
        add(kit.superellipsoid(f'Seam.{name}', (hw * 0.86, 0.007, hh * 0.86), E, E, seg=(32, 8), location=(0, y, zc)),
            m['joint'], bone)

    # A bolt on each flank in every seam, so the joints read as hardware.
    for (_, _, y1, _, _), (name, y0, _, bone, _) in zip(segs, segs[1:]):
        y = (y1 + y0) / 2
        hw, hh, zc = section(y)
        for side, sfx in ((1, 'L'), (-1, 'R')):
            add(kit.superellipsoid(f'Bolt.{name}.{sfx}', (D['bolt']['r'],) * 3, seg=(10, 6),
                                   location=(side * hw * 0.9, y, zc)), m['joint'], bone)

    # Gill vents: three little slits on each cheek, under the visor.
    g = D['gills']
    for y in g['ys']:
        for side, sfx in ((1, 'L'), (-1, 'R')):
            p, n = flank(y, g['share'], g['thick'] * 0.2)
            p.x *= side
            n.x *= side
            along = Vector((0, 1, 0))
            add(orient(kit.superellipsoid(f'Gill.{sfx}.{y}', (g['wide'], g['half'], g['thick']), 0.6, 0.6,
                                          seg=(12, 4)), p, along, n.cross(along), n), m['joint'], 'head')

    # Plates on the back: the koi's patches in the colour look.
    for name, y0, y1, above, bone, role in D['patches']:
        obj = segment(name, y0, y1, grow=1.03)
        hw, hh, zc = section((y0 + y1) / 2)
        kit.cut(obj, (0, 0, 1), zc + hh * above)
        add(obj, m['role'](role), bone)

    # Scale plates down each flank, a light in every one: one band per column.
    sc = D['scales']
    band = 0
    for _, y0, y1, bone, cols in segs:
        for c in range(cols):
            y = y0 + sc['inset'] + (y1 - y0 - 2 * sc['inset']) * c / (cols - 1)
            r = sc['r'] * section(y)[1] / 0.1
            for k, share in enumerate(sc['rows'][c % 2]):
                for side, sfx in ((1, 'L'), (-1, 'R')):
                    p, n = flank(y, share, sc['thick'] * 0.3)
                    p.x *= side
                    n.x *= side
                    along = Vector((0, 1, 0))
                    obj = kit.superellipsoid(f'Scale.{band}.{k}.{sfx}', (r, r, sc['thick']), sc['e'], sc['e'],
                                             seg=(16, 4))
                    add(orient(obj, p, along, n.cross(along), n), m['dot'](band), bone)
            band += 1

    # The visor, wrapped round the front of the head; its bezel just behind it.
    v = D['visor']
    add(wrap('KoiScreen', v['z'], v['hz'], v['y_back'], 0.004), m['face'], 'head')
    add(wrap('KoiBezel', v['z'], v['hz'] + v['bezel'], v['y_back'] + v['bezel'], 0.0025), m['bezel'], 'head')

    # The mouth: a lip ring on a short snout that slides out of the nose, dark inside.
    mo = D['mouth']
    nose = RINGS[0, 0]
    major, minor = mo['lip']
    add(kit.superellipsoid('Snout', (mo['snout'], 0.02, mo['snout']), 0.8, 1.0, seg=(24, 12),
                           location=(0, nose + 0.012, mo['z'])), m['shell'], 'mouth')
    add(kit.torus('Lip', major, minor, seg=(28, 10), location=(0, nose - 0.005, mo['z']),
                  rotation=(math.pi / 2, 0, 0)), m['shell'], 'mouth')
    add(kit.superellipsoid('Gullet', (major * 0.8, 0.004, major * 0.8), seg=(20, 8),
                           location=(0, nose - 0.002, mo['z'])), m['bezel'], 'mouth')
    ba = D['barbel']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = [(side * 0.018, nose - 0.004, mo['z'] - 0.002), (side * 0.034, nose - 0.002, mo['z'] - 0.012),
               (side * 0.042, nose + 0.004, mo['z'] - 0.03)]
        add(kit.tube(f'Barbel.{sfx}', kit.spline(pts, 8), ba['r'], ring=8)[0], m['joint'], f'barbel.{sfx}')
        add(kit.superellipsoid(f'BarbelTip.{sfx}', (ba['tip'],) * 3, seg=(12, 8), location=pts[-1]), m['beacon'],
            f'barbel.{sfx}')

    # Pectoral fins: a fan of blades each side, low on the trunk, on a ball joint.
    pe = D['pectoral']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        p, n = flank(pe['y'], pe['height'])
        p.x *= side
        root = Vector(p)
        outward = Vector((side, 0, -pe['drop'])).normalized()
        back = Vector((0, 1, 0))
        normal = outward.cross(back)
        add(kit.superellipsoid(f'FinBall.{sfx}', (0.014,) * 3, seg=(16, 10), location=root), m['joint'],
            f'fin.{sfx}')
        for k, (deg, length) in enumerate(pe['blades']):
            a = math.radians(deg)
            add(blade(f'Fin.{sfx}.{k}', root, outward * math.cos(a) + back * math.sin(a), normal, length,
                      pe['width'], pe['thick']), m['role']('Fin', 'joint'), f'fin.{sfx}')

    # Dorsal fin: blades swept back from the top of the trunk.
    do = D['dorsal']
    hw, hh, zc = section(do['y'])
    root = Vector((0, do['y'], zc + hh * 0.9))
    for k, (deg, length) in enumerate(do['blades']):
        a = math.radians(deg)
        add(blade(f'Dorsal.{k}', root, Vector((0, math.sin(a), math.cos(a))), (1, 0, 0), length, do['width'],
                  do['thick']), m['role']('Fin', 'joint'), 'dorsal')

    # The tail: a hub on the end of the stock and a forked fan of blades.
    ta = D['tail']
    hw, hh, zc = section(ta['y'] - 0.01)
    root = Vector((0, ta['y'], zc))
    add(kit.superellipsoid('TailHub', (0.024, 0.014, 0.032), 0.6, 0.6, seg=(20, 10), location=root), m['joint'],
        'tail')
    for k, (deg, length) in enumerate(ta['blades']):
        a = math.radians(deg)
        add(blade(f'Tail.{k}', root, Vector((0, math.cos(a), math.sin(a))), (1, 0, 0), length, ta['width'],
                  ta['thick']), m['role']('Fin', 'joint'), 'tail')

    # ---------- Refinements ----------

    # A dark rim under every scale plate, so each reads as a set-in lamp.
    band = 0
    col_ys = []
    for _, y0, y1, bone, cols in segs:
        for c in range(cols):
            y = y0 + sc['inset'] + (y1 - y0 - 2 * sc['inset']) * c / (cols - 1)
            col_ys.append(y)
            r = sc['r'] * section(y)[1] / 0.1
            for k, share in enumerate(sc['rows'][c % 2]):
                for side, sfx in ((1, 'L'), (-1, 'R')):
                    p, n = flank(y, share, sc['thick'] * 0.05)
                    p.x *= side
                    n.x *= side
                    along = Vector((0, 1, 0))
                    obj = kit.superellipsoid(f'Rim.{band}.{k}.{sfx}', (r * 1.24, r * 1.24, sc['thick'] * 0.7),
                                             sc['e'], sc['e'], seg=(16, 4))
                    add(orient(obj, p, along, n.cross(along), n), m['joint'], bone)
            band += 1

    # Lateral line: a row of tiny lights along each flank, each on its band's light.
    for i in range(11):
        y = -0.115 + 0.027 * i
        b = min(range(len(col_ys)), key=lambda j: abs(col_ys[j] - y))
        bone = 'head' if y < -0.127 else 'body' if y < -0.015 else 'spine.1' if y < 0.081 else 'spine.2'
        for side, sfx in ((1, 'L'), (-1, 'R')):
            p, n = flank(y, 0.5, 0.0012)
            p.x *= side
            n.x *= side
            along = Vector((0, 1, 0))
            add(orient(kit.superellipsoid(f'Lateral.{i}.{sfx}', (0.0035, 0.0035, 0.0022), seg=(10, 4)), p, along,
                       n.cross(along), n), m['dot'](b), bone)

    # More rivets round each joint ring (the flank ones are above).
    for (_, _, y1, _, _), (name, y0, _, bone, _) in zip(segs, segs[1:]):
        y = (y1 + y0) / 2
        for k, th in enumerate((0.6, 1.57, 2.55, -0.6, -1.57, -2.55)):
            p, n = surface(y, th, 0.005)
            for side, sfx in ((1, 'L'), (-1, 'R')):
                if abs(p.x) < 0.005 and side < 0:
                    continue
                q = Vector((p.x * side, p.y, p.z))
                add(kit.superellipsoid(f'Rivet.{name}.{k}.{sfx}', (0.0034,) * 3, seg=(8, 5), location=q),
                    m['joint'], bone)

    # Koi spots: ink blots on the saddles (only the colour look shows them).
    for i, (y, th, r, bone) in enumerate(((-0.07, 1.2, 0.017, 'body'), (-0.05, 1.9, 0.011, 'body'),
                                          (0.128, 1.35, 0.013, 'spine.2'), (0.03, 1.8, 0.012, 'spine.1'))):
        for side, sfx in ((1, 'L'), (-1, 'R')):
            p, n = surface(y, th, 0.0006)
            p.x *= side
            n.x *= side
            along = Vector((0, 1, 0))
            add(orient(kit.superellipsoid(f'Blot.{i}.{sfx}', (r, r * 1.2, 0.0022), 0.9, 0.9, seg=(14, 4)), p,
                       along, n.cross(along), n), m['role']('Sumi'), bone)

    # Head: a pair of bolts on the crown and a brow bolt at each end of the visor.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        p, n = surface(-0.15, math.pi / 2 - 0.5, 0.004)
        add(kit.superellipsoid(f'Crown.{sfx}', (0.005,) * 3, seg=(10, 6), location=(side * p.x, p.y, p.z)),
            m['joint'], 'head')
        p, n = surface(v['y_back'] - 0.004, math.radians(30), 0.004)
        add(kit.superellipsoid(f'Brow.{sfx}', (0.0045,) * 3, seg=(10, 6), location=(side * p.x, p.y, p.z)),
            m['joint'], 'head')

    # Mouth: an outer rim ring and four small bolts round the lip.
    add(kit.torus('LipRim', major * 1.45, minor * 0.55, seg=(28, 8), location=(0, nose + 0.001, mo['z']),
                  rotation=(math.pi / 2, 0, 0)), m['joint'], 'mouth')
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        add(kit.superellipsoid(f'LipBolt.{k}', (0.0028,) * 3, seg=(8, 5),
                               location=(math.cos(a) * major * 1.45, nose + 0.001,
                                         mo['z'] + math.sin(a) * major * 1.45)), m['bezel'], 'mouth')

    # Fin ribs: a thin dark spine down every blade, and a hinge pin through each fan's hub.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        p, n = flank(pe['y'], pe['height'])
        p.x *= side
        root = Vector(p)
        outward = Vector((side, 0, -pe['drop'])).normalized()
        back = Vector((0, 1, 0))
        normal = outward.cross(back)
        for k, (deg, length) in enumerate(pe['blades']):
            a = math.radians(deg)
            d = outward * math.cos(a) + back * math.sin(a)
            add(blade(f'FinRib.{sfx}.{k}', root + normal * 0.0035, d, normal, length * 0.92, 0.005,
                      pe['thick'] * 0.6), m['bezel'], f'fin.{sfx}')
        add(orient(kit.superellipsoid(f'FinPin.{sfx}', (0.005, 0.005, 0.021), seg=(10, 6)), root,
                   outward.cross(back), back, normal), m['bezel'], f'fin.{sfx}')
    dhw, dhh, dzc = section(do['y'])
    droot = Vector((0, do['y'], dzc + dhh * 0.9))
    for k, (deg, length) in enumerate(do['blades']):
        a = math.radians(deg)
        add(blade(f'DorsalRib.{k}', droot + Vector((0.0035, 0, 0)), Vector((0, math.sin(a), math.cos(a))),
                  (1, 0, 0), length * 0.92, 0.005, do['thick'] * 0.6), m['bezel'], 'dorsal')
    add(orient(kit.superellipsoid('DorsalPin', (0.005, 0.005, 0.02), seg=(10, 6)), droot, (0, 1, 0), (0, 0, 1),
               (1, 0, 0)), m['bezel'], 'dorsal')
    troot = Vector((0, ta['y'], section(ta['y'] - 0.01)[2]))
    for k, (deg, length) in enumerate(ta['blades']):
        a = math.radians(deg)
        add(blade(f'TailRib.{k}', troot + Vector((0.0045, 0, 0)), Vector((0, math.cos(a), math.sin(a))),
                  (1, 0, 0), length * 0.92, 0.006, ta['thick'] * 0.6), m['bezel'], 'tail')
    add(orient(kit.superellipsoid('TailPin', (0.006, 0.006, 0.06), seg=(10, 6)), troot + Vector((0, 0.012, 0)),
               (1, 0, 0), (0, 1, 0), (0, 0, 1)), m['bezel'], 'tail')
    for side in (1, -1):
        add(kit.superellipsoid(f'TailBolt.{side + 1}', (0.007,) * 3, seg=(10, 6),
                               location=(side * 0.02, ta['y'] + 0.004, troot.z)), m['joint'], 'tail')

    # Bubbles, hidden in the head until the site blows them.
    bu = D['bubbles']
    for i, r in enumerate(bu['radii']):
        add(kit.superellipsoid(f'Bubble.{i}', (r,) * 3, seg=(16, 10), location=bu['at']), m['beacon'], f'bubble.{i}')

    return looks.finish(kit.armature('KoiRig', rig_bones()), parts, skin, m)


if __name__ == '__main__':
    print('visor arc', arc_length(D['visor']['z'], D['visor']['y_back']), 'height', 2 * D['visor']['hz'])
