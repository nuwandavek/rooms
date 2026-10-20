// Reads a project's resources.md into the Resources tab data. No browser required.
//
//   ## Floor plan            -> floorPlan {image, alt, note}; the note is the section's prose
//   ## Living & Dining       -> photos for the room with that name
//   ## Bath 3 {#bath-3}      -> photos for the room with that id
//   ## Society               -> an extra Resources group
//
// Images are `![alt](path)` lines. Other prose is kept for people and ignored here,
// except in the floor plan section.
export function parseResources(markdown) {
  const sections=[];let current=null;
  // HTML comments are notes for people, including commented-out example images.
  for(const raw of markdown.replace(/<!--[\s\S]*?-->/g,'').split(/\r?\n/)) {
    const line=raw.trim();
    const heading=/^##\s+(.+?)(?:\s*\{#([a-z0-9-]+)\})?\s*$/.exec(line);
    if(heading){current={name:heading[1].trim(),id:heading[2],images:[],text:[]};sections.push(current);continue;}
    if(!current||/^#\s/.test(line))continue;
    const images=[...line.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)];
    if(images.length)current.images.push(...images.map(m=>({alt:m[1],path:m[2]})));
    else if(line)current.text.push(line);
  }
  return sections;
}

export function applyResources(home,markdown) {
  const errors=[],rooms=home.model?.rooms || [];
  const result={...home,model:{...home.model,rooms:rooms.map(room=>({...room}))},resources:[...(home.resources || [])]};
  const seen=new Set();
  for(const section of parseResources(markdown)) {
    const key=section.id || section.name.toLowerCase();
    if(seen.has(key))errors.push(`resources.md: duplicate section "${section.name}"`);seen.add(key);
    if(!section.id&&section.name.toLowerCase()==='floor plan') {
      const [image]=section.images;
      if(!image)continue;  // An empty Floor plan section leaves the plan unset.
      result.floorPlan={image:image.path,alt:image.alt || 'Source floor plan',note:section.text.join(' ')};
      continue;
    }
    const room=result.model.rooms.find(r=>section.id?r.id===section.id:r.name.toLowerCase()===section.name.toLowerCase());
    if(section.id&&!room){errors.push(`resources.md: no room with id "${section.id}"`);continue;}
    const photos=section.images.map(i=>i.path);
    if(room)room.photos=photos;
    else result.resources.push({name:section.name,photos});
  }
  if(errors.length)throw new Error(errors.join('\n'));
  return result;
}
