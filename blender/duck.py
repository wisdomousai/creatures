"""Rivet, the crew's wind-up robot duck, built like a tin toy: a round body tipped
tail-up with a waist seam and a rivet row, a raised belly plate with a chest lamp and a
printed tile band, a riveted head with a screen face and a bill on visible hinge pins
(the jaw opens to quack), a collar at the neck, wings of layered feather plates on ball
shoulders, a fan of tail plates, short legs ending in webbed feet with three toes, and a
wind-up key on his back: a boss with a shaft collar and a two-ring bow that lights in
the beacon's colour and turns while he waddles. A row of three small lights (Dot1-3)
under the chest lamp (Dot0) shows how the spring is doing. Faces -Y like the rest of the
crew; about 0.56 m tall.
"""

import math

import kit
import looks
from mathutils import Euler, Vector

FACE = 'duck'
PREVIEW = dict(lift=0.0, width=0.6)
BOXY = 0.4

D = {
    'body': dict(radii=(0.17, 0.24, 0.15), center=(0, 0.04, 0.21), tilt=0.15),
    'head': dict(radii=(0.13, 0.12, 0.11), center=(0, -0.15, 0.42)),
    'neck': dict(points=[(0, -0.1, 0.26), (0, -0.14, 0.34)], r=0.075),
    'collar': dict(major=0.088, minor=0.011, at=(0, -0.128, 0.335), squash=0.95),
    # A visor strip, 16:7 like the duck's face layout (512 x 224)
    'screen': dict(radii=(0.105, 0.09, 0.046), center=(0, -0.195, 0.45), bezel=0.008),
    'bill': dict(radii=(0.08, 0.075, 0.024), center=(0, -0.31, 0.385), e=0.5),
    'jaw': dict(radii=(0.068, 0.065, 0.016), center=(0, -0.298, 0.352), e=0.5, pivot=(0, -0.24, 0.365)),
    'wing': dict(radii=(0.03, 0.12, 0.075), center=(0.168, 0.07, 0.22), shoulder=(0.14, 0.0, 0.3),
                 tip=(0.17, 0.15, 0.16), ball=0.026),
    'tail': dict(base=(0, 0.25, 0.27), tip=(0, 0.33, 0.35)),
    'leg': dict(x=0.07, top=(0.06, 0.1), bottom=(0.04, 0.02), r=0.022),
    'foot': dict(web=(0.05, 0.05, 0.008), y=-0.035, toe=(0.0105, 0.06, 0.012), spread=0.5),
    'key': dict(base=(0, 0.14, 0.33), top=(0, 0.14, 0.47)),
    'belly': dict(radii=(0.1, 0.042, 0.095), center=(0, -0.172, 0.178)),
}


def rig_bones():
    w, t, k, lg, j = D['wing'], D['tail'], D['key'], D['leg'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.1, 0.12), (0, 0.1, 0.34), 'root'),
        ('head', (0, -0.13, 0.3), (0, -0.15, 0.54), 'body'),
        ('jaw', j['pivot'], (0, -0.38, j['pivot'][2]), 'head'),
        ('tail', t['base'], t['tip'], 'body'),
        ('key', k['base'], k['top'], 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        sx, sy, sz = w['shoulder']
        tx, ty, tz = w['tip']
        bones.append((f'wing.{sfx}', (side * sx, sy, sz), (side * tx, ty, tz), 'body'))
        bones.append((f'leg.{sfx}', (side * lg['x'], lg['top'][0], lg['top'][1]),
                      (side * lg['x'], lg['bottom'][0], 0.0), 'body'))
    return bones


def studs(name, points, r):
    """Many small low-poly rivet heads in one mesh."""
    nu, nv = 8, 4
    verts, faces = [], []
    for p in points:
        o = len(verts)
        verts.append((p[0], p[1], p[2] - r))
        for j in range(1, nv):
            phi = -math.pi / 2 + math.pi * j / nv
            for i in range(nu):
                th = 2 * math.pi * i / nu
                verts.append((p[0] + r * math.cos(phi) * math.cos(th), p[1] + r * math.cos(phi) * math.sin(th),
                              p[2] + r * math.sin(phi)))
        verts.append((p[0], p[1], p[2] + r))
        top = len(verts) - 1
        faces += [(o, o + 1 + (i + 1) % nu, o + 1 + i) for i in range(nu)]
        for j in range(nv - 2):
            r0, r1 = o + 1 + j * nu, o + 1 + (j + 1) * nu
            for i in range(nu):
                faces.append((r0 + i, r0 + (i + 1) % nu, r1 + (i + 1) % nu, r1 + i))
        last = o + 1 + (nv - 2) * nu
        faces += [(last + i, last + (i + 1) % nu, top) for i in range(nu)]
    return kit.mesh_object(name, verts, faces)


def ellipse_ring(centre, a, b, tilt, n):
    """n points round an ellipse in the XY plane, tipped about X, for rivet rows."""
    rot = Euler((tilt, 0, 0)).to_matrix()
    out = []
    for i in range(n):
        th = 2 * math.pi * (i + 0.5) / n
        out.append(tuple(Vector(centre) + rot @ Vector((a * math.cos(th), b * math.sin(th), 0))))
    return out


def turned(base, euler, length):
    """The point `length` along a part's local +Z after it is rotated by `euler`."""
    return tuple(Vector(base) + Euler(euler).to_matrix() @ Vector((0, 0, length)))


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], 0.85, 1.0, seg=(48, 32), taper=0.1, location=b['center'],
                           rotation=(b['tilt'], 0, 0)), m['shell'], 'body')
    # A waist seam: a thin band round the middle of the body with a row of rivets on it.
    bx, by, bz = b['radii']
    ring = kit.torus('Seam', bx + 0.003, 0.0055, seg=(48, 6), location=b['center'], rotation=(b['tilt'], 0, 0))
    add(kit.stretch(ring, sy=(by + 0.003) / (bx + 0.003)), m['joint'], 'body')
    add(studs('SeamRivets', ellipse_ring(b['center'], bx + 0.006, by + 0.006, b['tilt'], 20), 0.0075),
        m['bezel'], 'body')

    # The raised belly plate, with the chest lamp, a row of spring lights and a printed tile band.
    bl = D['belly']
    cx, cy, cz = bl['center']
    add(kit.superellipsoid('Belly', bl['radii'], 0.55, 0.6, seg=(32, 16), location=bl['center']),
        m['role']('Belly', 'joint'), 'body')
    rim = kit.torus('BellyRim', bl['radii'][0] * 0.97, 0.0075, seg=(40, 6), location=(cx, cy - 0.006, cz),
                    rotation=(math.pi / 2, 0, 0))
    add(kit.stretch(rim, sy=bl['radii'][2] / bl['radii'][0]), m['bezel'], 'body')
    add(studs('BellyRivets', [(x, cy - 0.03, cz + z) for x, z in ((-0.07, 0.068), (0.07, 0.068),
                                                              (-0.07, -0.068), (0.07, -0.068))], 0.0075),
        m['bezel'], 'body')
    add(kit.superellipsoid('Lamp', (0.022, 0.011, 0.022), 0.5, 0.5, seg=(20, 10),
                           location=(0, cy - 0.034, cz + 0.06)), m['dot'](0), 'body')
    for i, x in enumerate((-0.036, 0.0, 0.036), 1):
        add(kit.superellipsoid(f'SpringLight.{i}', (0.0115, 0.007, 0.0115), 0.6, 0.6, seg=(12, 8),
                               location=(x, cy - 0.037, cz + 0.02)), m['dot'](i), 'body')
    # Printed tin-toy tiles in a band under the lights (a print in the colour look).
    for i in range(5):
        add(kit.superellipsoid(f'Print.{i}', (0.0115, 0.007, 0.0115), 0.4, 0.4, seg=(10, 6),
                               location=((i - 2) * 0.03, cy - 0.035, cz - 0.03), rotation=(0, math.pi / 4, 0)),
            m['role']('Print', 'joint'), 'body')

    # A short neck, bending between body and head, with a collar ring on it.
    n = D['neck']
    neck, ts = kit.tube('Neck', kit.resample(n['points'], 6), n['r'], ring=20)
    add(neck, m['shell'], kit.chain(ts, ['body', 'head']))
    c = D['collar']
    add(kit.stretch(kit.torus('Collar', c['major'], c['minor'], seg=(32, 8), location=c['at'],
                              rotation=(0.15, 0, 0)), sy=c['squash']), m['joint'], 'head')

    # Head: a cap seam with rivets, side plates with a bolt each, and the screen face.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], BOXY, BOXY, seg=(44, 30), location=h['center']), m['shell'], 'head')
    hx, hy, hz = h['center']
    cap = kit.torus('CapSeam', 0.118, 0.005, seg=(40, 6), location=(hx, hy, hz + 0.093))
    add(kit.stretch(cap, sy=0.108 / 0.118), m['joint'], 'head')
    add(studs('CapRivets', [(0.121 * math.cos(a), hy + 0.111 * math.sin(a), hz + 0.093)
                            for a in [math.pi / 2 + k * math.pi / 5 for k in range(1, 10)]], 0.0065),
        m['bezel'], 'head')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'CheekPlate.{sfx}', (0.008, 0.045, 0.045), 0.35, 0.8, seg=(24, 8),
                               location=(side * 0.128, hy + 0.01, hz - 0.015)), m['role']('Plate', 'joint'), 'head')
        add(kit.superellipsoid(f'CheekBolt.{sfx}', (0.006, 0.014, 0.014), 0.6, 0.6, seg=(12, 6),
                               location=(side * 0.136, hy + 0.01, hz - 0.015)), m['bezel'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Duck', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    # The bill, on hinge pins at both corners; the jaw opens under it. Two little nostrils.
    bl_, j = D['bill'], D['jaw']
    add(kit.superellipsoid('Bill', bl_['radii'], bl_['e'], 0.7, seg=(32, 12), location=bl_['center']),
        m['role']('Bill', 'joint'), 'head')
    add(kit.superellipsoid('Jaw', j['radii'], j['e'], 0.7, seg=(28, 10), location=j['center']),
        m['role']('Bill', 'joint'), 'jaw')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        px, py, pz = j['pivot']
        add(kit.superellipsoid(f'HingePin.{sfx}', (0.009, 0.012, 0.012), 0.6, 0.6, seg=(14, 8),
                               location=(side * 0.072, py + 0.005, pz - 0.003)), m['bezel'], 'head')
        add(kit.superellipsoid(f'Nostril.{sfx}', (0.008, 0.012, 0.004), 0.6, 0.6, seg=(10, 6),
                               location=(side * 0.024, bl_['center'][1] - 0.035, bl_['center'][2] + 0.021)),
            m['bezel'], 'head')

    # Wings of layered feather plates, hinged at a ball shoulder.
    w = D['wing']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x, y, z = w['center']
        add(kit.superellipsoid(f'Wing.{sfx}', w['radii'], 0.7, 0.9, seg=(28, 16), location=(side * x, y, z),
                               rotation=(0.35, 0, 0)), m['shell'], f'wing.{sfx}')
        for i, (dy, dz, ry, rz) in enumerate(((0.045, -0.035, 0.05, 0.036), (0.075, -0.05, 0.05, 0.034),
                                              (0.105, -0.065, 0.048, 0.03))):
            add(kit.superellipsoid(f'Feather.{sfx}{i}', (0.011, ry, rz), 0.5, 0.8, seg=(20, 8),
                                   location=(side * (x + 0.02 + 0.002 * i), y + dy, z + dz),
                                   rotation=(0.7, 0, 0)), m['role']('Feather', 'joint'), f'wing.{sfx}')
        add(studs(f'WingRivets.{sfx}', [(side * (x + 0.03), y - 0.055, z + 0.03),
                                        (side * (x + 0.03), y - 0.03, z + 0.05)], 0.0065),
            m['bezel'], f'wing.{sfx}')
        sx, sy, sz = w['shoulder']
        add(kit.superellipsoid(f'WingTab.{sfx}', (0.006, 0.024, 0.014), 0.4, 0.6, seg=(12, 6),
                               location=(side * (sx + 0.026), sy + 0.022, sz - 0.014), rotation=(0.35, 0, 0)),
            m['bezel'], f'wing.{sfx}')
        add(kit.superellipsoid(f'Shoulder.{sfx}', (w['ball'],) * 3, seg=(16, 10),
                               location=(side * (sx + 0.012), sy, sz)), m['joint'], f'wing.{sfx}')

    # A tail tuft: a fan of three plates on a collar, turned up.
    t = D['tail']
    tb = t['base']
    add(kit.torus('TailCollar', 0.03, 0.008, seg=(20, 6), location=tb, rotation=(-0.8, 0, 0)), m['joint'], 'tail')
    for i, (spread, ln) in enumerate(((0.0, 0.11), (0.5, 0.09), (-0.5, 0.09))):
        rot = (-0.8, 0, spread)
        add(kit.superellipsoid(f'TailPlate.{i}', (0.026, 0.009, ln / 2), 0.55, 0.7, seg=(16, 8),
                               location=turned(tb, rot, ln / 2 + 0.004), rotation=rot),
            m['role']('Print', 'shell') if i else m['shell'], 'tail')
        # A rolled tip on each plate, like the curled edge of stamped tin.
        add(kit.superellipsoid(f'TailRoll.{i}', (0.028, 0.0075, 0.0075), 0.6, 0.6, seg=(12, 6),
                               location=turned(tb, rot, ln + 0.004), rotation=rot), m['joint'], 'tail')

    # Legs, ankle rings and webbed feet with three toes.
    lg, ft = D['leg'], D['foot']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        leg, _ = kit.tube(f'Leg.{sfx}', [(side * lg['x'], *lg['top']), (side * lg['x'], *lg['bottom'])], lg['r'],
                          ring=10)
        add(leg, m['joint'], f'leg.{sfx}')
        fx = side * lg['x']
        add(kit.torus(f'Ankle.{sfx}', lg['r'] + 0.004, 0.006, seg=(14, 6), location=(fx, lg['bottom'][0], 0.04)),
            m['bezel'], f'leg.{sfx}')
        wr = ft['web']
        add(kit.superellipsoid(f'Web.{sfx}', wr, 0.3, 0.75, seg=(24, 8),
                               location=(fx, ft['y'] - 0.005, wr[2])), m['role']('Foot', 'joint'), f'leg.{sfx}')
        for k, ang in enumerate((-ft['spread'] / 2, ft['spread'] / 2)):
            d = Vector((math.sin(ang), -math.cos(ang), 0)) * 0.05
            add(kit.superellipsoid(f'WebRib.{sfx}{k}', (0.0045, 0.03, 0.0045), 0.6, 0.6, seg=(8, 6),
                                   location=(fx + d.x, ft['y'] + 0.01 + d.y * 0.5, wr[2] * 2 - 0.001),
                                   rotation=(0, 0, ang)), m['bezel'], f'leg.{sfx}')
        tr = ft['toe']
        for k, ang in enumerate((-ft['spread'], 0.0, ft['spread'])):
            base = Vector((fx, ft['y'] + 0.03, tr[2] + 0.002))
            d = Vector((math.sin(ang), -math.cos(ang), 0)) * (tr[1] * 0.85)
            add(kit.superellipsoid(f'Toe.{sfx}{k}', tr, 0.6, 0.9, seg=(14, 8),
                                   location=tuple(base + d), rotation=(0, 0, ang)), m['role']('Foot', 'joint'),
                f'leg.{sfx}')

    # The wind-up key: a boss on his back with a rivet ring, a shaft with a collar, and
    # a bow of two rings on a cross bar (the grip) that glows.
    k = D['key']
    x, y, z = k['top']
    boss = kit.lathe('KeyBoss', [(0.0, 0.026), (0.03, 0.02), (0.034, 0.008), (0.034, -0.012), (0.0, -0.012)], seg=20)
    boss.location = (k['base'][0], k['base'][1], k['base'][2] - 0.004)
    add(boss, m['joint'], 'body')
    add(studs('KeyRivets', [(0.03 * math.cos(a), k['base'][1] + 0.03 * math.sin(a), k['base'][2] + 0.006)
                            for a in [i * math.pi / 3 for i in range(6)]], 0.0055), m['bezel'], 'body')
    shaft, _ = kit.tube('KeyShaft', [(x, y, k['base'][2] + 0.01), k['top']], 0.014, ring=10)
    add(shaft, m['joint'], 'key')
    add(kit.torus('KeyCollar', 0.016, 0.0065, seg=(16, 6), location=(x, y, k['base'][2] + 0.03)), m['bezel'], 'key')
    for i, dz in enumerate((0.055, 0.075, 0.095)):
        add(kit.torus(f'KeyKnurl.{i}', 0.0145, 0.0035, seg=(12, 5), location=(x, y, k['base'][2] + dz)),
            m['joint'], 'key')
    add(kit.superellipsoid('KeyHub', (0.026, 0.018, 0.026), seg=(16, 10), location=(x, y, z)), m['bezel'], 'key')
    add(kit.superellipsoid('KeyBar', (0.07, 0.009, 0.009), 0.6, 0.6, seg=(16, 8), location=(x, y, z)),
        m['beacon'], 'key')
    for side in (1, -1):
        add(kit.torus(f'KeyBow.{side}', 0.033, 0.0085, seg=(24, 8), location=(x + side * 0.08, y, z + 0.004),
                      rotation=(math.pi / 2, 0, 0)), m['beacon'], 'key')
        add(kit.superellipsoid(f'KeyGlint.{side}', (0.006, 0.004, 0.006), 0.6, 0.6, seg=(8, 6),
                               location=(x + side * 0.08 + 0.014, y - 0.0085, z + 0.028)), m['bezel'], 'key')

    return looks.finish(kit.armature('DuckRig', rig_bones()), parts, skin, m)
