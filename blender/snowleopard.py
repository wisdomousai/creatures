"""Flurry, the crew's robot snow leopard cub: a cub on the cats' kit (catkit.py), so it has the same
rig as Pixel, Bun and Rawr the tiger cub and does their tricks. Pale smoky grey, all head and
paws like a cub (big round head, small round ears with a dark back, big furry paws, cream cheek
ruffs and muzzle pads), dark rosette rings along its back and flanks (each a thin ring set on the
shell) and spots on the head, and the signature: a HUGE thick tail almost as long as its body,
banded with dark rosettes and a dark tip, that it carries curled up over its back. A blue collar
tag is the beacon. Faces -Y like the rest of the crew; about 0.5 m to the ear tips.
Lights: Dot0 the tail tip, Dot1 and Dot2 the tail's collars, Dot3 the ear hinges, Dot4 the
whisker tips (as every cat built here), Dot5 the forehead lens.
"""

import math

import catkit
import kit

FACE = 'snowleopard'
PREVIEW = dict(lift=0.0, width=0.55)

P = dict(
    face=FACE,
    head=dict(radii=(0.205, 0.17, 0.165), center=(0, -0.185, 0.335), e=0.72),
    screen=dict(radii=(0.158, 0.1, 0.108), center=(0, -0.285, 0.325), bezel=0.011, e=0.5),
    neckpart=dict(radii=(0.105, 0.09, 0.09), center=(0, -0.1, 0.225), e=0.7),
    body=dict(radii=(0.112, 0.2, 0.1), center=(0, 0.07, 0.16), e=0.62),
    # Small round ears: a low dome.
    ear=dict(x=0.14, y=-0.17, z=0.465, tilt=0.5, inset=0.03,
             profile=[(0.0, 0.055), (0.018, 0.057), (0.034, 0.05), (0.046, 0.032), (0.052, 0.0)]),
    leg=dict(x=0.078, front=-0.085, back=0.18, top=0.125, bottom=0.04, r=0.039, r_top=0.045, hock=0.015),
    paw=dict(radii=(0.07, 0.082, 0.045), e=0.5, ahead=0.022),
    # The tail: nearly as long as the body, thick, up in a curl over the back.
    tail=[(0, 0.26, 0.17), (0, 0.4, 0.18), (0, 0.52, 0.23), (0, 0.55, 0.33), (0, 0.48, 0.42), (0, 0.4, 0.44)],
    tail_r=(0.068, 0.088),
    tail_bones=4,
    cap=0.6,
    tail_rings=[(0.16, 0.24), (0.38, 0.46), (0.6, 0.68), (0.82, 1.01)],
    hips=(0.22, 0.16),
    neck=(-0.11, 0.22),
    collar=dict(center=(0, -0.1, 0.225), major=0.105, minor=0.014, tilt=0.5),
    tag=dict(r=0.025, center=(0, -0.2, 0.145)),
    whiskers=0.06,
    seam=0.003,
)


def rosettes(add, m, c):
    """Dark rings set on the shell along the back and flanks, big on the haunches, smaller on
    the shoulders, and a few round spots on the head and cheeks."""
    dark = m['role']('Rosette', 'joint')
    b = P['body']
    rx, ry, rz = b['radii']
    cy = b['center'][1]
    n = 0
    for yi, y in enumerate((-0.07, 0.04, 0.15, 0.26)):
        size = 0.026 + 0.004 * yi
        for ai, a in enumerate((0.3, 0.85, 1.4, 1.95)):
            for side, sfx in ((1, 'L'), (-1, 'R')):
                jitter = 0.14 * ((yi + ai) % 2) * side
                d = (side * rx * math.sin(a + jitter), (y + 0.016 * ai * side) - cy, rz * math.cos(a + jitter))
                p, nrm = c.body_point(d, 0.0)
                c.ring(f'Rosette.{n}', p, nrm, size, 0.0075, dark, 'body', seg=(16, 5), spin=0.0, lift=0.0005)
                n += 1
    # A pale smoky tummy plate is the paler belly; the head wears round spots and cheek bars.
    hr = P['head']['radii']
    for k, (x, z) in enumerate(((0.0, 0.92), (0.38, 0.84), (-0.38, 0.84), (0.7, 0.62), (-0.7, 0.62))):
        p, nrm = c.head_point((x, -0.12, z))
        c.panel(f'HeadSpot.{k}', p, nrm, (0.016, 0.016, 0.005), dark, 'head', e=0.7, lift=-0.0005)
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, dz in enumerate((-0.05, 0.12)):
            p, nrm = c.head_point((side * 1.0, -0.22 - 0.1 * k, 0.04 + dz))
            c.panel(f'Cheek.{sfx}{k}', p, nrm, (0.026, 0.007, 0.005), dark, 'head', e=0.6, spin=0.9 * side, lift=-0.0005)
    p, nrm = c.head_point((0.0, -0.55, 0.85))
    c.panel('Brow', p, nrm, (0.02, 0.012, 0.006), m['dot'](5), 'head', e=0.6, lift=0.001)


def ruff(add, m, c):
    """A thick cream ruff round the cheeks and chubby muzzle pads under the screen."""
    cream = m['role']('Cheek', 'joint')
    hc, hr = P['head']['center'], P['head']['radii']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Ruff.{sfx}', (0.07, 0.055, 0.08), 0.6, 0.6, seg=(20, 12),
                               location=(side * (hr[0] * 0.87), hc[1] - 0.025, hc[2] - 0.078)), cream, 'head')
        add(kit.superellipsoid(f'Muzzle.{sfx}', (0.05, 0.036, 0.04), 0.7, 0.8, seg=(14, 10),
                               location=(side * 0.045, hc[1] - hr[1] * 0.78, hc[2] - hr[2] * 0.78)), cream, 'head')
    add(kit.superellipsoid('Tummy', (0.06, 0.02, 0.05), 0.5, 0.6, seg=(20, 10), location=(0, -0.125, 0.145)), cream, 'body')


def build(look='ink', flame=None):
    return catkit.build(look, flame, P, [rosettes, ruff], name='SnowLeopard')
