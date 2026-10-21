import * as THREE from 'three';

// Room reflections refine progressively, starting where the visitor is standing.
// Never render all rooms' cubemaps synchronously in the first-click handler.
export function createBakedEnvironment({renderer,scene,home,furniture,architecture,onUpdate=()=>{}}) {
  const probes=[...home.model.rooms.filter(r=>r.featured).map(r=>({room:r.id,at:r.center})),...(home.environmentProbes || [])];
  const cache=new Map(),originals=new Map(),clones=new Set();
  let active=null,mode=null,generation=0,pending=false,disposed=false,focusAt=null,focusRoom=null;
  let failed=new Set();
  const pmrem=new THREE.PMREMGenerator(renderer);
  const nearest=(list,at,room)=>{
    const local=list.filter(p=>p.room===room);
    return (local.length?local:list).reduce((best,p)=>!best||Math.hypot(p.at[0]-at[0],p.at[1]-at[1])<Math.hypot(best.at[0]-at[0],best.at[1]-at[1])?p:best,null);
  };
  function restoreMaterials() {
    for(const [mesh,material] of originals)mesh.material=material;
    originals.clear();for(const material of clones)material.dispose();clones.clear();
  }
  function apply(probe) {
    for(const group of furniture)for(const item of group.children) {
      const p=item.userData.placement;if(!p||nearest(probes,p.at,p.room)!==probe.source)continue;
      item.traverse(o=>{if(o.isMesh&&!o.isReflector) {
        originals.set(o,o.material);
        const materials=[o.material].flat().map(source=>{
          const m=source.clone();m.onBeforeCompile=source.onBeforeCompile;m.customProgramCacheKey=source.customProgramCacheKey;
          m.envMap=probe.target.texture;m.envMapIntensity=1;clones.add(m);return m;
        });
        o.material=Array.isArray(o.material)?materials:materials[0];
      }});
    }
  }
  async function capture(probe,token) {
    const cube=new THREE.WebGLCubeRenderTarget(128,{type:THREE.HalfFloatType});
    const camera=new THREE.CubeCamera(.05,100,cube);camera.position.set(probe.at[0],1.35,probe.at[1]);
    // Start shader compilation without forcing a synchronous driver status check.
    const tone=renderer.toneMapping;renderer.toneMapping=THREE.NoToneMapping;
    let compiling;const target=renderer.getRenderTarget();
    try {renderer.setRenderTarget(cube);compiling=renderer.compileAsync(scene,camera.children[0]);}finally{renderer.toneMapping=tone;renderer.setRenderTarget(target);}
    try {
      await compiling;
      if(disposed||generation!==token)return null;
      const hidden=[],materials=[];
      scene.traverse(o=>{if(o.isReflector){hidden.push([o,o.visible]);o.visible=false;}});
      architecture.traverse(o=>{if(o.userData.ceiling){hidden.push([o,o.visible]);o.visible=true;}});
      // Each probe sees the same source furniture materials, not earlier probes.
      for(const [mesh,original] of originals){materials.push([mesh,mesh.material]);mesh.material=original;}
      const previousTone=renderer.toneMapping,environment=scene.environment,intensity=scene.environmentIntensity;
      renderer.toneMapping=THREE.NoToneMapping;scene.environment=baseEnvironment;scene.environmentIntensity=baseIntensity;
      try {
        camera.update(renderer,scene);
        const target=pmrem.fromCubemap(cube.texture);target.texture.name=`Baked reflection: ${mode}/${probe.room}`;
        return {...probe,source:probe,target};
      } finally {
        renderer.toneMapping=previousTone;scene.environment=environment;scene.environmentIntensity=intensity;
        for(const [o,visible] of hidden)o.visible=visible;
        for(const [o,material] of materials)o.material=material;
      }
    } finally {cube.dispose();}
  }
  let baseEnvironment=null,baseIntensity=1;
  function schedule() {
    if(pending||disposed||!active||active.length+failed.size===probes.length)return;
    pending=true;const token=generation;
    // Give input and a visible frame a turn between rooms, even on a busy device.
    setTimeout(async()=>{
      let probe;
      try {
        if(disposed||generation!==token)return;
        const missing=probes.filter(p=>!failed.has(p)&&!active.some(c=>c.source===p));
        probe=focusAt?nearest(missing,focusAt,focusRoom):missing[0];
        if(!probe)return;
        const result=await capture(probe,token);
        if(result){active.push(result);apply(result);onUpdate();}
      } catch(error){if(probe&&generation===token)failed.add(probe);console.warn('Room reflection unavailable',error);}
      finally {pending=false;if(!disposed&&active?.length<probes.length)schedule();}
    },100);
  }
  return {
    enable(value) {
      if(mode===value)return;
      this.disable();failed=new Set();mode=value;baseEnvironment=scene.environment;baseIntensity=scene.environmentIntensity;
      if(!cache.has(value))cache.set(value,[]);active=cache.get(value);
      for(const probe of active)apply(probe);
      // focus() starts refinement after the visible scene is ready to draw.
    },
    focus(position,room) {
      focusAt=[position.x,position.z];focusRoom=room;
      const probe=active&&nearest(active,focusAt,room);
      if(probe){scene.environment=probe.target.texture;scene.environmentIntensity=1;}
      schedule();
    },
    disable() {generation++;mode=null;active=null;restoreMaterials();},
    dispose() {disposed=true;this.disable();for(const entries of cache.values())for(const p of entries)p.target.dispose();cache.clear();pmrem.dispose();},
  };
}
