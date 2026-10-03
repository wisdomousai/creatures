"""Nari, the crew's robot narwhal: a small round whale, the unicorn's sea twin. A plump pod of
a body with a pale belly plate under a seam, a blunt melon of a head with a big screen
face and a tusk out of its forehead that is a spiral of lit rings (seven rings, Dot0 at the
base to Dot6 at the tip, each tipped a little more round the axis than the last, round a
tapering ivory core, the tip a beacon). Two round flippers, a little lamp-lit ridge on the
back, a blowhole on top with a nozzle ring, and a tail stalk ending in a pair of swept
flukes.

The tusk is three bones (tusk.1 .. tusk.3) so it can bend; the tail is two (tail.1, then the
flukes); a column of five lit rings waits on bones of their own inside the blowhole
(spout.0 .. spout.4), for the site to blow out of it and put away again. Faces -Y like the
rest of the crew; about 0.24 m tall and 0.55 m long with its tusk, and it floats: its origin
is just under its belly.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'narwhal'
PREVIEW = dict(lift=0.05, width=0.6)

D = {
    'hull': dict(radii=(0.105, 0.17, 0.1), center=(0, 0.02, 0.1), e=(0.8, 0.88), taper=0.5),
    'belly': -0.03,
    'seam': dict(grow=0.02, width=0.004),
    'screen': dict(radii=(0.068, 0.02, 0.044), center=(0, -0.135, 0.108), bezel=0.007),
    # The tusk: base, direction, length, and its rings.
    'tusk': dict(base=(0, -0.112, 0.178), dir=(0, -1, 0.24), length=0.21, r0=0.03, r1=0.005, rings=7),
    'blow': dict(center=(0, -0.045, 0.198), r=0.018),
    'tail': dict(root=(0, 0.17, 0.1), stalk=0.05, r=(0.045, 0.022)),
}
TUSK = ('tusk.1', 'tusk.2', 'tusk.3')


def pod(name, grow=0.0):
    h = D['hull']
    wide, long, tall = (r * (1 + grow) for r in h['radii'])
    obj = kit.superellipsoid(name, (wide, tall, long), *h['e'], seg=(40, 56), taper=h['taper'],
                             location=h['center'], rotation=(-math.pi / 2, 0, 0))
    kit.apply_transforms(obj)
    return obj


def tusk_axis():
    t = D['tusk']
    return Vector(t['dir']).normalized()


def tusk_point(u):
    t = D['tusk']
    return Vector(t['base']) + tusk_axis() * t['length'] * u


def rig_bones():
    c = Vector(D['hull']['center'])
    sc = Vector(D['screen']['center'])
    bl = Vector(D['blow']['center'])
    tr = Vector(D['tail']['root'])
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', c, c + Vector((0, 0, 0.1)), 'root'),
        ('face', sc, sc + Vector((0, -0.05, 0)), 'body'),
        ('tusk.1', tusk_point(0), tusk_point(0.34), 'body'),
        ('tusk.2', tusk_point(0.34), tusk_point(0.67), 'tusk.1'),
        ('tusk.3', tusk_point(0.67), tusk_point(1), 'tusk.2'),
        ('fin.L', (0.1, -0.05, 0.07), (0.15, -0.02, 0.05), 'body'),
        ('fin.R', (-0.1, -0.05, 0.07), (-0.15, -0.02, 0.05), 'body'),
        ('dorsal', (0, 0.06, 0.2), (0, 0.1, 0.205), 'body'),
        ('tail.1', tr, tr + Vector((0, 0.05, 0)), 'body'),
        ('tail.2', tr + Vector((0, 0.05, 0)), tr + Vector((0, 0.11, 0)), 'tail.1'),
    ]
    for i in range(5):
        bones.append((f'spout.{i}', bl + Vector((0, 0, 0.002)), bl + Vector((0, 0, 0.03)), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The pod: a shell over a pale belly plate with a seam between.
    line = D['hull']['center'][2] + D['belly']
    add(kit.cut(pod('Hull'), (0, 0, 1), line), m['shell'], 'body')
    add(kit.cut(pod('Belly'), (0, 0, -1), -line), m['role']('Belly'), 'body')
    sm = D['seam']
    seam = kit.cut(pod('Seam', sm['grow']), (0, 0, 1), line - sm['width'])
    add(kit.cut(seam, (0, 0, -1), -line - sm['width']), m['bezel'], 'body')
    # A panel seam round the middle of the body.
    ring = kit.cut(pod('Panel', sm['grow'] * 0.7), (0, 1, 0), 0.09 - sm['width'] * 0.7)
    add(kit.cut(ring, (0, -1, 0), -(0.09 + sm['width'] * 0.7)), m['bezel'], 'body')

    # The face.
    sc = D['screen']
    glass, rim = kit.screen('Narwhal', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'face')
    add(rim, m['bezel'], 'face')

    # The tusk: three tapering ivory sections of core, and seven lit rings, each tilted a bit
    # more round the axis than the last so they wind like a spiral.
    t = D['tusk']
    ax = tusk_axis()
    rad = lambda u: t['r0'] + (t['r1'] - t['r0']) * u
    for k in range(3):
        u0, u1 = k / 3, (k + 1) / 3 + (0.02 if k < 2 else 0)
        a, b = tusk_point(u0), tusk_point(min(u1, 1))
        L = (b - a).length
        core = kit.lathe(f'Core{k}', [(0, L * 1.0), (rad(min(u1, 1)) * 0.9, L), (rad(u0) * 0.9, 0), (0, 0)], seg=20,
                         location=a, rotation=seakit.aim((0, 0, 0), ax))
        if k == 2:
            core = kit.lathe(f'Core{k}', [(0, L), (rad(u0) * 0.5, L * 0.5), (rad(u0) * 0.9, 0), (0, 0)], seg=20,
                             location=a, rotation=seakit.aim((0, 0, 0), ax))
        add(core, m['role']('Tusk'), TUSK[k])
    side = ax.cross(Vector((0, 0, 1))).normalized()
    up = ax.cross(side)
    for i in range(t['rings']):
        u = (i + 0.7) / (t['rings'] + 0.2)
        a = i * 0.75
        tilt = (side * math.cos(a) + up * math.sin(a)) * 0.38
        ring_axis = (ax + tilt).normalized()
        r = rad(u) * 1.12 + 0.002
        add(kit.torus(f'Ring{i}', r, 0.0075 * (1 - 0.4 * u), seg=(24, 8), location=tusk_point(u),
                      rotation=seakit.aim((0, 0, 0), ring_axis)), m['dot'](i), TUSK[min(int(u * 3), 2)])
    add(seakit.pod('TuskTip', tusk_point(1.0), (0.0075, 0.0075, 0.0085), (0.9, 0.9), seg=(14, 10),
                   rotation=seakit.aim((0, 0, 0), ax)), m['beacon'], 'tusk.3')
    # A collar where it comes out of the head.
    add(kit.torus('Collar', t['r0'] * 1.25, 0.007, seg=(28, 8), location=tusk_point(-0.02),
                  rotation=seakit.aim((0, 0, 0), ax)), m['bezel'], 'body')

    # Blowhole: a nozzle ring on top, dark inside; the spout's rings wait inside it.
    bl = Vector(D['blow']['center'])
    add(kit.torus('BlowRing', D['blow']['r'], 0.0055, seg=(24, 8), location=bl), m['bezel'], 'body')
    add(seakit.pod('Blowhole', bl + Vector((0, 0, -0.003)), (D['blow']['r'] * 0.95, D['blow']['r'] * 0.95, 0.004),
                   (0.6, 1.0), seg=(20, 6)), m['joint'], 'body')
    for i in range(5):
        k = 1 - i * 0.14
        add(kit.torus(f'Spout{i}', 0.022 * k, 0.0062 * k, seg=(24, 8), location=bl + Vector((0, 0, 0.002))),
            m['beacon'], f'spout.{i}')
        add(seakit.pod(f'Drop{i}', bl + Vector((0, 0, 0.004)), (0.007 * k,) * 3, (0.9, 0.9), seg=(12, 8)),
            m['beacon'], f'spout.{i}')

    # A ridge of lamps down the back, and a dorsal bump.
    add(seakit.pod('Dorsal', (0, 0.07, 0.196), (0.016, 0.034, 0.02), (0.7, 0.8), seg=(18, 10)),
        m['role']('Fin', 'joint'), 'dorsal')
    for i in range(3):
        add(seakit.pod(f'Lamp{i}', (0, 0.1 + i * 0.03, 0.188 - i * 0.012), (0.0085,) * 3, (0.9, 0.9), seg=(12, 8)),
            m['dot'](7), 'body')

    # Flippers: round paddles at the sides.
    fin = m['role']('Fin', 'joint')
    for sfx, s in (('L', 1), ('R', -1)):
        add(seakit.pod(f'Hub{sfx}', (s * 0.1, -0.05, 0.07), (0.016, 0.016, 0.016), (0.7, 0.7), seg=(16, 10)),
            m['bezel'], f'fin.{sfx}')
        add(seakit.fan(f'Flipper{sfx}', (s * 0.1, -0.05, 0.07), (s * 0.8, 0.5, -0.45), (0.034, 0.0075, 0.062),
                       (0, 0, 1)), fin, f'fin.{sfx}')

    # Tail: a short stalk, a collar, and swept flukes.
    tr = Vector(D['tail']['root'])
    add(seakit.bar('Stalk', tr + Vector((0, -0.01, 0)), tr + Vector((0, 0.06, 0)), 0.03), m['shell'], 'tail.1')
    add(kit.torus('StalkRing', 0.03, 0.005, seg=(24, 8), location=tr + Vector((0, 0.045, 0)),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'tail.1')
    fl = tr + Vector((0, 0.06, 0))
    for sfx, s in (('L', 1), ('R', -1)):
        add(seakit.fan(f'Fluke{sfx}', fl, (s * 0.85, 0.6, 0), (0.034, 0.007, 0.075), (0, 0, 1)),
            m['role']('Fluke', 'joint'), 'tail.2')
    add(seakit.pod('FlukeHub', fl, (0.017, 0.017, 0.012), (0.7, 0.7), seg=(16, 10)), m['bezel'], 'tail.2')

    return looks.finish(kit.armature('NarwhalRig', rig_bones()), parts, skin, m)
