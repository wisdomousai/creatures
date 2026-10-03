"""Nova, the crew's robot girl and Bolt's special friend: the same toy-robot world (rounded
shells, a screen face, glowing lights) but her own. A rounder helmet head with a headband,
two bun-shaped ear pods and two springy pigtail antennae that end in glowing bulbs; a long
screen with big lashed eyes; a small torso with a glowing heart on its chest and a pleated
bell skirt with a trim at the hem; slim rubber-hose arms with mitten hands; and roller
skates (boots with a little heel and four wheels each, hubs lit like running lights).
Refined: a seam over the helmet crown and vent slits at the back, bolts on the headband,
grilles on the ear pods, pigtail antennae as beaded springs, the heart set in a bezel,
pleat plates on the skirt, rings at elbows, wrists and knees, a small backpack, and skates
with laces as studs, a toe stop and axle bolts.

Faces -Y like the rest of the crew; about 1.05 m to the tips of the pigtails.
"""

import math

import kit
import looks

FACE = 'nova'
PREVIEW = dict(lift=0.0, width=0.6)

UP = 0.06  # the legs are long, so everything above them is lifted by this much

D = {
    'head': dict(radii=(0.27, 0.225, 0.23), center=(0, 0, 0.70 + UP), e1=0.6, e2=0.55),
    'screen': dict(radii=(0.215, 0.15, 0.135), center=(0, -0.10, 0.685 + UP), bezel=0.011, e=0.3),
    # A headband from ear to ear over the crown.
    'band': dict(r=0.011, lift=0.012, back=0.02),
    'bun': dict(radii=(0.06, 0.082, 0.082), x=0.285, z=0.725 + UP, e1=0.75, e2=0.75),
    'ring': dict(major=0.05, minor=0.008),
    'pigtail': [(0.13, 0.05, 0.885 + UP), (0.19, 0.065, 0.965 + UP), (0.265, 0.07, 1.005 + UP),
                (0.335, 0.06, 0.985 + UP)],
    'pig_r': 0.010,
    'bulb': 0.03,
    'neck': dict(z=0.48 + UP, r=0.045, half=0.028),
    'torso': dict(radii=(0.10, 0.085, 0.115), center=(0, 0, 0.365 + UP), e1=0.45, e2=0.5, taper=0.10),
    'heart': dict(size=0.030, z=0.385 + UP, thick=0.007),
    'belt': dict(z=0.282 + UP, r=0.106, minor=0.011),
    # The skirt as (radius, z) from waist to hem, then closed under; pleats ruffle its radius.
    'skirt': [(0.0, 0.295 + UP), (0.100, 0.292 + UP), (0.112, 0.275 + UP), (0.135, 0.24 + UP),
              (0.165, 0.19 + UP), (0.198, 0.142 + UP), (0.216, 0.118 + UP), (0.220, 0.108 + UP),
              (0.214, 0.100 + UP), (0.190, 0.100 + UP), (0.10, 0.112 + UP), (0.0, 0.118 + UP)],
    'pleats': dict(n=10, amp=0.055),
    'shoulder': dict(x=0.125, z=0.44 + UP, r=0.03),
    'arm': [(0.132, 0.0, 0.44 + UP), (0.176, -0.004, 0.40 + UP), (0.203, -0.008, 0.34 + UP),
            (0.218, -0.011, 0.285 + UP), (0.222, -0.013, 0.245 + UP)],
    'arm_r': 0.021,
    'elbow': (0.205, -0.007, 0.345 + UP),
    'hand': dict(radii=(0.040, 0.037, 0.045), center=(0.226, -0.016, 0.205 + UP),
                 thumb=(0.203, -0.05, 0.218 + UP), e=0.55),
    'leg': dict(x=0.062, top=0.25 + UP, bottom=0.135, r=0.019),
    'boot': dict(radii=(0.05, 0.082, 0.04), center=(0.064, -0.01, 0.097), e1=0.35, e2=0.4),
    'cuff': dict(r=0.037, z=0.148, half=0.022),
    'toe': dict(radii=(0.046, 0.03, 0.03), center=(0.064, -0.075, 0.085)),
    'heel': dict(radii=(0.042, 0.03, 0.028), center=(0.064, 0.055, 0.066)),
    'plate': dict(radii=(0.046, 0.088, 0.007), z=0.052),
    # Roller skate wheels: an axle at the front and one at the back, a wheel each side.
    'wheel': dict(r=0.022, half=0.008, y=(-0.05, 0.05), z=0.022, dx=0.034),
    'hub': dict(r=0.011, half=0.004),
    # Three juggling balls, tucked away inside her torso until she juggles.
    'ball': dict(r=0.03, home=(0, -0.01, 0.44 + UP)),
}
ARM_SEGS = ('upper_arm', 'forearm', 'hand')


def mirror_x(p):
    return (-p[0], *p[1:])


def rig_bones():
    """Nova's skeleton: (name, head, tail, parent). Pigtails are three-bone chains, arms
    bend in the middle like rubber hose, wheels spin on their axles, the skirt swings."""
    arm, elbow, hand = D['arm'], D['elbow'], D['hand']['center']
    lg, bt, w = D['leg'], D['boot'], D['wheel']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.12), None),
        ('body', (0, 0, 0.15), (0, 0, 0.46 + UP), 'root'),
        ('skirt', (0, 0, 0.29 + UP), (0, 0, 0.12 + UP), 'body'),
        ('head', (0, 0, 0.48 + UP), (0, 0, 0.93 + UP), 'body'),
    ]
    home = D['ball']['home']
    bones += [(f'ball{i}', home, (home[0], home[1], home[2] + 0.02), 'root') for i in (1, 2, 3)]
    for side, s in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        pts = D['pigtail']
        cuts = [pts[0], pts[1], pts[2], (pts[3][0] + 0.02, pts[3][1], pts[3][2] - 0.02)]
        for i in range(3):
            bones.append((f'pig{i + 1}.{s}', f(cuts[i]), f(cuts[i + 1]), 'head' if i == 0 else f'pig{i}.{s}'))
        bones += [
            (f'upper_arm.{s}', f((D['shoulder']['x'], 0, D['shoulder']['z'])), f(elbow), 'body'),
            (f'forearm.{s}', f(elbow), f(arm[-1]), f'upper_arm.{s}'),
            (f'hand.{s}', f(arm[-1]), f((hand[0], hand[1], hand[2] - 0.05)), f'forearm.{s}'),
            (f'leg.{s}', (side * lg['x'], 0, lg['top']), (side * lg['x'], 0, lg['bottom']), 'root'),
            (f'boot.{s}', (side * lg['x'], 0, lg['bottom']), (side * lg['x'], -0.01, 0.05), f'leg.{s}'),
        ]
        for name, y in (('F', w['y'][0]), ('B', w['y'][1])):
            bones.append((f'wheel{name}.{s}', (side * bt['center'][0], y, w['z']),
                          (side * bt['center'][0], y, w['z'] + 0.02), f'boot.{s}'))
    return bones


def surface_xz(phi_deg, lift):
    """A point on the head's outline in its centre plane (x, z), `lift` outside it; phi
    runs from the side (0) over the top (90)."""
    h = D['head']
    rx, _, rz = h['radii']
    phi = math.radians(phi_deg)
    x = rx * kit.spow(math.cos(phi), h['e1'])
    z = rz * kit.spow(math.sin(phi), h['e1'])
    n = math.hypot(x / rx ** 2, z / rz ** 2)
    return x + lift * (x / rx ** 2) / n, h['center'][2] + z + lift * (z / rz ** 2) / n


def heart_mesh(name, size, thick, location):
    """A small bevelled heart standing on the front of the chest."""
    outline = []
    for i in range(48):
        t = 2 * math.pi * i / 48
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        outline.append((x / 34 * size * 2, (y + 2) / 34 * size * 2))
    verts, faces = [], []
    rings = [(1.0, 0.45), (0.72, 1.0)]
    for sign in (1, -1):
        for k, z in rings:
            verts += [(x * k, y * k, sign * thick * z) for x, y in outline]
    n = len(outline)
    front_pole, back_pole = len(verts), len(verts) + 1
    verts += [(0, 0.1 * size, thick), (0, 0.1 * size, -thick)]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))  # front outer -> front inner
        faces.append((n + i, n + j, front_pole))
        a, b = 2 * n, 3 * n
        faces.append((a + j, a + i, b + i, b + j))
        faces.append((b + j, b + i, back_pole))
        faces.append((j, i, a + i, a + j))  # the rim between front and back
    return kit.mesh_object(name, verts, faces, location, rotation=(math.pi / 2, 0, 0))


def pleated(obj, n, amp, z_top, z_bottom):
    """Ruffle a surface of revolution's radius with n pleats, growing toward the hem."""
    for v in obj.data.vertices:
        k = max(0.0, min(1.0, (z_top - v.co.z) / (z_top - z_bottom)))
        s = 1 + amp * k * math.cos(n * math.atan2(v.co.y, v.co.x))
        v.co.x *= s
        v.co.y *= s
    obj.data.update()


def skirt_plate_pose(a, z):
    """The radius of the ruffled skirt at angle a and height z (without UP), and the tilt
    of its slope, for placing a pleat plate on it."""
    sk = D['skirt']
    zz = z + UP
    for (r0, z0), (r1, z1) in zip(sk[1:], sk[2:]):
        if z1 <= zz <= z0:
            u = (z0 - zz) / (z0 - z1)
            r = r0 + (r1 - r0) * u
            tilt = math.atan2(r1 - r0, z0 - z1)
            break
    k = max(0.0, min(1.0, (sk[1][1] - zz) / (sk[1][1] - sk[-1][1])))
    return r * (1 + D['pleats']['amp'] * k * math.cos(D['pleats']['n'] * a)), tilt


def boot_top(y):
    """Height of the boot's top surface at the given y along its centre line."""
    bt = D['boot']
    ry, rz = bt['radii'][1], bt['radii'][2]
    u = min(0.999, abs((y - bt['center'][1]) / ry))
    c = u ** (1 / bt['e1'])
    return bt['center'][2] + rz * math.sqrt(max(0.0, 1 - c * c)) ** bt['e1']


def build(look='ink', flame=None):
    """Build Nova in one look. Returns (rig, parts); every part is skinned to the rig."""
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    # Head: a rounded helmet with the long screen set into its front.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e1'], h['e2'], seg=(44, 28), location=h['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Visor', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')

    # Headband, ear to ear over the crown, in its own colour in the colour look.
    b = D['band']
    pts = []
    for i in range(25):
        # From the left side up over the top and down the right: phi in (-88..88) maps to 0..180.
        a = 180 - (i / 24) * 180
        x, z = surface_xz(a if a <= 90 else 180 - a, b['lift'])
        x = x if a <= 90 else -x
        pts.append((x, -0.005 + b['back'] * math.sin(math.radians(a)) * 0.0, z))
    add(kit.tube('Band', pts, b['r'], ring=10)[0], m['role']('Band', 'joint'), 'head')

    # A seam over the crown from the visor to the back, and vents low at the back.
    hd = D['head']
    seam = []
    for i in range(33):
        th = 50 + i * (150 - 50) / 32
        y = -hd['radii'][1] * kit.spow(math.cos(math.radians(th)), hd['e1'])
        z = hd['radii'][2] * kit.spow(math.sin(math.radians(th)), hd['e1'])
        seam.append((0, y * 1.004, hd['center'][2] + z * 1.004))
    add(kit.tube('Seam', seam, 0.0028, ring=6)[0], m['joint'], 'head')
    for k in range(3):
        dz = -0.03 - 0.028 * k
        sn = (abs(dz) / hd['radii'][2]) ** (1 / hd['e1'])
        sph = math.sqrt(max(0.0, 1 - sn * sn)) ** hd['e1']
        add(kit.superellipsoid(f'Vent.{k}', (0.05 - 0.008 * k, 0.004, 0.005), 0.5, 0.5, seg=(20, 8),
                               location=(0, hd['radii'][1] * sph * 0.995, hd['center'][2] + dz)),
            m['joint'], 'head')
    # Bolt heads on the headband.
    for i in (4, 9, 12, 15, 20):
        x, y, z = pts[i]
        add(kit.superellipsoid(f'BandBolt.{i}', (0.0085,) * 3, seg=(10, 6), location=(x, y, z)), m['bezel'], 'head')

    # Ear buns: round pods on the sides of the helmet, a glowing ring on each.
    bun, ring = D['bun'], D['ring']
    for side in (1, -1):
        x = side * bun['x']
        add(kit.superellipsoid(f'Bun.{side}', bun['radii'], bun['e1'], bun['e2'], seg=(28, 18),
                               location=(x, 0, bun['z'])), m['role']('Bun'), 'head')
        add(kit.torus(f'Ring.{side}', ring['major'], ring['minor'], seg=(32, 8),
                      location=(x + side * bun['radii'][0] * 0.82, 0, bun['z']), rotation=(0, math.pi / 2, 0)),
            m['glow'], 'head')
        add(kit.superellipsoid(f'Cap.{side}', (0.034, 0.034, 0.012), 0.4, 1.0, seg=(32, 10),
                               location=(x + side * bun['radii'][0] * 0.85, 0, bun['z']),
                               rotation=(0, math.pi / 2, 0)), m['joint'], 'head')
        for k in (-1, 0, 1):
            add(kit.superellipsoid(f'Grille.{side}.{k}', (0.006, 0.022, 0.0035), 0.5, 0.5, seg=(12, 6),
                                   location=(x + side * bun['radii'][0] * 0.85 + side * 0.008, 0, bun['z'] + k * 0.013)),
                m['bezel'], 'head')

    # Pigtail antennae: springy stalks curling out and up, a light in each tip.
    pts = D['pigtail']
    for side, s in ((1, 'L'), (-1, 'R')):
        path = kit.spline([(side * q[0], q[1], q[2]) for q in pts], 12)
        stalk, ts = kit.tube(f'Pigtail.{s}', path, D['pig_r'], ring=10)
        add(stalk, m['joint'], kit.chain(ts, [f'pig1.{s}', f'pig2.{s}', f'pig3.{s}']))
        for j in range(2, len(path) - 2, 2):
            q = path[j]
            u = j / (len(path) - 1)
            b_ = 'pig1' if u < 0.34 else 'pig2' if u < 0.67 else 'pig3'
            add(kit.superellipsoid(f'Bead.{s}.{j}', (0.0135, 0.0135, 0.0075), 0.6, 0.8, seg=(10, 6),
                                   location=q, rotation=(0.3, 0.2 * side, 0.4 * side * (j % 4 - 1))),
                m['bezel'], f'{b_}.{s}')
        end = path[-1]
        add(kit.superellipsoid(f'Bulb.{s}', (D['bulb'],) * 3, seg=(24, 16),
                               location=(end[0] + side * 0.01, end[1], end[2] - 0.004)),
            m['dot'](0 if side > 0 else 1), f'pig3.{s}')
        base = pts[0]
        add(kit.superellipsoid(f'PigBase.{s}', (0.03, 0.03, 0.013), 0.4, 1.0, seg=(28, 10),
                               location=(side * base[0], base[1], base[2] - 0.006), rotation=(0, side * 0.5, 0)),
            m['joint'], 'head')

    # Neck, torso, the heart on her chest, and a belt.
    n = D['neck']
    add(kit.superellipsoid('Neck', (n['r'], n['r'], n['half']), 0.4, 1.0, seg=(32, 10), location=(0, 0, n['z'])),
        m['joint'], 'head')
    t = D['torso']
    add(kit.superellipsoid('Torso', t['radii'], t['e1'], t['e2'], seg=(36, 24), taper=t['taper'],
                           location=t['center']), m['shell'], 'body')
    ht = D['heart']
    front = -t['radii'][1] * (1 - t['taper'] * ((ht['z'] - t['center'][2]) / t['radii'][2]) / 2)
    add(kit.torus('HeartBezel', 0.041, 0.0055, seg=(36, 8), location=(0, front + 0.001, ht['z'] + 0.001),
                  rotation=(math.pi / 2, 0, 0)), m['role']('Trim', 'joint'), 'body')
    add(kit.superellipsoid('HeartPlate', (0.041, 0.006, 0.041), 0.5, 0.9, seg=(28, 10),
                           location=(0, front + 0.003, ht['z'] + 0.001)), m['bezel'], 'body')
    add(heart_mesh('Heart', ht['size'], ht['thick'], (0, front - 0.004, ht['z'])), m['dot'](2), 'body')
    bl = D['belt']
    add(kit.torus('Belt', bl['r'], bl['minor'], seg=(32, 8), location=(0, 0, bl['z'])), m['role']('Trim', 'joint'),
        'body')

    # A small backpack with a flap and a lit stud.
    add(kit.superellipsoid('Pack', (0.066, 0.032, 0.075), 0.45, 0.5, seg=(28, 16),
                           location=(0, 0.098, 0.385 + UP)), m['role']('Pack', 'joint'), 'body')
    add(kit.superellipsoid('PackFlap', (0.07, 0.035, 0.03), 0.4, 0.5, seg=(28, 12),
                           location=(0, 0.1, 0.43 + UP)), m['role']('Trim', 'joint'), 'body')
    add(kit.superellipsoid('PackStud', (0.008, 0.006, 0.008), seg=(12, 8), location=(0, 0.134, 0.43 + UP)),
        m['dot'](0), 'body')

    # Pleated bell skirt with a trim round the hem; it swings on its own bone.
    sk = D['skirt']
    skirt = kit.lathe('Skirt', sk, seg=40)
    pleated(skirt, D['pleats']['n'], D['pleats']['amp'], sk[1][1], sk[-1][1])
    add(skirt, m['role']('Skirt'), 'skirt')
    hem = []
    for i in range(61):
        a = 2 * math.pi * (i / 60) + math.pi / 2  # the seam sits at the back
        r = 0.2245 * (1 + D['pleats']['amp'] * math.cos(D['pleats']['n'] * a))
        hem.append((r * math.cos(a), r * math.sin(a), 0.107 + UP))
    add(kit.tube('Hem', hem, 0.0085, ring=8)[0], m['role']('Trim', 'joint'), 'skirt')

    npl = D['pleats']['n']
    for i in range(npl):
        a = 2 * math.pi * i / npl
        r, tilt = skirt_plate_pose(a, 0.175)
        add(kit.superellipsoid(f'Pleat.{i}', (0.021, 0.0035, 0.046), 0.4, 0.5, seg=(10, 6),
                               location=((r + 0.004) * math.cos(a), (r + 0.004) * math.sin(a), 0.175 + UP),
                               rotation=(-tilt, 0, a + math.pi / 2)), m['role']('Trim', 'joint'), 'skirt')

    # Arms: shoulder ball, rubber-hose arm, mitten hand with a thumb.
    s, hand = D['shoulder'], D['hand']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        f = (lambda q: q) if side > 0 else mirror_x
        add(kit.superellipsoid(f'Shoulder.{side}', (s['r'],) * 3, seg=(24, 16), location=f((s['x'], 0, s['z']))),
            m['joint'], 'body')
        arm, ts = kit.tube(f'Arm.{side}', kit.resample([f(q) for q in D['arm']], 14), D['arm_r'])
        bend = [min(max((u - 0.3) / 0.4, 0.0), 1.0) for u in ts]
        bend = [w * w * (3 - 2 * w) for w in bend]
        add(arm, m['shell'], {f'upper_arm.{sfx}': [1 - w for w in bend], f'forearm.{sfx}': bend})
        ex, ey, ez = D['elbow']
        add(kit.torus(f'Elbow.{side}', 0.026, 0.0065, seg=(16, 6), location=f((ex, ey, ez))),
            m['role']('Trim', 'joint'), f'forearm.{sfx}')
        wx, wy, wz = D['arm'][-1]
        add(kit.torus(f'Wrist.{side}', 0.024, 0.0055, seg=(16, 6), location=f((wx - 0.001, wy, wz - 0.005))),
            m['role']('Trim', 'joint'), f'hand.{sfx}')
        add(kit.superellipsoid(f'Hand.{side}', hand['radii'], hand['e'], hand['e'], seg=(32, 20),
                               location=f(hand['center'])), m['shell'], f'hand.{sfx}')
        add(kit.superellipsoid(f'Thumb.{side}', (0.017, 0.017, 0.02), seg=(16, 12), location=f(hand['thumb'])),
            m['shell'], f'hand.{sfx}')

    # Juggling balls: lit in their own colours, hidden inside her until she juggles.
    bl_ = D['ball']
    for i in (1, 2, 3):
        add(kit.superellipsoid(f'Ball{i}', (bl_['r'],) * 3, seg=(20, 14), location=bl_['home']), m['dot'](3 + i),
            f'ball{i}')

    # Legs and roller skates.
    lg, bt, w, hb = D['leg'], D['boot'], D['wheel'], D['hub']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        leg, _ = kit.tube(f'Leg.{side}', [(side * lg['x'], 0, lg['top']), (side * lg['x'], 0, lg['bottom'] + 0.01)],
                          lg['r'])
        add(leg, m['joint'], f'leg.{sfx}')
        add(kit.torus(f'Knee.{side}', 0.028, 0.0065, seg=(16, 6), location=(side * lg['x'], 0, 0.192 + UP)),
            m['role']('Trim', 'joint'), f'leg.{sfx}')
        cx, cy, cz = bt['center']
        add(kit.superellipsoid(f'Boot.{side}', bt['radii'], bt['e1'], bt['e2'], seg=(28, 18),
                               location=(side * cx, cy, cz)), m['role']('Boot'), f'boot.{sfx}')
        c = D['cuff']
        add(kit.superellipsoid(f'Cuff.{side}', (c['r'], c['r'], c['half']), 0.4, 1.0, seg=(32, 10),
                               location=(side * cx, 0, c['z'])), m['role']('Trim', 'joint'), f'boot.{sfx}')
        tx, ty, tz = D['toe']['center']
        add(kit.superellipsoid(f'Toe.{side}', D['toe']['radii'], 0.5, 0.5, seg=(28, 16), location=(side * tx, ty, tz)),
            m['role']('Trim', 'joint'), f'boot.{sfx}')
        hx, hy, hz = D['heel']['center']
        add(kit.superellipsoid(f'Heel.{side}', D['heel']['radii'], 0.35, 0.4, seg=(28, 14),
                               location=(side * hx, hy, hz)), m['joint'], f'boot.{sfx}')
        add(kit.superellipsoid(f'Plate.{side}', D['plate']['radii'], 0.3, 0.35, seg=(32, 10),
                               location=(side * cx, cy, D['plate']['z'])), m['joint'], f'boot.{sfx}')
        for j, y in enumerate((-0.062, -0.038, -0.014, 0.010)):
            for k in (1, -1):
                add(kit.superellipsoid(f'Lace.{side}.{j}.{k}', (0.0055, 0.0055, 0.004), seg=(10, 6),
                                       location=(side * cx + k * 0.017, y, boot_top(y) + 0.0005)),
                    m['bezel'], f'boot.{sfx}')
            add(kit.superellipsoid(f'LaceBar.{side}.{j}', (0.0175, 0.0028, 0.0028), seg=(10, 6),
                                   location=(side * cx, y, boot_top(y) + 0.001)), m['joint'], f'boot.{sfx}')
        add(kit.superellipsoid(f'ToeStop.{side}', (0.014, 0.014, 0.014), 0.7, 0.7, seg=(16, 10),
                               location=(side * cx, -0.098, 0.062)), m['role']('Trim', 'joint'), f'boot.{sfx}')
        add(kit.superellipsoid(f'ToeRod.{side}', (0.004, 0.004, 0.02), seg=(8, 6),
                               location=(side * cx, -0.092, 0.07), rotation=(0.6, 0, 0)), m['bezel'], f'boot.{sfx}')
        for name, y in (('F', w['y'][0]), ('B', w['y'][1])):
            add(kit.superellipsoid(f'Axle.{side}.{name}', (w['dx'] + 0.004, 0.0055, 0.0055), seg=(14, 6),
                                   location=(side * cx, y, w['z'])), m['bezel'], f'boot.{sfx}')
            for k in (1, -1):
                x = side * cx + k * w['dx']
                add(kit.superellipsoid(f'Wheel{name}.{side}.{k}', (w['r'], w['r'], w['half']), 0.5, 0.9,
                                       seg=(20, 8), location=(x, y, w['z']), rotation=(0, math.pi / 2, 0)),
                    m['bezel'], f'wheel{name}.{sfx}')
                add(kit.superellipsoid(f'Hub.{side}.{name}.{k}', (hb['r'], hb['r'], hb['half']), 0.5, 1.0, seg=(14, 6),
                                       location=(x + k * w['half'] * 0.9, y, w['z']), rotation=(0, math.pi / 2, 0)),
                    m['dot'](3), f'wheel{name}.{sfx}')

    return looks.finish(kit.armature('NovaRig', rig_bones()), parts, skin, m)
