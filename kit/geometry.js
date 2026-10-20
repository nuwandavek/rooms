import * as THREE from 'three';

// Plan points are [x,z] in metres; +z is down the source plan, +y is up.
export function planShape(points) {
  const shape = new THREE.Shape();
  points.forEach(([x,z],i) => i ? shape.lineTo(x,-z) : shape.moveTo(x,-z));
  shape.closePath();
  return shape;
}

export function createShell(model, palette) {
  const root = new THREE.Group();
  root.name = 'Architectural shell';
  const materials = Object.fromEntries(Object.entries(palette).map(([key,color]) => [key,
    new THREE.MeshStandardMaterial({ color, roughness:key === 'glass' ? .15 : .85,
      ...(key === 'glass' ? {transparent:true,opacity:.3,depthWrite:false} : {}),
      ...(key === 'frame' ? {metalness:.2} : {}) })]));
  const walls = new THREE.Group(), openings = new THREE.Group();
  root.add(walls, openings);
  const mesh = (geometry,material,parent=root) => {
    const result = new THREE.Mesh(geometry,material);
    result.castShadow = result.receiveShadow = true;
    parent.add(result);
    return result;
  };
  const flat = (points,material,y) => {
    const floor = mesh(new THREE.ShapeGeometry(planShape(points)),material);
    floor.rotation.x = -Math.PI/2;
    floor.position.y = y;
    return floor;
  };
  const slab = mesh(new THREE.ExtrudeGeometry(planShape(model.outline),
    {depth:.2,bevelEnabled:false}),materials.slab);
  slab.rotation.x = -Math.PI/2;
  slab.position.y = -.2;
  flat(model.outline,materials.floor,.003);
  for (const polygon of model.voids || []) flat(polygon,materials.duct,.009);
  const floors = model.rooms.map(room => {
    const material = materials[room.surface || 'floor'];
    const floor = flat(room.polygon,material,.015);
    floor.userData = {room,originalMaterial:material};
    return floor;
  });
  const box = (w,h,depth,x,y,z,material,parent) => {
    if (w <= .001 || h <= .001) return;
    const result = mesh(new THREE.BoxGeometry(w,h,depth),material,parent);
    result.position.set(x,y,z);
    return result;
  };
  const clear = group => { group.traverse(o => o.geometry?.dispose()); group.clear(); };
  const segment = (a,b,parent) => {
    const group = new THREE.Group();
    group.position.set(a[0],0,a[1]);
    group.rotation.y = -Math.atan2(b[1]-a[1],b[0]-a[0]);
    parent.add(group);
    return group;
  };
  function setWallHeight(height,walking=false) {
    clear(walls); clear(openings);
    const thickness = model.wallThickness;
    for (const wall of model.walls) {
      const length = Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
      const solid = segment(wall.a,wall.b,walls), detail = segment(wall.a,wall.b,openings);
      let cursor = 0;
      for (const opening of wall.openings || []) {
        const {start,end,top,type} = opening;
        const bottom = Math.min(opening.bottom,height), ceiling = Math.min(top,height);
        box(start-cursor,height,thickness,(start+cursor)/2,height/2,0,materials.wall,solid);
        box(end-start,bottom,thickness,(start+end)/2,bottom/2,0,materials.wall,solid);
        box(end-start,height-top,thickness,(start+end)/2,(height+top)/2,0,materials.wall,solid);
        if (ceiling > bottom) {
          const width=end-start, h=ceiling-bottom, frame=type==='door'?materials.door:materials.frame;
          box(.035,h,.13,start+.018,bottom+h/2,0,frame,detail);
          box(.035,h,.13,end-.018,bottom+h/2,0,frame,detail);
          if (height>=top) box(width,.04,.13,start+width/2,ceiling-.02,0,frame,detail);
          if (type==='door') {
            const leaf = new THREE.Group();
            leaf.position.set(start+.02,bottom,0); leaf.rotation.y=-Math.PI*.4;
            leaf.userData.doorLeaf=true;  // The viewer's "Doors closed" setting swings it shut.
            detail.add(leaf);
            box(width-.05,h,.035,(width-.05)/2,h/2,0,materials.door,leaf);
          } else {
            box(width,.035,.14,start+width/2,bottom+.018,0,frame,detail);
            // Sliding doors are shown open for the walkthrough.
            const panes=type==='slider'?(walking?0:4):2;
            for(let i=0;i<panes;i++) {
              box(width/panes-.025,h-.04,.015,start+width*(i+.5)/panes,bottom+h/2,0,materials.glass,detail);
              if(i>0) box(.025,h,.06,start+width*i/panes,bottom+h/2,0,frame,detail);
            }
          }
        }
        cursor=end;
      }
      box(length-cursor,height,thickness,(length+cursor)/2,height/2,0,materials.wall,solid);
    }
    for(const railing of model.railings || []) {
      const group=segment(railing.a,railing.b,openings);
      const length=Math.hypot(railing.b[0]-railing.a[0],railing.b[1]-railing.a[1]);
      const heightShown=Math.min(height,railing.height ?? 1.05);
      box(length,heightShown,.025,length/2,heightShown/2,0,materials.glass,group);
      box(length,.04,.055,length/2,heightShown,0,materials.frame,group);
      const posts=Math.ceil(length/1.2);
      for(let i=0;i<=posts;i++) box(.035,heightShown,.045,length*i/posts,heightShown/2,0,materials.frame,group);
    }
  }
  setWallHeight(model.cutaway);
  return {root,floors,openings,setWallHeight,
    select(id) {for(const floor of floors) floor.material=floor.userData.room.id===id?materials.selected:floor.userData.originalMaterial;},
    dispose() {root.traverse(o=>o.geometry?.dispose()); Object.values(materials).forEach(m=>m.dispose());},
  };
}
