"""Plod, the crew's robot baby pygmy hippo: a round slate-green barrel on four stubby legs, a big
wide head with a huge hinged mouth (the lower jaw drops wide for the yawn, a lit tooth on each side
of it: Dot2 left, Dot3 right), two nostril domes on the top of the muzzle, small bumps over the
screen where a hippo's eyes sit, and tiny round ears that flick. A pink belly panel and a pink
muzzle-and-mouth. Built on the hoof kit (hoofkit.py), so it has the hoofed animals' rig:
root, body, neck-less head, jaw, ear.L/R, tail.1..2, leg.XX and shin.XX.

Lights: Dot0 the tail tip, Dot1 the ear hinges, Dot2/Dot3 the teeth. Faces -Y like the rest of
the crew; about 0.43 m to the top of the head.
"""

import math

import hoofkit as hk
import kit

FACE = 'pygmyhippo'
PREVIEW = dict(lift=0.0, width=0.7)

P = dict(
    face=FACE,
    body=dict(radii=(0.2, 0.27, 0.175), center=(0, 0.07, 0.265), e=0.75),
    hips=(0.3, 0.265),
    neck=dict(points=[(0, -0.1, 0.27), (0, -0.2, 0.3)], r=(0.16, 0.14), base=(-0.1, 0.27)),
    head=dict(radii=(0.185, 0.16, 0.12), center=(0, -0.3, 0.315), e=0.62),
    # 1.6:1, like the face layout
    screen=dict(radii=(0.105, 0.05, 0.062), center=(0, -0.428, 0.345), bezel=0.009, e=0.45),
    muzzle=dict(radii=(0.165, 0.1, 0.07), center=(0, -0.4, 0.265), e=0.5, role='Muzzle'),
    nose=dict(radii=(0.12, 0.014, 0.034), center=(0, -0.497, 0.262), e=0.5, role='Muzzle'),
    jaw=dict(radii=(0.14, 0.105, 0.04), center=(0, -0.395, 0.185), pivot=(0, -0.27, 0.21), pin=0.17, e=0.5,
             role='Muzzle'),
    ear=dict(dir=(0.55, 0.0, 1.0), length=0.06, width=0.06, thick=0.022, x=0.1, y=-0.255, z=0.41, e=0.8,
             taper=0.2, spin=0.0, inner=False),
    leg=dict(x=0.115, front=-0.11, back=0.26, top=0.18, knee=0.1, r=(0.06, 0.054), ball=0.06,
             hoof=dict(radii=(0.05, 0.058, 0.03), split=True)),
    tail=dict(points=[(0, 0.33, 0.3), (0, 0.375, 0.28), (0, 0.395, 0.235)], bones=2, r=(0.024, 0.013)),
    bones_extra=[],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [bits, teeth], name='Hippo')


def bits(add, m, c):
    """A pink belly panel, nostril domes, eye bumps over the screen, a dark mouth-line."""
    p, n = c.body_point((0, 0, -1.0), lift=-0.026)
    c.panel('Belly', p, n, (0.1, 0.19, 0.016), m['role']('Belly', 'joint'), 'body', e=0.5)
    # Nostril domes on the top of the muzzle.
    mz = P['muzzle']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.026, 0.026, 0.02), 0.7, 0.8, seg=(14, 10),
                               location=(side * 0.06, mz['center'][1] - 0.075, mz['center'][2] + mz['radii'][2] - 0.004)),
            m['role']('Muzzle', 'joint'), 'head')
        add(kit.superellipsoid(f'NostrilHole.{side}', (0.012, 0.012, 0.006), 0.8, 0.8, seg=(10, 6),
                               location=(side * 0.06, mz['center'][1] - 0.075, mz['center'][2] + mz['radii'][2] + 0.014)),
            m['bezel'], 'head')
    # Eye bumps: two rounded brow humps over the screen's top corners.
    sc = P['screen']
    for side in (1, -1):
        add(kit.superellipsoid(f'Brow.{side}', (0.05, 0.034, 0.03), 0.6, 0.7, seg=(16, 10),
                               location=(side * 0.098, sc['center'][1] + 0.01, sc['center'][2] + sc['radii'][2] + 0.012)),
            m['shell'], 'head')
    # A dark mouth line along the muzzle, and pins.
    add(kit.tube('MouthLine', [(-0.15, -0.402, 0.222), (-0.08, -0.468, 0.222), (0.08, -0.468, 0.222), (0.15, -0.402, 0.222)],
                 0.004, ring=6)[0], m['bezel'], 'head')
    # Seams round the barrel.
    b = P['body']
    for i, y in enumerate((-0.04, 0.17)):
        k = max(1 - abs((y - b['center'][1]) / b['radii'][1]) ** (2 / b['e']), 0.01) ** (b['e'] / 2)
        pts = [(b['radii'][0] * k * 1.012 * kit.spow(math.cos(2 * math.pi * j / 48), b['e']), y,
                b['center'][2] + b['radii'][2] * k * 1.012 * kit.spow(math.sin(2 * math.pi * j / 48), b['e']))
               for j in range(49)]
        c.seam(f'Seam{i}', pts, 0.0034, m['joint'], 'body')
    # A rear lamp-plate on the rump.
    add(kit.superellipsoid('Rump', (0.06, 0.012, 0.045), 0.4, 0.5, seg=(18, 10), location=(0, 0.335, 0.3)),
        m['role']('Belly', 'joint'), 'body')


def teeth(add, m, c):
    """A lit tooth each side of the lower jaw, standing up (Dot2 left, Dot3 right)."""
    jw = P['jaw']
    for side, dot in ((1, 2), (-1, 3)):
        add(kit.superellipsoid(f'Tooth.{side}', (0.017, 0.017, 0.032), 0.7, 0.7, seg=(12, 10),
                               location=(side * 0.11, jw['center'][1] - 0.05, jw['center'][2] + jw['radii'][2] + 0.01)),
            m['dot'](dot), 'jaw')
