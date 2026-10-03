"""The crew's props, the things they play with and use on the floor of the box: a ball of
wound cable for the cats (yarn), a toy bone for the dogs, a ball, a cushion to sit on, a
crate to hide behind and a little table to go under. Toys, like the crew and the
decorations: rounded, matte, a light or two the site blinks (Dot0, ...), colours of their
own only in the colour look (roles).

Each stands on the floor at the origin (the toys are built round their middle and lifted
by `centre`, which the site rolls them about). Each has one bone, `root`. Exported as prop-NAME
(blender/build.sh prop-yarn).
"""

import math

from mathutils import Matrix, Vector

import kit
import looks
from decor import ball, remember, slab, star


class Kind:
    """One prop, with the interface crew.module() gives the exporter and sheets."""

    FACE = 'bolt'  # no screen; the materials need some face

    def __init__(self, name, spec):
        self.name = name
        self.spec = spec
        self.PREVIEW = dict(lift=0.0, width=spec['width'])

    def build(self, look='ink', flame=None):
        m = looks.materials(look, flame, palette=f'prop-{self.name}')
        parts, skin = [], []
        lift = self.spec.get('centre', 0.0)

        def add(obj, mat, bone='root'):
            kit.assign(obj, mat)
            obj.location.z += lift
            parts.append(obj)
            skin.append((obj, bone))
            return obj

        remember(m)
        extra = self.spec['build'](m, add) or []
        top = self.spec['height']
        bones = [('root', (0, 0, lift), (0, 0, lift + top * 0.5), None)] + extra
        rig = kit.armature(f'{self.name.capitalize()}Prop', bones)
        return looks.finish(rig, parts, skin, m)


def kind(name):
    return Kind(name, KINDS[name])


# ---------- Little parts the toys share ----------


def bolt(name, r, at, rot=(0, 0, 0), height=0.004):
    """A hex bolt head with a dimple, standing up from `at` along local Z."""
    return kit.lathe(name, [(0, height + 0.0008), (r * 0.5, height + 0.0008), (r * 0.55, height), (r, height * 0.8),
                            (r, 0), (0, -0.0004)], seg=6, location=at, rotation=rot)


def washer(name, r, at, rot=(0, 0, 0)):
    """A flat disc standing up from `at` along local Z."""
    return kit.lathe(name, [(0, 0.0015), (r, 0.0015), (r, 0), (0, -0.0004)], seg=20, location=at, rotation=rot)


def stud(name, r, at):
    """A little domed rivet head."""
    return kit.superellipsoid(name, (r, r, r * 0.6), seg=(8, 5), location=at)


def loop(name, r, z, minor, n=48, x=1.0, y=1.0, ring=6):
    """A ring of tube round Z at height z (a piping, a hoop); x and y stretch it."""
    pts = [(x * r * math.cos(2 * math.pi * k / n), y * r * math.sin(2 * math.pi * k / n), z) for k in range(n + 1)]
    return kit.tube(name, pts, minor, ring=ring)[0]


def turned(v, rot):
    """Vector v turned by an XYZ Euler rotation (Blender's order: X first, then Y, then Z)."""
    return (Matrix.Rotation(rot[2], 3, 'Z') @ Matrix.Rotation(rot[1], 3, 'Y')
            @ Matrix.Rotation(rot[0], 3, 'X') @ Vector(v))


# ---------- The toys ----------


def yarn(m, add):
    """A ball of cable wound round and round: each winding is a two-strand braid with a
    twist, a loose end trails off the back to a plug with a strain relief, a collar and
    two prongs, and a light (Dot0) in the plug."""
    r = 0.068
    add(ball('Core', r * 0.98, (0, 0, 0), seg=(28, 16)), m['role']('Yarn'))
    # Windings, a few ways round; each a pair of strands twisting round one another.
    turns = [(0, 0), (0.9, 0.3), (-0.8, 1.1), (1.4, -0.7), (0.4, 2.0), (-1.3, 2.6)]
    n, twists, e = 72, 9, 0.0026
    for k, (tx, tz) in enumerate(turns):
        rot = (math.pi / 2 + tx, 0, tz)
        for s in (0, 1):
            pts = []
            for i in range(n + 1):
                a = 2 * math.pi * i / n
                w = twists * a + s * math.pi
                rr = r * 0.975 + e * math.cos(w)
                pts.append(turned((rr * math.cos(a), rr * math.sin(a), e * math.sin(w)), rot))
            add(kit.tube(f'Strand{k}{s}', pts, 0.0037, ring=5)[0], m['role']('Yarn'))
    # The loose end, off the back and trailing to the floor, whipped twice, then the plug.
    end = [(0.05, 0.03, -0.035), (0.085, 0.045, -0.058), (0.12, 0.05, -0.066), (0.15, 0.04, -0.066)]
    add(kit.tube('LooseEnd', end, 0.0058, ring=8)[0], m['role']('Yarn'))
    for k, (x, y, z) in enumerate(end[1:3]):
        add(kit.torus(f'Whip{k}', 0.0062, 0.0014, seg=(12, 5), location=(x, y, z), rotation=(0, math.pi / 2 - 0.5, 0)),
            m['joint'])
    px, py, pz = 0.165, 0.04, -0.066
    add(kit.superellipsoid('Plug', (0.017, 0.011, 0.011), 0.4, 0.5, seg=(16, 10), location=(px, py, pz)), m['joint'])
    add(kit.tube('Relief', [(px - 0.024, py, pz), (px - 0.012, py, pz)], [0.0062, 0.0094], ring=8)[0], m['joint'])
    add(kit.torus('Collar', 0.0105, 0.0022, seg=(16, 6), location=(px + 0.004, py, pz), rotation=(0, math.pi / 2, 0)),
        m['role']('Yarn'))
    for dy in (-0.0045, 0.0045):
        add(kit.superellipsoid('Prong', (0.009, 0.0018, 0.0018), 0.5, 0.5, seg=(8, 6),
                               location=(px + 0.022, py + dy, pz)), m['joint'])
    add(ball('PlugLight', 0.004, (px, py - 0.008, pz + 0.004), seg=(10, 6)), m['dot'](0))


def bone(m, add):
    """A toy dog bone in two halves bolted together: a round bar with a double knob at
    each end (each knob rimmed, a bolt head on its end), collars where the bar meets them,
    a seam down the bar, a band round the middle and a light in it (Dot0)."""
    half = 0.1
    add(kit.tube('Bar', [(-half + 0.02, 0, 0), (half - 0.02, 0, 0)], 0.017, ring=16)[0], m['role']('Bone'))
    for sx in (-1, 1):
        for sy in (-1, 1):
            add(ball('Knob', 0.026, (sx * half, 0, sy * 0.019), seg=(24, 14)), m['role']('Bone'))
            # A rim round the knob's equator.
            add(kit.torus('KnobRim', 0.0262, 0.0025, seg=(28, 6), location=(sx * half, 0, sy * 0.019),
                          rotation=(0, math.pi / 2, 0)), m['joint'])
        # A bolt head on each end, facing out, on a washer.
        x = sx * (half + 0.025)
        add(washer('Washer', 0.013, (x, 0, 0), (0, sx * math.pi / 2, 0)), m['joint'])
        add(bolt('Bolt', 0.0085, (x, 0, 0), (0, sx * math.pi / 2, 0)), m['joint'])
        add(kit.torus('Collar', 0.0175, 0.0026, seg=(20, 6), location=(sx * (half - 0.03), 0, 0),
                      rotation=(0, math.pi / 2, 0)), m['joint'])
    # The seam between the halves: a groove line along the top of the bar.
    add(kit.tube('Seam', [(-0.045, 0, 0.0165), (0.045, 0, 0.0165)], 0.0016, ring=5)[0], m['joint'])
    add(kit.torus('Band', 0.018, 0.0045, seg=(28, 8), rotation=(0, math.pi / 2, 0)), m['joint'])
    for sx in (-1, 1):
        add(kit.torus('BandEdge', 0.0178, 0.0015, seg=(24, 5), location=(sx * 0.008, 0, 0),
                      rotation=(0, math.pi / 2, 0)), m['role']('Bone'))
    add(ball('BandLight', 0.0055, (0, -0.02, 0), seg=(12, 8)), m['dot'](0))


def toyball(m, add):
    """A ball in panels: three seams cross at the poles and a light ring (Dot0) round its
    middle, a stud where each seam crosses the ring, and a valve with a cap on top."""
    r = 0.07
    add(ball('Ball', r, (0, 0, 0), seg=(40, 22)), m['role']('Ball'))
    for k in range(3):
        add(kit.torus(f'Seam{k}', r * 0.992, 0.0034, seg=(48, 8), rotation=(math.pi / 2, 0, k * math.pi / 3)),
            m['joint'])
    add(kit.torus('Ring', r * 0.995, 0.006, seg=(48, 8)), m['dot'](0))
    for k in range(6):
        a = k * math.pi / 3
        add(stud('Stud', 0.0085, (math.cos(a) * r * 1.005, math.sin(a) * r * 1.005, 0)), m['joint'])
    # The valve: a stem in a collar with a cap.
    add(kit.lathe('Valve', [(0, r + 0.014), (0.005, r + 0.0135), (0.0055, r + 0.008), (0.0035, r + 0.006),
                            (0.0035, r + 0.001), (0.011, r + 0.002), (0.012, r - 0.004), (0, r - 0.006)], seg=14),
        m['joint'])
    add(kit.torus('ValveRing', 0.012, 0.0025, seg=(20, 6), location=(0, 0, r - 0.001)), m['role']('Ball'))


def cushion(m, add):
    """A round pouf to sit on: plump, buttoned on top (a rimmed button) and drawn in along
    four seams to it, piped and welted, a tassel hanging at each of four corners and a
    little light on its side that glows when someone sits on it (Dot0)."""
    rx, ry, h, e1 = 0.24, 0.2, 0.15, 0.7
    add(kit.superellipsoid('Pouf', (rx, ry, h / 2), e1, 1.0, seg=(48, 20), location=(0, 0, h / 2)),
        m['role']('Cushion'))

    def surface(t):  # the top's height at t of the way out
        return h / 2 + h / 2 * max(0.0, 1 - t ** (2 / e1)) ** (e1 / 2)

    add(loop('Piping', 1.004, h / 2, 0.0075, n=64, x=rx, y=ry, ring=8), m['joint'])
    # Fine welts above and below, where the plump belly rounds away.
    for s, z, rr in (('A', h * 0.22, 0.93), ('B', h * 0.78, 0.93)):
        add(loop(f'Welt{s}', rr, z, 0.0035, n=64, x=rx, y=ry, ring=5), m['joint'])
    add(kit.superellipsoid('Button', (0.02, 0.02, 0.009), 0.6, 1.0, seg=(16, 8), location=(0, 0, h - 0.004)),
        m['joint'])
    add(kit.torus('ButtonRim', 0.02, 0.0028, seg=(20, 6), location=(0, 0, h - 0.007)), m['role']('Cushion'))
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        pts = [(math.cos(a) * rx * t, math.sin(a) * ry * t, surface(t) - 0.002) for t in (0.1, 0.35, 0.6, 0.8)]
        add(kit.tube('Tuft', pts, 0.004, ring=6)[0], m['joint'])
    # A tassel at each corner: a cord from the piping, a bead, a skirt of thread.
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        x0, y0 = rx * math.cos(a), ry * math.sin(a)
        x1, y1 = x0 * 1.09, y0 * 1.09
        add(kit.tube('Cord', [(x0, y0, h / 2), (x1, y1, h / 2 - 0.008), (x1, y1, h / 2 - 0.016)], 0.0028, ring=5)[0],
            m['joint'])
        add(ball('TasselBead', 0.0075, (x1, y1, h / 2 - 0.021), seg=(10, 6)), m['joint'])
        add(kit.lathe('Tassel', [(0.0032, h / 2 - 0.026), (0.009, h / 2 - 0.034), (0.0125, h / 2 - 0.05),
                                 (0.011, h / 2 - 0.056), (0, h / 2 - 0.056)], seg=10, location=(x1, y1, 0)),
            m['joint'])
    add(ball('Light', 0.01, (0, -ry * 1.0, h * 0.5 + 0.018), seg=(12, 8)), m['dot'](0))


def crate(m, add):
    """A crate to hide behind: slats between rounded corner posts, metal caps on the
    corners, a nail through every slat, an L bracket on each corner of the front and back,
    a diagonal brace on each side, a hand hole with a rim in the front and a status light
    (Dot0)."""
    w, d, h = 0.36, 0.24, 0.4
    t = 0.022
    for sx in (-1, 1):
        for sy in (-1, 1):
            add(kit.superellipsoid('Post', (t, t, h / 2), 0.4, 0.4, seg=(12, 8),
                                   location=(sx * (w - t), sy * (d - t), h / 2)), m['role']('Crate'))
            for z in (0.012, h - 0.012):
                add(kit.superellipsoid('Cap', (t * 1.35, t * 1.35, 0.016), 0.4, 0.4, seg=(12, 8),
                                       location=(sx * (w - t), sy * (d - t), z)), m['joint'])
    slats = 4
    gap = 0.012
    sh = (h - gap * (slats + 1)) / slats
    for k in range(slats):
        z = gap + sh / 2 + k * (sh + gap)
        for sy in (-1, 1):
            add(kit.superellipsoid('Slat', (w - t, 0.01, sh / 2), 0.3, 0.3, seg=(16, 8),
                                   location=(0, sy * (d - 0.012), z)), m['role']('Crate'))
        for sx in (-1, 1):
            add(kit.superellipsoid('Slat', (0.01, d - t, sh / 2), 0.3, 0.3, seg=(16, 8),
                                   location=(sx * (w - 0.012), 0, z)), m['role']('Crate'))
        # A nail through each slat into each post, front and back.
        for sx in (-1, 1):
            for sy in (-1, 1):
                add(stud('Nail', 0.0046, (sx * (w - t), sy * (d - 0.001), z)), m['joint'])
    add(kit.superellipsoid('Lid', (w - 0.004, d - 0.004, 0.012), 0.3, 0.3, seg=(24, 8),
                           location=(0, 0, h - 0.01)), m['role']('Crate'))
    add(kit.tube('LidSeam', [(-w + 0.06, -d + 0.03, h + 0.0015), (w - 0.06, -d + 0.03, h + 0.0015)], 0.0022, ring=5)[0],
        m['joint'])
    # L brackets on the four corners of the front and of the back, each with two bolts.
    for sy in (-1, 1):
        for sx in (-1, 1):
            for sz, z0 in ((1, 0.03), (-1, h - 0.03)):
                x0 = sx * (w - 0.004)
                pts = [(x0, z0), (x0 - sx * 0.075, z0), (x0 - sx * 0.075, z0 + sz * 0.02),
                       (x0 - sx * 0.02, z0 + sz * 0.02), (x0 - sx * 0.02, z0 + sz * 0.075), (x0, z0 + sz * 0.075)]
                if sy > 0:  # the back is turned half round: mirror the outline
                    pts = [(-x, z) for x, z in pts]
                obj = slab('Bracket', pts, 0.005, at=(0, sy * (d + 0.003), 0))
                if sy > 0:
                    obj.rotation_euler = (0, 0, math.pi)
                add(obj, m['joint'])
                for bx, bz in ((0.058, 0.01), (0.01, 0.058)):
                    add(stud('BracketBolt', 0.0036, (sx * (w - 0.004 - bx), sy * (d + 0.0055), z0 + sz * bz)),
                        m['role']('Crate'))
    # A diagonal brace across each side.
    ang = math.atan2(h - 0.09, 2 * (d - 0.06))
    for sx in (-1, 1):
        add(kit.superellipsoid('Brace', (0.22, 0.0075, 0.012), 0.4, 0.4, seg=(14, 6),
                               location=(sx * (w + 0.0015), 0, h / 2), rotation=(0, -ang, math.pi / 2)),
            m['joint'])
    # The hand hole, a dark pill on the front's top slat with a rim, and a light beside it.
    add(kit.superellipsoid('HandRim', (0.06, 0.003, 0.0165), 0.5, 0.3, seg=(16, 8),
                           location=(0, -d - 0.0005, h - gap - sh / 2)), m['role']('Crate'))
    add(kit.superellipsoid('HandHole', (0.05, 0.004, 0.012), 0.5, 0.3, seg=(16, 8),
                           location=(0, -d - 0.002, h - gap - sh / 2)), m['joint'])
    add(ball('Light', 0.009, (w * 0.62, -d - 0.004, h - gap - sh / 2), seg=(12, 8)), m['dot'](0))
    # A stencilled arrow (this way up), as a thin plate.
    arrow = [(-0.012, 0.0), (0.012, 0.0), (0.012, 0.04), (0.03, 0.04), (0.0, 0.075), (-0.03, 0.04), (-0.012, 0.04)]
    add(slab('Arrow', [(x, z + 0.07) for x, z in arrow], 0.004, at=(-w * 0.55, -d - 0.004, 0)), m['joint'])


def table(m, add):
    """A little table to go under: a rounded top with a piped edge and a lip under it, on
    four legs with a collar at the top and a ferrule above each ball foot, a rail low
    between the legs on a block at each, a short scalloped skirt with tacks along its
    top, and a lamp on the apron (Dot0)."""
    w, d, h = 0.5, 0.26, 0.62
    top = 0.03
    add(kit.superellipsoid('Top', (w, d, top / 2), 0.25, 0.35, seg=(48, 10), location=(0, 0, h - top / 2)),
        m['role']('Table'))
    # A piped edge (a fat wire round the top's outline) and a lip under it.
    e = 0.35
    edge = []
    for k in range(97):
        a = 2 * math.pi * k / 96
        edge.append((w * 1.003 * kit.spow(math.cos(a), e), d * 1.003 * kit.spow(math.sin(a), e), h - top / 2))
    add(kit.tube('Piping', edge, 0.0055, ring=6)[0], m['joint'])
    add(kit.superellipsoid('Lip', (w * 0.9, d * 0.86, 0.005), 0.25, 0.35, seg=(40, 6), location=(0, 0, h - top - 0.003)),
        m['joint'])
    legs = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w - 0.06), sy * (d - 0.05)
            legs.append((x, y))
            add(kit.tube('Leg', [(x, y, h - top), (x * 1.02, y * 1.02, 0.03)], [0.021, 0.016], ring=12)[0],
                m['joint'])
            add(kit.torus('LegCollar', 0.0225, 0.0032, seg=(16, 6), location=(x, y, h - top - 0.012)),
                m['role']('Table'))
            add(kit.torus('Ferrule', 0.0185, 0.003, seg=(16, 6), location=(x * 1.02, y * 1.02, 0.046)), m['role']('Table'))
            add(ball('Foot', 0.025, (x * 1.02, y * 1.02, 0.02), seg=(14, 8)), m['role']('Table'))
    # The stretcher: a rail joining the legs low down, on a little block at each leg.
    zs = 0.2
    for (x0, y0), (x1, y1) in ((legs[0], legs[1]), (legs[2], legs[3]), (legs[0], legs[2]), (legs[1], legs[3])):
        add(kit.tube('Stretcher', [(x0 * 1.014, y0 * 1.014, zs), (x1 * 1.014, y1 * 1.014, zs)], 0.0085, ring=8)[0],
            m['joint'])
    for x, y in legs:
        add(kit.superellipsoid('Block', (0.0225, 0.0225, 0.02), 0.4, 0.4, seg=(10, 6),
                               location=(x * 1.014, y * 1.014, zs)), m['role']('Table'))
    # The skirt: a band round the top with a scalloped hem, front and back.
    n = 9
    for sy in (-1, 1):
        outline = [(-w * 0.94, h - top), (w * 0.94, h - top)]
        for k in range(n, -1, -1):
            x = -w * 0.94 + 2 * w * 0.94 * k / n
            outline.append((x, h - top - 0.07))
            if k:
                xm = x - w * 0.94 / n
                outline.append((xm, h - top - 0.1))
        add(slab('Skirt', outline, 0.006, at=(0, sy * (d + 0.002), 0), centre=(0, h - top - 0.04)),
            m['role']('Skirt', 'joint'))
        for k in range(n + 1):
            x = -w * 0.94 + 2 * w * 0.94 * k / n
            add(stud('Tack', 0.0042, (x, sy * (d + 0.006), h - top - 0.02)), m['joint'])
    add(kit.superellipsoid('Lamp', (0.022, 0.012, 0.016), 0.5, 0.6, seg=(14, 8),
                           location=(w * 0.6, -d - 0.012, h - top - 0.03)), m['dot'](0))


def balloon(m, add):
    """A round balloon on its knot, the knot tied off with a string in a little bow, a
    curl of ribbon off to the side (on a bone of its own, to trail), and a ring of lights
    round its middle that glow when it's bopped (Dot0)."""
    r, cz = 0.12, 0.16
    add(kit.superellipsoid('Balloon', (r, r, r * 1.12), seg=(40, 22), taper=-0.12, location=(0, 0, cz)),
        m['role']('Balloon'))
    add(kit.lathe('Knot', [(0, 0.03), (0.012, 0.028), (0.016, 0.012), (0.01, 0.0), (0, 0.0)], seg=16), m['role']('Balloon'))
    # The mouth's lip, where the balloon gathers into the knot, and the tie round the neck.
    add(kit.torus('Lip', 0.014, 0.0045, seg=(20, 6), location=(0, 0, 0.03)), m['role']('Balloon'))
    add(kit.torus('Tie', 0.0125, 0.0028, seg=(20, 6), location=(0, 0, 0.012)), m['joint'])
    add(kit.torus('Tie2', 0.0135, 0.0022, seg=(20, 6), location=(0, 0, 0.018)), m['joint'])
    # A little bow tied at the front of the neck: two loops and a bead.
    for sx in (-1, 1):
        add(kit.tube('BowLoop', [(sx * 0.003, -0.0135, 0.015), (sx * 0.012, -0.02, 0.022), (sx * 0.02, -0.02, 0.014),
                                 (sx * 0.011, -0.015, 0.008), (sx * 0.003, -0.0135, 0.015)], 0.0022, ring=5)[0],
            m['joint'])
    add(ball('BowBead', 0.0038, (0, -0.0145, 0.015), seg=(8, 6)), m['joint'])
    add(kit.superellipsoid('Shine', (0.022, 0.006, 0.035), seg=(12, 8), location=(-0.05, -0.108, cz + 0.06),
                           rotation=(0, 0.5, 0)), m['joint'])
    add(kit.superellipsoid('Shine2', (0.007, 0.004, 0.008), seg=(8, 6), location=(-0.075, -0.09, cz + 0.005),
                           rotation=(0, 0.5, 0)), m['joint'])
    for k in range(8):
        a = 2 * math.pi * k / 8
        add(ball('Light', 0.0085, (math.cos(a) * r * 1.0, math.sin(a) * r * 1.0, cz - 0.01), seg=(10, 6)), m['dot'](0))
    curl = [(0.01, 0.0, 0.012), (0.04, -0.01, 0.006), (0.07, 0.0, 0.012), (0.095, 0.012, 0.004), (0.12, 0.0, 0.006)]
    add(kit.tube('Ribbon', curl, 0.004, ring=6)[0], m['joint'], 'ribbon')
    add(ball('RibbonTip', 0.0065, (0.125, 0.0, 0.006), seg=(8, 6)), m['joint'], 'ribbon')
    return [('ribbon', (0.01, 0, 0.012), (0.12, 0, 0.006), 'root')]


def frisbee(m, add):
    """A flying disc: a domed top with a thick rim, three grip ridges on the top, a cap
    with a bezel in the middle, a row of studs round the rim and a ring of light round the
    cap (Dot0)."""
    r = 0.13
    add(kit.superellipsoid('Disc', (r, r, 0.016), 0.35, 1.0, seg=(48, 10), location=(0, 0, 0.018)), m['role']('Disc'))
    add(kit.torus('Rim', r - 0.004, 0.01, seg=(56, 10), location=(0, 0, 0.012)), m['role']('Disc'))

    def surface(u):  # the disc's top at u of the way out
        return 0.018 + 0.016 * max(0.0, 1 - u ** (2 / 0.35)) ** (0.35 / 2)

    for u in (0.82, 0.9, 0.28):
        add(kit.torus('Ridge', r * u, 0.0032, seg=(56, 6), location=(0, 0, surface(u) - 0.0008)), m['joint'])
    add(kit.torus('Ring', r * 0.6, 0.004, seg=(48, 6), location=(0, 0, 0.033)), m['dot'](0))
    add(kit.superellipsoid('Cap', (0.03, 0.03, 0.008), 0.5, 1.0, seg=(20, 8), location=(0, 0, 0.034)), m['joint'])
    add(kit.torus('Bezel', 0.031, 0.0028, seg=(28, 6), location=(0, 0, 0.033)), m['role']('Disc'))
    for k in range(12):
        a = 2 * math.pi * k / 12
        add(stud('Stud', 0.0038, (math.cos(a) * (r - 0.004), math.sin(a) * (r - 0.004), 0.0225)), m['joint'])


def heart(r, n=28):
    """A heart's outline (x, z), point down, about r across."""
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * r / 32, z * r / 32))
    return pts


def block(emblem):
    """A toy block to stack: a rounded cube, a raised tile on each side with an emblem on
    it (a star, a ring or a heart), three rivets on top, a rimmed pad and a light in the
    fourth corner (Dot0)."""

    def build(m, add):
        a = 0.055
        add(kit.superellipsoid('Block', (a, a, a), 0.25, 0.25, seg=(24, 16), location=(0, 0, a)), m['role']('Block'))
        faces = [((0, -a, a), (0, 0, 0)), ((0, a, a), (0, 0, math.pi)),
                 ((a, 0, a), (0, 0, math.pi / 2)), ((-a, 0, a), (0, 0, -math.pi / 2))]
        for at, rot in faces:
            # The tile: a rounded plate, a little proud of the side.
            add(kit.superellipsoid('Tile', (0.041, 0.004, 0.041), 0.3, 0.3, seg=(16, 8), location=at, rotation=rot),
                m['role']('Block'))
            if emblem == 'star':
                obj = star('Emblem', 0.033, (0, 0, 0), thickness=0.006)
            elif emblem == 'ring':
                obj = kit.torus('Emblem', 0.023, 0.006, seg=(28, 8), rotation=(math.pi / 2, 0, 0))
            else:
                obj = slab('Emblem', heart(0.06), 0.006, centre=(0, 0))
            out = turned((0, -1, 0), rot)  # outward from the cube; the emblem stands on the tile
            obj.location = (at[0] + out.x * 0.0046, at[1] + out.y * 0.0046, at[2])
            obj.rotation_euler = rot
            add(obj, m['joint'])
        add(kit.superellipsoid('Top', (0.03, 0.03, 0.004), 0.5, 1.0, seg=(16, 6), location=(0, 0, 2 * a + 0.002)),
            m['joint'])
        add(kit.torus('TopRim', 0.031, 0.0022, seg=(20, 6), location=(0, 0, 2 * a + 0.003)), m['role']('Block'))
        for sx, sy in ((1, 1), (-1, 1), (-1, -1)):
            add(stud('Rivet', 0.0042, (sx * a * 0.74, sy * a * 0.74, 2 * a - 0.0015)), m['joint'])
        add(ball('Light', 0.007, (a * 0.74, -a * 0.74, 2 * a - 0.004), seg=(10, 6)), m['dot'](0))

    return build


def top(m, add):
    """A spinning top: a point in a ferrule, a round belly striped round and studded, a
    crown, a stem with two grip rings and a capped, banded knob to spin it by, and a ring
    of light round its widest (Dot0)."""
    prof = [(0, 0.14), (0.012, 0.14), (0.014, 0.125), (0.01, 0.112), (0.03, 0.105), (0.06, 0.092), (0.072, 0.075),
            (0.07, 0.062), (0.05, 0.04), (0.025, 0.018), (0.008, 0.004), (0, 0.0)]
    add(kit.lathe('Top', prof, seg=40), m['role']('Top'))
    add(kit.torus('Ring', 0.072, 0.005, seg=(48, 6), location=(0, 0, 0.074)), m['dot'](0))
    for z, rr, mn in ((0.088, 0.0645, 0.0042), (0.058, 0.0665, 0.0042), (0.051, 0.058, 0.003), (0.095, 0.0555, 0.003)):
        add(kit.torus('Stripe', rr, mn, seg=(48, 6), location=(0, 0, z)), m['joint'])
    for k in range(10):
        a = 2 * math.pi * (k + 0.5) / 10
        add(stud('Stud', 0.0048, (math.cos(a) * 0.0475, math.sin(a) * 0.0475, 0.1)), m['role']('Top'))
    # The stem: two grip rings, and a cap with a knob on it.
    add(kit.torus('Grip', 0.0155, 0.0032, seg=(20, 6), location=(0, 0, 0.12)), m['joint'])
    add(kit.torus('Grip2', 0.0145, 0.0026, seg=(20, 6), location=(0, 0, 0.128)), m['joint'])
    add(kit.lathe('StemCap', [(0.0, 0.1385), (0.012, 0.137), (0.02, 0.132), (0.02, 0.129), (0.0, 0.129)], seg=20),
        m['joint'])
    add(ball('Knob', 0.014, (0, 0, 0.145), seg=(14, 8)), m['role']('Top'))
    add(kit.torus('KnobBand', 0.0142, 0.0024, seg=(20, 6), location=(0, 0, 0.145)), m['joint'])
    # The tip: a metal ferrule.
    add(kit.lathe('Tip', [(0.0125, 0.02), (0.0105, 0.012), (0.0055, 0.004), (0, -0.0005)], seg=14), m['joint'])


def trampoline(m, add):
    """A little round trampoline: a padded ring in twelve sections (a band round the pad
    between each) on stubby legs with banded feet, zigzag springs round it, target rings on
    the mat, and the mat on a bone of its own to give under a jump; a light on the ring
    (Dot0)."""
    r, z = 0.3, 0.13
    add(kit.torus('Pad', r, 0.022, seg=(64, 12), location=(0, 0, z)), m['role']('Pad'))
    add(kit.superellipsoid('Mat', (r - 0.05, r - 0.05, 0.006), 0.3, 1.0, seg=(48, 6), location=(0, 0, z - 0.008)),
        m['role']('Mat', 'joint'), 'mat')
    add(loop('Target', 0.09, z - 0.0015, 0.0028, n=32, ring=5), m['joint'], 'mat')
    add(loop('Target2', 0.04, z - 0.0015, 0.0024, n=24, ring=5), m['joint'], 'mat')
    for k in range(20):
        a = 2 * math.pi * k / 20
        ca, sa = math.cos(a), math.sin(a)
        # A zigzag spring from the pad's inner edge to the mat's rim.
        pts = []
        for i in range(9):
            t = i / 8
            rr = (r - 0.02) - 0.03 * t
            s = 0.004 * (1 if i % 2 else -1)
            pts.append((ca * rr - sa * s, sa * rr + ca * s, z - 0.006 - 0.002 * t))
        add(kit.tube('Spring', pts, 0.0022, ring=5)[0], m['joint'], 'mat')
    for k in range(12):
        a = 2 * math.pi * k / 12
        add(kit.torus('Band', 0.0225, 0.003, seg=(16, 5), location=(math.cos(a) * r, math.sin(a) * r, z),
                      rotation=(math.pi / 2, 0, a)), m['joint'])
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        x, y = math.cos(a) * r * 0.92, math.sin(a) * r * 0.92
        add(kit.tube('Leg', [(x, y, z - 0.01), (x * 1.08, y * 1.08, 0.03), (x * 1.1, y * 1.1, 0.01)], 0.01, ring=8)[0],
            m['joint'])
        add(kit.torus('LegBand', 0.0115, 0.0025, seg=(12, 5), location=(x * 1.08, y * 1.08, 0.04)), m['role']('Pad'))
        add(ball('Foot', 0.014, (x * 1.1, y * 1.1, 0.012), seg=(10, 6)), m['role']('Pad'))
        add(washer('FootPad', 0.021, (x * 1.1, y * 1.1, 0.0004)), m['joint'])
    add(ball('Light', 0.01, (0, -r - 0.02, z), seg=(12, 8)), m['dot'](0))
    return [('mat', (0, 0, z - 0.008), (0, 0, z + 0.05), 'root')]


def seesaw(m, add):
    """A seesaw: a plank on a rounded stand with a foot plate (the plank on a bone that
    tips), a pivot bolt each side of the stand, a handle with a grip and a seat pad at each
    end, a rubber bumper under each end, and a light at each end (Dot0, Dot1)."""
    zp, half = 0.14, 0.42
    add(slab('Stand', [(-0.07, 0.0), (0.07, 0.0), (0.03, zp - 0.02), (-0.03, zp - 0.02)], 0.1), m['role']('Stand'))
    add(kit.superellipsoid('Foot', (0.1, 0.075, 0.008), 0.3, 0.4, seg=(20, 6), location=(0, 0, 0.007)), m['role']('Stand'))
    add(kit.tube('Axle', [(0, -0.06, zp - 0.015), (0, 0.06, zp - 0.015)], 0.012, ring=10)[0], m['joint'])
    # The pivot: a washer and a hex bolt on each side of the stand.
    for sy in (-1, 1):
        at = (0, sy * 0.052, zp - 0.015)
        rot = (-sy * math.pi / 2, 0, 0)
        add(washer('Washer', 0.02, at, rot), m['role']('Stand'))
        add(bolt('Pivot', 0.0125, (0, sy * 0.0535, zp - 0.015), rot, height=0.006), m['joint'])
    add(kit.superellipsoid('Plank', (half, 0.05, 0.012), 0.3, 0.3, seg=(40, 8), location=(0, 0, zp)),
        m['role']('Plank'), 'plank')
    for sy in (-1, 1):
        add(kit.tube('Edge', [(-half + 0.03, sy * 0.044, zp + 0.0105), (half - 0.03, sy * 0.044, zp + 0.0105)], 0.0025,
                     ring=5)[0], m['joint'], 'plank')
    for sx, i in ((-1, 0), (1, 1)):
        x = sx * (half - 0.08)
        add(kit.superellipsoid('Seat', (0.06, 0.045, 0.01), 0.4, 0.6, seg=(20, 6), location=(x, 0, zp + 0.018)),
            m['role']('Seat', 'joint'), 'plank')
        hx = x - sx * 0.09
        add(kit.tube('Handle', [(hx, -0.035, zp + 0.01), (hx, -0.035, zp + 0.06), (hx, 0.035, zp + 0.06),
                                (hx, 0.035, zp + 0.01)], 0.006, ring=8)[0], m['joint'], 'plank')
        # A grip on the bar, and a plate where each post meets the plank.
        add(kit.tube('Grip', [(hx, -0.022, zp + 0.06), (hx, 0.022, zp + 0.06)], 0.0092, ring=10)[0],
            m['role']('Seat', 'joint'), 'plank')
        for sy in (-1, 1):
            add(kit.superellipsoid('Plate', (0.012, 0.012, 0.003), 0.4, 0.4, seg=(10, 5),
                                   location=(hx, sy * 0.035, zp + 0.0125)), m['role']('Plank'), 'plank')
        add(kit.superellipsoid('Bumper', (0.028, 0.032, 0.012), 0.5, 0.5, seg=(14, 8),
                               location=(sx * (half - 0.03), 0, zp - 0.02)), m['joint'], 'plank')
        add(ball('Light', 0.01, (sx * (half + 0.004), 0, zp), seg=(12, 8)), m['dot'](i), 'plank')
    return [('plank', (0, 0, zp), (0, 0, zp + 0.1), 'root')]


def drum(m, add):
    """A toy drum: a round shell with a hoop top and bottom, ten tension lugs on each and
    laces zigzagging between them, a bead round the shell's waist, and the skin on a bone of
    its own to give when it's hit, with a ring at its edge; the skin's middle lights (Dot0)."""
    r, h = 0.1, 0.11
    add(kit.lathe('Shell', [(0, h - 0.004), (r - 0.004, h - 0.004), (r, h - 0.01), (r, 0.01), (r - 0.004, 0.0), (0, 0.0)],
                  seg=40), m['role']('Drum'))
    for z in (0.008, h - 0.006):
        add(kit.torus('Rim', r + 0.002, 0.007, seg=(48, 8), location=(0, 0, z)), m['joint'])
        add(kit.lathe('Hoop', [(r + 0.0085, z + 0.003), (r + 0.0085, z - 0.003), (r - 0.012, z - 0.003),
                               (r - 0.012, z + 0.003)], seg=40), m['role']('Drum', 'joint'))
    add(kit.torus('Waist', r + 0.001, 0.003, seg=(48, 6), location=(0, 0, h * 0.5)), m['joint'])
    for k in range(10):
        a0, a1 = 2 * math.pi * k / 10, 2 * math.pi * (k + 0.5) / 10
        c0, s0 = math.cos(a0), math.sin(a0)
        rr = r + 0.005
        add(kit.tube('Lace', [(c0 * rr, s0 * rr, 0.015), (math.cos(a1) * rr, math.sin(a1) * rr, h - 0.014)], 0.0028,
                     ring=5)[0], m['joint'])
        for z in (0.012, h - 0.01):
            add(kit.superellipsoid('Lug', (0.007, 0.004, 0.0065), 0.4, 0.4, seg=(8, 5),
                                   location=(c0 * (r + 0.0095), s0 * (r + 0.0095), z), rotation=(0, 0, a0)),
                m['role']('Drum', 'joint'))
    add(kit.superellipsoid('Skin', (r - 0.006, r - 0.006, 0.003), 0.3, 1.0, seg=(40, 6), location=(0, 0, h - 0.004)),
        m['role']('Skin', 'joint'), 'skin')
    add(loop('SkinRing', r - 0.014, h - 0.0005, 0.0022, n=40, ring=5), m['joint'], 'skin')
    add(kit.superellipsoid('Spot', (0.026, 0.026, 0.002), 0.4, 1.0, seg=(20, 4), location=(0, 0, h - 0.001)),
        m['dot'](0), 'skin')
    return [('skin', (0, 0, h - 0.004), (0, 0, h + 0.05), 'root')]


def wand(m, add):
    """A bubble wand: a stick with a ridged grip and an end cap with a lanyard ring, a
    collar where the stick meets a ring at its end (lit, Dot0) with three beads round it,
    lying along X."""
    add(kit.tube('Stick', [(-0.09, 0, 0.01), (0.04, 0, 0.01)], 0.006, ring=8)[0], m['role']('Wand'))
    # The grip: a fat sleeve round the stick's handle end, with ridges.
    add(kit.tube('Grip', [(-0.085, 0, 0.01), (-0.03, 0, 0.01)], [0.0085, 0.0085], ring=12)[0], m['role']('Wand'))
    for k in range(5):
        add(kit.torus('Ridge', 0.0088, 0.0016, seg=(14, 5), location=(-0.075 + k * 0.0105, 0, 0.01),
                      rotation=(0, math.pi / 2, 0)), m['joint'])
    add(ball('End', 0.0105, (-0.093, 0, 0.01), seg=(12, 8)), m['joint'])
    add(kit.torus('Lanyard', 0.007, 0.0014, seg=(14, 5), location=(-0.104, 0, 0.01), rotation=(math.pi / 2, 0, 0)),
        m['joint'])
    add(kit.torus('Collar', 0.0085, 0.0028, seg=(16, 6), location=(0.03, 0, 0.01), rotation=(0, math.pi / 2, 0)),
        m['joint'])
    add(kit.torus('Loop', 0.028, 0.005, seg=(32, 8), location=(0.07, 0, 0.01), rotation=(0, math.pi / 2, 0)),
        m['dot'](0))
    for sy in (-1, 1):
        add(ball('Bead', 0.0058, (0.07, sy * 0.028, 0.01), seg=(8, 6)), m['joint'])
    add(ball('Bead', 0.0058, (0.07, 0, 0.038), seg=(8, 6)), m['joint'])


def spot(m, add):
    """A spot of light for the cats to chase: a lit disc with a softer ring round it and a
    second, fainter ring further out (Dot0)."""
    add(kit.superellipsoid('Spot', (0.022, 0.022, 0.002), 0.4, 1.0, seg=(24, 4), location=(0, 0, 0.002)), m['dot'](0))
    add(kit.torus('Halo', 0.03, 0.004, seg=(32, 4), location=(0, 0, 0.002)), m['dot'](0))
    add(kit.torus('Halo2', 0.04, 0.002, seg=(36, 4), location=(0, 0, 0.0015)), m['dot'](0))


KINDS = {
    'yarn': dict(build=yarn, height=0.142, width=0.26, centre=0.07),
    'bone': dict(build=bone, height=0.09, width=0.25, centre=0.045),
    'ball': dict(build=toyball, height=0.146, width=0.146, centre=0.073),
    'cushion': dict(build=cushion, height=0.155, width=0.5),
    'crate': dict(build=crate, height=0.41, width=0.76),
    'table': dict(build=table, height=0.62, width=1.0),
    'balloon': dict(build=balloon, height=0.43, width=0.26),
    'frisbee': dict(build=frisbee, height=0.04, width=0.28),
    'block-star': dict(build=block('star'), height=0.112, width=0.11),
    'block-ring': dict(build=block('ring'), height=0.112, width=0.11),
    'block-heart': dict(build=block('heart'), height=0.112, width=0.11),
    'top': dict(build=top, height=0.155, width=0.145),
    'trampoline': dict(build=trampoline, height=0.155, width=0.7),
    'seesaw': dict(build=seesaw, height=0.2, width=0.86),
    'drum': dict(build=drum, height=0.115, width=0.21),
    'wand': dict(build=wand, height=0.04, width=0.2),
    'spot': dict(build=spot, height=0.006, width=0.07),
}
