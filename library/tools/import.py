# Converts a downloaded pack into normalised GLBs at library/models/<id>.glb and adds
# them to library/catalog.json with their source. Run through Blender:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
#     -P library/tools/import.py -- <pack> <unzipped download folder>
#
# Normalised means: metres, resting on y = 0, centered on x/z, front facing +z.
# Each pack's recipe is set once below: which files to read, and a scale and turn found
# from a reference piece (a door or bed). Check the result with contact-sheet.mjs; the
# download can be deleted afterwards, since the catalog records where each model came from.
import bpy, glob, json, math, mathutils, os, re, subprocess, sys, tempfile

LIBRARY = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
MODELS = os.path.join(LIBRARY, 'models')
PACKS = {
    # Doorway is 1.01 units tall; real doors are about 2.1 m.
    'kenney-furniture': {'glob': 'Models/GLTF format/*.glb', 'prefix': 'kenney', 'scale': 2.0, 'turn': 0,
                         'licence': 'CC0', 'source': 'Kenney Furniture Kit 2.0 (kenney.nl)'},
    # Stylised and small (bed 1.43 m long, closet 1.48 m tall); x1.3 is the compromise.
    # Fronts face +x. Its OBJ+MTL lost the colours; the .blend keeps them on Diffuse nodes.
    'quaternius-2017': {'glob': 'Blends/*.blend', 'prefix': 'quaternius17', 'scale': 1.3, 'turn': -90,
                        'licence': 'CC0', 'source': 'Quaternius Furniture Pack, Oct 2017'},
    # Door1 is 3.08 units tall.
    'quaternius-2019': {'glob': 'OBJ/*.obj', 'prefix': 'quaternius19', 'scale': 0.7, 'turn': 0,
                        'licence': 'CC0', 'source': 'Quaternius Furniture Pack, Mar 2019'},
}

def kebab(name):
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', name)
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.endswith('.blend'):
        bpy.ops.wm.open_mainfile(filepath=path)
    elif path.endswith('.obj'):
        # Quaternius' old .blend materials export grey; their OBJ+MTL keeps the colours.
        bpy.ops.wm.obj_import(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.context.scene.objects):
        if o.type not in ('MESH', 'EMPTY'):
            bpy.data.objects.remove(o)
    # glTF only exports Principled materials; old files use Diffuse BSDF nodes.
    for m in bpy.data.materials:
        nodes = m.node_tree.nodes if m.node_tree else []
        diffuse = next((n for n in nodes if n.type == 'BSDF_DIFFUSE'), None)
        if diffuse and not any(n.type == 'BSDF_PRINCIPLED' for n in nodes):
            colour = tuple(diffuse.inputs['Color'].default_value)
            nodes.remove(diffuse)
            bsdf = nodes.new('ShaderNodeBsdfPrincipled')
            bsdf.inputs['Base Color'].default_value = colour
            bsdf.inputs['Roughness'].default_value = 0.8
            out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
            m.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

def bounds():
    lo = mathutils.Vector((math.inf,) * 3); hi = -lo
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        for c in o.bound_box:
            p = o.matrix_world @ mathutils.Vector(c)
            lo = mathutils.Vector(map(min, lo, p)); hi = mathutils.Vector(map(max, hi, p))
    return lo, hi

def normalise(scale, turn):
    # Blender is z-up with the front toward -y; the glTF exporter maps that to y-up, front +z.
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    m = mathutils.Matrix.Rotation(math.radians(turn), 4, 'Z') @ mathutils.Matrix.Scale(scale, 4)
    for o in roots: o.matrix_world = m @ o.matrix_world
    bpy.context.view_layer.update()
    lo, hi = bounds()
    shift = mathutils.Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for o in roots: o.matrix_world = mathutils.Matrix.Translation(shift) @ o.matrix_world
    bpy.context.view_layer.update()
    lo, hi = bounds()
    # Report in viewer terms: width x, height y, depth z.
    return [round(hi.x - lo.x, 3), round(hi.z - lo.z, 3), round(hi.y - lo.y, 3)]

def stats():
    deps = bpy.context.evaluated_depsgraph_get(); tris = 0; mats = set()
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        mesh = o.evaluated_get(deps).to_mesh()
        mesh.calc_loop_triangles(); tris += len(mesh.loop_triangles)
        mats.update(s.material.name for s in o.material_slots if s.material)
        o.evaluated_get(deps).to_mesh_clear()
    return tris, sorted(mats)

def run(pack, folder):
    cfg = PACKS[pack]; entries = []
    os.makedirs(MODELS, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(folder, cfg['glob']))):
        id = f'{cfg["prefix"]}-{kebab(os.path.splitext(os.path.basename(path))[0])}'
        if any(e['id'] == id for e in entries): raise SystemExit(f'{pack}: duplicate id {id}')
        load(path)
        size = normalise(cfg['scale'], cfg['turn'])
        tris, mats = stats()
        bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, id + '.glb'), export_format='GLB',
                                  export_yup=True, export_apply=True, export_cameras=False, export_lights=False)
        entries.append({'id': id, 'path': f'models/{id}.glb', 'size': size, 'tris': tris,
                        'origin': 'sourced', 'licence': cfg['licence'],
                        'source': f'{cfg["source"]}: {os.path.relpath(path, folder)}',
                        'materials': mats})
        print(f'IMPORTED {id} {size} {tris} tris')
    if not entries: raise SystemExit(f'{pack}: no files match {cfg["glob"]} in {folder}')
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump(entries, f)
    subprocess.run(['node', os.path.join(LIBRARY, 'tools', 'catalog.mjs'), 'add', f.name], check=True)
    os.unlink(f.name)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(args) != 2 or args[0] not in PACKS:
    raise SystemExit(f'usage: import.py -- <{"|".join(PACKS)}> <download folder>')
run(args[0], os.path.abspath(args[1]))
