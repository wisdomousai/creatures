"""Burr, the crew's robot cactus: a toy robot, not a cactus in a robot suit. A short
round planter on four little wheels, and out of it a saguaro column of three stacked
capsules (two for the trunk, one for the domed head) on necks, so they can slide
apart. Every capsule is fluted into eight rounded ribs with narrow seams between; the
flutes fade out across the front of the head, where the screen face sits. Two arms,
one higher than the other, stick out of the upper trunk and turn up at the elbow,
saguaro style: a short connector, a ball joint and an upright fluted capsule. On top
of the head sits a bud of five hinged petals round a lit heart, which the site opens
into a flower.

The spines are areoles: a little hex pad on every rib crest with a cluster of three
tapered pins (a long one between two short ones), each pin lit at its point. They are
grouped for the site to drive: rows up the column (Dot0 at the bottom to Dot5 on the
crown) and one group per arm (Dot6 his left, Dot7 his right). The pins of each capsule
ride on their own bone, so the site can pull them in or bristle them out; all the pins
of one group and bone are a single mesh.

Round the joints: sleeves and rings where the capsules telescope, elbow rings and
hinge caps, a ring at each shoulder. The pot has a rim band with rivets, a base band, a
drain grille at the back, a moisture gauge on his left flank (needle on bone gauge) and
three charge lamps across the front (Dot8..Dot10); a solar-cell panel sits on the back
of the head. The wheels have tread blocks, hubs and hub bolts. Kept in the bag: a
tumbleweed of crossed rings (bone tumble) and four pollen motes (mote.0..3, Dot11) that
the site scales to nothing until an act needs them. Faces -Y like the rest of the
crew; about 0.62 m to the bud.
"""

import math

import bpy
from mathutils import Euler, Matrix, Vector

import kit
import looks

FACE = 'cactus'
PREVIEW = dict(lift=0.0, width=0.45)

D = {
    'pot': dict(radii=(0.106, 0.106, 0.05), center=(0, 0, 0.09), taper=-0.24),
    'rim': dict(radii=(0.12, 0.12, 0.019), center=(0, 0, 0.135)),
    'soil': dict(radii=(0.106, 0.106, 0.008), center=(0, 0, 0.152)),
    'wheels': dict(x=0.068, y=0.056, r=0.022, width=0.013),
    # The column: (bone, bottom, top, top roundness) in z. Fluted into ribs with a seam
    # up the front, so two rows of studs run up either side of it.
    'column': [('trunk.1', 0.14, 0.275, 0.4), ('trunk.2', 0.28, 0.415, 0.4), ('head', 0.42, 0.6, 0.75)],
    'flute': dict(radius=0.095, n=8, depth=0.13, sharp=1.5, e=0.4),
    # On the head the flutes fade out across the front (degrees either side of straight
    # ahead), leaving a smooth panel for the face.
    'face': (44, 60),
    # A neck between capsules, mostly hidden inside them: the site slides the capsules
    # apart (up to about 0.03) to stretch him taller, telescope fashion.
    'collar': dict(r=0.072, h=0.036),
    # 8:5, like the cactus's face layout (512 x 320)
    'screen': dict(radii=(0.064, 0.018, 0.04), center=(0, -0.08, 0.49), bezel=0.008),
    # Spine rows as heights on each capsule (-1 bottom .. 1 top), and the Dot each lights.
    # On the head the face covers the front crests, so the lower row skips them.
    'rows': {'trunk.1': [(-0.42, 0), (0.42, 1)], 'trunk.2': [(-0.42, 2), (0.42, 3)],
             'head': [(-0.2, 4), (0.62, 5)]},
    'stud': dict(length=0.046, radius=0.0068, lit=0.6, sides=5, sink=0.006, lift=0.25),
    # Arms, saguaro style, one higher than the other: shoulder and elbow height, how far
    # out the elbow is, and the top of the upright part.
    'arms': {'L': dict(z=0.355, out=0.172, top=0.53), 'R': dict(z=0.305, out=0.165, top=0.455)},
    'arm': dict(r=0.026, ball=0.034, fore_r=0.038, n=6, e=0.45, top_e=0.8),
    'arm_rows': [-0.25, 0.4],
    'gauge': dict(center=(0.109, 0, 0.098), r=0.02),
    'tumble': dict(center=(0.0, -0.17, 0.034), r=0.032),
    'motes': 4,
    'pin': dict(side_length=0.03, side_radius=0.0055, pad=0.0155, arm_pad=0.0115, spread=38),
    'bud': dict(z=0.598, heart=0.02, petals=5, petal=(0.023, 0.009, 0.034), hinge=0.013, lean=30),
}


def groove(th, f):
    """0 on a rib's crest, 1 in the seam between two ribs; nothing across the front of a
    capsule with a face, which is left smooth for the screen."""
    g = ((1 - math.cos(f['n'] * (th - f['phase']))) / 2) ** f['sharp']
    if f.get('face'):
        a0, a1 = f['face']
        off = abs(math.atan2(math.sin(th + math.pi / 2), math.cos(th + math.pi / 2)))  # from straight ahead
        u = min(max((off - a0) / (a1 - a0), 0.0), 1.0)
        g *= u * u * (3 - 2 * u)
    return g


def fluted_point(f, th, phi):
    """A point on a fluted capsule round the origin (z up), f its shape: radius, rz, n
    ribs, depth of the seams, sharp(ness), e (bottom) and top_e (top) roundness, phase."""
    e = f['top_e'] if phi > 0 else f['e']
    cp, sp = kit.spow(math.cos(phi), e), kit.spow(math.sin(phi), e)
    r = f['radius'] * (1 - f['depth'] * groove(th, f))
    return Vector((r * cp * math.cos(th), r * cp * math.sin(th), f['rz'] * sp))


def fluted(name, f, seg=(48, 18)):
    """A capsule fluted into rounded ribs round its axis, crests at phase + k·360/n
    degrees (from +X), narrow seams between, the ribs meeting at the poles."""
    nu, nv = seg
    verts = [(0.0, 0.0, -f['rz'])]
    for j in range(1, nv):
        phi = -math.pi / 2 + math.pi * j / nv
        verts += [tuple(fluted_point(f, 2 * math.pi * i / nu, phi)) for i in range(nu)]
    verts.append((0.0, 0.0, f['rz']))
    top = len(verts) - 1
    faces = [(0, 1 + (i + 1) % nu, 1 + i) for i in range(nu)]
    for j in range(nv - 2):
        r0, r1 = 1 + j * nu, 1 + (j + 1) * nu
        faces += [(r0 + i, r0 + (i + 1) % nu, r1 + (i + 1) % nu, r1 + i) for i in range(nu)]
    last = 1 + (nv - 2) * nu
    faces += [(last + i, last + (i + 1) % nu, top) for i in range(nu)]
    return kit.mesh_object(name, verts, faces)


def crest_studs(f, rows, skip=()):
    """(base, direction) of a stud on every rib crest (but those in skip) at each row
    height (-1..1), standing out of the surface and tipped a little up."""
    out = []
    for s in rows:
        e = f['top_e'] if s > 0 else f['e']
        phi = math.asin(math.copysign(abs(s) ** (1 / e), s))
        for k in range(f['n']):
            if k in skip:
                continue
            th = f['phase'] + 2 * math.pi * k / f['n']
            p = fluted_point(f, th, phi)
            du = fluted_point(f, th + 1e-3, phi) - p
            dv = fluted_point(f, th, phi + 1e-3) - p
            normal = du.cross(dv).normalized()
            if normal.dot(p) < 0:
                normal = -normal
            out.append((p, (normal + Vector((0, 0, D['stud']['lift']))).normalized()))
    return out


def prism_geom(base, direction, length, r0, r1, sides):
    """(verts, faces) of a faceted pin from base along direction: a prism tapering from
    r0 to r1, or a point when r1 is 0."""
    axis = Vector(direction).normalized()
    side = axis.cross(Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))).normalized()
    up = axis.cross(side)
    ring = [side * math.cos(2 * math.pi * k / sides) + up * math.sin(2 * math.pi * k / sides) for k in range(sides)]
    b, t = Vector(base), Vector(base) + axis * length
    verts = [tuple(b + v * r0) for v in ring]
    faces = []
    if r1 == 0:
        verts.append(tuple(t))
        faces += [tuple(range(sides))[::-1]] + [(k, (k + 1) % sides, sides) for k in range(sides)]
    else:  # open at the top: it's under the point
        verts += [tuple(t + v * r1) for v in ring]
        faces += [tuple(range(sides))[::-1]]
        faces += [(k, (k + 1) % sides, sides + (k + 1) % sides, sides + k) for k in range(sides)]
    return verts, faces


class Batch:
    """Loose geometry gathered up into one mesh (a hundred pins are one object)."""

    def __init__(self):
        self.verts, self.faces = [], []

    def add(self, geom):
        v, f = geom
        n = len(self.verts)
        self.verts += v
        self.faces += [tuple(i + n for i in face) for face in f]

    def object(self, name):
        obj = kit.mesh_object(name, self.verts, self.faces)
        obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
        return obj


def box_geom(center, axes, half):
    """A box at center, its three unit axes and half sizes."""
    c = Vector(center)
    verts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                verts.append(tuple(c + Vector(axes[0]) * sx * half[0] + Vector(axes[1]) * sy * half[1]
                                   + Vector(axes[2]) * sz * half[2]))
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return verts, faces


def column_flute(bone, lo, hi, top_e):
    f = D['flute']
    face = tuple(math.radians(a) for a in D['face']) if bone == 'head' else None
    return dict(f, rz=(hi - lo) / 2, top_e=top_e, phase=-math.pi / 2 + math.pi / f['n'], face=face)


def arm_points(sfx):
    """Shoulder, elbow and the top of the upright part of one arm."""
    side = 1 if sfx == 'L' else -1
    a = D['arms'][sfx]
    shoulder = (side * D['flute']['radius'] * 0.88, 0, a['z'])
    elbow = (side * a['out'], 0, a['z'])
    return shoulder, elbow, (side * a['out'], 0, a['top'])


def wheel_centres():
    w = D['wheels']
    return [(name, (x * w['x'], y * w['y'], w['r'])) for name, x, y in
            (('FL', 1, -1), ('FR', -1, -1), ('BL', 1, 1), ('BR', -1, 1))]


def petal_lines():
    """(hinge, tip) of each petal, closed into a bud leaning in over the heart."""
    b = D['bud']
    out = []
    for k in range(b['petals']):
        a = math.pi / 2 + 2 * math.pi * k / b['petals']  # the first petal at the back
        radial = Vector((math.cos(a), math.sin(a), 0))
        hinge = Vector((0, 0, b['z'] + 0.004)) + radial * b['hinge']
        lean = math.radians(b['lean'])
        tip = hinge + (Vector((0, 0, 1)) * math.cos(lean) - radial * math.sin(lean)) * b['petal'][2] * 2
        out.append((hinge, tip))
    return out


def petal_frame(d, hinge):
    """Stands a petal (long along z, thin along y) on its line d, its flat side to the
    middle of the bud."""
    radial = Vector((hinge.x, hinge.y, 0)).normalized()
    z = d.normalized()
    y = (radial - z * radial.dot(z)).normalized()
    return Matrix((y.cross(z), y, z)).transposed().to_quaternion()


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('pot', (0, 0, D['wheels']['r']), (0, 0, 0.15), 'root'),
    ]
    parent = 'pot'
    for bone, lo, hi, _ in D['column']:
        bones.append((bone, (0, 0, lo), (0, 0, hi), parent))
        mid = (lo + hi) / 2
        # The studs of each capsule, scaled about its middle to pull them in or out.
        bones.append((f'spines.{bone}', (0, 0, mid), (0, 0, mid + 0.05), bone))
        parent = bone
    z = D['bud']['z']
    bones.append(('flower', (0, 0, z), (0, 0, z + 0.05), 'head'))
    for k, (hinge, tip) in enumerate(petal_lines()):
        bones.append((f'petal.{k}', tuple(hinge), tuple(tip), 'flower'))
    for sfx in ('L', 'R'):
        sh, el, top = arm_points(sfx)
        bones.append((f'arm.{sfx}', sh, el, 'trunk.2'))
        bones.append((f'fore.{sfx}', el, top, f'arm.{sfx}'))
        mid = (el[2] + top[2]) / 2
        bones.append((f'spines.{sfx}', (el[0], 0, mid), (el[0], 0, mid + 0.05), f'fore.{sfx}'))
    for name, (x, y, z) in wheel_centres():
        bones.append((f'wheel.{name}', (x, y, z), (x + math.copysign(0.03, x), y, z), 'root'))
    gx, gy, gz = D['gauge']['center']
    bones.append(('gauge', (gx, gy, gz), (gx, gy, gz + 0.02), 'pot'))
    tx, ty, tz = D['tumble']['center']
    bones.append(('tumble', (tx, ty, tz), (tx, ty, tz + 0.03), 'root'))
    for k in range(D['motes']):
        bones.append((f'mote.{k}', (0, 0, z), (0, -0.02, z), 'head'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def ball(name, r, at, bone, mat='joint'):
        return add(kit.superellipsoid(name, (r, r, r), seg=(12, 8), location=at), m[mat], bone)

    def ring(name, major, minor, at, bone, mat='joint', axis='z', seg=(32, 8)):
        rot = {'z': (0, 0, 0), 'x': (0, math.pi / 2, 0), 'y': (math.pi / 2, 0, 0)}[axis]
        return add(kit.torus(name, major, minor, seg=seg, location=at, rotation=rot), m[mat], bone)

    def between(name, a, b, ry, rz, e=(0.4, 0.5), seg=(12, 6)):
        a, b = Vector(a), Vector(b)
        d = b - a
        obj = kit.superellipsoid(name, (d.length / 2, ry, rz), e[0], e[1], seg=seg, location=(a + b) / 2)
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(d.normalized())
        return obj

    st, pn = D['stud'], D['pin']
    # One mesh per bone (the steel pads and shafts) and per bone and dot (the lit points).
    steel, lit = {}, {}

    def areoles(lines, at, dot, bone, pad):
        """A hex pad on each crest and a cluster of three pins: a long one between two
        short ones fanned along the crest's cross line."""
        shafts = steel.setdefault(bone, Batch())
        tips = lit.setdefault((bone, dot), Batch())
        for p, n in lines:
            base = p + Vector(at) - n * st['sink']
            shafts.add(prism_geom(base - n * 0.002, n, 0.006, pad, pad * 0.85, 6))
            side = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))).normalized()
            a = math.radians(pn['spread'])
            pins = [(n, st['length'], st['radius']),
                    ((n * math.cos(a) + side * math.sin(a)).normalized(), pn['side_length'], pn['side_radius']),
                    ((n * math.cos(a) - side * math.sin(a)).normalized(), pn['side_length'], pn['side_radius'])]
            for d, length, r in pins:
                neck = length * (1 - st['lit'])
                shafts.add(prism_geom(base, d, neck + 0.002, r, r * 0.9, st['sides']))
                tips.add(prism_geom(base + d * neck, d, length * st['lit'], r * 0.9, 0, st['sides']))

    # The planter: a round pot flaring to a thick rim with a band and rivets, soil on top,
    # a base band, a drain grille, a gauge and charge lamps.
    p, r, so = D['pot'], D['rim'], D['soil']
    add(kit.superellipsoid('Pot', p['radii'], 0.3, 1.0, seg=(48, 20), taper=p['taper'], location=p['center']),
        m['role']('Pot'), 'pot')
    add(kit.superellipsoid('PotRim', r['radii'], 0.35, 1.0, seg=(48, 10), location=r['center']), m['role']('Pot'),
        'pot')
    add(kit.superellipsoid('RimBand', (r['radii'][0] + 0.002, r['radii'][1] + 0.002, 0.0055), 0.3, 1.0, seg=(48, 6),
                           location=(0, 0, r['center'][2] - 0.001)), m['joint'], 'pot')
    add(kit.superellipsoid('BaseBand', (0.083, 0.083, 0.0045), 0.3, 1.0, seg=(40, 6), location=(0, 0, 0.058)),
        m['joint'], 'pot')
    add(kit.superellipsoid('Soil', so['radii'], 0.3, 1.0, seg=(40, 6), location=so['center']),
        m['role']('Soil', 'bezel'), 'pot')
    rivets = Batch()
    for i in range(10):
        a = 2 * math.pi * (i + 0.5) / 10
        rivets.add(prism_geom((0.1145 * math.cos(a), 0.1145 * math.sin(a), 0.1535), (0, 0, 1), 0.005, 0.0052, 0.0038,
                              6))
    add(rivets.object('RimRivets'), m['bezel'], 'pot')
    # Lamps across the rim band's front, low to high charge (Dot8..Dot10).
    for i, x in enumerate((-0.03, 0, 0.03)):
        y = -math.sqrt(max(0.0, (r['radii'][0] + 0.002) ** 2 - x * x)) + 0.002
        add(kit.superellipsoid(f'ChargeLamp.{i}', (0.0085, 0.005, 0.0045), 0.5, 0.6, seg=(12, 8),
                               location=(x, y, r['center'][2] - 0.001)), m['dot'](8 + i), 'pot')
    # Drain grille at the back: a plate with slots.
    add(kit.superellipsoid('GrillePlate', (0.04, 0.006, 0.02), 0.3, 0.3, seg=(20, 8), location=(0, 0.1045, 0.09)),
        m['joint'], 'pot')
    for i in range(3):
        add(kit.superellipsoid(f'GrilleSlot.{i}', (0.028, 0.004, 0.0022), 0.4, 0.5, seg=(12, 6),
                               location=(0, 0.1085, 0.081 + i * 0.009)), m['bezel'], 'pot')
    # The gauge on his left flank: a dial in a ring, ticks, a needle on its own bone.
    g = D['gauge']
    gx, gy, gz = g['center']
    add(kit.superellipsoid('GaugeDial', (g['r'], g['r'], 0.005), 0.3, 1.0, seg=(24, 8), location=(gx, gy, gz),
                           rotation=(0, math.pi / 2, 0)), m['bezel'], 'pot')
    ring('GaugeRing', g['r'], 0.0035, (gx + 0.002, gy, gz), 'pot', axis='x', seg=(24, 8))
    for i, deg in enumerate((-55, -28, 0, 28, 55)):
        a = math.radians(deg)
        c, sn = math.cos(a), math.sin(a)
        add(between(f'GaugeTick.{i}', (gx + 0.006, gy + 0.012 * sn, gz + 0.012 * c),
                    (gx + 0.006, gy + 0.017 * sn, gz + 0.017 * c), 0.0017, 0.0017), m['glow'], 'pot')
    add(between('GaugeNeedle', (gx + 0.008, gy, gz), (gx + 0.008, gy, gz + 0.016), 0.0022, 0.0022), m['glow'], 'gauge')
    ball('GaugePin', 0.0045, (gx + 0.009, gy, gz), 'gauge')

    # Wheels: a tyre, a ring of tread blocks, a hub with a bolt.
    w = D['wheels']
    for name, (x, y, z) in wheel_centres():
        out = math.copysign(1, x)
        add(kit.superellipsoid(f'Wheel.{name}', (w['r'] * 0.93, w['r'] * 0.93, w['width'] * 0.9), 0.3, 1.0, seg=(24, 8),
                               location=(x, y, z), rotation=(0, math.pi / 2, 0)), m['joint'], f'wheel.{name}')
        treads = Batch()
        for k in range(10):
            a = 2 * math.pi * k / 10
            radial = Vector((0, math.cos(a), math.sin(a)))
            treads.add(box_geom(Vector((x, y, z)) + radial * w['r'] * 0.97,
                                (Vector((1, 0, 0)), Vector((0, -math.sin(a), math.cos(a))), radial),
                                (w['width'] * 0.5, 0.0038, 0.0042)))
        add(treads.object(f'Treads.{name}'), m['bezel'], f'wheel.{name}')
        add(kit.superellipsoid(f'Hub.{name}', (w['r'] * 0.5, w['r'] * 0.5, w['width'] * 0.6), 0.3, 1.0,
                               seg=(16, 6), location=(x + out * w['width'] * 0.7, y, z), rotation=(0, math.pi / 2, 0)),
            m['bezel'], f'wheel.{name}')
        add(kit.superellipsoid(f'HubBolt.{name}', (w['r'] * 0.18, w['r'] * 0.18, w['width'] * 0.35), 0.3, 1.0,
                               seg=(10, 4), location=(x + out * w['width'] * 1.25, y, z), rotation=(0, math.pi / 2, 0)),
            m['joint'], f'wheel.{name}')

    # The column: three fluted capsules with a neck and two sleeve rings between each two.
    for bone, lo, hi, top_e in D['column']:
        f = column_flute(bone, lo, hi, top_e)
        mid = (lo + hi) / 2
        cap = fluted(bone.replace('.', ''), f)
        cap.location = (0, 0, mid)
        add(cap, m['shell'], bone)
        for s, dot in D['rows'][bone]:
            front = (0, f['n'] - 1)  # the two crests either side of the face
            lines = crest_studs(f, [s], skip=front if bone == 'head' and s < 0.5 else ())
            areoles(lines, (0, 0, mid), dot, f'spines.{bone}', pn['pad'])
    c = D['collar']
    for (b0, _, hi, _), (b1, lo, _, _) in zip(D['column'], D['column'][1:]):
        z = (hi + lo) / 2
        add(kit.superellipsoid(f'Collar.{b0}', (c['r'], c['r'], c['h']), 0.4, 1.0, seg=(40, 8),
                               location=(0, 0, z)), m['joint'], b0)
        ring(f'SleeveLow.{b0}', 0.068, 0.0055, (0, 0, z - 0.0125), b0, 'bezel', seg=(28, 6))
        ring(f'SleeveHigh.{b0}', 0.068, 0.0055, (0, 0, z + 0.0125), b1, 'bezel', seg=(28, 6))

    # The face, on the smooth panel across the front of the head.
    sc = D['screen']
    glass, rim = kit.screen('Cactus', sc['radii'], sc['center'], sc['bezel'], e=0.4, seg=(40, 24))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    # A solar-cell panel on the back of the head: a plate and a grid of cells.
    cells = Batch()
    ex, ey, ez = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    for i in range(2):
        for j in range(3):
            cells.add(box_geom((-0.0085 + i * 0.017, 0.1042, 0.5 + (j - 1) * 0.0135), (ex, ey, ez),
                               (0.0072, 0.0012, 0.0057)))
    add(kit.superellipsoid('SolarPlate', (0.0205, 0.0075, 0.0245), 0.3, 0.3, seg=(16, 8), location=(0, 0.0965, 0.5)),
        m['bezel'], 'head')
    add(cells.object('SolarCells'), m['shell'], 'head')

    # Arms: a ball and a ring at the shoulder, a connector out to the elbow ball with hinge
    # caps and a ring, and an upright fluted capsule with its own areoles.
    a = D['arm']
    for sfx, dot in (('L', 6), ('R', 7)):
        sh, el, top = arm_points(sfx)
        side = 1 if sfx == 'L' else -1
        add(kit.superellipsoid(f'Shoulder.{sfx}', (a['ball'] * 0.9,) * 3, seg=(16, 10), location=sh), m['joint'],
            f'arm.{sfx}')
        add(kit.tube(f'Arm.{sfx}', [sh, el], a['r'], ring=16)[0], m['shell'], f'arm.{sfx}')
        ring(f'ShoulderRing.{sfx}', 0.031, 0.0048, (sh[0] + side * 0.02, 0, sh[2]), f'arm.{sfx}', 'bezel', axis='x',
             seg=(24, 8))
        add(kit.superellipsoid(f'Elbow.{sfx}', (a['ball'],) * 3, seg=(16, 10), location=el), m['joint'],
            f'fore.{sfx}')
        for yy in (-1, 1):
            add(kit.superellipsoid(f'ElbowCap.{sfx}{yy}', (0.0135, 0.0055, 0.0135), 0.3, 1.0, seg=(16, 4),
                                   location=(el[0], yy * a['ball'] * 0.9, el[2]), rotation=(math.pi / 2, 0, 0)),
                m['bezel'], f'fore.{sfx}')
        ring(f'ElbowRing.{sfx}', 0.0325, 0.0048, (el[0], 0, el[2] + 0.018), f'fore.{sfx}', 'bezel', seg=(24, 8))
        rz = (top[2] - el[2]) / 2
        f = dict(D['flute'], radius=a['fore_r'], rz=rz, n=a['n'], e=a['e'], top_e=a['top_e'],
                 phase=0.0 if sfx == 'L' else math.pi)  # a crest straight out to the side
        fore = fluted(f'Fore.{sfx}', f, seg=(36, 14))
        fore.location = (el[0], 0, el[2] + rz)
        add(fore, m['shell'], f'fore.{sfx}')
        areoles(crest_studs(f, D['arm_rows'], skip=(3,)), fore.location, dot, f'spines.{sfx}', pn['arm_pad'])

    # The bud: a lit heart in a cup with a collar, and five hinged petals closed over it.
    b = D['bud']
    add(kit.superellipsoid('Cup', (0.026, 0.026, 0.01), 0.5, 1.0, seg=(24, 8), location=(0, 0, b['z'])),
        m['joint'], 'flower')
    ring('BudCollar', 0.0285, 0.004, (0, 0, b['z'] - 0.004), 'head', 'bezel', seg=(24, 8))
    add(kit.superellipsoid('Heart', (b['heart'],) * 3, seg=(20, 12), location=(0, 0, b['z'] + 0.014)), m['beacon'],
        'flower')
    for k, (hinge, tip) in enumerate(petal_lines()):
        d = (tip - hinge).normalized()
        petal = kit.superellipsoid(f'Petal.{k}', b['petal'], 0.7, 0.8, seg=(14, 8))
        petal.rotation_mode = 'QUATERNION'
        petal.rotation_quaternion = petal_frame(d, hinge)
        petal.location = hinge + d * b['petal'][2]
        add(petal, m['role']('Petal', 'joint'), f'petal.{k}')
        ball(f'Hinge.{k}', 0.0042, tuple(hinge), 'flower', 'bezel')

    # All the pins, merged: steel shafts per bone, lit points per bone and dot.
    for bone, batch in steel.items():
        add(batch.object('Spines.' + bone), m['role']('Spine', 'joint'), bone)
    for (bone, dot), batch in lit.items():
        add(batch.object(f'SpineTips{dot}.' + bone), m['dot'](dot), bone)

    # Kept in the bag: a tumbleweed of crossed rings (one mesh), and pollen motes.
    tw = D['tumble']
    weed = Batch()
    for rot, rr in (((0, 0, 0), 1.0), ((math.pi / 2, 0, 0), 1.0), ((0, math.pi / 2, 0), 1.0),
                    ((math.pi / 4, 0, math.pi / 4), 0.92), ((-math.pi / 4, math.pi / 4, 0), 0.92)):
        o = kit.torus('tmp', tw['r'] * rr, 0.0028, seg=(20, 5))
        mw = Euler(rot).to_matrix()
        weed.add(([tuple(mw @ v.co + Vector(tw['center'])) for v in o.data.vertices],
                  [tuple(pl.vertices) for pl in o.data.polygons]))
        bpy.data.objects.remove(o)
    add(weed.object('Tumbleweed'), m['role']('Tumble', 'joint'), 'tumble')
    for k in range(D['motes']):
        add(kit.superellipsoid(f'Mote.{k}', (0.0075,) * 3, seg=(10, 6), location=(0, 0, b['z'])), m['dot'](11),
            f'mote.{k}')

    return looks.finish(kit.armature('CactusRig', rig_bones()), parts, skin, m)
