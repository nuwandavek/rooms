import * as THREE from 'three';

// What Walk mode sees through the windows: a gradient sky, a street level below the
// flat (`storey` floors of ~3 m), and a ring of plain towers. One instanced mesh, no
// files. Windows are drawn in the shader from world position, so every tower gets
// floors and bays at true scale; at night a random share of them light up.
const SKY={day:{top:'#8fb6dc',horizon:'#e6ecef',ground:'#9c9a94'},night:{top:'#070d22',horizon:'#27304d',ground:'#1a1b20'}};

function random(seed) {
  let s=seed>>>0;
  return ()=>{s=Math.imul(s^s>>>15,2246822507)+0x6d2b79f5;s=Math.imul(s^s>>>13,3266489909);return ((s^=s>>>16)>>>0)/4294967296;};
}

export function createSurroundings({center,span,storey=3,seed=1}) {
  const group=new THREE.Group();group.name='Surroundings';group.visible=false;
  const street=-Math.max(1,storey)*3;
  const rand=random(seed);

  // Sky dome: a vertical gradient, ignoring fog and tone mapping so it stays soft.
  const sky=new THREE.Mesh(new THREE.SphereGeometry(900,32,16),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,
    uniforms:{top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},ground:{value:new THREE.Color()}},
    vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 top;uniform vec3 horizon;uniform vec3 ground;varying vec3 vDir;
      void main(){float h=vDir.y;vec3 c=h>0.?mix(horizon,top,pow(h,.6)):mix(horizon,ground,min(1.,-h*6.));gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
      }`,
  }));
  sky.position.copy(center);sky.renderOrder=-1;group.add(sky);

  // Street level: city blocks drawn on a canvas, 80 m apart, with roads, lane markings,
  // pavements, parks and plazas. Towers stand inside the blocks (see below).
  const BLOCK=80,ROAD=14,blocks=20,size=BLOCK*blocks;
  const kinds=[];  // per block: 'tower' | 'park' | 'plaza'
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;const g=canvas.getContext('2d'),px=2048/size;
  g.fillStyle='#6f6f6c';g.fillRect(0,0,2048,2048);
  for(let i=0;i<blocks;i++)for(let j=0;j<blocks;j++) {
    const r=rand(),kind=r<.14?'park':r<.22?'plaza':'tower';kinds.push(kind);
    const x=(i*BLOCK+ROAD/2)*px,y=(j*BLOCK+ROAD/2)*px,w=(BLOCK-ROAD)*px;
    g.fillStyle='#b9b5ad';g.fillRect(x,y,w,w);  // pavement
    const inset=2.5*px;g.fillStyle=kind==='park'?'#6d8f4e':kind==='plaza'?'#cfc8bb':'#a7a39b';
    g.fillRect(x+inset,y+inset,w-2*inset,w-2*inset);
    if(kind==='park'){g.fillStyle='#5a7c3f';for(let k=0;k<14;k++){g.beginPath();g.arc(x+inset+rand()*(w-2*inset),y+inset+rand()*(w-2*inset),(2+rand()*3)*px,0,7);g.fill();}}
  }
  g.strokeStyle='#e8e2c8';g.lineWidth=.3*px;g.setLineDash([3*px,4*px]);  // centre lines
  for(let i=0;i<=blocks;i++){const c=i*BLOCK*px;g.beginPath();g.moveTo(c,0);g.lineTo(c,2048);g.moveTo(0,c);g.lineTo(2048,c);g.stroke();}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshStandardMaterial({map,roughness:1}));
  // Centre the grid so the home sits inside a block, not on a road.
  const origin=new THREE.Vector3(center.x-size/2+BLOCK/2,street,center.z-size/2+BLOCK/2);
  ground.rotation.x=-Math.PI/2;ground.position.set(origin.x+size/2-BLOCK/2,street,origin.z+size/2-BLOCK/2);group.add(ground);

  // Towers: a ring from just beyond the plot out to the horizon, taller further away.
  const count=400,geometry=new THREE.BoxGeometry(1,1,1).translate(0,.5,0);
  const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85});
  const uniforms={night:{value:0}};
  material.onBeforeCompile=shader=>{
    shader.uniforms.night=uniforms.night;
    shader.vertexShader='varying vec3 vCityPos;varying vec3 vCityNormal;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvCityPos=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;vCityNormal=normalize(mat3(modelMatrix*instanceMatrix)*objectNormal);');
    shader.fragmentShader='uniform float night;varying vec3 vCityPos;varying vec3 vCityNormal;\nfloat cityHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n'+shader.fragmentShader
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        float side=1.-step(.5,abs(vCityNormal.y));
        vec2 cell=vec2(dot(vCityPos.xz,normalize(vec2(-vCityNormal.z,vCityNormal.x))),vCityPos.y)/vec2(2.6,3.1);
        vec2 f=fract(cell);float pane=side*step(.18,f.x)*step(f.x,.82)*step(.25,f.y)*step(f.y,.8);
        float lit=step(.62,cityHash(floor(cell)+floor(vCityPos.xz/40.)));
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.55+vec3(.05,.07,.1),pane*(1.-night));
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.25,night);
        totalEmissiveRadiance+=pane*lit*night*vec3(1.,.78,.45)*1.4+night*vec3(.03,.035,.055);`);
  };
  material.customProgramCacheKey=()=>'city';
  const towers=new THREE.InstancedMesh(geometry,material,count);
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),palette=['#d9d4cb','#c9c6c0','#e4dfd6','#b9bec4','#cfc3b3','#a9aeb3'];
  // One or two towers per 'tower' block, skipping the home's own block and its neighbours.
  let n=0;
  for(let i=0;i<blocks&&n<count;i++)for(let j=0;j<blocks&&n<count;j++) {
    if(kinds[i*blocks+j]!=='tower')continue;
    const bx=origin.x-BLOCK/2+i*BLOCK+BLOCK/2,bz=origin.z-BLOCK/2+j*BLOCK+BLOCK/2;
    const distance=Math.hypot(bx-center.x,bz-center.z);if(distance<BLOCK*1.2)continue;
    const per=rand()<.5?1:2,room=(BLOCK-ROAD-8)/per;
    for(let k=0;k<per&&n<count;k++) {
      const w=Math.min(room,14+rand()*20),d=Math.min(BLOCK-ROAD-8,14+rand()*28),h=(12+rand()**2.2*60)*(.5+distance/350);
      const ox=per===2?(k-.5)*room:0;
      q.setFromAxisAngle(new THREE.Vector3(0,1,0),rand()<.5?0:Math.PI/2);
      m.compose(new THREE.Vector3(bx+ox,street,bz+(rand()-.5)*(BLOCK-ROAD-8-d)),q,new THREE.Vector3(w,h,d));
      towers.setMatrixAt(n,m);towers.setColorAt(n,new THREE.Color(palette[Math.floor(rand()*palette.length)]));n++;
    }
  }
  towers.count=n;
  towers.frustumCulled=false;group.add(towers);
  const fog=new THREE.Fog('#e6ecef',120,800);

  return {group,fog,
    setNight(value) {
      const c=SKY[value?'night':'day'];
      sky.material.uniforms.top.value.set(c.top);sky.material.uniforms.horizon.value.set(c.horizon);sky.material.uniforms.ground.value.set(c.ground);
      fog.color.set(c.horizon);ground.material.color.set(value?'#3a3b44':'#ffffff');uniforms.night.value=value?1:0;
    },
  };
}
