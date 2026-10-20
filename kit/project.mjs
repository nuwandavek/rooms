import {access,cp,mkdir,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {dirname,extname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateHome,imagePaths} from './validate.js';

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
  const home=(await import(pathToFileURL(resolve(dir,'home.js')).href+`?t=${Date.now()}`)).default;
  const errors=validateHome(home);
  if(errors.length)throw new Error(errors.join('\n'));
  const realDir=await realpath(dir),images={};
  for(const path of imagePaths(home)) {
    if(typeof path!=='string'||isAbsolute(path))throw new Error(`Image must be a project-relative path: ${path}`);
    const full=await realpath(resolve(dir,path));
    const rel=relative(realDir,full);
    if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw new Error(`Image is outside the project: ${path}`);
    const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[extname(full).toLowerCase()];
    if(!mime)throw new Error(`Unsupported image type: ${path}. Use JPG, PNG, or WebP.`);
    images[path]=`data:${mime};base64,${(await readFile(full)).toString('base64')}`;
  }
  await access(resolve(dir,'index.html'));
  return {dir,home,images};
}
export async function buildProject(name) {
  const {build}=await import('esbuild');
  const {dir,home,images}=await loadProject(name);
  // Resolve image paths at build time. The export needs neither fetch nor a server.
  // Embed each image once, even when it appears in Resources and the viewer.
  const entry=`import {mount} from './kit/home.js';
    const home=${JSON.stringify(home)}, images=${JSON.stringify(images)};
    if(home.floorPlan)home.floorPlan.image=images[home.floorPlan.image];
    for(const room of home.model.rooms){
      if(room.photo)room.photo=images[room.photo];
      if(room.photos)room.photos=room.photos.map(path=>images[path]);
    }
    for(const group of home.resources || [])group.photos=group.photos.map(path=>images[path]);
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
