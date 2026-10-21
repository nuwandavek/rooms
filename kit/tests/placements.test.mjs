import test from 'node:test';
import assert from 'node:assert/strict';
import starter from '../template/home.js';
import {applyPlacements,insidePolygon} from '../placements.js';
import {applyInventory} from '../inventory.js';

const home=applyInventory(starter,'| Asset | Room |\n|-|-|\n| Sofa | main |');
test('lamp anchors retain the authored bulb position and reject malformed positions',()=>{
  const light={offset:[0,.188,0],radius:.033,colour:'#ffe2b5',bulbMaterial:'globe',dayFactor:1};
  const placed=applyPlacements(home,JSON.stringify({placements:[{model:'pendant',room:'main',at:[0,0],light}]}));
  assert.deepEqual(placed.placements[0].light,light);
  for(const invalid of [{offset:[0,1]}, {offset:[0,1,0],radius:-1}, {offset:[0,1,0],colour:'orange'}, {offset:[0,1,0],dayFactor:-1}])
    assert.throws(()=>applyPlacements(home,JSON.stringify({placements:[{model:'pendant',room:'main',at:[0,0],light:invalid}]})),/light\./);
});
test('placements.json positions models inside rooms and links inventory rows',()=>{
  const placed=applyPlacements(home,JSON.stringify({placements:[{model:'sofa-3seat',room:'main',at:[1,.5],rotation:90,asset:'Sofa'},{model:'bed-queen',room:'main',at:[0,0]}]}));
  assert.deepEqual(placed.placements,[{model:'sofa-3seat',room:'main',at:[1,.5],rotation:90,y:0,asset:'Sofa'},{model:'bed-queen',room:'main',at:[0,0],rotation:0,y:0}]);
  assert.equal(insidePolygon([4,0],starter.model.rooms[0].polygon),false);
});
test('placements.json rejects positions outside the room and unknown references',()=>{
  const bad={placements:[{model:'sofa-3seat',room:'main',at:[9,0]},{model:'Bad Id',room:'den',at:[0,0]},{model:'x',room:'main',at:[0,0],asset:'Lamp'}]};
  assert.throws(()=>applyPlacements(home,JSON.stringify(bad)),e=>/outside Main room/.test(e.message)&&/no room "den"/.test(e.message)&&/kebab-case/.test(e.message)&&/no inventory row "Lamp"/.test(e.message));
  assert.throws(()=>applyPlacements(home,'{nope'),/placements.json/);
});
test('placements take model, Dims and Colour from the inventory row and respect Qty',()=>{
  const inv=applyInventory(starter,'| Asset | Room | Qty | Dims | Colour | Model |\n|-|-|-|-|-|-|\n| Print | main | 1 | 0.4×0.5×0.03 | #222222 | @frame |\n| Lamp | main | 1 | | | |');
  const placed=applyPlacements(inv,JSON.stringify({placements:[{asset:'Print',room:'main',at:[0,0],y:1.5}]}));
  assert.deepEqual(placed.placements[0],{model:'@frame',room:'main',at:[0,0],rotation:0,y:1.5,asset:'Print',dims:[.4,.5,.03],colour:'#222222'});
  const twice={placements:[{asset:'Print',room:'main',at:[0,0]},{asset:'Print',room:'main',at:[1,0]},{asset:'Lamp',room:'main',at:[0,0]}]};
  assert.throws(()=>applyPlacements(inv,JSON.stringify(twice)),e=>/placed 2 times but its Qty is 1/.test(e.message)&&/has no Model/.test(e.message));
});
