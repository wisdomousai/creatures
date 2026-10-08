"""The set pieces: plants and furniture that are alive, standing in the back of the box. A
potted fern whose fronds end in little lit coils, a sunflower lamp, a floor lamp that wears
its shade like a hat over a round face, a plump armchair, a bookshelf of restless books, a
round rug on a grid of bones, a three-legged stool, a small radio, and for the library a
fireplace kept by two firedogs, a tall bookcase with a rolling ladder and a cat's nook (and
its twin the other way round, with the library's copy of the book) and a gramophone. Robot versions of each:
rounded, matte, bolted and seamed, a light or two the site blinks (Dot0, Dot1, ...), colours
of their own only in the colour look (roles).

Each stands on the floor at the origin, facing -Y (the site's front), with bones of its
own for whatever moves (fronds, petals, arms, books, dials, the rug's nodes). Exported as
set-NAME (blender/build.sh set-fern).
"""

import math
import re

import bmesh
from mathutils import Matrix, Vector

import kit
import looks
from decor import ball, remember, slab

PI = math.pi


# The roles the site puts a material map on (looks.ts SURFACES), whose parts get UVs in
# metres so each map keeps its true size: wood grain along a part's longest edge, book cloth
# up a book, velvet on cushions; and the gramophone's case, which is wood too.
TEXTURED = re.compile(r'^Shell_(Wood|Book\d|Cushion)$')


def texture_uv(name, obj, role):
    if not (TEXTURED.match(role) or (name == 'gramophone' and role == 'Shell_Case')):
        return
    grain = None
    if role.startswith('Shell_Book'):  # up the book, unless it lies flat
        co = [v.co for v in obj.data.vertices]
        ext = [max(c[i] for c in co) - min(c[i] for c in co) for i in range(3)]
        grain = 2 if ext[2] > 0.6 * max(ext) else None
    kit.box_uv(obj, grain)


class Kind:
    """One set piece, with the interface crew.module() gives the exporter and sheets."""

    FACE = 'bolt'  # no screen; the materials need some face

    def __init__(self, name, spec):
        self.name = name
        self.spec = spec
        self.PREVIEW = dict(lift=0.0, width=spec['width'])

    def build(self, look='ink', flame=None):
        m = looks.materials(look, flame, palette=f'set-{self.name}')
        parts, skin = [], []

        def add(obj, mat, bone='root'):
            kit.assign(obj, mat)
            texture_uv(self.name, obj, mat.name)
            parts.append(obj)
            skin.append((obj, bone))
            return obj

        remember(m)
        extra = self.spec['build'](m, add) or []
        top = self.spec['height']
        bones = [('root', (0, 0, 0), (0, 0, top * 0.5), None)] + extra
        rig = kit.armature(f'{self.name.capitalize()}Set', bones)
        return looks.finish(rig, parts, skin, m)


def kind(name):
    return Kind(name, KINDS[name])


# ---------- Small parts ----------

FACING = {'front': (PI / 2, 0, 0), 'back': (-PI / 2, 0, 0), 'left': (0, PI / 2, 0), 'right': (0, -PI / 2, 0),
          'top': (0, 0, 0)}


def bolt(add, m, at, r=0.008, face='front', bone='root'):
    """A hex bolt head, facing out."""
    add(kit.lathe('Bolt', [(0, r * 0.4), (r * 0.9, r * 0.4), (r, 0), (0, -r * 0.1)], seg=6, location=at,
                  rotation=FACING[face]), m['joint'], bone)


def bolts(add, m, points, r=0.008, face='front', bone='root'):
    for p in points:
        bolt(add, m, p, r, face, bone)


def eyes(add, m, at, gap, rx, rz, bone_l='eyeL', bone_r='eyeR', dot=0):
    """Two pill-shaped light eyes on a front face (+X is its left), each on a bone that
    blinks and looks about."""
    x, y, z = at
    for sx, bone in ((1, bone_l), (-1, bone_r)):
        add(kit.superellipsoid('Eye', (rx, 0.006, rz), 0.7, 0.9, seg=(16, 10), location=(x + sx * gap, y - 0.004, z)),
            m['dot'](dot), bone)


def eye_bones(at, gap, tall, parent):
    x, y, z = at
    return [(name, (x + sx * gap, y, z), (x + sx * gap, y, z + tall), parent)
            for sx, name in ((1, 'eyeL'), (-1, 'eyeR'))]


def ring(r, z, n=48, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * PI * k / n), cy + r * math.sin(2 * PI * k / n), z) for k in range(n + 1)]


def arc_pts(cx, cy, z, r, a0, a1, n=12):
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n), z)
            for k in range(n + 1)]


def squircle(hx, hy, e=0.4, n=48):
    """A rounded rectangle's outline (x, y), about the origin, matching a box() of that size."""
    return [(hx * math.copysign(abs(math.cos(2 * PI * k / n)) ** e, math.cos(2 * PI * k / n)),
             hy * math.copysign(abs(math.sin(2 * PI * k / n)) ** e, math.sin(2 * PI * k / n))) for k in range(n + 1)]


def puck(name, r, d, at, e=0.5, seg=(28, 14)):
    """A round disc facing front (-Y): radius r, half-thickness d."""
    return kit.superellipsoid(name, (r, r, d), e, 1.0, seg=seg, location=at, rotation=(PI / 2, 0, 0))


def box(name, half, at, e=0.28, seg=(24, 12), rotation=(0, 0, 0)):
    return kit.superellipsoid(name, half, e, e, seg=seg, location=at, rotation=rotation)


# ---------- 1. Fern ----------


def fern(m, add):
    """A robot fern in a bolted pot: six fronds, each a chain of four bones (a-d) that
    sways, arching out in pinnae like little paddles; each ends in a small flat coil, a
    fiddlehead, with a light (Dot0-Dot2) at its heart. The pot has a status light (Dot3)
    and three stubby feet."""
    top = 0.24
    # The pot: tapered, banded, ribbed, sitting in a drainage dish on three feet.
    profile = [(0.0, top), (0.165, top - 0.002), (0.17, top - 0.02), (0.152, 0.09), (0.13, 0.055), (0.1, 0.044),
               (0.0, 0.044)]
    add(kit.lathe('Pot', profile, seg=32), m['role']('Pot'))
    add(kit.torus('PotRim', 0.172, 0.014, seg=(32, 8), location=(0, 0, top - 0.008)), m['role']('Pot'))
    add(kit.torus('PotLip', 0.164, 0.006, seg=(32, 6), location=(0, 0, top - 0.026)), m['joint'])
    add(kit.torus('PotBand', 0.156, 0.007, seg=(32, 6), location=(0, 0, 0.12)), m['joint'])
    add(kit.torus('PotBand2', 0.138, 0.006, seg=(32, 6), location=(0, 0, 0.07)), m['joint'])
    add(kit.lathe('Soil', [(0, top - 0.012), (0.15, top - 0.022), (0.15, top - 0.03), (0, top - 0.03)], seg=24),
        m['joint'])
    for k in range(10):  # ribs down the pot, tapering with it
        a = 2 * PI * k / 10 + 0.15
        c, s_ = math.sin(a), -math.cos(a)
        add(kit.tube('Rib', [(0.164 * c, 0.164 * s_, top - 0.035), (0.135 * c, 0.135 * s_, 0.075)], 0.0045, ring=4)[0],
            m['joint'])
    for a in (-1.15, -0.75, -0.38, 0.38, 0.75, 1.15):
        bolt(add, m, (0.171 * math.sin(a), -0.171 * math.cos(a), top - 0.008), 0.007, 'front')
    # The dish: a shallow tray with a rolled lip and three small feet.
    add(kit.lathe('Dish', [(0, 0.03), (0.205, 0.03), (0.215, 0.038), (0.215, 0.052), (0.198, 0.05), (0.192, 0.042),
                           (0, 0.042)], seg=32), m['role']('Pot', 'joint'))
    add(kit.torus('DishLip', 0.212, 0.007, seg=(32, 6), location=(0, 0, 0.052)), m['joint'])
    for a in (0.0, 2.1, 4.2):
        add(ball('Foot', 0.026, (0.15 * math.cos(a + 1.57), 0.15 * math.sin(a + 1.57), 0.026), seg=(10, 6)),
            m['role']('Pot'))
    add(box('Plate', (0.05, 0.006, 0.03), (0, -0.16, 0.16), 0.35, seg=(14, 6)), m['joint'])
    add(kit.superellipsoid('Status', (0.014, 0.006, 0.014), 0.8, 0.9, seg=(12, 8), location=(0, -0.167, 0.16)),
        m['dot'](3))
    bolts(add, m, [(sx * 0.037, -0.163, 0.16 + sz * 0.02) for sx in (-1, 1) for sz in (-1, 1)], 0.005)

    bones = []
    fronds = [(0, 0.5, 0.35, 0.2), (58, 0.4, 0.55, 0.17), (118, 0.54, 0.3, 0.22), (180, 0.42, 0.5, 0.17),
              (238, 0.5, 0.35, 0.2), (300, 0.38, 0.6, 0.17)]
    for k, (deg, length, tilt0, bend) in enumerate(fronds):
        az = math.radians(deg)
        ox, oy = math.cos(az), math.sin(az)
        seg = length / 4
        r, z, ang = 0.035, top - 0.02, tilt0
        nodes = [(r, z)]
        for i in range(4):
            r += seg * math.sin(ang)
            z += seg * math.cos(ang)
            nodes.append((r, z))
            ang += bend
        p3 = [(ox * r_, oy * r_, z_) for r_, z_ in nodes]
        path = kit.spline(p3, 24)
        radii = [0.014 - 0.007 * i / 23 for i in range(24)]
        stem, ts = kit.tube(f'Stem{k}', path, radii, ring=8)
        names = [f'f{k}{c}' for c in 'abcd']
        add(stem, m['role']('Frond', 'joint'), kit.chain(ts, names))
        for c in range(1, 4):  # a ball joint between the bones
            add(ball(f'Joint{k}.{c}', 0.0135 - 0.0015 * c, p3[c], seg=(8, 6)), m['joint'], names[c - 1])
        # Pinnae: pairs of leaflet plates up the stem, smaller toward the tip, each with a midrib.
        for i, seg_t in enumerate((0.14, 0.27, 0.4, 0.53, 0.66, 0.79, 0.9)):
            u = seg_t * 4
            j = min(int(u), 3)
            f = u - j
            pa, pb = p3[j], p3[j + 1]
            p = tuple(pa[c] + (pb[c] - pa[c]) * f for c in range(3))
            size = 0.085 * (1 - 0.55 * seg_t)
            for side in (-1, 1):
                lx, ly, lz = p[0] - oy * side * size, p[1] + ox * side * size, p[2] + 0.004
                rot = (0, -side * 0.38, az + PI / 2)
                add(kit.superellipsoid(f'Pinna{k}.{i}{side}', (size, 0.018, 0.007), 0.7, 0.8, seg=(8, 4),
                                       location=(lx, ly, lz), rotation=rot), m['role']('Leaf'), names[j])
                if i % 2 == 0:
                    add(kit.tube(f'Vein{k}.{i}{side}', [p, (p[0] - oy * side * size * 1.7, p[1] + ox * side * size * 1.7,
                                                            p[2] + 0.004 + side * 0)], 0.0028, ring=4)[0],
                        m['joint'], names[j])
        # The fiddlehead: a flat coil in the frond's plane, turning inward, lit at its heart.
        tip = p3[-1]
        a4 = ang - bend  # heading at the tip
        coil = []
        cr = 0.05
        heading = a4
        px, pz = tip[0] * ox + tip[1] * oy, tip[2]
        for s in range(15):
            radius = cr * (1 - s / 17)
            dh = 0.16 / max(radius / 0.05, 0.4)
            heading -= dh
            px += 0.02 * math.sin(heading) * (radius / cr + 0.25)
            pz += 0.02 * math.cos(heading) * (radius / cr + 0.25)
            coil.append((ox * px, oy * px, pz))
        end = coil[-1]
        c_path = [tip] + coil
        tube_c, _ = kit.tube(f'Coil{k}', c_path, [0.008 - 0.004 * i / len(c_path) for i in range(len(c_path))], ring=6)
        add(tube_c, m['role']('Frond', 'joint'), names[3])
        add(ball(f'Bud{k}', 0.02, end, seg=(12, 8)), m['dot'](k % 3), names[3])
        for c, name in enumerate(names):
            bones.append((name, p3[c], p3[c + 1], 'root' if c == 0 else names[c - 1]))
    return bones


# ---------- 2. Sunflower lamp ----------


def sunflower(m, add):
    """A tall sunflower on a bolted base: a jointed stem in three bones, two big paddle
    leaves, and a head that turns to look. Its middle is a light (Dot0) in a ring of seed
    studs, its twelve petals each their own bone with a lit tip (Dot1) so they open and
    close, and a shell of green behind."""
    # Base: a round weighted plate on a stub, three feet, a status light.
    add(kit.lathe('Base', [(0, 0.06), (0.14, 0.055), (0.17, 0.03), (0.17, 0.012), (0.15, 0.0), (0, 0.0)], seg=40),
        m['role']('Base'))
    add(kit.torus('BaseRing', 0.158, 0.007, seg=(40, 8), location=(0, 0, 0.045)), m['joint'])
    bolts(add, m, [(0.17 * math.sin(a), -0.17 * math.cos(a), 0.03) for a in (-0.9, -0.45, 0.45, 0.9)], 0.008)
    add(kit.superellipsoid('Status', (0.02, 0.006, 0.01), 0.8, 0.9, seg=(12, 8), location=(0, -0.168, 0.028)),
        m['dot'](2))
    add(kit.torus('BaseSkirt', 0.168, 0.008, seg=(40, 6), location=(0, 0, 0.016)), m['joint'])
    add(kit.lathe('Boss', [(0.03, 0.14), (0.058, 0.09), (0.07, 0.06), (0, 0.06)], seg=20), m['role']('Base'))
    add(kit.torus('BossRing', 0.052, 0.006, seg=(20, 6), location=(0, 0, 0.098)), m['joint'])
    for a in (0.0, 2.1, 4.2):
        add(ball('Foot', 0.026, (0.13 * math.cos(a + 1.57), 0.13 * math.sin(a + 1.57), 0.02), seg=(10, 6)),
            m['role']('Base'))
    joints = [(0, 0, 0.06), (0, 0.0, 0.5), (0, 0.03, 0.98), (0, 0.0, 1.32)]
    path = kit.spline([(0, 0, 0.05), (0, 0.01, 0.3), (0, 0.02, 0.6), (0, 0.03, 0.98), (0, 0.0, 1.3)], 40)
    stem, ts = kit.tube('Stem', path, [0.036 - 0.012 * i / 39 for i in range(40)], ring=10)
    add(stem, m['role']('Stem', 'joint'), kit.chain(ts, ['s0', 's1', 's2']))
    for z, b in ((0.5, 's1'), (0.98, 's2')):
        add(kit.torus('Collar', 0.04, 0.01, seg=(20, 8), location=(0, 0.01 + 0.02 * (z > 0.9), z)), m['joint'], b)
        add(kit.torus('Collar2', 0.037, 0.006, seg=(20, 6), location=(0, 0.01 + 0.02 * (z > 0.9), z + 0.028)),
            m['role']('Stem', 'joint'), b)
        add(ball('KnuckleL', 0.02, (0.04, 0.01 + 0.02 * (z > 0.9), z), seg=(10, 6)), m['joint'], b)
        add(ball('KnuckleR', 0.02, (-0.04, 0.01 + 0.02 * (z > 0.9), z), seg=(10, 6)), m['joint'], b)
    for z in (0.22, 0.75, 1.15):  # leaf joints: little ringed nodes up the stem
        y = 0.02 * min(z / 0.6, 1) if z < 0.98 else 0.03 - 0.03 * (z - 0.98) / 0.34
        add(kit.torus('Node', 0.033, 0.007, seg=(16, 6), location=(0, y, z)), m['role']('Stem', 'joint'),
            's0' if z < 0.5 else ('s1' if z < 0.98 else 's2'))
    # Leaves on stalks.
    for sx, bone, z in ((1, 'leafL', 0.34), (-1, 'leafR', 0.62)):
        stalk, _ = kit.tube('Stalk', [(sx * 0.01, 0.005, z), (sx * 0.08, 0.0, z + 0.05), (sx * 0.14, -0.01, z + 0.04)],
                            0.008, ring=8)
        add(stalk, m['joint'], bone)
        add(kit.superellipsoid('Leaf', (0.17, 0.075, 0.016), 0.6, 0.8, seg=(20, 10),
                               location=(sx * 0.3, -0.015, z + 0.035), rotation=(0, -sx * 0.15, -sx * 0.25)),
            m['role']('Leaf'), bone)
        add(kit.tube('Vein', [(sx * 0.15, -0.015, z + 0.048), (sx * 0.36, -0.03, z + 0.03)], 0.004, ring=6)[0],
            m['joint'], bone)
        for f in (0.35, 0.6, 0.82):
            x0 = sx * (0.15 + 0.21 * f)
            for sz in (-1, 1):
                add(kit.tube('SideVein', [(x0, -0.015, z + 0.05 - 0.016 * f),
                                          (x0 + sx * 0.045, -0.015 + sz * 0.055, z + 0.05 - 0.016 * f)],
                             0.0028, ring=4)[0], m['joint'], bone)
    # The head, facing -Y: a green back shell, a lit centre in a ring of studs, petals.
    hz = 1.32
    hy = 0.0
    add(puck('Shell', 0.17, 0.05, (0, hy + 0.03, hz), 0.9), m['role']('Sepal', 'joint'), 'head')
    add(puck('Face', 0.125, 0.035, (0, hy - 0.012, hz), 0.5), m['role']('Disc', 'bezel'), 'head')
    add(puck('Light', 0.085, 0.014, (0, hy - 0.04, hz), 0.4), m['dot'](0), 'head')
    for k in range(12):
        a = 2 * PI * k / 12
        add(ball('Stud', 0.009, (0.108 * math.cos(a), hy - 0.04, hz + 0.108 * math.sin(a)), seg=(8, 6)), m['joint'],
            'head')
    for ringr, n, ph in ((0.03, 6, 0.0), (0.06, 12, 0.26)):  # the seed grid: rows of little dots on the light
        for k in range(n):
            a = 2 * PI * k / n + ph
            add(ball('Seed', 0.0075, (ringr * math.cos(a), hy - 0.053, hz + ringr * math.sin(a)), seg=(6, 4)),
                m['joint'], 'head')
    add(ball('Seed0', 0.009, (0, hy - 0.055, hz), seg=(6, 4)), m['joint'], 'head')
    add(kit.torus('FaceRing', 0.097, 0.005, seg=(32, 6), location=(0, hy - 0.046, hz), rotation=(PI / 2, 0, 0)),
        m['role']('Disc', 'bezel'), 'head')
    bones = [('s0', (0, 0, 0.05), (0, 0.01, 0.5), 'root'), ('s1', (0, 0.01, 0.5), (0, 0.03, 0.98), 's0'),
             ('s2', (0, 0.03, 0.98), (0, 0.0, hz), 's1'),
             ('leafL', (0.01, 0.005, 0.34), (0.16, -0.01, 0.38), 's0'),
             ('leafR', (-0.01, 0.005, 0.62), (-0.16, -0.01, 0.66), 's1'),
             ('head', (0, hy, hz), (0, hy - 0.05, hz), 's2')]
    for k in range(12):
        a = 2 * PI * k / 12
        c, s = math.cos(a), math.sin(a)
        add(kit.superellipsoid('Petal', (0.085, 0.008, 0.04), 0.8, 0.75, seg=(14, 8),
                               location=(0.205 * c, hy - 0.01, hz + 0.205 * s), rotation=(0, -a, 0)),
            m['role']('Petal'), f'petal{k}')
        add(ball('Tip', 0.011, (0.285 * c, hy - 0.02, hz + 0.285 * s), seg=(8, 6)), m['dot'](1), f'petal{k}')
        add(kit.tube('Rib', [(0.145 * c, hy - 0.02, hz + 0.145 * s), (0.262 * c, hy - 0.022, hz + 0.262 * s)], 0.0032,
                     ring=4)[0], m['joint'], f'petal{k}')
        for sg in (-1, 1):
            r0, r1 = 0.19, 0.24
            add(kit.tube('RibB', [(r0 * c, hy - 0.02, hz + r0 * s),
                                  (r1 * c - sg * 0.02 * s, hy - 0.022, hz + r1 * s + sg * 0.02 * c)], 0.0022, ring=4)[0],
                m['joint'], f'petal{k}')
        bones.append((f'petal{k}', (0.13 * c, hy, hz + 0.13 * s), (0.29 * c, hy, hz + 0.29 * s), 'head'))
    return bones


# ---------- 3. Floor lamp ----------


def lamp(m, add):
    """A floor lamp that wears its shade like a hat over a round face: a weighted base, a
    sleeved pole with a mast that slides up out of it, a bent neck, then a round dome shade
    over a dark round head with two light eyes (Dot0, each on its own bone to blink and look).
    A glowing ring (Dot1) runs round under the dome's lip, and the base has a status light
    (Dot2)."""
    add(kit.lathe('Base', [(0, 0.062), (0.15, 0.058), (0.2, 0.035), (0.205, 0.014), (0.18, 0.0), (0, 0.0)], seg=40),
        m['role']('Base'))
    add(kit.torus('BaseRing', 0.19, 0.008, seg=(40, 8), location=(0, 0, 0.05)), m['joint'])
    bolts(add, m, [(0.19 * math.sin(a), -0.19 * math.cos(a), 0.033) for a in (-0.7, 0.7)], 0.009)
    add(kit.superellipsoid('Status', (0.016, 0.006, 0.01), 0.8, 0.9, seg=(12, 8), location=(0, -0.2, 0.03)), m['dot'](2))
    # A weighted base: a heavy foot ring, a stepped boss, a cable clip.
    add(kit.torus('BaseFoot', 0.196, 0.011, seg=(40, 6), location=(0, 0, 0.012)), m['role']('Base', 'joint'))
    add(kit.lathe('Boss', [(0.05, 0.14), (0.075, 0.09), (0.1, 0.07), (0, 0.07)], seg=24), m['role']('Base'))
    add(kit.torus('BossRing', 0.078, 0.006, seg=(24, 6), location=(0, 0, 0.092)), m['joint'])
    bolts(add, m, [(0.19 * math.sin(a), 0.19 * math.cos(a), 0.05) for a in (-2.2, -0.9, 0.9, 2.2)], 0.008, 'top')
    add(kit.tube('Cable', [(0.02, 0.045, 0.06), (0.05, 0.12, 0.03), (0.12, 0.2, 0.025)], 0.006, ring=5)[0], m['joint'])
    # Pole and its sleeve.
    add(kit.tube('Pole', [(0, 0, 0.05), (0, 0, 0.74)], 0.03, ring=12)[0], m['joint'], 'pole')
    add(kit.tube('Sleeve', [(0, 0, 0.05), (0, 0, 0.7)], 0.045, ring=12)[0], m['role']('Pole', 'shell'), 'pole')
    for z in (0.12, 0.7):
        add(kit.torus('Collar', 0.046, 0.011, seg=(24, 8), location=(0, 0, z)), m['joint'], 'pole')
    add(kit.tube('Mast', [(0, 0, 0.5), (0, 0, 1.06)], 0.022, ring=10)[0], m['joint'], 'mast')
    add(kit.torus('MastRing', 0.03, 0.008, seg=(20, 8), location=(0, 0, 0.99)), m['role']('Pole', 'shell'), 'mast')
    add(ball('Knee', 0.04, (0, 0, 1.06), seg=(16, 10)), m['role']('Pole', 'shell'), 'mast')
    add(kit.torus('KneeRing', 0.036, 0.007, seg=(20, 6), location=(0, 0, 1.06), rotation=(0, PI / 2, 0)),
        m['joint'], 'mast')
    for z in (0.3, 0.55):
        add(kit.torus('SleeveBand', 0.047, 0.005, seg=(24, 6), location=(0, 0, z)), m['joint'], 'pole')
    # The neck arches up and forward to the dome's top.
    neck = kit.spline([(0, 0, 1.06), (0, 0.0, 1.2), (0, -0.04, 1.31), (0, -0.11, 1.34)], 20)
    add(kit.tube('Neck', neck, 0.02, ring=10)[0], m['joint'], 'neck')
    for t, r in ((0.0, 0.03), (0.4, 0.026), (0.8, 0.026)):  # a jointed neck: ball joints with collars
        q = neck[int(t * (len(neck) - 1))]
        add(ball('NeckJoint', r, q, seg=(12, 8)), m['role']('Pole', 'shell'), 'neck')
        add(kit.torus('NeckCollar', r * 0.85, 0.005, seg=(16, 6), location=(q[0], q[1], q[2] + r * 0.9)),
            m['joint'], 'neck')
    # The shade: a round dome with a rim, a lit ring under it, over a dark round head.
    cy, cz = -0.13, 1.2
    dome = kit.superellipsoid('Dome', (0.2, 0.2, 0.17), 0.9, 0.9, seg=(36, 18), location=(0, cy, cz))
    kit.cut(dome, (0, 0, 1), 0.0)
    add(dome, m['role']('Shade'), 'shade')
    add(kit.torus('Rim', 0.196, 0.011, seg=(40, 8), location=(0, cy, cz)), m['role']('Trim', 'joint'), 'shade')
    add(kit.torus('Glow', 0.17, 0.008, seg=(40, 8), location=(0, cy, cz - 0.012)), m['dot'](1), 'shade')
    add(kit.torus('Roll', 0.2, 0.007, seg=(40, 8), location=(0, cy, cz + 0.01)), m['role']('Trim', 'joint'), 'shade')
    for k in range(8):  # panel seams up the dome
        a = 2 * PI * k / 8 + PI / 8
        pts = [(0.03 * math.cos(a), cy + 0.03 * math.sin(a), cz + 0.168)]
        for t in (0.35, 0.7, 1.0):
            el = t * PI / 2 * 0.98
            pts.append((0.2 * math.sin(el) * math.cos(a), cy + 0.2 * math.sin(el) * math.sin(a), cz + 0.17 * math.cos(el)))
        pts = [(x * 1.0, y, z_) for x, y, z_ in pts]
        add(kit.tube('Seam', pts, 0.0035, ring=4)[0], m['joint'], 'shade')
    # The switch chain: little beads and a pull knob hanging off the lip, at its left.
    bx, by = 0.15, cy - 0.12
    for i in range(7):
        add(ball('Bead', 0.007, (bx, by, cz - 0.02 - i * 0.02), seg=(6, 4)), m['joint'], 'shade')
    add(kit.superellipsoid('Pull', (0.012, 0.012, 0.022), 0.8, 0.9, seg=(8, 6), location=(bx, by, cz - 0.185)),
        m['role']('Trim', 'joint'), 'shade')
    add(kit.superellipsoid('Cap', (0.03, 0.03, 0.012), 0.5, 1.0, seg=(16, 8), location=(0, cy, cz + 0.166)),
        m['joint'], 'shade')
    add(kit.superellipsoid('Head', (0.125, 0.115, 0.1), 0.8, 0.8, seg=(28, 16), location=(0, cy, cz - 0.075)),
        m['bezel'], 'shade')
    bolts(add, m, [(0.15 * math.sin(a), cy - 0.15 * math.cos(a), cz + 0.003) for a in (-1.2, -0.6, 0, 0.6, 1.2)],
          0.007, 'top')
    eyes(add, m, (0, cy - 0.113, cz - 0.075), 0.05, 0.02, 0.03, dot=0)
    return [('pole', (0, 0, 0.05), (0, 0, 0.7), 'root'), ('mast', (0, 0, 0.7), (0, 0, 1.06), 'pole'),
            ('neck', (0, 0, 1.06), (0, -0.11, 1.34), 'mast'), ('shade', (0, cy, cz), (0, cy, cz + 0.15), 'neck'),
            *eye_bones((0, cy - 0.113, cz - 0.075), 0.05, 0.03, 'shade')]


# ---------- 4. Armchair ----------


def armchair(m, add):
    """A plump armchair on four stubby legs (a bone each, to step): a padded seat that
    breathes, a tufted backrest that leans on its own bone, two arms that stretch out, piped
    and bolted, with two slot eyes (Dot0) on the top of the backrest and a light strip on each
    arm's front (Dot1)."""
    w, d = 0.3, 0.27
    # Frame under the seat, in the joint tone, and the legs.
    add(box('Frame', (w - 0.01, d - 0.01, 0.06), (0, 0, 0.19), 0.3), m['joint'])
    legs = []
    for sx, sy, name in ((1, -1, 'legFL'), (-1, -1, 'legFR'), (1, 1, 'legBL'), (-1, 1, 'legBR')):
        x, y = sx * (w - 0.06), sy * (d - 0.06)
        add(kit.tube('Leg', [(x, y, 0.16), (x, y, 0.04)], [0.028, 0.02], ring=10)[0], m['joint'], name)
        add(kit.superellipsoid('Foot', (0.036, 0.036, 0.024), 0.5, 0.8, seg=(14, 8), location=(x, y, 0.024)),
            m['role']('Foot', 'joint'), name)
        add(kit.torus('LegCollar', 0.03, 0.007, seg=(14, 6), location=(x, y, 0.15)), m['role']('Trim', 'joint'), name)
        add(kit.torus('FootCap', 0.034, 0.007, seg=(14, 6), location=(x, y, 0.045)), m['joint'], name)
        add(ball('LegKnuckle', 0.024, (x, y, 0.13), seg=(10, 6)), m['joint'], name)
        legs.append((name, (x, y, 0.16), (x, y, 0.03), 'root'))
    # The seat cushion, piped round its edge, with a button.
    add(box('Seat', (w - 0.02, d - 0.03, 0.065), (0, -0.01, 0.3), 0.55, seg=(32, 14)), m['role']('Cushion'), 'seat')
    add(kit.tube('Piping', [(x, y - 0.01, 0.3)
                            for x, y in squircle(w - 0.02, d - 0.03, 0.55)], 0.008, ring=8)[0], m['joint'], 'seat')
    add(kit.superellipsoid('Button', (0.024, 0.024, 0.01), 0.6, 1.0, seg=(14, 8), location=(0, -0.01, 0.363)),
        m['joint'], 'seat')
    # A seam across the cushion halves it, with a second button either side; a welt round its base.
    add(kit.tube('SeatSeam', [(x, -0.01 - 0.0, 0.365 - 0.012 * abs(x) / 0.28) for x in
                              (-0.24, -0.16, -0.08, 0.0, 0.08, 0.16, 0.24)], 0.004, ring=4)[0], m['joint'], 'seat')
    for sx in (-1, 1):
        add(ball('Button', 0.014, (sx * 0.15, -0.01, 0.36), seg=(8, 6)), m['joint'], 'seat')
    add(kit.tube('Welt', [(x, y - 0.01, 0.245) for x, y in squircle(w - 0.014, d - 0.024, 0.5)], 0.006, ring=6)[0],
        m['role']('Trim', 'joint'), 'seat')
    # The backrest: a thick padded slab, tufted, with a rounded top; leans from its base.
    by = d - 0.05
    add(box('Back', (w - 0.03, 0.07, 0.29), (0, by, 0.55), 0.5, seg=(32, 16)), m['role']('Cushion'), 'back')
    add(kit.tube('BackPiping', [(x, by - 0.068, 0.55 + z) for x, z in squircle(w - 0.03, 0.29, 0.5)], 0.007, ring=8)[0],
        m['joint'], 'back')
    for row, z in enumerate((0.44, 0.58)):
        for col in range(4):
            x = (col - 1.5) * 0.11 + (0.0 if row == 0 else 0.0)
            add(ball('Button', 0.011, (x, by - 0.072, z), seg=(10, 6)), m['joint'], 'back')
    add(kit.tube('BackSeam', [(x, by - 0.07, 0.5) for x in (-0.2, -0.1, 0.0, 0.1, 0.2)], 0.004, ring=4)[0],
        m['joint'], 'back')
    add(box('Crest', (w - 0.06, 0.05, 0.028), (0, by - 0.005, 0.845), 0.5, seg=(24, 10)), m['role']('Trim', 'joint'), 'back')
    bolts(add, m, [(sx * (w - 0.05), by - 0.07, 0.32) for sx in (-1, 1)], 0.008)
    eyes(add, m, (0, by - 0.074, 0.72), 0.07, 0.022, 0.012, dot=0)
    # The arms: padded rolls, with a cap and a light strip on the front.
    for sx, name in ((1, 'armL'), (-1, 'armR')):
        x = sx * (w + 0.005)
        add(box('Arm', (0.05, d - 0.02, 0.1), (x, 0, 0.36), 0.5, seg=(20, 12)), m['role']('Cushion'), name)
        add(kit.superellipsoid('ArmCap', (0.056, d - 0.005, 0.03), 0.4, 0.5, seg=(20, 10), location=(x, 0, 0.455)),
            m['role']('Trim', 'joint'), name)
        add(kit.superellipsoid('Strip', (0.012, 0.006, 0.05), 0.7, 0.8, seg=(10, 8), location=(x, -d - 0.005, 0.37)),
            m['dot'](1), name)
        bolts(add, m, [(x + sx * 0.0, -d - 0.004, 0.31), (x, -d - 0.004, 0.43)], 0.007, 'front', name)
        add(kit.tube('ArmSeam', [(x, y_, 0.4635) for y_ in (-0.2, -0.1, 0.0, 0.1, 0.2)], 0.004, ring=4)[0],
            m['joint'], name)
        add(kit.tube('ArmPiping', [(x + sx * 0.046, y_, 0.36) for y_ in (-0.16, 0.0, 0.16)], 0.006, ring=5)[0],
            m['joint'], name)
        add(ball('ArmButton', 0.011, (x + sx * 0.05, -0.02, 0.4), seg=(8, 6)), m['joint'], name)
    return [('seat', (0, 0, 0.25), (0, 0, 0.36), 'root'), ('back', (0, by, 0.3), (0, by, 0.82), 'root'),
            ('armL', (w + 0.005, 0, 0.26), (w + 0.005, 0, 0.46), 'root'),
            ('armR', (-w - 0.005, 0, 0.26), (-w - 0.005, 0, 0.46), 'root'), *legs,
            *eye_bones((0, by - 0.074, 0.72), 0.07, 0.03, 'back')]


# ---------- 5. Bookshelf ----------

SHELVES = (0.11, 0.5, 0.89)
BOOKS = (  # per shelf: (width, height) of each book
    ((0.05, 0.27), (0.04, 0.33), (0.06, 0.21), (0.045, 0.3), (0.05, 0.24)),
    ((0.045, 0.32), (0.06, 0.22), (0.04, 0.3), (0.055, 0.26), (0.045, 0.34)),
    ((0.055, 0.23), (0.04, 0.33), (0.05, 0.27), (0.06, 0.2), (0.045, 0.31)),
)


def bookshelf(m, add):
    """A tall bookshelf on four little feet with three shelves of books (each on its own
    bone: they lean, slide out and pop), a bookend at each end of the top and bottom
    shelves, a crown board with two light eyes (Dot0) and a beacon on top (Dot1). Some
    spines carry a small reading light (Dot2)."""
    w, d, h = 0.4, 0.15, 1.3
    add(box('SideL', (0.02, d, h / 2 - 0.03), (w - 0.02, 0, h / 2 + 0.03), 0.3), m['role']('Wood'))
    add(box('SideR', (0.02, d, h / 2 - 0.03), (-w + 0.02, 0, h / 2 + 0.03), 0.3), m['role']('Wood'))
    add(box('Back', (w - 0.03, 0.008, h / 2 - 0.05), (0, d - 0.01, h / 2 + 0.03), 0.3), m['joint'])
    add(box('Plinth', (w, d, 0.03), (0, 0, 0.06), 0.3), m['role']('Wood'))
    for sx in (-1, 1):
        for sy in (-1, 1):
            add(ball('Foot', 0.03, (sx * (w - 0.06), sy * (d - 0.05), 0.03), seg=(12, 8)), m['role']('Wood'))
    for z in SHELVES:
        add(box('Shelf', (w - 0.03, d - 0.005, 0.011), (0, 0, z - 0.011), 0.3), m['role']('Wood'))
        for sx in (-1, 1):  # brackets: an L under each shelf end, bolted to the side
            bx = sx * (w - 0.06)
            add(box('BracketH', (0.02, d - 0.04, 0.005), (bx, 0, z - 0.03), 0.4, seg=(8, 4)), m['joint'])
            add(kit.tube('BracketBrace', [(bx + sx * 0.02, 0.0, z - 0.03), (bx - sx * 0.02, 0.0, z - 0.075)], 0.006, ring=4)[0],
                m['joint'])
            bolt(add, m, (bx, -d + 0.01, z - 0.03), 0.006, 'front')
        add(box('Lip', (w - 0.03, 0.008, 0.02), (0, -d + 0.005, z - 0.004), 0.4), m['joint'])
    # The crown: a deep board with the eyes in it, and a beacon above.
    add(box('Crown', (w + 0.015, d + 0.012, 0.07), (0, 0, 1.28), 0.3), m['role']('Wood'))
    add(box('CrownTop', (w - 0.03, d - 0.02, 0.012), (0, 0, 1.355), 0.4), m['joint'])
    add(box('Visor', (0.17, 0.006, 0.042), (0, -d - 0.008, 1.28), 0.45, seg=(24, 10)), m['bezel'])
    eyes(add, m, (0, -d - 0.012, 1.28), 0.08, 0.026, 0.024, dot=0)
    add(kit.tube('Stalk', [(0.28, 0.0, 1.36), (0.28, 0.0, 1.42)], 0.006, ring=6)[0], m['joint'])
    add(ball('Beacon', 0.021, (0.28, 0.0, 1.44), seg=(14, 8)), m['dot'](1))
    bolts(add, m, [(sx * (w - 0.02), -d - 0.008, 1.28 + dz) for sx in (-1, 1) for dz in (-0.038, 0.038)], 0.008)
    bones = []
    reading = {(0, 1), (1, 3), (2, 0), (2, 3)}
    for s, z in enumerate(SHELVES):
        x = -w + 0.06
        if s in (0, 2):  # a bookend at the left end, as a small stout robot post
            x += 0.045
        for b, (bw, bh) in enumerate(BOOKS[s]):
            name = f'book{s}{b}'
            cx = x + bw
            add(box('Book', (bw, d - 0.03, bh / 2), (cx, 0.0, z + bh / 2), 0.22, seg=(10, 6)),
                m['role'](f'Book{(s * 5 + b) % 4}'), name)
            for zz in (0.3, 0.75):
                add(box('Band', (bw + 0.004, 0.007, 0.012), (cx, -d + 0.028, z + bh * zz), 0.4, seg=(10, 6)),
                    m['role']('Band', 'bezel'), name)
            # A title as a plain bar, short or long, and a little tab at the foot of the spine.
            tl = bh * (0.09 + 0.04 * ((s + b) % 3))
            add(box('Title', (bw * 0.5, 0.004, tl), (cx, -d + 0.03, z + bh * 0.52), 0.4, seg=(6, 4)),
                m['dot'](2) if (s, b) in reading else m['role']('Title', 'bezel'), name)
            add(box('Tab', (bw * 0.4, 0.004, 0.007), (cx, -d + 0.03, z + 0.03), 0.4, seg=(6, 4)), m['joint'], name)
            if (s, b) in reading:
                add(ball('Lamp', 0.007, (cx, -d + 0.02, z + bh - 0.008), seg=(8, 6)), m['dot'](2), name)
            bones.append((name, (cx, 0, z), (cx, 0, z + bh), 'root'))
            x = cx + bw + 0.008
        if s in (0, 2):
            for sx, name in ((0, f'end{s}L'), (1, f'end{s}R')):
                ex = (-w + 0.062) if sx == 0 else (w - 0.062)
                add(box('Bookend', (0.02, d - 0.04, 0.09), (ex, 0.0, z + 0.09), 0.3), m['role']('Trim', 'joint'), name)
                add(box('BookendBase', (0.05, d - 0.04, 0.008), (ex + (0.03 if sx == 0 else -0.03), 0, z + 0.004), 0.4),
                    m['joint'], name)
                add(ball('BookendKnob', 0.014, (ex, -d + 0.03, z + 0.15), seg=(10, 8)), m['role']('Trim', 'joint'), name)
                bones.append((name, (ex, 0, z), (ex, 0, z + 0.18), 'root'))
    # The library's copy of the book, at the right end of the middle shelf: dark cloth, gold
    # bands, and a call-number label that lights (Dot3) when it's offered. The site takes it
    # out (the copy bone) and it becomes the book you read.
    cz, cx, ch = SHELVES[1], w - 0.075, 0.27
    add(box('Copy', (0.028, d - 0.035, ch / 2), (cx, 0.0, cz + ch / 2), 0.2, seg=(10, 6)), m['bezel'], 'copy')
    for zz in (0.12, 0.88):
        add(box('CopyBand', (0.03, 0.006, 0.006), (cx, -d + 0.033, cz + ch * zz), 0.4, seg=(8, 4)), m['glow'], 'copy')
    add(box('CopyLabel', (0.022, 0.004, 0.022), (cx, -d + 0.034, cz + 0.05), 0.4, seg=(8, 6)), m['dot'](3), 'copy')
    bones.append(('copy', (cx, 0, cz), (cx, 0, cz + ch), 'root'))
    bones += eye_bones((0, -d - 0.012, 1.28), 0.08, 0.05, 'root')
    bones.append(('beacon', (0.28, 0, 1.36), (0.28, 0, 1.47), 'root'))
    return bones


# ---------- 6. Rug ----------

RUG_R = 0.62
RUG_N = 13  # nodes each way: they hold still, and tell the site where the rug is


def rug_node(i, j):
    step = 2 * RUG_R / (RUG_N - 1)
    return (-RUG_R + i * step, -RUG_R + j * step)


def rug_weights(obj):
    """Bilinear weights of a part's vertices on the grid of bones (four each), by where each
    vertex is on the rug: a part keeps its placement on the object, so that goes in first."""
    step = 2 * RUG_R / (RUG_N - 1)
    weights = {f'g{i}_{j}': [0.0] * len(obj.data.vertices) for i in range(RUG_N) for j in range(RUG_N)}
    placed = obj.matrix_basis
    for n, v in enumerate(obj.data.vertices):
        co = placed @ v.co
        gx = min(max((co.x + RUG_R) / step, 0.0), RUG_N - 1 - 1e-6)
        gy = min(max((co.y + RUG_R) / step, 0.0), RUG_N - 1 - 1e-6)
        i, j = int(gx), int(gy)
        fx, fy = gx - i, gy - j
        for di, dj, wt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
            weights[f'g{i + di}_{j + dj}'][n] = wt
    return weights


def disc(name, r0, r1, z, rings=3, seg=64, z1=None):
    """A flat ring (annulus) from r0 to r1 at height z, in `rings` steps (so it bends with the grid)."""
    z1 = z if z1 is None else z1
    profile = [(r0 + (r1 - r0) * k / rings, z + (z1 - z) * k / rings) for k in range(rings + 1)]
    if r0 == 0:
        profile[0] = (0, z)
    return kit.lathe(name, profile, seg=seg)


def rug(m, add):
    """A round rug, flat and floppy: one skinned disc on a 13 by 13 grid of bones (g0_0
    to g12_12). The bones stay still: the site moves the surface itself, vertex by vertex, as
    a sheet of water or paper (set-kinds.ts), and reads from them where the rug is. It is
    finely cut for that, rings every 2 cm and 160 round; woven in rings, with a
    row of square circuit nodes round it, a fringe of tassels, and small lights (Dot0)
    sewn round the ring and a medallion (Dot1) in the middle."""
    z = 0.014
    # Rings every 2 cm and 160 round, so a ripple a few cm across is a smooth curve.
    top = [(0.02 * k, z) for k in range(29)] + [(0.58, z)]
    body = kit.lathe('Rug', top + [(RUG_R - 0.01, z - 0.004), (RUG_R, 0.006), (RUG_R - 0.005, 0.0), (0, 0.0)], seg=160)
    add(body, m['role']('Rug'), rug_weights(body))
    for name, r0, r1, mat in (('Band', 0.44, 0.5, m['joint']), ('Band2', 0.53, 0.55, m['role']('Trim', 'joint')),
                              ('Band3', 0.2, 0.22, m['joint'])):
        obj = disc(name, r0, r1, z + 0.002, rings=2, seg=144)
        add(obj, mat, rug_weights(obj))
    obj = disc('Medallion', 0, 0.12, z + 0.003, rings=6, seg=48)
    add(obj, m['dot'](1), rug_weights(obj))
    # Nodes: small square studs on the band, with light dots between.
    for k in range(16):
        a = 2 * PI * k / 16
        x, y = 0.47 * math.cos(a), 0.47 * math.sin(a)
        stud = box('Node', (0.017, 0.017, 0.005), (x, y, z + 0.006), 0.3, seg=(10, 6), rotation=(0, 0, a))
        add(stud, m['role']('Trim', 'joint'), rug_weights(stud))
        x2, y2 = 0.47 * math.cos(a + PI / 16), 0.47 * math.sin(a + PI / 16)
        lamp_ = kit.superellipsoid('Light', (0.009, 0.009, 0.004), 0.5, 1.0, seg=(10, 4), location=(x2, y2, z + 0.006))
        add(lamp_, m['dot'](0), rug_weights(lamp_))
    for k in range(8):  # a spoke of the pattern from the medallion to the band
        a = 2 * PI * (k + 0.5) / 8
        spoke = kit.tube('Spoke', [(0.14 * math.cos(a), 0.14 * math.sin(a), z + 0.006),
                                   (0.2 * math.cos(a), 0.2 * math.sin(a), z + 0.006)], 0.005, ring=6)[0]
        add(spoke, m['joint'], rug_weights(spoke))
    for k in range(48):  # a woven rim: short radial bars between the outer bands, like a basket weave
        a = 2 * PI * (k + 0.5) / 48
        r_ = 0.585 if k % 2 else 0.575
        bar = box('Weave', (0.017, 0.0055, 0.0032), (r_ * math.cos(a), r_ * math.sin(a), z + 0.004), 0.3, seg=(6, 4),
                  rotation=(0, 0, a))
        add(bar, m['joint'], rug_weights(bar))
    for k in range(24):  # stitches round an inner ring
        a = 2 * PI * k / 24
        st = box('Stitch', (0.012, 0.004, 0.003), (0.32 * math.cos(a), 0.32 * math.sin(a), z + 0.004), 0.3, seg=(6, 4),
                 rotation=(0, 0, a + PI / 2))
        add(st, m['joint'], rug_weights(st))
    obj = disc('Selvage', RUG_R - 0.03, RUG_R - 0.012, z + 0.003, rings=2, seg=144)
    add(obj, m['role']('Trim', 'joint'), rug_weights(obj))
    for k in range(16):  # the medallion's rays
        a = 2 * PI * k / 16
        ray = box('Ray', (0.028, 0.006, 0.004), (0.145 * math.cos(a), 0.145 * math.sin(a), z + 0.004), 0.3, seg=(6, 4),
                  rotation=(0, 0, a))
        add(ray, m['joint'], rug_weights(ray))
    for k in range(32):  # the fringe
        a = 2 * PI * (k + 0.5) / 32
        c, s = math.cos(a), math.sin(a)
        t = kit.tube('Tassel', [((RUG_R - 0.004) * c, (RUG_R - 0.004) * s, 0.006), ((RUG_R + 0.028) * c, (RUG_R + 0.028) * s, 0.008)],
                     [0.011, 0.008], ring=6)[0]
        add(t, m['role']('Trim', 'joint'), rug_weights(t))
    step = 2 * RUG_R / (RUG_N - 1)
    return [(f'g{i}_{j}', (*rug_node(i, j), 0.0), (rug_node(i, j)[0], rug_node(i, j)[1], 0.05), 'root')
            for i in range(RUG_N) for j in range(RUG_N)] if step else []


# ---------- 7. Stool ----------


def stool(m, add):
    """A round stool on three bent legs (two bones each), with a padded seat that spins on
    its own bone: a band round it, a button, a face pod on its front rim with two light eyes
    (Dot0, each on a bone), a ring of light (Dot1) under the seat, and rubber feet."""
    zt = 0.5
    add(kit.superellipsoid('Seat', (0.21, 0.21, 0.045), 0.5, 1.0, seg=(48, 12), location=(0, 0, zt)), m['role']('Cushion'),
        'seat')
    add(kit.torus('Band', 0.208, 0.009, seg=(48, 8), location=(0, 0, zt - 0.012)), m['joint'], 'seat')
    add(kit.torus('SeatRim', 0.205, 0.012, seg=(48, 8), location=(0, 0, zt + 0.03)), m['role']('Trim', 'joint'), 'seat')
    add(kit.torus('SeatRim2', 0.2, 0.006, seg=(48, 6), location=(0, 0, zt - 0.03)), m['role']('Trim', 'joint'), 'seat')
    for k in range(12):  # rivets round the seat rim
        a = 2 * PI * k / 12 + 0.26
        add(ball('Rivet', 0.007, (0.207 * math.cos(a), 0.207 * math.sin(a), zt + 0.012), seg=(6, 4)), m['joint'], 'seat')
    add(kit.torus('Under', 0.17, 0.007, seg=(48, 8), location=(0, 0, zt - 0.045)), m['dot'](1), 'seat')
    add(kit.superellipsoid('Button', (0.028, 0.028, 0.01), 0.6, 1.0, seg=(14, 8), location=(0, 0.02, zt + 0.042)),
        m['joint'], 'seat')
    for k in range(6):
        a = 2 * PI * k / 6 + 0.5
        pts = [(0.03 * math.cos(a), 0.02 + 0.03 * math.sin(a), zt + 0.04), (0.16 * math.cos(a), 0.16 * math.sin(a), zt + 0.032)]
        add(kit.tube('Tuft', pts, 0.004, ring=6)[0], m['joint'], 'seat')
    # The face pod: a small dark bump on the front rim carrying the eyes.
    add(box('Pod', (0.075, 0.03, 0.03), (0, -0.205, zt - 0.005), 0.5, seg=(20, 10)), m['bezel'], 'seat')
    eyes(add, m, (0, -0.232, zt - 0.005), 0.033, 0.013, 0.015, dot=0)
    bones = [('seat', (0, 0, zt - 0.04), (0, 0, zt + 0.04), 'root')]
    bones += eye_bones((0, -0.232, zt - 0.005), 0.033, 0.03, 'seat')
    for k in range(3):
        a = math.radians(-90 + 120 * k)
        c, s = math.cos(a), math.sin(a)
        hip = (0.17 * c, 0.17 * s, zt - 0.05)
        knee = (0.24 * c, 0.24 * s, 0.26)
        foot = (0.29 * c, 0.29 * s, 0.05)
        add(kit.tube('Upper', [hip, knee], [0.022, 0.018], ring=10)[0], m['role']('Leg', 'joint'), f'leg{k}a')
        add(ball('Knee', 0.03, knee, seg=(14, 8)), m['joint'], f'leg{k}a')
        add(kit.tube('Lower', [knee, foot], [0.017, 0.014], ring=10)[0], m['role']('Leg', 'joint'), f'leg{k}b')
        add(kit.superellipsoid('Foot', (0.04, 0.04, 0.026), 0.5, 0.9, seg=(14, 8), location=(foot[0], foot[1], 0.026)),
            m['role']('Foot', 'joint'), f'leg{k}b')
        add(ball('Hip', 0.026, hip, seg=(12, 8)), m['role']('Hub', 'bezel'), f'leg{k}a')
        for f_, bone in ((0.35, 'a'), (0.72, 'a'), (0.3, 'b'), (0.65, 'b')):  # rings up the legs
            a_, b_ = (hip, knee) if bone == 'a' else (knee, foot)
            q = tuple(a_[i] + (b_[i] - a_[i]) * f_ for i in range(3))
            rot = Vector((b_[0] - a_[0], b_[1] - a_[1], b_[2] - a_[2])).to_track_quat('Z', 'Y').to_euler()
            add(kit.torus('LegRing', 0.021 - 0.003 * f_, 0.0055, seg=(12, 6), location=q,
                          rotation=tuple(rot)), m['joint'], f'leg{k}{bone}')
        add(kit.torus('FootRing', 0.037, 0.008, seg=(16, 6), location=(foot[0], foot[1], 0.04)), m['joint'], f'leg{k}b')
        add(kit.torus('FootSole', 0.036, 0.007, seg=(16, 6), location=(foot[0], foot[1], 0.008)),
            m['role']('Foot', 'joint'), f'leg{k}b')
        bones += [(f'leg{k}a', hip, knee, 'root'), (f'leg{k}b', knee, foot, f'leg{k}a')]
    return bones


# ---------- 8. Radio ----------


def radio(m, add):
    """A small radio in a rounded case on four feet: a round speaker with a grille and a
    cone that pulses, a tuner window with a needle and a row of five lights (Dot0-Dot4),
    two dials that turn, a carrying handle and an antenna in two bones."""
    w, d, h = 0.26, 0.11, 0.17
    z0 = 0.045
    zc = z0 + h
    add(box('Case', (w, d, h), (0, 0, zc), 0.4, seg=(32, 14)), m['role']('Case'))
    add(box('Trim', (w + 0.004, d + 0.004, 0.012), (0, 0, z0 + 0.02), 0.4, seg=(24, 8)), m['joint'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            add(ball('Foot', 0.026, (sx * (w - 0.05), sy * (d - 0.03), 0.024), seg=(12, 8)), m['role']('Foot', 'joint'))
    fy = -d - 0.002
    # The speaker: a recessed disc, a cone on its own bone, and a grille of slots in front.
    sx0, sz = w * 0.5, zc - 0.005
    add(kit.superellipsoid('Well', (0.088, 0.02, 0.088), 0.7, 0.7, seg=(24, 12), location=(-sx0 * 0.5 - 0.02, fy + 0.008, sz)),
        m['bezel'])
    add(kit.superellipsoid('Cone', (0.066, 0.012, 0.066), 0.6, 0.6, seg=(24, 10),
                           location=(-sx0 * 0.5 - 0.02, fy - 0.006, sz)), m['role']('Cone', 'joint'), 'cone')
    add(kit.superellipsoid('Cap', (0.022, 0.014, 0.022), 0.7, 0.7, seg=(14, 8),
                           location=(-sx0 * 0.5 - 0.02, fy - 0.014, sz)), m['dot'](5), 'cone')
    add(kit.torus('WellRim', 0.092, 0.008, seg=(28, 6), location=(-sx0 * 0.5 - 0.02, fy - 0.002, sz),
                  rotation=FACING['front']), m['role']('Cone', 'joint'))
    for a in range(6):  # screws round the speaker rim
        t = 2 * PI * a / 6 + 0.5
        bolt(add, m, (-sx0 * 0.5 - 0.02 + 0.1 * math.cos(t), fy - 0.004, sz + 0.1 * math.sin(t)), 0.0055, 'front')
    for k in range(-3, 4):
        add(box('Grille', (0.085, 0.005, 0.0045), (-sx0 * 0.5 - 0.02, fy - 0.026, sz + k * 0.023), 0.5, seg=(14, 6)),
            m['joint'])
    # The tuner side: a window with a needle, the lights above it, two dials below.
    tx = w * 0.36
    add(box('Window', (0.075, 0.006, 0.026), (tx, fy - 0.004, zc + 0.03), 0.4, seg=(20, 8)), m['bezel'])
    add(box('Scale', (0.062, 0.003, 0.005), (tx, fy - 0.011, zc + 0.02), 0.4, seg=(14, 6)), m['joint'])
    add(box('Needle', (0.0035, 0.005, 0.02), (tx, fy - 0.011, zc + 0.032), 0.4, seg=(8, 6)), m['dot'](6), 'needle')
    for k in range(5):
        add(ball('Light', 0.0085, (tx - 0.064 + k * 0.032, fy - 0.006, zc + 0.086), seg=(10, 6)), m['dot'](k))
    for k in range(9):  # tick marks along the tuning scale
        add(box('Tick', (0.0018, 0.003, 0.004 + 0.003 * (k % 2 == 0)), (tx - 0.056 + k * 0.014, fy - 0.011, zc + 0.02),
                0.3, seg=(4, 4)), m['joint'])
    for sx, name in ((-0.036, 'dialA'), (0.036, 'dialB')):
        x = tx + sx
        add(kit.torus('DialSkirt', 0.036, 0.004, seg=(20, 6), location=(x, fy - 0.001, zc - 0.05), rotation=FACING['front']),
            m['joint'])
        for k in range(12):  # knurls: little ridges round the dial's edge
            t = 2 * PI * k / 12
            add(box('Knurl', (0.0035, 0.009, 0.0035), (x + 0.031 * math.cos(t), fy - 0.011, zc - 0.05 + 0.031 * math.sin(t)),
                    0.3, seg=(4, 4), rotation=(0, -t, 0)), m['role']('Dial', 'joint'), name)
        add(kit.lathe('Dial', [(0, 0.022), (0.03, 0.02), (0.033, 0.008), (0.03, 0.0), (0, 0.0)], seg=24,
                      location=(x, fy, zc - 0.05), rotation=FACING['front']), m['role']('Dial', 'joint'), name)
        add(box('Pointer', (0.004, 0.004, 0.015), (x, fy - 0.022, zc - 0.05 + 0.014), 0.4, seg=(8, 6)), m['glow'], name)
    add(kit.tube('Handle', [(-w * 0.62, 0, zc + h * 0.9), (-w * 0.55, 0, zc + h + 0.05), (w * 0.55, 0, zc + h + 0.05),
                             (w * 0.62, 0, zc + h * 0.9)], 0.009, ring=8)[0], m['joint'])
    bolts(add, m, [(sx * (w - 0.02), fy, zc + dz) for sx in (-1, 1) for dz in (-0.1, 0.1)], 0.007)
    # The antenna: two bones, a ball on the end.
    ax, ay = w * 0.8, d * 0.5
    a0, a1, a2 = (ax, ay, zc + h - 0.02), (ax + 0.03, ay, zc + h + 0.2), (ax + 0.06, ay, zc + h + 0.38)
    add(ball('Socket', 0.02, a0, seg=(12, 8)), m['joint'])
    add(kit.torus('SocketRing', 0.026, 0.006, seg=(16, 6), location=(a0[0], a0[1], a0[2] + 0.012)), m['role']('Foot', 'joint'))
    add(kit.torus('SegRing', 0.014, 0.004, seg=(12, 6), location=a1), m['role']('Foot', 'joint'), 'ant1')
    add(kit.torus('Collar', 0.012, 0.004, seg=(12, 6), location=(a2[0], a2[1], a2[2] - 0.03)), m['joint'], 'ant1')
    for sx in (-1, 1):  # side vents on the case
        for k in range(4):
            add(box('Vent', (0.0045, 0.028, 0.003), (sx * (w + 0.001), -0.01, zc - 0.05 + k * 0.016), 0.3, seg=(4, 4)),
                m['bezel'])
    for sx in (-1, 1):  # handle end caps
        add(ball('Cap', 0.014, (sx * w * 0.62, 0, zc + h * 0.9), seg=(8, 6)), m['role']('Foot', 'joint'))
    ant, ts = kit.tube('Antenna', kit.spline([a0, a1, a2], 14), [0.009 - 0.004 * i / 13 for i in range(14)], ring=8)
    add(ant, m['joint'], kit.chain(ts, ['ant0', 'ant1']))
    add(ball('Tip', 0.014, a2, seg=(12, 8)), m['dot'](7), 'ant1')
    return [('cone', (-sx0 * 0.5 - 0.02, fy, sz), (-sx0 * 0.5 - 0.02, fy - 0.05, sz), 'root'),
            ('needle', (tx - 0.03, fy, zc + 0.03), (tx + 0.03, fy, zc + 0.03), 'root'),
            ('dialA', (tx - 0.036, fy, zc - 0.05), (tx - 0.036, fy - 0.03, zc - 0.05), 'root'),
            ('dialB', (tx + 0.036, fy, zc - 0.05), (tx + 0.036, fy - 0.03, zc - 0.05), 'root'),
            ('ant0', a0, a1, 'root'), ('ant1', a1, a2, 'ant0')]


# ---------- 9. Fireplace ----------


def firedog(add, m, x, side):
    """A firedog (an andiron) as a little robot dog sitting at the front of the grate: an
    iron bar back into the firebox under the logs, a round body, front paws, a head on its
    own bone (dog{side}) with pill eyes (Dot0) and flappy ears, and a tail that wags (on
    tail{side})."""
    y0, z0 = -0.12, 0.066
    dog, tail = f'dog{side}', f'tail{side}'
    add(kit.tube('Andiron', [(x, y0 + 0.02, z0 + 0.012), (x, 0.09, z0 + 0.012)], 0.009, ring=6)[0], m['joint'])
    add(kit.superellipsoid('DogBody', (0.034, 0.04, 0.048), 0.6, 0.8, seg=(16, 10), location=(x, y0, z0 + 0.06)),
        m['role']('Dog', 'joint'))
    add(kit.torus('Collar', 0.03, 0.006, seg=(16, 6), location=(x, y0 - 0.004, z0 + 0.1)), m['glow'])
    for sx in (-1, 1):
        add(ball('Paw', 0.014, (x + sx * 0.017, y0 - 0.036, z0 + 0.012), seg=(10, 6)), m['role']('Dog', 'joint'))
        add(kit.tube('Foreleg', [(x + sx * 0.017, y0 - 0.03, z0 + 0.07), (x + sx * 0.017, y0 - 0.036, z0 + 0.018)],
                     0.009, ring=6)[0], m['role']('Dog', 'joint'))
    hz = z0 + 0.14
    add(kit.superellipsoid('DogHead', (0.036, 0.032, 0.03), 0.5, 0.7, seg=(16, 10), location=(x, y0 - 0.012, hz)),
        m['role']('Dog', 'joint'), dog)
    add(kit.superellipsoid('Snout', (0.018, 0.02, 0.014), 0.5, 0.7, seg=(10, 6), location=(x, y0 - 0.044, hz - 0.012)),
        m['role']('Dog', 'joint'), dog)
    add(ball('Nose', 0.007, (x, y0 - 0.064, hz - 0.006), seg=(8, 6)), m['bezel'], dog)
    add(box('Visor', (0.028, 0.004, 0.011), (x, y0 - 0.043, hz + 0.01), 0.45, seg=(12, 6)), m['bezel'], dog)
    for sx in (-1, 1):
        add(kit.superellipsoid('DogEye', (0.007, 0.004, 0.005), 0.7, 0.9, seg=(10, 6),
                               location=(x + sx * 0.013, y0 - 0.047, hz + 0.01)), m['dot'](0), dog)
        add(box('Ear', (0.008, 0.012, 0.028), (x + sx * 0.036, y0 - 0.008, hz - 0.004), 0.4, seg=(8, 6),
                rotation=(0, sx * 0.35, 0)), m['role']('Dog', 'joint'), dog)
    add(kit.tube('Tail', [(x, y0 + 0.04, z0 + 0.04), (x, y0 + 0.065, z0 + 0.075), (x, y0 + 0.07, z0 + 0.11)],
                 [0.007, 0.006, 0.004], ring=6)[0], m['role']('Dog', 'joint'), tail)
    add(ball('TailTip', 0.007, (x, y0 + 0.07, z0 + 0.112), seg=(8, 6)), m['glow'], tail)
    return [(dog, (x, y0 - 0.005, hz - 0.03), (x, y0 - 0.005, hz + 0.03), 'root'),
            (tail, (x, y0 + 0.04, z0 + 0.04), (x, y0 + 0.07, z0 + 0.11), 'root')]


def fireplace(m, add):
    """A fireplace for the library, as a robot: a bolted surround of two panelled pillars and
    a lintel with a vent grille, on a raised hearth; a mantel shelf with a pressure gauge on
    the chimney breast above it (its needle on a bone, its light Dot1) and a candle at each
    end (Dot2); in the dark firebox a basket grate holding two banded logs (on the logs bone,
    to settle), and either side of it a firedog. The fire itself the site draws, at the fire
    bone."""
    w, d, top = 0.56, 0.16, 0.9
    inner = w - 0.2
    # The hearth, out in front, with a lip.
    add(box('Hearth', (w + 0.06, d + 0.1, 0.03), (0, -0.06, 0.03), 0.25, seg=(28, 10)), m['role']('Stone', 'joint'))
    add(box('HearthLip', (w + 0.065, 0.012, 0.012), (0, -d - 0.16, 0.058), 0.4), m['joint'])
    # The pillars: panelled, bolted, on plinths, capped.
    for sx in (-1, 1):
        x = sx * (w - 0.1)
        hh = (top - 0.16) / 2
        add(box('Pillar', (0.1, d, hh), (x, 0, 0.06 + hh), 0.25, seg=(20, 14)), m['role']('Surround'))
        add(box('Panel', (0.064, 0.006, hh - 0.12), (x, -d - 0.004, 0.06 + hh), 0.35), m['joint'])
        bolts(add, m, [(x + dx, -d - 0.008, z) for dx in (-0.074, 0.074) for z in (0.13, top - 0.2)], 0.008)
        add(box('Plinth', (0.112, d + 0.012, 0.035), (x, 0, 0.095), 0.3), m['role']('Surround'))
        add(box('Capital', (0.116, d + 0.014, 0.022), (x, 0, top - 0.12), 0.3), m['joint'])
    # The lintel over the opening, and its vent.
    add(box('Lintel', (inner + 0.012, d, 0.06), (0, 0, top - 0.08), 0.25, seg=(24, 10)), m['role']('Surround'))
    for k in range(-5, 6):
        add(box('Vent', (0.0055, 0.006, 0.03), (k * 0.034, -d - 0.004, top - 0.08), 0.4, seg=(6, 6)), m['bezel'])
    # The firebox: dark all round inside, sooty underfoot.
    fz = (top - 0.14 - 0.06) / 2
    add(box('Firebox', (inner, 0.01, fz), (0, d - 0.03, 0.06 + fz), 0.3), m['bezel'])
    for sx in (-1, 1):
        add(box('Cheek', (0.01, d - 0.03, fz), (sx * (inner - 0.006), 0.0, 0.06 + fz), 0.3), m['bezel'])
    add(box('Soot', (inner, d - 0.02, 0.008), (0, 0.0, 0.064), 0.3), m['bezel'])
    # The mantel, and the chimney breast above it with the gauge.
    add(box('Mantel', (w + 0.05, d + 0.05, 0.026), (0, -0.02, top), 0.3, seg=(28, 8)), m['role']('Wood'))
    add(box('MantelTrim', (w + 0.03, 0.01, 0.012), (0, -d - 0.074, top - 0.034), 0.4), m['joint'])
    add(box('Breast', (0.3, d - 0.03, 0.09), (0, 0.02, top + 0.115), 0.3, seg=(20, 10)), m['role']('Surround'))
    gz = top + 0.12
    gy = -d + 0.015
    add(puck('GaugeRim', 0.062, 0.012, (0, gy - 0.004, gz)), m['joint'])
    add(puck('GaugeFace', 0.052, 0.006, (0, gy - 0.014, gz)), m['glow'])
    for k in range(9):  # its ticks, round the upper part of the face
        a = PI * (0.1 + 0.8 * k / 8)
        add(box('GaugeTick', (0.0018, 0.002, 0.006), (0.043 * math.cos(a), gy - 0.021, gz + 0.043 * math.sin(a)),
                0.3, seg=(4, 4), rotation=(0, PI / 2 - a, 0)), m['bezel'])
    add(box('GaugeNeedle', (0.003, 0.003, 0.034), (0, gy - 0.024, gz + 0.028), 0.4, seg=(6, 4)), m['bezel'], 'gauge')
    add(ball('GaugePin', 0.007, (0, gy - 0.026, gz), seg=(8, 6)), m['joint'], 'gauge')
    add(ball('GaugeLight', 0.009, (0.21, gy - 0.004, gz), seg=(10, 6)), m['dot'](1))
    bolts(add, m, [(sx * 0.26, gy - 0.004, gz + dz) for sx in (-1, 1) for dz in (-0.05, 0.05)], 0.007)
    # A candle at each end of the mantel.
    for sx in (-1, 1):
        x = sx * (w - 0.04)
        add(kit.lathe('Candlestick', [(0, top + 0.026), (0.03, top + 0.026), (0.03, top + 0.034), (0.012, top + 0.04),
                                      (0.01, top + 0.075), (0.022, top + 0.08), (0.02, top + 0.088), (0, top + 0.088)],
                      seg=16, location=(x, -0.06, 0)), m['joint'])
        add(kit.tube('Candle', [(x, -0.06, top + 0.088), (x, -0.06, top + 0.15)], 0.012, ring=10)[0],
            m['role']('Wax', 'shell'))
        add(kit.superellipsoid('Wick', (0.009, 0.009, 0.016), 0.8, 0.6, seg=(10, 8), location=(x, -0.06, top + 0.172)),
            m['dot'](2))
    # The grate: a basket of bars on four legs, and two banded logs on it.
    gz0 = 0.1
    add(box('GrateBase', (0.21, 0.07, 0.008), (0, 0.0, gz0), 0.4), m['joint'])
    for k in range(8):
        x = -0.19 + k * (0.38 / 7)
        add(kit.tube('Bar', [(x, -0.074, gz0), (x, -0.082, gz0 + 0.09)], 0.0065, ring=6)[0], m['joint'])
    add(kit.tube('GrateRail', [(-0.205, -0.082, gz0 + 0.09), (0.205, -0.082, gz0 + 0.09)], 0.008, ring=6)[0], m['joint'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            add(kit.tube('GrateLeg', [(sx * 0.18, sy * 0.05, gz0), (sx * 0.2, sy * 0.06, 0.068)], 0.0075, ring=6)[0],
                m['joint'])
    for a, b, r in (((-0.2, 0.025, gz0 + 0.048), (0.19, -0.015, gz0 + 0.05), 0.043),
                    ((-0.16, -0.03, gz0 + 0.112), (0.2, 0.035, gz0 + 0.098), 0.037)):
        add(kit.tube('Log', [a, b], r, ring=14)[0], m['role']('Log', 'joint'), 'logs')
        for t in (0.25, 0.72):  # iron bands round each log
            c = tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
            add(kit.torus('LogBand', r + 0.002, 0.005, seg=(16, 6), location=c, rotation=(0, PI / 2, 0)),
                m['joint'], 'logs')
    bones = [('logs', (0, 0, gz0), (0, 0, gz0 + 0.15), 'root'),
             ('fire', (0, 0.0, gz0 + 0.07), (0, 0.0, gz0 + 0.37), 'root'),
             ('gauge', (0, gy - 0.02, gz), (0, gy - 0.02, gz + 0.05), 'root')]
    for sx, side in ((1, 'L'), (-1, 'R')):
        bones += firedog(add, m, sx * 0.265, side)
    return bones


# ---------- 10. Library bookcase ----------

LIB_SHELVES = (0.1, 0.47, 0.84, 1.21, 1.58)
LIB_W, LIB_D, LIB_H = 0.5, 0.15, 1.96


def lib_books(s, w=LIB_W, seed=0):
    """The books on library shelf s of a case w wide (half): (half width, height) each, packed
    along it, the same every build (another seed, other books)."""
    r = (s * 7919 + 17 + seed) % 1000
    out, x = [], 0.0
    while True:
        r = (r * 1103 + 12345) % 10007
        bw = 0.016 + (r % 97) / 97 * 0.02
        r = (r * 1103 + 12345) % 10007
        bh = 0.2 + (r % 89) / 89 * 0.12
        if x + bw * 2 > (w - 0.05) * 2 - 0.1:
            break
        out.append((bw, bh))
        x += bw * 2 + 0.004
    return out


LIB_NOOK = 2  # the shelf with the cat's nook on it
TWIN_W, TWIN_H = 0.6, 1.6  # the other case: wider and lower, four shelves


def bookcase(m, add, twin=False):
    """A tall library bookcase: five shelves of books packed tight (a few on bones, to lean and
    pop: lib{shelf}{k}), a cornice with two light eyes (Dot0), a brass rail along the front
    near the top and a rolling ladder hooked on it (the ladder bone, at its hooks: it rolls
    along the rail and swings), wheels at its feet and a clamp lamp on it (Dot1). Some
    spines light up (Dot2). The middle shelf's left half is a cat's nook: no books, a
    bookend holding the rest, and a flat cushion on the nook bone (it breathes, and gives
    under a sleeper).

    twin: the library's right-hand one, not its match: wider and lower, four shelves of other
    books (a short stack lying flat at the bottom, one leaning in a gap at the top), its nook
    on the right, a shelf lower and roomier, no rail or ladder but a banker's lamp on top
    (Dot1), and the library's copy of the book at the left end of the shelf above the nook
    (the copy bone; its label lights, Dot3, when it's offered)."""
    w, d, h = (TWIN_W, LIB_D, TWIN_H) if twin else (LIB_W, LIB_D, LIB_H)
    shelves = LIB_SHELVES[:4] if twin else LIB_SHELVES
    nook = LIB_NOOK - 1 if twin else LIB_NOOK  # (the twin's lower, under the switchboard's height)
    X = (lambda x: -x) if twin else (lambda x: x)  # the twin, built as the left one, mirrored
    for sx in (-1, 1):
        add(box('Side', (0.022, d, h / 2 - 0.02), (sx * (w - 0.022), 0, h / 2 + 0.02), 0.3, seg=(14, 16)),
            m['role']('Wood'))
        add(box('Pilaster', (0.012, 0.006, h / 2 - 0.12), (sx * (w - 0.022), -d - 0.004, h / 2 + 0.02), 0.4),
            m['joint'])
    add(box('Back', (w - 0.03, 0.008, h / 2 - 0.04), (0, d - 0.01, h / 2 + 0.02), 0.3), m['joint'])
    add(box('Plinth', (w + 0.01, d + 0.01, 0.04), (0, 0, 0.045), 0.3), m['role']('Wood'))
    add(box('Cornice', (w + 0.03, d + 0.025, 0.05), (0, 0, h + 0.01), 0.3, seg=(24, 10)), m['role']('Wood'))
    add(box('CorniceTop', (w + 0.045, d + 0.035, 0.012), (0, 0, h + 0.066), 0.4), m['joint'])
    add(box('Visor', (0.16, 0.006, 0.03), (0, -d - 0.03, h + 0.01), 0.45, seg=(20, 8)), m['bezel'])
    eyes(add, m, (0, -d - 0.034, h + 0.01), 0.075, 0.024, 0.017, dot=0)
    bolts(add, m, [(sx * (w - 0.03), -d - 0.03, h + 0.01) for sx in (-1, 1)], 0.008)
    bones = []
    lit = {(0, 3), (1, 7), (2, 1), (3, 5), (4, 9)}
    boned = {1, 5, 9}
    copy_x = w - 0.075  # (the twin's copy, as built before mirroring: at the far end)
    gap = -w + 0.3  # (the twin's: books lying flat below it on the bottom shelf, one leaning at the top)
    for s, z in enumerate(shelves):
        add(box('Shelf', (w - 0.03, d - 0.004, 0.01), (0, 0, z - 0.01), 0.3), m['role']('Wood'))
        add(box('Lip', (w - 0.03, 0.007, 0.016), (0, -d + 0.004, z - 0.004), 0.4), m['joint'])
        x = -w + 0.06
        for k, (bw, bh) in enumerate(lib_books(s, w, 400 if twin else 0)):
            cx = x + bw
            x = cx + bw + 0.004
            # (Built as the left-hand one, then mirrored for the twin: the nook's books go,
            # and the twin's at the end where its copy stands, and where its stack lies.)
            if s == nook and cx - bw < 0.03:
                continue
            if twin and s == nook + 1 and cx + bw > copy_x - 0.034:
                continue
            if twin and s == 0 and cx - bw < gap:
                continue
            if twin and s == len(shelves) - 1 and cx - bw < -w + 0.17:
                continue
            bone = f'lib{s}{k}' if k in boned else 'root'
            tone = (s * 3 + k + (2 if twin else 0)) % 5
            add(box('Book', (bw, d - 0.03, bh / 2), (X(cx), 0.0, z + bh / 2), 0.2, seg=(8, 6)),
                m['role'](f'Book{tone}'), bone)
            add(box('Band', (bw + 0.003, 0.006, 0.008), (X(cx), -d + 0.027, z + bh * 0.82), 0.4, seg=(6, 4)),
                m['role']('Band', 'bezel'), bone)
            add(box('Title', (bw * 0.45, 0.004, bh * 0.14), (X(cx), -d + 0.029, z + bh * 0.55), 0.4, seg=(6, 4)),
                m['dot'](2) if (s, k) in lit else m['role']('Title', 'bezel'), bone)
            if bone != 'root':
                bones.append((bone, (X(cx), 0, z), (X(cx), 0, z + bh), 'root'))
    if twin:
        # Three big books lying flat in a short stack, and one leaning into the gap at the top.
        z = shelves[0]
        for j, (lw, lt) in enumerate(((0.12, 0.022), (0.105, 0.018), (0.09, 0.02))):
            cz = z + 0.004 + sum(t * 2 for _, t in ((0.12, 0.022), (0.105, 0.018), (0.09, 0.02))[:j]) + lt
            add(box('Book', (lw, d - 0.03 - j * 0.01, lt), (X(-w + 0.17 + j * 0.012), 0.0, cz), 0.2, seg=(8, 6)),
                m['role'](f'Book{(j + 1) % 5}'))
            add(box('Band', (0.006, 0.006, lt + 0.002), (X(-w + 0.17 + j * 0.012 + lw * 0.6), -d + 0.027 + j * 0.01, cz),
                    0.4, seg=(4, 4)), m['role']('Band', 'bezel'))
        z, bh, bw, lean = shelves[-1], 0.27, 0.02, math.radians(17)
        bx = -w + 0.085 + bh / 2 * math.sin(lean)
        add(box('Book', (bw, d - 0.03, bh / 2), (X(bx), 0.0, z + bh / 2 * math.cos(lean) + bw * math.sin(lean)), 0.2,
                seg=(8, 6), rotation=(0, -lean if twin else lean, 0)), m['role']('Book3'))
    # The nook: a bookend holding the books back, and a cushion, flat and soft, piped round.
    z = shelves[nook]
    add(box('Bookend', (0.012, d - 0.04, 0.085), (X(0.012), 0.0, z + 0.085), 0.3), m['role']('Trim', 'joint'))
    add(box('BookendBase', (0.05, d - 0.04, 0.007), (X(0.06), 0.0, z + 0.004), 0.4), m['joint'])
    add(ball('BookendKnob', 0.014, (X(0.012), -d + 0.035, z + 0.17), seg=(10, 8)), m['role']('Trim', 'joint'))
    cx, half, cz = (X(-0.3), 0.235, z + 0.024) if twin else (X(-0.25), 0.195, z + 0.024)
    add(box('Cushion', (half, d - 0.022, 0.024), (cx, 0.005, cz), 0.6, seg=(28, 12)), m['role']('Cushion'), 'nook')
    add(kit.tube('Piping', [(cx + px, 0.005 + py, cz + 0.012) for px, py in squircle(half - 0.004, d - 0.026, 0.6)],
                 0.005, ring=6)[0], m['joint'], 'nook')
    add(kit.superellipsoid('Button', (0.014, 0.014, 0.006), 0.6, 1.0, seg=(12, 6), location=(cx, 0.005, cz + 0.024)),
        m['joint'], 'nook')
    bones.append(('nook', (cx, 0, z), (cx, 0, cz + 0.024), 'root'))
    if twin:
        # The library's copy: dark cloth, gold bands, and a call-number label that lights.
        cz2, ccx, ch = shelves[nook + 1], X(copy_x), 0.27
        add(box('Copy', (0.028, d - 0.035, ch / 2), (ccx, 0.0, cz2 + ch / 2), 0.2, seg=(10, 6)), m['bezel'], 'copy')
        for zz in (0.12, 0.88):
            add(box('CopyBand', (0.03, 0.006, 0.006), (ccx, -d + 0.033, cz2 + ch * zz), 0.4, seg=(8, 4)), m['glow'], 'copy')
        add(box('CopyLabel', (0.022, 0.004, 0.022), (ccx, -d + 0.034, cz2 + 0.05), 0.4, seg=(8, 6)), m['dot'](3), 'copy')
        bones.append(('copy', (ccx, 0, cz2), (ccx, 0, cz2 + ch), 'root'))
    if twin:
        # A banker's lamp on top, at the inner end: a brass foot and stem, a dark shade with the
        # light under it (Dot1).
        top, lx = h + 0.078, X(w - 0.2)
        add(kit.superellipsoid('LampFoot', (0.06, 0.045, 0.012), 0.5, 1.0, seg=(20, 8), location=(lx, 0.0, top + 0.012)),
            m['role']('Trim', 'joint'))
        add(kit.tube('LampStem', [(lx, 0.0, top + 0.02), (lx, 0.0, top + 0.15)], 0.007, ring=8)[0], m['role']('Trim', 'joint'))
        add(kit.tube('LampArm', [(lx, 0.0, top + 0.15), (lx, -0.03, top + 0.165)], 0.006, ring=6)[0], m['role']('Trim', 'joint'))
        add(kit.superellipsoid('LampShade', (0.1, 0.045, 0.028), 0.35, 0.9, seg=(24, 10), location=(lx, -0.03, top + 0.18)),
            m['bezel'])
        add(kit.superellipsoid('LampLight', (0.085, 0.034, 0.006), 0.35, 1.0, seg=(20, 6), location=(lx, -0.03, top + 0.153)),
            m['dot'](1))
        add(ball('LampPull', 0.008, (lx + X(0.05), -0.05, top + 0.12), seg=(8, 6)), m['role']('Trim', 'joint'))
    else:
        # The rail, on three brackets, and the ladder hooked on it.
        ry, rz = -d - 0.05, h - 0.2
        add(kit.tube('Rail', [(-w + 0.02, ry, rz), (w - 0.02, ry, rz)], 0.011, ring=10)[0], m['joint'])
        for bx in (-w + 0.05, 0.0, w - 0.05):
            add(kit.tube('RailArm', [(bx, -d + 0.005, rz), (bx, ry, rz)], 0.008, ring=6)[0], m['joint'])
            add(ball('RailKnob', 0.014, (bx, -d + 0.005, rz), seg=(10, 6)), m['joint'])
        lx, fy = X(0.2), ry - 0.42  # the ladder hangs at x = lx; its feet stand out in front
        for sx in (-1, 1):
            x = lx + sx * 0.095
            add(kit.tube('Stile', [(x, ry - 0.02, rz + 0.05), (x, fy, 0.05)], 0.012, ring=8)[0], m['role']('Wood'), 'ladder')
            add(kit.torus('Hook', 0.022, 0.006, seg=(14, 6), location=(x, ry, rz + 0.012), rotation=(0, PI / 2, 0)),
                m['joint'], 'ladder')
            add(puck('Wheel', 0.03, 0.01, (x + sx * 0.016, fy, 0.03)), m['bezel'], 'ladder')
            add(kit.torus('WheelRim', 0.03, 0.005, seg=(14, 6), location=(x + sx * 0.024, fy, 0.03),
                          rotation=(0, PI / 2, 0)), m['joint'], 'ladder')
        for k in range(1, 7):  # the rungs, up the lean
            t = k / 7
            y, z = ry - 0.02 + (fy - ry + 0.02) * (1 - t), 0.05 + (rz + 0.05 - 0.05) * t
            add(kit.tube('Rung', [(lx - 0.09, y, z), (lx + 0.09, y, z)], 0.008, ring=6)[0], m['joint'], 'ladder')
        ly, lz = ry - 0.02 + (fy - ry + 0.02) * 0.15, 0.05 + rz * 0.85
        lc = lx + X(0.11)  # the clamp lamp, on the ladder's outer stile
        add(kit.superellipsoid('Clamp', (0.012, 0.016, 0.02), 0.5, 0.6, seg=(10, 6), location=(lc, ly, lz)),
            m['joint'], 'ladder')
        add(kit.tube('LampNeck', [(lc, ly, lz + 0.02), (lc + X(0.02), ly - 0.03, lz + 0.07)], 0.004, ring=6)[0],
            m['joint'], 'ladder')
        add(kit.superellipsoid('LampHead', (0.02, 0.02, 0.014), 0.6, 0.8, seg=(12, 8), location=(lc + X(0.03), ly - 0.045, lz + 0.075)),
            m['dot'](1), 'ladder')
        bones.append(('ladder', (lx, ry, rz), (lx, ry, rz + 0.15), 'root'))
    bones += eye_bones((0, -d - 0.034, h + 0.01), 0.075, 0.04, 'root')
    return bones


# ---------- 10b. The reading room's low case ----------

READ_SHELVES = (0.1, 0.62, 0.99)
READ_W, READ_H = 0.78, 1.37
# The bottom shelf's left end is the gramophone's (the piece stands on it), and behind it, a
# cat's pillow: the middle of the pillow, its half width, and its top above the shelf.
READ_PILLOW = (-0.5, 0.26, 0.075)
READ_GRAM_X = -0.5


def readcase(m, add):
    """The library's left-hand case, wide and low: three shelves of books packed tight (a few
    on bones, to lean and pop: lib{shelf}{k}), a cornice with two light eyes (Dot0), and a
    flat stack of books on top. The bottom shelf is a roomy bay: the gramophone stands on its
    left end (a separate piece, the site sets it there) and behind it, further back,
    a plump pillow on the nook bone (it breathes, and gives under a sleeper) for the cat, with a
    bookend holding the shelf's few books back. Some spines light up (Dot2)."""
    w, d, h = READ_W, LIB_D, READ_H
    shelves = READ_SHELVES
    for sx in (-1, 1):
        add(box('Side', (0.022, d, h / 2 - 0.02), (sx * (w - 0.022), 0, h / 2 + 0.02), 0.3, seg=(14, 16)),
            m['role']('Wood'))
        add(box('Pilaster', (0.012, 0.006, h / 2 - 0.12), (sx * (w - 0.022), -d - 0.004, h / 2 + 0.02), 0.4),
            m['joint'])
    add(box('Back', (w - 0.03, 0.008, h / 2 - 0.04), (0, d - 0.01, h / 2 + 0.02), 0.3), m['joint'])
    add(box('Plinth', (w + 0.01, d + 0.01, 0.04), (0, 0, 0.045), 0.3), m['role']('Wood'))
    add(box('Cornice', (w + 0.03, d + 0.025, 0.05), (0, 0, h + 0.01), 0.3, seg=(24, 10)), m['role']('Wood'))
    add(box('CorniceTop', (w + 0.045, d + 0.035, 0.012), (0, 0, h + 0.066), 0.4), m['joint'])
    add(box('Visor', (0.16, 0.006, 0.03), (0, -d - 0.03, h + 0.01), 0.45, seg=(20, 8)), m['bezel'])
    eyes(add, m, (0, -d - 0.034, h + 0.01), 0.075, 0.024, 0.017, dot=0)
    bolts(add, m, [(sx * (w - 0.03), -d - 0.03, h + 0.01) for sx in (-1, 1)], 0.008)
    bones = []
    lit = {(1, 3), (2, 7), (1, 9)}
    boned = {1, 5, 9}
    # Where the bottom shelf's books begin (the right of the bay), and the pillow's span.
    px, ph, pt = READ_PILLOW
    bay = px + ph + 0.1
    for s, z in enumerate(shelves):
        add(box('Shelf', (w - 0.03, d - 0.004, 0.01), (0, 0, z - 0.01), 0.3), m['role']('Wood'))
        add(box('Lip', (w - 0.03, 0.007, 0.016), (0, -d + 0.004, z - 0.004), 0.4), m['joint'])
        x = -w + 0.06
        for k, (bw, bh) in enumerate(lib_books(s, w, 250)):
            cx = x + bw
            x = cx + bw + 0.004
            if s == 0 and cx - bw < bay:
                continue
            bone = f'lib{s}{k}' if k in boned else 'root'
            tone = (s * 3 + k + 1) % 5
            add(box('Book', (bw, d - 0.03, bh / 2), (cx, 0.0, z + bh / 2), 0.2, seg=(8, 6)),
                m['role'](f'Book{tone}'), bone)
            add(box('Band', (bw + 0.003, 0.006, 0.008), (cx, -d + 0.027, z + bh * 0.82), 0.4, seg=(6, 4)),
                m['role']('Band', 'bezel'), bone)
            add(box('Title', (bw * 0.45, 0.004, bh * 0.14), (cx, -d + 0.029, z + bh * 0.55), 0.4, seg=(6, 4)),
                m['dot'](2) if (s, k) in lit else m['role']('Title', 'bezel'), bone)
            if bone != 'root':
                bones.append((bone, (cx, 0, z), (cx, 0, z + bh), 'root'))
    # The bay's bookend, holding the shelf's few books back from the pillow.
    z = shelves[0]
    be = bay - 0.04
    add(box('Bookend', (0.012, d - 0.04, 0.085), (be, 0.0, z + 0.085), 0.3), m['role']('Trim', 'joint'))
    add(box('BookendBase', (0.05, d - 0.04, 0.007), (be + 0.04, 0.0, z + 0.004), 0.4), m['joint'])
    add(ball('BookendKnob', 0.014, (be, -d + 0.035, z + 0.17), seg=(10, 8)), m['role']('Trim', 'joint'))
    # The pillow, at the back of the bay: plump, piped round, buttoned, a tassel at each corner.
    pz, py, pd = z + pt / 2 + 0.006, 0.045, d - 0.07
    add(kit.superellipsoid('Pillow', (ph, pd, pt / 2), 0.55, 1.0, seg=(28, 14), location=(px, py, pz)),
        m['role']('Cushion'), 'nook')
    add(kit.tube('Piping', [(px + qx, py + qy, pz) for qx, qy in squircle(ph - 0.004, pd - 0.004, 0.6)], 0.006, ring=6)[0],
        m['joint'], 'nook')
    add(kit.superellipsoid('Button', (0.015, 0.015, 0.007), 0.6, 1.0, seg=(12, 6), location=(px, py, pz + pt / 2)),
        m['joint'], 'nook')
    for sx in (-1, 1):
        for sy in (-1, 1):
            add(ball('Tassel', 0.012, (px + sx * (ph + 0.004), py + sy * (pd + 0.002), pz), seg=(8, 6)), m['role']('Trim', 'joint'),
                'nook')
    bones.append(('nook', (px, py, z), (px, py, pz + pt / 2), 'root'))
    # A low stack of books lying flat on top, and one more on its side.
    top = h + 0.078
    for j, (lw, lt) in enumerate(((0.15, 0.024), (0.13, 0.02), (0.11, 0.022))):
        cz = top + sum(t * 2 for _, t in ((0.15, 0.024), (0.13, 0.02), (0.11, 0.022))[:j]) + lt
        add(box('Book', (lw, d - 0.03 - j * 0.008, lt), (-0.45 + j * 0.014, 0.0, cz), 0.2, seg=(8, 6)),
            m['role'](f'Book{(j + 3) % 5}'))
        add(box('Band', (0.006, 0.006, lt + 0.002), (-0.45 + j * 0.014 + lw * 0.6, -d + 0.027 + j * 0.008, cz), 0.4,
                seg=(4, 4)), m['role']('Band', 'bezel'))
    bones += eye_bones((0, -d - 0.034, h + 0.01), 0.075, 0.04, 'root')
    return bones


# ---------- 11. Cat tree ----------

TREE_POST = (0.1, 0.05)
TREE_SEGS = ((0.08, 0.4), (0.4, 0.7), (0.7, 0.98), (0.98, 1.2))


def cattree(m, add):
    """A robot cat tree on a wide rounded base: a post in four bolted segments (post0-post3,
    ribbed with rope rings, each a bone so it can shiver from the bottom up), three padded
    platforms that stick out to alternate sides (plat1 right, plat2 left, plat3 the round
    top, each on its own bone to bob), a round cubby low down on the left with two eyes in
    its dark (eyeL, eyeR, Dot0) and two slots on its rim (Dot0), a small lamp (Dot1) on the
    top platform and a toy on a coiled spring cord from its front edge (toy0, toy1, and
    toy that spins)."""
    px, py = TREE_POST
    # The base: a wide rounded slab with a skirt, four feet, bolts along the front.
    add(box('Base', (0.44, 0.34, 0.04), (0, 0, 0.05), 0.4, seg=(32, 12)), m['role']('Base'))
    add(box('Skirt', (0.455, 0.355, 0.012), (0, 0, 0.034), 0.4, seg=(32, 8)), m['joint'])
    add(kit.tube('Welt', [(x, y, 0.092) for x, y in squircle(0.425, 0.325, 0.4)], 0.008, ring=6)[0],
        m['role']('Base', 'joint'))
    for sx in (-1, 1):
        for sy in (-1, 1):
            add(ball('Foot', 0.026, (sx * 0.37, sy * 0.28, 0.022), seg=(10, 6)), m['role']('Base', 'joint'))
    bolts(add, m, [(x, -0.359, 0.04) for x in (-0.34, -0.17, 0.0, 0.17, 0.34)], 0.008)
    # The post: bolted segments in rope, a collar with bolts at every joint.
    bones = []
    names = ['post0', 'post1', 'post2', 'post3']
    for k, (z0, z1) in enumerate(TREE_SEGS):
        add(kit.tube(f'Post{k}', [(px, py, z0 + 0.004), (px, py, z1 - 0.004)], 0.056, ring=14)[0],
            m['role']('Post'), names[k])
        z = z0 + 0.03
        while z < z1 - 0.02:  # the ribs: rope rings
            add(kit.torus('Rib', 0.06, 0.0085, seg=(16, 5), location=(px, py, z)), m['role']('Post', 'joint'), names[k])
            z += 0.045
        if k:
            add(kit.torus('Collar', 0.07, 0.013, seg=(18, 8), location=(px, py, z0)), m['joint'], names[k])
            for a in range(6):
                t = 2 * PI * a / 6
                bolt(add, m, (px + 0.082 * math.cos(t), py + 0.082 * math.sin(t), z0), 0.006,
                     'right' if math.cos(t) > 0 else 'left', names[k])
        bones.append((names[k], (px, py, z0), (px, py, z1), 'root' if k == 0 else names[k - 1]))
    add(kit.torus('Collar', 0.07, 0.013, seg=(18, 8), location=(px, py, 0.085)), m['joint'], 'post0')
    add(kit.lathe('Flange', [(0.05, 0.12), (0.095, 0.1), (0.1, 0.08), (0, 0.08)], seg=20, location=(px, py, 0.0)),
        m['role']('Base', 'joint'))
    # The platforms: padded slabs on an under-plate, with piping and a bracket to the post.
    for name, parent, z, cx, half in (('plat1', 'post1', 0.58, px + 0.2, (0.23, 0.2)),
                                      ('plat2', 'post2', 0.9, px - 0.21, (0.24, 0.2))):
        side = 1 if cx > px else -1
        cy = py - 0.02
        add(box('Pad', (half[0], half[1], 0.032), (cx, cy, z), 0.5, seg=(28, 12)), m['role']('Pad'), name)
        add(box('Under', (half[0] - 0.02, half[1] - 0.02, 0.012), (cx, cy, z - 0.036), 0.4, seg=(20, 8)),
            m['joint'], name)
        add(kit.tube('Piping', [(x + cx, y + cy, z + 0.012) for x, y in squircle(half[0] - 0.012, half[1] - 0.012, 0.5)],
                     0.0065, ring=6)[0], m['role']('Pad', 'joint'), name)
        add(kit.superellipsoid('Button', (0.024, 0.024, 0.008), 0.6, 1.0, seg=(12, 6),
                               location=(cx + side * 0.07, cy, z + 0.03)), m['joint'], name)
        bolts(add, m, [(cx + sx * (half[0] - 0.05), cy - half[1] - 0.001, z - 0.03) for sx in (-1, 1)], 0.007,
              'front', name)
        add(kit.tube('Brace', [(px + side * 0.06, py, z - 0.14), (px + side * 0.17, py - 0.02, z - 0.04)], 0.011,
                     ring=8)[0], m['joint'], name)
        add(ball('BraceKnuckle', 0.018, (px + side * 0.06, py, z - 0.14), seg=(8, 6)), m['joint'], name)
        bones.append((name, (px, py, z - 0.04), (px, py, z + 0.06), parent))
    # The top platform: a round pad with the lamp and the toy's hook.
    zt = 1.23
    add(kit.superellipsoid('Pad', (0.27, 0.25, 0.034), 0.5, 0.85, seg=(36, 12), location=(px + 0.03, py, zt)),
        m['role']('Pad'), 'plat3')
    add(kit.superellipsoid('Under', (0.24, 0.22, 0.012), 0.4, 0.85, seg=(28, 8), location=(px + 0.03, py, zt - 0.038)),
        m['joint'], 'plat3')
    add(kit.torus('Piping', 0.262, 0.0065, seg=(40, 6), location=(px + 0.03, py, zt + 0.014)),
        m['role']('Pad', 'joint'), 'plat3')
    add(kit.superellipsoid('Button', (0.03, 0.03, 0.008), 0.6, 1.0, seg=(12, 6), location=(px - 0.04, py - 0.02, zt + 0.032)),
        m['joint'], 'plat3')
    bolts(add, m, [(px + 0.03 + 0.27 * math.sin(a), py - 0.25 * math.cos(a), zt - 0.028) for a in (-0.8, 0, 0.8)],
          0.007, 'front', 'plat3')
    add(kit.tube('Stub', [(px, py + 0.12, zt + 0.03), (px, py + 0.12, zt + 0.07)], 0.014, ring=8)[0], m['joint'], 'plat3')
    add(kit.superellipsoid('Lamp', (0.034, 0.034, 0.03), 0.8, 0.9, seg=(14, 8), location=(px, py + 0.12, zt + 0.088)),
        m['dot'](1), 'plat3')
    add(kit.torus('LampRing', 0.036, 0.006, seg=(16, 6), location=(px, py + 0.12, zt + 0.066)), m['joint'], 'plat3')
    # The toy: a hook under the front edge, a coiled spring, a ball with a ring.
    tx, ty, z0 = px + 0.2, py - 0.2, zt - 0.05
    add(kit.torus('Hook', 0.014, 0.005, seg=(12, 6), location=(tx, ty, z0 + 0.012), rotation=(PI / 2, 0, 0)),
        m['joint'], 'plat3')
    add(kit.lathe('HookPlate', [(0.02, 0.0), (0.024, -0.008), (0, -0.01)], seg=12, location=(tx, ty, z0 + 0.03)),
        m['joint'], 'plat3')
    n = 44
    coil = [(tx + 0.016 * math.cos(2 * PI * 7 * i / (n - 1)), ty + 0.016 * math.sin(2 * PI * 7 * i / (n - 1)),
             z0 - 0.24 * i / (n - 1)) for i in range(n)]
    cord, ts = kit.tube('Spring', coil, 0.0048, ring=5)
    add(cord, m['joint'], kit.chain(ts, ['toy0', 'toy1']))
    zb = z0 - 0.3
    add(ball('Toy', 0.05, (tx, ty, zb), seg=(18, 12)), m['role']('Toy'), 'toy')
    add(kit.torus('ToyRing', 0.054, 0.008, seg=(20, 6), location=(tx, ty, zb)), m['joint'], 'toy')
    add(kit.torus('ToyBand', 0.042, 0.006, seg=(18, 6), location=(tx, ty, zb + 0.026)), m['joint'], 'toy')
    for a in range(5):
        t = 2 * PI * a / 5
        bolt(add, m, (tx + 0.052 * math.cos(t), ty + 0.052 * math.sin(t), zb),
             0.006, 'right' if math.cos(t) > 0 else 'left', 'toy')
    add(ball('ToyCap', 0.017, (tx, ty, zb + 0.055), seg=(8, 6)), m['joint'], 'toy')
    bones.append(('plat3', (px, py, zt - 0.04), (px, py, zt + 0.06), 'post3'))
    bones += [('toy0', (tx, ty, z0), (tx, ty, z0 - 0.12), 'plat3'),
              ('toy1', (tx, ty, z0 - 0.12), (tx, ty, z0 - 0.25), 'toy0'),
              ('toy', (tx, ty, zb + 0.05), (tx, ty, zb - 0.05), 'toy1')]
    # The cubby: a round padded dome low on the left, a dark hole with a lit rim, two eyes in it.
    cx, cy, cz = -0.2, -0.03, 0.29
    add(box('Cubby', (0.2, 0.2, 0.19), (cx, cy, cz), 0.75, seg=(28, 16)), m['role']('Pad'))
    add(kit.torus('Belt', 0.2, 0.009, seg=(32, 6), location=(cx, cy, cz + 0.12)), m['role']('Pad', 'joint'))
    add(kit.torus('Belt', 0.19, 0.009, seg=(32, 6), location=(cx, cy, cz - 0.12)), m['role']('Pad', 'joint'))
    add(puck('Hole', 0.108, 0.014, (cx, cy - 0.192, cz), 0.5), m['bezel'])
    add(kit.torus('Rim', 0.116, 0.013, seg=(28, 8), location=(cx, cy - 0.196, cz), rotation=FACING['front']),
        m['role']('Pad', 'joint'))
    for sx in (-1, 1):
        a = sx * 0.95
        add(kit.superellipsoid('Slot', (0.03, 0.006, 0.0085), 0.7, 0.9, seg=(12, 6),
                               location=(cx + 0.118 * math.sin(a), cy - 0.208, cz + 0.118 * math.cos(a)),
                               rotation=(0, a, 0)), m['dot'](0))
    for a in (-1.35, -0.45, 0.45, 1.35):
        bolt(add, m, (cx + 0.126 * math.sin(a), cy - 0.2, cz + 0.126 * math.cos(a)), 0.0065, 'front')
    for a in (-2.2, -0.6, 2.2):  # (and the lower ones)
        bolt(add, m, (cx + 0.126 * math.sin(a), cy - 0.2, cz + 0.126 * math.cos(a)), 0.0065, 'front')
    add(box('CubbyPlate', (0.05, 0.03, 0.03), (cx + 0.2, cy + 0.05, cz - 0.02), 0.4, seg=(10, 6)), m['joint'])
    eyes(add, m, (cx, cy - 0.206, cz - 0.005), 0.042, 0.015, 0.026, dot=0)
    bones += eye_bones((cx, cy - 0.206, cz - 0.005), 0.042, 0.04, 'root')
    return bones


# ---------- 12. Kennel ----------

KENNEL_X = -0.18  # the house stands left of middle, the bowl on its bone to its right


def kennel(m, add):
    """A robot dog house: a boxy house on a plinth, a pitched roof of bolted panels with a
    ridge cap (one bone, roof, that lifts for a sigh) and a weathervane on top (vane, that
    turns), a round-topped door with a flap hanging in it (flap), a lit name plate over the
    door (Dot0, blank), and beside it a feeder bowl standing on its own bone-shaped mat,
    with a hinged lid (lid) over a light (Dot1) that fills it when dinner is served."""
    ox = KENNEL_X

    def hadd(obj, mat, bone='root'):
        obj.location.x += ox
        return add(obj, mat, bone)

    hw, hd = 0.38, 0.32  # the house's half width and half depth
    wz, wh = 0.28, 0.22  # its walls' middle and half height
    top = wz + wh
    slope = math.radians(30)
    rise = hw * math.tan(slope)
    # Plinth and walls.
    hadd(box('Plinth', (hw + 0.05, hd + 0.05, 0.03), (0, 0, 0.03), 0.35, seg=(28, 10)), m['role']('Base'))
    hadd(kit.tube('PlinthWelt', [(x, y, 0.062) for x, y in squircle(hw + 0.045, hd + 0.045, 0.35)], 0.007, ring=6)[0],
         m['role']('Base', 'joint'))
    hadd(box('Walls', (hw, hd, wh), (0, 0, wz), 0.18, seg=(28, 14)), m['role']('Wall'))
    for sx in (-1, 1):  # panel seams and bolts down the corners
        for x in (sx * 0.22, sx * (hw - 0.012)):
            hadd(kit.tube('Seam', [(x, -hd - 0.003, wz - wh + 0.03), (x, -hd - 0.003, top - 0.03)], 0.0035, ring=4)[0],
                 m['joint'])
        for z in (wz - wh + 0.05, wz, top - 0.05):
            bolt(hadd, m, (sx * (hw - 0.04), -hd - 0.004, z), 0.007, 'front')
            bolt(hadd, m, (sx * 0.22, -hd - 0.004, z), 0.006, 'front')
    hadd(box('Skirting', (hw + 0.004, hd + 0.004, 0.012), (0, 0, 0.08), 0.3, seg=(28, 6)), m['joint'])
    # The gable: the front's triangle up to the ridge, with a seam up the middle.
    tri = [(-hw + 0.012, top - 0.03), (hw - 0.012, top - 0.03), (0, top + rise)]
    for sgn in (-1, 1):
        ya, yb = sgn * (hd + 0.002), sgn * (hd - 0.026)
        hadd(kit.mesh_object('Gable', [(x, ya, z) for x, z in tri] + [(x, yb, z) for x, z in tri],
                             [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]), m['role']('Wall'))
    for k in range(5):  # slats across the front gable
        z = top + 0.02 + k * 0.032
        half = (top + rise - z) / math.tan(slope) - 0.02
        if half > 0.03:
            hadd(kit.tube('Slat', [(-half, -hd - 0.004, z), (half, -hd - 0.004, z)], 0.003, ring=4)[0], m['joint'])
    # The door: a dark arch with a lit-free rim, the flap hung in it from a bar.
    dw, dz0, dz1 = 0.14, 0.085, 0.3
    fy = -hd - 0.004
    hadd(box('Door', (dw, 0.012, (dz1 - dz0) / 2), (0, fy, (dz0 + dz1) / 2), 0.25, seg=(16, 8)), m['bezel'])
    hadd(puck('Arch', dw, 0.012, (0, fy, dz1), 0.4, seg=(28, 10)), m['bezel'])
    rim = [(-dw - 0.012, dz0), (-dw - 0.012, dz1)] + [(( dw + 0.012) * math.cos(PI - PI * k / 14),
                                                      dz1 + (dw + 0.012) * math.sin(PI - PI * k / 14)) for k in range(1, 14)] + \
          [(dw + 0.012, dz1), (dw + 0.012, dz0)]
    hadd(kit.tube('DoorRim', [(x, fy - 0.008, z) for x, z in rim], 0.012, ring=8)[0], m['role']('Trim', 'joint'))
    for a in (0.5, 1.1, 1.57, 2.04, 2.64):
        bolt(hadd, m, (0.178 * math.cos(a), fy - 0.012, dz1 + 0.178 * math.sin(a)), 0.006, 'front')
    hadd(box('HingeBar', (dw + 0.006, 0.014, 0.012), (0, fy - 0.014, dz1 + 0.0), 0.3, seg=(14, 6)), m['joint'])
    hadd(box('Flap', (dw - 0.006, 0.01, 0.105), (0, fy - 0.026, dz1 - 0.115), 0.35, seg=(16, 8)), m['role']('Flap'), 'flap')
    hadd(box('Hem', (dw - 0.004, 0.013, 0.012), (0, fy - 0.026, dz0 + 0.012), 0.3, seg=(14, 6)), m['joint'], 'flap')
    for k in range(3):
        hadd(box('Slat', (dw - 0.03, 0.012, 0.0035), (0, fy - 0.034, dz1 - 0.07 - k * 0.05), 0.3, seg=(10, 4)),
             m['joint'], 'flap')
    for sx in (-1, 1):
        bolt(hadd, m, (sx * (dw - 0.02), fy - 0.034, dz1 - 0.025), 0.006, 'front', 'flap')
    # The name plate over the door: a dark housing with a blank lit strip.
    pz = top + 0.06
    hadd(box('PlateHouse', (0.15, 0.012, 0.038), (0, -hd - 0.003, pz), 0.4, seg=(18, 8)), m['bezel'])
    hadd(box('Plate', (0.125, 0.008, 0.02), (0, -hd - 0.014, pz), 0.5, seg=(16, 6)), m['dot'](0))
    for sx in (-1, 1):
        bolt(hadd, m, (sx * 0.14, -hd - 0.014, pz), 0.006, 'front')
    # The roof: two panels on one bone, with seams, bolts, a ridge cap and a weathervane.
    for sx in (-1, 1):
        cxp = sx * (hw + 0.04) / 2
        cz = top + (hw + 0.04) / 2 * math.tan(slope) + 0.022
        rot = (0, sx * slope, 0)
        L = (hw + 0.04) / (2 * math.cos(slope)) + 0.03
        hadd(box('Roof', (L, hd + 0.05, 0.022), (cxp, 0, cz), 0.3, seg=(20, 14), rotation=rot), m['role']('Roof'), 'roof')
        for y in (-0.2, -0.07, 0.07, 0.2):
            pts = [(sx * (0.04 + t * (hw + 0.02)), y, top + rise + 0.027 - t * (hw + 0.02) * math.tan(slope)) for t in (0.0, 0.5, 1.0)]
            hadd(kit.tube('RoofSeam', pts, 0.0035, ring=4)[0], m['joint'], 'roof')
        for t in (0.35, 0.85):
            for y in (-hd - 0.04, hd + 0.04):
                q = sx * (0.04 + t * (hw + 0.02))
                bolt(hadd, m, (q, y * 0.97, top + rise + 0.02 - t * (hw + 0.02) * math.tan(slope) + 0.01), 0.007, 'top', 'roof')
        hadd(box('Eave', (0.012, hd + 0.05, 0.01), (sx * (hw + 0.05), 0, top - 0.003 + 0.0), 0.3, seg=(8, 10)), m['joint'], 'roof')
    hadd(box('Ridge', (0.05, hd + 0.055, 0.026), (0, 0, top + rise + 0.032), 0.4, seg=(14, 14)), m['role']('Trim', 'joint'), 'roof')
    hadd(kit.torus('VaneBase', 0.026, 0.007, seg=(14, 6), location=(0, 0, top + rise + 0.06)), m['joint'], 'roof')
    # The weathervane: a mast and an arrow turning about it.
    vz = top + rise + 0.06
    hadd(kit.tube('Mast', [(0, 0, vz), (0, 0, vz + 0.14)], 0.008, ring=8)[0], m['joint'], 'vane')
    hadd(box('Arrow', (0.006, 0.09, 0.012), (0, 0, vz + 0.14), 0.4, seg=(8, 8)), m['role']('Trim', 'joint'), 'vane')
    hadd(box('Head', (0.006, 0.026, 0.026), (0, -0.09, vz + 0.14), 0.5, seg=(8, 8)), m['role']('Trim', 'joint'), 'vane')
    hadd(box('Fin', (0.005, 0.03, 0.03), (0, 0.085, vz + 0.145), 0.4, seg=(8, 8)), m['role']('Trim', 'joint'), 'vane')
    hadd(ball('Cap', 0.014, (0, 0, vz + 0.17), seg=(10, 6)), m['joint'], 'vane')
    # The bowl: a bone-shaped mat, a dished feeder with a rim, a light in its dish, a hinged lid.
    bx, by = 0.53, -0.27
    add(box('BoneShaft', (0.22, 0.05, 0.016), (bx, by, 0.016), 0.5, seg=(18, 8)), m['role']('Bone'), 'bowl')
    for sx in (-1, 1):
        for sy in (-1, 1):
            add(ball('BoneKnob', 0.045, (bx + sx * 0.22, by + sy * 0.04, 0.03), seg=(12, 8)), m['role']('Bone'), 'bowl')
    profile = [(0.0, 0.1), (0.13, 0.1), (0.15, 0.096), (0.155, 0.085), (0.15, 0.075), (0.115, 0.055), (0.115, 0.03),
               (0.0, 0.03)]
    add(kit.lathe('Bowl', profile, seg=28, location=(bx, by, 0.0)), m['role']('Bowl'), 'bowl')
    add(kit.torus('BowlFoot', 0.12, 0.011, seg=(28, 6), location=(bx, by, 0.04)), m['joint'], 'bowl')
    add(kit.torus('BowlRim', 0.15, 0.01, seg=(28, 6), location=(bx, by, 0.092)), m['role']('Trim', 'joint'), 'bowl')
    add(kit.lathe('Dish', [(0.0, 0.08), (0.11, 0.08), (0.11, 0.074), (0.0, 0.074)], seg=24, location=(bx, by, 0.0)),
        m['dot'](1), 'bowl')
    bolts(add, m, [(bx + 0.151 * math.sin(a), by - 0.151 * math.cos(a), 0.06) for a in (-0.7, 0, 0.7)], 0.006, 'front',
          'bowl')
    lid = kit.superellipsoid('Lid', (0.155, 0.155, 0.075), 0.8, 1.0, seg=(24, 12), location=(bx, by, 0.098))
    kit.cut(lid, (0, 0, 1), 0.0)
    add(lid, m['role']('Bowl'), 'lid')
    add(kit.torus('LidRim', 0.153, 0.008, seg=(28, 6), location=(bx, by, 0.1)), m['joint'], 'lid')
    add(ball('LidKnob', 0.02, (bx, by, 0.175), seg=(10, 6)), m['role']('Trim', 'joint'), 'lid')
    add(kit.tube('LidSeam', [(bx + x, by - 0.03, 0.14 - 0.4 * abs(x) * 0.2) for x in (-0.1, -0.05, 0, 0.05, 0.1)], 0.0035,
                 ring=4)[0], m['joint'], 'lid')
    add(ball('Hinge', 0.017, (bx, by + 0.155, 0.1), seg=(8, 6)), m['joint'], 'bowl')
    ex = ox
    return [('roof', (ex, 0, top), (ex, 0, top + rise), 'root'),
            ('vane', (ex, 0, vz), (ex, 0, vz + 0.17), 'roof'),
            ('flap', (ex, fy - 0.026, dz1), (ex, fy - 0.026, dz0), 'root'),
            ('bowl', (bx, by, 0.0), (bx, by, 0.1), 'root'),
            ('lid', (bx, by + 0.155, 0.1), (bx, by + 0.155, 0.2), 'bowl')]


# ---------- 13. Bird bath ----------


def birdbath(m, add):
    """A robot bird bath: a round foot, a fluted pedestal with collars, a shallow basin with a
    rim of eight small lights (Dot0-Dot7, to run round like a marquee), its water a flat disc
    (water, tilts to slosh) with three ring bones on it (ring0-ring2, that ripple outward), a
    little fountain bubbler in the middle (jet, a column that spurts) and a drip (drip) that
    forms at its nozzle now and then and falls into the water."""
    zw = 0.607  # the water's level
    add(kit.lathe('Foot', [(0.0, 0.07), (0.15, 0.066), (0.23, 0.04), (0.245, 0.016), (0.22, 0.0), (0, 0.0)], seg=36),
        m['role']('Base'))
    add(kit.torus('FootRing', 0.2, 0.01, seg=(36, 6), location=(0, 0, 0.042)), m['joint'])
    add(kit.torus('FootWelt', 0.236, 0.008, seg=(36, 6), location=(0, 0, 0.02)), m['role']('Base', 'joint'))
    bolts(add, m, [(0.24 * math.sin(a), -0.24 * math.cos(a), 0.026) for a in (-0.9, -0.45, 0.45, 0.9)], 0.008)
    # The pedestal.
    add(kit.lathe('Pedestal', [(0.09, 0.52), (0.062, 0.48), (0.046, 0.4), (0.044, 0.3), (0.054, 0.2), (0.075, 0.11),
                               (0.11, 0.07), (0, 0.07)], seg=28), m['role']('Stone'))
    for z, r in ((0.32, 0.05), (0.2, 0.058), (0.44, 0.05)):
        add(kit.torus('Collar', r, 0.012, seg=(24, 8), location=(0, 0, z)), m['role']('Stone', 'joint'))
    for k in range(10):  # flutes down the column
        a = 2 * PI * k / 10
        c, s = math.cos(a), math.sin(a)
        add(kit.tube('Flute', [(0.052 * c, 0.052 * s, 0.45), (0.045 * c, 0.045 * s, 0.34), (0.058 * c, 0.058 * s, 0.2)],
                     0.0035, ring=4)[0], m['joint'])
    for a in range(6):
        t = 2 * PI * a / 6 + 0.3
        bolt(add, m, (0.056 * math.cos(t), 0.056 * math.sin(t), 0.2 - 0.0), 0.005,
             'front' if math.sin(t) < 0 else 'back')
    # The basin: shallow, with a thick rolled rim, a belt under it.
    add(kit.lathe('Basin', [(0.0, 0.585), (0.2, 0.585), (0.27, 0.62), (0.288, 0.645), (0.305, 0.642), (0.298, 0.61),
                            (0.2, 0.53), (0.1, 0.5), (0.0, 0.49)], seg=40), m['role']('Stone'))
    add(kit.torus('Rim', 0.296, 0.012, seg=(40, 8), location=(0, 0, 0.644)), m['role']('Stone', 'joint'))
    add(kit.torus('Belt', 0.24, 0.009, seg=(40, 6), location=(0, 0, 0.55)), m['joint'])
    for k in range(8):  # the rim's lights, one each (and a bolt between each pair)
        a = 2 * PI * k / 8 + PI / 8 - PI / 2
        c, s = math.cos(a), math.sin(a)
        add(kit.superellipsoid('RimLight', (0.024, 0.012, 0.01), 0.7, 0.9, seg=(12, 6),
                               location=(0.296 * c, 0.296 * s, 0.654), rotation=(0, 0, a + PI / 2)), m['dot'](k))
        a2 = a + PI / 8
        bolt(add, m, (0.3 * math.cos(a2), 0.3 * math.sin(a2), 0.648), 0.006, 'top')
    # The water: a flat disc and three rings on it, each its own bone.
    add(kit.lathe('Water', [(0.0, zw + 0.004), (0.235, zw + 0.002), (0.24, zw - 0.004), (0.0, zw - 0.004)], seg=40),
        m['role']('Water'), 'water')
    for i, r in enumerate((0.07, 0.14, 0.205)):
        add(kit.torus('Ripple', r, 0.0045, seg=(36, 5), location=(0, 0, zw + 0.004)), m['role']('Water', 'joint'),
            f'ring{i}')
    # The bubbler: a stalk, a cap with a nozzle, the jet and the drip.
    add(kit.tube('Stalk', [(0, 0, 0.585), (0, 0, 0.64)], 0.02, ring=10)[0], m['joint'])
    add(kit.lathe('Nozzle', [(0.0, 0.672), (0.014, 0.668), (0.03, 0.655), (0.032, 0.64), (0.0, 0.63)], seg=20),
        m['role']('Stone', 'joint'))
    add(kit.torus('NozzleRing', 0.032, 0.006, seg=(20, 6), location=(0, 0, 0.645)), m['joint'])
    add(kit.lathe('Jet', [(0.0, 0.21), (0.0075, 0.205), (0.011, 0.19), (0.012, 0.1), (0.014, 0.0), (0.0, 0.0)], seg=12,
                  location=(0, 0, 0.668)), m['role']('Water'), 'jet')
    add(ball('Spray', 0.02, (0, 0, 0.668 + 0.215), seg=(12, 8)), m['role']('Water'), 'jet')
    add(ball('Drip', 0.013, (0.0, 0.0, 0.69), seg=(10, 8)), m['role']('Water'), 'drip')
    return [('water', (0, 0, zw), (0, 0, zw + 0.05), 'root'),
            *[(f'ring{i}', (0, 0, zw + 0.004), (0, 0, zw + 0.05), 'water') for i in range(3)],
            ('jet', (0, 0, 0.668), (0, 0, 0.868), 'root'), ('drip', (0, 0, 0.69), (0, 0, 0.71), 'root')]


# ---------- 14. Perch stand ----------


def perch(m, add):
    """A robot perch stand: a tripod of rounded legs under a hub, one pole (pole) up to a
    double-T of two arms, each in two halves (armTL, armTR on top, armLL, armLR below) that
    flex a little; a swing ring on a cord from the top arm's right end (swing), a seed cup
    in a cradle at the lower arm's left end (cup, that tips), and a brass bell under the top
    arm (bell, with a lit clapper, Dot0, on its own bone). A small lamp (Dot1) tops the pole."""
    zt, zl = 1.2, 0.8  # the arms' heights
    # The tripod: three rounded legs from a hub, with pads.
    add(ball('Hub', 0.058, (0, 0, 0.2), seg=(16, 10)), m['role']('Hub', 'joint'))
    add(kit.torus('HubRing', 0.06, 0.009, seg=(20, 6), location=(0, 0, 0.2)), m['joint'])
    for k in range(3):
        a = math.radians(-90 + 120 * k)
        c, s = math.cos(a), math.sin(a)
        path = kit.spline([(0.0, 0.0, 0.2), (0.14 * c, 0.14 * s, 0.17), (0.26 * c, 0.26 * s, 0.09), (0.33 * c, 0.33 * s, 0.032)], 20)
        add(kit.tube(f'Leg{k}', path, [0.024 - 0.006 * i / 19 for i in range(20)], ring=10)[0], m['role']('Leg', 'joint'))
        add(kit.superellipsoid('Pad', (0.045, 0.045, 0.022), 0.5, 0.9, seg=(14, 8),
                               location=(0.34 * c, 0.34 * s, 0.022)), m['role']('Foot', 'joint'))
        add(kit.torus('LegCollar', 0.026, 0.006, seg=(14, 6), location=(0.17 * c, 0.17 * s, 0.155),
                      rotation=tuple(Vector((-c * 0.4, -s * 0.4, 1)).to_track_quat('Z', 'Y').to_euler())), m['joint'])
    # The pole, with collars, and the junction blocks at the arms.
    add(kit.tube('Pole', [(0, 0, 0.2), (0, 0, zt)], 0.022, ring=12)[0], m['role']('Pole'), 'pole')
    for z in (0.4, 0.6, 1.0):
        add(kit.torus('Collar', 0.03, 0.008, seg=(18, 6), location=(0, 0, z)), m['role']('Pole', 'joint'), 'pole')
    for z in (zl, zt):
        add(box('Block', (0.05, 0.036, 0.04), (0, 0, z), 0.4, seg=(12, 8)), m['role']('Hub', 'joint'), 'pole')
        bolts(add, m, [(sx * 0.025, -0.038, z + dz) for sx in (-1, 1) for dz in (-0.02, 0.02)], 0.005, 'front', 'pole')
    add(kit.superellipsoid('Lamp', (0.028, 0.028, 0.022), 0.8, 0.9, seg=(14, 8), location=(0, 0, zt + 0.05)),
        m['dot'](1), 'pole')
    add(kit.torus('LampRing', 0.03, 0.006, seg=(16, 6), location=(0, 0, zt + 0.03)), m['joint'], 'pole')
    # The arms, each in two halves, with end caps and rings round them.
    arms = (('armTL', -1, zt, 0.4), ('armTR', 1, zt, 0.4), ('armLL', -1, zl, 0.4), ('armLR', 1, zl, 0.22))
    for name, sx, z, length in arms:
        add(kit.tube(name + 'Bar', [(sx * 0.04, 0, z), (sx * length, 0, z)], 0.017, ring=10)[0], m['role']('Pole'), name)
        add(ball('End', 0.026, (sx * length, 0, z), seg=(10, 8)), m['role']('Hub', 'joint'), name)
        for f in (0.35, 0.65):
            add(kit.torus('ArmRing', 0.022, 0.0055, seg=(14, 6), location=(sx * length * f, 0, z),
                          rotation=(0, PI / 2, 0)), m['joint'], name)
    # The swing: a cord from the top arm's right end, a ring and a bar across it.
    sxp = 0.34
    add(kit.torus('Eye', 0.016, 0.004, seg=(12, 6), location=(sxp, 0, zt - 0.02), rotation=(PI / 2, 0, 0)), m['joint'], 'armTR')
    add(kit.tube('Cord', [(sxp, 0, zt - 0.02), (sxp, 0, 0.96)], 0.0045, ring=5)[0], m['joint'], 'swing')
    add(ball('Bead', 0.011, (sxp, 0, 1.06), seg=(8, 6)), m['role']('Hub', 'joint'), 'swing')
    add(kit.torus('Ring', 0.07, 0.0115, seg=(32, 8), location=(sxp, 0, 0.89), rotation=(PI / 2, 0, 0)),
        m['role']('Ring'), 'swing')
    add(kit.tube('Bar', [(sxp, -0.075, 0.838), (sxp, 0.075, 0.838)], 0.0095, ring=8)[0], m['role']('Pole'), 'swing')
    add(ball('Knob', 0.014, (sxp, 0, 0.965), seg=(8, 6)), m['joint'], 'swing')
    # The seed cup: in a cradle ring at the lower arm's left end, a hump of seeds in it.
    cxp = -0.34
    add(kit.torus('Cradle', 0.05, 0.007, seg=(20, 6), location=(cxp, 0, zl + 0.03)), m['joint'], 'armLL')
    add(ball('Pivot', 0.016, (cxp, 0, zl + 0.03), seg=(8, 6)), m['joint'], 'armLL')
    add(kit.lathe('Cup', [(0.0, 0.1), (0.07, 0.1), (0.076, 0.092), (0.064, 0.05), (0.04, 0.012), (0.0, 0.0)], seg=24,
                  location=(cxp, 0, zl + 0.03)), m['role']('Cup'), 'cup')
    add(kit.torus('CupRim', 0.074, 0.008, seg=(24, 6), location=(cxp, 0, zl + 0.126)), m['role']('Cup', 'joint'), 'cup')
    add(kit.lathe('Seeds', [(0.0, 0.14), (0.045, 0.13), (0.068, 0.114), (0.068, 0.1), (0.0, 0.1)], seg=16,
                  location=(cxp, 0, zl + 0.03)), m['role']('Seed'), 'cup')
    for k in range(7):
        a = 2 * PI * k / 7
        add(ball('Seed', 0.011, (cxp + 0.04 * math.cos(a), 0.04 * math.sin(a), zl + 0.172), seg=(6, 4)),
            m['role']('Seed', 'joint'), 'cup')
    add(kit.tube('CupHandle', [(cxp + 0.07, 0, zl + 0.1), (cxp + 0.11, 0, zl + 0.085), (cxp + 0.1, 0, zl + 0.045)],
                 0.007, ring=6)[0], m['joint'], 'cup')
    # The bell: a brass dome hung under the top arm with a lit clapper.
    bx, bz = -0.2, zt - 0.03
    add(kit.tube('BellHook', [(bx, 0, zt), (bx, 0, bz)], 0.005, ring=5)[0], m['joint'], 'armTL')
    add(kit.lathe('Bell', [(0.0, 0.0), (0.02, -0.004), (0.034, -0.035), (0.048, -0.075), (0.058, -0.098), (0.045, -0.098),
                           (0.0, -0.085)], seg=20, location=(bx, 0, bz)), m['role']('Bell'), 'bell')
    add(kit.torus('BellLip', 0.054, 0.006, seg=(20, 6), location=(bx, 0, bz - 0.098)), m['role']('Bell', 'joint'), 'bell')
    add(kit.torus('BellBand', 0.04, 0.0045, seg=(18, 6), location=(bx, 0, bz - 0.05)), m['joint'], 'bell')
    add(ball('Clapper', 0.019, (bx, 0, bz - 0.116), seg=(10, 8)), m['dot'](0), 'clapper')
    add(kit.tube('ClapperStem', [(bx, 0, bz - 0.06), (bx, 0, bz - 0.105)], 0.003, ring=4)[0], m['joint'], 'clapper')
    return [('pole', (0, 0, 0.2), (0, 0, zt), 'root'),
            ('armTL', (0, 0, zt), (-0.4, 0, zt), 'pole'), ('armTR', (0, 0, zt), (0.4, 0, zt), 'pole'),
            ('armLL', (0, 0, zl), (-0.4, 0, zl), 'pole'), ('armLR', (0, 0, zl), (0.22, 0, zl), 'pole'),
            ('swing', (sxp, 0, zt - 0.02), (sxp, 0, 0.82), 'armTR'),
            ('cup', (cxp, 0, zl + 0.03), (cxp, 0, zl + 0.16), 'armLL'),
            ('bell', (bx, 0, bz), (bx, 0, bz - 0.1), 'armTL'),
            ('clapper', (bx, 0, bz - 0.06), (bx, 0, bz - 0.12), 'bell')]


# ---------- 15. Gramophone ----------


def gramophone(m, add):
    """The library's gramophone: a wooden cabinet on bun feet with a visor of two pill eyes
    and a row of four lights (Dot1-Dot4) under it, a record on a turntable that spins (disc)
    with a lit spindle (Dot5), a brass tonearm on a post (tonearm) whose head comes down on
    the record, a winding crank on its right side (crank), and the big flared horn: a neck
    up out of the back in two bones (neck0, neck1) and a petalled horn (horn) facing out and
    up, its rim lit (Dot6)."""
    w, d, h = 0.2, 0.17, 0.075
    z0 = 0.05
    zc = z0 + h
    top = zc + h
    add(box('Case', (w, d, h), (0, 0, zc), 0.35, seg=(32, 14)), m['role']('Case'))
    add(box('Plinth', (w + 0.006, d + 0.006, 0.01), (0, 0, z0 + 0.01), 0.4, seg=(24, 8)), m['joint'])
    add(box('Deck', (w - 0.01, d - 0.01, 0.006), (0, 0, top + 0.002), 0.4, seg=(24, 8)), m['joint'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            add(ball('Foot', 0.026, (sx * (w - 0.05), sy * (d - 0.04), 0.026), seg=(12, 8)), m['role']('Foot', 'joint'))
    fy = -d - 0.002
    # The face: a visor with two eyes, and the lights under it.
    add(box('Visor', (0.11, 0.006, 0.03), (0, fy - 0.004, zc + 0.012), 0.45, seg=(24, 10)), m['bezel'])
    eyes(add, m, (0, fy - 0.008, zc + 0.012), 0.05, 0.021, 0.019, dot=0)
    for k in range(4):
        add(ball('Light', 0.0075, (-0.075 + k * 0.05, fy - 0.004, zc - 0.045), seg=(10, 6)), m['dot'](k + 1))
    bolts(add, m, [(sx * (w - 0.025), fy, zc + dz) for sx in (-1, 1) for dz in (-0.045, 0.045)], 0.0065)
    # The turntable: a platter, the record on it (grooves, a label with a mark so the spin
    # shows) and the spindle.
    ty = -0.01
    add(kit.lathe('Platter', [(0, 0.012), (0.15, 0.012), (0.156, 0.006), (0.15, 0.0), (0, 0.0)], seg=40,
                  location=(0, ty, top + 0.004)), m['role']('Platter', 'joint'))
    rz = top + 0.016
    add(kit.lathe('Record', [(0, 0.004), (0.14, 0.004), (0.142, 0.002), (0.14, 0.0), (0, 0.0)], seg=48,
                  location=(0, ty, rz)), m['bezel'], 'disc')
    for r in (0.07, 0.095, 0.12):
        add(kit.torus('Groove', r, 0.0014, seg=(48, 4), location=(0, ty, rz + 0.004)), m['joint'], 'disc')
    add(kit.lathe('Label', [(0, 0.002), (0.045, 0.002), (0.045, 0.0), (0, 0.0)], seg=28,
                  location=(0, ty, rz + 0.004)), m['role']('Label'), 'disc')
    add(box('Mark', (0.013, 0.005, 0.0015), (0.026, ty, rz + 0.0065), 0.4, seg=(8, 4)), m['glow'], 'disc')
    add(kit.tube('Spindle', [(0, ty, rz), (0, ty, rz + 0.022)], 0.005, ring=8)[0], m['joint'])
    add(ball('SpindleCap', 0.008, (0, ty, rz + 0.024), seg=(10, 8)), m['dot'](5))
    # The tonearm: a post at the back right, a brass arm over to the record, and its head.
    px, py, pz = 0.15, 0.115, top + 0.05
    add(kit.tube('Post', [(px, py, top), (px, py, pz)], 0.013, ring=10)[0], m['joint'])
    add(kit.torus('PostRing', 0.018, 0.005, seg=(16, 6), location=(px, py, top + 0.008)), m['role']('Brass', 'joint'))
    add(ball('Pivot', 0.019, (px, py, pz), seg=(12, 8)), m['role']('Brass', 'joint'), 'tonearm')
    hx, hy, hz = 0.055, -0.07, rz + 0.026
    add(kit.tube('Arm', kit.spline([(px, py, pz), (0.11, 0.03, pz + 0.008), (hx + 0.008, hy + 0.02, hz + 0.006)], 12),
                 0.0065, ring=8)[0], m['role']('Brass', 'joint'), 'tonearm')
    add(box('Head', (0.016, 0.022, 0.011), (hx, hy, hz), 0.4, seg=(10, 6)), m['bezel'], 'tonearm')
    add(kit.tube('Stylus', [(hx, hy - 0.012, hz - 0.008), (hx, hy - 0.012, rz + 0.005)], 0.0025, ring=5)[0],
        m['joint'], 'tonearm')
    add(ball('HeadLamp', 0.005, (hx, hy - 0.022, hz + 0.004), seg=(8, 6)), m['dot'](5), 'tonearm')
    add(ball('Weight', 0.017, (px + 0.03, py + 0.04, pz - 0.002), seg=(12, 8)), m['role']('Brass', 'joint'), 'tonearm')
    # The crank on its right (the viewer's left): a shaft, an arm, a knob.
    cx, cy, cz = -w, -0.03, zc + 0.01
    add(kit.tube('Shaft', [(cx, cy, cz), (cx - 0.04, cy, cz)], 0.007, ring=8)[0], m['joint'], 'crank')
    add(box('CrankArm', (0.006, 0.008, 0.035), (cx - 0.042, cy, cz - 0.028), 0.4, seg=(8, 6)), m['role']('Brass', 'joint'),
        'crank')
    add(kit.tube('CrankKnob', [(cx - 0.044, cy, cz - 0.056), (cx - 0.075, cy, cz - 0.056)], 0.009, ring=8)[0],
        m['role']('Case'), 'crank')
    add(kit.torus('Boss', 0.016, 0.005, seg=(14, 6), location=(cx - 0.002, cy, cz), rotation=FACING['left']), m['joint'])
    # The horn: a neck up out of the back, then the flare, facing out over the front and up.
    n0, n1, n2 = (-0.11, 0.12, top), (-0.12, 0.12, top + 0.13), (-0.07, 0.05, top + 0.29)
    neck, ts = kit.tube('Neck', kit.spline([n0, (-0.13, 0.13, top + 0.07), n1, (-0.1, 0.09, top + 0.22), n2], 18),
                        [0.02 + 0.012 * i / 17 for i in range(18)], ring=12)
    add(neck, m['role']('Brass', 'joint'), kit.chain(ts, ['neck0', 'neck1']))
    add(kit.torus('Collar', 0.024, 0.006, seg=(16, 6), location=(n0[0], n0[1], n0[2] + 0.012)), m['joint'])
    tip = 55 * PI / 180  # the horn's axis, from straight up toward the front
    axis = Vector((0, -math.sin(tip), math.cos(tip)))
    length, mouth, throat = 0.33, 0.2, 0.032

    def flare(z):
        return throat + (mouth - throat) * (z / length) ** 2.3

    zs = [length * k / 14 for k in range(15)]
    outer = [(flare(z), z) for z in reversed(zs)]
    inner = [(flare(z) - 0.004, z + 0.002) for z in zs]
    turn = (tip, 0, 0)
    add(kit.lathe('Horn', outer, seg=40, location=n2, rotation=turn), m['role']('Horn'), 'horn')
    add(kit.lathe('HornIn', inner, seg=40, location=n2, rotation=turn), m['role']('HornIn', 'bezel'), 'horn')
    rim = Vector(n2) + axis * length
    add(kit.torus('Rim', mouth, 0.007, seg=(48, 6), location=tuple(rim), rotation=turn), m['dot'](6), 'horn')
    # Petal seams down the flare, from the throat to the rim.
    rot = Matrix.Rotation(tip, 3, 'X')
    for k in range(8):
        a = 2 * PI * (k + 0.5) / 8
        pts = [tuple(Vector(n2) + rot @ Vector(((flare(z) + 0.003) * math.cos(a), (flare(z) + 0.003) * math.sin(a), z)))
               for z in zs[2:]]
        add(kit.tube('Seam', pts, 0.0032, ring=5)[0], m['role']('Seam', 'joint'), 'horn')
    return [('disc', (0, ty, rz), (0, ty, rz + 0.05), 'root'),
            ('tonearm', (px, py, pz), (hx, hy, pz), 'root'),
            ('crank', (cx, cy, cz), (cx - 0.06, cy, cz), 'root'),
            ('neck0', n0, n1, 'root'), ('neck1', n1, n2, 'neck0'),
            ('horn', n2, tuple(rim), 'neck1'),
            *eye_bones((0, fy - 0.008, zc + 0.012), 0.05, 0.03, 'root')]


# ---------- The library's rug ----------

LIBRUG_HX, LIBRUG_HY = 0.8, 1.2  # 2:3, deep: the whole rug picture (3:2) lies on its top once, turned so its long side runs front to back
LIBRUG_R = 0.07  # corner radius
LIBRUG_PROFILE = [(0.012, 0.0), (0.0, 0.007), (0.0, 0.018), (0.008, 0.026), (0.022, 0.029)]  # (inset, z)


def rounded_rect(hx, hy, r, n=7):
    """A rounded rectangle's outline, counter-clockwise from the middle of its right side:
    4 * (n + 1) points."""
    pts = []
    for cx, cy, a0 in ((hx - r, hy - r, 0.0), (-hx + r, hy - r, PI / 2), (-hx + r, -hy + r, PI),
                       (hx - r, -hy + r, 3 * PI / 2)):
        for k in range(n + 1):
            a = a0 + PI / 2 * k / n
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def facing_up(obj):
    """Flip an open mesh's faces if they came out facing down."""
    if obj.data.polygons[0].normal.z < 0:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()


def librug(m, add):
    """The library's rug: a low, soft slab with a bound edge, 3:2, lying flat under the book's
    stand. Its top is one flat sheet (Pile) whose UVs run 0..1 across it, so the rug's picture
    (models/tex/rug.webp, a whole rug, not a tile) lies on it once, edge to edge; the
    edge (Binding) is a plain role. It has no bones: it keeps still."""
    n = 7
    rings = [rounded_rect(LIBRUG_HX - i, LIBRUG_HY - i, max(LIBRUG_R - i, 0.012), n) for i, _ in LIBRUG_PROFILE]
    verts = [(x, y, z) for ring_, (_, z) in zip(rings, LIBRUG_PROFILE) for x, y in ring_]
    count = len(rings[0])
    faces = [(k * count + i, k * count + (i + 1) % count, (k + 1) * count + (i + 1) % count, (k + 1) * count + i)
             for k in range(len(rings) - 1) for i in range(count)]
    edge = kit.mesh_object('Binding', verts, faces)
    facing_up(edge)
    add(edge, m['role']('Binding', 'joint'))
    inset, top = LIBRUG_PROFILE[-1]
    hx, hy = LIBRUG_HX - inset, LIBRUG_HY - inset
    ring_ = rounded_rect(hx, hy, max(LIBRUG_R - inset, 0.012), n)
    sheet = kit.mesh_object('Pile', [(x, y, top) for x, y in ring_] + [(0.0, 0.0, top)],
                            [(i, (i + 1) % count, count) for i in range(count)])
    facing_up(sheet)
    uv = sheet.data.uv_layers.new(name='UVMap')
    for loop in sheet.data.loops:
        x, y, _ = sheet.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((y + hy) / (2 * hy), 1 - (x + hx) / (2 * hx))
    add(sheet, m['role']('Pile'))


KINDS = {
    'fern': dict(build=fern, height=0.85, width=0.75),
    'sunflower': dict(build=sunflower, height=1.52, width=0.5),
    'lamp': dict(build=lamp, height=1.4, width=0.42),
    'armchair': dict(build=armchair, height=0.85, width=0.72),
    'bookshelf': dict(build=bookshelf, height=1.46, width=0.85),
    'rug': dict(build=rug, height=0.03, width=1.4),
    'stool': dict(build=stool, height=0.55, width=0.62),
    'radio': dict(build=radio, height=0.62, width=0.62),
    'fireplace': dict(build=fireplace, height=1.07, width=1.25),
    'bookcase': dict(build=readcase, height=READ_H + 0.08, width=READ_W * 2 + 0.06),
    'libcase': dict(build=lambda m, add: bookcase(m, add, twin=True), height=TWIN_H + 0.08, width=TWIN_W * 2 + 0.06),
    'cattree': dict(build=cattree, height=1.36, width=0.92),
    'kennel': dict(build=kennel, height=0.97, width=1.3),
    'birdbath': dict(build=birdbath, height=0.9, width=0.62),
    'perch': dict(build=perch, height=1.3, width=0.85),
    'gramophone': dict(build=gramophone, height=0.9, width=0.6),
    'librug': dict(build=librug, height=0.03, width=1.6),
}
