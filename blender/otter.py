"""Pebble, the crew's robot sea otter, floating on its back, seen from the side: a long plump
body of three chunky pods (chest, belly, hips) with a cream belly plate on top, two lit
lamps on it (Dot0, Dot1), a round head at the front end with a screen face looking toward
us, a cream muzzle, two ears and a beacon between them, two arms of two bones each folded
over the chest (near, far), two webbed hind feet and a flat tail at the other end. Head to
the right (+X), belly up (+Z): it floats, its origin under the middle of its back.

Three things wait on bones of their own, for the site to bring out for a trick and put away
again: a stone (child of the near forearm, so it goes where the paws go, a lit gem in it:
Dot4), a clam with a hinged lid on the belly (shell, shell.lid; a lit pearl inside, Dot3),
and a strand of kelp of eight ribbon bones (kelp.1 .. kelp.8) that wraps round the body
when each bone is turned about 45 degrees. Faces -Y (the screen looks at us) like the rest
of the crew; about 0.52 m long and 0.2 m tall.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'otter'
PREVIEW = dict(lift=0.04, width=0.56)

KELP_N = 8
KELP_LEN = 0.088
KELP_START = Vector((0.02, 0.0, 0.182))  # on top of the belly, laid across toward us


def kelp_points():
    return [KELP_START + Vector((0, -KELP_LEN * i, 0)) for i in range(KELP_N + 1)]


def rig_bones():
    v = Vector
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (-0.1, 0, 0.075), (0.1, 0, 0.075), 'root'),
        ('head', (0.2, 0, 0.1), (0.27, 0, 0.13), 'body'),
        ('face', (0.27, -0.06, 0.12), (0.27, -0.11, 0.12), 'head'),
        ('tail.1', (-0.19, 0, 0.065), (-0.26, 0, 0.07), 'body'),
        ('tail.2', (-0.26, 0, 0.07), (-0.32, 0, 0.09), 'tail.1'),
        ('shell', (0.0, 0, 0.16), (0.0, 0, 0.19), 'body'),
        ('shell.lid', (0.0, 0.03, 0.175), (0.0, -0.03, 0.175), 'shell'),
    ]
    for sfx, s in (('N', -1), ('F', 1)):
        sh = v((0.11, s * 0.05, 0.125))
        el = v((0.075, s * 0.078, 0.162))
        pw = v((0.03, s * 0.04, 0.19))
        bones += [
            (f'arm.{sfx}.1', sh, el, 'body'),
            (f'arm.{sfx}.2', el, pw, f'arm.{sfx}.1'),
            (f'foot.{sfx}', v((-0.15, s * 0.05, 0.06)), v((-0.27, s * 0.06, 0.11)), 'body'),
        ]
    bones.append(('stone', (0.03, -0.04, 0.2), (0.03, -0.04, 0.24), 'arm.N.2'))
    b, _ = seakit.chain('kelp', 'body', kelp_points())
    return bones + b


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    fur = m['shell']
    paw = m['role']('Paw', 'joint')
    cream = m['role']('Belly')

    # The body: three chunky pods end to end, a cream plate on top of the middle with a seam
    # round it and two lamps.
    add(seakit.pod('Chest', (0.1, 0, 0.078), (0.092, 0.08, 0.075), (0.8, 0.85), seg=(32, 20)), fur, 'body')
    add(seakit.pod('Belly', (0.0, 0, 0.074), (0.1, 0.082, 0.077), (0.8, 0.85), seg=(32, 20)), fur, 'body')
    add(seakit.pod('Hips', (-0.1, 0, 0.068), (0.085, 0.074, 0.068), (0.8, 0.85), seg=(32, 20)), fur, 'body')
    add(seakit.pod('Seam', (0.03, 0, 0.116), (0.158, 0.064, 0.041), (0.6, 0.8), seg=(36, 12)), m['bezel'], 'body')
    add(seakit.pod('Plate', (0.03, 0, 0.126), (0.15, 0.058, 0.04), (0.6, 0.8), seg=(36, 12)), cream, 'body')
    for i, x in enumerate((-0.07, 0.11)):
        add(seakit.pod(f'Lamp{i}', (x, 0, 0.158), (0.0115, 0.0115, 0.007), (0.9, 0.9), seg=(12, 8)), m['dot'](i), 'body')
    # Fluff: a ruff round the neck.
    add(seakit.pod('Ruff', (0.19, 0, 0.1), (0.05, 0.062, 0.06), (0.8, 0.85), seg=(24, 14)), fur, 'body')

    # The head and its face.
    add(seakit.pod('Head', (0.27, 0, 0.12), (0.07, 0.066, 0.066), (0.85, 0.9), seg=(32, 20)), fur, 'head')
    glass, rim = kit.screen('Otter', (0.045, 0.014, 0.036), (0.268, -0.058, 0.128), 0.005, e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')
    add(seakit.pod('Muzzle', (0.3, -0.04, 0.092), (0.034, 0.03, 0.024), (0.8, 0.85), seg=(20, 12)), cream, 'head')
    add(seakit.pod('Nose', (0.325, -0.05, 0.1), (0.011, 0.009, 0.008), (0.8, 0.8), seg=(12, 8)), m['bezel'], 'head')
    for i, y in enumerate((-0.04, 0.04)):
        add(seakit.pod(f'Ear{i}', (0.235, y, 0.18), (0.017, 0.014, 0.017), (0.8, 0.8), seg=(14, 10)), paw, 'head')
    add(seakit.pod('Beacon', (0.245, 0, 0.19), (0.0125, 0.0125, 0.0125), (0.9, 0.9), seg=(14, 10)), m['beacon'], 'head')

    # Arms folded over the chest, each in two chunky parts with a round paw.
    for sfx, s in (('N', -1), ('F', 1)):
        sh = Vector((0.11, s * 0.05, 0.125))
        el = Vector((0.075, s * 0.078, 0.162))
        pw = Vector((0.03, s * 0.04, 0.19))
        add(seakit.pod(f'Shoulder{sfx}', sh, (0.03, 0.028, 0.03), (0.8, 0.8), seg=(16, 10)), fur, f'arm.{sfx}.1')
        add(seakit.bar(f'Upper{sfx}', sh, el, 0.024), fur, f'arm.{sfx}.1')
        add(seakit.pod(f'Elbow{sfx}', el, (0.026, 0.026, 0.026), (0.8, 0.8), seg=(16, 10)), fur, f'arm.{sfx}.2')
        add(seakit.bar(f'Fore{sfx}', el, pw, 0.021), fur, f'arm.{sfx}.2')
        add(seakit.pod(f'Paw{sfx}', pw, (0.03, 0.027, 0.027), (0.8, 0.8), seg=(18, 12)), paw, f'arm.{sfx}.2')
        # Hind foot: a hip, a flipper paddle.
        add(seakit.pod(f'Thigh{sfx}', (-0.15, s * 0.05, 0.062), (0.04, 0.032, 0.036), (0.8, 0.8), seg=(16, 10)), fur,
            f'foot.{sfx}')
        add(seakit.fan(f'Flipper{sfx}', (-0.17, s * 0.052, 0.07), (-1, s * 0.12, 0.45), (0.05, 0.012, 0.042), (0, 1, 0)),
            paw, f'foot.{sfx}')

    # The tail: two flat pods.
    add(seakit.pod('Tail1', (-0.225, 0, 0.068), (0.045, 0.03, 0.026), (0.8, 0.8), seg=(18, 10)), fur, 'tail.1')
    add(seakit.pod('Tail2', (-0.29, 0, 0.082), (0.04, 0.026, 0.021), (0.8, 0.8), seg=(18, 10)), paw, 'tail.2')

    # The clam on the belly: a hinged lid, a pearl inside.
    sh = m['role']('Shell')
    add(seakit.pod('Clam', (0.0, 0, 0.17), (0.045, 0.036, 0.016), (0.8, 0.9), seg=(20, 10)), sh, 'shell')
    add(seakit.pod('Pearl', (0.0, 0, 0.18), (0.011, 0.011, 0.011), (0.9, 0.9), seg=(12, 8)), m['dot'](3), 'shell')
    add(seakit.pod('Lid', (0.0, 0, 0.182), (0.047, 0.037, 0.017), (0.8, 0.9), seg=(20, 10)), sh, 'shell.lid')

    # The stone, held in the paws: a lump with a lit gem.
    stone = m['role']('Stone')
    add(seakit.pod('Stone', (0.03, -0.04, 0.228), (0.034, 0.028, 0.028), (0.75, 0.8), seg=(18, 12)), stone, 'stone')
    add(seakit.pod('Gem', (0.03, -0.068, 0.234), (0.01, 0.006, 0.01), (0.9, 0.9), seg=(12, 8)), m['dot'](4), 'stone')

    # The kelp: a ribbon of eight flat fans laid across the belly toward us; a darker midrib.
    kelp = m['role']('Kelp')
    pts = kelp_points()
    for i in range(KELP_N):
        a, b = pts[i], pts[i + 1]
        mid = a.lerp(b, 0.5)
        add(seakit.pod(f'Kelp{i}', mid, (0.035, 0.005, KELP_LEN * 0.56), (0.8, 0.9), seg=(14, 8),
                       rotation=seakit.aim(a, b)), kelp, f'kelp.{i + 1}')

    return looks.finish(kit.armature('OtterRig', rig_bones()), parts, skin, m)
