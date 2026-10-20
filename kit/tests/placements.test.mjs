import test from 'node:test';
import assert from 'node:assert/strict';
import starter from '../template/home.js';
import {applyPlacements,insidePolygon} from '../placements.js';
import {applyInventory} from '../inventory.js';

const home=applyInventory(starter,'| Asset | Room |\n|-|-|\n| Sofa | main |');
test('placements.json positions models inside rooms and links inventory rows',()=>{
  const placed=applyPlacements(home,JSON.stringify({placements:[{model:'sofa-3seat',room:'main',at:[1,.5],rotation:90,asset:'Sofa'},{model:'bed-queen',room:'main',at:[0,0]}]}));
  assert.deepEqual(placed.placements,[{model:'sofa-3seat',room:'main',at:[1,.5],rotation:90,asset:'Sofa'},{model:'bed-queen',room:'main',at:[0,0],rotation:0}]);
  assert.equal(insidePolygon([4,0],starter.model.rooms[0].polygon),false);
});
test('placements.json rejects positions outside the room and unknown references',()=>{
  const bad={placements:[{model:'sofa-3seat',room:'main',at:[9,0]},{model:'Bad Id',room:'den',at:[0,0]},{model:'x',room:'main',at:[0,0],asset:'Lamp'}]};
  assert.throws(()=>applyPlacements(home,JSON.stringify(bad)),e=>/outside Main room/.test(e.message)&&/no room "den"/.test(e.message)&&/kebab-case/.test(e.message)&&/no inventory row "Lamp"/.test(e.message));
  assert.throws(()=>applyPlacements(home,'{nope'),/placements.json/);
});
