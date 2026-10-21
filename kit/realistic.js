import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Reflector} from 'three/addons/objects/Reflector.js';

// The Realistic tab: the furnished home with image-based lighting, neutral tone
// mapping, ambient occlusion, antialiasing, contact shadows and lamps that emit.
// Everything here is switched on only while that tab shows, so authoring tabs stay fast.
export function createRealistic({renderer,scene,home,lights,furniture}) {
  let on=false,night=false,baked=false,environment=null,size=[1,1];
  const composers=new Map();  // One per camera: GTAO is built for one projection type.
  const saved={};

  // Soft shadow pads under floor-standing items, sized to each footprint.
  const pads=new THREE.Group();pads.name='Contact shadows';pads.visible=false;scene.add(pads);
  const padTexture=(()=>{
    const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
    const grad=g.createRadialGradient(64,64,8,64,64,64);
    grad.addColorStop(0,'rgba(0,0,0,0.55)');grad.addColorStop(.6,'rgba(0,0,0,0.25)');grad.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=grad;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
  })();
  const padMaterial=new THREE.MeshBasicMaterial({map:padTexture,transparent:true,depthWrite:false,toneMapped:false});
  // Lamps: a warm point light at each lighting item's shade.
  const lamps=new THREE.Group();lamps.name='Lamp lights';lamps.visible=false;scene.add(lamps);
  const kindOf=p=>(home.inventory || []).find(a=>a.name===p.asset&&a.room===p.room)?.kind;
  for(const p of home.placements || []) {
    const [w,h,d]=p.dims || [0,0,0];
    if(kindOf(p)==='lighting'&&!/sconce/i.test(p.asset)) {
      const light=new THREE.PointLight(p.light?.colour || 0xffd6a0,p.light?.intensity ?? (p.y>1.5?2.2:1.4),4.5,2);
      light.userData.base=light.intensity;light.userData.radius=p.light?.radius ?? .08;
      light.userData.dayFactor=p.light?.dayFactor;
      light.position.fromArray(p.light?.offset || [0,h*.8,0]).applyAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(p.rotation || 0));
      light.position.add(new THREE.Vector3(p.at[0],(p.y || 0)+.016,p.at[1]));lamps.add(light);
    }
    if(!(p.y>.05)&&w&&d&&!/^@(rug|curtain|glass)$/.test(p.model)) {
      const pad=new THREE.Mesh(new THREE.PlaneGeometry(w*1.25,d*1.25),padMaterial);
      pad.rotation.set(-Math.PI/2,0,THREE.MathUtils.degToRad(p.rotation || 0));
      pad.position.set(p.at[0],.019,p.at[1]);pad.renderOrder=1;pads.add(pad);
    }
  }

  // Real mirrors: a Reflector over each mirror pane, Realistic tab only. A reflector
  // re-renders the scene when it is on screen, so it updates at most once per drawn
  // frame (not again inside the AO pass) and at a modest resolution.
  let frameId=0,drawingMirror=false;
  const mirrors=[];
  function addMirrors() {
    scene.traverse(o=>{
      const face=o.userData.mirrorFace;if(!face||o.userData.reflector)return;
      const mirror=new Reflector(face.geometry(),{textureWidth:512,textureHeight:512,color:0xd6dcdc,clipBias:.003});
      const original=mirror.onBeforeRender;let last=-1;
      mirror.onBeforeRender=function(...args){
        // Skip while another mirror draws (it would render this one from the wrong side).
        if(last===frameId||drawingMirror)return;
        last=frameId;drawingMirror=true;try{original.apply(this,args);}finally{drawingMirror=false;}
      };
      // Face positions are in the item's own coordinates, where the pane's parent lives.
      o.parent.add(mirror);mirror.position.set(...face.position);
      o.userData.reflector=mirror;mirror.visible=on;mirrors.push(mirror);
    });
  }
  function composer(camera) {
    if(composers.has(camera))return composers.get(camera);
    // SMAA handles edges, so no multisampling; HalfFloat keeps highlights for tone mapping.
    const target=new THREE.WebGLRenderTarget(size[0],size[1],{type:THREE.HalfFloatType});
    const c=new EffectComposer(renderer,target);
    c.addPass(new RenderPass(scene,camera));
    const ao=new GTAOPass(scene,camera,size[0],size[1]);
    // Metre-scale room: occlusion reaches about half a metre.
    ao.updateGtaoMaterial({radius:.3,distanceExponent:1,thickness:1,scale:1,samples:12});
    ao.updatePdMaterial({lumaPhi:10,depthPhi:4,normalPhi:5,radius:10,rings:2,samples:12});
    ao.blendIntensity=baked?.15:.75;
    c.addPass(ao);
    c.addPass(new SMAAPass());
    c.addPass(new OutputPass());
    c.setPixelRatio(Math.min(renderer.getPixelRatio(),1.25));c.setSize(...size);
    composers.set(camera,c);return c;
  }

  function enable(value) {
    if(value===on)return;on=value;
    if(on&&!environment) {
      const pmrem=new THREE.PMREMGenerator(renderer);
      const room=new RoomEnvironment();
      environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
    }
    if(on) {
      Object.assign(saved,{toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,
        ambient:lights.ambient.intensity,fill:lights.fill.intensity,sun:lights.sun.intensity});
      scene.environment=environment;scene.environmentIntensity=night?.06:.55;
      renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=night?1.1:.85;
      // The environment now carries the sky and bounce; the old fill lights would double it.
      lights.ambient.intensity*=.35;lights.fill.intensity=.15;lights.sun.intensity*=1.15;
    } else if(saved.toneMapping!==undefined) {
      scene.environment=null;
      renderer.toneMapping=saved.toneMapping;renderer.toneMappingExposure=saved.exposure;
      lights.ambient.intensity=saved.ambient;lights.fill.intensity=saved.fill;lights.sun.intensity=saved.sun;
    }
    pads.visible=on;lamps.visible=on||night;
    if(on)addMirrors();for(const m of mirrors)m.visible=on;
    // A static house: shadows are redrawn only when something changes (see home.js invalidate).
    renderer.shadowMap.autoUpdate=!on;renderer.shadowMap.needsUpdate=true;
  }
  return {
    get on(){return on;},enable,pads,lamps,
    setBaked(value){baked=value;for(const c of composers.values())for(const pass of c.passes)if(pass instanceof GTAOPass)pass.blendIntensity=baked?.15:.75;},
    render(camera){frameId++;composer(camera).render();},
    addMirrors(){if(on){addMirrors();}},
    setSize(width,height){size=[width,height];for(const c of composers.values())c.setSize(width,height);},
    // setLighting changes light intensities; re-apply the Realistic balance on top.
    relight(){if(on){on=false;enable(true);}lamps.visible=on||night;},
    // Night turns the lamps on in every 3D tab, brighter than their daytime glow.
    setNight(value){night=value;for(const l of lamps.children)l.intensity=l.userData.base*(night?3:1);},
  };
}
