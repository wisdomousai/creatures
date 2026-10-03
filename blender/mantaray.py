"""Billow, the crew's robot manta ray: a wide, clean swept diamond of wing panels (three slabs to
a side, each its own bone so the wings can ripple, the leading edge straight and the chords
shrinking to a pointed tip), a wide flat head at the very front with the screen face on its
front edge between two short curled head fins, a low ridge down the back with three lit studs
on it (Dot0 at the head .. Dot2) and a long thin whip of a tail of three bones. The back is the
shell colour, the belly a pale plate under every panel (it shows when he rolls over).

He is built flat, then tipped back 38 degrees about X (his tail end up), so that from the
front we see his back and his face at once the way a manta banks toward you; the screen alone
is not tipped, so it looks straight at us. Dot3 is a pair of cheek lamps by the head, and a
small beacon sits at the end of the ridge. Faces -Y; about 0.72 m across, afloat: his origin
is under him.
"""

import math

from mathutils import Matrix, Vector

import kit
import looks
import seakit

FACE = 'manta'
PREVIEW = dict(lift=0.05, width=0.72, turn=-18)

TILT = math.radians(38)
CZ = 0.15
M = Matrix.Translation((0, 0, CZ)) @ Matrix.Rotation(TILT, 4, 'X')
# The wing panels: slim rounded slabs laid along the leading edge, which sweeps back at SLOPE.
# EDGES are their inner and outer x, CHORD their half chords.
EDGES = (0.05, 0.15, 0.255, 0.36)
CHORD = (0.088, 0.064, 0.038)
THICK = (0.014, 0.011, 0.008)
SLOPE = 0.55
ANGLE = math.atan(SLOPE)
SIDES = (('L', 1), ('R', -1))
TAIL = ((0, 0.13, -0.01), (0, 0.33, -0.06), (0, 0.53, -0.12), (0, 0.72, -0.19))


def lead(x):
    """The leading edge's y at x."""
    return -0.07 + (x - 0.05) * SLOPE


def mid(k):
    """Panel k's centre (x, y), unmirrored."""
    x = (EDGES[k] + EDGES[k + 1]) / 2
    return x, lead(x) + CHORD[k] * 0.9


def tp(v):
    """A point in the flat build, tipped back into place."""
    return M @ Vector(v)


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', tp((0, -0.05, 0)), tp((0, 0.05, 0)), 'root'),
        ('face', tp((0, -0.15, 0.0)) + Vector((0, -0.03, 0.045)), tp((0, -0.15, 0.0)) + Vector((0, -0.08, 0.045)), 'body'),
    ]
    for sfx, s in SIDES:
        for k in range(3):
            x0, x1 = EDGES[k], EDGES[k + 1]
            yc = mid(k)[1]
            bones.append((f'wing.{sfx}.{k + 1}', tp((s * x0, yc - 0.5 * SLOPE * (x1 - x0), 0)),
                          tp((s * x1, yc + 0.5 * SLOPE * (x1 - x0), 0)),
                          'body' if k == 0 else f'wing.{sfx}.{k}'))
        bones += [
            (f'horn.{sfx}.1', tp((s * 0.125, -0.145, 0)), tp((s * 0.145, -0.2, 0.03)), 'body'),
            (f'horn.{sfx}.2', tp((s * 0.145, -0.2, 0.03)), tp((s * 0.135, -0.235, 0.08)), f'horn.{sfx}.1'),
        ]
    prev = 'body'
    for i in range(3):
        bones.append((f'tail.{i + 1}', tp(TAIL[i]), tp(TAIL[i + 1]), prev))
        prev = f'tail.{i + 1}'
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone, tilt=True):
        kit.assign(obj, mat)
        kit.apply_transforms(obj)
        if tilt:
            obj.data.transform(M)
            obj.data.update()
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    wing = m['role']('Wing')
    belly = m['role']('Belly')
    fin = m['role']('Fin', 'joint')

    # The body, with a low ridge down the back, and a wide flat head at the very front.
    add(seakit.pod('Body', (0, 0.0, 0), (0.1, 0.135, 0.042), (0.8, 0.85), seg=(32, 18)), wing, 'body')
    add(seakit.pod('BodyBelly', (0, 0.0, -0.012), (0.095, 0.13, 0.034), (0.8, 0.85), seg=(32, 18)), belly, 'body')
    # The head turns with the screen (both on the face bone): on the body it stayed put while the
    # screen turned to look, and its front came out through the glass.
    add(seakit.pod('Head', (0, -0.112, 0.0), (0.115, 0.062, 0.05), (0.6, 0.7), seg=(28, 16)), wing, 'face')
    add(seakit.bar('Ridge', (0, -0.05, 0.045), (0, 0.2, 0.04), 0.016, e=(0.8, 0.9), squash=0.9), fin, 'body')
    for i, y in enumerate((0.0, 0.065, 0.13)):
        add(seakit.pod(f'Stud{i}', (0, y, 0.058), (0.014, 0.014, 0.008), (0.8, 0.9), seg=(14, 8)), m['dot'](i), 'body')
    # The screen is big (it fills the head's front, 2:1 like his face layout) and sits up on it, not
    # low under the front edge. It is not tipped back with the body but tilted up a little more
    # than level toward the site's camera, which looks down from the front.
    sc = tp((0, -0.15, 0.0)) + Vector((0, -0.022, 0.045))
    glass, rim = kit.screen('Manta', (0.105, 0.014, 0.0525), sc, 0.006, e=0.4)
    for part, mat in ((glass, m['face']), (rim, m['bezel'])):
        kit.assign(part, mat)
        kit.apply_transforms(part)
        part.data.transform(Matrix.Translation(sc) @ Matrix.Rotation(-math.radians(24), 4, 'X') @ Matrix.Translation(-sc))
        part.data.update()
        parts.append(part)
        skin.append((part, 'face'))
    # Cheek lamps and the beacon.
    for sfx, s in SIDES:
        add(seakit.pod(f'Cheek{sfx}', (s * 0.15, -0.045, 0.0), (0.011, 0.011, 0.011), (0.9, 0.9), seg=(12, 8)),
            m['dot'](3), 'body')
    add(seakit.pod('Beacon', (0, 0.2, 0.058), (0.012, 0.012, 0.012), (0.9, 0.9), seg=(14, 10)), m['beacon'], 'body')

    # The wings: three slabs a side along the leading edge, a pale plate under each, a pointed tip.
    for sfx, s in SIDES:
        rot = (0, 0, s * ANGLE)
        for k in range(3):
            cx, cy = mid(k)
            cx *= s
            half = (EDGES[k + 1] - EDGES[k]) / 2 / math.cos(ANGLE) * 1.3
            bone = f'wing.{sfx}.{k + 1}'
            add(seakit.pod(f'Panel{sfx}{k}', (cx, cy, 0), (half, CHORD[k], THICK[k]), (0.35, 0.5), seg=(24, 12),
                           rotation=rot), wing, bone)
            add(seakit.pod(f'Under{sfx}{k}', (cx, cy, -0.005), (half * 0.97, CHORD[k] * 0.95, THICK[k] * 0.8),
                           (0.35, 0.5), seg=(24, 12), rotation=rot), belly, bone)
        tx, ty = EDGES[3], lead(EDGES[3]) + 0.02
        add(seakit.pod(f'Tip{sfx}', (s * (tx + 0.012), ty, 0), (0.05, 0.022, 0.007), (0.5, 0.6), seg=(16, 8),
                       rotation=rot), wing, f'wing.{sfx}.3')
        # Head fins: two curled bars out in front, the tip turned up.
        a, b, c = (s * 0.125, -0.145, 0), (s * 0.145, -0.2, 0.03), (s * 0.135, -0.235, 0.08)
        add(seakit.bar(f'HornA{sfx}', a, b, 0.016, e=(0.8, 0.9)), fin, f'horn.{sfx}.1')
        add(seakit.bar(f'HornB{sfx}', b, c, 0.013, e=(0.8, 0.9)), fin, f'horn.{sfx}.2')
        add(seakit.pod(f'HornTip{sfx}', c, (0.012, 0.012, 0.012), (0.9, 0.9), seg=(12, 8)), m['bezel'], f'horn.{sfx}.2')

    # The tail: three thin pods, a whip longer than the body.
    tail = m['role']('Tail', 'joint')
    radii = (0.014, 0.01, 0.007)
    for i in range(3):
        a, b = Vector(TAIL[i]), Vector(TAIL[i + 1])
        add(seakit.bar(f'Tail{i}', a - (b - a) * 0.1, b + (b - a) * 0.1, radii[i]), tail, f'tail.{i + 1}')

    return looks.finish(kit.armature('MantaRig', rig_bones()), parts, skin, m)
