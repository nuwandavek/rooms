import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSurroundings } from './surroundings.js';
import {buildPrimitive,fitModel} from './primitives.js';
import {buildBuiltins} from './builtins.js';
import {createRealistic} from './realistic.js';
import { createShell, planShape } from './geometry.js';
import { applyTheme } from './themes.js';
import {createWalk,inside} from './walk.js';
import {createTour} from './tour.js';

import {escape,markup,setupUI,roomPhotos} from './ui.js';

export function mount(home, target=document.body) {
  const theme = applyTheme(home.theme);
  document.title = home.title;
  target.innerHTML = markup(home);
  const get=id=>target.querySelector(`#${id}`);
  let focusRoom=()=>{};
  // Frames are drawn only when something changed: camera moves are detected per frame,
  // everything else calls invalidate().
  let dirty=true;
  // invalidate() redraws; pass true when something that casts shadows changed.
  const invalidate=(shadows=false)=>{dirty=true;if(shadows&&renderer)renderer.shadowMap.needsUpdate=true;};
  THREE.DefaultLoadingManager.onProgress=()=>invalidate(true);
  // A 3D tab in the URL selects its stage before the furniture group exists.
  let furnitureBuilt=false;
  const ui=setupUI(home,target,id=>focusRoom(id),()=>furnitureBuilt&&applyStage());
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
  renderer.shadowMap.type=THREE.PCFShadowMap;  // PCFSoft is gone in r186; PCF is already soft.
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=theme.light.exposure;
  host.append(renderer.domElement);
  const walk=createWalk(model,renderer.domElement);
  // Guided tour drives the walk camera; Walk's own controls pause while it runs.
  let touring=false;
  const tour=createTour({model,spec:home.tour,space:walk.space,camera:walk.camera,onChange:()=>updateTourBar()});
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,500);
  walk.camera.layers.enable(1);camera.layers.enable(1);  // Layer 1 holds the city outside (kept out of mirrors).
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
  sun.shadow.bias=-.0001;sun.shadow.normalBias=.02;sun.shadow.radius=4;
  sun.target.position.copy(center);scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(light.fill,.7);
  fill.position.copy(center).add(new THREE.Vector3(span,span/2,-span));scene.add(fill);
  const shell=createShell(model,theme.materials);scene.add(shell.root);
  // The home has a roof even though the view leaves it off. This slab is never drawn but
  // casts shadows, so sunlight reaches rooms only through windows and open sliders.
  const roof=new THREE.Mesh(new THREE.ExtrudeGeometry(planShape(model.outline),{depth:.2,bevelEnabled:false}),
    new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false}));
  roof.rotation.x=-Math.PI/2;roof.position.y=model.wallHeight;roof.castShadow=true;roof.name='Roof (shadow only)';scene.add(roof);
  // Walk mode looks up at a ceiling.
  const ceiling=new THREE.Mesh(new THREE.ShapeGeometry(planShape(model.outline)),
    new THREE.MeshStandardMaterial({color:theme.materials.wall,emissive:theme.materials.wall,emissiveIntensity:.35,roughness:.95,side:THREE.BackSide}));
  ceiling.rotation.x=-Math.PI/2;ceiling.position.y=model.wallHeight-.001;ceiling.visible=false;scene.add(ceiling);
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
  function caption(room) {
    get('selection-info').innerHTML=room
      ?`<span class="eyebrow">${room.featured?'A closer look':'Supporting space'}</span><strong>${escape(room.name)}</strong><span>${escape(room.dimension || 'Dimensions not recorded')}</span>`
      :'<strong>The whole home</strong><span>Select a room to take a closer look.</span>';
  }
  // While walking, the caption, room list and photographs follow the room you stand in.
  let walkRoom=null;
  function followWalk() {
    const p=walk.camera.position,room=model.rooms.find(r=>inside([p.x,p.z],r.polygon));
    if(!room||room.id===walkRoom)return;
    walkRoom=room.id;caption(room);photo(room);
    for(const [key,button] of buttons){button.classList.toggle('active',key===room.id);button.setAttribute('aria-pressed',String(key===room.id));}
  }
  function select(id) {
    if(touring)setTouring(false);  // Picking a room takes over from the tour.
    const room=model.rooms.find(r=>r.id===id);
    selected=room?.id || null;shell.select(selected);invalidate();
    for(const [key,button] of buttons){button.classList.toggle('active',key===selected);button.setAttribute('aria-pressed',String(key===selected));}
    for(const [key,label] of labels)label.classList.toggle('active',key===selected);
    caption(room);walkRoom=room?.id ?? null;
    if(room) {
      if(mode==='walk')walk.enter(room);else move(new THREE.Vector3(room.center[0],0,room.center[1]),1.65);photo(room);
    } else {
      // Walk starts at the home's walkStart view ([x,z,heading,pitch], as in ?cam=) when it has one.
      const start=home.walkStart?.map(Number);
      if(mode==='walk')start?walk.place([start[0],start[1]],THREE.MathUtils.degToRad(start[2]),THREE.MathUtils.degToRad(start[3])):walk.enter(defaultPhoto);
      else move(center.clone());
      photo(defaultPhoto);
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
    updateFurniture();updateDoors();invalidate(true);
    get('wall-height').disabled=mode==='walk';
  }
  // Walls (and their door leaves) are rebuilt on every height change.
  function updateDoors() {
    const closed=get('doors-closed').checked;
    shell.openings.traverse(o=>{if(o.userData.doorLeaf)o.rotation.y=closed?0:-Math.PI*.4;});invalidate(true);
  }
  function setMode(value) {
    if(!['orbit','walk','tour'].includes(value))return;
    // Tour and Free Walk share the walk camera: switching between them keeps your place.
    if(mode==='walk'&&value!=='orbit'){setTouring(value==='tour');return;}
    if(touring&&value==='orbit')setTouring(false);
    const startTour=value==='tour';if(startTour)value='walk';
    mode=value;transition=null;controls.enabled=mode!=='walk';
    ceiling.visible=mode==='walk';updateBackdrop();invalidate();
    walk.setActive(mode==='walk');
    get('labels').hidden=mode==='walk'||!get('labels-toggle').checked;
    get('labels-toggle').disabled=mode==='walk';
    target.querySelector('.zoom-controls').hidden=mode==='walk';get('mouse-look').hidden=mode!=='walk';get('top-view').hidden=mode==='walk';
    get('full-height').disabled=mode==='walk';
    get('navigation-help').textContent=mode==='walk'?'Click the floor to walk · Drag to look · WASD / arrows to move · Q E to turn · Scroll to step':'Drag to orbit · Scroll to zoom · Right-drag to pan';
    target.querySelector('.viewport').classList.toggle('walking',mode==='walk');
    updateHeight();select(selected);
    if(startTour)setTouring(true);else updateModeButtons();
  }
  function updateModeButtons() {
    const current=touring?'tour':mode;
    for(const key of ['orbit','walk','tour']) {get(`${key}-button`).classList.toggle('active',current===key);get(`${key}-button`).setAttribute('aria-pressed',String(current===key));}
    get('mouse-look').hidden=mode!=='walk'||touring;get('tour-bar').hidden=!touring;
    target.querySelector('.viewport').classList.toggle('touring',touring);
    if(mode==='walk')get('navigation-help').textContent=touring?'Guided tour · Pause or skip below · Free Walk takes over from here':'Click the floor to walk · Drag to look · WASD / arrows to move · Q E to turn · Scroll to step';
    // Keep the mode in the URL (?mode=3d, walk or tour) next to ?tab=, for sharing a view.
    const url=new URL(location.href);url.searchParams.set('mode',touring?'tour':mode==='walk'?'walk':'3d');
    if(mode!=='walk'||touring)url.searchParams.delete('cam');
    try{history.replaceState(null,'',url);}catch{/* Some file:// viewers disallow history updates. */}
  }
  function setTouring(on) {
    touring=on;
    if(on){walk.setActive(false);tour.start();}else tour.stop();
    updateModeButtons();updateTourBar();invalidate();
  }
  function updateTourBar() {
    const stop=tour.stops[tour.index];if(!stop)return;
    get('tour-position').textContent=`${String(tour.index+1).padStart(2,'0')} / ${String(tour.stops.length).padStart(2,'0')}`;
    get('tour-room').textContent=tour.phase==='travel'?`On the way to ${stop.room?.name || 'the next stop'}`:stop.room?.name || '';
    get('tour-note').textContent=tour.phase==='travel'?'':stop.note;get('tour-note').hidden=!get('tour-note').textContent;
    const done=tour.phase==='done';
    get('tour-play').textContent=done?'↺ Replay':tour.playing?'❚❚ Pause':'▶ Play';
    get('tour-play').setAttribute('aria-label',done?'Replay the tour':tour.playing?'Pause the tour':'Resume the tour');
    get('tour-previous').disabled=tour.index===0;get('tour-next').disabled=tour.index>=tour.stops.length-1;
  }
  get('tour-button').onclick=()=>setMode('tour');
  get('tour-play').onclick=()=>tour.toggle();
  get('tour-previous').onclick=()=>tour.previous();get('tour-next').onclick=()=>tour.next();
  // Walk mode looks out at a generated city under a gradient sky; the overview keeps the
  // plain paper background and ground.
  const surroundings=createSurroundings({center,storey:home.storey ?? 3,style:home.surroundings || 'city',models:home.cityModels});scene.add(surroundings.group);
  function updateBackdrop() {
    const outside=mode==='walk';
    surroundings.group.visible=outside;if(outside)surroundings.load().then(invalidate);ground.visible=!outside;scene.fog=outside?surroundings.fog:null;
    surroundings.setNight(lighting==='night');invalidate();
  }
  // Day: the theme's soft daylight. Night: faint cool moonlight, a dark sky, lamps on.
  let lighting='day';
  function setLighting(value) {
    lighting=value==='night'?'night':'day';const night=lighting==='night';
    sun.position.copy(center).add(new THREE.Vector3(...(night?[.5,1.4,-.4]:light.position.map(v=>v/14))).multiplyScalar(span));
    sun.color.set(night?'#9fb3ff':light.sun);sun.intensity=night?.25:light.intensity;
    ambient.color.set(night?'#3a4766':light.sky);ambient.groundColor.set(night?'#1c1d24':light.bounce);
    ambient.intensity=night?.7:light.ambient;fill.intensity=night?.05:.7;
    get('light-day').setAttribute('aria-pressed',String(!night));get('light-night').setAttribute('aria-pressed',String(night));
    realistic.setNight(night);realistic.relight();updateBackdrop();invalidate(true);
  }
  get('orbit-button').onclick=()=>setMode('orbit');
  // Camera presets move the camera once; room focus reuses the last one. Reset also clears the room.
  get('top-view').onclick=()=>{view='top';select(selected);};
  get('walk-button').onclick=()=>setMode('walk');get('mouse-look').onclick=()=>walk.lock();
  // While the mouse is captured, the button shows it is on and how to get out.
  document.addEventListener('pointerlockchange',()=>{
    const locked=document.pointerLockElement===renderer.domElement,button=get('mouse-look');
    button.setAttribute('aria-pressed',String(locked));button.textContent=locked?'Mouse look on · Press Esc to exit':'Mouse look ↗';
    get('lock-hint').hidden=!locked;
  });
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
  // Door leaves are drawn open; closing them is visual only (Walk still passes through).
  get('doors-closed').onchange=()=>updateDoors();
  // Placed items: library models (each file loads once, cloned per placement, fitted to
  // the inventory row's Dims and tinted toward its Colour) or primitives built from Dims.
  const furniture=new THREE.Group();furniture.name='Furniture';scene.add(furniture);
  furniture.position.y=.016;  // Room floors sit at 0.015 (geometry.js); stand on them.
  const loader=new GLTFLoader(),sources=new Map();
  const furnitureReady=Promise.allSettled((home.placements || []).map(async placement=>{
    let object;
    if(placement.model.startsWith('@'))object=buildPrimitive(placement.model.slice(1),placement.dims,placement.colour,placement.art);
    else {
      if(!sources.has(placement.modelUrl))sources.set(placement.modelUrl,loader.loadAsync(placement.modelUrl));
      object=fitModel((await sources.get(placement.modelUrl)).scene.clone(true),placement.dims,placement.colour);
    }
    object.position.set(placement.at[0],placement.y || 0,placement.at[1]);
    object.rotation.y=THREE.MathUtils.degToRad(placement.rotation);
    object.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
    object.userData.placement=placement;furniture.add(object);updateFurniture();realistic.addMirrors();
  })).then(results=>results.filter(r=>r.status==='rejected').forEach(r=>console.warn('Furniture model failed to load',r.reason)));
  // Realistic-tab models (inventory Realistic column) load the first time that tab opens.
  const photoFurniture=new THREE.Group();photoFurniture.name='Furniture (realistic)';
  photoFurniture.position.y=furniture.position.y;scene.add(photoFurniture);
  let photoLoading=null;
  function loadPhotoFurniture() {
    photoLoading??=Promise.allSettled((home.placements || []).filter(p=>p.realisticUrl).map(async placement=>{
      if(!sources.has(placement.realisticUrl))sources.set(placement.realisticUrl,loader.loadAsync(placement.realisticUrl));
      const object=fitModel((await sources.get(placement.realisticUrl)).scene.clone(true),placement.dims,placement.colour);
      object.position.set(placement.at[0],placement.y || 0,placement.at[1]);
      object.rotation.y=THREE.MathUtils.degToRad(placement.rotation);
      object.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
      object.userData.placement=placement;photoFurniture.add(object);updateFurniture();
    }));
    return photoLoading;
  }
  furnitureBuilt=true;
  // Shell is the plain model; Fit-out and Furnished add finishes and built-ins from fitout.json.
  const builtins=buildBuiltins(home.fitout || {});builtins.position.y=furniture.position.y;scene.add(builtins);
  const photoBuiltins=buildBuiltins(home.fitout || {},true);photoBuiltins.position.y=furniture.position.y;scene.add(photoBuiltins);
  // Tab 6: the furnished home with realistic lighting, materials and post-processing.
  const realistic=createRealistic({renderer,scene,home,lights:{ambient,sun,fill}});
  function applyStage() {
    const photo=ui.stage==='realistic';
    if(photo)loadPhotoFurniture();
    invalidate(true);
    shell.setFinishes(ui.stage==='shell'?null:home.fitout || null,photo);
    realistic.enable(photo);
    updateFurniture();
  }
  applyStage();
  // Shell shows no items, Fit-out adds built-in fixtures, Furnished adds everything.
  // Wall-hung items above the cut (AC units, high frames) would float; hide them like the wall.
  function updateFurniture() {
    invalidate(true);
    const height=mode==='walk'?model.wallHeight:Number(get('wall-height').value);
    for(const object of furniture.children) {
      const placement=object.userData.placement;
      const kind=(home.inventory || []).find(a=>a.name===placement.asset&&a.room===placement.room)?.kind;
      const staged=ui.stage==='furnished'||ui.stage==='realistic'||(ui.stage==='fitout'&&kind==='fixture');
      object.visible=staged&&(placement.y || 0)<height&&!(ui.stage==='realistic'&&placement.realisticUrl);
    }
    for(const object of photoFurniture.children)object.visible=ui.stage==='realistic'&&(object.userData.placement.y || 0)<height;
    // Built-ins belong to Fit-out; wall cabinets above the cut hide with the wall.
    builtins.visible=ui.stage==='fitout'||ui.stage==='furnished';photoBuiltins.visible=ui.stage==='realistic';
    for(const group of [builtins,photoBuiltins])group.traverse(o=>{if(o.isMesh)o.visible=o.userData.bottom<height;});
  }
  get('wall-height').oninput=updateHeight;
  get('full-height').onclick=()=>{get('wall-height').value=model.wallHeight;setMode('orbit');};
  get('light-day').onclick=()=>setLighting('day');get('light-night').onclick=()=>setLighting('night');
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
    renderer.setSize(width,height);realistic.setSize(width,height);invalidate();
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
    walk.setActive(mode==='walk'&&!touring&&ui.in3d&&!target.querySelector('dialog[open]')&&!document.hidden);
    if(!ui.in3d)return;
    if(mode==='walk'&&touring){if(!target.querySelector('dialog[open]'))tour.update(dt);followWalk();draw(walk.camera);return;}
    if(mode==='walk'){walk.update(dt);followWalk();shareWalkView(now);draw(walk.camera);return;}
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
    draw(camera);
  }
  const lastView=new THREE.Matrix4(),lastProjection=new THREE.Matrix4();
  // While walking, the URL follows the camera (at most twice a second) so it can be shared.
  let lastShared=0,sharedView='';
  function shareWalkView(now) {
    if(now-lastShared<500)return;lastShared=now;
    const c=walk.camera,e=new THREE.Euler().setFromQuaternion(c.quaternion,'YXZ');
    const view=[c.position.x.toFixed(2),c.position.z.toFixed(2),THREE.MathUtils.radToDeg(e.y).toFixed(0),THREE.MathUtils.radToDeg(e.x).toFixed(0)].join(',');
    if(view===sharedView)return;sharedView=view;
    const url=new URL(location.href);url.searchParams.set('cam',view);
    try{history.replaceState(null,'',url.href.replaceAll('%2C',','));}catch{/* Some file:// viewers disallow history updates. */}
  }
  // Every tab draws only when the camera moved or something called invalidate().
  function draw(view){
    view.updateMatrixWorld();
    const moved=!lastView.equals(view.matrixWorld)||!lastProjection.equals(view.projectionMatrix);
    if(!dirty&&!moved)return;
    dirty=false;lastView.copy(view.matrixWorld);lastProjection.copy(view.projectionMatrix);
    if(realistic.on)realistic.render(view);else renderer.render(scene,view);
  }
  updateHeight();setLighting(home.lighting || 'day');select(null);frame=requestAnimationFrame(render);
  // ?mode=walk&cam=x,z,heading,pitch reopens a shared Walk view (heading/pitch in degrees).
  const params=new URLSearchParams(location.search);
  if(params.get('mode')==='tour')setMode('tour');
  else if(params.get('mode')==='walk') {
    setMode('walk');
    const cam=(params.get('cam') || '').split(',').map(Number);
    if(cam.length===4&&cam.every(Number.isFinite))walk.place([cam[0],cam[1]],THREE.MathUtils.degToRad(cam[2]),THREE.MathUtils.degToRad(cam[3]));
  }
  document.body.dataset.modelReady='true';
  return {select,setMode,setLighting,setTab:ui.setTab,scene,furniture,photoFurniture,loadPhotoFurniture,builtins,realistic,furnitureReady,get camera(){return mode==='walk'?walk.camera:camera;},
    dispose(){cancelAnimationFrame(frame);observer.disconnect();walk.dispose();controls.dispose();shell.dispose();ground.geometry.dispose();ground.material.dispose();grid?.geometry.dispose();grid?.material.dispose();renderer.dispose();target.replaceChildren();delete document.body.dataset.modelReady;},
  };
}
