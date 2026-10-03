"""Clack, the crew's robot crab: a wide flat shell of a body on six jointed legs (three a
side, a hip and a shin each), two big claws on two-part arms (a round palm with a fixed
finger and a hinged jaw, both fingertips lit, Dot0), and a wide visor held up above the front
of the shell on two short stalks: the screen face, its eyes at the ends. Three little lamps in
a row on the back (Dot1 .. Dot3) and a beacon knob between them.

A heap of sand waits on a bone of its own (mound), for the site to pile round the body when
it digs in, and to put away again. Faces -Y like the rest of the crew; about 0.24 m tall and
0.56 m wide, and it stands on the floor: its origin is under the middle of the shell.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'crab'
PREVIEW = dict(lift=0.0, width=0.6)

BODY = dict(c=(0, 0.01, 0.082), r=(0.15, 0.108, 0.064), e=(0.6, 0.8))
VISOR = dict(r=(0.1, 0.014, 0.037), c=(0, -0.078, 0.205), bezel=0.006)
HIPS = (0.065, 0.022, -0.02)  # where each leg leaves the side, front to back (y)
HAND = (0.2, -0.2, 0.125)  # the palm's centre (x mirrored)


def rig_bones():
    v = Vector
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('body', (0, 0.01, 0.075), (0, 0.01, 0.12), 'root'),
        ('face', (0, -0.06, 0.15), (0, -0.06, 0.2), 'body'),
        ('mound', (0, 0, 0), (0, 0, 0.05), 'root'),
    ]
    for sfx, s in (('L', 1), ('R', -1)):
        a = v((s * 0.12, -0.06, 0.085))
        b = v((s * 0.185, -0.1, 0.115))
        h = v((s * HAND[0], HAND[1], HAND[2]))
        bones += [
            (f'arm.{sfx}.1', a, b, 'body'),
            (f'arm.{sfx}.2', b, h + v((0, 0.04, 0)), f'arm.{sfx}.1'),
            (f'claw.{sfx}', h + v((0, 0.03, 0)), h + v((0, -0.04, 0)), f'arm.{sfx}.2'),
            (f'jaw.{sfx}', h + v((0, -0.035, 0.022)), h + v((0, -0.11, 0.03)), f'claw.{sfx}'),
        ]
        for i, y in enumerate(HIPS):
            hip = v((s * 0.115, y, 0.075))
            knee = v((s * 0.2, y - 0.012, 0.125))
            foot = v((s * 0.275, y - 0.02, 0.0))
            bones += [
                (f'hip.{sfx}{i + 1}', hip, knee, 'body'),
                (f'shin.{sfx}{i + 1}', knee, foot, f'hip.{sfx}{i + 1}'),
            ]
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    leg = m['role']('Leg', 'joint')
    claw = m['role']('Claw')

    # The shell, with a darker skirt round its rim and a panel seam across the back.
    b = BODY
    add(seakit.pod('Shell', b['c'], b['r'], b['e'], seg=(40, 24)), m['shell'], 'body')
    add(seakit.pod('Skirt', (b['c'][0], b['c'][1], b['c'][2] - 0.012), (b['r'][0] * 1.02, b['r'][1] * 1.02, 0.014),
                   (0.55, 0.8), seg=(40, 8)), m['bezel'], 'body')
    add(seakit.pod('Seam', (0, b['c'][1] + 0.025, b['c'][2] + 0.002), (b['r'][0] * 0.97, 0.004, b['r'][2] * 1.0),
                   (0.6, 0.9), seg=(36, 8)), m['bezel'], 'body')
    for i, x in enumerate((-0.07, 0.0, 0.07)):
        add(seakit.pod(f'Lamp{i}', (x, 0.075, 0.118 - 0.006 * abs(x) * 10), (0.011, 0.011, 0.011), (0.9, 0.9), seg=(12, 8)),
            m['dot'](1 + i), 'body')
    add(seakit.pod('Beacon', (0, 0.03, 0.127), (0.0125, 0.0125, 0.0125), (0.9, 0.9), seg=(14, 10)), m['beacon'], 'body')

    # The visor and its stalks.
    v = VISOR
    glass, rim = kit.screen('Crab', v['r'], v['c'], v['bezel'], e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')
    for sfx, s in (('L', 1), ('R', -1)):
        add(seakit.bar(f'Stalk{sfx}', (s * 0.075, -0.035, 0.105), (s * 0.075, -0.07, 0.178), 0.0105), m['joint'], 'face')
        add(seakit.pod(f'Knob{sfx}', (s * 0.075, -0.07, 0.178), (0.0165, 0.0165, 0.0125), (0.8, 0.8), seg=(14, 8)),
            m['bezel'], 'face')

    # Claws: a ball at the shoulder, an arm in two parts, a round palm with a fixed finger
    # and a hinged jaw, both tips lit.
    for sfx, s in (('L', 1), ('R', -1)):
        a = Vector((s * 0.12, -0.06, 0.085))
        e = Vector((s * 0.185, -0.1, 0.115))
        h = Vector((s * HAND[0], HAND[1], HAND[2]))
        add(seakit.pod(f'Shoulder{sfx}', a, (0.026, 0.026, 0.026), (0.8, 0.8), seg=(16, 10)), m['bezel'], 'body')
        add(seakit.bar(f'Arm{sfx}1', a, e, 0.0185), claw, f'arm.{sfx}.1')
        add(seakit.pod(f'Elbow{sfx}', e, (0.022, 0.022, 0.022), (0.8, 0.8), seg=(16, 10)), m['bezel'], f'arm.{sfx}.1')
        add(seakit.bar(f'Arm{sfx}2', e, h + Vector((0, 0.035, 0)), 0.0165), claw, f'arm.{sfx}.2')
        add(seakit.pod(f'Palm{sfx}', h, (0.056, 0.064, 0.05), (0.7, 0.8), seg=(24, 16)), claw, f'claw.{sfx}')
        # fixed finger (lower), jaw (upper)
        f0, f1 = h + Vector((0, -0.04, -0.02)), h + Vector((0, -0.12, -0.03))
        add(seakit.bar(f'Finger{sfx}', f0, f1, 0.0195), claw, f'claw.{sfx}')
        add(seakit.pod(f'FingerTip{sfx}', f1 + Vector((0, -0.005, 0)), (0.011, 0.012, 0.011), (0.9, 0.9), seg=(12, 8)),
            m['dot'](0), f'claw.{sfx}')
        j0, j1 = h + Vector((0, -0.035, 0.026)), h + Vector((0, -0.115, 0.05))
        add(seakit.bar(f'Jaw{sfx}', j0, j1, 0.0195), claw, f'jaw.{sfx}')
        add(seakit.pod(f'JawTip{sfx}', j1 + Vector((0, -0.005, 0)), (0.011, 0.012, 0.011), (0.9, 0.9), seg=(12, 8)),
            m['dot'](0), f'jaw.{sfx}')
        add(seakit.pod(f'Hinge{sfx}', h + Vector((0, -0.032, 0.006)), (0.014, 0.018, 0.014), (0.8, 0.8), seg=(12, 8)),
            m['bezel'], f'claw.{sfx}')

        # Legs: a hip ball, an upper leg up and out, a knee, a shin down to the floor.
        for i, y in enumerate(HIPS):
            hip = Vector((s * 0.115, y, 0.075))
            knee = Vector((s * 0.2, y - 0.012, 0.125))
            foot = Vector((s * 0.275, y - 0.02, 0.006))
            add(seakit.bar(f'Hip{sfx}{i}', hip, knee, 0.0175), leg, f'hip.{sfx}{i + 1}')
            add(seakit.pod(f'Knee{sfx}{i}', knee, (0.0155, 0.0155, 0.0155), (0.8, 0.8), seg=(12, 8)), m['bezel'],
                f'hip.{sfx}{i + 1}')
            add(seakit.bar(f'Shin{sfx}{i}', knee, foot, 0.0145), leg, f'shin.{sfx}{i + 1}')
            add(seakit.pod(f'Foot{sfx}{i}', foot, (0.0135, 0.0135, 0.008), (0.8, 0.8), seg=(12, 8)), m['bezel'],
                f'shin.{sfx}{i + 1}')

    # The sand that heaps round it when it digs in: a big low dome and a few lumps.
    sand = m['role']('Sand', 'joint')
    add(seakit.pod('Mound', (0, 0.0, 0.0), (0.21, 0.15, 0.1), (0.8, 0.8), seg=(28, 14)), sand, 'mound')
    for i, (x, y, r) in enumerate(((-0.14, -0.07, 0.04), (0.13, -0.09, 0.045), (0.02, 0.12, 0.05), (-0.1, 0.1, 0.035))):
        add(seakit.pod(f'Lump{i}', (x, y, 0.0), (r, r, r * 0.9), (0.8, 0.8), seg=(16, 10)), sand, 'mound')

    return looks.finish(kit.armature('CrabRig', rig_bones()), parts, skin, m)
