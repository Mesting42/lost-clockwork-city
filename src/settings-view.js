import {icon} from './icons.js';
const options=(key,value,list)=>`<select data-setting="${key}" aria-label="${{quality:'画面质量',controlSize:'方向键大小',controlSide:'方向键位置'}[key]}">${list.map(([id,label])=>`<option value="${id}" ${id===value?'selected':''}>${label}</option>`).join('')}</select>`;
const toggle=(key,label,checked,note='',invert=false)=>`<div class="preference-row"><label class="preference-label" for="setting-${key}"><strong>${label}</strong>${note?`<small>${note}</small>`:''}</label><input class="setting-toggle" id="setting-${key}" data-setting="${key}" ${invert?'data-invert="true"':''} type="checkbox" ${checked?'checked':''}></div>`;
const slider=(key,label,value,min,max,step,display,note='')=>`<div class="preference-row slider-row"><label class="preference-label" for="setting-${key}"><strong>${label}</strong>${note?`<small>${note}</small>`:''}</label><div class="slider-control"><output for="setting-${key}" data-setting-output="${key}">${display}</output><input id="setting-${key}" aria-label="${label}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div></div>`;
export const settingsTabs=['audio','display','controls','save'];
export function settingsView(settings,tab) {
  const groups=[['audio','声音','sound'],['display','画面','camera'],['controls','操作','crate'],['save','存档','save']];
  let content='';
  if(tab==='audio')content=`<p class="settings-intro">留一点水声，也留一点安静。</p>
    ${slider('music','环境音乐',settings.music,0,1,.05,`${Math.round(settings.music*100)}%`,'三个区域各有自己的旋律。')}
    ${slider('sfx','机关音效',settings.sfx,0,1,.05,`${Math.round(settings.sfx*100)}%`,'脚步、机关和通关反馈。')}
    ${toggle('muted','静音',settings.muted,'关闭音乐、音效与试听。')}
    <div class="settings-actions"><button data-action="preview-music" class="settings-button" ${settings.muted?'disabled':''}>${icon('sound')}试听音乐</button><button data-action="preview-sfx" class="settings-button" ${settings.muted?'disabled':''}>${icon('cog')}试听机关音效</button></div>`;
  if(tab==='display')content=`<p class="settings-intro">让遗迹看得清，也让旅程更流畅。</p>
    <div class="preference-row"><label class="preference-label" for="setting-quality"><strong>画面质量</strong><small>所有档位都保留关键光路与机关标记。</small></label>${options('quality',settings.quality,[['high','精致'],['medium','均衡'],['low','轻盈']]).replace('<select','<select id="setting-quality"')}</div>
    <p class="quality-description" id="quality-description">${qualityDescription(settings.quality)}</p>
    ${slider('brightness','场景亮度',settings.brightness,.7,1.35,.05,`${Math.round(settings.brightness*100)}%`)}
    ${toggle('motion','减少动态效果',!settings.motion,'减弱环境摆动和机关过渡，保留自然行走步伐。',true)}
    <div class="settings-actions"><button class="settings-button" data-action="landscape">${icon('landscape')}横屏游玩</button><button class="settings-button" data-action="fullscreen">${icon('fullscreen')}<span id="fullscreen-label">${document.fullscreenElement||document.webkitFullscreenElement?'退出全屏':'进入全屏'}</span></button></div>`;
  if(tab==='controls')content=`<p class="settings-intro">把常用操作，放在顺手的地方。</p>
    <div class="preference-row"><label class="preference-label" for="setting-controlSize"><strong>方向键大小</strong><small>手机和平板始终显示方向键。</small></label>${options('controlSize',settings.controlSize,[['normal','标准 · 48 像素'],['large','大号 · 60 像素']]).replace('<select','<select id="setting-controlSize"')}</div>
    <div class="preference-row"><label class="preference-label" for="setting-controlSide"><strong>方向键位置</strong><small>工具栏会移动到另一侧。</small></label>${options('controlSide',settings.controlSide,[['left','左侧'],['right','右侧']]).replace('<select','<select id="setting-controlSide"')}</div>
    ${slider('cameraSensitivity','镜头灵敏度',settings.cameraSensitivity,.5,1.8,.1,`${settings.cameraSensitivity.toFixed(1)} 倍`,'同时影响拖动、滚轮和双指缩放。')}
    ${toggle('tapToMove','点击地面行走',settings.tapToMove,'关闭后仍可用方向键移动和推箱。')}
    ${toggle('showTouchControls','电脑也显示方向键',settings.showTouchControls,'适合触屏电脑或鼠标操作。')}`;
  if(tab==='save')content=`<p class="settings-intro">把这一段旅程，妥善收好。</p><div class="save-explanation"><strong>每次有效操作后自动保存</strong><p>存档包含关卡、机关状态、撤销历史、成绩和设置。导出文件可在另一台设备导入。</p></div>
    <div class="settings-actions save-actions"><button class="settings-button" data-action="save">${icon('save')}立即保存</button><button class="settings-button" data-action="export-save">${icon('arrow')}导出存档</button><button class="settings-button" data-action="import-save">${icon('save')}导入存档</button></div>
    <input id="import-save-file" type="file" accept=".json,application/json" hidden>
    <p class="settings-help">导入前会检查文件，并由你确认后替换当前旅程。原存档会保留为备份。不同浏览器和设备不会自动同步。</p>`;
  return `<div class="settings-heading"><h2 id="settings-title">按你的节奏</h2><button class="close" data-action="close" aria-label="关闭设置">${icon('close')}</button></div>
    <div class="settings-tabs" role="tablist" aria-label="设置分类">${groups.map(([id,label,ico])=>`<button id="settings-tab-${id}" role="tab" data-settings-tab="${id}" aria-selected="${tab===id}" aria-controls="settings-content" tabindex="${tab===id?'0':'-1'}">${icon(ico)}${label}</button>`).join('')}</div>
    <div class="settings-content" id="settings-content" role="tabpanel" aria-labelledby="settings-tab-${tab}">${content}</div>
    <div class="settings-status" id="settings-status" role="status" aria-live="polite"></div>
    <footer class="settings-footer"><button class="settings-reset" data-action="reset-settings">恢复默认设置</button><span>更改自动保存</span><button class="btn" data-action="close">完成</button></footer>`;
}
export function qualityDescription(quality) {return {high:'高分辨率、精细阴影与空气浮尘。',medium:'限制分辨率，使用较轻的阴影。',low:'降低分辨率，关闭阴影与空气浮尘。'}[quality];}
