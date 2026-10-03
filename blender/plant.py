"""Sprout, the crew's robot houseplant: a boxy planter on two little feet with soles, a
face screen on its front, a seam and rivets, a rim band with three watering lights, a
drain grille at the back, a lit soil sensor pushed into the soil and a watering gauge on
one side. The stem is segmented (collars and bands over three bones) and leans toward
the mouse like a plant toward light; four leaf plates with vein ribs sit on hinge
knuckles on their own joints (they perk up, droop and wave); a spare sprig waits to
grow; and at the top a bud holds a flower of six hinged petal plates round a lit centre
(the site opens and shuts the petals, and scales the flower up from nothing). A few lit
motes ride the stem tip, for pollen and drops. Faces -Y like the rest of the crew; about
0.72 m to the flower.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'plant'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'pot': dict(radii=(0.15, 0.15, 0.12), center=(0, 0, 0.15), taper=-0.18),
    'rim': dict(radii=(0.168, 0.168, 0.026), center=(0, 0, 0.268)),
    'band': dict(radii=(0.171, 0.171, 0.008), z=0.262),
    'soil': dict(radii=(0.142, 0.142, 0.012), center=(0, 0, 0.285)),
    'plinth': dict(radii=(0.128, 0.128, 0.008), z=0.034),
    'seam': dict(radii=(0.1465, 0.1465, 0.0035), z=0.085),
    # 8:5, like the plant's face layout (512 x 320)
    'screen': dict(radii=(0.105, 0.03, 0.066), center=(0, -0.13, 0.15), bezel=0.008),
    'feet': dict(radii=(0.045, 0.056, 0.024), x=0.08),
    'stem': [(0, 0, 0.28), (0, 0.01, 0.39), (0, -0.01, 0.5), (0, 0, 0.6)],
    'stem_r': (0.016, 0.011),
    # (bone parent, side, height on the stem, length, lift in degrees)
    'leaves': [('stem.1', 1, 0.35, 0.16, 20), ('stem.1', -1, 0.4, 0.15, 25), ('stem.2', 1, 0.48, 0.13, 30),
               ('stem.2', -1, 0.53, 0.11, 35)],
    'bud': dict(radii=(0.034, 0.034, 0.05), center=(0, 0, 0.625)),
    'flower': dict(center=(0, -0.03, 0.66), petals=6, hinge=0.016, tip=0.092, width=0.026, thick=0.01),
    'sprig': dict(head=(0, -0.003, 0.445), tail=(0.03, -0.05, 0.485)),
    'gauge': dict(center=(0.152, 0, 0.15), r=0.026),
    'motes': 4,
}


def leaf_line(side, z, length, lift):
    a = math.radians(lift)
    return (0, 0, z), (side * length * math.cos(a), 0, z + length * math.sin(a))


def rig_bones():
    s = D['stem']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('pot', (0, 0, 0.03), (0, 0, 0.27), 'root'),
        ('stem.1', s[0], s[1], 'pot'),
        ('stem.2', s[1], s[2], 'stem.1'),
        ('stem.3', s[2], s[3], 'stem.2'),
        ('flower', (0, 0, 0.64), (0, -0.1, 0.66), 'stem.3'),
    ]
    for i, (parent, side, z, length, lift) in enumerate(D['leaves'], 1):
        head, tail = leaf_line(side, z, length, lift)
        bones.append((f'leaf.{i}', head, tail, parent))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = D['feet']['x']
        bones.append((f'foot.{sfx}', (side * x, 0, 0.06), (side * x, 0, 0.0), 'root'))
    g = D['gauge']['center']
    bones.append(('gauge', g, (g[0], g[1], g[2] + 0.025), 'pot'))
    bones.append(('sprig', D['sprig']['head'], D['sprig']['tail'], 'stem.1'))
    cx, cy, cz = D['flower']['center']
    fl = D['flower']
    for k in range(fl['petals']):
        a = 2 * math.pi * k / fl['petals']
        h = fl['hinge']
        bones.append((f'petal.{k}', (cx + h * math.cos(a), cy, cz + h * math.sin(a)),
                      (cx + (h + 0.03) * math.cos(a), cy, cz + (h + 0.03) * math.sin(a)), 'flower'))
    for k in range(D['motes']):
        bones.append((f'mote.{k}', (cx, cy, cz), (cx, cy - 0.02, cz), 'stem.3'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def between(name, a, b, ry, rz, e=(0.8, 1.0), seg=(12, 8)):
        """A rounded slab whose long axis runs from point a to point b (half length along
        it, ry across in Y, rz thick in Z); a slab lying in the XZ plane keeps its width
        across the plane."""
        a, b = Vector(a), Vector(b)
        d = b - a
        obj = kit.superellipsoid(name, (d.length / 2, ry, rz), e[0], e[1], seg=seg, location=(a + b) / 2)
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(d.normalized())
        return obj

    def rivet(name, at, bone, r=0.0065, mat='joint'):
        return add(kit.superellipsoid(name, (r, r, r * 0.8), seg=(10, 6), location=at), m[mat], bone)

    # The planter: a boxy pot on a plinth, a seam, a rim with a band, soil, and the face.
    p, r, so = D['pot'], D['rim'], D['soil']
    add(kit.superellipsoid('Pot', p['radii'], 0.2, 0.3, seg=(48, 32), taper=p['taper'], location=p['center']),
        m['shell'], 'pot')
    pl = D['plinth']
    add(kit.superellipsoid('Plinth', pl['radii'], 0.3, 0.3, seg=(40, 8), location=(0, 0, pl['z'])), m['joint'], 'pot')
    sm = D['seam']
    add(kit.superellipsoid('Seam', sm['radii'], 0.3, 0.3, seg=(48, 6), location=(0, 0, sm['z'])), m['joint'], 'pot')
    add(kit.superellipsoid('PotRim', r['radii'], 0.3, 0.3, seg=(48, 12), location=r['center']), m['shell'], 'pot')
    bd = D['band']
    add(kit.superellipsoid('RimBand', bd['radii'], 0.3, 0.3, seg=(48, 8), location=(0, 0, bd['z'])), m['joint'], 'pot')
    add(kit.superellipsoid('Soil', so['radii'], 0.3, 0.3, seg=(40, 8), location=so['center']), m['bezel'], 'pot')
    sc = D['screen']
    glass, rim = kit.screen('Pot', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'pot')
    add(rim, m['bezel'], 'pot')

    # Rivets: along the seam at the front corners and round the top of the rim.
    for i, (x, y) in enumerate(((-0.1, -0.1475), (0.1, -0.1475), (-0.1475, -0.1), (0.1475, -0.1),
                                (-0.1, 0.1475), (0.1, 0.1475))):
        rivet(f'SeamRivet.{i}', (x, y, sm['z']), 'pot', 0.0055)
    for i, (x, y) in enumerate(((-0.148, -0.148), (0.148, -0.148), (-0.148, 0.148), (0.148, 0.148),
                                (0, -0.158), (0, 0.158), (-0.158, 0), (0.158, 0))):
        rivet(f'RimRivet.{i}', (x, y, 0.293), 'pot', 0.0065, 'bezel')

    # Watering lights on the rim band, in front (Dot1..3, low to high water).
    for i, x in enumerate((-0.035, 0, 0.035)):
        add(kit.superellipsoid(f'WaterLight.{i}', (0.0095, 0.006, 0.0055), 0.5, 0.6, seg=(12, 8),
                               location=(x, -0.1685, bd['z'])), m['dot'](i + 1), 'pot')

    # Drain grille on the back, low down: a plate with four slots.
    add(kit.superellipsoid('GrillePlate', (0.045, 0.006, 0.026), 0.3, 0.3, seg=(20, 8), location=(0, 0.1425, 0.1)),
        m['joint'], 'pot')
    for i in range(4):
        add(kit.superellipsoid(f'GrilleSlot.{i}', (0.032, 0.005, 0.0032), 0.4, 0.5, seg=(12, 6),
                               location=(0, 0.1465, 0.083 + i * 0.0118)), m['bezel'], 'pot')

    # A lit soil sensor: a little housing on the soil, two prongs into it, a lit head.
    add(kit.superellipsoid('SensorBase', (0.021, 0.017, 0.007), 0.4, 0.5, seg=(20, 8), location=(0.075, -0.06, 0.3)),
        m['joint'], 'pot')
    for i, dx in enumerate((-0.01, 0.01)):
        add(between(f'SensorProng.{i}', (0.075 + dx, -0.06, 0.29), (0.075 + dx, -0.06, 0.262), 0.0025, 0.0025),
            m['bezel'], 'pot')
    add(kit.superellipsoid('SensorLight', (0.0095, 0.0095, 0.0075), 0.6, 0.8, seg=(14, 8),
                           location=(0.075, -0.06, 0.312)), m['dot'](0), 'pot')

    # The watering gauge, on his left side: a dial, its ring, ticks and a needle.
    g = D['gauge']
    gx, gy, gz = g['center']
    add(kit.superellipsoid('GaugeDial', (g['r'], g['r'], 0.005), 0.3, 1.0, seg=(28, 8), location=(gx, gy, gz),
                           rotation=(0, math.pi / 2, 0)), m['bezel'], 'pot')
    add(kit.torus('GaugeRing', g['r'], 0.0045, seg=(28, 8), location=(gx + 0.002, gy, gz),
                  rotation=(0, math.pi / 2, 0)), m['joint'], 'pot')
    for i, deg in enumerate((-55, -28, 0, 28, 55)):
        a = math.radians(deg)
        c, s = math.cos(a), math.sin(a)
        add(between(f'GaugeTick.{i}', (gx + 0.006, gy + 0.017 * s, gz + 0.017 * c),
                    (gx + 0.006, gy + 0.023 * s, gz + 0.023 * c), 0.0022, 0.0022), m['glow'], 'pot')
    add(between('GaugeNeedle', (gx + 0.009, gy, gz), (gx + 0.009, gy, gz + 0.021), 0.0028, 0.0028), m['glow'], 'gauge')
    add(kit.superellipsoid('GaugePin', (0.005, 0.005, 0.005), seg=(10, 6), location=(gx + 0.01, gy, gz)),
        m['joint'], 'gauge')

    # Feet: an ankle puck, the foot, a dark sole and a toe bumper.
    f = D['feet']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * f['x']
        add(kit.superellipsoid(f'Foot.{sfx}', f['radii'], 0.45, 0.7, seg=(24, 12),
                               location=(x, -0.01, f['radii'][2] + 0.006)), m['role']('Foot', 'joint'), f'foot.{sfx}')
        add(kit.superellipsoid(f'Sole.{sfx}', (f['radii'][0] + 0.004, f['radii'][1] + 0.004, 0.0065), 0.3, 0.6,
                               seg=(24, 8), location=(x, -0.01, 0.0065)), m['role']('Sole', 'bezel'), f'foot.{sfx}')
        add(kit.superellipsoid(f'Toe.{sfx}', (0.03, 0.009, 0.011), 0.5, 0.8, seg=(14, 8),
                               location=(x, -0.062, 0.02)), m['role']('Sole', 'bezel'), f'foot.{sfx}')
        add(kit.superellipsoid(f'Ankle.{sfx}', (0.017, 0.017, 0.009), 0.4, 1.0, seg=(16, 6),
                               location=(x, -0.01, 0.052)), m['bezel'], f'foot.{sfx}')

    # The stem, bending over three bones, with a flange at its foot, collars at the joints
    # and thin bands between.
    pts = kit.spline(D['stem'], 24)
    r0, r1 = D['stem_r']
    radii = [r0 + (r1 - r0) * i / 23 for i in range(24)]
    stem, ts = kit.tube('Stem', pts, radii, ring=10)
    add(stem, m['joint'], kit.chain(ts, ['stem.1', 'stem.2', 'stem.3']))
    add(kit.superellipsoid('Flange', (0.034, 0.034, 0.008), 0.3, 1.0, seg=(24, 8), location=(0, 0, 0.3)),
        m['bezel'], 'stem.1')
    for i, at in enumerate((4, 8, 12, 16, 19)):
        u = at / 23
        bone = 'stem.1' if u < 0.34 else 'stem.2' if u < 0.67 else 'stem.3'
        wide = i in (2, 3)  # the collars sit at the bone joints
        add(kit.torus(f'StemBand.{i}', radii[at] + 0.001, 0.0052 if wide else 0.004, seg=(20, 8),
                      location=tuple(pts[at])), m['bezel'] if wide else m['joint'], bone)

    # Leaves: flat pointed plates with a centre rib and two pairs of side veins, on a
    # hinge knuckle at the stem.
    for i, (parent, side, z, length, lift) in enumerate(D['leaves'], 1):
        head, tail = leaf_line(side, z, length, lift)
        head, tail = Vector(head), Vector(tail)
        d = (tail - head).normalized()
        n = Vector((-d.z, 0, d.x))
        n = n if n.z > 0 else -n
        leaf = kit.superellipsoid(f'Leaf.{i}', (length / 2, length * 0.32, 0.009), 0.9, 1.4, seg=(28, 12),
                                  location=(head + tail) / 2, rotation=(0, -side * math.radians(lift), 0))
        add(leaf, m['role']('Leaf'), f'leaf.{i}')
        up = n * 0.0085
        add(between(f'Rib.{i}', head + d * length * 0.1 + up, head + d * length * 0.93 + up, 0.0028, 0.0028),
            m['joint'], f'leaf.{i}')
        for j, f in enumerate((0.35, 0.6)):
            base = head + d * length * f + up
            for w in (1, -1):
                tip = base + d * length * 0.13 + Vector((0, w * length * 0.17 * (1.1 - f), 0)) + n * 0.001
                add(between(f'Vein.{i}.{j}.{w}', base, tip, 0.0018, 0.0018, seg=(8, 6)), m['joint'], f'leaf.{i}')
        knuckle = head + d * 0.006
        add(kit.superellipsoid(f'Knuckle.{i}', (0.012, 0.014, 0.012), 0.6, 0.8, seg=(14, 8), location=knuckle),
            m['bezel'], f'leaf.{i}')

    # The spare sprig: a short stalk and a lit bud, hidden until it grows.
    sp = D['sprig']
    add(between('SprigStalk', sp['head'], sp['tail'], 0.0055, 0.0055, seg=(10, 6)), m['role']('Bud'), 'sprig')
    add(kit.superellipsoid('SprigBud', (0.011, 0.011, 0.014), 0.9, 1.0, seg=(14, 8), location=sp['tail']),
        m['dot'](4), 'sprig')

    # The bud, with a collar, and the flower that opens out of it (the site scales it from
    # nothing): a lit heart in a ring, and six hinged petal plates, each with a rib.
    bu = D['bud']
    add(kit.superellipsoid('Bud', bu['radii'], 0.9, 1.0, seg=(20, 14), location=bu['center']), m['role']('Bud'), 'stem.3')
    add(kit.torus('BudCollar', 0.031, 0.0055, seg=(20, 8), location=(0, 0, 0.6)), m['bezel'], 'stem.3')
    fl = D['flower']
    cx, cy, cz = fl['center']
    add(kit.superellipsoid('FlowerHeart', (0.022, 0.012, 0.022), seg=(20, 12), location=(cx, cy - 0.006, cz)),
        m['beacon'], 'flower')
    add(kit.torus('HeartRing', 0.026, 0.0045, seg=(24, 8), location=(cx, cy + 0.001, cz), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'flower')
    for k in range(fl['petals']):
        a = 2 * math.pi * k / fl['petals']
        c, s = math.cos(a), math.sin(a)
        h, t = fl['hinge'], fl['tip']
        at = lambda rr, dy=0.0: (cx + rr * c, cy + dy, cz + rr * s)  # noqa: E731
        bone = f'petal.{k}'
        add(between(f'Petal.{k}', at(h + 0.004), at(t), fl['thick'], fl['width'], e=(0.8, 1.0), seg=(20, 10)),
            m['role']('Petal'), bone)
        add(between(f'PetalRib.{k}', at(h + 0.012, -0.0075), at(t - 0.014, -0.0075), 0.0022, 0.0022, seg=(8, 6)),
            m['joint'], bone)
        add(kit.superellipsoid(f'PetalHinge.{k}', (0.007, 0.007, 0.007), seg=(10, 6), location=at(h, 0.0)),
            m['bezel'], bone)

    # Lit motes at the stem tip, hidden until a sneeze or a drop needs them.
    for k in range(D['motes']):
        add(kit.superellipsoid(f'Mote.{k}', (0.0075, 0.0075, 0.0075), seg=(10, 6), location=fl['center']),
            m['dot'](4), f'mote.{k}')

    return looks.finish(kit.armature('PlantRig', rig_bones()), parts, skin, m)
