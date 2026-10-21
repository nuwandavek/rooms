import * as THREE from 'three';
import {buildMaterial} from './materials.js';
import {insidePolygon} from './placements.js';
import {wallFinish,wallBands,floorFinish} from './fitout.js';

// Box UVs in metres, so a material's texture keeps its real-world size on any box.
// u0/v0 shift the long faces so tiles run on across neighbouring wall pieces.
export function metreUVs(geometry,w,h,d,u0=0,v0=0) {
  const uv=geometry.attributes.uv;
  const faces=[[d,h,0,v0],[d,h,0,v0],[w,d,u0,0],[w,d,u0,0],[w,h,u0,v0],[w,h,u0,v0]];
  for(let i=0;i<uv.count;i++) {
    const f=Math.floor(i/4),[su,sv,ou,ov]=faces[f];
    // The -z face's u runs from +x to -x; keep both long faces in wall coordinates.
    const u=f===5?ou+(1-uv.getX(i))*su:ou+uv.getX(i)*su;
    uv.setXY(i,f===5?-u:u,ov+uv.getY(i)*sv);
  }
}

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
    const geometry=new THREE.BoxGeometry(w,h,depth);metreUVs(geometry,w,h,depth,x-w/2,y-h/2);
    const result = mesh(geometry,material,parent);
    result.position.set(x,y,z);
    return result;
  };
  const doorHardware=new THREE.MeshStandardMaterial({color:'#c8cacc',roughness:.28,metalness:1});  // brushed steel
  // Finishes (Fit-out and Furnished tabs). Null shows the plain shell.
  let finishes=null,realistic=false,lastHeight=model.cutaway,lastWalking=false;
  const finish=id=>id&&finishes ? buildMaterial(id,finishes.materials[id],realistic) : null;
  // Which room each side of each wall looks into, sampled every 5 cm along the wall.
  // Local +z of a wall segment points to (-uz, ux) in plan, where u runs from a to b.
  const roomAt=point=>model.rooms.find(r=>insidePolygon(point,r.polygon))?.id ?? null;
  const sides=new Map(model.walls.map(wall=>{
    const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
    const ux=(wall.b[0]-wall.a[0])/length,uz=(wall.b[1]-wall.a[1])/length,off=model.wallThickness/2+.05;
    const runs=side=>{
      const out=[];
      for(let t=0;t<=length;t+=.05) {
        const id=roomAt([wall.a[0]+ux*t-uz*off*side,wall.a[1]+uz*t+ux*off*side]);
        if(!out.length||out.at(-1).id!==id)out.push({from:t,id});
      }
      return out;
    };
    return [wall,{plus:runs(1),minus:runs(-1)}];
  }));
  const sideRoom=(runs,t)=>runs.findLast(r=>r.from<=t)?.id ?? null;
  // Skirting on both faces of a wall: one strip per run of a room that wants it, cut at
  // floor-level openings (doors, sliders). Local +z is the `plus` side of the wall.
  function skirting(wall,length,parent) {
    const k=finishes.skirting,mat=finish(k.material),{plus,minus}=sides.get(wall);
    const gaps=(wall.openings || []).filter(o=>o.bottom<.05).map(o=>[o.start,o.end]);
    for(const [runs,sign] of [[plus,1],[minus,-1]])runs.forEach((run,i)=>{
      if(!run.id||k.except.includes(run.id))return;
      let pieces=[[run.from,runs[i+1]?.from ?? length]];
      for(const [g0,g1] of gaps)pieces=pieces.flatMap(([a,b])=>g1<=a||g0>=b?[[a,b]]:[[a,g0],[g1,b]].filter(([x,y])=>y-x>.02));
      for(const [a,b] of pieces)box(b-a,k.height,k.depth,(a+b)/2,k.height/2,sign*(model.wallThickness/2+k.depth/2),mat,parent);
    });
  }
  // A solid wall piece from x0 to x1 along the wall and y0 to y1 up, split where the room
  // on either side changes and at that room's finish bands, each face in its finish.
  function wallPiece(wall,x0,x1,y0,y1,parent) {
    const thickness=model.wallThickness;
    if(!finishes)return box(x1-x0,y1-y0,thickness,(x0+x1)/2,(y0+y1)/2,0,materials.wall,parent);
    const {plus,minus}=sides.get(wall);
    const xs=[x0,...[...plus,...minus].map(r=>r.from).filter(t=>t>x0+.01&&t<x1-.01),x1].sort((a,b)=>a-b);
    for(let i=0;i<xs.length-1;i++) {
      const mid=(xs[i]+xs[i+1])/2,rp=sideRoom(plus,mid),rm=sideRoom(minus,mid);
      const ys=[...new Set([y0,...[...wallBands(finishes,rp),...wallBands(finishes,rm)].filter(y=>y>y0+.005&&y<y1-.005),y1])].sort((a,b)=>a-b);
      for(let j=0;j<ys.length-1;j++) {
        const ym=(ys[j]+ys[j+1])/2;
        const face=room=>finish(wallFinish(finishes,room,ym)) || materials.wall;
        box(xs[i+1]-xs[i],ys[j+1]-ys[j],thickness,mid,ym,0,
          [materials.wall,materials.wall,materials.wall,materials.wall,face(rp),face(rm)],parent);
      }
    }
  }
  const clear = group => { group.traverse(o => o.geometry?.dispose()); group.clear(); };
  const segment = (a,b,parent) => {
    const group = new THREE.Group();
    group.position.set(a[0],0,a[1]);
    group.rotation.y = -Math.atan2(b[1]-a[1],b[0]-a[0]);
    parent.add(group);
    return group;
  };
  function setWallHeight(height,walking=false) {
    lastHeight=height;lastWalking=walking;
    clear(walls); clear(openings);
    const doorMat=finish(finishes?.doors) || materials.door,doorFrame=finish(finishes?.doorFrames) || materials.door;
    const windowFrame=finish(finishes?.windowFrames) || materials.frame;
    const hardware=doorHardware;
    const thickness = model.wallThickness;
    for (const wall of model.walls) {
      const length = Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
      const solid = segment(wall.a,wall.b,walls), detail = segment(wall.a,wall.b,openings);
      let cursor = 0;
      for (const opening of wall.openings || []) {
        const {start,end,top,type} = opening;
        const bottom = Math.min(opening.bottom,height), ceiling = Math.min(top,height);
        wallPiece(wall,cursor,start,0,height,solid);
        if (bottom>.001) wallPiece(wall,start,end,0,bottom,solid);
        if (height-top>.001) wallPiece(wall,start,end,top,height,solid);
        if (ceiling > bottom) {
          const width=end-start, h=ceiling-bottom, frame=type==='door'?doorFrame:windowFrame;
          box(.035,h,.13,start+.018,bottom+h/2,0,frame,detail);
          box(.035,h,.13,end-.018,bottom+h/2,0,frame,detail);
          if (height>=top) box(width,.04,.13,start+width/2,ceiling-.02,0,frame,detail);
          if (type==='door') {
            const leaf = new THREE.Group();
            leaf.position.set(start+.02,bottom,0); leaf.rotation.y=-Math.PI*.4;
            leaf.userData.doorLeaf=true;  // The viewer's "Doors closed" setting swings it shut.
            detail.add(leaf);
            const lw=width-.05;
            box(lw,h,.035,lw/2,h/2,0,doorMat,leaf);
            // Hardware: three hinges on the hinge edge, a lever handle with a round rose each side.
            for(const y of [.2,h/2,h-.2]) box(.012,.1,.04,.006,y,0,hardware,leaf);
            const hx=lw-.07,hy=Math.min(1.02,h*.5);
            for(const side of [1,-1]) {
              const rose=mesh(new THREE.CylinderGeometry(.026,.026,.01,24),hardware,leaf);
              rose.rotation.x=Math.PI/2;rose.position.set(hx,hy,side*.0225);
              const neck=mesh(new THREE.CylinderGeometry(.008,.008,.05,12),hardware,leaf);
              neck.rotation.x=Math.PI/2;neck.position.set(hx,hy,side*.045);
              box(.13,.016,.02,hx-.055,hy,side*.07,hardware,leaf);
            }
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
      wallPiece(wall,cursor,length,0,height,solid);
      if(finishes?.skirting)skirting(wall,length,solid);
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
  // Finishes on (an object from finishes.json, via the build) or off (null, the Shell tab).
  // `photo` picks the Realistic tab's physical material variants.
  function setFinishes(value,photo=false) {
    if(value===finishes&&photo===realistic)return;
    finishes=value;realistic=photo;
    for(const floor of floors)floor.userData.originalMaterial=finish(floorFinish(finishes,floor.userData.room.id))
      || materials[floor.userData.room.surface || 'floor'];
    setWallHeight(lastHeight,lastWalking);select(selectedId);
  }
  let selectedId=null;
  function select(id) {
    selectedId=id;
    // The yellow selected floor is a Shell aid; with finishes on it would hide the real floor.
    for(const floor of floors) floor.material=floor.userData.room.id===id&&!finishes?materials.selected:floor.userData.originalMaterial;
  }
  return {root,floors,openings,setWallHeight,setFinishes,
    select,
    dispose() {root.traverse(o=>o.geometry?.dispose()); Object.values(materials).forEach(m=>m.dispose());},
  };
}
