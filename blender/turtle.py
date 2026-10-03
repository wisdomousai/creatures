"""Flip, the crew's robot sea turtle: a toy robot, not a turtle in a robot suit. A smooth,
flat, streamlined shell of little hexagonal plates, each a raised bevelled tile, with a
ring of chunky marginal blocks round its edge. Under the tiles the shell itself glows,
so every seam between them is a line of light: five bands from head to tail (Dot0 at
the head to Dot4 at the tail), each its own material, so the site can ripple light down
the shell as the turtle swims. A tail lamp (Dot5) sits at the back.

A big round head with a wide screen face on a short neck; a small beak under the
screen. Four paddle flippers, each made of segments with ball joints between them, like
a toy's: the long front ones hang from shoulder joints that sweep like wings (shoulder,
paddle and tip are three bones, so a stroke whips), the short hind ones have two.
Ribs across the paddles. A stubby tail.

Hidden inside, for the acts: six little bubbles (or grains of sand), each on its own
bone, that the site scales up, floats about and pops. Faces -Y like the rest of the crew;
about 0.14 m from the plastron to the top of the shell.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'turtle'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    # The shell is the top of this shape, cut flat near the bottom; plates sit on it.
    'shell': dict(radii=(0.145, 0.18, 0.1), center=(0, 0.02, 0.04), e1=0.8, e2=0.9, cut=0.028),
    # Hexagonal plates (circumradius `size`), each raised `lift` with its top `inset` of its foot;
    # only where the plate's middle is inside `keep` of the shell's footprint.
    'plate': dict(size=0.04, gap=0.96, lift=0.009, inset=0.74, keep=0.97),
    'rim': dict(n=30, along=0.0165, out=0.014, up=0.016, z=0.05),
    'plastron': dict(radii=(0.13, 0.165, 0.014), center=(0, 0.02, 0.02)),
    'head': dict(radii=(0.07, 0.062, 0.06), center=(0, -0.215, 0.075), e=0.8),
    # 8:5, like the turtle's face layout (512 x 320)
    'screen': dict(radii=(0.052, 0.02, 0.0325), center=(0, -0.27, 0.08), bezel=0.008),
    'beak': dict(radii=(0.026, 0.016, 0.011), center=(0, -0.268, 0.032)),
    'neck': dict(top=(0, -0.13, 0.07), bottom=(0, -0.2, 0.07), r=0.034),
    # Front flippers: the shoulder, and the joints out along the paddle, then the widths.
    'front': dict(shoulder=(0.125, -0.075, 0.03), heading=20, cuts=(0.06, 0.17, 0.25),
                  half=(0.032, 0.056, 0.034), thick=(0.012, 0.011, 0.009)),
    'hind': dict(shoulder=(0.09, 0.135, 0.03), heading=55, cuts=(0.06, 0.115), half=(0.036, 0.034),
                 thick=(0.01, 0.008)),
    'tail': dict(radii=(0.02, 0.032, 0.015), center=(0, 0.222, 0.042)),
    'puff': dict(radius=0.011),
}
SIDES = (('L', 1), ('R', -1))
BANDS = 5


def surface(x, y):
    """Height of the shell's top at (x, y): the superellipsoid's own formula."""
    s = D['shell']
    rx, ry, rz = s['radii']
    cx, cy, cz = s['center']
    r = (abs((x - cx) / rx) ** (2 / s['e2']) + abs((y - cy) / ry) ** (2 / s['e2'])) ** (s['e2'] / 2)
    if r >= 1:
        return cz
    return cz + rz * (1 - r ** (2 / s['e1'])) ** (s['e1'] / 2)


def footing(x, y):
    """How far (x, y) is out toward the shell's edge: 0 in the middle, 1 at the rim."""
    s = D['shell']
    rx, ry, _ = s['radii']
    return (abs((x - s['center'][0]) / rx) ** (2 / s['e2']) + abs((y - s['center'][1]) / ry) ** (2 / s['e2'])) ** (
        s['e2'] / 2)


def normal(x, y):
    e = 0.002
    dx = (surface(x + e, y) - surface(x - e, y)) / (2 * e)
    dy = (surface(x, y + e) - surface(x, y - e)) / (2 * e)
    return Vector((-dx, -dy, 1)).normalized()


def flat(obj):
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def plate_cells():
    p = D['plate']
    a = p['size']
    cy0 = D['shell']['center'][1]
    cells = []
    for j in range(-5, 6):
        for i in range(-4, 5):
            cx = (i + (0.5 if j % 2 else 0)) * math.sqrt(3) * a
            cy = cy0 + j * 1.5 * a
            if footing(cx, cy) < p['keep']:
                cells.append((cx, cy))
    return cells


def plates(cells):
    """Every hex tile in one faceted mesh: a foot on the shell, a bevel, a flat top."""
    p = D['plate']
    a = p['size']
    verts, faces = [], []
    for cx, cy in cells:
        n = normal(cx, cy)
        u = Vector((1, 0, -n.x / n.z)).normalized()
        v = n.cross(u)
        centre = Vector((cx, cy, surface(cx, cy))) + n * p['lift']
        base = len(verts)
        for k in range(6):
            t = math.radians(60 * k + 30)
            x, y = cx + a * p['gap'] * math.cos(t), cy + a * p['gap'] * math.sin(t)
            f = footing(x, y)
            if f > 0.94:  # never off the shell's edge: pull back onto it
                c0 = D['shell']['center']
                x, y = c0[0] + (x - c0[0]) * 0.94 / f, c0[1] + (y - c0[1]) * 0.94 / f
            verts.append((x, y, surface(x, y) - 0.003))
        for k in range(6):
            t = math.radians(60 * k + 30)
            verts.append(tuple(centre + (u * math.cos(t) + v * math.sin(t)) * a * p['inset']))
        for k in range(6):
            j = (k + 1) % 6
            faces.append((base + k, base + j, base + 6 + j, base + 6 + k))
        faces.append(tuple(base + 6 + k for k in range(5, -1, -1)))
    return flat(kit.mesh_object('Plates', verts, faces))


def rim_spots():
    """Evenly spaced points round the shell's edge: (x, y, heading)."""
    s = D['shell']
    rx, ry, _ = s['radii']
    cy = s['center'][1]
    e = s['e2']
    dense = []
    for i in range(720):
        t = 2 * math.pi * i / 720
        dense.append((rx * kit.spow(math.cos(t), e), cy + ry * kit.spow(math.sin(t), e)))
    lengths = [0.0]
    for a, b in zip(dense, dense[1:] + dense[:1]):
        lengths.append(lengths[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    n = D['rim']['n']
    out, j = [], 0
    for k in range(n):
        d = lengths[-1] * (k + 0.5) / n
        while lengths[j + 1] < d:
            j += 1
        a, b = dense[j], dense[(j + 1) % 720]
        out.append((a[0], a[1], math.atan2(b[1] - a[1], b[0] - a[0])))
    return out


def rig_bones():
    f, h = D['front'], D['hind']
    hd = D['head']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.02, 0.06), (0, -0.05, 0.06), 'root'),
        ('neck', (0, -0.14, 0.07), (0, -0.2, 0.07), 'body'),
        ('head', (0, -0.19, 0.075), (0, -0.28, 0.075), 'neck'),
        ('tail', (0, 0.2, 0.045), (0, 0.26, 0.04), 'body'),
    ]
    for sfx, s in SIDES:
        for name, spec in (('front', f), ('hind', h)):
            sx, sy, sz = spec['shoulder']
            a = math.radians(spec['heading'])
            d = Vector((s * math.cos(a), math.sin(a), 0))
            pts = [Vector((s * sx, sy, sz)) + d * c for c in (0, *spec['cuts'])]
            names = ['shoulder', 'flipper', 'tip'] if name == 'front' else ['hind', 'hindtip']
            for i, bone in enumerate(names):
                tail = pts[i + 1]
                parent = 'body' if i == 0 else f'{names[i - 1]}.{sfx}'
                bones.append((f'{bone}.{sfx}', tuple(pts[i]), tuple(tail), parent))
    # Bubbles hide in the head, on bones of their own.
    for i in range(6):
        bones.append((f'puff.{i + 1}', (0, -0.2, 0.07), (0, -0.2, 0.08), 'head'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The shell, glowing under its tiles: a face of it takes the light of its band.
    s = D['shell']
    shell = kit.superellipsoid('Shell', s['radii'], s['e1'], s['e2'], seg=(56, 24), location=s['center'])
    kit.cut(shell, (0, 0, 1), s['cut'] - s['center'][2])
    shell.data.materials.clear()
    for i in range(BANDS):
        shell.data.materials.append(m['dot'](i))
    front, back = s['center'][1] - s['radii'][1], s['center'][1] + s['radii'][1]
    for poly in shell.data.polygons:
        cy = sum(shell.data.vertices[v].co.y for v in poly.vertices) / len(poly.vertices) + s['center'][1]
        poly.material_index = min(BANDS - 1, max(0, int((cy - front) / (back - front) * BANDS)))
    parts.append(shell)
    skin.append((shell, 'body'))

    add(plates(plate_cells()), m['role']('Plate'), 'body')

    # A ring of marginal blocks round the edge, and the belly plate under it.
    r = D['rim']
    for k, (x, y, heading) in enumerate(rim_spots()):
        push = Vector((math.sin(heading), -math.cos(heading), 0)) * 0.004
        add(kit.superellipsoid(f'Rim.{k}', (r['along'], r['out'], r['up']), 0.35, 0.5, seg=(14, 8),
                               location=(x + push.x, y + push.y, r['z']), rotation=(0, 0, heading)),
            m['role']('Rim', 'joint'), 'body')
    pl = D['plastron']
    add(kit.superellipsoid('Plastron', pl['radii'], 0.3, 0.8, seg=(40, 10), location=pl['center']), m['joint'], 'body')

    # Head: a big round dome, a screen face, a small beak, a neck ring and collar.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(40, 28), location=h['center']), m['role']('Head'),
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Turtle', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    b = D['beak']
    add(kit.superellipsoid('Beak', b['radii'], 0.4, 0.6, seg=(20, 10), location=b['center']), m['bezel'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Cheek.{side}', (0.008, 0.008, 0.005), seg=(10, 6),
                               location=(side * 0.068, -0.235, 0.07), rotation=(0, math.pi / 2, 0)), m['joint'], 'head')
    n = D['neck']
    neck, _ = kit.tube('Neck', [n['top'], n['bottom']], n['r'], ring=16)
    add(neck, m['joint'], 'neck')
    add(kit.torus('Collar', 0.04, 0.0075, seg=(32, 8), location=(0, -0.168, 0.07), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'body')

    # Flippers, in segments with a ball joint at each seam, and ribs across the paddle.
    for sfx, sd in SIDES:
        for kind, spec, bones in (('Front', D['front'], ('shoulder', 'flipper', 'tip')),
                                  ('Hind', D['hind'], ('hind', 'hindtip'))):
            sx, sy, sz = spec['shoulder']
            a = math.radians(spec['heading'])
            d = Vector((sd * math.cos(a), math.sin(a), 0))
            o = Vector((sd * sx, sy, sz))
            cuts = (0, *spec['cuts'])
            ang = math.atan2(d.y, d.x)
            for i, bone in enumerate(bones):
                p0, p1 = o + d * cuts[i], o + d * cuts[i + 1]
                length = cuts[i + 1] - cuts[i]
                # Each segment is a flat rounded blade; the last is the pointiest.
                last = i == len(bones) - 1
                add(kit.superellipsoid(f'{kind}{i}.{sfx}', (length / 2 + 0.006, spec['half'][i], spec['thick'][i]),
                                       0.4, 0.9 if last else 0.6, seg=(24, 10), location=tuple((p0 + p1) / 2),
                                       rotation=(0, 0, ang)), m['role']('Flipper'), f'{bone}.{sfx}')
                if i:
                    add(kit.superellipsoid(f'{kind}Joint{i}.{sfx}', (0.014, 0.014, 0.012), seg=(14, 8), location=tuple(p0)),
                        m['bezel'], f'{bones[i - 1]}.{sfx}')
                # Ribs across the blade, standing a hair proud of its top.
                if i == 1 or (kind == 'Front' and i == 2):
                    for r_ in (0.3, 0.62):
                        q = p0 + (p1 - p0) * r_
                        add(kit.superellipsoid(f'Rib{kind}{i}.{sfx}.{r_}', (0.0032, spec['half'][i] * 0.78, 0.004), 0.4, 0.5,
                                               seg=(10, 6), location=(q.x, q.y, q.z + spec['thick'][i] * 0.9),
                                               rotation=(0, 0, ang)), m['bezel'], f'{bone}.{sfx}')
            # The shoulder ball.
            add(kit.superellipsoid(f'{kind}Ball.{sfx}', (0.022, 0.022, 0.02), seg=(16, 10), location=tuple(o)),
                m['bezel'], 'body')

    # Tail: a stub with a lamp on the end.
    t = D['tail']
    add(kit.superellipsoid('Tail', t['radii'], 0.5, 0.7, seg=(20, 12), location=t['center']), m['role']('Rim', 'joint'),
        'tail')
    add(kit.superellipsoid('TailLamp', (0.011, 0.007, 0.011), seg=(14, 8), location=(0, t['center'][1] + 0.03, 0.043)),
        m['dot'](5), 'tail')

    # Bubbles (or grains of sand) for the acts, folded away inside the head.
    for i in range(6):
        add(kit.superellipsoid(f'Puff.{i + 1}', (D['puff']['radius'],) * 3, seg=(12, 8), location=(0, -0.2, 0.07)),
            m['flame'], f'puff.{i + 1}')

    return looks.finish(kit.armature('TurtleRig', rig_bones()), parts, skin, m)
