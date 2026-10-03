"""Scout, the crew's robot border collie: young, quick and lean, a medium build on lean legs
with white socks, a wedge-shaped head with a white blaze, ears half up (they stand and the
tips fold forward), a deep white ruff on the chest and a long bushy tail that hangs low with a
white tip. Black on white, with a black saddle over the back.

Each leg has a lit band on its white sock (Dot0 front left, Dot1 front right, Dot2 back left,
Dot3 back right), so the site can light his footsteps, Dot4 is the white tail tip and Dot5 the
nose. The tag on the collar takes the colour of his mood. Faces -Y like the rest of the crew;
about 0.66 m tall.
"""

import houndkit
import kit

FACE = 'bordercollie'
PREVIEW = dict(lift=0.0, width=0.9)

D = {
    'body': [('Chest', (0.087, 0.15, 0.105), (0, -0.04, 0.37), 0.6),
             ('Hips', (0.08, 0.13, 0.09), (0, 0.12, 0.36), 0.6)],
    'body_roles': {1: 'Patch'},
    'seams': (-0.5, 0.4),
    'neck': dict(points=[(0, -0.14, 0.42), (0, -0.19, 0.5), (0, -0.21, 0.54)], r=0.052),
    'head': dict(radii=(0.072, 0.085, 0.068), center=(0, -0.24, 0.585)),
    'screen': dict(radii=(0.056, 0.03, 0.028), center=(0, -0.318, 0.594), bezel=0.007),
    'muzzle': dict(radii=(0.04, 0.062, 0.036), center=(0, -0.335, 0.545), e=0.5),
    'nose': dict(radii=(0.024, 0.012, 0.017), center=(0, -0.394, 0.553)),
    'jaw': dict(radii=(0.032, 0.058, 0.012), center=(0, -0.33, 0.51), e=0.5, pivot=(0, -0.28, 0.52), len=0.11),
    'ear': dict(radii=(0.026, 0.014, 0.042), x=0.05, y=-0.23, top=0.625, e=0.55, tilt=0.3, up=True, role='Ear',
                fold=dict(radii=(0.026, 0.014, 0.032), fwd=0.03, drop=0.012, pitch=0.9, out=0.012)),
    'leg': dict(x=0.058, front=-0.11, back=0.2, top=0.32, r=0.027, r2=0.02, knee=0.5),
    'paw': dict(radii=(0.036, 0.05, 0.024), e=0.45, sock=True),
    'cuff': dict(z=0.1, dot=True, minor=0.007),
    'tail': dict(points=[(0, 0.2, 0.36), (0, 0.3, 0.29), (0, 0.4, 0.21), (0, 0.49, 0.17), (0, 0.54, 0.2)],
                 r=(0.045, 0.016), bones=4, role='Patch'),
    'collar': dict(center=(0, -0.16, 0.445), major=0.062, minor=0.011, tilt=0.6, on_head=True),
    'tag': dict(radii=(0.026, 0.008, 0.026), center=(0, -0.205, 0.37)),
    'bolt': dict(r=0.009, x=0.072, y=-0.235, z=0.6),
    'rig': dict(body_z=0.37, chest_y=-0.16, neck=(-0.14, 0.42)),
}


def extras(add, m, D):
    # Black patches over the head, a white blaze down the middle of the face, a white muzzle.
    for side in (1, -1):
        add(kit.superellipsoid(f'HeadPatch.{side}', (0.015, 0.075, 0.06), 0.6, 0.6, seg=(20, 12),
                               location=(side * 0.063, -0.235, 0.59)), m['role']('Patch', 'shell'), 'head')
    add(kit.superellipsoid('Blaze', (0.02, 0.07, 0.004), 0.5, 0.5, seg=(16, 8), location=(0, -0.25, 0.649)),
        m['shell'], 'head')
    # The black saddle over the chest's back, the white ruff on the chest.
    add(kit.superellipsoid('Saddle', (0.07, 0.11, 0.009), 0.5, 0.5, seg=(20, 8), location=(0, -0.03, 0.463)),
        m['role']('Patch', 'shell'), 'body')
    add(kit.superellipsoid('Ruff', (0.062, 0.05, 0.07), 0.6, 0.6, seg=(20, 12), location=(0, -0.175, 0.4)),
        m['shell'], 'body')
    add(kit.torus('RuffBand', 0.058, 0.007, seg=(24, 8), location=(0, -0.175, 0.44), rotation=(0.5, 0, 0)),
        m['bezel'], 'body')
    # White tail tip is the lit Dot4; a clip at the root of the plume, vents on the hips.
    add(kit.torus('TailClip', 0.04, 0.007, seg=(20, 6), location=(0, 0.21, 0.355), rotation=(1.2, 0, 0)),
        m['bezel'], 'body')
    for k in range(3):
        for side in (1, -1):
            add(kit.superellipsoid(f'Vent.{side}.{k}', (0.003, 0.028, 0.004), 0.4, 0.4, seg=(12, 6),
                                   location=(side * 0.079, 0.13 + (k - 1) * 0.04, 0.37)), m['bezel'], 'body')


def rig_bones():
    return houndkit.rig_bones(D)


def build(look='ink', flame=None):
    return houndkit.build(D, FACE, look, flame, 'BorderCollieRig', extras)
