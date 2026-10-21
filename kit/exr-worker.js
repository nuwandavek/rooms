import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';

// Keep decompression and pixel conversion off the UI thread. Transfer the
// buffers rather than copying a 128 MB atlas between threads.
self.onmessage=({data:{id,buffer}})=>{
  try {
    const {data,width,height,type,format}=new EXRLoader().parse(buffer);
    self.postMessage({id,data,width,height,type,format},[data.buffer]);
  } catch(error) {self.postMessage({id,error:error.message});}
};
