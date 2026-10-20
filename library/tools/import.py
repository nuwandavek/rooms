# Converts a downloaded pack into normalised GLBs at library/models/<folder>/<id>.glb
# (catalog: furniture and decor; outside: the city kits for Walk mode's surroundings) and adds
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
    # Photoreal, already metres; downloaded per model as 1k glTF (folder per model).
    'polyhaven': {'glob': '*/*.gltf', 'prefix': 'polyhaven', 'scale': 1.0, 'turn': 0, 'strip': '-1k',
                  'licence': 'CC0', 'source': 'Poly Haven (polyhaven.com)'},
    # One file holding many items: each mesh becomes its own model (`split`), named by `part`.
    # Sketchfab "Vase Pack" by powers28: 10 shapes x ceramic/glass, ~8 units tall (x0.04 = ~30 cm).
    'vase-pack': {'glob': 'vase_pack.glb', 'prefix': 'vase', 'scale': 0.04, 'turn': 0, 'split': True,
                  'part': lambda n: re.sub(r'^(glass)?vase(\d+)_.*$', lambda m: f'{"glass" if m[1] else "ceramic"}-{int(m[2]):02d}', n),
                  'licence': 'Sketchfab Standard (no redistribution)',
                  'source': 'Sketchfab "Vase Pack" by powers28, sketchfab.com/3d-models/vase-pack-8ee8169da4f2468496abbc58a37b0024'},
    # Five glass bud vases and bottles in one 3ds Max OBJ (odd units: x0.0002 makes the tallest a 22 cm wine glass); no material file or licence.
    'glass-set': {'glob': 'GLASS.obj', 'prefix': 'bud-vase', 'scale': 0.0002, 'turn': 0, 'split': True,
                  'part': lambda n: re.sub(r'^glass_?(\d+).*$', lambda m: f'{int(m[1]):02d}', n.lower()),
                  'glass': True, 'licence': 'Unknown (user download)', 'source': 'GLASS.obj (3ds Max export, 2015)'},
    # Kenney City Kit (Commercial) 2.1: city blocks seen from Walk mode (kit/surroundings.js).
    'kenney-city': {'folder': 'outside', 'glob': 'Models/GLB format/*building*.glb', 'prefix': 'city', 'scale': 8.0,  # building-a is 1.29 units for 3 floors: x8 = ~3.2 m a floor
                    'turn': 0,
                    'licence': 'CC0', 'source': 'Kenney City Kit (Commercial) 2.1 (kenney.nl)'},
    # Kenney city scene kits (CC0), for Walk mode's surroundings. `files` picks a curated subset.
    'kenney-roads': {'folder': 'outside', 'glob': 'Models/GLB format/*.glb', 'prefix': 'road', 'scale': 8.0, 'turn': 0, 'strip_prefix': 'road-',
                     'files': ['road-straight', 'road-crossroad', 'road-intersection', 'road-crossing', 'tile-low',
                               'light-square-double', 'light-curved', 'traffic-light', 'road-sign-street', 'dumpster'],
                     'licence': 'CC0', 'source': 'Kenney City Kit (Roads) (kenney.nl)'},
    'kenney-suburban': {'folder': 'outside', 'glob': 'Models/GLB format/*.glb', 'prefix': 'suburb', 'scale': 8.0, 'turn': 0,
                        'files': [f'building-type-{c}' for c in 'abcdefghijklmnopqrstu'] +
                                 ['fence-1x3', 'fence-low', 'driveway-short', 'path-short', 'planter', 'tree-large', 'tree-small'],
                        'licence': 'CC0', 'source': 'Kenney City Kit (Suburban) 2.0 (kenney.nl)'},
    'kenney-cars': {'folder': 'outside', 'glob': 'Models/GLB format/*.glb', 'prefix': 'car', 'scale': 1.7, 'turn': 0,
                    'files': ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'van', 'delivery',
                              'truck', 'police', 'ambulance', 'garbage-truck'],
                    'licence': 'CC0', 'source': 'Kenney Car Kit (kenney.nl)'},
    'kenney-nature': {'folder': 'outside', 'glob': 'Models/GLTF format/*.glb', 'prefix': 'nature', 'scale': 3.5, 'turn': 0,
                      'files': ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_simple', 'tree_small', 'tree_tall',
                                'tree_cone', 'tree_palmTall', 'plant_bush', 'plant_bushLarge', 'plant_bushDetailed',
                                'flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass_large', 'rock_smallA'],
                      'licence': 'CC0', 'source': 'Kenney Nature Kit (kenney.nl)'},
    'kenney-forest': {'folder': 'outside', 'glob': 'Models/GLB format/*.glb', 'prefix': 'forest', 'scale': 4.2, 'turn': 0,
                      'files': ['tree', 'tree-high', 'plant'],
                      'licence': 'CC0', 'source': 'Kenney Mini Forest (kenney.nl)'},
    'quaternius-2019': {'glob': 'OBJ/*.obj', 'prefix': 'quaternius19', 'scale': 0.7, 'turn': 0,
                        'licence': 'CC0', 'source': 'Quaternius Furniture Pack, Mar 2019'},
}

MAX_TRIS = 40000  # per model

def kebab(name):
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', name)
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.endswith('.blend'):
        bpy.ops.wm.open_mainfile(filepath=path)
    elif path.endswith('.obj'):
        # Quaternius' old .blend materials export grey; their OBJ+MTL keeps the colours.
        bpy.ops.wm.obj_import(filepath=path, use_split_groups=True)
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

def keep_only(part):
    # Leave one mesh (and its parents); drop every other mesh.
    keep = {part}
    o = bpy.data.objects[part]
    while o.parent: keep.add(o.parent.name); o = o.parent
    for o in list(bpy.context.scene.objects):
        if o.name not in keep and (o.type == 'MESH' or not any(c.name in keep for c in o.children_recursive)):
            bpy.data.objects.remove(o)

def glassify():
    # Clear glass for files that arrive without materials.
    m = bpy.data.materials.new('glass'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.9, 0.95, 0.95, 1); b.inputs['Roughness'].default_value = 0.05
    b.inputs['Transmission Weight'].default_value = 1.0; b.inputs['Alpha'].default_value = 0.35
    for o in bpy.context.scene.objects:
        if o.type == 'MESH': o.data.materials.clear(); o.data.materials.append(m)

def run(pack, folder):
    cfg = PACKS[pack]; entries = []
    os.makedirs(MODELS, exist_ok=True)
    jobs = []
    for path in sorted(glob.glob(os.path.join(folder, cfg['glob']))):
        if cfg.get('files') and os.path.splitext(os.path.basename(path))[0] not in cfg['files']: continue
        if cfg.get('split'):
            load(path)
            jobs += [(path, o.name, cfg['part'](o.name)) for o in bpy.context.scene.objects if o.type == 'MESH']
        else:
            name = kebab(os.path.splitext(os.path.basename(path))[0])
            if cfg.get('strip') and name.endswith(cfg['strip']): name = name[:-len(cfg['strip'])]
            if cfg.get('strip_prefix') and name.startswith(cfg['strip_prefix']): name = name[len(cfg['strip_prefix']):]
            jobs.append((path, None, name))
    for path, part, name in jobs:
        id = f'{cfg["prefix"]}-{kebab(name)}'
        if any(e['id'] == id for e in entries): raise SystemExit(f'{pack}: duplicate id {id}')
        load(path)
        if part: keep_only(part)
        if cfg.get('glass'): glassify()
        size = normalise(cfg['scale'], cfg['turn'])
        tris, mats = stats()
        if tris > MAX_TRIS:
            # Keep many instances affordable: collapse-decimate to the budget.
            for o in bpy.context.scene.objects:
                if o.type == 'MESH':
                    m = o.modifiers.new('budget', 'DECIMATE'); m.ratio = MAX_TRIS / tris
            tris, mats = stats()
        folder_out = os.path.join(MODELS, cfg.get('folder', 'catalog')); os.makedirs(folder_out, exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(folder_out, id + '.glb'), export_format='GLB',
                                  export_yup=True, export_apply=True, export_cameras=False, export_lights=False)
        entries.append({'id': id, 'path': f'models/{cfg.get("folder", "catalog")}/{id}.glb', 'size': size, 'tris': tris,
                        'origin': 'sourced', 'licence': cfg['licence'],
                        'source': f'{cfg["source"]}: {os.path.relpath(path, folder)}' + (f' ({part})' if part else ''),
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
