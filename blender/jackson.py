"""Trike, the crew's robot Jackson's chameleon: a little triceratops. Three chunky forward
horns on the face (one on the nose, one over each eye, each with a lit tip, Dot5), a saw-tooth
crest of plates down the back (lit tips Dot3), bright green, no casque. Flank panels Dot0-2,
tail tip Dot4. Faces -Y; built on the chameleon kit (chamkit.py).
"""

from mathutils import Vector

import chamkit
import kit

FACE = 'jackson'
PREVIEW = dict(lift=0.0, width=0.7)

P = dict(
    face=FACE,
    body=dict(rx=0.044, ry=0.125, rz=0.092, cz=0.15),
    head=dict(hs=1.25, kx=1.0, ky=1.1, kz=1.0),
    casque=dict(kind='none'),
    crest=dict(count=0),
    spine='saw',
    spine_n=10,
    tongue=dict(length=0.42, r=0.0195, pad=0.032),
    panels=(('disc', -0.085, 0.006, 0.018, 0.026, 0), ('disc', -0.015, 0.0, 0.028, 0.038, 1),
            ('disc', 0.055, -0.012, 0.02, 0.028, 2)),
    legs=dict(r0=0.016, r1=0.012, toe=1.05),
    tail=dict(turns=1.6),
)


def horns(add, m, g):
    """Nose horn and a horn over each eye: tapered, ringed, forward, lit tips."""
    hr = g.hr
    horn = m['role']('Horn', 'joint')
    specs = [('Nose', 0.0, g.hy - hr[1] * 0.78, g.hz + 0.03, (0, -1, 0.95), 0.1, 0.024)]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        specs.append((f'Brow.{sfx}', side * 0.036, g.hy - hr[1] * 0.1, g.hz + 0.043, (side * 0.3, -1, 0.42), 0.15,
                      0.026))
    for name, x, y, z, d, length, r in specs:
        d = Vector(d).normalized()
        a = Vector((x, y, z))
        tip = a + d * length
        mid = a + d * length * 0.5
        add(kit.tube(f'Horn{name}', [tuple(a), tuple(mid), tuple(tip)], [r, r * 0.7, r * 0.34], ring=14)[0], horn, 'head')
        for k, u in enumerate((0.3, 0.6)):
            p = a + d * length * u
            add(kit.torus(f'HornRing{name}{k}', r * (1 - 0.5 * u) * 1.12, 0.0028, seg=(16, 6), location=tuple(p),
                          rotation=tuple(chamkit.along((0, 0, 0), tuple(d)))), m['bezel'], 'head')
        add(kit.superellipsoid(f'HornTip{name}', (0.0135,) * 3, seg=(14, 8), location=tuple(tip + d * 0.002)),
            m['dot'](5), 'head')
        add(kit.superellipsoid(f'HornBase{name}', (r * 1.25,) * 3, seg=(14, 8), location=tuple(a)), m['joint'], 'head')


def build(look='ink', flame=None):
    return chamkit.build(look, flame, P, extras=(horns,), name='Jackson')
