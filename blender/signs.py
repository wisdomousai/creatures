"""Signs the crew hold up: each a robot's sign, a board in a bumper with a bolt in each
corner, and on its front a paper face (Board) the page paints with what it says. Three of them, one for each way of holding one up:

- placard: a wide board Bolt holds over his head in both hands, by two grips under its
  bottom edge.
- picket: a board on a rod, with a collar where it's held (in a cat's mouth).
- hanger: a board hung from a bar on two short rods, the bar in a bird's talons.

and six more for a concierge's other ways of offering a place to go:

- arrow: a fingerpost's arrow board on a short pole, pointing +X (mirror it for the other
  way); the Board face fills its body, not the point. Grip: the pole, at the collar.
- paddle: a round sign on a short handle, like an auction paddle. Grip: the handle's middle.
- easel: an A-frame sandwich board that stands on the floor by itself, for creatures that
  can't hold anything. Origin: the floor under its middle (the Board on the front panel).
- banner: a long, low board between two poles held by two creatures. Grip: the LEFT pole's
  lower part (the origin); the RIGHT pole is the same 0.9 m along +X (x = 0.9, y = 0,
  z = 0), or one creature holds both far apart.
- card: a small card on a short stand-off handle, for small creatures; about half the
  picket's size. Grip: the handle's middle.
- tag: a board on a lanyard that hangs round a creature's neck. Origin: the top of the
  lanyard loop (the back of the neck); the board hangs 0.4 m below, in front of the chest.

Each is built about its grip, at the origin (where the hands, the mouth or the talons
are), and faces front (-Y). The Board face has UVs over its whole front, 0..1 left to
right and bottom to top, for the lettering. Exported as tool-placard, tool-picket
and tool-hanger, tool-arrow, ... (blender/build.sh tool-placard ...), each on one bone, root.
"""

import math

import kit
import looks
from decor import slab
from set import bolt, box

PI = math.pi
FACE = 'bolt'

# Each sign's board: half its width and height, and how high its middle is over the grip
# (metres; negative hangs below). The board's thickness, its bumper, and the face's inset.
SIGNS = {
    'placard': dict(hw=0.42, hh=0.2, mid=0.24),
    'picket': dict(hw=0.3, hh=0.15, mid=0.42),
    'hanger': dict(hw=0.27, hh=0.14, mid=-0.24),
    # The other six are built by the functions below; these are their sizes.
    'arrow': dict(hh=0.1, flare=0.165, x0=-0.26, x1=0.2, tip=0.44, mid=0.3),
    'paddle': dict(r=0.19, mid=0.34),
    'easel': dict(hw=0.22, hh=0.22, lean=0.2),
    'banner': dict(span=0.9, hw=0.4, hh=0.13, mid=0.34),
    'card': dict(hw=0.15, hh=0.08, mid=0.2, thick=0.014, bumper=0.012, inset=0.02),
    'tag': dict(hw=0.15, hh=0.105, clip=-0.25),
}
# How far each of the new ones hangs below its origin, so a preview can stand it on the floor.
PREVIEWS = {
    'arrow': dict(lift=0.16, width=0.7), 'paddle': dict(lift=0.17, width=0.45), 'easel': dict(lift=0.0, width=0.5),
    'banner': dict(lift=0.17, width=1.0), 'card': dict(lift=0.08, width=0.35), 'tag': dict(lift=0.58, width=0.35),
}
THICK = 0.022
BUMPER = 0.022
INSET = 0.03
K = 8
PREVIEW = dict(lift=0.0, width=1.2)


def rounded(hw, hh, r, y, mid, cx=0.0):
    """A rounded rectangle about (0, mid) in the XZ plane at depth y: 4 * (K + 1) points,
    counter-clockwise from the bottom right."""
    centres = ((cx + hw - r, mid - hh + r), (cx + hw - r, mid + hh - r), (cx - hw + r, mid + hh - r),
               (cx - hw + r, mid - hh + r))
    pts = []
    for c, (cx, cz) in enumerate(centres):
        a0 = -PI / 2 + c * PI / 2
        for i in range(K + 1):
            a = a0 + (PI / 2) * i / K
            pts.append((cx + r * math.cos(a), y, cz + r * math.sin(a)))
    return pts


def face(hw, hh, mid, cx=0.0, t=None, y0=0.0):
    """The paper face on the board's front: a flat rounded rectangle, fanned from its
    middle, with UVs over it."""
    r = min(hw, hh) * 0.28
    y = y0 - (THICK if t is None else t) - 0.002
    verts = rounded(hw, hh, r, y, mid, cx) + [(cx, y, mid)]
    n = len(verts) - 1
    faces = [(p, (p + 1) % n, n) for p in range(n)]
    obj = kit.mesh_object('Board', verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    kit.planar_uv(obj)
    return obj


def disc_face(r, mid, n=32):
    """A round paper face, fanned from its middle, with UVs over its bounding square."""
    y = -THICK - 0.002
    verts = [(r * math.cos(2 * PI * k / n), y, mid + r * math.sin(2 * PI * k / n)) for k in range(n)] + [(0.0, y, mid)]
    obj = kit.mesh_object('Board', verts, [(k, (k + 1) % n, n) for k in range(n)])
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    kit.planar_uv(obj)
    return obj


# ---------- The other six ----------


def inflate(outline, d):
    """A polygon (counter-clockwise, (x, z) points) grown outward by d, corners mitred."""
    n = len(outline)
    out = []
    for i in range(n):
        p0, p1, p2 = outline[i - 1], outline[i], outline[(i + 1) % n]
        normals = []
        for a, b in ((p0, p1), (p1, p2)):
            dx, dz = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(dx, dz)
            normals.append((dz / ln, -dx / ln))
        (ax, az), (bx, bz) = normals
        k = d / (1 + ax * bx + az * bz)
        out.append((p1[0] + (ax + bx) * k, p1[1] + (az + bz) * k))
    return out


def grip(add, m, shell, z0, z1, r, x=0.0, y=0.0, n=5):
    """A ridged sleeve on a vertical rod, from z0 to z1."""
    add(kit.tube('Grip', [(x, y, z0), (x, y, z1)], r, ring=12)[0], shell)
    for k in range(n):
        z = z0 + 0.012 + (z1 - z0 - 0.024) * k / max(n - 1, 1)
        add(kit.torus('Ridge', r + 0.0005, 0.0026, seg=(14, 4), location=(x, y, z)), m['joint'])


def arrow(m, add, paper, shell, s):
    """A fingerpost's arrow on a short pole, pointing +X: the board's body is the paper
    face, the head the point. The pole stands behind the board, its collar and ridged
    grip at the origin, a light (Dot0) on its tip."""
    mid, hh, fl, x0, x1, tip = s['mid'], s['hh'], s['flare'], s['x0'], s['x1'], s['tip']
    yb = -0.014 - THICK
    outline = [(x0, mid - hh), (x1, mid - hh), (x1, mid - fl), (tip, mid), (x1, mid + fl), (x1, mid + hh),
               (x0, mid + hh)]
    cx = (x0 + x1) / 2
    for obj, mat in ((slab('SignBoard', outline, THICK * 2, at=(0, yb, 0), centre=(cx, mid)), shell),
                     (slab('SignBumper', inflate(outline, BUMPER), THICK * 1.4, at=(0, yb + 0.004, 0), centre=(cx, mid)),
                      m['joint'])):
        obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))  # flat: a fan from the middle
        add(obj, mat)
    add(face((x1 - x0) / 2 - INSET, hh - INSET, mid, cx, y0=yb), paper)
    for sx in (x0 + INSET * 0.45, x1 - INSET * 0.45):
        for sz in (-1, 1):
            bolt(add, m, (sx, yb - THICK - 0.001, mid + sz * (hh - INSET * 0.45)), 0.012, 'front')
    top = mid + hh + BUMPER
    add(kit.tube('Pole', [(0, 0, -0.12), (0, 0, top + 0.03)], 0.014, ring=12)[0], m['joint'])
    grip(add, m, shell, -0.08, 0.08, 0.02)
    add(kit.torus('Collar', 0.024, 0.0085, seg=(16, 6), location=(0, 0, 0.09)), m['joint'])
    add(kit.superellipsoid('PoleFoot', (0.026, 0.026, 0.026), seg=(14, 10), location=(0, 0, -0.125)), shell)
    for sz in (-1, 1):  # clamps holding the board to the pole
        add(box('Clamp', (0.03, 0.021, 0.026), (0, 0.0, mid + sz * 0.06), 0.3, seg=(12, 8)), m['joint'])
    add(kit.superellipsoid('PoleTip', (0.026, 0.026, 0.026), seg=(16, 12), location=(0, 0, top + 0.055)), m['dot'](0))


def paddle(m, add, paper, shell, s):
    """A round sign on a short handle, like an auction paddle: a disc in a bumper ring with
    four bolts, the handle ridged, a light (Dot0) at its top. Held by the handle's middle."""
    r, mid = s['r'], s['mid']
    c = 0.016
    prof = [(0, THICK), (r - c, THICK), (r - c * 0.3, THICK - c * 0.3), (r, THICK - c), (r, -THICK + c),
            (r - c * 0.3, -THICK + c * 0.3), (r - c, -THICK), (0, -THICK)]
    add(kit.lathe('SignBoard', prof, seg=40, location=(0, 0, mid), rotation=(PI / 2, 0, 0)), shell)
    add(kit.torus('SignBumper', r + 0.002, BUMPER * 0.6, seg=(40, 6), location=(0, 0.002, mid),
                  rotation=(PI / 2, 0, 0)), m['joint'])
    add(disc_face(r - INSET, mid), paper)
    for k in range(4):
        a = PI / 4 + k * PI / 2
        bolt(add, m, ((r - INSET * 0.45) * math.cos(a), -THICK - 0.001, mid + (r - INSET * 0.45) * math.sin(a)), 0.012,
             'front')
    add(kit.tube('Neck', [(0, 0, 0.1), (0, 0, mid - r + 0.03)], 0.02, ring=12)[0], shell)
    grip(add, m, shell, -0.12, 0.14, 0.022, n=6)
    add(kit.torus('Collar', 0.03, 0.009, seg=(18, 6), location=(0, 0, 0.145)), m['joint'])
    add(kit.superellipsoid('Cap', (0.032, 0.032, 0.032), seg=(14, 10), location=(0, 0, -0.125)), m['joint'])
    add(kit.superellipsoid('Light', (0.011, 0.006, 0.011), 0.6, 0.6, seg=(10, 8), location=(0, -0.0235, 0.0)),
        m['dot'](0))


def easel(m, add, paper, shell, s):
    """An A-frame sandwich board standing on its own: two boards leaning against each other
    from a hinge bar at the top, a stay on each side, rubber feet. The Board is on the front
    panel. Origin: the floor under the middle."""
    hw, hh, a = s['hw'], s['hh'], s['lean']
    sn, cs = math.sin(a), math.cos(a)
    H = 2 * (hh + BUMPER) * cs + 0.03

    def centre(sign):  # sign -1: the front panel (y < 0), +1: the back
        return (0.0, sign * (0.012 + (hh + BUMPER) * sn), H - (hh + BUMPER) * cs)

    for sign in (-1, 1):
        c = centre(sign)
        rot = (sign * a, 0, 0)
        add(box('SignBoard', (hw, THICK, hh), c, 0.12, seg=(28, 12), rotation=rot), shell)
        add(box('SignBumper', (hw + BUMPER, THICK * 0.7, hh + BUMPER), (c[0], c[1] + 0.0, c[2]), 0.14, seg=(28, 12),
                rotation=rot), m['joint'])
        # A rubber foot under the bottom edge.
        by = c[1] + sign * (hh + BUMPER) * sn
        add(box('Foot', (hw * 0.8, 0.034, 0.016), (0, by, 0.016), 0.4, seg=(12, 8)), m['joint'])
    # The face and bolts on the front panel: built flat, then leaned with it.
    c = centre(-1)
    th = -a

    def lean(y, z):  # a point on the front panel, as (y, z) in its own frame, in the world
        return (y * math.cos(th) - z * math.sin(th) + c[1], y * math.sin(th) + z * math.cos(th) + c[2])

    f = face(hw - INSET, hh - INSET, 0.0)
    f.rotation_euler = (th, 0, 0)
    f.location = c
    kit.apply_transforms(f)
    add(f, paper)
    for sx in (-1, 1):
        for sz in (-1, 1):
            y, z = lean(-THICK - 0.001, sz * (hh - INSET * 0.45))
            add(kit.lathe('Bolt', [(0, 0.0048), (0.0108, 0.0048), (0.012, 0), (0, -0.0012)], seg=6,
                          location=(sx * (hw - INSET * 0.45), y, z), rotation=(PI / 2 + th, 0, 0)), m['joint'])
    # The hinge bar over the top, with a cap at each end, a light (Dot0) in its middle.
    add(kit.tube('Hinge', [(-hw - 0.01, 0, H + 0.004), (hw + 0.01, 0, H + 0.004)], 0.016, ring=12)[0], m['joint'])
    for sx in (-1, 1):
        add(kit.superellipsoid('HingeCap', (0.02, 0.022, 0.022), seg=(10, 8), location=(sx * (hw + 0.012), 0, H + 0.004)),
            shell)
    add(box('Lamp', (0.03, 0.02, 0.02), (0, 0, H + 0.024), 0.6, seg=(12, 8)), m['dot'](0))
    # A stay on each side, from panel to panel, with a ball at each end.
    zs = 0.2
    yf = -(H - zs) * math.tan(a) - 0.012 + THICK
    for sx in (-1, 1):
        x = sx * (hw - 0.02)
        add(kit.tube('Stay', [(x, yf, zs), (x, -yf, zs)], 0.0075, ring=8)[0], m['joint'])
        for sy in (-1, 1):
            add(kit.superellipsoid('StayBall', (0.012, 0.012, 0.012), seg=(8, 6), location=(x, sy * yf, zs)), m['joint'])


def banner(m, add, paper, shell, s):
    """A long, low board between two poles for two creatures to hold up. The left pole is at
    the origin (x = 0), the right pole at x = 0.9; each has a ridged grip at its lower part
    and a light (Dot0) on its top, and two clamps to the board."""
    span, hw, hh, mid = s['span'], s['hw'], s['hh'], s['mid']
    cx = span / 2
    add(box('SignBoard', (hw, THICK, hh), (cx, 0, mid), 0.12, seg=(28, 10)), shell)
    add(box('SignBumper', (hw + BUMPER, THICK * 0.7, hh + BUMPER), (cx, 0.004, mid), 0.14, seg=(28, 10)), m['joint'])
    add(face(hw - INSET, hh - INSET, mid, cx), paper)
    for sx in (-1, 1):
        for sz in (-1, 1):
            at = (cx + sx * (hw - INSET * 0.45), -THICK - 0.001, mid + sz * (hh - INSET * 0.45))
            bolt(add, m, at, 0.012, 'front')
    top = mid + hh + BUMPER + 0.05
    for x in (0.0, span):
        add(kit.tube('Pole', [(x, 0, -0.14), (x, 0, top)], 0.014, ring=12)[0], m['joint'])
        grip(add, m, shell, -0.08, 0.08, 0.02, x=x, n=4)
        add(kit.superellipsoid('PoleFoot', (0.024, 0.024, 0.024), seg=(12, 8), location=(x, 0, -0.145)), shell)
        add(kit.superellipsoid('PoleTip', (0.026, 0.026, 0.026), seg=(12, 8), location=(x, 0, top + 0.015)), m['dot'](0))
        for sz in (-1, 1):
            add(box('Clamp', (0.032, 0.03, 0.024), (x, 0, mid + sz * 0.065), 0.3, seg=(10, 6)), m['joint'])


def card(m, add, paper, shell, s):
    """A small card on a short stand-off handle, for small creatures: a quarter of the
    picket's area. The handle is a ridged sleeve on a neck up to the card's bottom, a
    light (Dot0) in the cap under it. Held by the sleeve's middle."""
    hw, hh, mid, t, b, ins = s['hw'], s['hh'], s['mid'], s['thick'], s['bumper'], s['inset']
    add(box('SignBoard', (hw, t, hh), (0, 0, mid), 0.12, seg=(24, 10)), shell)
    add(box('SignBumper', (hw + b, t * 0.7, hh + b), (0, 0.003, mid), 0.14, seg=(24, 10)), m['joint'])
    add(face(hw - ins, hh - ins, mid, t=t), paper)
    for sx in (-1, 1):
        for sz in (-1, 1):
            bolt(add, m, (sx * (hw - ins * 0.45), -t - 0.001, mid + sz * (hh - ins * 0.45)), 0.0085, 'front')
    add(kit.tube('Neck', [(0, 0, 0.03), (0, 0, mid - hh + 0.02)], 0.011, ring=10)[0], m['joint'])
    grip(add, m, shell, -0.06, 0.06, 0.017, n=4)
    add(kit.torus('Collar', 0.022, 0.0065, seg=(16, 6), location=(0, 0, 0.065)), m['joint'])
    add(kit.superellipsoid('Cap', (0.022, 0.022, 0.022), seg=(12, 8), location=(0, 0, -0.065)), m['dot'](0))
    add(box('Clamp', (0.02, 0.016, 0.014), (0, 0, mid - hh - b), 0.3, seg=(10, 8)), m['joint'])


def tag(m, add, paper, shell, s):
    """A sign on a lanyard, hung round a creature's neck: a flat strap in a loop (origin at
    the top of it, where it rests on the back of the neck), a clip and ring at the bottom,
    the board hanging from them in front of the chest, 0.4 m below the origin. A light
    (Dot0) on the clip."""
    hw, hh, clip = s['hw'], s['hh'], s['clip']
    mid = clip - 0.03 - hh - BUMPER
    loop = kit.spline([(0, 0, clip), (-0.07, 0, clip + 0.08), (-0.11, 0, clip + 0.19), (-0.08, 0, 0.0),
                       (0, 0, 0.01), (0.08, 0, 0.0), (0.11, 0, clip + 0.19), (0.07, 0, clip + 0.08), (0, 0, clip)], 40)
    strap = kit.tube('Lanyard', loop, 0.012, ring=6)[0]
    kit.stretch(strap, sy=0.35)
    add(strap, shell)
    add(box('Clip', (0.034, 0.016, 0.028), (0, 0, clip - 0.006), 0.3, seg=(12, 8)), m['joint'])
    add(kit.torus('Ring', 0.02, 0.005, seg=(16, 5), location=(0, 0, clip - 0.034), rotation=(PI / 2, 0, 0)), m['joint'])
    add(kit.superellipsoid('Light', (0.01, 0.006, 0.01), 0.6, 0.6, seg=(10, 8), location=(0, -0.0165, clip - 0.004)),
        m['dot'](0))
    add(box('SignBoard', (hw, THICK, hh), (0, 0, mid), 0.12, seg=(28, 12)), shell)
    add(box('SignBumper', (hw + BUMPER, THICK * 0.7, hh + BUMPER), (0, 0.004, mid), 0.14, seg=(28, 12)), m['joint'])
    add(face(hw - INSET, hh - INSET, mid), paper)
    for sx in (-1, 1):
        for sz in (-1, 1):
            bolt(add, m, (sx * (hw - INSET * 0.45), -THICK - 0.001, mid + sz * (hh - INSET * 0.45)), 0.012, 'front')


MORE = {'arrow': arrow, 'paddle': paddle, 'easel': easel, 'banner': banner, 'card': card, 'tag': tag}


def build_sign(kind, look='ink', flame=None):
    s = SIGNS[kind]
    m = looks.materials(look, flame, palette='monitor')
    paper = kit.material('Board', '#f4f4f1', roughness=0.7)
    shell = m['role']('Sign')
    parts, skin = [], []

    def add(obj, mat, bone='root'):
        if mat is not None:
            kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    if kind in MORE:
        MORE[kind](m, add, paper, shell, s)
        rig = kit.armature('SignRig', [('root', (0, 0, 0), (0, 0, 0.2), None)])
        return looks.finish(rig, parts, skin, m)
    hw, hh, mid = s['hw'], s['hh'], s['mid']

    # The board, in its bumper, and its face.
    add(box('SignBoard', (hw, THICK, hh), (0, 0, mid), 0.12, seg=(32, 16)), shell)
    add(box('SignBumper', (hw + BUMPER, THICK * 0.7, hh + BUMPER), (0, 0.004, mid), 0.14, seg=(32, 16)), m['joint'])
    add(face(hw - INSET, hh - INSET, mid), paper)
    # A bolt in each corner of the front, and of the back.
    for sx in (-1, 1):
        for sz in (-1, 1):
            at = (sx * (hw - INSET * 0.45), -THICK - 0.001, mid + sz * (hh - INSET * 0.45))
            bolt(add, m, at, 0.012, 'front')
            bolt(add, m, (at[0], THICK + 0.001, at[2]), 0.012, 'back')

    bottom = mid - hh - BUMPER
    top = mid + hh + BUMPER
    if kind == 'placard':
        # Two grips under the bottom edge, where his mitts go.
        for sx in (-1, 1):
            x = sx * hw * 0.55
            add(kit.tube('Grip', [(x, 0, 0.0), (x, 0, bottom + 0.01)], 0.022, ring=12)[0], m['joint'])
            add(box('GripFoot', (0.045, 0.03, 0.018), (x, 0, 0.0), 0.4, seg=(12, 8)), m['joint'])
    elif kind == 'picket':
        # The rod, up from below the grip into the board, a collar where it's held, and a
        # little light on its tip over the board.
        add(kit.tube('Rod', [(0, 0, -0.06), (0, 0, top + 0.03)], 0.014, ring=12)[0], m['joint'])
        add(kit.torus('Collar', 0.022, 0.009, seg=(16, 6), location=(0, 0, 0.0)), m['joint'])
        add(kit.superellipsoid('RodTip', (0.026, 0.026, 0.026), seg=(16, 12), location=(0, 0, top + 0.05)),
            m['dot'](0))
    else:
        # The bar he holds, two rods down from it to eyelets on the board's top.
        add(kit.tube('Bar', [(-hw * 0.7, 0, 0), (hw * 0.7, 0, 0)], 0.016, ring=12)[0], m['joint'])
        for sx in (-1, 1):
            x = sx * hw * 0.6
            add(kit.superellipsoid('BarCap', (0.024, 0.024, 0.024), seg=(12, 8), location=(sx * hw * 0.7, 0, 0)),
                m['joint'])
            add(kit.tube('Hang', [(x, 0, 0), (x, 0, top - 0.005)], 0.007, ring=8)[0], m['joint'])
            add(kit.torus('Eyelet', 0.018, 0.006, seg=(14, 6), location=(x, 0, top), rotation=(PI / 2, 0, 0)),
                m['joint'])

    rig = kit.armature('SignRig', [('root', (0, 0, 0), (0, 0, 0.2), None)])
    return looks.finish(rig, parts, skin, m)


KINDS = tuple(SIGNS)


class Kind:
    def __init__(self, name):
        self.name = name
        self.PREVIEW = PREVIEWS.get(name, PREVIEW)
        self.FACE = FACE

    def build(self, look='ink', flame=None):
        return build_sign(self.name, look, flame)


def kind(name):
    return Kind(name)
