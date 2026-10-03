"""Small helpers for the job-and-hobby toy robots (Dibble the gardener, Orbit the astronaut,
Dab the painter, Caper the juggler, Clink the knight): rubber-hose arms with the bones named
as Bolt's are (`upper_arm`, `forearm`, `hand`, `body`, `head`), so the director's shared poses
work on them, and rounded-box legs. Each creature's own module has its table of dimensions,
its rig and its signature parts; this only saves typing the arm five times.

A second pair of arms (Caper) is built with pair='2': `upper_arm2.L` and so on.
"""

import kit
from toykit import mirror_x


def side_fn(side):
    return (lambda q: q) if side > 0 else mirror_x


def arm_bones(side, s, sh, el, wr, tip, parent='body', pair=''):
    """Three bones: the upper arm, the forearm and the hand (to its fingertips)."""
    f = side_fn(side)
    return [
        (f'upper_arm{pair}.{s}', f(sh), f(el), parent),
        (f'forearm{pair}.{s}', f(el), f(wr), f'upper_arm{pair}.{s}'),
        (f'hand{pair}.{s}', f(wr), f(tip), f'forearm{pair}.{s}'),
    ]


def arm(p, side, s, sh, el, wr, r=0.017, pair='', ball=0.028, mat=None, joint=None, elbow=True):
    """A hose arm that bends at the elbow, with a ball joint at the shoulder (and the elbow)."""
    f = side_fn(side)
    m = p.m
    p.hose(f'Arm{pair}.{side}', [f(sh), f(el), f(wr)], r, [f'upper_arm{pair}.{s}', f'forearm{pair}.{s}'],
           mat or m['joint'], n=8)
    if ball:
        p.add(kit.superellipsoid(f'Shoulder{pair}.{side}', (ball,) * 3, seg=(16, 10), location=f(sh)),
              joint or m['joint'], 'body')
    if elbow:
        p.add(kit.superellipsoid(f'Elbow{pair}.{side}', (r * 1.25,) * 3, seg=(14, 8), location=f(el)),
              joint or m['joint'], f'upper_arm{pair}.{s}')


def leg(p, side, s, x, top, bottom, r=0.02, mat=None):
    """A short rubber leg from the hip down to the boot, on the bone leg.L / leg.R."""
    tube, _ = kit.tube(f'Leg.{side}', [(x, 0, top), (x, 0, bottom)], r, ring=12)
    p.add(tube, mat or p.m['joint'], f'leg.{s}')
