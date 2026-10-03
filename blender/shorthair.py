"""Bun, the crew's robot British shorthair: a teddy-bear cat toy. A big round head wider than
tall, its screen almost all eyes (the huge round eyes are the signature), a chubby cheek
pod on each side with a row of little lights, small round ears set wide apart, a short
thick neck with a collar and a tag, a sturdy cobby body quilted in soft panel seams over
the back, thick short legs on big round paws and a short thick
tail with a rounded tip, banded like a plush toy's. The one colour is the tag (the
beacon); the cheek lights (Dot0 her left, Dot1 her right) glow when she purrs. Faces -Y
like the rest of the crew; about 0.62 m to the ear tips.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'shorthair'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'head': dict(radii=(0.25, 0.185, 0.17), center=(0, -0.2, 0.405), e=0.78),
    'screen': dict(radii=(0.2, 0.115, 0.125), center=(0, -0.292, 0.415), bezel=0.011),
    'cheek': dict(radii=(0.072, 0.068, 0.06), center=(0.195, -0.275, 0.335)),
    'ear': dict(x=0.168, z=0.53, tilt=0.34, profile=[(0.0, 0.115), (0.025, 0.108), (0.06, 0.07), (0.082, 0.0)]),
    'body': dict(radii=(0.19, 0.215, 0.145), center=(0, 0.06, 0.208), e=0.5),
    'collar': dict(center=(0, -0.13, 0.265), major=0.118, minor=0.016, tilt=0.45),
    'tag': dict(r=0.026, center=(0, -0.152, 0.148)),
    'leg': dict(x=0.108, front=-0.09, back=0.2, top=0.17, bottom=0.04, r=0.054),
    'paw': dict(radii=(0.066, 0.076, 0.04), e=0.45),
    'tail': [(0, 0.25, 0.22), (0, 0.34, 0.25), (0, 0.39, 0.31), (0, 0.39, 0.39), (0, 0.365, 0.45)],
    'tail_r': (0.052, 0.046),
    'seam': 0.0035,
}


def rig_bones():
    lg, t, e = D['leg'], D['tail'], D['ear']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.24, 0.24), (0, -0.14, 0.27), 'root'),
        ('head', (0, -0.15, 0.3), (0, -0.2, 0.6), 'body'),
        ('ear.L', (e['x'], -0.2, e['z']), (e['x'] + 0.03, -0.2, e['z'] + 0.09), 'head'),
        ('ear.R', (-e['x'], -0.2, e['z']), (-e['x'] - 0.03, -0.2, e['z'] + 0.09), 'head'),
    ]
    pts = kit.spline(t, 4)
    parent = 'body'
    for i in range(3):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        bones.append((f'leg.{name}', (x * lg['x'], y, lg['top']), (x * lg['x'], y, 0.0), 'body'))
    return bones


def section(radii, e, center, axis, at, lift=1.012, n=44):
    """A closed seam round a superellipsoid: where the plane axis = at cuts its surface
    (axis 0 for x, 1 for y), lifted a hair off it. Points run up one side and down the
    other, meeting at the poles."""
    rx, ry, rz = radii
    cx, cy, cz = center
    side, along = (rx, ry) if axis == 1 else (ry, rx)
    up = []
    for i in range(n + 1):
        phi = -math.pi / 2 + math.pi * i / n
        cp, sp = kit.spow(math.cos(phi), e), kit.spow(math.sin(phi), e)
        v = at / (({0: rx, 1: ry}[axis]) * cp) if cp > 1e-6 else 2
        if abs(v) > 1:
            continue
        th = math.asin(kit.spow(v, 1 / e))
        a = side * cp * kit.spow(math.cos(th), e)
        z = rz * sp
        up.append((a, z))
    pts = []
    for a, z in up:
        pts.append((a, z))
    for a, z in reversed(up):
        pts.append((-a, z))
    out = []
    for a, z in pts:
        p = [0, 0, 0]
        p[axis] = at
        p[1 - axis] = a
        out.append((cx + p[0] * lift, cy + p[1] * lift, cz + z * lift))
    return out


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    seam = D['seam']
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(56, 36), location=h['center']), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Shorthair', sc['radii'], sc['center'], sc['bezel'], e=0.5)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    def bolt(name, at, r, bone, mat=None, flat=1.0):
        """A little domed bolt head or button, sunk into the surface it sits on."""
        return add(kit.superellipsoid(name, (r, r, r * flat), 0.6, 0.6, seg=(12, 8), location=at),
                   mat or m['bezel'], bone)

    # A seam over the crown from the screen's rim to the nape, with three bolts along it.
    pts = [q for q in section(h['radii'], h['e'], h['center'], 0, 0.0, lift=1.006)
           if q[1] > h['center'][1] - 0.03 and q[2] > h['center'][2] - 0.02]
    add(kit.tube('CrownSeam', pts, seam, ring=6)[0], m['joint'], 'head')
    for i, k in enumerate((0.25, 0.5, 0.75)):
        q = pts[int(k * (len(pts) - 1))]
        bolt(f'CrownBolt{i}', (q[0], q[1], q[2]), 0.0075, 'head')
    # Temple screws holding the screen's bezel.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, dz in enumerate((-0.06, 0.06)):
            bolt(f'TempleBolt.{sfx}{k}', (side * 0.222, -0.312, sc['center'][2] + dz), 0.0075, 'head')

    # Chubby cheek pods either side of the screen, each with a row of three small lights.
    ck = D['cheek']
    for side, sfx, dot in ((1, 'L', 0), (-1, 'R', 1)):
        cx, cy, cz = ck['center']
        add(kit.superellipsoid(f'Cheek.{sfx}', ck['radii'], 0.75, 0.75, seg=(32, 20), location=(side * cx, cy, cz)),
            m['role']('Cheek'), 'head')
        for k in range(3):
            ang = math.radians(-8 + 26 * k)
            add(kit.superellipsoid(f'CheekLight.{sfx}{k}', (0.011, 0.006, 0.011), 0.7, 1.0, seg=(12, 6),
                                   location=(side * (cx + ck['radii'][0] * 0.62 * math.cos(ang)),
                                             cy - ck['radii'][1] * 0.86,
                                             cz - 0.012 + ck['radii'][2] * 0.62 * math.sin(ang) * 0.5 - 0.004 * k)),
                m['dot'](dot), 'head')
            # A bezel ring round each light.
            add(kit.torus(f'CheekBezel.{sfx}{k}', 0.0125, 0.0028, seg=(16, 6),
                          location=(side * (cx + ck['radii'][0] * 0.62 * math.cos(ang)),
                                    cy - ck['radii'][1] * 0.84,
                                    cz - 0.012 + ck['radii'][2] * 0.62 * math.sin(ang) * 0.5 - 0.004 * k),
                          rotation=(math.pi / 2, 0, 0)), m['bezel'], 'head')
        # A seam round the pod, and three whisker pods on its side, each with a short whisker.
        add(kit.tube(f'CheekSeam.{sfx}', section(ck['radii'], 0.75, (side * cx, cy, cz), 1, 0.022, lift=1.008),
                     seam, ring=6)[0], m['joint'], 'head')
        for k, dz in enumerate((-0.022, 0.0, 0.022)):
            base = (side * (cx + ck['radii'][0] * 0.92), cy - 0.016, cz - 0.004 + dz)
            bolt(f'WhiskerPod.{sfx}{k}', base, 0.0075, 'head', m['joint'])
            add(kit.tube(f'Whisker.{sfx}{k}', [base, (base[0] + side * 0.05, base[1] - 0.03, base[2] + dz * 1.8)],
                         0.0022, ring=5)[0], m['joint'], 'head')

    # Ears: small round cones, wide apart, tipped out a little, with a dark inner ear.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ear = kit.stretch(kit.lathe(f'Ear.{sfx}', e['profile'], seg=24), sy=0.55)
        ear.location = (side * e['x'], -0.2, e['z'] - 0.03)
        ear.rotation_euler = (0, side * e['tilt'], 0)
        add(ear, m['shell'], f'ear.{sfx}')
        inner = kit.stretch(kit.lathe(f'InnerEar.{sfx}', [(r * 0.6, z * 0.72 + 0.012) for r, z in e['profile']],
                                      seg=24), sy=0.25)
        inner.location = (side * e['x'], -0.222, e['z'] - 0.03)
        inner.rotation_euler = (0, side * e['tilt'], 0)
        add(inner, m['joint'], f'ear.{sfx}')
        # A rim round the base of the ear and a soft pad in the middle of the inner ear.
        er = kit.stretch(kit.torus(f'EarRim.{sfx}', 0.066, 0.008, seg=(28, 8)), sy=0.55)
        er.location = (side * (e['x'] + 0.036 * math.sin(e['tilt'])), -0.2, e['z'] - 0.03 + 0.036)
        er.rotation_euler = (0, side * e['tilt'], 0)
        add(er, m['bezel'], f'ear.{sfx}')
        pad = kit.superellipsoid(f'EarPad.{sfx}', (0.036, 0.008, 0.045), 0.7, 0.8, seg=(16, 10))
        pad.location = (side * (e['x'] + 0.026 * math.sin(e['tilt'])), -0.238, e['z'] - 0.03 + 0.045)
        pad.rotation_euler = (0, side * e['tilt'], 0)
        add(pad, m['role']('EarPad', 'joint'), f'ear.{sfx}')

    # Cobby body, quilted: seams across the back and down it in a soft diamond grid.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(48, 32), location=b['center']), m['shell'], 'body')
    for i, y in enumerate((-0.09, 0.0, 0.09, 0.18)):
        pts = section(b['radii'], b['e'], b['center'], 1, y - b['center'][1])
        # Over the back and sides only, so they read as quilting, not ribs.
        pts = [p for p in pts if p[2] > b['center'][2] + 0.04]
        add(kit.tube(f'Quilt.Y{i}', pts, seam, ring=6)[0], m['joint'], 'body')
    for i, x in enumerate((-0.11, -0.055, 0.0, 0.055, 0.11)):
        if i == 2:
            continue
        pts = section(b['radii'], b['e'], b['center'], 0, x)
        # Only over the back and sides, not underneath.
        pts = [p for p in pts if p[2] > b['center'][2] + 0.04]
        add(kit.tube(f'Quilt.X{i}', pts, seam, ring=6)[0], m['joint'], 'body')

    # Buttons at the seam crossings.
    for i, y in enumerate((-0.09, 0.0, 0.09, 0.18)):
        for j, x in enumerate((-0.11, -0.055, 0.055, 0.11)):
            rho = (x / b['radii'][0]) ** 4 + ((y - b['center'][1]) / b['radii'][1]) ** 4
            z = b['center'][2] + b['radii'][2] * (1 - rho) ** 0.25
            add(kit.superellipsoid(f'Button{i}{j}', (0.0085, 0.0085, 0.005), 0.6, 0.8, seg=(12, 8),
                                   location=(x, y, z + 0.0025)), m['bezel'], 'body')

    # A chest plate with four bolts.
    add(kit.superellipsoid('ChestPlate', (0.062, 0.011, 0.056), 0.45, 0.6, seg=(24, 12), location=(0, -0.146, 0.148)),
        m['joint'], 'body')
    for i, (dx, dz) in enumerate(((-0.044, -0.04), (0.044, -0.04), (-0.044, 0.04), (0.044, 0.04))):
        bolt(f'ChestBolt{i}', (dx, -0.156, 0.148 + dz), 0.006, 'body')

    # Collar and tag.
    c = D['collar']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(44, 10), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['joint'], 'body')
    t = D['tag']
    add(kit.superellipsoid('Tag', (t['r'], 0.012, t['r']), 0.5, 1.0, seg=(24, 8), location=t['center'],
                           rotation=(0, 0, 0)), m['beacon'], 'body')
    # The buckle at the front of the collar and the ring the tag hangs from.
    add(kit.superellipsoid('Buckle', (0.02, 0.008, 0.016), 0.45, 0.6, seg=(16, 8), location=(0, -0.232, 0.213)),
        m['bezel'], 'body')
    add(kit.torus('TagRing', 0.011, 0.0028, seg=(16, 6), location=(0, -0.156, 0.178), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'body')

    # Legs: thick and short on big round paws, with a toe seam each.
    lg, pw = D['leg'], D['paw']
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        leg, _ = kit.tube(f'Leg.{name}', [(x * lg['x'], y, lg['top']), (x * lg['x'], y, lg['bottom'])], lg['r'],
                          ring=16)
        add(leg, m['shell'], f'leg.{name}')
        add(kit.superellipsoid(f'Paw.{name}', pw['radii'], pw['e'], 0.6, seg=(28, 26),
                               location=(x * lg['x'], y - 0.014, pw['radii'][2])), m['joint'], f'leg.{name}')
        bone = f'leg.{name}'
        # An ankle ring, toe grooves on top, and rubber toe beans under the paw.
        add(kit.torus(f'Ankle.{name}', lg['r'] * 1.04, 0.0065, seg=(24, 8), location=(x * lg['x'], y, 0.086)),
            m['bezel'], bone)
        for k, xo in enumerate((-0.024, 0.0, 0.024)):
            add(kit.tube(f'ToeGroove.{name}{k}', [(x * lg['x'] + xo, y - 0.04, 0.0815),
                                                  (x * lg['x'] + xo, y - 0.07, 0.0775)], 0.0026, ring=5)[0],
                m['bezel'], bone)
        bean = m['role']('Bean', 'joint')
        add(kit.superellipsoid(f'Pad.{name}', (0.03, 0.026, 0.009), 0.6, 0.7, seg=(16, 8),
                               location=(x * lg['x'], y + 0.004, 0.0075)), bean, bone)
        for k, (xo, yo) in enumerate(((-0.036, -0.038), (-0.012, -0.05), (0.012, -0.05), (0.036, -0.038))):
            add(kit.superellipsoid(f'Toe.{name}{k}', (0.0125, 0.0125, 0.008), 0.6, 0.7, seg=(12, 8),
                                   location=(x * lg['x'] + xo, y + yo, 0.0075)), bean, bone)

    # Tail: short and thick, ending in a rounded tip, with two plush bands.
    pts = kit.spline(D['tail'], 24)
    r0, r1 = D['tail_r']
    radii = [r0 + (r1 - r0) * i / (len(pts) - 1) for i in range(len(pts))]
    tail, ts = kit.tube('Tail', pts, radii, ring=14)
    add(tail, m['shell'], kit.chain(ts, ['tail.1', 'tail.2', 'tail.3']))
    # Plush bands: rimmed rings round it, each riding the bone it sits on, and a round cap.
    def ring_at(i, name, major, minor, bone, mat):
        a, c = Vector(pts[max(i - 1, 0)]), Vector(pts[min(i + 1, len(pts) - 1)])
        rot = Vector((0, 0, 1)).rotation_difference((c - a).normalized()).to_euler()
        add(kit.torus(name, major, minor, seg=(28, 8), location=tuple(pts[i]), rotation=tuple(rot)), mat, bone)

    for k, (frac, bone) in enumerate(((0.4, 'tail.2'), (0.62, 'tail.2'), (0.84, 'tail.3'))):
        i = int(frac * (len(pts) - 1))
        ring_at(i, f'TailBand{k}', radii[i] * 0.93, 0.011, bone, m['joint'])
    end, before = Vector(pts[-1]), Vector(pts[-3])
    axis = (end - before).normalized()
    add(kit.superellipsoid('TailCap', (0.03, 0.03, 0.03), 0.8, 0.8, seg=(20, 12), location=tuple(end + axis * 0.028)),
        m['bezel'], 'tail.3')
    ring_at(len(pts) - 2, 'TailCapRim', radii[-1] * 0.9, 0.007, 'tail.3', m['bezel'])

    return looks.finish(kit.armature('ShorthairRig', rig_bones()), parts, skin, m)
