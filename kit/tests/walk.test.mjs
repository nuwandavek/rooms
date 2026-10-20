import test from 'node:test';
import assert from 'node:assert/strict';
import {walkSpace,inside} from '../walk.js';
import home from '../../projects/kalpataru-radiance/home.js';
import starter from '../template/home.js';

const model={...starter.model,walls:[{a:[-3,0],b:[3,0],openings:[{start:2.5,end:3.5,type:'door',bottom:0,top:2.15}]}]};
test('walk passes a doorway and stops at an adjacent solid wall, even on a long step',()=>{
  const space=walkSpace(model);
  assert.ok(space.move([0,-1],0,2)[1]>.9);
  const blocked=space.move([2,-1],0,2);
  assert.ok(blocked[1]<-.25);
  assert.ok(space.canStand(blocked));
});
test('walk cannot cross windows, service voids, railings, or the slab edge',()=>{
  const windowModel=structuredClone(model);windowModel.walls[0].openings[0].type='window';
  assert.ok(walkSpace(windowModel).move([0,-1],0,2)[1]<0);
  const space=walkSpace({...starter.model,walls:[],voids:[[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]],railings:[{a:[1,-2],b:[1,2]}]});
  assert.equal(space.canStand([0,0]),false);
  assert.ok(space.move([0,-1],0,2)[1]<-.5);
  assert.ok(space.move([0,-1],3,0)[0]<1);
  assert.ok(space.move([-2,0],-10,0)[0]>-3);
});
test('each Radiance room and the starter have a clear standing position in their own polygon',()=>{
  for(const data of [home,starter]) {
    const space=walkSpace(data.model);
    for(const room of data.model.rooms) {
      const p=space.spawn(room);
      assert.ok(space.canStand(p),room.name);
      assert.ok(inside(p,room.polygon),`${room.name}: spawn stays in the requested room`);
    }
  }
});
