import {Euler} from 'three';
import {EYE_HEIGHT} from './walk.js';

// Guided tour: the walk camera glides from stop to stop along a route around the walls,
// and at each stop holds while slowly panning. projects/<name>/tour.json lists the
// stops (see kit/model.md); without one, the tour visits every featured room in order.
// Headings and pitches are degrees, as in Walk's ?cam=x,z,heading,pitch.
export const TOUR_DEFAULTS={speed:1,hold:10,pan:300,pitch:-4};

export function tourStops(model,spec,space) {
  const settings={...TOUR_DEFAULTS,...(spec || {})};
  const stops=spec?.stops?.length?spec.stops:model.rooms.filter(r=>r.featured).map(r=>({room:r.id}));
  const rad=d=>d*Math.PI/180;
  return stops.map(stop=>{
    const room=model.rooms.find(r=>r.id===stop.room);
    const at=stop.at&&space.canStand(stop.at)?[...stop.at]:space.spawn(room);
    return {room,at,heading:Number.isFinite(stop.heading)?rad(stop.heading):null,pitch:rad(stop.pitch ?? settings.pitch),
      hold:stop.hold ?? settings.hold,pan:rad(stop.pan ?? settings.pan),note:stop.note || ''};
  });
}

// Shortest walkable route on a 10 cm grid, then pulled taut between points that can see
// each other, so the camera cuts corners like a person instead of zigzagging.
export function router(model,space) {
  const cell=.1,xs=model.outline.map(p=>p[0]),zs=model.outline.map(p=>p[1]);
  const x0=Math.min(...xs),z0=Math.min(...zs),w=Math.ceil((Math.max(...xs)-x0)/cell)+1,h=Math.ceil((Math.max(...zs)-z0)/cell)+1;
  let free=null;
  const at=i=>[x0+(i%w)*cell,z0+Math.floor(i/w)*cell];
  const index=([x,z])=>Math.round((z-z0)/cell)*w+Math.round((x-x0)/cell);
  const clear=(a,b)=>{
    const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.05);
    for(let k=1;k<steps;k++)if(!space.canStand([a[0]+(b[0]-a[0])*k/steps,a[1]+(b[1]-a[1])*k/steps]))return false;
    return true;
  };
  function nearest(point) {
    const start=index(point);if(free[start])return start;
    let best=-1,distance=Infinity;
    for(let i=0;i<free.length;i++)if(free[i]){const [x,z]=at(i),d=Math.hypot(x-point[0],z-point[1]);if(d<distance){distance=d;best=i;}}
    return best;
  }
  return function route(from,to) {
    if(clear(from,to))return [from,to];
    free??=Uint8Array.from({length:w*h},(_,i)=>space.canStand(at(i))?1:0);
    const start=nearest(from),goal=nearest(to),previous=new Int32Array(w*h).fill(-1);
    const queue=[start];previous[start]=start;
    for(let q=0;q<queue.length&&previous[goal]<0;q++) {
      const i=queue[q],x=i%w;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,j=i+dx+dz*w;
        if(nx<0||nx>=w||j<0||j>=w*h||!free[j]||previous[j]>=0)continue;
        previous[j]=i;queue.push(j);
      }
    }
    if(previous[goal]<0)return [from,to];
    const cells=[];for(let i=goal;i!==start;i=previous[i])cells.push(at(i));
    const path=[from,...cells.reverse(),to],taut=[from];
    for(let i=0;i<path.length-1;) {
      let j=path.length-1;while(j>i+1&&!clear(path[i],path[j]))j--;
      taut.push(path[j]);i=j;
    }
    return taut;
  };
}

export function createTour({model,spec,space,camera,onChange=()=>{}}) {
  const stops=tourStops(model,spec,space),route=router(model,space),speed=spec?.speed ?? TOUR_DEFAULTS.speed;
  const euler=new Euler(0,0,0,'YXZ');
  let index=0,phase='done',path=null,travelled=0,length=0,holdTime=0,sweepFrom=0,sweepTo=0,playing=false;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const position=()=>[camera.position.x,camera.position.z];
  function pose([x,z],yaw,pitch) {camera.position.set(x,EYE_HEIGHT+.015,z);euler.set(pitch,yaw,0,'YXZ');camera.quaternion.setFromEuler(euler);}
  function turnToward(yaw,pitch,rate,dt) {
    euler.setFromQuaternion(camera.quaternion,'YXZ');
    const k=Math.min(1,rate*dt);euler.y+=wrap(yaw-euler.y)*k;euler.x+=(pitch-euler.x)*k;euler.z=0;
    camera.quaternion.setFromEuler(euler);
  }
  // One slow pan per stop, from the stop's heading (or the way you arrived facing), turning
  // whichever way ends nearer the next stop so the walk leaves without a swing back.
  function arrive() {
    const stop=stops[index];phase='hold';holdTime=0;
    euler.setFromQuaternion(camera.quaternion,'YXZ');
    const next=stops[index+1],leg=next&&route(stop.at,next.at)[1];
    sweepFrom=stop.heading ?? euler.y;
    const nextYaw=leg?Math.atan2(-(leg[0]-stop.at[0]),-(leg[1]-stop.at[1])):sweepFrom;
    const miss=side=>Math.abs(wrap(sweepFrom+side*stop.pan-nextYaw));
    sweepTo=sweepFrom+(miss(1)<=miss(-1)?1:-1)*stop.pan;onChange();
  }
  function travelTo(i) {
    index=i;const from=position();path=route(from,stops[i].at);travelled=0;
    length=path.slice(1).reduce((sum,p,k)=>sum+Math.hypot(p[0]-path[k][0],p[1]-path[k][1]),0);
    phase='travel';onChange();
  }
  // Jumping (start, next, previous) places the camera at the stop instead of walking there,
  // facing the way the walk would have arrived (the first stop faces the middle of the home).
  function jump(i) {
    index=Math.max(0,Math.min(stops.length-1,i));const stop=stops[index];
    let from;
    if(index>0){const path=route(stops[index-1].at,stop.at);from=path.at(-2);}
    else {const xs=model.outline.map(p=>p[0]),zs=model.outline.map(p=>p[1]);from=[2*stop.at[0]-(Math.min(...xs)+Math.max(...xs))/2,2*stop.at[1]-(Math.min(...zs)+Math.max(...zs))/2];}
    const dx=stop.at[0]-from[0],dz=stop.at[1]-from[1];
    pose(stop.at,stop.heading ?? (Math.hypot(dx,dz)>.05?Math.atan2(-dx,-dz):0),stop.pitch);arrive();
    pose(stop.at,sweepFrom,stop.pitch);
  }
  function pointAlong(distance) {
    for(let k=1;k<path.length;k++) {
      const a=path[k-1],b=path[k],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(distance<=d||k===path.length-1){const t=d?Math.min(1,distance/d):1;return {point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],direction:[b[0]-a[0],b[1]-a[1]]};}
      distance-=d;
    }
    return {point:path.at(-1),direction:[0,0]};
  }
  return {stops,
    get index(){return index;},get playing(){return playing;},get phase(){return phase;},
    start(){playing=true;jump(0);},
    stop(){playing=false;phase='done';},
    toggle(){if(phase==='done'){playing=true;jump(0);}else{playing=!playing;onChange();}},
    next(){if(index<stops.length-1){playing=true;jump(index+1);}},
    previous(){playing=true;jump(index-1);},
    update(dt) {
      if(!playing||phase==='done')return;
      const t=Math.min(dt,.05);
      if(phase==='travel') {
        // Ease in and out of each stop; look where you are going.
        const pace=Math.min(speed,.35+travelled*1.4,.35+(length-travelled)*1.4);
        travelled=Math.min(length,travelled+pace*t);
        const {point,direction}=pointAlong(travelled);
        camera.position.set(point[0],EYE_HEIGHT+.015,point[1]);
        if(Math.hypot(...direction)>1e-6)turnToward(Math.atan2(-direction[0],-direction[1]),-.03,2,t);
        if(travelled>=length-1e-4)arrive();
      } else {
        // Hold: ease from one side of the pan to the other, once.
        holdTime+=t;const stop=stops[index],k=Math.min(1,holdTime/stop.hold),ease=k*k*(3-2*k);
        turnToward(sweepFrom+(sweepTo-sweepFrom)*ease,stop.pitch,4,t);
        if(holdTime>=stop.hold) {
          if(index<stops.length-1)travelTo(index+1);else{phase='done';playing=false;onChange();}
        }
      }
    },
  };
}
