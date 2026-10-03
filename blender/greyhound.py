"""Wisp, the crew's robot greyhound: the slenderest of the dogs, a deep narrow chest on a tucked
waist, long thin legs ending in narrow hare feet, a long thin neck, a long narrow head and a
long thin tail that curves up at the tip. Small rose ears lie back on the head.

His signature is the racing vest, an orange band round the chest with a number lamp on each
side (the beacon). Each leg has a lit cuff above the foot (Dot0 front left, Dot1 front right,
Dot2 back left, Dot3 back right), so the site can light his footsteps, Dot4 is the tail tip
and Dot5 the nose. Muscled thighs, a keel plate under the chest and vents along the loin.
Faces -Y like the rest of the crew; about 0.9 m tall.
"""

import houndkit
import kit

FACE = 'greyhound'
PREVIEW = dict(lift=0.0, width=1.0)

D = {
    'body': [('Chest', (0.07, 0.2, 0.16), (0, -0.12, 0.48), 0.75),
             ('Loin', (0.05, 0.14, 0.068), (0, 0.12, 0.57), 0.6),
             ('Rump', (0.06, 0.1, 0.075), (0, 0.27, 0.55), 0.6)],
    'seams': (-0.5, 0.5),
    'neck': dict(points=[(0, -0.26, 0.58), (0, -0.38, 0.64), (0, -0.48, 0.67)], r=0.045, ring_tilt=1.1,
                 rings=[(0, -0.31, 0.605), (0, -0.4, 0.65)]),
    'head': dict(radii=(0.056, 0.1, 0.056), center=(0, -0.56, 0.69)),
    'screen': dict(radii=(0.045, 0.03, 0.022), center=(0, -0.656, 0.697), bezel=0.006),
    'muzzle': dict(radii=(0.031, 0.115, 0.028), center=(0, -0.7, 0.665), e=0.5),
    'nose': dict(radii=(0.02, 0.011, 0.015), center=(0, -0.812, 0.673)),
    'jaw': dict(radii=(0.026, 0.105, 0.011), center=(0, -0.7, 0.632), e=0.5, pivot=(0, -0.6, 0.642), len=0.2),
    'ear': dict(radii=(0.012, 0.034, 0.032), x=0.057, y=-0.53, top=0.742, e=0.55, tilt=0.5),
    'leg': dict(x=0.05, front=-0.2, back=0.28, top=0.43, r=0.025, r2=0.015, knee=0.5),
    'paw': dict(radii=(0.028, 0.05, 0.02), e=0.45),
    'cuff': dict(z=0.12, dot=True, minor=0.007),
    'tail': dict(points=[(0, 0.36, 0.55), (0, 0.46, 0.44), (0, 0.56, 0.34), (0, 0.64, 0.3), (0, 0.7, 0.33)],
                 r=(0.022, 0.008), bones=4),
    'collar': dict(center=(0, -0.36, 0.63), major=0.048, minor=0.009, tilt=1.15, on_head=True),
    'bolt': dict(r=0.008, x=0.059, y=-0.55, z=0.71),
    'rig': dict(body_z=0.54, chest_y=-0.3, neck=(-0.26, 0.58)),
}


def extras(add, m, D):
    chest, loin = D['body'][0], D['body'][1]
    rx = chest[1][0]
    rz = chest[1][2]
    # The racing vest: a band round the chest, a number lamp on each side of it.
    add(kit.superellipsoid('Vest', (rx + 0.004, 0.036, rz + 0.004), 0.5, 0.5, seg=(32, 8), location=(0, -0.12, 0.48)),
        m['role']('Vest', 'joint'), 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'Number.{side}', (0.005, 0.026, 0.026), 0.8, 0.8, seg=(20, 10),
                               location=(side * (rx + 0.006), -0.12, 0.5)), m['beacon'], 'body')
        add(kit.torus(f'NumberRim.{side}', 0.029, 0.004, seg=(24, 8), location=(side * (rx + 0.005), -0.12, 0.5),
                      rotation=(0, 1.5708, 0)), m['bezel'], 'body')
    # A keel plate under the deep chest, vents along the loin.
    add(kit.superellipsoid('Keel', (0.03, 0.13, 0.012), 0.5, 0.5, seg=(20, 8), location=(0, -0.12, 0.32)),
        m['joint'], 'body')
    for k in range(3):
        for side in (1, -1):
            add(kit.superellipsoid(f'Vent.{side}.{k}', (0.003, 0.03, 0.004), 0.4, 0.4, seg=(12, 6),
                                   location=(side * (loin[1][0] - 0.001), 0.12 + (k - 1) * 0.045,
                                             loin[2][2] + 0.012)), m['bezel'], 'body')
    # Muscled thighs on the hind legs.
    for name, x, end in houndkit.LEGS:
        if end != 'back':
            continue
        add(kit.superellipsoid(f'Thigh.{name}', (0.03, 0.065, 0.085), 0.6, 0.6, seg=(24, 14),
                               location=(x * 0.056, D['leg']['back'] - 0.01, 0.41)), m['shell'], f'leg.{name}')
        add(kit.superellipsoid(f'Calf.{name}', (0.02, 0.028, 0.055), 0.6, 0.6, seg=(16, 10),
                               location=(x * 0.05, D['leg']['back'] + 0.015, 0.27)), m['shell'], f'leg.{name}')


def rig_bones():
    return houndkit.rig_bones(D)


def build(look='ink', flame=None):
    return houndkit.build(D, FACE, look, flame, 'GreyhoundRig', extras)
