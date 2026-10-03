"""The crew's robot guinea pig: a long, round potato of a toy on the fluff kit, a cream body
with big soft panels of ginger and brown over it, no tail at all, a blunt round head with a
screen face and a pink button nose, tiny petal ears that droop to the sides, short legs
hidden under the body with only the paws showing, a rosette of small pods on the forehead
(its centre a light, Dot1) and a lit ring at the throat (Dot0) that pulses when it wheeks.
A bundle of hay (`hay`, on a bone of its own) comes out for a nibble and is put away
otherwise. A bone `tail.1` carries nothing so the Pet base has a tail to puff and wag.
Faces -Y like the rest of the crew; about 0.26 m to the ear tops.
"""

import math

from mathutils import Vector

import catkit
import fluffkit as fk
import kit
import looks

FACE = 'guineapig'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    'body': dict(radii=(0.108, 0.165, 0.097), center=(0, 0.04, 0.108), e=0.82),
    'head': dict(radii=(0.1, 0.092, 0.088), center=(0, -0.112, 0.15), e=0.66),
    # 2:1, like the guinea pig's face layout (512 x 256)
    'screen': dict(radii=(0.07, 0.02, 0.035), center=(0, -0.196, 0.162), bezel=0.007),
    'nose': dict(radii=(0.017, 0.011, 0.013), center=(0, -0.203, 0.134)),
    'ear': dict(x=0.092, y=-0.092, z=0.19, r=0.032, half=0.008, splay=0.9),
    'hipF': dict(x=0.074, y=-0.1, z=0.07),
    'hipB': dict(x=0.08, y=0.12, z=0.07),
    'foot': dict(radii=(0.026, 0.038, 0.016)),
}
HAY = [(-0.06, -0.26, 0.012, 0.3), (0.0, -0.27, 0.014, -0.15), (0.06, -0.255, 0.012, 0.6), (0.0, -0.24, 0.02, 0.0)]


def rig_bones():
    e, f, b = D['ear'], D['hipF'], D['hipB']
    bones = fk.standard_bones(hips=(0, b['y'], 0.11), chest=(0, -0.1, 0.12), neck=(0, -0.09, 0.13),
                              head_top=(0, -0.112, 0.25))
    bones.append(('tail.1', (0, 0.2, 0.11), (0, 0.23, 0.11), 'body'))
    bones.append(('hay', (0, -0.26, 0.0), (0, -0.26, 0.04), 'root'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - 0.02), (side * e['x'] * 1.25, e['y'], e['z'] + 0.01),
                      'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['y'], f['z']), (side * f['x'], f['y'] - 0.02, 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['y'], b['z']), (side * b['x'], b['y'] - 0.02, 0.0), 'body'))
    return bones


def patch(R, name, direction, radii, mat, spin=0.0, lift=-0.0135):
    """A flat panel lying on the body toward `direction` from its centre."""
    b = D['body']
    p, n = catkit.on_surface(b['center'], b['radii'], b['e'], Vector(direction))
    o = kit.superellipsoid(name, radii, 0.55, 0.55, seg=(22, 14))
    catkit.orient(o, p, n, lift, spin)
    return R.add(o, mat, 'body')


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035

    # Body: a long potato, panels of ginger and brown over the cream, a belt seam.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(44, 30))
    big = m['role']('Patch')
    dark = m['role']('Dark', 'joint')
    patch(R, 'PatchL', (0.95, 0.35, 0.35), (0.06, 0.08, 0.02), big, 0.3)
    patch(R, 'PatchR', (-0.95, -0.2, 0.3), (0.055, 0.07, 0.02), dark, -0.4)
    patch(R, 'PatchBack', (0.0, 0.62, 0.72), (0.065, 0.06, 0.02), dark, 0.0)
    patch(R, 'PatchTop', (-0.25, -0.15, 1.0), (0.045, 0.06, 0.02), big, 0.5)
    R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], 0.14, n=64), 'body', seam)
    for sx in (-1, 1):
        R.stud(f'Rivet.{sx}', (sx * 0.1, -0.06, 0.1), 0.0055, 'body', face=(0, math.pi / 2, 0))

    # Head: a blunt round potato, the screen, a pink nose, whisker studs.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(44, 30))
    sc = D['screen']
    R.screen('GuineaPig', sc['radii'], sc['center'], sc['bezel'])
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose', 'bezel'), 'head', e=0.6, seg=(20, 12))
    for side in (-1, 1):
        for j, dz in enumerate((0.012, 0.0, -0.012)):
            R.stud(f'Whisker.{side}.{j}', (side * (0.04 + 0.01 * (j == 1)), -0.195, 0.134 + dz), 0.0035, 'head')
    # A patch of the coat on the brow and the cheek, so the face is two-tone too.
    p, nrm = catkit.on_surface(h['center'], h['radii'], h['e'], Vector((0.75, -0.2, 0.7)))
    o = kit.superellipsoid('BrowPatch', (0.04, 0.045, 0.012), 0.55, 0.55, seg=(18, 12))
    catkit.orient(o, p, nrm, -0.004, 0.4)
    R.add(o, big, 'head')
    # A rosette on the forehead: a ring of small pods round a lit centre (Dot1).
    # The ring is tipped to face forward and up, so it reads from the side as well as the front.
    cx, cy, cz = 0.0, -0.152, 0.226
    nrm, vv = (0.0, -0.57, 0.82), (0.0, 0.82, 0.57)
    for k in range(5):
        a = 2 * math.pi * k / 5
        ca, sa = 0.027 * math.cos(a), 0.027 * math.sin(a)
        R.ball(f'Rosette.{k}', 0.0125, (cx + ca, cy + sa * vv[1] - 0.004 * nrm[1], cz + sa * vv[2] - 0.004 * nrm[2]), big,
               'head', seg=(16, 10))
    R.ball('RosetteCentre', 0.0165, (cx, cy + 0.009 * nrm[1], cz + 0.009 * nrm[2]), m['dot'](1), 'head', seg=(16, 10))
    # The throat lamp: a lit ring under the chin (Dot0).
    R.add(kit.torus('Throat', 0.04, 0.0085, seg=(30, 8), location=(0, -0.145, 0.078), rotation=(0.45, 0, 0)), m['dot'](0),
          'head')

    # Ears: tiny petals that droop to the sides, a pink inner petal.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        rot = (math.radians(65), side * 0.85, side * 0.35)
        at = (side * e['x'], e['y'], e['z'])
        R.puck(f'Ear.{sfx}', e['r'], e['half'], at, m['shell'], f'ear.{sfx}',
               rot=rot, e=0.5)
        R.puck(f'EarIn.{sfx}', e['r'] * 0.6, e['half'] * 0.6, (at[0] + side * 0.003, at[1] - 0.006, at[2] + 0.002),
               m['role']('EarIn', 'joint'), f'ear.{sfx}', rot=rot, seg=(18, 6))
        R.ball(f'EarHinge.{sfx}', 0.008, (side * 0.08, e['y'] + 0.008, e['z'] - 0.02), m['joint'], f'ear.{sfx}', seg=(12, 8))

    # Legs: short stubs hidden under the body, a ball hip, a little paw.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for pre, key in (('F', 'hipF'), ('B', 'hipB')):
            hp = D[key]
            fr = D['foot']['radii'] if pre == 'B' else (0.022, 0.03, 0.014)
            R.leg(f'{pre}{sfx}', (side * hp['x'], hp['y'], hp['z']), None, (side * hp['x'], hp['y'] - 0.004, 0.026),
                  0.014, f'leg.{pre}{sfx}', dict(radii=fr, center=(side * hp['x'], hp['y'] - 0.016, 0.014)),
                  paw=m['role']('Paw'), toes=0)

    # The hay: a little heap of straws on a bone of its own (put away till he nibbles).
    for i, (x, y, z, turn) in enumerate(HAY):
        R.pod(f'Hay.{i}', (0.032, 0.008, 0.007), (x, y, z), m['role']('Hay', 'joint'), 'hay', e=0.6, seg=(14, 8),
              rot=(0, 0, turn))
        R.pod(f'HayB.{i}', (0.026, 0.007, 0.006), (x + 0.004, y + 0.01, z + 0.006), m['role']('Hay', 'joint'), 'hay',
              e=0.6, seg=(14, 8), rot=(0, 0, -turn))

    # A small body: the paper look's ink line is thinner than the 6 mm made for Bolt's size.
    return looks.finish(kit.armature('GuineaPigRig', rig_bones()), R.parts, R.skin, m, outline=0.0022)
