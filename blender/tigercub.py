"""Rawr, the crew's robot tiger cub: a cub on the cats' kit (catkit.py), so it has the same rig
as Pixel and Bun and does their tricks. All head and paws: an oversized head as round as a
pumpkin, a small chubby body and short legs ending in big round paws, round ears (not pointed)
with a white spot on the back of each that lights up, a thick striped tail with a dark tip, a
cream ruff and muzzle pads. The stripes are grooves: dark bars set into the shell, across the
back, on the crown (the cub's 王), down the cheeks and round the tail. The collar tag is the
beacon. Faces -Y like the rest of the crew; about 0.52 m to the ear tips.
Lights: Dot0 the tail tip, Dot1 and Dot2 the tail's collars, Dot3 the ear hinges, Dot4 the
whisker tips (as every cat built here), Dot5 the ear spots, Dot6 the forehead mark.
"""

import math

from mathutils import Euler, Vector

import catkit
import kit

FACE = 'tigercub'
PREVIEW = dict(lift=0.0, width=0.55)

P = dict(
    face=FACE,
    head=dict(radii=(0.205, 0.17, 0.165), center=(0, -0.185, 0.335), e=0.72),
    screen=dict(radii=(0.158, 0.1, 0.108), center=(0, -0.285, 0.325), bezel=0.011, e=0.5),
    neckpart=dict(radii=(0.105, 0.09, 0.09), center=(0, -0.1, 0.225), e=0.7),
    body=dict(radii=(0.108, 0.19, 0.098), center=(0, 0.06, 0.16), e=0.62),
    # Round ears: a dome, not a cone.
    ear=dict(x=0.135, y=-0.17, z=0.47, tilt=0.45, inset=0.03,
             profile=[(0.0, 0.07), (0.02, 0.072), (0.04, 0.062), (0.055, 0.04), (0.063, 0.0)]),
    leg=dict(x=0.075, front=-0.085, back=0.17, top=0.125, bottom=0.04, r=0.037, r_top=0.042, hock=0.015),
    paw=dict(radii=(0.062, 0.074, 0.042), e=0.5, ahead=0.02),
    tail=[(0, 0.24, 0.18), (0, 0.33, 0.2), (0, 0.38, 0.27), (0, 0.38, 0.36)],
    tail_r=(0.036, 0.03),
    tail_bones=3,
    tail_rings=[(0.28, 0.4), (0.52, 0.64), (0.76, 1.01)],
    hips=(0.2, 0.16),
    neck=(-0.11, 0.22),
    collar=dict(center=(0, -0.1, 0.225), major=0.105, minor=0.014, tilt=0.5),
    tag=dict(r=0.025, center=(0, -0.2, 0.145)),
    whiskers=0.06,
    seam=0.003,
)


def arc(c, y, r_in, r_out, a0, a1, n=9, lift=0.002):
    """Points over the body at height y along it, from angle a0 to a1 (0 is the top, + toward
    the cub's left), lifted a hair off the shell."""
    b = P['body']
    pts = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        d = (b['radii'][0] * math.sin(a), y - b['center'][1], b['radii'][2] * math.cos(a))
        p, nrm = c.body_point(d, lift)
        pts.append(tuple(p))
    return pts


def stripes(add, m, c):
    """Dark grooves across the back and down the flanks, tapering at both ends, and the 王
    on the crown with cheek bars."""
    dark = m['role']('Stripe', 'joint')
    for i, y in enumerate((-0.1, -0.02, 0.07, 0.16, 0.24)):
        for side, a0, a1 in ((1, 0.15, 2.0), (-1, -0.15, -2.0)):
            pts = arc(c, y + 0.012 * side, 0, 0, a0 + 0.12 * (i % 2), a1, 9)
            w = 0.0085 - 0.0006 * i
            add(kit.tube(f'Stripe.{i}{"L" if side > 0 else "R"}', pts, [0.002, w * 0.8, w, w, w * 0.9, w * 0.8, w * 0.6,
                                                                        w * 0.4, 0.002], ring=6)[0], dark, 'body')
    h = P['head']
    for k, (x, dy) in enumerate(((0.0, 0.0), (0.05, 0.06), (-0.05, 0.06))):
        p, n = c.head_point((x * 1.2, -0.25 + dy, 1.0))
        c.panel(f'Crown{k}', p, n, (0.012, 0.05 - 0.012 * abs(x) * 10, 0.005), dark, 'head', e=0.6, lift=-0.0005)
    # The forehead mark lights: a small lens on the brow.
    p, n = c.head_point((0.0, -0.55, 0.85))
    c.panel('Brow', p, n, (0.02, 0.012, 0.006), m['dot'](6), 'head', e=0.6, lift=0.001)
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k, dz in enumerate((-0.05, 0.12)):
            p, n = c.head_point((side * 1.0, -0.18 - 0.1 * k, 0.05 + dz))
            c.panel(f'Cheek.{sfx}{k}', p, n, (0.034, 0.008, 0.006), dark, 'head', e=0.6, spin=0.9 * side, lift=-0.0005)


def ruff(add, m, c):
    """A cream ruff round the cheeks and chubby muzzle pads under the screen, a pale tummy."""
    cream = m['role']('Cheek', 'joint')
    hc, hr = P['head']['center'], P['head']['radii']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Ruff.{sfx}', (0.065, 0.05, 0.075), 0.6, 0.6, seg=(20, 12),
                               location=(side * (hr[0] * 0.86), hc[1] - 0.025, hc[2] - 0.075)), cream, 'head')
        add(kit.superellipsoid(f'Muzzle.{sfx}', (0.05, 0.036, 0.04), 0.7, 0.8, seg=(14, 10),
                               location=(side * 0.045, hc[1] - hr[1] * 0.78, hc[2] - hr[2] * 0.78)), cream, 'head')
    add(kit.superellipsoid('Tummy', (0.06, 0.02, 0.05), 0.5, 0.6, seg=(20, 10), location=(0, -0.118, 0.145)),
        cream, 'body')


def ear_spots(add, m, c):
    """The white spot on the back of each round ear, a lit disc in a dark ring."""
    e = P['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        rot = Euler((e.get('lean', 0.0), side * e['tilt'], 0))
        base = Vector((side * e['x'], e['y'], e['z'] - 0.03))
        for name, radii, off, mat in (('EarRing', (0.036, 0.006, 0.036), 0.0305, m['bezel']),
                                      ('EarSpot', (0.027, 0.006, 0.027), 0.0345, m['dot'](5))):
            o = kit.superellipsoid(f'{name}.{sfx}', radii, 0.4, 0.4, seg=(20, 8))
            v = Vector((0, off, 0.03))
            v.rotate(rot)
            o.location = tuple(base + v)
            o.rotation_euler = (rot.x + math.pi * 0.0, rot.y, 0)
            c.add(o, mat, f'ear.{sfx}')


def build(look='ink', flame=None):
    return catkit.build(look, flame, P, [stripes, ruff, ear_spots], name='TigerCub')
