// Adds models to library/catalog.json from a JSON list written by import.py or a generator:
//
//   node library/tools/catalog.mjs add entries.json
//   [{"id":"kenney-chair","path":"models/kenney-chair.glb","size":[0.4,0.94,0.4],
//     "origin":"sourced","source":"Kenney Furniture Kit 2.0: chair.glb","licence":"CC0","tris":120}]
//
// `node library/tools/catalog.mjs check` reports rows whose file is missing and models
// with no row.
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCatalog,upsertCatalog} from '../../kit/catalog.js';

const library=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=resolve(library,'catalog.json');

export async function addToCatalog(entries) {
  const json=await readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
  const round=v=>Math.round(v*1000)/1000;
  await writeFile(file,upsertCatalog(json,entries.map(e=>({...e,size:e.size.map(round)}))));
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [command,arg]=process.argv.slice(2);
  if(command==='add') {
    const entries=JSON.parse(await readFile(arg,'utf8'));
    await addToCatalog(entries);
    console.log(`library/catalog.json: ${entries.length} models added or refreshed`);
  } else if(command==='check') {
    const rows=parseCatalog(await readFile(file,'utf8'));
    const missing=[];
    for(const r of rows)await access(resolve(library,r.path)).catch(()=>missing.push(r.path));
    const listed=new Set(rows.map(r=>r.path));
    const unlisted=(await readdir(resolve(library,'models'))).filter(f=>f.endsWith('.glb')&&!listed.has(`models/${f}`));
    console.log(`${rows.length} catalogued, ${missing.length} missing files, ${unlisted.length} uncatalogued`);
    for(const m of missing)console.log(`missing    ${m}`);
    for(const u of unlisted)console.log(`unlisted   models/${u}`);
    if(missing.length||unlisted.length)process.exitCode=1;
  } else {
    console.error('usage: node library/tools/catalog.mjs add <entries.json> | check');process.exitCode=1;
  }
}
