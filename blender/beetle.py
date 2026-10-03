"""Clunk, the crew's robot rhino beetle: low, wide and horizontal like Dot the ladybug, a big
glossy dome of a shell in two halves meeting in a seam down the back (bones `case.L` and
`case.R`, which lift open for flight to show the wings under them, `wing.L` and `wing.R`),
over a broad flat body close to the floor, six short sturdy legs splayed out to the sides, a
collar plate and a small screen-faced head at the front, set low. His signature is the horn:
thick as a rhino's at the base and tapering, rising from the front of the head and curving
up and forward, in two bones (`horn.1`, `horn.2`) with a lamp on the tip (Dot0); a second
small horn (`thorn`) stands on the collar above it, and a lamp (Dot1) sits at the tail. A
striped ball waits in front of him on a bone of its own (`ball`, which the site scales to
nothing until he plays with it). Faces -Y like the rest of the crew; about 0.6 m long with
the horn and 0.3 m to the horn tip.
"""

import math

from mathutils import Vector

import bugkit
import kit
import looks
from bugkit import SIDES, ball

FACE = 'beetle'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'dome': dict(radii=(0.21, 0.27, 0.15), center=(0, 0.07, 0.06)),
    'rim': dict(radii=(0.215, 0.277, 0.028), center=(0, 0.07, 0.05)),
    'collar': dict(radii=(0.15, 0.085, 0.085), center=(0, -0.19, 0.085)),
    'head': dict(radii=(0.105, 0.085, 0.075), center=(0, -0.3, 0.075), e=(0.5, 0.5)),
    # 4:3, like the beetle's face layout (256 x 192)
    'screen': dict(radii=(0.072, 0.026, 0.054), center=(0, -0.366, 0.064), bezel=0.007),
    'horn': [(0, -0.29, 0.1), (0, -0.37, 0.24), (0, -0.52, 0.37)],
    'thorn': [(0, -0.225, 0.14), (0, -0.265, 0.25)],
    'antenna': [(0.05, -0.31, 0.12), (0.082, -0.35, 0.18), (0.11, -0.375, 0.235)],
    'legs': [-0.1, 0.05, 0.19],
    'leg': dict(hip=(0.15, 0.065), knee=(0.235, 0.045), foot=(0.272, 0.006)),
    'hinge': (0.006, -0.12, 0.2),
    'gap': 0.004,
    'wing': dict(root=(0.05, -0.04, 0.14), tip=(0.12, 0.38, 0.13), radii=(0.15, 0.06, 0.004)),
    'ball': dict(c=(0, -0.66, 0.09), r=0.09),
}


def on_dome(direction, lift=0.0):
    rx, ry, rz = D['dome']['radii']
    c = Vector(D['dome']['center'])
    n = Vector(direction).normalized()
    p = c + Vector((rx * n.x, ry * n.y, rz * n.z))
    normal = Vector((n.x / rx, n.y / ry, n.z / rz)).normalized()
    return p + normal * lift, normal


def rig_bones():
    hn, th, w = D['horn'], D['thorn'], D['wing']
    hx, hy, hz = D['hinge']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.07, 0.06), (0, 0.07, 0.24), 'root'),
        ('head', (0, -0.22, 0.06), (0, -0.3, 0.12), 'body'),
        ('horn.1', hn[0], hn[1], 'head'),
        ('horn.2', hn[1], hn[2], 'horn.1'),
        ('thorn', th[0], th[1], 'body'),
        ('ball', D['ball']['c'], (0, D['ball']['c'][1], D['ball']['c'][2] + 0.1), 'root'),
    ]
    for side, sfx in SIDES:
        bones.append((f'case.{sfx}', (side * hx, hy, hz), (side * hx, 0.3, 0.14), 'body'))
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

    d = D['dome']
    cx, cy, cz = d['center']
    rx, ry, rz = d['radii']
    # The body under the shell, a broad flat dark tray, with a rim round it.
    body = kit.superellipsoid('Body', (rx * 0.92, ry * 0.92, rz * 0.8), 0.9, 1.0, seg=(40, 22), location=d['center'])
    add(kit.cut(body, (0, 0, 1)), m['joint'], 'body')
    r = D['rim']
    add(kit.superellipsoid('Rim', r['radii'], 0.4, 1.0, seg=(48, 10), location=r['center']), m['joint'], 'body')
    add(kit.superellipsoid('Belly', (0.17, 0.22, 0.012), 0.4, 0.7, seg=(28, 8), location=(0, 0.07, 0.022)),
        m['bezel'], 'body')

    # The shell: two glossy halves meeting in a seam, panel seams across each, a hinge at
    # the front, a lit lamp at the tail between them.
    for side, sfx in SIDES:
        case = kit.superellipsoid(f'Case.{sfx}', d['radii'], 0.85, 1.0, seg=(48, 28),
                                  location=(cx + side * D['gap'], cy, cz))
        kit.cut(case, (0, 0, 1))
        add(kit.cut(case, (side, 0, 0)), m['shell'], f'case.{sfx}')
        pts = []
        for a in range(0, 15):
            th = math.radians(4 + 82 * a / 14)
            p, _ = on_dome((0.001, -math.cos(th) * 0.97, math.sin(th)), 0.002)
            p.x = side * (D['gap'] + 0.004)
            pts.append(tuple(p))
        trim, _ = kit.tube(f'Trim.{sfx}', pts, 0.0045, ring=6)
        add(trim, m['joint'], f'case.{sfx}')
        for k, yy in enumerate((-0.3, 0.3)):
            kk = math.sqrt(1 - yy * yy)
            pts = []
            for a in range(0, 13):
                th = math.radians(6 + 78 * a / 12)
                p, _ = on_dome((side * math.sin(th) * kk, yy, math.cos(th) * kk), 0.002)
                p.x += side * D['gap']
                pts.append(tuple(p))
            seam, _ = kit.tube(f'Seam.{sfx}.{k}', pts, 0.004, ring=6)
            add(seam, m['joint'], f'case.{sfx}')
        hx, hy, hz = D['hinge']
        add(kit.superellipsoid(f'Barrel.{sfx}', (0.032, 0.012, 0.012), 0.6, 0.8, seg=(16, 10),
                               location=(side * 0.034, hy - 0.025, hz - 0.03),
                               rotation=(0, math.radians(-14) * side, 0)), m['joint'], f'case.{sfx}')
    # The tail lamp, set in the seam at the back of the shell.
    p, n = on_dome((0, 0.98, 0.18), 0.002)
    add(kit.superellipsoid('TailLamp', (0.034, 0.012, 0.022), 0.6, 1.0, seg=(16, 8), location=p,
                           rotation=n.to_track_quat('Z', 'Y').to_euler()), m['dot'](1), 'body')

    # The collar plate across the front of the shell, with its small horn.
    c = D['collar']
    add(kit.superellipsoid('Collar', c['radii'], 0.6, 0.8, seg=(32, 22), location=c['center']),
        m['role']('Fuzz'), 'body')
    for side in (-1, 1):
        add(bugkit.studs(f'CollarBolt.{side}', [(side * 0.13, -0.19, 0.12)], 0.007), m['bezel'], 'body')
    th = D['thorn']
    add(bugkit.segment('Thorn', th[0], th[1], 0.024, 0.008, e=(0.8, 0.8), seg=(16, 8), over=1.0),
        m['joint'], 'thorn')

    # The head, low at the front, with its screen, cheeks, pods and chin.
    h = D['head']
    hx, hy, hz = h['center']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(36, 24), location=h['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Beetle', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for bx in (-1, 1):
        add(kit.superellipsoid(f'Cheek.{bx}', (0.02, 0.011, 0.016), 0.5, 0.6, seg=(12, 8),
                               location=(bx * 0.092, hy - 0.04, hz - 0.012)), m['bezel'], 'head')
        add(kit.superellipsoid(f'Pod.{bx}', (0.012, 0.026, 0.026), 0.5, 0.6, seg=(14, 10),
                               location=(bx * (h['radii'][0] + 0.002), hy + 0.006, hz)), m['joint'], 'head')
    add(kit.superellipsoid('Chin', (0.04, 0.011, 0.008), 0.4, 0.6, seg=(14, 6),
                           location=(0, hy - 0.058, hz - 0.058)), m['joint'], 'head')
    bugkit.antennae(add, m, D['antenna'], r=(0.0095, 0.007), tip=0.02, club=True)

    # The horn: thick at the base, tapering as it rises and curves forward, a lamp on the tip.
    hn = D['horn']
    add(bugkit.segment('Horn.1', hn[0], hn[1], 0.07, 0.044, e=(0.8, 0.8), seg=(20, 12), over=1.15),
        m['role']('Horn', 'shell'), 'horn.1')
    add(bugkit.segment('Horn.2', hn[1], hn[2], 0.044, 0.016, e=(0.8, 0.8), seg=(20, 12), over=1.0),
        m['role']('Horn', 'shell'), 'horn.2')
    add(kit.superellipsoid('HornLamp', (0.02, 0.022, 0.02), 0.8, 1.0, seg=(16, 10),
                           location=(0, hn[2][1] - 0.006, hn[2][2] + 0.004)), m['dot'](0), 'horn.2')
    add(kit.torus('HornBand', 0.052, 0.008, seg=(24, 6), location=(0, hn[0][1] - 0.04, hn[0][2] + 0.06),
                  rotation=(math.radians(-40), 0, 0)), m['bezel'], 'horn.1')

    # Wings under the shell, flat membranes, scaled to nothing by the site until he flies.
    w = D['wing']
    for side, sfx in SIDES:
        a, b = bugkit.mirror(w['root'], side), bugkit.mirror(w['tip'], side)
        mid = tuple((u + v) / 2 for u, v in zip(a, b))
        turn = math.atan2(b[1] - a[1], b[0] - a[0])
        add(kit.superellipsoid(f'Wing.{sfx}', w['radii'], 1.0, 1.0, seg=(28, 8), location=mid,
                               rotation=(0, 0, turn)), m['role']('Wing', 'bezel'), f'wing.{sfx}')

    lg = D['leg']
    bugkit.legs(add, m, D['legs'], lg['hip'], lg['knee'], lg['foot'], r=0.017, pad=(0.026, 0.034, 0.009))

    # The ball.
    bl = D['ball']
    add(kit.superellipsoid('Ball', (bl['r'],) * 3, 1.0, 1.0, seg=(28, 20), location=bl['c']),
        m['bezel'], 'ball')
    for i, f in enumerate((-0.4, 0.4)):
        rr = bl['r'] * math.sqrt(1 - f * f)
        add(kit.torus(f'Stripe{i}', rr + 0.002, 0.009, seg=(32, 6),
                      location=(bl['c'][0], bl['c'][1], bl['c'][2] + f * bl['r'])), m['joint'], 'ball')
    return looks.finish(kit.armature('BeetleRig', rig_bones()), parts, skin, m)
