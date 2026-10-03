"""Gilly, the crew's robot axolotl: a soft pink-white toy with a wide flat head (a wide screen
face with a big smile), three frilly gill stalks on each side of it (each two bones, ending in
a lit bulb: Dot0 lowest .. Dot2 highest, the same both sides, and a pink frill between them),
a plump short body with a lit stripe (Dot3) down the back, two little splayed hands, two hind
feet, a tail that curls out to her right and a small beacon on the crown between the gills.

Faces -Y; about 0.24 m tall and 0.34 m across with her gills spread; stands on her feet.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'axolotl'
PREVIEW = dict(lift=0.0, width=0.36)

HEAD = Vector((0, -0.03, 0.135))
SIDES = (('L', 1), ('R', -1))
# Gill stalks: angle above horizontal (degrees), a little back, length.
GILLS = ((8, 0.095), (38, 0.105), (68, 0.1))
TAIL = ((0, 0.1, 0.045), (0.035, 0.16, 0.035), (0.08, 0.21, 0.03), (0.13, 0.24, 0.026))


def gill_points(k, s):
    ang, length = GILLS[k]
    a = math.radians(ang)
    root = Vector((s * 0.088, -0.015, 0.13 + 0.02 * k))
    d = Vector((s * math.cos(a), 0.25, math.sin(a))).normalized()
    mid = root + d * length * 0.5
    tip = mid + (d + Vector((s * 0.15, 0, 0.3 * (k + 1) / 3))).normalized() * length * 0.55
    return root, mid, tip


def rig_bones():
    v = Vector
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.06, 0.05), (0, 0.0, 0.08), 'root'),
        ('head', HEAD + v((0, 0, -0.03)), HEAD + v((0, 0, 0.04)), 'body'),
        ('face', (0, -0.09, 0.14), (0, -0.14, 0.14), 'head'),
    ]
    for sfx, s in SIDES:
        for k in range(3):
            r, m, t = gill_points(k, s)
            bones += [(f'gill.{sfx}{k}.1', r, m, 'head'), (f'gill.{sfx}{k}.2', m, t, f'gill.{sfx}{k}.1')]
        bones += [
            (f'arm.{sfx}', v((s * 0.06, -0.04, 0.055)), v((s * 0.115, -0.07, 0.03)), 'body'),
            (f'leg.{sfx}', v((s * 0.06, 0.08, 0.04)), v((s * 0.11, 0.1, 0.012)), 'body'),
        ]
    prev = 'body'
    for i in range(3):
        bones.append((f'tail.{i + 1}', TAIL[i], TAIL[i + 1], prev))
        prev = f'tail.{i + 1}'
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    skin_ = m['shell']
    belly = m['role']('Belly')
    gill = m['role']('Gill')
    hand = m['role']('Hand', 'joint')

    # Body and head: soft pods; a pale belly under the body.
    add(seakit.pod('Body', (0, 0.05, 0.058), (0.072, 0.1, 0.055), (0.8, 0.85), seg=(32, 18)), skin_, 'body')
    add(seakit.pod('Belly', (0, 0.035, 0.036), (0.062, 0.088, 0.036), (0.8, 0.85), seg=(28, 14)), belly, 'body')
    add(seakit.pod('Head', HEAD, (0.105, 0.078, 0.062), (0.75, 0.85), seg=(36, 20)), skin_, 'head')
    # A lit stripe down the back and a beacon on the crown.
    for i in range(3):
        add(seakit.pod(f'Back{i}', (0, 0.025 + 0.045 * i, 0.112 - 0.006 * i), (0.011, 0.011, 0.008), (0.9, 0.9),
                       seg=(12, 8)), m['dot'](3), 'body')
    add(seakit.pod('Beacon', (0, -0.03, 0.2), (0.012, 0.012, 0.012), (0.9, 0.9), seg=(14, 10)), m['beacon'], 'head')

    # The face: a wide screen across the head.
    glass, rim = kit.screen('Axolotl', (0.078, 0.014, 0.046), (0, -0.098, 0.138), 0.006, e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')

    # Gills: two chunky bars and a frill and a lit bulb at the tip, three to a side.
    for sfx, s in SIDES:
        for k in range(3):
            r, mid, t = gill_points(k, s)
            b1, b2 = f'gill.{sfx}{k}.1', f'gill.{sfx}{k}.2'
            add(seakit.bar(f'GillA{sfx}{k}', r, mid, 0.011, e=(0.8, 0.9)), gill, b1)
            add(seakit.pod(f'GillJ{sfx}{k}', mid, (0.011, 0.011, 0.011), (0.9, 0.9), seg=(12, 8)), m['joint'], b2)
            add(seakit.bar(f'GillB{sfx}{k}', mid, t, 0.009, e=(0.8, 0.9)), gill, b2)
            # Frills: two flat leaves either side of the stalk's second half.
            for j, y in enumerate((-0.012, 0.012)):
                c = mid.lerp(t, 0.55) + Vector((0, y * 1.6, 0))
                add(seakit.pod(f'Frill{sfx}{k}{j}', c, (0.016, 0.006, 0.026), (0.7, 0.8), seg=(14, 8),
                               rotation=seakit.aim(mid, t)), gill, b2)
            add(seakit.pod(f'Bulb{sfx}{k}', t, (0.0135, 0.0135, 0.0135), (0.9, 0.9), seg=(14, 10)), m['dot'](k), b2)
        # Hands (splayed, little round pads), feet.
        a = Vector((s * 0.06, -0.04, 0.055))
        b = Vector((s * 0.115, -0.07, 0.03))
        add(seakit.bar(f'Arm{sfx}', a, b, 0.02), skin_, f'arm.{sfx}')
        add(seakit.pod(f'Hand{sfx}', b + Vector((s * 0.008, -0.004, -0.004)), (0.03, 0.028, 0.012), (0.8, 0.8),
                       seg=(16, 8)), hand, f'arm.{sfx}')
        c = Vector((s * 0.06, 0.08, 0.04))
        d = Vector((s * 0.11, 0.1, 0.012))
        add(seakit.bar(f'Leg{sfx}', c, d, 0.024), skin_, f'leg.{sfx}')
        add(seakit.pod(f'Foot{sfx}', d + Vector((s * 0.006, -0.01, 0)), (0.03, 0.03, 0.012), (0.8, 0.8), seg=(16, 8)),
            hand, f'leg.{sfx}')

    # The tail: three chunky pods, ever flatter, with a fin.
    fin = m['role']('Crest')
    radii = ((0.034, 0.03), (0.026, 0.026), (0.02, 0.022))
    for i in range(3):
        a, b = Vector(TAIL[i]), Vector(TAIL[i + 1])
        add(seakit.pod(f'Tail{i}', (a + b) / 2, (radii[i][0], (b - a).length * 0.62, radii[i][1]), (0.8, 0.85),
                       seg=(18, 10), rotation=(0, 0, math.atan2(-(b - a).x, (b - a).y))), skin_ if i < 2 else fin,
            f'tail.{i + 1}')

    return looks.finish(kit.armature('AxolotlRig', rig_bones()), parts, skin, m)
