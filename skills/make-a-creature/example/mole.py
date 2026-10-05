"""Digby, a robot star-nosed mole: a plump body, a head with a screen face, a miner's lamp
on his forehead (the beacon), big pink digging paws, and on the end of his snout the
star: eight lit nubs in a ring (nub i lights Dot i, so a light can run round it).

Faces -Y like the rest of the crew, stands on z = 0, about 0.19 m tall. Bones: root, body,
head, nose, leg.FL/FR/BL/BR (the names trot() expects) and tail.

Copy this into blender/ and run `blender/build.sh mole`: it brings its own face layout
and colours, so nothing else in blender/ needs to change.
"""

import math

from mathutils import Vector

import faces
import kit
import looks
import seakit

FACE = 'mole'
PREVIEW = dict(lift=0.0, width=0.26)

# His screen's layout (the same numbers as MOLE_FACE in mole.ts) and his colours in the
# colour look (the same as PALETTES.mole). A creature in the crew keeps these in faces.py
# and src/palettes.json instead.
faces.LAYOUTS.setdefault(FACE, dict(size=(512, 312), eyes=((0.3, 0.45), (0.7, 0.45)), rx=0.09, ry=0.16,
                                    line=0.04, mouth=(0.5, 0.78)))
looks.PALETTES.setdefault(FACE, {
    'base': {'shell': '#5d4d45', 'joint': '#3b312c', 'bezel': '#2b2421'},
    'roles': {'Paw': '#f3a6a0', 'Snout': '#f3a6a0'},
    'dots': ['#7a3f45', '#ff9ec4'],
})

NUBS = 8
STAR = Vector((0, -0.172, 0.066))  # the middle of the star on the end of his snout


def rig_bones():
    """(name, head, tail, parent), parents first."""
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('body', (0, 0.03, 0.05), (0, 0.03, 0.12), 'root'),
        ('head', (0, -0.06, 0.09), (0, -0.06, 0.15), 'body'),
        ('nose', (0, -0.12, 0.078), tuple(STAR), 'head'),
        ('tail', (0, 0.14, 0.085), (0, 0.2, 0.07), 'body'),
    ]
    for side, x in (('L', 1), ('R', -1)):  # +X is his left
        bones.append((f'leg.F{side}', (0.05 * x, -0.06, 0.06), (0.07 * x, -0.09, 0.01), 'body'))
        bones.append((f'leg.B{side}', (0.05 * x, 0.09, 0.055), (0.055 * x, 0.095, 0.005), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    paw = m['role']('Paw')
    snout = m['role']('Snout')

    # Body, head and a short tail.
    add(seakit.pod('Body', (0, 0.03, 0.085), (0.08, 0.115, 0.07), (0.75, 0.85), seg=(36, 24)), m['shell'], 'body')
    add(seakit.pod('Head', (0, -0.075, 0.105), (0.062, 0.06, 0.055), (0.8, 0.85), seg=(32, 22)), m['shell'], 'head')
    add(seakit.bar('Tail', (0, 0.14, 0.085), (0, 0.2, 0.07), 0.009), m['shell'], 'tail')

    # A collar where the head turns on the body: the joint shows, as on every robot.
    add(seakit.ring_on('Collar', (0, -0.04, 0.1), (0, -1, 0.35), 0.052, 0.008), m['joint'], 'body')

    # The screen face, and the miner's lamp above it.
    glass, rim = kit.screen('Mole', (0.04, 0.012, 0.024), (0, -0.128, 0.122), 0.005, e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    add(seakit.pod('LampCup', (0, -0.1, 0.158), (0.017, 0.015, 0.011), (0.8, 0.8), seg=(18, 12)), m['joint'], 'head')
    add(seakit.pod('Beacon', (0, -0.112, 0.16), (0.011, 0.008, 0.011), (0.9, 0.9), seg=(16, 12)), m['beacon'], 'head')

    # The snout and its star: a pink tip ringed by eight lit nubs.
    add(seakit.bar('Snout', (0, -0.12, 0.08), (0, -0.165, 0.068), 0.016), snout, 'nose')
    add(seakit.pod('NoseTip', STAR, (0.011, 0.006, 0.011), (0.9, 0.9), seg=(16, 12)), snout, 'nose')
    for i in range(NUBS):
        a = math.radians(90 + 360 * i / NUBS)
        out = Vector((math.cos(a), 0, math.sin(a)))
        add(seakit.bar(f'Nub{i}', STAR + out * 0.009, STAR + out * 0.024, 0.0052), m['dot'](i), 'nose')

    for side, x in (('L', 1), ('R', -1)):
        # Front legs end in big digging paws with three claws each.
        add(seakit.bar(f'Arm{side}', (0.05 * x, -0.06, 0.06), (0.07 * x, -0.085, 0.018), 0.014), m['joint'],
            f'leg.F{side}')
        add(seakit.pod(f'Paw{side}', (0.075 * x, -0.095, 0.012), (0.028, 0.02, 0.011), (0.8, 0.9), seg=(20, 12)),
            paw, f'leg.F{side}')
        for k in range(3):
            dx = (k - 1) * 0.014
            add(seakit.bar(f'Claw{side}{k}', ((0.075 + dx) * x, -0.108, 0.01), ((0.078 + dx * 1.3) * x, -0.124, 0.006),
                           0.0042), m['joint'], f'leg.F{side}')
        # Back legs, on small flat feet.
        add(seakit.bar(f'Leg{side}', (0.05 * x, 0.09, 0.055), (0.055 * x, 0.1, 0.014), 0.013), m['joint'],
            f'leg.B{side}')
        add(seakit.pod(f'Foot{side}', (0.055 * x, 0.09, 0.009), (0.018, 0.026, 0.009), (0.8, 0.9), seg=(16, 10)),
            paw, f'leg.B{side}')

    return looks.finish(kit.armature('MoleRig', rig_bones()), parts, skin, m)
