"""Moose, the crew's robot Maine Coon: one of the biggest cats, long and broad, with a deep
chest wearing a ruff of chunky plates, a square-muzzled head under lynx-tufted ears, big
snowshoe paws with a britches of plates on the hind legs, and a huge plumed tail: leaf
plates down both sides of it and a fat plume at the tip. Gentle giant. Faces -Y like the
rest of the crew; about 0.72 m to the ear tips (the site scales him up).
Built from catbreed.py. Lights: Dot0 the tail tip, Dot2 the paw pads, Dot3 the ear hinges,
Dot4 the whisker tips.
"""

import math

from mathutils import Vector

import cat
import catbreed
import kit

FACE = 'mainecoon'
PREVIEW = dict(lift=0.0, width=0.8)

D = {
    'head': dict(radii=(0.19, 0.16, 0.14), center=(0, -0.26, 0.5), e=0.42),
    'screen': dict(radii=(0.145, 0.1, 0.092), dz=-0.008, bezel=0.011, e=0.4),
    'ear': dict(x=0.125, z=0.625, tilt=0.3, inset=0.03, bone=0.15,
                profile=[(0.0, 0.17), (0.028, 0.145), (0.07, 0.06), (0.095, 0.0)]),
    'body': dict(radii=(0.17, 0.3, 0.145), center=(0, 0.08, 0.31), e=0.45, spine=5),
    'leg': dict(x=0.1, front=-0.13, back=0.3, top=0.27, bottom=0.04, r=0.046),
    'paw': dict(radii=(0.058, 0.07, 0.034), e=0.45),
    'tail': [(0, 0.36, 0.34), (0, 0.5, 0.35), (0, 0.65, 0.42), (0, 0.74, 0.56), (0, 0.74, 0.68), (0, 0.68, 0.78)],
    'tail_r': (0.058, 0.042),
    'tail_bones': 5,
    'tail_ring': 14,
    'tail_rings': [(0.5, 0.58), (0.7, 0.78), (0.9, 1.01)],
    'tail_tip': 0.014,
    'collar': dict(center=(0, -0.2, 0.4), major=0.12, minor=0.014, tilt=0.6, tag=0.028),
    'whiskers': dict(x=0.17, dy=0.05, dz=-0.045, length=0.15, n=3),
}


def extras(add, m, D, bolt, tail_pts):
    e = D['ear']
    ey = catbreed.ear_y(D)
    # Lynx tufts: a pointed plume of two plates off each ear tip, carrying its line on.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ax = (side * math.sin(e['tilt']), 0, math.cos(e['tilt']))
        tip = (side * e['x'] + 0.17 * ax[0], ey, e['z'] - 0.02 + 0.17 * ax[2])
        for k, (h, w, sp) in enumerate(((0.048, 0.022, 0.0), (0.036, 0.016, 0.45))):
            add(kit.superellipsoid(f'Tuft.{sfx}{k}', (w, 0.01, h), 0.5, 0.5, seg=(10, 8),
                                   location=(tip[0] + ax[0] * h * 0.6, tip[1], tip[2] + ax[2] * h * 0.6),
                                   rotation=(0, side * (e['tilt'] + sp), 0)),
                m['role']('Tuft', 'joint'), f'ear.{sfx}')
    # The ruff: two staggered rows of chunky plates round the chest, bigger than the collar.
    c = D['collar']
    cx, cy, cz = c['center']
    t = c['tilt']
    for row, (rad, n, size) in enumerate(((0.175, 11, 0.05), (0.2, 9, 0.058))):
        for i in range(n):
            a = math.radians(188 + (164 * i / (n - 1)) if row == 0 else 196 + 148 * i / (n - 1))
            r = rad
            x, y, z = cx + r * math.cos(a), cy + r * math.sin(a) * math.cos(t), cz + r * math.sin(a) * math.sin(t) - 0.03 * row
            add(kit.superellipsoid(f'Ruff.{row}{i}', (size, 0.035, size * 0.75), 0.5, 0.6, seg=(10, 6), location=(x, y, z),
                                   rotation=(0.5 - 0.1 * row, 0, a + math.pi / 2)),
                m['role']('Ruff'), 'body')
    # Britches: stacked plates down the back of each hind leg.
    lg = D['leg']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k in range(3):
            add(kit.superellipsoid(f'Britch.{sfx}{k}', (0.05, 0.035, 0.032), 0.5, 0.6, seg=(12, 8),
                                   location=(side * (lg['x'] + 0.012), lg['back'] + 0.05 - 0.004 * k, lg['top'] - 0.03 - 0.055 * k)),
                m['role']('Ruff'), f'leg.B{sfx}')
        # Toe tufts: three small plates fanned out in front of each front paw.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for fy, bone in ((lg['front'], f'leg.F{sfx}'), (lg['back'], f'leg.B{sfx}')):
            for k, dx in enumerate((-0.03, 0.0, 0.03)):
                add(kit.superellipsoid(f'ToeTuft.{sfx}{bone[-2]}{k}', (0.011, 0.03, 0.008), 0.5, 0.5, seg=(8, 6),
                                       location=(side * lg['x'] + dx, fy - 0.07, 0.02), rotation=(0, 0, dx * 5)),
                    m['role']('Ruff'), bone)
    # The plume: leaf plates down both sides of the tail (each riding the bone it is on) and a fat tip.
    pts = tail_pts
    nb = D['tail_bones']
    r0, r1 = D['tail_r']
    for i in range(6, 94, 9):
        tpos = i / 96
        bone = f'tail.{min(nb, int(tpos * nb) + 1)}'
        rad = r0 + (r1 - r0) * tpos
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, 96)]
        d = (b - a).normalized()
        rot = d.to_track_quat('Z', 'Y').to_euler()
        for side in (1, -1):
            plate = kit.superellipsoid(f'Plume.{i}.{side}', (0.034, 0.03, 0.066), 0.6, 0.7, seg=(8, 6))
            plate.location = tuple(pts[i] + Vector((side * (rad + 0.016), 0, 0.005)))
            plate.rotation_euler = rot
            plate.rotation_euler.rotate_axis('Y', side * 0.5)
            add(plate, m['role']('Plume'), bone)
        ny = rot.to_matrix() @ Vector((0, 1, 0))
        for side in (1, -1):
            plate = kit.superellipsoid(f'PlumeF.{i}.{side}', (0.03, 0.034, 0.062), 0.6, 0.7, seg=(8, 6))
            plate.location = tuple(pts[i] + ny * side * (rad + 0.014))
            plate.rotation_euler = rot
            add(plate, m['role']('Plume'), bone)
    end = pts[-1]
    add(kit.superellipsoid('PlumeTip', (0.04, 0.04, 0.075), 0.6, 0.7, seg=(14, 10),
                           location=tuple(end + Vector((0, 0.002, 0.03)))), m['role']('Plume'), 'tail.5')
    # A chest plate between the ruff and the legs.
    add(kit.superellipsoid('ChestPlate', (0.08, 0.012, 0.07), 0.45, 0.6, seg=(20, 10), location=(0, -0.218, 0.25)),
        m['joint'], 'body')
    for k, (dx, dz) in enumerate(((-0.05, -0.04), (0.05, -0.04), (-0.05, 0.04), (0.05, 0.04))):
        bolt(f'ChestBolt{k}', (dx, -0.23, 0.25 + dz), 0.007, 'body')


def build(look='ink', flame=None):
    return catbreed.build(D, FACE, 'MaineCoon', look, flame, extras)
