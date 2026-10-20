export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeLink = value => /^https?:\/\//.test(value || '') ? escape(value) : '#';
export const roomPhotos = room => [...new Set([room?.photo,...(room?.photos || [])].filter(Boolean))];

export function markup(home) {
  const {source={},floorPlan,stats=[]}=home;
  const groups=[...home.model.rooms.map(room=>({name:room.name,dimension:room.dimension,id:room.id,photos:roomPhotos(room)})),...(home.resources || [])];
  const gallery=groups.map((group,i)=>`<article class="resource-room" id="resource-room-${escape(group.id || `extra-${i}`)}">
    <div class="resource-room-heading"><div><h3>${escape(group.name)}</h3><p>${escape(group.dimension)}</p></div>${group.id?`<button class="quiet-button" data-focus-room="${escape(group.id)}">View in 3D ↗</button>`:''}</div>
    <div class="resource-photos">${group.photos.length?group.photos.map((src,j)=>`<button class="resource-photo" data-photo-group="${i}" data-photo-index="${j}" aria-label="Enlarge ${escape(group.name)} photo ${j+1}"><img src="${escape(src)}" alt="${escape(group.name)} — reference ${j+1}" loading="lazy"><span>${String(j+1).padStart(2,'0')} / ${String(group.photos.length).padStart(2,'0')} <b>↗</b></span></button>`).join(''):'<p class="empty-resource">No reference photos added yet.</p>'}</div></article>`).join('');
  return `<div class="viewer-bar">
    <a class="brand compact-brand" data-text="rooms." href="#" aria-label="rooms. home resources">rooms.</a>
    <div class="tab-bar" role="tablist" aria-label="Project views">
      <button id="tab-resources" role="tab" aria-selected="true" aria-controls="panel-resources">Resources</button>
      <button id="tab-home3d" role="tab" aria-selected="false" aria-controls="panel-home3d" tabindex="-1">Home3D</button>
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
      <div class="view-toolbar"><div class="segmented" aria-label="Camera mode"><button id="orbit-button" class="active" aria-pressed="true">3D view</button><button id="plan-button" aria-pressed="false">Plan view</button><button id="walk-button" aria-pressed="false">Walk</button></div><button id="reset-camera" class="icon-button" title="Reset camera" aria-label="Reset camera">↺</button></div>
      <details class="settings" open><summary>View settings <span>＋</span></summary>
        <button id="mouse-look" class="quiet-button" hidden>Mouse look ↗</button>
        <div class="zoom-controls" role="group" aria-label="Zoom"><button id="zoom-out" aria-label="Zoom out">−</button><output id="zoom-output" aria-label="Zoom level">100%</output><button id="zoom-in" aria-label="Zoom in">+</button></div>
        <label class="switch-row">Room labels<input id="labels-toggle" type="checkbox" checked></label>
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
  const tabs=['resources','home3d'];
  function setTab(name,updateURL=true) {
    tab=tabs.includes(name)?name:'resources';
    for(const key of tabs) {
      get(`panel-${key}`).hidden=key!==tab;
      get(`tab-${key}`).setAttribute('aria-selected',String(key===tab));
      get(`tab-${key}`).tabIndex=key===tab?0:-1;
    }
    if(updateURL) {
      const url=new URL(location.href);url.searchParams.set('tab',tab);
      try{history.replaceState(null,'',url);}catch{/* Some file:// viewers disallow history updates. */}
    }
  }
  for(const [i,key] of tabs.entries()) {
    const button=get(`tab-${key}`);button.onclick=()=>setTab(key);
    button.onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:(i+1)%2;
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
  target.querySelectorAll('[data-focus-room]').forEach(button=>button.onclick=()=>{setTab('home3d');onRoom(button.dataset.focusRoom);get('tab-home3d').focus();});
  setTab(new URLSearchParams(location.search).get('tab'),false);
  return {setTab,showPhoto,get tab(){return tab;}};
}
