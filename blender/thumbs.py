"""Render the crew's portraits for the Creatures page (the playground): each one at three
quarters, framed to fit, on a clear background, in each look.

    Blender -b --factory-startup -P blender/thumbs.py -- OUT_DIR [NAME ...]

Writes OUT_DIR/NAME-LOOK.webp (ink, paper, colour) for the names given, or the whole crew
but the cookie fish.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import crew  # noqa: E402
import kit  # noqa: E402

LOOKS = ('ink', 'paper', 'colour')
SIZE = 320
LENS = 85
# Who isn't on show: the fish only comes for the cookie question.
HIDDEN = ('tang',)
# The toys the crew keep on bones of their own, put away on the site till a trick needs
# them (each creature's TS stretches these to nothing): left out of the portraits.
# The toucan's berry and the robin's song notes go the same way.
TOYS = ('ball', 'cup', 'carrot', 'spot', 'yarn', 'wand', 'balloon', 'toy', 'ball_toy', 'bone', 'cushion')
TOYS += ('berry',)
TOY_SETS = ('ball.', 'pebble.', 'pile.', 'note.')
TOY_SETS += ('spray.', 'cymbal.')
TOY_SETS += ('puff.',)  # the chinchilla's dust
# Not toys, but they come out only for a trick: the drone's beam, flash and parcel, the
# crawler's stone, the Saint Bernard's drool, the rings of the Bengal's puddle, the hen's
# egg.
EXTRAS = ('beam', 'flash', 'pkg', 'stone', 'drop', 'ripple', 'egg')
EXTRAS += ('star', 'spit')  # the unicorn's star, the alpaca's spit
EXTRAS += ('tongue',)
EXTRAS += ('hay',)  # the guinea pig's hay
EXTRAS += ('photo',)  # the camera's printed photo
# The caterpillar's cocoon and tiny wings, for his joke.
EXTRAS += ('cocoon', 'tinywing.L', 'tinywing.R')

EXTRAS += ('stream', 'cup2')  # the teapot's tea and the guest's cup
TOY_SETS += ('lidsteam', 'cupsteam', 'tear.')  # the teapot's steam puffs, the toddler's tears
# The narwhal's spout of light waits in its blowhole.
TOY_SETS += ('spout.',)
# The chameleons' tongue (seven sleeves and a pad, tg.1-7 and tg.tip) and the fly they catch.
EXTRAS += ('fly',)
TOY_SETS += ('tg.', 'flywing.')
# The crab's sand heap, for when it digs in.
EXTRAS += ('mound',)
# The otter's clam, and its kelp strand and lid.
EXTRAS += ('shell',)
TOY_SETS += ('shell.', 'kelp.')
EXTRAS += ('puddle',)  # the raccoon's puddle of light
# Bugs II: the moth's orb, the dragonfly's reed, the ant's crumb, the grasshopper's folded wings.
EXTRAS += ('bulb', 'reed', 'crumb', 'under.L', 'under.R')  # the moth's orb, the dragonfly's reed, the ant's crumb, the grasshopper's wings

# The fluffy wave III: the capybara pool, reed, bird and steam, the wombat burrow and flying
# dirt, the fennec dune and sand, the quokka leaf.
EXTRAS += ('pool', 'reed', 'bird', 'burrow', 'dune', 'leaf')
TOY_SETS += ('steam.', 'bwing.', 'dirt.', 'sand.')
# Sea III: the mantis shrimp's burst of light, the clownfish's anemone, the dolphin's click rings, the hermit crab's other houses.
EXTRAS += ('burst', 'anemone')
TOY_SETS += ('click.', 'anemone.', 'tryon.')
# The job robots' props: Dibble's seedling, flower, hole, soil and drops.
EXTRAS += ('sprout', 'flower', 'hole', 'soil')
TOY_SETS += ('rain.',)
# Orbit's flag and moon dust, Dab's easel and picture, Caper's balls.
EXTRAS += ('flag', 'easel', 'smudge')
TOY_SETS += ('dust.', 'art.', 'jball.')


# The lists above are for everyone, so a prop can share its bone's name with somebody's own
# body: these keep theirs (the snail's, the tortoise's and the puffer's shells, the plant's
# and the cactus's flowers, the clock's cuckoo, the tortoise's leaf as he was first drawn).
KEEP = {
    'snail': ('shell',),
    'tortoise': ('shell', 'leaf'),
    'puffer': ('shell',),
    'plant': ('flower',),
    'cactus': ('flower',),
    'clock': ('bird',),
}


def is_toy(group, name=''):
    if group in KEEP.get(name, ()):
        return False
    return group in TOYS or group in EXTRAS or group.startswith(TOY_SETS)


def drop_toys(name=''):
    """Take out every vertex that goes with a toy's bone."""
    import bmesh
    import bpy

    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        toys = {g.index for g in obj.vertex_groups if is_toy(g.name, name)}
        if not toys:
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        deform = bm.verts.layers.deform.active
        if deform is not None:
            doomed = [v for v in bm.verts if any(v[deform].get(i, 0) > 0.5 for i in toys)]
            bmesh.ops.delete(bm, geom=doomed, context='VERTS')
            bm.to_mesh(obj.data)
        bm.free()


def bounds():
    import bpy
    from mathutils import Vector

    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or obj.hide_render or obj.name.startswith('Floor'):
            continue
        ev = obj.evaluated_get(depsgraph)
        for v in ev.to_mesh().vertices:
            p = ev.matrix_world @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
        ev.to_mesh_clear()
    return lo, hi


def pose_bones(rig, pose):
    """Turn bones the way the site's puppet.turn does (degrees: pitch about X, yaw about the
    up axis, roll about the front-back axis, in that order's composition yaw . pitch . roll),
    given in the site's character axes (X right, Y up, Z toward the viewer), which are
    Blender's X, Z and -Y."""
    import bpy
    from mathutils import Quaternion, Vector

    for bone, (pitch, yaw, roll, *shift) in pose.items():
        pb = rig.pose.bones[bone]
        q = (
            Quaternion((0, 0, 1), math.radians(yaw))
            @ Quaternion((1, 0, 0), math.radians(pitch))
            @ Quaternion((0, -1, 0), math.radians(roll))
        )
        rest = pb.bone.matrix_local.to_quaternion()
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = rest.inverted() @ q @ rest
        if shift:  # and optionally moved: (x, y, z) in the character's own axes, as puppet.shift does
            pb.location = rest.inverted() @ Vector((shift[0], -shift[2], shift[1]))
    bpy.context.view_layer.update()


def portrait(name, look, out):
    import bpy

    scene = kit.reset_scene()
    module = crew.module(name)
    rig, _ = module.build(look)
    preview = module.PREVIEW
    rig.location.z = preview['lift']
    if preview.get('hangs'):  # built head down, to hang from the top edge: turn it over
        rig.rotation_euler.y = math.pi
    if preview.get('turn'):  # a long one, turned (degrees about the up axis) so its length shows
        rig.rotation_euler.z = math.radians(preview['turn'])
    if preview.get('tip'):  # tipped toward the viewer (degrees about the side axis), so flat wings show from above
        rig.rotation_euler.x = math.radians(preview['tip'])
    if preview.get('pose'):  # {bone: (pitch, yaw, roll[, x, y, z])} in the site's character axes: a still pose, e.g. folded wings
        pose_bones(rig, preview['pose'])
    drop_toys(name)
    if hasattr(module, 'pose_for_portrait'):  # one long and thin gets a curled pose
        module.pose_for_portrait(rig)
    drop_toys()
    kit.studio(scene, size=SIZE)
    scene.render.film_transparent = True
    for obj in scene.objects:
        if obj.name.startswith('Floor'):
            obj.hide_render = True
    lo, hi = bounds()
    centre = (lo + hi) / 2
    # Far enough back that the whole of it fits, turned to three quarters, a little above.
    radius = (hi - lo).length / 2
    fov = 2 * math.atan(36 / 2 / LENS)
    distance = radius / math.sin(fov / 2) * 1.02
    kit.camera(scene, -30, 10, distance=distance, target=tuple(centre), lens=LENS)
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 82
    path = f'{out}/{name}-{look}.webp'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('THUMB', path)


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :]
    out = os.path.abspath(argv[0])
    names = argv[1:] or [n for n in crew.NAMES if n not in HIDDEN]
    os.makedirs(out, exist_ok=True)
    for name in names:
        for look in LOOKS:
            portrait(name, look, out)


if __name__ == '__main__':
    main()
