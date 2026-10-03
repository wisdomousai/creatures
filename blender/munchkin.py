"""Nub, the crew's robot Munchkin kitten: small and young, with a big round head, a normal-length
little body held very close to the floor on very short stubby legs with big round paws, small
rounded ears and a thin tail held up like a flag. Cream with orange patches over the back,
the ears and the tail; a white blaze, bib and socks. The collar tag is the beacon. Faces -Y like
the rest of the crew; about 0.42 m to the ear tips.
"""

import math

import catkit
import kit

FACE = 'munchkin'
PREVIEW = dict(lift=0.0, width=0.5)

P = dict(
    face=FACE,
    head=dict(radii=(0.17, 0.14, 0.135), center=(0, -0.2, 0.27), e=0.6),
    screen=dict(radii=(0.14, 0.1, 0.1), center=(0, -0.275, 0.27), bezel=0.01, e=0.5),
    neckpart=dict(radii=(0.09, 0.08, 0.08), center=(0, -0.11, 0.2), e=0.7),
    body=dict(radii=(0.1, 0.2, 0.088), center=(0, 0.05, 0.145), e=0.6),
    ear=dict(x=0.105, y=-0.2, z=0.385, tilt=0.3, inset=0.022,
             profile=[(0.0, 0.082), (0.02, 0.078), (0.05, 0.05), (0.066, 0.0)]),
    leg=dict(x=0.068, front=-0.09, back=0.17, top=0.105, bottom=0.03, r=0.03, r_top=0.034),
    paw=dict(radii=(0.045, 0.054, 0.03), e=0.45),
    tail=[(0, 0.23, 0.17), (0, 0.31, 0.2), (0, 0.35, 0.27), (0, 0.35, 0.36)],
    tail_r=(0.027, 0.02),
    tail_bones=3,
    tail_rings=[(0.84, 1.01)],
    hips=(0.2, 0.16),
    neck=(-0.12, 0.2),
    collar=dict(center=(0, -0.11, 0.2), major=0.1, minor=0.013, tilt=0.45),
    tag=dict(r=0.024, center=(0, -0.2, 0.14)),
    whiskers=0.05,
    seam=0.003,
)


def marks(add, m, c):
    """Orange patches over the back, a white blaze and bib, cheek tufts."""
    patch = m['role']('Patch')
    for i, (y, x, r) in enumerate(((-0.08, -0.03, 0.09), (0.1, 0.03, 0.1), (0.2, -0.04, 0.07))):
        p, n = c.body_point((x, y - 0.05, 1.0))
        c.panel(f'Patch{i}', p, n, (r, r * 0.85, 0.012), patch, 'body', e=0.8, spin=0.6 * i, lift=-0.001, seg=(20, 8))
    p, n = c.head_point((0.0, -0.5, 1.0))
    c.panel('Blaze', p, n, (0.03, 0.07, 0.01), m['role']('Blaze', 'joint'), 'head', e=0.6, lift=-0.001)
    add(kit.superellipsoid('Bib', (0.06, 0.03, 0.06), 0.5, 0.6, seg=(20, 12), location=(0, -0.17, 0.17)),
        m['role']('Blaze', 'joint'), 'body')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k in range(2):
            p, n = c.head_point((side * (1.0 - 0.1 * k), -0.18 - 0.1 * k, -0.3 - 0.2 * k))
            c.panel(f'Tuft.{sfx}{k}', p, n, (0.04 - 0.008 * k, 0.03, 0.014), m['role']('Blaze', 'joint'), 'head',
                    e=0.5, lift=0.002)


def build(look='ink', flame=None):
    return catkit.build(look, flame, P, [marks], name='Munchkin')
