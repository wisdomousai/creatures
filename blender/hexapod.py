"""Scuttle, the crew's robot hexapod: a round dome of a body with one big round eye-screen, a
beacon on a stalk, riding on six long jointed legs in a tripod gait. A toy walker, not a spider:
the legs are chunky tubes with ball knees, each knee with a lit pip (Dot0..Dot5), and the dome
sits on a flat belly plate.

Bones: `body` is the belly plate (the six legs hang off it, `leg.L.0`, `foot.L.0` ... front to
back, left and right), `head` is the dome with the eye, and `antenna` the little stalk. The legs
splay out radially: the front pair forward, the middle pair out, the rear pair back. Faces -Y
like the rest of the crew; about 0.5 m to the top of the beacon.
"""

import math

from mathutils import Vector

import birdkit
import kit
import looks

FACE = 'hexapod'
PREVIEW = dict(lift=0.0, width=0.75)

# Azimuths of the three left legs, front to back, from +X toward the front (degrees).
AZ = (52, 6, -42)
D = {
    'belly': dict(radii=(0.18, 0.18, 0.03), z=0.2),
    'dome': dict(radii=(0.2, 0.2, 0.15), z=0.285, cut=-0.07),
    # square: the eye-screen is round
    'screen': dict(radii=(0.108, 0.03, 0.108), center=(0, -0.172, 0.305), bezel=0.009),
    'antenna': dict(base=(0, 0.02, 0.43), mid=(0, 0.0, 0.48), tip=(0, -0.01, 0.53), bulb=0.024),
    'hip': dict(r=0.16, z=0.235),
    'knee': dict(r=0.27, z=0.37),
    'foot': dict(r=0.33, z=0.0),
    'leg_r': 0.019,
}


def out_dir(side, k):
    a = math.radians(AZ[k])
    return (side * math.cos(a), -math.sin(a))


def leg_pts(side, k):
    ux, uy = out_dir(side, k)
    hip, knee, foot = D['hip'], D['knee'], D['foot']
    p = lambda r, z: (ux * r, uy * r, z)  # noqa: E731
    return p(hip['r'], hip['z']), p(knee['r'], knee['z']), p(foot['r'], foot['z'] + 0.03)


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.06), None),
        ('body', (0, 0, 0.2), (0, 0, 0.26), 'root'),
        ('head', (0, 0, 0.26), (0, 0, 0.45), 'body'),
        ('antenna', D['antenna']['base'], D['antenna']['mid'], 'head'),
        ('antenna.2', D['antenna']['mid'], D['antenna']['tip'], 'antenna'),
    ]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k in range(3):
            h, kn, ft = leg_pts(side, k)
            bones += [(f'leg.{sfx}.{k}', h, kn, 'body'), (f'foot.{sfx}.{k}', kn, ft, f'leg.{sfx}.{k}')]
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The belly plate and a dome with a flat underside.
    b, d = D['belly'], D['dome']
    add(kit.superellipsoid('Belly', b['radii'], 0.35, 0.9, seg=(48, 12), location=(0, 0, b['z'])), m['joint'],
        'body')
    dome = kit.superellipsoid('Dome', d['radii'], 0.75, 0.9, seg=(56, 36), location=(0, 0, d['z']))
    kit.cut(dome, (0, 0, 1), d['cut'])
    add(dome, m['shell'], 'head')
    add(kit.torus('DomeBand', 0.196, 0.0075, seg=(48, 8), location=(0, 0, 0.235)), m['bezel'], 'head')
    for i in range(4):
        a = math.pi / 4 + math.pi / 2 * i
        add(kit.superellipsoid(f'DomeBolt.{i}', (0.0085, 0.0085, 0.005), 0.4, 1.0, seg=(10, 6),
                               location=(0.19 * math.cos(a), 0.19 * math.sin(a), 0.243),
                               rotation=(0, 0, a)), m['bezel'], 'head')
    for i in range(3):
        add(kit.superellipsoid(f'Vent.{i}', (0.035, 0.004, 0.006), 0.4, 0.6, seg=(12, 6),
                               location=(0, 0.198 - i * 0.0015, 0.31 + i * 0.022), rotation=(-0.25, 0, 0)),
            m['bezel'], 'head')

    # The eye: a big round screen in a thick bezel.
    sc = D['screen']
    glass, rim = kit.screen('Scuttle', sc['radii'], sc['center'], sc['bezel'], e=0.9)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    # The antenna: a stalk in two bones and a lit bulb.
    a = D['antenna']
    stalk, ts = kit.tube('Stalk', kit.spline([a['base'], a['mid'], a['tip']], 10), 0.006, ring=8)
    add(stalk, m['joint'], kit.chain(ts, ['antenna', 'antenna.2']))
    add(birdkit.ball('Bulb', (a['tip'][0], a['tip'][1], a['tip'][2] + 0.012), a['bulb']), m['beacon'], 'antenna.2')
    add(kit.superellipsoid('AntennaBase', (0.016, 0.016, 0.008), 0.4, 1.0, seg=(14, 6), location=(0, 0.02, 0.427)),
        m['bezel'], 'head')

    # The legs: a thigh up and out to a high knee, a shin down to a rubber foot.
    r = D['leg_r']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k in range(3):
            h, kn, ft = leg_pts(side, k)
            up, _ = kit.tube(f'Thigh.{sfx}.{k}', [h, kn], r, ring=10)
            add(up, m['role']('Leg', 'joint'), f'leg.{sfx}.{k}')
            lo, _ = kit.tube(f'Shin.{sfx}.{k}', [kn, ft], r * 0.85, ring=10)
            add(lo, m['role']('Leg', 'joint'), f'foot.{sfx}.{k}')
            add(birdkit.ball(f'HipBall.{sfx}.{k}', h, r * 1.9, seg=(14, 10)), m['shell'], 'body')
            add(birdkit.ball(f'Knee.{sfx}.{k}', kn, r * 1.55, seg=(14, 10)), m['shell'], f'foot.{sfx}.{k}')
            # A lit pip on top of the knee: the legs light one by one.
            idx = k + (0 if side > 0 else 3)
            add(kit.superellipsoid(f'KneeLamp.{sfx}.{k}', (0.012, 0.012, 0.006), 0.5, 1.0, seg=(12, 6),
                                   location=(kn[0], kn[1], kn[2] + r * 1.5)), m['dot'](idx), f'foot.{sfx}.{k}')
            add(birdkit.ball(f'Pad.{sfx}.{k}', ft, 0.03, seg=(16, 10)), m['bezel'], f'foot.{sfx}.{k}')

    return looks.finish(kit.armature('HexapodRig', rig_bones()), parts, skin, m)
