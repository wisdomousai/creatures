"""Koda, the crew's robot husky: a grown, athletic sled dog of medium build. A thick ruff of
overlapping plates round the neck, pointed upright ears, a mask of dark plates over the
brow and crown with a white face under it, a grey saddle and flank panels over a white
body, a tail curled over the back, and a sled harness with a trace line trailing behind.

Her eyes are two ice-blue goggle rings round the screen's eyes (Dot0 right, Dot1 left; in
the colour look the face itself glows ice blue), and the harness has a lamp on the chest
(Dot2); the tag on her collar takes the beacon's colour. Faces -Y like the rest of the
crew; about 0.86 m to the ear tips.
"""

import math

import dogkit as dk
import kit
import looks

FACE = 'husky'
PREVIEW = dict(lift=0.0, width=0.7)
BOXY = 0.45

D = {
    'chest': dict(radii=(0.107, 0.15, 0.13), center=(0, -0.07, 0.44), e=0.55),
    'rump': dict(radii=(0.094, 0.14, 0.115), center=(0, 0.15, 0.43), e=0.55),
    'neck': dict(points=[(0, -0.17, 0.52), (0, -0.22, 0.6)], r=0.07),
    'ruff': dict(radii=(0.135, 0.085, 0.115), center=(0, -0.18, 0.56), e=0.65),
    'head': dict(radii=(0.097, 0.09, 0.086), center=(0, -0.29, 0.66)),
    # 2:1, like the husky's face layout (512 x 256)
    'screen': dict(radii=(0.074, 0.03, 0.037), center=(0, -0.368, 0.675), bezel=0.008),
    'muzzle': dict(radii=(0.042, 0.07, 0.036), center=(0, -0.36, 0.62), e=0.5),
    'nose': dict(radii=(0.022, 0.012, 0.017), center=(0, -0.435, 0.628)),
    'jaw': dict(radii=(0.034, 0.062, 0.014), center=(0, -0.355, 0.575), e=0.5, pivot=(0, -0.29, 0.592)),
    'ear': dict(radii=(0.024, 0.037, 0.058), x=0.062, y=-0.27, base=0.738, tilt=0.14, taper=1.3),
    'leg': dict(x=0.07, front=-0.17, back=0.22, top=0.38, r=0.031),
    'paw': dict(radii=(0.042, 0.056, 0.026)),
    # A sickle of a tail: up, over, and forward along the back.
    'tail': [(0, 0.255, 0.5), (0, 0.32, 0.56), (0, 0.33, 0.64), (0, 0.27, 0.69), (0, 0.19, 0.68)],
    'tail_r': (0.042, 0.026),
    # The trace line hangs from the harness ring on the back.
    'trace': [(0, 0.2, 0.575), (0, 0.32, 0.5), (0, 0.4, 0.3), (0, 0.43, 0.12)],
    'collar': dict(center=(0, -0.2, 0.545), major=0.095, minor=0.013, tilt=0.55),
}
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def rig_bones():
    e, lg, j = D['ear'], D['leg'], D['jaw']
    z = 0.44
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, lg['back'], z), (0, -0.2, z + 0.02), 'root'),
        ('head', (0, -0.17, 0.52), (0, -0.29, 0.76), 'body'),
        ('jaw', j['pivot'], (0, -0.43, j['pivot'][2]), 'head'),
        ('ear.L', (e['x'], e['y'], e['base']), (e['x'] + 0.012, e['y'], e['base'] + 0.11), 'head'),
        ('ear.R', (-e['x'], e['y'], e['base']), (-e['x'] - 0.012, e['y'], e['base'] + 0.11), 'head'),
    ]
    tb, _ = dk.tail_bones(D['tail'], 3)
    bones += tb
    pts = kit.spline(D['trace'], 3)
    bones += [('trace.1', pts[0], pts[1], 'body'), ('trace.2', pts[1], pts[2], 'trace.1')]
    for name, x, end in LEGS:
        bones.append((f'leg.{name}', (x * lg['x'], lg[end], lg['top']), (x * lg['x'], lg[end], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []
    coat = m['role']('Coat', 'shell')
    harness = m['role']('Harness', 'joint')

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    ch, ru = D['chest'], D['rump']
    add(kit.superellipsoid('Chest', ch['radii'], ch['e'], ch['e'], seg=(32, 22), location=ch['center']), coat, 'body')
    add(kit.superellipsoid('Rump', ru['radii'], ru['e'], ru['e'], seg=(32, 22), location=ru['center']), coat, 'body')
    # A white bib and belly under the grey coat.
    add(kit.superellipsoid('Bib', (0.088, 0.06, 0.1), 0.7, 0.7, seg=(24, 16), location=(0, -0.2, 0.455)), m['shell'], 'body')
    add(kit.superellipsoid('Belly', (0.085, 0.2, 0.05), 0.6, 0.6, seg=(24, 12), location=(0, 0.04, 0.345)), m['shell'], 'body')
    for side in (1, -1):
        dk.vents(add, m, f'Side.{side}', side * (ch['radii'][0] - 0.004), -0.1, 0.46, 'body', n=3, length=0.03, gap=0.015)
        add(kit.superellipsoid(f'Hatch.{side}', (0.005, 0.03, 0.024), 0.3, 0.3, seg=(16, 8),
                               location=(side * (ru['radii'][0] + 0.0), 0.2, 0.44)), m['joint'], 'body')
    dk.seam(add, m, 'Mid', ru['center'], ru['radii'], ru['e'], -0.1, 'body', dz=0.04)
    dk.seam(add, m, 'Rear', ru['center'], ru['radii'], ru['e'], 0.07, 'body', dz=0.04)

    # The sled harness: a chest band and a belly band in red, a lamp on the chest, a ring on the back.
    for k, dy in enumerate((-0.01, 0.075)):
        s = dk.cut_scale(dy, ch['radii'][1], ch['e'])
        add(kit.superellipsoid(f'Strap.{k}', (ch['radii'][0] * s + 0.007, 0.011, ch['radii'][2] * s + 0.007), ch['e'],
                               ch['e'], seg=(36, 8), location=(0, ch['center'][1] + dy, ch['center'][2])), harness, 'body')
    add(kit.superellipsoid('StrapSpine', (0.018, 0.1, 0.007), 0.5, 0.5, seg=(14, 8), location=(0, 0.035, 0.573)),
        harness, 'body')
    add(dk.ring('BackRing', (0, 0.2, 0.572), 0.026, 0.006, rot=(0, math.pi / 2, 0), seg=(20, 8)), m['bezel'], 'body')
    add(kit.superellipsoid('ChestLampRim', (0.034, 0.012, 0.034), 0.9, 0.9, seg=(20, 8),
                           location=(0, ch['center'][1] - ch['radii'][1] + 0.002, 0.46)), m['bezel'], 'body')
    add(kit.superellipsoid('ChestLamp', (0.026, 0.012, 0.026), 0.9, 0.9, seg=(20, 8),
                           location=(0, ch['center'][1] - ch['radii'][1] - 0.003, 0.46)), m['dot'](2), 'body')

    # The trace: a rope hanging from the back ring, with a handle loop on the end.
    tp = kit.spline(D['trace'], 12)
    rope, ts = kit.tube('Trace', tp, 0.011, ring=8)
    add(rope, harness, kit.chain(ts, ['trace.1', 'trace.2']))
    add(dk.ring('Loop', (tp[-1][0], tp[-1][1] + 0.012, tp[-1][2] + 0.02), 0.026, 0.007, rot=(0.3, 0, 0), seg=(20, 8)),
        harness, 'trace.2')
    add(dk.ball('Toggle', (tp[-1][0], tp[-1][1], tp[-1][2] + 0.001), 0.011, seg=(10, 6)), m['bezel'], 'trace.2')

    # Neck, and the ruff: a thick collar of overlapping plates.
    n = D['neck']
    neck, _ = kit.tube('Neck', kit.spline(n['points'], 6), n['r'], ring=14)
    add(neck, m['shell'], 'head')
    rf = D['ruff']
    add(kit.superellipsoid('Ruff', rf['radii'], rf['e'], rf['e'], seg=(32, 20), location=rf['center']),
        m['role']('Ruff', 'shell'), 'head')
    for k in range(9):
        a = math.radians(-80 + 20 * k)
        x = math.sin(a) * rf['radii'][0] * 0.98
        y = rf['center'][1] - math.cos(a) * rf['radii'][1] * 0.98
        add(kit.superellipsoid(f'RuffPlate.{k}', (0.016, 0.03, 0.03), 0.5, 0.5, seg=(12, 8), taper=0.8,
                               location=(x, y - 0.002, rf['center'][2] - 0.05),
                               rotation=(0.5, 0, a * 0.7)), m['role']('Ruff', 'shell'), 'head')
    dk.collar(add, m, (0, -0.2, 0.545), 0.095, 0.012, 0.55, 0.028)

    # The head: white face screen, a dark brow band and crown plate (the mask), a muzzle and jaw.
    dk.head(add, m, 'Husky', D['head'], D['screen'], BOXY)
    h, sc = D['head'], D['screen']
    add(kit.superellipsoid('Crown', (0.084, 0.062, 0.012), 0.5, 0.5, seg=(22, 10),
                           location=(0, h['center'][1] + 0.01, h['center'][2] + h['radii'][2] - 0.004)),
        m['role']('Mask', 'joint'), 'head')
    add(kit.superellipsoid('Brow', (0.082, 0.014, 0.012), 0.5, 0.5, seg=(22, 8),
                           location=(0, sc['center'][1] - sc['radii'][1] + 0.012, sc['center'][2] + sc['radii'][2] + 0.01)),
        m['role']('Mask', 'joint'), 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Cheek.{side}', (0.008, 0.04, 0.034), 0.5, 0.5, seg=(14, 8),
                               location=(side * (h['radii'][0] - 0.002), -0.3, 0.665)), m['role']('Mask', 'joint'), 'head')
    # Goggle rings round each eye: the ice-blue eyes.
    ex = 0.2 * 2 * sc['radii'][0]
    for k, side in enumerate((1, -1)):
        add(dk.ring(f'Eye.{k}', (side * ex, sc['center'][1] - sc['radii'][1] - 0.001, sc['center'][2]), 0.025, 0.0042,
                    rot=(math.pi / 2, 0, 0), seg=(28, 8)), m['dot'](k), 'head')
    mz, no, jw = D['muzzle'], D['nose'], D['jaw']
    add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(28, 18), location=mz['center']), m['shell'], 'head')
    add(kit.superellipsoid('Nose', no['radii'], 0.6, 0.8, seg=(16, 10), location=no['center']), m['bezel'], 'head')
    dk.nose_bits(add, m, no['center'], no['radii'])
    add(kit.superellipsoid('Jaw', jw['radii'], jw['e'], jw['e'], seg=(22, 12), location=jw['center']), m['shell'], 'jaw')
    dk.jaw_pins(add, m, 0.036, jw['pivot'], r=0.008)
    dk.cheek_bolts(add, m, h['radii'][0] + 0.003, -0.31, 0.7, r=0.0085)

    # Pointed upright ears: grey outside, a pink inner plate.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        cz = e['base'] + e['radii'][2] - 0.004
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], 0.7, 0.7, seg=(20, 14), taper=e['taper'],
                               location=(side * (e['x'] + 0.004), e['y'], cz), rotation=(0, side * e['tilt'], 0)),
            m['role']('Ear', 'joint'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarPlate.{sfx}', (0.006, 0.024, 0.04), 0.6, 0.6, seg=(12, 8), taper=1.1,
                               location=(side * (e['x'] - 0.004), e['y'] - 0.014, cz - 0.004),
                               rotation=(0, side * e['tilt'], 0)), m['role']('EarPlate', 'bezel'), f'ear.{sfx}')
        dk.ear_hinge(add, m, side, sfx, e['x'], e['y'], e['base'] + 0.004, f'ear.{sfx}', r=0.015)

    lg, pw = D['leg'], D['paw']['radii']
    for name, x, end in LEGS:
        dk.leg(add, m, name, x * lg['x'], lg[end], lg['top'], lg['r'], pw, f'leg.{name}', rings=(0.25, 0.65))
        dk.paw(add, m, name, x * lg['x'], lg[end], pw, f'leg.{name}', back=0.012)

    # The curled tail, bushy: a thick tube with plate rings, a light-free tip cap.
    pts = dk.tail(add, m, D['tail'], D['tail_r'], 3)
    add(kit.superellipsoid('TailTip', (0.027, 0.03, 0.027), seg=(14, 8), location=pts[-1]), m['role']('Ruff', 'shell'),
        'tail.3')

    return looks.finish(kit.armature('HuskyRig', rig_bones()), parts, skin, m)
