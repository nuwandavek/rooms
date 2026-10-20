import * as THREE from 'three';

// Simple items built at load time from an inventory row's Dims and Colour, with no
// library file: write `@frame`, `@mirror`, `@mirror-arch`, `@rug`, `@curtain` or `@box`
// in the Model column. Like library models they rest on y = 0, are centered on x/z,
// and face +z; the size is exactly w×h×d. Wall-hung items are placed with a `y` height.
export const PRIMITIVES=['box','frame','mirror','mirror-arch','rug','curtain'];

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
  slab(group,[w-2*b,h-2*b,d*.4],[0,b,-d*.2],face);
}

export function buildPrimitive(name,[w,h,d],colour) {
  const group=new THREE.Group();
  const glass=material('#cfdade',{roughness:.08,metalness:.85});
  if(name==='box')slab(group,[w,h,d],[0,0,0],material(colour || '#e6e1d8'));
  else if(name==='frame')framed(group,[w,h,d],material(colour || '#1f1f1f'),material('#ece4d8'));
  else if(name==='mirror')framed(group,[w,h,d],material(colour || '#1f1f1f'),glass);
  else if(name==='mirror-arch') {
    // Rectangle with a semicircular top, extruded to depth d; glass set slightly back.
    const shape=(inset)=>{const r=w/2-inset,s=new THREE.Shape();
      s.moveTo(-r,inset);s.lineTo(r,inset);s.lineTo(r,h-w/2);s.absarc(0,h-w/2,r,0,Math.PI,false);s.lineTo(-r,inset);return s;};
    const outer=shape(0);outer.holes.push(shape(Math.min(.03,w/8)));
    const extrude=(s,depth)=>new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false}).translate(0,0,-depth/2);
    group.add(new THREE.Mesh(extrude(outer,d),material(colour || '#1f1f1f')));
    const pane=new THREE.Mesh(extrude(shape(Math.min(.03,w/8)),d*.4),glass);pane.position.z=-d*.2;group.add(pane);
  }
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
    const target=new THREE.Color(colour);
    object.traverse(o=>{if(o.isMesh)o.material=[o.material].flat().map(m=>{
      const tinted=m.clone();tinted.color?.lerp(target,.8);return tinted;
    });if(o.isMesh&&o.material.length===1)o.material=o.material[0];});
  }
  return object;
}
