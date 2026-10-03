"""The shared builder for the cat breeds (bengal, ragdoll, abyssinian, munchkin, oldtabby): one
robot cat made from a table of proportions, so a breed is mostly numbers (how long the legs
and body are, how big the head and ears) plus a few chunky signature parts of its own. Every
cat built here has the same rig (root, body, head, ear.L/R, tail.1..n, leg.FL/FR/BL/BR) as
Pixel, Bun and Bit, so the cats' tricks (kitties.ts) work on them all.

A breed's module has FACE, PREVIEW, a table P and `build(look, flame)` that calls
catkit.build(look, flame, P, extras): a list of functions (add, m, c) that put its own
parts on. `c` is the Ctx: the table, the parts' dimensions and surface helpers.

Faces -Y like the rest of the crew. All numbers are metres, z up, the floor at z = 0.
"""

import math

from mathutils import Vector

import kit
import looks


# ---------- Surfaces ----------


def on_surface(center, radii, e, direction):
    """Where a ray from a superellipsoid's centre along `direction` leaves it (e1 = e2 = e),
    and the surface normal there."""
    d = Vector(direction).normalized()
    k = 2.0 / e
    total = sum(abs(d[i] / radii[i]) ** k for i in range(3))
    s = (1.0 / total) ** (e / 2.0)
    q = [d[i] * s for i in range(3)]
    n = Vector([math.copysign(abs(q[i] / radii[i]) ** (k - 1) / radii[i], q[i]) if q[i] else 0.0 for i in range(3)])
    return Vector(center) + Vector(q), n.normalized()


def orient(obj, p, n, lift=0.0, spin=0.0):
    """Stand a part on a surface point, its local Z along the normal (spun about it)."""
    n = Vector(n).normalized()
    obj.location = tuple(Vector(p) + n * lift)
    q = Vector((0, 0, 1)).rotation_difference(n)
    if spin:
        from mathutils import Quaternion
        q = q @ Quaternion((0, 0, 1), spin)
    obj.rotation_euler = q.to_euler()
    return obj


def section(radii, e, center, axis, at, lift=1.012, n=44):
    """A closed seam round a superellipsoid (e1 = e2 = e): where the plane axis = at cuts it
    (axis 0 for x, 1 for y), lifted a hair off it. Points run up one side and down the
    other."""
    rx, ry, rz = radii
    cx, cy, cz = center
    side = rx if axis == 1 else ry
    up = []
    for i in range(n + 1):
        phi = -math.pi / 2 + math.pi * i / n
        cp, sp = kit.spow(math.cos(phi), e), kit.spow(math.sin(phi), e)
        v = at / (({0: rx, 1: ry}[axis]) * cp) if cp > 1e-6 else 2
        if abs(v) > 1:
            continue
        th = math.asin(kit.spow(v, 1 / e))
        up.append((side * cp * kit.spow(math.cos(th), e), rz * sp))
    pts = [(a, z) for a, z in up] + [(-a, z) for a, z in reversed(up)]
    out = []
    for a, z in pts:
        p = [0, 0, 0]
        p[axis] = at
        p[1 - axis] = a
        out.append((cx + p[0] * lift, cy + p[1] * lift, cz + z * lift))
    return out


def ring_about_y(center, radii, e, y, lift=1.012, n=40, zmin=-9, zmax=9, side=0):
    """Points of the seam round a body at height y along its length, limited to z between
    zmin and zmax (relative to the centre), and to one side (+1 left / -1 right) if given."""
    pts = section(radii, e, center, 1, y - center[1], lift, n)
    out = [q for q in pts if zmin <= q[2] - center[2] <= zmax]
    if side:
        out = [q for q in out if q[0] * side >= 0]
    return out


# ---------- The cat ----------


class Ctx:
    """What a breed's extras get: the table, and helpers for putting parts on."""

    def __init__(self, P, m, add):
        self.P, self.m, self.add = P, m, add

    def head_point(self, direction, lift=0.0):
        h = self.P['head']
        p, n = on_surface(h['center'], h['radii'], h['e'], direction)
        return p + n * lift, n

    def body_point(self, direction, lift=0.0):
        """A point on the body (turned by its tilt) toward `direction` from its centre."""
        from mathutils import Matrix
        b = self.P['body']
        rot = Matrix.Rotation(b.get('tilt', 0.0), 3, 'X')
        p, n = on_surface((0, 0, 0), b['radii'], b['e'], direction)
        p, n = rot @ p, rot @ n
        return Vector(b['center']) + p + n * lift, n

    def panel(self, name, p, n, radii, mat, bone, e=0.5, spin=0.0, lift=0.0, seg=(14, 8)):
        """A small flat plate lying on a surface at p with normal n."""
        o = kit.superellipsoid(name, radii, e, e, seg=seg)
        orient(o, p, n, lift, spin)
        return self.add(o, mat, bone)

    def ring(self, name, p, n, major, minor, mat, bone, seg=(18, 6), spin=0.0, lift=0.0):
        o = kit.torus(name, major, minor, seg=seg)
        orient(o, p, n, lift, spin)
        return self.add(o, mat, bone)

    def bolt(self, name, at, r, bone, mat=None, flat=1.0):
        return self.add(kit.superellipsoid(name, (r, r, r * flat), 0.6, 0.6, seg=(12, 8), location=tuple(at)),
                        mat or self.m['bezel'], bone)

    def seam(self, name, pts, r, mat, bone):
        return self.add(kit.tube(name, pts, r, ring=6)[0], mat, bone)


def rig_bones(P):
    lg, e, h = P['leg'], P['ear'], P['head']
    hy, hz = P['hips']
    ny, nz = P['neck']
    hc = h['center']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, hy, hz), (0, ny + 0.08, nz), 'root'),
        ('head', (0, ny, nz), (0, hc[1] - 0.04, hc[2] + h['radii'][2] + 0.04), 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'], e['y'], e['z'] - 0.03),
                      (side * (e['x'] + 0.03), e['y'], e['z'] + 0.09), 'head'))
    pts = kit.spline(P['tail'], P['tail_bones'] + 1)
    parent = 'body'
    for i in range(P['tail_bones']):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    for name, x, y, top in leg_spots(lg):
        bones.append((f'leg.{name}', (x, y, top), (x, y, 0.0), 'body'))
    bones += P.get('bones_extra', [])
    return bones


def leg_spots(lg):
    """(name, x, y, top) of each leg: front pair, then hind pair."""
    ft = lg.get('top_front', lg['top'])
    bt = lg.get('top_back', lg['top'])
    xf, xb = lg.get('x_front', lg['x']), lg.get('x_back', lg['x'])
    return [('FL', xf, lg['front'], ft), ('FR', -xf, lg['front'], ft), ('BL', xb, lg['back'], bt),
            ('BR', -xb, lg['back'], bt)]


def build(look, flame, P, extras=(), name='Cat'):
    m = looks.materials(look, flame, face=P['face'])
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    c = Ctx(P, m, add)
    seam = P.get('seam', 0.0032)
    h = P['head']
    shell = m['shell']

    # ----- head, screen
    head = add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(56, 36), location=h['center']), shell, 'head')
    sc = P['screen']
    glass, rim = kit.screen(name, sc['radii'], sc['center'], sc['bezel'], e=sc.get('e', 0.45))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, dz in enumerate((-0.05, 0.05)):
            c.bolt(f'TempleBolt.{sfx}{k}', (side * (sc['radii'][0] + 0.012), sc['center'][1] - sc['radii'][1] * 0.9,
                                             sc['center'][2] + dz * sc['radii'][2] / 0.1), 0.0068, 'head')

    # ----- neck (optional), body
    if 'neckpart' in P:
        nk = P['neckpart']
        add(kit.superellipsoid('Neck', nk['radii'], nk.get('e', 0.6), nk.get('e', 0.6), seg=(28, 20),
                               location=nk['center'], rotation=(nk.get('tilt', 0.0), 0, 0)), shell, 'body')
    b = P['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(52, 32), location=b['center'],
                           rotation=(b.get('tilt', 0.0), 0, 0)), shell, 'body')

    # ----- ears
    ear = P['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        o = kit.stretch(kit.lathe(f'Ear.{sfx}', ear['profile'], seg=26), sy=ear.get('sy', 0.45))
        o.location = (side * ear['x'], ear['y'], ear['z'] - 0.03)
        o.rotation_euler = (ear.get('lean', 0.0), side * ear['tilt'], 0)
        if ear.get('torn') == sfx:
            tear(o, side, ear['profile'][0][1])
        add(o, m['role']('Ear'), f'ear.{sfx}')
        inner = kit.stretch(kit.lathe(f'InnerEar.{sfx}', [(r * 0.6, z * 0.72 + 0.012) for r, z in ear['profile']],
                                      seg=24), sy=0.2)
        inner.location = (side * ear['x'], ear['y'] - ear.get('inset', 0.026), ear['z'] - 0.03)
        inner.rotation_euler = (ear.get('lean', 0.0), side * ear['tilt'], 0)
        if ear.get('torn') == sfx:
            tear(inner, side, ear['profile'][0][1], inner=True)
        add(inner, m['role']('Inner', 'joint'), f'ear.{sfx}')
        # A hinge puck at the base of each ear, with a small light.
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.026, 0.026, 0.018), 0.3, 1.0, seg=(16, 6),
                               location=(side * (ear['x'] - 0.006), ear['y'] + 0.01, ear['z'] - 0.04),
                               rotation=(math.pi / 2, 0, 0)), m['joint'], f'ear.{sfx}')
        add(kit.superellipsoid(f'EarLed.{sfx}', (0.0075,) * 3, seg=(8, 6),
                               location=(side * (ear['x'] - 0.006), ear['y'] - 0.012, ear['z'] - 0.04)),
            m['dot'](3), f'ear.{sfx}')

    # ----- legs
    lg, pw = P['leg'], P['paw']
    for nm, x, y, top in leg_spots(lg):
        bone = f'leg.{nm}'
        hind = nm.startswith('B')
        r0 = lg.get('r_top_back', lg.get('r_top', lg['r'])) if hind else lg.get('r_top', lg['r'])
        r1 = lg['r']
        bottom = lg['bottom']
        mid = (top + bottom) * 0.5
        side = 1 if x > 0 else -1
        # Hind legs bend back a little at the hock; front legs go straight down.
        kneey = y + (lg.get('hock', 0.0) if hind else 0.0)
        pts = [(x, y, top), (x, kneey, mid + 0.02), (x, y, bottom)]
        leg, _ = kit.tube(f'Leg.{nm}', kit.resample(pts, 6), [r0, r0 * 0.5 + r1 * 0.5, r1 * 1.0, r1, r1, r1], ring=16)
        add(leg, m['role'](lg['role']) if lg.get('role') else shell, bone)
        add(kit.superellipsoid(f'Paw.{nm}', pw['radii'], pw['e'], 0.6, seg=(26, 20),
                               location=(x, y - pw.get('ahead', 0.014), pw['radii'][2])),
            m['role']('Paw', 'joint'), bone)
        # A ball joint at the shoulder or hip, a ring at the ankle, rubber toe beans under the paw.
        c.bolt(f'Hub.{nm}', (x + side * (r0 * 0.9), y, top - 0.012), 0.012, bone, m['joint'], 0.7)
        add(kit.torus(f'Ankle.{nm}', r1 * 1.05, 0.0058, seg=(22, 8), location=(x, y, bottom + 0.04)), m['bezel'], bone)
        add(kit.torus(f'Knee.{nm}', (r0 * 0.5 + r1 * 0.5) * 1.06, 0.0052, seg=(22, 8), location=(x, kneey, mid + 0.02)),
            m['joint'], bone)
        bean = m['role']('Bean', 'joint')
        pr = pw['radii']
        add(kit.superellipsoid(f'Pad.{nm}', (pr[0] * 0.55, pr[1] * 0.42, 0.006), 0.6, 0.7, seg=(14, 8),
                               location=(x, y - pw.get('ahead', 0.014) + 0.004, 0.0055)), bean, bone)
        for k, xo in enumerate((-0.6, -0.2, 0.2, 0.6)):
            add(kit.superellipsoid(f'Toe.{nm}{k}', (pr[0] * 0.2,) * 2 + (0.006,), 0.6, 0.7, seg=(10, 6),
                                   location=(x + xo * pr[0] * 0.8, y - pw.get('ahead', 0.014) - pr[1] * (0.6 - 0.12 * abs(xo)),
                                             0.0055)), bean, bone)

    # ----- tail
    tp = P['tail']
    pts = kit.spline(tp, 26)
    r0, r1 = P['tail_r']
    radii = [r0 + (r1 - r0) * (i / (len(pts) - 1)) ** P.get('tail_taper', 1.0) for i in range(len(pts))]
    tail, ts = kit.tube('Tail', pts, radii, ring=14)
    bones = [f'tail.{i + 1}' for i in range(P['tail_bones'])]
    add(tail, shell, kit.chain(ts, bones))
    tail.data.materials.clear()
    tail.data.materials.append(m['role']('Tail'))
    tail.data.materials.append(m['role']('Tip'))
    rings = P.get('tail_rings', [(0.88, 1.01)])
    for f in tail.data.polygons:
        t = sum(ts[i] for i in f.vertices) / len(f.vertices)
        f.material_index = 1 if any(a <= t < bb for a, bb in rings) else 0
    cap = Vector(pts[-1])
    axis = (cap - Vector(pts[-3])).normalized()
    add(kit.superellipsoid('TailCap', (r1 * P.get('cap', 1.1),) * 3, 0.8, 0.8, seg=(18, 12), location=tuple(cap + axis * r1 * 0.5)),
        m['dot'](0), bones[-1])
    # Collars between the tail's bones (lit), so its joints show.
    for i in range(1, P['tail_bones']):
        k = round(i / P['tail_bones'] * (len(pts) - 1))
        a, bb = Vector(pts[max(k - 1, 0)]), Vector(pts[min(k + 1, len(pts) - 1)])
        rot = Vector((0, 0, 1)).rotation_difference((bb - a).normalized()).to_euler()
        add(kit.torus(f'TailBand{i}', radii[k] + 0.003, 0.0055, seg=(24, 6), location=tuple(pts[k]), rotation=tuple(rot)),
            m['dot'](i) if i <= 2 else m['bezel'], bones[min(i, P['tail_bones'] - 1)])
    p0 = Vector(tp[0])
    add(kit.superellipsoid('TailHub', (0.04, 0.04, 0.03), 0.4, 1.0, seg=(16, 8), location=(0, p0.y - 0.005, p0.z),
                           rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')

    # ----- collar and tag (the beacon)
    if 'collar' in P:
        cl = P['collar']
        add(kit.torus('Collar', cl['major'], cl.get('minor', 0.015), seg=(40, 10), location=cl['center'],
                      rotation=(cl['tilt'], 0, 0)), m['role']('Collar', 'joint'), 'body')
        tg = P['tag']
        add(kit.superellipsoid('Tag', (tg['r'], 0.011, tg['r']), 0.5, 1.0, seg=(24, 8), location=tg['center']),
            m['beacon'], 'body')
        add(kit.torus('TagRing', 0.011, 0.0028, seg=(16, 6),
                      location=(tg['center'][0], tg['center'][1] + 0.004, tg['center'][2] + tg['r'] + 0.005),
                      rotation=(math.pi / 2, 0, 0)), m['bezel'], 'body')

    # ----- whiskers: pods on the cheeks with a lit tip each
    wk = P.get('whiskers')
    if wk:
        hx, hy2, hz2 = h['center']
        for side, sfx in ((1, 'L'), (-1, 'R')):
            base = (side * (h['radii'][0] * 0.98), hy2 - h['radii'][1] * 0.55, hz2 - h['radii'][2] * 0.28)
            c.bolt(f'WhiskerPod.{sfx}', base, 0.011, 'head', m['joint'], 0.8)
            for k, dz in enumerate((0.022, 0.0, -0.022)):
                end = (base[0] + side * wk, base[1] - 0.025 - 0.006 * k, base[2] + dz * 1.8)
                add(kit.tube(f'Whisker.{sfx}{k}', [base, (base[0] + side * wk * 0.5, base[1] - 0.012, base[2] + dz), end],
                             0.0028, ring=5)[0], m['bezel'], 'head')
                add(kit.superellipsoid(f'WhiskerTip.{sfx}{k}', (0.0065,) * 3, seg=(8, 6), location=end), m['dot'](4), 'head')

    for extra in extras:
        extra(add, m, c)

    return looks.finish(kit.armature(f'{name}Rig', rig_bones(P)), parts, skin, m)


def tear(obj, side, height, inner=False):
    """A torn ear: the tip bitten off along a slant (the outer side lower)."""
    n = Vector((-0.55 * side, 0, -1.0)).normalized()
    kit.cut(obj, tuple(n), -(0.6 if not inner else 0.5) * height * abs(n.z))
    return obj
