"""Glim, the crew's robot firefly: a slim, long beetle carried level, lying along Y, with dark
shell cases over her back (bones `case.L` and `case.R`, which lift for flight to show the thin
wings under them, `wing.L` and `wing.R`) and her whole point at the rear end: a lamp, a glowing
core (Dot0) inside a cage of ribs, with a lit cap (Dot1) on its end, on a bone of its own
(`lamp`) so it can swing. A small screen-faced head, a pale collar plate, two antennae with lit
tips, six slender legs of two bones each. Faces -Y like the rest of the crew; about 0.6 m long.
"""

import math

from mathutils import Vector

import bugkit
import kit
import looks
from bugkit import SIDES

FACE = 'firefly'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'body': dict(radii=(0.09, 0.2, 0.075), center=(0, -0.02, 0.1)),
    'case': dict(radii=(0.1, 0.2, 0.085), center=(0, -0.01, 0.105)),
    'collar': dict(radii=(0.092, 0.07, 0.068), center=(0, -0.175, 0.105)),
    'head': dict(radii=(0.068, 0.058, 0.056), center=(0, -0.24, 0.1), e=(0.55, 0.6)),
    # 4:3, like the firefly's face layout (256 x 192)
    'screen': dict(radii=(0.048, 0.019, 0.036), center=(0, -0.288, 0.098), bezel=0.005),
    'antenna': [(0.03, -0.25, 0.14), (0.055, -0.295, 0.2), (0.08, -0.31, 0.25)],
    'lamp': dict(radii=(0.092, 0.115, 0.092), center=(0, 0.255, 0.1)),
    'legs': [-0.1, 0.0, 0.1],
    'leg': dict(hip=(0.07, 0.07), knee=(0.14, 0.05), foot=(0.165, 0.006)),
    'hinge': (0.006, -0.16, 0.17),
    'gap': 0.004,
    'wing': dict(root=(0.04, -0.06, 0.15), tip=(0.1, 0.34, 0.14), radii=(0.14, 0.05, 0.004)),
}


def rig_bones():
    w = D['wing']
    hx, hy, hz = D['hinge']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.05, 0.07), (0, 0.05, 0.2), 'root'),
        ('head', (0, -0.19, 0.08), (0, -0.25, 0.12), 'body'),
        ('lamp', (0, 0.17, 0.1), (0, 0.38, 0.1), 'body'),
    ]
    for side, sfx in SIDES:
        bones.append((f'case.{sfx}', (side * hx, hy, hz), (side * hx, 0.18, 0.15), 'body'))
        bones.append((f'wing.{sfx}', bugkit.mirror(w['root'], side), bugkit.mirror(w['tip'], side), 'body'))
        bones += bugkit.antenna_bones(side, sfx, D['antenna'])
    lg = D['leg']
    bones += bugkit.leg_bones(D['legs'], lg['hip'], lg['knee'], lg['foot'])
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The slim body under the shell.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], 0.8, 0.9, seg=(36, 22), location=b['center']), m['joint'], 'body')

    # The shell: two dark halves with a seam down the middle and a panel seam across each.
    c = D['case']
    cx, cy, cz = c['center']
    rx, ry, rz = c['radii']
    for side, sfx in SIDES:
        case = kit.superellipsoid(f'Case.{sfx}', c['radii'], 0.8, 1.0, seg=(44, 24),
                                  location=(cx + side * D['gap'], cy, cz))
        kit.cut(case, (0, 0, 1))
        add(kit.cut(case, (side, 0, 0)), m['shell'], f'case.{sfx}')
        pts = []
        for a in range(0, 13):
            th = math.radians(6 + 78 * a / 12)
            yy = 0.35
            kk = math.sqrt(1 - yy * yy)
            pts.append((side * (D['gap'] + rx * math.sin(th) * kk), cy + ry * yy, cz + rz * math.cos(th) * kk + 0.002))
        seam, _ = kit.tube(f'Seam.{sfx}', pts, 0.0035, ring=6)
        add(seam, m['joint'], f'case.{sfx}')
        add(kit.superellipsoid(f'Barrel.{sfx}', (0.026, 0.011, 0.011), 0.6, 0.8, seg=(14, 8),
                               location=(side * 0.03, D['hinge'][1] - 0.02, D['hinge'][2] - 0.02)),
            m['joint'], f'case.{sfx}')

    # The collar plate between shell and head.
    k = D['collar']
    add(kit.superellipsoid('Collar', k['radii'], 0.6, 0.8, seg=(28, 20), location=k['center']),
        m['role']('Fuzz'), 'body')

    # The small head with its screen.
    h = D['head']
    hx, hy, hz = h['center']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(32, 22), location=h['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Firefly', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for bx in (-1, 1):
        add(kit.superellipsoid(f'Pod.{bx}', (0.01, 0.02, 0.02), 0.5, 0.6, seg=(12, 8),
                               location=(bx * (h['radii'][0] + 0.001), hy + 0.005, hz)), m['joint'], 'head')
    add(kit.superellipsoid('Beacon', (0.011, 0.011, 0.008), 0.8, 1.0, seg=(14, 8),
                           location=(0, hy - 0.005, hz + h['radii'][2])), m['beacon'], 'head')
    bugkit.antennae(add, m, D['antenna'], r=(0.008, 0.006), tip=0.019)

    # The lamp: a glowing core in a cage of ribs, and a lit cap on its end.
    la = D['lamp']
    lx, ly, lz = la['center']
    arx, ary, arz = la['radii']
    add(kit.superellipsoid('Core', (arx * 0.94, ary * 0.94, arz * 0.94), 0.9, 0.95, seg=(40, 28),
                           location=la['center']), m['dot'](0), 'lamp')
    for i, phi in enumerate((0, 60, 120)):
        pts = []
        for a in range(0, 41):
            th = math.radians(a * 9)
            rad = arx * 1.04 * math.sin(th)
            pts.append((rad * math.cos(math.radians(phi)), ly + ary * 1.04 * math.cos(th),
                        lz + rad * math.sin(math.radians(phi))))
        rib, _ = kit.tube(f'Rib{i}', pts, 0.0085, ring=6)
        add(rib, m['joint'], 'lamp')
    for i, f in enumerate((-0.55, 0.0, 0.55)):
        r = arx * 1.04 * math.sqrt(1 - f * f)
        add(kit.torus(f'Hoop{i}', r, 0.0085, seg=(36, 6), location=(0, ly + f * ary, lz),
                      rotation=(math.pi / 2, 0, 0)), m['joint'], 'lamp')
    add(kit.superellipsoid('Cap', (0.03, 0.02, 0.03), 0.8, 1.0, seg=(16, 10),
                           location=(0, ly + ary * 1.0, lz)), m['dot'](1), 'lamp')
    add(kit.torus('Collar2', arx * 0.55, 0.01, seg=(28, 8), location=(0, ly - ary * 0.97, lz),
                  rotation=(math.pi / 2, 0, 0)), m['joint'], 'lamp')

    # Wings: thin membranes under the shell, scaled to nothing by the site until she flies.
    w = D['wing']
    for side, sfx in SIDES:
        a, bb = bugkit.mirror(w['root'], side), bugkit.mirror(w['tip'], side)
        mid = tuple((u + v) / 2 for u, v in zip(a, bb))
        turn = math.atan2(bb[1] - a[1], bb[0] - a[0])
        add(kit.superellipsoid(f'Wing.{sfx}', w['radii'], 1.0, 1.0, seg=(28, 8), location=mid,
                               rotation=(0, 0, turn)), m['role']('Wing', 'bezel'), f'wing.{sfx}')

    lg = D['leg']
    bugkit.legs(add, m, D['legs'], lg['hip'], lg['knee'], lg['foot'], r=0.0105, pad=(0.02, 0.026, 0.007))
    return looks.finish(kit.armature('FireflyRig', rig_bones()), parts, skin, m)
