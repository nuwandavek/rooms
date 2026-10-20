// Used by the build and tests; no browser or renderer required.
export function validateHome(home) {
  const errors=[];
  const require=(ok,message)=>{if(!ok)errors.push(message);};
  const positive=v=>Number.isFinite(v)&&v>0;
  const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
  const polygon=p=>Array.isArray(p)&&p.length>=3&&p.every(point)&&Math.abs(p.reduce((area,a,i)=>{
    const b=p[(i+1)%p.length];return area+a[0]*b[1]-b[0]*a[1];
  },0))>.00001;
  require(typeof home?.title==='string'&&home.title.trim(),'title is required');
  require(['riso','almanac','drafting'].includes(home?.theme || 'riso'),'theme must be riso, almanac or drafting');
  require(['daylight','afternoon'].includes(home?.lighting || 'daylight'),'lighting must be daylight or afternoon');
  const photos=value=>Array.isArray(value)&&value.every(p=>typeof p==='string'&&p.length>0);
  require(home?.resources===undefined||Array.isArray(home.resources),'resources must be an array');
  for(const group of (Array.isArray(home?.resources)?home.resources:[]))
    require(typeof group?.name==='string'&&photos(group.photos),'resource groups need a name and an array of photo paths');
  const model=home?.model;
  if(!model)return [...errors,'model is required'];
  require(positive(model.wallHeight)&&model.wallHeight>=.15,'wallHeight must be at least 0.15 metres');
  require(positive(model.wallThickness),'wallThickness must be positive');
  require(Number.isFinite(model.cutaway)&&model.cutaway>=.15&&model.cutaway<=model.wallHeight,'cutaway must be between 0.15 and wallHeight');
  require(polygon(model.outline),'outline must be a non-zero polygon of [x,z] points');
  require(Array.isArray(model.rooms)&&model.rooms.length>0,'rooms must be a non-empty array');
  const ids=new Set();
  for(const [i,room] of (Array.isArray(model.rooms)?model.rooms:[]).entries()) {
    const label=`rooms[${i}]`;
    require(typeof room.id==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(room.id)&&!ids.has(room.id),`${label}: unique kebab-case id required`);ids.add(room.id);
    require(typeof room.name==='string'&&room.name.trim(),`${label}: name required`);
    require(point(room.center),`${label}: center must be [x,z]`);
    require(polygon(room.polygon),`${label}: non-zero polygon required`);
    require(['floor','wet','balcony'].includes(room.surface || 'floor'),`${label}: unknown surface`);
    require(room.photos===undefined||photos(room.photos),`${label}: photos must be an array of image paths`);
  }
  require(Array.isArray(model.walls),'walls must be an array');
  for(const [i,wall] of (Array.isArray(model.walls)?model.walls:[]).entries()) {
    const length=point(wall.a)&&point(wall.b)?Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]):0;
    require(length>0,`walls[${i}]: endpoints must be distinct [x,z] points`);
    require(wall.openings===undefined||Array.isArray(wall.openings),`walls[${i}]: openings must be an array`);
    let end=0;
    for(const [j,o] of (Array.isArray(wall.openings)?wall.openings:[]).entries()) {
      require(Number.isFinite(o.start)&&Number.isFinite(o.end)&&o.start>=end&&o.end>o.start&&o.end<=length+.00001,
        `walls[${i}].openings[${j}]: offsets must be ordered, non-overlapping, and within the wall`);
      require(Number.isFinite(o.bottom)&&Number.isFinite(o.top)&&o.bottom>=0&&o.top>o.bottom&&o.top<=model.wallHeight,
        `walls[${i}].openings[${j}]: heights must fit within wallHeight`);
      require(['door','window','slider'].includes(o.type),`walls[${i}].openings[${j}]: unknown type`);
      end=o.end;
    }
  }
  require(model.voids===undefined||Array.isArray(model.voids),'voids must be an array');
  for(const p of (Array.isArray(model.voids)?model.voids:[]))require(polygon(p),'voids must contain non-zero polygons');
  require(model.railings===undefined||Array.isArray(model.railings),'railings must be an array');
  for(const r of (Array.isArray(model.railings)?model.railings:[]))
    require(point(r.a)&&point(r.b)&&(r.a[0]!==r.b[0]||r.a[1]!==r.b[1])&&(r.height===undefined||positive(r.height)),'railings need distinct endpoints and a positive height');
  return errors;
}

export function imagePaths(home) {
  return [...new Set([home.floorPlan?.image,...home.model.rooms.flatMap(r=>[r.photo,...(r.photos || [])]),
    ...(home.resources || []).flatMap(group=>group.photos),...(home.inventory || []).flatMap(asset=>asset.photos)].filter(Boolean))];
}
