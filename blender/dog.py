"""Byte, the crew's robot dog: a screen-faced head with a snout that opens (a jaw, and a
tongue behind it for panting), floppy ear flaps on hinges, a sturdy body on four legs,
a segmented wagging tail in three bones with a lit tip, and a collar with a tag that
lights in the beacon's colour. Faces -Y like the rest of the crew; about 0.68 m tall.

Byte's fine detail (seams, bolts, hinges, pads, lights, the coat's patches) is all in
refine(), coat_body() and coat_head(), which nothing else calls. Lights: Dot0 the tail
tip, Dot1-2 the tail's collars, Dot3 the ear hinges, Dot4 the nose.
Coat: in the colour look the saddle and the head's cap are Patch, a flank
and a cheek Spot; in ink and paper they take the base part's colour.
"""

import math

from mathutils import Vector

import cat
import kit
import looks

FACE = 'dog'
PREVIEW = dict(lift=0.0, width=0.75)
BOXY = 0.35

D = {
    'head': dict(radii=(0.2, 0.17, 0.155), center=(0, -0.24, 0.52)),
    # 2:1, like the dog's face layout (512 x 256)
    'screen': dict(radii=(0.16, 0.11, 0.08), center=(0, -0.315, 0.575), bezel=0.01),
    'snout': dict(radii=(0.09, 0.09, 0.055), center=(0, -0.4, 0.44), e=0.45),
    'nose': dict(radii=(0.035, 0.02, 0.022), center=(0, -0.488, 0.47)),
    'jaw': dict(radii=(0.075, 0.075, 0.024), center=(0, -0.395, 0.372), e=0.5, pivot=(0, -0.33, 0.39)),
    'tongue': dict(radii=(0.045, 0.055, 0.012), center=(0, -0.41, 0.396)),
    # Floppy ears hang from the top corners of the head.
    'ear': dict(radii=(0.055, 0.022, 0.12), x=0.212, y=-0.22, top=0.665, e=0.55, tilt=0.12),
    'body': dict(radii=(0.16, 0.27, 0.14), center=(0, 0.05, 0.3), e=0.45),
    'leg': dict(x=0.1, front=-0.14, back=0.22, top=0.26, bottom=0.04, r=0.045),
    'paw': dict(radii=(0.056, 0.066, 0.034), e=0.4),
    'tail': [(0, 0.29, 0.36), (0, 0.37, 0.44), (0, 0.43, 0.56)],
    'tail_r': (0.033, 0.024),
    'tail_bones': 3,
    'collar': dict(center=(0, -0.17, 0.4), major=0.12, minor=0.018, tilt=0.5),
    'tag': dict(radii=(0.028, 0.008, 0.028), center=(0, -0.27, 0.265)),
}


def coat_body(obj, m):
    """A saddle over the back (Patch) and a spot on the left flank (Spot)."""
    b = D['body']
    c, r = b['center'], b['radii']

    def region(x, y, z):
        if z > 0.5 and -0.45 < y < 0.5:
            return m['role']('Patch')
        if x > 0.3 and 0.25 < y < 0.75 and -0.35 < z < 0.35:
            return m['role']('Spot')
        return None

    planes = [((c[0], c[1] + v * r[1], c[2]), (0, 1, 0)) for v in (-0.45, 0.5, 0.25, 0.75)]
    planes += [((c[0], c[1], c[2] + v * r[2]), (0, 0, 1)) for v in (0.5, 0.35, -0.35)]
    planes += [((c[0] + 0.3 * r[0], c[1], c[2]), (1, 0, 0))]
    return cat.paint(obj, lambda p: region(*cat.normalised(p, c, r)), planes)


def coat_head(obj, m):
    """A cap over the top of the head (Patch), and a spot on the right cheek (Spot)."""
    h = D['head']
    c, r = h['center'], h['radii']

    def region(x, y, z):
        if z > 0.62 and abs(x) < 0.6:
            return m['role']('Patch')
        if x < -0.5 and z < 0.05:
            return m['role']('Spot')
        return None

    planes = [((c[0], c[1], c[2] + v * r[2]), (0, 0, 1)) for v in (0.62, 0.05)]
    planes += [((c[0] + v * r[0], c[1], c[2]), (1, 0, 0)) for v in (0.6, -0.6, -0.5)]
    return cat.paint(obj, lambda p: region(*cat.normalised(p, c, r)), planes)


def refine(add, m):
    """Byte's finer detail: seam plates round the body, a row of back plates, hip hubs
    with bolts, anklets, pads and toe beads on each paw, ear hinges with a light and an
    inner panel, a muzzle band, cheek bolts, a studded collar with a lit tag on a ring,
    and the tail's collars with a lit tip."""
    b, lg = D['body'], D['leg']
    bx, by, bz = b['center']
    rx, ry, rz = b['radii']
    # Seam plates: thin rounded slabs a hair wider than the body, at the waist and hips.
    for j, dy in enumerate((-0.45, 0.05, 0.55)):
        add(kit.superellipsoid(f'Seam.{j}', (rx * 1.012, rz * 1.012, 0.004), b['e'], b['e'], seg=(32, 8),
                               location=(bx, by + dy * ry, bz), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    # Back plates down the spine.
    for j, y in enumerate((-0.09, 0.0, 0.09, 0.18)):
        w = 0.05 - 0.005 * abs(j - 1.5)
        add(kit.superellipsoid(f'Back.{j}', (w, 0.03, 0.008), 0.5, 0.5, seg=(16, 6),
                               location=(0, y + 0.03, bz + rz * 0.985 - 0.004 * (j in (0, 3)))),
            m['joint'], 'body')
    # Hubs and bolts at the shoulders and hips, an anklet, a pad and toe beads on each paw.
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        bone = f'leg.{name}'
        add(kit.superellipsoid(f'Hub.{name}', (0.034, 0.034, 0.009), 0.3, 1.0, seg=(18, 6),
                               location=(x * 0.154, y, lg['top'] - 0.005), rotation=(0, math.pi / 2, 0)),
            m['joint'], bone)
        add(kit.superellipsoid(f'Bolt.{name}', (0.01,) * 3, seg=(8, 6), location=(x * 0.163, y, lg['top'] - 0.005)),
            m['bezel'], bone)
        add(kit.torus(f'Anklet.{name}', lg['r'] + 0.004, 0.007, seg=(20, 6), location=(x * lg['x'], y, 0.1)),
            m['joint'], bone)
        py = y - 0.014
        add(kit.superellipsoid(f'Pad.{name}', (0.034, 0.042, 0.005), 0.5, 0.5, seg=(14, 6),
                               location=(x * lg['x'], py + 0.008, 0.003)), m['role']('Pad', 'bezel'), bone)
        for k in (-1, 0, 1):
            add(kit.superellipsoid(f'Toe.{name}.{k}', (0.012, 0.01, 0.01), seg=(8, 6),
                                   location=(x * lg['x'] + k * 0.026, py - 0.06, 0.028 - 0.005 * abs(k))),
                m['role']('Pad', 'bezel'), bone)
    # Ears: a hinge puck at the top of each flap with a light (Dot3), and an inner panel.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        hx = side * (e['x'] - 0.006)
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.03, 0.03, 0.022), 0.3, 1.0, seg=(16, 6),
                               location=(hx, e['y'], e['top'] - 0.02), rotation=(math.pi / 2, 0, 0)), m['joint'],
            f'ear.{sfx}')
        add(kit.superellipsoid(f'EarLed.{sfx}', (0.009,) * 3, seg=(8, 6),
                               location=(hx, e['y'] - 0.024, e['top'] - 0.02)), m['dot'](3), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarPad.{sfx}', (0.03, 0.005, 0.078), 0.5, 0.5, seg=(14, 8),
                               location=(side * (e['x'] + 0.002), e['y'] - e['radii'][1] + 0.002, e['top'] - 0.13),
                               rotation=(0, side * e['tilt'], 0)), m['role']('Inner', 'bezel'), f'ear.{sfx}')
    # Muzzle band round the snout and cheek bolts.
    s = D['snout']
    sx, sy, sz = s['center']
    add(kit.superellipsoid('Muzzle', (s['radii'][0] * 1.015, 0.008, s['radii'][2] * 1.02), s['e'], s['e'],
                           seg=(28, 6), location=(0, sy + 0.025, sz)), m['joint'], 'head')
    hx, hy, hz = D['head']['center']
    for side in (1, -1):
        for dy, dz in ((0.03, -0.02), (0.11, 0.05)):
            add(kit.superellipsoid(f'Cheek.{side}.{dy}', (0.009,) * 3, seg=(8, 6),
                                   location=(side * (D['head']['radii'][0] - 0.003), hy + dy, hz + dz)),
                m['bezel'], 'head')
    # Collar studs and the tag: a lit disc on a small ring under the chin.
    c = D['collar']
    cx, cy, cz = c['center']
    for a in (205, 230, 250, 270, 290, 310, 335):
        r, t = math.radians(a), c['tilt']
        add(kit.superellipsoid(f'Stud.{a}', (0.009,) * 3, seg=(8, 6),
                               location=(cx + (c['major'] + 0.003) * math.cos(r),
                                         cy + (c['major'] + 0.003) * math.sin(r) * math.cos(t),
                                         cz + (c['major'] + 0.003) * math.sin(r) * math.sin(t))), m['bezel'], 'body')
    tg = D['tag']['center']
    add(kit.torus('TagRing', 0.013, 0.004, seg=(14, 6), location=(0, tg[1] + 0.006, tg[2] + 0.034),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'body')
    add(kit.superellipsoid('TagRim', (0.036, 0.007, 0.036), 0.3, 1.0, seg=(24, 6),
                           location=(0, tg[1] + 0.006, tg[2]), rotation=(0.3, 0, 0)), m['joint'], 'body')
    # Tail: collars at the joints between its bones (Dot1, Dot2), a lit tip (Dot0), a hub at the rump.
    pts = [Vector(q) for q in kit.spline(D['tail'], 97)]
    r0, r1 = D['tail_r']
    for i, t in ((1, 1 / 3), (2, 2 / 3)):
        cat.ring_at(add, f'TailBand.{i}', m['dot'](i), f'tail.{i + 1}', pts, round(t * 96),
                    r0 + (r1 - r0) * t + 0.004, 0.006)
    add(kit.superellipsoid('TailTip', (0.026, 0.026, 0.034), seg=(14, 10),
                           location=tuple(pts[-1] + Vector((0, -0.008, 0.008)))), m['dot'](0), 'tail.3')
    p0 = Vector(D['tail'][0])
    add(kit.superellipsoid('TailHub', (0.045, 0.045, 0.034), 0.4, 1.0, seg=(16, 8), location=(0, p0.y - 0.005, p0.z),
                           rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')

    refine2(add, m)


def refine2(add, m):
    """The second pass: stitched ear edges with a lit inner rim, screws at the screen's
    corners, cheek plates, a highlight lens on the nose, a bone-shaped charm on the tag,
    flanges on the tail's collars and a toe-bean cleft on each pad."""
    e, h = D['ear'], D['head']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ex, ey = side * e['x'], e['y']
        zc = e['top'] - e['radii'][2]
        rot = (0, side * e['tilt'], 0)
        # A thin rim behind the flap, a hair bigger: reads as a bound edge.
        add(kit.superellipsoid(f'EarRim.{sfx}', (e['radii'][0] + 0.005, 0.008, e['radii'][2] + 0.005), e['e'], e['e'],
                               seg=(22, 10), location=(ex, ey + 0.012, zc), rotation=rot), m['joint'], f'ear.{sfx}')
        # Stitches along the bottom of the flap.
        for k in (-2, -1, 0, 1, 2):
            add(kit.superellipsoid(f'Stitch.{sfx}.{k + 2}', (0.006, 0.004, 0.003), seg=(6, 4),
                                   location=(ex + side * 0.004 * abs(k) * 0, ey - e['radii'][1] - 0.001,
                                             zc - e['radii'][2] * 0.86 + 0.02 * abs(k) * 0.35),
                                   rotation=(0, k * 0.1, 0)), m['bezel'], f'ear.{sfx}')
        # A lit inner rim: a slim capsule down the inner edge.
        add(kit.superellipsoid(f'EarLight.{sfx}', (0.005, 0.005, 0.07), 0.5, 1.0, seg=(8, 8),
                               location=(side * (e['x'] - e['radii'][0] * 0.8), ey - e['radii'][1] - 0.001, zc - 0.005)),
            m['dot'](3), f'ear.{sfx}')
    # Cheek plates.
    hx, hy, hz = h['center']
    for side in (1, -1):
        add(kit.superellipsoid(f'CheekPlate.{side}', (0.004, 0.05, 0.035), 0.5, 0.5, seg=(16, 8),
                               location=(side * (h['radii'][0] + 0.001), hy + 0.07, hz - 0.045)), m['joint'], 'head')
    # A highlight lens on the nose.
    n = D['nose']['center']
    add(kit.superellipsoid('NoseLens', (0.011, 0.006, 0.006), seg=(10, 6),
                           location=(-0.012, n[1] - 0.012, n[2] + 0.014)), m['bezel'], 'head')
    # A little bone charm hanging from the tag.
    tg = D['tag']['center']
    bz = tg[2] - 0.05
    add(kit.superellipsoid('CharmBar', (0.02, 0.005, 0.005), seg=(10, 6), location=(0, tg[1] + 0.004, bz)),
        m['bezel'], 'body')
    for k, sx in enumerate((-1, 1)):
        for dz in (-0.005, 0.005):
            add(kit.superellipsoid(f'CharmKnob.{k}.{dz}', (0.007,) * 3, seg=(8, 6),
                                   location=(sx * 0.022, tg[1] + 0.004, bz + dz)), m['bezel'], 'body')
    # Flanges beside each tail collar.
    pts = [Vector(q) for q in kit.spline(D['tail'], 97)]
    r0, r1 = D['tail_r']
    for i, t in ((1, 1 / 3), (2, 2 / 3)):
        cat.ring_at(add, f'TailFlange.{i}', m['joint'], f'tail.{i + 1}', pts, round(t * 96) + 5,
                    r0 + (r1 - r0) * t + 0.002, 0.004)
    # A cleft in each pad: a slim slot between the toes and heel.
    lg = D['leg']
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        add(kit.superellipsoid(f'Cleft.{name}', (0.02, 0.005, 0.002), seg=(8, 4),
                               location=(x * lg['x'], y - 0.014 - 0.03, 0.006)), m['joint'], f'leg.{name}')


def rig_bones():
    e, lg, j = D['ear'], D['leg'], D['jaw']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0.24, 0.3), (0, -0.16, 0.32), 'root'),
        ('head', (0, -0.18, 0.4), (0, -0.24, 0.68), 'body'),
        ('jaw', j['pivot'], (0, -0.46, j['pivot'][2]), 'head'),
        ('ear.L', (e['x'] - 0.02, e['y'], e['top']), (e['x'] + 0.01, e['y'], e['top'] - 0.18), 'head'),
        ('ear.R', (-e['x'] + 0.02, e['y'], e['top']), (-e['x'] - 0.01, e['y'], e['top'] - 0.18), 'head'),
    ]
    bones += cat.tail_bones(D['tail'], D['tail_bones'])
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        bones.append((f'leg.{name}', (x * lg['x'], y, lg['top']), (x * lg['x'], y, 0.0), 'body'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    h = D['head']
    head = add(kit.superellipsoid('Head', h['radii'], BOXY, BOXY, seg=(56, 36), location=h['center']), m['shell'],
               'head')
    coat_head(head, m)
    sc = D['screen']
    glass, rim = kit.screen('Dog', sc['radii'], sc['center'], sc['bezel'], e=BOXY)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    # Snout with a nose on the head; the jaw and tongue hinge open below it.
    s = D['snout']
    add(kit.superellipsoid('Snout', s['radii'], s['e'], s['e'], seg=(32, 20), location=s['center']), m['shell'], 'head')
    n = D['nose']
    add(kit.superellipsoid('Nose', n['radii'], 0.6, 0.8, seg=(20, 12), location=n['center']), m['dot'](4), 'head')
    j = D['jaw']
    add(kit.superellipsoid('Jaw', j['radii'], j['e'], j['e'], seg=(28, 14), location=j['center']), m['shell'], 'jaw')
    t = D['tongue']
    add(kit.superellipsoid('Tongue', t['radii'], 0.8, 0.8, seg=(20, 10), location=t['center']), m['role']('Tongue', 'joint'), 'jaw')

    # Ears: soft flaps hanging down the sides of the head, tipped out a little.
    e = D['ear']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        ear = kit.superellipsoid(f'Ear.{sfx}', e['radii'], e['e'], e['e'], seg=(24, 16),
                                 location=(side * e['x'], e['y'], e['top'] - e['radii'][2]),
                                 rotation=(0, side * e['tilt'], 0))
        add(ear, m['role']('Ear', 'joint'), f'ear.{sfx}')

    b = D['body']
    body = add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(48, 32), location=b['center']),
               m['shell'], 'body')
    coat_body(body, m)

    # Collar and tag.
    c = D['collar']
    add(kit.torus('Collar', c['major'], c['minor'], seg=(40, 10), location=c['center'], rotation=(c['tilt'], 0, 0)),
        m['role']('Collar', 'joint'), 'body')
    tg = D['tag']
    add(kit.superellipsoid('Tag', tg['radii'], 1.0, 1.0, seg=(24, 12), location=tg['center'],
                           rotation=(0.3, 0, 0)), m['beacon'], 'body')

    # Legs and paws.
    lg, pw = D['leg'], D['paw']
    for name, x, y in (('FL', 1, lg['front']), ('FR', -1, lg['front']), ('BL', 1, lg['back']), ('BR', -1, lg['back'])):
        leg, _ = kit.tube(f'Leg.{name}', [(x * lg['x'], y, lg['top']), (x * lg['x'], y, lg['bottom'])], lg['r'],
                          ring=14)
        add(leg, m['shell'], f'leg.{name}')
        add(kit.superellipsoid(f'Paw.{name}', pw['radii'], pw['e'], 0.6, seg=(24, 12),
                               location=(x * lg['x'], y - 0.014, pw['radii'][2])), m['role']('Paw', 'joint'), f'leg.{name}')

    # Tail: one tube over its bones.
    pts = kit.spline(D['tail'], 18)
    r0, r1 = D['tail_r']
    tail, ts = kit.tube('Tail', pts, [r0 + (r1 - r0) * i / (len(pts) - 1) for i in range(len(pts))], ring=12)
    add(tail, m['shell'], kit.chain(ts, [f'tail.{i + 1}' for i in range(D['tail_bones'])]))

    refine(add, m)

    return looks.finish(kit.armature('DogRig', rig_bones()), parts, skin, m)
