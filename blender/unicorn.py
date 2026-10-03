"""The crew's robot unicorn: a slim pony of a toy on long legs with ball-joint knees and round
hooves, an arched neck that bends in two places, a small head with a screen face and upright
ears. Her signature is the horn, a spiral of lit rings round a pale cone (Dot2 up to Dot9,
one light each, a rainbow run in the colour look), and a mane of rounded fins standing along
her neck, each lit in turn (Dot10 to Dot17). Her tail is a plume of the same colours; a
sparkle-shaped cutie mark glows on her flank (Dot18). A 'star' bone at the horn tip holds a
little star that floats up and fades when she casts one. Faces -Y like the rest of the crew;
about 1.15 m to the tip of the horn.
"""

import math

from mathutils import Vector

import catkit
import hoofkit as hk
import kit

FACE = 'unicorn'
PREVIEW = dict(lift=0.0, width=0.7)

RAINBOW = ('#ff5d6c', '#ff9a4d', '#ffd84d', '#6fdc7a', '#4dc6ff', '#6f7bff', '#c06bff', '#ff7ad9')
RINGS = 8
HORN_AT = (0, -0.355, 1.0)  # base of the horn on her forehead
HORN_TILT = math.radians(26)  # leaning forward of straight up
HORN_LEN = 0.24

P = dict(
    face=FACE,
    body=dict(radii=(0.14, 0.28, 0.14), center=(0, 0.1, 0.52), e=0.5),
    shells=[dict(name='Croup', radii=(0.125, 0.12, 0.13), center=(0, 0.3, 0.57), e=0.55)],
    hips=(0.3, 0.53),
    neck=dict(points=[(0, -0.14, 0.62), (0, -0.2, 0.74), (0, -0.25, 0.86)], r=(0.08, 0.058), base=(-0.13, 0.6),
              bones=2, top=(-0.215, 0.78)),
    head=dict(radii=(0.105, 0.125, 0.105), center=(0, -0.3, 0.93), e=0.62),
    # 1.45:1, like the unicorn's face layout (512 x 320 is 1.6; the glass is a little taller)
    screen=dict(radii=(0.078, 0.03, 0.054), center=(0, -0.41, 0.945), bezel=0.008),
    muzzle=dict(radii=(0.058, 0.07, 0.052), center=(0, -0.395, 0.868), e=0.45),
    nose=dict(radii=(0.042, 0.012, 0.03), center=(0, -0.458, 0.858), e=0.5),
    jaw=dict(radii=(0.046, 0.06, 0.02), center=(0, -0.39, 0.805), e=0.5, pivot=(0, -0.32, 0.835), pin=0.075),
    ear=dict(dir=(0.28, 0.0, 1.0), length=0.11, width=0.05, thick=0.02, x=0.055, y=-0.27, z=1.0, e=0.6, taper=1.3),
    leg=dict(x=0.085, front=-0.14, back=0.31, top=0.44, knee=0.24, r=(0.036, 0.03), ball=0.04,
             hoof=dict(radii=(0.04, 0.048, 0.03), split=False)),
    tail=dict(points=[(0, 0.4, 0.62), (0, 0.5, 0.56), (0, 0.55, 0.44), (0, 0.55, 0.3)], bones=4, r=(0.022, 0.012),
              tuft=dict(r=0.045, squash=(0.8, 1.2, 2.4), role='Mane')),
    mane=dict(n=8, along=(0.0, 1.0), size=0.062, grow=-0.15, lit=True, dot0=10, width=0.02, lean=0.55,
              bones=('neck', 'head'), split=0.5),
    bones_extra=[('star', (0, -0.46, 1.22), (0, -0.46, 1.28), None)],
)


def rainbow_dot(m, i, look):
    """Light i of the horn: its own colour in the colour look, the shared light otherwise."""
    if look != 'colour':
        return m['dot'](2 + i)
    colour = RAINBOW[i % len(RAINBOW)]
    return kit.material(f'Dot{2 + i}', colour, roughness=0.5, emission=colour, emission_strength=1.6)


def rainbow_dot_for(look, index, k):
    """Light `index` of the mane: the rainbow's k-th colour in the colour look."""
    if look != 'colour':
        return None
    colour = RAINBOW[k % len(RAINBOW)]
    return kit.material(f'Dot{index}', colour, roughness=0.5, emission=colour, emission_strength=1.6)


def build(look='ink', flame=None):
    m_cache = {}
    P['mane']['material'] = lambda i: m_cache.setdefault(i, rainbow_dot_for(look, 10 + i, i + 3))
    return hk.build(look, flame, P, [horn(look), cutie, face_bits, star], name='Unicorn')


def horn(look):
    def put(add, m, c):
        d = Vector((0, -math.sin(HORN_TILT), math.cos(HORN_TILT)))
        base = Vector(HORN_AT)
        # A pale cone, tapering to a point.
        cone = kit.lathe('Horn', [(0.0, HORN_LEN), (0.006, HORN_LEN - 0.02), (0.02, 0.05), (0.028, 0.0), (0.0, -0.006)],
                         seg=20)
        catkit.orient(cone, base, d)
        add(cone, m['role']('Horn', 'joint'), 'head')
        # A collar where it meets her head, then the spiral: lit rings, each a little tipped.
        o = kit.torus('HornFoot', 0.034, 0.008, seg=(18, 6))
        catkit.orient(o, base - d * 0.002, d)
        add(o, m['bezel'], 'head')
        for i in range(RINGS):
            f = (i + 0.7) / (RINGS + 0.4)
            p = base + d * (HORN_LEN * f * 0.96)
            r = 0.028 * (1 - f) + 0.004
            ring = kit.torus(f'HornRing.{i}', r + 0.002, 0.0072 * (1 - f * 0.4), seg=(16, 6))
            tip = Vector(d)
            # Each ring leans a little to alternate sides: a spiral, not a stack.
            side = Vector((math.cos(i * 1.35), 0, 0)) * 0.16
            catkit.orient(ring, p, (tip + side).normalized())
            add(ring, rainbow_dot(m, i, look), 'head')
        # A pale tip.
        add(kit.superellipsoid('HornTip', (0.0065,) * 3, seg=(10, 8), location=tuple(base + d * HORN_LEN)),
            m['role']('Horn', 'joint'), 'head')

    return put


def cutie(add, m, c):
    """A sparkle on each flank: crossed thin plates, a small bright core (Dot18)."""
    for side in (1, -1):
        p, n = c.body_point((side * 1.0, 0.55, 0.0), lift=0.002)
        for k, ang in enumerate((0.0, math.pi / 2, math.pi / 4)):
            s = 0.045 if k < 2 else 0.028
            c.panel(f'Sparkle.{side}.{k}', p, n, (s, 0.006, 0.0045), m['dot'](18), 'body', e=0.6, spin=ang)
        c.panel(f'SparkleCore.{side}', p, n, (0.011, 0.011, 0.006), m['bezel'], 'body', e=0.8, lift=0.002)
    # Seams and a spine of little plates, like the others.
    import dogkit as dk

    b = P['body']
    dk.seam(add, m, 'Girth', b['center'], b['radii'], b['e'], -0.05, 'body', dz=0.04)
    dk.seam(add, m, 'Flank', b['center'], b['radii'], b['e'], 0.16, 'body', dz=0.04)
    for k, (y, z) in enumerate(((-0.04, 0.696), (0.06, 0.7), (0.16, 0.7))):
        add(kit.superellipsoid(f'Spine.{k}', (0.022, 0.034, 0.008), 0.5, 0.5, seg=(14, 8), location=(0, y, z)),
            m['joint'], 'body')


def face_bits(add, m, c):
    """Nostrils on the nose plate, a blaze on the forehead, rivets on the cheeks."""
    nz = P['nose']
    cx, cy, cz = nz['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.008, 0.006, 0.011), 0.6, 0.6, seg=(10, 8),
                               location=(side * 0.027, cy - nz['radii'][1] + 0.002, cz - 0.004)), m['bezel'], 'head')
        c.bolt(f'Cheek.{side}', (side * 0.098, -0.28, 0.9), 0.007, 'head')
    p, n = c.head_point((0, -0.4, 0.95), lift=-0.002)
    c.panel('Blaze', p, n, (0.012, 0.026, 0.005), m['role']('Mane', 'joint'), 'head', e=0.6)


def star(add, m, c):
    """The little star she casts: a flat four-point sparkle on its own bone, hidden till then."""
    centre = (0, -0.46, 1.22)
    for k, (rx, rz) in enumerate(((0.035, 0.009), (0.009, 0.035), (0.02, 0.006))):
        add(kit.superellipsoid(f'Star.{k}', (rx, 0.007, rz), 0.5, 0.5, seg=(12, 8), location=centre,
                               rotation=(0, 0.0 if k < 2 else math.pi / 4, 0)), m['dot'](19), 'star')
