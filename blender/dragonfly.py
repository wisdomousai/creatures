"""Reed, the crew's robot dragonfly: a long slim body lying along Y like Clunk's, hovering
above its feet. A big round head with two huge compound-eye domes (role Eye) at the sides of
a small screen face, a chunky thorax, and the signature tail: six drum segments on a chain of
bones (`tail.1` .. `tail.6`) with a lit ring at every joint (Dot0 to Dot5, so a pulse can run
down it). Four long narrow clear wings (`wing.L/R` fore, `hind.L/R`), each a dark frame round
a pale pane with a lit cell near the tip (Dot6), held out flat at the sides like a dragonfly
perched, six short legs bunched under the thorax, and two short bristle antennae with
glowing tips. A reed waits on a bone of its own (`reed`, scaled to nothing by the site until
the dragonfly perches on it). Faces -Y; about 0.9 m long, 0.8 m across the wings.
"""

import math

from mathutils import Matrix, Vector

import bugkit
import kit
import looks
from bugkit import SIDES, ball

FACE = 'dragonfly'
PREVIEW = dict(lift=0.0, width=0.9, turn=25, tip=30)

D = {
    'thorax': dict(radii=(0.075, 0.1, 0.07), center=(0, -0.06, 0.2)),
    'head': dict(radii=(0.062, 0.05, 0.055), center=(0, -0.2, 0.205), e=(0.6, 0.7)),
    'eye': dict(r=0.06, x=0.07, c=(0, -0.2, 0.22)),
    'screen': dict(radii=(0.042, 0.02, 0.032), center=(0, -0.245, 0.2), bezel=0.005),
    'antenna': [(0.02, -0.235, 0.255), (0.032, -0.255, 0.285), (0.04, -0.268, 0.31)],
    'tail_y': [0.025, 0.115, 0.205, 0.295, 0.385, 0.475, 0.565],
    'tail_z': [0.2, 0.198, 0.195, 0.19, 0.185, 0.18, 0.175],
    'tail_r': [0.036, 0.031, 0.027, 0.023, 0.02, 0.017, 0.014],
    'legs': [-0.12, -0.075, -0.03],
    'leg': dict(hip=(0.04, 0.16), knee=(0.085, 0.1), foot=(0.098, 0.0)),
    'fore': dict(a=(0.06, -0.1, 0.255), b=(0.42, -0.14, 0.3), width=0.14),
    'hind': dict(a=(0.06, -0.01, 0.25), b=(0.4, 0.04, 0.29), width=0.16),
    'reed': dict(top=0.12, bottom=-0.5, at=(0, -0.07)),
}


def frame(a, b, up=(0, 0, 1)):
    """Euler rotation that lays a flat part's long axis (local X) from a to b, its flat
    face up."""
    x = (Vector(b) - Vector(a)).normalized()
    y = Vector(up).cross(x).normalized()
    z = x.cross(y)
    return Matrix(((x.x, y.x, z.x), (x.y, y.y, z.y), (x.z, y.z, z.z))).to_euler()


def rig_bones():
    f, h = D['fore'], D['hind']
    ty, tz = D['tail_y'], D['tail_z']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, -0.12, 0.2), (0, 0.0, 0.2), 'root'),
        ('head', (0, -0.15, 0.2), (0, -0.25, 0.2), 'body'),
        ('reed', (0, D['reed']['at'][1], D['reed']['top']), (0, D['reed']['at'][1], D['reed']['bottom']), 'root'),
    ]
    for i in range(6):
        bones.append((f'tail.{i + 1}', (0, ty[i], tz[i]), (0, ty[i + 1], tz[i + 1]),
                      'body' if i == 0 else f'tail.{i}'))
    for side, sfx in SIDES:
        bones.append((f'wing.{sfx}', bugkit.mirror(f['a'], side), bugkit.mirror(f['b'], side), 'body'))
        bones.append((f'hind.{sfx}', bugkit.mirror(h['a'], side), bugkit.mirror(h['b'], side), 'body'))
        bones += bugkit.antenna_bones(side, sfx, D['antenna'])
    lg = D['leg']
    bones += bugkit.leg_bones(D['legs'], lg['hip'], lg['knee'], lg['foot'])
    return bones


def wing(add, m, name, a, b, width, bone):
    """A long clear wing: a dark frame, a pale pane in it, two ribs and a lit tip cell."""
    A, B = Vector(a), Vector(b)
    mid = (A + B) / 2
    length = (B - A).length
    rot = frame(a, b)
    d = (B - A).normalized()
    side = Vector(rot.to_matrix() @ Vector((0, 1, 0)))
    up = Vector(rot.to_matrix() @ Vector((0, 0, 1)))
    add(kit.superellipsoid(f'{name}.Frame', (length / 2, width / 2, 0.006), 0.9, 0.7, seg=(28, 10),
                           location=tuple(mid), rotation=rot), m['joint'], bone)
    add(kit.superellipsoid(f'{name}.Pane', (length / 2 * 0.93, width / 2 * 0.78, 0.0085), 0.9, 0.7, seg=(28, 10),
                           location=tuple(mid + up * 0.002), rotation=rot), m['role']('Wing', 'bezel'), bone)
    for k, u in enumerate((0.3, 0.6)):
        c = A + d * (length * u) + up * 0.004
        add(kit.superellipsoid(f'{name}.Rib{k}', (0.0065, width * 0.42, 0.0065), 0.8, 0.8, seg=(10, 6),
                               location=tuple(c), rotation=rot), m['joint'], bone)
    c = A + d * (length * 0.86) + side * (width * 0.2) + up * 0.006
    add(kit.superellipsoid(f'{name}.Cell', (length * 0.06, width * 0.1, 0.006), 0.7, 0.8, seg=(14, 6),
                           location=tuple(c), rotation=rot), m['dot'](6), bone)


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    t = D['thorax']
    add(kit.superellipsoid('Thorax', t['radii'], 0.7, 0.8, seg=(32, 22), location=t['center']),
        m['role']('Fuzz'), 'body')
    for side in (-1, 1):
        add(bugkit.segment(f'Stripe.{side}', (side * 0.06, -0.12, 0.225), (side * 0.07, -0.01, 0.225), 0.012, 0.012,
                           e=(0.8, 0.8)), m['joint'], 'body')
    add(kit.torus('Collar', 0.06, 0.008, seg=(32, 6), location=(0, -0.14, 0.2), rotation=(math.radians(90), 0, 0)),
        m['joint'], 'body')

    h = D['head']
    hx, hy, hz = h['center']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(32, 22), location=h['center']),
        m['role']('Head'), 'head')
    e = D['eye']
    for side in (-1, 1):
        add(ball(f'Eye.{side}', (side * e['x'], e['c'][1], e['c'][2]), e['r'], seg=(24, 16)),
            m['role']('Eye', 'shell'), 'head')
        add(kit.torus(f'EyeRim.{side}', e['r'] * 0.98, 0.006, seg=(28, 6),
                      location=(side * e['x'], e['c'][1] - e['r'] * 0.15, e['c'][2]),
                      rotation=(math.radians(90), 0, math.radians(20 * side))), m['joint'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Dragonfly', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    bugkit.antennae(add, m, D['antenna'], r=(0.006, 0.0045), tip=0.013)

    # The tail: a drum for every segment, a lit ring where each joins the next.
    ty, tz, tr = D['tail_y'], D['tail_z'], D['tail_r']
    for i in range(6):
        bone = f'tail.{i + 1}'
        a = (0, ty[i] + 0.004, tz[i])
        b = (0, ty[i + 1] - 0.004, tz[i + 1])
        add(bugkit.segment(f'Seg{i}', a, b, tr[i], tr[i], e=(0.7, 0.8), seg=(20, 12), over=0.95, taper=0.0),
            m['shell'], bone)
        add(kit.torus(f'Ring{i}', tr[i] * 0.98, 0.0075, seg=(28, 8), location=(0, ty[i + 1] - 0.003, tz[i + 1]),
                      rotation=(math.radians(90), 0, 0)), m['dot'](i), bone)
    add(ball('TailTip', (0, ty[6] + 0.005, tz[6]), tr[6] * 0.95), m['joint'], 'tail.6')

    f, hd = D['fore'], D['hind']
    for side, sfx in SIDES:
        wing(add, m, f'Fore.{sfx}', bugkit.mirror(f['a'], side), bugkit.mirror(f['b'], side), f['width'], f'wing.{sfx}')
        wing(add, m, f'Hind.{sfx}', bugkit.mirror(hd['a'], side), bugkit.mirror(hd['b'], side), hd['width'], f'hind.{sfx}')
        add(ball(f'Hinge.{sfx}', (side * 0.07, -0.1, 0.25), 0.018, seg=(12, 8)), m['joint'], f'wing.{sfx}')
        add(ball(f'HindHinge.{sfx}', (side * 0.07, -0.01, 0.245), 0.018, seg=(12, 8)), m['joint'], f'hind.{sfx}')

    lg = D['leg']
    bugkit.legs(add, m, D['legs'], lg['hip'], lg['knee'], lg['foot'], r=0.0075, pad=(0.014, 0.018, 0.005))

    # The reed she lands on: a thin stalk, a knot, and a lit seed head on top.
    rd = D['reed']
    x, y = rd['at']
    add(bugkit.segment('Stalk', (x, y, rd['bottom']), (x, y, rd['top'] - 0.01), 0.013, 0.013, e=(0.8, 0.8),
                       seg=(14, 10)), m['role']('Stem', 'joint'), 'reed')
    add(kit.superellipsoid('Head2', (0.022, 0.022, 0.05), 0.8, 0.9, seg=(16, 12), location=(x, y, rd['top'] - 0.02)),
        m['role']('Stem', 'joint'), 'reed')
    return looks.finish(kit.armature('DragonflyRig', rig_bones()), parts, skin, m, outline=0.0035)
