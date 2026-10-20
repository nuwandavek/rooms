import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// One small offscreen renderer turns each library model into a still thumbnail,
// so a long inventory never holds more than one extra WebGL context.
let renderer, scene, camera, loader;
const cache = new Map();

function setup() {
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(1); renderer.setSize(360, 270, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0x8a8070, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, 4/3, .01, 100);
  loader = new GLTFLoader();
}

// Resolves to {src, size:[w,h,d]} in metres, measured from the model's bounds.
export const previewModel = url => previewObject(url, async () => (await loader.loadAsync(url)).scene);

// The same for any object, e.g. a primitive; `key` caches the result.
export function previewObject(key, make) {
  if (!cache.has(key)) cache.set(key, (async () => {
    if (!renderer) setup();
    const object = await make();
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const distance = size.length() / 2 / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02;
    camera.position.copy(center).add(new THREE.Vector3(1, .75, 1.35).normalize().multiplyScalar(distance));
    camera.near = distance / 100; camera.far = distance * 10;
    camera.lookAt(center); camera.updateProjectionMatrix();
    // Load is async; add, render and remove happen in one synchronous step.
    scene.add(object); renderer.render(scene, camera); scene.remove(object);
    object.traverse(o => { o.geometry?.dispose(); [o.material].flat().forEach(m => m?.dispose()); });
    return {src: renderer.domElement.toDataURL('image/png'), size: [size.x, size.y, size.z]};
  })());
  return cache.get(key);
}
