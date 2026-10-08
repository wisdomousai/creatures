"""Export a character for the site: its mesh and skeleton, and nothing else. The site
animates every bone live, so there are no clips, and it builds its own materials, so
materials only travel as names (Shell, Joint, Glow, ...) that tell it which part is which.

    Blender -b --factory-startup -P blender/export.py -- bolt OUT.glb

blender/build.sh runs this for every character and compresses the result into
models/.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import crew  # noqa: E402
import kit  # noqa: E402

# Each is exported in the ink look with its own Flame material, so the site can colour
# the flames either way; the site draws the paper look's outline itself.
CHARACTERS = crew.NAMES + tuple(f'decor-{d}' for d in crew.DECOR) + tuple(f'prop-{p}' for p in crew.PROPS) + tuple(f'set-{p}' for p in crew.SET) + ('monitor', 'phone') + tuple(f'tool-{p}' for p in crew.TOOLS)


def join(rig, parts):
    """One skinned mesh: the exporter splits it into one primitive per material."""
    target = parts[0]
    with bpy.context.temp_override(active_object=target, object=target, selected_objects=parts,
                                   selected_editable_objects=parts):
        bpy.ops.object.join()
    target.name = target.data.name = rig.name.replace('Rig', 'Body')
    return target


def strip_textures(obj):
    """The face screen is drawn by the site, so no image goes into the file."""
    for mat in obj.data.materials:
        for node in list(mat.node_tree.nodes):
            if node.type == 'TEX_IMAGE':
                mat.node_tree.nodes.remove(node)


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :]
    if argv[0] == '--list':
        print('CHARACTERS', ' '.join(CHARACTERS))
        return
    name, out = argv[0], os.path.abspath(argv[1])
    kit.reset_scene()
    rig, parts = crew.module(name).build('ink', 'glow')
    body = join(rig, parts)
    strip_textures(body)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_animations=False,
        export_skins=True,
        export_apply=False,  # keep the Armature modifier live: the mesh stays skinned
        export_yup=True,
        export_texcoords=True,  # the face screen's UVs
        export_normals=True,
        export_tangents=False,
        export_extras=False,
    )
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print('EXPORTED', out, 'bones', len(rig.data.bones), 'verts', len(body.data.vertices), 'tris', tris,
          'materials', [m.name for m in body.data.materials])


if __name__ == '__main__':
    main()
