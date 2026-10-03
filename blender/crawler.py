"""Tread, the crew's robot crawler: a low, wide little tank. Two tracks of chunky cleats
(every cleat is its own bone, so the site can run them round the track as it drives), a
wide dome shell over them, a telescoping periscope on the front whose binocular screen eye
slides up and down its sleeves, a scoop on the left arm and a pincer on the right, and a
little tray on the back where the pebbles it collects ride.

Hidden inside, for the acts: three pebbles on the tray (Pile.1-3), one in the scoop (Stone).
Lights: Dot0 and Dot1 the left and right tread hubs, Dot2..Dot4 three pills across the
front of the shell (for beeping in sequence), Dot5 the tray's status light. The cleat
path is loop() below; crawler.ts has the same numbers. Faces -Y like the rest of the crew;
about 0.2 m to the top of the shell, 0.3 m wide.
"""

import math

import kit
import looks

FACE = 'crawler'
PREVIEW = dict(lift=0.0, width=0.4)

D = {
    'track': dict(x=0.135, half=0.155, rx=0.026, rz=0.048, z=0.05),
    # The cleats' path: two straights joined by round ends, in the YZ plane.
    'loop': dict(half=0.1, r=0.05, z=0.05, n=16),
    'cleat': dict(radii=(0.031, 0.017, 0.006)),
    'hub': dict(y=0.1, r=0.03, half=0.008),
    'hull': dict(radii=(0.12, 0.14, 0.05), center=(0, 0, 0.085), e1=0.35, e2=0.4),
    'dome': dict(radii=(0.15, 0.15, 0.09), center=(0, 0, 0.1), e1=0.6, e2=0.7),
    'band': dict(radii=(0.156, 0.156, 0.008), center=(0, 0, 0.112)),
    'collar': dict(radii=(0.042, 0.042, 0.012), center=(0, -0.035, 0.187)),
    # Periscope sleeves: (radius, bottom, top); the eye rides on the last.
    'sleeves': [(0.024, 0.19, 0.255), (0.018, 0.2, 0.285), (0.013, 0.2, 0.30)],
    'eye': dict(radii=(0.09, 0.06, 0.05), center=(0, -0.035, 0.298), e=0.5),
    'screen': dict(radii=(0.076, 0.03, 0.038), center=(0, -0.088, 0.3), bezel=0.007),
    'tray': dict(radii=(0.075, 0.05, 0.01), center=(0, 0.085, 0.176)),
    'shoulder': dict(x=0.132, y=-0.095, z=0.108, r=0.026),
    'elbow': (0.152, -0.175, 0.078),
    'wrist': (0.152, -0.195, 0.07),
    'scoop': dict(radii=(0.046, 0.052, 0.034), center=(0.152, -0.235, 0.066)),
    'lights': dict(y=0.148, z=0.118, x=0.05, radii=(0.016, 0.009, 0.008)),
    'pile': [(-0.03, 0.09, 0.2), (0.03, 0.09, 0.2), (0.0, 0.09, 0.225)],
}
SIDES = (('L', 1), ('R', -1))


def loop(u):
    """Where a cleat is on the track at u (0..1 round it, driving forward runs u up): the
    (y, z) of its middle and the angle of the track there (0 along +y, on the bottom)."""
    lp = D['loop']
    h, r, zc = lp['half'], lp['r'], lp['z']
    straight, arc = 2 * h, math.pi * r
    total = 2 * straight + 2 * arc
    s = (u % 1.0) * total
    if s < straight:
        return (-h + s, zc - r, 0.0)
    s -= straight
    if s < arc:
        a = s / r  # 0..pi, from the bottom round the back to the top
        return (h + r * math.sin(a), zc - r * math.cos(a), a)
    s -= arc
    if s < straight:
        return (h - s, zc + r, math.pi)
    s -= straight
    a = s / r
    return (-h - r * math.sin(a), zc + r * math.cos(a), math.pi + a)


def _spow(x, e):
    return math.copysign(abs(x) ** e, x)


def dome_point(th, phi, lift=0.0):
    """A point on the dome shell at angle th round it and phi up from the equator (dome
    radii, e1/e2 as in D), pushed out by `lift`."""
    dm = D['dome']
    rx, ry, rz = dm['radii']
    cx, cy, cz = dm['center']
    cp, sp = _spow(math.cos(phi), dm['e1']), _spow(math.sin(phi), dm['e1'])
    x = rx * cp * _spow(math.cos(th), dm['e2'])
    y = ry * cp * _spow(math.sin(th), dm['e2'])
    z = rz * sp
    n = math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2) or 1
    return (cx + x + lift * x / rx / n, cy + y + lift * y / ry / n, cz + z + lift * z / rz / n)


def dome_height(x, y):
    """The dome's surface height above (x, y), by bisection on phi."""
    dm = D['dome']
    rx, ry, rz = dm['radii']
    e1, e2 = dm['e1'], dm['e2']
    lo, hi = 0.0, math.pi / 2
    for _ in range(40):
        mid = (lo + hi) / 2
        cp = math.cos(mid) ** e1
        f = (abs(x) / (rx * cp)) ** (2 / e2) + (abs(y) / (ry * cp)) ** (2 / e2)
        if f > 1:
            lo = mid
        else:
            hi = mid
    return dm['center'][2] + rz * math.sin(hi) ** e1


def surface_tilt(x, y):
    """Euler rotation that lays a flat part on the dome at (x, y)."""
    d = 0.002
    dzdx = (dome_height(x + d, y) - dome_height(x - d, y)) / (2 * d)
    dzdy = (dome_height(x, y + d) - dome_height(x, y - d)) / (2 * d)
    return (math.atan(dzdy), -math.atan(dzdx), 0)


def rig_bones():
    tr, hb, sh = D['track'], D['hub'], D['shoulder']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        # Pivots on the back of the tracks, so a wheelie lifts the front.
        ('body', (0, 0.12, 0.05), (0, -0.12, 0.05), 'root'),
        ('stalk', (0, -0.035, 0.19), (0, -0.035, 0.26), 'body'),
        ('stalk.2', (0, -0.035, 0.2), (0, -0.035, 0.27), 'stalk'),
        ('stalk.3', (0, -0.035, 0.2), (0, -0.035, 0.27), 'stalk.2'),
        ('eye', (0, -0.035, 0.27), (0, -0.035, 0.34), 'stalk.3'),
    ]
    for i in range(3):
        x, y, z = D['pile'][i]
        bones.append((f'pile.{i + 1}', (x, y, z), (x, y, z + 0.02), 'body'))
    for sfx, side in SIDES:
        el, wr = D['elbow'], D['wrist']
        bones += [
            (f'arm.{sfx}', (side * sh['x'], sh['y'], sh['z']), (side * el[0], el[1], el[2]), 'body'),
            (f'hand.{sfx}', (side * el[0], el[1], el[2]), (side * wr[0], wr[1] - 0.06, wr[2] - 0.01), f'arm.{sfx}'),
        ]
        for name, y in (('F', -hb['y']), ('B', hb['y'])):
            bones.append((f'hub.{sfx}.{name}', (side * (tr['x'] + tr['rx']), y, tr['z']),
                          (side * (tr['x'] + tr['rx'] + 0.02), y, tr['z']), 'body'))
        for i in range(D['loop']['n']):
            y, z, _ = loop(i / D['loop']['n'])
            bones.append((f'cleat.{sfx}.{i}', (side * tr['x'], y, z), (side * tr['x'], y, z + 0.02), 'body'))
    # The pincer's fingers and the pebble in the scoop.
    wr = D['wrist']
    bones += [
        ('pinch.R.1', (-wr[0] - 0.012, wr[1] - 0.02, wr[2]), (-wr[0] - 0.012, wr[1] - 0.075, wr[2]), 'hand.R'),
        ('pinch.R.2', (-wr[0] + 0.012, wr[1] - 0.02, wr[2]), (-wr[0] + 0.012, wr[1] - 0.075, wr[2]), 'hand.R'),
        ('stone', (D['scoop']['center'][0], D['scoop']['center'][1], D['scoop']['center'][2] + 0.03),
         (D['scoop']['center'][0], D['scoop']['center'][1], D['scoop']['center'][2] + 0.05), 'hand.L'),
    ]
    return bones


def pebble(name, centre, r, seed):
    """A little faceted stone."""
    import random
    rnd = random.Random(seed)
    obj = kit.superellipsoid(name, (r * 1.15, r, r * 0.8), 0.7, 0.8, seg=(9, 6), location=centre)
    for v in obj.data.vertices:
        k = 1 + 0.12 * (rnd.random() - 0.5)
        v.co *= k
    obj.data.polygons.foreach_set('use_smooth', [False] * len(obj.data.polygons))
    return obj


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Tracks: a rounded frame, end hubs (lit) and the cleats, each on its own bone.
    tr, hb, cl = D['track'], D['hub'], D['cleat']
    for sfx, side in SIDES:
        x = side * tr['x']
        add(kit.superellipsoid(f'Track.{sfx}', (tr['rx'], tr['half'] - 0.004, tr['rz']), 0.35, 0.35, seg=(28, 16),
                               location=(x, 0, tr['z'])), m['role']('Tread', 'bezel'), 'body')
        for j, (name, y) in enumerate((('F', -hb['y']), ('B', hb['y']))):
            out = x + side * (tr['rx'] + 0.001)
            add(kit.superellipsoid(f'Hub.{sfx}.{name}', (hb['r'], hb['r'], hb['half']), 0.3, 1.0, seg=(24, 6),
                                   location=(out, y, tr['z']), rotation=(0, math.pi / 2, 0)),
                m['dot'](0 if sfx == 'L' else 1), f'hub.{sfx}.{name}')
            add(kit.superellipsoid(f'HubBolt.{sfx}.{name}', (0.006, 0.006, 0.005), seg=(10, 6),
                                   location=(out + side * 0.008, y, tr['z'] + hb['r'] * 0.55),
                                   rotation=(0, math.pi / 2, 0)), m['bezel'], f'hub.{sfx}.{name}')
        for i in range(D['loop']['n']):
            y, z, a = loop(i / D['loop']['n'])
            add(kit.superellipsoid(f'Cleat.{sfx}.{i}', cl['radii'], 0.3, 0.3, seg=(12, 6),
                                   location=(x, y, z), rotation=(a, 0, 0)), m['joint'], f'cleat.{sfx}.{i}')

    # Hull and shell.
    h, dm, bd = D['hull'], D['dome'], D['band']
    add(kit.superellipsoid('Hull', h['radii'], h['e1'], h['e2'], seg=(40, 20), location=h['center']), m['joint'], 'body')
    dome = kit.superellipsoid('Dome', dm['radii'], dm['e1'], dm['e2'], seg=(56, 32), location=dm['center'])
    kit.cut(dome, (0, 0, 1), -0.02)
    add(dome, m['shell'], 'body')
    add(kit.superellipsoid('Band', bd['radii'], 0.3, 0.7, seg=(56, 8), location=bd['center']), m['bezel'], 'body')
    li = D['lights']
    for i, x in enumerate((li['x'], 0, -li['x'])):
        add(kit.superellipsoid(f'Pill.{i}', li['radii'], 0.5, 0.6, seg=(16, 10), location=(x, -li['y'], li['z'])),
            m['dot'](2 + i), 'body')
    # Vent slots across the back of the shell.
    for i in range(3):
        add(kit.superellipsoid(f'Vent.{i}', (0.05, 0.005, 0.005), 0.3, 0.3, seg=(12, 6),
                               location=(0, 0.13 - i * 0.004, 0.1 + i * 0.016)), m['bezel'], 'body')

    # The tray on the back, its status light, and the pebbles it keeps.
    t = D['tray']
    add(kit.superellipsoid('Tray', t['radii'], 0.3, 0.4, seg=(28, 8), location=t['center']), m['joint'], 'body')
    add(kit.superellipsoid('TrayLight', (0.01, 0.01, 0.006), 0.5, 1.0, seg=(12, 8),
                           location=(0.052, 0.062, t['center'][2] + 0.01)), m['dot'](5), 'body')
    for i, (x, y, z) in enumerate(D['pile']):
        add(pebble(f'Pile.{i + 1}', (x, y, z), 0.017, i + 1), m['role']('Pebble', 'joint'), f'pile.{i + 1}')

    # Periscope: collar, three telescoping sleeves, the eye with its binocular screen.
    c = D['collar']
    add(kit.superellipsoid('Collar', c['radii'], 0.35, 0.8, seg=(32, 8), location=c['center']), m['bezel'], 'body')
    bones = ['stalk', 'stalk.2', 'stalk.3']
    for (r, lo, hi), bone in zip(D['sleeves'], bones):
        tube, _ = kit.tube(f'Sleeve.{bone}', [(0, -0.035, lo), (0, -0.035, hi)], r, ring=14)
        add(tube, m['joint'] if bone != 'stalk' else m['bezel'], bone)
    e = D['eye']
    add(kit.superellipsoid('Eye', e['radii'], e['e'], e['e'], seg=(40, 24), location=e['center']), m['role']('Eye'), 'eye')
    sc = D['screen']
    glass, rim = kit.screen('Crawler', sc['radii'], sc['center'], sc['bezel'], e=0.4)
    add(glass, m['face'], 'eye')
    add(rim, m['bezel'], 'eye')
    add(kit.superellipsoid('EyeStub', (0.007, 0.007, 0.012), 0.5, 1.0, seg=(10, 6),
                           location=(0, -0.02, e['center'][2] + e['radii'][2])), m['joint'], 'eye')
    add(kit.superellipsoid('Beacon', (0.017, 0.017, 0.017), seg=(16, 10),
                           location=(0, -0.02, e['center'][2] + e['radii'][2] + 0.02)), m['beacon'], 'eye')

    # Arms: shoulder ball, upper arm, and a scoop on the left, a pincer on the right.
    sh, el, wr = D['shoulder'], D['elbow'], D['wrist']
    for sfx, side in SIDES:
        add(kit.superellipsoid(f'Shoulder.{sfx}', (sh['r'],) * 3, seg=(20, 12),
                               location=(side * sh['x'], sh['y'], sh['z'])), m['bezel'], 'body')
        up, _ = kit.tube(f'Arm.{sfx}', [(side * sh['x'], sh['y'], sh['z']), (side * el[0], el[1], el[2])], 0.014,
                         ring=10)
        add(up, m['joint'], f'arm.{sfx}')
        add(kit.superellipsoid(f'Elbow.{sfx}', (0.019,) * 3, seg=(16, 10), location=(side * el[0], el[1], el[2])),
            m['bezel'], f'arm.{sfx}')
    sc = D['scoop']
    bowl = kit.superellipsoid('Scoop', sc['radii'], 0.8, 0.9, seg=(28, 16), location=sc['center'])
    kit.cut(bowl, (0, 0, -1), 0.0)
    add(bowl, m['role']('Scoop'), 'hand.L')
    add(kit.superellipsoid('ScoopInside', (sc['radii'][0] * 0.86, sc['radii'][1] * 0.86, 0.004), 0.5, 0.9,
                           seg=(24, 6), location=(sc['center'][0], sc['center'][1], sc['center'][2] + 0.001)),
        m['bezel'], 'hand.L')
    add(kit.tube('Wrist.L', [(el[0], el[1], el[2]), (sc['center'][0], sc['center'][1] + 0.03, sc['center'][2])],
                 0.011, ring=8)[0], m['joint'], 'hand.L')
    add(pebble('Stone', (sc['center'][0], sc['center'][1], sc['center'][2] + 0.03), 0.024, 9), m['role']('Pebble', 'joint'),
        'stone')
    # The pincer: a palm and two curved fingers.
    add(kit.superellipsoid('Palm.R', (0.024, 0.022, 0.02), 0.5, 0.6, seg=(20, 12),
                           location=(-wr[0], wr[1] - 0.005, wr[2])), m['shell'], 'hand.R')
    for i, dx in ((1, -0.013), (2, 0.013)):
        pts = kit.spline([(-wr[0] + dx * 1.2, wr[1] - 0.012, wr[2]), (-wr[0] + dx * 1.5, wr[1] - 0.045, wr[2]),
                          (-wr[0] + dx * 0.35, wr[1] - 0.075, wr[2])], 8)
        add(kit.tube(f'Finger.R.{i}', pts, 0.0085, ring=8)[0], m['bezel'], f'pinch.R.{i}')

    # ---- Refinement: track gear, guards, shell seams, hatch, headlights, gear on the arms ----
    rnut = 0.0045
    for sfx, side in SIDES:
        x = side * tr['x']
        out = x + side * (tr['rx'] + 0.001)
        # Road wheels between the end hubs, each with a hub cap, and a rim ring on each end hub.
        for k, y in enumerate((-0.05, 0.0, 0.05)):
            add(kit.superellipsoid(f'Road.{sfx}.{k}', (0.017, 0.017, 0.005), 0.3, 1.0, seg=(20, 6),
                                   location=(out + side * 0.002, y, tr['z'] - 0.012), rotation=(0, math.pi / 2, 0)),
                m['bezel'], 'body')
            add(kit.superellipsoid(f'RoadCap.{sfx}.{k}', (0.007, 0.007, 0.004), 0.3, 1.0, seg=(12, 6),
                                   location=(out + side * 0.007, y, tr['z'] - 0.012), rotation=(0, math.pi / 2, 0)),
                m['shell'], 'body')
        for name, y in (('F', -hb['y']), ('B', hb['y'])):
            add(kit.superellipsoid(f'HubRim.{sfx}.{name}', (hb['r'] + 0.006, hb['r'] + 0.006, 0.004), 0.3, 1.0,
                                   seg=(24, 6), location=(out - side * 0.002, y, tr['z']),
                                   rotation=(0, math.pi / 2, 0)), m['bezel'], f'hub.{sfx}.{name}')
            add(kit.superellipsoid(f'HubCap.{sfx}.{name}', (0.009, 0.009, 0.005), 0.3, 1.0, seg=(12, 6),
                                   location=(out + side * 0.014, y, tr['z']), rotation=(0, math.pi / 2, 0)),
                m['bezel'], f'hub.{sfx}.{name}')
            for a in (2.2, 3.9, 5.6):
                add(kit.superellipsoid(f'HubNut.{sfx}.{name}.{int(a * 10)}', (0.0035, 0.0035, 0.003), seg=(8, 5),
                                       location=(out + side * 0.009, y + hb['r'] * 0.62 * math.sin(a),
                                                 tr['z'] + hb['r'] * 0.62 * math.cos(a)),
                                       rotation=(0, math.pi / 2, 0)), m['bezel'], f'hub.{sfx}.{name}')
        # Track guard over the top run, with four bolts.
        add(kit.superellipsoid(f'Guard.{sfx}', (0.0045, 0.115, 0.011), 0.4, 0.5, seg=(20, 8),
                               location=(out + side * 0.003, 0.0, tr['z'] + 0.041)),
            m['role']('Tread', 'bezel'), 'body')
        for k in range(4):
            add(kit.superellipsoid(f'GuardBolt.{sfx}.{k}', (rnut, rnut, 0.003), seg=(8, 5),
                                   location=(out + side * 0.0085, -0.078 + k * 0.052, tr['z'] + 0.041),
                                   rotation=(0, math.pi / 2, 0)), m['shell'], 'body')

    # Shell: seams down the dome and rivets round the band.
    for th in (0.5, 1.2, 1.94, 2.64, 3.64, 4.34, 5.08, 5.78):
        pts = [dome_point(th, math.radians(a), 0.001) for a in (8, 24, 40, 56, 70)]
        add(kit.tube(f'Seam.{int(th * 100)}', pts, 0.0018, ring=6)[0], m['bezel'], 'body')
    for i in range(14):
        th = 2 * math.pi * i / 14 + 0.2
        add(kit.superellipsoid(f'Rivet.{i}', (0.004, 0.004, 0.003), seg=(8, 5),
                               location=(0.16 * math.cos(th), 0.16 * math.sin(th), 0.112),
                               rotation=(0, 0, th)), m['shell'], 'body')

    # Hatch on the shell's right shoulder: a plate, a handle and four screws.
    hx, hy = -0.085, 0.02
    hz = dome_height(hx, hy)
    tilt = surface_tilt(hx, hy)
    add(kit.superellipsoid('Hatch', (0.03, 0.026, 0.005), 0.4, 0.5, seg=(20, 8),
                           location=(hx, hy, hz - 0.001), rotation=tilt), m['role']('Hatch', 'joint'), 'body')
    add(kit.tube('HatchHandle', [(hx - 0.012, hy, hz + 0.006), (hx, hy, hz + 0.011), (hx + 0.012, hy, hz + 0.006)],
                 0.0026, ring=6)[0], m['bezel'], 'body')
    for j, (dx, dy) in enumerate(((-0.021, -0.017), (0.021, -0.017), (-0.021, 0.017), (0.021, 0.017))):
        add(kit.superellipsoid(f'HatchScrew.{j}', (0.003, 0.003, 0.002), seg=(8, 5),
                               location=(hx + dx, hy + dy, dome_height(hx + dx, hy + dy) + 0.003), rotation=tilt),
            m['bezel'], 'body')
    # Side vents on the left shoulder.
    lx = 0.085
    for i in range(3):
        vy = 0.02 + (i - 1) * 0.011
        add(kit.superellipsoid(f'SideVent.{i}', (0.026, 0.0035, 0.0035), 0.3, 0.3, seg=(10, 6),
                               location=(lx, vy, dome_height(lx, vy) + 0.001),
                               rotation=surface_tilt(lx, 0.02)), m['bezel'], 'body')

    # Headlight pods either side of the pills: a housing and a lens that takes the mood colour.
    for i, x in enumerate((0.105, -0.105)):
        y = -math.sqrt(0.156 ** 2 - x * x) - 0.004
        add(kit.superellipsoid(f'LampHousing.{i}', (0.02, 0.011, 0.02), 0.4, 0.5, seg=(16, 8),
                               location=(x, y, 0.118), rotation=(0, 0, math.atan2(x, 0.156) * -1)),
            m['bezel'], 'body')
        add(kit.superellipsoid(f'Lamp.{i}', (0.013, 0.006, 0.013), 0.5, 0.6, seg=(14, 8),
                               location=(x * 1.015, y - 0.008, 0.118)), m['beacon'], 'body')

    # Tray rails and a little mast with a bulb on the tray's back corner.
    tx, ty, tz = t['center']
    for side in (1, -1):
        add(kit.tube(f'TrayRail.{side}', [(side * 0.07, ty - 0.04, tz + 0.02), (side * 0.07, ty + 0.04, tz + 0.02)],
                     0.0028, ring=6)[0], m['bezel'], 'body')
        for k, dy in enumerate((-0.04, 0.04)):
            add(kit.tube(f'TrayPost.{side}.{k}', [(side * 0.07, ty + dy, tz), (side * 0.07, ty + dy, tz + 0.02)],
                         0.0028, ring=6)[0], m['bezel'], 'body')
    add(kit.tube('Mast', [(0.055, ty + 0.038, tz), (0.055, ty + 0.045, tz + 0.055), (0.052, ty + 0.045, tz + 0.09)],
                 0.0022, ring=6)[0], m['bezel'], 'body')
    add(kit.superellipsoid('MastBulb', (0.006, 0.006, 0.006), seg=(10, 6),
                           location=(0.052, ty + 0.045, tz + 0.094)), m['dot'](5), 'body')

    # Periscope: collars where each sleeve slides into the next, ear pucks, a lens hood.
    for r, z, bone in ((0.028, 0.255, 'stalk'), (0.021, 0.285, 'stalk.2'), (0.016, 0.3, 'stalk.3')):
        add(kit.superellipsoid(f'SleeveCollar.{bone}', (r, r, 0.005), 0.35, 1.0, seg=(20, 6),
                               location=(0, -0.035, z)), m['bezel'], bone)
    for side in (1, -1):
        add(kit.superellipsoid(f'EyePuck.{side}', (0.026, 0.026, 0.009), 0.3, 1.0, seg=(18, 6),
                               location=(side * 0.094, -0.035, 0.298), rotation=(0, math.pi / 2, 0)),
            m['joint'], 'eye')
        add(kit.superellipsoid(f'EyeBolt.{side}', (0.007, 0.007, 0.004), 0.4, 1.0, seg=(10, 6),
                               location=(side * 0.104, -0.035, 0.298), rotation=(0, math.pi / 2, 0)),
            m['bezel'], 'eye')
    add(kit.superellipsoid('Hood', (0.084, 0.034, 0.006), 0.4, 0.5, seg=(24, 8),
                           location=(0, -0.089, 0.344)), m['bezel'], 'eye')
    add(kit.superellipsoid('HoodRing', (0.07, 0.005, 0.0028), 0.4, 0.5, seg=(20, 6),
                           location=(0, -0.118, 0.338)), m['dot'](3), 'eye')

    # Arms: pistons alongside the upper arms, a rim and teeth on the scoop, pincer knuckles.
    for sfx, side in SIDES:
        a0 = (side * sh['x'], sh['y'] + 0.01, sh['z'] + 0.02)
        a1 = (side * el[0], el[1] + 0.012, el[2] + 0.02)
        mid = tuple(a0[i] + (a1[i] - a0[i]) * 0.5 for i in range(3))
        add(kit.tube(f'Piston.{sfx}', [a0, a1], 0.0055, ring=8)[0], m['bezel'], f'arm.{sfx}')
        add(kit.tube(f'PistonSleeve.{sfx}', [a0, mid], 0.0085, ring=8)[0], m['shell'], f'arm.{sfx}')
        add(kit.superellipsoid(f'ShoulderBolt.{sfx}', (0.007, 0.007, 0.004), 0.4, 1.0, seg=(10, 6),
                               location=(side * (sh['x'] + 0.024), sh['y'], sh['z']), rotation=(0, math.pi / 2, 0)),
            m['shell'], 'body')
        add(kit.superellipsoid(f'ElbowCap.{sfx}', (0.008, 0.008, 0.004), 0.4, 1.0, seg=(10, 6),
                               location=(side * (el[0] + 0.019), el[1], el[2]), rotation=(0, math.pi / 2, 0)),
            m['shell'], f'arm.{sfx}')
    scx, scy, scz = sc['center']
    rim = kit.torus('ScoopRim', sc['radii'][0], 0.0032, seg=(28, 6), location=(scx, scy, scz))
    kit.stretch(rim, 1.0, sc['radii'][1] / sc['radii'][0], 1.0)
    add(rim, m['bezel'], 'hand.L')
    for k in range(5):
        a = math.radians(-60 + 30 * k)
        px = scx + sc['radii'][0] * 0.98 * math.sin(a)
        py = scy - sc['radii'][1] * 0.98 * math.cos(a)
        add(kit.superellipsoid(f'ScoopTooth.{k}', (0.0045, 0.011, 0.0045), 0.6, 0.6, seg=(8, 6),
                               location=(px, py - 0.006, scz - 0.004), rotation=(0, 0, a)), m['shell'], 'hand.L')
    add(kit.superellipsoid('ScoopHinge', (0.012, 0.012, 0.008), 0.4, 1.0, seg=(12, 6),
                           location=(scx, scy + 0.034, scz + 0.006), rotation=(0, math.pi / 2, 0)),
        m['bezel'], 'hand.L')
    add(kit.superellipsoid('Cuff.R', (0.018, 0.012, 0.018), 0.4, 0.6, seg=(14, 8),
                           location=(-wr[0], wr[1] + 0.016, wr[2])), m['bezel'], 'hand.R')
    for i, dx in ((1, -0.013), (2, 0.013)):
        add(kit.superellipsoid(f'Knuckle.R.{i}', (0.0105, 0.0105, 0.0105), seg=(12, 8),
                               location=(-wr[0] + dx * 1.2, wr[1] - 0.012, wr[2])), m['shell'], 'hand.R')
        add(kit.superellipsoid(f'FingerTip.R.{i}', (0.007, 0.011, 0.0085), 0.6, 0.7, seg=(10, 6),
                               location=(-wr[0] + dx * 0.35, wr[1] - 0.077, wr[2])), m['joint'], f'pinch.R.{i}')

    return looks.finish(kit.armature('CrawlerRig', rig_bones()), parts, skin, m)
