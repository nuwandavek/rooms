import * as THREE from 'three';

// Simple items built at load time from an inventory row's Dims and Colour, with no
// library file: write `@frame`, `@mirror`, `@mirror-arch`, `@rug`, `@curtain`, `@glass`, `@box`,
// `@basin` (a round or oval vessel basin, by Dims), `@basin-rect` or `@tap` in the Model column. Like library models they rest on y = 0, are centered on x/z,
// and face +z; the size is exactly w×h×d. Wall-hung items are placed with a `y` height.
export const PRIMITIVES=['box','frame','mirror','mirror-arch','rug','curtain','glass','basin','basin-rect','tap','ceiling-light'];

const material=(colour,extra={})=>new THREE.MeshStandardMaterial({color:colour,roughness:.8,metalness:0,...extra});
function slab(group,[w,h,d],[x,y,z],mat) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y+h/2,z);group.add(mesh);return mesh;
}
// A frame's border and a flat inset face (print or glass).
function framed(group,[w,h,d],border,face) {
  const b=Math.min(.035,w/6,h/6);
  slab(group,[w,b,d],[0,0,0],border);slab(group,[w,b,d],[0,h-b,0],border);
  slab(group,[b,h-2*b,d],[-(w-b)/2,b,0],border);slab(group,[b,h-2*b,d],[(w-b)/2,b,0],border);
  const pane=slab(group,[w-2*b,h-2*b,d*.4],[0,b,-d*.2],face);
  // The front of the pane, for a real reflection on the Realistic tab (kit/realistic.js).
  pane.userData.mirrorFace={geometry:()=>new THREE.PlaneGeometry(w-2*b,h-2*b),position:[0,h/2,.001]};
  return pane;
}
const textures=new Map();
function artMaterial(url) {
  if(!textures.has(url)){const t=new THREE.TextureLoader().load(url);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;textures.set(url,t);}
  return material('#ffffff',{map:textures.get(url),roughness:.85});
}

// A vessel basin turned from a wall profile (radius, height on a unit bowl): a narrow foot,
// a flared wall, a thin rim and a hollow inside down to a drain. Four sides make it
// rectangular; scaled to w×h×d.
const BASIN=[[0,0],[.55,0],[.62,.03],[.85,.35],[.97,.75],[1,1],[.955,1],[.925,.78],[.82,.42],[.6,.14],[0,.1]];
function basin(group,[w,h,d],colour,sides) {
  const square=sides===4,k=square?Math.SQRT2:1;  // a 4-sided lathe's corners sit at radius 1
  const geometry=new THREE.LatheGeometry(BASIN.map(([r,y])=>new THREE.Vector2(r*k,y)),sides,square?Math.PI/4:0);
  geometry.scale(w/2,h,d/2);
  const ceramic=material(colour || '#f7f7f5',{roughness:.12,flatShading:square});
  group.add(new THREE.Mesh(square?geometry.toNonIndexed():geometry,ceramic));
  const drain=new THREE.Mesh(new THREE.CircleGeometry(Math.min(w,d)*.06,24),material('#b9bcbf',{roughness:.2,metalness:.9}));
  drain.rotation.x=-Math.PI/2;drain.position.y=h*.1+.002;group.add(drain);
}
// A chrome basin tap: a column at the back rising to h, an arm reaching d forward, a nozzle.
function tap(group,[w,h,d],colour) {
  const chrome=material(colour || '#d9dcdf',{roughness:.12,metalness:1}),r=w/2;
  const column=new THREE.Mesh(new THREE.CylinderGeometry(r*.8,r,h-r,24),chrome);column.position.set(0,(h-r)/2,-d/2+r);group.add(column);
  const arm=new THREE.Mesh(new THREE.CylinderGeometry(r*.55,r*.55,d-r,20),chrome);arm.rotation.x=Math.PI/2;arm.position.set(0,h-r*.8,r/2);group.add(arm);
  const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(r*.5,r*.5,r*1.4,20),chrome);nozzle.position.set(0,h-r*1.4,d/2-r*.55);group.add(nozzle);
}

// `art` is an image (a print cropped from the listing photos) shown inside a @frame.
export function buildPrimitive(name,[w,h,d],colour,art=null) {
  const group=new THREE.Group();
  const glass=material('#cfdade',{roughness:.08,metalness:.85});
  if(name==='box')slab(group,[w,h,d],[0,0,0],material(colour || '#e6e1d8'));
  else if(name==='ceiling-light') {
    const housing=new THREE.Mesh(new THREE.CylinderGeometry(w/2,w/2,h,48),material(colour || '#f5f5f2',{roughness:.5}));
    housing.scale.z=d/w;housing.position.y=h/2;group.add(housing);
    const diffuserMaterial=material('#ffffff',{emissive:'#fff3dd',emissiveIntensity:1.5,roughness:.8});
    diffuserMaterial.name='Ceiling diffuser';
    const diffuser=new THREE.Mesh(new THREE.CircleGeometry(w*.44,48),diffuserMaterial);
    diffuser.rotation.x=Math.PI/2;diffuser.scale.y=d/w;diffuser.position.y=-.001;
    diffuser.userData.bakeEmitter=true;group.add(diffuser);
  }
  else if(name==='frame')framed(group,[w,h,d],material(colour || '#1f1f1f'),art?artMaterial(art):material('#ece4d8')).userData.mirrorFace=null;
  else if(name==='mirror')framed(group,[w,h,d],material(colour || '#1f1f1f'),glass);
  else if(name==='mirror-arch') {
    // Rectangle with a semicircular top, extruded to depth d; glass set slightly back.
    const shape=(inset)=>{const r=w/2-inset,s=new THREE.Shape();
      s.moveTo(-r,inset);s.lineTo(r,inset);s.lineTo(r,h-w/2);s.absarc(0,h-w/2,r,0,Math.PI,false);s.lineTo(-r,inset);return s;};
    const outer=shape(0);outer.holes.push(shape(Math.min(.03,w/8)));
    const extrude=(s,depth)=>new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false}).translate(0,0,-depth/2);
    group.add(new THREE.Mesh(extrude(outer,d),material(colour || '#1f1f1f')));
    const pane=new THREE.Mesh(extrude(shape(Math.min(.03,w/8)),d*.4),glass);pane.position.z=-d*.2;group.add(pane);
    pane.userData.mirrorFace={geometry:()=>new THREE.ShapeGeometry(shape(Math.min(.03,w/8)),24),position:[0,0,.001]};
  }
  else if(name==='basin')basin(group,[w,h,d],colour,48);
  else if(name==='basin-rect')basin(group,[w,h,d],colour,4);
  else if(name==='tap')tap(group,[w,h,d],colour);
  else if(name==='glass')slab(group,[w,h,d],[0,0,0],material(colour || '#dfeef0',{roughness:.05,transparent:true,opacity:.28,depthWrite:false}));
  else if(name==='rug')slab(group,[w,h,d],[0,0,0],material(colour || '#9a9a96',{roughness:1}));
  else if(name==='curtain') {
    // A gathered panel: a plane folded in a sine wave, d deep from crest to crest.
    const geometry=new THREE.PlaneGeometry(w,h,Math.max(8,Math.round(w*24)),1);
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getX(i)/w*Math.PI*2*Math.max(2,w*6))*d/2);
    geometry.computeVertexNormals();geometry.translate(0,h/2,0);
    group.add(new THREE.Mesh(geometry,material(colour || '#f4f1ea',{side:THREE.DoubleSide,transparent:true,opacity:.82})));
  }
  else throw new Error(`Unknown primitive @${name}`);
  return group;
}

// Scales a library model to w×h×d (it is already centered with its base at y = 0) and
// pulls its colours toward a hint, so models from different packs read as one set.
export function fitModel(object,dims,colour) {
  if(dims) {
    const size=new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    object.scale.set(dims[0]/size.x || 1,dims[1]/size.y || 1,dims[2]/size.z || 1);
  }
  if(colour) {
    // Mix in display (sRGB) space; a linear mix leaves dark targets looking brown.
    const target=new THREE.Color(colour).convertLinearToSRGB();
    object.traverse(o=>{if(o.isMesh)o.material=[o.material].flat().map(m=>{
      if(m.map?.image&&!m.transparent)return recolour(m,new THREE.Color(colour));
      const tinted=m.clone();
      if(tinted.color)tinted.color.convertLinearToSRGB().lerp(target,.85).convertSRGBToLinear();
      return tinted;
    });if(o.isMesh&&o.material.length===1)o.material=o.material[0];});
  }
  return object;
}

// Textured models (photoreal furniture) can only be darkened by a colour multiply, so
// instead the texture's brightness is kept and its colour replaced: dark leather becomes
// cream leather with the same folds. Brightness is normalised by the texture's average.
const averages=new WeakMap();
function averageLuminance(image) {
  if(averages.has(image))return averages.get(image);
  let value=.5;
  try {
    const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d');
    g.drawImage(image,0,0,16,16);const d=g.getImageData(0,0,16,16).data;let sum=0;
    for(let i=0;i<d.length;i+=4)sum+=((.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255)**2.2;
    value=Math.max(.02,sum/(d.length/4));
  } catch { /* Unreadable image: keep the default. */ }
  averages.set(image,value);return value;
}
function recolour(source,colour) {
  const material=source.clone();material.color.set('#ffffff');
  const average=averageLuminance(source.map.image);
  material.onBeforeCompile=shader=>{
    shader.uniforms.recolour={value:colour};shader.uniforms.averageLuminance={value:average};
    shader.fragmentShader='uniform vec3 recolour;\nuniform float averageLuminance;\n'+shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\nfloat recolourL=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));\ndiffuseColor.rgb=recolour*clamp(recolourL/averageLuminance,0.,1.8);');
  };
  material.customProgramCacheKey=()=>'recolour';
  return material;
}
