"""Bolt, the wisdomous robot. Builds the model and renders a review sheet.

    Blender -b --factory-startup -P blender/bolt.py -- --sheet OUT_DIR

Units are metres with Bolt about 1 m tall; the site scales him to ~72 px.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import kit  # noqa: E402
import looks  # noqa: E402
from looks import FLAMES, LOOKS  # noqa: E402, F401  (older callers read them from here)

# ---------- Design ----------
# Every dimension lives here so a render round is a one-line change.

FACE = 'bolt'
PREVIEW = dict(lift=0.24, width=0.9)  # hovering, so the flames clear the floor

# Superellipsoid exponents set the shape: 1 is round, ~0.3 a rounded box, lower is sharper.
BOXY = 0.3

D = {
    'head': dict(radii=(0.31, 0.24, 0.25), center=(0, 0, 0.71), e1=BOXY, e2=BOXY),
    'visor': dict(radii=(0.235, 0.165, 0.16), center=(0, -0.10, 0.70), e1=BOXY, e2=BOXY),
    'bezel': 0.012,
    'pod': dict(radius=0.10, half=0.045, x=0.322, z=0.70, e1=0.35, e2=0.45),
    'ring': dict(major=0.064, minor=0.010),
    'antenna': dict(base=0.955, tip=1.045, bulb=0.032),
    'torso': dict(radii=(0.150, 0.120, 0.150), center=(0, 0, 0.29), e1=0.4, e2=0.4, taper=0.12),
    'chest': dict(z=0.31, r=0.026),
    'neck': dict(z=0.45, r=0.055, half=0.03),
    'shoulder': dict(x=0.150, z=0.375, r=0.036),
    'arm': [(0.158, 0.0, 0.375), (0.200, -0.004, 0.343), (0.226, -0.008, 0.292), (0.238, -0.011, 0.245),
            (0.242, -0.013, 0.205)],
    'arm_r': 0.029,
    'hand': dict(radii=(0.048, 0.044, 0.052), center=(0.246, -0.016, 0.165), thumb=(0.220, -0.054, 0.180),
                 e=0.55),
    'leg': dict(x=0.082, top=0.17, bottom=0.075, r=0.028),
    'boot': dict(radii=(0.066, 0.088, 0.046), center=(0.084, -0.012, 0.046), e1=0.3, e2=0.35),
    'sole': 0.013,
    # Rocket boots, as (radius, z) profiles under each sole: a bell nozzle and its flame.
    'nozzle': [(0.022, 0.006), (0.026, -0.004), (0.031, -0.016), (0.036, -0.026), (0.033, -0.029),
               (0.027, -0.020), (0.018, -0.010), (0.0, -0.007)],
    'flame': [(0.0, -0.010), (0.024, -0.022), (0.030, -0.042), (0.026, -0.070), (0.015, -0.098), (0.0, -0.125)],
    'elbow': (0.224, -0.007, 0.300),
    'pack': dict(radii=(0.090, 0.038, 0.100), center=(0, 0.150, 0.300)),
}


def trim(obj, hidden):
    """Drop the faces nobody sees: those whose every vertex satisfies hidden(x, y, z)
    (local coordinates, before the part is placed). Keeps the file small."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    mw = obj.matrix_basis
    gone = [f for f in bm.faces if all(hidden(*(mw @ v.co)) for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def box_uv(obj, tile=0.08):
    """Metric box-projected UVs (one tile is `tile` metres), for the small tiling textures
    the site paints on a few joint parts. Each face takes the projection facing it most."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.new('UVMap') if not bm.loops.layers.uv else bm.loops.layers.uv[0]
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = {0: (1, 2), 1: (0, 2), 2: (0, 1)}[ax]
        for l in f.loops:
            p = l.vert.co
            l[uv].uv = (p[a] / tile, p[b] / tile)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def torus(name, major, minor, seg=(20, 6), **kw):
    return kit.torus(name, major, minor, seg=seg, **kw)


def mirror_x(p):
    return (-p[0], *p[1:])


def rig_bones():
    """Bolt's skeleton: (name, head, tail, parent). He flies on rocket boots, so the legs
    only dangle; the arms bend in the middle like rubber hoses."""
    arm, elbow, hand = D['arm'], D['elbow'], D['hand']['center']
    lg, bt = D['leg'], D['boot']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.12), None),
        ('body', (0, 0, 0.15), (0, 0, 0.44), 'root'),
        ('head', (0, 0, 0.46), (0, 0, 0.86), 'body'),
        ('antenna', (0, 0, D['antenna']['base']), (0, 0, D['antenna']['tip'] + 0.03), 'head'),
    ]
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        bones += [
            (f'upper_arm.{s}', f((D['shoulder']['x'], 0, D['shoulder']['z'])), f(elbow), 'body'),
            (f'forearm.{s}', f(elbow), f(arm[-1]), f'upper_arm.{s}'),
            (f'hand.{s}', f(arm[-1]), f((hand[0], hand[1], hand[2] - 0.05)), f'forearm.{s}'),
            (f'leg.{s}', (side * lg['x'], 0, lg['top']), (side * lg['x'], 0, lg['bottom'] - 0.02), 'body'),
            (f'thrust.{s}', (side * bt['center'][0], bt['center'][1], -0.01),
             (side * bt['center'][0], bt['center'][1], D['flame'][-1][1]), f'leg.{s}'),
        ]
    # Chore tools, held in his right hand (the site shrinks each to nothing when unused).
    hx, hy, hz = mirror_x(hand)[0], hand[1], hand[2]
    for tool, top in (('broom', 0.40), ('duster', 0.30), ('wrench', 0.28)):
        bones.append((tool, (hx, hy, hz), (hx, hy, top), 'hand.R'))
    return bones


def texture_pixels(kind, n=128):
    """The small tiling textures the site paints on a few parts (src/
    textures.ts draws the same patterns), as greyscale multipliers. Only the Blender
    previews use these; the exported model carries names and UVs, not images."""
    import numpy as np
    rng = np.random.default_rng({'brushed': 1, 'tread': 2, 'mesh': 3, 'print': 4}[kind])
    y, x = np.mgrid[0:n, 0:n] / n
    if kind == 'brushed':
        v = 0.9 + 0.1 * rng.random((n, 1)) + 0.03 * rng.standard_normal((n, n))
    elif kind == 'tread':
        ph = (x * 8 + np.abs((y * 2) % 1 - 0.5) * 2) % 1
        v = 0.66 + 0.34 * np.clip(np.sin(ph * np.pi) * 2.2, 0, 1)
    elif kind == 'mesh':
        d = np.hypot((x * 8) % 1 - 0.5, (y * 8) % 1 - 0.5)
        v = 0.4 + 0.6 * np.clip((d - 0.24) * 10, 0, 1)
    else:
        d = np.hypot((x * 8) % 1 - 0.5, (y * 8) % 1 - 0.5)
        v = 1 - 0.09 * np.clip((0.2 - d) * 12, 0, 1)
    v = np.clip(v, 0, 1)
    return np.stack([v, v, v, np.ones_like(v)], axis=-1)


def texture_material(mat, kind):
    """Multiply a material's colour by one of the tiling textures (previews only)."""
    import bpy
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    base = bsdf.inputs['Base Color'].default_value[:]
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = kit.image_from_array(f'tex-{kind}', texture_pixels(kind))
    tex.image.colorspace_settings.name = 'sRGB'
    tex.interpolation = 'Linear'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    mix.inputs['B'].default_value = base
    nt.links.new(tex.outputs['Color'], mix.inputs['A'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])


def build(look='ink', flame=None):
    """Build Bolt in one look (see LOOKS; flame overrides the look's default).
    Returns (rig, parts); every part is skinned to the rig."""
    m = looks.materials(look, flame, face='bolt')
    parts, skin = [], []
    # Parts with a small texture of their own: named Joint_Brushed, Joint_Tread, Joint_Mesh
    # and Shell_Print, which the site paints (Shell_Print in the colour look only).
    grain = {k: m['role'](k.capitalize(), 'shell' if k == 'print' else 'joint')
             for k in ('brushed', 'tread', 'mesh', 'print')}
    if os.environ.get('BOLT_TEXTURES') != '0':
        for k, mat in grain.items():
            if k != 'print' or look == 'colour':
                texture_material(mat, k)

    def add(obj, mat, bone, uv=None):
        if uv:
            box_uv(obj, uv)
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    lg, bt = D['leg'], D['boot']

    # Head: a rounded box with the screen visor set into its front.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e1'], h['e2'], seg=(44, 26), location=h['center']), m['shell'],
        'head')
    v = D['visor']
    visor = kit.superellipsoid('Visor', v['radii'], v['e1'], v['e2'], seg=(44, 26), location=v['center'])
    kit.planar_uv(visor)  # the face rectangle: before anything is trimmed
    # The back half of the screen and its bezel are inside the helmet.
    inside = lambda x, y, z: y > v['center'][1] - 0.01
    add(trim(visor, inside), m['face'], 'head')
    b = D['bezel']
    # The bezel is wider and taller than the screen but sits behind it, so it only shows
    # as a rim where the screen meets the head.
    vx, vy, vz = v['radii']
    add(trim(kit.superellipsoid('Bezel', (vx + b, vy, vz + b), v['e1'], v['e2'], seg=(44, 26),
                                location=(v['center'][0], v['center'][1] + b, v['center'][2])), inside),
        m['bezel'], 'head')

    # Ear pods: rounded pucks with a glowing ring, a lit inner ring and a cap.
    p, r = D['pod'], D['ring']
    for side in (1, -1):
        x = side * p['x']
        pod = kit.superellipsoid(f'Pod.{side}', (p['radius'], p['radius'], p['half']), p['e1'], p['e2'], seg=(32, 12),
                                 location=(x, 0, p['z']), rotation=(0, math.pi / 2, 0))
        add(trim(pod, lambda px, py, pz: abs(px) < 0.30), m['shell'], 'head')
        add(torus(f'Ring.{side}', r['major'], r['minor'], seg=(28, 8),
                  location=(x + side * p['half'] * 0.95, 0, p['z']), rotation=(0, math.pi / 2, 0)),
            m['glow'], 'head')
        add(kit.superellipsoid(f'Cap.{side}', (r['major'] - r['minor'] * 1.6,) * 2 + (p['half'] * 0.45,), 0.4, 1.0,
                               seg=(24, 8), location=(x + side * p['half'] * 0.9, 0, p['z']),
                               rotation=(0, math.pi / 2, 0)), grain['brushed'], 'head', uv=0.08)
        # A little lit ring inside the cap: the ear light, which pulses when he listens.
        add(torus(f'EarLight.{side}', 0.033, 0.0055, seg=(24, 6),
                  location=(x + side * p['half'] * 1.28, 0, p['z']), rotation=(0, math.pi / 2, 0)),
            m['dot'](5), 'head')
        add(kit.superellipsoid(f'EarNub.{side}', (0.014, 0.014, 0.007), 0.5, 1.0, seg=(12, 6),
                               location=(x + side * p['half'] * 1.35, 0, p['z']), rotation=(0, math.pi / 2, 0)),
            m['bezel'], 'head')

    # Antenna, with the colour-changing beacon on top.
    a = D['antenna']
    add(kit.superellipsoid('AntennaBase', (0.034, 0.034, 0.012), 0.4, 1.0, seg=(20, 6),
                           location=(0, 0, a['base'])), grain['brushed'], 'head', uv=0.08)
    stem, _ = kit.tube('AntennaStem', [(0, 0, a['base']), (0, 0, a['tip'])], 0.009, ring=8)
    add(stem, m['joint'], 'antenna')
    add(kit.superellipsoid('Bulb', (a['bulb'],) * 3, seg=(22, 14), location=(0, 0, a['tip'] + a['bulb'] * 0.8)),
        m['beacon'], 'antenna')

    # Neck and torso.
    n = D['neck']
    add(kit.superellipsoid('Neck', (n['r'], n['r'], n['half']), 0.4, 1.0, seg=(20, 6), location=(0, 0, n['z'])),
        grain['brushed'], 'head', uv=0.08)
    t = D['torso']
    add(kit.superellipsoid('Torso', t['radii'], t['e1'], t['e2'], seg=(32, 20), taper=t['taper'],
                           location=t['center']), grain['print'], 'body', uv=0.1)
    c = D['chest']
    front = -t['radii'][1] * (1 - t['taper'] * ((c['z'] - t['center'][2]) / t['radii'][2]) / 2) + 0.004
    add(kit.superellipsoid('ChestBezel', (c['r'] * 1.45, c['r'] * 1.45, 0.009), 0.35, 1.0, seg=(24, 6),
                           location=(0, front + 0.002, c['z']), rotation=(math.pi / 2, 0, 0)), m['joint'], 'body')
    add(kit.superellipsoid('Chest', (c['r'], c['r'], 0.008), 0.35, 1.0, seg=(24, 6),
                           location=(0, front - 0.004, c['z']), rotation=(math.pi / 2, 0, 0)), m['glow'], 'body')
    # The lens: a soft dome that glows with his mood, in a fine ring.
    add(kit.superellipsoid('ChestLens', (c['r'] * 0.62, c['r'] * 0.62, 0.009), 0.8, 1.0, seg=(20, 8),
                           location=(0, front - 0.009, c['z']), rotation=(math.pi / 2, 0, 0)), m['dot'](6), 'body')
    add(torus('ChestLensRing', c['r'] * 0.78, 0.0035, seg=(24, 6), location=(0, front - 0.0075, c['z']),
              rotation=(math.pi / 2, 0, 0)), m['bezel'], 'body')

    # Arms: shoulder ball, rubber-hose arm that bends between two bones, mitten hand.
    s, hand = D['shoulder'], D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.superellipsoid(f'Shoulder.{side}', (s['r'],) * 3, seg=(16, 10),
                               location=f((s['x'], 0, s['z']))), grain['brushed'], 'body', uv=0.08)
        arm, ts = kit.tube(f'Arm.{side}', kit.resample([f(q) for q in D['arm']], 12), D['arm_r'], ring=12)
        bend = [min(max((u - 0.3) / 0.4, 0.0), 1.0) for u in ts]
        bend = [w * w * (3 - 2 * w) for w in bend]  # smoothstep: a soft rubber-hose bend
        add(arm, m['shell'], {f'upper_arm.{sfx}': [1 - w for w in bend], f'forearm.{sfx}': bend})
        add(kit.superellipsoid(f'Hand.{side}', hand['radii'], hand['e'], hand['e'], seg=(20, 12),
                               location=f(hand['center'])), m['shell'], f'hand.{sfx}')
        add(kit.superellipsoid(f'Thumb.{side}', (0.019, 0.019, 0.022), seg=(12, 8), location=f(hand['thumb'])),
            m['shell'], f'hand.{sfx}')
        # Mitten seams: two fine grooves down the front say "fingers".
        hc = hand['center']
        for j, dx in enumerate((-0.013, 0.013)):
            add(kit.superellipsoid(f'FingerSeam.{side}.{j}', (0.0024, 0.006, 0.026), 0.5, 0.5, seg=(8, 6),
                                   location=f((hc[0] + dx, hc[1] - hand['radii'][1] + 0.003, hc[2] - 0.016))),
                m['joint'], f'hand.{sfx}')

    # ---- Small parts. Bolts are pucks, seams are thin plates.
    def bolt(name, pos, axis, mat, r=0.0075, half=0.004):
        rot = {'x': (0, math.pi / 2, 0), 'y': (math.pi / 2, 0, 0), 'z': (0, 0, 0)}[axis]
        return kit.superellipsoid(name, (r, r, half), 0.35, 1.0, seg=(8, 4), location=pos, rotation=rot), mat

    def plate(name, radii, pos, mat, bone, e=0.3, seg=(16, 8), uv=None):
        add(kit.superellipsoid(name, radii, e, e, seg=seg, location=pos), mat, bone, uv=uv)

    def screws(prefix, pts, axis, mat, bone, **kw):
        for i, q in enumerate(pts):
            o, mm = bolt(f'{prefix}{i}', q, axis, mat, **kw)
            add(o, mm, bone)

    # Head: a top plate with vent ribs, a battery hatch behind, a grille under the visor.
    hx, hy, hz = h['radii']
    plate('TopPlate', (hx * 0.86, hy * 0.82, 0.016), (0, 0.01, h['center'][2] + hz - 0.008), grain['print'], 'head',
          seg=(24, 10), uv=0.1)
    for i in range(4):
        plate(f'Vent.{i}', (0.105, 0.007, 0.007), (0, 0.07 + 0.034 * i, h['center'][2] + hz + 0.002), m['shell'],
              'head', seg=(12, 6))
    plate('Hatch', (0.13, 0.012, 0.092), (0, hy - 0.006, h['center'][2] - 0.01), grain['print'], 'head', uv=0.1)
    screws('HatchScrew.', [(sx * 0.105, hy + 0.004, h['center'][2] - 0.10 + sz * 0.17) for sx in (1, -1)
                           for sz in (0, 1)], 'y', m['joint'], 'head')
    add(kit.superellipsoid('HatchLight', (0.014, 0.014, 0.006), 0.35, 1.0, seg=(12, 6),
                           location=(0, hy + 0.004, h['center'][2] + 0.03), rotation=(math.pi / 2, 0, 0)),
        m['dot'](0), 'head')
    for i in range(3):
        plate(f'Grille.{i}', (0.026, 0.006, 0.0045), (-0.05 + 0.05 * i, -hy + 0.026, 0.495), grain['mesh'], 'head',
              seg=(12, 6), uv=0.03)
    # Side seams: a thin rim where each ear pod meets the helmet.
    for side in (1, -1):
        add(torus(f'PodSeam.{side}', p['radius'] * 0.92, 0.008,
                  location=(side * (p['x'] - p['half'] * 0.85), 0, p['z']), rotation=(0, math.pi / 2, 0)),
            m['joint'], 'head')
        add(torus(f'PodRim.{side}', p['radius'] * 0.80, 0.007, seg=(28, 6),
                  location=(side * (p['x'] + p['half'] * 0.72), 0, p['z']), rotation=(0, math.pi / 2, 0)),
            m['bezel'], 'head')
        screws(f'PodBolt{side}.', [(side * (p['x'] + p['half'] * 0.9),
                                    0.086 * math.cos(a), p['z'] + 0.086 * math.sin(a))
                                   for a in [k * math.pi / 3 + 0.3 for k in range(6)]], 'x', m['joint'], 'head',
               r=0.0065, half=0.004)
    # Visor corner screws, on the bezel's outer edge.
    vx, vy, vz = v['radii']
    screws('VisorScrew.', [(sx * (vx + 0.006), v['center'][1] + 0.03, v['center'][2] + sz * (vz - 0.02))
                           for sx in (1, -1) for sz in (1, -1)], 'x', m['joint'], 'head', r=0.0055, half=0.0035)
    # Antenna collars and a ball joint under the bulb.
    add(torus('AntennaCollar', 0.017, 0.006, location=(0, 0, a['base'] + 0.026)), m['bezel'], 'head')
    add(torus('AntennaCollar2', 0.014, 0.005, location=(0, 0, a['tip'] - 0.006)), m['bezel'], 'antenna')

    # Torso: a belt with a buckle light, a collar, side vents, chest screws and status dots.
    tr, tcz = t['radii'], t['center'][2]
    plate('Belt', (tr[0] * 1.045, tr[1] * 1.05, 0.011), (0, 0, 0.205), grain['brushed'], 'body', e=0.4, seg=(36, 6),
          uv=0.08)
    plate('Buckle', (0.028, 0.006, 0.012), (0, -tr[1] * 1.05 - 0.002, 0.205), m['bezel'], 'body')
    add(kit.superellipsoid('BuckleLight', (0.008, 0.008, 0.004), 0.35, 1.0, seg=(12, 6),
                           location=(0, -tr[1] * 1.05 - 0.008, 0.205), rotation=(math.pi / 2, 0, 0)),
        m['dot'](1), 'body')
    plate('Collar', (0.108, 0.088, 0.010), (0, 0, 0.428), grain['brushed'], 'body', e=0.4, seg=(24, 6), uv=0.08)
    for side in (1, -1):
        for i in range(3):
            plate(f'SideVent.{side}.{i}', (0.004, 0.05, 0.007), (side * (tr[0] * 1.0 + 0.001), 0.0, 0.235 + 0.028 * i),
                  grain['mesh'], 'body', seg=(8, 6), uv=0.03)
    ct = c['r'] * 1.45
    screws('ChestScrew.', [(sx * (ct + 0.012), front + 0.004, c['z'] + sz * (ct + 0.004)) for sx in (1, -1)
                           for sz in (1, -1)], 'y', m['joint'], 'body', r=0.0055, half=0.003)
    for i in range(3):
        add(kit.superellipsoid(f'ChestDot.{i}', (0.007, 0.007, 0.004), 0.35, 1.0, seg=(10, 6),
                               location=((i - 1) * 0.026, front + 0.001, 0.255), rotation=(math.pi / 2, 0, 0)),
            m['dot'](2 + i), 'body')

    # A little rocket pack on his back: two nozzles, a hatch with a light, and straps.
    k = D['pack']
    pack = kit.superellipsoid('Pack', k['radii'], 0.3, 0.3, seg=(24, 12), location=k['center'])
    add(trim(pack, lambda x, y, z: y < 0.118), grain['print'], 'body', uv=0.1)
    for side in (1, -1):
        add(kit.lathe(f'PackNozzle.{side}', [(0.014, 0.0), (0.020, -0.012), (0.026, -0.030), (0.0, -0.030)], seg=16,
                      location=(side * 0.045, k['center'][1] + 0.01, k['center'][2] - k['radii'][2] + 0.008)),
            m['shell'], 'body')
        add(kit.superellipsoid(f'Strap.{side}', (0.008, 0.13, 0.008), 0.3, 0.3, seg=(8, 6),
                               location=(side * 0.085, 0.03, k['center'][2] + 0.04)), m['joint'], 'body')
    back = k['center'][1] + k['radii'][1]
    plate('PackHatch', (0.038, 0.005, 0.03), (0, back - 0.001, k['center'][2] + 0.052), m['bezel'], 'body', e=0.35)
    plate('PackHandle', (0.014, 0.004, 0.0035), (0, back + 0.004, k['center'][2] + 0.038), m['joint'], 'body',
          seg=(10, 6))
    screws('PackScrew.', [(sx * 0.03, back + 0.003, k['center'][2] + 0.052 + sz * 0.02) for sx in (1, -1)
                          for sz in (1, -1)], 'y', m['joint'], 'body', r=0.0048, half=0.003)
    add(kit.superellipsoid('PackLight', (0.010, 0.010, 0.005), 0.35, 1.0, seg=(12, 6),
                           location=(0, back + 0.004, k['center'][2] + 0.068),
                           rotation=(math.pi / 2, 0, 0)), m['dot'](0), 'body')
    plate('PackGrille', (0.05, 0.005, 0.02), (0, back - 0.002, k['center'][2] - 0.02),
          grain['mesh'], 'body', uv=0.03)
    # Arm bands: shoulder ring, elbow band, wrist cuff.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(torus(f'ShoulderRing.{side}', s['r'] * 0.95, 0.007, location=f((s['x'] + 0.004, 0, s['z'])),
                  rotation=(0, math.pi / 2, 0)), m['bezel'], 'body')
        add(torus(f'Elbow.{side}', D['arm_r'] * 1.05, 0.006, location=f(D['elbow'])), m['bezel'], f'forearm.{sfx}')
        add(torus(f'Cuff.{side}', D['arm_r'] * 1.12, 0.008, location=f((0.243, -0.013, 0.190))), m['joint'],
            f'hand.{sfx}')
    # Legs: knee band, ankle ring, boot toe cap, heel, strap, tread and bolts.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        cx, cy, cz = bt['center']
        bx = side * cx
        add(torus(f'Knee.{side}', lg['r'] * 1.25, 0.007, location=(side * lg['x'], 0, 0.135)), m['bezel'],
            f'leg.{sfx}')
        add(torus(f'Ankle.{side}', lg['r'] * 1.35, 0.008, location=(side * lg['x'], 0, 0.095)), m['joint'],
            f'leg.{sfx}')
        plate(f'Toe.{side}', (0.052, 0.030, 0.026), (bx, cy - bt['radii'][1] + 0.014, 0.036), m['joint'], f'leg.{sfx}',
              e=0.4)
        plate(f'Heel.{side}', (0.050, 0.020, 0.024), (bx, cy + bt['radii'][1] - 0.012, 0.030), m['joint'], f'leg.{sfx}',
              e=0.4)
        plate(f'BootStrap.{side}', (bt['radii'][0] * 1.03, bt['radii'][1] * 0.42, 0.007), (bx, cy + 0.006, 0.076),
              m['bezel'], f'leg.{sfx}', e=0.3)
        screws(f'BootBolt{side}.', [(bx + side * (bt['radii'][0] - 0.001), cy + dy, 0.052) for dy in (-0.03, 0.03)],
               'x', m['shell'], f'leg.{sfx}', r=0.0065, half=0.0035)
        # Toe cap seam, a lace-up tongue and two tread pads.
        add(torus(f'ToeSeam.{side}', 0.040, 0.0035, seg=(20, 5), location=(bx, cy - bt['radii'][1] + 0.028, 0.034),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], f'leg.{sfx}')
        for j, dy in enumerate((-0.062, 0.058)):
            plate(f'Tread.{side}.{j}', (0.045, 0.007, 0.004), (bx, cy + dy, 0.0025), grain['tread'], f'leg.{sfx}',
                  seg=(12, 5), uv=0.05)
        add(torus(f'NozzleRing.{side}', 0.030, 0.005, location=(bx, cy, -0.004)), m['bezel'], f'leg.{sfx}')

    # Legs and rocket boots.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        leg, _ = kit.tube(f'Leg.{side}', [(side * lg['x'], 0, lg['top']), (side * lg['x'], 0, lg['bottom'])],
                          lg['r'], ring=10)
        add(leg, grain['brushed'], f'leg.{sfx}', uv=0.08)
        cx, cy, cz = bt['center']
        add(kit.superellipsoid(f'Boot.{side}', bt['radii'], bt['e1'], bt['e2'], seg=(24, 14),
                               location=(side * cx, cy, cz)), m['shell'], f'leg.{sfx}')
        add(kit.superellipsoid(f'Sole.{side}', (bt['radii'][0] + 0.002, bt['radii'][1] + 0.002, D['sole']), 0.3,
                               bt['e2'], seg=(28, 6), location=(side * cx, cy, D['sole'])), grain['tread'],
            f'leg.{sfx}', uv=0.05)
        add(kit.lathe(f'Nozzle.{side}', D['nozzle'], seg=18, location=(side * cx, cy, 0)), m['joint'], f'leg.{sfx}')
        add(kit.lathe(f'Flame.{side}', D['flame'], seg=12, location=(side * cx, cy, 0)), m['flame'], f'thrust.{sfx}')

    # Chore tools in the right hand: a broom, a feather duster and a wrench.
    if os.environ.get('BOLT_TOOLS') != '0':  # review renders leave them out
        gx, gy, gz = mirror_x(hand['center'])[0], hand['center'][1], hand['center'][2]
        hnd = m['role']('Handle', 'joint')
        stick, _ = kit.tube('BroomHandle', [(gx, gy, 0.10), (gx, gy, 0.42)], 0.011, ring=8)
        add(stick, hnd, 'broom')
        add(kit.lathe('BroomHead', [(0.012, 0.12), (0.040, 0.09), (0.062, 0.02), (0.062, -0.004), (0.0, -0.004)],
                      seg=20, location=(gx, gy, 0.0)), m['role']('Bristle', 'joint'), 'broom')
        add(torus('BroomBand', 0.042, 0.008, location=(gx, gy, 0.085)), m['bezel'], 'broom')
        stick, _ = kit.tube('DusterHandle', [(gx, gy, 0.10), (gx, gy, 0.30)], 0.008, ring=8)
        add(stick, hnd, 'duster')
        for i, (dz, rr) in enumerate(((0.32, 0.04), (0.37, 0.046), (0.42, 0.034))):
            add(kit.superellipsoid(f'Feather.{i}', (rr, rr, 0.04), 0.8, 0.8, seg=(14, 8), location=(gx, gy, dz)),
                m['role']('Feather', 'joint'), 'duster')
        stick, _ = kit.tube('WrenchHandle', [(gx, gy, 0.10), (gx, gy, 0.27)], 0.012, ring=8)
        add(stick, m['bezel'], 'wrench')
        add(torus('WrenchHead', 0.028, 0.011, location=(gx, gy, 0.30), rotation=(math.pi / 2, 0, 0)), m['bezel'], 'wrench')

    return looks.finish(kit.armature('Rig', rig_bones()), parts, skin, m)


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    out = argv[argv.index('--sheet') + 1] if '--sheet' in argv else None
    look = argv[argv.index('--look') + 1] if '--look' in argv else 'ink'
    scene = kit.reset_scene()
    build(look)
    if out:
        os.makedirs(out, exist_ok=True)
        kit.studio(scene)
        views = [('three-quarter', -32, 6), ('front', 0, 4), ('side', -90, 4), ('back-three-quarter', 150, 10)]
        print('SHEET', kit.render_views(scene, views, out, os.path.join(out, 'sheet.png')))


if __name__ == '__main__':
    main()
