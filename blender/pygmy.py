"""Twig, the crew's robot pygmy leaf chameleon: tiny (the site shows her at about half Hue's
size), brown and leaf-shaped. A flat, deep, pointed body like a dead leaf on short legs, a raised
midrib along each flank with vein grooves branching off it, a stubby short tail, small turrets, a
small casque. Three small amber lights on the midrib (Dot0-2), crest Dot3, tail tip Dot4.
Faces -Y; built on the chameleon kit (chamkit.py).
"""

import math

import chamkit
import kit

FACE = 'pygmy'
PREVIEW = dict(lift=0.0, width=0.7)

P = dict(
    face=FACE,
    outline=0.002,
    body=dict(rx=0.036, ry=0.125, rz=0.085, cy=0.02, cz=0.112, e=0.85),
    head=dict(hs=0.9, kx=0.95, ky=0.95, kz=0.95, fwd=0.04, up=0.03),
    casque=dict(kind='sweep', H=0.098, L=0.85),
    crest=dict(count=4),
    spine='none',
    tongue=dict(length=0.3, r=0.0093, pad=0.018),
    panels=(('disc', -0.062, 0.0, 0.012, 0.014, 0), ('disc', 0.0, 0.0, 0.012, 0.014, 1),
            ('disc', 0.062, 0.0, 0.012, 0.014, 2)),
    turret=dict(r=0.032, lens=0.0135),
    legs=dict(r0=0.014, r1=0.0105, toe=0.95, spread=0.034),
    tail=dict(r0=0.036, r1=0.017, turns=0.85, lead=0.015, tr0=0.021, tr1=0.012),
)


def surface_x(g, y, z, lift=0.0015):
    """Half-width of the body at (y, z): where the flank is."""
    b = g.b
    k = 2.0 / b['e']
    t = 1 - abs((y - b['cy']) / b['ry']) ** k - abs((z - b['cz']) / b['rz']) ** k
    return b['rx'] * max(t, 0.0) ** (b['e'] / 2) + lift


def leaf(add, m, g):
    """A raised midrib along each flank and vein grooves branching toward the tip."""
    b = g.b
    cy, cz = b['cy'], b['cz']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = [(side * (surface_x(g, y, cz) + 0.002), y, cz) for y in (cy - 0.105, cy - 0.05, cy, cy + 0.05, cy + 0.105)]
        add(kit.tube(f'Midrib.{sfx}', pts, [0.0035, 0.0055, 0.0065, 0.0055, 0.0035], ring=8)[0], m['joint'], 'body')
        for i, y in enumerate((cy - 0.07, cy - 0.025, cy + 0.02, cy + 0.065)):
            for k, dz in enumerate((1, -1)):
                y2, z2 = y - 0.032, cz + dz * (0.045 - 0.006 * i)
                pv = [(side * (surface_x(g, yy, zz) + 0.0018), yy, zz)
                      for yy, zz in ((y, cz), ((y + y2) / 2, (cz + z2) / 2), (y2, z2))]
                add(kit.tube(f'Vein.{sfx}{i}{k}', pv, [0.0024, 0.002, 0.0014], ring=6)[0], m['bezel'], 'body')
    # A leaf stalk where the tail leaves: a small ring.
    add(kit.torus('Stalk', 0.014, 0.004, seg=(16, 6), location=(0, cy + b['ry'] - 0.004, cz),
                  rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')


def build(look='ink', flame=None):
    return chamkit.build(look, flame, P, extras=(leaf,), name='Pygmy')
