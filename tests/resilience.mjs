import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const base=process.env.CITY_URL||'http://127.0.0.1:5180';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
const report={checks:[],errors:[],started:new Date().toISOString()};
page.on('pageerror',e=>report.errors.push(e.message));
const inspect=()=>page.evaluate(()=>window.__CITY__.inspect());
const safe=()=>page.waitForFunction(()=>window.__CITY__&&!window.__CITY__.inspect().busy);
const start=async()=>{await page.goto(base);await page.waitForFunction(()=>window.__CITY__);await page.locator('[data-action="new"]').click();await page.locator('[data-action="begin"]').click();};
try {
  await start();
  await page.keyboard.press('ArrowUp');await safe();
  let current=await inspect();assert.equal(current.history,1);
  // Undo while a visual transition is running must atomically restore the previous whole state.
  await page.keyboard.press('ArrowRight');await page.keyboard.press('z');await safe();
  current=await inspect();assert.equal(current.state.player.x,2);assert.equal(current.state.player.z,1);
  report.checks.push('Undo during animation atomically cancels movement');
  // Repeated directional input can retarget the current animation, one logical step per key.
  const before=await inspect();
  await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');await page.keyboard.up('ArrowRight');await safe();
  assert.ok((await inspect()).stats.moves>=before.stats.moves+1);assert.ok((await inspect()).stats.moves<=before.stats.moves+3);report.checks.push('Rapid repeated keys retarget movement without skipping logical boundaries');
  await page.keyboard.press('ArrowDown');await page.locator('[data-action="reset"]').click();await page.locator('[data-action="confirm-reset"]').click();
  current=await inspect();assert.deepEqual(current.state.player,{x:2,z:2,dir:'down'});assert.equal(current.history,0);assert.equal(current.busy,false);
  report.checks.push('Reset during animation restores all objects and cancels pending motion');
  // A separate real tab backgrounds the game; no queued movement or elapsed time is replayed on return.
  await page.keyboard.press('ArrowUp');const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
  const hiddenState=await inspect();await page.waitForTimeout(350);assert.deepEqual((await inspect()).state,hiddenState.state);
  await page.bringToFront();await safe();await other.close();report.checks.push('Background and return preserve a consistent logical state');
  await page.keyboard.press('Escape');await page.locator('[data-action="save"]').click();
  // Corrupt only the save envelope, never gameplay state: this explicitly tests the recovery route.
  await page.addInitScript(()=>{
    if(!sessionStorage.getItem('city-resilience-corrupt-once')) {
      sessionStorage.setItem('city-resilience-corrupt-once','yes');
      localStorage.setItem('lost-clockwork-city:save:v1','{"version":99,"payload":"broken"}');
    }
  });
  await page.reload();await page.waitForFunction(()=>window.__CITY__?.inspect().modal==='corrupt');
  assert.equal(await page.locator('[data-action="restore"]').count(),1);
  await page.locator('[data-action="restore"]').click();await page.locator('[data-action="continue"]').click();
  assert.equal((await inspect()).level,0);report.checks.push('Invalid version/checksum opens recovery; valid backup restores the game');
  await page.keyboard.press('Escape');await page.locator('[data-action="menu"]').click();
  await page.locator('[data-action="new"]').click();assert.equal((await inspect()).modal,'new');
  await page.getByRole('button',{name:'保留旅程'}).click();assert.ok((await inspect()).completed);report.checks.push('New-game confirmation can be canceled without deleting progress');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-action="continue"]').click();
  const controls=await page.locator('button:visible').evaluateAll(nodes=>nodes.map(n=>({label:n.getAttribute('aria-label')||n.textContent.trim(),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})).filter(n=>n.width<43.5||n.height<43.5));
  assert.deepEqual(controls,[]);report.checks.push('All visible mobile game buttons have at least 44 CSS pixel touch targets');
  const touch=await context.newCDPSession(page);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const gestureStart=await inspect();
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:420,id:1},{x:240,y:420,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:110,y:420,id:1},{x:270,y:420,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.deepEqual((await inspect()).state,gestureStart.state);report.checks.push('Simulated two-finger zoom changes no mechanism or player state');
  await page.setViewportSize({width:844,height:390});assert.deepEqual((await inspect()).state,gestureStart.state);report.checks.push('Orientation changes preserve the complete level and undo state');
  await page.screenshot({path:'artifacts/resilience-mobile.png'});assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;console.error(e);process.exitCode=1;await page.screenshot({path:'artifacts/resilience-failure.png'});}
finally{report.finished=new Date().toISOString();fs.writeFileSync('artifacts/resilience-report.json',JSON.stringify(report,null,2));await browser.close();}
