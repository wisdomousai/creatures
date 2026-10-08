"""Signs the crew hold up: each a robot's sign, a board in a bumper with a bolt in each
corner, and on its front a paper face (Board) the page paints with what it says. Three of them, one for each way of holding one up:

- placard: a wide board Bolt holds over his head in both hands, by two grips under its
  bottom edge.
- picket: a board on a rod, with a collar where it's held (in a cat's mouth).
- hanger: a board hung from a bar on two short rods, the bar in a bird's talons.

Each is built about its grip, at the origin (where the hands, the mouth or the talons
are), and faces front (-Y). The Board face has UVs over its whole front, 0..1 left to
right and bottom to top, for the lettering. Exported as tool-placard, tool-picket
and tool-hanger (blender/build.sh tool-placard ...), each on one bone, root.
"""

import math

import kit
import looks
from set import bolt, box

PI = math.pi
FACE = 'bolt'

# Each sign's board: half its width and height, and how high its middle is over the grip
# (metres; negative hangs below). The board's thickness, its bumper, and the face's inset.
SIGNS = {
    'placard': dict(hw=0.42, hh=0.2, mid=0.24),
    'picket': dict(hw=0.3, hh=0.15, mid=0.42),
    'hanger': dict(hw=0.27, hh=0.14, mid=-0.24),
}
THICK = 0.022
BUMPER = 0.022
INSET = 0.03
K = 8
PREVIEW = dict(lift=0.0, width=1.2)


def rounded(hw, hh, r, y, mid):
    """A rounded rectangle about (0, mid) in the XZ plane at depth y: 4 * (K + 1) points,
    counter-clockwise from the bottom right."""
    centres = ((hw - r, mid - hh + r), (hw - r, mid + hh - r), (-hw + r, mid + hh - r), (-hw + r, mid - hh + r))
    pts = []
    for c, (cx, cz) in enumerate(centres):
        a0 = -PI / 2 + c * PI / 2
        for i in range(K + 1):
            a = a0 + (PI / 2) * i / K
            pts.append((cx + r * math.cos(a), y, cz + r * math.sin(a)))
    return pts


def face(hw, hh, mid):
    """The paper face on the board's front: a flat rounded rectangle, fanned from its
    middle, with UVs over it."""
    r = min(hw, hh) * 0.28
    y = -THICK - 0.002
    verts = rounded(hw, hh, r, y, mid) + [(0.0, y, mid)]
    n = len(verts) - 1
    faces = [(p, (p + 1) % n, n) for p in range(n)]
    obj = kit.mesh_object('Board', verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    kit.planar_uv(obj)
    return obj


def build_sign(kind, look='ink', flame=None):
    s = SIGNS[kind]
    hw, hh, mid = s['hw'], s['hh'], s['mid']
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
        self.PREVIEW = PREVIEW
        self.FACE = FACE

    def build(self, look='ink', flame=None):
        return build_sign(self.name, look, flame)


def kind(name):
    return Kind(name)
