"""The crew's robot piglet: a round pink toy on four stubby legs with ball-joint knees and tiny
split hooves, a big head with a screen face, a snout disc with two lit nostrils (Dot2, Dot3),
floppy triangle ears that fold forward, and a tail that is a coil spring. A small panel of
seams and a belly light (Dot4) on its tummy. Faces -Y like the rest of the crew; about 0.45 m
to the top of the head.
"""

import math

import catkit
import hoofkit as hk
import kit

FACE = 'piglet'
PREVIEW = dict(lift=0.0, width=0.5)


def coil(n=9, r=0.032, pitch=0.026, y0=0.215, z0=0.3):
    """Points of the tail's spring: a helix climbing up and curling back."""
    pts = []
    for i in range(n):
        a = i * 1.5 * math.pi / 2
        pts.append((r * math.sin(a) * (1 - i * 0.03), y0 + 0.012 * i + r * math.cos(a) - r, z0 + pitch * i * 0.9))
    return pts


P = dict(
    face=FACE,
    body=dict(radii=(0.15, 0.2, 0.14), center=(0, 0.04, 0.24), e=0.9),
    hips=(0.15, 0.24),
    neck=dict(points=[(0, -0.1, 0.27), (0, -0.14, 0.3), (0, -0.17, 0.32)], r=(0.08, 0.07), base=(-0.09, 0.26)),
    head=dict(radii=(0.115, 0.1, 0.105), center=(0, -0.22, 0.34), e=0.85),
    # 1.6:1, like the piglet's face layout (512 x 320)
    screen=dict(radii=(0.085, 0.026, 0.053), center=(0, -0.312, 0.355), bezel=0.008),
    muzzle=dict(radii=(0.05, 0.04, 0.036), center=(0, -0.3, 0.3), e=0.7),
    nose=dict(radii=(0.05, 0.016, 0.044), center=(0, -0.335, 0.295), e=0.8),
    jaw=dict(radii=(0.036, 0.042, 0.014), center=(0, -0.285, 0.25), pivot=(0, -0.22, 0.27), pin=0.08, e=0.5),
    ear=dict(dir=(1, -0.5, -0.5), length=0.09, width=0.07, thick=0.016, x=0.075, y=-0.2, z=0.415, e=0.6, taper=0.9,
             spin=0.6),
    leg=dict(x=0.075, front=-0.1, back=0.18, top=0.17, knee=0.1, r=(0.04, 0.034), ball=0.04,
             hoof=dict(radii=(0.034, 0.04, 0.022), split=True)),
    tail=dict(points=coil(), bones=4, r=(0.012, 0.01)),
    bones_extra=[],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [snout, belly, face_bits], name='Piglet')


def snout(add, m, c):
    """Two lit nostrils on the snout disc (Dot2, Dot3) in dark sockets, a rim round the disc."""
    nz = P['nose']
    cx, cy, cz = nz['center']
    c.ring('SnoutRim', (cx, cy - nz['radii'][1] + 0.002, cz), (0, -1, 0), nz['radii'][0] * 0.98, 0.004, m['bezel'],
           'head', seg=(30, 6))
    for k, side in enumerate((1, -1)):
        add(kit.superellipsoid(f'NostrilSocket.{side}', (0.013, 0.006, 0.017), 0.7, 0.7, seg=(12, 8),
                               location=(side * 0.02, cy - nz['radii'][1] - 0.001, cz)), m['bezel'], 'head')
        add(kit.superellipsoid(f'Nostril.{side}', (0.009, 0.006, 0.013), 0.7, 0.7, seg=(12, 8),
                               location=(side * 0.02, cy - nz['radii'][1] - 0.004, cz)), m['dot'](2 + k), 'head')


def belly(add, m, c):
    """A round lamp low on the tummy (Dot4), and a seam round the girth."""
    import dogkit as dk

    b = P['body']
    dk.seam(add, m, 'Girth', b['center'], b['radii'], b['e'], 0.0, 'body', dz=0.03)
    cy = b['center'][1]
    add(kit.superellipsoid('BellyFrame', (0.03, 0.03, 0.012), 0.6, 0.6, seg=(18, 8),
                           location=(0, cy, b['center'][2] - b['radii'][2] + 0.004)), m['bezel'], 'body')
    add(kit.superellipsoid('Belly', (0.022, 0.022, 0.012), 0.6, 0.6, seg=(18, 8),
                           location=(0, cy, b['center'][2] - b['radii'][2] - 0.001)), m['dot'](4), 'body')


def face_bits(add, m, c):
    """Rivets on the cheeks."""
    for side in (1, -1):
        c.bolt(f'Cheek.{side}', (side * 0.108, -0.25, 0.33), 0.0065, 'head')
