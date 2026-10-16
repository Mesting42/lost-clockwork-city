import './style.css';
import './enhancements.css';
import { World } from './scene.js';
import { AudioEngine } from './audio.js';
import { levels, regions } from './levels.js';
import { act, createState, derive, copy, nearby, adjacent, pathTo, at, DIRS } from './engine.js';
import { readSave, writeSave, fresh, defaults, decode, encode } from './storage.js';
import { icon } from './icons.js';
import {LandscapeController} from './landscape.js';
import {normalizeSettings} from './settings.js';
import {settingsView,settingsTabs,qualityDescription} from './settings-view.js';

const app=document.querySelector('#app');
const loaded=readSave();
let data=loaded.data, world, state, levelIndex=0, history=[], stats={moves:0,hints:0,retries:0};
let screen='menu', modal=null, selected=null, hintStage=0, hintOpen=false, queue=[], toastTimer, pausedByHidden=false, endTime=0;
let completionCommitted=false, lastTime=performance.now(), chapterTab=0, sessionTime=0, storageWarningShown=false;
let landscape=null,settingsTab='audio',settingsSaveTimer,pendingImport=null;
const audio=new AudioEngine(); audio.apply(data.settings);
const q=(selector)=>app.querySelector(selector);
const button=(action,label,ico='',cls='secondary')=>`<button class="btn ${cls}" data-action="${action}">${ico?icon(ico):''}<span>${label}</span></button>`;
const closeButton=()=>`<button class="close" data-action="close" aria-label="关闭">${icon('close')}</button>`;
const paused=()=>Boolean(modal)||pausedByHidden||document.hidden||Boolean(landscape?.blocked);
const region=()=>regions[levels[levelIndex].region];
const titleSmall=(text)=>`<div class="panel-top"><span>${text}</span>${closeButton()}</div>`;
const stars=(n)=>`<div class="stars" aria-label="${n}颗星">${[1,2,3].map(i=>icon('star',i>n?'dim':'')).join('')}</div>`;

function applySettings() {
  data.settings=normalizeSettings(data.settings);
  const s=data.settings;
  document.body.dataset.controlSide=s.controlSide;
  document.body.dataset.forceControls=String(s.showTouchControls);
  document.documentElement.style.setProperty('--control-size',s.controlSize==='large'?'60px':'48px');
  document.body.classList.toggle('reduced-effects',!s.motion);
  audio.apply(s);audio.pause(paused());world?.setQuality(s);
}
function settingsStatus(message,error=false) {
  const status=q('#settings-status');
  if(status){status.textContent=message;status.classList.toggle('error',error);}else toast(message,error);
}
function exportSave() {
  clearTimeout(settingsSaveTimer);save();
  const raw=encode(data),url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
  const now=new Date(),stamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('');
  const link=document.createElement('a');link.href=url;link.download=`失落机关城-存档-${stamp}.json`;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);settingsStatus('存档文件已导出，可在另一台设备导入。');
}
async function toggleFullscreen() {
  try {
    const exit=document.exitFullscreen||document.webkitExitFullscreen;
    const enter=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
    if(document.fullscreenElement||document.webkitFullscreenElement)await exit?.call(document);
    else if(enter)await enter.call(document.documentElement);
    else {settingsStatus('此浏览器不支持网页全屏，请使用浏览器的全屏功能。',true);return;}
    const label=q('#fullscreen-label');if(label)label.textContent=document.fullscreenElement||document.webkitFullscreenElement?'退出全屏':'进入全屏';
  } catch {settingsStatus('浏览器未允许全屏。你仍可横屏游玩。',true);}
}

function toast(text,error=false) {
  clearTimeout(toastTimer);
  let el=q('.toast');if(!el){el=document.createElement('div');el.className='toast';el.setAttribute('role','status');app.append(el);}
  el.textContent=text;el.className=`toast${error?' error':''}`;
  toastTimer=setTimeout(()=>el.classList.add('hidden'),2800);
}

function save(manual=false) {
  if(screen==='game'&&state&&!completionCommitted) data.current={level:levelIndex,state:copy(state),history:copy(history.slice(-80)),stats:{...stats},hintStage};
  data.totalSeconds=(data.totalSeconds||0)+sessionTime;sessionTime=0;
  if(!writeSave(data)) {
    if(!storageWarningShown||manual)toast('浏览器未允许保存。请允许本站使用本地存储后重试。',true);
    storageWarningShown=true;
    return false;
  }
  storageWarningShown=false;
  if(manual)toast('已保存当前机关状态与进度。');
  return true;
}

function menu() {
  screen='menu';modal=null;queue=[];selected=null;hintOpen=false;completionCommitted=false;
  document.body.classList.add('menu-active');
  const showcase=levels[5],showState=createState(showcase);
  showState.water=1;showState.crates[0].x=5;derive(showcase,showState);
  world.load(showcase,showState,true);world.setQuality(data.settings);audio.regionTo(0);
  render();
}

function render() {
  if(screen==='menu') {
    app.innerHTML=`<header class="masthead"><div class="brand"><img class="brand-emblem" src="/icons/game-icon.svg" alt="" width="29" height="29"><span>一段关于重新唤醒的旅程</span></div><div class="menu-tools"><button class="icon-button landscape-entry" data-action="landscape" aria-label="横屏游玩">${icon('landscape')}</button><button class="icon-button" data-action="mute" aria-label="${data.settings.muted?'开启声音':'静音'}">${icon(data.settings.muted?'mute':'sound')}</button><button class="icon-button" data-action="settings" aria-label="设置">${icon('cog')}</button></div></header>
    <main class="menu-copy"><div class="eyebrow">机械遗迹 · 空间解谜</div><h1>失落<br>机关城</h1><p class="poem">有些城市，沉睡太久。<br>而你，带着一颗微光而来。</p>
    ${button(data.current?'continue':data.finished?'levels':'new',data.current?'继续旅程':data.finished?'回访机关城':'唤醒这座城','arrow','primary')}
    ${data.current?`<div class="continue-note">上次停留 · ${regions[levels[data.current.level].region].name} / ${levels[data.current.level].name}</div>`:''}
    <div class="menu-secondary"><button class="text-button" data-action="levels">章节选择</button><button class="text-button" data-action="guide">操作指南</button>${data.current||Object.keys(data.completed).length?'<button class="text-button" data-action="new">新的旅程</button>':''}</div></main>
    <div class="menu-scene-caption">水声即将重返这里</div><footer class="menu-footer"><div class="region-preview">${regions.map((r,i)=>`<div class="region-item">${icon(r.emblem)}<span>${r.name}<small>${i===0?'水流与传动':i===1?'反射与能源':'方向与引力'}</small></span></div>`).join('')}</div><span class="footer-note">十八道机关 · 一座等待苏醒的城</span></footer>`;
  } else if(screen==='game') renderGame();
  else if(screen==='ending')renderEnding();
  if(modal)renderModal();
}

function renderGame() {
  const level=levels[levelIndex],r=regions[level.region];
  const statuses=[];
  if(level.plates.length)statuses.push(`<span class="mechanism-chip ${state.plates.length===level.plates.length?'active':''}">${icon('crate')}传动 ${state.plates.length}/${level.plates.length}</span>`);
  if(level.receivers.length)statuses.push(`<span class="mechanism-chip ${state.received.length===level.receivers.length?'active':''}">${icon('light')}能源 ${state.received.length}/${level.receivers.length}</span>`);
  if(level.goalWater!==undefined)statuses.push(`<span class="mechanism-chip ${state.water===level.goalWater?'active':''}">${icon('water')}水位 ${state.water?'高':'低'}</span>`);
  if(level.controls.some(c=>c.type==='gravity'))statuses.push(`<span class="mechanism-chip ${state.gravity?'active':''}">${icon('gravity')}重力 ${{up:'↑',right:'→',down:'↓',left:'←'}[state.gravity]||'静止'}</span>`);
  app.innerHTML=`<div class="hud"><header class="level-header"><div class="level-overline">${icon(r.emblem)}<span>${r.name}</span><span>·</span><span>第 ${level.number} / 18 关</span></div><h2>${level.name}</h2><p class="objective ${state.ready?'ready':''}"><span class="status-dot"></span>${state.ready?'机关已接通 · 走向点亮的出口':level.goal}</p></header>
  <button class="icon-button pause-btn" data-action="pause" aria-label="暂停游戏">${icon('pause')}<span>暂停</span></button><div class="hud-status"><span>操作 ${stats.moves}</span><span>提示 ${stats.hints}</span><span>重试 ${stats.retries}</span><span>自动保存</span></div><div class="mechanism-progress">${statuses.join('')}</div>
  <div class="controls-note"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或方向键移动<br><kbd>E</kbd> 操作附近机关 · 点击地面行走</div>
  <nav class="toolbar" aria-label="解谜工具"><button class="icon-button" data-action="undo" ${!history.length?'disabled':''} aria-label="撤销一步">${icon('undo')}<span>撤销</span></button><button class="icon-button" data-action="reset">${icon('reset')}<span>重置</span></button><span class="divider"></span><button class="icon-button" data-action="hint">${icon('hint')}<span>提示</span></button><button class="icon-button" data-action="guide">${icon('cog')}<span>指南</span></button></nav>
  <div class="camera-controls"><button data-action="rotate-camera" aria-label="转动视角">↻<span class="camera-label"> 转动</span></button><button data-action="reset-camera" aria-label="还原镜头">${icon('camera')}</button></div>
  <nav class="dpad" aria-label="方向移动">${Object.entries({up:'↑',left:'←',down:'↓',right:'→'}).map(([dir,label])=>`<button data-dir="${dir}" aria-label="向${{up:'上',left:'左',down:'下',right:'右'}[dir]}移动">${label}</button>`).join('')}</nav>
  <div id="interact"></div><div id="hint"></div></div>`;
  renderInteraction();renderHint();
}

function objectInfo(object) {
  const names={valve:'水位阀门',mirror:'折光镜',gravity:'重力罗盘',crate:object.gravity?'星陨箱':object.buoyant?'铜木浮箱':'机关箱',door:'联动闸门',receiver:object.energy==='azure'?'三角 · 青蓝接收器':'菱形 · 琥珀接收器',source:object.energy==='azure'?'三角 · 青蓝发射器':'菱形 · 琥珀发射器',exit:'城市传送门'};
  const descriptions={valve:`当前水位：${state.water?'高':'低'}。升高水位会让浮台与浮箱升起。`,mirror:`当前朝向：${state.mirrors.find(m=>m.id===object.id)?.angle===0?'／':'＼'}。转动一次切换斜向，光路会立即更新。`,gravity:`当前重力：${{up:'向上',down:'向下',left:'向左',right:'向右'}[state.gravity]||'静止'}。星陨箱沿发光轨道滑动，遇到障碍便停靠。`,crate:object.gravity?'不能直接推动。使用重力罗盘，沿紫色轨道改变它的位置。':object.buoyant?'低水位时可以推动；升水后，水中的浮箱可以站立。':'从相邻格向箱体移动即可推动。箱体能压住圆盘，也会挡住光束。',door:state.doors.includes(object.id)?'已开启。占用闸口时，安全棘爪会保持门扇开启。':'需要接通传动、能源或水位条件。观察地面标记与当前目标。',receiver:'只有同符号的光束真正抵达时，接收器才会亮起。',source:'持续发出标记能源，遇到墙体、箱体或固定装置时停止。',exit:state.ready?'所有机关条件已满足。走入出口前往下一关。':'出口正在等待本关机关接通。'};
  return {name:names[object.type],desc:descriptions[object.type],ico:{source:'light',receiver:'light',door:'exit',exit:'exit'}[object.type]||object.type};
}

function renderInteraction() {
  const container=q('#interact');if(!container)return;
  if(!selected){container.innerHTML='';world.select(null);return;}
  const object=selected,info=objectInfo(object),close=adjacent(state.player,object);
  world.select(object);
  let controls='';
  if(['valve','mirror'].includes(object.type))controls=`<button class="btn" data-action="interact" ${close?'':'disabled'}>${icon(object.type)}${object.type==='valve'?'转动阀门':'转动镜面'}<span class="subtle">E</span></button>`;
  if(object.type==='gravity') {
    controls=`<div class="gravity-buttons">${Object.entries({up:'↑ 向上',right:'→ 向右',down:'↓ 向下',left:'← 向左'}).map(([dir,label])=>`<button data-gravity="${dir}" ${close?'':'disabled'}>${label}</button>`).join('')}</div><div class="gravity-preview">轨道末端或第一个障碍物之前，就是停靠位置。</div>`;
  }
  if(!close&&['valve','mirror','gravity'].includes(object.type))controls+='<div class="gravity-preview">先走到机关旁边，即可操作。</div>';
  container.innerHTML=`<section class="interact-panel panel" aria-label="选中机关"><div class="interact-heading">${icon(info.ico)}<strong>${info.name}</strong><button class="close" data-action="deselect" aria-label="取消选中">${icon('close')}</button></div><p class="interact-desc">${info.desc}</p>${controls}</section>`;
}

function renderHint() {
  const container=q('#hint');if(!container)return;
  if(!hintOpen){container.innerHTML='';return;}
  container.innerHTML=`<aside class="hint-panel"><div class="hint-head"><span>${icon('hint')} ${['观察重点','关键规则','下一步建议'][Math.max(0,hintStage-1)]}</span><button class="close" data-action="close-hint" aria-label="收起提示">${icon('close')}</button></div><div class="hint-levels">${[1,2,3].map(n=>`<span class="${n<=hintStage?'active':''}"></span>`).join('')}</div><p class="hint-text">${levels[levelIndex].hints[Math.max(0,hintStage-1)]}</p>${hintStage<3?button('next-hint','展开下一层提示','arrow'): '<div class="fine-print">需要再试一次时，撤销和重置始终可用。</div>'}</aside>`;
}

function setModal(value) {
  queue=[];audio.stopPreview();modal=value;audio.pause(paused());render();
  requestAnimationFrame(()=>q('.panel button:not(:disabled)')?.focus({preventScroll:true}));
}

function renderModal() {
  let html='';
  if(modal.type==='pause')html=`${titleSmall('旅途小憩')}<h2>让齿轮休息一会儿</h2><p>城市会在这里，等你回来。</p>${button('resume','继续探索','arrow','primary')}<div class="pause-list"><button data-action="save"><span>保存旅程</span>${icon('save')}</button><button data-action="levels"><span>章节选择</span>${icon('arrow')}</button><button data-action="settings"><span>声音与画面</span>${icon('cog')}</button><button data-action="guide"><span>操作指南</span>${icon('hint')}</button><button data-action="menu"><span>返回主菜单</span>${icon('arrow')}</button></div><p class="fine-print">机关状态已自动保存。暂停时，所有机关与动画冻结。</p>`;
  if(modal.type==='settings')html=settingsView(data.settings,settingsTab);
  if(modal.type==='reset-settings')html=`${titleSmall('恢复偏好')}<h2>恢复默认设置？</h2><p>声音、画面和操作偏好会回到默认值。当前机关状态、通关进度与成绩都会保留。</p><div class="row">${button('close','保留设置')}${button('confirm-reset-settings','恢复默认','reset','primary')}</div>`;
  if(modal.type==='import-save')html=`${titleSmall('导入旅程')}<h2>接着这段旅程出发？</h2><p>文件已通过检查：完成 ${Object.keys(pendingImport.completed).length} / 18 关${pendingImport.current?`，停留在「${levels[pendingImport.current.level].name}」`:''}。导入将替换当前旅程和设置，原存档会保留为备份。</p><div class="row">${button('close','取消导入')}${button('confirm-import','导入并应用','save','primary')}</div>`;
  if(modal.type==='guide')html=`${titleSmall('探险者手册')}<h2>慢慢来，城会等你</h2><div class="guide-list"><div>${icon('crate')}<span><strong>行走与推箱</strong><br><small>方向键 / WASD 或屏幕方向键移动。点击空地自动行走；向箱体移动即可推动。无路可走时，试试绕到另一侧。</small></span></div><div>${icon('valve')}<span><strong>站在旁边，再操作</strong><br><small>点击选中机关。镜面与阀门使用 E 或操作按钮；重力罗盘提供四个方向按钮。带标记的圆盘由箱体持续压住。</small></span></div><div>${icon('water')}<span><strong>水流会改变道路</strong><br><small>低水位能走渠床、推动浮箱；高水位能升起浮台，浮箱成为踏脚石。</small></span></div><div>${icon('light')}<span><strong>看见真实的光路</strong><br><small>“／”与“＼”决定反射方向。箱体和墙体会挡光。菱形对应琥珀，三角对应青蓝。</small></span></div><div>${icon('gravity')}<span><strong>提前看好落点</strong><br><small>星陨箱只在紫色轨道上滑动，停在轨道末端或障碍之前。重力会持续生效，站位也会影响停靠。</small></span></div></div><div class="guide-shortcuts"><span><kbd>Z</kbd> 撤销一步</span><span><kbd>R</kbd> 重置本关</span><span><kbd>E</kbd> 操作机关</span><span><kbd>Esc</kbd> 暂停 / 返回</span></div><p class="fine-print">拖动空白区域平移镜头，滚轮或双指缩放。手机方向键与地图方向一致；转动镜头不会改变移动规则。评分根据本次实际操作、提示和重试记录计算，不考核速度。</p>${button('close','知道了','check')}`;
  if(modal.type==='levels') {
    const names=regions[chapterTab];
    html=`${titleSmall('十八道机关 · 三颗城市之心')}<h2>旅途的足迹</h2><div class="chapter-tabs">${regions.map((r,i)=>`<button class="${chapterTab===i?'active':''}" data-chapter="${i}">${icon(r.emblem)}${r.name}</button>`).join('')}</div><div class="level-grid">${levels.filter(l=>l.region===chapterTab).map(l=>{
      const record=data.completed[l.id],unlocked=l.id<=data.unlocked;
      return `<button class="level-tile" data-level="${l.id}" ${unlocked?'':'disabled'}><span class="level-num">${String(l.number).padStart(2,'0')}</span><span class="level-name">${l.name}</span><span class="level-meta">${record?`${icon('check')}${record.moves} 次操作 · ${record.stars} 星`:unlocked?'已解锁 · 开始探索':'尚未唤醒'}</span></button>`;
    }).join('')}</div><p class="fine-print">${names.subtitle}。重玩保留更好的记录：先比较星数，再比较操作、提示和重试。不会重复解锁。</p>`;
  }
  if(modal.type==='story') {
    const r=region();html=`<div class="panel-top">${r.chapter} · ${r.name}</div>${icon(r.emblem)}<h2>${r.subtitle}</h2><p class="story-copy">${r.story}</p>${button('begin','进入遗迹','arrow','primary')}`;
  }
  if(modal.type==='reset')html=`${titleSmall('重新整理机关')}<h2>重置这一关？</h2><p>机关回到初始位置，重试次数加一。已完成的关卡和历史最佳记录会保留。</p><div class="row">${button('close','继续思考')}${button('confirm-reset','重置本关','reset','primary')}</div>`;
  if(modal.type==='new')html=`${titleSmall('新的旅程')}<h2>重新唤醒这座城？</h2><p>这会清除本游戏的关卡进度、评分与当前状态。声音和画面设置会保留。</p><div class="row">${button('close','保留旅程')}${button('confirm-new','开始新的旅程','arrow','primary')}</div>`;
  if(modal.type==='leave')html=`${titleSmall('回访之前')}<h2>先收好这一段旅程</h2><p>当前关卡已有进展。进入另一关会用新关卡替换当前机关状态，已完成记录仍会保留。</p><div class="row">${button('close','继续本关')}${button('confirm-leave','进入所选关卡','arrow','primary')}</div>`;
  if(modal.type==='complete') {
    const r=modal.result;html=`<div class="panel-top">第 ${levelIndex+1} 关 · ${region().name}</div>${icon(region().emblem)}<h2>${levelIndex===17?'城市的心脏醒了':levelIndex%6===5?'一颗城市之心醒了':'又一处机关，亮了'}</h2><p>${levelIndex%6===5?'远处的建筑传来了轻微的回声。你的微光，正让整座城重新呼吸。':'每一次尝试，都让你离城市的秘密更近一点。'}</p>${stars(r.stars)}<div class="stats-grid"><div><strong>${r.moves}</strong><span>有效操作</span></div><div><strong>${r.hints}</strong><span>主动提示</span></div><div><strong>${r.retries}</strong><span>重试次数</span></div></div>${button('next',levelIndex===17?'唤醒城市核心':'继续旅程','arrow','primary')}<div class="row">${button('replay','再试一种解法','reset')}${button('levels','章节选择')}</div><p class="fine-print">三颗星：无需提示且未重置。两颗星：最多 2 次提示、1 次重试。其余完成均获得一颗星。最佳记录已保存。</p>`;
  }
  if(modal.type==='summary') {
    const records=Object.values(data.completed),sum=k=>records.reduce((a,r)=>a+r[k],0);
    html=`<div class="panel-top">失落机关城 · 旅途完成</div>${icon('cog')}<h2>城市，重新呼吸</h2><p>水流归位，星光抵达。那些沉睡的窗户，一盏接一盏亮了起来。小探险者收好工具，城里终于有了回家的路。</p><div class="stats-grid"><div><strong>${records.length}<small>/18</small></strong><span>修复机关</span></div><div><strong>${sum('moves')}</strong><span>记录操作</span></div><div><strong>${sum('hints')}</strong><span>主动提示</span></div><div><strong>${sum('retries')}</strong><span>重试次数</span></div></div>${button('levels','回访机关城','arrow','primary')}${button('menu','回到主菜单')}<p class="fine-print">以上为各关最佳记录之和。完整进度已保留，欢迎寻找更简洁的解法。</p>`;
  }
  if(modal.type==='corrupt')html=`<div class="panel-top">存档检查</div><h2>这一页旅程需要修复</h2><p>检测到存档损坏或版本不兼容：${escapeText(loaded.error)}。原始记录已保留，可尝试上一份有效备份。</p>${loaded.backup?button('restore','恢复有效备份','save','primary'):''}${button('corrupt-new','重新开始','arrow')}<p class="fine-print">重新开始前，当前原始记录会保留到本游戏的恢复槽中。</p>`;
  const shade=document.createElement('div');shade.className='modal-shade';shade.innerHTML=`<section class="panel ${modal.type==='levels'?'level-panel':''} ${modal.type==='settings'?'settings-panel':''} ${['story','complete','summary'].includes(modal.type)?`${modal.type}-panel`:''}" role="dialog" aria-modal="true" aria-label="${modal.type==='levels'?'章节选择':modal.type==='settings'?'游戏设置':'游戏面板'}">${html}</section>`;app.append(shade);
}

function escapeText(text) {return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function startLevel(index,{restore=false,story=false}={}) {
  if(index>data.unlocked)return;
  levelIndex=index;screen='game';modal=null;hintOpen=false;selected=null;queue=[];completionCommitted=false;
  document.body.classList.remove('menu-active');
  if(restore&&data.current?.level===index) {
    state=derive(levels[index],copy(data.current.state));history=copy(data.current.history||[]);stats={...data.current.stats};hintStage=data.current.hintStage||0;
  } else {state=createState(levels[index]);history=[];stats={moves:0,hints:0,retries:0};hintStage=0;}
  world.load(levels[index],state);world.setQuality(data.settings);audio.regionTo(levels[index].region);audio.pause(false);render();save();
  if(state.won)complete();else if(story)setModal({type:'story'});
}

function perform(action) {
  if(screen!=='game'||paused()||completionCommitted)return false;
  // Direction input can retarget the visual transition immediately. The
  // logical state is already at the previous destination, so one key still
  // maps to exactly one deterministic engine action.
  if(world.transition&&action.type!=='move')return false;
  const result=act(levels[levelIndex],state,action);
  if(!result.ok) {queue=[];audio.play('error');toast(result.reason,true);return false;}
  history.push(copy(state));if(history.length>160)history.shift();
  const previous=state;state=result.state;stats.moves++;
  world.sync(state,false,result.sound);if(result.sound!=='step')audio.play(result.sound);
  if(state.received.length>previous.received.length)audio.play('light');
  if(state.doors.length!==previous.doors.length)audio.play('door');
  if(selected?.type==='mirror')selected={...selected,angle:state.mirrors.find(m=>m.id===selected.id).angle};
  if(selected?.type==='crate')selected={...state.crates.find(c=>c.id===selected.id),type:'crate'};
  renderGame();save();return true;
}

function undo() {
  if(screen!=='game'||modal||!history.length||completionCommitted)return;
  queue=[];state=history.pop();stats.moves++;
  world.sync(state,true);audio.play('undo');renderGame();save();
}
function doReset() {
  stats.retries++;state=createState(levels[levelIndex]);history=[];queue=[];selected=null;hintOpen=false;completionCommitted=false;
  world.sync(state,true);modal=null;audio.pause(false);audio.play('reset');render();save();
}
function complete() {
  if(completionCommitted)return;
  completionCommitted=true;queue=[];selected=null;hintOpen=false;
  const result={...stats,stars:stats.hints===0&&stats.retries===0?3:stats.hints<=2&&stats.retries<=1?2:1};
  const old=data.completed[levelIndex];
  const better=!old||result.stars>old.stars||result.stars===old.stars&&(result.moves<old.moves||result.moves===old.moves&&(result.hints<old.hints||result.hints===old.hints&&result.retries<old.retries));
  if(better)data.completed[levelIndex]=result;
  data.unlocked=Math.max(data.unlocked,Math.min(17,levelIndex+1));
  // A completed chapter is also a recoverable boundary, including its result and next-level action.
  data.current={level:levelIndex,state:copy(state),history:copy(history.slice(-80)),stats:{...stats},hintStage};
  save();setModal({type:'complete',result});audio.apply(data.settings);audio.play('complete');
}

function renderEnding() {
  app.innerHTML=`<div class="ending-overlay"><button data-action="skip-ending">跳过演出 ${icon('arrow')}</button><h2>${endTime<2?'水流重回旧日的河道':endTime<4?'星光照亮每一扇窗':'失落的城，终于醒来'}</h2><p>谢谢你，把微光带到了这里。</p></div>`;
}
function ending() {
  modal=null;screen='ending';endTime=0;world.transition=null;audio.pause(false);audio.play('ending');
  world.sync(state,true);world.startRestart();render();
}
function finishEnding() {data.finished=true;data.current=null;save();setModal({type:'summary'});}

function pick(picked) {
  if(screen!=='game'||paused()||world.transition||completionCommitted)return;
  queue=[];
  if(picked.object) {selected=picked.object.type==='crate'?{...state.crates.find(c=>c.id===picked.object.id),type:'crate'}:picked.object;hintOpen=false;renderInteraction();renderHint();audio.play('hint');return;}
  if(picked.tile) {
    if(!data.settings.tapToMove){toast('点击行走已关闭，可使用方向键移动。');return;}
    selected=null;renderInteraction();
    const route=pathTo(levels[levelIndex],state,picked.tile);
    if(route===null){toast('这里暂时没有可步行的通路。推动箱体请使用方向键。',true);audio.play('error');}
    else queue=route;
  }
}

function interact() {
  if(paused()||world.transition||screen!=='game')return;
  const targets=nearby(levels[levelIndex],state);
  const target=selected&&targets.find(o=>o.id===selected.id)||targets[0];
  if(!target){toast('走到阀门、镜面或重力罗盘旁，再按 E。');return;}
  selected=target;
  if(target.type==='gravity'){renderInteraction();return;}
  perform({type:'interact',id:target.id});
}

function closeModal() {
  if(!modal)return;
  if(['complete','story','summary','corrupt'].includes(modal.type))return;
  audio.stopPreview();
  if(modal.back){setModal(modal.back);return;}
  modal=null;audio.pause(false);render();
}

app.addEventListener('click',async event=>{
  const target=event.target.closest('button');if(!target||target.disabled)return;
  audio.unlock();
  if(target.dataset.settingsTab){settingsTab=target.dataset.settingsTab;audio.stopPreview();render();q(`[data-settings-tab="${settingsTab}"]`)?.focus();return;}
  if(target.dataset.dir){queue=[];perform({type:'move',dir:target.dataset.dir});return;}
  if(target.dataset.gravity){if(selected)perform({type:'gravity',id:selected.id,dir:target.dataset.gravity});return;}
  if(target.dataset.chapter){chapterTab=Number(target.dataset.chapter);render();return;}
  if(target.dataset.level){
    const index=Number(target.dataset.level);
    if(screen==='game'&&!completionCommitted&&history.length&&index!==levelIndex){setModal({type:'leave',target:index,back:{type:'levels'}});}
    else startLevel(index,{story:index%6===0&&!data.completed[index]});
    return;
  }
  const action=target.dataset.action;
  switch(action) {
    case 'new': if(data.current||Object.keys(data.completed).length)setModal({type:'new'});else {const settings=data.settings;data=fresh();data.settings=settings;startLevel(0,{story:true});}break;
    case 'confirm-new': {const settings=data.settings;data=fresh();data.settings=settings;startLevel(0,{story:true});break;}
    case 'continue': if(data.current)startLevel(data.current.level,{restore:true});else setModal({type:'levels'});break;
    case 'pause':save();setModal({type:'pause'});break;
    case 'resume':modal=null;audio.pause(false);render();break;
    case 'settings':setModal({type:'settings',back:modal?.type==='pause'?{type:'pause'}:null});break;
    case 'preview-music':case 'preview-sfx':await audio.unlock();audio.preview(action==='preview-music'?'music':'sfx');settingsStatus(data.settings.muted?'已静音，请先关闭静音再试听。':'正在试听，再次点击会重新播放。');break;
    case 'landscape':landscape.requestLandscape();break;
    case 'fullscreen':toggleFullscreen();break;
    case 'reset-settings':setModal({type:'reset-settings',back:modal});break;
    case 'confirm-reset-settings':data.settings={...defaults};applySettings();save();setModal(modal.back||{type:'settings'});settingsStatus('已恢复默认设置，旅程进度保持不变。');break;
    case 'export-save':exportSave();break;
    case 'import-save':q('#import-save-file')?.click();break;
    case 'confirm-import':if(pendingImport){
      const incoming=pendingImport;
      if(!writeSave(incoming)){settingsStatus('无法保存导入的旅程，请允许本地存储后重试。',true);return;}
      data=incoming;pendingImport=null;clearTimeout(settingsSaveTimer);applySettings();menu();toast('旅程已导入，可以继续探索。');
    }break;
    case 'guide':setModal({type:'guide',back:modal?.type==='pause'?{type:'pause'}:null});break;
    case 'levels':chapterTab=screen==='game'?levels[levelIndex].region:data.current?levels[data.current.level].region:Math.floor(data.unlocked/6);setModal({type:'levels',back:modal?.type==='pause'?{type:'pause'}:modal?.type==='summary'?{type:'summary'}:modal?.type==='complete'?modal:null});break;
    case 'close':closeModal();break;
    case 'save':{const saved=save(true);if(q('#settings-status'))settingsStatus(saved?'当前旅程已保存。':'请确认浏览器已允许本地存储。',!saved);break;}
    case 'menu':save();audio.pause(false);menu();break;
    case 'begin':modal=null;audio.pause(false);render();break;
    case 'undo':undo();break;
    case 'reset':if(screen==='game'&&!completionCommitted)setModal({type:'reset'});break;
    case 'confirm-reset':doReset();break;
    case 'interact':interact();break;
    case 'deselect':selected=null;renderInteraction();break;
    case 'hint':queue=[];hintOpen=!hintOpen;if(hintOpen&&hintStage===0){hintStage=1;stats.hints++;audio.play('hint');save();}renderGame();break;
    case 'next-hint':if(hintStage<3){hintStage++;stats.hints++;audio.play('hint');save();renderGame();}break;
    case 'close-hint':hintOpen=false;renderHint();break;
    case 'reset-camera':world.resetCamera();break;
    case 'rotate-camera':world.rotateCamera();break;
    case 'mute':data.settings.muted=!data.settings.muted;audio.apply(data.settings);save();render();break;
    case 'next':if(levelIndex===17){if(data.finished){setModal({type:'summary'});}else ending();}else startLevel(levelIndex+1,{story:(levelIndex+1)%6===0});break;
    case 'replay':startLevel(levelIndex);break;
    case 'confirm-leave':startLevel(modal.target,{story:modal.target%6===0&&!data.completed[modal.target]});break;
    case 'skip-ending':finishEnding();break;
    case 'restore':data=loaded.backup;save();menu();break;
    case 'corrupt-new': {try{const raw=localStorage.getItem('lost-clockwork-city:save:v1');if(raw)localStorage.setItem('lost-clockwork-city:recovery:v1',raw);}catch{}data=fresh();startLevel(0,{story:true});break;}
  }
});

app.addEventListener('input',event=>{
  const key=event.target.dataset.setting;if(!key)return;
  data.settings[key]=event.target.type==='checkbox'?(event.target.dataset.invert?!event.target.checked:event.target.checked):event.target.type==='range'?Number(event.target.value):event.target.value;
  applySettings();
  const output=q(`[data-setting-output="${key}"]`);if(output)output.textContent=key==='cameraSensitivity'?`${data.settings[key].toFixed(1)} 倍`:`${Math.round(data.settings[key]*100)}%`;
  if(key==='quality'&&q('#quality-description'))q('#quality-description').textContent=qualityDescription(data.settings.quality);
  if(key==='muted'){audio.stopPreview();for(const element of app.querySelectorAll('[data-action="preview-music"],[data-action="preview-sfx"]'))element.disabled=data.settings.muted;}
  clearTimeout(settingsSaveTimer);settingsSaveTimer=setTimeout(()=>save(),200);
});
app.addEventListener('change',async event=>{
  if(event.target.id!=='import-save-file')return;
  const file=event.target.files?.[0];if(!file)return;
  try {
    if(file.size>2*1024*1024)throw new Error('文件超过 2 MB，请选择本游戏导出的存档。');
    pendingImport=decode(await file.text());setModal({type:'import-save',back:modal});
  } catch(error){pendingImport=null;settingsStatus(`无法导入：${error.message}`,true);}
  finally{event.target.value='';}
});

window.addEventListener('keydown',event=>{
  if(landscape?.blocked){if(event.key!=='Tab'&&event.key!=='Enter'&&event.key!==' ')event.preventDefault();return;}
  if(event.target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();const index=settingsTabs.indexOf(settingsTab);
    settingsTab=event.key==='Home'?settingsTabs[0]:event.key==='End'?settingsTabs.at(-1):settingsTabs[(index+(event.key==='ArrowRight'?1:3))%4];
    audio.stopPreview();render();q(`[data-settings-tab="${settingsTab}"]`)?.focus();return;
  }
  if(event.key==='Tab'&&modal) {
    const nodes=[...app.querySelectorAll('.modal-shade button:not(:disabled),.modal-shade input,.modal-shade select')];
    if(!nodes.length)return;
    if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}
    else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}return;
  }
  if(event.key==='Escape') {event.preventDefault();if(modal)closeModal();else if(screen==='game'){save();setModal({type:'pause'});}return;}
  if(modal||screen!=='game'||event.target.closest('input,select,textarea'))return;
  const keys={ArrowUp:'up',w:'up',W:'up',ArrowRight:'right',d:'right',D:'right',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left'};
  if(keys[event.key]){event.preventDefault();audio.unlock();queue=[];perform({type:'move',dir:keys[event.key]});}
  else if(event.key.toLowerCase()==='e'){event.preventDefault();interact();}
  else if(event.key.toLowerCase()==='z'){event.preventDefault();undo();}
  else if(event.key.toLowerCase()==='r'){event.preventDefault();setModal({type:'reset'});}
});
document.addEventListener('visibilitychange',()=>{
  pausedByHidden=document.hidden;audio.pause(paused());queue=[];lastTime=performance.now();if(document.hidden){audio.stopPreview();save();}
});
window.addEventListener('pagehide',()=>save());

function frame(time) {
  const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
  const stopped=paused();
  if(screen==='game'&&!stopped&&!completionCommitted)sessionTime+=dt;
  world.tick(dt,stopped);audio.tick(stopped);
  if(screen==='game'&&!stopped&&!world.transition&&!completionCommitted) {
    if(state.won)complete();else if(queue.length)perform({type:'move',dir:queue.shift()});
  }
  if(screen==='ending'&&!stopped) {
    endTime+=dt;
    world.angle+=dt*.04;world.resize();
    world.restartAt(endTime,dt);
    if(Math.floor((endTime-dt)/2)!==Math.floor(endTime/2))renderEnding();
    if(endTime>6.5)finishEnding();
  }
  requestAnimationFrame(frame);
}

try {
  document.querySelector('#loading-status').textContent='构建机械遗迹与探险者…';
  world=new World(document.querySelector('#world'),pick);world.onFootstep=()=>audio.play('step');
  landscape=new LandscapeController(()=>{queue=[];lastTime=performance.now();audio.pause(paused());if(document.hidden||landscape?.blocked)save();});
  applySettings();menu();
  document.querySelector('#loading').remove();
  if(loaded.error)setModal({type:'corrupt'});
  requestAnimationFrame(frame);
  // Read-only inspection for browser regression. Input still goes through real keyboard and UI controls.
  Object.defineProperty(window,'__CITY__',{value:Object.freeze({
    inspect:()=>({screen,modal:modal?.type||null,level:levelIndex,state:copy(state||{}),stats:{...stats},history:history.length,unlocked:data.unlocked,completed:copy(data.completed),busy:Boolean(world.transition),selected:selected?.id||null,landscapeBlocked:Boolean(landscape?.blocked),settings:{...data.settings},animation:{position:world.robot.position.toArray(),hips:world.robot.userData.legs.map(l=>l.hip.rotation.x),knees:world.robot.userData.legs.map(l=>l.knee.rotation.x),feet:world.robot.userData.legs.map(l=>{const p=l.ankle.getWorldPosition(world.robot.position.clone());return p.toArray();}),phase:world.transition?.time||0},render:{calls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,pixelRatio:world.renderer.getPixelRatio(),exposure:world.renderer.toneMappingExposure}}),
    point:(x,z,y)=>world.screenPoint(x,z,y),
    projectObject:(id)=>{const o=world.objects.get(id);if(!o)return null;const p=o.position.clone();p.y+=.7;p.project(world.camera);return{x:(p.x+1)/2*innerWidth,y:(1-p.y)/2*innerHeight};}
  })});
} catch(error) {
  const loader=document.querySelector('#loading');
  if(loader)loader.innerHTML=`<div class="fatal"><h2>机关城暂时无法启动</h2><p>${escapeText(error.message)}</p><p>请使用支持 WebGL 的浏览器，并通过一键启动器或本地服务打开。若关闭了硬件加速，请重新启用后刷新。</p><button onclick="location.reload()">重新加载</button></div>`;
  console.error(error);
}
