"""Pip, the crew's robot puppy: a big screen-faced head on a small round body, short
legs on big paws, big floppy ears, a little muzzle with a jaw that yaps open (a tongue
behind it), a stubby tail in two bones and a collar with a tag.

Each paw has three round toe beads across its front that light up, one light per paw
(Dot0 front left, Dot1 front right, Dot2 back left, Dot3 back right), so the site can
light his footsteps as he goes; Dot4 is the tip of his tail and Dot5 his nose. The ears
hang from hinge pucks and have inner panels, the paws have pads and cuffs, the round body
has seams, bolts and a back plate, and a tuft of plates sits on his head. The oversized
tag lights in the beacon's colour. Faces -Y like the rest
of the crew; about 0.52 m tall.

He carries a bone of his own (a bar with a knob at each end) on a bone that isn't parented to
the body; the site stretches it to nothing until he has one to carry or fetch.
"""

import math

import kit
import looks

FACE = 'puppy'
PREVIEW = dict(lift=0.0, width=0.6)
BOXY = 0.42

D = {
    'head': dict(radii=(0.17, 0.145, 0.14), center=(0, -0.16, 0.37)),
    # 2:1, like the puppy's face layout (512 x 256)
    'screen': dict(radii=(0.128, 0.08, 0.064), center=(0, -0.235, 0.395), bezel=0.01),
    'muzzle': dict(radii=(0.066, 0.05, 0.04), center=(0, -0.295, 0.3), e=0.45),
    'nose': dict(radii=(0.028, 0.016, 0.02), center=(0, -0.345, 0.322)),
    'jaw': dict(radii=(0.055, 0.045, 0.018), center=(0, -0.29, 0.252), e=0.5, pivot=(0, -0.245, 0.27)),
    'tongue': dict(radii=(0.034, 0.04, 0.01), center=(0, -0.3, 0.27)),
    # Big floppy ears from the top corners of the head.
    'ear': dict(radii=(0.052, 0.022, 0.1), x=0.178, y=-0.15, top=0.47, e=0.55, tilt=0.18),
    'body': dict(radii=(0.11, 0.14, 0.1), center=(0, 0.04, 0.2), e=0.6),
    'leg': dict(x=0.075, front=-0.055, back=0.13, top=0.18, r=0.036),
    'paw': dict(radii=(0.058, 0.068, 0.036), e=0.45),
    # Toes across the front of each paw.
    'toe': dict(r=0.02, spread=0.034, ahead=0.064, z=0.03),
    'tail': [(0, 0.16, 0.24), (0, 0.21, 0.3), (0, 0.23, 0.36)],
    'tail_r': (0.03, 0.022),
    'props': dict(bone=(0.3, -0.1)),
    'bone': dict(len=0.09, r=0.024, knob=0.03, spread=0.022),
    'hinge': dict(r=0.026, thick=0.014),
    'pad': dict(radii=(0.036, 0.04, 0.008), z=0.004),
    'cuff': dict(major=0.04, minor=0.008),
    'tuft': [(-0.03, 0.0, 0.0), (0.0, -0.012, 0.012), (0.03, 0.0, 0.0)],
    'bolt': dict(r=0.012, x=0.17, y=-0.16, z=0.42),
    'collar': dict(center=(0, -0.06, 0.27), major=0.085, minor=0.016, tilt=0.35),
    'tag': dict(radii=(0.045, 0.01, 0.045), center=(0, -0.155, 0.19)),
}
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def rig_bones():
    e, lg, j = D['ear'], D['leg'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, lg['back'], 0.2), (0, -0.08, 0.22), 'root'),
        ('head', (0, -0.08, 0.24), (0, -0.16, 0.52), 'body'),
        ('jaw', j['pivot'], (0, -0.33, j['pivot'][2]), 'head'),
        ('ear.L', (e['x'] - 0.02, e['y'], e['top']), (e['x'] + 0.01, e['y'], e['top'] - 0.18), 'head'),
        ('ear.R', (-e['x'] + 0.02, e['y'], e['top']), (-e['x'] - 0.01, e['y'], e['top'] - 0.18), 'head'),
    ]
    pts = kit.spline(D['tail'], 3)
    bones += [('tail.1', pts[0], pts[1], 'body'), ('tail.2', pts[1], pts[2], 'tail.1')]
    (bx, by) = D['props']['bone']
    bones.append(('bone', (bx, by, D['bone']['knob']), (bx, by, D['bone']['knob'] + 0.06), None))
    for name, x, end in LEGS:
        bones.append((f'leg.{name}', (x * lg['x'], lg[end], lg['top']), (x * lg['x'], lg[end], 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The big head: screen face, a little muzzle and nose, the jaw and tongue below.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], BOXY, BOXY, seg=(56, 36), location=h['center']), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Puppy', sc['radii'], sc['center'], sc['bezel'], e=BOXY)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    mz, n, j, t = D['muzzle'], D['nose'], D['jaw'], D['tongue']
    add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(28, 18), location=mz['center']), m['shell'],
        'head')
    add(kit.superellipsoid('Nose', n['radii'], 0.6, 0.8, seg=(18, 12), location=n['center']), m['dot'](5), 'head')
    add(kit.superellipsoid('Jaw', j['radii'], j['e'], j['e'], seg=(24, 12), location=j['center']), m['shell'], 'jaw')
    add(kit.superellipsoid('Tongue', t['radii'], 0.8, 0.8, seg=(18, 10), location=t['center']),
        m['role']('Tongue', 'joint'), 'jaw')

    e, hg = D['ear'], D['hinge']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], e['e'], e['e'], seg=(24, 16),
                               location=(side * e['x'], e['y'], e['top'] - e['radii'][2]),
                               rotation=(0, side * e['tilt'], 0)), m['role']('Ear', 'joint'), f'ear.{sfx}')
        # Inner panel on the ear's face, and the hinge puck it swings from.
        add(kit.superellipsoid(f'EarPanel.{sfx}', (0.03, 0.006, 0.068), 0.5, 0.5, seg=(16, 10),
                               location=(side * (e['x'] + 0.004), e['y'] - 0.019, e['top'] - e['radii'][2] - 0.005),
                               rotation=(0, side * e['tilt'], 0)), m['role']('EarPanel', 'shell'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarHinge.{sfx}', (hg['thick'], hg['r'], hg['r']), 0.9, 0.35, seg=(18, 8),
                               location=(side * (e['x'] - 0.012), e['y'], e['top'] + 0.004)), m['bezel'], 'head')
        add(kit.superellipsoid(f'EarPin.{sfx}', (0.008,) * 3, seg=(10, 6),
                               location=(side * (e['x'] + 0.004), e['y'], e['top'] + 0.004)), m['joint'], f'ear.{sfx}')

    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(40, 28), location=b['center']), m['shell'], 'body')
    c, tg = D['collar'], D['tag']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(36, 10), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['role']('Collar', 'joint'), 'body')
    add(kit.superellipsoid('Tag', tg['radii'], 1.0, 1.0, seg=(20, 10), location=tg['center'], rotation=(0.2, 0, 0)),
        m['beacon'], 'body')
    add(kit.torus('TagRim', 0.043, 0.006, seg=(24, 8), location=(tg['center'][0], tg['center'][1] - 0.006, tg['center'][2]),
                  rotation=(math.pi / 2 + 0.2, 0, 0)), m['bezel'], 'body')
    add(kit.superellipsoid('Buckle', (0.02, 0.01, 0.014), 0.5, 0.5, seg=(12, 8), location=(0.085, -0.07, 0.27)),
        m['bezel'], 'body')

    # Body seams: two belts round the round body, a plate on his back, flank bolts.
    for k, z in enumerate((0.155, 0.245)):
        zz = (z - b['center'][2]) / b['radii'][2]
        f = max(1 - abs(zz) ** (2 / b['e']), 0.0) ** (b['e'] / 2)
        belt = kit.torus(f'Seam.{k}', b['radii'][0] * f * 1.005, 0.0035, seg=(48, 6), location=(0, b['center'][1], z))
        kit.stretch(belt, 1.0, b['radii'][1] / b['radii'][0], 1.0)
        add(belt, m['joint'], 'body')
    add(kit.superellipsoid('BackPlate', (0.05, 0.06, 0.008), 0.4, 0.4, seg=(20, 10),
                           location=(0, b['center'][1] + 0.02, b['center'][2] + b['radii'][2] - 0.004)),
        m['role']('Patch', 'joint'), 'body')
    for side in (1, -1):
        add(kit.superellipsoid(f'Flank.{side}', (0.009,) * 3, seg=(10, 6),
                               location=(side * (b['radii'][0] - 0.006), b['center'][1] + 0.03, 0.21)), m['bezel'], 'body')
        add(kit.superellipsoid(f'Spot.{side}', (0.008, 0.038, 0.034), 0.6, 0.6, seg=(16, 10),
                               location=(side * (b['radii'][0] - 0.004), b['center'][1] - 0.02, 0.18)),
            m['role']('Patch', 'joint'), 'body')

    # Short legs on big paws, three lit toes across the front of each.
    lg, pw, to = D['leg'], D['paw'], D['toe']
    pd, cf = D['pad'], D['cuff']
    for i, (name, x, end) in enumerate(LEGS):
        lx, y = x * lg['x'], lg[end]
        leg, _ = kit.tube(f'Leg.{name}', [(lx, y, lg['top']), (lx, y, pw['radii'][2])], lg['r'], ring=14)
        add(leg, m['shell'], f'leg.{name}')
        add(kit.superellipsoid(f'Paw.{name}', pw['radii'], pw['e'], 0.6, seg=(24, 12),
                               location=(lx, y - 0.012, pw['radii'][2])), m['joint'], f'leg.{name}')
        add(kit.superellipsoid(f'Pad.{name}', pd['radii'], 0.5, 0.5, seg=(16, 8),
                               location=(lx, y - 0.006, pd['z'])), m['bezel'], f'leg.{name}')
        add(kit.torus(f'Cuff.{name}', cf['major'], cf['minor'], seg=(20, 6), location=(lx, y, 0.075)),
            m['role']('Cuff', 'bezel'), f'leg.{name}')
        for k in (-1, 0, 1):
            add(kit.superellipsoid(f'Toe.{name}.{k + 1}', (to['r'],) * 3, seg=(14, 8),
                                   location=(lx + k * to['spread'], y - 0.012 - to['ahead'] + abs(k) * 0.01, to['z'])),
                m['dot'](i), f'leg.{name}')

    # A cowlick of three plates on the crown, and a patch on one side of the head.
    for k, (dx, dy, dz) in enumerate(D['tuft']):
        add(kit.superellipsoid(f'Tuft.{k}', (0.014, 0.03, 0.006), 0.5, 0.5, seg=(12, 8),
                               location=(dx, h['center'][1] - 0.02 + dy, h['center'][2] + h['radii'][2] - 0.004 + dz),
                               rotation=(0.4, 0, (k - 1) * 0.5)), m['role']('Patch', 'joint'), 'head')
    add(kit.superellipsoid('HeadPatch', (0.05, 0.007, 0.05), 0.5, 0.5, seg=(18, 10),
                           location=(-0.11, -0.28, 0.4), rotation=(0, 0, 0.9)), m['role']('Patch', 'joint'), 'head')

    # Cheek bolts, so he reads as a machine from the side too.
    bo = D['bolt']
    for side in (1, -1):
        add(kit.superellipsoid(f'Bolt.{side}', (bo['r'],) * 3, seg=(12, 8), location=(side * bo['x'], bo['y'], bo['z'])),
            m['bezel'], 'head')

    # His bone: a bar with a double knob at each end, lying on the floor.
    bn, (bx, by) = D['bone'], D['props']['bone']
    add(kit.superellipsoid('BoneBar', (bn['len'], bn['r'], bn['r']), 1.0, 1.0, seg=(16, 10),
                           location=(bx, by, bn['knob'])), m['role']('Bone', 'shell'), 'bone')
    for sx in (1, -1):
        for sy in (1, -1):
            add(kit.superellipsoid(f'BoneKnob.{sx}.{sy}', (bn['knob'],) * 3, seg=(14, 10),
                                   location=(bx + sx * bn['len'], by + sy * bn['spread'], bn['knob'])),
                m['role']('Bone', 'shell'), 'bone')

    # A stubby tail over two bones.
    pts = kit.spline(D['tail'], 8)
    r0, r1 = D['tail_r']
    tail, ts = kit.tube('Tail', pts, [r0 + (r1 - r0) * i / (len(pts) - 1) for i in range(len(pts))], ring=12)
    add(tail, m['shell'], kit.chain(ts, ['tail.1', 'tail.2']))
    # Segment rings along the stub, and the lit tip.
    add(kit.superellipsoid('TailTip', (0.026, 0.026, 0.026), seg=(14, 8), location=D['tail'][-1]), m['dot'](4), 'tail.2')
    for k, at in enumerate((pts[len(pts) // 3], pts[2 * len(pts) // 3])):
        add(kit.torus(f'TailRing.{k}', 0.03 - 0.005 * k, 0.006, seg=(16, 6), location=tuple(at)),
            m['joint'], 'tail.1' if k == 0 else 'tail.2')

    return looks.finish(kit.armature('PuppyRig', rig_bones()), parts, skin, m)
