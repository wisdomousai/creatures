"""Vix, the crew's robot fox: a sleek toy robot built from angular panels, not a fox in a
robot suit, and plainly not the round cat or dog. Every part is a loft of chamfered
octagons, flat-shaded so the facets read as machined plates: a long low body, a wedge
of a head with a screen face and a pointed snout (a lower jaw hinged under it, for a
yawn), two tall faceted ears on their own joints, a pale chest plate and chin, and
slim legs with ball-joint knees and dark socks.

The tail is the signature: as long as the body, bushy in the middle, a chain of four
faceted pods on four bones, so it can curl round her feet, sweep, stand up and wiggle.
Its tip is the light (Dot0), the robot's take on a fox's white brush. Faces -Y like the
rest of the crew; about 0.7 m to the ear tips.
"""

import math

from mathutils import Vector

import kit
import looks

FACE = 'fox'
PREVIEW = dict(lift=0.0, width=0.8)

D = {
    # Lofts: (y, z, half-width, half-height) sections, back to front. The body is two
    # blocks, hips and chest, with a ring for a waist between them.
    'hips': [(0.225, 0.3, 0.07, 0.076), (0.205, 0.3, 0.1, 0.104), (0.09, 0.296, 0.1, 0.104),
             (0.045, 0.296, 0.086, 0.092)],
    'waist': [(0.06, 0.297, 0.078, 0.084), (0.0, 0.297, 0.078, 0.084)],
    'chest': [(0.02, 0.3, 0.09, 0.098), (-0.01, 0.3, 0.104, 0.114), (-0.12, 0.305, 0.108, 0.12),
              (-0.17, 0.31, 0.088, 0.1), (-0.185, 0.31, 0.058, 0.07)],
    'head': [(-0.12, 0.5, 0.09, 0.09), (-0.15, 0.5, 0.15, 0.12), (-0.29, 0.5, 0.155, 0.12),
             (-0.335, 0.5, 0.125, 0.098)],
    'snout': [(-0.31, 0.44, 0.08, 0.046), (-0.375, 0.435, 0.058, 0.036), (-0.43, 0.43, 0.034, 0.025),
              (-0.455, 0.427, 0.017, 0.015)],
    'jaw': [(-0.3, 0.392, 0.064, 0.02), (-0.37, 0.392, 0.045, 0.017), (-0.425, 0.397, 0.022, 0.011)],
    'hinge': (0, -0.29, 0.408),
    'nose': dict(radii=(0.024, 0.017, 0.017), center=(0, -0.46, 0.433)),
    # Pale cheek ruffs, pointing out and down from the sides of the head: (x, z, depth, height).
    'cheek': [(0.095, 0.45, 0.075, 0.055), (0.15, 0.412, 0.055, 0.036), (0.18, 0.372, 0.01, 0.01)],
    'cheek_y': -0.25,
    # 2:1, like the fox's face layout (512 x 256)
    'screen': dict(radii=(0.104, 0.015, 0.052), center=(0, -0.331, 0.531), bezel=0.01),
    'neck': dict(r=0.068, center=(0, -0.165, 0.4)),
    # Ears: base and tip; half-width and thickness at the base; a hinge puck under each.
    'ear': dict(base=(0.085, -0.225, 0.595), tip=(0.13, -0.22, 0.8), w=0.068, t=0.026, hinge=0.032),
    'plate': [(-0.18, 0.405, 0.05, 0.012), (-0.198, 0.33, 0.06, 0.014), (-0.17, 0.235, 0.044, 0.012),
              (-0.13, 0.208, 0.026, 0.01)],
    'leg': dict(x=0.076, front=-0.105, back=0.155, top=0.26, knee=0.125, w=0.036, sock=0.043),
    'paw': dict(length=0.09, w=0.045, h=0.024),
    'hub': dict(r=0.028, t=0.008),
    # The tail's centreline, rump to tip, and its girth along it (0 root .. 1 tip).
    'tail': [(0, 0.22, 0.34), (0, 0.33, 0.33), (0, 0.45, 0.31), (0, 0.57, 0.305), (0, 0.68, 0.325),
             (0, 0.78, 0.36)],
    'girth': [(0.0, 0.055), (0.18, 0.105), (0.45, 0.14), (0.7, 0.13), (0.87, 0.09), (1.0, 0.012)],
    'bones': 4,
}
CHAMFER = 0.42


def ring(w, h, chamfer=CHAMFER):
    """A chamfered rectangle (an octagon), in its own (side, up) axes."""
    c = chamfer * min(w, h)
    pts = []
    for sx, sy, a in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for da in (0, 90):
            t = math.radians(a + da)
            pts.append((sx * (w - c) + c * math.cos(t), sy * (h - c) + c * math.sin(t)))
    return pts


def loft(name, sections, up=(0, 0, 1), chamfer=CHAMFER):
    """A faceted panel: chamfered octagons through (point, half-width, half-height)
    sections, capped flat at both ends and flat-shaded, so it reads as machined plates.
    Half-width runs across the path, half-height along `up`."""
    pts = [Vector(p) for p, _, _ in sections]
    ref = Vector(up)
    verts, faces = [], []
    for i, (p, w, h) in enumerate(sections):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(ref).normalized()
        upv = side.cross(t)
        verts += [tuple(Vector(p) + side * a + upv * b) for a, b in ring(w, h, chamfer)]
    n = len(ring(1, 1))
    for i in range(len(sections) - 1):
        a, b = i * n, (i + 1) * n
        faces += [(a + k, a + (k + 1) % n, b + (k + 1) % n, b + k) for k in range(n)]
    faces.append(tuple(range(n))[::-1])
    faces.append(tuple(range((len(sections) - 1) * n, len(sections) * n)))
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def along(sections):
    """Body-style sections (y, z, w, h) on the centreline, as loft sections."""
    return [((0, y, z), w, h) for y, z, w, h in sections]


def girth(t):
    g = D['girth']
    for (t0, r0), (t1, r1) in zip(g, g[1:]):
        if t <= t1:
            return r0 + (r1 - r0) * (t - t0) / (t1 - t0)
    return g[-1][1]


def tail_points():
    """The tail's joints: bones + 1 points along its centreline."""
    return kit.spline(D['tail'], D['bones'] + 1)


def leg_points(y, back):
    """Top, knee and ankle of a leg: the hind legs angle back to a hock."""
    lg = D['leg']
    if back:
        return (y, lg['top']), (y + 0.035, lg['knee']), (y + 0.012, 0.03)
    return (y, lg['top']), (y, lg['knee']), (y, 0.03)


def legs():
    lg = D['leg']
    return [(name, x * lg['x'], y, back) for name, x, y, back in
            (('FL', 1, lg['front'], False), ('FR', -1, lg['front'], False),
             ('BL', 1, lg['back'], True), ('BR', -1, lg['back'], True))]


def rig_bones():
    e, lg = D['ear'], D['leg']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # From the hips forward, like the other pets: pitching it turns the body about the hips.
        ('body', (0, lg['back'], 0.3), (0, -0.12, 0.31), 'root'),
        ('head', D['neck']['center'], (0, -0.2, 0.62), 'body'),
        ('jaw', D['hinge'], (0, -0.4, D['hinge'][2]), 'head'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bx, by, bz = e['base']
        tx, ty, tz = e['tip']
        bones.append((f'ear.{sfx}', (side * bx, by, bz), (side * tx, ty, tz), 'head'))
    pts = tail_points()
    parent = 'body'
    for i in range(D['bones']):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    for name, x, y, _ in legs():
        bones.append((f'leg.{name}', (x, y, lg['top']), (x, y, 0.0), 'body'))
    return bones


def refine(add, m, pale, sock):
    """The second pass: seams, screws, rims, joints, toes and rings, all small and on the
    bones of the part they sit on."""
    lg, pw, e = D['leg'], D['paw'], D['ear']
    dark, joint = m['bezel'], m['joint']

    def screw(name, loc, bone, mat=joint, r=0.008, axis='x'):
        rot = {'x': (0, math.pi / 2, 0), 'y': (math.pi / 2, 0, 0), 'z': (0, 0, 0)}[axis]
        return add(kit.superellipsoid(name, (r, r, r * 0.5), 0.3, 1.0, seg=(10, 4), location=loc, rotation=rot),
                   mat, bone)

    # Seams: thin dark strips down the back and along each flank, and round the waist.
    add(loft('SeamTop', [((0, 0.2, 0.405), 0.006, 0.003), ((0, 0.04, 0.4), 0.006, 0.003)]), dark, 'body')
    add(loft('SeamNeck', [((0, -0.02, 0.418), 0.006, 0.003), ((0, -0.16, 0.42), 0.006, 0.003)]), dark, 'body')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(loft(f'Flank.{sfx}', [((side * 0.101, 0.2, 0.3), 0.003, 0.012), ((side * 0.101, 0.1, 0.3), 0.003, 0.012)],
                 up=(0, 0, 1)), dark, 'body')
        add(loft(f'FlankC.{sfx}', [((side * 0.109, -0.02, 0.3), 0.003, 0.014), ((side * 0.11, -0.12, 0.305), 0.003, 0.014)],
                 up=(0, 0, 1)), dark, 'body')
        # Screws on hips and shoulders, a bolt each side of the head.
        screw(f'HipScrew.{sfx}', (side * 0.104, 0.17, 0.335), 'body', axis='x')
        screw(f'ShoulderScrew.{sfx}', (side * 0.11, -0.1, 0.345), 'body', axis='x')
        screw(f'HeadBolt.{sfx}', (side * 0.152, -0.2, 0.535), 'head', axis='x')
        # Whisker pod: a small puck the antenna grows out of, on the cheek.
        add(kit.superellipsoid(f'WhiskerPod.{sfx}', (0.022, 0.018, 0.016), 0.4, 0.6, seg=(12, 6),
                               location=(side * 0.148, -0.298, 0.46)), joint, 'head')
        # Ear: a light strip up the inner panel, and a rim plate round the base.
        base = Vector((side * e['base'][0], *e['base'][1:]))
        tip = Vector((side * e['tip'][0], *e['tip'][1:]))
        front = Vector((0, -e['t'] * 0.9, 0))
        add(loft(f'EarLight.{sfx}', [(base.lerp(tip, 0.2) + front, 0.006, 0.004),
                                     (base.lerp(tip, 0.7) + front, 0.005, 0.004)], up=(0, -1, 0)),
            m['dot'](4), f'ear.{sfx}')
        add(loft(f'EarRim.{sfx}', [(base + Vector((0, 0.004, 0.012)), e['w'] * 1.02, e['t'] * 1.15),
                                   (base + Vector((0, 0.004, 0.03)), e['w'] * 0.9, e['t'] * 1.05)], up=(0, -1, 0)),
            joint, f'ear.{sfx}')
        screw(f'EarScrew.{sfx}', tuple(base + Vector((0, -e['t'] * 1.15, 0.012))), f'ear.{sfx}', dark, 0.007, 'y')

    # Chest plate: a dark rim round it and four small screws at its corners.
    add(loft('PlateRim', [((0, y + 0.006, z - 0.002), w + 0.009, h - 0.004) for y, z, w, h in D['plate']], up=(0, -1, 0)),
        dark, 'body')
    add(loft('Plate', [((0, y, z), w, h) for y, z, w, h in D['plate']], up=(0, -1, 0)), pale, 'body')
    for j, (x, z) in enumerate(((0.038, 0.395), (-0.038, 0.395), (0.045, 0.325), (-0.045, 0.325))):
        screw(f'PlateScrew.{j}', (x, -0.19, z), 'body', dark, 0.006, 'y')

    # Collar: a lamp puck on the front of it, and a chin plate.
    add(kit.superellipsoid('CollarLamp', (0.014, 0.008, 0.014), 0.4, 0.6, seg=(10, 6), location=(0, -0.235, 0.398)),
        m['dot'](4), 'head')
    add(loft('Chin', [((0, -0.33, 0.385), 0.03, 0.006), ((0, -0.4, 0.388), 0.02, 0.005)]), pale, 'jaw')

    # Legs: knee caps, pistons up the strut, cuffs on the socks, toes and pads on the paws.
    for name, x, y, back in legs():
        (y0, z0), (y1, z1), (y2, z2) = leg_points(y, back)
        bone = f'leg.{name}'
        out = math.copysign(1, x)
        add(kit.superellipsoid(f'KneeCap.{name}', (0.02, 0.02, 0.008), 0.3, 1.0, seg=(14, 4),
                               location=(x + out * (lg['w'] * 1.15 + 0.004), y1, z1), rotation=(0, math.pi / 2, 0)),
            m['shell'], bone)
        screw(f'KneeScrew.{name}', (x + out * (lg['w'] * 1.15 + 0.011), y1, z1), bone, dark, 0.006)
        add(kit.tube(f'Piston.{name}', [(x + out * 0.03, y0 + 0.005, z0 - 0.005), (x + out * 0.035, y1 + 0.01, z1 + 0.025)],
                     0.005)[0], joint, bone)
        add(loft(f'Cuff.{name}', [((x, y1 + (y2 - y1) * 0.5, z1 + (z2 - z1) * 0.5), lg['sock'] * 1.12, lg['sock'] * 1.14),
                                  ((x, y1 + (y2 - y1) * 0.62, z1 + (z2 - z1) * 0.62), lg['sock'] * 1.12, lg['sock'] * 1.14)],
                 up=(0, -1, 0)), joint, bone)
        for k in (-1, 0, 1):
            add(loft(f'Toe.{name}.{k}', [((x + k * pw['w'] * 0.5, y2 - pw['length'] + 0.03, pw['h'] * 0.85), 0.011, pw['h'] * 0.6),
                                        ((x + k * pw['w'] * 0.55, y2 - pw['length'] - 0.004, pw['h'] * 0.7), 0.009, pw['h'] * 0.5)]),
                sock, bone)

    # Tail: a ring joint at each seam, a collar on the tip, a bright ring in front of the lit tip.
    dense = kit.spline(D['tail'], 97)
    k = D['bones']
    for i in range(1, k):
        t = i / k
        g = girth(t) * 1.08
        pt = dense[round(t * 96)]
        add(loft(f'TailRing.{i}', [(dense[round((t - 0.045) * 96)], g, g), (dense[round((t + 0.045) * 96)], g, g)]),
            joint, f'tail.{i + 1}')
    t = 0.93
    g = girth(t) * 1.05
    add(loft('TailBrush', [(dense[round((t - 0.02) * 96)], g, g), (dense[round((t + 0.02) * 96)], g, g)]),
        m['dot'](0), f'tail.{k}')


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    pale = m['role']('Chest', 'joint')
    sock = m['role']('Sock', 'bezel')

    # Body: hips and chest with a waist ring between, the pale plate down the chest, and
    # a ball joint for the neck.
    add(loft('Hips', along(D['hips'])), m['shell'], 'body')
    add(loft('Waist', along(D['waist'])), m['joint'], 'body')
    add(loft('Chest', along(D['chest'])), m['shell'], 'body')
    n = D['neck']
    add(kit.superellipsoid('Neck', (n['r'],) * 3, seg=(20, 12), location=n['center']), m['joint'], 'body')

    # Head: a faceted wedge with the screen in front, the snout and nose below it, pale
    # cheek ruffs, the pale jaw hinged under the snout and a dark mouth inside it.
    add(loft('Head', along(D['head'])), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Fox', sc['radii'], sc['center'], sc['bezel'], e=0.3)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(loft('Snout', along(D['snout'])), m['shell'], 'head')
    nz = D['nose']
    add(kit.superellipsoid('Nose', nz['radii'], 0.5, 0.5, seg=(12, 8), location=nz['center']), m['bezel'], 'head')
    add(loft('Mouth', along([(y, z + 0.012, w * 0.85, 0.008) for y, z, w, _ in D['jaw'][:2]])), m['bezel'], 'head')
    add(loft('Jaw', along(D['jaw'])), pale, 'jaw')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(loft(f'Cheek.{sfx}', [((side * x, D['cheek_y'], z), w, h) for x, z, w, h in D['cheek']]), pale, 'head')

    # Ears: tall faceted points on hinge pucks, a dark inner panel on the front of each.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        base = Vector((side * e['base'][0], *e['base'][1:]))
        tip = Vector((side * e['tip'][0], *e['tip'][1:]))
        secs = [(base, e['w'], e['t']), (base.lerp(tip, 0.45), e['w'] * 0.72, e['t'] * 0.9),
                (base.lerp(tip, 0.97), e['w'] * 0.1, e['t'] * 0.4), (tip, 0.003, 0.003)]
        add(loft(f'Ear.{sfx}', secs, up=(0, -1, 0)), m['shell'], f'ear.{sfx}')
        front = Vector((0, -e['t'] * 0.7, 0))
        inner = [(base.lerp(tip, 0.12) + front, e['w'] * 0.58, 0.006),
                 (base.lerp(tip, 0.45) + front, e['w'] * 0.45, 0.006),
                 (base.lerp(tip, 0.9) + front, e['w'] * 0.07, 0.005)]
        add(loft(f'EarIn.{sfx}', inner, up=(0, -1, 0)), m['role']('EarIn', 'bezel'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarHinge.{sfx}', (e['hinge'], e['hinge'] * 0.8, e['hinge'] * 0.6), 0.5, 1.0,
                               seg=(16, 8), location=tuple(base - Vector((0, 0, 0.005)))), m['joint'], f'ear.{sfx}')

    # Legs: a hub bolted to the body, a slim strut, a ball-joint knee, a dark sock and a paw.
    lg, pw, hub = D['leg'], D['paw'], D['hub']
    for name, x, y, back in legs():
        (y0, z0), (y1, z1), (y2, z2) = leg_points(y, back)
        bone = f'leg.{name}'
        out = math.copysign(1, x)
        add(kit.superellipsoid(f'Hub.{name}', (hub['r'], hub['r'], hub['t']), 0.3, 1.0, seg=(18, 6),
                               location=(out * 0.106, y0, z0), rotation=(0, math.pi / 2, 0)), m['joint'], bone)
        add(loft(f'Leg.{name}', [((x, y0, z0 + 0.02), lg['w'], lg['w'] * 1.15), ((x, y1, z1), lg['w'] * 0.85, lg['w'])],
                 up=(0, -1, 0)), m['shell'], bone)
        add(kit.superellipsoid(f'Knee.{name}', (lg['w'] * 1.15,) * 3, seg=(16, 10), location=(x, y1, z1)), m['joint'],
            bone)
        add(loft(f'Sock.{name}', [((x, y1, z1), lg['sock'] * 0.85, lg['sock']), ((x, y2, z2), lg['sock'], lg['sock'] * 1.1)],
                 up=(0, -1, 0)), sock, bone)
        add(loft(f'Paw.{name}', [((x, y2 + 0.022, pw['h']), pw['w'] * 0.8, pw['h'] * 0.8),
                                 ((x, y2 - 0.02, pw['h']), pw['w'], pw['h']),
                                 ((x, y2 - pw['length'] + 0.02, pw['h'] * 0.8), pw['w'] * 0.75, pw['h'] * 0.7)]),
            sock, bone)

    # Tail: a pod on each bone, each sleeved into the one before, like a telescope; the
    # last one ends in the lit tip.
    dense = kit.spline(D['tail'], 97)
    k = D['bones']

    def at(t):
        return dense[round(min(1.0, max(0.0, t)) * 96)]

    for i in range(k):
        t0, t1 = i / k, (i + 1) / k
        secs = [(at(t0 + (t1 - t0) * u), girth(t0 + (t1 - t0) * u) * s, girth(t0 + (t1 - t0) * u) * s)
                for u, s in ((-0.18, 0.78), (0.0, 0.95), (0.25, 1.0), (0.85, 1.0), (1.0, 0.88))]
        if i == k - 1:  # the tip: a collar, then the light
            add(loft(f'Tail.{i + 1}', secs[:3]), m['shell'], f'tail.{i + 1}')
            tip = [secs[2], (at(t0 + (t1 - t0) * 0.6), girth(t0 + (t1 - t0) * 0.6), girth(t0 + (t1 - t0) * 0.6)),
                   (at(1.0), 0.004, 0.004)]
            add(loft('TailTip', tip), m['dot'](0), f'tail.{i + 1}')
        else:
            add(loft(f'Tail.{i + 1}', secs), m['shell'], f'tail.{i + 1}')

    # Light bands: a thin lit collar at each seam of the tail (Dot1..Dot3), so the brush
    # can ripple with light from root to tip.
    for i in range(1, k):
        t = i / k
        g = girth(t) * 1.03
        add(loft(f'TailBand.{i}', [(at(t - 0.025), g, g), (at(t + 0.025), g, g)]), m['dot'](i), f'tail.{i + 1}')
    # A hub where the tail joins the rump.
    p0 = Vector(D['tail'][0])
    add(kit.superellipsoid('TailHub', (0.045, 0.045, 0.03), 0.4, 1.0, seg=(16, 8),
                           location=(0, p0.y - 0.005, p0.z), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')

    # A dark collar at the neck, vents on the chest plate, a row of back plates and two
    # little antenna whiskers on the cheeks, each with a lit bead.
    add(kit.torus('Collar', 0.078, 0.014, seg=(20, 8), location=(0, -0.165, 0.4), rotation=(math.radians(80), 0, 0)),
        m['bezel'], 'head')
    for j, z in enumerate((0.36, 0.335, 0.31)):
        add(loft(f'Vent.{j}', [((0, -0.2, z), 0.034 - j * 0.004, 0.004), ((0, -0.205, z), 0.034 - j * 0.004, 0.004)],
                 up=(0, -1, 0)), m['bezel'], 'body')
    for j, y in enumerate((-0.11, -0.03, 0.05, 0.13)):
        w = 0.03 - abs(j - 1.5) * 0.004
        add(loft(f'Back.{j}', [((0, y - 0.025, 0.412 - 0.01 * (j in (0, 3))), w, 0.008),
                               ((0, y + 0.025, 0.412 - 0.01 * (j in (0, 3))), w, 0.008)]), m['joint'], 'body')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.tube(f'Whisker.{sfx}', [(side * 0.15, -0.3, 0.462), (side * 0.2, -0.325, 0.475),
                                        (side * 0.245, -0.33, 0.495)], 0.007)[0], m['bezel'], 'head')
        add(kit.superellipsoid(f'Bead.{sfx}', (0.011,) * 3, seg=(10, 6), location=(side * 0.245, -0.33, 0.495)),
            m['dot'](4), 'head')
    # A pad under each paw.
    for name, x, y, back in legs():
        y2 = leg_points(y, back)[2][0]
        add(loft(f'Pad.{name}', [((x, y2 + 0.02, 0.003), pw['w'] * 0.9, 0.004), ((x, y2 - pw['length'] + 0.025, 0.003), pw['w'] * 0.7, 0.004)]),
            m['bezel'], f'leg.{name}')

    refine(add, m, pale, sock)

    return looks.finish(kit.armature('FoxRig', rig_bones()), parts, skin, m)
