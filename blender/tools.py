"""Tools the crew hold that aren't signs (signs.py has those): a robot's gear, in the signs'
style (matte, chunky, rounded parts, hex bolts, little lit dots, joints in the joint colour).

Explorer:
- magnifier: a pale lens in a bolted rim on a handle. Grip: the handle's middle.
- lantern: a little robot lantern, its core a light (Dot0), on a carrying hoop. Grip: the
  hoop's top (the lantern hangs below it).
- map: a map on two rollers, half unrolled: a big roll on top, a small one at the bottom
  round a grip, printed with a route (dashes, a lit start Dot0, an X), a river, a border
  and a compass. Grip: the middle of the bottom roller's sleeve.
- telescope: three telescoping sections with rings, an eyepiece, a lens and a lens cap
  swung open on a tether. Built standing on its eyepiece, the objective up (+Z). Grip: the
  middle section's middle.

Fun:
- flag: a pennant on a pole, the cloth on four bones (flag0..flag3) so it waves. Grip:
  the pole's lower part (the pole goes on a little below, and well above).
- umbrella: an open canopy of 8 panels (alternating shell and joint colour) over ribs with
  tips, a runner and stretchers, a hooked handle. Grip: the handle's straight part.
- balloon: a balloon on a string, the string four bones (str0..str3) up from the toggle
  in the hand, the balloon on the last so it sways with it. Grip: the toggle at the
  string's bottom end.
- megaphone: a cone with a lit mouthpiece, a grip and a trigger, a bolted rim, pointing
  forward (-Y). Grip: the pistol grip's middle.

Each is built about its grip, at the origin (where a hand or mouth holds it), Z up, front
facing -Y, one bone (root) unless it says otherwise above. Special surfaces: the lens
(Lens, pale glass) and the map's paper (Map); every other part is shell, joint, bezel or
a dot. Exported as tool-NAME (blender/build.sh tool-magnifier ...).
"""

import math

import kit
import looks
from decor import ball
from set import bolt, box

PI = math.pi
FACE = 'bolt'
# How far each hangs below its grip, so a preview can stand it clear of the floor.
LIFT = dict(magnifier=0.2, lantern=0.45, map=0.05, telescope=0.34, flag=0.16, umbrella=0.2, balloon=0.08,
            megaphone=0.13)
KINDS = ('magnifier', 'lantern', 'map', 'telescope', 'flag', 'umbrella', 'balloon', 'megaphone')

XZ = (PI / 2, 0, 0)  # a torus turned to stand in the XZ plane, facing -Y


def torus(name, major, minor, seg=(24, 6), location=(0, 0, 0), rotation=(0, 0, 0)):
    """A ring at the budget these tools keep to: about 60% of the segments asked for, the
    section no finer than 5 sided (rings are small on screen)."""
    return kit.torus(name, major, minor, seg=(max(12, round(seg[0] * 0.6)), min(seg[1], 5)), location=location,
                     rotation=rotation)


def pill(name, r, z0, z1, at=(0, 0), seg=24, k=0.45):
    """A rounded cylinder standing on Z from z0 to z1 (closed, domed corners)."""
    c = min(k * r, (z1 - z0) / 2)
    prof = [(0, z1), (r - c, z1), (r - c * 0.3, z1 - c * 0.3), (r, z1 - c), (r, z0 + c), (r - c * 0.3, z0 + c * 0.3),
            (r - c, z0), (0, z0)]
    return kit.lathe(name, prof, seg=seg, location=(at[0], at[1], 0))


def ridges(add, mat, z0, z1, n, r, minor=0.003, at=(0, 0), seg=(20, 4)):
    """n thin rings round a Z-axis grip, evenly from z0 to z1."""
    for k in range(n):
        z = z0 + (z1 - z0) * k / max(n - 1, 1)
        add(torus('Ridge', r, minor, seg=seg, location=(at[0], at[1], z)), mat)


def solid(name, front, back):
    """A thin closed solid between two grids of points (rows x columns, same shape): the
    front surface, the back surface, and a rim joining their edges."""
    ni, nj = len(front), len(front[0])
    verts = [p for row in front for p in row] + [p for row in back for p in row]
    off = ni * nj

    def at(i, j, layer=0):
        return layer * off + i * nj + j

    faces = []
    for i in range(ni - 1):
        for j in range(nj - 1):
            faces.append((at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)))
            faces.append((at(i, j, 1), at(i, j + 1, 1), at(i + 1, j + 1, 1), at(i + 1, j, 1)))
    for i in range(ni - 1):
        for j in (0, nj - 1):
            faces.append((at(i, j), at(i, j, 1), at(i + 1, j, 1), at(i + 1, j)))
    for j in range(nj - 1):
        for i in (0, ni - 1):
            faces.append((at(i, j), at(i, j + 1), at(i, j + 1, 1), at(i, j, 1)))
    return kit.mesh_object(name, verts, faces)


def weigh(obj, bones, axis=0, lo=0.0, hi=1.0):
    """Chain weights for a part from where its vertices lie along `axis`, lo..hi."""
    ts = [min(max((v.co[axis] - lo) / (hi - lo), 0.0), 1.0) for v in obj.data.vertices]
    return kit.chain(ts, bones)


# ---------- Explorer ----------


def magnifier(m, add):
    shell, J = m['role']('Tool'), m['joint']
    glass = kit.material('Lens', '#d3e6ee', roughness=0.06)
    R, cz = 0.1, 0.25
    # The handle: a fat sleeve with ridges, a cap with a lanyard eyelet, a collar and a neck
    # up into the rim.
    add(kit.tube('Handle', [(0, 0, -0.1), (0, 0, 0.105)], [0.022, 0.025], ring=16)[0], shell)
    ridges(add, J, -0.07, 0.07, 6, 0.0245, 0.003)
    add(ball('Cap', 0.03, (0, 0, -0.11), seg=(16, 10)), J)
    add(torus('Eyelet', 0.016, 0.0045, seg=(16, 6), location=(0, 0, -0.159), rotation=XZ), J)
    add(torus('Collar', 0.03, 0.009, seg=(20, 6), location=(0, 0, 0.11)), J)
    add(kit.tube('Neck', [(0, 0, 0.1), (0, 0, cz - R + 0.012)], 0.019, ring=12)[0], shell)
    # The rim, a bezel ring behind it and the lens, with six bolts round the front.
    add(torus('Rim', R, 0.016, seg=(40, 10), location=(0, 0, cz), rotation=XZ), shell)
    add(torus('RimBezel', R - 0.012, 0.007, seg=(40, 6), location=(0, 0.004, cz), rotation=XZ), J)
    prof = [(0, 0.014), (R - 0.01, 0.009), (R - 0.004, 0), (R - 0.01, -0.009), (0, -0.014)]
    add(kit.lathe('Lens', prof, seg=40, location=(0, 0, cz), rotation=XZ), glass)
    for k in range(6):
        a = 2 * PI * (k + 0.5) / 6
        bolt(add, m, (R * math.cos(a), -0.0145, cz + R * math.sin(a)), 0.0085, 'front')
    # A glint across the glass, and a status light on the collar.
    add(kit.superellipsoid('Glint', (0.03, 0.002, 0.007), seg=(12, 6), location=(-0.03, -0.0135, cz + 0.04),
                           rotation=(0, -0.7, 0)), m['bezel'])
    add(kit.superellipsoid('Light', (0.012, 0.006, 0.012), 0.6, 0.6, seg=(12, 8), location=(0, -0.027, 0.0)), m['dot'](0))


def lantern(m, add):
    shell, J = m['role']('Tool'), m['joint']
    top, hw = -0.2, 0.105
    # The carrying hoop: an arch over the lantern from pins at the roof's eaves, a sleeve at
    # its top where it's held.
    pts = [(hw * math.cos(t), 0, top - 0.03 + (0.03 - top) * math.sin(t)) for t in [PI * i / 12 for i in range(13)]]
    add(kit.tube('Hoop', pts, 0.0105, ring=8)[0], J)
    add(kit.tube('HoopGrip', [(-0.05, 0, 0.0), (0.05, 0, 0.0)], 0.017, ring=12)[0], shell)
    for k in range(4):
        add(torus('Ridge', 0.0175, 0.0026, seg=(14, 5), location=(-0.032 + 0.0213 * k, 0, 0.0),
                      rotation=(0, PI / 2, 0)), J)
    for sx in (-1, 1):
        add(ball('Pin', 0.018, (sx * (hw + 0.004), 0, top - 0.03), seg=(10, 6)), J)
    # The roof: a flared cone with a chimney cap, bolts round its eave.
    roof = [(0, top + 0.024), (0.03, top + 0.02), (0.065, top - 0.008), (0.1, top - 0.035), (0.108, top - 0.048),
            (0.098, top - 0.056), (0.0, top - 0.056)]
    add(kit.lathe('Roof', roof, seg=32), shell)
    add(torus('Chimney', 0.032, 0.008, seg=(20, 6), location=(0, 0, top + 0.012)), J)
    add(torus('Eave', 0.101, 0.0065, seg=(36, 6), location=(0, 0, top - 0.054)), J)
    # The base: a drum on four feet with a band round it.
    add(pill('Base', 0.098, -0.43, -0.37, seg=32, k=0.5), shell)
    add(torus('BaseBand', 0.094, 0.0075, seg=(32, 6), location=(0, 0, -0.372)), J)
    for k in range(4):
        a = PI / 4 + k * PI / 2
        add(ball('Foot', 0.014, (0.066 * math.cos(a), 0.066 * math.sin(a), -0.435), seg=(8, 5)), J)
    bolt(add, m, (0, -0.0985, -0.4), 0.0105, 'front')
    # The cage: six posts and two rings round a glowing core (Dot0).
    for k in range(6):
        a = 2 * PI * (k + 0.5) / 6
        add(kit.tube('Post', [(0.075 * math.cos(a), 0.075 * math.sin(a), top - 0.05),
                              (0.075 * math.cos(a), 0.075 * math.sin(a), -0.375)], 0.0095, ring=8)[0], J)
    for z in (-0.255, -0.345):
        add(torus('CageRing', 0.075, 0.0075, seg=(32, 6), location=(0, 0, z)), J)
    add(kit.superellipsoid('Core', (0.06, 0.06, 0.08), 0.7, 0.8, seg=(18, 10), location=(0, 0, -0.3)), m['dot'](0))
    add(kit.superellipsoid('Wick', (0.022, 0.022, 0.012), seg=(12, 8), location=(0, 0, -0.372)), m['bezel'])


def map_(m, add):
    J, B = m['joint'], m['bezel']
    paper = kit.material('Map', '#f4f1e6', roughness=0.8)
    w, zt = 0.18, 0.3  # half the sheet's width, and how high the top roll is over the grip
    r0, r1 = 0.027, 0.046  # the rolls' radii, bottom and top

    # The sheet: bowed a little toward us, thicker than paper, from the grip up to the top roll.
    def bow(z):
        return -0.014 * math.sin(PI * z / zt)

    nx, nz = 10, 8
    front = [[(-w + 2 * w * i / nx, bow(zt * k / nz) - 0.003, zt * k / nz) for i in range(nx + 1)] for k in range(nz + 1)]
    back = [[(x, y + 0.006, z) for x, y, z in row] for row in front]
    add(solid('Sheet', front, back), paper)

    def on(x, z, lift=0.004):
        return (x, bow(z) - 0.003 - lift, z)

    # Printed on it: a border, a river, a dashed route with a lit start (Dot0) and an X.
    bx, bz0, bz1 = w - 0.022, 0.058, zt - 0.05
    for a, b in (((-bx, bz0), (bx, bz0)), ((-bx, bz1), (bx, bz1)), ((-bx, bz0), (-bx, bz1)), ((bx, bz0), (bx, bz1))):
        add(kit.tube('Border', [on(a[0] + (b[0] - a[0]) * t / 6, a[1] + (b[1] - a[1]) * t / 6, 0.0022) for t in range(7)],
                     0.0028, ring=4)[0], J)
    river = kit.spline([(-0.15, 0.2), (-0.1, 0.16), (-0.12, 0.12), (-0.05, 0.09), (0.04, 0.1), (0.09, 0.075)], 18)
    add(kit.tube('River', [on(x, z, 0.0025) for x, z in [(p[0], p[1]) for p in river]], 0.005, ring=5)[0], J)
    route = kit.spline([(-0.1, 0.1), (-0.05, 0.13), (0.0, 0.14), (0.03, 0.17), (0.08, 0.19), (0.115, 0.2)], 31)
    for k in range(0, 28, 4):
        add(kit.tube('Dash', [on(p[0], p[1]) for p in route[k:k + 3]], 0.0072, ring=4)[0], B)
    add(ball('Start', 0.014, on(-0.105, 0.098, 0.008), seg=(12, 8)), m['dot'](0))
    xc = on(0.125, 0.205)
    for sgn in (-1, 1):
        add(kit.tube('Cross', [(xc[0] - 0.02, xc[1], xc[2] - 0.02 * sgn), (xc[0] + 0.02, xc[1], xc[2] + 0.02 * sgn)],
                     0.0075, ring=4)[0], B)
    # A compass in the corner.
    cx, cz = -0.12, 0.215
    c0 = on(cx, cz)
    add(kit.tube('CompassN', [(c0[0], c0[1], c0[2] - 0.026), (c0[0], c0[1], c0[2] + 0.028)], 0.0048, ring=5)[0], B)
    add(kit.tube('CompassE', [(c0[0] - 0.02, c0[1], c0[2]), (c0[0] + 0.02, c0[1], c0[2])], 0.0048, ring=5)[0], B)
    add(torus('CompassRing', 0.015, 0.0035, seg=(20, 5), location=(c0[0], c0[1], c0[2]), rotation=XZ), B)
    add(ball('CompassN', 0.0085, (c0[0], c0[1], c0[2] + 0.032), seg=(8, 6)), B)

    # The top roll: a fat roll of paper, flanged, on an axle with a knob at each end.
    shell = m['role']('Tool')
    ln = w + 0.03
    add(kit.tube('TopRoll', [(-w - 0.002, 0, zt), (w + 0.002, 0, zt)], r1, ring=24)[0], paper)
    add(kit.tube('TopAxle', [(-ln - 0.045, 0, zt), (ln + 0.045, 0, zt)], 0.014, ring=10)[0], J)
    for sx in (-1, 1):
        add(kit.lathe('TopFlange', [(0, 0), (r1 + 0.006, 0), (r1 + 0.006, 0.01), (0, 0.01)], seg=24,
                      location=(sx * (w + 0.002), 0, zt), rotation=(0, sx * PI / 2, 0)), shell)
        add(kit.superellipsoid('TopKnob', (0.017, 0.032, 0.032), 0.5, 0.5, seg=(10, 8),
                               location=(sx * (ln + 0.04), 0, zt)), shell)
        bolt(add, m, (sx * (ln + 0.059), 0, zt), 0.01, 'right' if sx > 0 else 'left')
    # The bottom roller: a little roll of paper at each end, and between them the sleeve held.
    add(kit.tube('BottomAxle', [(-ln - 0.045, 0, 0), (ln + 0.045, 0, 0)], 0.012, ring=10)[0], J)
    for sx in (-1, 1):
        add(kit.tube('BottomRoll', [(sx * (w + 0.002), 0, 0), (sx * 0.085, 0, 0)], r0, ring=18)[0], paper)
        add(kit.lathe('BottomFlange', [(0, 0), (r0 + 0.005, 0), (r0 + 0.005, 0.009), (0, 0.009)], seg=20,
                      location=(sx * (w + 0.002), 0, 0), rotation=(0, sx * PI / 2, 0)), shell)
        add(kit.superellipsoid('BottomKnob', (0.015, 0.026, 0.026), 0.5, 0.5, seg=(10, 8),
                               location=(sx * (ln + 0.038), 0, 0)), shell)
        bolt(add, m, (sx * (ln + 0.053), 0, 0), 0.009, 'right' if sx > 0 else 'left')
    add(kit.tube('Sleeve', [(-0.085, 0, 0), (0.085, 0, 0)], 0.03, ring=18)[0], shell)
    for k in range(5):
        add(torus('Ridge', 0.0305, 0.0028, seg=(18, 5), location=(-0.06 + 0.03 * k, 0, 0),
                      rotation=(0, PI / 2, 0)), J)


def telescope(m, add):
    shell, J = m['role']('Tool'), m['joint']
    glass = kit.material('Lens', '#d3e6ee', roughness=0.06)
    # Three sections, thin at the eyepiece to fat at the objective, each sliding into the
    # next; a collar at each joint and a ridged grip on the middle one.
    add(pill('SectionA', 0.031, -0.27, -0.04), shell)
    add(pill('SectionB', 0.043, -0.1, 0.1), shell)
    add(pill('SectionC', 0.056, 0.08, 0.28), shell)
    for z, r in ((-0.095, 0.047), (0.08, 0.06), (-0.26, 0.035)):
        add(torus('Collar', r, 0.0085, seg=(24, 7), location=(0, 0, z)), J)
    for k in range(4):
        add(torus('Ridge', 0.0445, 0.0024, seg=(24, 5), location=(0, 0, -0.04 + 0.027 * k)), J)
    for sx in (-1, 1):
        bolt(add, m, (sx * 0.0605, 0, 0.17), 0.0085, 'right' if sx > 0 else 'left')
        bolt(add, m, (sx * 0.0475, 0, -0.095), 0.007, 'right' if sx > 0 else 'left')
    # The eyepiece: a flared cup with a rim and its small glass.
    prof = [(0.029, -0.26), (0.034, -0.28), (0.043, -0.3), (0.047, -0.315), (0.039, -0.315), (0.031, -0.3),
            (0.0, -0.29)]
    add(kit.lathe('Eyepiece', prof, seg=28), J)
    add(torus('EyeRim', 0.044, 0.006, seg=(28, 6), location=(0, 0, -0.315)), shell)
    add(kit.lathe('EyeGlass', [(0, -0.3), (0.03, -0.301), (0.033, -0.306), (0, -0.311)], seg=24), glass)
    # The objective: a hood, the lens in it, and a status light (Dot0) on the front.
    add(torus('Hood', 0.0595, 0.0105, seg=(32, 8), location=(0, 0, 0.28)), shell)
    add(torus('HoodBand', 0.0555, 0.0045, seg=(32, 6), location=(0, 0, 0.298)), J)
    add(kit.lathe('Lens', [(0, 0.298), (0.052, 0.292), (0.057, 0.28), (0.052, 0.268), (0, 0.272)], seg=32), glass)
    add(kit.superellipsoid('Light', (0.012, 0.008, 0.012), 0.6, 0.6, seg=(12, 8), location=(0, -0.0555, 0.2)), m['dot'](0))
    # The focus wheel on the side of the middle section.
    add(kit.lathe('Wheel', [(0, 0.012), (0.026, 0.012), (0.03, 0.007), (0.03, -0.007), (0.026, -0.012), (0, -0.012)],
                  seg=16, location=(0.0495, 0, 0.035), rotation=(0, PI / 2, 0)), J)
    bolt(add, m, (0.0635, 0, 0.035), 0.008, 'right')
    # The lens cap, on a tether from the rim, swung open on its hinge.
    add(ball('Hinge', 0.014, (0.064, 0, 0.28), seg=(10, 6)), J)
    add(kit.tube('Tether', [(0.064, 0, 0.28), (0.094, 0, 0.298), (0.11, 0, 0.28)], 0.006, ring=6)[0], J)
    add(kit.lathe('Cap', [(0, 0.016), (0.048, 0.016), (0.056, 0.008), (0.056, -0.012), (0.048, -0.016), (0.044, -0.016),
                          (0.0, -0.014)], seg=28, location=(0.127, 0, 0.276), rotation=(0, PI / 2, 0)), shell)
    add(torus('CapBand', 0.055, 0.0045, seg=(28, 6), location=(0.121, 0, 0.276), rotation=(0, PI / 2, 0)), J)


# ---------- Fun ----------


def flag(m, add):
    shell, J = m['role']('Tool'), m['joint']
    cloth_mat = m['role']('Cloth')
    top, bot = 0.62, -0.13
    # The pole, a ridged grip round the grip point, a spiked foot, a finial with a light.
    add(kit.tube('Pole', [(0, 0, bot + 0.02), (0, 0, top - 0.03)], 0.0115, ring=12)[0], J)
    add(kit.tube('Grip', [(0, 0, -0.07), (0, 0, 0.07)], 0.019, ring=14)[0], shell)
    ridges(add, J, -0.055, 0.055, 6, 0.0192, 0.0028)
    add(kit.lathe('Spike', [(0, bot - 0.02), (0.008, bot + 0.0), (0.016, bot + 0.04), (0.0, bot + 0.04)], seg=14), J)
    add(torus('FootCollar', 0.0185, 0.0065, seg=(16, 6), location=(0, 0, bot + 0.05)), shell)
    add(torus('NeckCollar', 0.0175, 0.0055, seg=(16, 6), location=(0, 0, top - 0.04)), shell)
    add(ball('Finial', 0.026, (0, 0, top - 0.005), seg=(16, 10)), shell)
    add(ball('Light', 0.013, (0, -0.015, top + 0.003), seg=(12, 8)), m['dot'](0))
    bolt(add, m, (0, 0, top + 0.02), 0.009, 'top')
    # The cloth: a pennant out to the left (+X) from the pole, a stripe across it, on four
    # bones along its length. Rippled a little, as if it were waving.
    z0, H, L = 0.4, 0.25, 0.4
    names = ['flag0', 'flag1', 'flag2', 'flag3']
    nu, nv = 16, 4

    def cloth(v0, v1, lift, thick):
        def point(i, j, back):
            u, v = i / nu, v0 + (v1 - v0) * j / nv
            h = H * (1 - 0.82 * u ** 1.3)
            x = 0.012 + L * u
            y = 0.02 * math.sin(2 * PI * 1.1 * u - 0.6) * u ** 0.8 - 0.002 - lift
            return (x, y + (thick if back else 0.0), z0 + h * (v - 0.5))
        rows = [[point(i, j, False) for j in range(nv + 1)] for i in range(nu + 1)]
        back = [[point(i, j, True) for j in range(nv + 1)] for i in range(nu + 1)]
        return solid('Cloth', rows, back)

    for obj, mat in ((cloth(0.0, 1.0, 0.0, 0.007), cloth_mat), (cloth(0.38, 0.62, 0.0035, 0.0035), m['bezel'])):
        add(obj, mat, weigh(obj, names, 0, 0.012, 0.012 + L))
    for z in (z0 - H * 0.36, z0 + H * 0.36):
        add(torus('Toggle', 0.0175, 0.0042, seg=(16, 5), location=(0, 0, z)), shell)
    # A lit badge near the pole, on the cloth's first bone.
    add(kit.superellipsoid('Badge', (0.022, 0.006, 0.022), 0.6, 0.6, seg=(14, 8), location=(0.07, -0.0125, z0)),
        m['dot'](1), 'flag0')
    x = [0.012 + L * i / 4 for i in range(5)]
    return [(n, (x[i], 0, z0), (x[i + 1], 0, z0), 'root' if i == 0 else names[i - 1]) for i, n in enumerate(names)]


def umbrella(m, add):
    shell, J, B = m['role']('Tool'), m['joint'], m['bezel']
    alt = m['role']('Panel', 'joint')
    R, apex, edge, n = 0.31, 0.5, 0.28, 8
    NR, NA = 6, 4

    def rib_z(u):
        return apex - (apex - edge) * u ** 1.7

    # The canopy: eight panels, alternately shell and joint, each sagging between its ribs
    # and scalloped at the hem.
    for p in range(n):
        def at(i, j, back):
            u, w = i / NR, j / NA
            th = 2 * PI * (p + w) / n
            s = math.sin(PI * w)
            r = R * u * (1 - 0.07 * s * u ** 2)
            z = rib_z(u) - 0.035 * s * u ** 1.4 - (0.008 if back else 0.0)
            return (r * math.cos(th), r * math.sin(th) - 0.0, z)
        front = [[at(i, j, False) for j in range(NA + 1)] for i in range(NR + 1)]
        back = [[at(i, j, True) for j in range(NA + 1)] for i in range(NR + 1)]
        add(solid(f'Panel{p}', front, back), shell if p % 2 == 0 else alt)
    # Ribs along the seams, a tip ball at each, stretchers up from the runner.
    for p in range(n):
        th = 2 * PI * p / n
        c, s_ = math.cos(th), math.sin(th)
        pts = [(R * u * c, R * u * s_, rib_z(u) + 0.0035) for u in [i / 4 for i in range(1, 5)]]
        add(kit.tube('Rib', pts, 0.0062, ring=4)[0], B)
        add(ball('Tip', 0.0125, (R * 1.003 * c, R * 1.003 * s_, edge + 0.002), seg=(8, 5)), J)
        u = 0.5
        add(kit.tube('Stretcher', [(0.02 * c, 0.02 * s_, 0.235), (R * u * c, R * u * s_, rib_z(u) - 0.008)], 0.0055,
                     ring=4)[0], J)
    # The apex: a cap and a tip, with a light (Dot0).
    add(kit.lathe('ApexCap', [(0, apex + 0.04), (0.012, apex + 0.032), (0.026, apex + 0.01), (0.03, apex - 0.01),
                              (0, apex - 0.02)], seg=16), shell)
    add(torus('ApexRing', 0.029, 0.005, seg=(16, 6), location=(0, 0, apex - 0.004)), J)
    add(ball('Light', 0.0085, (0, -0.017, apex + 0.012), seg=(10, 6)), m['dot'](0))
    # The shaft down to the handle, the runner on it and the notch above.
    add(kit.tube('Shaft', [(0, 0, 0.08), (0, 0, apex)], 0.0105, ring=10)[0], J)
    add(pill('Runner', 0.021, 0.21, 0.27, seg=16), shell)
    add(torus('Notch', 0.015, 0.005, seg=(14, 6), location=(0, 0, 0.17)), J)
    # The handle: a ridged sleeve held at the origin, and a hook curling under it.
    add(kit.tube('Sleeve', [(0, 0, -0.1), (0, 0, 0.1)], 0.0185, ring=14)[0], shell)
    ridges(add, J, -0.07, 0.07, 5, 0.019, 0.0028)
    add(torus('SleeveEnd', 0.0195, 0.0055, seg=(16, 6), location=(0, 0, 0.105)), J)
    hook = [(0.05 - 0.05 * math.cos(t), 0, -0.115 - 0.055 * math.sin(t)) for t in [PI * i / 12 for i in range(0, 13)]]
    hook += [(0.1, 0, -0.1), (0.1, 0, -0.082)]
    add(kit.tube('Hook', kit.resample(hook, 14), 0.0155, ring=8)[0], J)
    add(ball('HookTip', 0.0175, (0.1, 0, -0.082), seg=(10, 8)), shell)
    add(kit.superellipsoid('Button', (0.0085, 0.007, 0.0155), 0.6, 0.6, seg=(10, 8), location=(0, -0.0205, 0.045)),
        m['dot'](1))


def balloon(m, add):
    shell, J = m['role']('Tool'), m['joint']
    r, cz, top = 0.125, 0.395, 0.21
    names = ['str0', 'str1', 'str2', 'str3']
    zs = [0.0, 0.0525, 0.105, 0.1575, 0.21]
    # The toggle held in the hand, and the string up from it on four bones.
    add(pill('Toggle', 0.02, -0.04, 0.04, seg=16, k=0.6), shell)
    for z in (-0.02, 0.0, 0.02):
        add(torus('ToggleRing', 0.0205, 0.0025, seg=(16, 5), location=(0, 0, z)), J)
    add(torus('Loop', 0.016, 0.004, seg=(16, 6), location=(0, 0, -0.05), rotation=(0, PI / 2, 0)), J)
    path = [(0, 0, 0.03)] + [(0, 0.012 * math.sin(PI * i / 12 * 1.5), 0.03 + 0.18 * i / 12) for i in range(1, 13)]
    string = kit.tube('String', path, 0.0055, ring=6)[0]
    ts = [(v.co.z - 0.03) / 0.18 for v in string.data.vertices]
    add(string, J, kit.chain([min(max(t, 0), 1) for t in ts], names))
    # The balloon, hung on the last bone: a gathered neck, a bolted collar, seam bands
    # crossing over a hatch at the top, and a porthole with a light (Dot0) on the front.
    add(kit.superellipsoid('Balloon', (r, r, r * 1.1), seg=(30, 16), taper=-0.14, location=(0, 0, cz)), shell, 'str3')
    add(kit.lathe('Knot', [(0, top + 0.05), (0.014, top + 0.048), (0.024, top + 0.02), (0.012, top), (0, top)], seg=16),
        shell, 'str3')
    add(torus('Collar', 0.0215, 0.0065, seg=(18, 6), location=(0, 0, top + 0.014)), J, 'str3')
    bolt(add, m, (0, -0.0285, top + 0.014), 0.008, 'front', 'str3')
    ztop = cz + r * 1.1
    for k in range(2):
        a = PI / 4 + k * PI / 2
        pts = []
        for i in range(21):
            t = 0.12 + (PI - 0.24) * i / 20
            rr, zz = r * 1.012 * math.sin(t), cz + r * 1.112 * math.cos(t)
            pts.append((rr * math.cos(a), rr * math.sin(a), zz))
        add(kit.tube('Seam', pts, 0.0048, ring=5)[0], J, 'str3')
        pts2 = [(-p[0], -p[1], p[2]) for p in pts]
        add(kit.tube('Seam', pts2, 0.0048, ring=5)[0], J, 'str3')
    add(kit.lathe('Hatch', [(0, ztop + 0.006), (0.03, ztop + 0.002), (0.034, ztop - 0.012), (0, ztop - 0.02)], seg=12),
        J, 'str3')
    for k in range(6):
        a = 2 * PI * k / 6
        bolt(add, m, (0.027 * math.cos(a), 0.027 * math.sin(a), ztop + 0.0035), 0.0058, 'top', 'str3')
    add(torus('Porthole', 0.035, 0.0075, seg=(24, 6), location=(0, -r * 0.94, cz + 0.015), rotation=XZ), J, 'str3')
    add(kit.superellipsoid('Light', (0.03, 0.006, 0.03), 0.6, 0.8, seg=(16, 8), location=(0, -r * 0.975, cz + 0.015)),
        m['dot'](0), 'str3')
    add(kit.superellipsoid('Shine', (0.016, 0.005, 0.04), seg=(12, 8), location=(-0.065, -r * 0.84, cz + 0.07),
                           rotation=(0, 0.4, 0)), m['bezel'], 'str3')
    return [(n, (0, 0, zs[i]), (0, 0, zs[i + 1]), 'root' if i == 0 else names[i - 1])
            for i, n in enumerate(names)]


def megaphone(m, add):
    shell, J = m['role']('Tool'), m['joint']
    zc, yc = 0.2, -0.02  # the cone's axis height, and where its local z = 0 lies on Y
    # The cone, about Z then turned to point forward (-Y): local z = -y. A thin shell with
    # a dark lining, a bolted rim at the mouth, a back cup.
    prof = [(0.0, -0.15), (0.05, -0.145), (0.058, -0.12), (0.062, -0.06), (0.082, 0.04), (0.118, 0.14), (0.138, 0.2),
            (0.13, 0.2), (0.11, 0.14), (0.075, 0.04), (0.054, -0.06), (0.05, -0.12), (0.0, -0.12)]
    add(kit.lathe('Cone', prof, seg=32, location=(0, yc, zc), rotation=(PI / 2, 0, 0)), shell)
    lining = [(0.0, -0.1), (0.047, -0.1), (0.052, -0.06), (0.072, 0.04), (0.108, 0.14), (0.127, 0.198), (0.0, 0.198)]
    add(kit.lathe('Lining', lining, seg=32, location=(0, yc, zc), rotation=(PI / 2, 0, 0)), m['bezel'])
    add(torus('Rim', 0.137, 0.011, seg=(36, 8), location=(0, yc - 0.2, zc), rotation=XZ), J)
    for k in range(8):
        a = 2 * PI * (k + 0.5) / 8
        bolt(add, m, (0.137 * math.cos(a), yc - 0.2 - 0.0105, zc + 0.137 * math.sin(a)), 0.0095, 'front')
    add(torus('Band', 0.07, 0.008, seg=(28, 6), location=(0, yc - 0.03, zc), rotation=XZ), J)
    add(torus('BandBack', 0.056, 0.008, seg=(24, 6), location=(0, yc + 0.11, zc), rotation=XZ), J)
    add(kit.lathe('Mouthpiece', [(0.0, 0.0), (0.03, 0.0), (0.036, 0.012), (0.036, 0.03), (0.0, 0.034)], seg=20,
                  location=(0, yc + 0.15, zc), rotation=(-PI / 2, 0, 0)), shell)
    add(kit.superellipsoid('Light', (0.014, 0.02, 0.008), 0.6, 0.6, seg=(12, 8), location=(0, yc + 0.0, zc + 0.065)),
        m['dot'](0))
    # The pistol grip under it, raked back, ridged, with a foot, and a trigger up front.
    top, bottom = (0, -0.005, 0.135), (0, 0.025, -0.1)
    add(kit.tube('Grip', [top, bottom], [0.03, 0.026], ring=14)[0], shell)
    add(box('GripPlate', (0.05, 0.05, 0.016), (0, 0, 0.145), 0.3, seg=(16, 8)), J)
    add(box('GripFoot', (0.034, 0.03, 0.014), (0, 0.027, -0.108), 0.4, seg=(12, 8)), J)
    for k in range(5):
        t = 0.2 + 0.14 * k
        c = (top[0], top[1] + (bottom[1] - top[1]) * t, top[2] + (bottom[2] - top[2]) * t)
        add(torus('Ridge', 0.0275 - 0.003 * t, 0.0026, seg=(16, 5), location=c), J)
    add(box('Trigger', (0.011, 0.014, 0.034), (0, -0.045, 0.085), 0.5, seg=(10, 8), rotation=(-0.25, 0, 0)), J)
    add(kit.tube('Guard', [(0, -0.03, 0.12), (0, -0.065, 0.1), (0, -0.07, 0.07), (0, -0.04, 0.045)], 0.0062, ring=6)[0], J)
    bolt(add, m, (-0.0305, 0.002, 0.07), 0.009, 'left')


BUILDERS = {'magnifier': magnifier, 'lantern': lantern, 'map': map_, 'telescope': telescope, 'flag': flag,
            'umbrella': umbrella, 'balloon': balloon, 'megaphone': megaphone}


def build_tool(kind, look='ink', flame=None):
    m = looks.materials(look, flame, palette='monitor')
    parts, skin = [], []

    def add(obj, mat, bone='root'):
        if mat is not None:
            kit.assign(obj, mat)
        parts.append(obj)
        skin.append((obj, bone))
        return obj

    chain = BUILDERS[kind](m, add) or []
    rig = kit.armature('ToolRig', [('root', (0, 0, 0), (0, 0, 0.2), None), *chain])
    return looks.finish(rig, parts, skin, m)


class Kind:
    def __init__(self, name):
        self.name = name
        self.PREVIEW = dict(lift=LIFT[name], width=0.6)
        self.FACE = FACE

    def build(self, look='ink', flame=None):
        return build_tool(self.name, look, flame)


def kind(name):
    return Kind(name)
