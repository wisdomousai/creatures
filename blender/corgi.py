"""Toast, the crew's robot corgi: small and long, on very short legs. A loaf of a body in two
shells, chest and rump, joined at a waist so the rump can swing on its own (the butt
wiggle); a fox face with a pointed muzzle and a jaw that opens, enormous upright ears, a
white chest, white socks, and no tail to speak of, only a stub.

His lights are his two round rump lamps (Dot0 left, Dot1 right), which flash in turn as
he wiggles, and the stub's tip (Dot2); the tag on his collar takes the beacon's colour.
Faces -Y like the rest of the crew; about 0.58 m to the ear tips and 0.65 m long.
"""

import math

import dogkit as dk
import kit
import looks

FACE = 'corgi'
PREVIEW = dict(lift=0.0, width=0.7)
BOXY = 0.45

D = {
    'chest': dict(radii=(0.102, 0.13, 0.1), center=(0, -0.08, 0.205), e=0.55),
    'waist': dict(radii=(0.088, 0.08, 0.088), center=(0, 0.03, 0.2), e=0.55),
    'rump': dict(radii=(0.098, 0.12, 0.097), center=(0, 0.14, 0.2), e=0.55),
    'bib': dict(radii=(0.075, 0.05, 0.085), center=(0, -0.17, 0.19)),
    'neck': dict(points=[(0, -0.13, 0.25), (0, -0.19, 0.305)], r=0.062),
    'head': dict(radii=(0.09, 0.083, 0.078), center=(0, -0.23, 0.34)),
    # 2:1, like the corgi's face layout (512 x 256)
    'screen': dict(radii=(0.072, 0.028, 0.036), center=(0, -0.3, 0.355), bezel=0.008),
    'muzzle': dict(radii=(0.036, 0.066, 0.03), center=(0, -0.322, 0.305), e=0.6),
    'nose': dict(radii=(0.019, 0.011, 0.014), center=(0, -0.39, 0.312)),
    'jaw': dict(radii=(0.028, 0.055, 0.012), center=(0, -0.315, 0.268), e=0.5, pivot=(0, -0.26, 0.282)),
    'ear': dict(radii=(0.02, 0.05, 0.095), x=0.064, y=-0.215, base=0.385, tilt=0.24, taper=1.1),
    'leg': dict(x=0.062, front=-0.13, back=0.17, top=0.16, r=0.028),
    'paw': dict(radii=(0.042, 0.054, 0.025)),
    'tail': [(0, 0.255, 0.215), (0, 0.272, 0.23), (0, 0.285, 0.248)],
    'tail_r': (0.028, 0.022),
    'collar': dict(center=(0, -0.165, 0.275), major=0.07, minor=0.013, tilt=0.55),
}
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def rig_bones():
    e, lg, j = D['ear'], D['leg'], D['jaw']
    z = 0.2
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # The body bone runs from the hips forward, like every pet's; the rump swings from the waist.
        ('body', (0, lg['back'], z), (0, -0.14, z + 0.02), 'root'),
        ('rump', (0, 0.03, z), (0, 0.24, z), 'body'),
        ('head', (0, -0.13, 0.25), (0, -0.23, 0.42), 'body'),
        ('jaw', j['pivot'], (0, -0.37, j['pivot'][2]), 'head'),
        ('ear.L', (e['x'], e['y'], e['base']), (e['x'] + 0.02, e['y'], e['base'] + 0.17), 'head'),
        ('ear.R', (-e['x'], e['y'], e['base']), (-e['x'] - 0.02, e['y'], e['base'] + 0.17), 'head'),
    ]
    tb, _ = dk.tail_bones(D['tail'], 2, parent='rump')
    bones += tb
    for name, x, end in LEGS:
        bones.append((f'leg.{name}', (x * lg['x'], lg[end], lg['top']), (x * lg['x'], lg[end], 0.0),
                      'body' if end == 'front' else 'rump'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []
    white = m['role']('White', 'shell')
    white_j = m['role']('White', 'joint')

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # The loaf: chest, waist, rump.
    ch, wa, ru = D['chest'], D['waist'], D['rump']
    add(kit.superellipsoid('Chest', ch['radii'], ch['e'], ch['e'], seg=(32, 22), location=ch['center']), m['shell'], 'body')
    add(kit.superellipsoid('Waist', wa['radii'], wa['e'], wa['e'], seg=(28, 18), location=wa['center']), m['shell'], 'body')
    add(kit.superellipsoid('Rump', ru['radii'], ru['e'], ru['e'], seg=(32, 22), location=ru['center']), m['shell'], 'rump')
    b = D['bib']
    add(kit.superellipsoid('Bib', b['radii'], 0.7, 0.7, seg=(24, 16), location=b['center']), white, 'body')
    # Seams at the waist where the rump swings, and rear and front bands.
    dk.seam(add, m, 'Waist', ru['center'], ru['radii'], ru['e'], -0.085, 'rump', dz=0.04)
    dk.seam(add, m, 'Chest', ch['center'], ch['radii'], ch['e'], 0.07, 'body', dz=0.04)
    dk.seam(add, m, 'Rump', ru['center'], ru['radii'], ru['e'], 0.06, 'rump', dz=0.04)
    # Saddle plate and spine ridge along the back.
    add(kit.superellipsoid('Saddle', (0.05, 0.1, 0.008), 0.5, 0.5, seg=(20, 10), location=(0, 0.02, 0.292)),
        m['role']('Saddle', 'joint'), 'body')
    for side in (1, -1):
        dk.vents(add, m, f'Flank.{side}', side * (ch['radii'][0] - 0.004), -0.08, 0.21, 'body', n=3, length=0.028,
                 gap=0.014)
        add(kit.superellipsoid(f'Hatch.{side}', (0.005, 0.028, 0.022), 0.3, 0.3, seg=(16, 8),
                               location=(side * (ru['radii'][0] - 0.001), 0.12, 0.205)), m['joint'], 'rump')

    # The rump lamps: a round light each cheek, framed, facing back and out.
    for k, side in enumerate((1, -1)):
        c = (side * 0.052, ru['center'][1] + ru['radii'][1] - 0.012, 0.2)
        add(kit.superellipsoid(f'LampRim.{k}', (0.03, 0.01, 0.03), 0.9, 0.9, seg=(20, 8), location=(c[0], c[1] + 0.002, c[2])),
            m['bezel'], 'rump')
        add(kit.superellipsoid(f'Lamp.{k}', (0.023, 0.01, 0.023), 0.9, 0.9, seg=(20, 8), location=(c[0], c[1] + 0.007, c[2])),
            m['dot'](k), 'rump')

    # Short neck, collar and tag.
    n = D['neck']
    neck, _ = kit.tube('Neck', kit.spline(n['points'], 6), n['r'], ring=14)
    add(neck, m['shell'], 'head')
    c = D['collar']
    dk.collar(add, m, c['center'], c['major'], c['minor'], c['tilt'], 0.03)

    # The head: a fox face, pointed white muzzle, a jaw, a nose.
    dk.head(add, m, 'Corgi', D['head'], D['screen'], BOXY)
    mz, no, jw = D['muzzle'], D['nose'], D['jaw']
    add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(28, 18), location=mz['center']),
        m['role']('Muzzle', 'shell'), 'head')
    add(kit.superellipsoid('Nose', no['radii'], 0.6, 0.8, seg=(16, 10), location=no['center']), m['bezel'], 'head')
    dk.nose_bits(add, m, no['center'], no['radii'])
    add(kit.superellipsoid('Jaw', jw['radii'], jw['e'], jw['e'], seg=(22, 12), location=jw['center']),
        m['role']('Muzzle', 'joint'), 'jaw')
    dk.jaw_pins(add, m, 0.03, jw['pivot'], r=0.007)
    # White blaze up the face between the ears.
    add(kit.superellipsoid('Blaze', (0.012, 0.05, 0.006), 0.5, 0.5, seg=(14, 8),
                           location=(0, -0.2, D['head']['center'][2] + D['head']['radii'][2] - 0.003)),
        m['role']('Muzzle', 'shell'), 'head')
    dk.cheek_bolts(add, m, D['head']['radii'][0] - 0.003, -0.235, 0.35, r=0.008)

    # Enormous upright ears with a pink inside and a hinge at the root.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        cz = e['base'] + e['radii'][2] - 0.005
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], 0.7, 0.7, seg=(22, 16), taper=e['taper'],
                               location=(side * (e['x'] + 0.008), e['y'], cz), rotation=(0, side * e['tilt'], 0)),
            m['role']('Ear', 'joint'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarPlate.{sfx}', (0.006, 0.034, 0.068), 0.6, 0.6, seg=(14, 10), taper=1.0,
                               location=(side * (e['x'] - 0.002), e['y'] - 0.018, cz - 0.004),
                               rotation=(0, side * e['tilt'], 0)), m['role']('EarPlate', 'bezel'), f'ear.{sfx}')
        dk.ear_hinge(add, m, side, sfx, e['x'], e['y'], e['base'] + 0.004, f'ear.{sfx}', r=0.017)

    # Very short legs, white socks.
    lg, pw = D['leg'], D['paw']['radii']
    for name, x, end in LEGS:
        lx, y = x * lg['x'], lg[end]
        bone = f'leg.{name}'
        tube, _ = kit.tube(f'Leg.{name}', [(lx, y, lg['top']), (lx, y, pw[2])], lg['r'], ring=12)
        add(tube, white, bone)
        add(dk.ring(f'Cuff.{name}', (lx, y, 0.08), lg['r'] + 0.003, 0.006), m['joint'], bone)
        dk.paw(add, m, name, lx, y, pw, bone, back=0.012, mat=white_j)

    # A stub of a tail, with a light on its tip.
    pts = dk.tail(add, m, D['tail'], D['tail_r'], 2, rings=False)
    add(kit.superellipsoid('StubTip', (0.024, 0.024, 0.024), seg=(14, 8), location=pts[-1]), m['dot'](2), 'tail.2')
    add(dk.ring('StubRing', pts[1], 0.03, 0.005, rot=(-0.8, 0, 0)), m['joint'], 'tail.1')

    return looks.finish(kit.armature('CorgiRig', rig_bones()), parts, skin, m)
