"""Gus, the crew's robot old tabby: a senior moggy, a bit thin and bony now. A narrow body with the
spine, shoulder blades and hip bones standing out under it and ribs showing as grooves,
thin legs with big knobbly knee joints, a head a little large for the frame under a pale grey
muzzle panel, one ear torn (the tip bitten off), a classic M marked on his brow, and a thin
tail that droops. His coat is classic tabby: dark bands round the body and tail and a
bullseye swirl on each flank, drawn as grooves. His knees glow amber (Dot5) when his joints
creak. Faces -Y like the rest of the crew; about 0.6 m to the ear tips.
"""

import math

from mathutils import Vector

import catkit
import kit

FACE = 'oldtabby'
PREVIEW = dict(lift=0.0, width=0.7)

P = dict(
    face=FACE,
    head=dict(radii=(0.16, 0.13, 0.125), center=(0, -0.3, 0.46), e=0.55),
    screen=dict(radii=(0.128, 0.09, 0.088), center=(0, -0.38, 0.46), bezel=0.009, e=0.45),
    neckpart=dict(radii=(0.075, 0.1, 0.09), center=(0, -0.2, 0.4), e=0.7, tilt=-0.4),
    body=dict(radii=(0.1, 0.27, 0.098), center=(0, 0.05, 0.3), e=0.5, tilt=0.0),
    ear=dict(x=0.115, y=-0.3, z=0.565, tilt=0.42, inset=0.026, torn='L',
             profile=[(0.0, 0.11), (0.024, 0.102), (0.058, 0.066), (0.08, 0.0)]),
    leg=dict(x=0.07, front=-0.14, back=0.23, top=0.26, bottom=0.04, r=0.028, r_top=0.034, r_top_back=0.04,
             hock=0.03),
    paw=dict(radii=(0.042, 0.054, 0.028), e=0.45),
    tail=[(0, 0.31, 0.3), (0, 0.45, 0.28), (0, 0.57, 0.24), (0, 0.65, 0.17), (0, 0.68, 0.09)],
    tail_r=(0.032, 0.022),
    tail_bones=4,
    tail_rings=[(0.22, 0.3), (0.42, 0.5), (0.62, 0.7), (0.84, 1.01)],
    hips=(0.25, 0.3),
    neck=(-0.19, 0.38),
    collar=dict(center=(0, -0.2, 0.4), major=0.088, minor=0.012, tilt=0.5),
    tag=dict(r=0.02, center=(0, -0.275, 0.33)),
    whiskers=0.055,
)


def bones(add, m, c):
    """The bony frame under the coat: a row of knobs down the spine, shoulder blades, hip bones."""
    bone = m['role']('Hip', 'joint')
    b = P['body']
    for i in range(7):
        y = -0.17 + 0.06 * i
        p, n = c.body_point((0, y, 1.0))
        c.panel(f'Vertebra{i}', p, n, (0.016, 0.02, 0.012), bone, 'body', e=0.7, lift=-0.002)
    for side, sfx in ((1, 'L'), (-1, 'R')):
        add(kit.superellipsoid(f'Shoulder.{sfx}', (0.03, 0.07, 0.07), 0.6, 0.6, seg=(18, 12),
                               location=(side * 0.088, -0.12, 0.345), rotation=(0, 0, side * 0.2)), bone, 'body')
        add(kit.superellipsoid(f'HipBone.{sfx}', (0.03, 0.045, 0.045), 0.6, 0.6, seg=(18, 12),
                               location=(side * 0.088, 0.25, 0.355)), bone, 'body')
    # A sunken belly: a pale plate low on the flanks, ribs as grooves above it.
    for i, y in enumerate((-0.14, -0.09, -0.04, 0.01, 0.06, 0.11)):
        for side, sfx in ((1, 'L'), (-1, 'R')):
            pts = catkit.ring_about_y(b['center'], b['radii'], b['e'], y, lift=1.004, zmin=-0.075, zmax=0.01, side=side)
            if len(pts) > 5:
                c.seam(f'Rib.{sfx}{i}', pts, 0.0028, m['joint'], 'body')


def stripes(add, m, c):
    """Classic tabby markings as grooves: dark bands over the back, a bullseye on each flank, bands
    on the legs and the head's cheek lines."""
    st = m['role']('Stripe', 'joint')
    b = P['body']
    for i, y in enumerate((-0.2, -0.13, 0.19, 0.26, 0.32)):
        pts = catkit.ring_about_y(b['center'], b['radii'], b['e'], y, lift=1.006, zmin=-0.01)
        if len(pts) > 5:
            c.seam(f'Band.{i}', pts, 0.0055, st, 'body')
    for side, sfx in ((1, 'L'), (-1, 'R')):
        p, n = c.body_point((side * b['radii'][0], 0.05 - b['center'][1] * 0, 0.1 * b['radii'][2]))
        for k, (r, w) in enumerate(((0.052, 0.0055), (0.034, 0.005), (0.016, 0.0045))):
            c.ring(f'Swirl.{sfx}{k}', p, n, r, w, st, 'body', seg=(22, 6), lift=0.0)
    for nm, x, y, top in catkit.leg_spots(P['leg']):
        for k, z in enumerate((0.1, 0.16, 0.22)):
            if z < top - 0.02:
                add(kit.torus(f'LegBand.{nm}{k}', P['leg']['r'] * 1.2 + 0.002, 0.0035, seg=(16, 5), location=(x, y, z)),
                    st, f'leg.{nm}')
        # The knee: a big knobbly joint with a light that glows when it creaks.
        add(kit.superellipsoid(f'KneeJoint.{nm}', (0.036, 0.036, 0.036), seg=(16, 12),
                               location=(x + (0.012 if x > 0 else -0.012), y + (0.02 if nm[0] == 'B' else 0), 0.15)),
            m['joint'], f'leg.{nm}')
        add(kit.superellipsoid(f'KneeLight.{nm}', (0.01,) * 3, seg=(8, 6),
                               location=(x + (0.045 if x > 0 else -0.045), y + (0.02 if nm[0] == 'B' else 0), 0.15)),
            m['dot'](5), f'leg.{nm}')


def face_marks(add, m, c):
    """The M on his brow, the grey muzzle panel, pale brows and chin."""
    st = m['role']('Stripe', 'joint')
    h, sc = P['head'], P['screen']
    top_rel = (sc['center'][2] + sc['radii'][2]) - h['center'][2] + 0.012
    shape = [(-0.055, 0.0), (-0.032, 0.036), (-0.008, 0.01), (0.0, 0.0)]
    pts = [(-0.06, 0.0), (-0.04, 0.04), (-0.012, 0.012), (0.0, 0.034), (0.012, 0.012), (0.04, 0.04), (0.06, 0.0)]
    surf = []
    for x, dz in pts:
        p, n = c.head_point((x, -h['radii'][1] * 0.6, top_rel + dz), lift=0.0025)
        surf.append(tuple(p))
    c.seam('BrowM', kit.spline(surf, 20), 0.0042, st, 'head')
    # Cheek lines running back from the screen's corners.
    for side, sfx in ((1, 'L'), (-1, 'R')):
        pts = []
        for k in range(5):
            p, n = c.head_point((side * (0.7 + 0.08 * k), -0.4 + 0.15 * k, -0.12 - 0.1 * k), lift=0.002)
            pts.append(tuple(p))
        c.seam(f'Cheek.{sfx}', pts, 0.0038, st, 'head')
    # The grey muzzle: a pale panel under the screen and over the chin.
    p, n = c.head_point((0, -0.8, -0.55))
    c.panel('Muzzle', p, n, (0.075, 0.045, 0.012), m['role']('Muzzle', 'joint'), 'head', e=0.5, lift=0.0)
    for side, sfx in ((1, 'L'), (-1, 'R')):
        p, n = c.head_point((side * 0.5, -0.8, -0.45))
        c.panel(f'MuzzlePad.{sfx}', p, n, (0.04, 0.03, 0.012), m['role']('Muzzle', 'joint'), 'head', e=0.5, lift=0.0)
        p, n = c.head_point((side * 0.4, -0.7, 0.62))
        c.panel(f'Brow.{sfx}', p, n, (0.03, 0.012, 0.009), m['role']('Muzzle', 'joint'), 'head', e=0.5, lift=0.0)
    # The torn ear's ragged edge: a small bolt where the tip was.
    e = P['ear']
    add(kit.superellipsoid('EarNick', (0.01, 0.006, 0.014), seg=(8, 6),
                           location=(e['x'] + 0.026, e['y'] - 0.004, e['z'] + 0.012)), m['bezel'], 'ear.L')


def build(look='ink', flame=None):
    return catkit.build(look, flame, P, [bones, stripes, face_marks], name='OldTabby')
