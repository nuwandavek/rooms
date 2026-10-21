import {access,cp,mkdir,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {dirname,extname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateHome,imagePaths} from './validate.js';
import {applyResources} from './resources.js';
import {applyInventory} from './inventory.js';
import {applyPlacements} from './placements.js';
import {parseCatalog} from './catalog.js';
import {parseMaterials,applyFitout} from './fitout.js';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function projectPath(name) {
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name || ''))throw new Error('Use a project name in kebab-case, e.g. my-next-home.');
  return resolve(root,'projects',name);
}
export async function listProjects() {
  const entries=await readdir(resolve(root,'projects'),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  return entries.filter(e=>e.isDirectory()).map(e=>e.name).sort();
}
export async function newProject(name) {
  const dir=projectPath(name);
  await mkdir(resolve(root,'projects'),{recursive:true});
  // An exclusive mkdir refuses an existing project, including empty folders.
  await mkdir(dir);
  await cp(resolve(root,'kit/template'),dir,{recursive:true});
  const path=resolve(dir,'home.js');
  const title=name.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
  await writeFile(path,(await readFile(path,'utf8')).replace('Untitled Home',title));
  return dir;
}
export async function loadProject(name) {
  const dir=projectPath(name);
  let home=(await import(pathToFileURL(resolve(dir,'home.js')).href+`?t=${Date.now()}`)).default;
  // resources.md, when present, supplies the floor plan, room photos and extra groups.
  const markdown=await readFile(resolve(dir,'resources.md'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(markdown!==null)home=applyResources(home,markdown);
  // inventory.md, when present, lists the furniture and fittings for the Assets tab.
  const inventory=await readFile(resolve(dir,'inventory.md'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(inventory!==null)home=applyInventory(home,inventory);
  // placements.json, when present, positions library models in the 3D home.
  const placements=await readFile(resolve(dir,'placements.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(placements!==null)home=applyPlacements(home,placements);
  // fitout.json, when present, adds finishes (library/materials.json) and built-ins.
  const fitout=await readFile(resolve(dir,'fitout.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(fitout!==null)home=applyFitout(home,fitout,parseMaterials(await readFile(resolve(root,'library/materials.json'),'utf8')));
  const errors=validateHome(home);
  if(errors.length)throw new Error(errors.join('\n'));
  const realDir=await realpath(dir),images={};
  for(const path of imagePaths(home)) {
    if(typeof path!=='string'||isAbsolute(path))throw new Error(`Image must be a project-relative path: ${path}`);
    const full=await realpath(resolve(dir,path));
    const rel=relative(realDir,full);
    if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw new Error(`Image is outside the project: ${path}`);
    if(!['.jpg','.jpeg','.png','.webp'].includes(extname(full).toLowerCase()))throw new Error(`Unsupported image type: ${path}. Use JPG, PNG, or WebP.`);
    // out/index.html sits one level below the project; this resolves over file:// and the server.
    images[path]='../'+path.split('/').map(encodeURIComponent).join('/');
  }
  // Models are looked up by id in library/catalog.json. The files are gitignored and shared
  // separately, so a catalogued model may be absent here. out/index.html is three levels below the repo root.
  const models={},catalog=new Map(parseCatalog(await readFile(resolve(root,'library/catalog.json'),'utf8').catch(()=>'')).map(r=>[r.id,r]));
  for(const id of new Set([...(home.inventory || []),...(home.placements || [])].flatMap(a=>[a.model,a.realistic]).filter(m=>m&&!m.startsWith('@')))) {
    const entry=catalog.get(id);
    if(!entry)throw new Error(`No model "${id}" in library/catalog.json (referenced in inventory.md or placements.json)`);
    await access(resolve(root,'library',entry.path)).catch(()=>{throw new Error(`Model "${id}" is catalogued but library/${entry.path} is missing; get the library models folder`);});
    models[id]=`../../../library/${entry.path}`;
  }
  // Realistic-tab texture sets are gitignored downloads; without them the material keeps
  // its procedural look. out/index.html is three levels below the repo root.
  for(const [id,def] of Object.entries(home.fitout?.materials || {})) {
    if(!def.photo)continue;
    const name=def.photo.source.split(':')[1];
    const files={map:'diff',normal:'nor_gl',roughness:'rough'};
    const urls=Object.fromEntries(Object.entries(files).map(([key,suffix])=>[key,`textures/${name}/${name}_${suffix}_1k.jpg`]));
    const present=await Promise.all(Object.values(urls).map(path=>access(resolve(root,'library',path)).then(()=>true,()=>false)));
    if(present.every(Boolean))def.photo.urls=Object.fromEntries(Object.entries(urls).map(([k,v])=>[k,`../../../library/${v}`]));
    else {console.warn(`Note: textures for ${id} are missing; run node library/tools/textures.mjs`);delete def.photo;}
  }
  // City models for Walk mode's surroundings, when the library has them (optional).
  const {SCENE_MODELS:CITY_MODELS}=await import('./surroundings.js').catch(()=>({SCENE_MODELS:null}));
  const outside=new Map(parseCatalog(await readFile(resolve(root,'library/outside.json'),'utf8').catch(()=>'')).map(r=>[r.id,r]));
  const cityModels={};
  for(const id of new Set(Object.values(CITY_MODELS || {}).flat())) {
    const entry=outside.get(id);
    if(entry&&await access(resolve(root,'library',entry.path)).then(()=>true,()=>false))cityModels[id]=`../../../library/${entry.path}`;
  }
  home={...home,cityModels};
  // Fitting to Dims is expected; a large stretch usually means the wrong model.
  for(const asset of home.inventory || []) {
    const size=catalog.get(asset.model)?.size;
    if(!size||!asset.dims)continue;
    const ratios=asset.dims.map((v,i)=>v/size[i]);
    if(ratios.some(r=>r<.6||r>1.67))console.warn(`Note: "${asset.name}" stretches ${asset.model} by ${ratios.map(r=>r.toFixed(2)).join(' × ')} to fit its Dims`);
  }
  await access(resolve(dir,'index.html'));
  return {dir,home,images,models};
}
export async function buildProject(name) {
  const {build}=await import('esbuild');
  const {dir,home,images,models}=await loadProject(name);
  // Images stay as files; rewrite project-relative paths to be relative to out/.
  const entry=`import {mount} from './kit/home.js';
    const home=${JSON.stringify(home)}, images=${JSON.stringify(images)}, models=${JSON.stringify(models)};
    if(home.floorPlan)home.floorPlan.image=images[home.floorPlan.image];
    for(const room of home.model.rooms){
      if(room.photo)room.photo=images[room.photo];
      if(room.photos)room.photos=room.photos.map(path=>images[path]);
    }
    for(const group of home.resources || [])group.photos=group.photos.map(path=>images[path]);
    for(const asset of home.inventory || []){asset.photos=asset.photos.map(path=>images[path]);asset.modelUrl=models[asset.model] || null;}
    for(const placement of home.placements || []){placement.modelUrl=models[placement.model];if(placement.art)placement.art=images[placement.art];if(placement.realistic)placement.realisticUrl=models[placement.realistic];}
    window.home3d=mount(home);`;
  const result=await build({stdin:{contents:entry,
    resolveDir:root,sourcefile:'home-entry.js',loader:'js'},bundle:true,format:'iife',minify:true,write:false,legalComments:'inline'});
  let css=await readFile(resolve(root,'kit/home.css'),'utf8');
  if((home.theme || 'riso')==='riso')css+='\n'+await readFile(resolve(root,'kit/themes/riso.css'),'utf8');
  let html=await readFile(resolve(dir,'index.html'),'utf8');
  if(!html.includes('<!-- HOME3D:STYLE -->')||!html.includes('<!-- HOME3D:SCRIPT -->'))throw new Error('index.html is missing the HOME3D build markers. Copy them from kit/template/index.html.');
  html=html.replace(/<link rel="stylesheet" href="\.\.\/\.\.\/kit\/home.css">/,'')
    .replace(/<script type="module">[\s\S]*?<\/script>/,'')
    .replace('<!-- HOME3D:STYLE -->',()=>`<style>${css}</style>`)
    .replace('<!-- HOME3D:SCRIPT -->',()=>`<script>${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`);
  html=html.replace(/<title>.*?<\/title>/,()=>`<title>${home.title.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</title>`);
  const out=resolve(dir,'out');await mkdir(out,{recursive:true});
  const file=resolve(out,'index.html');await writeFile(file,html);
  return file;
}
