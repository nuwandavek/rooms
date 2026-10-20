// Downloads the image texture sets named by `photo.source` in library/materials.json into
// library/textures/<id>/ (gitignored). Only missing files are fetched. CC0 from Poly Haven.
//
//   node library/tools/textures.mjs
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const library=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const MAPS={map:'diff',normal:'nor_gl',roughness:'rough'};
export const texturePath=(id,map)=>`textures/${id}/${id}_${MAPS[map]}_1k.jpg`;

const {materials}=JSON.parse(await readFile(resolve(library,'materials.json'),'utf8'));
const ids=[...new Set(Object.values(materials).map(m=>m.photo?.source).filter(Boolean).map(s=>s.split(':')[1]))];
for(const id of ids) {
  for(const map of Object.keys(MAPS)) {
    const file=resolve(library,texturePath(id,map));
    if(await access(file).then(()=>true,()=>false))continue;
    const url=`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_${MAPS[map]}_1k.jpg`;
    const response=await fetch(url);
    if(!response.ok)throw new Error(`${url}: ${response.status}`);
    await mkdir(dirname(file),{recursive:true});
    await writeFile(file,Buffer.from(await response.arrayBuffer()));
    console.log(`library/${texturePath(id,map)}`);
  }
}

