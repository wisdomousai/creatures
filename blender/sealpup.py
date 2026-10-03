"""Plop, the crew's robot harbour seal pup: a round grey sausage of a body lying propped up on
its front flippers, with lit spots down its back (Dot1, Dot2), a big round head with one
big screen of a dark-eyed face, a pale muzzle with a dark nose and three lit whisker rods a
side (Dot0 at their tips), a pale belly, two paddle front flippers (flipper.L/R), two hind
flippers pressed together behind (hind.L/R) and a small beacon on its crown.

A lit ball waits on a bone of its own (ball, child of the head), for the pup to balance on its
nose; the site stretches it to nothing until a trick needs it (Dot4 lights it).

Faces -Y; about 0.22 m tall and 0.3 m long; lies on its belly.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'sealpup'
PREVIEW = dict(lift=0.0, width=0.34)

SIDES = (('L', 1), ('R', -1))
HEAD = Vector((0, -0.05, 0.13))
BALL = Vector((0, -0.155, 0.1))
WHISKERS = ((0.092, -0.145, 0.11), (0.1, -0.15, 0.095), (0.092, -0.145, 0.08))


def rig_bones():
    v = Vector
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.15, 0.07), (0, -0.02, 0.085), 'root'),
        ('head', HEAD + v((0, 0, -0.04)), HEAD + v((0, 0, 0.05)), 'body'),
        ('face', (0, -0.1, 0.145), (0, -0.15, 0.145), 'head'),
        ('ball', BALL, BALL + v((0, 0, 0.03)), 'head'),
    ]
    for sfx, s in SIDES:
        bones += [
            (f'flipper.{sfx}', v((s * 0.075, -0.035, 0.05)), v((s * 0.14, -0.085, 0.015)), 'body'),
            (f'hind.{sfx}', v((s * 0.025, 0.2, 0.04)), v((s * 0.06, 0.28, 0.025)), 'body'),
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

    fur = m['shell']
    belly = m['role']('Belly')
    flip = m['role']('Flipper', 'joint')
    pale = m['role']('Whisker')

    # The body: a plump sausage tipped up at the front, a pale belly under it.
    add(seakit.pod('Body', (0, 0.07, 0.072), (0.088, 0.17, 0.08), (0.85, 0.9), seg=(36, 22),
                   rotation=(math.radians(-6), 0, 0), taper=0.0), fur, 'body')
    add(seakit.pod('Belly', (0, 0.05, 0.04), (0.075, 0.15, 0.04), (0.85, 0.9), seg=(32, 14)), belly, 'body')
    add(kit.torus('Seam', 0.083, 0.004, seg=(32, 8), location=(0, 0.0, 0.074), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'body')
    # Lit spots down the back.
    for i, (y, z, d) in enumerate(((0.08, 0.147, 1), (0.14, 0.14, 2), (0.2, 0.125, 1), (0.04, 0.152, 2))):
        add(seakit.pod(f'Spot{i}', (0.025 * (-1) ** i, y, z), (0.013, 0.013, 0.007), (0.9, 0.9), seg=(12, 8)),
            m['dot'](d), 'body')

    # The head, the big face, the muzzle, the whiskers.
    add(seakit.pod('Head', HEAD, (0.1, 0.088, 0.086), (0.85, 0.9), seg=(36, 22)), fur, 'head')
    glass, rim = kit.screen('Sealpup', (0.076, 0.014, 0.056), (0, -0.124, 0.146), 0.006, e=0.45)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')
    add(seakit.pod('Muzzle', (0, -0.128, 0.074), (0.044, 0.032, 0.026), (0.8, 0.85), seg=(24, 14)), pale, 'head')
    add(seakit.pod('Nose', (0, -0.157, 0.088), (0.016, 0.01, 0.011), (0.8, 0.8), seg=(14, 8)), m['bezel'], 'head')
    for sfx, s in SIDES:
        for i, w in enumerate(WHISKERS):
            a = Vector((s * 0.035, -0.15, w[2] - 0.016))
            b = Vector((s * w[0], w[1], w[2] - 0.012))
            add(seakit.bar(f'Whisker{sfx}{i}', a, b, 0.0045, e=(0.9, 0.9)), pale, 'head')
            add(seakit.pod(f'Tip{sfx}{i}', b, (0.0085, 0.0085, 0.0085), (0.9, 0.9), seg=(12, 8)), m['dot'](0), 'head')
    add(seakit.pod('Beacon', (0, -0.03, 0.218), (0.012, 0.012, 0.012), (0.9, 0.9), seg=(14, 10)), m['beacon'], 'head')

    # The flippers: front paddles out to the sides, hind ones together behind.
    for sfx, s in SIDES:
        add(seakit.pod(f'Hub{sfx}', (s * 0.075, -0.035, 0.05), (0.02, 0.02, 0.02), (0.8, 0.8), seg=(14, 10)),
            m['bezel'], f'flipper.{sfx}')
        add(seakit.fan(f'Flipper{sfx}', (s * 0.075, -0.035, 0.05), (s * 1.0, -0.6, -0.3), (0.034, 0.011, 0.06),
                       (0, 0, 1)), flip, f'flipper.{sfx}')
        add(seakit.fan(f'Hind{sfx}', (s * 0.025, 0.2, 0.045), (s * 0.45, 1, -0.05), (0.036, 0.01, 0.055),
                       (0, 0, 1)), flip, f'hind.{sfx}')

    # The ball: lit, with a dark band round it.
    add(seakit.pod('Ball', BALL + Vector((0, 0, 0.035)), (0.04, 0.04, 0.04), (0.95, 0.95), seg=(24, 16)),
        m['dot'](4), 'ball')
    add(kit.torus('BallBand', 0.041, 0.004, seg=(28, 8), location=BALL + Vector((0, 0, 0.035))), m['bezel'], 'ball')

    return looks.finish(kit.armature('SealpupRig', rig_bones()), parts, skin, m)
