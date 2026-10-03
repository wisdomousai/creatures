"""The crew's robot alpaca: a tall, slim-legged toy with a barrel of a fleece body, a long
neck that bends in two places and wears three lit rings (Dot2 to Dot4, which pulse when it
hums), a small head with a screen face and a nose plate, banana ears that curve out and up,
and a fluffy topknot pom on its forehead. A bright bead (Dot5) on a `spit` bone at the mouth
is what it spits, hidden until then. Faces -Y like the rest of the crew; about 1.3 m to the
tip of the topknot.
"""

import catkit
import hoofkit as hk
import kit
from mathutils import Vector

FACE = 'alpaca'
PREVIEW = dict(lift=0.0, width=0.6)

NECK = [(0, -0.15, 0.7), (0, -0.2, 0.84), (0, -0.25, 0.98), (0, -0.27, 1.1)]

P = dict(
    face=FACE,
    body=dict(radii=(0.15, 0.27, 0.16), center=(0, 0.08, 0.64), e=0.55),
    hips=(0.28, 0.64),
    neck=dict(points=NECK, r=(0.075, 0.05), base=(-0.13, 0.72), bones=2, top=(-0.24, 1.0)),
    head=dict(radii=(0.092, 0.11, 0.1), center=(0, -0.3, 1.16), e=0.62),
    # 1.6:1, like the alpaca's face layout (512 x 320)
    screen=dict(radii=(0.072, 0.026, 0.045), center=(0, -0.395, 1.175), bezel=0.008),
    muzzle=dict(radii=(0.05, 0.055, 0.042), center=(0, -0.38, 1.1), e=0.5),
    nose=dict(radii=(0.03, 0.011, 0.018), center=(0, -0.43, 1.09), e=0.6),
    jaw=dict(radii=(0.036, 0.048, 0.016), center=(0, -0.375, 1.045), pivot=(0, -0.31, 1.065), pin=0.07, e=0.5),
    ear=dict(dir=(0.3, 0.0, 1.0), length=0.13, width=0.04, thick=0.018, x=0.05, y=-0.265, z=1.24, e=0.6, taper=0.7,
             path=[(0, 0, 0), (0.04, 0.0, 0.05), (0.085, 0.01, 0.085), (0.12, 0.015, 0.1)], radii=0.03),
    leg=dict(x=0.09, front=-0.1, back=0.26, top=0.52, knee=0.28, r=(0.036, 0.028), ball=0.04,
             hoof=dict(radii=(0.036, 0.046, 0.026), split=True)),
    tail=dict(points=[(0, 0.33, 0.7), (0, 0.4, 0.66), (0, 0.43, 0.58)], bones=2, r=(0.022, 0.016),
              tuft=dict(r=0.04, squash=(1, 1.2, 1.4))),
    bones_extra=[('spit', (0, -0.44, 1.08), (0, -0.44, 1.12), None)],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [fleece, neck_rings, face_bits, spit], name='Alpaca')


def fleece(add, m, c):
    """A topknot pom on the forehead, a fluffy saddle on the back, a bib at the chest."""
    hk.pod_cluster(c, (0, -0.265, 1.275), 0.036, 'head', n=7, name='Topknot', spread=0.8, seed=5)
    hk.pod_cluster(c, (0, 0.1, 0.8), 0.07, 'body', n=9, name='Saddle', spread=2.2, seed=9)
    hk.pod_cluster(c, (0, -0.15, 0.58), 0.06, 'body', n=5, name='Bib', spread=1.4, seed=2)


def neck_rings(add, m, c):
    """Three lit rings round the neck (Dot2..Dot4), seated on the neck tube."""
    pts = [Vector(p) for p in NECK]
    for k, f in enumerate((0.3, 0.55, 0.8)):
        i = min(int(f * (len(pts) - 1)), len(pts) - 2)
        t = f * (len(pts) - 1) - i
        p = pts[i].lerp(pts[i + 1], t)
        d = (pts[i + 1] - pts[i]).normalized()
        r = 0.075 + (0.05 - 0.075) * f + 0.004
        o = kit.torus(f'NeckRing.{k}', r, 0.0095, seg=(26, 8))
        catkit.orient(o, p, d)
        add(o, m['dot'](2 + k), 'neck' if f > 0.35 else 'body')


def face_bits(add, m, c):
    """Nostrils on the nose plate, rivets on the cheeks."""
    nz = P['nose']
    cx, cy, cz = nz['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.005, 0.004, 0.007), 0.6, 0.6, seg=(8, 6),
                               location=(side * 0.011, cy - nz['radii'][1] + 0.001, cz - 0.002)), m['bezel'], 'head')
        c.bolt(f'Cheek.{side}', (side * 0.09, -0.29, 1.12), 0.0065, 'head')


def spit(add, m, c):
    """The little ball of light it spits: a bright bead on its own bone, hidden till then."""
    add(kit.superellipsoid('Spit', (0.03, 0.03, 0.03), 0.9, 0.9, seg=(12, 8), location=(0, -0.44, 1.1)),
        m['dot'](5), 'spit')
