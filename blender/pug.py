"""Nugget, the crew's robot pug: small and square, a boxy body on four short stout legs, a big
round head with a flat face (a tiny muzzle pad hardly out from the screen), deep wrinkle seams
across the forehead and either side of the nose, big goggle rings round the bulging eyes, small
folded button ears, a chunky neck roll and a tail curled over the rump in one tight loop.

Black mask and ears on a fawn body. Dot0..3 are lights on the front of each paw (front left,
front right, back left, back right), Dot4 the tip of the curl and Dot5 the nose. The tag on the
collar takes the colour of his mood. Faces -Y like the rest of the crew; about 0.46 m tall.
"""

import houndkit
import kit

FACE = 'pug'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'body': [('Body', (0.125, 0.145, 0.105), (0, 0.04, 0.2), 0.4)],
    'seams': (-0.5, 0.1, 0.55),
    'plate': dict(radii=(0.06, 0.07, 0.008), center=(0, 0.06, 0.3), role='Patch'),
    'head': dict(radii=(0.155, 0.12, 0.135), center=(0, -0.17, 0.33)),
    'screen': dict(radii=(0.115, 0.03, 0.058), center=(0, -0.272, 0.34), bezel=0.01),
    'muzzle': dict(radii=(0.062, 0.032, 0.04), center=(0, -0.28, 0.275), e=0.5),
    'muzzle_role': 'Mask',
    'nose': dict(radii=(0.03, 0.012, 0.02), center=(0, -0.308, 0.29)),
    'jaw': dict(radii=(0.05, 0.035, 0.014), center=(0, -0.27, 0.228), e=0.5, pivot=(0, -0.22, 0.245), len=0.09,
                tongue=dict(radii=(0.03, 0.035, 0.008), center=(0, -0.27, 0.238))),
    'ear': dict(radii=(0.036, 0.02, 0.045), x=0.12, y=-0.17, top=0.455, e=0.55, tilt=0.55, role='Ear'),
    'leg': dict(x=0.075, front=-0.075, back=0.15, top=0.17, r=0.038, r2=0.034, knee=0.5),
    'paw': dict(radii=(0.047, 0.055, 0.028), e=0.45, toes=0.015),
    'tail': dict(points=[(0, 0.17, 0.25), (0, 0.22, 0.31), (0, 0.22, 0.38), (0, 0.17, 0.42), (0, 0.12, 0.39)],
                 r=(0.03, 0.022), bones=3),
    'collar': dict(center=(0, -0.07, 0.28), major=0.105, minor=0.015, tilt=0.35),
    'tag': dict(radii=(0.042, 0.01, 0.042), center=(0, -0.17, 0.19)),
    'bolt': dict(r=0.011, x=0.15, y=-0.17, z=0.35),
    'rig': dict(body_z=0.2, chest_y=-0.1, neck=(-0.08, 0.24)),
}


def extras(add, m, D):
    # Goggle rings round the big bulging eyes, with a lens glint on each.
    for side in (1, -1):
        add(kit.torus(f'EyeRing.{side}', 0.036, 0.009, seg=(32, 10), location=(side * 0.046, -0.295, 0.342),
                      rotation=(1.5708, 0, 0)), m['bezel'], 'head')
        add(kit.superellipsoid(f'Glint.{side}', (0.006, 0.004, 0.006), seg=(10, 6),
                               location=(side * 0.062, -0.297, 0.366)), m['glow'], 'head')
    # Wrinkles: three folds across the forehead, and two curved folds either side of the nose.
    for k, z in enumerate((0.41, 0.428, 0.446)):
        add(kit.superellipsoid(f'Wrinkle.{k}', (0.085 - 0.012 * k, 0.009, 0.0065), 0.5, 0.5, seg=(20, 6),
                               location=(0, -0.278 + 0.003 * k, z)), m['bezel'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Fold.{side}', (0.045, 0.005, 0.007), 0.5, 0.5, seg=(16, 6),
                               location=(side * 0.052, -0.287, 0.292), rotation=(0, 0, side * 0.7)),
            m['joint'], 'head')
        add(kit.superellipsoid(f'Cheek.{side}', (0.03, 0.005, 0.012), 0.5, 0.5, seg=(14, 6),
                               location=(side * 0.095, -0.265, 0.265), rotation=(0, 0, side * 0.5)),
            m['bezel'], 'head')
    # A chunky neck roll between head and body, and a seam round the barrel of the chest.
    add(kit.torus('NeckRoll', 0.085, 0.032, seg=(32, 12), location=(0, -0.085, 0.26), rotation=(0.35, 0, 0)),
        m['role']('Patch', 'shell'), 'head')
    # A tab on the back of each ear, a lighter inner panel on the face of each.
    for side in (1, -1):
        add(kit.superellipsoid(f'Flank.{side}.plate', (0.006, 0.07, 0.05), 0.5, 0.5, seg=(18, 8),
                               location=(side * 0.123, 0.06, 0.2)), m['role']('Patch', 'joint'), 'body')
    # The curl's rings and a cap are part of the tail already; add a spring clip at its root.
    add(kit.torus('TailClip', 0.036, 0.007, seg=(20, 6), location=(0, 0.18, 0.26), rotation=(1.1, 0, 0)),
        m['bezel'], 'body')


def rig_bones():
    return houndkit.rig_bones(D)


def build(look='ink', flame=None):
    return houndkit.build(D, FACE, look, flame, 'PugRig', extras)
