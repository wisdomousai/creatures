"""Bloop, the crew's robot pufferfish: a toy robot, not a fish in a robot suit. A round pod
of a body with a pale belly plate under a seam, a big screen face for its huge eyes, a
little round nozzle of a mouth, two small fan fins at its sides, a fin on top and one
underneath, and a short tail with a round fan.

Its spikes are studs: orderly rows of them all over the pod, each a stepped spike packed
down flat into the shell with a light in its tip, so calm it is a round fish dotted with
lit spots. Every spike has its own bone, pointing straight out of the shell, so the site
can telescope them out when it puffs up; the pod itself swells on its own bone, and the
face, fins, mouth and tail ride out with it but keep their size. The tips light in five
bands from face to tail (Dot0 to Dot4). A ring waits on its own bone inside the head,
for the site to blow out of the mouth. Faces -Y like the rest of the crew; about 0.3 m
tall, and it floats: its origin is just under its belly.
"""

import math

from mathutils import Matrix, Vector

import kit
import looks

FACE = 'puffer'
PREVIEW = dict(lift=0.05, width=0.42)

D = {
    # A rounded pod, blunt at the face and narrowing to the tail: radii (wide, long, tall);
    # e (along its length, round its waist). The belly plate is the part below `belly`.
    'hull': dict(radii=(0.122, 0.15, 0.118), center=(0, 0.0, 0.135), e=(0.75, 0.8), taper=0.45),
    'belly': -0.038,
    'seam': dict(grow=0.025, width=0.0045),
    # 1.6:1, like the pufferfish's face layout (512 x 320)
    'screen': dict(radii=(0.086, 0.02, 0.052), center=(0, -0.146, 0.168), bezel=0.008),
    # The mouth: a short nozzle with a lip, low on the face.
    'mouth': dict(center=(0, -0.147, 0.068), r=0.015, lip=0.006, depth=0.018),
    # Studs in rows round the pod: (angle from the nose, how many, turned by a share of a
    # step), degrees; each row is its own band of lights.
    'rows': [(52, 10, 0.5), (76, 12, 0.0), (100, 12, 0.5), (124, 11, 0.0), (148, 7, 0.5)],
    # Stepped spikes: (share of the length, radius) from the base out; the tip is lit.
    # Built packed down to `calm` of their length; the site pulls them out to full length.
    'spike': dict(length=0.08, calm=0.17, sink=0.007, sides=6, sweep=0.25, lit=0.7,
                  steps=[(0.0, 0.0155), (0.42, 0.0155), (0.42, 0.0115), (0.7, 0.0115)]),
    # Fins are flat fans, narrow at the root: radii (wide, thin, long).
    'fin': dict(hinge=(0.122, -0.035, 0.118), radii=(0.024, 0.005, 0.032), hub=0.014, sweep=28),
    'dorsal': dict(base=(0, 0.075, 0.245), radii=(0.02, 0.0045, 0.022), lean=35),
    'keel': dict(base=(0, 0.08, 0.035), radii=(0.017, 0.0045, 0.018), lean=35),
    'tail': dict(root=(0, 0.13, 0.135), stalk=0.05, r=(0.034, 0.022), fan=(0.034, 0.0055, 0.036)),
    'ring': dict(major=0.026, minor=0.0055),
    # Little screws along the seam, and a pair of round cheek lamps by the screen.
    'screws': dict(alphas=(40, 60, 80, 100, 120, 140), r=0.0055),
    'cheek': dict(alpha=36, beta=112, r=(0.0115, 0.0045)),
    # Stepped collars round the spike bases, and a bezel ring round each lit tip.
    'collar': dict(r=(0.0195, 0.0165), h=(0.0035, 0.003), at=(0.0055, 0.0085)),
    'bezel': dict(r=0.0128, minor=0.0018),
    # Panel seams round the pod (y), gill vents behind the cheeks, a hatch under the belly.
    'panels': [0.108],
    'gill': dict(alpha=66, beta=78, n=3, gap=6, size=(0.0035, 0.0012, 0.011)),
    'hatch': dict(y=0.035, size=(0.026, 0.02), screw=0.0042),
    # Ribs on the fin blades, hinge pins, a rim round the belly plate, tail hub and bolts.
    'ribs': dict(n=3, r=0.0016),
    'tailhub': dict(r=0.0125, bolts=5),
}


def pod(name, grow=0.0):
    """The pod's shape: a superellipsoid lying along the fish, tapered toward the tail,
    with its turn applied so its own axes are the world's."""
    h = D['hull']
    wide, long, tall = (r * (1 + grow) for r in h['radii'])
    # Built along its own Z, which narrows with the taper; turned so that points to the tail.
    obj = kit.superellipsoid(name, (wide, tall, long), *h['e'], seg=(40, 56), taper=h['taper'],
                             location=h['center'], rotation=(-math.pi / 2, 0, 0))
    kit.apply_transforms(obj)
    return obj


def inside(p):
    """The pod's inside-outside function about its centre: 1 on the surface."""
    h = D['hull']
    wide, long, tall = h['radii']
    e1, e2 = h['e']
    x, y, z = p
    k = 1 - h['taper'] * (y / long) / 2
    return (abs(x / k / wide) ** (2 / e2) + abs(z / k / tall) ** (2 / e2)) ** (e2 / e1) + abs(y / long) ** (2 / e1)


def hull_point(direction):
    """Where a ray from the pod's centre meets its surface, and the outward normal."""
    d = Vector(direction).normalized()
    lo, hi = 0.0, 0.3
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if inside(d * mid) < 1 else (lo, mid)
    p = d * lo
    # The normal: the gradient of the inside-outside function, by small steps.
    eps = 1e-4
    g = Vector([(inside(p + Vector(a) * eps) - inside(p - Vector(a) * eps)) for a in ((1, 0, 0), (0, 1, 0), (0, 0, 1))])
    return Vector(D['hull']['center']) + p, g.normalized()


def ring_direction(alpha, beta):
    """alpha: degrees from the nose (-Y); beta: round the pod from the top, toward its left."""
    a, b = math.radians(alpha), math.radians(beta)
    return Vector((math.sin(a) * math.sin(b), -math.cos(a), math.sin(a) * math.cos(b)))


def clear_points():
    """Places no stud may sit: the fin hinges, the mouth, the dorsal and belly fins, the tail."""
    f, t = D['fin']['hinge'], D['tail']['root']
    return [((f[0], f[1], f[2]), 0.045), ((-f[0], f[1], f[2]), 0.045), (D['mouth']['center'], 0.04),
            (D['dorsal']['base'], 0.04), (D['keel']['base'], 0.04), (t, 0.05)]


def stud_lines():
    """(base, tip, band) for every spike, fully out: from just under the shell, pointing
    out of it and a little back."""
    sp = D['spike']
    out = []
    for band, (alpha, n, turn) in enumerate(D['rows']):
        for k in range(n):
            beta = 360 * (k + turn) / n
            q, normal = hull_point(ring_direction(alpha, beta))
            if any((q - Vector(p)).length < r for p, r in clear_points()):
                continue
            axis = (normal + Vector((0, sp['sweep'], 0))).normalized()
            base = q - normal * sp['sink']
            out.append((base, base + axis * sp['length'], band))
    return out


def seam_point(alpha, side):
    """Where the seam runs across the pod at `alpha` from the nose, on side +1 (left) or -1."""
    line = D['hull']['center'][2] + D['belly']
    lo, hi = 0.0, 180.0
    for _ in range(30):
        mid = (lo + hi) / 2
        q, n = hull_point(ring_direction(alpha, side * mid))
        lo, hi = (mid, hi) if q.z > line else (lo, mid)
    return q, n


def flat_on(name, q, n, radii, seg=16, e=0.6, rings=8):
    """A small round disc lying on the shell at q, facing along n."""
    z = n.normalized()
    x = z.cross(Vector((0, 0, 1)) if abs(z.z) < 0.9 else Vector((1, 0, 0))).normalized()
    y = z.cross(x)
    rot = Matrix((x, y, z)).transposed().to_euler()
    return kit.superellipsoid(name, radii, e, e, seg=(seg, rings), location=q, rotation=rot)


def stepped(name, base, tip, steps, sides, cone=None):
    """A faceted spike along base→tip: rings at (share of the length, radius), open at the
    base where it sits in the shell; `cone` closes it to a point at the tip."""
    a, b = Vector(base), Vector(tip)
    axis = (b - a).normalized()
    side = axis.cross(Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))).normalized()
    up = axis.cross(side)
    verts, faces = [], []
    for t, r in steps:
        q = a.lerp(b, t)
        verts += [tuple(q + (side * math.cos(2 * math.pi * k / sides) + up * math.sin(2 * math.pi * k / sides)) * r)
                  for k in range(sides)]
    for j in range(len(steps) - 1):
        o = j * sides
        faces += [(o + k, o + (k + 1) % sides, o + sides + (k + 1) % sides, o + sides + k) for k in range(sides)]
    if cone:
        o = (len(steps) - 1) * sides
        verts.append(tuple(b))
        faces += [(o + k, o + (k + 1) % sides, len(verts) - 1) for k in range(sides)]
    else:  # a flat cap
        o = (len(steps) - 1) * sides
        faces.append(tuple(o + k for k in range(sides)))
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def fan(name, root, direction, radii, thin, taper=1.0):
    """A fin: a flat rounded fan out of `root` along `direction`, narrow at the root and
    thin along `thin`. radii: (wide, thin, long)."""
    d = Vector(direction).normalized()
    n = Vector(thin)
    n = (n - d * n.dot(d)).normalized()
    # The shape narrows toward its own +Z: turn that to the root.
    z = -d
    x = n.cross(z)
    turn = Matrix((x, n, z)).transposed().to_euler()
    at = Vector(root) + d * radii[2] * 0.9
    return kit.superellipsoid(name, radii, 0.85, 0.5, seg=(28, 12), taper=taper, location=at, rotation=turn)


def rig_bones():
    c = Vector(D['hull']['center'])
    sc = Vector(D['screen']['center'])
    mo = Vector(D['mouth']['center'])
    f = D['fin']['hinge']
    t = Vector(D['tail']['root'])
    do, ke = Vector(D['dorsal']['base']), Vector(D['keel']['base'])
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # Turns and tilts about the middle of the pod.
        ('body', c, c + Vector((0, 0, 0.1)), 'root'),
        # The pod: scaled up to puff; everything on it rides out with it.
        ('shell', c, c + Vector((0, 0, 0.12)), 'body'),
        ('face', sc, sc + Vector((0, -0.05, 0)), 'shell'),
        ('mouth', mo, mo + Vector((0, -0.04, 0)), 'shell'),
        ('fin.L', f, (f[0] + 0.04, f[1], f[2]), 'shell'),
        ('fin.R', (-f[0], f[1], f[2]), (-f[0] - 0.04, f[1], f[2]), 'shell'),
        ('tail', t, t + Vector((0, 0.06, 0)), 'shell'),
        ('dorsal', do, do + Vector((0, 0, 0.04)), 'shell'),
        ('keel', ke, ke + Vector((0, 0, -0.04)), 'shell'),
        # Tucked inside the head until it's blown out of the mouth; on the body, not the
        # pod, so it keeps its size when the pod swells.
        ('ring', mo + Vector((0, 0.04, 0)), mo + Vector((0, 0.0, 0)), 'body'),
    ]
    for i, (base, tip, _) in enumerate(stud_lines()):
        bones.append((f'spike.{i}', base, tip, 'shell'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The pod: a shell over a pale belly plate, a seam between them.
    line = D['hull']['center'][2] + D['belly']
    add(kit.cut(pod('Hull'), (0, 0, 1), line), m['shell'], 'shell')
    add(kit.cut(pod('Belly'), (0, 0, -1), -line), m['role']('Belly'), 'shell')
    # The seam: a slice of a slightly bigger pod where the plates meet.
    sm = D['seam']
    seam = kit.cut(pod('Seam', sm['grow']), (0, 0, 1), line - sm['width'])
    add(kit.cut(seam, (0, 0, -1), -line - sm['width']), m['bezel'], 'shell')

    # Panel seams: thin bands round the pod, and a rim just below the belly plate's edge.
    for k, y0 in enumerate(D['panels']):
        ring = kit.cut(pod(f'Panel{k}', sm['grow'] * 0.7), (0, 1, 0), y0 - sm['width'] * 0.7)
        add(kit.cut(ring, (0, -1, 0), -(y0 + sm['width'] * 0.7)), m['bezel'], 'shell')
    rim = kit.cut(pod('Rim', sm['grow'] * 1.4), (0, 0, 1), line - sm['width'] * 0.5)
    add(kit.cut(rim, (0, 0, -1), -line - sm['width'] * 0.5), m['joint'], 'shell')

    # Face: the screen, and the mouth nozzle under it.
    sc = D['screen']
    glass, rim = kit.screen('Puffer', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')
    # The mouth: a short nozzle out of the shell (open at the front), a round lip, and
    # dark inside.
    mo = D['mouth']
    x, y, z = mo['center']
    r, lip, depth = mo['r'], mo['lip'], mo['depth']
    add(kit.lathe('Nozzle', [(r * 0.8, 0), (r, -depth * 0.4), (r * 0.95, -depth * 1.4), (0, -depth * 1.4)], seg=20,
                  location=(x, y, z), rotation=(math.pi / 2, 0, 0)), m['joint'], 'mouth')
    add(kit.torus('Lip', r - lip * 0.4, lip, seg=(24, 10), location=(x, y, z), rotation=(math.pi / 2, 0, 0)),
        m['joint'], 'mouth')
    add(kit.torus('Flange', r + lip * 2.2, lip * 0.7, seg=(28, 8), location=(x, y + 0.002, z),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'mouth')
    add(kit.superellipsoid('Gullet', (r * 0.8, 0.003, r * 0.8), seg=(20, 8), location=(x, y + depth * 0.4, z)),
        m['shell'], 'mouth')

    # Screws along the seam, and cheek lamps at either side of the screen.
    for i, a in enumerate(D['screws']['alphas']):
        for side in (1, -1):
            q, n = seam_point(a, side)
            r = D['screws']['r']
            add(flat_on(f'Screw{i}{side}', q + n * 0.0015, n, (r, r, r * 0.5), seg=10), m['joint'], 'shell')
    ck = D['cheek']
    for side in (1, -1):
        q, n = hull_point(ring_direction(ck['alpha'], side * ck['beta']))
        r, h = ck['r']
        add(flat_on(f'Cheek{side}', q, n, (r, r, h)), m['role']('Blush', 'bezel'), 'shell')

    # Gill vents: little stacks of dark slots behind each cheek.
    gl = D['gill']
    for side in (1, -1):
        for k in range(gl['n']):
            q, n = hull_point(ring_direction(gl['alpha'] + (k - 1) * gl['gap'], side * gl['beta']))
            add(flat_on(f'Gill{side}{k}', q, n, (gl['size'][2], gl['size'][0], gl['size'][1]), seg=10),
                m['joint'], 'shell')

    # A little hatch under the belly, four screws in its corners.
    ht = D['hatch']
    hw, hd = ht['size']
    cz = D['hull']['center'][2]
    bq, bn = hull_point((0, ht['y'] - D['hull']['center'][1], -1))
    add(kit.superellipsoid('Hatch', (hw, hd, 0.0028), 0.4, 0.4, seg=(20, 8), location=bq + Vector((0, 0, 0.0005))),
        m['bezel'], 'shell')
    add(kit.superellipsoid('HatchPlate', (hw * 0.78, hd * 0.72, 0.0034), 0.4, 0.4, seg=(20, 8),
                           location=bq + Vector((0, 0, 0.0009))), m['joint'], 'shell')
    for i, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
        add(kit.superellipsoid(f'HatchScrew{i}', (ht['screw'],) * 2 + (ht['screw'] * 0.5,), 0.6, 0.6, seg=(10, 6),
                               location=bq + Vector((sx * hw * 0.86, sy * hd * 0.8, -0.001))), m['joint'], 'shell')

    # Spikes, packed down into the shell until it puffs: stepped sleeves and a lit tip.
    sp = D['spike']
    for i, (base, tip, band) in enumerate(stud_lines()):
        tip = base.lerp(tip, sp['calm'])
        add(stepped(f'Spike.{i}', base, tip, sp['steps'], sp['sides']), m['role']('Spike', 'joint'), f'spike.{i}')
        axis = (tip - base).normalized()
        cl = D['collar']
        for j in range(2):
            add(flat_on(f'Collar{i}_{j}', base + axis * cl['at'][j], axis,
                        (cl['r'][j],) * 2 + (cl['h'][j],), seg=10, e=1.0, rings=5), m['bezel'] if j else m['joint'], 'shell')
        add(flat_on(f'Bezel{i}', tip - axis * 0.0008, axis,
                    (D['bezel']['r'],) * 2 + (0.0028,), seg=8, e=1.0, rings=4), m['bezel'], f'spike.{i}')
        add(stepped(f'SpikeTip.{i}', base.lerp(tip, sp['lit']), tip, [(0, sp['steps'][-1][1] * 0.98)], sp['sides'],
                    cone=True), m['dot'](band), f'spike.{i}')

    # Fins: a hub on each side with a small fan, swept back; one on top, one underneath.
    fn = D['fin']
    fin = m['role']('Fin', 'joint')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        hx, hy, hz = fn['hinge']
        add(kit.superellipsoid(f'Hub.{sfx}', (fn['hub'],) * 3, 0.6, 0.6, seg=(20, 12), location=(side * hx, hy, hz)),
            m['bezel'], f'fin.{sfx}')
        sweep = math.radians(fn['sweep'])
        out = (side * math.cos(sweep), math.sin(sweep), 0)
        add(fan(f'Fin.{sfx}', (side * hx, hy, hz), out, fn['radii'], (0, 1, 0)), fin, f'fin.{sfx}')
        # Hinge pin through the hub, and ribs fanning over the blade.
        add(kit.superellipsoid(f'Pin.{sfx}', (fn['hub'] * 0.45, fn['hub'] * 0.45, fn['hub'] * 0.32), 0.7, 0.7,
                               seg=(12, 6), location=(side * (hx + fn['hub'] * 0.75), hy - 0.003, hz),
                               rotation=(0, side * math.pi / 2, 0)), m['joint'], f'fin.{sfx}')
        for k in range(D['ribs']['n']):
            a = (k - 1) * 0.5
            d = Vector((math.cos(sweep) * math.cos(a) * side, math.sin(sweep) + math.sin(a) * 0.9, 0)).normalized()
            L = fn['radii'][2] * 0.85
            add(kit.superellipsoid(f'FinRib.{sfx}{k}', (D['ribs']['r'], 0.0064, L / 2), 0.7, 0.7, seg=(8, 6),
                                   location=Vector((side * hx, hy, hz)) + d * (fn['hub'] + L / 2 * 0.9),
                                   rotation=Vector((0, 0, 1)).rotation_difference(d).to_euler()), m['bezel'],
                f'fin.{sfx}')
    for key, up in (('dorsal', 1), ('keel', -1)):
        d = D[key]
        lean = math.radians(d['lean'])
        add(fan(key.capitalize(), d['base'], (0, math.sin(lean), up * math.cos(lean)), d['radii'], (1, 0, 0)), fin,
            key)

    # Tail: a short stalk with a ring round it, and a round fan.
    t = D['tail']
    tx, ty, tz = t['root']
    r0, r1 = t['r']
    add(kit.lathe('Stalk', [(0, 0), (r0, 0), (r0 * 0.92, -t['stalk'] * 0.5), (r1, -t['stalk']), (0, -t['stalk'])],
                  seg=20, location=(tx, ty - 0.01, tz), rotation=(math.pi / 2, 0, 0)), m['joint'], 'tail')
    add(kit.torus('Collar', r0 * 0.95, 0.005, seg=(24, 8), location=(tx, ty + t['stalk'] * 0.35, tz),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'tail')
    add(fan('Tail', (tx, ty + t['stalk'] - 0.015, tz), (0, 1, 0), t['fan'], (1, 0, 0), taper=1.2), fin, 'tail')

    # Tail fan: a hub disc with bolts at its root, and ribs along the blade.
    th = D['tailhub']
    fy = ty + t['stalk'] - 0.015
    add(kit.superellipsoid('TailHub', (th['r'],) * 2 + (0.004,), 0.8, 0.8, seg=(16, 8), location=(tx, fy, tz),
                           rotation=(math.pi / 2, 0, 0)), m['bezel'], 'tail')
    for i in range(th['bolts']):
        a = 2 * math.pi * i / th['bolts']
        add(kit.superellipsoid(f'TailBolt{i}', (0.0022,) * 2 + (0.0016,), 0.6, 0.6, seg=(8, 6),
                               location=(tx + math.cos(a) * th['r'] * 0.6, fy - 0.0025, tz + math.sin(a) * th['r'] * 0.6),
                               rotation=(math.pi / 2, 0, 0)), m['joint'], 'tail')
    for k in range(5):
        a = (k - 2) * 0.42
        d = Vector((0, math.cos(a), math.sin(a)))
        L = 0.05 - abs(k - 2) * 0.004
        for sx in (1, -1):
            add(kit.superellipsoid(f'TailRib{k}_{sx}', (0.0017, 0.0017, L / 2), 0.7, 0.7, seg=(8, 6),
                                   location=Vector((tx + sx * 0.0052, fy + 0.006, tz)) + d * (L / 2),
                                   rotation=Vector((0, 0, 1)).rotation_difference(d).to_euler()), m['bezel'], 'tail')

    # The ring it blows, tucked away behind the mouth.
    rg = D['ring']
    add(kit.torus('Ring', rg['major'], rg['minor'], seg=(28, 8), location=Vector(mo['center']) + Vector((0, 0.04, 0)),
                  rotation=(math.pi / 2, 0, 0)), m['beacon'], 'ring')

    return looks.finish(kit.armature('PufferRig', rig_bones()), parts, skin, m)
