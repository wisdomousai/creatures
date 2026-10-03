"""Ember, the crew's robot Sphynx: slender and hairless, so she is all smooth shells with the
wrinkle seams showing, in rows of fine grooves across the brow and rings round the neck and
the knees, and no whiskers on her pods. Ears far too big for her wedge of a head, lemon
eyes, a long thin whip of a tail ending in a little lion-tip. Faces -Y like the rest of the
crew; about 0.9 m to the ear tips (the site scales her).
Built from catbreed.py. Lights: Dot0 the tail tip (the warm one), Dot2 the paw pads, Dot3 the
ear hinges, Dot4 the whisker pods' little lamps.
"""

import math

from mathutils import Vector

import catbreed
import kit

FACE = 'sphynx'
PREVIEW = dict(lift=0.0, width=0.7)

D = {
    'head': dict(radii=(0.15, 0.15, 0.125), center=(0, -0.2, 0.6), e=0.55, taper=-0.35),
    'screen': dict(radii=(0.108, 0.082, 0.074), dz=-0.006, bezel=0.009, e=0.4),
    'ear': dict(x=0.115, z=0.7, tilt=0.26, flat=0.3, inset=0.022, bone=0.2,
                profile=[(0.0, 0.25), (0.03, 0.21), (0.085, 0.09), (0.125, 0.0)]),
    'body': dict(radii=(0.1, 0.23, 0.1), center=(0, 0.06, 0.35), e=0.5, spine=4),
    'leg': dict(x=0.062, front=-0.1, back=0.24, top=0.31, bottom=0.04, r=0.027),
    'paw': dict(radii=(0.036, 0.05, 0.026), e=0.45),
    'tail': [(0, 0.28, 0.37), (0, 0.42, 0.36), (0, 0.54, 0.41), (0, 0.6, 0.52), (0, 0.58, 0.65)],
    'tail_r': (0.02, 0.012),
    'tail_bones': 4,
    'collar': dict(center=(0, -0.15, 0.47), major=0.075, minor=0.012, tilt=0.8, tag=0.02),
    'whiskers': dict(x=0.11, dy=0.05, dz=-0.045, length=0.0, n=0),
}


def skin_y(D, x, z, lift=1.012):
    """Where the head's front surface is at this x and z (the superellipsoid with its taper)."""
    h = D['head']
    rx, ry, rz = h['radii']
    e = h['e']
    cx, cy, cz = h['center']
    sp = (z - cz) / rz
    k = 1.0 - h['taper'] * (sp / 2)
    inner = 1 - abs(x / (rx * k)) ** (2 / e) - abs(sp) ** (2 / e)
    if inner <= 0:
        return None
    return cy - ry * k * inner ** (e / 2) * lift


def extras(add, m, D, bolt, tail_pts):
    sc = D['screen']
    sx, sy, sz = catbreed.screen_center(D)
    rx, ry, rz = sc['radii']
    h = D['head']
    # Brow wrinkles: four fine grooves arching over the screen, each a seam on the skin.
    for k in range(4):
        z = sz + rz + 0.022 + 0.017 * k
        pts = []
        w = 0.1 - 0.012 * k
        for i in range(25):
            x = -w + 2 * w * i / 24
            y = skin_y(D, x, z + 0.006 * math.cos(x / w * 1.4) * (k % 2 + 1))
            if y is not None:
                pts.append((x, y, z + 0.006 * math.cos(x / w * 1.4) * (k % 2 + 1)))
        if len(pts) > 6:
            add(kit.tube(f'Brow.{k}', pts, 0.0045, ring=5)[0], m['role']('Fold', 'joint'), 'head')
    # Cheek creases, a short curved seam on each side of the screen.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = []
        for i in range(9):
            z = sz - 0.04 + 0.014 * i
            x = side * (rx + 0.03 + 0.012 * math.sin(i / 8 * math.pi))
            y = skin_y(D, x, z)
            if y is not None:
                pts.append((x, y, z))
        if len(pts) > 4:
            add(kit.tube(f'Crease.{sfx}', pts, 0.0042, ring=5)[0], m['role']('Fold', 'joint'), 'head')
    # Neck wrinkles: stacked rings that bunch up at the shoulders.
    for k in range(5):
        add(kit.torus(f'NeckFold.{k}', 0.074 + 0.004 * k, 0.0055, seg=(24, 6),
                      location=(0, -0.15 - 0.008 * k, 0.43 + 0.022 * k - 0.04), rotation=(-0.25, 0, 0)),
            m['role']('Fold', 'joint'), 'body')
    add(kit.superellipsoid('Neck', (0.07, 0.075, 0.12), 0.6, 0.7, seg=(20, 12), location=(0, -0.145, 0.47),
                           rotation=(-0.25, 0, 0)), m['shell'], 'body')
    # Shoulder and hip folds: a few short arcs on the flanks.
    b = D['body']
    bx, by, bz = b['center']
    for side in (1, -1):
        for j, dy in enumerate((-0.14, -0.1, 0.18, 0.22)):
            add(kit.torus(f'Fold.{side}.{j}', 0.04, 0.0035, seg=(16, 5),
                          location=(side * (b['radii'][0] * 0.97), by + dy, bz + 0.01), rotation=(0, math.pi / 2, 0)),
                m['role']('Fold', 'joint'), 'body')
    # The lion-tip: a small tuft of three plates at the end of the tail.
    end = tail_pts[-1]
    for k, (dx, dz, s) in enumerate(((0, 0.026, 0.02), (-0.012, 0.012, 0.014), (0.012, 0.012, 0.014))):
        add(kit.superellipsoid(f'LionTip.{k}', (s * 0.7, s * 0.7, s * 1.8), 0.6, 0.7, seg=(8, 6),
                               location=tuple(end + Vector((dx, 0.004, dz)))), m['role']('Fold'), 'tail.4')


def build(look='ink', flame=None):
    return catbreed.build(D, FACE, 'Sphynx', look, flame, extras)
