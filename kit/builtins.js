import * as THREE from 'three';
import {buildMaterial} from './materials.js';
import {metreUVs} from './geometry.js';

// Built-ins from fitout.json, generated from their declarations (see kit/fitout.js).
// Each part keeps `userData.bottom` so the viewer can hide parts above the wall cutaway.
const groove=new THREE.MeshStandardMaterial({color:'#2b2a28',roughness:.8});
const steel=new THREE.MeshStandardMaterial({color:'#b8bcbf',roughness:.25,metalness:.8});
const plain=new THREE.MeshStandardMaterial({color:'#e8e3da',roughness:.7});

export function buildBuiltins(fitout,realistic=false) {
  const group=new THREE.Group();group.name=realistic?'Built-ins (realistic)':'Built-ins';
  const material=id=>id&&fitout.materials[id] ? buildMaterial(id,fitout.materials[id],realistic) : plain;
  for(const b of fitout.builtins || [])if(b.type==='counter')group.add(counter(b,material));
  return group;
}

function counter(b,material) {
  const group=new THREE.Group(),side=b.side==='left'?-1:1,depth=b.depth,height=b.height;
  const top=b.thickness ?? .04,plinth=b.plinth?.1:0;
  let travelled=0;
  b.path.slice(1).forEach((end,i)=>{
    const start=b.path[i],length=Math.hypot(end[0]-start[0],end[1]-start[1]);
    const ux=(end[0]-start[0])/length,uz=(end[1]-start[1])/length;
    // Local +x runs along the path and local +z into the room (the right of travel).
    const run=new THREE.Group();run.position.set(start[0],0,start[1]);run.rotation.y=Math.atan2(-uz,ux);
    run.scale.z=side;group.add(run);
    const part=(w,h,d,x0,y0,z0,mat,bottom=y0)=>{
      if(w<=.001||h<=.001||d<=.001)return;
      const geometry=new THREE.BoxGeometry(w,h,d);metreUVs(geometry,w,h,d,x0,y0);
      const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x0+w/2,y0+h/2,z0+d/2);
      mesh.castShadow=mesh.receiveShadow=true;mesh.userData.bottom=bottom;run.add(mesh);return mesh;
    };
    // After a corner, start past the previous run's depth so parts do not overlap.
    const from=i?depth:0,body=height-top-plinth;
    // Without base or plinth the counter is a floating slab (bath vanities).
    if(b.plinth)part(length-from,plinth,depth-.06,from,0,0,material(b.plinth));
    if(b.base) {
      part(length-from,body,depth-.02,from,plinth,0,material(b.base));
      for(let x=from+.6;x<length-.1;x+=.6)part(.006,body-.04,.004,x-.003,plinth+.02,depth-.02,groove,0);
    }
    part(length-(i?depth+.02:0),top,depth+.02,i?depth+.02:0,height-top,0,material(b.top));
    if(b.sink&&b.sink.at>=travelled+from&&b.sink.at<travelled+length)
      part(b.sink.width,.006,.45,b.sink.at-travelled-b.sink.width/2,height,(depth-.45)/2,steel);
    if(b.uppers) {
      const u=b.uppers,ufrom=i?u.depth:0,h=u.top-u.bottom;
      part(length-ufrom,h,u.depth,ufrom,u.bottom,0,material(u.material));
      for(let x=ufrom+.6;x<length-.1;x+=.6)part(.006,h-.04,.004,x-.003,u.bottom+.02,u.depth,groove,u.bottom);
    }
    travelled+=length;
  });
  return group;
}
