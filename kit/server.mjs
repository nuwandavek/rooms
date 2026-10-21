import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,realpath} from 'node:fs/promises';
import {extname,relative,resolve,sep} from 'node:path';
import {root,projectPath} from './project.mjs';

const execFileAsync=promisify(execFile);
async function rebuild(name) {
  // Fresh imports pick up validator, image handling and kit changes on refresh.
  await execFileAsync(process.execPath,[resolve(root,'kit/home'),'build',name],{cwd:root});
  return resolve(projectPath(name),'out/index.html');
}

// Serve a rebuilt project on every page request. No file watcher
// or additional bundler process; edit project or kit code and refresh the page.
export async function serveProject(name,port=4173) {
  projectPath(name);
  await rebuild(name);
  let queue=Promise.resolve();
  const server=http.createServer(async(req,res)=>{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/'||url.pathname==='/index.html') {
        const task=queue.then(()=>rebuild(name));queue=task.catch(()=>{});
        const file=await task;
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        res.end(req.method==='HEAD'?undefined:await readFile(file));return;
      }
      if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
      // Shared library models and Realistic-tab textures.
      if(url.pathname.startsWith('/library/')) {
        const library=await realpath(resolve(root,'library'));
        const file=await realpath(resolve(library,'.'+decodeURIComponent(url.pathname.slice('/library'.length))));
        const rel=relative(library,file);
        const type={'.glb':'model/gltf-binary','.jpg':'image/jpeg','.hdr':'image/vnd.radiance'}[extname(file)];
        if(rel.startsWith('..')||!type){res.writeHead(403).end();return;}
        res.writeHead(200,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:await readFile(file));return;
      }
      // Viewer images and references are served from the project; never expose archive or other projects.
      const project=await realpath(projectPath(name));
      const file=await realpath(resolve(project,'.'+decodeURIComponent(url.pathname)));
      const rel=relative(project,file);
      if(rel==='..'||rel.startsWith('..'+sep)){res.writeHead(403).end();return;}
      const mime={'.glb':'model/gltf-binary','.exr':'application/octet-stream','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.md':'text/plain; charset=utf-8','.json':'application/json'}[extname(file)];
      if(!mime){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':mime});res.end(req.method==='HEAD'?undefined:await readFile(file));
    } catch(error) {
      res.writeHead(error.code==='ENOENT'?404:500,{'Content-Type':'text/plain; charset=utf-8'});
      res.end(error.message);
    }
  });
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',accept);});
  return server;
}
