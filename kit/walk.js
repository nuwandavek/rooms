import {PerspectiveCamera,Euler,Vector3} from 'three';

export const EYE_HEIGHT=1.65;
export function inside(point,polygon) {
  const [x,z]=point;let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
function distance(point,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/length)):0;
  return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dz);
}
export function walkSpace(model) {
  const radius=.18,segments=[];
  const edges=polygon=>polygon.map((a,i)=>[a,polygon[(i+1)%polygon.length],radius]);
  segments.push(...edges(model.outline));
  for(const polygon of model.voids || [])segments.push(...edges(polygon));
  for(const wall of model.walls) {
    const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
    const point=t=>[wall.a[0]+(wall.b[0]-wall.a[0])*t/length,wall.a[1]+(wall.b[1]-wall.a[1])*t/length];
    let cursor=0;
    for(const opening of wall.openings || []) {
      if(!['door','slider'].includes(opening.type)||opening.bottom>.05||opening.top<EYE_HEIGHT+.15)continue;
      segments.push([point(cursor),point(opening.start),radius+model.wallThickness/2]);cursor=opening.end;
    }
    segments.push([point(cursor),wall.b,radius+model.wallThickness/2]);
  }
  for(const rail of model.railings || [])segments.push([rail.a,rail.b,radius+.025]);
  const canStand=p=>inside(p,model.outline)&&!(model.voids || []).some(v=>inside(p,v))&&segments.every(([a,b,r])=>distance(p,a,b)>=r);
  function spawn(room) {
    if(room&&canStand(room.center)&&inside(room.center,room.polygon))return [...room.center];
    const candidates=room?[room,...model.rooms.filter(r=>r!==room)]:model.rooms;
    for(const candidate of candidates) {
      const xs=candidate.polygon.map(p=>p[0]),zs=candidate.polygon.map(p=>p[1]);
      for(let z=Math.min(...zs)+radius;z<Math.max(...zs);z+=.2)
        for(let x=Math.min(...xs)+radius;x<Math.max(...xs);x+=.2)
          if(inside([x,z],candidate.polygon)&&canStand([x,z]))return [x,z];
    }
    throw new Error('No clear standing position in this layout.');
  }
  function move(position,dx,dz) {
    const next=[...position],steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.05));
    for(let i=0;i<steps;i++) {
      // Small steps prevent tunneling through thin walls; axis tests slide along them.
      if(canStand([next[0]+dx/steps,next[1]]))next[0]+=dx/steps;
      if(canStand([next[0],next[1]+dz/steps]))next[1]+=dz/steps;
    }
    return next;
  }
  return {canStand,spawn,move};
}

export function createWalk(model,canvas) {
  const camera=new PerspectiveCamera(70,1,.05,500),space=walkSpace(model);
  const keys=new Set(),rotation=new Euler(0,0,0,'YXZ'),abort=new AbortController();
  let active=false,drag=null;
  canvas.tabIndex=0;canvas.setAttribute('aria-label','Home model. In Walk mode use W A S D to move and drag to look.');
  const on=(el,event,fn)=>el.addEventListener(event,fn,{signal:abort.signal});
  const stop=()=>{keys.clear();drag=null;};
  const look=(dx,dy)=>{
    rotation.setFromQuaternion(camera.quaternion,'YXZ');rotation.y-=dx*.0025;
    rotation.x=Math.max(-1.35,Math.min(1.35,rotation.x-dy*.0025));camera.quaternion.setFromEuler(rotation);
  };
  on(document,'keydown',event=>{
    if(!active||!['KeyW','KeyA','KeyS','KeyD'].includes(event.code)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(document.activeElement!==canvas&&document.pointerLockElement!==canvas)return;
    event.preventDefault();keys.add(event.code);
  });
  on(document,'keyup',e=>keys.delete(e.code));on(window,'blur',stop);
  on(document,'visibilitychange',stop);
  on(document,'pointerlockchange',()=>{if(document.pointerLockElement!==canvas)stop();});
  on(canvas,'pointerdown',e=>{if(active&&e.button===0){canvas.focus({preventScroll:true});drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
  on(canvas,'pointermove',e=>{
    if(!active||document.pointerLockElement===canvas||!drag)return;
    look(e.clientX-drag.x,e.clientY-drag.y);drag={x:e.clientX,y:e.clientY};
  });
  on(canvas,'pointerup',()=>drag=null);on(canvas,'pointercancel',()=>drag=null);
  on(document,'mousemove',e=>{if(active&&document.pointerLockElement===canvas)look(e.movementX,e.movementY);});
  function setActive(value) {
    if(active===value)return;active=value;stop();
    if(!active&&document.pointerLockElement===canvas)document.exitPointerLock();
  }
  return {camera,setActive,
    enter(room) {
      const [x,z]=space.spawn(room);camera.position.set(x,EYE_HEIGHT+.015,z);
      const xs=model.outline.map(p=>p[0]),zs=model.outline.map(p=>p[1]);
      const center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2];
      camera.lookAt(new Vector3(center[0],camera.position.y,center[1]===z&&center[0]===x?z-1:center[1]));
      canvas.focus({preventScroll:true});
    },
    lock() {if(active){canvas.focus({preventScroll:true});try{canvas.requestPointerLock?.()?.catch(()=>{});}catch{/* Drag-to-look remains available. */}}},
    update(dt) {
      if(!active)return;
      if(document.activeElement!==canvas&&document.pointerLockElement!==canvas){stop();return;}
      let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
      const magnitude=Math.hypot(forward,side);if(!magnitude)return;
      forward/=magnitude;side/=magnitude;
      rotation.setFromQuaternion(camera.quaternion,'YXZ');
      const step=1.8*Math.min(dt,.05),yaw=rotation.y;
      const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*step;
      const dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*step;
      const [x,z]=space.move([camera.position.x,camera.position.z],dx,dz);
      camera.position.set(x,EYE_HEIGHT+.015,z);
    },
    dispose(){setActive(false);abort.abort();},
  };
}
