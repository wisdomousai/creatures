"""Zoom, the crew's robot vacuum: a flat disc with a screen strip for eyes on its front
edge, a bumper that gives when it bonks into things (with a row of cliff-sensor lights
on its face), two side brushes with bristle tufts that spin while it cleans, a lid with
a panel line, a vent grille, a status light and three battery lights, a dust bin hatch
that lifts on its hinge, a little antenna, treaded wheels showing at the rim, screws
and a charging contact plate at the back. Faces -Y like the rest of the crew; about
0.1 m tall and 0.35 m across.
"""

import math

import kit
import looks
from mathutils import Euler, Vector

FACE = 'vacuum'
PREVIEW = dict(lift=0.0, width=0.45)

D = {
    'body': dict(radii=(0.17, 0.17, 0.042), center=(0, 0, 0.05)),
    'top': dict(radii=(0.15, 0.15, 0.012), center=(0, 0.005, 0.088)),
    'lid': dict(major=0.085, minor=0.004, center=(0, -0.02, 0.1)),
    'panel': dict(major=0.062, minor=0.0018, center=(0, -0.02, 0.1)),
    # 16:5, like the vacuum's face layout (512 x 160)
    'screen': dict(radii=(0.08, 0.03, 0.025), center=(0, -0.147, 0.066), bezel=0.006),
    'bumper': dict(major=0.168, minor=0.012, center=(0, 0, 0.024), arc=(200, 340)),
    'light': dict(r=0.014, center=(0, 0.0, 0.1)),
    'brush': dict(x=0.115, y=-0.105, z=0.01, arms=3, reach=0.06),
    'wheel': dict(x=0.164, y=0.035, z=0.03, r=0.03, w=0.024, lugs=12),
    'hatch': dict(center=(0, 0.105, 0.1), size=(0.062, 0.03, 0.004), hinge=(0, 0.138, 0.099)),
    'antenna': dict(base=(0.095, 0.1, 0.092), tip=(0.095, 0.11, 0.155)),
    'sensors': dict(angles=(254, 262, 270, 278, 286), r=0.178, z=0.024),
}


def rig_bones():
    b, w, h, a = D['brush'], D['wheel'], D['hatch'], D['antenna']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('body', (0, 0, 0.01), (0, 0, 0.1), 'root'),
        ('bumper', (0, -0.12, 0.024), (0, -0.2, 0.024), 'body'),
        ('bin', h['hinge'], (0, 0.07, 0.099), 'body'),
        ('puff', (0, 0.105, 0.05), (0, 0.105, 0.085), 'body'),
        ('antenna', a['base'], a['tip'], 'body'),
        ('toy', (0, -0.02, 0.05), (0, -0.02, 0.09), 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'brush.{sfx}', (side * b['x'], b['y'], b['z'] + 0.03), (side * b['x'], b['y'], b['z']), 'body'))
        bones.append((f'wheel.{sfx}', (side * (w['x'] - 0.02), w['y'], w['z']), (side * (w['x'] + 0.03), w['y'], w['z']), 'body'))
    return bones


def boxes(name, items):
    """Several small cuboids merged into one mesh. Each item is (center, size, (rx, ry, rz)
    rotation in degrees): a vent slat, a tread lug, a contact strip."""
    verts, faces = [], []
    for centre, size, rot in items:
        e = Euler([math.radians(r) for r in rot])
        base = len(verts)
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    v = Vector((sx * size[0] / 2, sy * size[1] / 2, sz * size[2] / 2))
                    v.rotate(e)
                    verts.append((centre[0] + v.x, centre[1] + v.y, centre[2] + v.z))
        for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            faces.append(tuple(base + i for i in f))
    return kit.mesh_object(name, verts, faces)


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def ball(name, r, at, mat, bone, squash=1.0, seg=(12, 8)):
        return add(kit.superellipsoid(name, (r, r, r * squash), seg=seg, location=at), mat, bone)

    b, t, ld = D['body'], D['top'], D['lid']
    add(kit.superellipsoid('Disc', b['radii'], 0.35, 1.0, seg=(64, 20), location=b['center']), m['shell'], 'body')
    add(kit.superellipsoid('Top', t['radii'], 0.4, 1.0, seg=(64, 10), location=t['center']), m['shell'], 'body')
    # Panel lines: the lid plate, a thin line inside it, a groove round the middle of the
    # rim and one where the top plate meets the shell.
    add(kit.torus('Lid', ld['major'], ld['minor'], seg=(56, 6), location=ld['center']), m['bezel'], 'body')
    pn = D['panel']
    add(kit.torus('LidLine', pn['major'], pn['minor'], seg=(48, 4), location=pn['center']), m['joint'], 'body')
    add(kit.torus('Seam', 0.1685, 0.0022, seg=(64, 4), location=(0, 0, 0.062)), m['joint'], 'body')
    add(kit.torus('TopSeam', 0.1515, 0.0025, seg=(64, 4), location=(0, 0.005, 0.0895)), m['joint'], 'body')

    sc = D['screen']
    glass, rim = kit.screen('Vac', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'body')
    add(rim, m['bezel'], 'body')

    # Status light with a collar, and three battery lights in a row behind it.
    lt = D['light']
    add(kit.superellipsoid('Light', (lt['r'], lt['r'], lt['r'] * 0.6), seg=(16, 10), location=lt['center']),
        m['beacon'], 'body')
    add(kit.torus('LightCollar', lt['r'] + 0.004, 0.0028, seg=(24, 4), location=(0, 0, 0.1)), m['joint'], 'body')
    for i in range(3):
        ball(f'Battery{i}', 0.0045, (-0.026 + i * 0.026, 0.038, 0.1), m['dot'](6 + i), 'body', 0.5)

    # Vent grille: two banks of slats each side of the light.
    slats = []
    for sx in (-1, 1):
        for k in range(5):
            slats.append(((sx * 0.052, -0.048 + k * 0.016, 0.1035), (0.006, 0.03, 0.004), (0, 0, 0)))
    add(boxes('Grille', slats), m['joint'], 'body')

    # Screws in the top plate.
    for k, ang in enumerate((40, 140, 220, 320)):
        a = math.radians(ang)
        ball(f'Screw{k}', 0.0048, (0.128 * math.cos(a), 0.005 + 0.128 * math.sin(a), 0.0995), m['joint'], 'body', 0.4, (8, 6))

    # The dust bin hatch, on a hinge at the back of the top, with a latch.
    h = D['hatch']
    add(kit.superellipsoid('Hatch', h['size'], 0.3, 0.5, seg=(24, 8), location=h['center']),
        m['role']('Hatch', 'bezel'), 'bin')
    ball('Latch', 0.006, (0, h['center'][1] - 0.022, 0.1015), m['joint'], 'bin', 0.5)
    # Dust puffs that stay inside the body until he empties his bin.
    for k, (px, pz, r) in enumerate(((0, 0.0, 0.018), (-0.016, 0.006, 0.013), (0.017, 0.004, 0.012), (0.004, 0.015, 0.01))):
        ball(f'Puff{k}', r, (px, 0.105 + 0.004 * k, 0.062 + pz), m['joint'], 'puff', 1.0, (10, 6))

    # A short antenna at the back with a lit tip.
    an = D['antenna']
    add(kit.tube('Antenna', [an['base'], an['tip']], [0.0035, 0.002], ring=6)[0], m['joint'], 'antenna')
    ball('AntennaTip', 0.0075, an['tip'], m['dot'](5), 'antenna', 1.0, (12, 8))
    ball('AntennaFoot', 0.008, an['base'], m['bezel'], 'body', 0.6)

    # The bumper: a band round the front half, with a groove along it and the cliff
    # sensor lights on its face.
    bp = D['bumper']
    a0, a1 = (math.radians(a) for a in bp['arc'])
    pts = [(bp['major'] * math.cos(a0 + (a1 - a0) * i / 32), bp['major'] * math.sin(a0 + (a1 - a0) * i / 32),
            bp['center'][2]) for i in range(33)]
    add(kit.tube('Bumper', pts, bp['minor'], ring=10)[0], m['joint'], 'bumper')
    gr = [(0.1795 * math.cos(a0 + (a1 - a0) * i / 32), 0.1795 * math.sin(a0 + (a1 - a0) * i / 32), 0.0295)
          for i in range(33)]
    add(kit.tube('BumperLine', gr, 0.0018, ring=4)[0], m['bezel'], 'bumper')
    sn = D['sensors']
    for k, ang in enumerate(sn['angles']):
        a = math.radians(ang)
        ball(f'Sensor{k}', 0.0042, (sn['r'] * math.cos(a), sn['r'] * math.sin(a), sn['z']), m['dot'](k), 'bumper', 0.7, (10, 6))

    # Wheels at the rim, with tread lugs and a hub.
    w = D['wheel']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        cx = side * w['x']
        add(kit.superellipsoid(f'Wheel.{sfx}', (w['r'] - 0.002, w['r'] - 0.002, w['w'] / 2), 0.4, 1.0, seg=(24, 10),
                               location=(cx, w['y'], w['z']), rotation=(0, math.pi / 2, 0)), m['joint'], f'wheel.{sfx}')
        lugs = []
        for k in range(w['lugs']):
            ang = 360 * k / w['lugs']
            a = math.radians(ang)
            lugs.append(((cx, w['y'] + (w['r'] + 0.001) * math.sin(a), w['z'] + (w['r'] + 0.001) * math.cos(a)),
                         (w['w'] * 0.9, 0.007, 0.0045), (-ang, 0, 0)))
        add(boxes(f'Tread.{sfx}', lugs), m['shell'], f'wheel.{sfx}')
        hub = ball(f'WheelHub.{sfx}', 0.009, (cx + side * (w['w'] / 2 - 0.001), w['y'], w['z']), m['bezel'],
                   f'wheel.{sfx}', 0.4, (12, 6))
        hub.rotation_euler = (0, math.pi / 2, 0)

    # Side brushes: a hub and three bristle arms each, with a tuft on the end of every arm.
    br = D['brush']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        cx, cy, cz = side * br['x'], br['y'], br['z']
        add(kit.superellipsoid(f'Hub.{sfx}', (0.014, 0.014, 0.008), seg=(16, 8), location=(cx, cy, cz)), m['joint'],
            f'brush.{sfx}')
        ball(f'Cap.{sfx}', 0.006, (cx, cy, cz - 0.005), m['bezel'], f'brush.{sfx}', 0.5, (10, 6))
        for k in range(br['arms']):
            a = 2 * math.pi * k / br['arms'] + side * 0.3
            end = (cx + br['reach'] * math.cos(a), cy + br['reach'] * math.sin(a), cz - 0.004)
            add(kit.tube(f'Bristle.{sfx}.{k}', [(cx, cy, cz), end], [0.005, 0.003], ring=6)[0], m['joint'],
                f'brush.{sfx}')
            dx, dy = -math.sin(a), math.cos(a)
            ad = math.degrees(a)
            tuft = [(end, (0.012, 0.005, 0.005), (0, 0, ad)),
                    ((end[0] + 0.006 * dx, end[1] + 0.006 * dy, end[2]), (0.009, 0.004, 0.004), (0, 0, ad + 30)),
                    ((end[0] - 0.006 * dx, end[1] - 0.006 * dy, end[2]), (0.009, 0.004, 0.004), (0, 0, ad - 30))]
            add(boxes(f'Tuft.{sfx}.{k}', tuft), m['role']('Bristle', 'shell'), f'brush.{sfx}')

    # A little ball he keeps inside himself and pushes along in front of him now and then.
    ball('Toy', 0.026, (0, -0.02, 0.05), m['role']('Ball', 'bezel'), 'toy', 1.0, (16, 10))
    add(kit.torus('ToyBand', 0.0268, 0.004, seg=(20, 5), location=(0, -0.02, 0.05), rotation=(0, math.pi / 2, 0)),
        m['joint'], 'toy')

    # Charging contacts and a docking plate at the back.
    add(kit.superellipsoid('DockPlate', (0.03, 0.006, 0.014), 0.3, 0.5, seg=(16, 8), location=(0, 0.169, 0.05)),
        m['joint'], 'body')
    add(boxes('Contacts', [((sx * 0.012, 0.1755, 0.05), (0.008, 0.004, 0.018), (0, 0, 0)) for sx in (-1, 1)]),
        m['bezel'], 'body')

    return looks.finish(kit.armature('VacRig', rig_bones()), parts, skin, m)
