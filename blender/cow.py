"""The crew's robot cow: a big friendly barrel of a toy on four sturdy legs with ball-joint
knees and split hooves. A wide head with a screen face and, under it, a big flat nose plate
that is a speaker: a grille of lit slots (Dot2) that glows when she moos, and a jaw that
chews sideways. Short curved horns, flat ears out to the sides, a collar with a bell
(the beacon) on its own bone so it swings and rings, and a tail with a tuft on its tip
(Dot0). Her signature is the raised black patch plates on her barrel and head; an udder
pod with four teats under her. Faces -Y like the rest of the crew; about 0.95 m to the horn
tips.
"""

import math

import hoofkit as hk
import kit

FACE = 'cow'
PREVIEW = dict(lift=0.0, width=0.8)

P = dict(
    face=FACE,
    body=dict(radii=(0.19, 0.36, 0.2), center=(0, 0.07, 0.52), e=0.5),
    hips=(0.34, 0.54),
    neck=dict(points=[(0, -0.2, 0.58), (0, -0.3, 0.65), (0, -0.37, 0.72)], r=(0.145, 0.125), base=(-0.2, 0.6)),
    head=dict(radii=(0.16, 0.15, 0.15), center=(0, -0.42, 0.72), e=0.62),
    # 1.7:1, like the cow's face layout (512 x 300)
    screen=dict(radii=(0.12, 0.03, 0.07), center=(0, -0.565, 0.75), bezel=0.009),
    muzzle=dict(radii=(0.12, 0.085, 0.075), center=(0, -0.585, 0.64), e=0.42),
    nose=dict(radii=(0.1, 0.022, 0.058), center=(0, -0.665, 0.635), e=0.5),
    jaw=dict(radii=(0.09, 0.07, 0.022), center=(0, -0.6, 0.565), e=0.5, pivot=(0, -0.48, 0.6), pin=0.12),
    ear=dict(dir=(1, 0.18, 0.05), length=0.14, width=0.08, thick=0.022, x=0.15, y=-0.4, z=0.77, spin=math.pi / 2),
    horns=dict(x=0.09, y=-0.4, z=0.855, length=0.12, r=0.022, start=60, end=8, lean=0),
    leg=dict(x=0.12, front=-0.2, back=0.3, top=0.42, knee=0.22, r=(0.05, 0.04), ball=0.052,
             hoof=dict(radii=(0.046, 0.056, 0.032), split=True)),
    tail=dict(points=[(0, 0.42, 0.63), (0, 0.5, 0.56), (0, 0.52, 0.42), (0, 0.52, 0.28)], bones=3, r=(0.026, 0.012),
              tuft=dict(r=0.036, squash=(1, 1, 1.7), role='Tuft')),
    collar=dict(center=(0, -0.285, 0.65), major=0.135, minor=0.022, tilt=0.88),
    bones_extra=[('bell', (0, -0.374, 0.55), (0, -0.374, 0.47), 'head')],
)


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [patches, udder, speaker, bell, details], name='Cow')


def patches(add, m, c):
    """The raised patch plates: big, soft-cornered, a few each side, one on the head."""
    patch = m['role']('Patch', 'joint')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        spots = ((0.0, 0.0, 0.7), (0.0, -0.55, 0.35), (0.0, 0.62, 0.1)) if side > 0 else \
                ((0.0, 0.1, 0.35), (0.0, -0.4, 0.6), (0.0, 0.7, 0.7))
        sizes = ((0.12, 0.14), (0.1, 0.09), (0.11, 0.1)) if side > 0 else ((0.11, 0.11), (0.1, 0.1), (0.1, 0.13))
        for k, (spot, size) in enumerate(zip(spots, sizes)):
            _, yy, zz = spot
            p, n = c.body_point((side * 1.0, yy, zz), lift=-0.01)
            c.panel(f'Patch.{sfx}{k}', p, n, (size[0] * 0.8, size[1] * 0.8, 0.02), patch, 'body', e=0.6, spin=0.3 * k)
    p, n = c.head_point((0.55, -0.35, 0.8), lift=-0.003)
    c.panel('Patch.Head', p, n, (0.055, 0.05, 0.012), patch, 'head', e=0.5, spin=0.5)
    # A patch round the right ear's root, on the other side from the head one.
    p, n = c.head_point((-0.95, 0.0, 0.3), lift=-0.003)
    c.panel('Patch.Cheek', p, n, (0.06, 0.07, 0.012), patch, 'head', e=0.5)


def udder(add, m, c):
    pink = m['role']('Nose', 'joint')
    add(kit.superellipsoid('Udder', (0.075, 0.09, 0.055), 0.6, 0.6, seg=(24, 16), location=(0, 0.3, 0.33)), pink, 'body')
    for ix, iy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        add(kit.superellipsoid(f'Teat.{ix}.{iy}', (0.012, 0.012, 0.022), 0.7, 0.7, seg=(10, 8),
                               location=(ix * 0.03, 0.3 + iy * 0.04, 0.275)), pink, 'body')


def speaker(add, m, c):
    """The nose plate's grille: lit slots, and a nostril each side."""
    nz = P['nose']
    cx, cy, cz = nz['center']
    front = cy - nz['radii'][1] + 0.002
    for k in range(5):
        add(kit.superellipsoid(f'Grille.{k}', (0.0042, 0.006, 0.034), 0.5, 0.5, seg=(10, 8),
                               location=((k - 2) * 0.017, front, cz + 0.002)), m['dot'](2), 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.011, 0.007, 0.016), 0.6, 0.6, seg=(12, 8),
                               location=(side * 0.07, front - 0.002, cz - 0.005)), m['bezel'], 'head')
    # Rivets on the muzzle, a line along the bridge.
    for side in (1, -1):
        for q in range(3):
            c.bolt(f'MuzzleBolt.{side}.{q}', (side * (0.105 - q * 0.004), -0.585 + q * 0.0, 0.7 - q * 0.03), 0.0055, 'head')


def bell(add, m, c):
    """A bell on the collar, its own bone: dome, rim, clapper."""
    cy, cz = -0.374, 0.552
    dome = kit.lathe('Bell', [(0.0, 0.036), (0.016, 0.034), (0.03, 0.012), (0.042, -0.03), (0.0, -0.03)], seg=24,
                     location=(0, cy, cz - 0.04))
    add(dome, m['beacon'], 'bell')
    add(kit.torus('BellRim', 0.042, 0.0045, seg=(28, 8), location=(0, cy, cz - 0.07)), m['bezel'], 'bell')
    add(kit.superellipsoid('Clapper', (0.011,) * 3, seg=(10, 8), location=(0, cy, cz - 0.075)), m['bezel'], 'bell')
    add(kit.torus('BellLoop', 0.012, 0.0035, seg=(14, 6), location=(0, cy, cz + 0.0), rotation=(math.pi / 2, 0, 0)),
        m['bezel'], 'head')


def details(add, m, c):
    """Seams round the barrel, rivets, a spine plate row, a hatch."""
    import dogkit as dk

    b = P['body']
    dk.seam(add, m, 'Fore', b['center'], b['radii'], b['e'], -0.14, 'body', dz=0.05)
    dk.seam(add, m, 'Hind', b['center'], b['radii'], b['e'], 0.17, 'body', dz=0.05)
    for k, (y, z) in enumerate(((-0.12, 0.724), (-0.02, 0.728), (0.08, 0.728), (0.18, 0.724), (0.28, 0.714))):
        add(kit.superellipsoid(f'Spine.{k}', (0.03, 0.036, 0.009), 0.5, 0.5, seg=(14, 8), location=(0, y, z)),
            m['joint'], 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'Hatch.{side}', (0.005, 0.03, 0.024), 0.3, 0.3, seg=(14, 8),
                               location=(side * (b['radii'][0] - 0.002), 0.28, 0.58)), m['bezel'], 'body')
