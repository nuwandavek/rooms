import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walkSpace,inside} from '../walk.js';
import {tourStops,router} from '../tour.js';
import {validateHome} from '../validate.js';
import home from '../../projects/kalpataru-radiance/home.js';

const spec=JSON.parse(await readFile(new URL('../../projects/kalpataru-radiance/tour.json',import.meta.url),'utf8'));
const clear=(space,a,b)=>{
  const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.05);
  for(let k=0;k<=steps;k++)if(!space.canStand([a[0]+(b[0]-a[0])*k/steps,a[1]+(b[1]-a[1])*k/steps]))return false;
  return true;
};
test('every Radiance tour stop stands in its room and is reachable without crossing a wall',()=>{
  const space=walkSpace(home.model),route=router(home.model,space);
  for(const data of [spec,undefined]) {
    const stops=tourStops(home.model,data,space);
    assert.ok(stops.length>1);
    for(const stop of stops)assert.ok(inside(stop.at,stop.room.polygon),stop.room.name);
    for(let i=1;i<stops.length;i++) {
      const path=route(stops[i-1].at,stops[i].at);
      assert.deepEqual(path.at(-1),stops[i].at);
      for(let k=1;k<path.length;k++)assert.ok(clear(space,path[k-1],path[k]),`${stops[i-1].room.name} → ${stops[i].room.name}`);
    }
  }
});
test('tour.json is validated against the rooms',()=>{
  assert.deepEqual(validateHome({...home,tour:spec}),[]);
  const errors=validateHome({...home,tour:{stops:[{room:'attic',at:[1],hold:-1}]}});
  assert.equal(errors.length,3);
});
