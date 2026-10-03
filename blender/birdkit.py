"""Shared bits for the newer birds (hummingbird, flamingo, toucan, robin, hen): studs, a
rounded segment laid between two joints, a leaf-shaped plate, and a bird's foot."""

import math

from mathutils import Vector

import kit


def studs(name, points, r):
    """Many small low-poly rivet heads in one mesh."""
    nu, nv = 8, 4
    verts, faces = [], []
    for p in points:
        o = len(verts)
        verts.append((p[0], p[1], p[2] - r))
        for j in range(1, nv):
            phi = -math.pi / 2 + math.pi * j / nv
            for i in range(nu):
                th = 2 * math.pi * i / nu
                verts.append((p[0] + r * math.cos(phi) * math.cos(th), p[1] + r * math.cos(phi) * math.sin(th),
                              p[2] + r * math.sin(phi)))
        verts.append((p[0], p[1], p[2] + r))
        top = len(verts) - 1
        faces += [(o, o + 1 + (i + 1) % nu, o + 1 + i) for i in range(nu)]
        for j in range(nv - 2):
            r0, r1 = o + 1 + j * nu, o + 1 + (j + 1) * nu
            for i in range(nu):
                faces.append((r0 + i, r0 + (i + 1) % nu, r1 + (i + 1) % nu, r1 + i))
        last = o + 1 + (nv - 2) * nu
        faces += [(last + i, last + (i + 1) % nu, top) for i in range(nu)]
    return kit.mesh_object(name, verts, faces)


def along(a, b):
    """Euler rotation turning local +Z to point from a to b."""
    d = (Vector(b) - Vector(a)).normalized()
    return Vector((0, 0, 1)).rotation_difference(d).to_euler()


def segment(name, a, b, rx, ry=None, e=(0.6, 0.8), seg=(24, 14), over=1.0, taper=0.0):
    """A rounded box laid between two points: radii rx x ry across, and the whole length
    between a and b (times `over`) along."""
    ry = rx if ry is None else ry
    length = (Vector(b) - Vector(a)).length
    mid = (Vector(a) + Vector(b)) / 2
    return kit.superellipsoid(name, (rx, ry, length / 2 * over), e[0], e[1], seg=seg, taper=taper,
                              location=tuple(mid), rotation=along(a, b))


def blade(name, a, b, width, thick, e=(0.7, 0.9), seg=(20, 10), taper=0.0):
    """A flat leaf-shaped plate from a to b: `width` across (local X), `thick` thin."""
    length = (Vector(b) - Vector(a)).length
    mid = (Vector(a) + Vector(b)) / 2
    return kit.superellipsoid(name, (width / 2, thick / 2, length / 2), e[0], e[1], seg=seg, taper=taper,
                              location=tuple(mid), rotation=along(a, b))


def ball(name, at, r, seg=(16, 10)):
    return kit.superellipsoid(name, (r, r, r), seg=seg, location=at)
