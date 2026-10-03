"""Flick, the crew's robot lizard, a gecko: a long low body in two rounded halves (chest
and hip, so it can bend), splayed on four two-bone legs that end in flat sticky toe pads
with three round toes, and a long tail in six ringed segments that curls. A wide head
with a big screen face, two bulging eye turrets on top (each a ball with a glowing lens,
turned independently by the site), a tongue on a bone of its own that the site stretches
out to catch flies (hidden inside the head until then), and a dewlap under the chin that
lights up when it puffs its throat.

Six plates run down its back and tail (Dot0 at the shoulders to Dot5 on the tail), and
they carry the light show; the dewlap is Dot6 and the tail tip Dot7. Faces -Y like the
rest of the crew; about 0.2 m tall and 0.85 m from nose to tail tip.

Refined: each back plate is a lit lens in a bezelled base with rivets, on a spine ridge; the
two body halves are joined by a three-ring bellows and have panel seams, flank slits and side
ports; the eye turrets sit in swivel collars, with a lens bezel and a lid; the dewlap is a
pleated fan on a hinge bar; toe pads carry lamellae bars and round toe caps; knee, elbow and
shoulder rings, riveted tail rings and a capped tip; nostrils, a jaw seam and cheek bolts.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'lizard'
PREVIEW = dict(lift=0.0, width=0.8)

D = {
    'head': dict(radii=(0.076, 0.07, 0.058), center=(0, -0.235, 0.115), e=0.55),
    # 2:1, like the lizard's face layout (512 x 256)
    'screen': dict(radii=(0.062, 0.022, 0.031), center=(0, -0.298, 0.121), bezel=0.006),
    'turret': dict(r=0.03, at=(0.05, -0.222, 0.172), lens=0.015),
    'chest': dict(radii=(0.07, 0.09, 0.055), center=(0, -0.11, 0.09), e=0.6),
    'hip': dict(radii=(0.075, 0.095, 0.058), center=(0, 0.03, 0.09), e=0.6),
    'legs': dict(
        front=dict(shoulder=(0.072, -0.15, 0.09), elbow=(0.14, -0.13, 0.078), foot=(0.16, -0.17, 0.014)),
        back=dict(shoulder=(0.078, 0.0, 0.09), elbow=(0.15, 0.03, 0.078), foot=(0.17, -0.005, 0.014)),
        r=(0.021, 0.016),
    ),
    'pad': dict(radii=(0.028, 0.034, 0.008), toe=0.0105),
    'tail': dict(y=(0.1, 0.52), z=(0.082, 0.066), r=(0.046, 0.05, 0.048, 0.042, 0.036, 0.03, 0.025, 0.02, 0.016, 0.012,
                                                      0.009)),
    'tongue': dict(root=(-0.268, 0.085), length=0.15, r=0.009),
    'dewlap': dict(radii=(0.036, 0.007, 0.042), center=(0, -0.285, 0.05)),
}
TAIL = tuple(f'tail.{i}' for i in range(1, 7))
EDGES = [D['tail']['y'][0] + (D['tail']['y'][1] - D['tail']['y'][0]) * i / 6 for i in range(7)]
LEGS = (('FL', 'front', 1), ('FR', 'front', -1), ('BL', 'back', 1), ('BR', 'back', -1))


def surface(part, p):
    """Where the ray from a superellipsoid part's centre through p meets its skin."""
    (rx, ry, rz), c, e = part['radii'], part['center'], part['e']
    q = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]
    f = abs(q[0] / rx) ** (2 / e) + abs(q[1] / ry) ** (2 / e) + abs(q[2] / rz) ** (2 / e)
    k = f ** (-e / 2)
    return c[0] + q[0] * k, c[1] + q[1] * k, c[2] + q[2] * k


def section(part, y, grow=1.0):
    """The body's cross-section at height y along it: (centre, rx, rz) of a boxy ring."""
    (rx, ry, rz), c, e = part['radii'], part['center'], part['e']
    k = max(1 - abs((y - c[1]) / ry) ** (2 / e), 0.0) ** (e / 2) * grow
    return (c[0], y, c[2]), rx * k, rz * k, e


def hoop(name, part, y, r, grow=1.004, m=5):
    """A ring of tube r round the body at y, hugging its boxy cross-section."""
    c, rx, rz, e = section(part, y, grow)
    pts = []
    n = 32
    for i in range(n):
        th = 2 * math.pi * i / n
        pts.append(Vector((c[0] + rx * kit.spow(math.cos(th), e), y, c[2] + rz * kit.spow(math.sin(th), e))))
    return loop(name, pts, Vector(c), r, m)


def loop(name, pts, centre, r, m=6, closed=True):
    """A small tube swept along a closed (or open, capped) path, round `centre`."""
    n = len(pts)
    verts, faces = [], []
    for i in range(n):
        a, b = pts[(i - 1) % n] if closed or i else pts[0], pts[(i + 1) % n] if closed or i < n - 1 else pts[-1]
        t = (b - a).normalized()
        out = pts[i] - centre
        out = (out - t * out.dot(t)).normalized()
        side = t.cross(out)
        for k in range(m):
            ang = 2 * math.pi * k / m
            verts.append(tuple(pts[i] + (out * math.cos(ang) + side * math.sin(ang)) * r))
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        for k in range(m):
            k2 = (k + 1) % m
            faces.append((i * m + k, i * m + k2, j * m + k2, j * m + k))
    if not closed:
        for end, flip in ((0, True), (n - 1, False)):
            verts.append(tuple(pts[end]))
            c = len(verts) - 1
            for k in range(m):
                a, b = end * m + k, end * m + (k + 1) % m
                faces.append((c, b, a) if flip else (c, a, b))
    return kit.mesh_object(name, verts, faces)


def ring_on(name, a, b, t, major, minor, seg=(20, 6)):
    """A ring round the limb from a to b, a fraction t along it."""
    a, b = Vector(a), Vector(b)
    at = a + (b - a) * t
    rot = (b - a).to_track_quat('Z', 'Y').to_euler()
    return kit.torus(name, major, minor, seg=seg, location=tuple(at), rotation=tuple(rot))


def fan(name, apex, radius, half, pleats, depth, thick):
    """A pleated fan plate hanging from a hinge point: a sector of a disc, zig-zagged so
    it reads as folded, with a little thickness. Faces -Y, opens downward."""
    ax, ay, az = apex
    verts, faces = [], []
    n = pleats * 2 + 1
    rows = []
    for layer, off in enumerate((0.0, thick)):
        row = [(ax, ay - off, az)]
        for i in range(n):
            a = -half + 2 * half * i / (n - 1)
            zig = depth * (1 if i % 2 else -1)
            row.append((ax + radius * math.sin(a), ay - off + zig, az - radius * math.cos(a)))
        rows.append(row)
    front = len(rows[0])
    verts = rows[0] + rows[1]
    for i in range(1, front - 1):
        faces.append((0, i + 1, i))
        faces.append((front, front + i, front + i + 1))
        faces.append((i, i + 1, front + i + 1, front + i))
    faces.append((0, front, front + 1, 1))
    faces.append((0, front - 1, 2 * front - 1, front))
    return kit.mesh_object(name, verts, faces)


def mirror(p, side):
    return side * p[0], p[1], p[2]


def rig_bones():
    ty = EDGES
    tz = D['tail']['z'][0]
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('hip', (0, 0.03, 0.09), (0, 0.1, 0.09), 'root'),
        ('chest', (0, -0.05, 0.09), (0, -0.15, 0.095), 'hip'),
        ('head', (0, -0.19, 0.105), (0, -0.27, 0.115), 'chest'),
        ('tongue', (0, D['tongue']['root'][0], D['tongue']['root'][1]),
         (0, D['tongue']['root'][0] - D['tongue']['length'], D['tongue']['root'][1]), 'head'),
        ('dewlap', (0, -0.275, 0.09), (0, -0.285, 0.05), 'head'),
    ]
    t = D['turret']['at']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'eye.{sfx}', mirror(t, side), (side * t[0], t[1], t[2] + 0.02), 'head'))
    for i in range(6):
        bones.append((f'tail.{i + 1}', (0, ty[i], tz), (0, ty[i + 1], tz), 'hip' if i == 0 else f'tail.{i}'))
    for sfx, end, side in LEGS:
        leg = D['legs'][end]
        bones.append((f'leg.{sfx}', mirror(leg['shoulder'], side), mirror(leg['elbow'], side), 'chest' if end == 'front' else 'hip'))
        bones.append((f'shin.{sfx}', mirror(leg['elbow'], side), mirror(leg['foot'], side), f'leg.{sfx}'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def flat(obj):
        obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
        obj.data.update()
        return obj

    def stud(name, at, bone, r=0.003, mat=None):
        """A rivet or bolt head: a small flattened dome."""
        return add(kit.superellipsoid(name, (r, r, r * 0.8), seg=(8, 6), location=at), mat or m['joint'], bone)

    leg_mat, pad_mat, tongue_mat = m['role']('Skin', 'joint'), m['role']('Pad', 'bezel'), m['role']('Tongue', 'joint')
    rim_mat, band_mat, base_mat = m['role']('Rim', 'joint'), m['role']('Band', 'bezel'), m['role']('Plate', 'bezel')

    # Head with its screen, eye turrets, a mouth slot for the tongue.
    h = D['head']
    hc = h['center']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(40, 28), location=hc), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Lizard', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(kit.superellipsoid('Mouth', (0.02, 0.006, 0.006), 0.4, 0.6, seg=(16, 8), location=(0, -0.296, 0.082)),
        m['bezel'], 'head')
    # Nostril dots on the snout, bolts on the cheeks, a jaw seam round the sides and back.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x, y, z = surface(h, (side * 0.014, -0.285, 0.19))
        add(kit.superellipsoid(f'Nostril.{sfx}', (0.0038, 0.0034, 0.0022), seg=(10, 6), location=(x, y, z - 0.0004),
                               rotation=(0.5, 0, 0)), m['joint'], 'head')
        for k, (dy, dz) in enumerate(((-0.02, -0.014), (0.03, -0.014))):
            p = surface(h, (side * 0.2, hc[1] + dy, hc[2] + dz))
            stud(f'Cheek.{sfx}{k}', p, 'head', 0.0038, m['bezel'])
    jaw_z = 0.088
    zk = max(1 - abs((jaw_z - hc[2]) / h['radii'][2]) ** (2 / h['e']), 0) ** (h['e'] / 2) * 1.004
    jaw = []
    for i in range(60):
        th = math.radians(-60 + 300 * i / 59)  # skips the front, where the screen is
        jaw.append(Vector((hc[0] + h['radii'][0] * zk * kit.spow(math.cos(th), h['e']),
                           hc[1] + h['radii'][1] * zk * kit.spow(math.sin(th), h['e']), jaw_z)))
    add(loop('JawSeam', jaw, Vector((hc[0], hc[1], jaw_z)), 0.0022, 5, closed=False), rim_mat, 'head')
    tu = D['turret']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x, y, z = mirror(tu['at'], side)
        r = tu['r']
        add(kit.superellipsoid(f'Turret.{sfx}', (r,) * 3, seg=(24, 16), location=(x, y, z)), m['bezel'],
            f'eye.{sfx}')
        add(kit.superellipsoid(f'Lens.{sfx}', (tu['lens'], tu['lens'] * 0.5, tu['lens']), 0.5, 1, seg=(16, 8),
                               location=(x, y - r * 0.9, z)), m['beacon'], f'eye.{sfx}')
        # A bezel round the lens.
        add(kit.torus(f'LensRim.{sfx}', tu['lens'] * 1.18, 0.0034, seg=(20, 6), location=(x, y - r * 0.86, z),
                      rotation=(math.pi / 2, 0, 0)), rim_mat, f'eye.{sfx}')
        # A lid: a cap over the top and back of the ball, slanted, with a rim ring on its cut edge.
        tilt = math.atan(0.35)
        lid = kit.cut(kit.superellipsoid(f'Lid.{sfx}', (r * 1.09,) * 3, seg=(24, 14), location=(x, y, z)),
                      (0, 0.35, 1), r * 0.16)
        add(lid, m['shell'], f'eye.{sfx}')
        n = Vector((0, 0.35, 1)).normalized()
        c = Vector((x, y, z)) + n * r * 0.16
        add(kit.torus(f'LidRim.{sfx}', math.sqrt((r * 1.09) ** 2 - (r * 0.16) ** 2), 0.0032, seg=(28, 6),
                      location=tuple(c), rotation=(-tilt, 0, 0)), rim_mat, f'eye.{sfx}')
        # The swivel collar where the turret meets the head: a ring, a lip, and four studs.
        add(kit.torus(f'Collar.{sfx}', r * 1.0, 0.0055, seg=(28, 6), location=(x, y, z - r * 0.55)), m['joint'],
            'head')
        add(kit.torus(f'CollarLip.{sfx}', r * 0.84, 0.0035, seg=(24, 6), location=(x, y, z - r * 0.42)), rim_mat,
            'head')
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            stud(f'CollarStud.{sfx}{k}', (x + r * math.cos(a), y + r * math.sin(a), z - r * 0.55 + 0.005),
                 'head', 0.0026, m['bezel'])

    # The tongue: a bar with a rounded tip, inside the head at rest.
    tg = D['tongue']
    ty0, tz0 = tg['root']
    add(kit.tube('Tongue', [(0, ty0, tz0), (0, ty0 - tg['length'], tz0)], [tg['r'] * 0.8, tg['r']], ring=10)[0],
        tongue_mat, 'tongue')
    add(kit.superellipsoid('TongueTip', (tg['r'] * 1.5, tg['r'] * 1.5, tg['r'] * 0.9), seg=(16, 10),
                           location=(0, ty0 - tg['length'], tz0)), tongue_mat, 'tongue')
    add(kit.torus('TongueBand', tg['r'] * 1.05, 0.0025, seg=(14, 5), location=(0, ty0 - tg['length'] * 0.62, tz0),
                  rotation=(math.pi / 2, 0, 0)), rim_mat, 'tongue')

    # The dewlap: a pleated fan plate on a hinge bar, lit (Dot6) like the plates.
    fan_plate = fan('Dewlap', (0, -0.276, 0.092), 0.052, math.radians(56), 4, 0.0032, 0.004)
    add(flat(fan_plate), m['dot'](6), 'dewlap')
    arc = [Vector((0.052 * math.sin(a), -0.278, 0.092 - 0.052 * math.cos(a)))
           for a in (math.radians(-58 + 116 * i / 24) for i in range(25))]
    add(loop('DewlapEdge', arc, Vector((0, -0.276, 0.092)), 0.0028, 5, closed=False), band_mat, 'dewlap')
    add(kit.tube('DewlapHinge', [(-0.03, -0.276, 0.092), (0.03, -0.276, 0.092)], 0.004, ring=8)[0], rim_mat, 'dewlap')

    # Body: chest and hip, joined by a bellows of three rings.
    c, hp = D['chest'], D['hip']
    add(kit.superellipsoid('Chest', c['radii'], c['e'], c['e'], seg=(36, 24), location=c['center']), m['shell'],
        'chest')
    add(kit.superellipsoid('Hip', hp['radii'], hp['e'], hp['e'], seg=(36, 24), location=hp['center']), m['shell'],
        'hip')
    for i, (y, grow, r) in enumerate(((-0.052, 1.02, 0.0034), (-0.045, 1.07, 0.0048), (-0.038, 1.02, 0.0034))):
        add(hoop(f'Bellows{i}', hp, y, r, grow), m['joint'] if i == 1 else rim_mat, 'hip')
    add(kit.torus('Neck', 0.064, 0.007, seg=(32, 8), location=(0, -0.185, 0.1), rotation=(math.pi / 2 + 0.12, 0, 0)),
        m['joint'], 'chest')
    add(kit.torus('NeckRim', 0.06, 0.0035, seg=(32, 6), location=(0, -0.176, 0.1), rotation=(math.pi / 2 + 0.12, 0, 0)),
        rim_mat, 'chest')
    # Panel seams round each half, and a seam down each flank.
    for i, y in enumerate((-0.12, -0.16)):
        add(hoop(f'ChestSeam{i}', c, y, 0.0021), rim_mat, 'chest')
    for i, y in enumerate((0.033, 0.11)):
        add(hoop(f'HipSeam{i}', hp, y, 0.0021), rim_mat, 'hip')
    for part, bone, y0, y1, tag in ((c, 'chest', -0.17, -0.06, 'C'), (hp, 'hip', -0.025, 0.115, 'H')):
        for side, sfx in ((1, 'L'), (-1, 'R')):
            ys = [y0 + (y1 - y0) * i / 8 for i in range(9)]
            pts = [surface(part, (side * 0.3, y, part['center'][2] + 0.008)) for y in ys]
            add(kit.tube(f'Flank{tag}{sfx}', pts, 0.0021, ring=5)[0], rim_mat, bone)
    # Flank slits on the hip and a port with a core on the chest.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k in range(3):
            x, y, z = surface(hp, (side * 0.3, 0.05 + 0.011 * k, 0.075))
            add(kit.superellipsoid(f'Slit.{sfx}{k}', (0.0022, 0.0028, 0.011), 0.5, 0.8, seg=(8, 6),
                                   location=(x, y, z)), m['joint'], 'hip')
        x, y, z = surface(c, (side * 0.3, -0.105, 0.078))
        add(kit.torus(f'Port.{sfx}', 0.011, 0.003, seg=(18, 6), location=(x, y, z),
                      rotation=(0, math.pi / 2, 0)), m['bezel'], 'chest')
        add(kit.superellipsoid(f'PortCore.{sfx}', (0.004, 0.009, 0.009), 0.6, 0.8, seg=(12, 8),
                               location=(x, y, z)), m['joint'], 'chest')

    # The spine ridge: a rib under the plates, chest and hip halves.
    for part, bone, y0, y1, tag in ((c, 'chest', -0.19, -0.05, 'C'), (hp, 'hip', -0.04, 0.12, 'H')):
        ys = [y0 + (y1 - y0) * i / 10 for i in range(11)]
        pts = [surface(part, (0, y, part['center'][2] + 0.3)) for y in ys]
        add(kit.tube(f'Spine{tag}', [(p[0], p[1], p[2] + 0.0012) for p in pts], 0.0042, ring=6)[0], rim_mat, bone)

    # The back plates: Dot0..Dot3 on the body, Dot4 and Dot5 on the base of the tail. Each is a
    # lit lens in a bezelled base, with rivets at the corners.
    plates = [(-0.155, 0.146, 'chest'), (-0.085, 0.15, 'chest'), (-0.005, 0.15, 'hip'), (0.07, 0.148, 'hip'),
              (0.15, 0.12, 'tail.1'), (0.235, 0.105, 'tail.2')]
    for i, (y, z, bone) in enumerate(plates):
        size = 1 - 0.035 * i
        add(kit.superellipsoid(f'PlateBase{i}', (0.042 * size, 0.036 * size, 0.0075), 0.4, 0.45, seg=(20, 10),
                               location=(0, y, z - 0.003)), base_mat, bone)
        add(kit.superellipsoid(f'Plate{i}', (0.033 * size, 0.028 * size, 0.011), 0.4, 0.5, seg=(20, 10),
                               location=(0, y, z + 0.0015)), m['dot'](i), bone)
        for k, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
            stud(f'PlateRivet{i}{k}', (sx * 0.0345 * size, y + sy * 0.0235 * size, z + 0.0005), bone, 0.0028)

    # The tail: one tube handed down six bones, ringed at each joint (banded and riveted), with a
    # capped lamp at the tip.
    t = D['tail']
    n = len(t['r'])
    pts = [(0, t['y'][0] + (t['y'][1] - t['y'][0]) * i / (n - 1), t['z'][0] + (t['z'][1] - t['z'][0]) * i / (n - 1))
           for i in range(n)]
    tube, ts = kit.tube('Tail', pts, list(t['r']), ring=16)
    kit.assign(tube, m['shell'])
    parts.append(tube)
    skin.append((tube, kit.chain(ts, list(TAIL))))
    for i in range(1, 6):
        f = i / 6 * (n - 1)
        k = min(int(f), n - 2)
        r = t['r'][k] + (t['r'][k + 1] - t['r'][k]) * (f - k)
        zc = t['z'][0] + (t['z'][1] - t['z'][0]) * i / 6
        add(kit.torus(f'TailRing.{i}', r * 1.06, 0.0045, seg=(24, 6), location=(0, EDGES[i], zc),
                      rotation=(math.pi / 2, 0, 0)), band_mat if i % 2 else m['joint'], TAIL[i])
        for j, a in enumerate((-1.0, 0.0, 1.0)):
            stud(f'TailRivet.{i}{j}', (r * 1.09 * math.sin(a), EDGES[i], zc + r * 1.09 * math.cos(a)), TAIL[i],
                 0.0026 * (0.5 + r / 0.05 * 0.5), m['bezel'])
    tip = (0, t['y'][1] + 0.004, t['z'][1])
    add(kit.superellipsoid('TailTip', (0.013, 0.013, 0.013), seg=(16, 10), location=tip), m['dot'](7), 'tail.6')
    add(kit.torus('TailCap', 0.0125, 0.0033, seg=(18, 6), location=(0, t['y'][1] - 0.003, t['z'][1]),
                  rotation=(math.pi / 2, 0, 0)), rim_mat, 'tail.6')

    # Legs: an upper and a lower part, ball joints at shoulder and elbow with rings, a flat pad with
    # lamellae bars and three round toes.
    pd = D['pad']
    r0, r1 = D['legs']['r']
    for sfx, end, side in LEGS:
        leg = D['legs'][end]
        sh, el, ft = (mirror(leg[k], side) for k in ('shoulder', 'elbow', 'foot'))
        add(kit.tube(f'Upper.{sfx}', [sh, el], [r0, r0 * 0.9], ring=12)[0], leg_mat, f'leg.{sfx}')
        add(kit.superellipsoid(f'Shoulder.{sfx}', (r0 * 1.4,) * 3, seg=(16, 10), location=sh), m['joint'], f'leg.{sfx}')
        add(ring_on(f'ShoulderRing.{sfx}', sh, el, 0.22, r0 * 1.35, 0.0033), rim_mat, f'leg.{sfx}')
        add(ring_on(f'UpperBand.{sfx}', sh, el, 0.62, r0 * 1.02, 0.0028), band_mat, f'leg.{sfx}')
        low_end = (ft[0], ft[1], ft[2] + 0.012)
        add(kit.tube(f'Lower.{sfx}', [el, low_end], [r1, r1 * 0.85], ring=12)[0], leg_mat, f'shin.{sfx}')
        add(kit.superellipsoid(f'Elbow.{sfx}', (r0 * 1.2,) * 3, seg=(16, 10), location=el), m['joint'], f'shin.{sfx}')
        add(ring_on(f'ElbowRing.{sfx}', el, low_end, 0.14, r1 * 1.55, 0.0033), rim_mat, f'shin.{sfx}')
        stud(f'ElbowBolt.{sfx}', (el[0] + side * r0 * 1.15, el[1], el[2]), f'shin.{sfx}', 0.0042, m['bezel'])
        add(ring_on(f'Ankle.{sfx}', el, low_end, 0.82, r1 * 1.05, 0.0028), band_mat, f'shin.{sfx}')
        add(kit.superellipsoid(f'Pad.{sfx}', pd['radii'], 0.4, 0.8, seg=(24, 8), location=(ft[0], ft[1], ft[2] - 0.004)),
            pad_mat, f'shin.{sfx}')
        for k, dy in enumerate((-0.014, -0.005, 0.004, 0.013)):
            w = pd['radii'][0] * 0.86 * math.sqrt(max(1 - (dy / pd['radii'][1]) ** 2, 0.05))
            add(kit.superellipsoid(f'Lamella.{sfx}{k}', (w, 0.0017, 0.0012), 0.5, 0.6, seg=(8, 4),
                                   location=(ft[0], ft[1] + dy, ft[2] + 0.0042)), rim_mat, f'shin.{sfx}')
        for k in (-1, 0, 1):
            tx, ty, tz = ft[0] + k * 0.02, ft[1] - 0.04 + 0.006 * (1 - abs(k)), ft[2] - 0.003
            add(kit.superellipsoid(f'Toe.{sfx}{k}', (pd['toe'], pd['toe'], 0.008), 0.4, 1, seg=(16, 6),
                                   location=(tx, ty, tz)), pad_mat, f'shin.{sfx}')
            add(kit.superellipsoid(f'ToeCap.{sfx}{k}', (pd['toe'] * 0.62, pd['toe'] * 0.62, 0.0022), 0.4, 1,
                                   seg=(8, 4), location=(tx, ty, tz + 0.0075)), rim_mat, f'shin.{sfx}')

    return looks.finish(kit.armature('LizardRig', rig_bones()), parts, skin, m)
