// Reads a project's fitout.json (everything fixed to the shell: finishes and built-ins)
// against the shared library/materials.json. No browser required. Fit-out shows on the
// Fit-out and Furnished tabs; Shell stays plain.
//
//   {"floors": {"*": "marble-beige", "kitchen": "granite-speckle"},
//    "walls": [{"room": "*", "material": "paint-warm-white"},
//              {"room": "master-bath", "to": 2.4, "material": "marble-striped"}],
//    "doors": "walnut", "doorFrames": "black-matt", "windowFrames": "aluminium-white",
//    "builtins": [{"type": "counter", "room": "kitchen", "path": [[x,z], [x,z], ...],
//                  "depth": 0.6, "height": 0.9, "top": "granite-black", "base": "oak-laminate",
//                  "plinth": "black-matt", "sink": {"at": 1.4, "width": 0.8},
//                  "uppers": {"bottom": 1.45, "top": 2.2, "depth": 0.35, "material": "laminate-white"}}]}
//
// Floors map a room id (or "*") to a material. Wall rules apply to wall faces by the
// room each face looks into, optionally within a height band `from`–`to` in metres;
// later rules win. Faces that look outside keep the plain wall.
//
// A counter's `path` is its back edge in plan metres, usually along wall faces; the
// counter extends `depth` to the right of the direction of travel (`"side": "left"` flips
// it). `sink.at` is metres along the path to the sink's center. `thickness` sets the slab
// (default 0.04); leave out `base` and `plinth` for a floating slab such as a vanity.
export const MATERIAL_KINDS={paint:['colour'],tiles:['size','colour'],marble:['size','colour','veinColour'],
  speckle:['colour','flecks'],wood:['colour','grain'],stripes:['colours','width']};

export function parseMaterials(json) {
  const data=JSON.parse(json),errors=[];
  for(const [id,def] of Object.entries(data?.materials || {})) {
    const need=MATERIAL_KINDS[def?.kind];
    if(!need)errors.push(`library/materials.json ${id}: unknown kind "${def?.kind}"; use ${Object.keys(MATERIAL_KINDS).join(', ')}`);
    else for(const field of need)if(def[field]===undefined)errors.push(`library/materials.json ${id}: ${def.kind} needs ${field}`);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  return data.materials;
}

export function applyFitout(home,json,materials) {
  const errors=[],rooms=new Set((home.model?.rooms || []).map(r=>r.id));
  let data;
  try{data=JSON.parse(json);}catch(error){throw new Error(`fitout.json: ${error.message}`);}
  const used=new Set();
  const material=(id,where)=>{if(!materials[id])errors.push(`fitout.json ${where}: no material "${id}" in library/materials.json`);else used.add(id);};
  const room=(id,where)=>{if(id!=='*'&&!rooms.has(id))errors.push(`fitout.json ${where}: no room "${id}"`);};
  for(const [id,m] of Object.entries(data.floors || {})){room(id,`floors.${id}`);material(m,`floors.${id}`);}
  (data.walls || []).forEach((rule,i)=>{
    const where=`walls[${i}]`;room(rule.room,where);material(rule.material,where);
    const from=rule.from ?? 0,to=rule.to ?? Infinity;
    if(!(from>=0&&to>from))errors.push(`fitout.json ${where}: band needs 0 ≤ from < to`);
  });
  (data.builtins || []).forEach((b,i)=>{
    const where=`builtins[${i}]`;
    if(b.type!=='counter'){errors.push(`fitout.json ${where}: unknown type "${b.type}"; use counter`);return;}
    room(b.room,where);
    const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
    if(!Array.isArray(b.path)||b.path.length<2||!b.path.every(point))errors.push(`fitout.json ${where}: path needs two or more [x,z] points`);
    for(const key of ['depth','height'])if(!(b[key]>0))errors.push(`fitout.json ${where}: ${key} must be metres`);
    if(b.thickness!==undefined&&!(b.thickness>0&&b.thickness<b.height))errors.push(`fitout.json ${where}: thickness must be metres, below height`);
    for(const key of ['top','base','plinth'])if(b[key])material(b[key],`${where}.${key}`);
    if(b.uppers){material(b.uppers.material,`${where}.uppers`);if(!(b.uppers.top>b.uppers.bottom&&b.uppers.depth>0))errors.push(`fitout.json ${where}.uppers: needs bottom < top and depth`);}
    if(b.sink&&!(b.sink.at>=0&&b.sink.width>0))errors.push(`fitout.json ${where}.sink: needs at and width`);
  });
  for(const key of ['doors','doorFrames','windowFrames'])if(data[key])material(data[key],key);
  if(errors.length)throw new Error(errors.join('\n'));
  return {...home,fitout:{floors:data.floors || {},walls:(data.walls || []).map(r=>({from:0,...r})),
    doors:data.doors || null,doorFrames:data.doorFrames || null,windowFrames:data.windowFrames || null,
    builtins:data.builtins || [],
    materials:Object.fromEntries([...used].map(id=>[id,materials[id]]))}};
}

// The material id for a room's wall face at height y, or null for the plain wall.
export function wallFinish(finishes,room,y) {
  let result=null;
  for(const rule of finishes?.walls || [])
    if((rule.room==='*'?room!==null:rule.room===room)&&y>=rule.from&&y<(rule.to ?? Infinity))result=rule.material;
  return result;
}
// Heights where a room's wall finish changes, for splitting wall pieces into bands.
export const wallBands = (finishes,room) => (finishes?.walls || [])
  .filter(r=>r.room==='*'?room!==null:r.room===room).flatMap(r=>[r.from,r.to]).filter(v=>Number.isFinite(v)&&v>0);
export const floorFinish = (finishes,room) => finishes?.floors?.[room] ?? finishes?.floors?.['*'] ?? null;
