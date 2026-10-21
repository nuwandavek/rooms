// Reads a project's placements.json: library models positioned in the home.
//
//   {"placements": [{"asset":"Queen bed, grey tufted headboard", "room":"master-bedroom",
//                    "at":[x,z], "rotation":90, "y":0}]}
//
// `asset` names the inventory row; the instance uses that row's Model, Dims and Colour
// (`model` overrides the row's model). `at` is the footprint center in metres, in the
// same [x,z] plan space as the walls. `rotation` is degrees about the vertical axis; at
// 0 the front faces +z (down the plan), at 90 it faces +x. `y` lifts the base off the
// floor (lamps on tables, wall-hung frames, AC units). Positions must fall inside the
// named room's polygon, and a row cannot be placed more times than its Qty.
export const insidePolygon = ([x,z],polygon) => polygon.reduce((inside,[ax,az],i) => {
  const [bx,bz]=polygon[(i+1)%polygon.length];
  return (az>z)!==(bz>z) && x<(bx-ax)*(z-az)/(bz-az)+ax ? !inside : inside;
},false);

export function applyPlacements(home,json) {
  const errors=[],rooms=home.model?.rooms || [];
  let data;
  try{data=JSON.parse(json);}catch(error){throw new Error(`placements.json: ${error.message}`);}
  if(!Array.isArray(data?.placements))throw new Error('placements.json: expected {"placements": [...]}');
  const placements=data.placements.map((p,i)=>{
    const label=`placements.json [${i}]${p?.asset?` (${p.asset})`:''}`;
    const room=rooms.find(r=>r.id===p?.room);
    const row=(home.inventory || []).find(a=>a.name===p?.asset&&a.room===p?.room);
    const model=p?.model ?? row?.model;
    if(p?.asset===undefined&&p?.model===undefined)errors.push(`${label}: needs an asset (inventory row) or a model`);
    else if(typeof model!=='string'||!/^@?[a-z0-9]+(?:-[a-z0-9]+)*$/.test(model))errors.push(`${label}: model must be a kebab-case library id${row?' (the inventory row has no Model)':''}`);
    if(!room)errors.push(`${label}: no room "${p?.room}"`);
    const point=Array.isArray(p?.at)&&p.at.length===2&&p.at.every(Number.isFinite);
    if(!point)errors.push(`${label}: at must be [x,z] in metres`);
    else if(room&&!insidePolygon(p.at,room.polygon))errors.push(`${label}: [${p.at}] is outside ${room.name}`);
    if(p?.rotation!==undefined&&!Number.isFinite(p.rotation))errors.push(`${label}: rotation must be degrees`);
    if(p?.y!==undefined&&!(Number.isFinite(p.y)&&p.y>=0))errors.push(`${label}: y must be a height in metres`);
    if(p?.asset!==undefined&&!row)errors.push(`${label}: no inventory row "${p.asset}" in ${p.room}`);
    if(p?.art!==undefined&&(typeof p.art!=='string'||model!=='@frame'))errors.push(`${label}: art must be an image path, on a @frame`);
    if(p?.light!==undefined) {
      const l=p.light;
      if(!l||!Array.isArray(l.offset)||l.offset.length!==3||!l.offset.every(Number.isFinite))errors.push(`${label}: light.offset must be [x,y,z] metres from the model base`);
      if(l?.colour!==undefined&&!/^#[0-9a-f]{6}$/i.test(l.colour))errors.push(`${label}: light.colour must be a hex colour`);
      for(const key of ['intensity','radius'])if(l?.[key]!==undefined&&!(Number.isFinite(l[key])&&l[key]>0))errors.push(`${label}: light.${key} must be positive`);
      if(l?.dayFactor!==undefined&&!(Number.isFinite(l.dayFactor)&&l.dayFactor>=0))errors.push(`${label}: light.dayFactor must be nonnegative`);
      if(l?.bulbMaterial!==undefined&&typeof l.bulbMaterial!=='string')errors.push(`${label}: light.bulbMaterial must be a material name`);
    }
    if(model==='@fitout')errors.push(`${label}: "${p.asset}" is built by fitout.json; do not place it`);
    return {model,room:p?.room,at:p?.at,rotation:p?.rotation ?? 0,y:p?.y ?? 0,
      ...(p?.asset?{asset:p.asset}:{}),...(p?.art?{art:p.art}:{}),...(p?.light?{light:p.light}:{}),...(row?.dims?{dims:row.dims}:{}),...(row?.colour?{colour:row.colour}:{}),...(row?.realistic?{realistic:row.realistic}:{})};
  });
  for(const row of home.inventory || []) {
    const count=placements.filter(p=>p.asset===row.name&&p.room===row.room).length;
    if(count>row.qty)errors.push(`placements.json: "${row.name}" is placed ${count} times but its Qty is ${row.qty}`);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  return {...home,placements};
}
