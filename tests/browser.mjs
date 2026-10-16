import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {levels} from '../src/levels.js';

const base=process.env.CITY_URL||'http://127.0.0.1:5180';
const executablePath=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({executablePath,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960}});
const page=await context.newPage();
const errors=[],requests=[],report={started:new Date().toISOString(),levels:[],checks:[],screenshots:[],browser:'Installed Chrome / Playwright headless',devices:'Desktop, mobile and tablet simulated viewports; no physical device'};
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith(base)&&!request.url().startsWith('data:'))requests.push(request.url());});
fs.mkdirSync('artifacts',{recursive:true});
const inspect=()=>page.evaluate(()=>window.__CITY__.inspect());
const safe=()=>page.waitForFunction(()=>window.__CITY__&&!window.__CITY__.inspect().busy,null,{timeout:10000});
const shot=async name=>{await page.screenshot({path:`artifacts/${name}.png`});report.screenshots.push(`${name}.png`);};
const press=async dir=>{await safe();await page.keyboard.press({up:'ArrowUp',right:'ArrowRight',down:'ArrowDown',left:'ArrowLeft'}[dir]);await safe();};
async function select(id) {
  const point=await page.evaluate(id=>window.__CITY__.projectObject(id),id);
  assert.ok(point,`missing object ${id}`);
  await page.mouse.click(point.x,point.y);
  const current=await inspect();assert.equal(current.selected,id,`选中机关 ${id}，实际 ${current.selected}`);
}
async function action(action) {
  await safe();
  const before=await inspect();
  if(action.type==='move')await press(action.dir);
  else {await select(action.id);await page.locator(action.type==='gravity'?`[data-gravity="${action.dir}"]`:'[data-action="interact"]').click();await safe();}
  const after=await inspect();assert.equal(after.stats.moves,before.stats.moves+1,`操作未生效：${JSON.stringify(action)} in level ${before.level+1}`);
}

try {
  await page.goto(base);await page.waitForFunction(()=>window.__CITY__);await shot('01-main-menu');
  await page.locator('[data-action="new"]').click();await page.locator('[data-action="begin"]').click();
  const solutions=JSON.parse(fs.readFileSync('tests/solutions.json','utf8'));
  for(const entry of solutions) {
    let current=await inspect();assert.equal(current.level,entry.level);
    if(current.modal==='story')await page.locator('[data-action="begin"]').click();
    if(entry.level===0) {
      await shot('02-first-level');
      await press('up');const moved=await inspect();await page.keyboard.press('z');
      assert.equal((await inspect()).state.player.z,levels[0].start.z);assert.ok(moved.history>0);
      await press('down');await page.keyboard.press('z');
      report.checks.push('Undo and divergent branch restore logical state');
      await page.keyboard.press('ArrowLeft');await safe();
      await page.keyboard.press('Escape');const paused=await inspect();
      await page.keyboard.press('ArrowDown');assert.deepEqual((await inspect()).state,paused.state);
      await page.locator('[data-action="save"]').click();
      await page.reload();await page.waitForFunction(()=>window.__CITY__);await page.locator('[data-action="continue"]').click();
      assert.deepEqual((await inspect()).state,paused.state);report.checks.push('Pause freezes input; manual save and reload restore state and undo history');
      await page.keyboard.press('z');
    }
    if(entry.level===3) {
      await page.locator('[data-action="hint"]').click();await page.locator('[data-action="next-hint"]').click();await page.locator('[data-action="next-hint"]').click();
      assert.equal((await inspect()).stats.hints,3);await page.locator('[data-action="close-hint"]').click();report.checks.push('Three explicit hint tiers counted once per reveal');
    }
    for(const a of entry.actions)await action(a);
    await page.waitForFunction(()=>window.__CITY__.inspect().modal==='complete');
    current=await inspect();assert.ok(current.state.won);assert.ok(current.completed[entry.level]);
    if(entry.level===5) {
      await page.reload();await page.waitForFunction(()=>window.__CITY__);await page.locator('[data-action="continue"]').click();
      await page.waitForFunction(()=>window.__CITY__.inspect().modal==='complete');
      assert.equal((await inspect()).level,5);report.checks.push('Chapter completion reload restores its result and next chapter transition');
    }
    if([5,11,17].includes(entry.level))await shot(`chapter-${Math.floor(entry.level/6)+1}-complete`);
    report.levels.push({number:entry.level+1,name:entry.name,solutionActions:entry.actions.length,actualMoves:current.stats.moves,won:current.state.won});
    console.log(`浏览器通关 ${entry.level+1}/18 ${entry.name}`);
    await page.locator('[data-action="next"]').click();
    if(entry.level===17)break;
    if([5,11].includes(entry.level)) {await page.locator('[data-action="begin"]').click();await shot(`chapter-${Math.floor(entry.level/6)+2}-scene`);}
  }
  await page.waitForFunction(()=>window.__CITY__.inspect().screen==='ending');await page.waitForTimeout(4200);await shot('ending');
  await page.waitForFunction(()=>window.__CITY__.inspect().modal==='summary');await shot('victory-summary');
  assert.equal((await inspect()).modal,'summary');assert.equal(Object.keys((await inspect()).completed).length,18);report.checks.push('All 18 levels, 3 regions, natural core restart ending and real victory statistics');
  await page.locator('[data-action="levels"]').click();await page.locator('[data-chapter="0"]').click();await page.locator('[data-level="0"]').click();
  const previousRecords=(await inspect()).completed;
  for(const a of solutions[0].actions)await action(a);
  await page.waitForFunction(()=>window.__CITY__.inspect().modal==='complete');assert.equal((await inspect()).unlocked,17);assert.equal(Object.keys((await inspect()).completed).length,18);
  report.checks.push('Replay preserves unlocked regions and completed records');
  await page.locator('[data-action="replay"]').click();
  await page.locator('[data-action="reset"]').click();await page.locator('[data-action="confirm-reset"]').click();assert.equal((await inspect()).stats.retries,1);
  report.checks.push('Reset replaces only current level and increments retry statistics');
  await page.keyboard.press('Escape');await page.locator('[data-action="settings"]').click();
  await page.locator('[data-settings-tab="display"]').click();await page.locator('[data-setting="quality"]').selectOption('low');
  await page.locator('[data-settings-tab="audio"]').click();await page.locator('[data-setting="muted"]').check();await shot('settings');
  await page.locator('[data-action="close"]').first().click();await page.locator('[data-action="resume"]').click();
  await page.setViewportSize({width:390,height:844});await shot('mobile-portrait');
  const steps=(await inspect()).stats.moves;await page.locator('[data-dir="up"]').click();await safe();assert.equal((await inspect()).stats.moves,steps+1);
  await page.setViewportSize({width:844,height:390});assert.equal((await inspect()).level,0);assert.ok((await inspect()).history>0);await shot('mobile-landscape');
  await page.setViewportSize({width:1024,height:1366});await shot('tablet');report.checks.push('Mobile direction buttons, portrait/landscape preservation, tablet viewport and low quality settings');
  await page.keyboard.press('Escape');await page.locator('[data-action="menu"]').click();await page.setViewportSize({width:390,height:844});await shot('mobile-menu');
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(requests.length,0,requests.join('\n'));
  report.checks.push('No uncaught browser exceptions or external runtime resource requests');report.passed=true;
} catch(error) {report.passed=false;report.failure=error.stack;console.error(error);await shot('failure');process.exitCode=1;}
finally {report.errors=errors;report.externalRequests=requests;report.finished=new Date().toISOString();fs.writeFileSync('artifacts/browser-report.json',JSON.stringify(report,null,2));await browser.close();}
