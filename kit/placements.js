// Reads a project's placements.json: library models positioned in the home.
//
//   {"placements": [{"model":"bed-queen", "room":"master-bedroom", "at":[x,z],
//                    "rotation":90, "asset":"Queen bed, grey tufted headboard"}]}
//
// `at` is the model's footprint center in metres, in the same [x,z] plan space as the
// walls. `rotation` is degrees about the vertical axis; at 0 the model's front faces
// +z (down the plan), at 90 it faces +x. `asset` optionally names the inventory row
// this instance belongs to. Positions must fall inside the named room's polygon.
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
    if(typeof p?.model!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.model))errors.push(`${label}: model must be a kebab-case library id`);
    if(!room)errors.push(`${label}: no room "${p?.room}"`);
    const point=Array.isArray(p?.at)&&p.at.length===2&&p.at.every(Number.isFinite);
    if(!point)errors.push(`${label}: at must be [x,z] in metres`);
    else if(room&&!insidePolygon(p.at,room.polygon))errors.push(`${label}: [${p.at}] is outside ${room.name}`);
    if(p?.rotation!==undefined&&!Number.isFinite(p.rotation))errors.push(`${label}: rotation must be degrees`);
    if(p?.asset!==undefined&&!(home.inventory || []).some(a=>a.name===p.asset&&a.room===p.room))
      errors.push(`${label}: no inventory row "${p.asset}" in ${p.room}`);
    return {model:p?.model,room:p?.room,at:p?.at,rotation:p?.rotation ?? 0,...(p?.asset?{asset:p.asset}:{})};
  });
  if(errors.length)throw new Error(errors.join('\n'));
  return {...home,placements};
}
