"""Tumble, the crew's robot slinky: a toy spring that walks, not a snake or a worm. A stack of
nine chunky flat metal rings (a toy spring, each ring its own bone, `ring.0` at the bottom up
to `ring.8`) between a wide foot cap and a head cap with a screen face, a beacon knob on top
and two stubby mitten arms under its chin.

The site spaces the rings along a curve between the two caps, so the stack can stretch tall,
squash flat, sway like jelly and arch over end to end like a real slinky going down stairs.
Each ring carries a lit pip on its front (Dot0..Dot8, bottom to top) so a light can run up the
spring. `body` is a bone with no mesh: the directed poses of the play scenes bend it, and the
site turns that bend into a lean of the whole stack. Faces -Y like the rest of the crew;
about 0.81 m tall at rest.
"""

import math

from mathutils import Vector

import birdkit
import kit
import looks

FACE = 'slinky'
PREVIEW = dict(lift=0.0, width=0.3)

RINGS = 9
PITCH = 0.062
BASE_TOP = 0.052
D = {
    'foot': dict(radii=(0.128, 0.128, 0.026), z=0.026),
    'band': dict(R=0.092, a=0.025, b=0.0175),
    'head': dict(radii=(0.132, 0.108, 0.085), e=0.38, z=0.695),
    # 8:5, like the face layout (512 x 320)
    'screen': dict(radii=(0.104, 0.03, 0.065), center=(0, -0.09, 0.7), bezel=0.008),
    'beacon': dict(z=0.795, r=0.02),
    'shoulder': dict(x=0.12, z=0.655, r=0.026),
    'arm': [(0.122, 0.0, 0.655), (0.166, -0.01, 0.6), (0.196, -0.022, 0.55)],
    'arm_r': 0.0145,
    'hand': dict(radii=(0.03, 0.027, 0.032), center=(0.205, -0.027, 0.528), e=0.55),
}


def mirror_x(p):
    return (-p[0], *p[1:])


def ring_z(k):
    return BASE_TOP + (k + 0.5) * PITCH


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('base', (0, 0, D['foot']['z']), (0, 0, D['foot']['z'] + 0.05), 'root'),
        ('body', (0, 0, 0.35), (0, 0, 0.45), 'root'),
        ('head', (0, 0, D['head']['z']), (0, 0, D['head']['z'] + 0.09), 'root'),
    ]
    for k in range(RINGS):
        z = ring_z(k)
        bones.append((f'ring.{k}', (0, 0, z), (0, 0, z + 0.03), 'root'))
    hc = D['hand']['center']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        a = D['arm']
        bones += [
            (f'upper_arm.{sfx}', f(a[0]), f(a[1]), 'head'),
            (f'forearm.{sfx}', f(a[1]), f(a[2]), f'upper_arm.{sfx}'),
            (f'hand.{sfx}', f(a[2]), f((hc[0] + 0.005, hc[1], hc[2] - 0.02)), f'forearm.{sfx}'),
        ]
    return bones


def band(name, R, a, b, location, seg=(40, 14)):
    """A flat chunky ring: a torus whose cross-section is an ellipse a wide and b tall."""
    nu, nv = seg
    verts, faces = [], []
    for i in range(nu):
        t = 2 * math.pi * i / nu
        for j in range(nv):
            u = 2 * math.pi * j / nv
            # A squarish ellipse, so the band reads chunky rather than a thin hose.
            c, s = math.cos(u), math.sin(u)
            r = R + a * math.copysign(abs(c) ** 0.8, c)
            z = b * math.copysign(abs(s) ** 0.8, s)
            verts.append((r * math.cos(t) + location[0], r * math.sin(t) + location[1], z + location[2]))
    for i in range(nu):
        for j in range(nv):
            p, q = i * nv + j, ((i + 1) % nu) * nv + j
            r_, s_ = ((i + 1) % nu) * nv + (j + 1) % nv, i * nv + (j + 1) % nv
            faces.append((p, q, r_, s_))
    return kit.mesh_object(name, verts, faces)


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The foot cap: a wide flat puck with a rubber rim and four bolts.
    f = D['foot']
    add(kit.superellipsoid('Foot', f['radii'], 0.32, 1.0, seg=(40, 10), location=(0, 0, f['z'])), m['shell'], 'base')
    add(kit.torus('FootRim', 0.118, 0.01, seg=(40, 8), location=(0, 0, 0.022)), m['bezel'], 'base')
    add(kit.superellipsoid('FootPlate', (0.08, 0.08, 0.006), 0.4, 1.0, seg=(28, 8), location=(0, 0, 0.0545)),
        m['joint'], 'base')
    for i in range(4):
        a = math.pi / 4 + math.pi / 2 * i
        add(kit.superellipsoid(f'FootBolt.{i}', (0.008, 0.008, 0.004), 0.4, 1.0, seg=(10, 6),
                               location=(0.1 * math.cos(a), 0.1 * math.sin(a), 0.051)), m['bezel'], 'base')

    # The rings: chunky flat bands, each with a lit pip on its front.
    bd = D['band']
    for k in range(RINGS):
        z = ring_z(k)
        base = 'shell' if k % 2 == 0 else 'joint'
        add(band(f'Ring.{k}', bd['R'], bd['a'], bd['b'], (0, 0, z)), m['role'](f'Ring{k % 6}', base), f'ring.{k}')
        add(kit.superellipsoid(f'Pip.{k}', (0.0105, 0.006, 0.0105), 0.5, 0.8, seg=(12, 8),
                               location=(0, -(bd['R'] + bd['a']) + 0.002, z)), m['dot'](k), f'ring.{k}')

    # The head cap: a rounded box with a lip, a screen, bolts and a beacon knob.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(48, 32), location=(0, 0, h['z'])), m['shell'],
        'head')
    add(kit.torus('HeadLip', 0.112, 0.012, seg=(40, 8), location=(0, 0, h['z'] - 0.074)), m['bezel'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Tumble', sc['radii'], sc['center'], sc['bezel'], e=0.35)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for sx in (1, -1):
        add(kit.superellipsoid(f'HeadBolt.{sx}', (0.0055, 0.0055, 0.003), 0.4, 1.0, seg=(10, 6),
                               location=(sx * 0.095, -0.078, h['z'] + 0.055), rotation=(math.pi / 2, 0, 0)),
            m['bezel'], 'head')
    bc = D['beacon']
    stalk, _ = kit.tube('Stalk', [(0, 0, h['z'] + 0.075), (0, 0, bc['z'] - 0.008)], 0.007, ring=8)
    add(stalk, m['joint'], 'head')
    add(kit.superellipsoid('Beacon', (bc['r'],) * 3, seg=(16, 10), location=(0, 0, bc['z'])), m['beacon'], 'head')

    # Arms: shoulder ball, a short rubber-hose arm, a mitten hand.
    sh, hand = D['shoulder'], D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        g = (lambda q: q) if side > 0 else mirror_x
        add(birdkit.ball(f'Shoulder.{sfx}', g((sh['x'], 0, sh['z'])), sh['r'], seg=(18, 12)), m['joint'], 'head')
        arm, ts = kit.tube(f'Arm.{sfx}', kit.resample([g(q) for q in D['arm']], 10), D['arm_r'])
        bend = [min(max((u - 0.4) / 0.25, 0.0), 1.0) for u in ts]
        bend = [w * w * (3 - 2 * w) for w in bend]
        add(arm, m['shell'], {f'upper_arm.{sfx}': [1 - w for w in bend], f'forearm.{sfx}': bend})
        add(kit.superellipsoid(f'Hand.{sfx}', hand['radii'], hand['e'], hand['e'], seg=(20, 14),
                               location=g(hand['center'])), m['shell'], f'hand.{sfx}')

    return looks.finish(kit.armature('SlinkyRig', rig_bones()), parts, skin, m)
