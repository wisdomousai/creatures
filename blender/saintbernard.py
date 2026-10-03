"""Bruno, the crew's robot Saint Bernard: the biggest and heaviest of the dogs, a massive
barrel of a body on thick pillar legs and big round paws, a huge square head on a thick neck
with a broad dark muzzle, heavy sad brows and droopy jowls hanging below the lip, medium
hanging ears and a long thick plume of a tail.

His signature is the little rescue barrel on his collar (its bung is the beacon, which
takes the colour of his mood). Cream body with brown patches and a dark mask. Dot0..3 are
lights on the front of each big paw (front left, front right, back left, back right), Dot4
the tail tip and Dot5 the nose. Faces -Y like the rest of the crew; about 0.95 m tall.
"""

import houndkit
import kit

FACE = 'saintbernard'
PREVIEW = dict(lift=0.0, width=1.0)

D = {
    'body': [('Body', (0.18, 0.29, 0.18), (0, 0.04, 0.5), 0.55)],
    'seams': (-0.45, 0.2, 0.6),
    'neck': dict(points=[(0, -0.18, 0.6), (0, -0.25, 0.68), (0, -0.28, 0.72)], r=0.105),
    'head': dict(radii=(0.15, 0.15, 0.13), center=(0, -0.33, 0.79)),
    'screen': dict(radii=(0.1, 0.03, 0.05), center=(0, -0.474, 0.8), bezel=0.008),
    'muzzle': dict(radii=(0.1, 0.075, 0.058), center=(0, -0.5, 0.71), e=0.5),
    'muzzle_role': 'Mask',
    'nose': dict(radii=(0.04, 0.02, 0.03), center=(0, -0.574, 0.732)),
    'jaw': dict(radii=(0.085, 0.07, 0.024), center=(0, -0.495, 0.67), e=0.5, pivot=(0, -0.42, 0.7), len=0.15,
                tongue=dict(radii=(0.045, 0.05, 0.01), center=(0, -0.5, 0.682))),
    'ear': dict(radii=(0.03, 0.06, 0.12), x=0.15, y=-0.31, top=0.9, e=0.55, tilt=0.2),
    'leg': dict(x=0.115, front=-0.17, back=0.24, top=0.4, r=0.062, r2=0.05, knee=0.45),
    'paw': dict(radii=(0.075, 0.09, 0.04), e=0.45, fwd=0.02, toes=0.016),
    'tail': dict(points=[(0, 0.32, 0.58), (0, 0.45, 0.52), (0, 0.55, 0.42), (0, 0.6, 0.3)], r=(0.06, 0.032), bones=3),
    'collar': dict(center=(0, -0.2, 0.6), major=0.13, minor=0.02, tilt=0.45),
    'bolt': dict(r=0.016, x=0.148, y=-0.32, z=0.83),
    'extra_bones': [('drop', (0, -0.56, 0.6), (0, -0.56, 0.64), None)],
    'rig': dict(body_z=0.5, chest_y=-0.2, neck=(-0.18, 0.6)),
}


def extras(add, m, D):
    # The rescue barrel on the collar: a keg on its side with two bands and a bung.
    bx, by, bz = 0, -0.285, 0.455
    add(kit.superellipsoid('Barrel', (0.055, 0.055, 0.085), 0.35, 1.0, seg=(32, 20), location=(bx, by, bz),
                           rotation=(0, 1.5708, 0)), m['role']('Barrel', 'joint'), 'body')
    for k, dx in enumerate((-0.045, 0.045)):
        add(kit.torus(f'Band.{k}', 0.056, 0.008, seg=(28, 8), location=(dx, by, bz), rotation=(0, 1.5708, 0)),
            m['bezel'], 'body')
    add(kit.superellipsoid('Bung', (0.02, 0.02, 0.014), 0.6, 0.9, seg=(16, 10), location=(0, by - 0.045, bz + 0.03),
                           rotation=(0.9, 0, 0)), m['beacon'], 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'Strap.{side}', (0.01, 0.012, 0.1), 0.5, 0.5, seg=(12, 8),
                               location=(side * 0.085, -0.25, 0.54), rotation=(0, side * -0.55, 0)),
            m['bezel'], 'body')
    # Droopy jowls hanging below the lip on each side, and heavy sad brows over the screen.
    for side in (1, -1):
        add(kit.superellipsoid(f'Jowl.{side}', (0.034, 0.07, 0.055), 0.7, 0.7, seg=(20, 12),
                               location=(side * 0.098, -0.48, 0.665), rotation=(0, side * 0.2, 0)),
            m['role']('Mask', 'joint'), 'head')
        add(kit.superellipsoid(f'JowlEdge.{side}', (0.01, 0.06, 0.012), 0.5, 0.5, seg=(12, 8),
                               location=(side * 0.105, -0.48, 0.615)), m['bezel'], 'head')
        add(kit.superellipsoid(f'Brow.{side}', (0.05, 0.016, 0.015), 0.5, 0.5, seg=(16, 8),
                               location=(side * 0.06, -0.462, 0.86), rotation=(0, side * 0.45, 0)),
            m['role']('Brow', 'bezel'), 'head')
    # Brown patches: a saddle over the back, one on each flank, one round an eye.
    add(kit.superellipsoid('Saddle', (0.1, 0.12, 0.012), 0.5, 0.5, seg=(20, 10), location=(0, 0.1, 0.675)),
        m['role']('Patch', 'joint'), 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'Flank.{side}.patch', (0.012, 0.1, 0.08), 0.5, 0.5, seg=(20, 10),
                               location=(side * 0.178, 0.16, 0.52)), m['role']('Patch', 'joint'), 'body')
        add(kit.superellipsoid(f'EyePatch.{side}', (0.05, 0.012, 0.06), 0.5, 0.5, seg=(16, 10),
                               location=(side * 0.095, -0.445, 0.85), rotation=(0, side * 0.5, 0)),
            m['role']('Patch', 'joint'), 'head')
    # An oil drip for the joke: a drop on a bone of its own that the site shrinks to nothing until he drools.
    add(kit.superellipsoid('Drop', (0.018, 0.018, 0.024), 1.0, 1.0, seg=(16, 10), location=(0, -0.56, 0.62)),
        m['role']('Oil', 'beacon' if False else 'joint'), 'drop')
    # A cross on the barrel's end, a chest blaze plate.
    add(kit.superellipsoid('Cross', (0.003, 0.03, 0.01), 0.4, 0.4, seg=(12, 6), location=(0.056, -0.285, 0.455)),
        m['role']('Cross', 'bezel'), 'body')
    add(kit.superellipsoid('Cross2', (0.003, 0.01, 0.03), 0.4, 0.4, seg=(12, 6), location=(0.056, -0.285, 0.455)),
        m['role']('Cross', 'bezel'), 'body')


def rig_bones():
    return houndkit.rig_bones(D)


def build(look='ink', flame=None):
    return houndkit.build(D, FACE, look, flame, 'SaintBernardRig', extras)
