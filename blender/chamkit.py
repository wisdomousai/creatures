"""The shared builder for the chameleons (Hue the veiled, Flare the panther, Trike the
Jackson's, Twig the pygmy leaf, Sage the Parson's): one robot chameleon made from a table
of proportions, so a type is mostly numbers (how long and deep the body is, how tall its
legs, how big the head, which casque, what horns, ear flaps, crest, tail and panels) plus a
few chunky signature parts of its own. Every chameleon built here has the same rig as Hue's
(root, body, head, jaw, eye.L/R, tg.1-7 and tg.tip, fly with flywing.L/R, leg.FL/FR/BL/BR with
shin.*, tail.1-10), so the
chameleons' tricks (chameleons.ts) work on all of them.

Read from the side: a long, laterally flat body carried on thin legs with mitten grips, a
head with a casque, a small screen face on the front of the snout and a turret eye on each
SIDE of it, a tail wound into a spiral (one tube on ten bones, so it can uncurl), a lower jaw plate on a
bone that drops open, and the tongue: seven telescoping sleeves (tg.1-7, each a child of the one
before, thinner toward the tip, a lit seam ring between them) ending in a sticky mushroom pad
with a lit ring (tg.tip). It is built fully out, about a body and a half long, and the site
slides the sleeves into the mouth (collapsed and hidden at rest). A tiny robot fly with lit
wings (fly, flywing.L/R, on the root) waits hidden in the body for the catching tricks.

A type's module has FACE, PREVIEW, a table P (only what differs from BASE) and
`build(look, flame)` that calls chamkit.build(look, flame, P, extras): a list of functions
(add, m, g) that put its own parts on, where g is the Geo (every position the table
works out). Table keys, all metres, in Hue's own units (the site's size per type is the
spec's, so the pygmy is built with Hue's detail and shown small):

  body   rx, ry, rz (half width, length, depth), cy, cz (centre), e
  head   hs (overall size), kx, ky, kz (shape), fwd (how far it sits ahead of the body)
  casque kind 'sweep' | 'helmet' | 'ridge' | 'none', H (peak height above the head's
         centre, in Hue units), L (length factor)
  crest  studs on the casque: count (0 for none)
  spine  'studs' | 'saw' | 'none' (a row along the back), spine_n
  panels (kind, y, z, rx, rz, dot) on each flank: 'disc' (ringed), 'bar', 'strip'
  turret r, lens, role (its own colour role, or None)
  legs   r0, r1 (thickness), toe (foot size), spread (how far out the elbows go)
  tail   r0 (coil radius), r1, turns, lead, tr0, tr1 (tube radii)
  tongue length (out of the mouth, metres), r (base sleeve radius), pad (sticky pad radius)
  dots   crest, tip (the lit parts' dot numbers)
  outline the paper look's outline thickness, thinner for small ones (looks.OUTLINE if None)

Faces -Y like the rest of the crew; the floor is z = 0.
"""

import copy
import math

from mathutils import Vector

import kit
import looks

TAIL = tuple(f'tail.{i}' for i in range(1, 11))
N_TG = 7
TG = tuple(f'tg.{i}' for i in range(1, N_TG + 1))
# Lit parts of the tongue: seams (Dot9-12, in turn, so a wave can run along it), the pad's
# ring, the fly's wings.
TG_SEAM = (9, 10, 11, 12)
TG_RING = 13
FLY_WING = 14
LEGS = (('FL', 'front', 1), ('FR', 'front', -1), ('BL', 'back', 1), ('BR', 'back', -1))

BASE = dict(
    face='chameleon',
    body=dict(rx=0.042, ry=0.14, rz=0.088, cy=0.02, cz=0.152, e=0.6),
    head=dict(hs=1.0, kx=1.0, ky=1.0, kz=1.0, fwd=0.05, up=0.038),
    casque=dict(kind='sweep', H=0.14, L=1.0),
    crest=dict(count=6),
    spine='studs',
    spine_n=11,
    panels=(('disc', -0.095, 0.006, 0.022, 0.032, 0), ('disc', -0.02, 0.0, 0.036, 0.048, 1),
            ('disc', 0.06, -0.012, 0.026, 0.036, 2)),
    turret=dict(r=0.04, lens=0.017, role=None),
    legs=dict(r0=0.015, r1=0.011, toe=1.0, spread=0.046),
    tail=dict(r0=0.07, r1=0.018, turns=1.75, lead=0.05, tr0=0.019, tr1=0.007),
    tongue=dict(length=0.44, r=0.0095, pad=0.021),
    dots=dict(crest=3, tip=4),
    outline=None,
)


def merge(base, over):
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = merge(out[k], v)
        else:
            out[k] = v
    return out


class Geo:
    """Every position and size the table works out, shared by the rig and the build."""

    def __init__(self, P):
        self.P = P
        b = P['body']
        self.b = b
        h = P['head']
        self.hs = h['hs']
        self.hr = (0.05 * h['kx'] * h['hs'], 0.075 * h['ky'] * h['hs'], 0.056 * h['kz'] * h['hs'])
        self.hy = b['cy'] - b['ry'] - h['fwd'] - (self.hr[1] - 0.075) * 0.5
        self.hz = b['cz'] + h['up']
        self.tr = P['turret']['r']
        self.tx = self.hr[0] + 0.024
        self.ty = self.hy + 0.008
        self.tz = self.hz + 0.01
        # The tongue starts deep in the back of the head (low, under the screen) and is built
        # fully out: sleeve i begins i-1 spacings ahead of the start, the pad at the end. The site
        # shortens the whole chain by scaling its first bone, so it nests in the head at rest.
        tg = P['tongue']
        self.tg_y = self.hy + self.hr[1] * 0.7
        self.tg_z = self.hz - 0.03 * self.hs
        self.tg_d0 = self.hr[1] * 1.7  # start to the front of the snout
        self.tg_len = tg['length']
        self.tg_pad = tg['pad']
        self.tg_sp = (self.tg_d0 + tg['length'] - tg['pad'] * 1.15) / N_TG
        # The jaw: a plate under the front of the head, hinged near the middle of it.
        self.jw_pivot = (0, self.hy + self.hr[1] * 0.5, self.hz - 0.026 * self.hs)
        lg = P['legs']
        z0 = b['cz']
        fy = b['cy'] - 0.78 * b['ry']
        by = b['cy'] + 0.46 * b['ry']
        sx = b['rx'] * 0.95
        ex = b['rx'] + lg['spread']
        fx = ex - 0.01
        self.legs = dict(
            front=dict(shoulder=(sx, fy, z0 - 0.002), elbow=(ex, fy - 0.005, z0 * 0.66), foot=(fx, fy - 0.015, 0.018)),
            back=dict(shoulder=(sx, by, z0 - 0.012), elbow=(ex, by + 0.005, z0 * 0.66), foot=(fx, by + 0.01, 0.018)),
        )
        tl = P['tail']
        self.coil = dict(start=(b['cy'] + b['ry'] - 0.002, b['cz']), lead=tl['lead'], r0=tl['r0'], r1=tl['r1'],
                         turns=tl['turns'])

    def body_top(self, y):
        b = self.b
        return b['cz'] + b['rz'] * math.sqrt(max(1 - ((y - b['cy']) / b['ry']) ** 2, 0)) * 1.02


def mirror(p, side):
    return side * p[0], p[1], p[2]


def tail_path(g, n=90):
    c = g.coil
    y0, z0 = c['start']
    pts = [(0, y0 + c['lead'] * i / 6, z0) for i in range(6)]
    cy, cz = y0 + c['lead'], z0 + c['r0']
    for i in range(n + 1):
        u = i / n
        a = -math.pi / 2 + 2 * math.pi * c['turns'] * u
        r = c['r0'] + (c['r1'] - c['r0']) * u
        pts.append((0, cy + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def joints(g):
    """Eleven joint points at equal arc length along the tail path."""
    pts = [Vector(p) for p in tail_path(g)]
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + (b - a).length)
    out = []
    for j in range(11):
        want = cum[-1] * j / 10
        k = max(i for i, c in enumerate(cum) if c <= want + 1e-9)
        k = min(k, len(pts) - 2)
        f = (want - cum[k]) / max(cum[k + 1] - cum[k], 1e-9)
        out.append(tuple(pts[k].lerp(pts[k + 1], f)))
    return out


def rig_bones(g):
    b = g.b
    cy, cz = b['cy'], b['cz']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('body', (0, cy - 0.02, cz), (0, cy - 0.12, cz + 0.01), 'root'),
        ('head', (0, g.hy + 0.05, g.hz - 0.02), (0, g.hy - 0.05, g.hz), 'body'),
        ('jaw', g.jw_pivot, (0, g.hy - g.hr[1] * 0.9, g.jw_pivot[2]), 'head'),
    ]
    for i in range(N_TG):
        y = g.tg_y - i * g.tg_sp
        bones.append((TG[i], (0, y, g.tg_z), (0, y - g.tg_sp, g.tg_z), 'head' if i == 0 else TG[i - 1]))
    y = g.tg_y - N_TG * g.tg_sp
    bones.append(('tg.tip', (0, y, g.tg_z), (0, y - g.tg_pad, g.tg_z), TG[-1]))
    # The fly waits hidden in the middle of the body; the site flies it about.
    bones.append(('fly', (0, cy, cz), (0, cy - 0.012, cz), 'root'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'flywing.{sfx}', (0, cy, cz + 0.005), (side * 0.012, cy, cz + 0.005), 'fly'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        bones.append((f'eye.{sfx}', (side * g.tx, g.ty, g.tz), (side * (g.tx + 0.03), g.ty, g.tz), 'head'))
    js = joints(g)
    for i in range(10):
        bones.append((f'tail.{i + 1}', (0, js[i][1], js[i][2]), (0, js[i + 1][1], js[i + 1][2]),
                      'body' if i == 0 else f'tail.{i}'))
    for sfx, end, side in LEGS:
        leg = g.legs[end]
        bones.append((f'leg.{sfx}', mirror(leg['shoulder'], side), mirror(leg['elbow'], side), 'body'))
        bones.append((f'shin.{sfx}', mirror(leg['elbow'], side), mirror(leg['foot'], side), f'leg.{sfx}'))
    return bones


def along(a, b):
    return (Vector(b) - Vector(a)).to_track_quat('Z', 'Y').to_euler()


def casque_outline(c, hs):
    """The casque's side outline (y, z) about the head's centre, scaled by the head: leading
    edge first (front foot up to the point), then down the back and along the base."""
    H, L = c['H'], c['L']
    zb = 0.035
    kind = c['kind']
    if kind in ('sweep', 'helmet'):
        n = 5
        peak_y = (0.10 if kind == 'sweep' else 0.095) * L
        out = [(-0.045 + (peak_y + 0.045) * i / n, zb + (H - zb) * math.sin(i / n * math.pi / 2) ** 1.1)
               for i in range(n + 1)]
        if kind == 'sweep':
            out += [(peak_y + 0.01, zb + (H - zb) * 0.72), (peak_y + 0.002, zb + (H - zb) * 0.42), (0.085 * L, zb)]
        else:
            out += [(peak_y + 0.03 * L, H - 0.006), (peak_y + 0.05 * L, zb + (H - zb) * 0.55),
                    (peak_y + 0.045 * L, zb + (H - zb) * 0.2), (0.115 * L, zb)]
        out += [(0.04, zb), (-0.01, zb + 0.003)]
    else:  # a low ridge
        out = [(-0.05, 0.04), (-0.02, 0.04 + (H - 0.04) * 0.55), (0.02, H), (0.07 * L, H),
               (0.105 * L, 0.04 + (H - 0.04) * 0.4), (0.1 * L, 0.036), (0.04, 0.035), (-0.01, 0.038)]
    return [(y * hs, z * hs) for y, z in out]


def fin(name, outline, hy, hz, thick=0.012):
    """A swept fin standing on the head: a wedge with a ridge down the middle, flat-shaded."""
    out = [(hy + y, hz + z) for y, z in outline]
    verts, faces = [], []
    n = len(out)
    for x in (thick, -thick):
        for y, z in out:
            verts.append((x * 0.55, y, z))
    cy = sum(p[0] for p in out) / n
    cz = sum(p[1] for p in out) / n
    verts.append((thick * 1.4, cy, cz))
    verts.append((-thick * 1.4, cy, cz))
    cl, cr = len(verts) - 2, len(verts) - 1
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, cl))
        faces.append((n + j, n + i, cr))
        faces.append((i, n + i, n + j, j))
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    obj.data.update()
    return obj


def plate(name, y, z, w, h, t, lean=0.4):
    """A small saw-tooth plate standing on the spine: a leaning triangle with thickness t."""
    pts = [(y - w / 2, z), (y + w / 2, z), (y + w * lean, z + h)]
    verts, faces = [], []
    for x in (t / 2, -t / 2):
        for py, pz in pts:
            verts.append((x * 0.6, py, pz))
    mid = (sum(p[0] for p in pts) / 3, sum(p[1] for p in pts) / 3)
    verts += [(t * 0.9, mid[0], mid[1]), (-t * 0.9, mid[0], mid[1])]
    faces += [(0, 1, 6), (1, 2, 6), (2, 0, 6), (4, 3, 7), (5, 4, 7), (3, 5, 7)]
    faces += [(0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    obj = kit.mesh_object(name, verts, faces)
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    obj.data.update()
    return obj


def build(look, flame, over=None, extras=(), name='Chameleon'):
    P = merge(BASE, over or {})
    g = Geo(P)
    m = looks.materials(look, flame, face=P['face'])
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    def stud(nm, at, bone, r=0.004, mat='joint', rot=(0, 0, 0)):
        add(kit.superellipsoid(nm, (r, r, r * 0.7), 0.6, 1.0, seg=(10, 6), location=at, rotation=rot), m[mat], bone)

    b = g.b
    cy, cz = b['cy'], b['cz']
    hr = g.hr

    # Body, belly, the row along the spine.
    add(kit.superellipsoid('Body', (b['rx'], b['ry'], b['rz']), b['e'], b['e'], seg=(38, 24), location=(0, cy, cz)),
        m['shell'], 'body')
    add(kit.superellipsoid('Belly', (b['rx'] * 0.62, b['ry'] * 0.79, b['rz'] * 0.34), 0.5, 0.8, seg=(24, 10),
                           location=(0, cy, cz - b['rz'] * 0.84)), m['role']('Belly'), 'body')
    n = P['spine_n']
    ys = [cy - b['ry'] * 0.72 + i * (b['ry'] * 1.44 / (n - 1)) for i in range(n)]
    if P['spine'] == 'studs':
        for i, y in enumerate(ys):
            stud(f'Ridge.{i}', (0, y, g.body_top(y)), 'body', 0.0055 - 0.0001 * i, 'bezel')
    elif P['spine'] == 'saw':
        for i, y in enumerate(ys):
            h = 0.056 - 0.02 * abs(i / (n - 1) - 0.4)
            z = g.body_top(y) - 0.008
            add(plate(f'Plate.{i}', y, z, 0.04, h, 0.016, 0.3), m['bezel'] if i % 2 else m['joint'], 'body')
            add(kit.superellipsoid(f'PlateTip.{i}', (0.0075,) * 3, seg=(10, 6),
                                   location=(0, y + 0.04 * 0.3, z + h * 0.94)), m['dot'](P['dots']['crest']), 'body')

    # Flank panels.
    for side in (1, -1):
        for i, (kind, py, pz, rx, rz, dot) in enumerate(P['panels']):
            x = side * (b['rx'] * 0.9)
            y, z = cy + py, cz + pz
            if kind == 'disc':
                add(kit.superellipsoid(f'Panel.{side}.{i}', (0.012, rx, rz), 0.5, 0.5, seg=(22, 12), location=(x, y, z)),
                    m['dot'](dot), 'body')
                add(kit.torus(f'PanelRim.{side}.{i}', (rx + rz) / 2, 0.0035, seg=(28, 6),
                              location=(x + side * 0.007, y, z), rotation=(0, math.pi / 2, 0)), m['bezel'], 'body')
            else:
                e = 0.5 if kind == 'bar' else 0.4
                add(kit.superellipsoid(f'Panel.{side}.{i}', (0.011, rx, rz), e, e, seg=(16, 8), location=(x, y, z)),
                    m['dot'](dot), 'body')
    add(kit.torus('Neck', 0.046 * g.hs, 0.008, seg=(32, 8), location=(0, g.hy + 0.052, g.hz - 0.018),
                  rotation=(math.pi / 2 - 0.2, 0, 0)), m['joint'], 'body')

    # Head, casque, crest, screen, mouth.
    # The head is cut flat under the mouth line; the lower part is the jaw (below).
    lip = -0.026 * g.hs
    add(kit.cut(kit.superellipsoid('Head', hr, 0.55, 0.55, seg=(34, 24), location=(0, g.hy, g.hz)), (0, 0, 1), lip),
        m['shell'], 'head')
    c = P['casque']
    if c['kind'] != 'none':
        out = casque_outline(c, g.hs)
        add(fin('Casque', out, g.hy, g.hz), m['shell'], 'head')
        k = P['crest']['count']
        for i in range(k):
            y, z = out[min(i + 1, len(out) - 1)]
            add(kit.superellipsoid(f'Crest.{i}', (0.0075,) * 3, seg=(12, 8),
                                   location=(0.0125 if i % 2 else -0.0125, g.hy + y, g.hz + z + 0.004)),
                m['dot'](P['dots']['crest']), 'head')
    sy = g.hy - hr[1] * 0.88
    glass, rim = kit.screen(name, (0.036 * g.hs, 0.02, 0.021 * g.hs), (0, sy, g.hz + 0.002), 0.005, e=0.4, seg=(48, 28))
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for side in (-1, 1):
        add(kit.tube(f'Mouth.{side}', [(side * 0.012, sy - 0.007, g.hz - 0.012),
                                       (side * 0.04 * g.hs, sy + 0.016, g.hz - 0.014),
                                       (side * hr[0] * 1.04, g.hy - hr[1] * 0.24, g.hz - 0.014),
                                       (side * hr[0] * 1.0, g.hy + hr[1] * 0.4, g.hz - 0.01)], 0.0028, ring=6)[0],
            m['bezel'], 'head')

    # Turrets: a neck on each side of the head, a ball, a lit pupil lens in a ring, a lid ring.
    tu = P['turret']
    eye = m['role']('Turret', 'shell') if tu.get('role') else m['shell']
    r = tu['r']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x, y, z = side * g.tx, g.ty, g.tz
        add(kit.tube(f'Neck.{sfx}', [(side * hr[0] * 0.6, y, z), (x, y, z)], r * 0.8, ring=14)[0], m['shell'], f'eye.{sfx}')
        add(kit.superellipsoid(f'Turret.{sfx}', (r * 0.9, r, r), seg=(24, 16), location=(x + side * 0.01, y, z)),
            eye, f'eye.{sfx}')
        lx = x + side * (r * 0.9 + 0.01 - 0.003)
        add(kit.superellipsoid(f'Lens.{sfx}', (0.007, tu['lens'], tu['lens']), 0.5, 1, seg=(16, 8), location=(lx, y, z)),
            m['beacon'], f'eye.{sfx}')
        add(kit.torus(f'PupilRing.{sfx}', tu['lens'] * 1.45, 0.0042, seg=(24, 6), location=(lx - side * 0.002, y, z),
                      rotation=(0, math.pi / 2, 0)), m['bezel'], f'eye.{sfx}')
        add(kit.torus(f'LidRing.{sfx}', r * 0.95, 0.0055, seg=(28, 6), location=(x - side * 0.004, y, z),
                      rotation=(0, math.pi / 2, 0)), m['joint'], f'eye.{sfx}')
        add(kit.torus(f'Collar.{sfx}', r * 0.78, 0.0045, seg=(24, 6), location=(side * hr[0] * 0.8, y, z),
                      rotation=(0, math.pi / 2, 0)), m['bezel'], 'head')

    # The mouth: a dark maw in the snout and a lower jaw plate under it, hinged inside the head;
    # the jaw drops to let the tongue out.
    add(kit.superellipsoid('Maw', (hr[0] * 0.72, hr[1] * 0.55, 0.011 * g.hs), 0.5, 0.6, seg=(20, 10),
                           location=(0, g.hy - hr[1] * 0.45, g.hz + lip)), m['bezel'], 'head')
    add(kit.cut(kit.superellipsoid('Jaw', hr, 0.55, 0.55, seg=(34, 24), location=(0, g.hy, g.hz)), (0, 0, -1), -lip),
        m['shell'], 'jaw')

    # The tongue: seven telescoping sleeves, each thinner than the one behind it, a lit seam
    # ring where one meets the next, and a sticky mushroom pad with a lit ring. Built fully
    # out; the site slides the sleeves back into the mouth (and hides them) at rest.
    tg = P['tongue']
    sp = g.tg_sp
    tongue = m['role']('Tongue', 'shell')
    for i in range(N_TG):
        r = tg['r'] * (1 - 0.46 * i / (N_TG - 1))
        last = i == N_TG - 1
        sl = sp * (1.0 if last else 1.34)
        y = g.tg_y - i * sp - sl / 2
        add(kit.superellipsoid(f'Sleeve.{i}', (r, r, sl / 2), 0.5, 1.0, seg=(12, 8), location=(0, y, g.tg_z),
                               rotation=(math.pi / 2, 0, 0)), tongue, TG[i])
        if not last:
            add(kit.torus(f'Seam.{i}', r * 1.04, 0.0026 + 0.0006 * (1 - i / N_TG), seg=(14, 5),
                          location=(0, g.tg_y - (i + 1) * sp - sp * 0.04, g.tg_z), rotation=(math.pi / 2, 0, 0)),
                m['dot'](TG_SEAM[i % 4]), TG[i])
    pr = tg['pad']
    ty = g.tg_y - N_TG * sp
    add(kit.superellipsoid('Pad', (pr, pr, pr * 0.5), 0.5, 1.0, seg=(18, 8),
                           location=(0, ty - pr * 0.45, g.tg_z), rotation=(math.pi / 2, 0, 0)),
        m['role']('TongueTip', 'shell'), 'tg.tip')
    add(kit.torus('PadRing', pr * 0.72, pr * 0.2, seg=(18, 6), location=(0, ty - pr * 0.9, g.tg_z),
                  rotation=(math.pi / 2, 0, 0)), m['dot'](TG_RING), 'tg.tip')

    # The fly: a tiny robot with lit wings, hidden in the middle of the body until a trick.
    fo = (0, cy, cz)

    def at(x, y, z):
        return (fo[0] + x, fo[1] + y, fo[2] + z)

    add(kit.superellipsoid('FlyBody', (0.0055, 0.0095, 0.0055), 0.6, 0.8, seg=(10, 6), location=at(0, 0, 0)),
        m['joint'], 'fly')
    add(kit.superellipsoid('FlyHead', (0.0042,) * 3, seg=(10, 6), location=at(0, -0.0105, 0.0005)), m['shell'], 'fly')
    add(kit.superellipsoid('FlyEye', (0.0026, 0.0014, 0.0026), seg=(8, 5), location=at(0, -0.0143, 0.0012)),
        m['beacon'], 'fly')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'FlyWing.{sfx}', (0.0095, 0.0045, 0.0012), 0.5, 1.0, seg=(12, 6),
                               location=at(side * 0.0105, 0.0005, 0.0065), rotation=(0, 0, side * 0.25)),
            m['dot'](FLY_WING), f'flywing.{sfx}')

    # Legs: thin, ball joints, rings, a mitten grip (two chunky toes against three).
    lg = P['legs']
    r0, r1, tk = lg['r0'], lg['r1'], lg['toe']
    for sfx, end, side in LEGS:
        leg = g.legs[end]
        sh, el, ft = (mirror(leg[k], side) for k in ('shoulder', 'elbow', 'foot'))
        add(kit.superellipsoid(f'Shoulder.{sfx}', (r0 * 1.35,) * 3, seg=(16, 10), location=sh), m['joint'], f'leg.{sfx}')
        add(kit.tube(f'Upper.{sfx}', [sh, el], [r0, r0 * 0.9], ring=12)[0], m['shell'], f'leg.{sfx}')
        add(kit.torus(f'UpperRing.{sfx}', r0 * 1.1, 0.003, seg=(20, 6), location=tuple(Vector(sh).lerp(Vector(el), 0.5)),
                      rotation=tuple(along(sh, el))), m['bezel'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Elbow.{sfx}', (r0 * 1.15,) * 3, seg=(16, 10), location=el), m['joint'], f'shin.{sfx}')
        low = (ft[0], ft[1], ft[2] + 0.014 * tk)
        add(kit.tube(f'Lower.{sfx}', [el, low], [r1, r1 * 0.85], ring=12)[0], m['shell'], f'shin.{sfx}')
        add(kit.superellipsoid(f'Ankle.{sfx}', (r1 * 1.3,) * 3, seg=(14, 10), location=low), m['joint'], f'shin.{sfx}')
        for k, (dx, dy, w) in enumerate(((-0.012, -0.004, 0.0085), (-0.012, 0.014, 0.0085))):
            add(kit.superellipsoid(f'ToeIn.{sfx}{k}', (w * tk, 0.011 * tk, 0.0085 * tk), 0.35, 0.5, seg=(10, 6),
                                   location=(ft[0] + side * dx * tk, ft[1] + (dy - 0.01) * tk, ft[2])),
                m['role']('Pad', 'joint'), f'shin.{sfx}')
        for k in range(3):
            add(kit.superellipsoid(f'ToeOut.{sfx}{k}', (0.0075 * tk, 0.0105 * tk, 0.0085 * tk), 0.35, 0.5, seg=(10, 6),
                                   location=(ft[0] + side * 0.012 * tk, ft[1] + (-0.014 + 0.014 * k) * tk, ft[2])),
                m['role']('Pad', 'joint'), f'shin.{sfx}')

    # The spiral tail: one smooth tube handed down the ten bones, a ring at every joint, a lit tip.
    tl = P['tail']
    pts = [Vector(p) for p in tail_path(g)]
    npts = len(pts)
    radii = [tl['tr0'] - (tl['tr0'] - tl['tr1']) * (i / (npts - 1)) ** 0.9 for i in range(npts)]
    tube, ts = kit.tube('Tail', [tuple(p) for p in pts], radii, ring=12)
    kit.assign(tube, m['shell'])
    parts.append(tube)
    skin.append((tube, kit.chain(ts, list(TAIL))))
    js = joints(g)
    for i in range(1, 10):
        k = min(int(i / 10 * (npts - 1)), npts - 1)
        add(kit.torus(f'TailRing.{i}', radii[k] * 1.12, 0.0032, seg=(20, 6), location=js[i],
                      rotation=tuple(along(js[i - 1], js[i + 1]))), m['bezel'] if i % 2 else m['joint'], TAIL[i])
    add(kit.superellipsoid('TailTip', (0.012,) * 3, seg=(16, 10), location=js[10]), m['dot'](P['dots']['tip']), 'tail.10')

    for fn in extras:
        fn(add, m, g)

    if P['outline'] is None:
        return looks.finish(kit.armature(name + 'Rig', rig_bones(g)), parts, skin, m)
    return looks.finish(kit.armature(name + 'Rig', rig_bones(g)), parts, skin, m, outline=P['outline'])
