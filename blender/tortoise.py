"""Ohm, the crew's robot tortoise: a toy robot, not a tortoise in a robot suit. A high
dome of a shell like a helmet, built from chunky raised scute plates set out in three
neat rings round a hatch on top, each plate with a bolt in its middle and a trim band
round its foot. The hatch is a lens (Dot0) with six lit bolts round it (Dot1..Dot6, the
inner ring of plates), and a little birthday candle stands folded away in it.

Four stumpy legs like an elephant's, each a thick stub with two wrinkle rings, a flat
foot and three toenails. A neck of four ribbed rings on a chain of bones that slide (it
telescopes out and in), a head with a wide screen for sleepy, wise eyes under a brow
ridge, a small beak, a tail stub. The shell has a flat belly plate under it, for when
it is rolled over.

Hidden inside, for the acts: a leaf that hangs from the beak, three speed lines behind
the shell, and the candle. All scaled to nothing until an act calls them up. Faces -Y like
the rest of the crew; about 0.21 m from the feet to the top of the shell.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'tortoise'
PREVIEW = dict(lift=0.0, width=0.4)

D = {
    'shell': dict(radii=(0.155, 0.185, 0.13), center=(0, 0.01, 0.075), e1=0.7, e2=0.9, cut=0.07),
    # Plate rings, in shares of the shell's footprint (0 middle, 1 rim): (from, to, how many,
    # turn in sectors). The plate at the front of the outer ring is left out for the neck.
    'rings': [(0.25, 0.52, 6, 0.5), (0.55, 0.77, 12, 0.0), (0.8, 0.97, 18, 0.5)],
    'plate': dict(gap=0.012, lift=0.012, inset=0.6),
    'band': dict(radii=(0.16, 0.19, 0.013), center=(0, 0.01, 0.076)),
    'plastron': dict(radii=(0.14, 0.17, 0.011), center=(0, 0.01, 0.062)),
    'hatch': dict(ring=0.04, tube=0.008, lens=(0.03, 0.03, 0.011)),
    'candle': dict(base=0.012, height=0.04, r=0.0065),
    'head': dict(radii=(0.058, 0.055, 0.05), center=(0, -0.265, 0.105), e=0.7),
    # 2:1, like the tortoise's face layout (512 x 256)
    'screen': dict(radii=(0.044, 0.018, 0.022), center=(0, -0.313, 0.108), bezel=0.007),
    'brow': dict(radii=(0.046, 0.012, 0.008), center=(0, -0.297, 0.14)),
    'beak': dict(radii=(0.021, 0.014, 0.01), center=(0, -0.31, 0.072)),
    'neck': dict(ys=(-0.183, -0.195, -0.207, -0.219), z=0.105, r=0.037, core=0.031, thick=0.0095),
    'leg': dict(x=0.105, front=-0.085, back=0.115, top=0.095, bottom=0.03, r=0.036),
    'foot': dict(radii=(0.046, 0.052, 0.016), z=0.016),
    'tail': dict(radii=(0.02, 0.032, 0.018), center=(0, 0.215, 0.085)),
}
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def surface(x, y):
    """Height of the shell's top at (x, y): the superellipsoid's own formula."""
    s = D['shell']
    rx, ry, rz = s['radii']
    cx, cy, cz = s['center']
    r = (abs((x - cx) / rx) ** (2 / s['e2']) + abs((y - cy) / ry) ** (2 / s['e2'])) ** (s['e2'] / 2)
    if r >= 1:
        return cz
    return cz + rz * (1 - r ** (2 / s['e1'])) ** (s['e1'] / 2)


def spot(rho, t):
    """Where a point at `rho` of the way out to the rim, at angle t, is in plan."""
    s = D['shell']
    rx, ry, _ = s['radii']
    return (rho * rx * kit.spow(math.cos(t), s['e2']), s['center'][1] + rho * ry * kit.spow(math.sin(t), s['e2']))


def flat(obj):
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def plate_polys():
    """Every plate as (ring, index, centre, outline in plan), outlines with mid-edge points."""
    out = []
    g = D['plate']['gap']
    for ri, (r0, r1, n, turn) in enumerate(D['rings']):
        for k in range(n):
            if ri == 2 and k == 0 and False:
                continue
            t0 = 2 * math.pi * (k + turn - 0.5 + 0.5) / n - math.pi / 2 - math.pi / n
            t1 = t0 + 2 * math.pi / n
            ta, tb = t0 + g * 4 / (n / 6) * 0.5, t1 - g * 4 / (n / 6) * 0.5
            ra, rb = r0 + g * 0.6, r1 - g * 0.6
            tm = (ta + tb) / 2
            rm = (ra + rb) / 2
            ring = [(ra, ta), (ra, tm), (ra, tb), (rm, tb), (rb, tb), (rb, tm), (rb, ta), (rm, ta)]
            if ri == 0:  # the inner ring is a hexagon's worth of wedges: pointed at the hatch
                ring = [(ra, ta), (ra, tb), (rb, tb), (rb, tm), (rb, ta)]
            pts = [spot(a, b) for a, b in ring]
            centre = spot(rm, tm)
            out.append((ri, k, centre, pts, tm))
    return out


def plates(polys, ring):
    p = D['plate']
    verts, faces = [], []
    for ri, k, c, pts, tm in polys:
        if ri != ring:
            continue
        if ri == 2 and abs(math.sin(tm - (-math.pi / 2)) ) < 0.2 and math.cos(tm - (-math.pi / 2)) > 0.8:
            continue  # the neck comes out here
        n = len(pts)
        base = len(verts)
        for x, y in pts:
            verts.append((x, y, surface(x, y) - 0.004))
        for x, y in pts:
            ix, iy = c[0] + (x - c[0]) * p['inset'], c[1] + (y - c[1]) * p['inset']
            verts.append((ix, iy, surface(ix, iy) + p['lift']))
        for j in range(n):
            q = (j + 1) % n
            faces.append((base + j, base + q, base + n + q, base + n + j))
        faces.append(tuple(base + n + j for j in range(n - 1, -1, -1)))
    return flat(kit.mesh_object(f'Scutes{ring}', verts, faces))


def add_skirt(add, m):
    """A ring of chunky blocks up the shell's wall, each with a bolt, left open at the front."""
    s = D['shell']
    rx, ry, _ = s['radii']
    cy, e = s['center'][1], s['e2']
    dense = [(rx * kit.spow(math.cos(2 * math.pi * i / 720), e), cy + ry * kit.spow(math.sin(2 * math.pi * i / 720), e))
             for i in range(720)]
    lengths = [0.0]
    for a, b in zip(dense, dense[1:] + dense[:1]):
        lengths.append(lengths[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    n = 24
    j = 0
    for k in range(n):
        d = lengths[-1] * (k + 0.5) / n
        while lengths[j + 1] < d:
            j += 1
        a, b = dense[j], dense[(j + 1) % 720]
        heading = math.atan2(b[1] - a[1], b[0] - a[0])
        if a[1] < cy - ry * 0.8 and abs(a[0]) < 0.05:
            continue  # the neck comes out here
        out = Vector((math.sin(heading), -math.cos(heading), 0))
        base = Vector((a[0], a[1], 0.098))
        add(kit.superellipsoid(f'Skirt.{k}', (0.0195, 0.014, 0.03), 0.4, 0.5, seg=(14, 8), location=tuple(base + out * 0.004),
                               rotation=(0, 0, heading)), m['role']('Scute'), 'shell')
        add(kit.superellipsoid(f'SkirtBolt.{k}', (0.006, 0.006, 0.004), 0.5, 1.0, seg=(10, 6),
                               location=tuple(base + out * 0.017), rotation=(0, 0, heading + math.pi / 2)) if False else
            kit.superellipsoid(f'SkirtBolt.{k}', (0.005, 0.005, 0.005), seg=(10, 6), location=tuple(base + out * 0.018)),
            m['joint'], 'shell')


def rig_bones():
    d, n, lg = D['head'], D['neck'], D['leg']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.09), (0, -0.06, 0.09), 'root'),
        ('shell', (0, 0.01, 0.075), (0, 0.01, 0.2), 'body'),
        ('candle', (0, 0.01, 0.2), (0, 0.01, 0.24), 'shell'),
        ('flame', (0, 0.01, 0.24), (0, 0.01, 0.265), 'candle'),
        ('tail', (0, 0.19, 0.085), (0, 0.25, 0.08), 'body'),
        ('lines', (0, 0.2, 0.1), (0, 0.3, 0.1), 'body'),
    ]
    parent = 'body'
    for i, y in enumerate(n['ys']):
        name = f'neck.{i + 1}'
        bones.append((name, (0, y, n['z']), (0, y - 0.012, n['z']), parent))
        parent = name
    bones.append(('head', (0, -0.225, n['z']), (0, -0.32, n['z']), parent))
    bones.append(('leaf', (0, -0.32, 0.075), (0, -0.32, 0.03), 'head'))
    for name, sx, which in LEGS:
        y = lg[which]
        bones.append((f'leg.{name}', (sx * lg['x'], y, lg['top']), (sx * lg['x'], y, 0.02), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The dome, dark under its plates so the seams read; a trim band round its foot.
    s = D['shell']
    dome = kit.superellipsoid('Dome', s['radii'], s['e1'], s['e2'], seg=(56, 32), location=s['center'])
    kit.cut(dome, (0, 0, 1), s['cut'] - s['center'][2])
    add(dome, m['bezel'], 'shell')
    add_skirt(add, m)
    b = D['band']
    add(kit.superellipsoid('Band', b['radii'], 0.3, 0.9, seg=(56, 8), location=b['center']), m['joint'], 'shell')

    # Scutes: three rings of plates, a bolt on each; the inner ring's bolts are the lights.
    polys = plate_polys()
    for ring in range(3):
        add(plates(polys, ring), m['role']('Scute'), 'shell')
    inner = 0
    for ri, k, c, pts, tm in polys:
        if ri == 2 and abs(math.sin(tm - (-math.pi / 2))) < 0.2 and math.cos(tm - (-math.pi / 2)) > 0.8:
            continue
        z = surface(*c) + D['plate']['lift'] * (0.6 if ri == 0 else 0.8)
        if ri == 0:
            # Lit bolts round the hatch, from the front clockwise.
            add(kit.superellipsoid(f'Light.{inner}', (0.0115, 0.0115, 0.008), 0.5, 1.0, seg=(16, 8), location=(*c, z + 0.004)),
                m['dot'](1 + inner), 'shell')
            inner += 1
        else:
            r = 0.008 if ri == 1 else 0.006
            add(kit.superellipsoid(f'Bolt.{ri}.{k}', (r, r, r * 0.6), 0.5, 1.0, seg=(12, 6), location=(*c, z + 0.002)),
                m['joint'], 'shell')

    # The hatch: a ring, a lens that glows, and the candle folded inside it.
    h = D['hatch']
    top = surface(0, s['center'][1])
    add(kit.torus('Hatch', h['ring'], h['tube'], seg=(40, 8), location=(0, s['center'][1], top - 0.001)), m['joint'],
        'shell')
    add(kit.superellipsoid('Lens', h['lens'], 0.4, 1.0, seg=(32, 10), location=(0, s['center'][1], top - 0.002)),
        m['dot'](0), 'shell')
    cd = D['candle']
    stem, _ = kit.tube('Candle', [(0, s['center'][1], top - 0.002), (0, s['center'][1], top + cd['height'])], cd['r'],
                       ring=10)
    add(stem, m['role']('Candle', 'joint'), 'candle')
    add(kit.lathe('Flame', [(0.0, top + cd['height'] + 0.03), (0.0055, top + cd['height'] + 0.02),
                            (0.0075, top + cd['height'] + 0.01), (0.005, top + cd['height'] + 0.003),
                            (0.0, top + cd['height'] + 0.001)], seg=10, location=(0, s['center'][1], 0)),
        m['flame'], 'flame')

    # The belly plate, with a seam down it and four bolts.
    pl = D['plastron']
    add(kit.superellipsoid('Plastron', pl['radii'], 0.3, 0.8, seg=(40, 10), location=pl['center']), m['joint'], 'shell')
    add(kit.superellipsoid('Seam', (0.008, 0.16, 0.003), 0.4, 0.5, seg=(12, 6),
                           location=(0, pl['center'][1], pl['center'][2] - pl['radii'][2])), m['bezel'], 'shell')

    # Head: a rounded dome, a wide screen, a brow ridge, a beak.
    hd = D['head']
    add(kit.superellipsoid('Head', hd['radii'], hd['e'], hd['e'], seg=(40, 28), location=hd['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Tortoise', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    br = D['brow']
    add(kit.superellipsoid('Brow', br['radii'], 0.4, 0.7, seg=(24, 8), location=br['center']), m['joint'], 'head')
    bk = D['beak']
    add(kit.superellipsoid('Beak', bk['radii'], 0.4, 0.6, seg=(20, 10), location=bk['center']), m['bezel'], 'head')
    add(kit.superellipsoid('Leaf', (0.014, 0.0035, 0.026), 0.7, 0.7, seg=(16, 10), location=(0, -0.327, 0.055)),
        m['role']('Leaf'), 'leaf')
    add(kit.superellipsoid('Vein', (0.0025, 0.0045, 0.022), 0.5, 0.5, seg=(8, 6), location=(0, -0.329, 0.055)),
        m['joint'], 'leaf')

    # Neck: four ribbed rings, each with a piece of core, on a chain of bones.
    n = D['neck']
    for i, y in enumerate(n['ys']):
        bone = f'neck.{i + 1}'
        add(kit.superellipsoid(f'Rib.{i}', (n['r'], n['r'], n['thick']), 0.4, 1.0, seg=(28, 8), location=(0, y, n['z']),
                               rotation=(math.pi / 2, 0, 0)), m['joint'], bone)
        add(kit.superellipsoid(f'Core.{i}', (n['core'], n['core'], 0.0095), 0.35, 1.0, seg=(20, 6),
                               location=(0, y - 0.006, n['z']), rotation=(math.pi / 2, 0, 0)), m['bezel'], bone)
    # A collar where the neck comes out of the shell.
    add(kit.torus('Collar', 0.047, 0.0085, seg=(32, 8), location=(0, -0.168, n['z']), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'shell')

    # Legs: a thick stub with two wrinkle rings, a flat foot, three toenails in front.
    lg, ft = D['leg'], D['foot']
    for name, sx, which in LEGS:
        x, y = sx * lg['x'], lg[which]
        bone = f'leg.{name}'
        stub, _ = kit.tube(f'Leg.{name}', [(x, y, lg['top']), (x, y, lg['bottom'])], lg['r'], ring=16)
        add(stub, m['role']('Leg'), bone)
        for z in (0.045, 0.06):
            add(kit.torus(f'Wrinkle.{name}.{z}', lg['r'] + 0.001, 0.0055, seg=(28, 6), location=(x, y, z)),
                m['bezel'], bone)
        add(kit.superellipsoid(f'Foot.{name}', ft['radii'], 0.4, 0.9, seg=(28, 8), location=(x, y, ft['z'])),
            m['bezel'], bone)
        for k in (-1, 0, 1):
            add(kit.superellipsoid(f'Nail.{name}.{k}', (0.009, 0.008, 0.007), 0.6, 0.8, seg=(10, 6),
                                   location=(x + k * 0.02, y - 0.05, 0.016)), m['shell'], bone)

    # Tail, and three speed lines folded away behind the shell.
    t = D['tail']
    add(kit.superellipsoid('Tail', t['radii'], 0.5, 0.7, seg=(20, 12), location=t['center']), m['joint'], 'tail')
    for i, z in enumerate((0.07, 0.105, 0.14)):
        add(kit.superellipsoid(f'Speed.{i}', (0.005, 0.04, 0.0045), 0.5, 0.5, seg=(10, 6), location=(0, 0.24, z)),
            m['flame'], 'lines')

    return looks.finish(kit.armature('TortoiseRig', rig_bones()), parts, skin, m)
