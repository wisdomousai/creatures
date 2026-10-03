"""Chrome, the crew's robot poodle: a show dog built like a toy robot. Long thin legs in
two segments with ball-joint knees, a chunky rounded jacket over the chest (the clip's
mane) and a slim rear, a long neck carrying a small head high, with a screen face, a
long narrow snout, and long ears.

Her pom-poms are faceted balls, like little mirror balls: one on top of her head, one on
each ear tip, a bracelet round each ankle, a rosette on each hip and a big one on the tip
of her short upright tail. Lit facets are scattered over each ball like glints, and
every pom-pom is its own light (Dot0 the head and ears, Dot1-4 the ankles FL FR BL BR,
Dot5 the tail, Dot6 the hips), so the site can sparkle them one at a time. Faces -Y like the rest of the crew; about 0.86 m to the top
of the topknot.
"""

import math

import bmesh
import bpy
from mathutils import Matrix

import kit
import looks

FACE = 'poodle'
PREVIEW = dict(lift=0.0, width=0.6)
BOXY = 0.4

D = {
    'body': dict(radii=(0.09, 0.15, 0.085), center=(0, 0.07, 0.43), e=0.5),
    # The mane: a jacket over the chest, bigger all round than the rear.
    'mane': dict(radii=(0.13, 0.125, 0.118), center=(0, -0.085, 0.45), e=0.62),
    'seam': dict(radii=(0.118, 0.016, 0.107), center=(0, 0.036, 0.45), e=0.62),
    'neck': dict(points=[(0, -0.12, 0.5), (0, -0.165, 0.62), (0, -0.19, 0.7)], r=0.04),
    'head': dict(radii=(0.095, 0.095, 0.085), center=(0, -0.21, 0.76)),
    # 2:1, like the poodle's face layout (512 x 256)
    'screen': dict(radii=(0.074, 0.03, 0.037), center=(0, -0.282, 0.775), bezel=0.008),
    'snout': dict(radii=(0.04, 0.075, 0.032), center=(0, -0.335, 0.708), e=0.5),
    'nose': dict(radii=(0.02, 0.012, 0.015), center=(0, -0.412, 0.72)),
    # Long ears hanging from the top corners of the head, a pom-pom on each tip.
    'ear': dict(radii=(0.024, 0.04, 0.085), x=0.1, y=-0.2, top=0.825, e=0.55, tilt=0.1),
    'leg': dict(x=0.068, front=-0.11, back=0.16, top=0.42, knee=0.22, r=(0.027, 0.023), ball=0.032),
    'paw': dict(radii=(0.034, 0.045, 0.022), e=0.45),
    'tail': [(0, 0.2, 0.47), (0, 0.235, 0.56), (0, 0.25, 0.63)],
    'tail_r': (0.024, 0.02),
    # Pom-poms: (name, centre, radius, squash, bone, light). The ankles' go on the shins.
    'poms': dict(top=((0, -0.2, 0.88), 0.068), ear=0.042, ankle=(0.085, 0.046), tail=0.06,
                 hip=((0.088, 0.11, 0.43), 0.052, (0.55, 1, 1))),
}
LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


def pom(name, center, r, base, lit, squash=(1, 1, 1)):
    """A faceted ball, flat-shaded like a mirror ball: an icosphere split twice, the middle
    facet of every four in the light's material and the rest in the base."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
    bm.verts.ensure_lookup_table()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.transform(Matrix.Diagonal((*squash, 1.0)))
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    kit.link(obj)
    mesh.materials.append(base)
    mesh.materials.append(lit)
    for f in mesh.polygons:
        f.use_smooth = False
        # Lit facets scattered like glints, the same on every ball.
        f.material_index = 1 if (f.index * 37 + 11) % 100 < 22 else 0
    return obj


def cut_scale(d, r, e):
    """How much a superellipsoid's cross-section shrinks `d` from its middle along an axis
    of radius `r` (so a seam band can sit flush on the shell there)."""
    return max(0.05, (1 - min(1, abs(d) / r) ** (2 / e)) ** (e / 2))


def ball(name, center, r, seg=(10, 6)):
    """A rivet, bolt or button: a small round ball."""
    return kit.superellipsoid(name, (r, r, r), seg=seg, location=center)


def ring(name, center, major, minor, rot=(0, 0, 0), seg=(20, 6)):
    """A collar, cup rim or seam ring, the axis along local Z before `rot`."""
    return kit.torus(name, major, minor, seg=seg, location=center, rotation=rot)


def rig_bones():
    e, lg = D['ear'], D['leg']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.17, 0.43), (0, -0.12, 0.45), 'root'),
        # The head pivots at the foot of the neck, so it carries the neck with it.
        ('head', (0, -0.13, 0.52), (0, -0.21, 0.9), 'body'),
        ('ear.L', (e['x'], e['y'], e['top']), (e['x'] + 0.01, e['y'], e['top'] - 0.2), 'head'),
        ('ear.R', (-e['x'], e['y'], e['top']), (-e['x'] - 0.01, e['y'], e['top'] - 0.2), 'head'),
    ]
    pts = kit.spline(D['tail'], 3)
    bones += [('tail.1', pts[0], pts[1], 'body'), ('tail.2', pts[1], pts[2], 'tail.1')]
    for name, x, end in LEGS:
        y = lg[end]
        bones.append((f'leg.{name}', (x * lg['x'], y, lg['top']), (x * lg['x'], y, lg['knee']), 'body'))
        bones.append((f'shin.{name}', (x * lg['x'], y, lg['knee']), (x * lg['x'], y, 0.0), f'leg.{name}'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []
    pom_base = m['role']('Pom', 'joint')

    def add(obj, mat, bone):
        if mat:
            kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Rear, mane and the seam where they meet.
    b, mn, sm = D['body'], D['mane'], D['seam']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(40, 28), location=b['center']), m['shell'], 'body')
    add(kit.superellipsoid('Mane', mn['radii'], mn['e'], mn['e'], seg=(48, 32), location=mn['center']),
        m['role']('Mane'), 'body')
    add(kit.superellipsoid('Seam', sm['radii'], sm['e'], sm['e'], seg=(48, 10), location=sm['center']),
        m['joint'], 'body')

    # A long neck up to a small head.
    n = D['neck']
    neck, _ = kit.tube('Neck', kit.spline(n['points'], 8), n['r'], ring=14)
    add(neck, m['shell'], 'head')
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], BOXY, BOXY, seg=(40, 28), location=h['center']), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Poodle', sc['radii'], sc['center'], sc['bezel'], e=BOXY)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    s, no = D['snout'], D['nose']
    add(kit.superellipsoid('Snout', s['radii'], s['e'], s['e'], seg=(28, 18), location=s['center']), m['shell'], 'head')
    add(kit.superellipsoid('Nose', no['radii'], 0.6, 0.8, seg=(18, 12), location=no['center']), m['bezel'], 'head')

    # Ears, each with a pom-pom at the tip.
    e, pm = D['ear'], D['poms']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        c = (side * e['x'], e['y'], e['top'] - e['radii'][2])
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], e['e'], e['e'], seg=(20, 14), location=c,
                               rotation=(0, side * e['tilt'], 0)), m['role']('Ear', 'joint'), f'ear.{sfx}')
        tip = (c[0] + side * e['tilt'] * e['radii'][2], c[1], c[2] - e['radii'][2])
        add(pom(f'Pom.Ear.{sfx}', tip, pm['ear'], pom_base, m['dot'](0)), None, f'ear.{sfx}')
    top, r = pm['top']
    add(pom('Pom.Top', top, r, pom_base, m['dot'](0)), None, 'head')

    # Legs: thigh, a ball joint at the knee, shin, a pom-pom bracelet and a paw.
    lg, pw = D['leg'], D['paw']
    at, ar = pm['ankle']
    for i, (name, x, end) in enumerate(LEGS):
        y, lx = lg[end], x * lg['x']
        thigh, _ = kit.tube(f'Thigh.{name}', [(lx, y, lg['top']), (lx, y, lg['knee'])], lg['r'][0], ring=12)
        add(thigh, m['shell'], f'leg.{name}')
        add(kit.superellipsoid(f'Knee.{name}', (lg['ball'],) * 3, seg=(16, 10), location=(lx, y, lg['knee'])),
            m['joint'], f'shin.{name}')
        shin, _ = kit.tube(f'Shin.{name}', [(lx, y, lg['knee']), (lx, y, pw['radii'][2])], lg['r'][1], ring=12)
        add(shin, m['shell'], f'shin.{name}')
        add(pom(f'Pom.{name}', (lx, y, at), ar, pom_base, m['dot'](1 + i)), None, f'shin.{name}')
        add(kit.superellipsoid(f'Paw.{name}', pw['radii'], pw['e'], 0.6, seg=(20, 10),
                               location=(lx, y - 0.01, pw['radii'][2])), m['joint'], f'shin.{name}')

    # Hip rosettes.
    hc, hr, hs = pm['hip']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(pom(f'Pom.Hip.{sfx}', (side * hc[0], hc[1], hc[2]), hr, pom_base, m['dot'](6), hs), None, 'body')

    # A short tail carried straight up, and the big pom-pom on its tip.
    pts = kit.spline(D['tail'], 8)
    r0, r1 = D['tail_r']
    tail, ts = kit.tube('Tail', pts, [r0 + (r1 - r0) * i / (len(pts) - 1) for i in range(len(pts))], ring=12)
    add(tail, m['shell'], kit.chain(ts, ['tail.1', 'tail.2']))
    tip = D['tail'][-1]
    add(pom('Pom.Tail', (tip[0], tip[1] + 0.005, tip[2] + 0.03), pm['tail'], pom_base, m['dot'](5)), None, 'tail.2')


    refine(add, m, pom_base)

    return looks.finish(kit.armature('PoodleRig', rig_bones()), parts, skin, m)


def refine(add, m, pom_base):
    """The fine detail: quilted jacket, hem, buttons, collar and show tag, layered ears with
    hinges, snout vents and seam, pom-pom mounts, knee cups and pins, pads, rear panels, and
    a ringed tail post."""
    j, sh, bz = m['joint'], m['shell'], m['bezel']
    mn, b, lg, e = D['mane'], D['body'], D['leg'], D['ear']
    mx, my, mz = mn['radii']
    cx, cy, cz = mn['center']

    # Jacket: quilting bands across the chest, a hem band round its lower edge, and a
    # row of buttons down the back.
    for i, dy in enumerate((-0.07, -0.02, 0.03)):
        k = cut_scale(dy, my, mn['e'])
        add(kit.superellipsoid(f'Quilt.{i}', (mx * k + 0.004, 0.006, mz * k + 0.004), mn['e'], mn['e'],
                               seg=(40, 8), location=(cx, cy + dy, cz)), j, 'body')
        top = cz + mz * k * 0.98
        add(ball(f'Button.{i}', (cx, cy + dy, top + 0.004), 0.0075), m['bezel'], 'body')
    k = cut_scale(-0.086, mz, mn['e'])
    add(kit.superellipsoid('Hem', (mx * k + 0.005, my * k + 0.005, 0.008), mn['e'], mn['e'], seg=(40, 8),
                           location=(cx, cy, cz - 0.086)), m['role']('Trim', 'joint'), 'body')
    # Spine ridge: a low plate running back over the top of the jacket.
    add(kit.superellipsoid('Ridge', (0.014, 0.085, 0.006), 0.5, 0.5, seg=(20, 8),
                           location=(cx, cy - 0.005, cz + mz - 0.004)), j, 'body')

    # Slim rear: panel seams with bolts down each side.
    for i, dy in enumerate((0.055, 0.105)):
        k = cut_scale(dy, b['radii'][1], b['e'])
        y = b['center'][1] + dy
        add(kit.superellipsoid(f'Panel.{i}', (b['radii'][0] * k + 0.003, 0.004, b['radii'][2] * k + 0.003),
                               b['e'], b['e'], seg=(32, 8), location=(0, y, b['center'][2])), j, 'body')
        for sx in (1, -1):
            for dz in (-0.03, 0.03):
                add(ball(f'PanelBolt.{i}.{sx}.{int(dz * 100)}', (sx * (b['radii'][0] * k + 0.0015), y, b['center'][2] + dz),
                         0.0055, seg=(8, 5)), bz, 'body')

    # Collar on the neck with rivets, a bow-tie plate and a show tag.
    tilt = math.atan2(0.045, 0.12)
    nc = (0, -0.147, 0.575)
    ax = (0, -math.sin(tilt), math.cos(tilt))
    add(ring('Collar', nc, 0.043, 0.008, rot=(tilt, 0, 0), seg=(24, 6)), j, 'head')
    for k in range(9):
        a = math.pi * (0.25 + 1.5 * k / 8) + math.pi / 2
        # around the ring, skipping the front where the bow sits
        lx, ly = 0.043 * math.cos(a), 0.043 * math.sin(a)
        p = (lx, nc[1] + ly * math.cos(tilt) - 0.0 * ax[1], nc[2] + ly * math.sin(tilt))
        add(ball(f'CollarRivet.{k}', p, 0.0048, seg=(8, 5)), bz, 'head')
    front = (0, nc[1] - 0.043 * math.cos(tilt) - 0.006, nc[2] - 0.043 * math.sin(tilt))
    for sx in (1, -1):
        add(kit.superellipsoid(f'BowWing.{sx}', (0.017, 0.006, 0.011), 0.5, 0.5, seg=(14, 8),
                               location=(sx * 0.02, front[1], front[2] + 0.002),
                               rotation=(0, sx * 0.45, 0)), m['role']('Bow', 'bezel'), 'head')
    add(ball('BowKnot', (0, front[1] - 0.002, front[2] + 0.002), 0.009, seg=(10, 6)), j, 'head')
    add(kit.superellipsoid('Tag', (0.012, 0.003, 0.012), 0.6, 0.6, seg=(16, 8),
                           location=(0, front[1] - 0.004, front[2] - 0.026)), sh, 'head')
    add(ball('TagHole', (0, front[1] - 0.0075, front[2] - 0.022), 0.003, seg=(6, 4)), bz, 'head')

    # Head: topknot mount, cheek bolts.
    top, _ = D['poms']['top']
    add(ring('Mount.Top', (top[0], top[1], 0.848), 0.033, 0.007, seg=(20, 6)), j, 'head')
    add(kit.superellipsoid('Mount.TopDisc', (0.03, 0.03, 0.005), 0.5, 0.5, seg=(16, 6),
                           location=(top[0], top[1], 0.85)), bz, 'head')
    for sx in (1, -1):
        for k, dz in enumerate((-0.012, 0.012)):
            add(ball(f'CheekBolt.{sx}.{k}', (sx * 0.0925, -0.24, 0.76 + dz), 0.0055, seg=(8, 5)), bz, 'head')

    # Ears: a hinge at the top, two layered plates on the outside, pins, tip collars.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bone = f'ear.{sfx}'
        x0, y0 = side * e['x'], e['y']
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.016, 0.02, 0.014), 0.7, 0.7, seg=(12, 8),
                               location=(x0 + side * 0.0, y0, e['top'] - 0.006)), j, bone)
        add(ball(f'EarPin.{sfx}', (x0 + side * 0.016, y0, e['top'] - 0.006), 0.008), bz, bone)
        for n, (rr, zc) in enumerate(((0.06, 0.755), (0.038, 0.7))):
            add(kit.superellipsoid(f'EarPlate.{sfx}.{n}', (0.006, 0.03 - 0.006 * n, rr * 0.8), 0.5, 0.5, seg=(14, 10),
                                   location=(x0 + side * (0.025 + 0.004 * n - e['tilt'] * (zc - 0.74) * -1), y0, zc),
                                   rotation=(0, side * e['tilt'], 0)), m['role']('EarPlate', 'shell'), bone)
        tipz = e['top'] - 2 * e['radii'][2]
        tx = x0 + side * e['tilt'] * 2 * e['radii'][2] * 0.5
        add(ring(f'Mount.Ear.{sfx}', (tx, y0, tipz + 0.004), 0.022, 0.006, seg=(16, 6)), j, bone)

    # Snout: nose cap ring, nostril vents, a jaw seam and whisker dots.
    s, no = D['snout'], D['nose']
    add(kit.superellipsoid('NoseCap', (0.023, 0.004, 0.018), 0.6, 0.6, seg=(18, 8),
                           location=(0, no['center'][1] + 0.011, no['center'][2])), j, 'head')
    for sx in (1, -1):
        add(kit.superellipsoid(f'Nostril.{sx}', (0.0045, 0.003, 0.0035), seg=(8, 5),
                               location=(sx * 0.009, no['center'][1] - 0.011, no['center'][2] - 0.001)), j, 'head')
    sc = s['center']
    add(kit.superellipsoid('JawSeam', (s['radii'][0] + 0.0015, s['radii'][1] + 0.0015, 0.0022), s['e'], s['e'],
                           seg=(28, 6), location=(sc[0], sc[1], sc[2] - 0.006)), j, 'head')
    for sx in (1, -1):
        for k in range(3):
            add(ball(f'Whisker.{sx}.{k}', (sx * 0.031, sc[1] - 0.03 - 0.011 * k, sc[2] + 0.004 + 0.003 * k), 0.0035,
                     seg=(6, 4)), bz, 'head')

    # Legs: knee cups and pins, an ankle ring above and below each bracelet, pads and toes.
    pw = D['paw']
    at, ar = D['poms']['ankle']
    for i, (name, x, end) in enumerate(LEGS):
        y, lx = lg[end], x * lg['x']
        add(ring(f'KneeCup.{name}', (lx, y, lg['knee'] + 0.021), 0.024, 0.006, seg=(18, 6)), sh, f'leg.{name}')
        pin, _ = kit.tube(f'KneePin.{name}', [(lx - 0.038, y, lg['knee']), (lx + 0.038, y, lg['knee'])], 0.0065, ring=8)
        add(pin, sh, f'shin.{name}')
        for sx in (1, -1):
            add(ball(f'KneeCap.{name}.{sx}', (lx + sx * 0.039, y, lg['knee']), 0.0105, seg=(10, 6)), bz, f'shin.{name}')
        add(ring(f'Mount.Ankle.{name}', (lx, y, at - 0.03), 0.026, 0.005, seg=(16, 6)), j, f'shin.{name}')
        add(ring(f'Mount.Ankle2.{name}', (lx, y, at + 0.03), 0.026, 0.005, seg=(16, 6)), j, f'shin.{name}')
        add(kit.superellipsoid(f'Pad.{name}', (pw['radii'][0] * 0.92, pw['radii'][1] * 0.92, 0.005), 0.5, 0.5,
                               seg=(20, 6), location=(lx, y - 0.01, 0.0035)), bz, f'shin.{name}')
        for k in (-1, 0, 1):
            add(ball(f'Toe.{name}.{k}', (lx + k * 0.0125, y - 0.01 - pw['radii'][1] + 0.003, 0.016), 0.0072, seg=(8, 5)),
                bz, f'shin.{name}')

    # Hip rosette mounts: a ring and a bolt behind each rosette.
    hc, hr, hs = D['poms']['hip']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(ring(f'Mount.Hip.{sfx}', (side * (hc[0] - 0.02), hc[1], hc[2]), 0.03, 0.006,
                 rot=(0, math.pi / 2, 0), seg=(16, 6)), j, 'body')

    # Tail post: rings along it, with a mount under the pom-pom.
    pts = kit.spline(D['tail'], 8)
    for k, idx in enumerate((2, 4, 6)):
        a, c = pts[idx - 1], pts[idx + 1]
        ang = -math.atan2(c[1] - a[1], c[2] - a[2])
        add(ring(f'TailRing.{k}', pts[idx], 0.028 - 0.002 * k, 0.005, rot=(ang, 0, 0), seg=(16, 6)), j,
            'tail.1' if idx < 4 else 'tail.2')
    tip = D['tail'][-1]
    add(ring('Mount.Tail', (tip[0], tip[1] + 0.002, tip[2] + 0.005), 0.026, 0.006,
             rot=(-0.3, 0, 0), seg=(16, 6)), j, 'tail.2')
