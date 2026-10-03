"""Penny, the crew's robot beagle puppy: a big head on a small round body, short legs on paws
far too big for them, a square muzzle with a lit nose, very long floppy ears that hang almost
to the floor, and a thin tail that stands up with a white tip. Tricolour: a white body with a
black saddle, tan on the head and ears and the flanks.

Each paw has three round toe beads (Dot0 front left, Dot1 front right, Dot2 back left, Dot3
back right) that light as it lands, Dot4 is the white tail tip and Dot5 the nose, which glows
when she has a scent. The tag on the collar takes the colour of her mood. Faces -Y like the
rest of the crew; about 0.46 m tall.
"""

import houndkit
import kit

FACE = 'beagle'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'body': [('Body', (0.105, 0.145, 0.095), (0, 0.04, 0.2), 0.6)],
    'seams': (-0.45, 0.45),
    'head': dict(radii=(0.14, 0.12, 0.12), center=(0, -0.17, 0.345)),
    'screen': dict(radii=(0.1, 0.04, 0.05), center=(0, -0.273, 0.365), bezel=0.01),
    'muzzle': dict(radii=(0.07, 0.07, 0.046), center=(0, -0.3, 0.295), e=0.5),
    'muzzle_role': 'Muzzle',
    'nose': dict(radii=(0.034, 0.016, 0.024), center=(0, -0.365, 0.31)),
    'jaw': dict(radii=(0.055, 0.055, 0.016), center=(0, -0.3, 0.25), e=0.5, pivot=(0, -0.23, 0.265), len=0.12,
                tongue=dict(radii=(0.034, 0.04, 0.009), center=(0, -0.305, 0.262))),
    'ear': dict(radii=(0.042, 0.024, 0.135), x=0.15, y=-0.17, top=0.455, e=0.55, tilt=0.18),
    'leg': dict(x=0.07, front=-0.06, back=0.13, top=0.18, r=0.034, r2=0.03, knee=0.5),
    'paw': dict(radii=(0.06, 0.07, 0.036), e=0.45, toes=0.02),
    'tail': dict(points=[(0, 0.16, 0.24), (0, 0.2, 0.31), (0, 0.22, 0.39), (0, 0.22, 0.45)], r=(0.03, 0.02), bones=3),
    'collar': dict(center=(0, -0.07, 0.28), major=0.088, minor=0.015, tilt=0.35),
    'tag': dict(radii=(0.04, 0.01, 0.04), center=(0, -0.155, 0.195)),
    'bolt': dict(r=0.011, x=0.14, y=-0.17, z=0.37),
    'rig': dict(body_z=0.2, chest_y=-0.1, neck=(-0.08, 0.24)),
}


def extras(add, m, D):
    # Tan over the head on each side, a white blaze up the middle of the face, and the tan
    # patches on her flanks; a black saddle over her back.
    for side in (1, -1):
        add(kit.superellipsoid(f'HeadTan.{side}', (0.016, 0.1, 0.095), 0.6, 0.6, seg=(20, 12),
                               location=(side * 0.128, -0.17, 0.35)), m['role']('Tan', 'shell'), 'head')
        add(kit.superellipsoid(f'FlankTan.{side}', (0.01, 0.08, 0.06), 0.6, 0.6, seg=(20, 10),
                               location=(side * 0.101, 0.07, 0.17)), m['role']('Tan', 'shell'), 'body')
        add(kit.superellipsoid(f'EarPatch.{side}', (0.012, 0.018, 0.045), 0.6, 0.6, seg=(16, 10),
                               location=(side * 0.158, -0.175, 0.33), rotation=(0, side * 0.18, 0)),
            m['role']('Saddle', 'joint'), 'ear.L' if side == 1 else 'ear.R')
    add(kit.superellipsoid('Saddle', (0.075, 0.1, 0.01), 0.5, 0.5, seg=(20, 8), location=(0, 0.05, 0.288)),
        m['role']('Saddle', 'shell'), 'body')
    add(kit.superellipsoid('Blaze', (0.016, 0.06, 0.004), 0.5, 0.5, seg=(16, 8), location=(0, -0.2, 0.463)),
        m['shell'], 'head')
    # A little fringe of plates on the crown, a button on the nose bridge, leg rings and a clip
    # on the tail already come with the kit.
    for k, dx in enumerate((-0.03, 0.0, 0.03)):
        add(kit.superellipsoid(f'Tuft.{k}', (0.014, 0.028, 0.006), 0.5, 0.5, seg=(12, 8),
                               location=(dx, -0.17 - 0.01 * (k == 1), 0.462), rotation=(0.3, 0, (k - 1) * 0.4)),
            m['role']('Tan', 'shell'), 'head')


def rig_bones():
    return houndkit.rig_bones(D)


def build(look='ink', flame=None):
    return houndkit.build(D, FACE, look, flame, 'BeagleRig', extras)
