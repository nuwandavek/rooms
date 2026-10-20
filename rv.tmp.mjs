import {chromium} from 'playwright';
import {serveProject} from './kit/server.mjs';
const [out,viewsJson]=process.argv.slice(2);const views=JSON.parse(viewsJson);
const server=await serveProject('kalpataru-radiance',0);
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await page.goto(`http://127.0.0.1:${server.address().port}/?tab=realistic`);
  await page.waitForFunction(()=>document.body.dataset.modelReady==='true');
  await page.evaluate(()=>window.home3d.furnitureReady);await page.evaluate(()=>window.home3d.loadPhotoFurniture());
  await page.waitForTimeout(1500);
  await page.locator('canvas').first().screenshot({path:`${out}-iso.png`,timeout:180000});
  await page.evaluate(()=>window.home3d.setMode('walk'));if(process.env.NIGHT)await page.evaluate(()=>window.home3d.setLighting('night'));await page.waitForTimeout(3000);
  for(const [i,[f,t]] of views.entries()){
    await page.evaluate(([f,t])=>{const c=window.home3d.camera;c.position.set(...f);c.lookAt(...t);},[f,t]);
    await page.waitForTimeout(1200);
    await page.locator('canvas').first().screenshot({path:`${out}-${i+1}.png`,timeout:180000});
  }
  console.log('errors',errs.slice(0,5));
}finally{await browser.close();server.close();}
