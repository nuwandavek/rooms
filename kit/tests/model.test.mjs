import test from 'node:test';
import assert from 'node:assert/strict';
import starter from '../template/home.js';
import {validateHome} from '../validate.js';
import {projectPath} from '../project.mjs';
import {createShell} from '../geometry.js';
import {themes} from '../themes.js';

test('starter is valid; project names cannot escape projects/',()=>{
  assert.deepEqual(validateHome(starter),[]);
  for(const name of ['../archive','/tmp/example','','two words','a/../../b'])assert.throws(()=>projectPath(name));
});
test('invalid opening offsets and duplicate room ids are rejected',()=>{
  const home=structuredClone(starter);
  home.model.walls[0].openings[0].end=12;
  home.model.rooms.push(structuredClone(home.model.rooms[0]));
  const errors=validateHome(home);
  assert.ok(errors.some(e=>e.includes('within the wall')));
  assert.ok(errors.some(e=>e.includes('unique kebab-case')));
});
test('openings must be sorted and cannot overlap',()=>{
  const home=structuredClone(starter);
  home.model.walls[0].openings.push({start:3,end:5,type:'window',bottom:.85,top:2.45});
  assert.ok(validateHome(home).some(e=>e.includes('non-overlapping')));
});
test('wall cutaways rebuild without accumulating geometry; room selection resets',()=>{
  const shell=createShell(starter.model,themes.almanac.materials);
  const count=()=>{let n=0;shell.root.traverse(o=>{if(o.isMesh)n++;});return n;};
  const before=count();
  shell.setWallHeight(.15);shell.setWallHeight(starter.model.wallHeight);shell.setWallHeight(starter.model.cutaway);
  assert.equal(count(),before);
  const material=shell.floors[0].material;
  shell.select('main');assert.notEqual(shell.floors[0].material,material);
  shell.select(null);assert.equal(shell.floors[0].material,material);
  shell.root.traverse(o=>{if(o.geometry?.parameters?.height)assert.ok(o.geometry.parameters.height>0);});
  shell.dispose();
});
