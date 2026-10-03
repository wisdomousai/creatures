"""The crew's robot snail (a family of five, Helix, Loop, Swirl, Gyro and Curl, all this one
model): a soft rubbery foot in six ringed segments, so a wave can ripple along it as it
glides, under a spiral shell built like a coiled robot housing. The shell is a tube that
winds twice round a hub and grows as it goes, cut into plates by seams, with a spiral
stripe of lights along each side (Dot0 at the hub to Dot5 at the mouth), a lit hub cap, a
small hatch and a vent. The plates are rimmed: rivets along the seams, bezels round the
stripe lights, a lip ring at the mouth, a bolted hub cap, a hinged hatch with a latch and a
grille in the vent; the foot has fine rings and a tread under the sole.

A screen-faced head on a bent neck of two bones, two eye stalks on springy two-bone
chains with glowing tips (the beacon: they pull into the head when startled), and two
small feelers under the chin. A lamp at the tail tip (Dot7) lights the trail.

The five snails are told apart in the colour look by their palettes.json coats, and in the
ink and paper looks by a pattern on the shell: five sets of marks (mark.1 spots, mark.2
bands, mark.3 rings, mark.4 chevrons, mark.5 crosses), each on a bone of its own that the
site shrinks to nothing on the snails that don't wear it. Faces -Y like the rest of the
crew; about 0.37 m tall with the stalks up.
"""

import math

import bpy
from mathutils import Matrix

import kit
import looks

FACE = 'snail'
PREVIEW = dict(lift=0.0, width=0.5)

D = {
    # The foot: front and tail ends (y), how high its middle sits, and the flattening.
    'foot': dict(front=-0.18, back=0.3, z=0.05, flat=0.55, radii=(0.056, 0.066, 0.074, 0.078, 0.076, 0.07,
                                                                    0.062, 0.052, 0.042, 0.034, 0.027, 0.02, 0.014)),
    'hump': dict(radii=(0.072, 0.12, 0.03), center=(0, 0.03, 0.088), e=0.6),
    # The shell: a log spiral about the X axis; the tube's radius is k of the spiral's.
    'shell': dict(center=(0.06, 0.225), turns=1.9, r_end=0.1, k=0.42, plates=11),
    'neck': dict(points=[(0, -0.115, 0.06), (0, -0.155, 0.105), (0, -0.19, 0.155)], radii=(0.05, 0.043, 0.04)),
    'head': dict(radii=(0.088, 0.072, 0.072), center=(0, -0.225, 0.19), e=0.6),
    # 16:10, like the snail's face layout (512 x 320)
    'screen': dict(radii=(0.068, 0.024, 0.0425), center=(0, -0.277, 0.192), bezel=0.006),
    'stalk': dict(x=0.042, base=(-0.215, 0.243), mid=(0.052, -0.222, 0.293), tip=(0.06, -0.228, 0.345),
                  r=(0.0095, 0.0075), bulb=0.0155),
    'feeler': dict(x=0.046, root=(-0.268, 0.13), tip=(0.064, -0.318, 0.1), r=0.0068, bulb=0.0105),
}

# The bones down the foot, front to back: the first three hang from the body toward the
# front, the last three toward the tail, so a wave passes through the middle.
# The shell is wider across than a round tube would make it.
WIDE = 1.5
FOOT = ('foot.1', 'foot.2', 'foot.3', 'foot.4', 'foot.5', 'foot.6')
EDGES = [D['foot']['front'] + (D['foot']['back'] - D['foot']['front']) * i / 6 for i in range(7)]


def rig_bones():
    sc, st, fe = D['shell']['center'], D['stalk'], D['feeler']
    cy, cz = sc
    y = EDGES
    z = D['foot']['z']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.05), None),
        ('body', (0, y[3], z), (0, y[3], z + 0.05), 'root'),
        ('foot.3', (0, y[3], z), (0, y[2], z), 'body'),
        ('foot.2', (0, y[2], z), (0, y[1], z), 'foot.3'),
        ('foot.1', (0, y[1], z), (0, y[0], z), 'foot.2'),
        ('foot.4', (0, y[3], z), (0, y[4], z), 'body'),
        ('foot.5', (0, y[4], z), (0, y[5], z), 'foot.4'),
        ('foot.6', (0, y[5], z), (0, y[6], z), 'foot.5'),
        ('shell', (0, cy, cz), (0, cy, cz + 0.05), 'body'),
        ('neck.1', D['neck']['points'][0], D['neck']['points'][1], 'body'),
        ('neck.2', D['neck']['points'][1], D['neck']['points'][2], 'neck.1'),
        ('head', D['neck']['points'][2], (0, -0.24, D['head']['center'][2]), 'neck.2'),
    ]
    for n in range(1, 6):
        bones.append((f'mark.{n}', (0, cy, cz), (0, cy, cz + 0.02), 'shell'))
    for side, sfx in ((1, 'L'), (-1, 'R')):
        base = (side * st['x'], st['base'][0], st['base'][1])
        mid = (side * st['mid'][0], st['mid'][1], st['mid'][2])
        tip = (side * st['tip'][0], st['tip'][1], st['tip'][2])
        bones.append((f'stalk.{sfx}.1', base, mid, 'head'))
        bones.append((f'stalk.{sfx}.2', mid, tip, f'stalk.{sfx}.1'))
        root = (side * fe['x'], fe['root'][0], fe['root'][1])
        bones.append((f'feeler.{sfx}', root, (side * fe['tip'][0], fe['tip'][1], fe['tip'][2]), 'head'))
    return bones


# ---------- The spiral ----------


def whorl(psi):
    """A point along the shell's spiral: its (y, z), the spiral radius, the tube radius
    and the direction of travel in the YZ plane. psi is 0 at the bottom, going forward,
    up over the top and back down; the mouth is the last bottom, facing forward."""
    s = D['shell']
    end = 2 * math.pi * 2
    b = math.log((1 + s['k']) / (1 - s['k'])) / (2 * math.pi)
    r = s['r_end'] * math.exp(-b * (end - psi))
    cy, cz = s['center']
    y, z = cy - r * math.sin(psi), cz - r * math.cos(psi)
    dy, dz = -math.cos(psi) + b * -math.sin(psi), math.sin(psi) + b * -math.cos(psi)
    n = math.hypot(dy, dz)
    return y, z, r, s['k'] * r, (dy / n, dz / n)


def psi_range():
    end = 2 * math.pi * 2
    return end - 2 * math.pi * D['shell']['turns'], end


def belt(name, psi, grow=1.06, minor=0.0035, x=0.0):
    """A ring round the shell's tube at psi (a seam, or a band): a torus about the tangent."""
    y, z, r, rho, (ty, tz) = whorl(psi)
    ring = kit.torus(name, rho * grow, minor, seg=(24, 5), location=(x, y, z),
                     rotation=(math.atan2(-ty, tz), 0, 0))
    kit.apply_transforms(ring)
    ring.data.transform(Matrix.Translation((-x, -y, -z)))
    kit.stretch(ring, WIDE)
    ring.data.transform(Matrix.Translation((x, y, z)))
    return ring


def on_side(psi, side, lift=0.0015):
    """The point on the tube's side face (facing +/-X) at psi, and its outward normal."""
    y, z, r, rho, _ = whorl(psi)
    return (side * (rho * WIDE + lift), y, z)


def plate(name, psi, side, radii, e1=0.3, e2=1.0):
    """A flat disc on the shell's side at psi, its axis across the shell."""
    x, y, z = on_side(psi, side, radii[2] * 0.4)
    return kit.superellipsoid(name, radii, e1, e2, seg=(20, 8), location=(x, y, z), rotation=(0, math.pi / 2, 0))


def bar(name, psi, side, half, angle, r=0.0035):
    """A short bar on the shell's side face at psi, `half` long each way, turned by angle
    (0 along the tube's direction)."""
    x, y, z = on_side(psi, side, 0.0012)
    _, _, _, _, (ty, tz) = whorl(psi)
    a = math.atan2(ty, tz) + angle
    dy, dz = math.sin(a) * half, math.cos(a) * half
    return kit.tube(name, [(x, y - dy, z - dz), (x, y + dy, z + dz)], r, ring=6)[0]


def foot_radius(y):
    """The foot's radius at y along it (its profile, linearly between the samples)."""
    f = D['foot']
    t = (y - f['front']) / (f['back'] - f['front']) * (len(f['radii']) - 1)
    i = min(max(int(t), 0), len(f['radii']) - 2)
    return f['radii'][i] + (f['radii'][i + 1] - f['radii'][i]) * (t - i)


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        # A preview of one coat (looks.COAT) shows only that snail's marks; the export has all five.
        if isinstance(bone, str) and bone.startswith('mark.') and looks.COAT is not None \
                and bone != f'mark.{looks.COAT % 5 + 1}':
            bpy.data.objects.remove(obj)
            return None
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    skin_mat, whorl_mat, mark_mat = m['role']('Skin', 'joint'), m['role']('Whorl'), m['role']('Mark', 'bezel')

    # The foot: a flattened tube, six segments long, ringed at each joint.
    f = D['foot']
    n = len(f['radii'])
    z0 = f['z'] / f['flat']
    pts = [(0, f['front'] + (f['back'] - f['front']) * i / (n - 1), z0) for i in range(n)]
    foot, ts = kit.tube('Foot', pts, list(f['radii']), ring=20)
    kit.stretch(foot, 1, 1, f['flat'])
    kit.assign(foot, skin_mat)
    parts.append(foot)
    skin.append((foot, kit.chain(ts, list(FOOT))))
    for i in range(1, 6):
        y = EDGES[i]
        ring = kit.torus(f'FootRing.{i}', foot_radius(y) * 1.03, 0.0045, seg=(28, 6), location=(0, y, z0),
                         rotation=(math.pi / 2, 0, 0))
        kit.apply_transforms(ring)
        kit.stretch(ring, 1, 1, f['flat'])
        add(ring, m['joint'], FOOT[i - 1] if i <= 3 else FOOT[i])
    # Finer half-rings between the joints, and a tread of cross bars under the sole.
    for i in range(6):
        y = (EDGES[i] + EDGES[i + 1]) / 2
        ring = kit.torus(f'FootBand.{i}', foot_radius(y) * 1.015, 0.0026, seg=(24, 5), location=(0, y, z0),
                         rotation=(math.pi / 2, 0, 0))
        kit.apply_transforms(ring)
        kit.stretch(ring, 1, 1, f['flat'])
        add(ring, m['joint'], FOOT[i])
    for i in range(11):
        y = f['front'] + 0.045 + i * 0.03
        seg = min(5, int((y - f['front']) / (f['back'] - f['front']) * 6))
        add(kit.superellipsoid(f'Tread.{i}', (foot_radius(y) * 0.5, 0.0055, 0.0035), 0.4, 0.5, seg=(12, 6),
                               location=(0, y, f['z'] - foot_radius(y) * f['flat'] + 0.0012)), m['bezel'], FOOT[seg])
    # A lamp at the tail tip that lights the trail, in a bezel.
    add(kit.torus('TailBezel', 0.0195, 0.0034, seg=(20, 6), location=(0, f['back'] - 0.0015, f['z'] + 0.006),
                  rotation=(math.pi / 2, 0, 0)), m['bezel'], 'foot.6')
    add(kit.superellipsoid('TailLamp', (0.02, 0.02, 0.016), seg=(16, 10),
                           location=(0, f['back'] - 0.004, f['z'] + 0.006)), m['dot'](7), 'foot.6')

    # The body hump under the shell, and the neck.
    hp = D['hump']
    add(kit.superellipsoid('Hump', hp['radii'], hp['e'], hp['e'], seg=(32, 20), location=hp['center']), skin_mat,
        'body')
    nk = D['neck']
    neck, nts = kit.tube('Neck', nk['points'], list(nk['radii']), ring=20)
    parts.append(neck)
    kit.assign(neck, skin_mat)
    skin.append((neck, kit.chain(nts, ['neck.1', 'neck.2'])))
    add(kit.torus('NeckRing', 0.049, 0.006, seg=(28, 8), location=(0, -0.12, 0.066),
                  rotation=(-0.58, 0, 0)), m['joint'], 'neck.1')

    add(kit.torus('NeckRing2', 0.043, 0.0048, seg=(24, 6), location=(0, -0.158, 0.108),
                  rotation=(-0.75, 0, 0)), m['joint'], 'neck.2')

    # The head with its screen.
    h = D['head']
    add(kit.superellipsoid('Head', h['radii'], h['e'], h['e'], seg=(40, 28), location=h['center']), m['shell'],
        'head')
    for side in (1, -1):
        for j, hz in enumerate((0.22, 0.16)):
            add(kit.superellipsoid(f'HeadBolt.{j}.{int(side > 0)}', (0.0035, 0.0055, 0.0055), seg=(10, 6),
                                   location=(side * 0.0865, -0.205, hz)), m['joint'], 'head')
    sc = D['screen']
    glass, rim = kit.screen('Snail', sc['radii'], sc['center'], sc['bezel'], e=0.45)
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    # Eye stalks on springy chains, a bulb of glow on each tip; feelers under the chin.
    st = D['stalk']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        base = (side * st['x'], st['base'][0], st['base'][1])
        mid = (side * st['mid'][0], st['mid'][1], st['mid'][2])
        tip = (side * st['tip'][0], st['tip'][1], st['tip'][2])
        add(kit.superellipsoid(f'StalkSocket.{sfx}', (0.018, 0.018, 0.009), 0.4, 1, seg=(20, 8),
                               location=(base[0], base[1], base[2] - 0.004)), m['bezel'], 'head')
        stalk, sts = kit.tube(f'Stalk.{sfx}', kit.spline([base, mid, tip], 9), list(
            st['r'][0] + (st['r'][1] - st['r'][0]) * i / 8 for i in range(9)), ring=10)
        parts.append(stalk)
        kit.assign(stalk, m['joint'])
        skin.append((stalk, kit.chain(sts, [f'stalk.{sfx}.1', f'stalk.{sfx}.2'])))
        add(kit.torus(f'StalkCollar.{sfx}', 0.0125, 0.0032, seg=(16, 6), location=(base[0], base[1], base[2] + 0.002)),
            m['bezel'], 'head')
        add(kit.torus(f'StalkBezel.{sfx}', st['bulb'] * 1.02, 0.0029, seg=(20, 6),
                      location=(tip[0], tip[1], tip[2] + 0.0005)), m['bezel'], f'stalk.{sfx}.2')
        add(kit.superellipsoid(f'StalkBulb.{sfx}', (st['bulb'],) * 3, seg=(20, 12),
                               location=(tip[0], tip[1], tip[2] + 0.004)), m['beacon'], f'stalk.{sfx}.2')
    fe = D['feeler']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        root = (side * fe['x'], fe['root'][0], fe['root'][1])
        tip = (side * fe['tip'][0], fe['tip'][1], fe['tip'][2])
        add(kit.tube(f'Feeler.{sfx}', [root, tip], fe['r'], ring=10)[0], m['joint'], f'feeler.{sfx}')
        add(kit.torus(f'FeelerCap.{sfx}', 0.0105, 0.0026, seg=(14, 5), location=(root[0], root[1] - 0.002, root[2]),
                      rotation=(1.2, 0, 0)), m['bezel'], 'head')
        add(kit.torus(f'FeelerRing.{sfx}', fe['bulb'] * 0.95, 0.0024, seg=(14, 5),
                      location=(tip[0], tip[1] + 0.004, tip[2]), rotation=(math.pi / 2, 0, 0)), m['joint'],
            f'feeler.{sfx}')
        add(kit.superellipsoid(f'FeelerBulb.{sfx}', (fe['bulb'],) * 3, seg=(16, 10), location=tip), m['bezel'],
            f'feeler.{sfx}')

    # The shell: the spiral tube, in plates.
    lo, hi = psi_range()
    steps = 40
    path = [whorl(lo + (hi - lo) * i / (steps - 1)) for i in range(steps)]
    tube_pts = [(0, p[0], p[1]) for p in path]
    shell_tube = kit.tube('Whorl', tube_pts, [p[3] for p in path], ring=20)[0]
    kit.stretch(shell_tube, WIDE)
    add(shell_tube, whorl_mat, 'shell')
    count = int(D['shell']['plates'] * D['shell']['turns'])
    seams = [lo + (hi - lo) * (i + 0.5) / count for i in range(count)]
    seams = [s for s in seams if s > lo + 0.5]
    for i, psi in enumerate(seams):
        add(belt(f'Seam.{i}', psi), m['joint'], 'shell')

    add(belt('Lip', hi - 0.03, 1.13, 0.0085), m['bezel'], 'shell')
    add(belt('LipRim', hi - 0.17, 1.08, 0.004), m['joint'], 'shell')
    # Rivets in rows along both edges of every seam.
    for i, psi in enumerate(seams):
        y, z, r, rho, (ty, tz) = whorl(psi)
        for side in (1, -1):
            for j, dz in enumerate((-0.55, 0.55)):
                add(kit.superellipsoid(f'Rivet.{i}.{int(side > 0)}.{j}', (0.0034,) * 3, seg=(6, 4),
                                       location=(side * WIDE * rho * 0.84, y - tz * rho * dz, z + ty * rho * dz)),
                    m['joint'], 'shell')

    # The stripe of lights: six lengths along each side, hub to mouth.
    per = 8
    cuts = [lo + 0.6 + (hi - lo - 0.6) * i / 6 for i in range(7)]
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for i in range(6):
            pts = [on_side(cuts[i] + (cuts[i + 1] - cuts[i]) * j / per, side, 0.001) for j in range(per + 1)]
            add(kit.tube(f'Stripe.{sfx}{i}', pts, 0.0048, ring=6)[0], m['dot'](i), 'shell')
            bx, by, bz = pts[per // 2]
            add(kit.torus(f'StripeBezel.{sfx}{i}', 0.0095, 0.0026, seg=(14, 5), location=(bx, by, bz),
                          rotation=(0, math.pi / 2, 0)), m['bezel'], 'shell')

    # A hub cap with a lit centre, a hatch and a vent.
    cy, cz = D['shell']['center']
    for side, sfx in ((1, 'L'), (-1, 'R')):
        x = side * 0.0235 * WIDE
        add(kit.superellipsoid(f'Hub.{sfx}', (0.03, 0.03, 0.0075), 0.3, 1, seg=(24, 8), location=(x, cy, cz),
                               rotation=(0, math.pi / 2, 0)), m['bezel'], 'shell')
        add(kit.superellipsoid(f'HubLight.{sfx}', (0.013, 0.013, 0.004), 0.3, 1, seg=(20, 6),
                               location=(side * 0.0295 * WIDE, cy, cz), rotation=(0, math.pi / 2, 0)), m['dot'](6),
            'shell')
        add(kit.torus(f'HubBezel.{sfx}', 0.033, 0.0042, seg=(24, 6), location=(side * 0.0305 * WIDE, cy, cz),
                      rotation=(0, math.pi / 2, 0)), m['joint'], 'shell')
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            add(kit.superellipsoid(f'HubScrew.{sfx}{k}', (0.003, 0.0042, 0.0042), seg=(8, 5),
                                   location=(side * 0.0305 * WIDE, cy + 0.0225 * math.cos(a), cz + 0.0225 * math.sin(a))),
                m['joint'], 'shell')
        hatch = hi - math.pi * 0.62
        add(plate(f'Hatch.{sfx}', hatch, side, (0.022, 0.03, 0.005), 0.3, 0.5), m['bezel'], 'shell')
        hy, hz, _, _, _ = whorl(hatch)
        kx = on_side(hatch, side, 0.007)[0]
        add(kit.superellipsoid(f'HatchLatch.{sfx}', (0.0035, 0.0075, 0.0045), 0.4, 0.5, seg=(10, 6),
                               location=(kx, hy - 0.011, hz)), m['joint'], 'shell')
        add(kit.superellipsoid(f'HatchKnob.{sfx}', (0.0042, 0.0042, 0.0042), seg=(8, 6),
                               location=(kx, hy - 0.011, hz)), m['bezel'], 'shell')
        for k in (-1, 1):
            add(kit.superellipsoid(f'HatchHinge.{sfx}{k}', (0.0038, 0.0038, 0.006), seg=(8, 5),
                                   location=(kx, hy + 0.0285, hz + k * 0.012)), m['joint'], 'shell')
        add(plate(f'VentPlate.{sfx}', hi - math.pi * 1.32 + 0.11, side, (0.03, 0.026, 0.0035), 0.3, 0.6), m['joint'],
            'shell')
        for k in range(5):
            add(bar(f'Vent.{sfx}{k}', hi - math.pi * 1.32 + k * 0.055, side, 0.02, math.pi / 2, 0.0026), m['bezel'],
                'shell')

    # The five patterns, each on a bone of its own.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        for k in range(5):
            add(plate(f'Spot.{sfx}{k}', hi - math.pi * (0.35 + 0.56 * k), side, (0.012, 0.012, 0.004), 0.3, 1),
                mark_mat, 'mark.1')
        if side == 1:
            for k in range(4):
                add(belt(f'Band.{k}', hi - math.pi * (0.5 + 0.5 * k) - 0.13, 1.09, 0.0075), mark_mat, 'mark.2')
        for k in range(2):
            y, z, r, rho, _ = whorl(hi - math.pi * 0.95 - k * math.pi * 1.05)
            for rr in (0.9, 0.5):
                ring = kit.torus(f'Ring.{sfx}{k}{rr}', rho * rr * 0.85, 0.0038, seg=(22, 5),
                                 location=(side * (rho * WIDE * (1 - rr * 0.35) + 0.002), y, z), rotation=(0, math.pi / 2, 0))
                add(ring, mark_mat, 'mark.3')
        for k in range(5):
            psi = hi - math.pi * (0.4 + 0.5 * k)
            add(bar(f'ChevA.{sfx}{k}', psi, side, 0.013, 0.7, 0.0034), mark_mat, 'mark.4')
            add(bar(f'ChevB.{sfx}{k}', psi, side, 0.013, -0.7, 0.0034), mark_mat, 'mark.4')
        for k in range(4):
            psi = hi - math.pi * (0.55 + 0.55 * k)
            add(bar(f'CrossA.{sfx}{k}', psi, side, 0.013, 0.0, 0.0036), mark_mat, 'mark.5')
            add(bar(f'CrossB.{sfx}{k}', psi, side, 0.013, math.pi / 2, 0.0036), mark_mat, 'mark.5')

    return looks.finish(kit.armature('SnailRig', rig_bones()), parts, skin, m)
