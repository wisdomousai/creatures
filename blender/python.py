"""Slink, the crew's robot python: a wedge head with a screen face and a forked lit tongue, then
a chain of thirteen rounded ring segments (each on a bone of its own, all children of the
root, so the site can lay the chain along any curve: a slither, a coil, an S) tapering to the
tail. Each segment has a seam ring at its front, a lit diamond on its back (Dot0..Dot5 in
turn along the chain, so a light can run down it) and a cream oval on each flank. The tongue
(Dot6) is on a bone of its own, scaled to nothing until it flicks out. Lies straight in the
rest pose, faces -Y like the rest of the crew; about 1 m long and 0.12 m tall.
"""

import math

import kit
import looks

FACE = 'python'
PREVIEW = dict(lift=0.0, width=1.0)

N = 13
STEP = 0.072
HEAD_Y = -0.47


def seg_y(k):
    return HEAD_Y + STEP * k + 0.01


def seg_r(k):
    return 0.054 * (1.0 - 0.52 * (k / N) ** 2.4)


def seg_z(k):
    return seg_r(k) * 0.9


D = {
    'screen': dict(radii=(0.05, 0.026, 0.034), center=(0, HEAD_Y - 0.062, 0.062), bezel=0.006),
    'head': dict(radii=(0.068, 0.088, 0.05), center=(0, HEAD_Y - 0.002, 0.056)),
}


def rig_bones():
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('head', (0, HEAD_Y + 0.04, 0.056), (0, HEAD_Y - 0.05, 0.056), 'root'),
        ('tongue', (0, HEAD_Y - 0.085, 0.04), (0, HEAD_Y - 0.16, 0.04), 'head'),
    ]
    for k in range(1, N + 1):
        y, z = seg_y(k), seg_z(k)
        bones.append((f'seg.{k}', (0, y - 0.036, z), (0, y + 0.036, z), 'root'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The head: a flat wedge, wider than the neck, with the screen on its blunt front.
    h = D['head']
    hx, hy, hz = h['center']
    add(kit.superellipsoid('Head', h['radii'], 0.7, 0.8, seg=(36, 24), location=h['center']),
        m['role']('Head'), 'head')
    sc = D['screen']
    glass, rim = kit.screen('Python', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for side in (-1, 1):
        # A brow plate over each eye, a nostril dome each side of the snout, a cheek bolt.
        add(kit.superellipsoid(f'Brow.{side}', (0.022, 0.016, 0.007), 0.5, 0.6, seg=(14, 8),
                               location=(side * 0.034, HEAD_Y - 0.074, 0.098), rotation=(0, side * 0.35, 0)),
            m['joint'], 'head')
        add(kit.superellipsoid(f'Nostril.{side}', (0.007, 0.007, 0.005), 0.8, 0.8, seg=(10, 6),
                               location=(side * 0.02, HEAD_Y - 0.083, 0.082)), m['bezel'], 'head')
        add(kit.superellipsoid(f'Cheek.{side}', (0.01, 0.026, 0.024), 0.5, 0.6, seg=(14, 8),
                               location=(side * 0.066, HEAD_Y + 0.005, 0.054)), m['joint'], 'head')
    add(kit.superellipsoid('Crown', (0.026, 0.03, 0.006), 0.5, 0.8, seg=(16, 8),
                           location=(0, HEAD_Y + 0.01, hz + h['radii'][2] * 0.97)), m['joint'], 'head')

    # The tongue: a short stem and two prongs, glowing, scaled to nothing until it flicks.
    z = 0.04
    for side in (-1, 1):
        pts = [(0, HEAD_Y - 0.085, z), (0, HEAD_Y - 0.125, z), (side * 0.016, HEAD_Y - 0.16, z)]
        add(kit.tube(f'Tongue.{side}', pts, [0.005, 0.0045, 0.003], ring=8)[0], m['dot'](6), 'tongue')

    # The chain.
    for k in range(1, N + 1):
        y, z, r = seg_y(k), seg_z(k), seg_r(k)
        bone = f'seg.{k}'
        add(kit.superellipsoid(f'Seg.{k}', (r, 0.05, r * 0.92), 0.85, 0.9, seg=(26, 18), location=(0, y, z)),
            m['shell'], bone)
        add(kit.torus(f'Seam.{k}', r * 0.8, 0.0058, seg=(26, 6), location=(0, y - 0.044, z),
                      rotation=(math.pi / 2, 0, 0)), m['joint'], bone)
        add(kit.superellipsoid(f'Diamond.{k}', (r * 0.5, r * 0.5, 0.0095), 0.5, 0.55, seg=(14, 8),
                               location=(0, y - 0.002, z + r * 0.9 + 0.0005), rotation=(0, 0, math.pi / 4)),
            m['dot']((k - 1) % 6), bone)
        for side in (-1, 1):
            add(kit.superellipsoid(f'Flank.{k}.{side}', (0.006, 0.02, r * 0.28), 0.6, 0.8, seg=(10, 6),
                                   location=(side * r * 0.93, y, z + r * 0.1)), m['role']('Spot', 'bezel'), bone)
    # The tail tip.
    add(kit.superellipsoid('TailTip', (0.016, 0.026, 0.016), 0.8, 0.9, seg=(12, 8),
                           location=(0, seg_y(N) + 0.05, seg_z(N))), m['joint'], f'seg.{N}')

    return looks.finish(kit.armature('PythonRig', rig_bones()), parts, skin, m, outline=0.004)


def pose_for_portrait(rig):
    """For the portraits only (thumbs.py): an S with the head raised, since a straight
    snake is a thin line in a square card. The site poses her live, so this is never exported."""
    import bpy
    from mathutils import Matrix, Vector

    bones = rig.pose.bones
    names = ['head'] + [f'seg.{k}' for k in range(1, N + 1)]
    rest = [(0, HEAD_Y - 0.002, 0.056)] + [(0, seg_y(k), seg_z(k)) for k in range(1, N + 1)]
    pivot = [-0.042] + [0.036] * N  # how far the bone's pivot sits ahead of the part's middle
    centre = [None] * (N + 1)
    direction = [None] * (N + 1)
    p = Vector((0, 0, seg_z(N)))
    centre[N] = p.copy()
    rise = [-12, -4, 18, 46, 72, 86, 84, 66, 36, 12, 0, 0, 0]  # the same S the site rears her into
    for k in range(N - 1, -1, -1):
        h = 0.55 * math.sin(0.62 * k) * (1 if k > 8 else 0.3)
        lift = math.radians(rise[k])
        d = Vector((math.cos(h) * math.cos(lift), math.sin(h) * math.cos(lift), math.sin(lift)))
        direction[k] = d
        p = p + d * STEP
        centre[k] = p.copy()
    direction[N] = direction[N - 1]
    for k, name in enumerate(names):
        d = direction[max(0, min(N - 1, k))]
        c0 = Vector(rest[k])
        c1 = centre[k]
        p0 = c0 + Vector((0, -pivot[k], 0))
        p1 = c1 + d * pivot[k]
        rot = d.to_track_quat('-Y', 'Z').to_matrix().to_4x4()
        delta = Matrix.Translation(p1) @ rot @ Matrix.Translation(-p0)
        bones[name].matrix = delta @ bones[name].bone.matrix_local
    bpy.context.view_layer.update()
