"""The cat breeds' common build (siamese.py, mainecoon.py, sphynx.py, persian.py,
scottishfold.py): one Pixel-style cat from a table of dimensions, so each breed is its
proportions and a handful of chunky signature parts, not another 250 lines of the same cat.

A breed's `D` says how its head, screen, ears, body, legs and tail are shaped; `build`
makes the shared robot cat from it (rimmed screen with a bezel, crown seam, temple bolts,
ears with a hinge puck and light, seam plates and spine plates, hip hubs, knee rings, lit
paw pads, a tail ringed at each bone with a lit tip, a collar with a tag) and then calls
the breed's `extras(add, m, D)` for what makes it that breed.

Roles (colour look only, base colours in the other looks): Ear, Inner, Paw, Sock, Tail, Tip,
Collar, Stripe. Lights: Dot0 the tail tip, Dot2 the paw pads, Dot3 the ear hinges.
Faces -Y like the rest of the crew.
"""

import math

from mathutils import Vector

import cat
import kit
import looks
import shorthair


def head_front(D):
    h = D['head']
    return h['center'][1] - h['radii'][1]


def screen_center(D):
    """The screen sits in the front of the head, a hair proud of it."""
    h, sc = D['head'], D['screen']
    return (0, h['center'][1] - h['radii'][1] + sc['radii'][1] * 0.82, h['center'][2] + sc.get('dz', 0.0))


def ear_y(D):
    return D['head']['center'][1] + D['ear'].get('dy', 0.0)


def rig_bones(D):
    lg, e, h, b = D['leg'], D['ear'], D['head'], D['body']
    hz = h['center'][2]
    ey = ear_y(D)
    bx, by, bz = b['center']
    rx, ry, rz = b['radii']
    up = e.get('bone', 0.12)
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, by + ry * 0.9, bz), (0, by - ry * 0.5, bz + 0.02), 'root'),
        ('head', (0, h['center'][1] + h['radii'][1] * 0.2, hz - h['radii'][2] - 0.04),
         (0, h['center'][1], hz + h['radii'][2] * 0.6), 'body'),
        ('ear.L', (e['x'], ey, e['z']), (e['x'] + 0.03, ey, e['z'] + up), 'head'),
        ('ear.R', (-e['x'], ey, e['z']), (-e['x'] - 0.03, ey, e['z'] + up), 'head'),
    ]
    bones += cat.tail_bones(D['tail'], D.get('tail_bones', 3))
    bones += cat.leg_bones(lg)
    return bones


def build(D, face, name, look='ink', flame=None, extras=None, boxy=0.4, collar_role='Collar'):
    m = looks.materials(look, flame, face=face)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def bolt(nm, at, r, bone, mat=None, flat=1.0):
        return add(kit.superellipsoid(nm, (r, r, r * flat), 0.6, 0.6, seg=(10, 6), location=at),
                   mat or m['bezel'], bone)

    h, sc, e, b, lg, pw = D['head'], D['screen'], D['ear'], D['body'], D['leg'], D['paw']
    hx, hy, hz = h['center']
    hr = h['radii']
    sx, sy, sz = screen_center(D)
    ey = ear_y(D)

    # Head, screen and bezel.
    head = add(kit.superellipsoid('Head', hr, h.get('e', boxy), h.get('e', boxy), seg=(56, 36),
                                  taper=h.get('taper', 0.0), location=h['center']), m['shell'], 'head')
    glass, rim = kit.screen(name, sc['radii'], (sx, sy, sz), sc['bezel'], e=sc.get('e', boxy))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    # A crown seam from the screen's rim back over the head, with three bolts.
    pts = [q for q in shorthair.section(hr, h.get('e', boxy), h['center'], 0, 0.0, lift=1.006)
           if q[1] > hy - hr[1] * 0.2 and q[2] > hz + hr[2] * 0.2]
    if len(pts) > 6:
        add(kit.tube('CrownSeam', pts, 0.0032, ring=6)[0], m['joint'], 'head')
        for i, k in enumerate((0.3, 0.6, 0.85)):
            q = pts[int(k * (len(pts) - 1))]
            bolt(f'CrownBolt{i}', q, 0.007, 'head')
    # Temple bolts holding the bezel.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, dz in enumerate((-0.04, 0.04)):
            bolt(f'TempleBolt.{sfx}{k}', (side * (sc['radii'][0] + sc['bezel'] + 0.012), sy + 0.01, sz + dz), 0.007,
                 'head')
    # Whisker pods and whiskers (lit tips: Dot4).
    wp = D.get('whiskers', dict(x=hr[0] * 0.92, dy=0.045, dz=-0.04, length=0.12, n=3))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        px, py, pz = side * wp['x'], sy + wp['dy'], sz + wp['dz']
        add(kit.superellipsoid(f'Pod.{sfx}', (0.016, 0.022, 0.016), 0.5, 0.5, seg=(12, 8), location=(px, py, pz)),
            m['joint'], 'head')
        for k in range(wp.get('n', 3)):
            dz = (0.03, 0.0, -0.03)[k % 3]
            end = (side * (abs(px) + wp['length']), py - 0.035 - 0.006 * k, pz + dz * 1.6)
            add(kit.tube(f'Whisker.{sfx}{k}', [(px, py, pz), (side * (abs(px) + wp['length'] * 0.5), py - 0.012, pz + dz),
                                               end], 0.003, ring=5)[0], m['bezel'], 'head')
            add(kit.superellipsoid(f'WTip.{sfx}{k}', (0.006,) * 3, seg=(8, 6), location=end), m['dot'](4), 'head')

    # Ears: a flat cone with an inner ear in front, a rim, a hinge puck with a light.
    pitch = e.get('pitch', 0.0)
    sy_ear = e.get('flat', 0.42)
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ear = kit.stretch(kit.lathe(f'Ear.{sfx}', e['profile'], seg=26), sy=sy_ear)
        ear.location = (side * e['x'], ey, e['z'] - 0.02)
        ear.rotation_euler = (pitch, side * e['tilt'], 0)
        add(ear, m['role'](e.get('role', 'Ear')), f'ear.{sfx}')
        if e.get('inner', True):
            inner = kit.stretch(kit.lathe(f'InnerEar.{sfx}', [(r * 0.62, z * 0.72 + 0.014) for r, z in e['profile']],
                                          seg=26), sy=sy_ear * 0.5)
            inner.location = (side * e['x'], ey - e.get('inset', 0.026), e['z'] - 0.02)
            inner.rotation_euler = (pitch, side * e['tilt'], 0)
            add(inner, m['role']('Inner', 'joint'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.024, 0.024, 0.016), 0.3, 1.0, seg=(14, 6),
                               location=(side * (e['x'] - 0.008), ey, e['z'] - 0.034), rotation=(math.pi / 2, 0, 0)),
            m['joint'], f'ear.{sfx}')
        add(kit.superellipsoid(f'EarLed.{sfx}', (0.007,) * 3, seg=(8, 6),
                               location=(side * (e['x'] - 0.008), ey - 0.018, e['z'] - 0.034)), m['dot'](3),
            f'ear.{sfx}')

    # Body, with seam plates, spine plates and a chest plate.
    bx, by, bz = b['center']
    rx, ry, rz = b['radii']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(48, 32), location=b['center']), m['shell'], 'body')
    for j, (dy, k) in enumerate(((-0.5, 0.93), (0.05, 1.0), (0.55, 0.96))):
        add(kit.superellipsoid(f'Seam.{j}', (rx * k * 1.012, rz * k * 1.012, 0.004), b['e'], b['e'], seg=(28, 8),
                               location=(bx, by + dy * ry, bz), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    for j in range(b.get('spine', 4)):
        y = by - ry * 0.45 + ry * 0.2 * j
        add(kit.superellipsoid(f'Back.{j}', (0.03 * rx / 0.12, 0.026, 0.006), 0.5, 0.5, seg=(14, 6),
                               location=(0, y, bz + rz * 0.985 - 0.012 * (j in (0, b.get('spine', 4) - 1)))),
            m['role']('Stripe', 'joint'), 'body')

    # Collar (a tag, the beacon, under the chin).
    c = D['collar']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(40, 10), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['role'](collar_role, 'joint'), 'body')
    tg = c['tag']
    add(kit.superellipsoid('Tag', (tg, 0.01, tg), 0.5, 1.0, seg=(20, 8),
                           location=(0, c['center'][1] - c['major'] * 0.82, c['center'][2] - tg - 0.012)),
        m['beacon'], 'body')
    add(kit.torus('TagRing', 0.01, 0.003, seg=(14, 6),
                  location=(0, c['center'][1] - c['major'] * 0.82 + 0.004, c['center'][2] - 0.012),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'body')

    # Legs: hip hubs, knee rings, a sock ring, lit pads and toe beads.
    kz = (lg['top'] + lg['bottom']) / 2 + 0.01
    for nm, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        bone = f'leg.{nm}'
        leg, _ = kit.tube(f'Leg.{nm}', [(x * lg['x'], y, lg['top']), (x * lg['x'], y, lg['bottom'])], lg['r'], ring=14)
        add(leg, m['shell'], bone)
        add(kit.superellipsoid(f'Paw.{nm}', pw['radii'], pw['e'], 0.6, seg=(24, 12),
                               location=(x * lg['x'], y - 0.012, pw['radii'][2])), m['role']('Paw', 'joint'), bone)
        add(kit.superellipsoid(f'Hub.{nm}', (0.026, 0.026, 0.008), 0.3, 1.0, seg=(16, 6),
                               location=(x * (rx + 0.002), y, lg['top'] - 0.005), rotation=(0, math.pi / 2, 0)),
            m['joint'], bone)
        add(kit.superellipsoid(f'HubBolt.{nm}', (0.008,) * 3, seg=(8, 6),
                               location=(x * (rx + 0.011), y, lg['top'] - 0.005)), m['bezel'], bone)
        add(kit.torus(f'Knee.{nm}', lg['r'] + 0.005, 0.0072, seg=(18, 6), location=(x * lg['x'], y, kz)), m['joint'],
            bone)
        add(kit.torus(f'Sock.{nm}', lg['r'] + 0.004, 0.009, seg=(18, 6), location=(x * lg['x'], y, 0.085)),
            m['role'](D.get('sock', 'Sock'), 'joint'), bone)
        py = y - 0.012
        pr = pw['radii']
        add(kit.superellipsoid(f'Pad.{nm}', (pr[0] * 0.5, pr[1] * 0.55, 0.004), 0.5, 0.5, seg=(14, 6),
                               location=(x * lg['x'], py + 0.006, 0.002)), m['dot'](2), bone)
        for k in (-1, 0, 1):
            add(kit.superellipsoid(f'Toe.{nm}.{k}', (pr[0] * 0.24, 0.008, 0.008), seg=(8, 6),
                                   location=(x * lg['x'] + k * pr[0] * 0.42, py - pr[1] * 0.92, 0.022 - 0.003 * abs(k))),
                m['bezel'], bone)

    # Tail: a tube over its bones, rings at the joints, a lit tip.
    nb = D.get('tail_bones', 3)
    tb = [f'tail.{i}' for i in range(1, nb + 1)]
    obj = cat.tail(add, m, D['tail'], D['tail_r'], tb, n=30, ring=D.get('tail_ring', 10),
                   rings=D.get('tail_rings', [(0.88, 1.01)]))
    pts = [Vector(q) for q in kit.spline(D['tail'], 97)]
    r0, r1 = D['tail_r']
    for i in range(1, nb):
        t = i / nb
        cat.ring_at(add, f'TailBand.{i}', m['joint'], tb[i], pts, round(t * 96), r0 + (r1 - r0) * t + 0.004, 0.005)
    end = pts[-1]
    tip = D.get('tail_tip', 0.011)
    add(kit.superellipsoid('TailTip', (tip,) * 3, seg=(10, 8), location=tuple(end + Vector((0, -0.012, 0.012)))),
        m['dot'](0), tb[-1])
    p0 = Vector(D['tail'][0])
    add(kit.superellipsoid('TailHub', (r0 * 1.1, r0 * 1.1, r0 * 0.8), 0.4, 1.0, seg=(16, 8),
                           location=(0, p0.y - 0.004, p0.z), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')

    if extras:
        extras(add, m, D, bolt, pts)
    return looks.finish(kit.armature(name + 'Rig', rig_bones(D)), parts, skin, m)
