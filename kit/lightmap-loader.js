import * as THREE from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';

export function createLightmapLoader() {
  let worker=null,workerURL=null,nextId=0;
  const manager=new THREE.LoadingManager();
  const pending=new Map();
  function fail(error) {for(const {reject} of pending.values())reject(error);pending.clear();}
  function getWorker() {
    if(worker)return worker;
    // The standalone build embeds this worker; no CDN or extra deployment URL.
    if(typeof Worker==='undefined'||typeof __HOME3D_EXR_WORKER__==='undefined'||!__HOME3D_EXR_WORKER__)return null;
    workerURL=URL.createObjectURL(new Blob([__HOME3D_EXR_WORKER__],{type:'text/javascript'}));
    worker=new Worker(workerURL);
    worker.onmessage=({data:r})=>{
      const task=pending.get(r.id);if(!task)return;pending.delete(r.id);
      if(r.error){task.reject(new Error(r.error));return;}
      const texture=new THREE.DataTexture(r.data,r.width,r.height,r.format,r.type);
      texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
      task.resolve(texture);
    };
    worker.onerror=e=>fail(new Error(e.message || 'Lightmap decoder failed'));
    return worker;
  }
  return {
    async load(url) {
      if(!url.endsWith('.exr'))return new THREE.TextureLoader(manager).loadAsync(url);
      const decoder=getWorker();
      if(!decoder)return new EXRLoader(manager).loadAsync(url);
      const buffer=await new THREE.FileLoader(manager).setResponseType('arraybuffer').loadAsync(url);
      return new Promise((resolve,reject)=>{
        const id=++nextId;pending.set(id,{resolve,reject});decoder.postMessage({id,buffer},[buffer]);
      });
    },
    dispose(){worker?.terminate();if(workerURL)URL.revokeObjectURL(workerURL);fail(new Error('Viewer disposed'));},
  };
}
