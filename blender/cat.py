"""Pixel, the crew's robot cat: a screen-faced TV head with cat ears on a loaf of a body,
four stubby legs, a tail in three bones, and a collar with a bell that lights in the
beacon's colour. Faces -Y like the rest of the crew; about 0.62 m to the ear tips.

The other cats (kitten.py, kitty.py, fatcat.py) are built from the parts here.

Coats: in the colour look a cat turns up in a different coat each time (palettes.json,
'coats'). A coat is only paint, so the shape never changes: the body, head and tail are
cut into regions along clean lines and each region is named for its role (Stripe,
Patch, Spot, Tail, Tip, Ear, Inner, Paw, Collar), which a coat colours or leaves in the
base colour. In the ink and paper looks every region is its base part's colour.

Props: a toy ball with a light round its middle (Dot7) and a cup, each on a bone of its
own that isn't parented to the body, so they stay where they are when the cat turns.
The site keeps them shrunk to nothing until a trick needs one.
"""

import math

import bmesh
from mathutils import Vector

import kit
import looks

FACE = 'cat'
PREVIEW = dict(lift=0.0, width=0.7)
BOXY = 0.35

D = {
    'head': dict(radii=(0.2, 0.16, 0.15), center=(0, -0.2, 0.45)),
    'screen': dict(radii=(0.155, 0.11, 0.105), center=(0, -0.265, 0.44), bezel=0.01),
    'ear': dict(x=0.12, z=0.575, tilt=0.28, profile=[(0.0, 0.14), (0.025, 0.12), (0.06, 0.05), (0.078, 0.0)]),
    'body': dict(radii=(0.14, 0.24, 0.12), center=(0, 0.04, 0.25), e=0.45),
    'leg': dict(x=0.085, front=-0.12, back=0.2, top=0.22, bottom=0.04, r=0.037),
    'paw': dict(radii=(0.046, 0.056, 0.03), e=0.4),
    'tail': [(0, 0.24, 0.27), (0, 0.33, 0.3), (0, 0.39, 0.39), (0, 0.39, 0.5), (0, 0.35, 0.58)],
    'tail_r': (0.032, 0.02),
    'collar': dict(center=(0, -0.155, 0.335), major=0.105, minor=0.016, tilt=0.55),
    'bell': dict(r=0.028, center=(0, -0.255, 0.285)),
    # Where the props rest (x, y on the floor): out of the way, to either side.
    'props': dict(ball=(0.3, -0.16), cup=(-0.3, -0.12)),
}

# The props, the same size for every cat.
BALL = dict(r=0.045, band=0.011)
CUP = dict(profile=[(0.0, 0.07), (0.029, 0.07), (0.036, 0.078), (0.04, 0.074), (0.034, 0.004), (0.028, 0.0),
                    (0.0, 0.0)], handle=(0.022, 0.007))

# Coat regions, in the part's own proportions (-1..1 across each radius; y runs from the
# chest, -1, to the rump, +1): tabby stripes over the back and down the flanks, calico
# patches on the flanks and a saddle.
STRIPES = [(-0.36, -0.18), (-0.02, 0.16), (0.32, 0.5), (0.66, 0.82)]
HEAD_STRIPES = [(-0.4, -0.22), (-0.08, 0.08), (0.22, 0.4)]
TAIL_RINGS = [(0.42, 0.52), (0.64, 0.74), (0.86, 1.01)]


def paint(obj, pick, cuts=()):
    """Paint regions of a part in other materials with clean edges, without changing its
    shape: cut the mesh along planes (point, normal, in world space), then give each face
    the material pick(face centre) names (None keeps the part's own)."""
    own = obj.data.materials[0]
    mats = [own]
    world = obj.matrix_basis.copy()  # matrix_world is stale until the scene updates
    inv = world.inverted()
    rot = inv.to_3x3()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for co, no in cuts:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-7, plane_co=inv @ Vector(co),
                               plane_no=(rot @ Vector(no)).normalized())
    for f in bm.faces:
        mat = pick(world @ f.calc_center_median()) or own
        if mat not in mats:
            mats.append(mat)
        f.material_index = mats.index(mat)
    bm.to_mesh(obj.data)
    bm.free()
    index = [p.material_index for p in obj.data.polygons]  # clearing the slots resets them
    obj.data.materials.clear()
    for mat in mats:
        obj.data.materials.append(mat)
    obj.data.polygons.foreach_set('material_index', index)
    obj.data.update()
    return obj


def normalised(p, center, radii):
    return tuple((p[i] - center[i]) / radii[i] for i in range(3))


def coat_body(obj, center, radii, m, low=-0.3):
    """Stripes over the back and down to `low` on the flanks; calico patches: the left
    flank's front and the right flank's rear, and a saddle over the middle of the back."""
    def region(x, y, z):
        stripe = z > low and any(a < y < b for a, b in STRIPES)
        if z > 0.62 and -0.25 < y < 0.45:
            spot = 'Spot'
        elif (x > 0.3 and y < 0.2) or (x < -0.3 and y > 0.25):
            spot = 'Patch'
        elif x < -0.3 and y < -0.2 and z > -0.45:
            spot = 'Spot'
        else:
            spot = ''
        name = spot + ('Stripe' if stripe else '')
        return m['role'](name) if name else None

    ys = [y for pair in STRIPES for y in pair] + [0.2, 0.25, -0.2, -0.25, 0.45]
    planes = [((center[0], center[1] + v * radii[1], center[2]), (0, 1, 0)) for v in ys]
    planes += [((center[0] + v * radii[0], center[1], center[2]), (1, 0, 0)) for v in (0.3, -0.3)]
    planes += [((center[0], center[1], center[2] + v * radii[2]), (0, 0, 1)) for v in (low, 0.62, -0.45)]
    return paint(obj, lambda p: region(*normalised(p, center, radii)), planes)


def coat_head(obj, center, radii, m, brow=0.62):
    """Tabby stripes down the forehead to the top of the screen (at `brow`), and calico
    patches: the upper left of the head and the right cheek."""
    def region(x, y, z):
        if z > brow and y < 0.35 and any(a < x < b for a, b in HEAD_STRIPES):
            return m['role']('Stripe')
        if x > 0.45 and z > -0.1:
            return m['role']('Patch')
        if x < -0.45 and z < 0.1:
            return m['role']('Spot')
        return None

    planes = [((center[0] + v * radii[0], center[1], center[2]), (1, 0, 0))
              for pair in HEAD_STRIPES for v in pair]
    planes += [((center[0] + v * radii[0], center[1], center[2]), (1, 0, 0)) for v in (0.45, -0.45)]
    planes += [((center[0], center[1], center[2] + v * radii[2]), (0, 0, 1)) for v in (brow, -0.1, 0.1)]
    planes += [((center[0], center[1] + 0.35 * radii[1], center[2]), (0, 1, 0))]
    return paint(obj, lambda p: region(*normalised(p, center, radii)), planes)


def coat_tail(obj, ts, m, rings=TAIL_RINGS):
    """Rings toward the tip, and the tip itself (Tip); the rest is Tail."""
    obj.data.materials.clear()
    for mat in (m['role']('Tail'), m['role']('Tip')):
        obj.data.materials.append(mat)
    for f in obj.data.polygons:
        t = sum(ts[i] for i in f.vertices) / len(f.vertices)
        f.material_index = 1 if any(a <= t < b for a, b in rings) else 0
    return obj


def ears(add, m, e, y, seg=24, inner_mat=None):
    """Flattened cones tipped out a little, with an inner ear in front (Inner, or the
    material given: a light)."""
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ear = kit.stretch(kit.lathe(f'Ear.{sfx}', e['profile'], seg=seg), sy=0.42)
        ear.location = (side * e['x'], y, e['z'] - 0.02)
        ear.rotation_euler = (0, side * e['tilt'], 0)
        add(ear, m['role']('Ear'), f'ear.{sfx}')
        inner = kit.stretch(kit.lathe(f'InnerEar.{sfx}', [(r * 0.62, z * 0.7 + 0.015) for r, z in e['profile']],
                                      seg=seg), sy=0.2)
        inner.location = (side * e['x'], y - e.get('inset', 0.028), e['z'] - 0.02)
        inner.rotation_euler = (0, side * e['tilt'], 0)
        add(inner, inner_mat(side) if inner_mat else m['role']('Inner', 'joint'), f'ear.{sfx}')


def legs(add, m, lg, pw, ring=14):
    """Four tube legs with a paw each."""
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        leg, _ = kit.tube(f'Leg.{name}', [(x * lg['x'], y, lg['top']), (x * lg['x'], y, lg['bottom'])], lg['r'],
                          ring=ring)
        add(leg, m['shell'], f'leg.{name}')
        add(kit.superellipsoid(f'Paw.{name}', pw['radii'], pw['e'], 0.6, seg=(24, 12),
                               location=(x * lg['x'], y - pw.get('ahead', 0.012), pw['radii'][2])),
            m['role']('Paw', 'joint'), f'leg.{name}')


def leg_bones(lg):
    return [(f'leg.{name}', (x * lg['x'], y, lg['top']), (x * lg['x'], y, 0.0), 'body')
            for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']),
                               ('BR', -1, lg['back']))]


def tail(add, m, points, radii, bones, n=20, ring=12, rings=TAIL_RINGS):
    """One tube over the tail's bones, thinning to a rounded tip, ringed for the coats."""
    pts = kit.spline(points, n)
    r0, r1 = radii
    obj, ts = kit.tube('Tail', pts, [r0 + (r1 - r0) * i / (len(pts) - 1) for i in range(len(pts))], ring=ring)
    add(obj, m['shell'], kit.chain(ts, bones))
    coat_tail(obj, ts, m, rings)
    return obj


def tail_bones(points, count, parent='body'):
    pts = kit.spline(points, count + 1)
    bones = []
    for i in range(count):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    return bones


def prop_bones(at):
    """The props' bones: at the ball's centre and the cup's foot, with no parent."""
    (bx, by), (cx, cy) = at['ball'], at['cup']
    r = BALL['r']
    return [('ball', (bx, by, r), (bx, by, r + 0.08), None), ('cup', (cx, cy, 0), (cx, cy, 0.08), None)]


def props(add, m, at):
    """The toy ball (a lit band round its middle, so you can see it roll) and the cup
    (with something dark in it)."""
    bx, by = at['ball']
    r, band = BALL['r'], BALL['band']
    add(kit.superellipsoid('Ball', (r, r, r), seg=(20, 14), location=(bx, by, r)), m['role']('Ball', 'joint'),
        'ball')
    add(kit.torus('BallBand', r * 0.97, band, seg=(28, 8), location=(bx, by, r)), m['dot'](7), 'ball')
    cx, cy = at['cup']
    add(kit.lathe('Cup', CUP['profile'], seg=20, location=(cx, cy, 0)), m['role']('Cup', 'joint'), 'cup')
    top = CUP['profile'][1]
    add(kit.superellipsoid('Coffee', (top[1] * 0.42, top[1] * 0.42, 0.004), 1.0, 1.0, seg=(16, 4),
                           location=(cx, cy, top[1] - 0.003)), m['role']('Coffee', 'bezel'), 'cup')
    hr, hw = CUP['handle']
    add(kit.torus('Handle', hr, hw, seg=(16, 8), location=(cx + 0.034, cy, 0.038), rotation=(1.5708, 0, 0)),
        m['role']('Cup', 'joint'), 'cup')


def ring_at(add, name, mat, bone, pts, i, major, minor, seg=(20, 6)):
    """A thin collar round a tube, at point i of its spline, turned to face along it."""
    a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
    rot = (b - a).normalized().to_track_quat('Z', 'Y').to_euler()
    return add(kit.torus(name, major, minor, seg=seg, location=tuple(pts[i]), rotation=tuple(rot)), mat, bone)


def refine(add, m):
    """Pixel's finer detail, on top of the shared parts (the other cats leave it out):
    seam plates round the body, a row of back plates, hip hubs, ear hinges with a light,
    whisker pods with lit tips, a studded collar with a lit tag, toe seams and pads, and
    the tail's collars with a lit tip. Lights: Dot0 the tail tip, Dot1-2 the tail's
    collars, Dot3 the ear hinges, Dot4 the whisker tips."""
    b, lg, pw = D['body'], D['leg'], D['paw']
    bx, by, bz = b['center']
    rx, ry, rz = b['radii']
    # Seam plates: thin rounded slabs a hair wider than the body, at the waist and hips.
    for j, (dy, s) in enumerate(((-0.42, 0.93), (0.1, 1.0), (0.5, 0.97))):
        add(kit.superellipsoid(f'Seam.{j}', (rx * s * 1.012, rz * s * 1.012, 0.004), b['e'], b['e'], seg=(32, 8),
                               location=(bx, by + dy * ry, bz), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    # Back plates: a row down the spine (tabby colour in the coats).
    for j, y in enumerate((-0.06, 0.03, 0.12, 0.21)):
        w = 0.036 - 0.004 * abs(j - 1.5)
        add(kit.superellipsoid(f'Back.{j}', (w, 0.03, 0.007), 0.5, 0.5, seg=(16, 6),
                               location=(0, y, bz + rz * 0.985 - 0.012 * (j in (0, 3)))),
            m['role']('Stripe', 'joint'), 'body')
    # Hip and shoulder hubs, an anklet on each leg, pads and toe beads on each paw.
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        bone = f'leg.{name}'
        add(kit.superellipsoid(f'Hub.{name}', (0.03, 0.03, 0.009), 0.3, 1.0, seg=(18, 6),
                               location=(x * 0.142, y, lg['top'] - 0.005), rotation=(0, math.pi / 2, 0)), m['joint'], bone)
        add(kit.superellipsoid(f'Bolt.{name}', (0.009,) * 3, seg=(8, 6), location=(x * 0.15, y, lg['top'] - 0.005)),
            m['bezel'], bone)
        add(kit.torus(f'Anklet.{name}', lg['r'] + 0.004, 0.006, seg=(20, 6), location=(x * lg['x'], y, 0.085)),
            m['joint'], bone)
        py = y - pw.get('ahead', 0.012)
        add(kit.superellipsoid(f'Pad.{name}', (0.03, 0.036, 0.004), 0.5, 0.5, seg=(14, 6),
                               location=(x * lg['x'], py + 0.004, 0.003)), m['role']('Pad', 'bezel'), bone)
        for k in (-1, 0, 1):
            add(kit.superellipsoid(f'Toe.{name}.{k}', (0.011, 0.009, 0.009), seg=(8, 6),
                                   location=(x * lg['x'] + k * 0.02, py - 0.047, 0.026 - 0.004 * abs(k))),
                m['role']('Pad', 'bezel'), bone)
    # Ears: a hinge puck at each base with a little light on it.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.03, 0.03, 0.02), 0.3, 1.0, seg=(16, 6),
                               location=(side * (e['x'] - 0.01), -0.2, e['z'] - 0.035),
                               rotation=(math.pi / 2, 0, 0)), m['joint'], f'ear.{sfx}')
        add(kit.superellipsoid(f'EarLed.{sfx}', (0.008,) * 3, seg=(8, 6),
                               location=(side * (e['x'] - 0.01), -0.225, e['z'] - 0.035)), m['dot'](3), f'ear.{sfx}')
        # A lit edge behind the inner ear, showing only as a thin rim round it.
        rim = kit.stretch(kit.lathe(f'EarRim.{sfx}', [(r * 0.72, z * 0.8 + 0.012) for r, z in e['profile']], seg=20),
                          sy=0.16)
        rim.location = (side * e['x'], -0.2 - e.get('inset', 0.028) + 0.012, e['z'] - 0.02)
        rim.rotation_euler = (0, side * e['tilt'], 0)
        add(rim, m['dot'](3), f'ear.{sfx}')
    hx, hy, hz = D['head']['center']
    # A bezel lip round the screen, and two stacked fluff plates on each cheek.
    sc = D['screen']
    add(kit.superellipsoid('ScreenLip', (sc['radii'][0] + 0.006, sc['radii'][2] + 0.006, 0.005), 0.3, 0.35,
                           seg=(40, 8), location=(0, sc['center'][1] - 0.09, sc['center'][2]),
                           rotation=(math.pi / 2, 0, 0)), m['joint'], 'head')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, (dz, w) in enumerate(((0.012, 0.03), (-0.016, 0.024))):
            add(kit.superellipsoid(f'Fluff.{sfx}{k}', (0.014, w, 0.017), 0.5, 0.5, seg=(12, 6),
                                   location=(side * (0.19 + 0.006 * k), hy - 0.045 - 0.008 * k, hz - 0.085 + dz),
                                   rotation=(0, 0, side * 0.35)), m['role']('Stripe', 'joint'), 'head')
    # Whisker pods on the cheeks, three lit-tipped whiskers each.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Pod.{sfx}', (0.02, 0.026, 0.02), 0.5, 0.5, seg=(14, 8),
                               location=(side * 0.196, hy - 0.075, hz - 0.045)), m['joint'], 'head')
        for k, dz in enumerate((0.03, 0.0, -0.03)):
            x0, y0, z0 = side * 0.205, hy - 0.085, hz - 0.045
            end = (side * 0.335, y0 - 0.02 - 0.005 * k, z0 + dz * 1.6)
            add(kit.tube(f'Whisker.{sfx}{k}', [(x0, y0, z0), (side * 0.27, y0 - 0.01, z0 + dz), end], 0.0035, ring=6)[0],
                m['bezel'], 'head')
            add(kit.superellipsoid(f'Tip.{sfx}{k}', (0.008,) * 3, seg=(8, 6), location=end), m['dot'](4), 'head')
    # Collar studs, and the tag: a lit disc on a small ring under the chin.
    c = D['collar']
    cx, cy, cz = c['center']
    for a in (200, 225, 250, 270, 290, 315, 340):
        r, t = math.radians(a), c['tilt']
        add(kit.superellipsoid(f'Stud.{a}', (0.009,) * 3, seg=(8, 6),
                               location=(cx + (c['major'] + 0.003) * math.cos(r),
                                         cy + (c['major'] + 0.003) * math.sin(r) * math.cos(t),
                                         cz + (c['major'] + 0.003) * math.sin(r) * math.sin(t))), m['bezel'], 'body')
    bl = D['bell']
    add(kit.torus('TagRing', 0.012, 0.004, seg=(14, 6), location=(0, bl['center'][1] + 0.004, bl['center'][2] + 0.03),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'body')
    add(kit.superellipsoid('TagRim', (0.036, 0.036, 0.006), 0.3, 1.0, seg=(24, 6),
                           location=(0, bl['center'][1] + 0.012, bl['center'][2]), rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'body')
    # The bell: a slit and a crown, and a small heart charm hanging beside it.
    add(kit.torus('BellSlit', bl['r'] * 0.95, 0.0035, seg=(20, 5),
                  location=(0, bl['center'][1], bl['center'][2] - 0.006), rotation=(math.pi / 2, 0, 0)), m['bezel'], 'body')
    add(kit.superellipsoid('BellCrown', (0.008, 0.008, 0.006), seg=(8, 6),
                           location=(0, bl['center'][1] + 0.004, bl['center'][2] + bl['r'] * 0.9)), m['bezel'], 'body')
    for sx in (-1, 1):
        add(kit.superellipsoid(f'Charm.{sx}', (0.008, 0.005, 0.009), seg=(8, 6),
                               location=(0.034 + sx * 0.004, bl['center'][1] + 0.006, bl['center'][2] + 0.012),
                               rotation=(0, 0.5 * sx, 0)), m['dot'](3), 'body')
    # Tail: collars at the joints between its bones (Dot1, Dot2), a lit tip (Dot0), a hub at the rump.
    pts = [Vector(q) for q in kit.spline(D['tail'], 97)]
    r0, r1 = D['tail_r']
    for i, t in ((1, 1 / 3), (2, 2 / 3)):
        ring_at(add, f'TailBand.{i}', m['dot'](i), f'tail.{i + 1}', pts, round(t * 96), r0 + (r1 - r0) * t + 0.003, 0.0055)
    add(kit.superellipsoid('TailTip', (0.022, 0.022, 0.03), seg=(14, 10), location=tuple(pts[-1] + Vector((0, -0.01, 0.006)))),
        m['dot'](0), 'tail.3')
    ring_at(add, 'TailCap', m['joint'], 'tail.3', pts, 91, r1 + 0.004, 0.006)
    p0 = Vector(D['tail'][0])
    add(kit.superellipsoid('TailHub', (0.04, 0.04, 0.03), 0.4, 1.0, seg=(16, 8), location=(0, p0.y - 0.005, p0.z),
                           rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')


def rig_bones():
    lg = D['leg']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.22, 0.25), (0, -0.14, 0.27), 'root'),
        ('head', (0, -0.15, 0.32), (0, -0.2, 0.6), 'body'),
        ('ear.L', (D['ear']['x'], -0.2, D['ear']['z']), (D['ear']['x'] + 0.03, -0.2, D['ear']['z'] + 0.14), 'head'),
        ('ear.R', (-D['ear']['x'], -0.2, D['ear']['z']), (-D['ear']['x'] - 0.03, -0.2, D['ear']['z'] + 0.14), 'head'),
    ]
    bones += tail_bones(D['tail'], 3)
    bones += leg_bones(lg)
    bones += prop_bones(D['props'])
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    h = D['head']
    head = add(kit.superellipsoid('Head', h['radii'], BOXY, BOXY, seg=(56, 36), location=h['center']), m['shell'],
               'head')
    coat_head(head, h['center'], h['radii'], m)
    sc = D['screen']
    glass, rim = kit.screen('Cat', sc['radii'], sc['center'], sc['bezel'], e=BOXY)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    ears(add, m, D['ear'], -0.2)

    b = D['body']
    body = add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(48, 32), location=b['center']),
               m['shell'], 'body')
    coat_body(body, b['center'], b['radii'], m)

    # Collar and bell.
    c = D['collar']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(40, 10), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['role']('Collar', 'joint'), 'body')
    bl = D['bell']
    add(kit.superellipsoid('Bell', (bl['r'],) * 3, seg=(20, 14), location=bl['center']), m['beacon'], 'body')

    legs(add, m, D['leg'], D['paw'])
    tail(add, m, D['tail'], D['tail_r'], ['tail.1', 'tail.2', 'tail.3'])
    refine(add, m)
    props(add, m, D['props'])

    return looks.finish(kit.armature('CatRig', rig_bones()), parts, skin, m)
