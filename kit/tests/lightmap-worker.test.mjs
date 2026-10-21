import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {build} from 'esbuild';
import {DataTexture,FloatType,RGBAFormat} from 'three';
import {EXRExporter} from 'three/addons/exporters/EXRExporter.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';

const bundle=await build({entryPoints:[new URL('../exr-worker.js',import.meta.url).pathname],bundle:true,format:'iife',write:false});
function decoder() {
  return new Worker(`const {parentPort}=require('node:worker_threads');
    globalThis.self={postMessage:(...args)=>parentPort.postMessage(...args)};
    parentPort.on('message',data=>self.onmessage({data}));
    ${bundle.outputFiles[0].text}`,{eval:true});
}
async function fixture() {
  const pixels=Float32Array.from({length:32*16*4},(_,i)=>i%4===3?1:[0,.0002,.17,3,100][i%5]);
  const texture=new DataTexture(pixels,32,16,RGBAFormat,FloatType);
  const bytes=await new EXRExporter().parse(texture);texture.dispose();
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}
test('worker preserves exact HDR pixels, dimensions and row order without copying input',async()=>{
  const worker=decoder();
  try {
    const buffer=await fixture(),expected=new EXRLoader().parse(buffer);
    const received=once(worker,'message');worker.postMessage({id:7,buffer},[buffer]);
    assert.equal(buffer.byteLength,0);
    const [actual]=await received;
    assert.equal(actual.id,7);assert.equal(actual.width,32);assert.equal(actual.height,16);
    assert.equal(actual.type,expected.type);assert.equal(actual.format,expected.format);
    assert.deepEqual(actual.data,expected.data);
  } finally {await worker.terminate();}
});
test('invalid lightmap reports an error and leaves the worker usable',async()=>{
  const worker=decoder();
  try {
    let received=once(worker,'message');worker.postMessage({id:1,buffer:new ArrayBuffer(12)});
    const [failed]=await received;assert.equal(failed.id,1);assert.ok(failed.error);
    const buffer=await fixture();received=once(worker,'message');worker.postMessage({id:2,buffer},[buffer]);
    const [valid]=await received;assert.equal(valid.id,2);assert.equal(valid.error,undefined);assert.equal(valid.data.length,32*16*4);
  } finally {await worker.terminate();}
});
