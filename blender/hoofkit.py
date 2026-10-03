"""The shared builder for the hoofed animals (the cow, the unicorn, the lamb, the alpaca, the
piglet, and later the goat kid, the donkey, the foal, the ram and the shaggy highland
calf): one robot hoofed animal made from a table of proportions, the way catkit.py makes
the cat breeds, so a creature is mostly numbers plus a few chunky signature parts of its own.

Every animal built here has the same rig as the cats and dogs, so the shared tricks in
`src/hooves.ts` work on all of them: root, body (from the hips forward),
an optional `neck` bone (long necks), head, an optional `jaw`, ear.L/R, tail.1..n and
leg.FL/FR/BL/BR with a shin.FL/FR/BL/BR below the knee (a ball joint) ending in a hoof.

A creature's module has FACE, PREVIEW, a table P and `build(look, flame)` that calls
hoofkit.build(look, flame, P, extras): a list of functions (add, m, c) that put its own
parts on. `c` is a catkit.Ctx: the table, `c.head_point()` / `c.body_point()` (a point on a
shell toward a direction, and its normal), and `c.panel()`, `c.ring()`, `c.bolt()`.

The table P (metres, z up, the floor at z = 0, faces -Y). Only these parts are required:
face, body, hips, head, screen, leg, tail. Everything else is optional.

    face    the face layout's name (faces.py LAYOUTS)
    body    dict(radii, center, e, tilt)           the barrel
    shells  [dict(name, radii, center, e, role)]    more shells on the body (a chest, a hump)
    hips    (y, z)    where the body bone starts (it pivots about the hips)
    neck    dict(points, r=(r0, r1), base=(y, z), bones=1|2, top=(y, z))
            a tube from the shoulders to the head. With bones=1 the head bone pivots at
            `base` and carries the whole neck; with bones=2 there is a `neck` bone from
            `base` and the head pivots at `top` (long necks that bend).
    head    dict(radii, center, e)                  the head shell; the screen face sits in front
    screen  dict(radii, center, bezel, e)
    muzzle  dict(radii, center, e, role)            a box on the face under the screen
    nose    dict(radii, center, e, e2, rot, role)   a plate or disc on the front of the muzzle
    jaw     dict(radii, center, e, pivot)           a lower jaw on the `jaw` bone
    ear     dict(dir, length, width, thick, x, y, z, spin, e, taper, inner, path)
            ear.L/R: a plate from its root along `dir` (L side; R is mirrored); or a
            bent `path` (points relative to the root, a banana ear)
    horns   dict(x, y, z, length, r, start, end, lean, rings)   curved horns on the head
    mane    dict(n, along=(t0, t1), size, lit, dot0)   shingled plates along the neck crest
    wool    dict(r, rings, around, ...)             chunky rounded pods over the body shell
    leg     dict(x, front, back, top, knee, r=(thigh, shin), ball, hoof=dict(radii, split, e))
    tail    dict(points, bones, r=(r0, r1), tuft=dict(r, squash, role))
    bones_extra, collar

Lights (dots, glowing in the site's moods): Dot0 the tail tip, Dot1 the ear hinges. A
creature's own signature lights start at Dot2.
"""

import math

import bpy
from mathutils import Vector

import catkit
import dogkit as dk
import kit
import looks

LEGS = (('FL', 1, 'front'), ('FR', -1, 'front'), ('BL', 1, 'back'), ('BR', -1, 'back'))


# ---------- The rig ----------


def rig_bones(P):
    lg, e, h = P['leg'], P.get('ear'), P['head']
    hy, hz = P['hips']
    nk = P.get('neck') or {}
    by, bz = nk.get('base', (hy - 0.2, hz))
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, hy, hz), (0, by, bz), 'root'),
    ]
    hc = h['center']
    top = hc[2] + h['radii'][2] + 0.04
    if nk.get('bones', 1) == 2:
        ty, tz = nk['top']
        bones.append(('neck', (0, by, bz), (0, ty, tz), 'body'))
        bones.append(('head', (0, ty, tz), (0, hc[1] - 0.04, top), 'neck'))
    else:
        bones.append(('head', (0, by, bz), (0, hc[1] - 0.04, top), 'body'))
    j = P.get('jaw')
    if j:
        piv = j['pivot']
        bones.append(('jaw', piv, (0, piv[1] - 0.12, piv[2]), 'head'))
    if e:
        for side, sfx in ((1, 'L'), (-1, 'R')):
            d = Vector((side * e['dir'][0], e['dir'][1], e['dir'][2])).normalized()
            root = Vector((side * e['x'], e['y'], e['z']))
            bones.append((f'ear.{sfx}', tuple(root), tuple(root + d * max(e['length'], 0.05)), 'head'))
    t = P['tail']
    pts = kit.spline(t['points'], t['bones'] + 1)
    parent = 'body'
    for i in range(t['bones']):
        bones.append((f'tail.{i + 1}', pts[i], pts[i + 1], parent))
        parent = f'tail.{i + 1}'
    for name, x, y, top_z in leg_spots(lg):
        bones.append((f'leg.{name}', (x, y, top_z), (x, y, lg['knee']), 'body'))
        bones.append((f'shin.{name}', (x, y, lg['knee']), (x, y, 0.0), f'leg.{name}'))
    bones += P.get('bones_extra', [])
    return bones


def leg_spots(lg):
    """(name, x, y, top) of each leg: front pair, then hind pair."""
    ft = lg.get('top_front', lg['top'])
    bt = lg.get('top_back', lg['top'])
    xf, xb = lg.get('x_front', lg['x']), lg.get('x_back', lg['x'])
    return [('FL', xf, lg['front'], ft), ('FR', -xf, lg['front'], ft), ('BL', xb, lg['back'], bt),
            ('BR', -xb, lg['back'], bt)]


# ---------- Parts a creature can ask for by name ----------


def horn_path(base, length, start, end, lean, side, n=8):
    """A horn's centre line from `base` (L side, mirrored by `side`): it leaves the head
    `start` degrees from straight up (outward) and bends to `end` degrees by the tip, leaning
    back by `lean` degrees. Returns n points."""
    pts, p = [Vector(base)], Vector(base)
    step = length / (n - 1)
    for i in range(1, n):
        a = math.radians(start + (end - start) * (i / (n - 1)))
        d = Vector((side * math.sin(a), -math.sin(math.radians(lean)), math.cos(a))).normalized()
        p = p + d * step
        pts.append(p.copy())
    return [tuple(q) for q in pts]


def horns(c, spec, bone='head'):
    """Two curved horns on the head, each a tapering tube with a ring at its root."""
    m, add = c.m, c.add
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = horn_path((side * spec['x'], spec['y'], spec['z']), spec['length'], spec['start'], spec['end'],
                        spec.get('lean', 0), side)
        r0 = spec['r']
        radii = [r0 * (1 - 0.8 * (i / (len(pts) - 1)) ** 1.2) for i in range(len(pts))]
        add(kit.tube(f'Horn.{sfx}', pts, radii, ring=12)[0], m['role']('Horn', 'joint'), bone)
        d = (Vector(pts[1]) - Vector(pts[0])).normalized()
        o = kit.torus(f'HornBase.{sfx}', r0 * 1.3, r0 * 0.4, seg=(20, 8))
        catkit.orient(o, Vector(pts[0]) - d * 0.004, d)
        add(o, m['bezel'], bone)


def mane_plates(c, spec, neck, bones=('body', 'head')):
    """A mane of overlapping rounded fins standing on the crest of the neck, from the withers
    up to the head, each a light (Dot{dot0 + i}) when `lit` (or `material(i)` if given), each
    leaning back a little more than the one below it. `neck` is the neck table (points, r)."""
    m, add = c.m, c.add
    n = spec['n']
    t0, t1 = spec.get('along', (0.0, 1.0))
    pts = kit.spline(neck['points'], 40)
    r0, r1 = neck['r']
    plates = []
    for i in range(n):
        f = t0 + (t1 - t0) * (i / max(n - 1, 1))
        k = min(int(f * (len(pts) - 1)), len(pts) - 2)
        p, q = Vector(pts[k]), Vector(pts[k + 1])
        d = (q - p).normalized()
        # Out from the back of the neck: perpendicular to it, in the side view.
        perp = Vector((0, d.z, -d.y)).normalized()
        if perp.y < 0:
            perp = -perp
        rn = r0 + (r1 - r0) * f
        size = spec['size'] * (1 + spec.get('grow', 0.0) * (i / max(n - 1, 1)))
        centre = p + perp * (rn * 0.85 + size * 0.5)
        ang = math.atan2(-perp.y, perp.z) + spec.get('lean', 0.45)
        o = kit.superellipsoid(f'Mane.{i}', (spec.get('width', 0.014), size * 0.95, size), 0.6, 0.6, seg=(14, 10),
                               location=tuple(centre), rotation=(ang, 0, 0))
        mat = spec['material'](i) if spec.get('material') else None
        if mat is not None:
            pass
        elif spec.get('lit'):
            mat = m['dot'](spec['dot0'] + i)
        else:
            mat = m['role']('Mane', 'joint')
        add(o, mat, bones[0] if f < spec.get('split', 0.45) else bones[1])
        plates.append(o)
    return plates


def pods(c, spec, bone='body', surface=None, seed=3):
    """Chunky rounded wool pods over a shell (the body by default): a lat-long grid of
    soft balls, a little different in size, each proud of the surface. spec:
    r (pod radius), rings (positions along its length, -1..1), around (angles round it, how
    many per ring), lift (how far proud, in radii), skip (angles to leave bare: the belly)."""
    m, add = c.m, c.add
    surf = surface or c.P['body']
    centre, radii, e = surf['center'], surf['radii'], surf['e']
    r = spec['r']
    rng = _lcg(seed)
    rings = spec['rings']
    for ri, yy in enumerate(rings):
        around = spec['around'] if not isinstance(spec['around'], (list, tuple)) else spec['around'][ri]
        # Pods in a ring are staggered against the next ring's, like a brick wall.
        off = (ri % 2) * 0.5
        for k in range(around):
            a = 2 * math.pi * (k + off) / around
            ca = math.cos(a)  # 1 on top, -1 below
            if ca < spec.get('belly', -0.45):
                continue
            d = Vector((radii[0] * math.sin(a) * 0.9, radii[1] * yy * spec.get('length', 1.0), radii[2] * ca))
            p, nrm = catkit.on_surface(centre, radii, e, d)
            s = r * (0.82 + 0.36 * rng()) * spec.get('scale', 1.0)
            if spec.get('shrink_ends'):
                s *= 1 - 0.25 * abs(yy) ** 2
            pod = kit.superellipsoid(f'Pod.{ri}.{k}', (s, s * spec.get('long', 1.0), s * spec.get('flat', 0.95)),
                                     0.78, 0.78, seg=(12, 8), location=tuple(p + nrm * s * spec.get('lift', 0.35)))
            mat = m['role']('Wool', 'shell')
            add(pod, mat, bone)


def pod_cluster(c, centre, r, bone, n=5, name='Topknot', lit=None, role='Wool', spread=0.55, seed=5):
    """A fluffy topknot or tuft: a few chunky pods heaped round a centre (the poodle's pom,
    but a handful of pods, not one ball). `lit` makes the top pod a light."""
    m, add = c.m, c.add
    rng = _lcg(seed)
    cx, cy, cz = centre
    spots = [(0, 0, 0.45)] + [
        (math.cos(2 * math.pi * k / (n - 1) + 0.6) * spread, math.sin(2 * math.pi * k / (n - 1) + 0.6) * spread,
         -0.1 + 0.2 * rng()) for k in range(n - 1)]
    for k, (dx, dy, dz) in enumerate(spots):
        s = r * (1.0 if k == 0 else 0.72 + 0.2 * rng())
        mat = lit if (lit and k == 0) else m['role'](role, 'shell')
        add(kit.superellipsoid(f'{name}.{k}', (s, s, s * 0.95), 0.8, 0.8, seg=(14, 10),
                               location=(cx + dx * r, cy + dy * r, cz + dz * r)), mat, bone)


def _lcg(seed):
    """A small repeatable stream of 0..1 numbers, so a rebuild gives the same coat."""
    state = [seed * 9301 + 49297]

    def nxt():
        state[0] = (state[0] * 9301 + 49297) % 233280
        return state[0] / 233280.0

    return nxt


def hoof(c, name, x, y, hf, bone, split=True):
    """A hoof: a squat rounded block, a dark sole and, if cloven, a cleft down the front."""
    m, add = c.m, c.add
    hx, hy, hz = hf['radii']
    e = hf.get('e', 0.45)
    add(kit.superellipsoid(f'Hoof.{name}', (hx, hy, hz), e, 0.55, seg=(20, 10), location=(x, y - 0.008, hz)),
        m['role']('Hoof', 'joint'), bone)
    add(kit.superellipsoid(f'Sole.{name}', (hx * 0.95, hy * 0.95, 0.004), 0.5, 0.5, seg=(18, 6),
                           location=(x, y - 0.008, 0.0035)), m['bezel'], bone)
    if split:
        add(kit.superellipsoid(f'Cleft.{name}', (0.0028, 0.006, hz * 0.8), 0.5, 0.5, seg=(8, 6),
                               location=(x, y - 0.008 - hy * 0.93, hz * 0.95)), m['bezel'], bone)
    # A band above it, the fetlock cuff.
    add(dk.ring(f'Cuff.{name}', (x, y, hz * 2 + 0.012), hx * 0.8 + 0.004, 0.0065, seg=(18, 6)), m['bezel'], bone)


# ---------- The animal ----------


def build(look, flame, P, extras=(), name='Hoof'):
    m = looks.materials(look, flame, face=P['face'])
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    c = catkit.Ctx(P, m, add)
    shell = m['shell']
    h = P['head']
    nk = P.get('neck')

    # ----- body (and any more shells on it)
    b = P['body']
    add(kit.superellipsoid('Body', b['radii'], b['e'], b['e'], seg=(40, 26), location=b['center'],
                           rotation=(b.get('tilt', 0.0), 0, 0)), shell, 'body')
    for s in P.get('shells', ()):
        add(kit.superellipsoid(s['name'], s['radii'], s['e'], s['e'], seg=(40, 26), location=s['center'],
                               rotation=(s.get('tilt', 0.0), 0, 0)),
            m['role'](s['role'], 'shell') if s.get('role') else shell, 'body')

    # ----- neck: a tube from the shoulders to the head, handed from bone to bone
    if nk:
        pts = kit.spline(nk['points'], 14)
        r0, r1 = nk['r']
        radii = [r0 + (r1 - r0) * (i / (len(pts) - 1)) for i in range(len(pts))]
        tube, ts = kit.tube('Neck', pts, radii, ring=18)
        chain = ['body', 'neck', 'head'] if nk.get('bones', 1) == 2 else ['body', 'head']
        add(tube, m['role'](nk['role'], 'shell') if nk.get('role') else shell, kit.chain(ts, chain))

    # ----- head, screen
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(40, 28), location=h['center']),
        m['role'](h['role'], 'shell') if h.get('role') else shell, 'head')
    sc = P['screen']
    glass, rim = kit.screen(name, sc['radii'], sc['center'], sc['bezel'], e=sc.get('e', 0.45), seg=(40, 26))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    mz = P.get('muzzle')
    if mz:
        add(kit.superellipsoid('Muzzle', mz['radii'], mz['e'], mz['e'], seg=(36, 24), location=mz['center']),
            m['role'](mz['role'], 'shell') if mz.get('role') else shell, 'head')
    ns = P.get('nose')
    if ns:
        add(kit.superellipsoid('Nose', ns['radii'], ns.get('e', 0.5), ns.get('e2', ns.get('e', 0.5)), seg=(30, 18),
                               location=ns['center'], rotation=ns.get('rot', (0, 0, 0))),
            m['role'](ns.get('role', 'Nose'), 'joint'), 'head')
    jw = P.get('jaw')
    if jw:
        add(kit.superellipsoid('Jaw', jw['radii'], jw['e'], jw['e'], seg=(26, 14), location=jw['center']),
            m['role'](jw.get('role', 'Jaw'), 'shell'), 'jaw')
        dk.jaw_pins(add, m, jw.get('pin', h['radii'][0] * 0.82), jw['pivot'], bone='head')

    # ----- ears: a plate (or bent tube) on a hinge, a light in each hinge
    e = P.get('ear')
    if e:
        for side, sfx in ((1, 'L'), (-1, 'R')):
            d = Vector((side * e['dir'][0], e['dir'][1], e['dir'][2])).normalized()
            root = Vector((side * e['x'], e['y'], e['z']))
            if e.get('path'):
                rel = [(side * px, py, pz) for px, py, pz in e['path']]
                tube_o, _ = kit.tube(f'Ear.{sfx}', rel, e.get('radii', 0.03), ring=14)
                kit.stretch(tube_o, sx=e.get('flat', 0.4))
                tube_o.location = tuple(root)
                add(tube_o, m['role']('Ear', 'shell'), f'ear.{sfx}')
                inner = kit.tube(f'EarIn.{sfx}', [(side * px * 0.97 - side * 0.004, py - 0.006, pz) for px, py, pz in
                                                  e['path'][1:-1]], [e.get('radii', 0.03) * 0.55] * (len(e['path']) - 2),
                                 ring=10)[0]
                kit.stretch(inner, sx=0.3)
                inner.location = tuple(root)
                add(inner, m['role']('Inner', 'joint'), f'ear.{sfx}')
            else:
                o = kit.superellipsoid(f'Ear.{sfx}', (e['width'] / 2, e['thick'] / 2, e['length'] / 2),
                                       e.get('e', 0.65), e.get('e', 0.65), seg=(22, 14), taper=e.get('taper', 0.0))
                catkit.orient(o, root + d * e['length'] / 2, d, spin=side * e.get('spin', 0.0))
                add(o, m['role']('Ear', 'shell'), f'ear.{sfx}')
                if e.get('inner', True):
                    inn = kit.superellipsoid(f'EarIn.{sfx}', (e['width'] * 0.3, e['thick'] / 2 + 0.003,
                                                              e['length'] * 0.34), 0.6, 0.6, seg=(14, 10))
                    catkit.orient(inn, root + d * e['length'] * 0.52, d, lift=0.0, spin=side * e.get('spin', 0.0))
                    add(inn, m['role']('Inner', 'joint'), f'ear.{sfx}')
            hinge = kit.superellipsoid(f'EarHinge.{sfx}', (0.016, 0.016, 0.016), 0.8, 0.8, seg=(14, 10),
                                       location=tuple(root + Vector((side * -0.004, 0.0, 0.0))))
            add(hinge, m['bezel'], 'head')
            add(kit.superellipsoid(f'EarLed.{sfx}', (0.0085,) * 3, seg=(8, 6),
                                   location=tuple(root + Vector((side * 0.008, -0.012, 0.004)))), m['dot'](1),
                f'ear.{sfx}')

    if P.get('horns'):
        horns(c, P['horns'])
    if P.get('mane'):
        mane_plates(c, P['mane'], nk, P['mane'].get('bones', ('body', 'head')))
    if P.get('wool'):
        pods(c, P['wool'])

    # ----- legs: a thigh, a ball-joint knee, a shin and a hoof
    lg = P['leg']
    hf = lg.get('hoof', dict(radii=(0.04, 0.05, 0.03)))
    legm = dict(m)
    if lg.get('role'):
        legm['shell'] = m['role'](lg['role'], 'shell')
    for nm, x, y, top in leg_spots(lg):
        dk.leg2(add, legm, nm, x, y, top, lg['knee'], lg['r'], lg['ball'], hf['radii'], (f'leg.{nm}', f'shin.{nm}'))
        hoof(c, nm, x, y, hf, f'shin.{nm}', hf.get('split', True))
        # A hip or shoulder pin, so the top of each leg reads as a joint.
        side = 1 if x > 0 else -1
        c.bolt(f'Hub.{nm}', (x + side * (lg['r'][0] * 0.95), y, top - 0.012), 0.012, f'leg.{nm}', m['bezel'], 0.8)

    # ----- tail: bones along a spline, a light on the tip, an optional tuft
    t = P['tail']
    pts = kit.spline(t['points'], 24)
    r0, r1 = t['r']
    radii = [r0 + (r1 - r0) * (i / (len(pts) - 1)) for i in range(len(pts))]
    tube, ts = kit.tube('Tail', pts, radii, ring=t.get('ring', 12))
    bones = [f'tail.{i + 1}' for i in range(t['bones'])]
    add(tube, m['role']('Tail', 'shell') if t.get('role') else shell, kit.chain(ts, bones))
    tip = Vector(pts[-1])
    axis = (tip - Vector(pts[-3])).normalized()
    tuft = t.get('tuft')
    if tuft:
        sq = tuft.get('squash', (1, 1, 1.4))
        add(kit.superellipsoid('TailTuft', tuple(tuft['r'] * s for s in sq), 0.8, 0.8, seg=(20, 14),
                               location=tuple(tip + axis * tuft['r'] * 0.6)),
            m['role'](tuft.get('role', 'Tuft'), 'shell'), bones[-1])
        add(kit.superellipsoid('TailLed', (tuft['r'] * 0.42,) * 3, seg=(10, 8),
                               location=tuple(tip + axis * tuft['r'] * 1.9)), m['dot'](0), bones[-1])
    else:
        add(kit.superellipsoid('TailLed', (r1 * 1.25,) * 3, 0.8, 0.8, seg=(14, 10),
                               location=tuple(tip + axis * r1 * 0.5)), m['dot'](0), bones[-1])
    if t.get('hub', True):
        p0 = Vector(t['points'][0])
        add(kit.superellipsoid('TailHub', (0.034, 0.034, 0.028), 0.4, 1.0, seg=(16, 8),
                               location=(0, p0.y - 0.005, p0.z), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')

    # ----- collar (optional): a ring round the neck, bound to the head so it rides it
    cl = P.get('collar')
    if cl:
        add(kit.torus('Collar', cl['major'], cl.get('minor', 0.016), seg=(40, 10), location=cl['center'],
                      rotation=(cl['tilt'], 0, 0)), m['role']('Collar', 'joint'), 'head')

    for extra in extras:
        extra(add, m, c)

    return looks.finish(kit.armature(f'{name}Rig', rig_bones(P)), parts, skin, m)
