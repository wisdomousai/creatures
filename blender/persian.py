"""Pearl, the crew's robot Persian, a senior: round and low, a broad flat face (the screen set
flush, a lighter grey muzzle panel under it and heavy tired lids over the top), small ears set
wide on the corners of the head, a big fluffy collar of rounded plates, pantaloons on the
hips and a short bushy tail. Short legs on big round paws. Faces -Y like the rest of the crew;
about 0.58 m to the ear tips.
Built from catbreed.py. Lights: Dot0 the tail tip, Dot2 the paw pads, Dot3 the ear hinges,
Dot4 the whisker tips.
"""

import math

from mathutils import Vector

import catbreed
import kit

FACE = 'persian'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'head': dict(radii=(0.225, 0.17, 0.165), center=(0, -0.2, 0.39), e=0.72),
    'screen': dict(radii=(0.165, 0.09, 0.115), dz=-0.012, bezel=0.011, e=0.45),
    'ear': dict(x=0.165, z=0.505, tilt=0.45, flat=0.6, inset=0.016, bone=0.07,
                profile=[(0.0, 0.08), (0.024, 0.07), (0.06, 0.03), (0.078, 0.0)]),
    'body': dict(radii=(0.175, 0.21, 0.13), center=(0, 0.05, 0.21), e=0.6, spine=3),
    'leg': dict(x=0.1, front=-0.09, back=0.19, top=0.15, bottom=0.036, r=0.052),
    'paw': dict(radii=(0.062, 0.068, 0.037), e=0.5),
    'tail': [(0, 0.24, 0.23), (0, 0.32, 0.24), (0, 0.37, 0.3), (0, 0.37, 0.39)],
    'tail_r': (0.058, 0.05),
    'tail_bones': 3,
    'tail_ring': 12,
    'tail_rings': [(0.88, 1.01)],
    'collar': dict(center=(0, -0.16, 0.285), major=0.13, minor=0.016, tilt=0.5, tag=0.026),
    'whiskers': dict(x=0.2, dy=0.04, dz=-0.05, length=0.1, n=3),
}


def extras(add, m, D, bolt, tail_pts):
    sc = D['screen']
    sx, sy, sz = catbreed.screen_center(D)
    rx, ry, rz = sc['radii']
    # The grey muzzle: a lighter panel under the screen that wraps its lower rim.
    add(kit.superellipsoid('Muzzle', (0.12, 0.034, 0.05), 0.5, 0.6, seg=(28, 12), location=(0, sy - 0.005, sz - rz - 0.012)),
        m['role']('Muzzle'), 'head')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Jowl.{sfx}', (0.045, 0.04, 0.05), 0.6, 0.7, seg=(14, 10),
                               location=(side * 0.12, sy + 0.012, sz - rz + 0.02)), m['role']('Muzzle'), 'head')
    # Heavy lids: a plate over the top of the screen, drooping at the outer corners.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Lid.{sfx}', (rx * 0.56, 0.022, 0.026), 0.5, 0.6, seg=(18, 8),
                               location=(side * rx * 0.5, sy - 0.026, sz + rz * 0.78), rotation=(0, side * 0.2, 0)),
            m['role']('Lid', 'joint'), 'head')
    # The fluffy collar: two rows of rounded plates round the neck, and a puff on each hip.
    c = D['collar']
    cx, cy, cz = c['center']
    t = c['tilt']
    for row, (rad, n, size) in enumerate(((0.19, 13, 0.058), (0.215, 11, 0.066))):
        for i in range(n):
            a = math.radians(176 + 188 * i / (n - 1) if row == 0 else 190 + 160 * i / (n - 1))
            x, y, z = (cx + rad * math.cos(a), cy + rad * math.sin(a) * math.cos(t),
                       cz + rad * math.sin(a) * math.sin(t) - 0.035 * row)
            add(kit.superellipsoid(f'Fluff.{row}{i}', (size, 0.04, size * 0.8), 0.6, 0.7, seg=(10, 6), location=(x, y, z),
                                   rotation=(0.45, 0, a + math.pi / 2)), m['role']('Fluff'), 'body')
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k in range(2):
            add(kit.superellipsoid(f'Pants.{sfx}{k}', (0.06, 0.05, 0.045), 0.6, 0.7, seg=(10, 6),
                                   location=(side * (lg['x'] + 0.03), lg['back'] + 0.03 - 0.01 * k, lg['top'] + 0.04 - 0.05 * k)),
                m['role']('Fluff'), f'leg.B{sfx}')
    # A bushy tail: round plates down both sides.
    pts = tail_pts
    r0, r1 = D['tail_r']
    for i in range(10, 96, 12):
        tpos = i / 96
        bone = f'tail.{min(3, int(tpos * 3) + 1)}'
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, 96)]
        rot = (b - a).normalized().to_track_quat('Z', 'Y').to_euler()
        ny = rot.to_matrix() @ Vector((0, 1, 0))
        for off, rad in ((Vector((1, 0, 0)), 1), (Vector((-1, 0, 0)), 1), (ny, 1), (-ny, 1)):
            plate = kit.superellipsoid(f'TailFluff.{i}', (0.05, 0.048, 0.07), 0.7, 0.8, seg=(8, 6))
            plate.location = tuple(pts[i] + off * (r0 + (r1 - r0) * tpos + 0.006))
            plate.rotation_euler = rot
            add(plate, m['role']('Fluff'), bone)


def build(look='ink', flame=None):
    return catbreed.build(D, FACE, 'Persian', look, flame, extras)
