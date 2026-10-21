// Resolve every bake asset at build time, including both light studies, so static
// publishing includes them and the viewer never substitutes a day map for night.
export function bakeAssets(data) {
  const base='../assets/baked/';
  const variants=data.version===2?data.modes:{day:{file:'lightmap.jpg',scale:data.scale,exposure:data.exposure}};
  if(!variants?.day)throw new Error('bake.json: a day lightmap is required');
  const modes=Object.fromEntries(Object.entries(variants).map(([mode,v])=>{
    if(!['day','night'].includes(mode)||!/^lightmap-[a-z]+\.(png|exr)$|^lightmap\.jpg$/.test(v.file) ||
      !(Number.isFinite(v.scale)&&v.scale>0)||!(Number.isFinite(v.exposure ?? 1)&&(v.exposure ?? 1)>0))
      throw new Error(`bake.json: invalid ${mode} lightmap`);
    return [mode,{lightmap:base+v.file,scale:v.scale*(v.exposure ?? 1)}];
  }));
  return {scene:base+'scene.glb',modes};
}
