"""Shared building blocks for the robot crew: shapes, materials, rendering.

Everything is generated from code so a character can be rebuilt from scratch with one
command. Blender is Z-up and characters face -Y (Blender's "front" view); the glTF
exporter turns that into three.js's Y-up, facing +Z.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


# ---------- Scene ----------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    return scene


# Where new objects go when no collection is given. Live sessions point this at their
# own scene so a build never lands in whatever scene the user has open.
DEFAULT_COLLECTION = None


def link(obj, collection=None):
    (collection or DEFAULT_COLLECTION or bpy.context.scene.collection).objects.link(obj)
    return obj


# ---------- Geometry ----------


def spow(x, e):
    return math.copysign(abs(x) ** e, x)


def superellipsoid(
    name,
    radii=(1, 1, 1),
    e1=1.0,
    e2=1.0,
    seg=(48, 32),
    taper=0.0,
    location=(0, 0, 0),
    rotation=(0, 0, 0),
):
    """A closed superellipsoid: sphere at e1=e2=1, rounded box below 1, puck at e1≈0.3.

    e1 squares the north–south profile, e2 the around-the-waist profile. taper > 0
    narrows the top and widens the bottom (an egg).
    """
    rx, ry, rz = radii
    nu, nv = seg
    verts = [(0.0, 0.0, -rz)]
    for j in range(1, nv):
        phi = -math.pi / 2 + math.pi * j / nv
        cp, sp = spow(math.cos(phi), e1), spow(math.sin(phi), e1)
        z = rz * sp
        k = 1.0 - taper * (sp / 2)
        for i in range(nu):
            th = 2 * math.pi * i / nu
            verts.append((rx * cp * spow(math.cos(th), e2) * k, ry * cp * spow(math.sin(th), e2) * k, z))
    verts.append((0.0, 0.0, rz))

    top = len(verts) - 1
    faces = [(0, 1 + (i + 1) % nu, 1 + i) for i in range(nu)]
    for j in range(nv - 2):
        r0, r1 = 1 + j * nu, 1 + (j + 1) * nu
        for i in range(nu):
            faces.append((r0 + i, r0 + (i + 1) % nu, r1 + (i + 1) % nu, r1 + i))
    last = 1 + (nv - 2) * nu
    faces += [(last + i, last + (i + 1) % nu, top) for i in range(nu)]

    return mesh_object(name, verts, faces, location, rotation)


def torus(name, major, minor, seg=(48, 12), location=(0, 0, 0), rotation=(0, 0, 0)):
    """A ring in the XY plane."""
    nu, nv = seg
    verts, faces = [], []
    for i in range(nu):
        a = 2 * math.pi * i / nu
        for j in range(nv):
            b = 2 * math.pi * j / nv
            r = major + minor * math.cos(b)
            verts.append((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
    for i in range(nu):
        for j in range(nv):
            a, b = i * nv + j, ((i + 1) % nu) * nv + j
            c, d = ((i + 1) % nu) * nv + (j + 1) % nv, i * nv + (j + 1) % nv
            faces.append((a, b, c, d))
    return mesh_object(name, verts, faces, location, rotation)


def tube(name, points, radii, ring=16):
    """A smooth tube swept along a polyline, with domed ends.

    `radii` is one radius or one per point. Returns (object, t) where t[i] is how far
    along the path vertex i sits (0 at the start, 1 at the end), for blending bone
    weights along rubber-hose limbs.
    """
    pts = [Vector(p) for p in points]
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(pts)
    lengths = [0.0]
    for a, b in zip(pts, pts[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]

    # Parallel-transport frames so the rings don't twist.
    tangents = []
    for i in range(len(pts)):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tangents.append((b - a).normalized())
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    normal = tangents[0].cross(ref).normalized()

    verts, faces, ts = [], [], []
    for i, (p, t) in enumerate(zip(pts, tangents)):
        if i:
            normal = (normal - t * normal.dot(t)).normalized()
        binormal = t.cross(normal)
        for k in range(ring):
            a = 2 * math.pi * k / ring
            verts.append(tuple(p + (normal * math.cos(a) + binormal * math.sin(a)) * radii[i]))
            ts.append(lengths[i] / total)
    for i in range(len(pts) - 1):
        for k in range(ring):
            a, b = i * ring + k, i * ring + (k + 1) % ring
            faces.append((a, b, b + ring, a + ring))

    # Domed caps: one extra ring pulled in, then a pole.
    for end, sign in ((0, -1), (len(pts) - 1, 1)):
        p, t, r = pts[end], tangents[end] * sign, radii[end]
        base = end * ring
        mid = len(verts)
        for k in range(ring):
            v = Vector(verts[base + k])
            verts.append(tuple(p + (v - p) * 0.7 + t * r * 0.7))
            ts.append(float(end > 0))
        pole = len(verts)
        verts.append(tuple(p + t * r))
        ts.append(float(end > 0))
        for k in range(ring):
            a, b = base + k, base + (k + 1) % ring
            c, d = mid + (k + 1) % ring, mid + k
            faces.append((a, d, c, b) if sign < 0 else (a, b, c, d))
            faces.append((d, c, pole) if sign < 0 else (d, pole, c)[::-1])

    obj = mesh_object(name, verts, faces)
    return obj, ts


def resample(points, n):
    """n evenly spaced points along a polyline, so bent tubes have enough rings."""
    pts = [Vector(p) for p in points]
    lengths = [0.0]
    for a, b in zip(pts, pts[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    out, j = [], 0
    for i in range(n):
        d = lengths[-1] * i / (n - 1)
        while j < len(pts) - 2 and lengths[j + 1] < d:
            j += 1
        span = lengths[j + 1] - lengths[j]
        out.append(tuple(pts[j].lerp(pts[j + 1], (d - lengths[j]) / span if span else 0)))
    return out


def spline(points, n):
    """n evenly spaced points along a smooth Catmull-Rom curve through the points."""
    pts = [Vector(p) for p in points]
    pts = [pts[0] * 2 - pts[1], *pts, pts[-1] * 2 - pts[-2]]
    dense = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for k in range(16):
            t = k / 16
            dense.append(tuple(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                      + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)))
    dense.append(tuple(pts[-2]))
    return resample(dense, n)


def lathe(name, profile, seg=32, location=(0, 0, 0), rotation=(0, 0, 0)):
    """A surface of revolution around local Z from (radius, z) pairs, top to bottom.
    A radius of 0 closes that end with a single pole vertex."""
    verts, faces, rows = [], [], []
    for r, z in profile:
        if r == 0:
            rows.append([len(verts)])
            verts.append((0.0, 0.0, z))
        else:
            rows.append(list(range(len(verts), len(verts) + seg)))
            verts += [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)
                      for i in range(seg)]
    for top, bottom in zip(rows, rows[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(top) == 1:
                faces.append((top[0], bottom[i], bottom[j]))
            elif len(bottom) == 1:
                faces.append((top[i], bottom[0], top[j]))
            else:
                faces.append((top[i], bottom[i], bottom[j], top[j]))
    return mesh_object(name, verts, faces, location, rotation)


def mesh_object(name, verts, faces, location=(0, 0, 0), rotation=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    return link(obj)


def armature(name, bones, collection=None):
    """An armature from (name, head, tail, parent) tuples, parents listed first."""
    data = bpy.data.armatures.new(name)
    rig = link(bpy.data.objects.new(name, data), collection)
    scene = rig.users_scene[0]
    view_layer = scene.view_layers[0]
    view_layer.objects.active = rig
    override = dict(active_object=rig, object=rig, selected_objects=[rig])
    windows = bpy.context.window_manager.windows
    if windows:  # a live session: operators need a window to run in
        override.update(window=windows[0], screen=windows[0].screen, scene=scene, view_layer=view_layer)
    with bpy.context.temp_override(**override):
        bpy.ops.object.mode_set(mode='EDIT')
        for bone, head, tail, parent in bones:
            eb = data.edit_bones.new(bone)
            eb.head, eb.tail = head, tail
            if parent:
                eb.parent = data.edit_bones[parent]
        bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind(obj, rig, weights):
    """Skin a part to the rig. weights is a bone name (the part moves rigidly with that
    bone) or {bone: per-vertex weights} for parts that bend."""
    n = len(obj.data.vertices)
    if isinstance(weights, str):
        weights = {weights: [1.0] * n}
    for bone, ws in weights.items():
        group = obj.vertex_groups.new(name=bone)
        for i, w in enumerate(ws):
            if w > 0:
                group.add([i], w, 'REPLACE')
    obj.modifiers.new('Rig', 'ARMATURE').object = rig
    obj.parent = rig


def chain(ts, bones):
    """Weights that hand a tube over from bone to bone along a chain (a tail, a stem):
    ts are the tube's per-vertex positions along its length (0..1), bones the chain in
    order. Neighbouring bones blend with a smoothstep, so the tube bends smoothly."""
    n = len(bones)
    weights = {b: [0.0] * len(ts) for b in bones}
    for i, t in enumerate(ts):
        u = min(max(t * n - 0.5, 0.0), n - 1.0)
        k = min(int(u), n - 2) if n > 1 else 0
        f = u - k
        f = f * f * (3 - 2 * f)
        if n == 1:
            weights[bones[0]][i] = 1.0
        else:
            weights[bones[k]][i] = 1 - f
            weights[bones[k + 1]][i] = f
    return weights


def stretch(obj, sx=1.0, sy=1.0, sz=1.0):
    """Scale a part's mesh about its own origin (flatten an ear, widen a paw)."""
    obj.data.transform(Matrix.Diagonal((sx, sy, sz, 1.0)))
    obj.data.update()
    return obj


def cut(obj, normal, offset=0.0):
    """Slice a part flat and close it: keeps the side `normal` points to (in the part's
    own axes, the plane `offset` along it from the origin) and caps the cut with a flat
    face, its edge kept sharp."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    no = Vector(normal).normalized()
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7, plane_co=no * offset,
                           plane_no=no, clear_inner=True)
    rim = [e for e in bm.edges if e.is_boundary]
    for e in rim:
        e.smooth = False
    for f in bmesh.ops.holes_fill(bm, edges=rim, sides=len(rim))['faces']:
        f.smooth = False
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def screen(name, radii, center, bezel, e=0.3, seg=(64, 40), upside_down=False):
    """A face screen set into a head: the screen (with front UVs for the face) and a
    bezel that sits just behind it, showing only as a rim. Returns (screen, bezel).
    upside_down turns the face round, for a character built hanging head down."""
    vx, vy, vz = radii
    glass = superellipsoid(f'{name}Screen', radii, e, e, seg=seg, location=center)
    planar_uv(glass, flip_u=upside_down, flip_v=upside_down)
    rim = superellipsoid(f'{name}Bezel', (vx + bezel, vy, vz + bezel), e, e, seg=seg,
                         location=(center[0], center[1] + bezel, center[2]))
    return glass, rim


def planar_uv(obj, axes=(0, 2), flip_u=False, flip_v=False):
    """Project UVs flat from the front, normalised to the object's bounds."""
    mesh = obj.data
    uv = mesh.uv_layers.new(name='UVMap')
    co = np.array([v.co[:] for v in mesh.vertices])
    lo, hi = co.min(axis=0), co.max(axis=0)
    for loop in mesh.loops:
        p = co[loop.vertex_index]
        u = (p[axes[0]] - lo[axes[0]]) / (hi[axes[0]] - lo[axes[0]])
        v = (p[axes[1]] - lo[axes[1]]) / (hi[axes[1]] - lo[axes[1]])
        uv.data[loop.index].uv = (1 - u if flip_u else u, 1 - v if flip_v else v)


def box_uv(obj, grain=None, seed=0):
    """UVs in metres for a texture that tiles over the part, projected box-wise: each face
    along its dominant normal axis (its own axes, as placed). `grain` is the axis the
    texture's V runs along (0, 1, 2), the part's longest edge by default; a face the grain
    runs straight into takes it from the other axes. Each part starts at its own offset (from
    where it is, and `seed`), so a row of books or boards don't show the same patch."""
    mesh = obj.data
    uv = mesh.uv_layers.new(name='UVMap')
    m3 = obj.matrix_basis.to_3x3()
    co = np.array([(obj.matrix_basis @ v.co)[:] for v in mesh.vertices])
    lo = co.min(axis=0)
    if grain is None:
        grain = int(np.argmax(co.max(axis=0) - lo))
    loc = obj.matrix_basis.translation
    rng = np.random.default_rng(abs(hash((round(loc.x, 3), round(loc.y, 3), round(loc.z, 3), seed))) % (2**32))
    off = rng.random(2) * 4.0
    for poly in mesh.polygons:
        n = np.abs((m3 @ poly.normal)[:])
        a = int(np.argmax(n))
        rest = [i for i in range(3) if i != a]
        v_axis = grain if grain != a else max(rest, key=lambda i: (co[:, i].max() - lo[i]))
        u_axis = next(i for i in rest if i != v_axis)
        for li in poly.loop_indices:
            p = co[mesh.loops[li].vertex_index] - lo
            uv.data[li].uv = (p[u_axis] + off[0], p[v_axis] + off[1])


def apply_transforms(obj):
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix.Identity(4)


# ---------- Materials ----------


def srgb(hex_colour):
    """'#rrggbb' → linear RGBA, as Blender's colour sockets expect."""
    h = hex_colour.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def material(name, colour, roughness=0.5, metallic=0.0, coat=0.0, coat_roughness=0.05,
             emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat['kit'] = True  # lets live rebuilds find and remove stale copies
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = srgb(colour)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = coat_roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = srgb(emission)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat


def outline(obj, mat, thickness):
    """An ink line round a part, by the inverted-hull trick: a slightly larger copy of
    the surface, turned inside out, drawn with a material that culls its front faces.
    Only the rim shows. three.js does the same with a BackSide material."""
    obj.data.materials.append(mat)
    mod = obj.modifiers.new('Outline', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = 1.0
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.material_offset = len(obj.data.materials) - 1


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


# ---------- Images ----------


def image_from_array(name, rgba):
    """rgba: float array (h, w, 4), row 0 at the top."""
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name, w, h, alpha=True)
    img['kit'] = True
    img.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
    img.pack()
    return img


def load_rgba(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return np.flipud(px.reshape(h, w, 4))


def save_rgba(rgba, path):
    h, w, _ = rgba.shape
    img = bpy.data.images.new('out', w, h, alpha=True)
    img.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def downscale(rgba, factor):
    h, w, c = rgba.shape
    h2, w2 = h // factor, w // factor
    return rgba[: h2 * factor, : w2 * factor].reshape(h2, factor, w2, factor, c).mean(axis=(1, 3))


# ---------- Rendering ----------


def sweep(name, width=24.0, front=12.0, back=3.5, radius=1.6, height=12.0, segments=24):
    """A photo-studio sweep: a floor that curves up into a wall behind the subject.
    The camera looks along +Y from -Y."""
    corner = back - radius
    profile = [(-front, 0.0), (corner, 0.0)]
    for i in range(1, segments + 1):
        t = math.pi / 2 * i / segments
        profile.append((corner + radius * math.sin(t), radius - radius * math.cos(t)))
    profile.append((back, height))
    xs = (-width / 2, width / 2)
    verts = [(x, y, z) for y, z in profile for x in xs]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(profile) - 1)]
    return mesh_object(name, verts, faces)


def studio(scene, background='#f4f4f1', size=900):
    """Soft studio light on a paper-coloured floor, like the site."""
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    eevee = scene.eevee
    eevee.taa_render_samples = 64
    if hasattr(eevee, 'use_raytracing'):
        eevee.use_raytracing = True
    if hasattr(eevee, 'use_shadows'):
        eevee.use_shadows = True

    world = bpy.data.worlds.new('World')
    world['kit'] = True
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = srgb(background)
    bg.inputs['Strength'].default_value = 0.9
    scene.world = world

    # Floor and lights hang off one rig that turns with the camera, so every view is lit
    # like a product shot and the sweep hides the horizon.
    rig = link(bpy.data.objects.new('StudioRig', None))
    floor = sweep('Floor')
    assign(floor, material('Floor', background, roughness=0.9))
    floor.parent = rig

    def area(name, loc, energy, size, colour='#ffffff'):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy
        light.size = size
        light.color = srgb(colour)[:3]
        obj = bpy.data.objects.new(name, light)
        obj.location = loc
        direction = -Vector(loc) + Vector((0, 0, 0.5))
        obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        obj.parent = rig
        return link(obj)

    area('Key', (-1.6, -2.2, 2.6), 260, 1.6)
    area('Fill', (2.4, -1.4, 1.2), 90, 2.5, '#eef3ff')
    area('Rim', (0.6, 2.4, 2.2), 180, 1.2)
    return floor


def camera(scene, azimuth_deg, elevation_deg=8, distance=4.3, target=(0, 0, 0.53), lens=85):
    cam = bpy.data.cameras.new('Camera')
    cam.lens = lens
    obj = bpy.data.objects.new('Camera', cam)
    link(obj)
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    t = Vector(target)
    obj.location = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * distance
    obj.rotation_euler = (t - obj.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = obj
    rig = bpy.data.objects.get('StudioRig')
    if rig:
        rig.rotation_euler = (0, 0, az)
    return obj


def render_views(scene, views, out_dir, sheet_path, thumb_height=72, subject=0.59):
    """Render each (label, azimuth, elevation) view and tile them into one sheet,
    with a thumbnail at site scale in the corner."""
    tiles = []
    for label, az, el in views:
        cam = camera(scene, az, el)
        path = f'{out_dir}/{label}.png'
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        tiles.append(load_rgba(path))
        bpy.data.objects.remove(cam)
    sheet = np.concatenate(tiles, axis=1)
    # A site-scale thumbnail: the first view shrunk so the robot is ~thumb_height px tall.
    factor = max(1, round(tiles[0].shape[0] * subject / thumb_height))
    thumb = downscale(tiles[0], factor)
    th, tw, _ = thumb.shape
    sheet[8 : 8 + th, 8 : 8 + tw] = thumb
    save_rgba(sheet, sheet_path)
    return sheet_path
