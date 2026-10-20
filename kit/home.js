import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createShell } from './geometry.js';
import { applyTheme } from './themes.js';
import {createWalk} from './walk.js';

import {escape,markup,setupUI,roomPhotos} from './ui.js';

export function mount(home, target=document.body) {
  const theme = applyTheme(home.theme);
  document.title = home.title;
  target.innerHTML = markup(home);
  const get=id=>target.querySelector(`#${id}`);
  let focusRoom=()=>{};
  const ui=setupUI(home,target,id=>focusRoom(id));
  const settings=target.querySelector('.settings');
  if(matchMedia('(max-width:760px)').matches) settings.open=false;

  const {model}=home, host=get('scene');
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(theme.materials.ground);
  let renderer;
  try {renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});}
  catch(error) {
    get('error').hidden=false;
    get('error').textContent='The 3D view needs WebGL. Enable hardware acceleration and reload. The floor plan and photographs are available in Resources.';
    return {error,setTab:ui.setTab};
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=theme.light.exposure;
  host.append(renderer.domElement);
  const walk=createWalk(model,renderer.domElement);
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,500);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=.08;
  controls.maxPolarAngle=Math.PI/2-.12; controls.minZoom=.45; controls.maxZoom=5;
  const bounds=new THREE.Box2().setFromPoints(model.outline.map(([x,z])=>new THREE.Vector2(x,z)));
  const mid=bounds.getCenter(new THREE.Vector2()), size=bounds.getSize(new THREE.Vector2());
  const center=new THREE.Vector3(mid.x,0,mid.y), span=Math.max(size.x,size.y,4);
  const orbitOffset=new THREE.Vector3(.9,1.25,1.4).multiplyScalar(span);
  const planOffset=new THREE.Vector3(0,span*2,.001);
  camera.position.copy(center).add(orbitOffset); controls.target.copy(center); controls.update();
  const light=theme.light;
  const ambient=new THREE.HemisphereLight(light.sky,light.bounce,light.ambient);scene.add(ambient);
  const sun=new THREE.DirectionalLight(light.sun,light.intensity);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:.1,far:span*6});
  sun.shadow.bias=-.0004;sun.shadow.normalBias=.025;sun.shadow.radius=4;
  sun.target.position.copy(center);scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(light.fill,.7);
  fill.position.copy(center).add(new THREE.Vector3(span,span/2,-span));scene.add(fill);
  const shell=createShell(model,theme.materials);scene.add(shell.root);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(span*20,span*20),
    new THREE.MeshStandardMaterial({color:theme.materials.ground,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.set(mid.x,-.23,mid.y);ground.receiveShadow=true;scene.add(ground);
  let grid;
  if(home.theme==='drafting') {
    grid=new THREE.GridHelper(Math.ceil(span*3),Math.ceil(span*3),theme.ui.line,theme.ui.line);
    grid.position.set(mid.x,-.225,mid.y);grid.material.transparent=true;grid.material.opacity=.35;scene.add(grid);
  }
  let mode='orbit', view='iso', selected=null, transition=null, frame;
  const labels=new Map(), buttons=new Map();
  const defaultPhoto=model.rooms.find(r=>roomPhotos(r).length) || model.rooms[0];
  function photo(room) {
    const photos=roomPhotos(room),img=get('room-photo'),enlarge=get('enlarge-room-photo');
    get('no-photo').hidden=photos.length>0;enlarge.hidden=img.hidden=!photos.length;
    get('photo-label').textContent=room?.name || 'Reference';
    get('photo-count').textContent=photos.length?String(photos.length).padStart(2,'0'):'';
    get('photo-position').textContent='';
    const thumbnails=get('room-thumbnails');thumbnails.replaceChildren();
    function show(index) {
      img.src=photos[index];img.alt=`${room.name} reference ${index+1}`;
      get('photo-position').textContent=`${index+1} / ${photos.length}`;
      enlarge.onclick=()=>ui.showPhoto(photos[index],`${room.name} · ${index+1} / ${photos.length}`);
      [...thumbnails.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    }
    if(!photos.length){img.removeAttribute('src');enlarge.onclick=null;return;}
    if(photos.length>1)photos.forEach((src,i)=>{
      const button=document.createElement('button');button.setAttribute('aria-label',`Show ${room.name} photo ${i+1}`);
      const thumbnail=document.createElement('img');thumbnail.src=src;thumbnail.alt='';
      button.append(thumbnail);button.onclick=()=>show(i);thumbnails.append(button);
    });
    show(0);
  }
  function move(targetPoint,zoom=1) {
    transition={start:performance.now(),fromTarget:controls.target.clone(),toTarget:targetPoint,
      fromPosition:camera.position.clone(),toPosition:targetPoint.clone().add(view==='top'?planOffset:orbitOffset),
      fromZoom:camera.zoom,toZoom:zoom};
  }
  function select(id) {
    const room=model.rooms.find(r=>r.id===id);
    selected=room?.id || null;shell.select(selected);
    for(const [key,button] of buttons){button.classList.toggle('active',key===selected);button.setAttribute('aria-pressed',String(key===selected));}
    for(const [key,label] of labels)label.classList.toggle('active',key===selected);
    if(room) {
      get('selection-info').innerHTML=`<span class="eyebrow">${room.featured?'A closer look':'Supporting space'}</span><strong>${escape(room.name)}</strong><span>${escape(room.dimension || 'Dimensions not recorded')}</span>`;
      if(mode==='walk')walk.enter(room);else move(new THREE.Vector3(room.center[0],0,room.center[1]),1.65);photo(room);
    } else {
      get('selection-info').innerHTML='<strong>The whole home</strong><span>Select a room to take a closer look.</span>';
      if(mode==='walk')walk.enter(defaultPhoto);else move(center.clone());photo(defaultPhoto);
    }
  }
  focusRoom=select;
  let number=0;
  for(const room of model.rooms) {
    const label=document.createElement('button');
    label.className=`room-label${room.featured?'':' minor'}`;
    label.innerHTML=`${escape(room.name)}${room.featured?`<small>${escape(room.dimension)}</small>`:''}`;
    label.setAttribute('aria-label',`Focus ${room.name}`);label.onclick=()=>select(room.id);
    get('labels').append(label);labels.set(room.id,label);
    if(room.featured) {
      const button=document.createElement('button');button.className='room-button';button.dataset.room=room.id;
      button.setAttribute('aria-pressed','false');
      button.innerHTML=`<span class="number">${String(++number).padStart(2,'0')}</span><span>${escape(room.name)}</span><span class="room-action" aria-hidden="true">View</span>`;
      button.onclick=()=>select(room.id);get('room-list').append(button);buttons.set(room.id,button);
    }
  }
  function updateHeight() {
    const height=mode==='walk'?model.wallHeight:Number(get('wall-height').value);
    shell.setWallHeight(height,mode==='walk');get('height-output').value=`${height.toFixed(2)} m`;
    get('wall-height').disabled=mode==='walk';
  }
  function setMode(value) {
    if(!['orbit','walk'].includes(value))return;
    mode=value;transition=null;controls.enabled=mode!=='walk';
    walk.setActive(mode==='walk');
    get('labels').hidden=mode==='walk'||!get('labels-toggle').checked;
    get('labels-toggle').disabled=mode==='walk';
    target.querySelector('.zoom-controls').hidden=mode==='walk';get('mouse-look').hidden=mode!=='walk';get('top-view').hidden=mode==='walk';
    get('full-height').disabled=mode==='walk';
    get('navigation-help').textContent=mode==='walk'?'WASD to move · Drag to look · Mouse look + Esc to release':'Drag to orbit · Scroll to zoom · Right-drag to pan';
    target.querySelector('.viewport').classList.toggle('walking',mode==='walk');
    for(const key of ['orbit','walk']) {get(`${key}-button`).classList.toggle('active',mode===key);get(`${key}-button`).setAttribute('aria-pressed',String(mode===key));}
    updateHeight();select(selected);
  }
  function setLighting(value) {
    const late=value==='afternoon';
    sun.position.copy(center).add(new THREE.Vector3(...(late?[-1.2,.6,.8]:light.position.map(v=>v/14))).multiplyScalar(span));
    sun.color.set(late?'#ffd5a0':light.sun);sun.intensity=late?3.6:light.intensity;
    ambient.intensity=late?1.8:light.ambient;
    get('lighting').value=value;
  }
  get('orbit-button').onclick=()=>setMode('orbit');
  // Camera presets move the camera once; room focus reuses the last one. Reset also clears the room.
  get('top-view').onclick=()=>{view='top';select(selected);};
  get('walk-button').onclick=()=>setMode('walk');get('mouse-look').onclick=()=>walk.lock();
  get('reset-camera').onclick=()=>{view='iso';select(null);};get('reset-room').onclick=()=>select(null);
  function zoomBy(factor) {
    // Finish a room-focus move first, so zooming preserves its intended target.
    if(transition) {
      camera.position.copy(transition.toPosition);controls.target.copy(transition.toTarget);
      camera.zoom=transition.toZoom;transition=null;
    }
    camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,controls.maxZoom);
    camera.updateProjectionMatrix();controls.update();
  }
  get('zoom-in').onclick=()=>zoomBy(1.25);get('zoom-out').onclick=()=>zoomBy(1/1.25);
  get('labels-toggle').onchange=e=>get('labels').hidden=!e.target.checked;
  get('openings-toggle').onchange=e=>shell.openings.visible=e.target.checked;
  // Placed library models. Each file loads once and is cloned per placement.
  const furniture=new THREE.Group();furniture.name='Furniture';scene.add(furniture);
  const loader=new GLTFLoader(),sources=new Map();
  const furnitureReady=Promise.allSettled((home.placements || []).map(async placement=>{
    if(!sources.has(placement.modelUrl))sources.set(placement.modelUrl,loader.loadAsync(placement.modelUrl));
    const object=(await sources.get(placement.modelUrl)).scene.clone(true);
    object.position.set(placement.at[0],0,placement.at[1]);
    object.rotation.y=THREE.MathUtils.degToRad(placement.rotation);
    object.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
    object.userData.placement=placement;furniture.add(object);
  })).then(results=>results.filter(r=>r.status==='rejected').forEach(r=>console.warn('Furniture model failed to load',r.reason)));
  get('furniture-toggle').onchange=e=>furniture.visible=e.target.checked;
  get('wall-height').oninput=updateHeight;
  get('full-height').onclick=()=>{get('wall-height').value=model.wallHeight;setMode('orbit');};
  get('lighting').onchange=e=>setLighting(e.target.value);
  controls.addEventListener('start',()=>transition=null);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerDown;
  renderer.domElement.addEventListener('pointerdown',e=>pointerDown={x:e.clientX,y:e.clientY});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(mode==='walk'||!pointerDown || e.button!==0 || Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>5)return;
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(shell.floors)[0];
    if(hit)select(hit.object.userData.room.id);
  });
  function resize() {
    const {width,height}=host.getBoundingClientRect();if(!width || !height)return;
    renderer.setSize(width,height);
    walk.camera.aspect=width/height;walk.camera.updateProjectionMatrix();
    const aspect=width/height,half=Math.max(span*.63,span*.7/aspect);
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const projected=new THREE.Vector3();
  let previousTime=performance.now();
  function render(now) {
    frame=requestAnimationFrame(render);
    const dt=(now-previousTime)/1000;previousTime=now;
    walk.setActive(mode==='walk'&&ui.tab==='home3d'&&!target.querySelector('dialog[open]')&&!document.hidden);
    if(ui.tab!=='home3d')return;
    if(mode==='walk'){walk.update(dt);renderer.render(scene,walk.camera);return;}
    if(transition) {
      const t=Math.min((now-transition.start)/(matchMedia('(prefers-reduced-motion: reduce)').matches?1:650),1),ease=1-(1-t)**3;
      camera.position.lerpVectors(transition.fromPosition,transition.toPosition,ease);
      controls.target.lerpVectors(transition.fromTarget,transition.toTarget,ease);
      camera.zoom=THREE.MathUtils.lerp(transition.fromZoom,transition.toZoom,ease);camera.updateProjectionMatrix();
      if(t===1)transition=null;
    }
    controls.update();
    const {width,height}=host.getBoundingClientRect();
    // Minor-room labels only read cleanly from roughly overhead.
    const overhead=camera.position.y-controls.target.y>.95*camera.position.distanceTo(controls.target);
    for(const room of model.rooms) {
      projected.set(room.center[0],.08,room.center[1]).project(camera);
      const label=labels.get(room.id);
      label.style.left=`${(projected.x*.5+.5)*width}px`;label.style.top=`${(-projected.y*.5+.5)*height}px`;
      label.style.visibility=Math.abs(projected.z)>1 || (!room.featured && mode==='orbit' && !overhead)?'hidden':'visible';
    }
    get('zoom-output').value=`${Math.round(camera.zoom*100)}%`;
    get('zoom-in').disabled=camera.zoom>=controls.maxZoom-.001;
    get('zoom-out').disabled=camera.zoom<=controls.minZoom+.001;
    renderer.render(scene,camera);
  }
  updateHeight();setLighting(home.lighting || 'daylight');select(null);frame=requestAnimationFrame(render);
  document.body.dataset.modelReady='true';
  return {select,setMode,setLighting,setTab:ui.setTab,scene,furniture,furnitureReady,get camera(){return mode==='walk'?walk.camera:camera;},
    dispose(){cancelAnimationFrame(frame);observer.disconnect();walk.dispose();controls.dispose();shell.dispose();ground.geometry.dispose();ground.material.dispose();grid?.geometry.dispose();grid?.material.dispose();renderer.dispose();target.replaceChildren();delete document.body.dataset.modelReady;},
  };
}
