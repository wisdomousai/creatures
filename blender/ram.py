"""The crew's robot ram: an adult, heavy and deep, a barrel of thick wool pods on short strong
dark legs with ball-joint knees and split hooves, a dark head with a Roman nose (a bridge that
arches down to a broad nose plate) and a screen face, small ears under the horns. Its
signature is the pair of big spiral horns that grow back from the top of the head, curl down
behind the ears and round forward under them, each a tapering tube with lit ridges along the
spiral (Dot2 to Dot5, the lights run along them and flash when the horns clonk). A heap of wool
on the poll between them, a ruff at the shoulders and a pod of a tail. Faces -Y like the
rest of the crew; about 0.85 m to the top of the horns.
"""

import math

from mathutils import Vector

import catkit
import hoofkit as hk
import kit

FACE = 'ram'
PREVIEW = dict(lift=0.0, width=0.8)

P = dict(
    face=FACE,
    body=dict(radii=(0.2, 0.3, 0.19), center=(0, 0.06, 0.5), e=0.55),
    hips=(0.25, 0.5),
    neck=dict(points=[(0, -0.17, 0.54), (0, -0.26, 0.61), (0, -0.31, 0.65)], r=(0.125, 0.105), base=(-0.16, 0.55),
              role='Face'),
    head=dict(radii=(0.125, 0.155, 0.13), center=(0, -0.4, 0.68), e=0.62, role='Face'),
    # 2:1, like the ram's face layout (512 x 256)
    screen=dict(radii=(0.09, 0.03, 0.045), center=(0, -0.537, 0.7), bezel=0.008),
    muzzle=dict(radii=(0.062, 0.078, 0.058), center=(0, -0.54, 0.615), e=0.5, role='Face'),
    nose=dict(radii=(0.052, 0.014, 0.03), center=(0, -0.625, 0.59), e=0.5),
    jaw=dict(radii=(0.04, 0.06, 0.02), center=(0, -0.54, 0.55), e=0.5, pivot=(0, -0.43, 0.58), pin=0.1, role='Face'),
    ear=dict(dir=(1, 0.05, -0.25), length=0.12, width=0.06, thick=0.02, x=0.105, y=-0.43, z=0.64, e=0.6, taper=0.4,
             spin=1.57),
    leg=dict(x=0.115, front=-0.17, back=0.27, top=0.4, knee=0.21, r=(0.05, 0.042), ball=0.054, role='Leg',
             hoof=dict(radii=(0.046, 0.056, 0.03), split=True)),
    tail=dict(points=[(0, 0.33, 0.55), (0, 0.38, 0.5), (0, 0.4, 0.45)], bones=2, r=(0.03, 0.026),
              tuft=dict(r=0.05, squash=(1, 1, 1), role='Wool')),
    wool=dict(r=0.075, rings=(-0.85, -0.52, -0.18, 0.18, 0.52, 0.85), around=(6, 9, 10, 10, 9, 6), belly=-0.3,
              lift=0.38, scale=1.0),
    bones_extra=[],
)

# The horn's spiral: it leaves the top of the head and curls out, down and in, in a plane tipped
# a little back, drifting out from the head as it goes.
HORN = dict(root=(0.08, -0.37, 0.8), tilt=0.45, r0=0.165, r1=0.072, a0=20, a1=310, drift=0.09)
RIDGES = (0.3, 0.5, 0.7, 0.88)


def horn_points(side, n=28):
    """Centre line of one horn."""
    h = HORN
    u = Vector((side * math.cos(h['tilt']), math.sin(h['tilt']), 0.0))
    up = Vector((0.0, 0.0, 1.0))
    a0 = math.radians(h['a0'])
    root = Vector((side * h['root'][0], h['root'][1], h['root'][2]))
    centre = root - h['r0'] * (math.sin(a0) * u + math.cos(a0) * up)
    pts = []
    for i in range(n):
        f = i / (n - 1)
        a = math.radians(h['a0'] + (h['a1'] - h['a0']) * f)
        r = h['r0'] + (h['r1'] - h['r0']) * f
        p = centre + r * (math.sin(a) * u + math.cos(a) * up) + Vector((side * h['drift'] * f, 0, 0))
        pts.append(tuple(p))
    return pts


def build(look='ink', flame=None):
    return hk.build(look, flame, P, [horns, topknot, ruff, face_bits, bridge], name='Ram')


def horns(add, m, c):
    """Two big spiral horns on the head, a lit ridge ring at four places along each."""
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = horn_points(side)
        radii = [0.056 * (1 - 0.76 * (i / (len(pts) - 1)) ** 1.1) for i in range(len(pts))]
        add(kit.tube(f'Horn.{sfx}', pts, radii, ring=14)[0], m['role']('Horn', 'joint'), 'head')
        for k, f in enumerate(RIDGES):
            i = min(int(f * (len(pts) - 1)), len(pts) - 2)
            tang = (Vector(pts[i + 1]) - Vector(pts[i - 1] if i else pts[i])).normalized()
            rr = radii[i]
            ring = kit.torus(f'HornRidge.{sfx}{k}', rr * 1.0 + 0.003, rr * 0.3, seg=(20, 8))
            catkit.orient(ring, Vector(pts[i]), tang)
            add(ring, m['dot'](2 + k), 'head')


def topknot(add, m, c):
    """A heap of wool between the horns."""
    hk.pod_cluster(c, (0, -0.31, 0.8), 0.05, 'head', n=6, name='Topknot', spread=0.8, seed=11)


def ruff(add, m, c):
    """A thick ruff of wool pods at the shoulders, so the dark neck comes out of it."""
    hk.pod_cluster(c, (0, -0.17, 0.57), 0.062, 'body', n=8, name='Ruff', spread=1.6, seed=4)


def bridge(add, m, c):
    """The Roman nose: a long arched bridge down the face from under the screen to the nose plate,
    and a broad rim round the nose plate."""
    add(kit.superellipsoid('Bridge', (0.044, 0.11, 0.042), 0.6, 0.6, seg=(26, 16), location=(0, -0.55, 0.65),
                           rotation=(0.5, 0, 0)), m['role']('Face', 'shell'), 'head')


def face_bits(add, m, c):
    """Nostrils, rivets on the cheeks, and the brow plates over the eyes."""
    nz = P['nose']
    cx, cy, cz = nz['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.008, 0.005, 0.012), 0.6, 0.6, seg=(8, 6),
                               location=(side * 0.02, cy - nz['radii'][1] + 0.001, cz - 0.002)), m['bezel'], 'head')
        c.bolt(f'Cheek.Bolt.{side}', (side * 0.118, -0.44, 0.66), 0.008, 'head')
        add(kit.superellipsoid(f'Brow.{side}', (0.05, 0.03, 0.012), 0.5, 0.5, seg=(14, 8),
                               location=(side * 0.06, -0.52, 0.752), rotation=(0.1, 0, side * -0.3)),
            m['role']('Face', 'shell'), 'head')
