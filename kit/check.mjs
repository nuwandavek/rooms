import assert from 'node:assert/strict';
import {access,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {chromium} from 'playwright';
import {buildProject,loadProject} from './project.mjs';
import {roomPhotos} from './ui.js';

export async function checkProject(name) {
  const file=await buildProject(name),out=dirname(file);
  const {home}=await loadProject(name);
  let options={headless:true};
  if(process.env.HOME3D_BROWSER)options.executablePath=process.env.HOME3D_BROWSER;
  else if(process.platform==='darwin') {
    const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    try{await access(chrome);options.executablePath=chrome;}catch{}
  }
  const browser=await chromium.launch(options);
  // Serve the project: library models load with fetch, which file:// pages cannot use.
  const {serveProject}=await import('./server.mjs');
  const server=await serveProject(name,0),local=`http://127.0.0.1:${server.address().port}/`;
  const errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    // Only the theme fonts may load remotely; everything else comes from the local server.
    await page.route(/^https?:/,route=>{
      const request=route.request();
      const host=new URL(request.url()).hostname;
      if(host==='127.0.0.1' || (host==='fonts.gstatic.com' && request.resourceType()==='font'))return route.continue();
      errors.push(`Unexpected network request: ${request.url()}`);return route.abort();
    });
    await page.goto(local);
    await page.waitForFunction(()=>document.body.dataset.modelReady==='true',{},{timeout:20000});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>window.home3d.furnitureReady);
    assert.equal(await page.evaluate(()=>window.home3d.furniture.children.length),(home.placements || []).length,'Every placement loads its model');
    assert.equal(await page.title(),home.title);
    assert.equal(await page.locator('#room-list button').count(),home.model.rooms.filter(r=>r.featured).length);
    assert.equal(await page.locator('#panel-resources').isVisible(),true);
    // Decode even off-screen gallery images to check the full local asset set.
    await page.locator('img[src]').evaluateAll(imgs=>Promise.all(imgs.map(img=>{img.loading='eager';return img.decode();})));
    await page.screenshot({path:resolve(out,'check-resources.png')});
    if(home.floorPlan) {
      await page.locator('#reference-button').click();
      assert.equal(await page.locator('#plan-dialog').evaluate(d=>d.open),true);
      await page.locator('#close-plan').click();
    } else assert.equal(await page.locator('#reference-button').isVisible(),false);
    const firstPhoto=page.locator('.resource-photo').first();
    if(await firstPhoto.count()) {
      await firstPhoto.click();assert.equal(await page.locator('#photo-dialog').evaluate(d=>d.open),true);
      await page.keyboard.press('Escape');
    }
    await page.locator('#tab-home3d').click();
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.screenshot({path:resolve(out,'check-3d.png')});
    const initialZoom=await page.evaluate(()=>window.home3d.camera.zoom);
    await page.locator('#zoom-in').click();
    assert.ok(await page.evaluate(()=>window.home3d.camera.zoom)>initialZoom);
    await page.locator('#zoom-out').click();
    assert.ok(Math.abs(await page.evaluate(()=>window.home3d.camera.zoom)-initialZoom)<.001);
    for(const room of home.model.rooms.filter(r=>r.featured)) {
      await page.locator(`[data-room="${room.id}"]`).click();
      assert.equal(await page.locator('#selection-info strong').textContent(),room.name);
      assert.equal(await page.locator('#room-photo').isVisible(),roomPhotos(room).length>0);
      if(roomPhotos(room).length>1) {
        await page.locator('#room-thumbnails button').nth(1).click();
        assert.equal(await page.locator('#photo-position').textContent(),`2 / ${roomPhotos(room).length}`);
        await page.locator('#enlarge-room-photo').click();
        assert.equal(await page.locator('#photo-dialog').evaluate(d=>d.open),true);
        await page.locator('#close-photo').click();
      }
    }
    const noPhoto=home.model.rooms.find(r=>!roomPhotos(r).length);
    if(noPhoto) {
      await page.evaluate(id=>window.home3d.select(id),noPhoto.id);
      assert.equal(await page.locator('#room-photo').isVisible(),false);
    }
    await page.locator('#reset-room').click();
    await page.locator('#top-view').click();
    await page.waitForTimeout(1200);
    await page.screenshot({path:resolve(out,'check-top-down.png')});
    await page.locator('#reset-camera').click();
    await page.locator('#labels-toggle').uncheck();
    assert.equal(await page.locator('#labels').isVisible(),false);
    await page.locator('#labels-toggle').check();
    await page.locator('#openings-toggle').uncheck();
    await page.locator('#openings-toggle').check();
    await page.locator('#full-height').click();
    assert.equal(await page.locator('#wall-height').inputValue(),String(home.model.wallHeight));
    await page.locator('#wall-height').evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},String(home.model.cutaway));
    await page.locator('#lighting').selectOption('afternoon');
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.screenshot({path:resolve(out,'check-light.png')});
    await page.locator('#walk-button').click();
    assert.equal(await page.evaluate(()=>window.home3d.camera.isPerspectiveCamera),true);
    assert.ok(Math.abs(await page.evaluate(()=>window.home3d.camera.position.y)-1.665)<.001);
    const beforeWalk=await page.evaluate(()=>window.home3d.camera.position.toArray());
    await page.locator('#scene canvas').focus();
    await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');
    const afterWalk=await page.evaluate(()=>window.home3d.camera.position.toArray());
    assert.ok(Math.hypot(afterWalk[0]-beforeWalk[0],afterWalk[2]-beforeWalk[2])>.05,'WASD moves the camera');
    await page.screenshot({path:resolve(out,'check-walk.png')});
    await page.locator('#orbit-button').click();
    assert.equal(await page.evaluate(()=>window.home3d.camera.isOrthographicCamera),true);
    await page.locator('#tab-resources').click();
    const focus=page.locator('[data-focus-room]').first();
    await focus.click();
    assert.equal(await page.locator('#panel-home3d').isVisible(),true);
    assert.equal(await page.locator('#selection-info strong').textContent(),home.model.rooms[0].name);
    await page.locator('#tab-home3d').focus();await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#panel-resources').isVisible(),true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#panel-home3d').isVisible(),true);
    await page.locator('#tab-assets').click();
    assert.equal(await page.locator('#panel-assets').isVisible(),true);
    assert.equal(await page.locator('.asset-table tbody tr').count(),(home.inventory || []).length);
    await page.waitForFunction(()=>!document.querySelector('[data-model] span'),{},{timeout:15000});
    assert.equal(await page.locator('[data-model] img').count(),(home.inventory || []).filter(a=>a.model).length,'Every library model renders a preview');
    await page.screenshot({path:resolve(out,'check-assets.png')});
    await page.locator('#tab-home3d').click();
    await page.setViewportSize({width:390,height:844});
    await page.reload();
    await page.waitForFunction(()=>document.body.dataset.modelReady==='true');
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile page must not overflow horizontally');
    await page.screenshot({path:resolve(out,'check-mobile.png'),fullPage:true});
    await page.locator('.settings summary').click();
    await page.locator('#lighting').selectOption('afternoon');
    await page.locator('#tab-resources').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile resource gallery must not overflow');
    await page.screenshot({path:resolve(out,'check-resources-mobile.png'),fullPage:false});
    assert.deepEqual(errors,[],'No browser errors or external requests');
    await writeFile(resolve(out,'check.json'),JSON.stringify({project:name,checkedAt:new Date().toISOString(),rooms:home.model.rooms.length,theme:home.theme || 'riso',errors,screenshots:['check-resources.png','check-3d.png','check-top-down.png','check-light.png','check-walk.png','check-assets.png','check-mobile.png','check-resources-mobile.png']},null,2)+'\n');
    console.log(`Checked ${name}: tabs, galleries, zoom, room selection, references, top-down, cutaway, layers, lighting, furniture, assets, mobile, and local image assets.\nScreenshots: ${out}/check-*.png`);
  } finally {await browser.close();server.close();}
}
