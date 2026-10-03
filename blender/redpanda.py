"""Russet, the crew's robot red panda: a long rust-coloured toy robot with dark socks, a cream
mask plate round the screen face with two dark tear marks and a cream muzzle, white-tipped
rounded ears on hinges, a dark chest plate, and a big tail of four chunky pods banded by
lights (Dot0..Dot3, root to tip), on four bones so it can curl, sweep and wrap round him.
Ears have a small lamp inside (Dot4). Faces -Y like the rest of the crew; about 0.38 m to the
ear tips.
"""

import math

from mathutils import Vector

import kit
import fluffkit as fk
from fluffkit import mirror

FACE = 'redpanda'
PREVIEW = dict(lift=0.0, width=0.8)

D = {
    'body': dict(radii=(0.096, 0.15, 0.096), center=(0, 0.04, 0.16), e=0.78),
    'chest': dict(radii=(0.062, 0.05, 0.062), center=(0, -0.085, 0.14)),
    'head': dict(radii=(0.11, 0.092, 0.086), center=(0, -0.125, 0.255), e=0.62),
    # 2:1, like the red panda's face layout (512 x 256)
    'screen': dict(radii=(0.068, 0.02, 0.034), center=(0, -0.2, 0.267), bezel=0.007),
    'mask': dict(radii=(0.092, 0.014, 0.056), center=(0, -0.196, 0.263)),
    'muzzle': dict(radii=(0.046, 0.03, 0.03), center=(0, -0.207, 0.222)),
    'nose': dict(radii=(0.014, 0.01, 0.01), center=(0, -0.236, 0.228)),
    'ear': dict(x=0.07, y=-0.105, z=0.33, rx=0.044, ry=0.022, rz=0.048, splay=0.35),
    'front': dict(x=0.07, hip=(-0.06, 0.145), knee=(-0.066, 0.085), ankle=(-0.07, 0.034)),
    'back': dict(x=0.076, hip=(0.15, 0.145), knee=(0.162, 0.085), ankle=(0.158, 0.034)),
    'tail': [(0, 0.17, 0.2), (0, 0.29, 0.215), (0, 0.41, 0.225), (0, 0.52, 0.225), (0, 0.6, 0.235)],
}


def rig_bones():
    e, f, b = D['ear'], D['front'], D['back']
    bones = fk.standard_bones(hips=(0, b['hip'][0], 0.16), chest=(0, -0.09, 0.19), neck=(0, -0.1, 0.2),
                              head_top=(0, -0.125, 0.34))
    pts = D['tail']
    parent = 'body'
    for i in range(4):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - 0.03), (side * e['x'] * 1.2, e['y'], e['z'] + 0.05), 'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['ankle'][0], 0.0), 'body'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['hip'][0], b['hip'][1]), (side * b['x'], b['ankle'][0], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035
    cream = m['role']('Cream')
    sock = m['role']('Sock', 'joint')

    # Body: a long low pod with a belt seam each side of the middle, a dark chest plate.
    b = D['body']
    pod('Body', b['radii'], b['center'], m['shell'], 'body', e=b['e'], seg=(36, 24))
    for z in (0.17,):
        R.seam('Belt', fk.surface_ring(b['radii'], b['center'], b['e'], z, n=72), 'body', seam)
    c = D['chest']
    pod('Chest', c['radii'], c['center'], sock, 'body', e=0.5, e2=0.8, seg=(28, 16), rot=(math.pi / 2, 0, 0))
    R.add(kit.torus('ChestRim', c['radii'][0] + 0.004, 0.0045, seg=(32, 6), location=(0, c['center'][1] - 0.004, c['center'][2]),
                    rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        R.stud(f'ChestScrew.{i}', (c['radii'][0] * 1.0 * math.cos(a), c['center'][1] - 0.012, c['center'][2] + c['radii'][0] * math.sin(a)), 0.0042)
    R.pod('Hatch', (0.045, 0.01, 0.045), (0, 0.192, 0.18), m['bezel'], 'body', e=0.3, seg=(24, 18))
    for sx in (-1, 1):
        for sz in (-1, 1):
            R.stud(f'Screw.{sx}.{sz}', (sx * 0.03, 0.2, 0.18 + sz * 0.03), 0.005)
    # Back plates along the spine.
    for j, y in enumerate((-0.05, 0.02, 0.09, 0.16)):
        R.pod(f'Back.{j}', (0.03, 0.026, 0.008), (0, y, 0.253 - 0.01 * (j in (0, 3))), m['joint'], 'body', e=0.5, seg=(14, 8))

    # Head: a wide rounded box, the cream mask plate, the screen, a cream muzzle and dark nose, tear marks.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(38, 26))
    mk = D['mask']
    pod('Mask', mk['radii'], mk['center'], cream, 'head', e=0.4, e2=0.5, seg=(32, 12))
    sc = D['screen']
    R.screen('Redpanda', sc['radii'], sc['center'], sc['bezel'])
    mz = D['muzzle']
    pod('Muzzle', mz['radii'], mz['center'], cream, 'head', e=0.6, seg=(26, 16))
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose', 'bezel'), 'head', e=0.6, seg=(20, 12))
    for side in (-1, 1):
        R.tube(f'Tear.{side}', [(side * 0.044, -0.208, 0.236), (side * 0.054, -0.212, 0.213)], 0.0045, sock, 'head', ring=6)
        pod(f'Cheek.{side}', (0.02, 0.03, 0.038), (side * 0.108, -0.15, 0.225), cream, 'head', e=0.6, seg=(18, 12),
            rot=(0, 0, side * 0.3))
        for j, dz in enumerate((0.012, 0.0, -0.012)):
            R.stud(f'Whisker.{side}.{j}', (side * 0.058, -0.234, 0.215 + dz), 0.003, 'head')
    R.seam('CrownSeam', [(0, -0.125 - 0.092 * math.cos(math.radians(a)) * 0.97, 0.255 + 0.086 * math.sin(math.radians(a)) * 1.01)
                         for a in range(45, 150, 8)], 'head', seam)

    # Ears: rounded rust pods splayed out, a cream tip, a dark inside with a lamp.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        at = (side * e['x'], e['y'], e['z'])
        rot = (0, 0, -side * e['splay'])
        pod(f'Ear.{sfx}', (e['rx'], e['ry'], e['rz']), at, m['shell'], bone, e=0.7, seg=(24, 16), rot=rot)
        up = Vector((side * 0.012, 0, 0.034))
        pod(f'EarTip.{sfx}', (e['rx'] * 0.72, e['ry'] * 0.9, 0.02), (at[0] + side * 0.012, at[1] - 0.001, at[2] + 0.036), m['role']('Tip'), bone,
            e=0.6, seg=(20, 10), rot=rot)
        pod(f'EarIn.{sfx}', (e['rx'] * 0.6, 0.006, e['rz'] * 0.55), (at[0] - side * 0.002, at[1] - e['ry'] * 0.92, at[2] - 0.004),
            sock, bone, e=0.6, seg=(18, 10), rot=rot)
        pod(f'EarLamp.{sfx}', (0.009, 0.005, 0.009), (at[0] - side * 0.002, at[1] - e['ry'] * 1.0 - 0.003, at[2] - 0.004),
            m['dot'](4), bone, e=0.7, seg=(12, 8))
        R.ball(f'EarHinge.{sfx}', 0.011, (side * e['x'] * 0.85, e['y'] + 0.006, e['z'] - 0.04), m['joint'], bone, seg=(14, 10))

    # Legs: dark socks and paws.
    f, bk = D['front'], D['back']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        R.leg(f'F{sfx}', (side * f['x'], f['hip'][0], f['hip'][1]), (side * f['x'], f['knee'][0], f['knee'][1]),
              (side * f['x'], f['ankle'][0], f['ankle'][1]), 0.022, f'leg.F{sfx}',
              dict(radii=(0.029, 0.04, 0.018), center=(side * f['x'], f['ankle'][0] - 0.012, 0.018)), shell=sock,
              pad=m['role']('Pad'), toes=3)
        R.leg(f'B{sfx}', (side * bk['x'], bk['hip'][0], bk['hip'][1]), (side * bk['x'], bk['knee'][0], bk['knee'][1]),
              (side * bk['x'], bk['ankle'][0], bk['ankle'][1]), 0.024, f'leg.B{sfx}',
              dict(radii=(0.03, 0.043, 0.018), center=(side * bk['x'], bk['ankle'][0] - 0.01, 0.018)), shell=sock,
              pad=m['role']('Pad'), toes=3)
        # Hip and shoulder fur plates (rust) over the dark legs.
        pod(f'Haunch.{sfx}', (0.03, 0.06, 0.06), (side * 0.092, 0.145, 0.15), m['shell'], f'leg.B{sfx}', e=0.7, seg=(20, 14))
        pod(f'Shoulder.{sfx}', (0.028, 0.05, 0.055), (side * 0.09, -0.06, 0.16), m['shell'], f'leg.F{sfx}', e=0.7, seg=(20, 14))

    # Tail: four chunky pods, rust and dark in turn, banded by lights at each seam.
    pts = [Vector(p) for p in D['tail']]
    radii = [0.05, 0.06, 0.058, 0.043]
    for i in range(4):
        a_, b_ = pts[i], pts[i + 1]
        mid = a_.lerp(b_, 0.5)
        length = (b_ - a_).length
        rot = tuple((b_ - a_).to_track_quat('Z', 'Y').to_euler())
        r = radii[i]
        mat = m['shell'] if i % 2 == 0 else m['role']('Ring', 'joint')
        R.pod(f'Tail.{i + 1}', (r, r, length * 0.62), tuple(mid), mat, f'tail.{i + 1}', e=0.75, seg=(22, 14), rot=rot)
        # a lit band at the end of each pod
        end = b_
        R.add(kit.torus(f'TailBand.{i + 1}', r * 0.93, 0.0065, seg=(30, 6), location=tuple(a_.lerp(b_, 0.97)), rotation=rot),
              m['dot'](i), f'tail.{i + 1}')
    R.ball('TailHub', 0.034, tuple(pts[0] - Vector((0, 0.012, 0))), m['joint'], 'body')

    return R.finish('RedpandaRig', rig_bones())
