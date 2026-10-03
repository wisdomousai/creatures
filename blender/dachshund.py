"""Link, the crew's robot dachshund: a long low body in three rounded segments (hips,
middle, chest) joined by ribbed bellows, so it bends and wiggles in the middle like an
articulated bus; four tiny legs with round paws, a head on a short neck with a screen
face, a long snout with a jaw that opens, long flat ears hanging past the chin, and a
long thin tail in three bones.

Each segment has a light bar along the top of its back, one light each (Dot0 the
chest, Dot1 the middle, Dot2 the hips), so the site can run lights down his back.
Faces -Y like the rest of the crew; about 0.42 m tall and a metre long.
"""

import math

import kit
import looks
from mathutils import Vector

FACE = 'dachshund'
PREVIEW = dict(lift=0.0, width=1.05)
BOXY = 0.4

D = {
    # Segments along the back, tail end first: (name, bone, centre y, radii, drop). The
    # chest is the deepest, keeled low like a dachshund's.
    'segments': [('Rear', 'body', 0.19, (0.088, 0.083, 0.08), 0.0),
                 ('Middle', 'mid', 0.0, (0.092, 0.083, 0.085), 0.004),
                 ('Chest', 'chest', -0.19, (0.1, 0.09, 0.1), 0.012)],
    'z': 0.19,
    'e': 0.5,
    # Bellows between segments: ribs alternating in and out, centred on the joint.
    'bellows': dict(r=(0.066, 0.078), ribs=9, length=0.07, rim=(0.079, 0.008, 0.034)),
    'joints': (0.095, -0.095),
    'bar': dict(radii=(0.022, 0.05, 0.012)),
    'leg': dict(x=0.066, front=-0.2, back=0.2, top=0.15, r=0.028),
    'paw': dict(radii=(0.037, 0.047, 0.022), e=0.45),
    'neck': dict(points=[(0, -0.24, 0.23), (0, -0.29, 0.29), (0, -0.32, 0.33)], r=0.045),
    'head': dict(radii=(0.088, 0.085, 0.078), center=(0, -0.33, 0.35)),
    # 2:1, like the dachshund's face layout (512 x 256)
    'screen': dict(radii=(0.068, 0.03, 0.034), center=(0, -0.402, 0.365), bezel=0.008),
    'snout': dict(radii=(0.043, 0.085, 0.032), center=(0, -0.45, 0.322), e=0.5),
    'nose': dict(radii=(0.022, 0.012, 0.016), center=(0, -0.534, 0.336)),
    'jaw': dict(radii=(0.036, 0.07, 0.014), center=(0, -0.445, 0.284), e=0.5, pivot=(0, -0.385, 0.296)),
    # Long flat ears hanging from the top corners of the head, past the chin.
    'ear': dict(radii=(0.02, 0.045, 0.1), x=0.096, y=-0.32, top=0.41, e=0.55, tilt=0.12),
    'tail': [(0, 0.26, 0.23), (0, 0.34, 0.26), (0, 0.41, 0.3), (0, 0.46, 0.36)],
    'tail_r': (0.024, 0.012),
    'bolt': dict(r=0.009, x=0.088, y=-0.31, z=0.375),
    'collar': dict(center=(0, -0.265, 0.25), major=0.058, minor=0.012, tilt=0.75),
}
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def rig_bones():
    z, (j1, j2), lg, e, jw = D['z'], D['joints'], D['leg'], D['ear'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # Three bones down the back, from the hips forward: body (the hips, as for every
        # pet), mid, chest. Each joint sits in the middle of a bellows.
        ('body', (0, lg['back'], z), (0, j1, z), 'root'),
        ('mid', (0, j1, z), (0, j2, z), 'body'),
        ('chest', (0, j2, z), (0, -0.3, z), 'mid'),
        ('head', (0, -0.25, 0.24), (0, -0.33, 0.44), 'chest'),
        ('jaw', jw['pivot'], (0, -0.51, jw['pivot'][2]), 'head'),
        ('ear.L', (e['x'], e['y'], e['top']), (e['x'] + 0.01, e['y'], e['top'] - 0.2), 'head'),
        ('ear.R', (-e['x'], e['y'], e['top']), (-e['x'] - 0.01, e['y'], e['top'] - 0.2), 'head'),
    ]
    pts = kit.spline(D['tail'], 4)
    parent = 'body'
    for i in range(3):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    for name, x, end in LEGS:
        bones.append((f'leg.{name}', (x * lg['x'], lg[end], lg['top']), (x * lg['x'], lg[end], 0.0),
                      'chest' if end == 'front' else 'body'))
    return bones


def bellows(name, y):
    """A ribbed sleeve round the joint at y, in and out like an accordion."""
    b = D['bellows']
    n = b['ribs'] * 2 + 1
    pts = [(0, y + b['length'] / 2 - b['length'] * i / (n - 1), D['z']) for i in range(n)]
    radii = [b['r'][i % 2] for i in range(n)]
    return kit.tube(name, pts, radii, ring=28)


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The long body: three segments, each with its light bar, and bellows between them.
    z, e, bar = D['z'], D['e'], D['bar']
    for i, (name, bone, y, radii, drop) in enumerate(D['segments']):
        add(kit.superellipsoid(name, radii, e, e, seg=(40, 24), location=(0, y, z - drop)), m['shell'], bone)
        add(kit.superellipsoid(f'Bar.{name}', bar['radii'], 0.5, 0.5, seg=(20, 10),
                               location=(0, y, z - drop + radii[2] - 0.006)), m['dot'](2 - i), bone)
    for k, (y, bones) in enumerate(zip(D['joints'], (['body', 'mid'], ['mid', 'chest']))):
        sleeve, ts = bellows(f'Bellows.{k}', y)
        add(sleeve, m['joint'], kit.chain(ts, bones))

    # Rimmed ends on every bellows, bezels round the light bars.
    rr, rm, ro = D['bellows']['rim']
    for k, (y, bones) in enumerate(zip(D['joints'], (['body', 'mid'], ['mid', 'chest']))):
        for side, bone in ((1, bones[0]), (-1, bones[1])):
            add(kit.torus(f'Rim.{k}.{side}', rr, rm, seg=(32, 8), location=(0, y + side * ro, z),
                          rotation=(math.pi / 2, 0, 0)), m['joint'], bone)
    for i, (name, bone, y, radii, drop) in enumerate(D['segments']):
        top = z - drop + radii[2] - 0.009
        add(kit.superellipsoid(f'BarBezel.{name}', (bar['radii'][0] + 0.006, bar['radii'][1] + 0.006, 0.012), 0.5, 0.5,
                               seg=(20, 10), location=(0, y, top)), m['bezel'], bone)

    # Panel seams round each segment, rivets along them, a hatch, vents and a port.
    def shell_x(radii, dy, dz):
        """How far out the segment's shell is at this offset from its centre."""
        k = 1 - (dy / radii[1]) ** 4 - (dz / radii[2]) ** 4
        return radii[0] * max(k, 0.01) ** 0.25

    for name, bone, y, radii, drop in D['segments']:
        zc = z - drop
        for side in (1, -1):
            dy = side * 0.5 * radii[1]
            f = 0.967
            add(kit.superellipsoid(f'Seam.{name}.{side}', (radii[0] * f + 0.0025, 0.0022, radii[2] * f + 0.0025), 0.5, 0.5,
                                   seg=(28, 8), location=(0, y + dy, zc)), m['bezel'], bone)
            for sx in (1, -1):
                for dz in (-0.03, 0.03):
                    add(kit.superellipsoid(f'Rivet.{name}.{side}.{sx}.{int(dz * 100)}', (0.0055,) * 3, seg=(10, 6),
                                           location=(sx * (shell_x(radii, dy, dz) * f + 0.0035), y + dy, zc + dz)),
                        m['bezel'], bone)
    rx, rz = D['segments'][1][3][0], z - D['segments'][1][4]
    add(kit.superellipsoid('Hatch', (0.005, 0.03, 0.022), 0.3, 0.3, seg=(16, 8), location=(rx - 0.001, 0, rz)),
        m['joint'], 'mid')
    add(kit.superellipsoid('HatchKnob', (0.006,) * 3, seg=(10, 6), location=(rx + 0.006, 0.014, rz)), m['bezel'], 'mid')
    add(kit.superellipsoid('HatchHinge', (0.004,) * 3, seg=(8, 6), location=(rx + 0.003, -0.022, rz + 0.012)),
        m['bezel'], 'mid')
    add(kit.superellipsoid('HatchHinge2', (0.004,) * 3, seg=(8, 6), location=(rx + 0.003, -0.022, rz - 0.012)),
        m['bezel'], 'mid')
    for k in range(3):
        add(kit.superellipsoid(f'Vent.{k}', (0.004, 0.032, 0.003), 0.4, 0.4, seg=(12, 6),
                               location=(-rx - 0.0005, 0, rz + (k - 1) * 0.014)), m['shell'], 'mid')
    hx = D['segments'][0][3][0]
    hz = z - D['segments'][0][4]
    add(kit.torus('Port', 0.017, 0.005, seg=(20, 8), location=(hx - 0.002, D['segments'][0][2], hz),
                  rotation=(0, math.pi / 2, 0)), m['joint'], 'body')
    add(kit.superellipsoid('PortCap', (0.006, 0.012, 0.012), 0.6, 0.6, seg=(12, 8),
                           location=(hx - 0.001, D['segments'][0][2], hz)), m['shell'], 'body')

    # Tiny legs and round paws: joint rings, toe grooves and a rubber sole.
    lg, pw = D['leg'], D['paw']
    for name, x, end in LEGS:
        lx, y = x * lg['x'], lg[end]
        leg, _ = kit.tube(f'Leg.{name}', [(lx, y, lg['top']), (lx, y, pw['radii'][2])], lg['r'], ring=12)
        add(leg, m['shell'], f'leg.{name}')
        for q, zq in enumerate((lg['top'] - 0.008, 0.07)):
            add(kit.torus(f'LegRing.{name}.{q}', lg['r'] + 0.002, 0.0055, seg=(20, 6), location=(lx, y, zq)),
                m['joint'], f'leg.{name}')
        px, py, pz = pw['radii']
        pc = (lx, y - 0.012, pz)
        add(kit.superellipsoid(f'Paw.{name}', pw['radii'], pw['e'], 0.6, seg=(20, 10), location=pc),
            m['joint'], f'leg.{name}')
        add(kit.superellipsoid(f'Sole.{name}', (px * 1.02, py * 1.02, 0.006), 0.5, 0.5, seg=(20, 6),
                               location=(pc[0], pc[1], 0.005)), m['shell'], f'leg.{name}')
        for g in (-1, 0, 1):
            dy = -0.03
            zt = pz + pz * (1 - (dy / py) ** 4) ** 0.25 * 0.86
            add(kit.superellipsoid(f'Toe.{name}.{g + 1}', (0.0022, 0.014, 0.0035), 0.5, 0.5, seg=(8, 6),
                                   location=(lx + g * 0.013, pc[1] + dy, zt), rotation=(0.45, 0, 0)),
                m['shell'], f'leg.{name}')

    # Neck, collar and head: screen face, long snout with a nose, a jaw that opens.
    n = D['neck']
    neck, _ = kit.tube('Neck', kit.spline(n['points'], 8), n['r'], ring=14)
    add(neck, m['shell'], 'head')
    c = D['collar']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(32, 8), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['role']('Collar', 'joint'), 'head')
    # A tag on a little loop at the front of the collar, and studs either side.
    cy, cz = c['center'][1] - c['major'] * math.cos(c['tilt']), c['center'][2] - c['major'] * math.sin(c['tilt'])
    add(kit.torus('TagLoop', 0.006, 0.002, seg=(12, 6), location=(0, cy - 0.001, cz - 0.004),
                  rotation=(0, math.pi / 2, 0)), m['bezel'], 'head')
    add(kit.superellipsoid('Tag', (0.017, 0.003, 0.017), 0.4, 0.4, seg=(20, 6), location=(0, cy - 0.005, cz - 0.022)),
        m['role']('Tag', 'bezel'), 'head')
    add(kit.superellipsoid('TagDot', (0.005, 0.004, 0.005), seg=(10, 6), location=(0, cy - 0.0075, cz - 0.022)),
        m['shell'], 'head')
    for side in (1, -1):
        sx = side * c['major'] * math.sin(0.9)
        sy = c['center'][1] - c['major'] * math.cos(0.9) * math.cos(c['tilt'])
        sz = c['center'][2] - c['major'] * math.cos(0.9) * math.sin(c['tilt'])
        add(kit.superellipsoid(f'Stud.{side}', (0.0085,) * 3, seg=(10, 6), location=(sx, sy, sz)), m['bezel'], 'head')
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], BOXY, BOXY, seg=(40, 28), location=h['center']), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Dachshund', sc['radii'], sc['center'], sc['bezel'], e=BOXY)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    s, no, j = D['snout'], D['nose'], D['jaw']
    add(kit.superellipsoid('Snout', s['radii'], s['e'], s['e'], seg=(28, 18), location=s['center']), m['shell'], 'head')
    add(kit.superellipsoid('Nose', no['radii'], 0.6, 0.8, seg=(18, 12), location=no['center']), m['bezel'], 'head')
    add(kit.superellipsoid('Jaw', j['radii'], j['e'], j['e'], seg=(24, 12), location=j['center']), m['joint'], 'jaw')

    # Head seam, whisker rivets, nostril vents, nose collar and a jaw hinge pin each side.
    add(kit.superellipsoid('HeadSeam', (h['radii'][0] + 0.0022, 0.0022, h['radii'][2] + 0.0022), BOXY, BOXY,
                           seg=(28, 8), location=(0, h['center'][1] + 0.04, h['center'][2])), m['bezel'], 'head')
    add(kit.superellipsoid('NoseCollar', (no['radii'][0] + 0.005, 0.005, no['radii'][2] + 0.005), 0.5, 0.6,
                           seg=(18, 8), location=(0, no['center'][1] + 0.011, no['center'][2])), m['joint'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.0045, 0.0025, 0.0055), seg=(8, 6),
                               location=(side * 0.009, no['center'][1] - 0.0115, no['center'][2] - 0.001)),
            m['shell'], 'head')
        add(kit.superellipsoid(f'JawPin.{side}', (0.007, 0.011, 0.011), seg=(12, 8),
                               location=(side * 0.036, j['pivot'][1], j['pivot'][2])), m['bezel'], 'head')
        add(kit.torus(f'JawPinRing.{side}', 0.011, 0.003, seg=(16, 6),
                      location=(side * 0.043, j['pivot'][1], j['pivot'][2]), rotation=(0, math.pi / 2, 0)),
            m['joint'], 'head')
        for q in range(3):
            add(kit.superellipsoid(f'Whisker.{side}.{q}', (0.0035,) * 3, seg=(8, 6),
                                   location=(side * 0.033, s['center'][1] - 0.015 - q * 0.014, s['center'][2] + 0.006)),
                m['bezel'], 'head')
    add(kit.superellipsoid('Chin', (0.02, 0.012, 0.005), 0.5, 0.5, seg=(12, 6),
                           location=(0, j['center'][1] - 0.035, j['center'][2] - 0.012)), m['bezel'], 'jaw')

    # Cheek bolts.
    bo = D['bolt']
    for side in (1, -1):
        add(kit.superellipsoid(f'Bolt.{side}', (bo['r'],) * 3, seg=(12, 8), location=(side * bo['x'], bo['y'], bo['z'])),
            m['bezel'], 'head')

    # Long ears, tipped out a little.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], e['e'], e['e'], seg=(20, 14),
                               location=(side * e['x'], e['y'], e['top'] - e['radii'][2]),
                               rotation=(0, side * e['tilt'], 0)), m['role']('Ear', 'joint'), f'ear.{sfx}')

    # Layered ear detail: a lighter plate on the outside, a soft trim behind, a hinge at the top.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        cz = e['top'] - e['radii'][2]
        add(kit.superellipsoid(f'EarTrim.{sfx}', (e['radii'][0] * 0.6, e['radii'][1] + 0.006, e['radii'][2] + 0.006),
                               e['e'], e['e'], seg=(20, 14), location=(side * (e['x'] - 0.003), e['y'], cz),
                               rotation=(0, side * e['tilt'], 0)), m['bezel'], f'ear.{sfx}')
        add(kit.superellipsoid(f'EarPlate.{sfx}', (0.006, e['radii'][1] * 0.66, e['radii'][2] * 0.7), e['e'], e['e'],
                               seg=(18, 12), location=(side * (e['x'] + 0.019), e['y'], cz + 0.01),
                               rotation=(0, side * e['tilt'], 0)), m['role']('EarPlate', 'joint'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.013, 0.013, 0.013), seg=(12, 8),
                               location=(side * (e['x'] + 0.008), e['y'], e['top'] - 0.004)), m['bezel'], f'ear.{sfx}')
        add(kit.superellipsoid(f'EarPin.{sfx}', (0.0055,) * 3, seg=(8, 6),
                               location=(side * (e['x'] + 0.024), e['y'], e['top'] - 0.004)), m['joint'], f'ear.{sfx}')

    # A long thin tail over three bones.
    pts = kit.spline(D['tail'], 14)
    r0, r1 = D['tail_r']
    tail, ts = kit.tube('Tail', pts, [r0 + (r1 - r0) * i / (len(pts) - 1) for i in range(len(pts))], ring=12)
    add(tail, m['shell'], kit.chain(ts, ['tail.1', 'tail.2', 'tail.3']))
    # Rings at the base and the two joints, a cap on the tip.
    for q, (idx, bone) in enumerate(((0, 'tail.1'), (4, 'tail.2'), (9, 'tail.3'))):
        tan = Vector(pts[min(idx + 1, len(pts) - 1)]) - Vector(pts[idx])
        rot = tan.to_track_quat('Z', 'Y').to_euler()
        add(kit.torus(f'TailRing.{q}', r0 + (r1 - r0) * idx / (len(pts) - 1) + 0.0015, 0.004, seg=(18, 6),
                      location=pts[idx], rotation=tuple(rot)), m['joint'], bone)
    add(kit.superellipsoid('TailCap', (0.0155,) * 3, seg=(14, 8), location=pts[-1]), m['bezel'], 'tail.3')

    return looks.finish(kit.armature('DachshundRig', rig_bones()), parts, skin, m)
