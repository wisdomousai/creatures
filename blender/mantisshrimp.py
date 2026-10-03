"""Jab, the crew's robot mantis shrimp: a segmented toy of a shrimp, its colour all in its lights.
A rounded carapace (body) and five overlapping body plates in a row (seg.1 .. seg.5, a chain
that can ripple), each plate with a lit stripe round its rear edge (Dot0 .. Dot4; the carapace's
is Dot5) for the site to colour in rainbow; flat swimmerets under the plates; a telson and two
uropods on the last (tail).

No face on the body: its two eyes are two small round screens on stalks (eye.L, eye.R) that
swivel on their own, each showing one eye (the layout puts both of the face's eyes on the same
spot). Under the head two folded raptorial arms: an upper arm down and forward (arm.L.1), a
forearm folded back (arm.L.2) with a big rounded club on it, its tip lit (Dot6), ready to
snap out. A burst of light waits on a bone of its own (burst: a lit core, two rings and a
spray of rays in the beacon's material so it shows against any room) in front of the face.
Faces -Y like the rest of the crew; about 0.27 m tall and 0.62 m long, and it floats: its
origin is under the carapace.
"""

import math

from mathutils import Vector

import kit
import looks
import seakit

FACE = 'mantisshrimp'
PREVIEW = dict(lift=0.06, width=0.7, turn=-68)

CARA = dict(c=(0, -0.1, 0.12), r=(0.088, 0.078, 0.06))
PLATES = [(0, -0.035 + 0.07 * i, 0.12 - 0.006 * i * i * 0.2) for i in range(6)]
EYE = {'L': 1, 'R': -1}
BURST = Vector((0, -0.4, 0.1))


def arm_points(s):
    sh = Vector((s * 0.07, -0.15, 0.105))
    el = Vector((s * 0.095, -0.2, 0.055))
    hand = Vector((s * 0.075, -0.15, 0.075))
    return sh, el, hand


def rig_bones():
    v = Vector
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', CARA['c'], (0, CARA['c'][1], CARA['c'][2] + 0.1), 'root'),
        ('burst', BURST, BURST + v((0, 0, 0.05)), 'root'),
    ]
    for sfx, s in EYE.items():
        base = v((s * 0.05, -0.12, 0.16))
        tip = v((s * 0.085, -0.15, 0.225))
        bones.append((f'eye.{sfx}', base, tip, 'body'))
        sh, el, hand = arm_points(s)
        bones += [(f'arm.{sfx}.1', sh, el, 'body'), (f'arm.{sfx}.2', el, hand, f'arm.{sfx}.1')]
    b, _ = seakit.chain('seg', 'body', PLATES)
    bones += b
    end = Vector(PLATES[-1])
    bones.append(('tail', end, end + v((0, 0.07, -0.01)), 'seg.5'))
    return bones


def build(look='ink', flame=None):
    m = looks.materials(look, flame, face=FACE)
    parts, skin = [], []

    def add(obj, mat, bone):
        kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    fin = m['role']('Fin', 'joint')
    club = m['role']('Club', 'joint')

    # The carapace: a rounded shield with a seam and a lit stripe across its back.
    c, r = CARA['c'], CARA['r']
    add(seakit.pod('Carapace', c, r, (0.7, 0.8), seg=(36, 22)), m['shell'], 'body')
    add(seakit.pod('Visor', (0, c[1] - 0.045, c[2] + 0.03), (0.07, 0.03, 0.03), (0.6, 0.8), seg=(24, 10)), m['bezel'], 'body')
    add(seakit.pod('Stripe5', (0, c[1] + 0.035, c[2] + 0.004), (r[0] * 0.995, 0.011, r[2] * 1.0), (0.6, 0.9), seg=(32, 8)),
        m['dot'](5), 'body')
    add(seakit.pod('Rostrum', (0, c[1] - 0.075, c[2] - 0.012), (0.02, 0.025, 0.014), (0.7, 0.8), seg=(14, 8)), m['bezel'],
        'body')

    # The eyes: a stalk, a round screen on its end.
    for sfx, s in EYE.items():
        base = Vector((s * 0.05, -0.12, 0.16))
        tip = Vector((s * 0.085, -0.15, 0.225))
        add(seakit.bar(f'Stalk{sfx}', base, tip, 0.0115), m['joint'], f'eye.{sfx}')
        add(seakit.pod(f'Cup{sfx}', tip + Vector((0, 0.004, -0.004)), (0.027, 0.02, 0.027), (0.8, 0.8), seg=(18, 12)),
            m['bezel'], f'eye.{sfx}')
        glass, rim = kit.screen(f'Eye{sfx}', (0.034, 0.014, 0.034), (tip.x, tip.y - 0.016, tip.z + 0.008), 0.0055, e=0.9)
        add(glass, m['face'], f'eye.{sfx}')
        add(rim, m['bezel'], f'eye.{sfx}')

    # The plates, each with a lit stripe at its rear edge and a pair of swimmerets.
    for i in range(5):
        a, b = Vector(PLATES[i]), Vector(PLATES[i + 1])
        mid = a.lerp(b, 0.5)
        k = 1 - 0.07 * i
        add(seakit.pod(f'Plate{i}', mid + Vector((0, 0.0, 0.0)), (0.08 * k, 0.047, 0.056 * k), (0.55, 0.8), seg=(24, 10)),
            m['shell'], f'seg.{i + 1}')
        add(seakit.pod(f'Lamp{i}', mid + Vector((0, 0.03, 0.0)), (0.0805 * k, 0.0105, 0.0565 * k), (0.55, 0.9), seg=(24, 6)),
            m['dot'](i), f'seg.{i + 1}')
        for sfx, s in (('L', 1), ('R', -1)):
            add(seakit.fan(f'Swimmeret{sfx}{i}', mid + Vector((s * 0.03 * k, 0, -0.04 * k)), (s * 0.5, 0.15, -1),
                           (0.02, 0.006, 0.04), (0, 1, 0), taper=0.6, seg=(14, 6)), fin, f'seg.{i + 1}')

    # The tail fan: telson and two uropods.
    end = Vector(PLATES[-1])
    add(seakit.pod('Telson', end + Vector((0, 0.04, -0.005)), (0.04, 0.05, 0.022), (0.6, 0.8), seg=(24, 12)), m['shell'],
        'tail')
    for sfx, s in (('L', 1), ('R', -1)):
        add(seakit.fan(f'Uropod{sfx}', end + Vector((s * 0.015, 0.0, -0.005)), (s * 0.55, 1, 0), (0.03, 0.008, 0.075),
                       (0, 0, 1), taper=0.5), fin, 'tail')
    add(seakit.pod('TelsonLamp', end + Vector((0, 0.085, -0.008)), (0.012, 0.012, 0.01), (0.9, 0.9), seg=(12, 8)),
        m['dot'](4), 'tail')

    # The raptorial arms, folded: a ball at the shoulder, an arm down and forward, a forearm folded back
    # that carries the club.
    for sfx, s in EYE.items():
        sh, el, hand = arm_points(s)
        add(seakit.pod(f'Shoulder{sfx}', sh, (0.024, 0.024, 0.024), (0.8, 0.8), seg=(16, 10)), m['bezel'], 'body')
        add(seakit.bar(f'Upper{sfx}', sh, el, 0.0165), m['joint'], f'arm.{sfx}.1')
        add(seakit.pod(f'Elbow{sfx}', el, (0.021, 0.021, 0.021), (0.8, 0.8), seg=(16, 10)), m['bezel'], f'arm.{sfx}.1')
        add(seakit.bar(f'Fore{sfx}', el, hand + (hand - el) * 0.2, 0.015), m['joint'], f'arm.{sfx}.2')
        d = (hand - el).normalized()
        cc = hand + d * 0.02
        add(seakit.pod(f'Club{sfx}', cc, (0.032, 0.032, 0.045), (0.75, 0.85), seg=(22, 14), rotation=seakit.aim((0, 0, 0), d)),
            club, f'arm.{sfx}.2')
        add(seakit.pod(f'ClubTip{sfx}', cc + d * 0.043, (0.013, 0.013, 0.012), (0.9, 0.9), seg=(12, 8)), m['dot'](6),
            f'arm.{sfx}.2')
        add(kit.torus(f'ClubBand{sfx}', 0.031, 0.0055, seg=(24, 8), location=cc - d * 0.012,
                      rotation=seakit.aim((0, 0, 0), d)), m['bezel'], f'arm.{sfx}.2')

    # The burst of light, put away inside nothing in particular: a core, two rings and rays.
    add(seakit.pod('BurstCore', BURST, (0.03, 0.03, 0.03), (0.9, 0.9), seg=(18, 12)), m['beacon'], 'burst')
    add(kit.torus('BurstRingA', 0.075, 0.0055, seg=(36, 8), location=BURST), m['beacon'], 'burst')
    add(kit.torus('BurstRingB', 0.075, 0.0055, seg=(36, 8), location=BURST, rotation=(math.pi / 2, 0, 0)), m['beacon'],
        'burst')
    for i in range(12):
        a = 2 * math.pi * i / 12
        for plane in (0, 1):
            d = Vector((0, math.cos(a), math.sin(a))) if plane == 0 else Vector((math.cos(a), math.sin(a), 0))
            if plane == 1 and i % 3:
                continue
            add(seakit.bar(f'Ray{plane}{i}', BURST + d * 0.045, BURST + d * 0.115, 0.0065, seg=(8, 6)), m['beacon'], 'burst')

    return looks.finish(kit.armature('MantisRig', rig_bones()), parts, skin, m)
