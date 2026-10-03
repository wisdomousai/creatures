"""The monitor: an old computer screen sitting on something in the middle of the box, that
the site's pages play on. A thick rounded case round a sunk glass, bolted at its corners,
a chin under the glass with a speaker grille at one end and two knobs and a power light at
the other, and a little camera in the top of the case.

The glass has no set size: the site sizes it to the room every frame. Everything round it
hangs on four corner bones (BL, BR, TL, TR) at the glass's corners, and each part goes with
the corner whose quarter it is in, so moving the bones apart stretches the straight runs of
the case and leaves its corners, bolts and knobs as they are (a nine-slice).

Its case and what it sits on suit the room it's in: each room has its own (on materials of
its own; the site shows one room's and hides the rest). In the white box a plain case on a
plinth; in the office pale oak with a thin steel lip round the glass, on a cabinet; in the
library walnut with a gilt moulding and brass corners, on a turned column; in the lab
gunmetal steel with rivets, on a steel post; in the jungle a case framed in bamboo poles
lashed at the corners, a vine over one, on a cut tree trunk. A trim along a side keeps its
place along it as the glass stretches (frame_weights). A seat stands on two bones on the
floor (footL, footR) and reaches up to the chin's corners (BL, BR): across, it scales with
the glass, and as the site raises the case, the middle of it stretches while its foot stays
on the floor and its top under the chin.

Stands on the floor at the origin, facing -Y. The glass is its own part (Glass), which the
site draws as a hole the page shows through. Exported as monitor (blender/build.sh
monitor).
"""

import math

from mathutils import Vector

import kit
import looks
from decor import ball
from set import FACING, bolt, box

PI = math.pi

FACE = 'bolt'  # no face screen; the materials need some face
# The glass as built (the site moves the corners): half its width, and its bottom and top.
HW = 0.9
RISE = 0.34  # the floor to the chin's bottom, as built: the lowest it sits (the site raises it)
CHIN = 0.26  # the case under the glass
ZB = RISE + CHIN
ZT = ZB + 1.1
BEZEL = 0.12  # the case round the glass, at the sides and the top
RG = 0.04  # the glass's corner radius
FRONT = -0.10  # the case's front face (the glass is sunk behind it)
GLASS = -0.07
BACK = 0.14
K = 8  # points round each corner
PREVIEW = dict(lift=0.0, width=2.3)

CORNERS = ('BR', 'TR', 'TL', 'BL')


def rounded(side, top, bottom, r, y):
    """A rounded rectangle round the glass, grown by side/top/bottom, corner radius r, at
    depth y: 4 * (K + 1) points, counter-clockwise from the bottom right corner's start, the
    same count and order for every size so that two of them join into a ring of quads."""
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


def case(glass_mat, shell, with_glass=True):
    """The case: rings from the glass's edge out over the front, round the sides and in over
    the back, closed by the glass in front and a plate behind; one mesh, so its faces all
    point out. Returns it with the glass's faces on the second material (without_glass, open
    in front: another room's case, round the one glass)."""
    b, c = BEZEL, CHIN
    ro = RG + b
    rings = [
        (0, 0, 0, RG, GLASS),
        (0.006, 0.006, 0.006, RG + 0.006, -0.086),
        (0.015, 0.015, 0.015, RG + 0.015, -0.097),
        (0.026, 0.026, 0.026, RG + 0.026, FRONT),
        (b - 0.03, b - 0.03, c - 0.03, ro - 0.03, FRONT),
        (b - 0.012, b - 0.012, c - 0.012, ro - 0.012, -0.094),
        (b - 0.003, b - 0.003, c - 0.003, ro - 0.003, -0.082),
        (b, b, c, ro, -0.066),
        (b, b, c, ro, BACK - 0.03),
        (b - 0.012, b - 0.012, c - 0.012, ro - 0.012, BACK - 0.008),
        (b - 0.05, b - 0.05, c - 0.05, ro - 0.05, BACK),
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
    glass_faces = []
    if with_glass:
        front = len(verts)
        verts.append((0.0, GLASS, mid))
        glass_faces = [(p, front, (p + 1) % n) for p in range(n)]
    back = len(verts)
    verts.append((0.0, BACK, mid))
    last = (len(rings) - 1) * n
    faces += [(last + (p + 1) % n, back, last + p) for p in range(n)]
    obj = kit.mesh_object('Case', verts, faces + glass_faces)
    kit.assign(obj, shell)
    if not with_glass:
        return obj, []
    obj.data.materials.append(glass_mat)
    # The glass's faces are the ones round its middle vertex, at the glass's depth.
    for poly in obj.data.polygons:
        ys = [obj.data.vertices[v].co.y for v in poly.vertices]
        if all(abs(y - GLASS) < 1e-6 for y in ys):
            poly.material_index = 1
    # The glass is flat: no smoothing into the bevel round it.
    for poly in obj.data.polygons:
        if poly.material_index == 1:
            poly.use_smooth = False
    return obj, [(0.0, mid)]


def build(look='ink', flame=None):
    m = looks.materials(look, flame, palette='monitor')
    glass = kit.material('Glass', '#0b0b0b', roughness=0.25)
    parts, skin = [], []

    def add(obj, mat, bone='root'):
        if mat is not None:
            kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def seat_part(obj, mat, span=(0.0, RISE), rigid=False):
        """A part of a seat: up to span[0] it stays on the floor, from span[1] it goes with
        the chin, and between it stretches; rigid, it moves as a whole with its middle."""
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, seat_weights(obj, span, rigid)))
        return obj

    def corner(obj, mat, fans=()):
        """A part that stretches with the glass, each vertex on its quarter's corner."""
        if mat is not None:
            kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, corner_weights(obj, fans)))
        return obj

    def frame_part(obj, mat, rigid=False):
        """A room's trim on the case: it keeps its place along the side it's on."""
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, frame_weights(obj, rigid)))
        return obj

    # The case and its glass, and every room's own case round the same glass, and its trim.
    for role, own_glass in (('Case', True), ('Oak', False), ('Walnut', False), ('Steel', False), ('Bamboo', False)):
        body, fans = case(glass, m['role'](role), own_glass)
        corner(body, None, fans)
    for trim in (oak, walnut, steel, bamboo):
        trim(m, corner, frame_part)

    # Bolts in the four corners of the front: between the glass and the case's edge.
    at = RG + 0.052  # out from the corner arcs' centre, on the diagonal
    d = at / math.sqrt(2)
    for sx, name in ((1, 'TR'), (-1, 'TL')):
        cx, cz = sx * (HW - RG), ZT - RG
        bolt(add, m, (cx + sx * d, FRONT - 0.002, cz + d), 0.013, 'front', name)
    for sx, name in ((1, 'BR'), (-1, 'BL')):
        bolt(add, m, (sx * (HW + 0.03), FRONT - 0.002, ZB - CHIN + 0.08), 0.013, 'front', name)

    # The chin: a speaker grille at the left end, two knobs and the power light at the right.
    zc = ZB - CHIN / 2 - 0.01
    gx = -HW + 0.06
    add(box('GrilleWell', (0.2, 0.012, 0.075), (gx + 0.2, FRONT + 0.004, zc), 0.35, seg=(24, 10)), m['bezel'], 'BL')
    for k in range(5):
        add(box('Slot', (0.18, 0.008, 0.0075), (gx + 0.2, FRONT - 0.006, zc - 0.056 + k * 0.028), 0.45, seg=(14, 6)),
            m['joint'], 'BL')
    add(ball('Light', 0.022, (HW - 0.05, FRONT - 0.006, zc), seg=(14, 10)), m['dot'](0), 'BR')
    add(kit.torus('LightRim', 0.028, 0.006, seg=(20, 6), location=(HW - 0.05, FRONT - 0.004, zc),
                  rotation=FACING['front']), m['joint'], 'BR')
    for x, bone in ((HW - 0.2, 'knobB'), (HW - 0.38, 'knobA')):
        add(kit.torus('KnobSkirt', 0.062, 0.006, seg=(24, 6), location=(x, FRONT - 0.002, zc), rotation=FACING['front']),
            m['joint'], 'BR')
        add(kit.lathe('Knob', [(0, 0.042), (0.05, 0.04), (0.056, 0.016), (0.052, 0.0), (0, 0.0)], seg=28,
                      location=(x, FRONT, zc), rotation=FACING['front']), m['role']('Knob', 'joint'), bone)
        for k in range(14):  # knurls round the knob's edge
            t = 2 * PI * k / 14
            add(box('Knurl', (0.005, 0.014, 0.005), (x + 0.054 * math.cos(t), FRONT - 0.02, zc + 0.054 * math.sin(t)),
                    0.3, seg=(4, 4), rotation=(0, -t, 0)), m['role']('Knob', 'joint'), bone)
        add(box('Pointer', (0.006, 0.006, 0.02), (x, FRONT - 0.044, zc + 0.024), 0.4, seg=(8, 6)), m['glow'], bone)

    # A little camera in the middle of the top of the case.
    cz = ZT + BEZEL * 0.5
    for part, mat in ((kit.torus('CamRim', 0.024, 0.006, seg=(18, 6), location=(0, FRONT - 0.003, cz),
                                 rotation=FACING['front']), m['joint']),
                      (ball('Lens', 0.016, (0, FRONT - 0.004, cz), seg=(12, 8)), m['dot'](1))):
        n = len(part.data.vertices)
        add(part, mat, {'TL': [0.5] * n, 'TR': [0.5] * n})

    # What it sits on: every room's seat, each on materials of its own (the site shows one).
    for build_seat in (plinth, cabinet, post, column, trunk):
        build_seat(m, seat_part)

    bones = [('root', (0, 0, 0), (0, 0, 0.3), None)]
    for name in CORNERS:
        x = -HW if name[1] == 'L' else HW
        z = ZT if name[0] == 'T' else ZB
        bones.append((name, (x, 0, z), (x, -0.2, z), 'root'))
    bones += [('knobA', (HW - 0.38, FRONT, zc), (HW - 0.38, FRONT - 0.1, zc), 'BR'),
              ('knobB', (HW - 0.2, FRONT, zc), (HW - 0.2, FRONT - 0.1, zc), 'BR')]
    bones += [(foot, (sx * HW, 0, 0), (sx * HW, -0.2, 0), 'root') for sx, foot in ((-1, 'footL'), (1, 'footR'))]
    rig = kit.armature('MonitorRig', bones)
    return looks.finish(rig, parts, skin, m)


def seat_weights(obj, span, rigid):
    """A seat's part: across, it scales with the glass (each vertex shared between the left
    and right bones by how far out it is); up, it goes from the feet (on the floor) to the
    chin's bottom corners by where it is in the span. Rigid, every vertex takes its
    middle's weights, so it keeps its shape."""
    n = len(obj.data.vertices)
    w = {b: [0.0] * n for b in ('footL', 'footR', 'BL', 'BR')}
    placed = obj.matrix_basis
    cos = [placed @ v.co for v in obj.data.vertices]
    if rigid:
        mid = sum(cos, cos[0] * 0) / n
        cos = [mid] * n
    lo, hi = span
    for i, co in enumerate(cos):
        right = min(max((1 + co.x / HW) / 2, 0.0), 1.0)
        up = min(max((co.z - lo) / (hi - lo), 0.0), 1.0)
        w['footL'][i] = (1 - up) * (1 - right)
        w['footR'][i] = (1 - up) * right
        w['BL'][i] = up * (1 - right)
        w['BR'][i] = up * right
    return w


MID = 0.02  # the case's middle front to back: the seats stand under it


def plinth(m, part):
    """The white box's: a slim plain plinth with a cap and a foot (no panel on its front: it
    would read as a second screen)."""
    body, trim = m['role']('Plinth'), m['role']('PlinthTrim', 'joint')
    lo, hi = 0.055, RISE - 0.045
    part(box('Plinth', (0.26, 0.17, RISE / 2), (0, MID, RISE / 2), 0.1, seg=(28, 14)), body, (lo, hi))
    part(box('PlinthCap', (0.3, 0.2, 0.022), (0, MID, RISE - 0.022), 0.3, seg=(28, 8)), trim, (lo, hi))
    part(box('PlinthFoot', (0.31, 0.2, 0.026), (0, MID, 0.026), 0.3, seg=(28, 8)), trim, (lo, hi))


def cabinet(m, part):
    """The office's: a low cabinet, two doors and a knob on each, on a kick."""
    body, door = m['role']('Cabinet'), m['role']('CabinetDoor', 'joint')
    lo, hi = 0.06, RISE - 0.045
    half = (hi - lo) / 2
    part(box('Cabinet', (0.6, 0.21, half), (0, MID, lo + half), 0.08, seg=(28, 14)), body, (lo, hi))
    part(box('CabinetTop', (0.64, 0.235, 0.0225), (0, MID, RISE - 0.0225), 0.25, seg=(28, 8)), body, (lo, hi))
    part(box('CabinetKick', (0.56, 0.19, 0.03), (0, MID + 0.01, 0.03), 0.2, seg=(24, 8)), door, (lo, hi))
    for sx in (-1, 1):
        part(box('CabinetDoor', (0.27, 0.008, half - 0.025), (sx * 0.295, MID - 0.212, lo + half), 0.15, seg=(20, 12)),
             door, (lo, hi))
        part(ball('CabinetKnob', 0.018, (sx * 0.06, MID - 0.232, hi - 0.06), seg=(12, 8)), body, (lo, hi), rigid=True)


def post(m, part):
    """The lab's: a square steel post on a bolted foot plate, a top plate under the chin,
    and a cable down its back to the floor."""
    steel, bits = m['role']('Post'), m['role']('PostSteel', 'joint')
    lo, hi = 0.03, RISE - 0.03
    part(box('PostFoot', (0.34, 0.2, 0.015), (0, MID, 0.015), 0.2, seg=(24, 8)), steel, (lo, hi))
    part(box('PostTop', (0.36, 0.2, 0.015), (0, MID, RISE - 0.015), 0.2, seg=(24, 8)), steel, (lo, hi))
    part(box('Post', (0.11, 0.1, RISE / 2), (0, MID, RISE / 2), 0.15, seg=(20, 14)), steel, (lo, hi))
    for sx in (-1, 1):
        for sy in (-1, 1):
            at = (sx * 0.28, MID + sy * 0.14, 0.03)
            part(kit.lathe('PostBolt', [(0, 0.008), (0.018, 0.008), (0.02, 0.0), (0, -0.002)], seg=6, location=at),
                 bits, (lo, hi), rigid=True)
    cable = kit.tube('PostCable', kit.spline([(0.06, MID + 0.11, hi - 0.02), (0.07, MID + 0.12, RISE * 0.5),
                                              (0.1, MID + 0.12, 0.06), (0.2, MID + 0.08, 0.012),
                                              (0.42, MID + 0.02, 0.01)], 24), 0.012, ring=8)[0]
    part(cable, bits, (lo, hi))


def column(m, part):
    """The library's: a turned wooden column, a moulded foot and a round top."""
    wood, ring = m['role']('Column'), m['role']('ColumnRing', 'joint')
    lo, hi = 0.08, RISE - 0.06
    part(kit.lathe('ColumnFoot', [(0, lo), (0.17, lo), (0.2, lo - 0.015), (0.24, lo - 0.035), (0.27, lo - 0.05),
                                  (0.27, 0.0), (0, 0.0)], seg=40, location=(0, MID, 0)), wood, (lo, hi))
    part(kit.lathe('Column', [(0, hi), (0.13, hi), (0.125, hi - 0.03), (0.135, (lo + hi) / 2), (0.15, lo + 0.02),
                              (0.15, lo), (0, lo)], seg=40, location=(0, MID, 0)), wood, (lo, hi))
    part(kit.lathe('ColumnTop', [(0, RISE), (0.28, RISE), (0.28, RISE - 0.018), (0.22, RISE - 0.03),
                                 (0.16, RISE - 0.05), (0.14, hi), (0, hi)], seg=40, location=(0, MID, 0)), wood, (lo, hi))
    # A ring at each end of the shaft: the foot's stays down, the top's goes up with the chin.
    for z, r, span in ((lo + 0.01, 0.152, (lo + 0.02, hi)), (hi - 0.012, 0.132, (lo, hi - 0.02))):
        part(kit.torus('ColumnRing', r, 0.008, seg=(40, 6), location=(0, MID, z)), ring, span)


def trunk(m, part):
    """The jungle's: a cut tree trunk, its bark in deep grooves, its roots spread on the
    floor, growth rings on its top, and two bracket fungi up its side."""
    bark, ring, moss = m['role']('Trunk'), m['role']('TrunkRing', 'joint'), m['role']('TrunkMoss', 'joint')
    lo, hi = 0.1, RISE
    n = 72
    zs = [0.0, 0.008, 0.02, 0.036, 0.056, 0.08, 0.1] + [0.1 + (RISE - 0.1) * k / 8 for k in range(1, 9)]
    verts, faces = [], []
    for z in zs:
        flare = math.exp(-z / 0.035)
        for i in range(n):
            a = 2 * PI * i / n
            groove = abs(math.sin(9 * a + 0.9 * math.sin(2 * a + 0.4))) ** 0.4
            roots = 0.9 * max(0.0, math.cos(4 * a + 0.5)) ** 4 + 0.12
            r = 1 + 0.11 * groove - 0.07
            # The roots spread out sideways more than front and back (it stands among the crew).
            rx, ry = r * (1 + roots * flare), r * (1 + 0.4 * roots * flare)
            verts.append((0.32 * rx * math.cos(a), MID + 0.22 * ry * math.sin(a), z))
    for k in range(len(zs) - 1):
        for i in range(n):
            j = (i + 1) % n
            faces.append((k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i))
    top = len(verts)
    verts.append((0.0, MID, RISE))
    last = (len(zs) - 1) * n
    faces += [(last + i, last + (i + 1) % n, top) for i in range(n)]
    part(kit.mesh_object('Trunk', verts, faces), bark, (lo, hi))
    # Growth rings on the cut, a little over it.
    for r in (0.07, 0.14, 0.21, 0.27):
        rings = kit.torus('TrunkRing', r, 0.006, seg=(40, 4), location=(0, MID, RISE + 0.002))
        rings.scale = (1, 0.84, 0.4)
        part(rings, ring, (lo, hi))
    # Bracket fungi up the left side, and moss between two roots.
    for x, z, s in ((-0.31, RISE * 0.62, 1.0), (-0.3, RISE * 0.46, 0.75)):
        part(kit.superellipsoid('TrunkFungus', (0.075 * s, 0.06 * s, 0.014 * s), 0.6, 0.8, seg=(16, 8),
                                location=(x - 0.03 * s, MID - 0.08, z)), moss, (lo, hi), rigid=True)
    for x, y in ((0.24, -0.16), (-0.13, -0.21)):
        part(kit.superellipsoid('TrunkMoss', (0.07, 0.05, 0.02), 0.7, 0.9, seg=(14, 8), location=(x, MID + y, 0.012)),
             moss, (lo, hi), rigid=True)


# ---------- Every room's case ----------


def frame_weights(obj, rigid):
    """Each vertex between the four corners by where it is over the glass (bilinear, and
    past the glass's edges all with the nearest side), so a trim along a side keeps its place
    along it as the glass stretches; rigid, every vertex takes its middle's (a rivet, a leaf
    keeps its shape)."""
    n = len(obj.data.vertices)
    w = {c: [0.0] * n for c in CORNERS}
    placed = obj.matrix_basis
    cos = [placed @ v.co for v in obj.data.vertices]
    if rigid:
        mid = sum(cos, cos[0] * 0) / n
        cos = [mid] * n
    for i, co in enumerate(cos):
        right = min(max((1 + co.x / HW) / 2, 0.0), 1.0)
        up = min(max((co.z - ZB) / (ZT - ZB), 0.0), 1.0)
        w['BL'][i] = (1 - right) * (1 - up)
        w['BR'][i] = right * (1 - up)
        w['TL'][i] = (1 - right) * up
        w['TR'][i] = right * up
    return w


def loop(name, path, r, ring=8):
    """A tube round a closed path in the case's front (a rounded rectangle, rounded())."""
    n = len(path)
    verts, faces = [], []
    across = Vector((0, 1, 0))
    for i, p in enumerate(path):
        t = (Vector(path[(i + 1) % n]) - Vector(path[i - 1])).normalized()
        out = t.cross(across).normalized()
        for k in range(ring):
            a = 2 * PI * k / ring
            verts.append(tuple(Vector(p) + out * (r * math.cos(a)) + across * (r * math.sin(a))))
    for i in range(n):
        j = (i + 1) % n
        for k in range(ring):
            q = (k + 1) % ring
            faces.append((i * ring + k, i * ring + q, j * ring + q, j * ring + k))
    return kit.mesh_object(name, verts, faces)


def oak(m, corner, part):
    """The office's: pale oak, and a thin dark steel lip round the glass like the windows'."""
    lip = m['role']('OakLip', 'joint')
    corner(loop('OakLip', rounded(0.027, 0.027, 0.027, RG + 0.027, FRONT - 0.002), 0.008), lip)


def walnut(m, corner, part):
    """The library's: walnut, with a gilt moulding round the glass and a gilt bead round its
    edge, like the painting's frame on the wall."""
    gilt = m['role']('Gilt', 'joint')
    corner(loop('Gilt', rounded(0.027, 0.027, 0.027, RG + 0.027, FRONT - 0.003), 0.011, ring=10), gilt)
    corner(loop('Gilt', rounded(BEZEL - 0.022, BEZEL - 0.022, CHIN - 0.022, RG + BEZEL - 0.022, FRONT - 0.002),
                0.007), gilt)


def steel(m, corner, part):
    """The lab's: gunmetal steel, a row of rivets down the middle of every side."""
    rivet = m['role']('Rivet', 'joint')

    def dot(x, z):
        part(kit.superellipsoid('Rivet', (0.014, 0.008, 0.014), 1.0, 1.0, seg=(10, 6), location=(x, FRONT - 0.002, z)),
             rivet, rigid=True)

    for x in (-0.84, -0.6, -0.36, -0.12, 0.12, 0.36, 0.6, 0.84):  # not on the camera in the middle
        dot(x, ZT + BEZEL * 0.5)
        dot(x, ZB - CHIN + 0.028)
    for sx in (-1, 1):
        for k in range(6):
            dot(sx * (HW + BEZEL * 0.5), ZB - CHIN * 0.6 + (ZT - ZB + CHIN * 0.6) * k / 5)


def bamboo(m, corner, part):
    """The jungle's: framed in bamboo poles along its four edges, lashed where they cross,
    with a vine coming over its top left corner and down its side."""
    pole, rope, leaf = m['role']('BambooPole', 'joint'), m['role']('Lashing'), m['role']('Leaf', 'joint')
    r = 0.042
    y = FRONT + 0.012
    top, bottom = ZT + BEZEL - 0.012, ZB - CHIN + 0.012
    left, right = -(HW + BEZEL - 0.012), HW + BEZEL - 0.012
    reach = 0.07  # past the crossings
    for z in (top, bottom):
        part(kit.tube('BambooPole', [(left - reach, y, z), (right + reach, y, z)], r, ring=12)[0], pole)
        for k in range(1, 7):  # its nodes
            x = left + (right - left) * k / 7
            part(kit.torus('BambooNode', r + 0.002, 0.006, seg=(14, 4), location=(x, y, z), rotation=(0, PI / 2, 0)),
                 pole, rigid=True)
    for x in (left, right):
        part(kit.tube('BambooPole', [(x, y - 0.03, bottom - reach), (x, y - 0.03, top + reach)], r, ring=12)[0], pole)
        for k in range(1, 4):
            z = bottom + (top - bottom) * k / 4
            part(kit.torus('BambooNode', r + 0.002, 0.006, seg=(14, 4), location=(x, y - 0.03, z)), pole, rigid=True)
    # Lashed where they cross: two turns crossed over each corner.
    for x in (left, right):
        for z in (top, bottom):
            for turn in (-PI / 4, PI / 4):
                part(kit.torus('Lashing', r + 0.022, 0.007, seg=(16, 4), location=(x, y - 0.015, z),
                               rotation=(0, turn, 0)), rope, rigid=True)
    # The vine: over the top left corner, along the top a little, down the left side.
    path = [(left + 0.5, y - 0.05, top + 0.02), (left + 0.25, y - 0.06, top + 0.05), (left + 0.02, y - 0.07, top - 0.01),
            (left - 0.02, y - 0.08, top - 0.3), (left + 0.02, y - 0.08, top - 0.6)]
    vine = kit.tube('Vine', kit.spline(path, 30), [0.011 - 0.005 * i / 29 for i in range(30)], ring=6)[0]
    part(vine, leaf)
    leaves = [(left + 0.42, top + 0.06, 0.5), (left + 0.2, top + 0.08, -0.4), (left + 0.06, top + 0.02, 0.9),
              (left - 0.04, top - 0.14, 1.4), (left + 0.03, top - 0.32, -1.2), (left - 0.03, top - 0.48, 1.6),
              (left + 0.02, top - 0.6, -0.8)]
    for x, z, turn in leaves:
        part(kit.superellipsoid('Leaf', (0.05, 0.006, 0.026), 0.9, 0.7, seg=(12, 6), location=(x, y - 0.085, z),
                                rotation=(0, turn, 0)), leaf, rigid=True)
