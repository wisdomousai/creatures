"""Tuck, the crew's robot hermit crab: nothing like Clack's wide flat shell. A small round-backed
body low to the floor (a thorax with a screen face set into its front, two stubby antennae
with lit tips, a soft curled abdomen behind it, four short legs) and two unequal claws, one
big and one tiny, on two-part arms with lit fingertips (Dot0). Its back half sits in a tall
spiral shell house on a bone of its own (house) that is not the body's: a stack of four
shrinking whorls with ridge rings, a lit round window each side (Dot2), a beacon on the tip, and
a dark opening with a lip at the front for the body to back into. So the body (body) can walk
out of the shell and the shell stays; back in, only the screen shows in the opening.

Three other houses wait on bones of their own (tryon.cup, tryon.nut, tryon.cap): an upside-down
mug, a hex bolt nut and a bottle cap, each sized to wear on the back, for it to try on.
Faces -Y like the rest of the crew; about 0.34 m tall with the shell and 0.45 m long with the
claws, and it stands on the floor: its origin is under the middle of the shell.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'hermitcrab'
PREVIEW = dict(lift=0.0, width=0.5)

SHELL_C = Vector((0, 0.1, 0.1))
WHORLS = [((0, 0.1, 0.115), (0.105, 0.115, 0.1)), ((0, 0.115, 0.2), (0.08, 0.085, 0.075)),
          ((0, 0.125, 0.268), (0.056, 0.058, 0.052)), ((0, 0.13, 0.315), (0.034, 0.034, 0.032))]
SCREEN = dict(c=(0, -0.118, 0.095), r=(0.056, 0.017, 0.036), bezel=0.006)
LEGS = (-0.045, 0.0)
CLAWS = {'L': dict(s=1, k=1.0), 'R': dict(s=-1, k=0.62)}


def rig_bones():
    v = Vector
    sc = v(SCREEN['c'])
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('house', SHELL_C, SHELL_C + v((0, 0, 0.1)), 'root'),
        ('body', (0, -0.05, 0.08), (0, -0.05, 0.13), 'root'),
        ('face', sc, sc + v((0, -0.05, 0)), 'body'),
        ('ant.L', (0.03, -0.09, 0.125), (0.036, -0.105, 0.18), 'body'),
        ('ant.R', (-0.03, -0.09, 0.125), (-0.036, -0.105, 0.18), 'body'),
    ]
    for name in ('cup', 'nut', 'cap'):
        bones.append((f'tryon.{name}', SHELL_C, SHELL_C + v((0, 0, 0.05)), 'root'))
    for sfx, c in CLAWS.items():
        s, k = c['s'], c['k']
        a = v((s * 0.07, -0.085, 0.07))
        e = v((s * (0.07 + 0.045 * k), -0.085 - 0.04 * k, 0.07 + 0.02 * k))
        h = v((s * (0.07 + 0.055 * k), -0.085 - 0.07 * k, 0.07 + 0.03 * k))
        bones += [
            (f'arm.{sfx}.1', a, e, 'body'),
            (f'arm.{sfx}.2', e, h + v((0, 0.02 * k, 0)), f'arm.{sfx}.1'),
            (f'claw.{sfx}', h + v((0, 0.015 * k, 0)), h + v((0, -0.04 * k, 0)), f'arm.{sfx}.2'),
            (f'jaw.{sfx}', h + v((0, -0.03 * k, 0.015 * k)), h + v((0, -0.09 * k, 0.02 * k)), f'claw.{sfx}'),
        ]
        for i, y in enumerate(LEGS):
            hip = v((s * 0.06, y, 0.07))
            knee = v((s * 0.11, y, 0.095))
            foot = v((s * 0.14, y - 0.01, 0.0))
            bones += [(f'hip.{sfx}{i + 1}', hip, knee, 'body'), (f'shin.{sfx}{i + 1}', knee, foot, f'hip.{sfx}{i + 1}')]
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    spiral = m['role']('Spiral')
    lip = m['role']('Lip', 'joint')
    soft = m['role']('Soft', 'joint')
    claw_m = m['role']('Claw')
    leg = m['role']('Leg', 'joint')

    # The house: four whorls, ridge rings, a window each side, a beacon on the tip, a lipped opening.
    for i, (c, r) in enumerate(WHORLS):
        add(seakit.pod(f'Whorl{i}', c, r, (0.9, 0.92), seg=(28, 16)), spiral, 'house')
        add(kit.torus(f'Ridge{i}', r[0] * 0.99, 0.0075, seg=(36, 8), location=(c[0], c[1] + 0.003, c[2] + r[2] * 0.15),
                      rotation=(math.radians(14), 0, 0)), lip, 'house')
    add(seakit.pod('Spine', (0, 0.128, 0.335), (0.014, 0.014, 0.012), (0.9, 0.9), seg=(12, 8)), m['beacon'], 'house')
    add(kit.torus('Lip', 0.083, 0.0145, seg=(40, 10), location=(0, -0.005, 0.1), rotation=(math.pi / 2, 0, 0)), lip,
        'house')
    add(seakit.pod('Opening', (0, 0.012, 0.1), (0.08, 0.016, 0.08), (0.9, 0.9), seg=(30, 10)), m['bezel'], 'house')
    for sfx, s in (('L', 1), ('R', -1)):
        add(seakit.flat_on(f'Window{sfx}', (s * 0.1, 0.1, 0.135), (s, 0, 0.1), (0.026, 0.026, 0.01), seg=18), m['dot'](2),
            'house')
        add(kit.torus(f'Frame{sfx}', 0.028, 0.0065, seg=(24, 8), location=(s * 0.1, 0.1, 0.135),
                      rotation=(0, s * math.radians(84), 0)), m['bezel'], 'house')

    # The body: thorax, a soft curled abdomen behind, the screen face, antennae.
    add(seakit.pod('Thorax', (0, -0.06, 0.085), (0.075, 0.075, 0.058), (0.65, 0.8), seg=(32, 20)), m['shell'], 'body')
    add(seakit.pod('Seam', (0, -0.04, 0.088), (0.077, 0.004, 0.06), (0.65, 0.9), seg=(30, 8)), m['bezel'], 'body')
    add(seakit.pod('Abdomen0', (0, -0.005, 0.088), (0.05, 0.04, 0.045), (0.8, 0.8), seg=(20, 12)), soft, 'body')
    add(seakit.pod('Abdomen1', (0, 0.04, 0.094), (0.044, 0.04, 0.042), (0.8, 0.8), seg=(20, 12)), soft, 'body')
    sc = SCREEN
    glass, rim = kit.screen('Hermit', sc['r'], sc['c'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')
    for sfx, s in (('L', 1), ('R', -1)):
        add(seakit.bar(f'Stalk{sfx}', (s * 0.03, -0.09, 0.125), (s * 0.036, -0.105, 0.175), 0.0075), m['joint'], f'ant.{sfx}')
        add(seakit.pod(f'Bead{sfx}', (s * 0.036, -0.105, 0.183), (0.013, 0.013, 0.013), (0.9, 0.9), seg=(14, 10)),
            m['dot'](1), f'ant.{sfx}')

    # Claws: a big one and a tiny one.
    for sfx, c in CLAWS.items():
        s, k = c['s'], c['k']
        a = Vector((s * 0.07, -0.085, 0.07))
        e = Vector((s * (0.07 + 0.045 * k), -0.085 - 0.04 * k, 0.07 + 0.02 * k))
        h = Vector((s * (0.07 + 0.055 * k), -0.085 - 0.07 * k, 0.07 + 0.03 * k))
        add(seakit.pod(f'Shoulder{sfx}', a, (0.02 * k + 0.008,) * 3, (0.8, 0.8), seg=(14, 8)), m['bezel'], 'body')
        add(seakit.bar(f'Arm{sfx}1', a, e, 0.0135 * k + 0.004), claw_m, f'arm.{sfx}.1')
        add(seakit.pod(f'Elbow{sfx}', e, (0.016 * k + 0.006,) * 3, (0.8, 0.8), seg=(14, 8)), m['bezel'], f'arm.{sfx}.1')
        add(seakit.bar(f'Arm{sfx}2', e, h + Vector((0, 0.02 * k, 0)), 0.012 * k + 0.004), claw_m, f'arm.{sfx}.2')
        add(seakit.pod(f'Palm{sfx}', h, (0.04 * k, 0.045 * k, 0.036 * k), (0.7, 0.8), seg=(20, 14)), claw_m, f'claw.{sfx}')
        f0, f1 = h + Vector((0, -0.035 * k, -0.014 * k)), h + Vector((0, -0.09 * k, -0.02 * k))
        add(seakit.bar(f'Finger{sfx}', f0, f1, 0.0145 * k + 0.002), claw_m, f'claw.{sfx}')
        add(seakit.pod(f'FingerTip{sfx}', f1, (0.009 * k + 0.003,) * 3, (0.9, 0.9), seg=(12, 8)), m['dot'](0), f'claw.{sfx}')
        j0, j1 = h + Vector((0, -0.03 * k, 0.018 * k)), h + Vector((0, -0.09 * k, 0.03 * k))
        add(seakit.bar(f'Jaw{sfx}', j0, j1, 0.0145 * k + 0.002), claw_m, f'jaw.{sfx}')
        add(seakit.pod(f'JawTip{sfx}', j1, (0.009 * k + 0.003,) * 3, (0.9, 0.9), seg=(12, 8)), m['dot'](0), f'jaw.{sfx}')
        for i, y in enumerate(LEGS):
            hip = Vector((s * 0.06, y, 0.07))
            knee = Vector((s * 0.11, y, 0.095))
            foot = Vector((s * 0.14, y - 0.01, 0.006))
            add(seakit.bar(f'Hip{sfx}{i}', hip, knee, 0.0125), leg, f'hip.{sfx}{i + 1}')
            add(seakit.pod(f'Knee{sfx}{i}', knee, (0.014,) * 3, (0.8, 0.8), seg=(12, 8)), m['bezel'], f'hip.{sfx}{i + 1}')
            add(seakit.bar(f'Shin{sfx}{i}', knee, foot, 0.011), leg, f'shin.{sfx}{i + 1}')
            add(seakit.pod(f'Foot{sfx}{i}', foot, (0.012, 0.012, 0.007), (0.8, 0.8), seg=(12, 8)), m['bezel'],
                f'shin.{sfx}{i + 1}')

    # Other houses to try on, each sized to sit where the shell does.
    c = SHELL_C
    steel = m['role']('Steel', 'joint')
    add(seakit.pod('Cup', c + Vector((0, 0.0, 0.03)), (0.075, 0.075, 0.085), (0.5, 0.8), seg=(28, 16)), m['role']('Mug'),
        'tryon.cup')
    add(kit.torus('CupHandle', 0.032, 0.0095, seg=(24, 8), location=c + Vector((0.08, 0, 0.03)),
                  rotation=(math.pi / 2, 0, 0)), m['role']('Mug'), 'tryon.cup')
    add(kit.torus('CupRim', 0.072, 0.008, seg=(32, 8), location=c + Vector((0, 0, -0.052))), m['bezel'], 'tryon.cup')
    add(seakit.pod('Nut', c, (0.082, 0.082, 0.055), (0.3, 0.45), seg=(6, 8)), steel, 'tryon.nut')
    add(kit.torus('NutHole', 0.034, 0.012, seg=(24, 8), location=c + Vector((0, 0, 0.05))), m['bezel'], 'tryon.nut')
    add(seakit.pod('Cap', c, (0.09, 0.09, 0.05), (0.45, 0.45), seg=(32, 12)), m['role']('Cap'), 'tryon.cap')
    for i in range(10):
        a = 2 * math.pi * i / 10
        add(seakit.pod(f'CapRib{i}', (c.x + 0.09 * math.cos(a), c.y + 0.09 * math.sin(a), c.z), (0.011, 0.011, 0.04),
                       (0.8, 0.8), seg=(8, 6)), m['bezel'], 'tryon.cap')

    return looks.finish(kit.armature('HermitRig', rig_bones()), parts, skin, m)
