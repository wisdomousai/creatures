"""A parametric robot dog, for the breeds that share one anatomy (Wisp the greyhound, Bruno the
Saint Bernard, Nugget the pug, Scout the border collie, Penny the beagle puppy): body parts on
the body bone, an optional neck, a screen-faced head with a muzzle, nose and a jaw that opens,
two ears (hanging, or standing with a folded tip), four segmented legs ending in paws, a tail
over a chain of bones, a collar with a tag and cheek bolts.

The rig is the one `Hound` (src/dogs.ts) expects, the same as Pip's: root,
body (the hips, running forward), head, jaw, ear.L/R, tail.1..n and leg.FL/FR/BL/BR. A breed
is a table D of dimensions (see the breeds' own files) and an `extras(add, m)` function for the
parts only it has. Faces -Y like the rest of the crew.
"""

import math

import kit
import looks

LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))
BOXY = 0.42


def rig_bones(D):
    lg, j, e, h = D['leg'], D['jaw'], D['ear'], D['head']
    rg = D['rig']
    zb = rg['body_z']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, lg['back'], zb), (0, rg['chest_y'], zb), 'root'),
        ('head', (0, rg['neck'][0], rg['neck'][1]),
         (0, h['center'][1], h['center'][2] + h['radii'][2]), 'body'),
        ('jaw', j['pivot'], (0, j['pivot'][1] - j['len'], j['pivot'][2]), 'head'),
    ]
    up = e.get('up')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        if up:
            bones.append((f'ear.{sfx}', (side * e['x'], e['y'], e['top']),
                          (side * (e['x'] + 0.004), e['y'], e['top'] + 2 * e['radii'][2]), 'head'))
        else:
            bones.append((f'ear.{sfx}', (side * e['x'], e['y'], e['top']),
                          (side * (e['x'] + 0.01), e['y'], e['top'] - 2 * e['radii'][2]), 'head'))
    t = D['tail']
    pts = kit.spline(t['points'], t['bones'] + 1)
    parent = 'body'
    for i in range(t['bones']):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    for name, x, end in LEGS:
        bones.append((f'leg.{name}', (x * lg['x'], lg[end], lg['top']), (x * lg['x'], lg[end], 0.0), 'body'))
    # Bones of a breed's own (a prop that isn't parented to the dog): (name, head, tail, parent).
    bones += D.get('extra_bones', [])
    return bones


def slab_scale(radii, e, dy):
    """How much a thin slab at dy from a superellipsoid's centre shrinks to stay on its shell."""
    k = 1 - abs(dy / radii[1]) ** (2 / e)
    return max(k, 0.01) ** (e / 2)


def build(D, face, look='ink', flame=None, rigname='HoundRig', extras=None):
    m = looks.materials(look, flame, face=face)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def ball(name, r, loc, mat, bone, seg=(12, 8)):
        return add(kit.superellipsoid(name, (r,) * 3, seg=seg, location=loc), mat, bone)

    # ---- The body: one or more rounded boxes, all on the body bone, with seams and bolts.
    be = D.get('body_e', 0.5)
    for i, (name, radii, center, e) in enumerate(D['body']):
        role = D.get('body_roles', {}).get(i)
        mat = m['role'](role, 'shell') if role else m['shell']
        add(kit.superellipsoid(name, radii, e, e, seg=(40, 28), location=center), mat, 'body')
        for k, f in enumerate(D.get('seams', (-0.45, 0.45))):
            dy = f * radii[1]
            s = slab_scale(radii, e, dy)
            add(kit.superellipsoid(f'Seam.{i}.{k}', (radii[0] * s + 0.002, 0.0025, radii[2] * s + 0.002), 0.5, 0.5,
                                   seg=(28, 8), location=(center[0], center[1] + dy, center[2])), m['bezel'], 'body')
        for side in (1, -1):
            s = slab_scale(radii, e, 0.15 * radii[1])
            ball(f'Flank.{i}.{side}', 0.007, (side * (radii[0] * s + 0.001), center[1] + 0.15 * radii[1],
                                              center[2] + 0.2 * radii[2]), m['bezel'], 'body')
    plate = D.get('plate')
    if plate:
        add(kit.superellipsoid('BackPlate', plate['radii'], 0.4, 0.4, seg=(20, 10), location=plate['center']),
            m['role'](plate.get('role', 'Patch'), 'joint'), 'body')

    # ---- Neck.
    n = D.get('neck')
    if n:
        neck, _ = kit.tube('Neck', kit.spline(n['points'], 8), n['r'], ring=14)
        add(neck, m['shell'], 'head')
        for k, (px, py, pz) in enumerate(n.get('rings', ())):
            add(kit.torus(f'NeckRing.{k}', n['r'] + 0.003, 0.005, seg=(24, 6), location=(px, py, pz),
                          rotation=(n.get('ring_tilt', 0.6), 0, 0)), m['joint'], 'head')

    # ---- Head: screen, muzzle, nose, jaw.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h.get('e', BOXY), h.get('e', BOXY), seg=(48, 32),
                           location=h['center']), m['shell'], 'head')
    sc = D['screen']
    glass, rim = kit.screen(face.capitalize(), sc['radii'], sc['center'], sc['bezel'], e=h.get('e', BOXY))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    mz, no, j = D['muzzle'], D['nose'], D['jaw']
    mrole = D.get('muzzle_role')
    add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(28, 18), location=mz['center']),
        m['role'](mrole, 'shell') if mrole else m['shell'], 'head')
    add(kit.superellipsoid('Nose', no['radii'], 0.6, 0.8, seg=(18, 12), location=no['center']), m['dot'](5), 'head')
    add(kit.superellipsoid('Jaw', j['radii'], j['e'], j['e'], seg=(24, 12), location=j['center']),
        m['role'](mrole, 'shell') if mrole else m['shell'], 'jaw')
    if j.get('tongue'):
        t = j['tongue']
        add(kit.superellipsoid('Tongue', t['radii'], 0.8, 0.8, seg=(18, 10), location=t['center']),
            m['role']('Tongue', 'joint'), 'jaw')
    # Nose collar, nostril vents, a seam round the head, jaw pins.
    add(kit.superellipsoid('NoseRim', (no['radii'][0] + 0.005, 0.005, no['radii'][2] + 0.005), 0.5, 0.6, seg=(18, 8),
                           location=(0, no['center'][1] + no['radii'][1] * 0.8, no['center'][2])), m['joint'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Nostril.{side}', (0.0045, 0.0025, 0.0055), seg=(8, 6),
                               location=(side * no['radii'][0] * 0.4, no['center'][1] - no['radii'][1] * 0.95,
                                         no['center'][2])), m['bezel'], 'head')
        ball(f'JawPin.{side}', 0.0075, (side * (j['radii'][0] + 0.003), j['pivot'][1], j['pivot'][2]), m['bezel'],
             'head')
    hs = D.get('head_seam', 0.3)
    s = slab_scale(h['radii'], h.get('e', BOXY), hs * h['radii'][1])
    add(kit.superellipsoid('HeadSeam', (h['radii'][0] * s + 0.002, 0.0025, h['radii'][2] * s + 0.002), BOXY, BOXY,
                           seg=(28, 8), location=(0, h['center'][1] + hs * h['radii'][1], h['center'][2])),
        m['bezel'], 'head')
    bo = D['bolt']
    for side in (1, -1):
        ball(f'Bolt.{side}', bo['r'], (side * bo['x'], bo['y'], bo['z']), m['bezel'], 'head')

    # ---- Ears.
    e = D['ear']
    up, rx, ry, rz = e.get('up'), *e['radii']
    erole = e.get('role', 'Ear')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        cz = e['top'] + rz if up else e['top'] - rz
        add(kit.superellipsoid(f'Ear.{sfx}', e['radii'], e['e'], e['e'], seg=(24, 16),
                               location=(side * e['x'], e['y'], cz),
                               rotation=(0, side * e['tilt'], 0)), m['role'](erole, 'joint'), f'ear.{sfx}')
        if e.get('panel', True):
            add(kit.superellipsoid(f'EarPanel.{sfx}', (rx * 0.62, 0.006, rz * 0.66), 0.5, 0.5, seg=(16, 10),
                                   location=(side * (e['x'] + 0.004), e['y'] - ry * 0.85, cz - (-0.005 if up else 0.005)),
                                   rotation=(0, side * e['tilt'], 0)), m['role']('EarPanel', 'shell'), f'ear.{sfx}')
        add(kit.superellipsoid(f'EarHinge.{sfx}', (0.014, 0.022, 0.022), 0.9, 0.35, seg=(18, 8),
                               location=(side * (e['x'] - 0.008), e['y'], e['top'])), m['bezel'], 'head')
        ball(f'EarPin.{sfx}', 0.008, (side * (e['x'] + 0.004), e['y'], e['top']), m['joint'], f'ear.{sfx}')
        fold = e.get('fold')
        if fold:
            fr = fold['radii']
            add(kit.superellipsoid(f'EarTip.{sfx}', fr, e['e'], e['e'], seg=(20, 12),
                                   location=(side * (e['x'] + fold.get('out', 0.01)), e['y'] - fold['fwd'],
                                             e['top'] + 2 * rz - fold['drop']),
                                   rotation=(fold['pitch'], side * e['tilt'], 0)), m['role'](erole, 'joint'),
                f'ear.{sfx}')

    # ---- Legs: a tapered column, shoulder ball, knee ring, cuff, paw, pad.
    lg, pw = D['leg'], D['paw']
    cuff = D.get('cuff')
    for i, (name, x, end) in enumerate(LEGS):
        lx, y = x * lg['x'], lg[end]
        r0, r1 = lg['r'], lg.get('r2', lg['r'] * 0.8)
        z0, z1 = lg['top'], pw['radii'][2]
        zs = [z0 + (z1 - z0) * k / 4 for k in range(5)]
        leg, _ = kit.tube(f'Leg.{name}', [(lx, y, z) for z in zs], [r0 + (r1 - r0) * k / 4 for k in range(5)], ring=14)
        add(leg, m['shell'], f'leg.{name}')
        ball(f'Shoulder.{name}', r0 * 1.2, (lx, y, z0 - r0 * 0.4), m['joint'], f'leg.{name}', seg=(16, 10))
        kz = z1 + (z0 - z1) * lg.get('knee', 0.5)
        add(kit.torus(f'Knee.{name}', r0 * 0.9 + (r1 - r0) * 0.5 + 0.004, 0.006, seg=(22, 6), location=(lx, y, kz)),
            m['joint'], f'leg.{name}')
        add(kit.superellipsoid(f'Paw.{name}', pw['radii'], pw['e'], 0.6, seg=(24, 12),
                               location=(lx, y - pw.get('fwd', 0.012), pw['radii'][2])),
            m['role']('Sock', 'joint') if pw.get('sock') else m['joint'], f'leg.{name}')
        add(kit.superellipsoid(f'Pad.{name}', (pw['radii'][0] * 0.6, pw['radii'][1] * 0.6, 0.008), 0.5, 0.5,
                               seg=(16, 8), location=(lx, y - pw.get('fwd', 0.012) * 0.5, 0.004)), m['bezel'],
            f'leg.{name}')
        if cuff:
            ck = z1 + cuff['z']
            add(kit.torus(f'Cuff.{name}', r1 + 0.007, cuff.get('minor', 0.008), seg=(24, 8), location=(lx, y, ck)),
                m['dot'](i) if cuff.get('dot') else m['role']('Cuff', 'bezel'), f'leg.{name}')
        if pw.get('toes'):
            for k in (-1, 0, 1):
                ball(f'Toe.{name}.{k + 1}', pw['toes'], (lx + k * pw['toes'] * 1.8,
                                                         y - pw.get('fwd', 0.012) - pw['radii'][1] * 0.9 + abs(k) * 0.008,
                                                         pw['toes'] * 1.4), m['dot'](i), f'leg.{name}', seg=(14, 8))

    # ---- Tail over a chain of bones, rings, a lit tip.
    t = D['tail']
    pts = kit.spline(t['points'], t['bones'] * 5)
    r0, r1 = t['r']
    radii = [r0 + (r1 - r0) * i / (len(pts) - 1) for i in range(len(pts))]
    tail, ts = kit.tube('Tail', pts, radii, ring=12)
    names = [f'tail.{i + 1}' for i in range(t['bones'])]
    add(tail, m['role'](t['role'], 'shell') if t.get('role') else m['shell'], kit.chain(ts, names))
    add(kit.superellipsoid('TailTip', (t.get('tip', r1 * 1.5),) * 3, seg=(14, 8), location=pts[-1]), m['dot'](4),
        names[-1])
    for k in range(1, t['bones']):
        idx = k * 5
        add(kit.torus(f'TailRing.{k}', radii[idx] + 0.004, 0.005, seg=(16, 6), location=tuple(pts[idx]),
                      rotation=(math.pi / 2 - 0.5, 0, 0)), m['joint'], names[k])

    # ---- Collar and tag.
    c = D.get('collar')
    if c:
        add(kit.torus('Collar', c['major'], c['minor'], seg=(36, 10), location=c['center'],
                      rotation=(c['tilt'], 0, 0)), m['role']('Collar', 'joint'), 'head' if c.get('on_head') else 'body')
    tg = D.get('tag')
    if tg:
        add(kit.superellipsoid('Tag', tg['radii'], 1.0, 1.0, seg=(20, 10), location=tg['center'],
                               rotation=(0.2, 0, 0)), m['beacon'], 'head' if tg.get('on_head') else 'body')
        add(kit.torus('TagRim', tg['radii'][0] + 0.003, 0.005, seg=(24, 8),
                      location=(tg['center'][0], tg['center'][1] - 0.006, tg['center'][2]),
                      rotation=(math.pi / 2 + 0.2, 0, 0)), m['bezel'], 'head' if tg.get('on_head') else 'body')

    if extras:
        extras(add, m, D)
    return looks.finish(kit.armature(rigname, rig_bones(D)), parts, skin, m)
