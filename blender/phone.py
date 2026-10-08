"""The phone: what the site's pages play on when the site is on a phone (the monitor on a
bigger screen), held up in the middle of the box by Bolt. A robot's phone: a cream slab
in a grey bumper, a thin even bezel round a tall glass, a bolt in each corner of the front,
a camera eye in the top bezel, a stubby antenna on its top edge whose tip is its status
light, two buttons on one side and one on the other, a speaker slot under the glass, and on
its back a hatch screwed on, with vent slots.

Like the monitor, the glass has no set size: the site sizes it to the room every frame,
by four corner bones (BL, BR, TL, TR) at the glass's corners, each part going with the
corner whose quarter it is in (a nine-slice). It has no seat, feet or knobs. Its dots: 0 the
antenna's tip (it flickers while a page comes up), 1 the camera's lens.

Stands at the origin, facing -Y, the bottom of its case RISE up (where Bolt's hands are as
built; the site moves it). The glass is its own part (Glass), drawn as a hole the page
shows through. Exported as phone (blender/build.sh phone).
"""

import math

import kit
import looks
from decor import ball
from set import bolt, box

PI = math.pi

FACE = 'bolt'  # no face screen; the materials need some face
# The glass as built (the site moves the corners): half its width, and its bottom and top.
HW = 0.36
RISE = 0.5  # the floor to the case's bottom, as built
CHIN = 0.08  # the bezel under the glass
ZB = RISE + CHIN
ZT = ZB + 1.5
BEZEL = 0.06  # the bezel at the sides
TOP = 0.1  # and over the glass, where the camera is
RG = 0.07  # the glass's corner radius
FRONT = -0.034  # the bezel's face (the glass just behind it)
GLASS = -0.026
BACK = 0.034
K = 8  # points round each corner
PREVIEW = dict(lift=0.0, width=1.2)

CORNERS = ('BR', 'TR', 'TL', 'BL')


def rounded(side, top, bottom, r, y):
    """A rounded rectangle round the glass, grown by side/top/bottom, corner radius r, at
    depth y: 4 * (K + 1) points, counter-clockwise from the bottom right corner's start."""
    xs = HW + side - r
    centres = ((xs, ZB - bottom + r), (xs, ZT + top - r), (-xs, ZT + top - r), (-xs, ZB - bottom + r))
    pts = []
    for c, (cx, cz) in enumerate(centres):
        a0 = -PI / 2 + c * PI / 2
        for i in range(K + 1):
            a = a0 + (PI / 2) * i / K
            pts.append((cx + r * math.cos(a), y, cz + r * math.sin(a)))
    return pts


def quarter(x, z):
    """The corner whose quarter (of the glass) a point is in."""
    mid = (ZB + ZT) / 2
    return ('T' if z > mid else 'B') + ('L' if x < 0 else 'R')


def corner_weights(obj, fan_centres=()):
    """Each vertex goes with the corner of its quarter; a fan's middle with all four."""
    n = len(obj.data.vertices)
    w = {c: [0.0] * n for c in CORNERS}
    placed = obj.matrix_basis
    for i, v in enumerate(obj.data.vertices):
        co = placed @ v.co
        if any(abs(co.x - fx) < 1e-6 and abs(co.z - fz) < 1e-6 for fx, fz in fan_centres):
            for c in CORNERS:
                w[c][i] = 0.25
        else:
            w[quarter(co.x, co.z)][i] = 1.0
    return w


def case(glass_mat, shell, bumper):
    """The slab: rings from the glass's edge out over the bezel, round its rounded sides (a
    bumper, in its own colour) and in over the back, closed by the glass in front and a plate
    behind; one mesh."""
    s, t, c = BEZEL, TOP, CHIN
    ro = RG + s
    # (side, top, bottom, corner radius, depth): the glass's lip, the bezel's face, the
    # rounded edge (a bumper) and the back.
    rings = [
        (0, 0, 0, RG, GLASS),
        (0.004, 0.004, 0.004, RG + 0.004, FRONT + 0.002),
        (0.008, 0.008, 0.008, RG + 0.008, FRONT),
        (s - 0.014, t - 0.014, c - 0.014, ro - 0.014, FRONT),
        (s - 0.004, t - 0.004, c - 0.004, ro - 0.004, FRONT + 0.006),
        (s, t, c, ro, -0.014),
        (s, t, c, ro, 0.014),
        (s - 0.004, t - 0.004, c - 0.004, ro - 0.004, BACK - 0.006),
        (s - 0.016, t - 0.016, c - 0.016, ro - 0.016, BACK),
    ]
    n = 4 * (K + 1)
    verts, faces = [], []
    for ring in rings:
        verts += rounded(*ring)
    for r in range(len(rings) - 1):
        for p in range(n):
            q = (p + 1) % n
            faces.append((r * n + p, r * n + q, (r + 1) * n + q, (r + 1) * n + p))
    mid = (ZB + ZT) / 2
    front = len(verts)
    verts.append((0.0, GLASS, mid))
    glass_faces = [(p, front, (p + 1) % n) for p in range(n)]
    back = len(verts)
    verts.append((0.0, BACK, mid))
    last = (len(rings) - 1) * n
    faces += [(last + (p + 1) % n, back, last + p) for p in range(n)]
    obj = kit.mesh_object('Phone', verts, faces + glass_faces)
    kit.assign(obj, shell)
    obj.data.materials.append(glass_mat)
    obj.data.materials.append(bumper)
    edge = range(4 * n, 7 * n)  # the faces round the sides, from the bezel's edge to the back's
    for i, poly in enumerate(obj.data.polygons):
        ys = [obj.data.vertices[v].co.y for v in poly.vertices]
        if all(abs(y - GLASS) < 1e-6 for y in ys):
            poly.material_index = 1
            poly.use_smooth = False
        elif i in edge:
            poly.material_index = 2
    return obj, [(0.0, mid)]


def build(look='ink', flame=None):
    m = looks.materials(look, flame, palette='monitor')
    glass = kit.material('Glass', '#0b0b0b', roughness=0.25)
    shell = m['role']('Phone')
    parts, skin = [], []

    def add(obj, mat, bone='root'):
        if mat is not None:
            kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def corner(obj, mat, fans=()):
        """A part that stretches with the glass, each vertex on its quarter's corner."""
        if mat is not None:
            kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, corner_weights(obj, fans)))
        return obj

    def on(bone, obj, mat):
        """A small part that keeps its shape, on one corner."""
        return add(obj, mat, bone)

    def across(row, obj, mat):
        """A small part in the middle of the top (row 'T') or the bottom ('B'): halfway
        between that edge's two corners, wherever they go."""
        kit.assign(obj, mat)
        n = len(obj.data.vertices)
        w = {c: [0.5 if c[0] == row else 0.0] * n for c in CORNERS}
        parts.append(obj)
        skin.append((obj, w))
        return obj

    body, fans = case(glass, shell, m['joint'])
    corner(body, None, fans)

    # A bolt in each corner of the front, on the diagonal out from the glass's corner.
    d = RG / math.sqrt(2) + BEZEL * 0.62
    for name in CORNERS:
        sx = -1 if name[1] == 'L' else 1
        cx = sx * (HW - RG)
        if name[0] == 'T':
            cz, sz = ZT - RG, 1
        else:
            cz, sz = ZB + RG, -1
        bolt(add, m, (cx + sx * d, FRONT - 0.001, cz + sz * d), 0.017, 'front', name)

    # The camera's eye in the middle of the top bezel: a dark pill with the lens in it.
    cz = ZT + TOP * 0.5
    across('T', box('CamPill', (0.05, 0.004, 0.019), (0, FRONT - 0.002, cz), 0.5, seg=(16, 8)), m['bezel'])
    across('T', ball('Lens', 0.012, (0.02, FRONT - 0.006, cz), seg=(12, 8)), m['dot'](1))

    # The antenna: a stubby rod up from the top edge near the left, its tip the status light.
    ax = -HW + 0.12
    top = ZT + TOP
    on('TL', kit.tube('Antenna', [(ax, 0, top - 0.01), (ax, 0, top + 0.16)], 0.012, ring=10)[0], m['joint'])
    on('TL', kit.torus('AntennaCollar', 0.022, 0.008, seg=(16, 6), location=(ax, 0, top + 0.004)), m['joint'])
    on('TL', ball('AntennaTip', 0.03, (ax, 0, top + 0.18), seg=(16, 12)), m['dot'](0))

    # Buttons on the sides: two on the right near the top, one on the left.
    for z, name in ((ZT - 0.28, 'TR'), (ZT - 0.46, 'TR')):
        on(name, box('Button', (0.008, 0.012, 0.055), (HW + BEZEL + 0.004, 0, z), 0.4, seg=(10, 8)), m['joint'])
    on('TL', box('Button', (0.008, 0.012, 0.08), (-(HW + BEZEL + 0.004), 0, ZT - 0.36), 0.4, seg=(10, 8)), m['joint'])

    # A speaker slot in the bezel under the glass.
    zs = ZB - CHIN * 0.5
    across('B', box('Speaker', (0.06, 0.003, 0.007), (0, FRONT - 0.001, zs), 0.6, seg=(16, 6)), m['bezel'])

    # The back: a hatch screwed on, with vent slots near its top.
    hw, hb, ht = HW - 0.06, ZB + 0.12, ZT - 0.12
    corner(box('Hatch', (hw, 0.006, (ht - hb) / 2), (0, BACK + 0.002, (hb + ht) / 2), 0.12, seg=(24, 12)), m['joint'])
    for name in CORNERS:
        x = (hw - 0.04) * (-1 if name[1] == 'L' else 1)
        z = ht - 0.04 if name[0] == 'T' else hb + 0.04
        bolt(add, m, (x, BACK + 0.008, z), 0.013, 'back', name)
    for i in range(4):
        across('T', box('Vent', (0.13, 0.004, 0.008), (0, BACK + 0.008, ht - 0.12 - i * 0.04), 0.6, seg=(12, 6)), m['bezel'])

    bones = [('root', (0, 0, 0), (0, 0, 0.3), None)]
    for name in CORNERS:
        x = -HW if name[1] == 'L' else HW
        z = ZT if name[0] == 'T' else ZB
        bones.append((name, (x, 0, z), (x, -0.2, z), 'root'))
    rig = kit.armature('PhoneRig', bones)
    return looks.finish(rig, parts, skin, m)
