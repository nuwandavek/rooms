#!/usr/bin/env node
// Writes simple box-built blockout models to library/<id>.glb. Run: node library/blockouts.mjs
// Units are metres; models sit on y=0, centered on x/z, front facing +z.
// These stand in for sizing and placement until a sourced or better-made model replaces them.
import {writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
// [width, height, depth, x, y(bottom), z, colour]
const models={
  'bed-queen':{note:'Queen bed, 1.6 × 2.0 m mattress, upholstered headboard',boxes:[
    [1.7,.3,2.1,0,.1,0,'#d9d4cc'],          // base
    [1.6,.22,2.0,0,.4,.03,'#f4f2ee'],       // mattress
    [1.7,.75,.08,0,.35,-1.03,'#b9bcc0'],    // headboard
    [.55,.12,.35,-.4,.62,-.75,'#ffffff'],[.55,.12,.35,.4,.62,-.75,'#ffffff'], // pillows
    [1.62,.03,.5,0,.62,.55,'#9aa0a6'],      // throw
    ...[[-.8,-1],[.8,-1],[-.8,1],[.8,1]].map(([x,z])=>[.06,.1,.06,x,0,z,'#5a4a3a']),
  ]},
  'sofa-3seat':{note:'Three-seat sofa, 2.0 m wide, velvet',boxes:[
    [2.0,.2,.9,0,.15,0,'#d98fa0'],          // base
    [1.76,.14,.72,0,.35,.06,'#e5a3b2'],     // seat cushion
    [2.0,.45,.18,0,.35,-.36,'#d98fa0'],     // back
    [.12,.3,.9,-.94,.35,0,'#d98fa0'],[.12,.3,.9,.94,.35,0,'#d98fa0'], // arms
    ...[[-.9,-.38],[.9,-.38],[-.9,.38],[.9,.38]].map(([x,z])=>[.04,.15,.04,x,0,z,'#222222']),
  ]},
};

function box([w,h,d,x,y,z]) {
  const [a,b,c]=[w/2,h,d/2],faces=[
    [[1,0,0],[[a,0,c],[a,0,-c],[a,b,-c],[a,b,c]]],[[-1,0,0],[[-a,0,-c],[-a,0,c],[-a,b,c],[-a,b,-c]]],
    [[0,1,0],[[-a,b,c],[a,b,c],[a,b,-c],[-a,b,-c]]],[[0,-1,0],[[-a,0,-c],[a,0,-c],[a,0,c],[-a,0,c]]],
    [[0,0,1],[[-a,0,c],[a,0,c],[a,b,c],[-a,b,c]]],[[0,0,-1],[[a,0,-c],[-a,0,-c],[-a,b,-c],[a,b,-c]]],
  ];
  const positions=[],normals=[],indices=[];
  faces.forEach(([n,corners],f)=>{
    for(const [px,py,pz] of corners){positions.push(px+x,py+y,pz+z);normals.push(...n);}
    indices.push(f*4,f*4+1,f*4+2,f*4,f*4+2,f*4+3);
  });
  return {positions,normals,indices};
}

const linear=hex=>[1,3,5].map(i=>(parseInt(hex.slice(i,i+2),16)/255)**2.2);
function glb(boxes) {
  const colours=[...new Set(boxes.map(b=>b[6]))];
  const chunks=[],bufferViews=[],accessors=[],meshes=[],nodes=[];let offset=0;
  const add=(array,target)=>{
    const bytes=Buffer.from(array.buffer);const pad=(4-bytes.length%4)%4;
    chunks.push(bytes,Buffer.alloc(pad));bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});
    offset+=bytes.length+pad;return bufferViews.length-1;
  };
  for(const b of boxes) {
    const {positions,normals,indices}=box(b),p=new Float32Array(positions);
    const min=[0,1,2].map(i=>Math.min(...p.filter((_,j)=>j%3===i))),max=[0,1,2].map(i=>Math.max(...p.filter((_,j)=>j%3===i)));
    accessors.push({bufferView:add(p,34962),componentType:5126,count:p.length/3,type:'VEC3',min,max});
    accessors.push({bufferView:add(new Float32Array(normals),34962),componentType:5126,count:p.length/3,type:'VEC3'});
    accessors.push({bufferView:add(new Uint16Array(indices),34963),componentType:5123,count:indices.length,type:'SCALAR'});
    const n=accessors.length;
    meshes.push({primitives:[{attributes:{POSITION:n-3,NORMAL:n-2},indices:n-1,material:colours.indexOf(b[6])}]});
    nodes.push({mesh:meshes.length-1});
  }
  const bin=Buffer.concat(chunks);
  const json={asset:{version:'2.0',generator:'rooms library/blockouts.mjs'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,accessors,bufferViews,
    buffers:[{byteLength:bin.length}],materials:colours.map(c=>({pbrMetallicRoughness:{baseColorFactor:[...linear(c),1],metallicFactor:0,roughnessFactor:.85}}))};
  let text=Buffer.from(JSON.stringify(json));text=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,0x20)]);
  const header=Buffer.alloc(12);header.writeUInt32LE(0x46546C67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+text.length+8+bin.length,8);
  const chunk=(data,type)=>{const h=Buffer.alloc(8);h.writeUInt32LE(data.length,0);h.writeUInt32LE(type,4);return Buffer.concat([h,data]);};
  return Buffer.concat([header,chunk(text,0x4E4F534A),chunk(bin,0x004E4942)]);
}

for(const [id,{boxes}] of Object.entries(models)) {
  await writeFile(resolve(here,`${id}.glb`),glb(boxes));
  console.log(`library/${id}.glb`);
}
