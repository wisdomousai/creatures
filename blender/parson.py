"""Sage, the crew's robot Parson's chameleon: the giant (the site shows him at about 1.4 times
Hue). Heavy: a deep long body on thick legs with big feet, a broad head with a low casque, big
rounded ear flaps (the occipital lobes, each a bezelled plate with a lit boss, Dot5) splayed out
behind the head, and big orange turret eyes (colour role Turret). Deep turquoise-green; flank
panels Dot0-2, crest Dot3, tail tip Dot4. Faces -Y; built on the chameleon kit (chamkit.py).
"""

import math

import chamkit
import kit

FACE = 'parson'
PREVIEW = dict(lift=0.0, width=0.75)

P = dict(
    face=FACE,
    body=dict(rx=0.058, ry=0.15, rz=0.104, cy=0.03, cz=0.15, e=0.55),
    head=dict(hs=1.2, kx=1.08, ky=1.05, kz=1.0, fwd=0.045),
    casque=dict(kind='ridge', H=0.085, L=1.15),
    crest=dict(count=4),
    tongue=dict(length=0.62, r=0.0255, pad=0.043),
    panels=(('disc', -0.105, 0.006, 0.024, 0.034, 0), ('disc', -0.02, 0.0, 0.04, 0.054, 1),
            ('disc', 0.07, -0.012, 0.03, 0.04, 2)),
    turret=dict(r=0.054, lens=0.022, role='Turret'),
    legs=dict(r0=0.022, r1=0.0165, toe=1.3, spread=0.054),
    tail=dict(r0=0.074, r1=0.02, turns=1.6, tr0=0.026, tr1=0.009),
)

SPLAY = 0.85


def flaps(add, m, g):
    """The occipital lobes: a big rounded plate behind each side of the head, splayed out."""
    hr = g.hr
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x, y, z = side * (hr[0] + 0.012), g.hy + hr[1] * 1.15, g.hz + 0.012
        rot = (0, 0, -side * SPLAY)
        add(kit.superellipsoid(f'Flap.{sfx}', (0.012, 0.07, 0.08), 0.5, 0.75, seg=(28, 18), location=(x, y, z),
                               rotation=rot), m['joint'], 'head')
        add(kit.torus(f'FlapRim.{sfx}', 0.075, 0.0045, seg=(32, 6), location=(x, y, z),
                      rotation=(0, math.pi / 2, -side * SPLAY)), m['bezel'], 'head')
        add(kit.superellipsoid(f'FlapBoss.{sfx}', (0.009, 0.036, 0.042), 0.5, 0.8, seg=(20, 12),
                               location=(x + side * 0.0105, y, z), rotation=rot), m['dot'](5), 'head')
        add(kit.superellipsoid(f'FlapHinge.{sfx}', (0.008,) * 3, seg=(12, 8),
                               location=(side * (hr[0] + 0.006), g.hy + hr[1] * 0.45, z)), m['joint'], 'head')


def build(look='ink', flame=None):
    return chamkit.build(look, flame, P, extras=(flaps,), name='Parson')
