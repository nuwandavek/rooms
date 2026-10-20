// Renders every GLB under library/models/ into contact sheets for review: one tile per
// model, seen from its front-right (front faces +z), labelled with id and size w×h×d.
// A model shown from the back is turned wrong; a "chair" 2 m tall is scaled wrong.
//
//   node library/tools/contact-sheet.mjs [filter]   -> library/models/contact-sheet-<n>.png
import http from 'node:http';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const models=resolve(root,'library/models');  // catalog/ and outside/
const filter=process.argv[2] || '';
const files=[];
for(const entry of await readdir(models,{recursive:true,withFileTypes:true}))
  if(entry.isFile()&&entry.name.endsWith('.glb')&&entry.name.includes(filter)&&!entry.parentPath.includes('/source'))
    files.push(relative(models,join(entry.parentPath,entry.name)));
files.sort();

const script=(await build({bundle:true,write:false,format:'esm',absWorkingDir:root,stdin:{resolveDir:root,contents:`
  import {previewModel} from './kit/preview.js';
  window.render=async files=>{
    for(const f of files){
      const {src,size}=await previewModel('/m/'+f);
      const tile=document.createElement('figure');
      tile.innerHTML='<img><figcaption></figcaption>';
      tile.querySelector('img').src=src;
      tile.querySelector('figcaption').textContent=f.split('/').pop().replace('.glb','')+'  '+size.map(v=>v.toFixed(2)).join('×');
      document.body.append(tile);
    }
  };`}})).outputFiles[0].text;
const page=`<!doctype html><meta charset=utf-8><style>
  body{margin:0;padding:8px;display:grid;grid-template-columns:repeat(8,240px);gap:6px;background:#f4efe4;font:11px ui-monospace,monospace}
  figure{margin:0;background:#fff;border:1px solid #ccc}img{width:240px;height:180px;display:block}
  figcaption{padding:3px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>
  <script type=module>${script}</script>`;

const server=http.createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
  if(path.startsWith('/m/')){res.writeHead(200,{'Content-Type':'model/gltf-binary'});res.end(await readFile(resolve(models,path.slice(3))).catch(()=>''));}
  else{res.writeHead(200,{'Content-Type':'text/html'});res.end(page);}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const tab=await browser.newPage({viewport:{width:8*246+16,height:600}});
  const per=48;
  for(let i=0;i*per<files.length;i++){
    await tab.goto(`http://127.0.0.1:${server.address().port}/`);
    await tab.evaluate(f=>window.render(f),files.slice(i*per,(i+1)*per));
    const out=resolve(models,`contact-sheet-${filter?filter+'-':''}${i+1}.png`);
    await tab.screenshot({path:out,fullPage:true});
    console.log(relative(root,out));
  }
}finally{await browser.close();server.close();}
