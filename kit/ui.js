export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeLink = value => /^https?:\/\//.test(value || '') ? escape(value) : '#';
import {previewModel,previewObject} from './preview.js';
import {buildPrimitive} from './primitives.js';

export const roomPhotos = room => [...new Set([room?.photo,...(room?.photos || [])].filter(Boolean))];

export function markup(home) {
  const {source={},floorPlan,stats=[]}=home;
  const groups=[...home.model.rooms.map(room=>({name:room.name,dimension:room.dimension,id:room.id,photos:roomPhotos(room)})),...(home.resources || [])];
  const gallery=groups.map((group,i)=>`<article class="resource-room" id="resource-room-${escape(group.id || `extra-${i}`)}">
    <div class="resource-room-heading"><div><h3>${escape(group.name)}</h3><p>${escape(group.dimension)}</p></div>${group.id?`<button class="quiet-button" data-focus-room="${escape(group.id)}">View in 3D ↗</button>`:''}</div>
    <div class="resource-photos">${group.photos.length?group.photos.map((src,j)=>`<button class="resource-photo" data-photo-group="${i}" data-photo-index="${j}" aria-label="Enlarge ${escape(group.name)} photo ${j+1}"><img src="${escape(src)}" alt="${escape(group.name)} — reference ${j+1}" loading="lazy"><span>${String(j+1).padStart(2,'0')} / ${String(group.photos.length).padStart(2,'0')} <b>↗</b></span></button>`).join(''):'<p class="empty-resource">No reference photos added yet.</p>'}</div></article>`).join('');
  const inventory=home.inventory || [];
  const assetRooms=home.model.rooms.map(room=>({room,items:inventory.map((asset,i)=>({asset,i})).filter(({asset})=>asset.room===room.id)})).filter(g=>g.items.length);
  const modelled=inventory.filter(a=>a.model).length;
  const placedCount=asset=>(home.placements || []).filter(p=>p.asset===asset.name&&p.room===asset.room).length;
  const assetTable=assetRooms.map(({room,items})=>`<article class="asset-room" id="asset-room-${escape(room.id)}">
    <div class="resource-room-heading"><div><h3>${escape(room.name)}</h3><p>${items.length} ${items.length===1?'asset':'assets'} · ${items.reduce((n,{asset})=>n+asset.qty,0)} pieces</p></div><button class="quiet-button" data-focus-room="${escape(room.id)}">View in 3D ↗</button></div>
    <table class="asset-table"><thead><tr><th>Model</th><th>Asset</th><th>Kind</th><th>Qty</th><th>Placed</th><th>Seen in</th><th>Notes</th></tr></thead><tbody>
    ${items.map(({asset,i})=>`<tr>
      <td>${asset.modelUrl?`<div class="asset-preview" data-model="${escape(asset.modelUrl)}"><span>Rendering…</span></div>`
        :asset.model==='@fitout'?'<div class="asset-preview empty"><span>In fit-out</span></div>'
        :asset.model?.startsWith('@')?`<div class="asset-preview" data-primitive="${i}"><span>Rendering…</span></div>`
        :'<div class="asset-preview empty"><span>No model yet</span></div>'}</td>
      <td><strong>${escape(asset.name)}</strong>${asset.model?`<small>${escape(asset.model)}${asset.dims?` · fitted to ${asset.dims.map(v=>v.toFixed(2)).join(' × ')} m`:`<span class="asset-size" data-size-for="${escape(asset.modelUrl || '')}"></span>`}</small>`:''}</td>
      <td><span class="asset-kind">${escape(asset.kind)}</span></td><td>${asset.qty}</td><td>${asset.model==='@fitout'?'<span class="asset-placed done">fit-out</span>':placedCount(asset)?`<span class="asset-placed${placedCount(asset)>=asset.qty?' done':''}">${placedCount(asset)} / ${asset.qty}</span>`:'<span class="asset-placed">—</span>'}</td>
      <td><div class="asset-photos">${asset.photos.map((src,j)=>`<button data-asset="${i}" data-asset-photo="${j}" aria-label="${escape(asset.name)} photo ${j+1}"><img src="${escape(src)}" alt="" loading="lazy"></button>`).join('')}</div></td>
      <td class="asset-notes">${escape(asset.notes)}</td></tr>`).join('')}
    </tbody></table></article>`).join('');
  return `<div class="viewer-bar">
    <a class="brand compact-brand" data-text="rooms." href="#" aria-label="rooms. home resources">rooms.</a>
    <div class="tab-bar" role="tablist" aria-label="Project views">
      <button id="tab-resources" role="tab" aria-selected="true" aria-controls="panel-resources"><span class="tab-step">1.</span>Listing</button>
      <button id="tab-assets" data-dev role="tab" aria-selected="false" aria-controls="panel-assets" tabindex="-1"><span class="tab-step">2.</span>Assets</button>
      <button id="tab-shell" data-dev role="tab" aria-selected="false" aria-controls="panel-home3d" tabindex="-1" title="Walls, rooms and openings"><span class="tab-step">3.</span>Shell</button>
      <button id="tab-fitout" data-dev role="tab" aria-selected="false" aria-controls="panel-home3d" tabindex="-1" title="Shell plus built-ins and finishes: counters, wardrobes, sanitaryware, floors, skirting"><span class="tab-step">4.</span>Fit-out</button>
      <button id="tab-furnished" data-dev role="tab" aria-selected="false" aria-controls="panel-home3d" tabindex="-1" title="Fit-out plus loose furniture, lighting and decor"><span class="tab-step">5.</span>Furnished</button>
      <button id="tab-realistic" role="tab" aria-selected="false" aria-controls="panel-home3d" tabindex="-1" title="The furnished home with realistic lighting and materials"><span class="tab-step">6.</span>3D Tour</button>
      ${home.baked?'<button id="tab-baked" role="tab" aria-selected="false" aria-controls="panel-home3d" tabindex="-1" title="Explore the home with baked lighting and soft shadows"><span class="tab-step">7.</span>3D Tour (Improved Lighting)</button>':''}
    </div>
    <details class="project-details"><summary>Project details <span>＋</span></summary><div class="project-details-body">
      <div class="project-card-title"><span class="brand-mark">${escape(home.mark || 'h.')}</span><h2>${escape(home.brand || home.title)}</h2></div>
      <p>${escape(home.location)}</p>
      <dl class="metadata">${stats.map(s=>`<div><dt>${escape(s.label)}</dt><dd>${escape(s.value)} <small>${escape(s.unit)}</small></dd></div>`).join('')}</dl>
    </div></details>
    <label class="dev-toggle" title="Show the authoring tabs: Assets, Shell, Fit-out and Furnished">Dev<input id="dev-toggle" type="checkbox"></label>
  </div>
  <section id="panel-resources" class="resources-panel" role="tabpanel" aria-labelledby="tab-resources" tabindex="0">
    <section class="resource-section"><div class="resource-section-heading"><h1>Floor plan</h1><span>01 / THE PLAN</span></div>
      ${floorPlan?`<button id="reference-button" class="floor-plan-preview" aria-label="Enlarge source floor plan"><img src="${escape(floorPlan.image)}" alt="${escape(floorPlan.alt)}"><span>Enlarge floor plan ↗</span></button><p class="resource-note">${escape(floorPlan.note)}</p>`:'<p class="empty-resource">No floor plan added yet.</p>'}
    </section>
    <section class="resource-section"><div class="resource-section-heading"><h2>Rooms & references</h2><span>02 / THE PHOTOGRAPHS</span></div>${gallery}</section>
    <p class="source-note">${escape(source.note)} ${source.url?`<a href="${safeLink(source.url)}" target="_blank" rel="noreferrer">${escape(source.label || 'Source')} ↗</a>`:''}</p>
  </section>
  <section id="panel-assets" class="resources-panel assets-panel" role="tabpanel" aria-labelledby="tab-assets" tabindex="0" hidden>
    <section class="resource-section"><div class="resource-section-heading"><h1>Assets</h1><span>03 / THE INVENTORY</span></div>
      ${inventory.length?`<p class="resource-note">${inventory.length} assets across ${assetRooms.length} rooms · ${modelled} with a library model · ${(home.placements || []).length} placed in the 3D home.</p>${assetTable}`:'<p class="empty-resource">No inventory.md yet.</p>'}
    </section>
  </section>
  <main id="panel-home3d" role="tabpanel" aria-labelledby="tab-furnished" hidden>
    <aside class="sidebar">
      <div class="section-title">Explore the rooms <span>${String(home.model.rooms.filter(r=>r.featured).length).padStart(2,'0')}</span></div>
      <nav id="room-list" aria-label="Select a room"></nav>
      <button id="reset-room" class="all-rooms">↖ The whole home</button>
      <section class="room-references"><div class="section-title">Room photographs <span id="photo-count"></span></div>
        <figure class="reference-card"><button id="enlarge-room-photo" aria-label="Enlarge room photo" hidden><img id="room-photo" alt="" hidden></button><div id="no-photo" class="no-photo">No reference photos for this room.</div><figcaption><span id="photo-label"></span><span id="photo-position"></span></figcaption></figure>
        <div id="room-thumbnails" class="room-thumbnails" aria-label="Room photographs"></div>
      </section>
      <button id="browse-resources" class="all-rooms">Browse the listing ↗</button>
    </aside>
    <section class="viewport" aria-label="Interactive home model">
      <div id="scene"></div><div id="labels"></div><div id="lock-hint" class="lock-hint" role="status" hidden>Mouse look · Press <kbd>Esc</kbd> to exit</div>
      <div class="view-toolbar"><div class="segmented" role="group" aria-label="Camera mode">
        <button id="orbit-button" class="active" aria-pressed="true" aria-label="Isometric View" title="Isometric View"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false"><path d="m270-120-10-88 114-314q15 14 32.5 23.5T444-484L334-182l-64 62Zm420 0-64-62-110-302q20-5 37.5-14.5T586-522l114 314-10 88ZM395-555q-35-35-35-85 0-39 22.5-69.5T440-752v-88h80v88q35 12 57.5 42.5T600-640q0 50-35 85t-85 35q-50 0-85-35Zm113.5-56.5Q520-623 520-640t-11.5-28.5Q497-680 480-680t-28.5 11.5Q440-657 440-640t11.5 28.5Q463-600 480-600t28.5-11.5Z"/></svg><span>Isometric View</span></button>
        <button id="walk-button" aria-pressed="false" aria-label="Free Walk" title="Free Walk"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false"><path d="m280-40 112-564-72 28v136h-80v-188l202-86q14-6 29.5-7t29.5 4q14 5 26.5 14t20.5 23l40 64q26 42 70.5 69T760-520v80q-70 0-125-29t-94-74l-25 123 84 80v300h-80v-260l-84-64-72 324h-84Zm203.5-723.5Q460-787 460-820t23.5-56.5Q507-900 540-900t56.5 23.5Q620-853 620-820t-23.5 56.5Q573-740 540-740t-56.5-23.5Z"/></svg><span>Free Walk</span></button>
        <button id="tour-button" aria-pressed="false" aria-label="Guided Tour" title="Guided Tour"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false"><path d="M520-240q-17 0-28.5-11.5T480-280v-160q0-17 11.5-28.5T520-480h160q17 0 28.5 11.5T720-440v40l80-42v164l-80-42v40q0 17-11.5 28.5T680-240H520ZM160-120v-480l320-240 320 240v80h-80v-40L480-740 240-560v360h560v80H160Zm320-350Z"/></svg><span>Guided Tour</span></button>
      </div></div>
      <div class="segmented camera-presets" id="camera-presets" role="group" aria-label="Camera"><button id="reset-camera" title="Whole home, default camera">↺ Reset</button><button id="top-view">Top-down</button></div>
      <details class="settings" open><summary>View settings <span>＋</span></summary>
        <button id="mouse-look" class="quiet-button" aria-pressed="false" hidden>Mouse look ↗</button>
        <div class="walk-help" role="group" aria-label="Free Walk keyboard controls"><strong>Move around</strong><div class="walk-keys" aria-hidden="true"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><p>Use WASD or the arrow keys.<br>Drag to look around.</p></div>
        <div class="zoom-controls" role="group" aria-label="Zoom"><button id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-output" aria-label="Zoom level">100%</output><button id="zoom-in" aria-label="Zoom in">+</button></div>
        <label class="switch-row labels-row">Room labels<input id="labels-toggle" type="checkbox" checked></label>
        <label class="switch-row">Doors closed<input id="doors-closed" type="checkbox"></label>
        <div class="wall-label"><label for="wall-height">Wall cutaway</label><output id="height-output"></output></div>
        <input id="wall-height" aria-label="Visible wall height" type="range" min="0.15" max="${home.model.wallHeight}" step="0.05" value="${home.model.cutaway}">
        <div class="range-labels"><span>LOW</span><button id="full-height">Full height ↗</button></div>
        <div class="lighting-label" id="lighting-label">Light study</div><div class="segmented light-study" role="group" aria-labelledby="lighting-label"><button id="light-day" aria-pressed="true">☀ Day</button><button id="light-night" aria-pressed="false">☾ Night</button></div>
        <small class="lighting-note">Illustrative lighting</small>
      </details>
      <div class="selection-info" id="selection-info" aria-live="polite"></div>
      <div id="tour-bar" class="tour-bar" role="group" aria-label="Guided tour" hidden>
        <div class="tour-text"><span id="tour-position" class="tour-position"></span><strong id="tour-room"></strong><p id="tour-note" hidden></p></div>
        <div class="tour-controls"><button id="tour-previous" aria-label="Previous stop">‹</button><button id="tour-play"></button><button id="tour-next" aria-label="Next stop">›</button></div>
      </div>
      <footer class="canvas-footer"><span id="navigation-help">Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Right-drag to pan</span><span>Metres / approximate geometry</span></footer>
      <div id="scene-loading" class="scene-loading"><div class="scene-loading-content"><span class="scene-spinner" aria-hidden="true"></span><p id="scene-loading-label" role="status" aria-live="polite">Loading your home…</p><button id="loading-fallback" class="quiet-button" hidden>Use 3D Tour</button></div></div>
      <div id="error" role="alert" hidden></div>
    </section>
  </main>
  <dialog id="plan-dialog"><div class="dialog-header"><h2>Original floor plan</h2><button id="close-plan" class="icon-button" aria-label="Close floor plan">×</button></div>${floorPlan?`<img src="${escape(floorPlan.image)}" alt="${escape(floorPlan.alt)}"><p>${escape(floorPlan.note)}</p>`:''}</dialog>
  <dialog id="photo-dialog"><div class="dialog-header"><h2 id="photo-dialog-title"></h2><button id="close-photo" class="icon-button" aria-label="Close photo">×</button></div><img id="photo-dialog-image" alt=""></dialog>`;
}

// Resources and dialogs work even when WebGL is unavailable.
// Tabs follow the authoring stages. Shell, Fit-out and Furnished share the 3D panel and
// add layers left to right; `onStage` tells the viewer which one is showing.
// Dev mode (the top-right toggle, remembered per browser, or ?dev=1) shows the authoring
// tabs; visitors see Listing and both tours when improved lighting is available.
export const STAGES=['shell','fitout','furnished','realistic','baked'];
export function setupUI(home,target,onRoom,onStage=()=>{}) {
  const get=id=>target.querySelector(`#${id}`);
  const defaultTour=home.baked?'baked':'realistic';
  let tab='resources',stage=defaultTour;
  const tabs=['resources','assets',...STAGES].filter(key=>get(`tab-${key}`));  // Baked only once a bake exists.
  const panel=key=>STAGES.includes(key)?'home3d':key;
  const params=new URLSearchParams(location.search);
  let dev=params.has('dev')?params.get('dev')!=='0':false;
  if(!params.has('dev'))try{dev=localStorage.getItem('home3d-dev')==='1';}catch{/* Storage may be blocked. */}
  const visitorTabs=tabs.filter(key=>['resources','realistic','baked'].includes(key));
  const visibleTabs=()=>dev?tabs:visitorTabs;
  let previewsStarted=false;
  function setTab(name,updateURL=true) {
    if(name==='home3d')name=stage;  // Older links and the room buttons open the last 3D stage.
    if(!dev&&name==='assets')name='resources';
    else if(!dev&&STAGES.includes(name)&&!visitorTabs.includes(name))name=defaultTour;
    tab=tabs.includes(name)?name:'resources';
    for(const key of ['resources','assets','home3d'])get(`panel-${key}`).hidden=key!==panel(tab);
    for(const key of tabs) {
      get(`tab-${key}`).setAttribute('aria-selected',String(key===tab));
      get(`tab-${key}`).tabIndex=key===tab?0:-1;
    }
    if(STAGES.includes(tab)){stage=tab;get('panel-home3d').setAttribute('aria-labelledby',`tab-${tab}`);onStage(stage);}
    if(tab==='assets'&&!previewsStarted){previewsStarted=true;renderPreviews();}
    if(updateURL) {
      const url=new URL(location.href);url.searchParams.set('tab',tab);
      try{history.replaceState(null,'',url);}catch{/* Some file:// viewers disallow history updates. */}
    }
  }
  for(const key of tabs) {
    const button=get(`tab-${key}`);button.onclick=()=>setTab(key);
    button.onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const shown=visibleTabs(),i=shown.indexOf(key);
      e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?shown.length-1:(i+(e.key==='ArrowLeft'?shown.length-1:1))%shown.length;
      setTab(shown[next]);get(`tab-${shown[next]}`).focus();
    };
  }
  function setDev(on) {
    dev=on;get('dev-toggle').checked=on;
    target.querySelector('.viewer-bar').classList.toggle('dev',on);
    target.querySelectorAll('[data-dev]').forEach(el=>el.hidden=!on);
  }
  get('dev-toggle').onchange=e=>{
    setDev(e.target.checked);
    try{localStorage.setItem('home3d-dev',dev?'1':'0');}catch{/* Storage may be blocked. */}
    const url=new URL(location.href);url.searchParams.delete('dev');
    try{history.replaceState(null,'',url);}catch{/* Some file:// viewers disallow history updates. */}
    setTab(tab);
  };
  setDev(dev);
  get('browse-resources').onclick=()=>{setTab('resources');get('tab-resources').focus();};
  target.querySelector('.brand').onclick=e=>{e.preventDefault();setTab('resources');};
  const plan=get('plan-dialog'),photo=get('photo-dialog');
  if(get('reference-button'))get('reference-button').onclick=()=>plan.showModal();
  get('close-plan').onclick=()=>plan.close();get('close-photo').onclick=()=>photo.close();
  for(const dialog of [plan,photo])dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  function showPhoto(src,title) {get('photo-dialog-image').src=src;get('photo-dialog-image').alt=title;get('photo-dialog-title').textContent=title;photo.showModal();}
  const groups=[...home.model.rooms.map(r=>({name:r.name,photos:roomPhotos(r)})),...(home.resources || [])];
  target.querySelectorAll('[data-photo-group]').forEach(button=>button.onclick=()=>{
    const group=groups[Number(button.dataset.photoGroup)],index=Number(button.dataset.photoIndex);
    showPhoto(group.photos[index],`${group.name} · ${index+1} / ${group.photos.length}`);
  });
  target.querySelectorAll('[data-asset-photo]').forEach(button=>button.onclick=()=>{
    const asset=home.inventory[Number(button.dataset.asset)],index=Number(button.dataset.assetPhoto);
    showPhoto(asset.photos[index],`${asset.name} · ${index+1} / ${asset.photos.length}`);
  });
  // Model thumbnails render when the Assets tab first opens.
  function renderPreviews() {
    target.querySelectorAll('[data-model]').forEach(cell=>previewModel(cell.dataset.model).then(({src,size})=>{
      cell.innerHTML=`<img src="${src}" alt="">`;
      target.querySelectorAll(`[data-size-for="${CSS.escape(cell.dataset.model)}"]`).forEach(s=>s.textContent=` · ${size.map(v=>v.toFixed(2)).join(' × ')} m`);
    }).catch(()=>{
      cell.classList.add('empty');
      cell.innerHTML=`<span>${location.protocol==='file:'?'Use kit/home serve to preview':'Model failed to load'}</span>`;
    }));
    target.querySelectorAll('[data-primitive]').forEach(cell=>{
      const asset=home.inventory[Number(cell.dataset.primitive)];
      previewObject(`${asset.model}|${asset.dims}|${asset.colour}`,async()=>buildPrimitive(asset.model.slice(1),asset.dims,asset.colour))
        .then(({src})=>cell.innerHTML=`<img src="${src}" alt="">`);
    });
  }
  target.querySelectorAll('[data-focus-room]').forEach(button=>button.onclick=()=>{setTab('home3d');onRoom(button.dataset.focusRoom);get(`tab-${tab}`).focus();});
  setTab(params.get('tab') || defaultTour,false);
  return {setTab,showPhoto,get tab(){return tab;},get in3d(){return STAGES.includes(tab);},get stage(){return stage;}};
}
