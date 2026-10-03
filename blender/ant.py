"""Atlas, the crew's robot ant: three round balls on a pinched waist, lying along Y like Clunk and
Reed. A big round screen-faced head (bone `head`) with two chunky mandibles (`jaw.L`, `jaw.R`)
and two long elbowed antennae with glowing club tips, a rounded thorax, a bead of a waist, and
a big round gaster with two lit bands (Dot0, Dot1) on a bone of its own (`abdomen`). Six
sturdy legs, three a side. His signature, a crumb bigger than he is, waits in front of him on
a bone of its own (`crumb`, which the site scales to nothing until he picks it up): a lumpy
biscuit with dark chips and a few lit sugar crystals (Dot2). Faces -Y; about 0.65 m long.
"""

import math

import bugkit
import kit
import looks
from bugkit import SIDES, ball

FACE = 'ant'
PREVIEW = dict(lift=0.0, width=0.5, turn=-60)

D = {
    'head': dict(radii=(0.088, 0.082, 0.082), center=(0, -0.22, 0.17), e=(0.7, 0.75)),
    'thorax': dict(radii=(0.07, 0.092, 0.072), center=(0, -0.075, 0.17), e=(0.75, 0.85)),
    'waist': dict(radii=(0.03, 0.03, 0.03), center=(0, 0.033, 0.17)),
    'gaster': dict(radii=(0.105, 0.135, 0.105), center=(0, 0.19, 0.18)),
    # 4:3, like the ant's face layout (256 x 192)
    'screen': dict(radii=(0.062, 0.02, 0.0465), center=(0, -0.288, 0.17), bezel=0.006),
    'antenna': [(0.04, -0.27, 0.225), (0.09, -0.36, 0.33), (0.17, -0.4, 0.29)],
    'jaw': dict(hinge=(0.045, -0.285, 0.115), tip=(0.025, -0.35, 0.115)),
    'legs': [-0.115, -0.065, -0.015],
    'leg': dict(hip=(0.055, 0.14), knee=(0.15, 0.26), foot=(0.23, 0.0)),
    'crumb': dict(c=(0, -0.45, 0.2), r=(0.17, 0.15, 0.12)),
}


def rig_bones():
    d = D
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, -0.03, 0.17), (0, -0.11, 0.17), 'root'),
        ('abdomen', (0, 0.04, 0.17), (0, 0.2, 0.18), 'body'),
        ('head', (0, -0.15, 0.17), (0, -0.25, 0.17), 'body'),
        ('crumb', d['crumb']['c'], (0, d['crumb']['c'][1], d['crumb']['c'][2] + 0.1), 'root'),
    ]
    j = d['jaw']
    for side, sfx in SIDES:
        bones.append((f'jaw.{sfx}', bugkit.mirror(j['hinge'], side), bugkit.mirror(j['tip'], side), 'head'))
        bones += bugkit.antenna_bones(side, sfx, d['antenna'])
    lg = d['leg']
    bones += bugkit.leg_bones(d['legs'], lg['hip'], lg['knee'], lg['foot'])
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(36, 24), location=h['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Ant', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for bx in (-1, 1):
        add(kit.superellipsoid(f'Cheek.{bx}', (0.018, 0.012, 0.022), 0.5, 0.6, seg=(12, 8),
                               location=(bx * 0.086, -0.235, 0.17)), m['joint'], 'head')
    add(kit.superellipsoid('Lamp', (0.011, 0.011, 0.008), 0.8, 1.0, seg=(14, 8),
                           location=(0, h['center'][1] + 0.005, h['center'][2] + h['radii'][2] - 0.001)),
        m['beacon'], 'head')

    t = D['thorax']
    add(kit.superellipsoid('Thorax', t['radii'], t['e'][0], t['e'][1], seg=(32, 22), location=t['center']),
        m['role']('Thorax'), 'body')
    for k, y in enumerate((-0.11, -0.05)):
        add(bugkit.studs(f'Bolt{k}', [(0.0, y, 0.236)], 0.01), m['bezel'], 'body')
    add(ball('Neck', (0, -0.15, 0.17), 0.045, seg=(16, 10)), m['joint'], 'body')
    w = D['waist']
    add(ball('Waist', w['center'], w['radii'][0], seg=(16, 10)), m['joint'], 'body')
    add(kit.torus('WaistRing', 0.034, 0.008, seg=(24, 6), location=w['center'], rotation=(math.radians(90), 0, 0)),
        m['bezel'], 'body')

    g = D['gaster']
    add(kit.superellipsoid('Gaster', g['radii'], 0.85, 0.9, seg=(36, 26), location=g['center'], taper=0.0),
        m['shell'], 'abdomen')
    gx, gy, gz = g['center']
    for i, f in enumerate((-0.2, 0.4)):
        r = g['radii'][0] * (1 - abs(f) ** 2.2) ** 0.45 * 0.92
        add(kit.stretch(kit.torus(f'Band{i}', r + 0.002, 0.009, seg=(32, 8),
                                  location=(0, gy + f * g['radii'][1], gz), rotation=(math.radians(90), 0, 0)),
                        sz=1.3), m['dot'](i), 'abdomen')
    add(ball('Stinger', (0, gy + g['radii'][1] * 0.97, gz - 0.005), 0.026, seg=(12, 8)), m['joint'], 'abdomen')

    j = D['jaw']
    for side, sfx in SIDES:
        a, b = bugkit.mirror(j['hinge'], side), bugkit.mirror(j['tip'], side)
        add(bugkit.segment(f'Jaw.{sfx}', a, b, 0.019, 0.015, e=(0.7, 0.8), seg=(16, 10), over=1.1),
            m['joint'], f'jaw.{sfx}')
        add(ball(f'JawBall.{sfx}', a, 0.022, seg=(12, 8)), m['bezel'], 'head')
    bugkit.antennae(add, m, D['antenna'], r=(0.0105, 0.008), tip=0.022, club=True)

    lg = D['leg']
    bugkit.legs(add, m, D['legs'], lg['hip'], lg['knee'], lg['foot'], r=0.0125, pad=(0.022, 0.03, 0.009))

    # The crumb: a lumpy biscuit with chips and sugar crystals.
    c = D['crumb']
    cx, cy, cz = c['c']
    add(kit.superellipsoid('Crumb', c['r'], 0.6, 0.7, seg=(28, 20), location=c['c']), m['role']('Crumb', 'bezel'), 'crumb')
    add(kit.superellipsoid('CrumbBite', (0.07, 0.07, 0.055), 0.7, 0.8, seg=(18, 12),
                           location=(cx + 0.09, cy - 0.05, cz + 0.055)), m['role']('Crumb', 'bezel'), 'crumb')
    for k, (dx, dy, dz) in enumerate(((-0.09, -0.07, 0.06), (0.03, -0.1, 0.07), (-0.02, 0.06, 0.09))):
        add(kit.superellipsoid(f'Chip{k}', (0.026, 0.022, 0.016), 0.6, 0.8, seg=(12, 8),
                               location=(cx + dx, cy + dy, cz + dz)), m['joint'], 'crumb')
    for k, (dx, dy, dz) in enumerate(((0.06, 0.07, 0.08), (-0.11, 0.02, 0.05), (0.1, -0.1, -0.01))):
        add(ball(f'Sugar{k}', (cx + dx, cy + dy, cz + dz), 0.014, seg=(10, 6)), m['dot'](2), 'crumb')
    return looks.finish(kit.armature('AntRig', rig_bones()), parts, skin, m, outline=0.0035)
