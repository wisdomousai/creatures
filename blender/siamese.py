"""Suki, the crew's robot Siamese: a slender adult on long legs, a wedge of a head with
ears too big for it, a long neck, a long whip of a tail in five bones. The signature is the
points: the mask round the screen, the ears, the socks and the tail are dark (the Point
roles in the colour look, plain shell and joint in the others), and the eyes are blue.
Faces -Y like the rest of the crew; about 0.88 m to the ear tips (the site scales her).
Built from catbreed.py. Lights: Dot0 the tail tip, Dot2 the paw pads, Dot3 the ear hinges,
Dot4 the whisker tips.
"""

import catbreed
import kit

FACE = 'siamese'
PREVIEW = dict(lift=0.0, width=0.7)

D = {
    'head': dict(radii=(0.135, 0.15, 0.115), center=(0, -0.2, 0.64), e=0.5, taper=-0.5),
    'screen': dict(radii=(0.098, 0.08, 0.07), dz=-0.004, bezel=0.009, e=0.4),
    'ear': dict(x=0.098, z=0.735, tilt=0.5, flat=0.36, role='Point', inset=0.022, bone=0.2,
                profile=[(0.0, 0.22), (0.03, 0.19), (0.078, 0.08), (0.108, 0.0)]),
    'body': dict(radii=(0.092, 0.27, 0.092), center=(0, 0.07, 0.4), e=0.5, spine=5),
    'leg': dict(x=0.058, front=-0.12, back=0.27, top=0.36, bottom=0.04, r=0.025),
    'paw': dict(radii=(0.032, 0.048, 0.024), e=0.45),
    'tail': [(0, 0.33, 0.42), (0, 0.46, 0.4), (0, 0.6, 0.43), (0, 0.7, 0.53), (0, 0.72, 0.67), (0, 0.68, 0.8)],
    'tail_r': (0.021, 0.011),
    'tail_bones': 5,
    'tail_rings': [(0.8, 1.01)],
    'collar': dict(center=(0, -0.16, 0.54), major=0.07, minor=0.011, tilt=0.8, tag=0.02),
    'whiskers': dict(x=0.1, dy=0.055, dz=-0.042, length=0.13, n=3),
    'sock': 'Point',
}


def extras(add, m, D, bolt, tail_pts):
    sc = D['screen']
    sx, sy, sz = catbreed.screen_center(D)
    rx, ry, rz = sc['radii']
    # The mask: a dark plate round the screen, wider at the cheeks than the bezel.
    add(kit.superellipsoid('Mask', (rx + 0.05, 0.05, rz + 0.046), 0.4, 0.45, seg=(32, 16),
                           location=(0, sy + 0.036, sz - 0.004)), m['role']('Point'), 'head')
    # Cheek wedges, slanting in toward the chin: plates that make the head a triangle.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Wedge.{sfx}', (0.07, 0.01, 0.016), 0.5, 0.5, seg=(14, 6),
                               location=(side * 0.118, sy + 0.03, sz - 0.056), rotation=(0, side * -0.62, 0.0)),
            m['joint'], 'head')
    # A long neck, with two plate rings.
    add(kit.superellipsoid('Neck', (0.062, 0.07, 0.15), 0.6, 0.7, seg=(24, 16), location=(0, -0.145, 0.52),
                           rotation=(-0.28, 0, 0)), m['shell'], 'body')
    for k, z in enumerate((0.47, 0.54)):
        add(kit.torus(f'NeckRing{k}', 0.066 - 0.004 * k, 0.005, seg=(24, 6), location=(0, -0.15 - 0.012 * k, z),
                      rotation=(-0.28, 0, 0)), m['joint'], 'body')
    # Chest plate with two bolts, narrow like her.
    add(kit.superellipsoid('ChestPlate', (0.045, 0.01, 0.06), 0.45, 0.6, seg=(20, 10), location=(0, -0.185, 0.37)),
        m['joint'], 'body')
    for k, dz in enumerate((-0.03, 0.03)):
        bolt(f'ChestBolt{k}', (0, -0.194, 0.37 + dz), 0.006, 'body')
    # A dark cap at the end of the whip.
    add(kit.superellipsoid('TailCap', (0.016, 0.016, 0.022), 0.5, 0.5, seg=(12, 8),
                           location=(tail_pts[-1].x, tail_pts[-1].y + 0.002, tail_pts[-1].z)),
        m['role']('Point'), 'tail.5')


def build(look='ink', flame=None):
    return catbreed.build(D, FACE, 'Siamese', look, flame, extras)
