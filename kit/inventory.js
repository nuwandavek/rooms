// Reads a project's inventory.md into the Assets tab data. No browser required.
//
// Every markdown table with Asset and Room columns contributes rows:
//
//   | Asset | Room | Kind | Qty | Model | Photos | Notes |
//
// Room is a room id or name from home.js. Model is an id from library/catalog.json,
// optional. Photos are comma-separated image paths; a bare name such as `living-01`
// means `assets/living-01.jpg`. Kind, Qty and Notes are free text (Qty defaults to 1).
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
    if(row.model&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.model))errors.push(`inventory.md row ${i+1} (${row.asset}): Model must be a kebab-case library id`);
    return {name:row.asset,room:room?.id,kind:row.kind || '',qty,model:row.model || null,
      photos:(row.photos || '').split(',').map(p=>p.trim()).filter(Boolean).map(photoPath),notes:row.notes || ''};
  });
  if(errors.length)throw new Error(errors.join('\n'));
  return {...home,inventory};
}
