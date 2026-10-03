"""The crew's robot chick, Biddy the hen's baby: a round fluffball of a toy made of chunky
rounded pods, a big round head with a screen face and a tiny orange beak on its own jaw bone,
two little wing stubs with a light on each tip (Dot1), thin orange legs with big flat feet, a
tuft of pods for a tail, a lamp on its breast (Dot0) and a pod on the crown that is the
beacon. About half the hen's height (0.27 m to the top of the crown). Faces -Y like the rest
of the crew.
"""

import math

import birdkit
import kit
import looks

FACE = 'chick'
PREVIEW = dict(lift=0.0, width=0.3)

D = {
    'body': dict(radii=(0.088, 0.088, 0.085), center=(0, 0.02, 0.105)),
    'head': dict(radii=(0.082, 0.074, 0.07), center=(0, -0.035, 0.19), e=(0.9, 0.9)),
    # 1.6:1, like the chick's face layout (512 x 320)
    'screen': dict(radii=(0.06, 0.02, 0.0375), center=(0, -0.099, 0.2), bezel=0.006),
    'bill': dict(a=(0, -0.1, 0.162), b=(0, -0.13, 0.158)),
    'jaw': dict(pivot=(0, -0.095, 0.15), a=(0, -0.1, 0.15), b=(0, -0.122, 0.147)),
    'wing': dict(shoulder=(0.082, 0.0, 0.13), tip=(0.1, 0.045, 0.085)),
    'tail': dict(base=(0, 0.1, 0.12), tip=(0, 0.14, 0.15)),
    'leg': dict(x=0.034, top=(0.02, 0.05), bottom=(0.0, 0.0)),
}


def rig_bones():
    w, lg, t, j = D['wing'], D['leg'], D['tail'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.06, 0.06), (0, 0.0, 0.15), 'root'),
        ('head', (0, -0.03, 0.14), (0, -0.04, 0.26), 'body'),
        ('jaw', j['pivot'], (0, -0.13, j['pivot'][2]), 'head'),
        ('tail', t['base'], t['tip'], 'body'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        sx, sy, sz = w['shoulder']
        tx, ty, tz = w['tip']
        bones.append((f'wing.{sfx}', (side * sx, sy, sz), (side * tx, ty, tz), 'body'))
        bones.append((f'leg.{sfx}', (side * lg['x'], lg['top'][0], lg['top'][1]), (side * lg['x'], lg['bottom'][0], 0.0),
                      'body'))
    return bones


def pods_on(add, mat, bone, centre, radii, rings, around, r, seed, skip=None, lift=0.82):
    """Chunky rounded pods over an ellipsoid: rings of them (z as -1..1 of its height), each
    ring staggered against the last. `skip(x, y, z)` leaves a pod out (the face, the belly)."""
    state = [seed]

    def rnd():
        state[0] = (state[0] * 9301 + 49297) % 233280
        return state[0] / 233280.0

    n = 0
    for ri, zz in enumerate(rings):
        cr = math.sqrt(max(0.0, 1 - zz * zz))
        for k in range(around[ri]):
            a = 2 * math.pi * (k + 0.5 * (ri % 2)) / around[ri]
            x, y, z = math.sin(a) * cr, math.cos(a) * cr, zz
            if skip and skip(x, y, z):
                continue
            s = r * (0.85 + 0.3 * rnd())
            at = (centre[0] + radii[0] * x * lift * 1.12, centre[1] + radii[1] * y * lift * 1.12,
                  centre[2] + radii[2] * z * lift * 1.12)
            add(birdkit.ball(f'Fluff.{bone}.{n}', at, s, seg=(12, 8)), mat, bone)
            n += 1


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    fluff = m['role']('Tuft', 'shell')

    # The body: a round core under a heap of pods (none on the belly's front, for the lamp).
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], 0.92, 0.92, seg=(40, 26), location=b['center']), m['shell'], 'body')
    pods_on(add, fluff, 'body', b['center'], b['radii'], rings=(-0.62, -0.2, 0.25, 0.68), around=(6, 8, 8, 6), r=0.03,
            seed=11, skip=lambda x, y, z: y < -0.55 and -0.5 < z < 0.5)
    add(birdkit.ball('Lamp', (0, -0.088, 0.118), 0.016, seg=(14, 8)), m['dot'](0), 'body')
    add(kit.torus('LampRim', 0.021, 0.004, seg=(24, 6), location=(0, -0.082, 0.118), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'body')

    # The head: a big round pod, the screen set into it, cheek pods and a crown tuft.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'][0], h['e'][1], seg=(40, 28), location=h['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Chick', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    hx, hy, hz = h['center']
    for side in (1, -1):
        add(birdkit.ball(f'Cheek.{side}', (side * 0.075, hy - 0.012, hz - 0.028), 0.027, seg=(14, 10)), fluff, 'head')
        add(birdkit.studs(f'CheekBolt.{side}', [(side * 0.087, hy - 0.025, hz + 0.005)], 0.0055), m['bezel'], 'head')
    for i, (x, y, z, r) in enumerate(((0, -0.03, 0.262, 0.026), (0.03, -0.015, 0.255, 0.02), (-0.03, -0.015, 0.255, 0.02),
                                      (0, 0.0, 0.258, 0.02))):
        add(birdkit.ball(f'Crown.{i}', (x, y, z), r, seg=(12, 8)), fluff, 'head')
    add(birdkit.ball('Beacon', (0, -0.035, 0.287), 0.012), m['beacon'], 'head')

    # The tiny beak: an upper bill and a jaw.
    bk, jw = D['bill'], D['jaw']
    add(birdkit.segment('Bill', bk['a'], bk['b'], 0.014, 0.01, e=(0.7, 0.85), over=1.15, taper=0.25),
        m['role']('Beak', 'joint'), 'head')
    add(birdkit.segment('Jaw', jw['a'], jw['b'], 0.011, 0.007, e=(0.7, 0.85), over=1.1), m['role']('Beak', 'joint'), 'jaw')

    # Wing stubs: a short rounded plate each, a light on the tip.
    w = D['wing']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        a = (side * w['shoulder'][0], w['shoulder'][1], w['shoulder'][2])
        tip = (side * w['tip'][0], w['tip'][1], w['tip'][2])
        add(birdkit.segment(f'Wing.{sfx}', a, tip, 0.016, 0.034, e=(0.6, 0.85)), m['role']('Wing', 'shell'), f'wing.{sfx}')
        add(birdkit.ball(f'WingTip.{sfx}', (tip[0] + side * 0.006, tip[1] + 0.008, tip[2] - 0.004), 0.011, seg=(12, 8)),
            m['dot'](1), f'wing.{sfx}')
        add(birdkit.ball(f'Shoulder.{sfx}', (a[0] + side * 0.004, a[1], a[2]), 0.017), m['joint'], f'wing.{sfx}')

    # A tuft of pods for a tail.
    t = D['tail']
    for i, (dx, dy, dz, r) in enumerate(((0, 0, 0, 0.03), (0.02, 0.012, 0.025, 0.022), (-0.02, 0.012, 0.025, 0.022))):
        add(birdkit.ball(f'TailPod.{i}', (dx, t['base'][1] + 0.01 + dy, t['base'][2] + 0.01 + dz), r, seg=(12, 8)), fluff,
            'tail')

    # Thin orange legs, big flat feet: three toes forward, one back.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        leg, _ = kit.tube(f'Leg.{sfx}', [(x, lg['top'][0], lg['top'][1]), (x, lg['bottom'][0], 0.016)], 0.008, ring=8)
        add(leg, m['role']('Foot', 'joint'), f'leg.{sfx}')
        for k, ang in enumerate((-0.6, 0.0, 0.6, math.pi)):
            ln = 0.046 if k < 3 else 0.026
            tip = (x + math.sin(ang) * ln, lg['bottom'][0] - math.cos(ang) * ln, 0.008)
            add(birdkit.segment(f'Toe.{sfx}{k}', (x, lg['bottom'][0], 0.009), tip, 0.0085, 0.0075, e=(0.7, 0.9),
                                seg=(10, 6)), m['role']('Foot', 'joint'), f'leg.{sfx}')
        add(birdkit.ball(f'Ankle.{sfx}', (x, lg['bottom'][0], 0.014), 0.0105, seg=(10, 6)), m['bezel'], f'leg.{sfx}')

    return looks.finish(kit.armature('ChickRig', rig_bones()), parts, skin, m)
