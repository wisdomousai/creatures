"""Fluffkit: building blocks for the small round four-legged crew (hamster, chinchilla,
red panda, koala, panda), so the builders of these share one way of making a chunky robot
mammal. For whoever builds the next fluffy creature on the Pet base (pet.ts / fluffy.ts).

A fluffy robot is a few chunky rounded pods, never fur: a body pod, a head pod with a screen
face, ears that are plates, pucks or domes, four legs that are a ball hip, a short tube, a
knee ball, a short tube and a flat paw, and a tail that is a nub or a chain of rings.
Everything faces -Y and stands on z = 0. The rig is the Pet rig: `root`, `body` (pivot at the
hips, tail at the chest), `head`, `ear.L`/`ear.R`, `tail.1..N` and `leg.FL/FR/BL/BR`, each
leg a single bone from its hip to the floor.

`Rig` wraps the materials and the parts list; `Rig.leg`, `Rig.paw`, `Rig.belt` and friends
add the repeated bits so a creature file is mostly its own numbers and signature parts.
"""

import math

from mathutils import Euler, Vector

import kit
import looks


def mirror(p, side):
    return side * p[0], p[1], p[2]


def along(a, b):
    """Euler rotation turning a torus's axis (Z) to point from a to b."""
    return (Vector(b) - Vector(a)).to_track_quat('Z', 'Y').to_euler()


def ellipse(center, rx, ry, z=None, n=48):
    """Points round an ellipse (a belt seam on a body), n + 1 so the loop closes."""
    cx, cy, cz = center
    z = cz if z is None else z
    return [Vector((cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n), z))
            for i in range(n + 1)]


def surface_ring(radii, center, e, z, grow=1.012, taper=0.0, n=64):
    """Points round a superellipsoid at height z, on its surface and a hair proud of it."""
    rx, ry, rz = radii
    cx, cy, cz = center
    sp = max(-0.999, min(0.999, (z - cz) / rz))
    x = abs(sp) ** (1 / e)
    cp = math.sqrt(max(0.0, 1 - x * x)) ** e
    k = 1.0 - taper * (sp / 2)
    pts = []
    for i in range(n + 1):
        th = 2 * math.pi * i / n
        pts.append(Vector((cx + rx * cp * k * grow * kit.spow(math.cos(th), e),
                           cy + ry * cp * k * grow * kit.spow(math.sin(th), e), z)))
    return pts


class Rig:
    """Materials, parts and skin weights for one creature."""

    def __init__(self, face, look='ink', flame=None):
        self.m = looks.materials(look, flame, face=face)
        self.parts, self.skin = [], []

    def add(self, obj, mat, bone):
        kit.assign(obj, mat)
        self.parts.append(obj)
        self.skin.append((obj, bone))
        return obj

    def pod(self, name, radii, at, mat, bone, e=0.8, e2=None, seg=(28, 18), rot=(0, 0, 0), taper=0.0):
        return self.add(kit.superellipsoid(name, radii, e, e if e2 is None else e2, seg=seg, location=at,
                                           rotation=rot, taper=taper), mat, bone)

    def ball(self, name, r, at, mat, bone, seg=(20, 14)):
        return self.add(kit.superellipsoid(name, (r,) * 3, seg=seg, location=at), mat, bone)

    def puck(self, name, r, half, at, mat, bone, rot=(0, 0, 0), seg=(28, 8), e=0.35):
        """A round disc, thin along its local Z."""
        return self.add(kit.superellipsoid(name, (r, r, half), e, 1.0, seg=seg, location=at, rotation=rot), mat, bone)

    def stud(self, name, at, r=0.0055, bone='body', mat='joint', face=(math.pi / 2, 0, 0)):
        return self.add(kit.superellipsoid(name, (r, r * 0.6, r), 0.6, 1.0, seg=(10, 6), location=at, rotation=face),
                        self.m[mat], bone)

    def ring(self, name, at, major, minor, toward, mat, bone, seg=(28, 6)):
        """A torus round the line from `at` toward `toward` (its axis)."""
        return self.add(kit.torus(name, major, minor, seg=seg, location=at,
                                  rotation=tuple(along(at, toward))), self.m[mat], bone)

    def seam(self, name, points, bone, r=0.0035, mat='joint'):
        return self.add(kit.tube(name, points, r, ring=6)[0], self.m[mat], bone)

    def tube(self, name, points, r, mat, bone, ring=12):
        return self.add(kit.tube(name, points, r, ring=ring)[0], mat, bone)

    def leg(self, sfx, hip, knee, ankle, r, bone, foot, shell=None, paw=None, pad=None, toes=0):
        """One leg: ball hip, tube, ball knee, tube, ring at the ankle, a flat paw with a pad.

        `foot` is dict(radii=, center=) of the paw pod. A short leg can pass knee=None."""
        m = self.m
        shell = shell or m['shell']
        paw = paw or shell
        pad = pad or m['role']('Pad', 'joint')
        self.ball(f'Hip.{sfx}', r * 1.3, hip, m['joint'], bone)
        if knee is None:
            self.tube(f'Leg.{sfx}', [hip, ankle], r, shell, bone)
        else:
            self.tube(f'Thigh.{sfx}', [hip, knee], r, shell, bone)
            self.ball(f'Knee.{sfx}', r * 1.2, knee, m['joint'], bone)
            self.tube(f'Shin.{sfx}', [knee, ankle], r, shell, bone)
        self.add(kit.torus(f'Ankle.{sfx}', r * 1.08, 0.0045, seg=(20, 6), location=tuple(Vector(ankle)),
                           rotation=tuple(along(hip if knee is None else knee, ankle))), m['joint'], bone)
        fr, fc = foot['radii'], foot['center']
        self.pod(f'Paw.{sfx}', fr, fc, paw, bone, e=0.45, e2=0.7, seg=(24, 12))
        self.pod(f'Pad.{sfx}', (fr[0] * 0.74, fr[1] * 0.78, 0.006), (fc[0], fc[1], 0.004), pad, bone, e=0.4, e2=0.6,
                 seg=(20, 6))
        for j in range(toes):
            t = (j - (toes - 1) / 2) * fr[0] * 0.6
            self.pod(f'Toe.{sfx}.{j}', (0.0075, 0.0055, 0.004), (fc[0] + t, fc[1] - fr[1] * 0.78, 0.007), pad, bone,
                     seg=(10, 6))

    def screen(self, name, radii, center, bezel, bone='head', e=0.4):
        glass, rim = kit.screen(name, radii, center, bezel, e=e, seg=(48, 28))
        self.add(glass, self.m['face'], bone)
        self.add(rim, self.m['bezel'], bone)

    def finish(self, rig_name, bones):
        return looks.finish(kit.armature(rig_name, bones), self.parts, self.skin, self.m)


def standard_bones(root_top=0.1, hips=(0, 0.1, 0.15), chest=(0, -0.12, 0.17), neck=(0, -0.08, 0.2),
                   head_top=(0, -0.09, 0.32)):
    """The Pet bones that every fluffy creature shares: root, body, head. Ears, tails and
    legs are added by the creature."""
    return [
        ('root', (0, 0, 0), (0, 0, root_top), None),
        ('body', hips, chest, 'root'),
        ('head', neck, head_top, 'body'),
    ]
