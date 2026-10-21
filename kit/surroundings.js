import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// What Walk mode sees through the windows: a neighbourhood built from Kenney's CC0 city
// kits on their shared 8 m tile grid, under a gradient sky, with the street `storey`
// floors below the flat. `style` is 'city' (mid-rise blocks, towers, busy streets) or
// 'suburb' (houses on lots, gardens, quiet streets). Every model is drawn as one
// instanced mesh, so a few thousand trees, cars and buildings cost a few dozen draws.
// The layout is seeded, so a home always looks out at the same streets.
const T=8;  // metres per tile
const L='abcdefghijklmn'.split('');
const ids=(prefix,list)=>list.map(x=>`${prefix}${x}`);
export const SCENE_MODELS={
  roads:['road-straight','road-crossroad','road-crossing','road-light-curved','road-light-square-double','road-traffic-light'],
  cityLow:ids('city-building-',['a','b','c','d','h']),
  cityNear:ids('city-building-',['a','b','c','d','f','g','h','i','l','m']),
  cityWide:ids('city-building-',['e','j','k','n']),
  cityTall:ids('city-building-skyscraper-',['a','b','c','d','e']),
  cityFar:[...ids('city-low-detail-building-',L),'city-low-detail-building-wide-a','city-low-detail-building-wide-b'],
  houses:ids('suburb-building-type-','abcdefghijklmnopqrstu'.split('')),
  yard:['suburb-fence-1x3','suburb-driveway-short','suburb-planter','suburb-tree-large','suburb-tree-small'],
  trees:['nature-tree-default','nature-tree-oak','nature-tree-detailed','nature-tree-fat','nature-tree-simple','nature-tree-small','nature-tree-cone','forest-tree','forest-tree-high'],
  streetTrees:['nature-tree-default','nature-tree-oak','nature-tree-fat','forest-tree'],
  bushes:['nature-plant-bush','nature-plant-bush-large','nature-plant-bush-detailed','forest-plant','nature-grass-large'],
  flowers:['nature-flower-red-a','nature-flower-yellow-a','nature-flower-purple-a'],
  cars:ids('car-',['sedan','sedan','sedan-sports','hatchback-sports','suv','suv','suv-luxury','taxi','taxi','van','delivery','truck','police','ambulance','garbage-truck']),
};
const SKY={day:{top:'#8fb6dc',horizon:'#e6ecef',ground:'#9c9a94'},night:{top:'#0b1430',horizon:'#3a4766',ground:'#1a1b20'}};
const STYLES={
  city:{px:6,pz:6,kinds:[['buildings',.74],['park',.16],['plaza',.10]],traffic:.38},
  suburb:{px:9,pz:5,kinds:[['houses',.86],['park',.14]],traffic:.12},
};

function random(seed) {
  let s=seed>>>0;
  return ()=>{s=Math.imul(s^s>>>15,2246822507)+0x6d2b79f5;s=Math.imul(s^s>>>13,3266489909);return ((s^=s>>>16)>>>0)/4294967296;};
}

export function createSurroundings({center,storey=3,style='city',seed=7,models={}}) {
  const group=new THREE.Group();group.name='Surroundings';group.visible=false;
  const street=-Math.max(1,storey)*3;
  const rand=random(seed),pickFrom=list=>list[Math.floor(rand()*list.length)];
  const S=STYLES[style] || STYLES.city,N=64,size=N*T;  // 512 m across; fog hides the edge.

  // Sky dome: a vertical gradient that ignores fog and tone mapping.
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1200,32,16),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,
    uniforms:{top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},ground:{value:new THREE.Color()}},
    vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 top;uniform vec3 horizon;uniform vec3 ground;varying vec3 vDir;
      void main(){float h=vDir.y;vec3 c=h>0.?mix(horizon,top,pow(h,.6)):mix(horizon,ground,min(1.,-h*6.));gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
      }`,
  }));
  sky.position.copy(center);sky.renderOrder=-1;sky.layers.set(1);group.add(sky);  // Layer 1: outdoors, never drawn in mirrors.
  const fog=new THREE.Fog('#e6ecef',140,470);

  // The grid: tile (i,j) has its centre at origin + (i,j)*T. The home sits in the middle
  // of a block, so the block's own tiles become its garden.
  const hi=Math.floor(N/2/S.px)*S.px+Math.floor(S.px/2),hj=Math.floor(N/2/S.pz)*S.pz+Math.floor(S.pz/2);
  const origin=new THREE.Vector3(center.x-hi*T,street,center.z-hj*T);
  const at=(i,j)=>[origin.x+i*T,origin.z+j*T];
  const isRoad=(i,j)=>i%S.px===0||j%S.pz===0;
  const blockOf=(i,j)=>[Math.floor(i/S.px),Math.floor(j/S.pz)];
  const homeBlock=blockOf(hi,hj).join();
  const blockKind=new Map();
  const [hbi,hbj]=blockOf(hi,hj);
  const kindFor=key=>{
    if(key===homeBlock)return 'garden';
    // The blocks around the home stay open (half parks) so the windows have a view.
    const [bi,bj]=key.split(',').map(Number),next=Math.abs(bi-hbi)<=1&&Math.abs(bj-hbj)<=1;
    if(next&&!blockKind.has(key))blockKind.set(key,rand()<.5?'park':S.kinds[0][0]);
    if(!blockKind.has(key)){let r=rand(),kind=S.kinds[0][0];for(const [k,p] of S.kinds){if(r<p){kind=k;break;}r-=p;}blockKind.set(key,kind);}
    return blockKind.get(key);
  };

  // Ground: one texel per tile (lawn, pavement or plaza) under the road tiles.
  const data=new Uint8Array(N*N*4),colour=new THREE.Color();
  for(let j=0;j<N;j++)for(let i=0;i<N;i++) {
    const kind=isRoad(i,j)?'road':kindFor(blockOf(i,j).join());
    colour.set({road:'#6e6e6c',buildings:'#c9c4ba',plaza:'#ddd5c6',park:'#79a356',garden:'#7fae5a',houses:'#86b25e'}[kind]).convertLinearToSRGB();
    const k=((N-1-j)*N+i)*4;data.set([colour.r*255,colour.g*255,colour.b*255,255],k);
  }
  const groundMap=new THREE.DataTexture(data,N,N);groundMap.magFilter=THREE.NearestFilter;groundMap.colorSpace=THREE.SRGBColorSpace;groundMap.needsUpdate=true;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshStandardMaterial({map:groundMap,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.set(origin.x+size/2-T/2,street-.02,origin.z+size/2-T/2);ground.layers.set(1);group.add(ground);

  // Layout: a list of [model id, x, z, heading, scale] for every object.
  const items=[],lamps=[];
  const put=(id,x,z,heading=0,scale=1)=>{if(id)items.push([id,x,z,heading,scale]);};
  const jitter=k=>(rand()-.5)*k;
  const distanceTo=(x,z)=>Math.hypot(x-center.x,z-center.z);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++) {
    const [x,z]=at(i,j),far=distanceTo(x,z);
    if(far>size/2)continue;
    if(isRoad(i,j)) {
      const alongX=j%S.pz===0,alongZ=i%S.px===0;
      if(alongX&&alongZ){put('road-crossroad',x,z);if(far<300&&rand()<.5)put('road-traffic-light',x+3.4,z+3.4,Math.PI);continue;}
      // Crossings next to junctions, plain road elsewhere. Straight tiles run along x.
      const nearJunction=alongX?(i%S.px===1||i%S.px===S.px-1):(j%S.pz===1||j%S.pz===S.pz-1);
      const heading=alongX?0:Math.PI/2;
      put(nearJunction&&rand()<.4?'road-crossing':'road-straight',x,z,heading);
      if(far>200)continue;
      // Street trees and lights on the pavements, cars in both lanes.
      const side=(o,s)=>alongX?[x+o,z+s]:[x+s,z+o];
      if(far<120&&rand()<.5){const [tx,tz]=side(jitter(3),rand()<.5?3.3:-3.3);put(pickFrom(SCENE_MODELS.streetTrees),tx,tz,rand()*6.3,.8+rand()*.3);}
      if(far<150&&(alongX?i:j)%3===0){const [lx,lz]=side(0,3.6);put(pickFrom(['road-light-curved','road-light-square-double']),lx,lz,heading+Math.PI/2);lamps.push([lx,lz]);}
      for(const lane of [-1.5,1.5])if(far<110&&rand()<S.traffic&&!nearJunction){
        const [cx,cz]=side(jitter(4),lane);put(pickFrom(SCENE_MODELS.cars),cx,cz,heading+(lane>0?Math.PI/2:-Math.PI/2));
      }
      continue;
    }
    const kind=kindFor(blockOf(i,j).join()),li=i%S.px,lj=j%S.pz;
    const edgeW=li===1,edgeE=li===S.px-1,edgeN=lj===1,edgeS=lj===S.pz-1,edge=edgeW||edgeE||edgeN||edgeS;
    // Heading that faces the nearest street (fronts face +z in model space).
    const face=edgeS?0:edgeN?Math.PI:edgeE?Math.PI/2:edgeW?-Math.PI/2:rand()*6.3;
    if(kind==='garden'||kind==='park') {
      // Detail falls off with distance: trees thin out, bushes and flowers only nearby.
      const trees=far>200?(rand()<.3?1:0):kind==='park'?(far>100?1:1+Math.floor(rand()*2)):edge&&rand()<.6?1:0;
      for(let k=0;k<trees;k++)put(pickFrom(SCENE_MODELS.trees),x+jitter(7),z+jitter(7),rand()*6.3,.8+rand()*.5);
      if(far<80)for(let k=0;k<2;k++)put(pickFrom(SCENE_MODELS.bushes),x+jitter(7),z+jitter(7),rand()*6.3,.6+rand()*.5);
      if(far<90&&rand()<.6)for(let k=0;k<4;k++)put(pickFrom(SCENE_MODELS.flowers),x+jitter(6),z+jitter(6),rand()*6.3,.35);
    } else if(kind==='plaza') {
      if(rand()<.45)put(pickFrom(SCENE_MODELS.streetTrees),x+jitter(3),z+jitter(3),rand()*6.3,.9);
      if(rand()<.3)put('suburb-planter',x+jitter(4),z+jitter(4),rand()*6.3);
      if(edge&&rand()<.3)put(pickFrom(SCENE_MODELS.cityNear),x,z,face);
    } else if(kind==='buildings') {
      // Mid-rise blocks line the streets; towers rise further out; the horizon is low detail.
      if(far>230){if(edge||rand()<.4)put(pickFrom(SCENE_MODELS.cityFar),x+jitter(2),z+jitter(2),Math.round(rand()*4)*Math.PI/2,2.2+rand()*1.6);}
      else if(far>80) {
        // Middle distance: towers in about half the street slots, low-detail blocks between.
        if(edge)put(far<160&&rand()<.25?pickFrom(SCENE_MODELS.cityTall):pickFrom(SCENE_MODELS.cityFar),x,z,face,far<160?1.4+rand()*.5:1.9+rand()*1.2);
      }
      else if(edge)put(rand()<.15?pickFrom(SCENE_MODELS.cityWide):pickFrom(far<80?SCENE_MODELS.cityLow:SCENE_MODELS.cityNear),x,z,face);
      else if(rand()<.3)put(pickFrom(SCENE_MODELS.trees),x+jitter(5),z+jitter(5),rand()*6.3);
    } else if(kind==='houses') {
      // Lots along the long sides: a house facing the street, a parked car, garden trees.
      if(far>260){if((edgeN||edgeS)&&li%2===1)put(pickFrom(SCENE_MODELS.houses),x+T/2,z,face);continue;}
      if(edgeN||edgeS) {
        if(li%2===1){
          put(pickFrom(SCENE_MODELS.houses),x+T/2,z+(edgeS?-1:1),face);
          if(far<150&&rand()<.6)put(pickFrom(SCENE_MODELS.cars),x+T/2+5,z+(edgeS?3:-3),face,.95);
        } else put(pickFrom(['suburb-tree-large','suburb-tree-small',...SCENE_MODELS.streetTrees]),x+jitter(4),z+jitter(3),rand()*6.3);
      } else {
        put(pickFrom(SCENE_MODELS.trees),x+jitter(6),z+jitter(6),rand()*6.3,.8+rand()*.4);
        if(rand()<.5)put('suburb-fence-1x3',x,z,face);
        put(pickFrom(SCENE_MODELS.bushes),x+jitter(6),z+jitter(6),rand()*6.3,.7);
      }
    }
  }

  // Night dims the kits toward a moonlit blue; the street lamps carry the light.
  const uniforms={night:{value:0}};
  function nightify(material) {
    material=material.clone();
    material.onBeforeCompile=shader=>{
      shader.uniforms.night=uniforms.night;
      shader.fragmentShader='uniform float night;\n'+shader.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\ndiffuseColor.rgb*=mix(vec3(1.),vec3(.42,.46,.6),night);');
    };
    material.customProgramCacheKey=()=>'city-night';
    return material;
  }

  // Street lamps at night: soft warm glows at the lamp heads (one draw for all of them).
  const glowTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
    const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,220,160,1)');r.addColorStop(.25,'rgba(255,190,110,.55)');r.addColorStop(1,'rgba(255,170,80,0)');
    g.fillStyle=r;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
  const glows=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lamps.flatMap(([x,z])=>[x,street+5,z]),3)),
    new THREE.PointsMaterial({map:glowTexture,size:4.5,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false}));
  glows.visible=false;glows.layers.set(1);group.add(glows);

  let loading=null;
  // Loads the kits the first time Walk opens and builds one instanced mesh per model part.
  function load() {
    if(loading)return loading;
    const wanted=[...new Set(items.map(item=>item[0]))].filter(id=>models[id]);
    const loader=new GLTFLoader(new THREE.LoadingManager());
    loading=Promise.all(wanted.map(id=>loader.loadAsync(models[id]).then(g=>[id,g.scene]).catch(()=>null))).then(async results=>{
      let sliceStart=performance.now();
      const yieldWork=()=>new Promise(resolve=>setTimeout(()=>{sliceStart=performance.now();resolve();},0));
      const scenes=Object.fromEntries(results.filter(Boolean));
      const byModel=new Map();
      const m=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
      for(const [id,x,z,heading,scale] of items) {
        if(!scenes[id])continue;
        const list=byModel.get(id) ?? [];byModel.set(id,list);
        list.push(m.compose(new THREE.Vector3(x,street,z),q.setFromAxisAngle(up,heading),new THREE.Vector3(scale,scale,scale)).clone());
      }
      // Merge everything into chunks: 8 directions around the home x near/far, one mesh per
      // source material. Chunks have bounds, so those outside the view are skipped, and the
      // outdoors draws after the interior so pixels behind walls are rejected early.
      const chunks=new Map();  // key -> {material, geometries:[]}
      const world=new THREE.Matrix4();
      for(const [id,matrices] of byModel) {
        scenes[id].updateMatrixWorld(true);
        const parts=[];scenes[id].traverse(o=>{if(o.isMesh&&!Array.isArray(o.material))parts.push(o);});
        for(const o of parts) {
          const base=o.geometry;
          for(const matrix of matrices) {
            const x=matrix.elements[12],z=matrix.elements[14];
            const sector=Math.floor(((Math.atan2(z-center.z,x-center.x)+Math.PI)/(Math.PI*2))*8)%8;
            const band=Math.hypot(x-center.x,z-center.z)<150?'n':'f';
            // Kits repeat the same texture across files, and flat-coloured parts can share one
            // material once their colour is baked into the vertices: key by texture or 'flat'.
            // Every file embeds its own copy of its kit's single colour-map texture.
            const look=o.material.map?id.split('-')[0]:'flat';
            const key=`${sector}${band}|${look}`;
            const chunk=chunks.get(key) ?? {material:o.material,look,geometries:[]};chunks.set(key,chunk);
            const g=new THREE.BufferGeometry();
            g.setAttribute('position',base.attributes.position.clone());
            g.setAttribute('normal',base.attributes.normal?.clone() ?? new THREE.BufferAttribute(new Float32Array(base.attributes.position.count*3),3));
            g.setAttribute('uv',base.attributes.uv?.clone() ?? new THREE.BufferAttribute(new Float32Array(base.attributes.position.count*2),2));
            g.setIndex(base.index?base.index.clone():[...Array(base.attributes.position.count).keys()]);
            const count=base.attributes.position.count,c=o.material.color ?? new THREE.Color(1,1,1),colours=new Float32Array(count*3);
            for(let k=0;k<count;k++)colours.set([c.r,c.g,c.b],k*3);
            g.setAttribute('color',new THREE.BufferAttribute(colours,3));
            g.applyMatrix4(world.multiplyMatrices(matrix,o.matrixWorld));
            chunk.geometries.push(g);
            if(performance.now()-sliceStart>8)await yieldWork();
          }
        }
      }
      const materials=new Map();
      for(const {material,look,geometries} of chunks.values()) {
        const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
        if(!merged)continue;
        merged.computeBoundingSphere();
        if(!materials.has(look)) {
          const shared=material.map?material.clone():new THREE.MeshStandardMaterial({roughness:.9});
          shared.vertexColors=true;shared.color.set('#ffffff');
          materials.set(look,nightify(shared));
        }
        const mesh=new THREE.Mesh(merged,materials.get(look));
        mesh.layers.set(1);mesh.renderOrder=10;mesh.matrixAutoUpdate=false;group.add(mesh);
        if(performance.now()-sliceStart>8)await yieldWork();
      }
      return true;
    });
    return loading;
  }

  return {group,fog,load,
    get count(){return items.length;},
    setNight(value) {
      const c=SKY[value?'night':'day'];
      sky.material.uniforms.top.value.set(c.top);sky.material.uniforms.horizon.value.set(c.horizon);sky.material.uniforms.ground.value.set(c.ground);
      fog.color.set(c.horizon);ground.material.color.set(value?'#5a5c66':'#ffffff');uniforms.night.value=value?1:0;glows.visible=value;
    },
  };
}
