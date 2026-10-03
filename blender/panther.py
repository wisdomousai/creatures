"""Flare, the crew's robot panther chameleon: the brightest colour shifter of all. A stockier
body than Hue's on thicker legs, a broad head with a low ridge casque, and flank panels made of
six upright bands (Dot0-2, Dot5-7) that sweep through every colour along the body, with a long
white lit stripe down the lower flank (Dot8). Crest Dot3, tail tip Dot4. Faces -Y; built on the
chameleon kit (chamkit.py).
"""

import math

import chamkit
import kit

FACE = 'panther'
PREVIEW = dict(lift=0.0, width=0.7)

BANDS = (0, 1, 2, 5, 6, 7)
P = dict(
    face=FACE,
    body=dict(rx=0.054, ry=0.135, rz=0.1, cz=0.14, e=0.55),
    head=dict(hs=1.1, kx=1.12, ky=1.0, kz=1.0),
    casque=dict(kind='ridge', H=0.1, L=1.2),
    crest=dict(count=5),
    panels=tuple(('bar', -0.1 + 0.04 * i, 0.0, 0.0135, 0.078 - 0.012 * abs(i - 2.5) ** 1.4, d)
                 for i, d in enumerate(BANDS)),
    turret=dict(r=0.042, lens=0.018),
    tongue=dict(length=0.42, r=0.02, pad=0.034),
    legs=dict(r0=0.0195, r1=0.0145, toe=1.18, spread=0.05),
    tail=dict(r0=0.062, r1=0.018, turns=1.5, tr0=0.023, tr1=0.008),
)


def stripe(add, m, g):
    """A long white lit stripe down each lower flank."""
    b = g.b
    for side in (1, -1):
        add(kit.superellipsoid(f'Stripe.{side}', (0.0125, 0.118, 0.0075), 0.5, 0.4, seg=(32, 10),
                               location=(side * b['rx'] * 0.92, b['cy'], b['cz'] - 0.052)), m['dot'](8), 'body')
        add(kit.torus(f'StripeRim.{side}', 0.0075, 0.0028, seg=(16, 6),
                      location=(side * b['rx'] * 0.99, b['cy'] - 0.12, b['cz'] - 0.052), rotation=(0, math.pi / 2, 0)),
            m['bezel'], 'body')


def build(look='ink', flame=None):
    return chamkit.build(look, flame, P, extras=(stripe,), name='Panther')
