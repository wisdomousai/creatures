"""Dot, the crew's robot ladybug: a domed shell in two wing cases, each on its own bone
so they lift open for her to fly, with the wings folded away under them (the site
scales them out of nothing and flutters them). Six glowing dots on the cases blink one
by one (each its own material, Dot0 to Dot5, so the site can light them separately);
a small screen-faced head under a plate with a lamp, two antennae in two bones each
with glowing tips in the beacon's colour, and six tiny legs, each two bones (leg and
foot) ending in a pad. The cases have panel seams, a hinge barrel at the front and
vents behind; the dots are set into dark rings; the wings under them are veined
membranes; the rim is bolted and there is a belly plate for when she is on her back.
Faces -Y like the rest of the crew; about 0.4 m to the antenna tips.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'ladybug'
PREVIEW = dict(lift=0.0, width=0.55)

D = {
    'dome': dict(radii=(0.2, 0.25, 0.17), center=(0, 0.06, 0.06)),
    'rim': dict(radii=(0.205, 0.255, 0.03), center=(0, 0.06, 0.05)),
    'head': dict(radii=(0.12, 0.085, 0.095), center=(0, -0.2, 0.105)),
    # 4:3, like the ladybug's face layout (256 x 192)
    'screen': dict(radii=(0.09, 0.03, 0.0675), center=(0, -0.262, 0.11), bezel=0.008),
    'antenna': [(0.045, -0.2, 0.185), (0.075, -0.235, 0.28), (0.115, -0.225, 0.36)],
    'antenna_r': (0.011, 0.008),
    'tip': 0.026,
    # Where the dots sit on the dome, as directions from its centre (one side; mirrored).
    'dots': [(0.5, -0.45, 0.72), (0.78, 0.1, 0.55), (0.42, 0.62, 0.62)],
    'dot': (0.036, 0.036, 0.012),
    'legs': [-0.1, 0.05, 0.19],
    # A leg: hip under the rim, knee out to the side, foot down to the floor.
    'leg': dict(hip=0.15, knee=(0.215, 0.04), foot=(0.232, 0.006), r=0.013),
    # Seams across a case, as how far back on the dome (its direction's y) they run.
    'seams': [-0.25, 0.42],
    # The wing cases open about a hinge at the front of the seam; the gap between them.
    'hinge': (0.006, -0.13, 0.2),
    'gap': 0.004,
    # Wings, spread: from the shoulder out and back (radii along, across, thick).
    'wing': dict(root=(0.05, -0.02, 0.2), tip=(0.35, 0.12, 0.24), radii=(0.18, 0.075, 0.003)),
}


def on_dome(direction, lift=0.0):
    """A point on the dome's surface in a direction from its centre, and the surface
    normal there."""
    rx, ry, rz = D['dome']['radii']
    c = Vector(D['dome']['center'])
    n = Vector(direction).normalized()
    p = c + Vector((rx * n.x, ry * n.y, rz * n.z))
    normal = Vector((n.x / rx, n.y / ry, n.z / rz)).normalized()
    return p + normal * lift, normal


def antenna(side):
    return [(side * x, y, z) for x, y, z in D['antenna']]


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.06, 0.06), (0, 0.06, 0.24), 'root'),
        ('head', (0, -0.16, 0.06), (0, -0.2, 0.2), 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a = antenna(side)
        bones += [(f'antenna.{sfx}.1', a[0], a[1], 'head'), (f'antenna.{sfx}.2', a[1], a[2], f'antenna.{sfx}.1')]
        hx, hy, hz = D['hinge']
        bones.append((f'case.{sfx}', (side * hx, hy, hz), (side * hx, 0.22, 0.14), 'body'))
        w = D['wing']
        bones.append((f'wing.{sfx}', mirror(w['root'], side), mirror(w['tip'], side), 'body'))
        lg = D['leg']
        for k, y in enumerate(D['legs']):
            knee = (side * lg['knee'][0], y, lg['knee'][1])
            bones += [(f'leg.{sfx}.{k}', (side * lg['hip'], y, lg['knee'][1] + 0.005), knee, 'body'),
                      (f'foot.{sfx}.{k}', knee, (side * lg['foot'][0], y + 0.008, lg['foot'][1] + 0.004), f'leg.{sfx}.{k}')]
    return bones


def mirror(p, side):
    return side * p[0], p[1], p[2]


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The body under the shell, and the rim round it.
    d = D['dome']
    cx, cy, cz = d['center']
    rx, ry, rz = d['radii']
    body = kit.superellipsoid('Body', (rx * 0.9, ry * 0.9, rz * 0.85), 0.9, 1.0, seg=(48, 24), location=d['center'])
    add(kit.cut(body, (0, 0, 1)), m['joint'], 'body')
    r = D['rim']
    add(kit.superellipsoid('Rim', r['radii'], 0.4, 1.0, seg=(56, 12), location=r['center']), m['joint'], 'body')

    # The shell: two wing cases, the dome cut down the middle, with three dots on each.
    i = 0
    for side, sfx in ((1, 'L'), (-1, 'R')):
        case = kit.superellipsoid(f'Case.{sfx}', d['radii'], 0.9, 1.0, seg=(56, 32),
                                  location=(cx + side * D['gap'], cy, cz))
        kit.cut(case, (0, 0, 1))
        add(kit.cut(case, (side, 0, 0)), m['shell'], f'case.{sfx}')
        for x, y, z in D['dots']:
            p, n = on_dome((side * x, y, z), -0.004)
            p.x += side * D['gap']
            q = n.to_track_quat('Z', 'Y').to_euler()
            # A dark ring the dot is set into, and the dot standing a little proud of it.
            add(kit.superellipsoid(f'Ring{i}', (0.045, 0.045, 0.014), 0.5, 1.0, seg=(28, 10), location=p,
                                   rotation=q), m['joint'], f'case.{sfx}')
            p, n = on_dome((side * x, y, z), 0.003)
            p.x += side * D['gap']
            add(kit.superellipsoid(f'Dot{i}', D['dot'], 0.5, 1.0, seg=(28, 10), location=p, rotation=q),
                m['dot'](i), f'case.{sfx}')
            # A thin lens ring round the dot, so it reads as a little lit window.
            p, n = on_dome((side * x, y, z), 0.0055)
            p.x += side * D['gap']
            add(kit.superellipsoid(f'Lens{i}', (0.041, 0.041, 0.004), 0.5, 1.0, seg=(28, 6), location=p,
                                   rotation=q), m['bezel'], f'case.{sfx}')
            i += 1
        # A neat trim along the edge where the two cases part.
        pts = []
        for a in range(0, 15):
            th = math.radians(4 + 82 * a / 14)
            yy = math.cos(th) * 0.93
            zz = math.sin(th)
            p, _ = on_dome((0.02 * 0 + 0.001, -math.cos(th) * 0.97, zz), 0.002)
            p.x = side * (D['gap'] + 0.004)
            pts.append(tuple(p))
        trim, _ = kit.tube(f'Trim.{sfx}', pts, 0.0042, ring=6)
        add(trim, m['joint'], f'case.{sfx}')
        # Panel seams across the case, following the dome.
        for k, yy in enumerate(D['seams']):
            kk = math.sqrt(1 - yy * yy)
            pts = []
            for a in range(0, 13):
                th = math.radians(6 + 78 * a / 12)
                p, _ = on_dome((side * math.sin(th) * kk, yy, math.cos(th) * kk), 0.002)
                p.x += side * D['gap']
                pts.append(tuple(p))
            seam, _ = kit.tube(f'Seam.{sfx}.{k}', pts, 0.0036, ring=6)
            add(seam, m['joint'], f'case.{sfx}')
        # The hinge barrel at the front of the case, and a bracket on the body under it.
        hx, hy, hz = D['hinge']
        add(kit.superellipsoid(f'Barrel.{sfx}', (0.03, 0.011, 0.011), 0.6, 0.8, seg=(16, 10),
                               location=(side * 0.032, hy - 0.02, hz - 0.015),
                               rotation=(0, math.radians(-14) * side, 0)), m['joint'], f'case.{sfx}')
        add(kit.superellipsoid(f'Bracket.{sfx}', (0.024, 0.016, 0.008), 0.4, 0.6, seg=(12, 8),
                               location=(side * 0.03, hy - 0.035, hz - 0.03)), m['bezel'], 'body')

    # A row of bolts round the rim, and vent slats at the back of it.
    rx_, ry_, _ = r['radii']
    rcx, rcy, rcz = r['center']
    for side in (1, -1):
        for deg in (35, 70, 110, 150):
            a = math.radians(deg)
            nx, ny = math.cos(a), math.sin(a)
            n = Vector((nx / rx_, ny / ry_, 0)).normalized()
            p = Vector((rcx + rx_ * nx, rcy + ry_ * ny, rcz)) + n * 0.002
            p.x *= side
            n.x *= side
            add(kit.superellipsoid(f'Bolt.{side}.{deg}', (0.009, 0.009, 0.006), 0.5, 0.5, seg=(8, 6),
                                   location=p, rotation=n.to_track_quat('Z', 'Y').to_euler()), m['bezel'], 'body')
    for k, z in enumerate((0.036, 0.05, 0.064)):
        add(kit.superellipsoid(f'Vent{k}', (0.03, 0.007, 0.0045), 0.5, 0.5, seg=(12, 6),
                               location=(0, rcy + ry_ - 0.001, z)), m['shell'], 'body')

    # The belly plate, with hatch and ribs, for when she lies on her back.
    add(kit.superellipsoid('Belly', (0.16, 0.2, 0.012), 0.4, 0.7, seg=(32, 10), location=(0, 0.06, 0.022)),
        m['bezel'], 'body')
    for k, y in enumerate((-0.09, 0.0, 0.14, 0.2)):
        add(kit.superellipsoid(f'Rib{k}', (0.13, 0.005, 0.005), 0.5, 0.5, seg=(16, 6), location=(0, y, 0.0125)),
            m['joint'], 'body')
    add(kit.superellipsoid('Hatch', (0.045, 0.035, 0.008), 0.4, 0.8, seg=(20, 8), location=(0, 0.07, 0.0125)),
        m['joint'], 'body')
    add(kit.superellipsoid('HatchBolt', (0.012, 0.012, 0.006), 0.5, 0.5, seg=(8, 6), location=(0, 0.07, 0.008)),
        m['bezel'], 'body')

    # Wings: thin veined membranes along their bones, folded away (scaled to nothing)
    # until she flies. The veins are the shell's colour on the membrane's.
    w = D['wing']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a, b = mirror(w['root'], side), mirror(w['tip'], side)
        mid = tuple((u + v) / 2 for u, v in zip(a, b))
        turn = math.atan2(b[1] - a[1], b[0] - a[0])
        add(kit.superellipsoid(f'Wing.{sfx}', w['radii'], 1.0, 1.0, seg=(32, 8), location=mid,
                               rotation=(0, 0, turn)), m['bezel'], f'wing.{sfx}')
        ru, rv, _ = w['radii']
        c, sn = math.cos(turn), math.sin(turn)

        def at(u, v, mid=mid, c=c, sn=sn):
            return (mid[0] + u * c - v * sn, mid[1] + u * sn + v * c, mid[2])
        us = [-0.92 + 1.84 * t / 8 for t in range(9)]
        veins = [[(u * ru, rv * 0.72 * math.sqrt(max(0.0, 1 - u * u))) for u in us]]
        for v1 in (0.55, 0.0, -0.55):
            veins.append([(ru * (-0.9 + 1.72 * t / 5), rv * v1 * (t / 5)) for t in range(6)])
        for n, pts in enumerate(veins):
            vein, _ = kit.tube(f'Vein.{sfx}.{n}', [at(u, v) for u, v in pts], 0.0032, ring=5)
            add(vein, m['shell'], f'wing.{sfx}')

    # Head and face.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], 0.4, 0.4, seg=(40, 28), location=h['center']), m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Bug', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    # A plate on the crown with a small lamp, four bolts, and a pod on each side.
    hcx, hcy, hcz = h['center']
    top = hcz + h['radii'][2]
    add(kit.superellipsoid('Plate', (0.075, 0.055, 0.009), 0.4, 0.5, seg=(24, 8), location=(0, hcy, top - 0.004)),
        m['joint'], 'head')
    add(kit.superellipsoid('Lamp', (0.017, 0.017, 0.012), 0.8, 1.0, seg=(16, 10), location=(0, hcy - 0.004, top + 0.006)),
        m['beacon'], 'head')
    for bx in (-1, 1):
        for by in (-1, 1):
            add(kit.superellipsoid(f'PlateBolt.{bx}.{by}', (0.007, 0.007, 0.005), 0.5, 0.5, seg=(8, 6),
                                   location=(bx * 0.056, hcy + by * 0.036, top + 0.0005)), m['bezel'], 'head')
        add(kit.superellipsoid(f'Pod.{bx}', (0.014, 0.03, 0.032), 0.5, 0.6, seg=(16, 10),
                               location=(bx * (h['radii'][0] + 0.004), hcy + 0.005, hcz - 0.005)), m['joint'], 'head')
        add(kit.superellipsoid(f'PodBolt.{bx}', (0.006, 0.006, 0.004), 0.5, 0.5, seg=(8, 6),
                               location=(bx * (h['radii'][0] + 0.019), hcy + 0.005, hcz - 0.005),
                               rotation=(0, math.pi / 2, 0)), m['bezel'], 'head')

    # Cheek plates low on the face and a chin plate, so the head is softer and cuter.
    for bx in (-1, 1):
        add(kit.superellipsoid(f'Cheek.{bx}', (0.024, 0.012, 0.016), 0.5, 0.6, seg=(14, 8),
                               location=(bx * 0.088, hcy - 0.072, hcz - 0.03)), m['bezel'], 'head')
    add(kit.superellipsoid('Chin', (0.05, 0.012, 0.008), 0.4, 0.6, seg=(16, 6),
                           location=(0, hcy - 0.079, hcz - 0.078)), m['joint'], 'head')

    # Antennae: thin stalks over two bones each, with glowing tips.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = kit.spline(antenna(side), 12)
        r0, r1 = D['antenna_r']
        stalk, ts = kit.tube(f'Antenna.{sfx}', pts, [r0 + (r1 - r0) * k / 11 for k in range(12)], ring=8)
        add(stalk, m['joint'], kit.chain(ts, [f'antenna.{sfx}.1', f'antenna.{sfx}.2']))
        # A socket at the base, a knuckle where the two bones meet, a collar under the tip.
        a3 = antenna(side)
        add(kit.superellipsoid(f'Socket.{sfx}', (0.02, 0.02, 0.014), 0.6, 0.8, seg=(12, 8),
                               location=a3[0]), m['joint'], 'head')
        add(kit.superellipsoid(f'Knuckle.{sfx}', (0.0145,) * 3, seg=(12, 8), location=a3[1]), m['joint'],
            f'antenna.{sfx}.1')
        d = (Vector(a3[2]) - Vector(a3[1])).normalized()
        add(kit.superellipsoid(f'Collar.{sfx}', (0.017, 0.017, 0.006), 0.5, 1.0, seg=(12, 6),
                               location=Vector(pts[-1]) - d * 0.03, rotation=d.to_track_quat('Z', 'Y').to_euler()),
            m['joint'], f'antenna.{sfx}.2')
        add(kit.superellipsoid(f'Tip.{sfx}', (D['tip'],) * 3, seg=(16, 10), location=pts[-1]), m['beacon'],
            f'antenna.{sfx}.2')

    # Six tiny legs, two bones each: the leg out from under the rim, a knee ball, the
    # lower leg and a pad for a foot.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, y in enumerate(D['legs']):
            hip = (side * lg['hip'], y, lg['knee'][1] + 0.005)
            knee = (side * lg['knee'][0], y, lg['knee'][1])
            foot = (side * lg['foot'][0], y + 0.008, lg['foot'][1] + 0.004)
            upper, _ = kit.tube(f'Leg.{sfx}.{k}', [hip, knee], lg['r'], ring=8)
            add(upper, m['joint'], f'leg.{sfx}.{k}')
            lower, _ = kit.tube(f'Shin.{sfx}.{k}', [knee, foot], lg['r'] * 0.85, ring=8)
            add(lower, m['joint'], f'foot.{sfx}.{k}')
            add(kit.superellipsoid(f'Knee.{sfx}.{k}', (0.017,) * 3, seg=(12, 8), location=knee), m['joint'],
                f'foot.{sfx}.{k}')
            add(kit.superellipsoid(f'Pad.{sfx}.{k}', (0.021, 0.028, 0.008), 0.4, 0.6, seg=(16, 8),
                                   location=(foot[0], foot[1], 0.008)), m['shell'], f'foot.{sfx}.{k}')
            add(kit.superellipsoid(f'Toe.{sfx}.{k}', (0.014, 0.008, 0.007), 0.5, 0.6, seg=(10, 6),
                                   location=(foot[0], foot[1] - 0.026, 0.008)), m['joint'], f'foot.{sfx}.{k}')

    return looks.finish(kit.armature('BugRig', rig_bones()), parts, skin, m)
