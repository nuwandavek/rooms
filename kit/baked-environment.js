import * as THREE from 'three';

// Capture the lit interior once per light study. Furniture then gets indirect
// light and reflections from its room, rather than an unrelated studio HDRI.
export function createBakedEnvironment({renderer,scene,home,furniture,architecture}) {
  const probes=[...home.model.rooms.filter(r=>r.featured).map(r=>({room:r.id,at:r.center})),...(home.environmentProbes || [])];
  const cache=new Map(),originals=new Map(),clones=new Set();
  let active=null;
  const pmrem=new THREE.PMREMGenerator(renderer);
  function capture(mode) {
    const hidden=[];
    scene.traverse(o=>{if(o.isReflector){hidden.push([o,o.visible]);o.visible=false;}});
    architecture.traverse(o=>{if(o.userData.ceiling){hidden.push([o,o.visible]);o.visible=true;}});
    const tone=renderer.toneMapping;
    renderer.toneMapping=THREE.NoToneMapping;
    const result=[];
    try {
      for(const probe of probes) {
        const cube=new THREE.WebGLCubeRenderTarget(128,{type:THREE.HalfFloatType});
        const camera=new THREE.CubeCamera(.05,100,cube);
        camera.position.set(probe.at[0],1.35,probe.at[1]);camera.update(renderer,scene);
        result.push({...probe,target:pmrem.fromCubemap(cube.texture)});cube.dispose();
      }
    } finally {
      renderer.toneMapping=tone;for(const [o,visible] of hidden)o.visible=visible;
    }
    cache.set(mode,result);return result;
  }
  function nearest(at,room) {
    const candidates=active?.filter(p=>p.room===room);
    return (candidates?.length?candidates:active)?.reduce((best,p)=>!best||Math.hypot(p.at[0]-at[0],p.at[1]-at[1])<Math.hypot(best.at[0]-at[0],best.at[1]-at[1])?p:best,null);
  }
  return {
    enable(mode) {
      if(!probes.length)return;
      // Restore the studio maps before capturing another state; don't recursively
      // capture the previous light study's reflections into the next one.
      this.disable();
      active=cache.get(mode) || capture(mode);
      for(const group of furniture)for(const item of group.children) {
        const p=item.userData.placement;if(!p)continue;
        const probe=nearest(p.at,p.room);if(!probe)continue;
        item.traverse(o=>{if(o.isMesh&&!o.isReflector) {
          originals.set(o,o.material);
          const materials=[o.material].flat().map(source=>{
            const m=source.clone();m.onBeforeCompile=source.onBeforeCompile;m.customProgramCacheKey=source.customProgramCacheKey;
            m.envMap=probe.target.texture;m.envMapIntensity=1;clones.add(m);return m;
          });
          o.material=Array.isArray(o.material)?materials:materials[0];
        }});
      }
    },
    focus(position,room) {
      const probe=nearest([position.x,position.z],room);
      if(probe){scene.environment=probe.target.texture;scene.environmentIntensity=1;}
    },
    disable() {
      active=null;
      for(const [mesh,material] of originals)mesh.material=material;
      originals.clear();for(const material of clones)material.dispose();clones.clear();
    },
    dispose() {this.disable();for(const entries of cache.values())for(const p of entries)p.target.dispose();cache.clear();pmrem.dispose();},
  };
}
