import {PerspectiveCamera,Euler,Vector3,Vector2,Plane,Raycaster,Group} from 'three';

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

// Walk controls, chosen to work for people who do not play games:
// - click the floor to glide there (a ring marks the spot until you arrive);
// - drag to look, Street View style (drag the view itself);
// - WASD or arrow keys to move, Q/E or ←/→ to turn, the scroll wheel to step;
// - optional pointer-lock mouse look, which turns like a game (FPS-style).
export function createWalk(model,canvas) {
  // The far plane reaches the city and sky dome outside.
  const camera=new PerspectiveCamera(70,1,.05,1500),space=walkSpace(model);
  const keys=new Set(),rotation=new Euler(0,0,0,'YXZ'),abort=new AbortController();
  let active=false,drag=null,glide=null;
  canvas.tabIndex=0;canvas.setAttribute('aria-label','Home model. In Walk mode click the floor to walk there, drag to look around, or use W A S D and the arrow keys.');
  const on=(el,event,fn,options={})=>el.addEventListener(event,fn,{signal:abort.signal,...options});
  const stop=()=>{keys.clear();drag=null;glide=null;};
  const MOVE_KEYS=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  // Landing ring: an SVG outline over the canvas, projected onto the floor in true
  // perspective. Drawing it never redraws the 3D scene.
  const svgNS='http://www.w3.org/2000/svg';
  const overlay=document.createElementNS(svgNS,'svg');
  overlay.setAttribute('class','walk-ring');overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';
  const outline=document.createElementNS(svgNS,'polygon'),dot=document.createElementNS(svgNS,'polygon');
  for(const [el,w] of [[outline,2.5],[dot,0]]){el.setAttribute('fill',w?'none':'rgba(255,255,255,.85)');el.setAttribute('stroke','rgba(255,255,255,.9)');el.setAttribute('stroke-width',w);overlay.append(el);}
  canvas.parentElement?.append(overlay);
  let ringPoint=null;
  const projected=new Vector3();
  function drawRing() {
    if(!ringPoint){overlay.style.display='none';return;}
    const rect=canvas.getBoundingClientRect(),circle=r=>Array.from({length:40},(_,k)=>{
      const a=k/40*Math.PI*2;projected.set(ringPoint[0]+Math.cos(a)*r,.02,ringPoint[1]+Math.sin(a)*r).project(camera);
      return `${((projected.x+1)/2*rect.width).toFixed(1)},${((1-projected.y)/2*rect.height).toFixed(1)}`;
    }).join(' ');
    outline.setAttribute('points',circle(.24));dot.setAttribute('points',circle(.05));overlay.style.display='';
  }
  const showRing=point=>{ringPoint=point;drawRing();};
  const raycaster=new Raycaster(),floor=new Plane(new Vector3(0,1,0),-.02),hit=new Vector3(),pointer=new Vector2();
  function floorPoint(event) {
    const rect=canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    if(!raycaster.ray.intersectPlane(floor,hit)||hit.distanceTo(camera.position)>14)return null;
    const point=[hit.x,hit.z];return space.canStand(point)?point:null;
  }
  const look=(dx,dy,grab)=>{
    // Grab-style drag moves the view with the hand; mouse look turns toward the mouse.
    const s=grab?-1:1;
    rotation.setFromQuaternion(camera.quaternion,'YXZ');rotation.y-=s*dx*.0025;
    rotation.x=Math.max(-1.35,Math.min(1.35,rotation.x-s*dy*.0025));camera.quaternion.setFromEuler(rotation);
  };
  const forwardOf=()=>{rotation.setFromQuaternion(camera.quaternion,'YXZ');return [-Math.sin(rotation.y),-Math.cos(rotation.y)];};
  on(document,'keydown',event=>{
    if(!active||!MOVE_KEYS.includes(event.code)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(document.activeElement!==canvas&&document.pointerLockElement!==canvas)return;
    event.preventDefault();keys.add(event.code);glide=null;
  });
  on(document,'keyup',e=>keys.delete(e.code));on(window,'blur',stop);
  on(document,'visibilitychange',stop);
  on(document,'pointerlockchange',()=>{if(document.pointerLockElement!==canvas)stop();});
  on(canvas,'pointerdown',e=>{
    if(!active||e.button!==0)return;
    canvas.focus({preventScroll:true});drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,time:performance.now()};
    canvas.setPointerCapture(e.pointerId);
  });
  on(canvas,'pointermove',e=>{
    // Plain mouse movement only moves the landing ring (no 3D redraw); a drag turns the view.
    if(!active||document.pointerLockElement===canvas)return;
    if(!drag){if(!glide)showRing(floorPoint(e));return;}
    look(e.clientX-drag.x,e.clientY-drag.y,true);drag.x=e.clientX;drag.y=e.clientY;
  });
  on(canvas,'pointerup',e=>{
    // A click (not a drag) on the floor walks there.
    if(drag&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<=6&&performance.now()-drag.time<500) {
      const point=floorPoint(e);if(point){glide={target:point};showRing(point);}
    }
    drag=null;
  });
  on(canvas,'pointercancel',()=>drag=null);
  on(canvas,'pointerleave',()=>{if(!glide)showRing(null);});
  on(canvas,'wheel',e=>{
    if(!active)return;e.preventDefault();
    const [fx,fz]=forwardOf(),step=Math.sign(-e.deltaY)*.5;
    const from=glide?.target ?? [camera.position.x,camera.position.z];
    glide={target:space.move(from,fx*step,fz*step)};
  },{passive:false});
  on(document,'mousemove',e=>{if(active&&document.pointerLockElement===canvas)look(e.movementX,e.movementY,false);});
  function setActive(value) {
    if(active===value)return;active=value;stop();showRing(null);
    if(!active&&document.pointerLockElement===canvas)document.exitPointerLock();
  }
  return {camera,space,setActive,
    enter(room) {
      const [x,z]=space.spawn(room);camera.position.set(x,EYE_HEIGHT+.015,z);glide=null;
      const xs=model.outline.map(p=>p[0]),zs=model.outline.map(p=>p[1]);
      const center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2];
      camera.lookAt(new Vector3(center[0],camera.position.y,center[1]===z&&center[0]===x?z-1:center[1]));
      canvas.focus({preventScroll:true});
    },
    // Stand at a plan point facing a heading and pitch (radians); used by shared links.
    place([x,z],heading,pitch) {
      const [px,pz]=space.canStand([x,z])?[x,z]:space.spawn(null);
      camera.position.set(px,EYE_HEIGHT+.015,pz);glide=null;
      rotation.set(Math.max(-1.35,Math.min(1.35,pitch)),heading,0,'YXZ');camera.quaternion.setFromEuler(rotation);
    },
    lock() {if(active){canvas.focus({preventScroll:true});try{canvas.requestPointerLock?.()?.catch(()=>{});}catch{/* Drag-to-look remains available. */}}},
    update(dt) {
      if(!active)return;
      if(ringPoint)drawRing();  // Keep the ring on its floor spot as the view moves.
      const t=Math.min(dt,.05);
      // Turning keys rotate in place.
      const turn=Number(keys.has('ArrowLeft')||keys.has('KeyQ'))-Number(keys.has('ArrowRight')||keys.has('KeyE'));
      if(turn){rotation.setFromQuaternion(camera.quaternion,'YXZ');rotation.y+=turn*1.8*t;camera.quaternion.setFromEuler(rotation);}
      let forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
      let side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
      const position=[camera.position.x,camera.position.z];
      if(forward||side) {
        const magnitude=Math.hypot(forward,side);forward/=magnitude;side/=magnitude;
        rotation.setFromQuaternion(camera.quaternion,'YXZ');
        const step=1.8*t,yaw=rotation.y;
        const [x,z]=space.move(position,(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*step,(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*step);
        camera.position.set(x,EYE_HEIGHT+.015,z);
      } else if(glide) {
        // Ease toward the clicked spot; stop at the target or when a wall blocks the way.
        const dx=glide.target[0]-position[0],dz=glide.target[1]-position[1],left=Math.hypot(dx,dz);
        const step=Math.min(left,Math.max(.6,left*3)*t);
        const [x,z]=space.move(position,dx/left*step || 0,dz/left*step || 0);
        if(left<.03||Math.hypot(x-position[0],z-position[1])<1e-4){glide=null;showRing(null);}
        camera.position.set(x,EYE_HEIGHT+.015,z);
      }
    },
    dispose(){setActive(false);abort.abort();overlay.remove();},
  };
}
