// Reads a project's inventory.md into the Assets tab data. No browser required.
//
// Every markdown table with Asset and Room columns contributes rows:
//
//   | Asset | Room | Kind | Qty | Dims | Colour | Model | Photos | Notes |
//
// Room is a room id or name from home.js. Dims is w×h×d in metres (estimated); placed
// models are scaled to it. Colour is a hex hint (#rrggbb) that placed models are tinted
// toward. Model is an id from library/catalog.json, or `@frame`-style primitive built
// from Dims and Colour (kit/primitives.js), or `@fitout` for an item built by fitout.json
// (kitchen cabinets, vanities); optional. Photos are comma-separated image
// paths; a bare name such as `living-01` means `assets/living-01.jpg`. Realistic is an
// optional second catalog id used only on the Realistic tab, fitted to the same Dims. Kind and Notes
// are free text; Qty defaults to 1.
import {PRIMITIVES} from './primitives.js';
const cells = line => line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim().replace(/^`|`$/g,''));
const photoPath = value => (value.includes('/') ? value : `assets/${value}`) + (/\.[a-z]+$/i.test(value) ? '' : '.jpg');

export function parseInventory(markdown) {
  const rows=[];let header=null;
  for(const line of markdown.replace(/<!--[\s\S]*?-->/g,'').split(/\r?\n/)) {
    if(!line.trim().startsWith('|')){header=null;continue;}
    const values=cells(line);
    if(!header){header=values.map(h=>h.toLowerCase());continue;}
    if(values.every(v=>/^:?-+:?$/.test(v)))continue;
    if(!header.includes('asset')||!header.includes('room'))continue;
    const row=Object.fromEntries(header.map((h,i)=>[h,values[i] ?? '']));
    if(row.asset)rows.push(row);
  }
  return rows;
}

export function applyInventory(home,markdown) {
  const errors=[],rooms=home.model?.rooms || [];
  const inventory=parseInventory(markdown).map((row,i)=>{
    const room=rooms.find(r=>r.id===row.room || r.name.toLowerCase()===row.room.toLowerCase());
    if(!room)errors.push(`inventory.md row ${i+1} (${row.asset}): no room "${row.room}"`);
    const qty=row.qty ? Number(row.qty) : 1;
    if(!Number.isInteger(qty)||qty<1)errors.push(`inventory.md row ${i+1} (${row.asset}): Qty must be a whole number`);
    const label=`inventory.md row ${i+1} (${row.asset})`;
    if(row.model==='@fitout'){}  // Built in fitout.json; nothing to place.
    else if(row.model?.startsWith('@')) {
      if(!PRIMITIVES.includes(row.model.slice(1)))errors.push(`${label}: unknown primitive ${row.model}; use ${PRIMITIVES.map(p=>'@'+p).join(', ')}`);
      if(!row.dims)errors.push(`${label}: primitive ${row.model} needs Dims`);
    } else if(row.model&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.model))errors.push(`${label}: Model must be a kebab-case library id`);
    if(row.realistic&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.realistic))errors.push(`${label}: Realistic must be a catalog id`);
    const dims=row.dims ? row.dims.split(/\s*[×x]\s*/).map(Number) : null;
    if(dims&&(dims.length!==3||!dims.every(v=>v>0)))errors.push(`${label}: Dims must be w×h×d in metres`);
    if(row.colour&&!/^#[0-9a-f]{6}$/i.test(row.colour))errors.push(`${label}: Colour must be #rrggbb`);
    return {name:row.asset,room:room?.id,kind:row.kind || '',qty,dims,colour:row.colour || null,model:row.model || null,realistic:row.realistic || null,
      photos:(row.photos || '').split(',').map(p=>p.trim()).filter(Boolean).map(photoPath),notes:row.notes || ''};
  });
  if(errors.length)throw new Error(errors.join('\n'));
  return {...home,inventory};
}
