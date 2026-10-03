"""The crew's robot ferret: a long noodle of a toy on the fluff kit, a cream body in three
round segments (rear, middle, chest) joined by lit seam rings (Dot1), short dark legs on ball
joints, a small head with a dark mask plate round the screen face, two small round ears, a
pale bib and a long tail of dark tube on three bones with a lit tip (Dot0). The body is on
two bones so it can bend: `body` (rear and middle, pivoting at the hips) and `chest` (the
chest and head), so the front can rear up like a periscope while the rear stays down.
Faces -Y like the rest of the crew; about 0.2 m to the ear tops and 0.7 m long with the tail.
"""

import math

import fluffkit as fk
import kit

FACE = 'ferret'
PREVIEW = dict(lift=0.0, width=0.8)

D = {
    'rear': dict(radii=(0.058, 0.092, 0.058), center=(0, 0.13, 0.098), e=0.8),
    'mid': dict(radii=(0.054, 0.08, 0.055), center=(0, 0.015, 0.098), e=0.8),
    'chest': dict(radii=(0.058, 0.09, 0.06), center=(0, -0.1, 0.102), e=0.8),
    'head': dict(radii=(0.058, 0.07, 0.055), center=(0, -0.19, 0.125), e=0.62),
    'mask': dict(radii=(0.07, 0.026, 0.04), center=(0, -0.238, 0.128)),
    # 2:1, like the ferret's face layout (512 x 256)
    'screen': dict(radii=(0.056, 0.018, 0.028), center=(0, -0.254, 0.132), bezel=0.006),
    'nose': dict(radii=(0.012, 0.009, 0.009), center=(0, -0.262, 0.106)),
    'ear': dict(x=0.042, y=-0.172, z=0.18, r=0.021, half=0.007, splay=0.35),
    'hipF': dict(x=0.046, y=-0.1, z=0.07),
    'hipB': dict(x=0.05, y=0.14, z=0.07),
    'tail': [(0, 0.2, 0.1), (0, 0.3, 0.113), (0, 0.38, 0.14), (0, 0.44, 0.19)],
}
SEAMS = (0.07, -0.05)


def rig_bones():
    e, f, b = D['ear'], D['hipF'], D['hipB']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.14, 0.098), (0, -0.045, 0.098), 'root'),
        ('chest', (0, -0.045, 0.098), (0, -0.14, 0.104), 'body'),
        ('head', (0, -0.12, 0.108), (0, -0.19, 0.18), 'chest'),
    ]
    pts = kit.spline(D['tail'], 4)
    for i in range(3):
        bones.append((f'tail.{i + 1}', tuple(pts[i]), tuple(pts[i + 1]), 'body' if i == 0 else f'tail.{i}'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'ear.{sfx}', (side * e['x'] * 0.9, e['y'], e['z'] - 0.015), (side * e['x'] * 1.2, e['y'], e['z'] + 0.02),
                      'head'))
        bones.append((f'leg.F{sfx}', (side * f['x'], f['y'], f['z']), (side * f['x'], f['y'] - 0.015, 0.0), 'chest'))
        bones.append((f'leg.B{sfx}', (side * b['x'], b['y'], b['z']), (side * b['x'], b['y'] - 0.015, 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    R = fk.Rig(FACE, look, flame)
    m = R.m
    pod = R.pod
    seam = 0.0035
    dark = m['role']('Dark', 'joint')

    # Body: three round segments, lit seam rings between, a pale bib on the chest.
    r, md, c = D['rear'], D['mid'], D['chest']
    pod('Rear', r['radii'], r['center'], m['shell'], 'body', e=r['e'], seg=(36, 24))
    pod('Mid', md['radii'], md['center'], m['shell'], 'body', e=md['e'], seg=(36, 24))
    pod('Chest', c['radii'], c['center'], m['shell'], 'chest', e=c['e'], seg=(36, 24))
    for i, y in enumerate(SEAMS):
        bone = 'body' if i == 0 else 'chest'
        R.add(kit.torus(f'Seam.{i}', 0.0525, 0.0075, seg=(32, 8), location=(0, y, 0.098), rotation=(math.pi / 2, 0, 0)),
              m['dot'](1), bone)
        R.add(kit.torus(f'SeamBand.{i}', 0.0525, 0.0125, seg=(32, 6), location=(0, y, 0.098),
                        rotation=(math.pi / 2, 0, 0)), m['joint'], bone)
        R.add(kit.torus(f'SeamLamp.{i}', 0.0555, 0.0045, seg=(32, 6), location=(0, y, 0.098),
                        rotation=(math.pi / 2, 0, 0)), m['dot'](1), bone)
    pod('Bib', (0.034, 0.05, 0.012), (0, -0.12, 0.062), m['role']('Belly', 'joint'), 'chest', e=0.4, e2=0.8, seg=(24, 12),
        rot=(0.3, 0, 0))
    # A back stripe in two plates and a hatch with screws on the rump.
    pod('BackPlate', (0.028, 0.06, 0.008), (0, 0.15, 0.153), dark, 'body', e=0.5, seg=(20, 10))
    for sx in (-1, 1):
        R.stud(f'Screw.{sx}', (sx * 0.022, 0.15, 0.162), 0.0045, 'body', face=(0, 0, 0))

    # Head: a small rounded box with a dark mask plate round the screen, a pink nose.
    h = D['head']
    pod('Head', h['radii'], h['center'], m['shell'], 'head', e=h['e'], seg=(40, 28))
    mk = D['mask']
    pod('Mask', mk['radii'], mk['center'], m['role']('Mask', 'joint'), 'head', e=0.45, seg=(32, 18))
    sc = D['screen']
    R.screen('Ferret', sc['radii'], sc['center'], sc['bezel'])
    n = D['nose']
    pod('Nose', n['radii'], n['center'], m['role']('Nose', 'bezel'), 'head', e=0.6, seg=(18, 10))
    for side in (-1, 1):
        for j, dz in enumerate((0.008, -0.002)):
            R.stud(f'Whisker.{side}.{j}', (side * 0.034, -0.258, 0.101 + dz), 0.003, 'head')
        R.stud(f'MaskBolt.{side}', (side * 0.058, -0.222, 0.14), 0.0045, 'head', face=(0, math.pi / 2, 0))

    # Ears: small round pucks, a pink disc inside.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        rot = (math.pi / 2, side * e['splay'], 0)
        at = (side * e['x'], e['y'], e['z'])
        R.puck(f'Ear.{sfx}', e['r'], e['half'], at, m['shell'], f'ear.{sfx}', rot=rot)
        R.puck(f'EarIn.{sfx}', e['r'] * 0.6, e['half'] * 0.5, (at[0], at[1] - e['half'] * 0.85, at[2]),
               m['role']('Pad', 'joint'), f'ear.{sfx}', rot=rot, seg=(18, 6))
        R.ball(f'EarHinge.{sfx}', 0.007, (at[0] * 0.9, at[1] + 0.007, at[2] - e['r'] * 0.8), m['joint'], f'ear.{sfx}',
               seg=(10, 8))

    # Short dark legs: a ball hip, a tube, a ring at the ankle, a small paw.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for pre, key, bone in (('F', 'hipF', 'chest'), ('B', 'hipB', 'body')):
            hp = D[key]
            R.leg(f'{pre}{sfx}', (side * hp['x'], hp['y'], hp['z']), None, (side * hp['x'], hp['y'] - 0.004, 0.024), 0.0125,
                  f'leg.{pre}{sfx}', dict(radii=(0.02, 0.03, 0.013), center=(side * hp['x'], hp['y'] - 0.014, 0.013)),
                  shell=dark, paw=dark, toes=0)

    # The tail: a long dark tube on three bones, a ring of the shell colour near the root, a
    # lit cap on the tip.
    pts = kit.spline(D['tail'], 20)
    radii = [0.03 - 0.018 * (i / (len(pts) - 1)) for i in range(len(pts))]
    tube, ts = kit.tube('Tail', pts, radii, ring=12)
    R.add(tube, dark, kit.chain(ts, ['tail.1', 'tail.2', 'tail.3']))
    tip = pts[-1]
    R.add(kit.superellipsoid('TailLed', (0.014, 0.014, 0.016), 0.8, 0.8, seg=(14, 10), location=(tip[0], tip[1] + 0.004, tip[2] + 0.006)),
          m['dot'](0), 'tail.3')
    R.ball('TailHub', 0.03, (0, 0.205, 0.1), m['joint'], 'body')

    return R.finish('FerretRig', rig_bones())
