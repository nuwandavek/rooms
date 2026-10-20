import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalog,upsertCatalog,guessCategory} from '../catalog.js';

test('upsert sorts by id and writes one model per line', () => {
  const json=upsertCatalog('',[{id:'b-chair',path:'models/b-chair.glb',size:[.4,.9,.4],origin:'sourced'},
    {id:'a-bed',path:'models/a-bed.glb',size:[1.6,.5,2],origin:'generated'}]);
  assert.deepEqual(parseCatalog(json).map(m=>[m.id,m.path]),[['a-bed','models/a-bed.glb'],['b-chair','models/b-chair.glb']]);
  assert.equal(json.split('\n').filter(l=>l.startsWith('{"id"')).length,2);
});
test('re-import refreshes measurements but keeps hand-edited category and notes', () => {
  let json=upsertCatalog('',[{id:'x',path:'models/x.glb',size:[1,1,1]}]);
  json=json.replace('"category":"other"','"category":"sofa"').replace('"notes":""','"notes":"Pink velvet"');
  json=upsertCatalog(json,[{id:'x',path:'models/x.glb',size:[2,1,1],notes:'auto'}]);
  const [m]=parseCatalog(json);
  assert.deepEqual(m.size,[2,1,1]);assert.equal(m.category,'sofa');assert.equal(m.notes,'Pink velvet');
});
test('category guesses from names', () => {
  assert.equal(guessCategory('kenney-lounge-sofa'),'sofa');
  assert.equal(guessCategory('quaternius19-night-stand'),'storage');
  assert.equal(guessCategory('kenney-bed-double'),'bed');
});
test('rejects a catalog without a models list', () => {
  assert.throws(()=>parseCatalog('{"items":[]}'),/expected/);
});
