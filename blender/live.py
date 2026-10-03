"""Build the crew inside a running Blender (through the MCP connector) so model changes
can be watched live. Everything goes into its own "Bolt" scene; other scenes are
untouched. Only the model is previewed here: the site animates the joints itself.

    import sys; sys.path.insert(0, '<repo>/art/robot'); import live; live.rebuild(('bolt', 'cat'))
"""

import importlib
import math

import bpy
import numpy as np
from mathutils import Euler

import crew
import faces
import kit
import looks

SCENE = 'Bolt'
LOOP = 192  # preview length in frames (8 s)
# Preview-only face timeline: (first frame, expression). On the site face.ts decides.
FACE_TIMELINE = ((1, 'neutral'), (20, 'blink'), (23, 'neutral'), (44, 'happy'), (68, 'surprised'),
                 (88, 'love'), (112, 'wink'), (132, 'sleepy'), (156, 'dizzy'), (180, 'blink'), (183, 'neutral'))
_faces = {}  # (layout, expression) -> flat pixel array, ready for Image.pixels
_shown = {}
_glow = {'hex': '#f4f4f1'}
# Preview-only beacon cycle; on the site the page sets the colour.
BEACON = ('#f4f4f1', '#5ec8ff', '#ff5fa2', '#ffb347', '#6fdc8c', '#f4f4f1')


def _clear_scene():
    scene = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    objects = list(scene.collection.objects)
    data = {obj.data for obj in objects if obj.data is not None}
    bpy.data.batch_remove(objects)
    bpy.data.batch_remove([d for d in data if d.users == 0])
    # Materials first: removing them frees the images they use. Only kit-made
    # datablocks are touched.
    for blocks in (bpy.data.materials, bpy.data.images, bpy.data.worlds):
        for block in list(blocks):
            if block.users == 0 and block.get('kit'):
                blocks.remove(block)
    for act in list(bpy.data.actions):
        if act.get('kit'):
            bpy.data.actions.remove(act)
    return scene


def _fcurves(act):
    if hasattr(act, 'layers'):  # Blender 4.4+ slotted actions
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves
    else:
        yield from act.fcurves


def _cycle_beacon(parts):
    for mat in {slot.material for obj in parts for slot in obj.material_slots}:
        if mat and mat.name.startswith('Beacon'):
            bsdf = mat.node_tree.nodes['Principled BSDF']
            for i, hex_colour in enumerate(BEACON):
                frame = 1 + i * LOOP // (len(BEACON) - 1)
                for socket in ('Base Color', 'Emission Color'):
                    bsdf.inputs[socket].default_value = kit.srgb(hex_colour)
                    bsdf.inputs[socket].keyframe_insert('default_value', frame=frame)


def _show(scene, reset_view, azimuth_deg=-32, elevation_deg=6, distance=2.6):
    window = bpy.context.window_manager.windows[0]
    window.scene = scene
    for area in window.screen.areas:
        if area.type != 'VIEW_3D':
            continue
        space = area.spaces.active
        space.shading.type = 'RENDERED'
        space.overlay.show_extras = False  # hide the studio lights' gizmos
        space.overlay.show_relationship_lines = False
        space.overlay.show_bones = False
        if not reset_view:
            continue
        r3d = space.region_3d
        r3d.view_perspective = 'PERSP'
        r3d.view_location = (0, 0, 0.5)
        r3d.view_distance = distance
        r3d.view_rotation = Euler(
            (math.radians(90 - elevation_deg), 0, math.radians(azimuth_deg))
        ).to_quaternion()


def _pixels(layout, expression):
    key = (layout, expression)
    if key not in _faces:
        _faces[key] = np.flipud(faces.face_pixels(expression, _glow['hex'], layout)).ravel()
    return _faces[key]


def _screens():
    return [img for img in bpy.data.images if img.get('kit') and img.name.startswith('Eyes')]


def _face_handler(scene, _depsgraph=None):
    if scene.name != SCENE or _shown.get('fixed'):
        return
    name = [n for f, n in FACE_TIMELINE if f <= scene.frame_current][-1]
    if _shown.get('face') == name:
        return
    _shown['face'] = name
    for img in _screens():
        img.pixels.foreach_set(_pixels(img.get('layout', 'bolt'), name))
        img.update()


def _cycle_faces(glow_hex):
    _faces.clear()
    _shown.clear()
    _glow['hex'] = glow_hex
    handlers = bpy.app.handlers.frame_change_post
    for h in list(handlers):  # drop the copy from before the last reload
        if getattr(h, '__name__', '') == '_face_handler':
            handlers.remove(h)
    handlers.append(_face_handler)


def face(name):
    """Show one expression on every screen and hold it (rebuild restarts the timeline)."""
    _shown['fixed'] = True
    for img in _screens():
        img.pixels.foreach_set(_pixels(img.get('layout', 'bolt'), name))
        img.update()


def rebuild(names=('bolt',), looks_=('ink',), gap=0.25, reset_view=False, play=True, **view):
    """Rebuild the named characters, each in every look, side by side along X, and play
    the face and beacon loop. A look is a name from looks.LOOKS or a (look, flame) pair.
    Keeps the user's viewport angle unless the scene is new or reset_view is set."""
    crew.reload_all()
    reset_view = reset_view or SCENE not in bpy.data.scenes
    scene = _clear_scene()
    window = bpy.context.window_manager.windows[0]
    window.scene = scene
    scene.frame_start, scene.frame_end, scene.frame_current = 1, LOOP, 1
    scene.render.fps = 24
    kit.DEFAULT_COLLECTION = scene.collection
    count = 0
    try:
        variants = [(v, None) if isinstance(v, str) else v for v in looks_]
        line = [(n, look, flame) for n in names for look, flame in variants]
        widths = [crew.module(n).PREVIEW['width'] for n, _, _ in line]
        total = sum(widths) + gap * (len(line) - 1)
        x = -total / 2
        for (name, look, flame), width in zip(line, widths):
            rig, parts = crew.module(name).build(look, flame)
            rig.location = (x + width / 2, 0, crew.module(name).PREVIEW['lift'])
            x += width + gap
            _cycle_beacon(parts)
            count += len(parts)
        _cycle_faces(looks.LOOKS[variants[0][0]]['glow'])
        kit.studio(scene)  # paper backdrop and soft lights, as in the review renders
        scene.eevee.use_raytracing = False  # keep live playback smooth
        scene.eevee.taa_samples = 8
        scene.eevee.shadow_ray_count = 4  # soft shadows are grainy at one ray while playing
        scene.eevee.shadow_step_count = 12
    finally:
        kit.DEFAULT_COLLECTION = None
    _show(scene, reset_view, **view)
    if play:
        with bpy.context.temp_override(window=window, screen=window.screen):
            if not bpy.context.screen.is_animation_playing:
                bpy.ops.screen.animation_play()
    return count


def snap(path):
    """Save the 3D viewport at full resolution (the MCP screenshot tools are capped)."""
    window = bpy.context.window_manager.windows[0]
    area = next(a for a in window.screen.areas if a.type == 'VIEW_3D')
    region = next(r for r in area.regions if r.type == 'WINDOW')
    with bpy.context.temp_override(window=window, screen=window.screen, area=area, region=region):
        bpy.ops.screen.screenshot_area(filepath=path)
    return path
