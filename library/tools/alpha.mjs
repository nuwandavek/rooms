// Sets each GLB material's alphaMode from what it is: glass (by name, transmission or a
// see-through base colour) stays BLEND, foliage becomes
// MASK (cut-out leaves), everything else OPAQUE. Packs whose textures carry an unused alpha
// channel otherwise import as see-through and draw in the wrong order.
//
//   node library/tools/alpha.mjs [id prefix]   -> rewrites matching models/catalog/*.glb in place
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=resolve(dirname(fileURLToPath(import.meta.url)),'../models/catalog');
const GLASS=/glass|gls|clear|crystal/i,FOLIAGE=/plant|leaf|leaves|foliage|grass/i;
export function alphaMode(material) {
  const opacity=material.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1;
  if(GLASS.test(material.name || '') || material.extensions?.KHR_materials_transmission || opacity<.99)return 'BLEND';
  return FOLIAGE.test(material.name || '')?'MASK':'OPAQUE';
}

function patch(file) {
  const glb=readFileSync(file),jsonLength=glb.readUInt32LE(12);
  const json=JSON.parse(glb.subarray(20,20+jsonLength).toString());
  let changed=0;
  for(const m of json.materials || []) {
    const mode=alphaMode(m);
    if((m.alphaMode || 'OPAQUE')===mode)continue;
    if(mode==='OPAQUE'){delete m.alphaMode;delete m.alphaCutoff;}else m.alphaMode=mode;
    if(mode==='MASK')m.alphaCutoff=.5;
    changed++;
  }
  if(!changed)return 0;
  let text=Buffer.from(JSON.stringify(json));
  text=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,0x20)]);
  const rest=glb.subarray(20+jsonLength),header=Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+text.length+rest.length,8);
  header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);
  writeFileSync(file,Buffer.concat([header,text,rest]));
  return changed;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const prefix=process.argv[2] || '';
  for(const f of readdirSync(dir).filter(f=>f.endsWith('.glb')&&f.startsWith(prefix))) {
    const n=patch(resolve(dir,f));
    if(n)console.log(`${f}: ${n} material${n>1?'s':''}`);
  }
}
