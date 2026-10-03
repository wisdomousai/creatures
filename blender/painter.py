"""Dab, an artist robot: a rounded box head with a red beret (and a stalk on top), a smock with
lit paint splashes, a kidney-shaped palette with paint blobs held in the left hand, a long
brush with a glowing tip in the right, and round brown shoes.

Rig: root, body, head, upper_arm/forearm/hand L/R, leg.L/R, and props on bones of their own,
scaled to nothing until a trick wants them: easel (the stand and a blank canvas, at the
right of the picture), art.1..3 (a sun, a hill and a flower that fill the canvas with light,
Dot0..Dot2) and smudge (paint on her face, Dot2). Dot3 is the brush tip. The beret's
stalk is the beacon. Faces -Y; about 0.66 m to the top of the beret.
"""

import math

import jobkit
import kit
import toykit

FACE = 'painter'
PREVIEW = dict(lift=0.0, width=0.6)

D = {
    'head': dict(radii=(0.14, 0.12, 0.108), center=(0, 0, 0.5), e1=0.55, e2=0.65),
    'screen': dict(radii=(0.1, 0.05, 0.068), center=(0, -0.082, 0.5), bezel=0.008, e=0.35),
    'body': dict(radii=(0.1, 0.082, 0.115), center=(0, 0, 0.295)),
    'shoulder': (0.115, 0, 0.375),
    'elbow': (0.15, -0.01, 0.295),
    'wrist': (0.165, -0.03, 0.225),
    'tip': (0.165, -0.034, 0.19),
    'leg': dict(x=0.06, top=0.2, bottom=0.07),
    'easel': (-0.37, -0.05),
}
CANVAS = (-0.37, -0.075, 0.32)  # the middle of the canvas


def rig_bones():
    sh, el, wr, tp = D['shoulder'], D['elbow'], D['wrist'], D['tip']
    lg = D['leg']
    bones = [
        ('root', (0, 0, 0), (0, 0, 0.1), None),
        ('body', (0, 0, 0.2), (0, 0, 0.4), 'root'),
        ('head', (0, 0, 0.4), (0, 0, 0.62), 'body'),
    ]
    for side, s in ((1, 'L'), (-1, 'R')):
        bones += jobkit.arm_bones(side, s, sh, el, wr, tp)
        bones.append((f'leg.{s}', (side * lg['x'], 0, lg['top']), (side * lg['x'], 0, lg['bottom']), 'root'))
    ex, ey = D['easel']
    cx, cy, cz = CANVAS
    bones.append(('easel', (ex, ey, 0), (ex, ey, 0.5), 'root'))
    for i, (dx, dz) in enumerate(((0.035, 0.05), (0.0, -0.06), (-0.035, -0.0)), 1):
        bones.append((f'art.{i}', (cx + dx, cy, cz + dz), (cx + dx, cy, cz + dz + 0.03), 'root'))
    bones.append(('smudge', (0.045, -0.128, 0.48), (0.045, -0.128, 0.5), 'head'))
    return bones


def build(look='ink', flame=None):
    p = toykit.Parts(look, flame, FACE)
    m, add = p.m, p.add
    lg = D['leg']

    # Round shoes and short legs.
    for side, s in ((1, 'L'), (-1, 'R')):
        x = side * lg['x']
        jobkit.leg(p, side, s, x, lg['top'], 0.09, 0.02)
        add(kit.superellipsoid(f'Shoe.{side}', (0.05, 0.07, 0.042), 0.6, 0.8, seg=(24, 14),
                               location=(x, -0.02, 0.045)), m['role']('Shoe'), f'leg.{s}')
        add(kit.torus(f'Lace.{side}', 0.026, 0.0055, seg=(20, 6), location=(x, -0.03, 0.082), rotation=(0.3, 0, 0)),
            m['role']('Trim', 'joint'), f'leg.{s}')

    # The smock, a scarf, splashes of light on it, a pocket of brushes.
    b = D['body']
    add(kit.superellipsoid('Body', b['radii'], 0.65, 0.75, seg=(36, 22), taper=0.2, location=b['center']),
        m['role']('Smock'), 'body')
    add(kit.torus('Scarf', 0.075, 0.017, seg=(32, 8), location=(0, 0, 0.395)), m['role']('Scarf', 'joint'), 'body')
    add(kit.superellipsoid('ScarfTail', (0.016, 0.01, 0.045), 0.6, 0.6, seg=(14, 8), location=(0.04, -0.075, 0.355),
                           rotation=(0, 0.15, 0)), m['role']('Scarf', 'joint'), 'body')
    for i, (x, z, r) in enumerate(((-0.05, 0.31, 0.017), (0.045, 0.255, 0.014), (-0.02, 0.23, 0.01))):
        add(kit.superellipsoid(f'Splash.{i}', (r, 0.005, r * 0.85), seg=(14, 8), location=(x, -0.084, z)),
            m['dot'](i), 'body')
    add(kit.superellipsoid('Pocket', (0.035, 0.008, 0.028), 0.4, 0.5, seg=(14, 8), location=(0.055, -0.078, 0.29)),
        m['bezel'], 'body')
    for i, dx in enumerate((-0.012, 0.0, 0.012)):
        add(kit.superellipsoid(f'Stick.{i}', (0.0045, 0.0045, 0.025), 0.8, 0.8, seg=(8, 6),
                               location=(0.055 + dx, -0.082, 0.318 + 0.003 * i), rotation=(0, dx * 8, 0)),
            m['role']('Trim', 'joint'), 'body')

    # The head: a rounded box with a screen, ear knobs, a beret and its stalk.
    h = D['head']
    add(kit.superellipsoid('Neck', (0.04, 0.04, 0.025), 0.5, 1.0, seg=(18, 8), location=(0, 0, 0.405)), m['joint'],
        'body')
    add(kit.superellipsoid('Head', h['radii'], h['e1'], h['e2'], seg=(48, 28), location=h['center']), m['shell'],
        'head')
    sc = D['screen']
    glass, rim = kit.screen('Painter', sc['radii'], sc['center'], sc['bezel'], e=sc['e'])
    add(glass, m['face'], 'head')
    add(rim, m['bezel'], 'head')
    for side in (1, -1):
        add(kit.superellipsoid(f'Ear.{side}', (0.022, 0.04, 0.04), 0.6, 0.9, seg=(18, 12),
                               location=(side * 0.14, 0.0, 0.5)), m['role']('Trim', 'joint'), 'head')
    add(kit.superellipsoid('Beret', (0.15, 0.14, 0.045), 0.55, 1.0, seg=(40, 16), location=(0.02, 0.0, 0.607),
                           rotation=(0.0, -0.18, 0.1)), m['role']('Beret'), 'head')
    add(kit.torus('BeretBand', 0.128, 0.007, seg=(40, 6), location=(0.003, 0, 0.576), rotation=(0, -0.18, 0.1)),
        m['role']('Trim', 'joint'), 'head')
    add(kit.superellipsoid('Stalk', (0.012, 0.012, 0.02), 0.6, 1.0, seg=(14, 10), location=(0.04, 0.0, 0.655),
                           rotation=(0, -0.18, 0)), m['beacon'], 'head')
    add(kit.superellipsoid('Smudge', (0.034, 0.006, 0.013), seg=(14, 8), location=(0.045, -0.128, 0.49),
                           rotation=(0, 0, 0.5)), m['dot'](2), 'smudge')

    # Arms; a palette on the left, a brush on the right.
    sh, el, wr, tp = D['shoulder'], D['elbow'], D['wrist'], D['tip']
    for side, s in ((1, 'L'), (-1, 'R')):
        f = jobkit.side_fn(side)
        jobkit.arm(p, side, s, sh, el, wr, 0.0165, mat=m['shell'])
        add(kit.superellipsoid(f'Hand.{side}', (0.03, 0.028, 0.03), 0.7, 0.7, seg=(18, 12),
                               location=f((wr[0], wr[1] - 0.004, wr[2] - 0.02))), m['role']('Trim', 'joint'),
            f'hand.{s}')
    px, py, pz = wr[0] + 0.03, wr[1] - 0.045, wr[2] + 0.004
    add(kit.superellipsoid('Palette', (0.082, 0.009, 0.058), 0.55, 0.6, seg=(28, 12), location=(px, py, pz),
                           rotation=(0, 0.25, 0)), m['role']('Wood', 'joint'), 'hand.L')
    add(kit.superellipsoid('Thumbhole', (0.011, 0.01, 0.009), seg=(12, 6), location=(px + 0.05, py - 0.002, pz - 0.02),
                           rotation=(0, 0.25, 0)), m['bezel'], 'hand.L')
    for i, (dx, dz, nm) in enumerate(((-0.05, 0.022, 'PaintA'), (-0.018, 0.036, 'PaintB'), (0.018, 0.034, 'PaintC'),
                                      (-0.045, -0.026, 'PaintD'))):
        add(kit.superellipsoid(f'Blob.{i}', (0.0145, 0.008, 0.011), seg=(14, 8),
                               location=(px + dx, py - 0.009, pz + dz)), m['role'](nm, 'glow'), 'hand.L')
    # The brush: a handle, a ferrule and a glowing tip, an extension of the arm.
    bx, by = -wr[0], wr[1]
    hnd, _ = kit.tube('BrushHandle', [(bx, by - 0.005, 0.245), (bx, by - 0.035, 0.115)], 0.0065, ring=8)
    add(hnd, m['role']('Wood', 'joint'), 'hand.R')
    add(kit.superellipsoid('Ferrule', (0.01, 0.01, 0.017), 0.6, 1.0, seg=(12, 8), location=(bx, by - 0.04, 0.1)),
        m['role']('Steel', 'bezel'), 'hand.R')
    add(kit.superellipsoid('BrushTip', (0.0125, 0.0125, 0.028), seg=(14, 10), location=(bx, by - 0.045, 0.067)),
        m['dot'](3), 'hand.R')

    # The easel and its canvas, and the picture that fills it in.
    ex, ey = D['easel']
    for k, (dx, dy, top) in enumerate(((-0.08, 0.0, 0.5), (0.08, 0.0, 0.5), (0.0, 0.1, 0.38))):
        leg_, _ = kit.tube(f'EaselLeg.{k}', [(ex + dx * 0.6, ey + dy * 0.2, top), (ex + dx * 1.3, ey + dy, 0.0)], 0.007,
                           ring=8)
        add(leg_, m['role']('Wood', 'joint'), 'easel')
    cx, cy, cz = CANVAS
    add(kit.superellipsoid('Canvas', (0.13, 0.012, 0.11), 0.35, 0.35, seg=(24, 12), location=(cx, cy + 0.006, cz)),
        m['role']('Canvas', 'glow'), 'easel')
    add(kit.superellipsoid('CanvasFrame', (0.14, 0.008, 0.12), 0.3, 0.3, seg=(24, 12), location=(cx, cy + 0.016, cz)),
        m['role']('Wood', 'joint'), 'easel')
    add(kit.superellipsoid('Ledge', (0.14, 0.03, 0.007), 0.3, 0.4, seg=(20, 8), location=(cx, cy - 0.01, cz - 0.125)),
        m['role']('Wood', 'joint'), 'easel')
    for i, (dx, dz) in enumerate(((0.035, 0.05), (0.0, -0.06), (-0.035, -0.0)), 1):
        loc = (cx + dx, cy - 0.006, cz + dz + 0.015)
        if i == 1:
            add(kit.superellipsoid('Sun', (0.034, 0.005, 0.034), seg=(20, 10), location=loc), m['dot'](0), f'art.{i}')
        elif i == 2:
            add(kit.superellipsoid('Hill', (0.1, 0.005, 0.028), 0.9, 0.5, seg=(24, 10), location=loc), m['dot'](1),
                f'art.{i}')
        else:
            add(kit.superellipsoid('Flower', (0.022, 0.005, 0.022), seg=(16, 10), location=loc), m['dot'](2),
                f'art.{i}')
            add(kit.superellipsoid('FlowerStem', (0.005, 0.004, 0.03), seg=(10, 8), location=(loc[0], loc[1], loc[2] - 0.045)),
                m['dot'](2), f'art.{i}')

    return p.finish(kit.armature('PainterRig', rig_bones()))
