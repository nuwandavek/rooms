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
    return {model,room:p?.room,at:p?.at,rotation:p?.rotation ?? 0,y:p?.y ?? 0,
      ...(p?.asset?{asset:p.asset}:{}),...(row?.dims?{dims:row.dims}:{}),...(row?.colour?{colour:row.colour}:{})};
  });
  for(const row of home.inventory || []) {
    const count=placements.filter(p=>p.asset===row.name&&p.room===row.room).length;
    if(count>row.qty)errors.push(`placements.json: "${row.name}" is placed ${count} times but its Qty is ${row.qty}`);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  return {...home,placements};
}
