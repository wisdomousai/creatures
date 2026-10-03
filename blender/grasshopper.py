"""Fiddle, the crew's robot grasshopper: lying along Y, a tall long head (a screen face on a
head taller than it is wide, big antennae), a thorax with a saddle plate, a long tapering
abdomen with three lit bands (Dot0 to Dot2) under two narrow wing covers (`cover.L`,
`cover.R`, each with a lit stripe, Dot3, the fiddle) and, tucked under them, two orange wings
(`under.L`, `under.R`, which the site folds to nothing until he flies). Two pairs of ordinary
legs (bones `leg.L.0`, `foot.L.0` ... four in all with the third pair left off) and his
signature: the long folded hind legs with a big drumstick thigh (a lit stripe on each, Dot4)
swept back and up to a high knee, a long shin back down to the floor (`hleg.L`, `hfoot.L`).
Faces -Y; about 0.8 m long and 0.35 m to the knees.
"""

import math

import bugkit
import kit
import looks
from bugkit import SIDES, ball

FACE = 'grasshopper'
PREVIEW = dict(lift=0.0, width=0.6, turn=-60)

D = {
    'head': dict(radii=(0.072, 0.082, 0.105), center=(0, -0.255, 0.2), e=(0.7, 0.8)),
    'thorax': dict(radii=(0.075, 0.1, 0.078), center=(0, -0.09, 0.2), e=(0.75, 0.85)),
    'abdomen': dict(radii=(0.062, 0.22, 0.062), center=(0, 0.2, 0.19), e=(0.8, 0.85)),
    # 4:5 (192 x 240) to match the grasshopper's tall face layout
    'screen': dict(radii=(0.054, 0.02, 0.068), center=(0, -0.325, 0.2), bezel=0.006),
    'antenna': [(0.03, -0.3, 0.3), (0.07, -0.37, 0.43), (0.13, -0.42, 0.52)],
    'legs': [-0.14, -0.07],
    'leg': dict(hip=(0.06, 0.15), knee=(0.15, 0.25), foot=(0.2, 0.0)),
    'hind': dict(hip=(0.09, 0.06, 0.2), knee=(0.125, 0.4, 0.33), foot=(0.14, 0.2, 0.0)),
    'cover': dict(a=(0.04, -0.03, 0.262), b=(0.04, 0.42, 0.235), width=0.11),
    'wing': dict(root=(0.04, 0.0, 0.24), tip=(0.13, 0.5, 0.22), radii=(0.14, 0.05, 0.004)),
}


def rig_bones():
    d = D
    h = d['hind']
    c = d['cover']
    w = d['wing']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.0, 0.2), (0, -0.14, 0.2), 'root'),
        ('abdomen', (0, 0.02, 0.19), (0, 0.4, 0.19), 'body'),
        ('head', (0, -0.17, 0.2), (0, -0.26, 0.22), 'body'),
    ]
    for side, sfx in SIDES:
        bones.append((f'cover.{sfx}', bugkit.mirror(c['a'], side), bugkit.mirror(c['b'], side), 'body'))
        bones.append((f'under.{sfx}', bugkit.mirror(w['root'], side), bugkit.mirror(w['tip'], side), 'body'))
        bones += bugkit.antenna_bones(side, sfx, d['antenna'])
        hp, kn, ft = (bugkit.mirror(q, side) for q in (h['hip'], h['knee'], h['foot']))
        bones += [(f'hleg.{sfx}', hp, kn, 'body'), (f'hfoot.{sfx}', kn, ft, f'hleg.{sfx}')]
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
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(36, 26), location=h['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Grasshopper', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for bx in (-1, 1):
        add(kit.superellipsoid(f'Cheek.{bx}', (0.015, 0.012, 0.03), 0.5, 0.6, seg=(12, 8),
                               location=(bx * 0.07, -0.285, 0.17)), m['joint'], 'head')
        add(ball(f'Eye.{bx}', (bx * 0.062, -0.22, 0.268), 0.026, seg=(14, 10)), m['joint'], 'head')
    add(kit.superellipsoid('Lamp', (0.011, 0.011, 0.008), 0.8, 1.0, seg=(14, 8),
                           location=(0, h['center'][1] + 0.005, h['center'][2] + h['radii'][2] - 0.001)),
        m['beacon'], 'head')
    bugkit.antennae(add, m, D['antenna'], r=(0.008, 0.005), tip=0.016, club=False)

    t = D['thorax']
    add(kit.superellipsoid('Thorax', t['radii'], t['e'][0], t['e'][1], seg=(32, 22), location=t['center']),
        m['role']('Head'), 'body')
    add(kit.superellipsoid('Saddle', (0.083, 0.095, 0.03), 0.5, 0.7, seg=(28, 12), location=(0, -0.1, 0.262)),
        m['role']('Saddle'), 'body')
    add(ball('Neck', (0, -0.17, 0.2), 0.05, seg=(16, 10)), m['joint'], 'body')

    a = D['abdomen']
    add(kit.superellipsoid('Abdomen', a['radii'], a['e'][0], a['e'][1], seg=(36, 24), location=a['center'],
                           taper=0.0), m['shell'], 'abdomen')
    ax, ay, az = a['center']
    for i, f in enumerate((-0.45, 0.0, 0.45)):
        r = a['radii'][0] * (1 - abs(f) ** 2.2) ** 0.45 * 0.95
        add(kit.stretch(kit.torus(f'Band{i}', r + 0.002, 0.008, seg=(32, 8),
                                  location=(0, ay + f * a['radii'][1], az), rotation=(math.radians(90), 0, 0)),
                        sz=1.3), m['dot'](i), 'abdomen')
    add(ball('Tip', (0, ay + a['radii'][1] * 0.97, az), 0.03, seg=(12, 8)), m['joint'], 'abdomen')

    # Wing covers, two long narrow plates roofed over the back, each with a lit stripe.
    c = D['cover']
    for side, sfx in SIDES:
        ca, cb = bugkit.mirror(c['a'], side), bugkit.mirror(c['b'], side)
        mid = tuple((u + v) / 2 for u, v in zip(ca, cb))
        length = math.dist(ca, cb)
        rot = (math.atan2(cb[2] - ca[2], length), 0, 0)
        # laid along Y, sloping down at the back, roofed a little to the outside
        cover = kit.superellipsoid(f'Cover.{sfx}', (c['width'] / 2, length / 2, 0.012), 0.8, 0.9, seg=(28, 12),
                                   location=(mid[0] + side * 0.03, mid[1], mid[2]), rotation=(rot[0] * -1, side * 0.22, 0))
        add(cover, m['role']('Cover'), f'cover.{sfx}')
        add(kit.superellipsoid(f'Fiddle.{sfx}', (0.011, length * 0.4, 0.008), 0.7, 0.8, seg=(20, 8),
                               location=(mid[0] + side * 0.035, mid[1] + 0.01, mid[2] + 0.014),
                               rotation=(rot[0] * -1, side * 0.22, 0)), m['dot'](3), f'cover.{sfx}')
        add(ball(f'Hinge.{sfx}', ca, 0.015, seg=(12, 8)), m['joint'], f'cover.{sfx}')

    # Wings under the covers: orange fans, scaled to nothing by the site until a jump.
    w = D['wing']
    for side, sfx in SIDES:
        a_, b_ = bugkit.mirror(w['root'], side), bugkit.mirror(w['tip'], side)
        mid = tuple((u + v) / 2 for u, v in zip(a_, b_))
        turn = math.atan2(b_[1] - a_[1], b_[0] - a_[0])
        add(kit.superellipsoid(f'Wing.{sfx}', w['radii'], 1.0, 1.0, seg=(28, 8), location=mid,
                               rotation=(0, 0, turn)), m['role']('Wing', 'bezel'), f'under.{sfx}')

    # Two ordinary leg pairs.
    lg = D['leg']
    bugkit.legs(add, m, D['legs'], lg['hip'], lg['knee'], lg['foot'], r=0.0115, pad=(0.02, 0.026, 0.008))

    # The hind legs: a big drumstick thigh up and back to a high knee, a long shin down.
    hd = D['hind']
    for side, sfx in SIDES:
        hp, kn, ft = (bugkit.mirror(q, side) for q in (hd['hip'], hd['knee'], hd['foot']))
        add(bugkit.segment(f'Thigh.{sfx}', hp, kn, 0.052, 0.04, e=(0.7, 0.8), seg=(24, 14), over=1.02, taper=0.9),
            m['role']('Thigh', 'shell'), f'hleg.{sfx}')
        # the lit stripe along the outside of the drumstick
        mid = tuple((u * 0.62 + v * 0.38) for u, v in zip(hp, kn))
        add(bugkit.segment(f'Stripe.{sfx}', (hp[0] + side * 0.03, hp[1] + 0.05, hp[2] + 0.005),
                           (kn[0] + side * 0.018, kn[1] - 0.05, kn[2] + 0.004), 0.011, 0.011, e=(0.8, 0.8),
                           seg=(16, 8)), m['dot'](4), f'hleg.{sfx}')
        add(ball(f'HipBall.{sfx}', hp, 0.05, seg=(16, 10)), m['joint'], f'hleg.{sfx}')
        add(ball(f'HKnee.{sfx}', kn, 0.032, seg=(16, 10)), m['joint'], f'hfoot.{sfx}')
        shin, _ = kit.tube(f'HShin.{sfx}', [kn, ft], 0.0125, ring=8)
        add(shin, m['joint'], f'hfoot.{sfx}')
        for k in range(4):
            u = 0.25 + 0.18 * k
            p = tuple(a + (b - a) * u for a, b in zip(kn, ft))
            add(bugkit.studs(f'Spine.{sfx}.{k}', [(p[0] + side * 0.01, p[1], p[2])], 0.008), m['bezel'], f'hfoot.{sfx}')
        add(kit.superellipsoid(f'HPad.{sfx}', (0.024, 0.034, 0.009), 0.4, 0.6, seg=(16, 8),
                               location=(ft[0], ft[1] - 0.008, 0.009)), m['shell'], f'hfoot.{sfx}')
    return looks.finish(kit.armature('GrasshopperRig', rig_bones()), parts, skin, m, outline=0.0035)
