"""The sea kit, for the swimmers built after the pufferfish (the jellyfish, seahorse,
narwhal, otter ... with swimmer.ts on the site side): helpers for the shapes they share.

  * pod(): a rounded blob (a superellipsoid) at a point.
  * bar(): a rounded capsule between two points, for limbs and tentacle segments.
  * fan(): a flat rounded fan out of a root along a direction (a fin, a fluke, a paddle).
  * flat_on(): a small round disc lying on a curved shell (a screw, a lamp).
  * spiral_ring(): a lit ring round an axis, for a tusk's spiral.
  * chain(): bone tuples for a chain (a tail, a tentacle) along a list of points, and the
    chain's name list, to hand to kit.armature and the site's `ripple()`.
  * chain_pods(): the pods of such a chain, one to a bone, each a rounded segment.

All of it faces -Y like the rest of the crew and is built in metres, Z up.
"""

import math

from mathutils import Matrix, Vector

import kit


def aim(a, b):
    """The rotation that turns a part's own Z along a -> b."""
    return Vector((0, 0, 1)).rotation_difference(Vector(b) - Vector(a)).to_euler()


def pod(name, center, radii, e=(0.7, 0.8), seg=(24, 14), rotation=(0, 0, 0), taper=0.0):
    return kit.superellipsoid(name, radii, e[0], e[1], seg=seg, location=center, rotation=rotation, taper=taper)


def bar(name, a, b, r, e=(0.6, 0.95), seg=(16, 10), squash=1.0, grow=1.0):
    """A rounded capsule from a to b, radius r (wider/narrower across X by `squash`)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    obj = kit.superellipsoid(name, (r * squash, r, d.length / 2 * grow), e[0], e[1], seg=seg,
                             location=(a + b) / 2, rotation=aim(a, b))
    return obj


def fan(name, root, direction, radii, thin, taper=1.0, seg=(28, 12)):
    """A fin: a flat rounded fan out of `root` along `direction`, narrow at the root and
    thin along `thin`. radii: (wide, thin, long)."""
    d = Vector(direction).normalized()
    n = Vector(thin)
    n = (n - d * n.dot(d)).normalized()
    z = -d  # the shape narrows toward its own +Z: turn that to the root
    x = n.cross(z)
    turn = Matrix((x, n, z)).transposed().to_euler()
    at = Vector(root) + d * radii[2] * 0.9
    return kit.superellipsoid(name, radii, 0.85, 0.5, seg=seg, taper=taper, location=at, rotation=turn)


def flat_on(name, q, n, radii, seg=16, e=0.6, rings=8):
    """A small round disc lying on a shell at q, facing along n."""
    z = Vector(n).normalized()
    x = z.cross(Vector((0, 0, 1)) if abs(z.z) < 0.9 else Vector((1, 0, 0))).normalized()
    y = z.cross(x)
    rot = Matrix((x, y, z)).transposed().to_euler()
    return kit.superellipsoid(name, radii, e, e, seg=(seg, rings), location=q, rotation=rot)


def ring_on(name, center, axis, major, minor, seg=(32, 8)):
    """A torus round `axis` at center."""
    return kit.torus(name, major, minor, seg=seg, location=center, rotation=aim((0, 0, 0), axis))


def chain(prefix, parent, points, first=1):
    """Bone tuples (name, head, tail, parent) for a chain along `points` (n points make
    n-1 bones named prefix.first, prefix.first+1 ...), each parented to the one before and
    the first to `parent`; and the names, in order."""
    bones, names = [], []
    for i in range(len(points) - 1):
        name = f'{prefix}.{first + i}'
        bones.append((name, tuple(points[i]), tuple(points[i + 1]), names[-1] if names else parent))
        names.append(name)
    return bones, names


def chain_pods(prefix, points, radii, add, mat, bone=None, first=1, e=(0.7, 0.85), seg=(18, 10), squash=1.0,
               overlap=0.1):
    """One rounded segment per bone along `points`: radii[i] is the radius of segment i.
    add(obj, material, bone) skins it. Segments run a little past their joints so the
    chain stays whole when it bends."""
    out = []
    for i in range(len(points) - 1):
        a, b = Vector(points[i]), Vector(points[i + 1])
        a2, b2 = a - (b - a) * overlap, b + (b - a) * overlap
        seg_obj = bar(f'{prefix}{first + i}', a2, b2, radii[i], e=e, seg=seg, squash=squash)
        out.append(add(seg_obj, mat, f'{bone}.{first + i}'))
    return out


def curl(origin, start_angle, lengths, bend, plane='yz'):
    """Points of a curling chain: from origin, heading `start_angle` degrees (0 straight
    down, + toward -Y/front... in the chosen plane), each segment turning `bend` degrees
    (a list or one number) more than the one before. Returns len(lengths)+1 points."""
    pts = [Vector(origin)]
    ang = math.radians(start_angle)
    for i, L in enumerate(lengths):
        b = bend[i] if isinstance(bend, (list, tuple)) else bend
        ang += math.radians(b)
        if plane == 'yz':
            d = Vector((0, math.sin(ang), -math.cos(ang)))
        else:
            d = Vector((math.sin(ang), 0, -math.cos(ang)))
        pts.append(pts[-1] + d * L)
    return pts
