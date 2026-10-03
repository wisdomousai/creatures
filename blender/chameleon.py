"""Hue, the crew's robot veiled chameleon, read from the side: a long, laterally flat body
carried high on thin legs, a head with a very tall helmet casque (her signature), a small
screen face on the front of the snout and a turret eye on each SIDE of the head, mitten grips
on every foot, and a tail wound into a tight smooth spiral that can uncurl. A very long jointed tongue
with a sticky pad stays folded inside the head until a trick.

The colour is in the three round flank panels on each side (Dot0 shoulder, Dot1 the big middle
one, Dot2 hip), which shift hue on the site (and tone in the ink and paper looks), the four
lit gold bands between them (Dot5), a lit crest up the casque (Dot3) and the tail tip (Dot4).
Faces -Y like the rest of the crew. Built on the chameleon kit (chamkit.py).

Rig: root, body, head, eye.L/R, jaw, tg.1-7 + tg.tip (tongue), fly + flywing.L/R, leg.FL/FR/BL/BR with shin.*, tail.1-10.
"""

import chamkit

FACE = 'chameleon'
PREVIEW = dict(lift=0.0, width=0.7)

P = dict(
    casque=dict(kind='helmet', H=0.19, L=1.1),
    crest=dict(count=6),
    tongue=dict(length=0.46, r=0.01875, pad=0.031),
    panels=(('disc', -0.095, 0.006, 0.022, 0.032, 0), ('disc', -0.02, 0.0, 0.036, 0.048, 1),
            ('disc', 0.06, -0.012, 0.026, 0.036, 2),
            ('bar', -0.138, 0.0, 0.0045, 0.048, 5), ('bar', -0.056, 0.0, 0.0045, 0.062, 5),
            ('bar', 0.022, -0.004, 0.0045, 0.064, 5), ('bar', 0.108, -0.016, 0.0045, 0.05, 5)),
)


def build(look='ink', flame=None):
    return chamkit.build(look, flame, P, name='Chameleon')
