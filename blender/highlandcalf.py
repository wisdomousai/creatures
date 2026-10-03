"""The crew's robot Highland calf: a shaggy rusty-ginger toy on short legs, its whole barrel hung
with long rounded plates that fall down over its sides like a hairy skirt (a few rows, each
plate a flat soft-cornered slab), and over its eyes a fringe of long plates hanging from the
forehead, split into two halves on bones of their own (fringe.L, fringe.R) so it can toss them
aside; the screen face peeks out between the strands. Short, wide horn nubs with a lit tip
each (Dot2) stick out from under the fringe, ears out to the sides, a shaggy tail and a
chest bib of plates. Faces -Y like the rest of the crew; about 0.72 m to the top of the
fringe and horns.
"""

import catkit
import hoofkit as hk
import kit

FACE = 'highlandcalf'
PREVIEW = dict(lift=0.0, width=0.7)

P = dict(
    face=FACE,
    body=dict(radii=(0.165, 0.26, 0.15), center=(0, 0.05, 0.4), e=0.55),
    hips=(0.22, 0.4),
    neck=dict(points=[(0, -0.17, 0.45), (0, -0.23, 0.5), (0, -0.27, 0.53)], r=(0.11, 0.1), base=(-0.15, 0.45)),
    head=dict(radii=(0.125, 0.125, 0.115), center=(0, -0.36, 0.55), e=0.62, role='Face'),
    # 2:1, like the calf's face layout (512 x 256)
    screen=dict(radii=(0.1, 0.03, 0.05), center=(0, -0.466, 0.56), bezel=0.007),
    muzzle=dict(radii=(0.062, 0.066, 0.05), center=(0, -0.45, 0.485), e=0.5, role='Face'),
    nose=dict(radii=(0.046, 0.013, 0.028), center=(0, -0.512, 0.47), e=0.5),
    jaw=dict(radii=(0.04, 0.055, 0.02), center=(0, -0.45, 0.43), e=0.5, pivot=(0, -0.38, 0.45), pin=0.09, role='Face'),
    ear=dict(dir=(1, 0.1, -0.12), length=0.11, width=0.06, thick=0.02, x=0.11, y=-0.33, z=0.57, e=0.6, taper=0.4,
             spin=1.57),
    horns=dict(x=0.085, y=-0.335, z=0.64, length=0.11, r=0.04, start=82, end=30, lean=0),
    leg=dict(x=0.105, front=-0.14, back=0.22, top=0.3, knee=0.17, r=(0.046, 0.04), ball=0.05, role='Leg',
             hoof=dict(radii=(0.042, 0.05, 0.028), split=True)),
    tail=dict(points=[(0, 0.3, 0.42), (0, 0.345, 0.38), (0, 0.365, 0.3)], bones=2, r=(0.026, 0.02),
              tuft=dict(r=0.045, squash=(1, 1, 1.8), role='Coat')),
    bones_extra=[('fringe.L', (0.005, -0.5, 0.675), (0.06, -0.512, 0.57), 'head'),
                 ('fringe.R', (-0.005, -0.5, 0.675), (-0.06, -0.512, 0.57), 'head')],
)

# The fringe: (x, hang length) of each strand, a short one over each eye.
FRINGE = ((0.0, 0.118), (0.04, 0.085), (0.075, 0.118), (0.105, 0.105), (0.13, 0.08))


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [coat, fringe, horn_lamps, face_bits, cheeks], name='HighlandCalf')


def slab(add, m, name, at, size, bone, tip=0.0, lean=0.0, role='Coat', e=0.55, taper=0.0):
    """A flat, soft-cornered plate hanging down: size is (width, thickness, length) as radii,
    `tip` swings its lower end out (about Y), `lean` its lower end forward (about X)."""
    o = kit.superellipsoid(name, size, e, e, seg=(14, 8), taper=taper, location=tuple(at), rotation=(lean, tip, 0))
    add(o, m['role'](role, 'shell'), bone)


def coat(add, m, c):
    """Long rounded plates hanging down over each side, row on row, staggered, down to the knees;
    a ridge of them along the back; a bib on the chest."""
    b = P['body']
    cx, cy, cz = b['center']
    rows = ((0.8, 0.07, 0.1), (0.42, 0.075, 0.1), (0.02, 0.08, 0.1), (-0.38, 0.075, 0.09))
    for side in (1, -1):
        for ri, (zk, ln, wd) in enumerate(rows):
            n = 5 if ri % 2 == 0 else 4
            for k in range(n):
                yy = -0.8 + 1.6 * (k + (0.5 if ri % 2 else 0.0)) / 4.0
                d = (side * 1.0, yy, zk)
                p, nrm = catkit.on_surface(b['center'], b['radii'], b['e'], d)
                # Stand each slab proud of the surface, its top at the point and it hangs from there.
                at = (p.x + side * 0.02, p.y, p.z - ln * 0.6 + 0.012)
                sz = 1.0 + 0.12 * ((k * 7 + ri * 3) % 3 - 1)
                slab(add, m, f'Coat.{side}.{ri}.{k}', at, (0.015, wd * 0.46, ln * sz), 'body',
                     tip=-side * (0.2 + 0.06 * ri), e=0.7, taper=0.35)
    # A ridge of plates along the spine, leaning back.
    for k in range(6):
        y = cy - 0.2 + 0.075 * k
        slab(add, m, f'Back.{k}', (0, y, cz + b['radii'][2] * 0.94), (0.05, 0.034, 0.03), 'body', lean=0.45)
    # A bib of plates hanging down the chest.
    for k, x in enumerate((-0.07, 0.0, 0.07)):
        p, nrm = catkit.on_surface(b['center'], b['radii'], b['e'], (x * 5, -1.0, -0.05 + 0.1 * (k % 2)))
        slab(add, m, f'Bib.{k}', (p.x, p.y - 0.012, p.z - 0.06), (0.032, 0.014, 0.075), 'body', lean=-0.1)


def fringe(add, m, c):
    """Long strands over the eyes, hanging from the forehead, in two halves."""
    for k, (x, ln) in enumerate(FRINGE):
        for side, sfx in ((1, 'L'), (-1, 'R')):
            if x == 0.0 and side < 0:
                continue
            xx = side * x
            z = 0.675 - ln / 2
            o = kit.superellipsoid(f'Fringe.{sfx}{k}', (0.0125, 0.007, ln / 2), 0.55, 0.6, seg=(12, 8),
                                   location=(xx, -0.512 - 0.003 * (k % 2), z), rotation=(-0.12, 0, 0))
            add(o, m['role']('Fringe', 'shell'), f'fringe.{sfx}')
    # The shaggy forelock between the horns, all the way up to the poll.
    for k in range(5):
        x = (k - 2) * 0.045
        add(kit.superellipsoid(f'Forelock.{k}', (0.02, 0.012, 0.036), 0.55, 0.6, seg=(12, 8),
                               location=(x, -0.46 + 0.02 * abs(k - 2), 0.675 + 0.012 * (2 - abs(k - 2))),
                               rotation=(-0.55, 0, 0)), m['role']('Fringe', 'shell'), 'head')


def horn_lamps(add, m, c):
    """A small lit bead on the tip of each horn nub (Dot2)."""
    hs = P['horns']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = hk.horn_path((side * hs['x'], hs['y'], hs['z']), hs['length'], hs['start'], hs['end'], hs.get('lean', 0),
                           side)
        tip = pts[-1]
        add(kit.superellipsoid(f'HornLamp.{sfx}', (0.016,) * 3, 0.8, 0.8, seg=(12, 8), location=tip),
            m['dot'](2), 'head')


def cheeks(add, m, c):
    """Shaggy plates hanging down each cheek, and a beard under the nose."""
    for side in (1, -1):
        for k, (y, z, ln) in enumerate(((-0.33, 0.52, 0.06), (-0.4, 0.5, 0.05))):
            slab(add, m, f'Cheek.{side}.{k}', (side * 0.115, y, z - 0.02), (0.012, 0.03, ln), 'head',
                 tip=-side * 0.25, role='Fringe')


def face_bits(add, m, c):
    nz = P['nose']
    cx, cy, cz = nz['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.007, 0.005, 0.01), 0.6, 0.6, seg=(8, 6),
                               location=(side * 0.017, cy - nz['radii'][1] + 0.001, cz - 0.002)), m['bezel'], 'head')
