"""Quill, the crew's robot hedgehog: a toy robot, not a hedgehog in a robot suit. A low
chassis on four little wheels, a chunky dome on top with a few rows of big faceted
spikes set out neatly (a machine's idea of spines), and a boxy head with a screen face,
a short snub muzzle with a button nose and two round bolts for ears.

Every spike has a light in its tip. The tips come in five bands from head to tail,
each band its own material (Dot0 at the head to Dot4 at the tail), so the site can
ripple, blink and colour them band by band. The dome and its spikes ride on one bone
(so the site can puff them up), the wheels on their own (so they turn), and the body
bone pivots on the back axle, for wheelies. Faces -Y like the rest of the crew; about
0.3 m to the top spike.

Detail: each spike is a tapered steel shaft with a base collar and a mid collar under its
lit tip; the dome has a seam ring and a top plate; the snout has a lit nose and whisker
nubs; the ears are rimmed pucks on their own bones; the wheels have hubs, spokes and
tread lugs; the chassis has a belly plate, bumpers, bolts and a tail light (Dot4). The
spikes ride in five bands on bones quill.0..4 (head to tail) so a ripple can lift them.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'hedgehog'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'chassis': dict(radii=(0.13, 0.17, 0.028), center=(0, 0.02, 0.058), e=0.3),
    # The dome is the top half of this shape, sitting on the chassis; a band round its foot.
    'dome': dict(radii=(0.15, 0.185, 0.15), center=(0, 0.03, 0.075), e=0.55),
    'band': dict(radii=(0.156, 0.19, 0.012), center=(0, 0.03, 0.078)),
    # Spikes in rows: (elevation, how many, spread round the back), degrees. Azimuth 0
    # is straight back; low down the front is left clear for the head, higher up the
    # rows go all the way round, so spikes stand up behind and over it.
    'rows': [(8, 13, 300), (25, 14, 312), (42, 13, 316), (59, 11, 360), (75, 7, 360), (90, 1, 0)],
    'spike': dict(length=0.12, radius=0.024, sweep=(0, 1.0, 0.3), lit=0.62, bands=5, sides=6),
    'head': dict(radii=(0.105, 0.095, 0.085), center=(0, -0.165, 0.145), e=0.4),
    # 2:1, like the hedgehog's face layout (512 x 256)
    'screen': dict(radii=(0.078, 0.02, 0.039), center=(0, -0.252, 0.16), bezel=0.008),
    'muzzle': dict(radii=(0.042, 0.04, 0.03), center=(0, -0.262, 0.09), e=0.5),
    'nose': dict(radii=(0.017, 0.012, 0.014), center=(0, -0.3, 0.098)),
    'ears': dict(x=0.066, y=-0.15, z=0.238, radii=(0.03, 0.03, 0.012)),
    # A toy ball, parked inside the chassis until he wants to play (the site slides it out).
    'ball': dict(r=0.03, center=(0, 0.02, 0.058)),
    'wheels': dict(x=0.108, front=-0.085, back=0.12, r=0.032, width=0.012, lugs=12, spokes=5),
}


def spike_lines():
    """(base, tip, band) for every spike: on the dome, pointing out and a little back."""
    d, sp = D['dome'], D['spike']
    rx, ry, rz = d['radii']
    cx, cy, cz = d['center']
    out = []
    for el, n, spread in D['rows']:
        e = math.radians(el)
        for k in range(n):
            if n == 1:
                az = 0.0
            elif spread >= 360:  # a full ring: evenly round, staggered off the row below
                az = math.radians(360 * (k + 0.5) / n)
            else:
                az = math.radians(-spread / 2 + spread * k / (n - 1))
            u = Vector((math.sin(az) * math.cos(e), math.cos(az) * math.cos(e), math.sin(e)))
            normal = Vector((u.x / rx, u.y / ry, u.z / rz)).normalized()
            base = Vector((cx + rx * u.x, cy + ry * u.y, cz + rz * u.z)) - normal * 0.012
            tip = base + (normal + Vector(sp['sweep'])).normalized() * sp['length']
            out.append((base, tip))
    # Bands from the frontmost spike to the rearmost.
    front, back = min(q.y for q, _ in out), max(q.y for q, _ in out)
    return [(q, t, min(sp['bands'] - 1, int((q.y - front) / (back - front) * sp['bands']))) for q, t in out]


def faceted(name, points, radii, sides):
    """A faceted spike through the points (a radius of 0 makes the point), open at the
    base where it sits in the dome, flat-shaded so the facets catch the light."""
    pts = [Vector(q) for q in points]
    axis = (pts[-1] - pts[0]).normalized()
    side = axis.cross(Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))).normalized()
    up = axis.cross(side)
    verts, faces = [], []
    for q, r in zip(pts, radii):
        if r == 0:
            verts.append(tuple(q))
        else:
            verts += [tuple(q + (side * math.cos(2 * math.pi * k / sides) + up * math.sin(2 * math.pi * k / sides)) * r)
                      for k in range(sides)]
    for j in range(len(pts) - 1):
        a = j * sides
        if radii[j + 1] == 0:
            faces += [(a + k, a + (k + 1) % sides, a + sides) for k in range(sides)]
        else:
            faces += [(a + k, a + (k + 1) % sides, a + sides + (k + 1) % sides, a + sides + k) for k in range(sides)]
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


# A spike's profile: (fraction of the way base to tip, radius as a share of its radius).
# It starts inside the dome (negative), so a band can lift without showing a gap.
SHAFT = [(-0.25, 1.0), (0.0, 1.0), (0.02, 1.0), (0.03, 1.22), (0.09, 1.22), (0.10, 1.0), (0.36, 0.78),
         (0.37, 0.98), (0.41, 0.98), (0.42, 0.68), (0.62, 0.4)]


def box(cx, cy, cz, sx, sy, sz, turn=0.0):
    """Verts and faces of a box about a centre, turned about the X axis (wheel spokes)."""
    c, s_ = math.cos(turn), math.sin(turn)
    verts = []
    for dx in (-1, 1):
        for dy in (-1, 1):
            for dz in (-1, 1):
                y, z = dy * sy, dz * sz
                verts.append((cx + dx * sx, cy + y * c - z * s_, cz + y * s_ + z * c))
    idx = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return verts, idx


def boxes(name, items, location=(0, 0, 0)):
    """One flat-shaded mesh out of several boxes (cx, cy, cz, sx, sy, sz, turn)."""
    verts, faces = [], []
    for it in items:
        v, f = box(*it)
        faces += [tuple(i + len(verts) for i in q) for q in f]
        verts += v
    obj = kit.mesh_object(name, verts, faces, location)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def wheel_centres():
    w = D['wheels']
    return [(name, (x * w['x'], y, w['r'])) for name, x, y in
            (('FL', 1, w['front']), ('FR', -1, w['front']), ('BL', 1, w['back']), ('BR', -1, w['back']))]


def rig_bones():
    w = D['wheels']
    cx, cy, cz = D['dome']['center']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # Pivots on the back axle, so a wheelie lifts the front.
        ('body', (0, w['back'], w['r']), (0, w['front'], w['r']), 'root'),
        ('dome', (cx, cy, cz), (cx, cy, cz + 0.15), 'body'),
        ('head', (0, -0.12, 0.12), (0, -0.3, 0.12), 'body'),
        ('ball', D['ball']['center'], (D['ball']['center'][0], D['ball']['center'][1], D['ball']['center'][2] + 0.03), 'root'),
        ('nose', (0, -0.27, 0.095), (0, -0.31, 0.095), 'head'),
        ('ear.L', (D['ears']['x'], D['ears']['y'], D['ears']['z'] - 0.02), (D['ears']['x'], D['ears']['y'], D['ears']['z'] + 0.03), 'head'),
        ('ear.R', (-D['ears']['x'], D['ears']['y'], D['ears']['z'] - 0.02), (-D['ears']['x'], D['ears']['y'], D['ears']['z'] + 0.03), 'head'),
    ]
    # Spikes in five bands, head to tail, each on its own bone above the dome's.
    for i in range(D['spike']['bands']):
        bones.append((f'quill.{i}', (cx, cy, cz), (cx, cy, cz + 0.15), 'dome'))
    for name, (x, y, z) in wheel_centres():
        bones.append((f'wheel.{name}', (x, y, z), (x + math.copysign(0.03, x), y, z), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Chassis, dome and the band round its foot.
    c = D['chassis']
    add(kit.superellipsoid('Chassis', c['radii'], c['e'], 0.45, seg=(48, 16), location=c['center']), m['joint'],
        'body')
    d = D['dome']
    dome = kit.superellipsoid('Dome', d['radii'], d['e'], 0.8, seg=(56, 40), location=d['center'])
    kit.cut(dome, (0, 0, 1), 0.0)
    add(dome, m['role']('Dome'), 'dome')
    b = D['band']
    add(kit.superellipsoid('Band', b['radii'], 0.3, 0.8, seg=(56, 8), location=b['center']), m['bezel'], 'dome')

    # Spikes: a collared steel shaft and a lit tip, one mesh each, in five bands.
    sp = D['spike']
    r = sp['radius']
    lit_r = r * (1 - sp['lit']) * 1.08
    for i, (base, tip, band) in enumerate(spike_lines()):
        ax = tip - base
        shaft = [base + ax * t for t, _ in SHAFT]
        add(faceted(f'Spike.{i}', shaft, [r * k for _, k in SHAFT], sp['sides']), m['role']('Spike', 'joint'),
            f'quill.{band}')
        add(faceted(f'SpikeTip.{i}', [base + ax * 0.62, tip], [r * 0.4, 0], sp['sides']), m['dot'](band),
            f'quill.{band}')

    # A seam ring round the dome between two rows of spikes, and a plate on top.
    d = D['dome']
    rx, ry, rz = d['radii']
    el = math.radians(50.5)
    ring = kit.torus('Seam', rx * math.cos(el) ** d['e'] * 1.005, 0.0035, seg=(56, 6),
                     location=(d['center'][0], d['center'][1], d['center'][2] + rz * math.sin(el) ** d['e']))
    kit.stretch(ring, 1.0, ry / rx, 1.0)
    add(ring, m['bezel'], 'dome')

    # Head: screen face, snub muzzle with a button nose, bolt ears.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(40, 28), location=h['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Hedgehog', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    mz, n = D['muzzle'], D['nose']
    add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(28, 18), location=mz['center']), m['shell'],
        'head')
    add(kit.superellipsoid('Nose', n['radii'], 0.6, 0.8, seg=(18, 12), location=n['center']), m['beacon'], 'nose')
    # Whisker nubs: three little studs each side of the muzzle.
    for side in (1, -1):
        for k, dz in enumerate((-0.012, 0.0, 0.012)):
            x0, x1 = side * 0.034, side * (0.05 + 0.004 * (1 - abs(k - 1)))
            z0 = mz['center'][2] + dz
            add(kit.tube(f'Whisker.{side}.{k}', [(x0, -0.28, z0), (x1, -0.287, z0 + dz * 0.8)], [0.0022, 0.0022], ring=6)[0],
                m['bezel'], 'nose')
            add(kit.superellipsoid(f'Nub.{side}.{k}', (0.0045, 0.0045, 0.0045), seg=(10, 6),
                                   location=(x1, -0.287, z0 + dz * 0.8)), m['bezel'], 'nose')
    # Head details: top plate, hinge pins, cheek vents.
    hc = h['center']
    add(kit.superellipsoid('HeadPlate', (0.05, 0.042, 0.008), 0.3, 0.5, seg=(24, 8),
                           location=(0, hc[1] - 0.005, hc[2] + h['radii'][2] - 0.004)), m['bezel'], 'head')
    add(boxes('Vents', [(side * 0.103, -0.165 + dy, 0.145, 0.004, 0.0035, 0.024, 0) for side in (1, -1)
                        for dy in (0.0, 0.016, 0.032)]), m['bezel'], 'head')
    add(boxes('Pins', [(side * 0.107, -0.11, 0.185, 0.004, 0.006, 0.006, 0) for side in (1, -1)]), m['bezel'], 'head')
    e = D['ears']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        at = (side * e['x'], e['y'], e['z'])
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], 0.3, 1.0, seg=(24, 10), location=at,
                               rotation=(math.pi / 2, 0, 0)), m['joint'], f'ear.{sfx}')
        add(kit.torus(f'EarRim.{sfx}', e['radii'][0] * 0.98, 0.0035, seg=(28, 6), location=(at[0], at[1] - 0.011, at[2]),
                      rotation=(math.pi / 2, 0, 0)), m['bezel'], f'ear.{sfx}')
        add(kit.superellipsoid(f'EarBolt.{sfx}', (0.008, 0.008, 0.005), seg=(12, 6),
                               location=(at[0], at[1] - 0.013, at[2]), rotation=(math.pi / 2, 0, 0)), m['shell'],
            f'ear.{sfx}')

    # The ball, with a band round it and a stud at each pole.
    bl = D['ball']
    add(kit.superellipsoid('Ball', (bl['r'],) * 3, 1.0, 1.0, seg=(20, 14), location=bl['center']), m['shell'], 'ball')
    add(kit.torus('BallBand', bl['r'] * 1.0, 0.004, seg=(24, 6), location=bl['center'], rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'ball')

    # Wheels: a tyre, a hub, and a bolt off-centre so you can see them turn.
    w = D['wheels']
    for name, (x, y, z) in wheel_centres():
        out = math.copysign(1, x)
        add(kit.superellipsoid(f'Wheel.{name}', (w['r'], w['r'], w['width']), 0.3, 1.0, seg=(28, 8), location=(x, y, z),
                               rotation=(0, math.pi / 2, 0)), m['joint'], f'wheel.{name}')
        add(kit.superellipsoid(f'Hub.{name}', (w['r'] * 0.5, w['r'] * 0.5, w['width'] * 0.6), 0.3, 1.0, seg=(20, 6),
                               location=(x + out * w['width'] * 0.7, y, z), rotation=(0, math.pi / 2, 0)),
            m['bezel'], f'wheel.{name}')
        add(kit.superellipsoid(f'Bolt.{name}', (0.006, 0.006, 0.004), seg=(10, 6),
                               location=(x + out * w['width'] * 1.2, y, z + w['r'] * 0.55), rotation=(0, math.pi / 2, 0)),
            m['shell'], f'wheel.{name}')

        # Tread lugs round the tyre and spokes across the hub.
        lugs = [(0, r_ * math.sin(a), r_ * math.cos(a), w['width'] * 1.02, 0.006, 0.0035, -a)
                for a in (2 * math.pi * k / w['lugs'] for k in range(w['lugs'])) for r_ in (w['r'] + 0.001,)]
        add(boxes(f'Tread.{name}', lugs, (x, y, z)), m['bezel'], f'wheel.{name}')
        spokes = [(out * w['width'] * 1.05, 0, 0, 0.0015, w['r'] * 0.46, 0.0035, math.pi * k / w['spokes'])
                  for k in range(w['spokes'])]
        add(boxes(f'Spokes.{name}', spokes, (x, y, z)), m['shell'], f'wheel.{name}')

    # Chassis: belly plate, side stripes, bumpers with bolts, and a tail light.
    add(kit.superellipsoid('Belly', (0.095, 0.14, 0.006), 0.3, 0.4, seg=(32, 8), location=(0, 0.02, 0.031)),
        m['bezel'], 'body')
    add(boxes('Stripes', [(side * 0.1225, 0.02 + dy, 0.058, 0.002, 0.022, 0.004, 0) for side in (1, -1)
                          for dy in (-0.08, 0.0, 0.08)]), m['bezel'], 'body')
    add(kit.superellipsoid('Bumper', (0.09, 0.014, 0.013), 0.4, 0.4, seg=(28, 10), location=(0, -0.158, 0.052)),
        m['bezel'], 'body')
    add(boxes('BumperBolts', [(side * 0.07, -0.171, 0.052, 0.005, 0.002, 0.005, 0) for side in (1, -1)]),
        m['shell'], 'body')
    add(kit.superellipsoid('Rear', (0.07, 0.012, 0.011), 0.4, 0.4, seg=(28, 10), location=(0, 0.198, 0.052)),
        m['bezel'], 'body')
    add(kit.superellipsoid('TailLight', (0.045, 0.004, 0.005), 0.4, 0.4, seg=(20, 6), location=(0, 0.208, 0.052)),
        m['dot'](4), 'body')

    return looks.finish(kit.armature('HedgehogRig', rig_bones()), parts, skin, m)
