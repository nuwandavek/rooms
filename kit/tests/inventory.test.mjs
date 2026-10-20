import test from 'node:test';
import assert from 'node:assert/strict';
import starter from '../template/home.js';
import {applyInventory} from '../inventory.js';
import {validateHome,imagePaths} from '../validate.js';

const md=`# Inventory\n\n| Asset | Room | Kind | Qty | Model | Photos | Notes |\n| --- | --- | --- | --- | --- | --- | --- |\n| Sofa | main | furniture | 1 | sofa-3seat | living-01, extra/b.png | West wall |\n| Lamp | Main room | lighting | | | | |\n\n| Other | Table |\n| --- | --- |\n| ignored | row |`;

test('inventory.md tables become assets with resolved rooms and photo paths',()=>{
  const home=applyInventory(starter,md);
  assert.deepEqual(home.inventory,[
    {name:'Sofa',room:'main',kind:'furniture',qty:1,model:'sofa-3seat',photos:['assets/living-01.jpg','extra/b.png'],notes:'West wall'},
    {name:'Lamp',room:'main',kind:'lighting',qty:1,model:null,photos:[],notes:''},
  ]);
  assert.deepEqual(validateHome(home),[]);
  assert.ok(imagePaths(home).includes('assets/living-01.jpg'));
});
test('inventory.md rejects unknown rooms, bad quantities and model ids',()=>{
  const bad='| Asset | Room | Qty | Model |\n|-|-|-|-|\n| Desk | den | 1 | |\n| Bed | main | two | |\n| Rug | main | 1 | My Rug |';
  assert.throws(()=>applyInventory(starter,bad),e=>/no room "den"/.test(e.message)&&/whole number/.test(e.message)&&/kebab-case library id/.test(e.message));
});
