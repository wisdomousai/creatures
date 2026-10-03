"""Mica, the crew's robot starfish: a flat round hub with a screen face in the middle and five
chunky arms of three rounded segments each, standing upright facing us on its two lower arm
tips, one arm up. The arms are the signature (a coral shell in the colour look), and down the
front of every arm run three lit tube-feet studs (arm i lights Dot i, so a glow can run from
arm to arm); the hub wears a bezel ring and a few bolts and a small beacon sits on the tip
of the top arm.

Arm i points at 90 + 72 i degrees in the plane we look at (arm 0 up, 1 upper left, 2 lower
left, 3 lower right, 4 upper right), as arm.i.1 .. arm.i.3 off the 'body' bone at the hub's
middle. Faces -Y like the rest of the crew; about 0.33 m tall and 0.33 m wide, standing on
the tips of arms 2 and 3.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'starfish'
PREVIEW = dict(lift=0.0, width=0.36)

CZ = 0.152  # hub centre height
HUB = 0.07
RADII = (0.052, 0.103, 0.138, 0.174)  # where each segment of an arm starts and ends, from the hub's middle
WIDE = (0.04, 0.031, 0.023)  # half widths of the three segments
DEEP = (0.03, 0.026, 0.021)
ARMS = 5


def angle(i):
    return math.radians(90 + 72 * i)


def at(i, r, y=0.0):
    a = angle(i)
    return Vector((r * math.cos(a), y, CZ + r * math.sin(a)))


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, CZ - 0.02), (0, 0, CZ + 0.02), 'root'),
        ('face', (0, -0.04, CZ), (0, -0.09, CZ), 'body'),
    ]
    for i in range(ARMS):
        for k in range(3):
            bones.append((f'arm.{i}.{k + 1}', at(i, RADII[k]), at(i, RADII[k + 1]),
                          'body' if k == 0 else f'arm.{i}.{k}'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    arm = m['role']('Arm')
    joint = m['joint']

    # The hub: a thick round disc, a bezel ring round the face, four bolts.
    add(seakit.pod('Hub', (0, 0, CZ), (HUB, 0.046, HUB), (0.9, 0.9), seg=(36, 20)), arm, 'body')
    add(seakit.ring_on('HubRing', (0, -0.04, CZ), (0, -1, 0), 0.06, 0.006), m['bezel'], 'body')
    for k in range(4):
        a = math.radians(45 + 90 * k)
        add(seakit.flat_on(f'Bolt{k}', (0.062 * math.cos(a), -0.035, CZ + 0.062 * math.sin(a)), (0, -1, 0),
                           (0.006, 0.006, 0.003)), joint, 'body')
    glass, rim = kit.screen('Starfish', (0.052, 0.014, 0.043), (0, -0.04, CZ), 0.006, e=0.45)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')

    for i in range(ARMS):
        for k in range(3):
            a, b = at(i, RADII[k]), at(i, RADII[k + 1])
            c = (a + b) / 2
            L = (b - a).length / 2
            bone = f'arm.{i}.{k + 1}'
            e = (0.8, 0.85) if k < 2 else (0.75, 0.8)
            add(seakit.pod(f'Seg{i}{k}', c, (WIDE[k], DEEP[k], L * 1.12), e, seg=(20, 12),
                           rotation=seakit.aim(a, b)), arm, bone)
            # A ball joint at each knuckle.
            if k > 0:
                add(seakit.pod(f'Knuckle{i}{k}', a, (WIDE[k - 1] * 0.55,) * 3, (0.9, 0.9), seg=(14, 10)),
                    joint, bone)
            # A tube-foot stud on the front of each segment.
            add(seakit.flat_on(f'Stud{i}{k}', c + Vector((0, -DEEP[k] * 0.93, 0)), (0, -1, 0),
                               (WIDE[k] * 0.36, WIDE[k] * 0.36, 0.006), seg=14), m['dot'](i), bone)
    # The beacon on the tip of the top arm.
    add(seakit.pod('Beacon', at(0, RADII[3] - 0.004), (0.014, 0.014, 0.014), (0.9, 0.9), seg=(14, 10)),
        m['beacon'], 'arm.0.3')

    return looks.finish(kit.armature('StarfishRig', rig_bones()), parts, skin, m)
