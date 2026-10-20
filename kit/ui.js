export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeLink = value => /^https?:\/\//.test(value || '') ? escape(value) : '#';
import {previewModel} from './preview.js';

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
      <td>${asset.modelUrl?`<div class="asset-preview" data-model="${escape(asset.modelUrl)}"><span>Rendering…</span></div>`:'<div class="asset-preview empty"><span>No model yet</span></div>'}</td>
      <td><strong>${escape(asset.name)}</strong>${asset.model?`<small>${escape(asset.model)}<span class="asset-size" data-size-for="${escape(asset.modelUrl || '')}"></span></small>`:''}</td>
      <td><span class="asset-kind">${escape(asset.kind)}</span></td><td>${asset.qty}</td><td>${placedCount(asset)?`<span class="asset-placed${placedCount(asset)>=asset.qty?' done':''}">${placedCount(asset)} / ${asset.qty}</span>`:'<span class="asset-placed">—</span>'}</td>
      <td><div class="asset-photos">${asset.photos.map((src,j)=>`<button data-asset="${i}" data-asset-photo="${j}" aria-label="${escape(asset.name)} photo ${j+1}"><img src="${escape(src)}" alt="" loading="lazy"></button>`).join('')}</div></td>
      <td class="asset-notes">${escape(asset.notes)}</td></tr>`).join('')}
    </tbody></table></article>`).join('');
  return `<div class="viewer-bar">
    <a class="brand compact-brand" data-text="rooms." href="#" aria-label="rooms. home resources">rooms.</a>
    <div class="tab-bar" role="tablist" aria-label="Project views">
      <button id="tab-resources" role="tab" aria-selected="true" aria-controls="panel-resources">Resources</button>
      <button id="tab-home3d" role="tab" aria-selected="false" aria-controls="panel-home3d" tabindex="-1">Home3D</button>
      <button id="tab-assets" role="tab" aria-selected="false" aria-controls="panel-assets" tabindex="-1">Assets</button>
    </div>
    <details class="project-details"><summary>Project details <span>＋</span></summary><div class="project-details-body">
      <div class="project-card-title"><span class="brand-mark">${escape(home.mark || 'h.')}</span><h2>${escape(home.brand || home.title)}</h2></div>
      <p>${escape(home.location)}</p>
      <dl class="metadata">${stats.map(s=>`<div><dt>${escape(s.label)}</dt><dd>${escape(s.value)} <small>${escape(s.unit)}</small></dd></div>`).join('')}</dl>
    </div></details>
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
  <main id="panel-home3d" role="tabpanel" aria-labelledby="tab-home3d" hidden>
    <aside class="sidebar">
      <div class="section-title">Explore the rooms <span>${String(home.model.rooms.filter(r=>r.featured).length).padStart(2,'0')}</span></div>
      <nav id="room-list" aria-label="Select a room"></nav>
      <button id="reset-room" class="all-rooms">↖ The whole home</button>
      <section class="room-references"><div class="section-title">Room photographs <span id="photo-count"></span></div>
        <figure class="reference-card"><button id="enlarge-room-photo" aria-label="Enlarge room photo" hidden><img id="room-photo" alt="" hidden></button><div id="no-photo" class="no-photo">No reference photos for this room.</div><figcaption><span id="photo-label"></span><span id="photo-position"></span></figcaption></figure>
        <div id="room-thumbnails" class="room-thumbnails" aria-label="Room photographs"></div>
      </section>
      <button id="browse-resources" class="all-rooms">Browse all resources ↗</button>
    </aside>
    <section class="viewport" aria-label="Interactive home model">
      <div id="scene"></div><div id="labels"></div>
      <div class="view-toolbar"><div class="segmented" aria-label="Camera mode"><button id="orbit-button" class="active" aria-pressed="true">3D</button><button id="walk-button" aria-pressed="false">Walk</button></div></div>
      <div class="segmented camera-presets" id="camera-presets" role="group" aria-label="Camera"><button id="reset-camera" title="Whole home, default camera">↺ Reset</button><button id="top-view">Top-down</button></div>
      <details class="settings" open><summary>View settings <span>＋</span></summary>
        <button id="mouse-look" class="quiet-button" hidden>Mouse look ↗</button>
        <div class="zoom-controls" role="group" aria-label="Zoom"><button id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-output" aria-label="Zoom level">100%</output><button id="zoom-in" aria-label="Zoom in">+</button></div>
        <label class="switch-row">Room labels<input id="labels-toggle" type="checkbox" checked></label>
        <label class="switch-row">Furniture<input id="furniture-toggle" type="checkbox" checked></label>
        <label class="switch-row">Doors & glazing<input id="openings-toggle" type="checkbox" checked></label>
        <div class="wall-label"><label for="wall-height">Wall cutaway</label><output id="height-output"></output></div>
        <input id="wall-height" aria-label="Visible wall height" type="range" min="0.15" max="${home.model.wallHeight}" step="0.05" value="${home.model.cutaway}">
        <div class="range-labels"><span>LOW</span><button id="full-height">Full height ↗</button></div>
        <label class="lighting-label" for="lighting">Light study</label><select id="lighting"><option value="daylight">Soft daylight</option><option value="afternoon">Late afternoon</option></select>
        <small class="lighting-note">Illustrative lighting</small>
      </details>
      <div class="selection-info" id="selection-info" aria-live="polite"></div>
      <footer class="canvas-footer"><span id="navigation-help">Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Right-drag to pan</span><span>Metres / approximate geometry</span></footer>
      <div id="error" role="alert" hidden></div>
    </section>
  </main>
  <dialog id="plan-dialog"><div class="dialog-header"><h2>Original floor plan</h2><button id="close-plan" class="icon-button" aria-label="Close floor plan">×</button></div>${floorPlan?`<img src="${escape(floorPlan.image)}" alt="${escape(floorPlan.alt)}"><p>${escape(floorPlan.note)}</p>`:''}</dialog>
  <dialog id="photo-dialog"><div class="dialog-header"><h2 id="photo-dialog-title"></h2><button id="close-photo" class="icon-button" aria-label="Close photo">×</button></div><img id="photo-dialog-image" alt=""></dialog>`;
}

// Resources and dialogs work even when WebGL is unavailable.
export function setupUI(home,target,onRoom) {
  const get=id=>target.querySelector(`#${id}`);
  let tab='resources';
  const tabs=['resources','home3d','assets'];
  let previewsStarted=false;
  function setTab(name,updateURL=true) {
    tab=tabs.includes(name)?name:'resources';
    for(const key of tabs) {
      get(`panel-${key}`).hidden=key!==tab;
      get(`tab-${key}`).setAttribute('aria-selected',String(key===tab));
      get(`tab-${key}`).tabIndex=key===tab?0:-1;
    }
    if(tab==='assets'&&!previewsStarted){previewsStarted=true;renderPreviews();}
    if(updateURL) {
      const url=new URL(location.href);url.searchParams.set('tab',tab);
      try{history.replaceState(null,'',url);}catch{/* Some file:// viewers disallow history updates. */}
    }
  }
  for(const [i,key] of tabs.entries()) {
    const button=get(`tab-${key}`);button.onclick=()=>setTab(key);
    button.onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowLeft'?tabs.length-1:1))%tabs.length;
      setTab(tabs[next]);get(`tab-${tabs[next]}`).focus();
    };
  }
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
  }
  target.querySelectorAll('[data-focus-room]').forEach(button=>button.onclick=()=>{setTab('home3d');onRoom(button.dataset.focusRoom);get('tab-home3d').focus();});
  setTab(new URLSearchParams(location.search).get('tab'),false);
  return {setTab,showPhoto,get tab(){return tab;}};
}
