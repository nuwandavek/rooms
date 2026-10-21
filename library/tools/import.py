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
    # One wall-mounted split AC indoor unit (3ds Max export), already metres; `name` fixes the id.
    'split-ac': {'glob': 'Air+Conditioner.glb', 'prefix': 'split-ac', 'name': 'indoor', 'scale': 1.0, 'turn': 0,
                 'licence': 'Unknown (user download)', 'source': 'Air+Conditioner.glb (user download)'},
    # CGTrader free pack (Gumroad): 56 photoreal pieces from 3ds Max, already metres. Their FBX
    # files point at a missing ../0_CGT_Textures folder, so textures are relinked by file name.
    'cgt': {'glob': 'FBX/*.fbx', 'prefix': 'cgt', 'scale': 1.0, 'turn': 0, 'textures': ['Textures'],
            'scales': {'table-17': 0.73, 'table-38': 0.7, 'table-63': 0.64},  # dining tables modelled 1.0-1.2 m tall
            'rename': lambda n: re.sub(r'\d+', lambda m: f'{int(m[0]):02d}', re.sub(r'(?i)^cgt_|_0+1$', '', n)),
            'licence': 'CGTrader free pack (royalty free)', 'source': 'CGT Free Pack (Gumroad)'},
    # Textured wooden furniture, bathroom and kitchen pieces, one folder per model (named by folder).
    # Its MTLs point at the author's C: drive; textures sit beside each OBJ in "<n>px Textures".
    # Most fronts face +x (`turns` lists the ones already facing +z); the sofa and armchair
    # were modelled ~3x too large.
    'furnpack': {'glob': '*/*/*.obj', 'prefix': 'furnpack', 'scale': 1.0, 'turn': -90, 'by_folder': True,
                 'turns': {n: 0 for n in ('sofa', 'armchair', 'chair4', 'bath', 'shower', 'table4', 'table5')},
                 'textures': ['.'], 'scales': {'sofa': 0.34, 'armchair': 0.34},
                 'licence': 'Unknown (user download)', 'source': 'Furniture Pack OBJ'},
    # 24 cushions in two fabric patterns x three colours (2k textures, downsized). Units are ~4x;
    # Pillow_7-12 and the rectangular 7-12 stand upright, facing +x.
    'pillows': {'glob': 'pillows.glb', 'prefix': 'cushion', 'scale': 0.24, 'turn': 0, 'split': True,
                'part': lambda n: re.sub(r'^Pillow_(rectangular_)?(\d+)$', lambda m: f'{"long" if m[1] else "square"}-{int(m[2]):02d}', n),
                'turn_for': lambda n: 90 if int(re.sub(r'\D', '', n)) > 6 else 0,
                'licence': 'Unknown (user download)', 'source': 'pillows.glb (user download)'},
    # Eight flat rugs with photo textures, ~3x scale.
    'carpets': {'glob': 'source/carpets_pack.glb', 'prefix': 'rug', 'scale': 0.34, 'turn': 0, 'split': True,
                'part': lambda n: f'{int(n.split(".")[1]) + 1 if "." in n else 1:02d}',
                'licence': 'Unknown (user download)', 'source': 'carpets-and-tiles-pack (user download)'},
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
}

MAX_TRIS = 40000  # per model
MAX_TEXTURE = 1024  # pixels, longest side

def kebab(name):
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', name)
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=path)
    elif path.endswith('.blend'):
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

def relink(dirs):
    # Point missing image files at same-named files under `dirs` (case-insensitive; 1k preferred).
    found = {}
    for d in dirs:
        for f in sorted(glob.glob(os.path.join(d, '**', '*'), recursive=True), key=lambda f: '1024px' not in f):
            found.setdefault(os.path.basename(f).lower(), f)
    for i in bpy.data.images:
        if i.source != 'FILE' or os.path.exists(bpy.path.abspath(i.filepath)): continue
        name = re.split(r'[\\/]', i.filepath)[-1].lower()
        if name in found: i.filepath = found[name]; i.reload()

def fbx_materials(path):
    # The FBX exporter for Corona/V-Ray scenes leaves metals as a dark diffuse with the metal's
    # tint in SpecularColor, and Blender reads every such material as metallic. Rebuild them:
    # dark diffuse + bright or tinted specular = metal of that tint; anything else = dielectric.
    import addon_utils; addon_utils.enable('io_scene_fbx')
    from io_scene_fbx import parse_fbx
    root, _ = parse_fbx.parse(path); raw = {}
    for e in next(c for c in root.elems if c.id == b'Objects').elems:
        if e.id != b'Material': continue
        props = {p.props[0].decode(errors='ignore'): p.props[4:] for c in e.elems if c.id == b'Properties70' for p in c.elems}
        raw[e.props[1].split(b'\x00')[0].decode(errors='ignore')] = props
    for m in bpy.data.materials:
        props = raw.get(re.sub(r'\.\d{3}$', '', m.name)); b = m.node_tree and m.node_tree.nodes.get('Principled BSDF')
        if not props or not b: continue
        diffuse = props.get('DiffuseColor', (0.5,) * 3); spec = props.get('SpecularColor', (0,) * 3)
        textured = bool(b.inputs['Base Color'].links)
        if not textured and max(diffuse) < 0.1 and max(spec) >= 0.3 and props.get('SpecularFactor', (0,))[0] > 0:
            b.inputs['Base Color'].default_value = (*[min(1, c * 1.4) for c in spec], 1); b.inputs['Metallic'].default_value = 1
        else:
            b.inputs['Metallic'].default_value = 0

def drop_missing():
    # A link to a texture that is not there renders black (or pink); fall back to the plain colour.
    for m in bpy.data.materials:
        for n in list(m.node_tree.nodes if m.node_tree else []):
            if n.type == 'TEX_IMAGE' and (not n.image or not n.image.has_data and not os.path.exists(bpy.path.abspath(n.image.filepath))):
                m.node_tree.nodes.remove(n)

def shrink():
    # Keep textures affordable: no side over MAX_TEXTURE.
    for i in bpy.data.images:
        w, h = i.size
        if max(w, h) > MAX_TEXTURE:
            k = MAX_TEXTURE / max(w, h); i.scale(max(1, round(w * k)), max(1, round(h * k)))

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
            stem = os.path.basename(os.path.dirname(path)) if cfg.get('by_folder') else os.path.splitext(os.path.basename(path))[0]
            name = cfg.get('name') or kebab(cfg['rename'](stem) if cfg.get('rename') else stem)
            if cfg.get('strip') and name.endswith(cfg['strip']): name = name[:-len(cfg['strip'])]
            if cfg.get('strip_prefix') and name.startswith(cfg['strip_prefix']): name = name[len(cfg['strip_prefix']):]
            jobs.append((path, None, name))
    for path, part, name in jobs:
        id = f'{cfg["prefix"]}-{kebab(name)}'
        if any(e['id'] == id for e in entries): raise SystemExit(f'{pack}: duplicate id {id}')
        load(path)
        if part: keep_only(part)
        if cfg.get('glass'): glassify()
        if cfg.get('textures'): relink([os.path.join(os.path.dirname(path) if d == '.' else folder, d) for d in cfg['textures']])
        if path.endswith('.fbx'): fbx_materials(path)
        drop_missing(); shrink()
        turn = cfg.get('turns', {}).get(name, cfg['turn']) + (cfg['turn_for'](part) if part and cfg.get('turn_for') else 0)
        size = normalise(cfg.get('scales', {}).get(name, cfg['scale']), turn)
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
