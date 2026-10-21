// Hosting one home as a static site.
//
// publish: builds projects/<name>/out/index.html, then stages projects/<name>/out/site/ with
// only the files the page references (project images, library models and textures), paths
// rewritten to stay inside the folder. Any static host can serve it.
//
// deploy: uploads out/site/ to s3://$ROOMS_BUCKET/$ROOMS_PREFIX/<name>/ and invalidates that
// folder on CloudFront, so the home is served at $ROOMS_ORIGIN/<name>/. Settings come from
// .env (see .env.example); kit/hosting/setup.sh creates the distribution once. Needs an
// authenticated AWS CLI. Uploads never delete: the bucket is shared with other sites.
import {readFile,writeFile,mkdir,copyFile,rm,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {root,buildProject} from './project.mjs';

const ROOTS=[['../../../library/','library/'],['../assets/','assets/']];

export async function publishProject(name) {
  const page=await buildProject(name),out=dirname(page),site=resolve(out,'site');
  let html=await readFile(page,'utf8');
  const files=new Set();
  for(const [from,to] of ROOTS) {
    const pattern=new RegExp(from.replaceAll('.','\\.').replaceAll('/','\\/')+'[^"\'`\\s)\\\\]+','g');
    for(const match of html.match(pattern) || [])files.add([resolve(out,match),match.replace(from,to)]);
    html=html.replaceAll(from,to);
  }
  await rm(site,{recursive:true,force:true});
  let bytes=0;
  for(const [source,target] of files) {
    const destination=resolve(site,target);
    await mkdir(dirname(destination),{recursive:true});
    await copyFile(source,destination);bytes+=(await stat(source)).size;
  }
  await writeFile(resolve(site,'index.html'),html);
  console.log(`Staged ${files.size} files (${(bytes/1e6).toFixed(1)} MB) and index.html in ${site}`);
  return site;
}

const run=(args)=>new Promise((accept,reject)=>{
  const child=spawn('aws',args,{stdio:'inherit'});
  child.on('error',reject);child.on('exit',code=>code===0?accept():reject(new Error(`aws ${args[0]} ${args[1]} exited ${code}`)));
});

// KEY=value lines from .env (no quoting or expansion needed for these settings).
async function hostingConfig() {
  const text=await readFile(resolve(root,'.env'),'utf8').catch(()=>{throw new Error('.env is missing: copy .env.example to .env, then run bash kit/hosting/setup.sh once');});
  const env=Object.fromEntries(text.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
  for(const key of ['ROOMS_BUCKET','ROOMS_PREFIX','AWS_REGION','ROOMS_ORIGIN','ROOMS_DISTRIBUTION_ID'])
    if(!env[key])throw new Error(`.env has no ${key}${key==='ROOMS_DISTRIBUTION_ID'?'; run bash kit/hosting/setup.sh once':''}`);
  return env;
}

// The root page lists every home in the bucket folder.
function indexPage(names) {
  const items=names.map(n=>`<li><a href="${n}/">${n.replace(/-/g,' ')}</a></li>`).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rooms</title>
<style>body{font:16px/1.6 ui-monospace,Menlo,monospace;background:#f3eee2;color:#1d2340;margin:0;padding:48px 24px}main{max-width:560px;margin:auto}h1{font-size:28px;margin:0 0 24px}a{color:#1d2340}li{text-transform:capitalize;margin:6px 0}</style>
<main><h1>Rooms</h1><p>Interactive 3D home studies.</p><ul>${items}</ul></main>`;
}

export async function deployProject(name,{dryRun=false}={}) {
  const env=await hostingConfig(),site=await publishProject(name);
  const base=`s3://${env.ROOMS_BUCKET}/${env.ROOMS_PREFIX}`,target=`${base}/${name}`;
  const common=['--region',env.AWS_REGION,'--no-progress','--only-show-errors',...(dryRun?['--dryrun']:[])];
  // Models and images change rarely and are cached for a day; pages for a minute.
  await run(['s3','sync',site,target,...common,'--exclude','index.html','--exclude','*.glb','--cache-control','public,max-age=86400']);
  await run(['s3','sync',site,target,...common,'--exclude','*','--include','*.glb','--content-type','model/gltf-binary','--cache-control','public,max-age=86400']);
  await run(['s3','cp',resolve(site,'index.html'),`${target}/index.html`,...common,'--content-type','text/html; charset=utf-8','--cache-control','public,max-age=60,must-revalidate']);
  const {stdout}=await promisify(execFile)('aws',['s3','ls',`${base}/`,'--region',env.AWS_REGION]);
  const names=[...new Set([name,...stdout.split('\n').map(l=>l.match(/PRE (.+)\/$/)?.[1]).filter(Boolean)])].sort();
  const listing=resolve(dirname(site),'rooms-index.html');await writeFile(listing,indexPage(names));
  await run(['s3','cp',listing,`${base}/index.html`,...common,'--content-type','text/html; charset=utf-8','--cache-control','public,max-age=60,must-revalidate']);
  if(!dryRun)await run(['cloudfront','create-invalidation','--distribution-id',env.ROOMS_DISTRIBUTION_ID,'--paths',`/${name}/*`,'/','/index.html','--query','Invalidation.Id','--output','text']);
  console.log(dryRun?'Dry run: nothing uploaded.':`Deployed ${name}: ${env.ROOMS_ORIGIN}/${name}/`);
}
