"""Small helpers shared by the toy robots (tin, tot, teapot, lanky, skater): a parts
collector that names materials by part and skins each part to a bone, plus rings of
rivets, toothed gears and a rubber-hose limb. Each creature's module still has its own
table of proportions and its own rig; this only saves the same ten lines being typed
five times.
"""

import math

import kit
import looks


class Parts:
    """parts.add(obj, material, bone) as in the other builders; parts.m is the materials."""

    def __init__(self, look, flame, face):
        self.m = looks.materials(look, flame, face=face)
        self.parts, self.skin = [], []

    def add(self, obj, mat, bone):
        kit.assign(obj, mat)
        self.parts.append(obj)
        self.skin.append((obj, bone))
        return obj

    def bolt(self, name, loc, bone, r=0.006, mat=None, rot=(0, 0, 0)):
        """A little round-headed bolt (a flattened ball) at loc."""
        return self.add(kit.superellipsoid(name, (r, r, r * 0.6), seg=(10, 6), location=loc, rotation=rot),
                        mat or self.m['joint'], bone)

    def ring_of_bolts(self, name, radius, z, n, bone, r=0.006, start=0.0, mat=None):
        """n rivets round a can of the given radius at height z, each sitting on its surface."""
        for i in range(n):
            a = start + 2 * math.pi * i / n
            self.add(kit.superellipsoid(f'{name}.{i}', (r * 0.6, r * 0.6, r), 0.8, 0.8, seg=(10, 6),
                                        location=(radius * math.cos(a), radius * math.sin(a), z),
                                        rotation=(0, 0, a)), mat or self.m['joint'], bone)

    def hose(self, name, points, radius, bones, mat, ring=12, n=14):
        """A tube along points that bends between the bones (a rubber-hose limb)."""
        tube, ts = kit.tube(name, kit.resample(points, n), radius, ring=ring)
        return self.add(tube, mat, kit.chain(ts, bones))

    def finish(self, rig):
        return looks.finish(rig, self.parts, self.skin, self.m)


def gear(p, name, centre, radius, teeth, bone, mat, tooth_mat=None, thick=0.008):
    """A toothed gear standing on the front of a body (its face toward -Y): a disc, teeth
    round its rim, a hub and three holes; all skinned to `bone`, which turns about its centre."""
    cx, cy, cz = centre
    p.add(kit.superellipsoid(f'{name}Disc', (radius * 0.9, radius * 0.9, thick), 0.35, 1.0, seg=(24, 8),
                             location=centre, rotation=(math.pi / 2, 0, 0)), mat, bone)
    for i in range(teeth):
        a = 2 * math.pi * i / teeth
        p.add(kit.superellipsoid(f'{name}Tooth.{i}', (radius * 0.17, thick * 0.9, radius * 0.2), 0.45, 0.5,
                                 seg=(10, 6),
                                 location=(cx + radius * 0.96 * math.cos(a), cy, cz + radius * 0.96 * math.sin(a)),
                                 rotation=(0, -a, 0)), tooth_mat or mat, bone)
    p.add(kit.superellipsoid(f'{name}Hub', (radius * 0.28, radius * 0.28, thick * 0.9), 0.8, 0.8, seg=(14, 8),
                             location=(cx, cy - thick * 0.8, cz), rotation=(math.pi / 2, 0, 0)), p.m['bezel'], bone)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        p.add(kit.superellipsoid(f'{name}Hole.{k}', (radius * 0.14, radius * 0.14, thick * 0.6), 0.9, 0.9,
                                 seg=(10, 6),
                                 location=(cx + radius * 0.55 * math.cos(a), cy - thick * 0.7,
                                           cz + radius * 0.55 * math.sin(a)),
                                 rotation=(math.pi / 2, 0, 0)), p.m['bezel'], bone)


def mirror_x(q):
    return (-q[0], *q[1:])
