import test from 'node:test';
import assert from 'node:assert/strict';
import {bakeAssets} from '../bake-format.js';

test('day and night resolve to distinct assets and independent exposure scales',()=>{
  const baked=bakeAssets({version:2,modes:{day:{file:'lightmap-day.png',scale:4,exposure:.8},night:{file:'lightmap-night.png',scale:2,exposure:1.1}}});
  assert.equal(baked.modes.day.scale,3.2);
  assert.equal(baked.modes.night.scale,2.2);
  assert.notEqual(baked.modes.day.lightmap,baked.modes.night.lightmap);
  assert.equal(baked.scene,'../assets/baked/scene.glb');
});
test('old bakes remain usable without inventing a night lightmap',()=>{
  const baked=bakeAssets({scale:3,exposure:.65});
  assert.equal(baked.modes.day.lightmap,'../assets/baked/lightmap.jpg');
  assert.equal(baked.modes.night,undefined);
});
test('HDR lightmaps retain their linear exposure and resolve as assets',()=>{
  const baked=bakeAssets({version:2,modes:{day:{file:'lightmap-day.exr',scale:1,exposure:6}}});
  assert.equal(baked.modes.day.lightmap,'../assets/baked/lightmap-day.exr');
  assert.equal(baked.modes.day.scale,6);
});
test('invalid manifests cannot load paths outside the bake or nonfinite radiance',()=>{
  for(const day of [{file:'../../lightmap-day.png',scale:1},{file:'lightmap-day.png',scale:NaN},{file:'lightmap-day.png',scale:1,exposure:-1}])
    assert.throws(()=>bakeAssets({version:2,modes:{day}}),/invalid/);
  assert.throws(()=>bakeAssets({version:2,modes:{}}),/day lightmap/);
});
