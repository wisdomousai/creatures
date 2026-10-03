"""Scamp, the crew's lanky robot kitten: a head with enormous ears on a long narrow body,
long thin legs that don't quite know where they are, and a tail nearly as long as she is,
in five bones. A collar with a bell that lights in the beacon's colour, and a light spot
(a lit disc, Dot1) on a bone of its own that isn't parented to the body, for chasing.
Faces -Y like the rest of the crew; about 0.55 m to the ear tips.

Built from the parts in cat.py, and finer than the other kittens: rimmed ears with grilles and
hinge pins, a riveted collar with a slotted bell and clapper, knee and shoulder rings, lit paw
pads, panel plates for her tabby stripes, a ringed tail with a tufted tip, whisker pods. In the
colour look Scamp is a lilac tabby with pale socks.
Lights: Dot0 the tail tip, Dot1 the light spot, Dot2 the paw pads, Dot3 the ear hinges, Dot4 the
whisker tips.
"""

import math

from mathutils import Vector

import kit
import looks
import cat

FACE = 'scamp'
PREVIEW = dict(lift=0.0, width=0.6)
BOXY = 0.4

D = {
    'head': dict(radii=(0.165, 0.14, 0.13), center=(0, -0.2, 0.4)),
    'screen': dict(radii=(0.13, 0.095, 0.09), center=(0, -0.26, 0.395), bezel=0.009),
    # Ears far too big for her, on the top corners.
    'ear': dict(x=0.1, z=0.51, tilt=0.35, inset=0.02,
                profile=[(0.0, 0.2), (0.022, 0.175), (0.06, 0.08), (0.088, 0.0)]),
    'body': dict(radii=(0.09, 0.2, 0.085), center=(0, 0.06, 0.24), e=0.5),
    'leg': dict(x=0.062, front=-0.09, back=0.2, top=0.22, bottom=0.04, r=0.026),
    'paw': dict(radii=(0.036, 0.046, 0.026), e=0.45),
    'tail': [(0, 0.24, 0.26), (0, 0.36, 0.27), (0, 0.47, 0.34), (0, 0.5, 0.48), (0, 0.47, 0.62), (0, 0.43, 0.72)],
    'tail_r': (0.025, 0.014),
    'collar': dict(center=(0, -0.145, 0.32), major=0.085, minor=0.012, tilt=0.6),
    'bell': dict(r=0.022, center=(0, -0.235, 0.275)),
    'props': dict(spot=(-0.25, -0.2)),
}


def rig_bones():
    e, lg = D['ear'], D['leg']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.22, 0.24), (0, -0.12, 0.26), 'root'),
        ('head', (0, -0.14, 0.3), (0, -0.2, 0.53), 'body'),
        ('ear.L', (e['x'], -0.2, e['z']), (e['x'] + 0.04, -0.2, e['z'] + 0.16), 'head'),
        ('ear.R', (-e['x'], -0.2, e['z']), (-e['x'] - 0.04, -0.2, e['z'] + 0.16), 'head'),
    ]
    bones += cat.tail_bones(D['tail'], 5)
    bones += cat.leg_bones(lg)
    sx, sy = D['props']['spot']
    bones.append(('spot', (sx, sy, 0.0), (sx, sy, 0.05), None))
    return bones


def refine(add, m):
    """Scamp's finer detail on top of the shared parts."""
    b, lg, pw, e = D['body'], D['leg'], D['paw'], D['ear']
    bx, by, bz = b['center']
    rx, ry, rz = b['radii']
    hx, hy, hz = D['head']['center']
    # Seam plates round the waist and hips, thin rounded slabs a hair wider than the body.
    for j, (dy, k) in enumerate(((-0.5, 0.93), (0.05, 1.0), (0.55, 0.96))):
        add(kit.superellipsoid(f'Seam.{j}', (rx * k * 1.012, rz * k * 1.012, 0.004), b['e'], b['e'], seg=(28, 8),
                               location=(bx, by + dy * ry, bz), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    # Tabby stripes as panel plates: down the spine, and slanted bars on each flank.
    for j, y in enumerate((-0.08, 0.0, 0.08, 0.16, 0.24)):
        add(kit.superellipsoid(f'Back.{j}', (0.026 - 0.003 * (j % 2), 0.026, 0.006), 0.5, 0.5, seg=(14, 6),
                               location=(0, y, bz + rz * 0.985 - 0.012 * (j in (0, 4)))),
            m['role']('Stripe', 'joint'), 'body')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for j, y in enumerate((-0.04, 0.06, 0.16, 0.25)):
            add(kit.superellipsoid(f'Flank.{sfx}{j}', (0.006, 0.022, 0.03), 0.5, 0.5, seg=(12, 6),
                                   location=(side * (rx * 0.965), y, bz + 0.03), rotation=(0, 0, side * 0.35)),
                m['role']('Stripe', 'joint'), 'body')
    # Forehead stripes: three plates on the top of the head.
    for j, x in enumerate((-0.045, 0, 0.045)):
        add(kit.superellipsoid(f'Brow.{j}', (0.011, 0.045 - 0.01 * (j == 1), 0.006), 0.5, 0.5, seg=(12, 6),
                               location=(x, hy + 0.01, hz + D['head']['radii'][2] * 0.985 - 0.006)),
            m['role']('Stripe', 'joint'), 'head')
    # Legs: a hip hub and bolt, a knee ring, an ankle sock ring, a lit pad and toe beads on each paw.
    kz = (lg['top'] + lg['bottom']) / 2 + 0.01
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        bone = f'leg.{name}'
        add(kit.superellipsoid(f'Hub.{name}', (0.026, 0.026, 0.008), 0.3, 1.0, seg=(16, 6),
                               location=(x * (rx + 0.002), y, lg['top'] - 0.005), rotation=(0, math.pi / 2, 0)),
            m['joint'], bone)
        add(kit.superellipsoid(f'HubBolt.{name}', (0.008,) * 3, seg=(8, 6),
                               location=(x * (rx + 0.011), y, lg['top'] - 0.005)), m['bezel'], bone)
        add(kit.torus(f'Knee.{name}', lg['r'] + 0.005, 0.0075, seg=(18, 6), location=(x * lg['x'], y, kz)),
            m['joint'], bone)
        add(kit.superellipsoid(f'KneeCap.{name}', (0.011, 0.011, 0.011), seg=(8, 6),
                               location=(x * lg['x'], y - lg['r'] - 0.008, kz)), m['bezel'], bone)
        add(kit.torus(f'Sock.{name}', lg['r'] + 0.004, 0.009, seg=(18, 6), location=(x * lg['x'], y, 0.085)),
            m['role']('Paw', 'joint'), bone)
        py = y - pw.get('ahead', 0.012)
        add(kit.superellipsoid(f'Pad.{name}', (0.024, 0.03, 0.004), 0.5, 0.5, seg=(14, 6),
                               location=(x * lg['x'], py + 0.006, 0.002)), m['dot'](2), bone)
        for k in (-1, 0, 1):
            add(kit.superellipsoid(f'Toe.{name}.{k}', (0.01, 0.008, 0.008), seg=(8, 6),
                                   location=(x * lg['x'] + k * 0.017, py - 0.046, 0.022 - 0.003 * abs(k))),
                m['bezel'], bone)
    # Ears: a rim plate behind each, a grille of slats over the inner ear, a hinge puck with a light.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ear = kit.stretch(kit.lathe(f'EarRim.{sfx}', [(r * 1.12, z * 1.06) for r, z in e['profile']], seg=24), sy=0.3)
        ear.location = (side * e['x'], -0.2 + 0.012, e['z'] - 0.026)
        ear.rotation_euler = (0, side * e['tilt'], 0)
        add(ear, m['joint'], f'ear.{sfx}')
        for k in (-1, 0, 1):
            zc = 0.075 + 0.015 * (k == 0)
            add(kit.superellipsoid(f'Grille.{sfx}{k}', (0.0035, 0.004, 0.05 - 0.012 * abs(k)), 0.5, 0.5, seg=(8, 6),
                                   location=(side * (e['x'] + math.sin(e['tilt']) * zc + k * 0.017),
                                             -0.2 - e.get('inset', 0.02) - 0.008,
                                             e['z'] - 0.02 + zc * math.cos(e['tilt'])),
                                   rotation=(0, side * e['tilt'], 0)), m['bezel'], f'ear.{sfx}')
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.024, 0.024, 0.016), 0.3, 1.0, seg=(16, 6),
                               location=(side * (e['x'] - 0.01), -0.2, e['z'] - 0.03), rotation=(math.pi / 2, 0, 0)),
            m['joint'], f'ear.{sfx}')
        add(kit.superellipsoid(f'EarLed.{sfx}', (0.007,) * 3, seg=(8, 6),
                               location=(side * (e['x'] - 0.01), -0.2 - 0.02, e['z'] - 0.03)), m['dot'](3), f'ear.{sfx}')
    # Whisker pods on the cheeks, three whiskers each with lit tips.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Pod.{sfx}', (0.018, 0.024, 0.018), 0.5, 0.5, seg=(14, 8),
                               location=(side * 0.163, hy - 0.07, hz - 0.045)), m['joint'], 'head')
        for k, dz in enumerate((0.035, 0.0, -0.035)):
            x0, y0, z0 = side * 0.17, hy - 0.08, hz - 0.045
            end = (side * 0.3, y0 - 0.02 - 0.005 * k, z0 + dz * 1.7)
            add(kit.tube(f'Whisker.{sfx}{k}', [(x0, y0, z0), (side * 0.235, y0 - 0.01, z0 + dz), end], 0.003, ring=6)[0],
                m['bezel'], 'head')
            add(kit.superellipsoid(f'Tip.{sfx}{k}', (0.007,) * 3, seg=(8, 6), location=end), m['dot'](4), 'head')
    # Collar rivets, and the bell: a cap ring, a slot and a clapper.
    c = D['collar']
    cx, cy, cz = c['center']
    for a in (205, 230, 255, 285, 310, 335):
        r, t = math.radians(a), c['tilt']
        add(kit.superellipsoid(f'Rivet.{a}', (0.007,) * 3, seg=(8, 6),
                               location=(cx + (c['major'] + 0.002) * math.cos(r),
                                         cy + (c['major'] + 0.002) * math.sin(r) * math.cos(t),
                                         cz + (c['major'] + 0.002) * math.sin(r) * math.sin(t))), m['bezel'], 'body')
    bl = D['bell']
    bxx, byy, bzz = bl['center']
    add(kit.torus('BellLoop', 0.011, 0.004, seg=(14, 6), location=(0, byy + 0.004, bzz + bl['r'] + 0.006),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'body')
    add(kit.superellipsoid('BellCap', (0.014, 0.014, 0.004), 0.3, 1.0, seg=(12, 6),
                           location=(0, byy + 0.001, bzz + bl['r'] - 0.002)), m['joint'], 'body')
    add(kit.superellipsoid('BellSlot', (0.0035, 0.004, 0.016), 0.5, 0.5, seg=(8, 6),
                           location=(0, byy - bl['r'] + 0.002, bzz - 0.006)), m['bezel'], 'body')
    add(kit.superellipsoid('Clapper', (0.006,) * 3, seg=(8, 6), location=(0, byy - 0.004, bzz - bl['r'] - 0.003)),
        m['bezel'], 'body')
    # Tail: rings at each bone joint, a tuft plate at the tip, a hub at the rump.
    pts = [Vector(q) for q in kit.spline(D['tail'], 97)]
    r0, r1 = D['tail_r']
    for i in range(1, 5):
        t = i / 5
        cat.ring_at(add, f'TailBand.{i}', m['joint'], f'tail.{i + 1}', pts, round(t * 96), r0 + (r1 - r0) * t + 0.004,
                    0.005)
    end = pts[-1]
    add(kit.superellipsoid('TailTuft', (0.026, 0.02, 0.034), 0.5, 0.5, seg=(14, 10),
                           location=tuple(end + Vector((0, -0.004, 0.012))), rotation=(0.25, 0, 0)),
        m['role']('Tip', 'joint'), 'tail.5')
    add(kit.superellipsoid('TailTip', (0.011,) * 3, seg=(10, 8), location=tuple(end + Vector((0, -0.016, 0.03)))),
        m['dot'](0), 'tail.5')
    p0 = Vector(D['tail'][0])
    add(kit.superellipsoid('TailHub', (0.03, 0.03, 0.024), 0.4, 1.0, seg=(16, 8), location=(0, p0.y - 0.004, p0.z),
                           rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    h = D['head']
    head = add(kit.superellipsoid('Head', h['radii'], BOXY, BOXY, seg=(56, 36), location=h['center']), m['shell'],
               'head')
    cat.coat_head(head, h['center'], h['radii'], m)
    sc = D['screen']
    glass, rim = kit.screen('Scamp', sc['radii'], sc['center'], sc['bezel'], e=BOXY)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    cat.ears(add, m, D['ear'], -0.2)
    # A bolt on each temple.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Bolt.{sfx}', (0.009, 0.02, 0.02), 0.5, 0.8, seg=(16, 8),
                               location=(side * 0.163, -0.19, 0.36)), m['joint'], 'head')

    b = D['body']
    body = add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(48, 32), location=b['center']),
               m['shell'], 'body')
    cat.coat_body(body, b['center'], b['radii'], m)

    c = D['collar']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(40, 10), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['role']('Collar', 'joint'), 'body')
    bl = D['bell']
    add(kit.superellipsoid('Bell', (bl['r'],) * 3, seg=(20, 14), location=bl['center']), m['beacon'], 'body')

    cat.legs(add, m, D['leg'], D['paw'])
    cat.tail(add, m, D['tail'], D['tail_r'], [f'tail.{i}' for i in range(1, 6)], n=30, ring=10,
             rings=[(0.5, 0.58), (0.7, 0.78), (0.9, 1.01)])
    refine(add, m)

    sx, sy = D['props']['spot']
    add(kit.superellipsoid('Spot', (0.035, 0.035, 0.004), 1.0, 1.0, seg=(20, 4), location=(sx, sy, 0.004)),
        m['dot'](1), 'spot')

    return looks.finish(kit.armature('ScampRig', rig_bones()), parts, skin, m)
