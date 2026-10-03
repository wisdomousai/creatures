"""Pudding, the crew's robot Scottish Fold kitten: a small round ball of a cat, a head far too
big for its body and as round as an owl's, the ears folded flat forward over the top of it
like a little cap, the screen all big round eyes, chubby muzzle puffs, short stubby legs on
fat paws and a short round-tipped tail. Faces -Y like the rest of the crew; about 0.46 m to the
top of the head (the site scales it small).
Built from catbreed.py. Lights: Dot0 the tail tip, Dot2 the paw pads, Dot3 the ear hinges,
Dot4 the whisker tips.
"""

import catbreed
import kit

FACE = 'scottishfold'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'head': dict(radii=(0.175, 0.15, 0.15), center=(0, -0.17, 0.33), e=0.85),
    'screen': dict(radii=(0.132, 0.085, 0.083), dz=-0.012, bezel=0.01, e=0.55),
    # Folded: tipped well forward so the cone lies along the top of the head.
    'ear': dict(x=0.1, z=0.455, dy=-0.02, tilt=0.55, pitch=1.15, flat=0.55, inset=0.012, bone=0.05,
                profile=[(0.0, 0.1), (0.03, 0.088), (0.074, 0.04), (0.095, 0.0)]),
    'body': dict(radii=(0.092, 0.15, 0.09), center=(0, 0.05, 0.165), e=0.6, spine=3),
    'leg': dict(x=0.062, front=-0.06, back=0.14, top=0.13, bottom=0.035, r=0.034),
    'paw': dict(radii=(0.042, 0.05, 0.03), e=0.5),
    'tail': [(0, 0.19, 0.19), (0, 0.26, 0.21), (0, 0.3, 0.27), (0, 0.29, 0.35)],
    'tail_r': (0.03, 0.025),
    'tail_bones': 3,
    'tail_rings': [(0.5, 0.6), (0.78, 0.9)],
    'tail_tip': 0.01,
    'collar': dict(center=(0, -0.1, 0.235), major=0.09, minor=0.013, tilt=0.5, tag=0.022),
    'whiskers': dict(x=0.16, dy=0.04, dz=-0.045, length=0.1, n=3),
}


def extras(add, m, D, bolt, tail_pts):
    sc = D['screen']
    sx, sy, sz = catbreed.screen_center(D)
    rx, ry, rz = sc['radii']
    # Chubby muzzle puffs, two round pads under the screen.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Puff.{sfx}', (0.045, 0.036, 0.04), 0.7, 0.8, seg=(14, 10),
                               location=(side * 0.045, sy + 0.005, sz - rz - 0.006)), m['role']('Muzzle'), 'head')
    # A chubby tummy plate, the one the paws rest on in the Buddha sit.
    add(kit.superellipsoid('Tummy', (0.06, 0.02, 0.05), 0.5, 0.6, seg=(20, 10), location=(0, -0.088, 0.15)),
        m['role']('Muzzle'), 'body')
    for k, dz in enumerate((-0.022, 0.022)):
        bolt(f'TummyBolt{k}', (0, -0.108, 0.15 + dz), 0.006, 'body')


def build(look='ink', flame=None):
    return catbreed.build(D, FACE, 'ScottishFold', look, flame, extras)
