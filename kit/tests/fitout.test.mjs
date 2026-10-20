import test from 'node:test';
import assert from 'node:assert/strict';
import starter from '../template/home.js';
import {parseMaterials,applyFitout,wallFinish,wallBands,floorFinish} from '../fitout.js';

const materials=parseMaterials(JSON.stringify({materials:{
  paint:{kind:'paint',colour:'#ffffff'},tile:{kind:'tiles',size:[.3,.6],colour:'#cccccc'},oak:{kind:'wood',colour:'#b08a62',grain:'#8f6d4a'}}}));
const finishes=JSON.stringify({floors:{'*':'tile'},walls:[{room:'*',material:'paint'},{room:'main',to:1.2,material:'tile'}],doors:'oak'});

test('fitout.json resolves floors, wall bands and doors, keeping only used materials',()=>{
  const home=applyFitout(starter,finishes,materials);
  assert.deepEqual(Object.keys(home.fitout.materials).sort(),['oak','paint','tile']);
  assert.equal(floorFinish(home.fitout,'main'),'tile');
  assert.equal(wallFinish(home.fitout,'main',.5),'tile');
  assert.equal(wallFinish(home.fitout,'main',2),'paint');
  assert.equal(wallFinish(home.fitout,null,.5),null,'Faces looking outside stay plain');
  assert.deepEqual(wallBands(home.fitout,'main'),[1.2]);
  assert.equal(home.fitout.doors,'oak');
});
test('fitout.json rejects unknown rooms, materials and bad bands',()=>{
  const bad=JSON.stringify({floors:{den:'tile'},walls:[{room:'main',material:'gold'},{room:'main',from:2,to:1,material:'paint'}]});
  assert.throws(()=>applyFitout(starter,bad,materials),e=>/no room "den"/.test(e.message)&&/no material "gold"/.test(e.message)&&/from < to/.test(e.message));
});
test('materials.json checks kinds and required fields',()=>{
  assert.throws(()=>parseMaterials(JSON.stringify({materials:{a:{kind:'velvet'},b:{kind:'tiles',colour:'#fff'}}})),e=>/unknown kind "velvet"/.test(e.message)&&/tiles needs size/.test(e.message));
});
