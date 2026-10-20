// Reads and writes library/catalog.json: one entry per model in library/models/
// (gitignored). No browser required.
//
//   {"models": [
//     {"id":"kenney-chair", "path":"models/kenney-chair.glb", "category":"seating",
//      "size":[0.4,0.94,0.4], "origin":"sourced", "source":"Kenney Furniture Kit 2.0: chair.glb",
//      "licence":"CC0", "tris":120, "materials":["wood"], "notes":""}
//   ]}
//
// path is relative to library/. size is [w,h,d] in metres, as measured on import.
// origin is sourced (a downloaded model as is), modified (an edit of another id; notes
// say which) or generated (built by code in library/generators/).
export const FIELDS=['id','path','category','size','origin','source','licence','tris','materials','notes'];

export function parseCatalog(json) {
  if(!json.trim())return [];
  const data=JSON.parse(json);
  if(!Array.isArray(data?.models))throw new Error('library/catalog.json: expected {"models": [...]}');
  return data.models;
}

// One model per line, sorted by id, so diffs stay readable as the library grows.
export function formatCatalog(models) {
  const lines=[...models].sort((a,b)=>a.id.localeCompare(b.id))
    .map(m=>JSON.stringify(Object.fromEntries(FIELDS.filter(f=>m[f]!==undefined).map(f=>[f,m[f]]))));
  return `{"models": [\n${lines.join(',\n')}\n]}\n`;
}

// Merges entries by id. A category or notes already in the file wins, so hand edits
// survive a re-import; measured fields are refreshed.
export function upsertCatalog(json,entries) {
  const models=new Map(parseCatalog(json).map(m=>[m.id,m]));
  for(const e of entries) {
    const old=models.get(e.id) || {};
    models.set(e.id,{...old,...e,category:old.category || e.category || guessCategory(e.id),notes:old.notes || e.notes || ''});
  }
  return formatCatalog(models.values());
}

// A first guess from the model's name; fix by hand in the catalog.
const CATEGORIES=[
  ['bed',/bed(?!-?side)|bunk/],['sofa',/sofa|couch|ottoman/],['seating',/chair|stool|bench/],
  ['table',/table|desk|bar(?!-?stool)/],['storage',/bookcase|book-case|closet|cabinet|wardrobe|drawer|night-stand|shelf|coat-rack/],
  ['lighting',/lamp|light|chandelier|ceiling-fan/],['bath',/bath|toilet|shower|sink|basin/],
  ['kitchen',/kitchen|fridge|stove|hood|microwave|toaster|blender|coffee-machine/],
  ['appliance',/washer|dryer|television|computer|laptop|radio|speaker|keyboard|mouse/],
  ['decor',/plant|vase|pillow|rug|books|bear|frame|mirror|trashcan|box|curtain|painting/],
  ['architecture',/wall|floor|stair|door|window|paneling/],
];
export const guessCategory = id => (CATEGORIES.find(([,re])=>re.test(id)) || ['other'])[0];
