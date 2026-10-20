import test from 'node:test';
import assert from 'node:assert/strict';
import starter from '../template/home.js';
import {applyResources} from '../resources.js';
import {validateHome} from '../validate.js';

test('resources.md fills the floor plan, rooms by name or id, and extra groups',()=>{
  const md=`# Resources\nProvenance prose is ignored.\n\n## Floor plan\n![Plan](assets/plan.jpg)\nTraced at 100 px/m.\n\n## main room\n![](assets/a.jpg)\n![](assets/b.jpg)\n\n## Exterior\n![](assets/c.jpg)`;
  const home=applyResources(starter,md);
  assert.deepEqual(home.floorPlan,{image:'assets/plan.jpg',alt:'Plan',note:'Traced at 100 px/m.'});
  assert.deepEqual(home.model.rooms[0].photos,['assets/a.jpg','assets/b.jpg']);
  assert.deepEqual(home.resources,[{name:'Exterior',photos:['assets/c.jpg']}]);
  assert.deepEqual(validateHome(home),[]);
  assert.deepEqual(starter.model.rooms[0].photos,[],'the source home is not mutated');
  assert.deepEqual(applyResources(starter,'## Kitchen {#main}\n![](assets/k.jpg)').model.rooms[0].photos,['assets/k.jpg']);
});
test('resources.md rejects unknown room ids and duplicate sections',()=>{
  assert.throws(()=>applyResources(starter,'## Den {#den}\n![](assets/d.jpg)'),/no room with id "den"/);
  assert.throws(()=>applyResources(starter,'## A\n## a'),/duplicate section/);
  assert.equal(applyResources(starter,'## Floor plan\n<!-- ![x](assets/x.jpg) -->').floorPlan,undefined);
});
