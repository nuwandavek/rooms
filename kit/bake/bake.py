# Blender side of `kit/home bake` (see kit/bake.mjs). Run headless:
#   Blender -b --python kit/bake/bake.py -- <scene.glb> <out dir> <config.json>
# Imports the interior exported by the viewer and lights it with a sun and sky through its
# windows plus the lamps. Only the architecture (meshes tagged `bake`: shell, built-ins,
# ceiling) gets a lightmap, so walls and floors get the whole atlas; furniture stays in the
# scene to cast shadows and bounce light, and the viewer draws it live as in 3D Tour.
# Bakes Cycles' diffuse light (direct + bounced, without surface colour), denoises it, and
# writes scene.glb (lightmap UVs as TEXCOORD_1), day/night HDR lightmaps and bake.json.
import bpy, bmesh, sys, json, math, os, time
import numpy as np
from mathutils import Vector
sys.path.insert(0, os.path.dirname(__file__))
from lightmap import chart_regions, filter_lightmap

src, out, config_path = sys.argv[sys.argv.index('--') + 1:]
cfg = json.load(open(config_path))
os.makedirs(out, exist_ok=True)
started = time.time()
def log(message): print(f'[bake {time.time() - started:6.1f}s] {message}', flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
view_layer = bpy.context.view_layer

def select(objects, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    view_layer.objects.active = active or objects[0]

# Flatten the hierarchy into world-space meshes that share no data.
meshes = [o for o in scene.objects if o.type == 'MESH']
for o in meshes:
    if o.data.users > 1: o.data = o.data.copy()
select(meshes)
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in scene.objects if o.type != 'MESH']: bpy.data.objects.remove(o)

# Unite the closed wall boxes before baking: internal end caps and overlapping
# corners must not receive light or occupy the atlas.
wall_parts=[o for o in meshes if o.get('bakeWall')]
log(f'wall operands: {len(wall_parts)}')
for o in wall_parts:
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-5);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
if wall_parts:
    operand=bpy.data.collections.new('Wall operands');scene.collection.children.link(operand)
    for o in wall_parts[1:]:operand.objects.link(o)
    walls=wall_parts[0];select([walls]);mod=walls.modifiers.new('Union walls','BOOLEAN');mod.operation='UNION';mod.operand_type='COLLECTION';mod.collection=operand;mod.solver='EXACT';mod.use_self=True;mod.material_mode='TRANSFER'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for o in wall_parts[1:]:bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.collections.remove(operand)
    log(f'united walls: {len(walls.data.polygons)} faces')
    for ceiling in [o for o in scene.objects if o.type=='MESH' and o.name.startswith('Ceiling')]:
        select([ceiling]);solid=ceiling.modifiers.new('Ceiling thickness','SOLIDIFY');solid.thickness=.02;solid.offset=1
        bpy.ops.object.modifier_apply(modifier=solid.name)
        mod=ceiling.modifiers.new('Clip ceiling to rooms','BOOLEAN');mod.operation='DIFFERENCE';mod.object=walls;mod.solver='EXACT'
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bm=bmesh.new();bm.from_mesh(ceiling.data);bm.normal_update();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.normal.z>-.9],context='FACES');bm.to_mesh(ceiling.data);bm.free()
        # The later import correction expects an upward-facing source ceiling.
        ceiling.data.flip_normals()
        log(f'clipped ceiling: {len(ceiling.data.polygons)} faces')
    meshes=[o for o in scene.objects if o.type=='MESH']

def principled(material):
    if not material or not material.node_tree: return None
    return next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
def value(bsdf, name):
    socket = bsdf.inputs.get(name)
    return None if socket is None or socket.is_linked else socket.default_value
def is_glass(material):
    bsdf = principled(material)
    alpha = bsdf and value(bsdf, 'Alpha')
    return alpha is not None and alpha < .6
def is_metal(material):
    bsdf = principled(material)
    metallic = bsdf and value(bsdf, 'Metallic')
    return metallic is not None and metallic > .5
for material in bpy.data.materials:
    bsdf = principled(material)
    # The viewer's emissive tints (the ceiling, lamp shades) must not glow in the bake.
    if bsdf and 'Emission Strength' in bsdf.inputs: bsdf.inputs['Emission Strength'].default_value = 0

def all_slots(o, test): return bool(o.material_slots) and all(test(s.material) for s in o.material_slots)
glass = [o for o in meshes if all_slots(o, is_glass)]
architecture = [o for o in meshes if o.get('bake') and o not in glass]
metal = [o for o in architecture if all_slots(o, is_metal)]  # Door hardware: reflections, not diffuse light.
surfaces = [o for o in architecture if o not in metal]
furniture = [o for o in meshes if not o.get('bake') and o not in glass]
for o in surfaces:
    if o.name.startswith('Ceiling'): o.data.flip_normals()  # Drawn from below in the viewer.
# Glass would cast caustics; the bake lets light through the openings instead.
for o in glass: o.hide_render = True
log(f'{len(surfaces)} surfaces to bake, {len(metal)} metal, {len(glass)} glass, {len(furniture)} furniture meshes')

# One mesh to bake (Cycles bakes object by object over the whole image), materials kept,
# one texture UV set plus the lightmap set.
fallback = bpy.data.materials.new('Plain'); fallback.use_nodes = True
for o in surfaces:
    if not o.material_slots: o.data.materials.append(fallback)
    uvs = o.data.uv_layers
    while len(uvs) > 1: uvs.remove(uvs[-1])
    if not uvs: uvs.new(name='UVMap')
    uvs[0].name = 'UVMap'
select(surfaces)
bpy.ops.object.join()
room = view_layer.objects.active; room.name = 'Architecture'
# glTF splits vertices at material/UV seams. Reconnect coincident architecture
# vertices so adjacent coplanar wall pieces share a lightmap chart. Texture UVs
# remain per-corner, preserving the original finishes.
bm = bmesh.new(); bm.from_mesh(room.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
bm.to_mesh(room.data); bm.free(); room.data.update()
uvs = room.data.uv_layers
uvs[0].active_render = True
uvs.active = uvs.new(name='Lightmap')

# Lightmap UVs. Hidden faces (wall tops, the slab's underside) get islands too; Smart UV
# Project packs everything into 0–1 itself. FRACTION gives a real atlas-space
# gutter, large enough for both charts' padding. The default SCALED margin can
# shrink below a texel, letting unrelated dark faces contaminate the walls.
res = cfg['resolution']
scene.tool_settings.use_uv_select_sync = True
select([room])
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), margin_method='FRACTION',
    island_margin=(2 * cfg['margin'] + 2) / res, area_weight=0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
uv = np.zeros(len(room.data.loops) * 2); uvs['Lightmap'].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
covered = sum(abs(np.sum(q[:, 0] * np.roll(q[:, 1], -1) - np.roll(q[:, 0], -1) * q[:, 1])) / 2 for q in (uv[list(p.loop_indices)] for p in room.data.polygons))
area = sum(p.area for p in room.data.polygons)
log(f'unwrapped {len(room.data.polygons)} faces: islands cover {covered:.0%}, ~{math.sqrt(covered * res * res / area):.0f} texels per metre')
lightmap_regions = chart_regions([room.data], res, cfg['margin'])

# Light: a sun from the theme's direction (glTF y-up to Blender z-up), a soft sky, a ground
# far below for the bounce off the street, and the lamps. Only the emitting bulb
# ignores shadows; the shade and canopy still shape the light.
x, y, z = cfg['sunPosition']
direction = -Vector((x, -z, y)).normalized()
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = cfg['sunStrength']; sun.data.angle = math.radians(1.5); sun.data.color = cfg['sunColor']
sun.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene.collection.objects.link(sun)
lamp_lights = []
for i, lamp in enumerate(cfg.get('lamps', [])):
    light = bpy.data.lights.new(f'Lamp {i}', 'POINT')
    light.energy = lamp['watts']; light.color = lamp['color']; light.shadow_soft_size = lamp.get('radius', .08)
    lamp_lights.append((light, lamp['watts'], lamp.get('dayFactor')))
    obj = bpy.data.objects.new(f'Lamp {i}', light)
    lx, ly, lz = lamp['position']; obj.location = (lx, -lz, ly)
    scene.collection.objects.link(obj)
    for o in furniture:
        centre = sum((o.matrix_world @ Vector(c) for c in o.bound_box), Vector()) / 8
        if o.get('bakeEmitter') or (centre - obj.location).length < light.shadow_soft_size: o.visible_shadow = False
world = bpy.data.worlds.new('Sky'); scene.world = world
background = world.node_tree.nodes['Background']
background.inputs['Color'].default_value = (*cfg['skyColor'], 1)
background.inputs['Strength'].default_value = cfg['skyStrength']
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, -cfg['groundDepth']))
ground = bpy.context.active_object
ground.data.materials.append(bpy.data.materials.new('Ground'))
ground.active_material.diffuse_color = (.25, .25, .23, 1)
log(f'lights: sun, sky and {len(cfg.get("lamps", []))} lamps')

scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for device in prefs.devices: device.use = device.type != 'CPU'
    scene.cycles.device = 'GPU'
except Exception as error: log(f'GPU unavailable ({error}); using CPU')
if cfg.get('cpu'): scene.cycles.device = 'CPU'
scene.cycles.samples = cfg['samples']
scene.cycles.max_bounces = 8; scene.cycles.diffuse_bounces = 6
scene.cycles.sample_clamp_indirect = 10

image = bpy.data.images.new('Lightmap', res, res, float_buffer=True, alpha=False)
added = []
for material in {s.material for s in room.material_slots}:
    nodes, links = material.node_tree.nodes, material.node_tree.links
    texture = nodes.new('ShaderNodeTexImage'); texture.image = image
    for n in nodes: n.select = False
    texture.select = True; nodes.active = texture
    added.append((material, texture))
# Denoise the atlas with OpenImageDenoise through the compositor, on an empty scene.
def denoise(image):
    try:
        comp = bpy.data.scenes.new('Denoise')
        camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); comp.collection.objects.link(camera); comp.camera = camera
        comp.render.resolution_x = comp.render.resolution_y = image.size[0]; comp.render.resolution_percentage = 100
        comp.render.image_settings.file_format = 'OPEN_EXR'; comp.render.image_settings.color_depth = '32'
        comp.view_settings.view_transform = 'Standard'
        tree = bpy.data.node_groups.new('Denoise', 'CompositorNodeTree'); comp.compositing_node_group = tree
        source = tree.nodes.new('CompositorNodeImage'); source.image = image
        node = tree.nodes.new('CompositorNodeDenoise')
        output = tree.nodes.new('NodeGroupOutput')
        tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        tree.links.new(source.outputs['Image'], node.inputs['Image']); tree.links.new(node.outputs['Image'], output.inputs[0])
        path = os.path.join(out, 'denoised.exr'); comp.render.filepath = path
        bpy.ops.render.render(write_still=True, scene=comp.name)
        pixels = np.array(bpy.data.images.load(path).pixels[:], dtype=np.float32)
        os.remove(path)
        return pixels
    except Exception as error:
        log(f'denoise skipped: {error}')
        return None
# Bake the two lighting states against exactly the same geometry and UV layout.
# Half-float EXR retains dark gradients alongside bright lamps. A globally scaled
# 8-bit atlas loses shadow precision, producing visible colour bands at night.
variants = {}
for mode, settings in cfg.get('modes', {'day': {}}).items():
    sun.data.energy = settings.get('sunStrength', cfg['sunStrength'])
    sun.data.color = settings.get('sunColor', cfg['sunColor'])
    background.inputs['Color'].default_value = (*settings.get('skyColor', cfg['skyColor']), 1)
    background.inputs['Strength'].default_value = settings.get('skyStrength', cfg['skyStrength'])
    for light, watts, day_factor in lamp_lights:
        light.energy = watts * (day_factor if mode == 'day' and day_factor is not None else settings.get('lampFactor', 1))
    select([room])
    log(f'baking {mode}: {res}² at {cfg["samples"]} samples')
    def bake():
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=cfg['margin'],
                            margin_type='EXTEND', use_clear=True, uv_layer='Lightmap')
        return np.array(image.pixels[:], dtype=np.float32)
    raw = bake()
    if scene.cycles.device == 'GPU' and raw.reshape(-1, 4)[:, :3].max() == 0:
        log('GPU bake came back empty; retrying on CPU')
        scene.cycles.device = 'CPU'; raw = bake()
    if cfg.get('debugBaked'): image.pack(); bpy.ops.wm.save_as_mainfile(filepath=cfg['debugBaked'])
    if cfg.get('cacheDirectory'):
        os.makedirs(cfg['cacheDirectory'], exist_ok=True)
        np.save(os.path.join(cfg['cacheDirectory'], f'lightmap-{mode}-raw.npy'), raw)
    pixels = denoise(image) if cfg['denoise'] else None
    if pixels is None or pixels.size != raw.size: pixels = raw
    if cfg['denoise']:
        pixels = filter_lightmap(pixels, res, lightmap_regions)
        log(f'filtered {len(lightmap_regions)} lightmap charts')
    pixels = pixels.reshape(-1, 4)
    pixels[:, :3] = np.maximum(pixels[:, :3], 0); pixels[:, 3] = 1
    output = bpy.data.images.new(f'Lightmap-{mode}', res, res, float_buffer=True, alpha=False)
    output.pixels.foreach_set(pixels.ravel())
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.exr_codec = 'ZIP'
    filename = f'lightmap-{mode}.exr'
    output.save_render(filepath=os.path.join(out, filename), scene=scene)
    variants[mode] = {'file': filename, 'scale': 1, 'exposure': settings.get('exposure', cfg.get('exposure', 1))}
    log(f'{filename} (HDR)')

# Export the architecture: the baked mesh with both UV sets, plus its glass and metal.
for material, texture in added: material.node_tree.nodes.remove(texture)
for o in glass: o.hide_render = False
select([room] + metal + [o for o in glass if o.get('bake')], room)
bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'scene.glb'), export_format='GLB', use_selection=True,
    export_texcoords=True, export_normals=True, export_materials='EXPORT', export_yup=True, export_extras=False,
    export_image_format='AUTO', export_jpeg_quality=85)
json.dump({'version': 2, 'modes': variants, 'resolution': res, 'samples': cfg['samples'],
           'chartFilter': {'sigma': 3, 'edgeInset': 2, 'charts': len(lightmap_regions)} if cfg['denoise'] else None,
           'lamps': len(cfg.get('lamps', [])), 'seconds': round(time.time() - started)},
          open(os.path.join(out, 'bake.json'), 'w'), indent=2)
log('exported')
