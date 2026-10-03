"""Render a review sheet of a crew member: three-quarter, front, side and back views,
with a thumbnail at site size in the corner.

    Blender -b --factory-startup -P blender/sheet.py -- NAME OUT_DIR [look] [target_z] [distance]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import crew  # noqa: E402
import kit  # noqa: E402

VIEWS = [('three-quarter', -32, 8), ('front', 0, 4), ('side', -90, 4), ('back-three-quarter', 150, 12)]


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :]
    name, out = argv[0], os.path.abspath(argv[1])
    look = argv[2] if len(argv) > 2 else 'ink'
    target_z = float(argv[3]) if len(argv) > 3 else 0.53
    distance = float(argv[4]) if len(argv) > 4 else 4.3
    scene = kit.reset_scene()
    rig, _ = crew.module(name).build(look)
    preview = crew.module(name).PREVIEW
    rig.location.z = preview['lift']
    if preview.get('hangs'):  # built head down, to hang from the top edge: turn it over
        rig.rotation_euler.y = 3.14159265
    os.makedirs(out, exist_ok=True)
    kit.studio(scene, size=700)

    def camera(scene, az, el):
        return kit.camera(scene, az, el, distance=distance, target=(0, 0, target_z))

    tiles = []
    import bpy
    import numpy as np
    for label, az, el in VIEWS:
        cam = camera(scene, az, el)
        path = f'{out}/{name}-{look}-{label}.png'
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        tiles.append(kit.load_rgba(path))
        bpy.data.objects.remove(cam)
    sheet = np.concatenate(tiles, axis=1)
    kit.save_rgba(sheet, f'{out}/{name}-{look}.png')
    print('SHEET', f'{out}/{name}-{look}.png')


if __name__ == '__main__':
    main()
