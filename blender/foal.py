"""The crew's robot foal: a newborn on stilts. A short, small barrel of a body on four very long
thin legs with ball-joint knees and round hooves (far leggier than Opal the unicorn), a big
head on a short upright neck with a screen face with huge eyes, big upright ears, a short fuzzy
mane of small plates standing up the neck, and a little brush of a tail. A white blaze and white
socks on a chestnut coat; a small lit star on the forehead (Dot2). Faces -Y like the rest of the
crew; about 0.98 m to the ear tips.
"""

import hoofkit as hk
import kit

FACE = 'foal'
PREVIEW = dict(lift=0.0, width=0.5)

NECK = [(0, -0.1, 0.52), (0, -0.15, 0.6), (0, -0.18, 0.68)]

P = dict(
    face=FACE,
    body=dict(radii=(0.1, 0.17, 0.1), center=(0, 0.05, 0.48), e=0.58),
    hips=(0.17, 0.48),
    neck=dict(points=NECK, r=(0.058, 0.05), base=(-0.09, 0.52)),
    head=dict(radii=(0.115, 0.12, 0.11), center=(0, -0.22, 0.76), e=0.62),
    # 1.5:1, like the foal's face layout (512 x 340)
    screen=dict(radii=(0.088, 0.028, 0.06), center=(0, -0.333, 0.775), bezel=0.008),
    muzzle=dict(radii=(0.05, 0.058, 0.044), center=(0, -0.305, 0.69), e=0.5),
    nose=dict(radii=(0.034, 0.012, 0.022), center=(0, -0.36, 0.685), e=0.55),
    jaw=dict(radii=(0.036, 0.05, 0.016), center=(0, -0.31, 0.64), e=0.5, pivot=(0, -0.24, 0.66), pin=0.08),
    ear=dict(dir=(0.35, 0.0, 1.0), length=0.13, width=0.06, thick=0.02, x=0.07, y=-0.19, z=0.84, e=0.6, taper=1.0),
    leg=dict(x=0.07, front=-0.1, back=0.2, top=0.4, knee=0.22, r=(0.028, 0.022), ball=0.032, role='Leg',
             hoof=dict(radii=(0.03, 0.036, 0.024), split=False)),
    tail=dict(points=[(0, 0.2, 0.5), (0, 0.26, 0.45), (0, 0.28, 0.36)], bones=3, r=(0.016, 0.01),
              tuft=dict(r=0.032, squash=(0.9, 1.0, 2.2), role='Mane')),
    mane=dict(n=6, along=(0.12, 1.0), size=0.045, grow=0.0, lit=False, width=0.018, lean=0.5,
              bones=('head', 'head'), split=0.45),
    bones_extra=[],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [star_and_blaze, face_bits, flank], name='Foal')


def star_and_blaze(add, m, c):
    """A white blaze down the forehead and a small lit star above the screen (Dot2)."""
    p, n = c.head_point((0, -0.5, 0.95), lift=-0.002)
    c.panel('Star', p, n, (0.016, 0.016, 0.005), m['dot'](2), 'head', e=0.5, spin=0.785)
    c.panel('Star2', p, n, (0.024, 0.008, 0.0045), m['dot'](2), 'head', e=0.5)
    p, n = c.head_point((0, -0.9, -0.35), lift=-0.002)
    c.panel('Blaze', p, n, (0.016, 0.03, 0.005), m['role']('Blaze', 'joint'), 'head', e=0.6)


def face_bits(add, m, c):
    nz = P['nose']
    cx, cy, cz = nz['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.006, 0.005, 0.009), 0.6, 0.6, seg=(8, 6),
                               location=(side * 0.016, cy - nz['radii'][1] + 0.001, cz - 0.003)), m['bezel'], 'head')
        c.bolt(f'Cheek.Bolt.{side}', (side * 0.112, -0.24, 0.73), 0.0075, 'head')


def flank(add, m, c):
    """Seams and a spine plate or two on the small body."""
    import dogkit as dk

    b = P['body']
    dk.seam(add, m, 'Girth', b['center'], b['radii'], b['e'], -0.03, 'body', dz=0.03)
    for k, (y, z) in enumerate(((0.0, 0.58), (0.1, 0.585))):
        add(kit.superellipsoid(f'Spine.{k}', (0.018, 0.03, 0.007), 0.5, 0.5, seg=(14, 8), location=(0, y, z)),
            m['joint'], 'body')
