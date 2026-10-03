"""The things that hang from the box's ceiling and change with the page: a mobile, a
pendant lamp, a mirror ball, a swing, a lantern, a wind chime, an orrery, a hanging
planter and a toy plane on its arm (the garland of lights, which couldn't swing as one
thing on a thread, is kept on archive/decor-garland). Toys, like the crew: rounded,
matte, a few lights that the site blinks (Dot0, Dot1, ...), colours of their own only in
the colour look (roles).

Each hangs from its hook at the origin, straight down (-Z); the site hangs it on a thread
from the ceiling and swings it. Parts that swing or spin on their own have their own
bones. Exported as decor-NAME (blender/build.sh decor-mobile).
"""

import math

import bmesh
import bpy

import kit
import looks


class Kind:
    """One decoration, with the interface crew.module() gives the exporter and sheets."""

    FACE = 'bolt'  # no screen; the materials need some face

    def __init__(self, name, spec):
        self.name = name
        self.spec = spec
        self.PREVIEW = dict(lift=spec['height'] + 0.08, width=spec['width'])

    def build(self, look='ink', flame=None):
        m = looks.materials(look, flame, palette=f'decor-{self.name}')
        parts, skin = [], []

        def add(obj, mat, bone='root'):
            kit.assign(obj, mat)
            parts.append(obj)
            skin.append((obj, bone))
            return obj

        bones = self.spec['build'](m, add)
        rig = kit.armature(f'{self.name.capitalize()}Rig', bones)
        return looks.finish(rig, parts, skin, m)


def kind(name):
    return Kind(name, KINDS[name])


# ---------- Shapes ----------


def thread(name, a, b, r=0.0035):
    return kit.tube(name, [a, b], r, ring=8)[0]


def ball(name, r, at, seg=(24, 14)):
    return kit.superellipsoid(name, (r, r, r), seg=seg, location=at)


def flat(obj):
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    obj.data.update()
    return obj


def slab(name, outline, thickness, at=(0, 0, 0), centre=None):
    """A flat shape standing in the XZ plane (facing -Y), from its outline (x, z) points
    round a centre it can be fanned from (a star), `thickness` deep, edges rounded off by
    a bevel."""
    cx, cz = centre or (sum(p[0] for p in outline) / len(outline), sum(p[1] for p in outline) / len(outline))
    t = thickness / 2
    n = len(outline)
    verts = [(cx, -t, cz), (cx, t, cz)]
    verts += [(x, -t, z) for x, z in outline] + [(x, t, z) for x, z in outline]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((0, 2 + j, 2 + i))
        faces.append((1, 2 + n + i, 2 + n + j))
        faces.append((2 + i, 2 + j, 2 + n + j, 2 + n + i))
    obj = kit.mesh_object(name, verts, faces, location=at)
    bevel(obj, thickness * 0.35)
    return obj


def strip(name, outer, inner, thickness, at=(0, 0, 0)):
    """A flat shape between two outlines that meet at their ends (a crescent), standing
    in the XZ plane like slab()."""
    t = thickness / 2
    n = len(outer)
    verts = [(x, -t, z) for x, z in outer] + [(x, -t, z) for x, z in inner]
    verts += [(x, t, z) for x, z in outer] + [(x, t, z) for x, z in inner]
    o, i_, O, I = 0, n, 2 * n, 3 * n
    faces = []
    for k in range(n - 1):
        faces.append((o + k, o + k + 1, i_ + k + 1, i_ + k))
        faces.append((O + k, I + k, I + k + 1, O + k + 1))
        faces.append((o + k, O + k, O + k + 1, o + k + 1))
        faces.append((i_ + k, i_ + k + 1, I + k + 1, I + k))
    obj = kit.mesh_object(name, verts, faces, location=at)
    bevel(obj, thickness * 0.3)
    return obj


def bevel(obj, width):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.6]
    bmesh.ops.bevel(bm, geom=edges, offset=width, segments=2, profile=0.5, affect='EDGES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def star(name, r, at, points=5, inner=0.48, thickness=0.02):
    outline = []
    for k in range(points * 2):
        a = math.pi / 2 + math.pi * k / points
        rr = r if k % 2 == 0 else r * inner
        outline.append((rr * math.cos(a), rr * math.sin(a)))
    return slab(name, outline, thickness, at=at, centre=(0, 0))


def crescent(name, r, at, thickness=0.02, n=18):
    """A moon: the circle r less a circle 0.85 r shifted right by 0.45 r."""
    d, r2 = 0.45 * r, 0.85 * r
    x = (d * d + r * r - r2 * r2) / (2 * d)
    y = math.sqrt(r * r - x * x)
    a0 = math.atan2(y, x)
    b0 = math.atan2(y, x - d)
    outer = [(r * math.cos(a0 + (2 * math.pi - 2 * a0) * k / (n - 1)),
              r * math.sin(a0 + (2 * math.pi - 2 * a0) * k / (n - 1))) for k in range(n)]
    inner = [(d + r2 * math.cos(b0 + (2 * math.pi - 2 * b0) * k / (n - 1)),
              r2 * math.sin(b0 + (2 * math.pi - 2 * b0) * k / (n - 1))) for k in range(n)]
    return strip(name, outer, inner, thickness, at=at)


def cloud(name, w, at):
    """Three puffs in a row, flattened front to back, as one mesh."""
    x0, y0, z0 = at
    puffs = [(-0.55 * w, -0.1 * w, 0.42 * w), (0, 0.12 * w, 0.55 * w), (0.55 * w, -0.08 * w, 0.4 * w)]
    objs = [kit.superellipsoid(f'{name}.{i}', (r, r * 0.55, r * 0.9), seg=(24, 14), location=(x0 + dx, y0, z0 + dz))
            for i, (dx, dz, r) in enumerate(puffs)]
    return join(objs, name)


def join(objs, name):
    target = objs[0]
    with bpy.context.temp_override(active_object=target, object=target, selected_objects=objs,
                                   selected_editable_objects=objs):
        bpy.ops.object.join()
    target.name = name
    return target


def hook(add, z=0.0, bone='root'):
    """The little ring it hangs by."""
    add(kit.torus('Hook', 0.014, 0.004, seg=(20, 8), location=(0, 0, z - 0.012), rotation=(math.pi / 2, 0, 0)),
        MAT['joint'], bone)



# ---------- Small parts ----------


def ring(add, name, r, minor, at, mat, bone='root', seg=(24, 6), rotation=(0, 0, 0)):
    """A ring round the vertical axis (or turned by `rotation`)."""
    return add(kit.torus(name, r, minor, seg=seg, location=at, rotation=rotation), mat, bone)


def eyelet(add, name, at, mat, bone='root', r=0.008, minor=0.0025):
    """A little ring standing in the XZ plane that a thread ties to."""
    return ring(add, name, r, minor, at, mat, bone, seg=(16, 6), rotation=(math.pi / 2, 0, 0))


def bead(add, name, r, at, mat, bone='root', seg=(12, 8)):
    return add(ball(name, r, at, seg=seg), mat, bone)


def rod(add, name, a, b, r, mat, bone='root', sides=8):
    return add(kit.tube(name, [a, b], r, ring=sides)[0], mat, bone)


def loop(add, name, rx, rz, at, r, mat, bone='root', n=28):
    """A closed hoop of an ellipse in the XZ plane (a rim round a flat shape)."""
    pts = [(at[0] + rx * math.cos(2 * math.pi * k / n), at[1], at[2] + rz * math.sin(2 * math.pi * k / n))
           for k in range(n + 1)]
    return add(kit.tube(name, pts, r, ring=6)[0], mat, bone)


def studs(add, name, r, radius, z, count, mat, bone='root', phase=0.0, cx=0.0, cy=0.0):
    """A row of round heads spaced round a circle."""
    for k in range(count):
        a = phase + 2 * math.pi * k / count
        bead(add, f'{name}{k}', r, (cx + radius * math.cos(a), cy + radius * math.sin(a), z), mat, bone, seg=(8, 6))


MAT = {}


def remember(m):
    MAT.clear()
    MAT.update(m)


# ---------- The decorations ----------


def pendant(m, add):
    """A dome lamp with a lit bulb (Dot0) in a threaded socket, on a little cap with a
    cord grip; the shade has a rolled rim and a ring of vents."""
    remember(m)
    J = m['joint']
    hook(add)
    add(kit.lathe('Grip', [(0, -0.003), (0.006, -0.004), (0.006, -0.011), (0.0095, -0.0125), (0.0095, -0.02),
                           (0, -0.021)], seg=14), J)
    ring(add, 'GripGroove', 0.0075, 0.0022, (0, 0, -0.0165), J, seg=(14, 5))
    add(kit.lathe('Cap', [(0, -0.018), (0.018, -0.02), (0.022, -0.035), (0.03, -0.06), (0, -0.062)], seg=24), J)
    ring(add, 'CapBand', 0.0265, 0.0032, (0, 0, -0.046), J, seg=(24, 6))
    studs(add, 'CapBolt', 0.0035, 0.0255, -0.0285, 4, J, phase=math.pi / 4)
    outer = [(0.03, -0.055), (0.06, -0.066), (0.1, -0.095), (0.135, -0.135), (0.158, -0.175), (0.17, -0.212)]
    inner = [(0.162, -0.212), (0.15, -0.178), (0.127, -0.14), (0.094, -0.103), (0.056, -0.077), (0.028, -0.068)]
    add(kit.lathe('Shade', outer + inner, seg=48), m['role']('Shade'), 'shade')
    ring(add, 'ShadeRim', 0.166, 0.0105, (0, 0, -0.2135), J, 'shade', seg=(48, 10))
    ring(add, 'ShadeBand', 0.095, 0.004, (0, 0, -0.097), J, 'shade', seg=(40, 6))
    ring(add, 'ShadeBand2', 0.146, 0.0035, (0, 0, -0.171), J, 'shade', seg=(40, 6))
    # Vents: round heads set in the shade's shoulder, eight of them.
    studs(add, 'Vent', 0.0065, 0.079, -0.081, 8, J, 'shade', phase=math.pi / 8)
    add(kit.lathe('Socket', [(0, -0.07), (0.022, -0.072), (0.024, -0.12), (0.02, -0.13), (0, -0.13)], seg=20), J,
        'shade')
    ring(add, 'SocketCollar', 0.026, 0.0035, (0, 0, -0.08), J, 'shade', seg=(20, 6))
    ring(add, 'SocketCollar2', 0.0255, 0.0035, (0, 0, -0.112), J, 'shade', seg=(20, 6))
    # The screw thread the bulb turns into.
    add(kit.lathe('BulbNeck', [(0, -0.13), (0.018, -0.132), (0.016, -0.15), (0.03, -0.172), (0, -0.175)], seg=20), J,
        'shade')
    for i, z in enumerate((-0.138, -0.144, -0.15)):
        ring(add, f'Thread{i}', 0.0175, 0.0024, (0, 0, z), J, 'shade', seg=(20, 5))
    add(kit.superellipsoid('Bulb', (0.05, 0.05, 0.06), seg=(24, 14), location=(0, 0, -0.232)), m['dot'](0),
        'shade')
    return [('root', (0, 0, 0), (0, 0, -0.05), None), ('shade', (0, 0, -0.05), (0, 0, -0.22), 'root')]


def mobile(m, add):
    """Two crossed arms that turn, a star (Dot0) and a moon on one, a cloud and a ringed
    planet on the other; the arms are capped, and small rimmed discs hang between."""
    remember(m)
    J = m['joint']
    hook(add)
    add(ball('Bead', 0.014, (0, 0, -0.03)), J)
    ring(add, 'BeadRing', 0.012, 0.003, (0, 0, -0.03), J, seg=(16, 6))
    add(thread('Thread', (0, 0, -0.03), (0, 0, -0.075)), J, 'armA')
    add(kit.tube('ArmA', [(-0.25, 0, -0.078), (-0.12, 0, -0.072), (0, 0, -0.07), (0.12, 0, -0.072),
                          (0.25, 0, -0.078)], 0.006, ring=10)[0], J, 'armA')
    for s in (-1, 1):
        add(ball('ArmEnd', 0.012, (s * 0.25, 0, -0.078)), J, 'armA')
        # A collar and a wrapped band at each end.
        ring(add, 'ArmCollar', 0.0095, 0.0032, (s * 0.232, 0, -0.0765), J, 'armA', seg=(16, 6),
             rotation=(0, math.pi / 2, 0))
        ring(add, 'ArmBand', 0.0085, 0.0025, (s * 0.212, 0, -0.0755), J, 'armA', seg=(16, 6),
             rotation=(0, math.pi / 2, 0))
        # Between the charms, a small rimmed disc on a short thread.
        x = s * 0.125
        add(thread(f'BellCord{s}', (x, 0, -0.072), (x, 0, -0.1)), J, 'armA')
        add(kit.superellipsoid(f'Bell{s}', (0.017, 0.017, 0.011), 0.5, 1.0, seg=(16, 8), location=(x, 0, -0.112)),
            m['role']('Moon'), 'armA')
        ring(add, f'BellRim{s}', 0.0175, 0.0026, (x, 0, -0.1125), J, 'armA', seg=(20, 6))
    add(thread('ThreadA1', (-0.25, 0, -0.078), (-0.25, 0, -0.16)), J, 'charmA1')
    eyelet(add, 'EyeletA1', (-0.25, 0, -0.16), J, 'charmA1')
    add(star('Star', 0.058, (-0.25, 0, -0.215), thickness=0.022), m['dot'](0), 'charmA1')
    add(thread('ThreadA2', (0.25, 0, -0.078), (0.25, 0, -0.14)), J, 'charmA2')
    eyelet(add, 'EyeletA2', (0.25, 0, -0.14), J, 'charmA2')
    add(crescent('Moon', 0.06, (0.25, 0, -0.2), thickness=0.024), m['role']('Moon'), 'charmA2')
    add(thread('ThreadB', (0, 0, -0.07), (0, 0, -0.2)), J, 'armA')
    add(kit.tube('ArmB', [(0, -0.17, -0.206), (0, 0, -0.2), (0, 0.17, -0.206)], 0.005, ring=10)[0], J, 'armB')
    add(ball('Hub', 0.011, (0, 0, -0.2)), J, 'armB')
    ring(add, 'HubRing', 0.0135, 0.003, (0, 0, -0.2), J, 'armB', seg=(16, 6))
    for s in (-1, 1):
        y = s * 0.17
        add(ball('ArmBEnd', 0.0095, (0, y, -0.206)), J, 'armB')
        ring(add, 'ArmBCollar', 0.0078, 0.0026, (0, s * 0.155, -0.2045), J, 'armB', seg=(16, 6),
             rotation=(math.pi / 2, 0, 0))
        y = s * 0.09
        add(thread(f'BellBCord{s}', (0, y, -0.2), (0, y, -0.226)), J, 'armB')
        add(kit.superellipsoid(f'BellB{s}', (0.014, 0.014, 0.009), 0.5, 1.0, seg=(16, 8), location=(0, y, -0.236)),
            m['role']('Planet'), 'armB')
        ring(add, f'BellBRim{s}', 0.0145, 0.0022, (0, y, -0.2365), J, 'armB', seg=(20, 6))
    add(thread('ThreadB1', (0, -0.17, -0.206), (0, -0.17, -0.27)), J, 'charmB1')
    eyelet(add, 'EyeletB1', (0, -0.17, -0.27), J, 'charmB1', r=0.007)
    add(cloud('Cloud', 0.05, (0, -0.17, -0.305)), m['role']('Cloud'), 'charmB1')
    add(thread('ThreadB2', (0, 0.17, -0.206), (0, 0.17, -0.265)), J, 'charmB2')
    eyelet(add, 'EyeletB2', (0, 0.17, -0.265), J, 'charmB2', r=0.007)
    add(ball('Planet', 0.034, (0, 0.17, -0.305)), m['role']('Planet'), 'charmB2')
    add(kit.torus('PlanetRing', 0.052, 0.005, seg=(32, 6), location=(0, 0.17, -0.305), rotation=(0.35, 0.25, 0)),
        J, 'charmB2')
    return [
        ('root', (0, 0, 0), (0, 0, -0.03), None),
        ('armA', (0, 0, -0.03), (0, 0, -0.07), 'root'),
        ('charmA1', (-0.25, 0, -0.078), (-0.25, 0, -0.21), 'armA'),
        ('charmA2', (0.25, 0, -0.078), (0.25, 0, -0.2), 'armA'),
        ('armB', (0, 0, -0.07), (0, 0, -0.2), 'armA'),
        ('charmB1', (0, -0.17, -0.206), (0, -0.17, -0.3), 'armB'),
        ('charmB2', (0, 0.17, -0.206), (0, 0.17, -0.3), 'armB'),
    ]


def disco(m, add):
    """A mirror ball of bevelled tiles, with six sparkles (Dot0..Dot5) that glint in turn,
    on a capped loop with a button underneath."""
    remember(m)
    J = m['joint']
    hook(add)
    add(kit.lathe('Cap', [(0, -0.018), (0.02, -0.02), (0.03, -0.04), (0, -0.042)], seg=20), J)
    ring(add, 'CapBand', 0.0245, 0.003, (0, 0, -0.03), J, seg=(20, 6))
    ring(add, 'CapLip', 0.03, 0.0035, (0, 0, -0.041), J, seg=(20, 6))
    r, cz = 0.13, -0.175
    add(kit.lathe('Collar', [(0, -0.04), (0.026, -0.042), (0.022, -0.05), (0.03, -0.062), (0, -0.064)], seg=20), J,
        'ball')
    ring(add, 'CollarBand', 0.024, 0.0028, (0, 0, -0.055), J, 'ball', seg=(20, 6))
    add(ball('Grout', r * 0.93, (0, 0, cz), seg=(32, 18)), J, 'ball')
    add(tiles('Tiles', r, (0, 0, cz), rings=10, around=20), m['role']('Mirror'), 'ball')
    # A button under the ball and a ring round it.
    add(kit.lathe('Button', [(0, cz - r - 0.014), (0.012, cz - r - 0.012), (0.014, cz - r + 0.004), (0, cz - r + 0.006)],
                  seg=16), J, 'ball')
    ring(add, 'ButtonRing', 0.019, 0.0032, (0, 0, cz - r + 0.002), J, 'ball', seg=(20, 6))
    glints = [(20, 25), (100, -10), (170, 40), (240, 5), (300, -35), (60, -45)]
    for i, (lon, lat) in enumerate(glints):
        a, b = math.radians(lon), math.radians(lat)
        n = (math.cos(b) * math.cos(a), math.cos(b) * math.sin(a), math.sin(b))
        at = (n[0] * (r + 0.008), n[1] * (r + 0.008), cz + n[2] * (r + 0.008))
        g = star(f'Glint{i}', 0.024, (0, 0, 0), points=4, inner=0.3, thickness=0.004)
        # Face it out along n: it stands facing -Y, so turn -Y onto n.
        g.rotation_euler = (-b, 0, a + math.pi / 2)
        g.location = at
        add(g, m['dot'](i), 'ball')
    return [('root', (0, 0, 0), (0, 0, -0.04), None), ('ball', (0, 0, -0.04), (0, 0, -0.31), 'root')]


def tiles(name, r, at, rings, around):
    """A sphere of separate tiles, each a little smaller than its patch, with sloped
    edges up to a smaller flat top."""
    cx, cy, cz = at
    verts, faces = [], []

    def onto(p, mid, shrink, radius):
        q = [mid[k] + (p[k] - mid[k]) * shrink for k in range(3)]
        length = math.sqrt(sum(c * c for c in q)) or 1
        return (cx + q[0] / length * radius, cy + q[1] / length * radius, cz + q[2] / length * radius)

    for j in range(rings):
        b0 = -math.pi / 2 + math.pi * j / rings
        b1 = -math.pi / 2 + math.pi * (j + 1) / rings
        n = max(4, round(around * math.cos((b0 + b1) / 2)))
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            corners = [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]
            pts = [(math.cos(b) * math.cos(a), math.cos(b) * math.sin(a), math.sin(b)) for a, b in corners]
            mid = [sum(p[k] for p in pts) / 4 for k in range(3)]
            low = [onto(p, mid, 0.86, r) for p in pts]
            high = [onto(p, mid, 0.56, r + 0.0055) for p in pts]
            # Wound so the tile faces out: check its normal against the ball's radial.
            ax = [low[1][k] - low[0][k] for k in range(3)]
            bx = [low[3][k] - low[0][k] for k in range(3)]
            nrm = (ax[1] * bx[2] - ax[2] * bx[1], ax[2] * bx[0] - ax[0] * bx[2], ax[0] * bx[1] - ax[1] * bx[0])
            if sum(nrm[k] * mid[k] for k in range(3)) < 0:
                low, high = low[::-1], high[::-1]
            base = len(verts)
            verts += low + high
            faces.append((base + 4, base + 5, base + 6, base + 7))
            for k in range(4):
                k2 = (k + 1) % 4
                faces.append((base + k, base + k2, base + 4 + k2, base + 4 + k))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    kit.link(obj)
    return flat(obj)


def swing(m, add):
    """Two laid ropes from rings in the ceiling, through a plank seat with grooves and knotted
    under it, room on it for one of the crew."""
    remember(m)
    J = m['joint']
    for x in (-0.19, 0.19):
        add(kit.torus('RopeHook', 0.013, 0.004, seg=(20, 8), location=(x, 0, -0.012), rotation=(math.pi / 2, 0, 0)), J)
        rope = 'ropeL' if x < 0 else 'ropeR'
        # A rope of three strands laid round each other (a twist every 4 cm), from the ring in
        # the ceiling down through the plank, with a whipping of thread above the plank and a
        # tight knot under it, the end cut short.
        top, low = -0.02, -0.603
        # Three lengths, each its own bone, so the site can bow the rope as it swings.
        cuts = [top + (low - top) * j / 3 for j in range(4)]
        cuts[3] = low
        for k in range(3):
            for j in range(3):
                z0, z1 = cuts[j], (cuts[j + 1] if j < 2 else low)
                z0 += 0.004 if j else 0
                z1 -= 0.004 if j < 2 else 0
                pts = []
                n = 40
                for i in range(n + 1):
                    z = z0 + (z1 - z0) * i / n
                    a = 2 * math.pi * (k / 3 + (top - z) / 0.04) * (1 if x < 0 else -1)
                    pts.append((x + 0.0032 * math.cos(a), 0.0032 * math.sin(a), z))
                add(kit.tube(f'Strand{k}{j}', pts, 0.0034, ring=6)[0], J, f'{rope}{j + 1}')
        for k, z in enumerate((-0.556, -0.562, -0.568, -0.574)):
            ring(add, f'Whip{k}', 0.0068, 0.0016, (x, 0, z), m['bezel'], f'{rope}3', seg=(14, 5))
        add(kit.superellipsoid('Knot', (0.0115, 0.0115, 0.009), 0.6, 0.6, seg=(14, 8), location=(x, 0, -0.646)),
            J, 'seat')
    add(kit.superellipsoid('Seat', (0.25, 0.085, 0.02), 0.25, 0.3, seg=(40, 12), location=(0, 0, -0.618)),
        m['role']('Seat'), 'seat')
    add(kit.superellipsoid('SeatTrim', (0.235, 0.07, 0.006), 0.3, 0.3, seg=(40, 8), location=(0, 0, -0.638)),
        J, 'seat')
    # Grain: three long grooves let into the top.
    for i, y in enumerate((-0.045, 0, 0.045)):
        add(kit.superellipsoid(f'Grain{i}', (0.2, 0.0028, 0.002), 0.5, 0.5, seg=(20, 6), location=(0, y, -0.5985)),
            J, 'seat')
    # Each rope turns about its own ring in the ceiling and the seat hangs level from their
    # ends (the site swings them as a parallelogram), so nothing leaves the ceiling.
    bones = [('root', (0, 0, 0), (0, 0, -0.05), None)]
    for rope, x in (('ropeL', -0.19), ('ropeR', 0.19)):
        z = [-0.02 - 0.58 * j / 3 for j in range(4)]
        for j in range(3):
            bones.append((f'{rope}{j + 1}', (x, 0, z[j]), (x, 0, z[j + 1]), f'{rope}{j}' if j else 'root'))
    return bones + [('seat', (0, 0, -0.6), (0, 0, -0.66), 'root')]


def lantern(m, add):
    """A round paper lantern, lit (Dot0), in a cage of ribs, with a capped top on a ring and
    a tassel with its own bands and threads."""
    remember(m)
    J = m['joint']
    hook(add)
    add(kit.lathe('TopCap', [(0, -0.015), (0.022, -0.018), (0.034, -0.04), (0.045, -0.05), (0, -0.052)], seg=24),
        J, 'body')
    ring(add, 'TopCollar', 0.036, 0.0045, (0, 0, -0.038), J, 'body', seg=(24, 6))
    ring(add, 'TopLip', 0.046, 0.0045, (0, 0, -0.0505), J, 'body', seg=(28, 6))
    studs(add, 'TopBolt', 0.0035, 0.027, -0.0185, 4, J, 'body', phase=math.pi / 4)
    cz, rx, rz = -0.15, 0.115, 0.1
    add(kit.superellipsoid('Paper', (rx, rx, rz), seg=(40, 20), location=(0, 0, cz)), m['dot'](0), 'body')
    for k in range(-2, 3):
        z = cz + k * 0.036
        rr = rx * math.sqrt(max(0.0, 1 - ((z - cz) / rz) ** 2)) + 0.002
        ring(add, f'Rib{k}', rr, 0.0035, (0, 0, z), J, 'body', seg=(40, 6))
    # Ribs the other way, top to bottom.
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        pts = [((rx + 0.002) * math.sin(t) * math.cos(a), (rx + 0.002) * math.sin(t) * math.sin(a),
                cz + (rz + 0.002) * math.cos(t)) for t in [0.16 + (math.pi - 0.32) * i / 12 for i in range(13)]]
        add(kit.tube(f'Meridian{k}', pts, 0.0024, ring=6)[0], J, 'body')
    add(kit.lathe('BottomCap', [(0, -0.245), (0.04, -0.247), (0.03, -0.26), (0.012, -0.265), (0, -0.266)], seg=24),
        J, 'body')
    ring(add, 'BottomLip', 0.041, 0.0045, (0, 0, -0.2475), J, 'body', seg=(28, 6))
    ring(add, 'BottomRing', 0.014, 0.003, (0, 0, -0.266), J, 'body', seg=(16, 6))
    add(thread('TasselCord', (0, 0, -0.265), (0, 0, -0.3)), J, 'tassel')
    add(ball('TasselBead', 0.011, (0, 0, -0.3)), J, 'tassel')
    ring(add, 'TasselNeck', 0.0115, 0.0025, (0, 0, -0.312), J, 'tassel', seg=(16, 5))
    add(kit.lathe('Tassel', [(0, -0.305), (0.012, -0.31), (0.022, -0.35), (0.026, -0.362), (0, -0.364)], seg=16),
        m['role']('Tassel', 'joint'), 'tassel')
    ring(add, 'TasselBand', 0.0225, 0.0028, (0, 0, -0.33), J, 'tassel', seg=(18, 5))
    ring(add, 'TasselHem', 0.0262, 0.003, (0, 0, -0.3615), J, 'tassel', seg=(18, 5))
    for k in range(8):
        a = 2 * math.pi * k / 8
        add(kit.tube(f'Strand{k}', [(0.019 * math.cos(a), 0.019 * math.sin(a), -0.362),
                                    (0.023 * math.cos(a), 0.023 * math.sin(a), -0.37),
                                    (0.025 * math.cos(a), 0.025 * math.sin(a), -0.38)], 0.0022, ring=5)[0],
            m['role']('Tassel', 'joint'), 'tassel')
    return [('root', (0, 0, 0), (0, 0, -0.05), None), ('body', (0, 0, -0.05), (0, 0, -0.26), 'root'),
            ('tassel', (0, 0, -0.265), (0, 0, -0.36), 'body')]


CHIME_LENGTHS = (0.2, 0.165, 0.225, 0.15, 0.185)


def chime(m, add):
    """Five capped tubes round a striker disc, a rimmed sail below to catch the air; each
    tube's end lights (Dot0..Dot4) as it's struck."""
    remember(m)
    J = m['joint']
    hook(add)
    add(kit.superellipsoid('Top', (0.1, 0.1, 0.014), 0.35, 1.0, seg=(40, 10), location=(0, 0, -0.04)),
        m['role']('Top'))
    add(kit.torus('TopRim', 0.1, 0.004, seg=(40, 6), location=(0, 0, -0.04)), J)
    add(kit.lathe('Boss', [(0, -0.02), (0.012, -0.022), (0.016, -0.03), (0.028, -0.04), (0, -0.041)], seg=20), J)
    ring(add, 'BossBand', 0.02, 0.003, (0, 0, -0.034), J, seg=(20, 6))
    # Screws between the tubes.
    studs(add, 'Screw', 0.0055, 0.087, -0.0255, 5, J, phase=math.radians(90 + 36))
    bones = [('root', (0, 0, 0), (0, 0, -0.05), None)]
    for k, length in enumerate(CHIME_LENGTHS):
        a = math.radians(90 + 72 * k)
        x, y = 0.072 * math.cos(a), 0.072 * math.sin(a)
        top, bottom = -0.085, -0.085 - length
        ring(add, f'Grommet{k}', 0.0095, 0.0028, (x, y, -0.0475), J, seg=(14, 6))
        add(thread(f'TubeThread{k}', (x, y, -0.054), (x, y, top)), J, f'tube{k}')
        add(kit.lathe(f'Tube{k}', [(0, top), (0.012, top - 0.002), (0.012, bottom + 0.004), (0.01, bottom),
                                   (0, bottom)], seg=16, location=(x, y, 0)), m['role']('Tube'), f'tube{k}')
        # A cap at the top, a band below it, and a lip at the struck end.
        add(kit.lathe(f'TubeTop{k}', [(0, top + 0.003), (0.008, top + 0.002), (0.0135, top - 0.004), (0.0135, top - 0.012),
                                      (0, top - 0.013)], seg=16, location=(x, y, 0)), J, f'tube{k}')
        ring(add, f'TubeBand{k}', 0.0125, 0.0022, (x, y, top - 0.026), J, f'tube{k}', seg=(16, 5))
        ring(add, f'TubeLip{k}', 0.0122, 0.0028, (x, y, bottom + 0.004), J, f'tube{k}', seg=(16, 5))
        add(kit.lathe(f'TubeEnd{k}', [(0, bottom + 0.001), (0.0115, bottom), (0.009, bottom - 0.006),
                                      (0, bottom - 0.007)], seg=16, location=(x, y, 0)), m['dot'](k), f'tube{k}')
        bones.append((f'tube{k}', (x, y, -0.054), (x, y, bottom), 'root'))
    add(thread('ClapperCord', (0, 0, -0.054), (0, 0, -0.2)), J, 'clapper')
    # The striker disc, with a rim and a knob on top where the cord ties.
    add(kit.superellipsoid('Clapper', (0.034, 0.034, 0.009), 0.4, 1.0, seg=(28, 8), location=(0, 0, -0.2)),
        J, 'clapper')
    ring(add, 'ClapperRim', 0.034, 0.0045, (0, 0, -0.2), J, 'clapper', seg=(28, 6))
    bead(add, 'ClapperKnob', 0.008, (0, 0, -0.192), J, 'clapper')
    add(thread('SailCord', (0, 0, -0.209), (0, 0, -0.29)), J, 'sail')
    bead(add, 'SailBead', 0.007, (0, 0, -0.245), J, 'sail')
    add(kit.superellipsoid('Sail', (0.036, 0.008, 0.058), 0.8, 1.0, seg=(24, 12), location=(0, 0, -0.345)),
        m['role']('Sail'), 'sail')
    loop(add, 'SailRim', 0.037, 0.059, (0, 0, -0.345), 0.0028, J, 'sail', n=32)
    eyelet(add, 'SailEye', (0, 0, -0.29), J, 'sail', r=0.0065, minor=0.002)
    bones += [('clapper', (0, 0, -0.054), (0, 0, -0.2), 'root'), ('sail', (0, 0, -0.209), (0, 0, -0.4), 'clapper')]
    return bones


def orrery(m, add):
    """A sun (Dot0) in a tilted ring under a rod, and three planets on arms at three
    heights that go round it at their own speeds: each arm ends in a bezelled ball joint,
    the planet hanging from a second."""
    remember(m)
    J = m['joint']
    hook(add)
    add(kit.tube('Rod', [(0, 0, -0.02), (0, 0, -0.2)], 0.006, ring=10)[0], J)
    ring(add, 'RodCollar', 0.0105, 0.003, (0, 0, -0.045), J, seg=(16, 6))
    ring(add, 'RodCollar2', 0.0105, 0.003, (0, 0, -0.19), J, seg=(16, 6))
    add(ball('Sun', 0.048, (0, 0, -0.225)), m['dot'](0))
    for i in range(8):
        a = 2 * math.pi * i / 8
        add(kit.superellipsoid(f'Ray{i}', (0.008, 0.008, 0.016), seg=(10, 8),
                               location=(0.066 * math.cos(a), 0, -0.225 + 0.066 * math.sin(a)),
                               rotation=(0, -a + math.pi / 2, 0)), m['dot'](0))
    # The sun's ring, tilted, held on an axle through the sun.
    tilt = (0.6, 0, 0.4)
    ring(add, 'SunRing', 0.093, 0.0035, (0, 0, -0.225), J, seg=(40, 6), rotation=tilt)
    ax = (0.093 * math.cos(0.4), 0.093 * math.sin(0.4), 0)
    rod(add, 'Axle', (-ax[0], -ax[1], -0.225), (ax[0], ax[1], -0.225), 0.0028, J)
    for s in (-1, 1):
        bead(add, f'AxleHead{s}', 0.0065, (s * ax[0], s * ax[1], -0.225), J)
    arms = [
        ('arm1', -0.055, (0.13, 0), 0.022, 'Planet1', False),
        ('arm2', -0.095, (-0.19, 0), 0.032, 'Planet2', True),
        ('arm3', -0.135, (0, 0.24), 0.027, 'Planet3', False),
    ]
    bones = [('root', (0, 0, 0), (0, 0, -0.05), None)]
    for bone, z, (x, y), r, role, ringed in arms:
        R = math.hypot(x, y)
        add(ball(f'{bone}Collar', 0.011, (0, 0, z)), J, bone)
        add(kit.tube(f'{bone}Rod', [(0, 0, z), (x, y, z)], 0.0045, ring=8)[0], J, bone)
        # A bezel ring round the arm's end, where the joint sits.
        ring(add, f'{bone}Bezel', 0.0125, 0.0028, (x, y, z), J, bone, seg=(16, 6))
        # A ball joint where the drop hangs, and another on the planet.
        add(ball(f'{bone}Joint', 0.0085, (x, y, z)), J, bone)
        add(thread(f'{bone}Drop', (x, y, z), (x, y, z - 0.05)), J, bone)
        ring(add, f'{bone}Cuff', 0.0075, 0.0022, (x, y, z - 0.022), J, bone, seg=(14, 5))
        add(ball(f'{bone}Joint2', 0.0075, (x, y, z - 0.05)), J, bone)
        add(ball(role, r, (x, y, z - 0.05 - r)), m['role'](role), bone)
        if ringed:
            add(kit.torus(f'{role}Ring', r * 1.6, 0.0045, seg=(32, 6), location=(x, y, z - 0.05 - r),
                          rotation=(0.4, 0.3, 0)), J, bone)
            add(kit.torus(f'{role}Ring2', r * 1.35, 0.0022, seg=(32, 5), location=(x, y, z - 0.05 - r),
                          rotation=(0.4, 0.3, 0)), J, bone)
        else:
            ring(add, f'{role}Band', r * 0.93, 0.0035, (x, y, z - 0.05 - r * 1.25), J, bone, seg=(20, 5))
        bones.append((bone, (0, 0, z), (0, 0, z - 0.03), 'root'))
    # A moon on a wire off the first planet.
    x, y, z = 0.13, 0, -0.055 - 0.05 - 0.022
    rod(add, 'MoonWire', (x, y, z), (x + 0.036, y, z + 0.024), 0.0018, J, 'arm1', sides=5)
    add(ball('Moon', 0.009, (x + 0.036, y, z + 0.024)), m['role']('Planet2'), 'arm1')
    return bones


def planter(m, add):
    """A pot on three cords with a saucer beneath, and trailing vines that sway (two bones
    each), their leaves ribbed."""
    remember(m)
    J = m['joint']
    hook(add)
    rim_z, rim_r = -0.2, 0.1
    for k in range(3):
        a = math.radians(90 + 120 * k)
        add(thread(f'Cord{k}', (0, 0, -0.02), (rim_r * math.cos(a), rim_r * math.sin(a), rim_z)), J)
        bead(add, f'Anchor{k}', 0.0085, (rim_r * math.cos(a), rim_r * math.sin(a), rim_z + 0.004), J)
    ring(add, 'CordRing', 0.014, 0.0035, (0, 0, -0.03), J, seg=(16, 6))
    bead(add, 'CordKnot', 0.011, (0, 0, -0.024), J)
    outer = [(0.1, rim_z), (0.098, -0.24), (0.088, -0.28), (0.072, -0.305), (0.05, -0.312), (0, -0.313)]
    add(kit.lathe('Pot', [(0.092, rim_z + 0.002)] + outer, seg=40), m['role']('Pot'))
    add(kit.torus('PotRim', 0.098, 0.009, seg=(40, 8), location=(0, 0, rim_z)), m['role']('Pot'))
    add(kit.torus('PotBand', 0.094, 0.004, seg=(40, 6), location=(0, 0, -0.255)), J)
    ring(add, 'PotBand2', 0.099, 0.0032, (0, 0, -0.235), J, seg=(40, 6))
    ring(add, 'PotFoot', 0.052, 0.0045, (0, 0, -0.3125), J, seg=(28, 6))
    # The saucer under it: a shallow dish with a turned rim.
    add(kit.lathe('Saucer', [(0, -0.318), (0.05, -0.319), (0.074, -0.327), (0.084, -0.331), (0.082, -0.339),
                             (0.06, -0.342), (0, -0.342)], seg=32), J)
    ring(add, 'SaucerRim', 0.083, 0.0045, (0, 0, -0.331), m['role']('Pot'), seg=(32, 6))
    add(kit.lathe('Soil', [(0, -0.205), (0.09, -0.207), (0.09, -0.21), (0, -0.21)], seg=32), J)
    # A shoot from the soil with two small leaves.
    add(kit.tube('Shoot', [(0.0, 0, -0.208), (0.006, 0, -0.19), (0.004, 0, -0.172)], 0.003, ring=6)[0],
        m['role']('Stem', 'joint'))
    for s in (-1, 1):
        add(kit.superellipsoid(f'ShootLeaf{s}', (0.02, 0.005, 0.011), seg=(10, 6),
                               location=(0.004 + s * 0.014, 0, -0.172), rotation=(0, -s * 0.5, 0)), m['role']('Leaf'))
    vines = [(20, 0.33), (140, 0.26), (250, 0.38), (320, 0.22)]
    bones = [('root', (0, 0, 0), (0, 0, -0.05), None)]
    for k, (deg, drop) in enumerate(vines):
        a = math.radians(deg)
        ox, oy = math.cos(a), math.sin(a)
        pts = [(ox * 0.05, oy * 0.05, -0.2), (ox * 0.1, oy * 0.1, -0.19), (ox * 0.118, oy * 0.118, -0.215),
               (ox * 0.12, oy * 0.12, -0.215 - drop * 0.5), (ox * 0.115, oy * 0.115, -0.215 - drop)]
        path = kit.spline(pts, 24)
        vine, ts = kit.tube(f'Vine{k}', path, 0.0045, ring=8)
        b0, b1 = f'vine{k}a', f'vine{k}b'
        add(vine, m['role']('Stem', 'joint'), kit.chain(ts, [b0, b1]))
        for i, t in enumerate((0.3, 0.45, 0.6, 0.75, 0.9)):
            p = path[min(int(t * (len(path) - 1)), len(path) - 1)]
            side = 1 if i % 2 else -1
            lp = (p[0] + side * 0.02 * -oy, p[1] + side * 0.02 * ox, p[2])
            bone = b0 if t < 0.5 else b1
            add(kit.superellipsoid(f'Leaf{k}.{i}', (0.03, 0.007, 0.019), seg=(12, 7), location=lp,
                                   rotation=(0, side * 0.5, a)), m['role']('Leaf'), bone)
            # The midrib: thin across, a hair thicker than the leaf, so it stands proud.
            add(kit.superellipsoid(f'Rib{k}.{i}', (0.027, 0.0074, 0.0016), seg=(8, 5), location=lp,
                                   rotation=(0, side * 0.5, a)), m['role']('Stem', 'joint'), bone)
        top = (ox * 0.118, oy * 0.118, -0.215)
        mid = (ox * 0.12, oy * 0.12, -0.215 - drop * 0.5)
        end = (ox * 0.115, oy * 0.115, -0.215 - drop)
        bones += [(b0, top, mid, 'root'), (b1, mid, end, b0)]
        # The tip of each vine: a small bead.
        add(ball(f'VineTip{k}', 0.0065, end, seg=(8, 6)), m['role']('Stem', 'joint'), b1)
    return bones


def plane(m, add):
    """A toy plane on the end of an arm that goes round and round: propeller with a
    spinner, a cowl, a canopy in a frame, wheels on struts, a hinged rudder, and a light
    (Dot0) on its nose."""
    remember(m)
    J = m['joint']
    hook(add)
    add(kit.tube('Rod', [(0, 0, -0.02), (0, 0, -0.1)], 0.006, ring=10)[0], J)
    ring(add, 'RodCollar', 0.0105, 0.003, (0, 0, -0.05), J, seg=(16, 6))
    add(ball('Hub', 0.016, (0, 0, -0.1)), J, 'arm')
    ring(add, 'HubRing', 0.019, 0.0032, (0, 0, -0.1), J, 'arm', seg=(20, 6))
    add(kit.tube('Arm', [(0, 0, -0.1), (0.2, 0, -0.1)], 0.005, ring=8)[0], J, 'arm')
    ring(add, 'ArmBand', 0.0075, 0.0025, (0.06, 0, -0.1), J, 'arm', seg=(14, 5), rotation=(0, math.pi / 2, 0))
    ring(add, 'ArmBand2', 0.0075, 0.0025, (0.14, 0, -0.1), J, 'arm', seg=(14, 5), rotation=(0, math.pi / 2, 0))
    add(thread('PlaneCord', (0.2, 0, -0.1), (0.2, 0, -0.145)), J, 'plane')
    px, pz = 0.2, -0.17
    bead(add, 'PlaneBall', 0.007, (px, 0, -0.1), J, 'arm')
    eyelet(add, 'PlaneEye', (px, 0.005, pz + 0.033), J, 'plane', r=0.006, minor=0.002)
    add(kit.superellipsoid('Fuselage', (0.028, 0.08, 0.026), 1.0, 1.0, taper=0.0, seg=(24, 16),
                           location=(px, 0.005, pz), rotation=(0, 0, 0)), m['role']('Plane'), 'plane')
    add(kit.superellipsoid('Wing', (0.105, 0.022, 0.006), 0.3, 0.5, seg=(32, 8), location=(px, -0.005, pz + 0.004)),
        m['role']('Wing'), 'plane')
    # Wing tips, and stripes on the wing's upper side.
    for s in (-1, 1):
        add(kit.superellipsoid(f'WingTip{s}', (0.007, 0.022, 0.0065), 0.5, 0.6, seg=(10, 8),
                               location=(px + s * 0.104, -0.005, pz + 0.004)), J, 'plane')
        add(kit.superellipsoid(f'WingStripe{s}', (0.022, 0.016, 0.0022), 0.4, 0.5, seg=(12, 6),
                               location=(px + s * 0.07, -0.005, pz + 0.0095)), m['role']('Plane'), 'plane')
    add(kit.superellipsoid('Tail', (0.042, 0.014, 0.005), 0.3, 0.5, seg=(20, 6), location=(px, 0.07, pz + 0.004)),
        m['role']('Wing'), 'plane')
    # The fin, and the rudder behind it on three little hinge pins.
    add(kit.superellipsoid('Fin', (0.004, 0.011, 0.024), 0.3, 0.6, seg=(12, 8), location=(px, 0.065, pz + 0.024)),
        m['role']('Wing'), 'plane')
    add(kit.superellipsoid('Rudder', (0.0035, 0.009, 0.021), 0.3, 0.6, seg=(12, 8),
                           location=(px, 0.0835, pz + 0.023)), m['role']('Plane'), 'plane')
    for i, dz in enumerate((0.008, 0.024, 0.04)):
        add(kit.superellipsoid(f'Hinge{i}', (0.0034, 0.0034, 0.0034), seg=(8, 6), location=(px, 0.0745, pz + dz)),
            J, 'plane')
    for s in (-1, 1):
        bead(add, f'ElevatorHinge{s}', 0.0028, (px + s * 0.02, 0.0765, pz + 0.004), J, 'plane', seg=(8, 6))
    # The canopy in a frame.
    add(kit.superellipsoid('Canopy', (0.016, 0.022, 0.012), seg=(16, 10), location=(px, -0.012, pz + 0.022)),
        m['bezel'], 'plane')
    loop(add, 'CanopyFrame', 0.0165, 0.0225, (px, -0.012, pz + 0.0215), 0.0018, J, 'plane', n=24)
    ring(add, 'Cowl', 0.0195, 0.0032, (px, -0.058, pz), J, 'plane', seg=(20, 6), rotation=(math.pi / 2, 0, 0))
    add(ball('Nose', 0.012, (px, -0.081, pz)), m['dot'](0), 'plane')
    # Landing gear: two struts with wheels (tyre, hub) and a tail wheel.
    for s in (-1, 1):
        x0, x1 = px + s * 0.017, px + s * 0.03
        rod(add, f'Strut{s}', (x0, -0.03, pz - 0.018), (x1, -0.036, pz - 0.048), 0.0026, J, 'plane', sides=6)
        rod(add, f'Brace{s}', (px + s * 0.008, -0.03, pz - 0.022), (x1, -0.036, pz - 0.048), 0.0018, J, 'plane', sides=5)
        ring(add, f'Tyre{s}', 0.0088, 0.0045, (x1 + s * 0.004, -0.036, pz - 0.05), J, 'plane', seg=(16, 6),
             rotation=(0, math.pi / 2, 0))
        bead(add, f'WheelHub{s}', 0.0045, (x1 + s * 0.007, -0.036, pz - 0.05), m['bezel'], 'plane', seg=(8, 6))
    rod(add, 'TailStrut', (px, 0.066, pz - 0.014), (px, 0.074, pz - 0.028), 0.0018, J, 'plane', sides=5)
    ring(add, 'TailTyre', 0.0042, 0.0026, (px, 0.074, pz - 0.03), J, 'plane', seg=(12, 5), rotation=(0, math.pi / 2, 0))
    # The propeller: a hub and spinner, two blades.
    add(kit.lathe('Spinner', [(0, 0.021), (0.005, 0.017), (0.011, 0.007), (0.0125, 0), (0, -0.001)], seg=16,
                  location=(px, -0.09, pz), rotation=(math.pi / 2, 0, 0)), m['bezel'], 'prop')
    ring(add, 'SpinnerBand', 0.0124, 0.0022, (px, -0.0905, pz), J, 'prop', seg=(16, 5), rotation=(math.pi / 2, 0, 0))
    for s in (1, -1):
        add(kit.superellipsoid('Blade', (0.006, 0.004, 0.034), 0.5, 1.0, seg=(10, 8),
                               location=(px, -0.098, pz + s * 0.032)), J, 'prop')
    return [
        ('root', (0, 0, 0), (0, 0, -0.05), None),
        ('arm', (0, 0, -0.1), (0, 0, -0.13), 'root'),
        ('plane', (px, 0, -0.1), (px, 0, pz), 'arm'),
        ('prop', (px, -0.09, pz), (px, -0.11, pz), 'plane'),
    ]


KINDS = {
    'pendant': dict(build=pendant, height=0.292, width=0.35),
    'mobile': dict(build=mobile, height=0.36, width=0.56),
    'disco': dict(build=disco, height=0.31, width=0.27),
    'swing': dict(build=swing, height=0.645, width=0.52),
    'lantern': dict(build=lantern, height=0.365, width=0.24),
    'chime': dict(build=chime, height=0.405, width=0.2),
    'orrery': dict(build=orrery, height=0.275, width=0.5),
    'planter': dict(build=planter, height=0.6, width=0.3),
    'plane': dict(build=plane, height=0.2, width=0.45),
}
