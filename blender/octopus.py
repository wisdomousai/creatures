"""Coil, the crew's robot octopus: a toy robot, not an octopus in a robot suit. A round
dome for a head with a screen face low on its front and a seam round it, sitting on a
collar ring; round the collar, eight ball joints, and from each an arm: a tapering tube
in five bones, out and down to the floor, its tip curled up.

Down the top of every arm runs a row of four suction-cup studs, a cup with a light in
it. Each light is its own material, Dot0 to Dot31 (arm by arm round the collar, four
from root to tip), so the site can ripple colour down the arms and round them, flash
one arm at a time, or fade them all out when he hides. A nozzle on his right side for
squirting ink, and the ink puff itself on its own bone, built tiny inside the nozzle
(the site blows it up and shrinks it away); and a ball for juggling, on its own bone,
kept inside the dome until it's wanted. Faces -Y like the rest of the crew; about 0.5 m
to the top of the dome.

Refined: six radial seams on the crown and a row of rivets on the seam round it, a lit
crown band (Dot32) under it, gill slots on the sides of the dome, a hinged porthole
hatch with bolts, a collar with a ring and a bolt between each pair of arms, arms
banded with joint rings, suction cups with rims, and a banded siphon.

"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'octopus'
PREVIEW = dict(lift=0.0, width=0.75)

D = {
    # A bulb: round, a little fuller at the top than the bottom.
    'dome': dict(radii=(0.168, 0.158, 0.168), center=(0, 0.012, 0.318), e1=0.92, e2=0.95, taper=-0.1),
    # A seam round the dome above the face, and a round hatch on top: a rim, and a lid
    # hinged at the back, with a knob.
    'seam': dict(z=0.4, proud=0.005, thick=0.007),
    'hatch': dict(rim=(0.047, 0.047, 0.008), lid=(0.04, 0.04, 0.01), z=0.477, knob=0.01),
    'collar': dict(radii=(0.125, 0.12, 0.045), center=(0, 0, 0.155), e=0.4),
    # 2:1, like the octopus's face layout (512 x 256)
    # (its depth into the dome; set just proud of the dome's front at that height)
    'screen': dict(radii=(0.1, 0.03, 0.05), z=0.278, proud=0.012, bezel=0.008),
    # The arms, round the collar: azimuths in degrees from the front toward his left, in
    # order round the ring. Uneven, so from the front all eight show between each other.
    'azimuths': [20, 58, 100, 145, 215, 260, 302, 340],
    # One arm's path, out from its ball joint: (distance from the middle, height).
    'path': [(0.118, 0.14), (0.17, 0.1), (0.228, 0.042), (0.29, 0.03), (0.34, 0.045), (0.366, 0.084),
             (0.352, 0.118), (0.322, 0.122)],
    'arm_r': (0.034, 0.012),
    'ball': 0.041,
    'bones': 5,
    # Studs: where along the arm (0 root, 1 tip) and which way they face (toward the
    # viewer and up, as far as the arm allows).
    'studs': [0.3, 0.5, 0.69, 0.87],
    'facing': (0, -1, 0.7),
    'nozzle': dict(azimuth=-79, rho=0.118, z=0.19, length=0.05, r=0.017),
    # The ink puff at full size, as the site blows it up: balls (along the nozzle, to its
    # side, up, radius) from a point `depth` inside the nozzle's mouth. It is built
    # `shrink` times smaller, so it fits inside the nozzle until it's wanted.
    'puff': dict(depth=0.016, shrink=12, balls=[(0.075, 0, 0, 0.042), (0.115, 0.034, 0.022, 0.034),
                                                (0.105, -0.034, 0.006, 0.035), (0.14, 0.002, -0.026, 0.03),
                                                (0.065, 0.012, 0.038, 0.028), (0.15, -0.012, 0.034, 0.028)]),
    'ball_toy': dict(r=0.032, center=(0, 0.01, 0.33)),
}
D.update({
    'crown': dict(z=0.362, thick=0.007, proud=0.003),
    'rivets': 18,
    'petals': dict(angles=(0, 60, 120), proud=0.004, thick=0.0035),
    'gills': dict(zs=(0.262, 0.282, 0.302), length=0.026),
    'rings': (0.2, 0.4, 0.6, 0.78),
})
ARMS = len(D['azimuths'])
STUDS = len(D['studs'])
CROWN_DOT = ARMS * STUDS  # the crown band's light


def dome_girth(z):
    """How far round the dome is at height z, as a share of its radii."""
    d = D['dome']
    sp = (z - d['center'][2]) / d['radii'][2]
    return (1 - abs(sp) ** (2 / d['e1'])) ** (d['e1'] / 2) * (1 - d['taper'] * sp / 2)


def wrap(obj):
    """Bend a flat part on the front of the dome back round it, like a visor."""
    d = D['dome']
    rx, ry, _ = d['radii']
    for v in obj.data.vertices:
        x, z = v.co.x + obj.location.x, v.co.z + obj.location.z
        g = dome_girth(z)
        v.co.y += ry * g * (1 - math.sqrt(max(0.0, 1 - (x / (rx * g)) ** 2)))
    obj.data.update()


def radial(azimuth):
    a = math.radians(azimuth)
    return Vector((math.sin(a), -math.cos(a), 0))


def arm_points(i, n=26):
    """Arm i's centre line: n points from its ball joint to its tip."""
    r = radial(D['azimuths'][i])
    return [Vector(p) for p in kit.spline([tuple(r * rho + Vector((0, 0, z))) for rho, z in D['path']], n)]


def arm_radius(t):
    r0, r1 = D['arm_r']
    return r0 + (r1 - r0) * t ** 0.85


def arm_bones(i):
    return [f'arm.{i}.{j + 1}' for j in range(D['bones'])]


def at(points, t):
    """The point and direction t of the way along a polyline (by length)."""
    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    d = lengths[-1] * t
    for j in range(len(points) - 1):
        if lengths[j + 1] >= d or j == len(points) - 2:
            span = lengths[j + 1] - lengths[j]
            f = (d - lengths[j]) / span if span else 0
            return points[j].lerp(points[j + 1], f), (points[j + 1] - points[j]).normalized()


def rig_bones():
    c = D['collar']['center']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, c[2]), (0, 0, 0.3), 'root'),
        ('head', (0, 0.01, 0.19), (0, 0.01, 0.45), 'body'),
    ]
    h, y = D['hatch'], D['dome']['center'][1]
    top = h['z'] + h['rim'][2] + h['lid'][2] * 0.6
    bones.append(('lid', (0, y + h['lid'][1], top), (0, y - h['lid'][1], top), 'head'))
    for i in range(ARMS):
        pts = arm_points(i)
        parent = 'body'
        for j, name in enumerate(arm_bones(i)):
            head, _ = at(pts, j / D['bones'])
            tail, _ = at(pts, (j + 1) / D['bones'])
            bones.append((name, tuple(head), tuple(tail), parent))
            parent = name
    # The ink puff grows from inside the nozzle, out along the bone.
    mouth, out = nozzle_mouth()
    start = mouth - out * D['puff']['depth']
    bones.append(('puff', tuple(start), tuple(start + out * 0.1), 'body'))
    b = D['ball_toy']
    bones.append(('ball', b['center'], (b['center'][0], b['center'][1], b['center'][2] + 0.06), 'root'))
    return bones


def nozzle_mouth():
    nz = D['nozzle']
    out = (radial(nz['azimuth']) + Vector((0, 0.35, 0.25))).normalized()
    base = radial(nz['azimuth']) * nz['rho'] + Vector((0, 0, nz['z']))
    return base + out * nz['length'], out


def along(obj, t, bones):
    """Weights for a part that sits t of the way along an arm: it follows the tube there."""
    return kit.chain([t] * len(obj.data.vertices), bones)


def detail_head(add, m):
    """Panel seams, rivets, the lit crown band, gill slots and the hatch's hardware."""
    d = D['dome']
    rx, ry, rz = d['radii']
    cy = d['center'][1]
    # Radial seams over the crown: three thin plates through the dome, cut off below the seam.
    pt = D['petals']
    for n, a in enumerate(pt['angles']):
        plate = kit.superellipsoid(f'Petal.{n}', (rx * 1.02 + pt['proud'], pt['thick'], rz + pt['proud']), 0.92, 0.92,
                                   seg=(40, 22), location=(0, 0, 0))
        kit.cut(plate, (0, 0, 1), D['seam']['z'] - d['center'][2])
        plate.rotation_euler = (0, 0, math.radians(a))
        plate.location = (0, cy, d['center'][2])
        add(plate, m['joint'], 'head')
    # A row of rivets along the seam round the dome.
    z = D['seam']['z']
    f = dome_girth(z)
    for k in range(D['rivets']):
        a = 2 * math.pi * (k + 0.5) / D['rivets']
        p = (math.cos(a) * (rx * f + D['seam']['proud'] + 0.002), cy + math.sin(a) * (ry * f + D['seam']['proud'] + 0.002), z)
        add(kit.superellipsoid(f'Rivet.{k}', (0.0065, 0.0065, 0.0055), seg=(8, 5), location=p), m['bezel'], 'head')
    # The lit crown band below the seam.
    c = D['crown']
    f = dome_girth(c['z'])
    add(kit.superellipsoid('Crown', (rx * f + c['proud'], ry * f + c['proud'], c['thick']), 0.5, d['e2'], seg=(48, 6),
                           location=(0, cy, c['z'])), m['dot'](CROWN_DOT), 'head')
    # Gill slots on the dome's sides, three each.
    for side in (-1, 1):
        for n, gz in enumerate(D['gills']['zs']):
            f = dome_girth(gz)
            add(kit.superellipsoid(f'Gill.{side}.{n}', (0.005, D['gills']['length'], 0.0045), 0.4, 0.4, seg=(10, 5),
                                   location=(side * (rx * f - 0.0005), cy + 0.005, gz)), m['joint'], 'head')
    # The hatch: bolts round its rim, brackets and a barrel for the hinge at the back.
    h = D['hatch']
    top = h['z'] + h['rim'][2]
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8
        add(kit.superellipsoid(f'HatchBolt.{k}', (0.0052, 0.0052, 0.004), seg=(8, 5),
                               location=(math.cos(a) * h['rim'][0] * 0.88, cy + math.sin(a) * h['rim'][1] * 0.88, top)),
            m['joint'], 'head')
    back = cy + h['lid'][1] + 0.004
    lid_top = h['z'] + h['rim'][2] + h['lid'][2] * 0.6
    for side in (-1, 1):
        add(kit.superellipsoid(f'HingeBracket.{side}', (0.006, 0.008, 0.009), 0.4, 0.5, seg=(10, 6),
                               location=(side * 0.024, back, lid_top - 0.003)), m['bezel'], 'head')
    add(kit.superellipsoid('HingeBarrel', (0.03, 0.0055, 0.0055), 0.4, 0.5, seg=(12, 6), location=(0, back, lid_top + 0.003)),
        m['joint'], 'lid')
    # A porthole pane on the lid.
    add(kit.superellipsoid('LidPane', (h['lid'][0] * 0.62, h['lid'][1] * 0.62, 0.004), 0.4, 1.0, seg=(24, 5),
                           location=(0, cy, lid_top + h['lid'][2] * 0.5)), m['bezel'], 'lid')


def detail_body(add, m):
    """The collar's ring and bolts, and the siphon's bands."""
    c = D['collar']
    cz = c['center'][2]
    add(kit.torus('CollarRing', c['radii'][0] * 0.94, 0.0075, seg=(40, 6), location=(0, 0, cz - c['radii'][2] * 0.78)),
        m['joint'], 'body')
    az = sorted(D['azimuths'])
    mids = [(a + b) / 2 for a, b in zip(az, az[1:] + [az[0] + 360])]
    for k, a in enumerate(mids):
        r = radial(a)
        p = (r.x * c['radii'][0] * 0.97, r.y * c['radii'][1] * 0.97, cz + 0.008)
        add(kit.superellipsoid(f'CollarBolt.{k}', (0.0095, 0.0095, 0.0085), seg=(10, 6), location=p), m['bezel'], 'body')
    nz = D['nozzle']
    mouth, out = nozzle_mouth()
    base = mouth - out * nz['length']
    for k, t in enumerate((0.25, 0.6)):
        a = base + out * nz['length'] * t
        add(kit.tube(f'NozzleBand.{k}', [tuple(a), tuple(a + out * 0.008)], nz['r'] * 1.22, ring=14)[0], m['joint'], 'body')


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Head: the dome, a seam round it, a hatch on top, and the screen face.
    d = D['dome']
    add(kit.superellipsoid('Dome', d['radii'], d['e1'], d['e2'], seg=(44, 30), taper=d['taper'],
                           location=d['center']), m['shell'], 'head')
    # The seam: a thin disc through the dome, just wider than it at that height.
    s = D['seam']
    rx, ry, rz = d['radii']
    f = dome_girth(s['z'])
    add(kit.superellipsoid('Seam', (rx * f + s['proud'], ry * f + s['proud'], s['thick']), 0.5, d['e2'], seg=(48, 6),
                           location=(0, d['center'][1], s['z'])), m['joint'], 'head')
    h = D['hatch']
    y = d['center'][1]
    add(kit.superellipsoid('HatchRim', h['rim'], 0.3, 1.0, seg=(28, 6), location=(0, y, h['z'])), m['bezel'], 'head')
    top = h['z'] + h['rim'][2] + h['lid'][2] * 0.6
    add(kit.superellipsoid('Lid', h['lid'], 0.3, 1.0, seg=(28, 6), location=(0, y, top)), m['joint'], 'lid')
    add(kit.superellipsoid('Knob', (h['knob'],) * 3, seg=(12, 8), location=(0, y, top + h['lid'][2])), m['joint'],
        'lid')
    detail_head(add, m)
    sc = D['screen']
    front = d['center'][1] - ry * dome_girth(sc['z']) - sc['proud'] + sc['radii'][1]
    glass, rim = kit.screen('Octopus', sc['radii'], (0, front, sc['z']), sc['bezel'], e=0.4, seg=(40, 24))
    for part in (glass, rim):
        wrap(part)
        add(part, m['face'] if part is glass else m['bezel'], 'head')

    # The collar the arms hang from, and the ink nozzle on his right.
    c = D['collar']
    add(kit.superellipsoid('Collar', c['radii'], c['e'], 0.9, seg=(40, 10), location=c['center']), m['shell'], 'body')
    nz = D['nozzle']
    mouth, out = nozzle_mouth()
    base = mouth - out * nz['length']
    add(kit.tube('Nozzle', [tuple(base), tuple(mouth)], nz['r'], ring=14)[0], m['bezel'], 'body')
    add(kit.tube('NozzleRim', [tuple(mouth - out * 0.012), tuple(mouth)], nz['r'] * 1.3, ring=14)[0], m['joint'],
        'body')
    # The puff: a little cloud, shrunk to fit inside the nozzle.
    pf = D['puff']
    side = out.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(out)
    start = mouth - out * pf['depth']
    for n, (a, b, c_, r) in enumerate(pf['balls']):
        p = start + (out * a + side * b + up * c_) / pf['shrink']
        add(kit.superellipsoid(f'Puff.{n}', (r / pf['shrink'],) * 3, seg=(10, 6), location=tuple(p)),
            m['role']('Ink'), 'puff')

    # Arms: a ball joint in the collar, a tapering tube, and studs down the top.
    for i in range(ARMS):
        pts = arm_points(i)
        bones = arm_bones(i)
        add(kit.superellipsoid(f'Ball.{i}', (D['ball'],) * 3, seg=(16, 10), location=tuple(pts[0])), m['joint'],
            bones[0])
        tube, ts = kit.tube(f'Arm.{i}', pts, [arm_radius(t) for t in (j / (len(pts) - 1) for j in range(len(pts)))],
                            ring=10)
        add(tube, m['shell'], kit.chain(ts, bones))
        for t in D['rings']:
            p, tangent = at(pts, t)
            rot = tangent.to_track_quat('Z', 'Y').to_euler()
            ring = kit.torus(f'Ring.{i}', arm_radius(t) * 0.98, 0.0045, seg=(14, 5), location=tuple(p), rotation=rot)
            add(ring, m['joint'], along(ring, t, bones))
        for k, t in enumerate(D['studs']):
            p, tangent = at(pts, t)
            v = Vector(D['facing']).normalized()
            n = v - tangent * v.dot(tangent)
            n = n.normalized() if n.length > 0.2 else Vector((0, 0, 1))
            r = arm_radius(t)
            s = r * 0.78
            rot = n.to_track_quat('Z', 'Y').to_euler()
            cup = kit.superellipsoid(f'Cup.{i}.{k}', (s, s, s * 0.5), 0.3, 1.0, seg=(12, 5),
                                     location=tuple(p + n * r * 0.72), rotation=rot)
            add(cup, m['bezel'], along(cup, t, bones))
            rim = kit.torus(f'CupRim.{i}.{k}', s * 0.98, s * 0.17, seg=(14, 5),
                            location=tuple(p + n * (r * 0.72 + s * 0.22)), rotation=rot)
            add(rim, m['joint'], along(rim, t, bones))
            light = kit.superellipsoid(f'Stud.{i}.{k}', (s * 0.62, s * 0.62, s * 0.3), 0.5, 1.0, seg=(10, 4),
                                       location=tuple(p + n * (r * 0.72 + s * 0.3)), rotation=rot)
            add(light, m['dot'](i * STUDS + k), along(light, t, bones))

    detail_body(add, m)

    # The juggling ball, put away inside the dome.
    b = D['ball_toy']
    add(kit.superellipsoid('Toy', (b['r'],) * 3, seg=(16, 10), location=b['center']), m['beacon'], 'ball')

    return looks.finish(kit.armature('OctopusRig', rig_bones()), parts, skin, m)
