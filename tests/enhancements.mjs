import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {decode} from '../src/storage.js';
const base=process.env.CITY_URL||'http://127.0.0.1:5180';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
fs.mkdirSync('artifacts',{recursive:true});
const report={checks:[],errors:[],externalRequests:[],screenshots:[],devices:'Chrome emulation with touch; physical devices not tested'};
const watch=page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))report.externalRequests.push(r.url());});};
const inspect=page=>page.evaluate(()=>window.__CITY__.inspect());
const ready=page=>page.waitForFunction(()=>window.__CITY__);
const safe=page=>page.waitForFunction(()=>window.__CITY__&&!window.__CITY__.inspect().busy);
const shot=async(page,name)=>{await page.screenshot({path:`artifacts/${name}.png`});report.screenshots.push(name);};
const tab=(page,name)=>page.locator(`[data-settings-tab="${name}"]`).click();
const setRange=(page,key,value)=>page.locator(`[data-setting="${key}"]`).evaluate((input,v)=>{input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));},String(value));
try {
  const desktop=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true}),page=await desktop.newPage();watch(page);
  await page.goto(base);await ready(page);await page.locator('[data-action="new"]').click();await page.locator('[data-action="begin"]').click();
  const initial=(await inspect(page)).animation;
  await page.keyboard.press('ArrowUp');await page.waitForTimeout(120);await page.keyboard.press('ArrowDown');const retargeted=await inspect(page);
  assert.equal(retargeted.stats.moves,2);assert.equal(retargeted.busy,true);
  await page.waitForTimeout(190);const mid=await inspect(page);
  assert.equal(mid.busy,true);assert.notDeepEqual(mid.animation.position,initial.position);
  assert.notDeepEqual(mid.animation.knees,initial.knees);await shot(page,'walking-mid-step');
  await page.keyboard.press('Escape');const frozen=(await inspect(page)).animation;await page.waitForTimeout(250);
  assert.deepEqual((await inspect(page)).animation,frozen);await page.locator('[data-action="resume"]').click();await safe(page);
  assert.deepEqual((await inspect(page)).animation.position,initial.position);assert.equal((await inspect(page)).history,2);report.checks.push('Continuous movement, articulated knees, immediate retargeting, pause freezes pose, resume reaches exact target');
  await page.keyboard.press('Escape');await page.locator('[data-action="settings"]').click();await shot(page,'settings-audio-desktop');
  await setRange(page,'music',.2);await setRange(page,'sfx',.8);await page.locator('[data-action="preview-music"]').click();
  await page.locator('[data-setting="muted"]').check();assert.equal(await page.locator('[data-action="preview-music"]').isDisabled(),true);await page.locator('[data-setting="muted"]').uncheck();
  await tab(page,'display');await page.locator('[data-setting="quality"]').selectOption('low');await setRange(page,'brightness',1.2);await page.locator('[data-setting="motion"]').check();
  assert.equal((await inspect(page)).settings.motion,false);assert.equal((await inspect(page)).render.exposure,1.5);await shot(page,'settings-display-desktop');
  await tab(page,'controls');await page.locator('[data-setting="controlSize"]').selectOption('large');await page.locator('[data-setting="controlSide"]').selectOption('right');
  await setRange(page,'cameraSensitivity',1.5);await page.locator('[data-setting="showTouchControls"]').check();await page.locator('[data-setting="tapToMove"]').uncheck();await shot(page,'settings-controls-desktop');
  await page.waitForTimeout(250);const settings=(await inspect(page)).settings;
  await tab(page,'save');await shot(page,'settings-save-desktop');
  const downloaded=page.waitForEvent('download');await page.locator('[data-action="export-save"]').click();const file=await downloaded;await file.saveAs('artifacts/exported-save.json');
  const exported=decode(fs.readFileSync('artifacts/exported-save.json','utf8'));assert.deepEqual(exported.settings,settings);assert.ok(exported.current.history.length);
  await page.locator('#import-save-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"bad":true}')});await page.waitForFunction(()=>document.querySelector('#settings-status')?.textContent.includes('无法导入'));
  assert.deepEqual((await inspect(page)).settings,settings);assert.equal((await inspect(page)).modal,'settings');
  await page.locator('[data-action="reset-settings"]').click();await page.locator('[data-action="confirm-reset-settings"]').click();assert.equal((await inspect(page)).settings.quality,'high');assert.equal((await inspect(page)).history,2);
  await page.locator('#import-save-file').setInputFiles('artifacts/exported-save.json');await page.waitForFunction(()=>window.__CITY__.inspect().modal==='import-save');
  await page.locator('[data-action="close"]').first().click();assert.equal((await inspect(page)).settings.quality,'high');
  await page.locator('#import-save-file').setInputFiles('artifacts/exported-save.json');await page.waitForFunction(()=>window.__CITY__.inspect().modal==='import-save');await page.locator('[data-action="confirm-import"]').click();
  assert.equal((await inspect(page)).screen,'menu');assert.deepEqual((await inspect(page)).settings,settings);
  await page.reload();await ready(page);assert.deepEqual((await inspect(page)).settings,settings);await page.locator('[data-action="continue"]').click();assert.equal((await inspect(page)).history,2);
  const dpad=await page.locator('.dpad').boundingBox();assert.ok(dpad.x>720);assert.equal(Math.round((await page.locator('[data-dir="up"]').boundingBox()).width),60);
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(280);assert.equal((await inspect(page)).busy,true);await safe(page);
  report.checks.push('All four settings groups, live values, previews/mute, persistent preferences, large right-side controls, reduced motion keeps walking');
  report.checks.push('Download validates checksum, malformed import is rejected, reset preserves progress, cancel import preserves data, confirmed import restores history/settings');
  await desktop.close();

  for(const [name,portrait,landscape] of [['phone',{width:390,height:844},{width:844,height:390}],['tablet',{width:820,height:1180},{width:1180,height:820}]]) {
    const context=await browser.newContext({viewport:portrait,hasTouch:true,isMobile:true,deviceScaleFactor:1});
    const p=await context.newPage();watch(p);await p.goto(base);await ready(p);assert.equal((await inspect(p)).landscapeBlocked,true);await shot(p,`${name}-portrait-gate`);
    assert.equal(await p.locator('#app').evaluate(n=>n.inert),true);await p.locator('[data-landscape-start]').click();await p.waitForFunction(()=>document.querySelector('.landscape-status')?.textContent.includes('请手动'));
    assert.equal((await inspect(p)).landscapeBlocked,true);await p.setViewportSize(landscape);await p.waitForFunction(()=>!window.__CITY__.inspect().landscapeBlocked);
    await p.locator('[data-action="new"]').click();await p.locator('[data-action="begin"]').click();await shot(p,`${name}-landscape-play`);
    assert.equal(await p.locator('.dpad').isVisible(),true);
    await p.locator('[data-dir="up"]').click();await p.waitForTimeout(220);await p.setViewportSize(portrait);await p.waitForFunction(()=>window.__CITY__.inspect().landscapeBlocked);
    const before=(await inspect(p));await p.waitForTimeout(300);const after=await inspect(p);assert.deepEqual(after.animation,before.animation);assert.deepEqual(after.state,before.state);
    await p.setViewportSize(landscape);await p.waitForFunction(()=>!window.__CITY__.inspect().landscapeBlocked);await safe(p);assert.equal((await inspect(p)).history,1);
    await p.locator('[data-action="pause"]').click();await p.locator('[data-action="settings"]').click();await tab(p,'controls');await shot(p,`${name}-landscape-settings`);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const boxes=await p.locator('.settings-heading,.settings-tabs,.settings-footer').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
    assert.ok(boxes.every(b=>b.top>=0&&b.bottom<=landscape.height+1));
    await p.setViewportSize(portrait);await p.setViewportSize(landscape);assert.equal((await inspect(p)).modal,'settings');
    report.checks.push(`${name}: portrait gate/inert, unsupported API fallback, landscape unblocks, mid-step freeze/resume, modal survives rotation and settings fit`);await context.close();
  }
  const desktopPortrait=await browser.newContext({viewport:{width:700,height:1000}}),dp=await desktopPortrait.newPage();watch(dp);await dp.goto(base);await ready(dp);assert.equal((await inspect(dp)).landscapeBlocked,false);await desktopPortrait.close();
  report.checks.push('Desktop portrait window remains usable; all resources stay local');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{fs.writeFileSync('artifacts/enhancements-report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}

