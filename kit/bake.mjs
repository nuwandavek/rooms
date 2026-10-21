// kit/home bake <name>: bake Blender (Cycles) lighting into the interior for the Baked tab.
// 1. Load the project in a headless browser and export the 3D Tour scene as GLB
//    (window.home3d.exportBake in home.js).
// 2. Run kit/bake/bake.py in Blender: sun and sky through the windows, a shared lightmap
//    atlas, a diffuse bake, denoise, and export.
// 3. Install the complete scene, day/night lightmaps and manifest together.
//    Keep the previous bake under out/bake so a failed run cannot damage it.
import {mkdir,writeFile,access,rename,mkdtemp,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {projectPath,root} from './project.mjs';

const BLENDER=[process.env.BLENDER,'/Applications/Blender.app/Contents/MacOS/Blender','blender'].filter(Boolean);
const QUALITY={
  draft:{resolution:2048,samples:64,margin:3},
  final:{resolution:4096,samples:128,margin:4},
};

async function findBlender() {
  for(const path of BLENDER) {
    if(!path.includes('/'))return path;
    if(await access(path).then(()=>true,()=>false))return path;
  }
  throw new Error('Blender not found. Install it or set BLENDER=/path/to/blender.');
}

export async function bakeProject(name,{quality='final'}={}) {
  if(!QUALITY[quality])throw new Error('Quality must be draft or final.');
  const dir=projectPath(name),work=resolve(dir,'out/bake'),out=resolve(dir,'assets/baked');
  await mkdir(work,{recursive:true});
  const staged=await mkdtemp(resolve(work,'result-'));
  const blender=await findBlender();
  const {chromium}=await import('playwright');
  const {serveProject}=await import('./server.mjs');
  const server=await serveProject(name,0);
  let exported;
  try {
    const browser=await chromium.launch({args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
    try {
      const page=await browser.newPage({viewport:{width:480,height:320}});
      page.on('pageerror',e=>console.error('Page error:',e.message));
      // Only local files; the theme fonts do not matter for a bake.
      await page.route(/^https?:/,r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/?dev=1`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.body.dataset.modelReady==='true',{},{timeout:60000});
      console.log('Exporting the interior…');
      exported=await page.evaluate(async()=>{
        const {glb,light,lighting,lamps}=await window.home3d.exportBake();
        const bytes=new Uint8Array(glb);let binary='';
        for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
        return {glb:btoa(binary),light,lighting,lamps};
      });
    } finally {await browser.close();}
  } finally {server.close();}
  const input=resolve(work,'interior.glb');
  await writeFile(input,Buffer.from(exported.glb,'base64'));
  const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
  const config={...QUALITY[quality],denoise:true,cacheDirectory:work,
    sunPosition:exported.light.position,sunColor:[1,.98,.95],sunStrength:3,
    skyColor:[.82,.9,1],skyStrength:2.5,groundDepth:12,
    // An artistic energy calibration, not a candela-to-radiometric-watt conversion.
    lamps:exported.lamps.map(l=>({position:l.position,color:hex(l.color),radius:l.radius,dayFactor:l.dayFactor,watts:4*Math.PI*l.intensity})),
    modes:{
      day:{sunStrength:3,skyStrength:2.5,lampFactor:.12,exposure:6},
      night:{sunStrength:0,skyStrength:.04,skyColor:[.32,.45,.7],lampFactor:1.4,exposure:4},
    }};
  const configPath=resolve(work,'config.json');
  await writeFile(configPath,JSON.stringify(config,null,2));
  console.log(`Baking in Blender (${quality}: ${config.resolution}² lightmap, ${config.samples} samples)…`);
  await new Promise((accept,reject)=>{
    const child=spawn(blender,['-b','--factory-startup','--python',resolve(root,'kit/bake/bake.py'),'--',input,staged,configPath],{stdio:['ignore','pipe','pipe']});
    let tail='';
    const relay=chunk=>{const text=chunk.toString();tail=(tail+text).slice(-4000);for(const line of text.split('\n'))if(line.startsWith('[bake')||/Error/.test(line))console.log(line);};
    child.stdout.on('data',relay);child.stderr.on('data',relay);
    child.on('error',reject);
    child.on('exit',code=>code===0&&!/Traceback/.test(tail)?accept():reject(new Error(`Blender failed (exit ${code}):\n${tail}`)));
  });
  const manifest=JSON.parse(await readFile(resolve(staged,'bake.json'),'utf8'));
  for(const file of ['scene.glb',...Object.values(manifest.modes).map(v=>v.file)])await access(resolve(staged,file));
  await mkdir(resolve(dir,'assets'),{recursive:true});
  const previous=resolve(work,`previous-${Date.now()}`);
  const exists=await access(out).then(()=>true,()=>false);
  if(exists)await rename(out,previous);
  try {await rename(staged,out);}
  catch(error){if(exists)await rename(previous,out);throw error;}
  console.log(`Baked ${name}: ${out}`);
}
