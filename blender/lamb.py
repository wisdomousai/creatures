"""The crew's robot lamb: a little round toy of chunky rounded wool pods heaped over a soft
barrel body, on short dark legs with ball-joint knees and small split hooves, a dark head
with a screen face, floppy dark ears out to the sides, a wool topknot and a pod of a tail.
A big head and eyes, short legs: it is young. Every pod is plain wool; the lights are the
tail tip (Dot0), the ear hinges (Dot1) and a little lamp on the collar-less chest (Dot2),
which glows when it baas. Faces -Y like the rest of the crew; about 0.6 m to the topknot.
"""

import hoofkit as hk
import kit

FACE = 'lamb'
PREVIEW = dict(lift=0.0, width=0.5)

P = dict(
    face=FACE,
    body=dict(radii=(0.125, 0.18, 0.115), center=(0, 0.04, 0.3), e=0.62),
    hips=(0.19, 0.3),
    neck=dict(points=[(0, -0.1, 0.33), (0, -0.14, 0.38), (0, -0.17, 0.42)], r=(0.07, 0.06), base=(-0.09, 0.33),
              role='Face'),
    head=dict(radii=(0.105, 0.1, 0.1), center=(0, -0.22, 0.43), e=0.62, role='Face'),
    # 1.6:1, like the lamb's face layout (512 x 320)
    screen=dict(radii=(0.08, 0.026, 0.05), center=(0, -0.312, 0.44), bezel=0.008),
    muzzle=dict(radii=(0.05, 0.05, 0.04), center=(0, -0.285, 0.38), e=0.5, role='Face'),
    nose=dict(radii=(0.026, 0.012, 0.018), center=(0, -0.328, 0.385), e=0.6),
    jaw=dict(radii=(0.034, 0.045, 0.016), center=(0, -0.285, 0.335), e=0.5, pivot=(0, -0.22, 0.355), pin=0.07, role='Face'),
    ear=dict(dir=(1, 0.1, -0.22), length=0.11, width=0.05, thick=0.018, x=0.095, y=-0.2, z=0.47, e=0.6, taper=0.4,
             spin=1.57),
    leg=dict(x=0.07, front=-0.1, back=0.2, top=0.235, knee=0.135, r=(0.036, 0.03), ball=0.037, role='Leg',
             hoof=dict(radii=(0.032, 0.038, 0.022), split=True)),
    tail=dict(points=[(0, 0.21, 0.34), (0, 0.255, 0.31), (0, 0.27, 0.27)], bones=2, r=(0.02, 0.016),
              tuft=dict(r=0.04, squash=(1, 1, 1), role='Wool')),
    wool=dict(r=0.056, rings=(-0.82, -0.45, -0.08, 0.3, 0.66, 0.88), around=(5, 8, 9, 9, 8, 5), belly=-0.35,
              lift=0.38, scale=1.0),
    bones_extra=[],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [topknot, face_bits, chest_lamp], name='Lamb')


def topknot(add, m, c):
    """A heap of pods on top of the head, and a puff of wool between the ears."""
    hk.pod_cluster(c, (0, -0.2, 0.515), 0.036, 'head', n=6, name='Topknot', spread=0.7)
    # A fringe of pods on the cheeks and each shoulder, so the wool runs down into the dark.
    for side in (1, -1):
        add(kit.superellipsoid(f'Cheek.{side}', (0.03, 0.03, 0.026), 0.8, 0.8, seg=(12, 8),
                               location=(side * 0.098, -0.2, 0.4)), m['role']('Wool', 'shell'), 'head')


def face_bits(add, m, c):
    """Nostrils on the nose, rivets on the cheeks."""
    nz = P['nose']
    cx, cy, cz = nz['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.005, 0.004, 0.007), 0.6, 0.6, seg=(8, 6),
                               location=(side * 0.012, cy - nz['radii'][1] + 0.001, cz - 0.002)), m['bezel'], 'head')
        c.bolt(f'Cheek.Bolt.{side}', (side * 0.104, -0.25, 0.41), 0.0065, 'head')


def chest_lamp(add, m, c):
    """A small lit plate on the chest, in a frame, under the wool: the lamb's heart (Dot2)."""
    cy = P['body']['center'][1] - P['body']['radii'][1]
    add(kit.superellipsoid('HeartFrame', (0.032, 0.012, 0.03), 0.5, 0.5, seg=(18, 8), location=(0, cy + 0.012, 0.27)),
        m['bezel'], 'body')
    add(kit.superellipsoid('Heart', (0.024, 0.012, 0.022), 0.5, 0.5, seg=(18, 8), location=(0, cy + 0.003, 0.27)),
        m['dot'](2), 'body')
