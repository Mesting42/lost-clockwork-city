import { levels } from './levels.js';
import { derive, cell } from './engine.js';
import { defaultSettings, normalizeSettings } from './settings.js';

export const SAVE_KEY='lost-clockwork-city:save:v1';
export const BACKUP_KEY='lost-clockwork-city:backup:v1';
export const defaults=defaultSettings;
export function fresh() { return {unlocked:0,completed:{},current:null,settings:{...defaults},finished:false,createdAt:Date.now(),totalSeconds:0}; }
export function checksum(text) {let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16);}

function validateState(state,level) {
  if(!state||!state.player||!Array.isArray(state.crates)||!Array.isArray(state.mirrors))throw new Error('关卡状态不完整');
  const validPos=o=>Number.isInteger(o.x)&&Number.isInteger(o.z)&&cell(level,o.x,o.z)!=='#';
  if(!validPos(state.player)||!['up','down','left','right'].includes(state.player.dir))throw new Error('探险者位置无效');
  if(![0,1].includes(state.water)||![null,'up','down','left','right'].includes(state.gravity)||!Number.isInteger(state.steps)||state.steps<0)throw new Error('机关状态无效');
  if(state.crates.length!==level.crates.length||state.mirrors.length!==level.mirrors.length)throw new Error('机关数量不兼容');
  const positions=new Set();
  state.crates.forEach((c,i)=>{
    const expected=level.crates[i];
    if(c.id!==expected.id||!validPos(c)||Boolean(c.gravity)!==Boolean(expected.gravity)||Boolean(c.buoyant)!==Boolean(expected.buoyant))throw new Error('箱体状态无效');
    const pos=`${c.x},${c.z}`;if(positions.has(pos))throw new Error('箱体位置重叠');positions.add(pos);
  });
  state.mirrors.forEach((m,i)=>{const original=level.mirrors[i];if(m.id!==original.id||m.x!==original.x||m.z!==original.z||![0,1].includes(m.angle))throw new Error('镜面状态无效');});
  derive(level,state);return state;
}

export function decode(raw) {
  const envelope=JSON.parse(raw);
  if(envelope.version!==1||typeof envelope.payload!=='string'||checksum(envelope.payload)!==envelope.checksum)throw new Error('存档版本或校验不正确');
  const data=JSON.parse(envelope.payload);
  if(!Number.isInteger(data.unlocked)||data.unlocked<0||data.unlocked>17||!data.completed||typeof data.completed!=='object')throw new Error('区域进度无效');
  for(const [id,r] of Object.entries(data.completed)) {
    if(!/^\d+$/.test(id)||Number(id)>17||!['moves','hints','retries','stars'].every(k=>Number.isInteger(r[k])&&r[k]>=0))throw new Error('通关记录无效');
  }
  data.settings=normalizeSettings(data.settings);
  if(data.current) {
    const c=data.current;if(!Number.isInteger(c.level)||c.level<0||c.level>data.unlocked)throw new Error('当前关卡未解锁');
    const level=levels[c.level];validateState(c.state,level);
    c.history=Array.isArray(c.history)?c.history.slice(-80).map(s=>validateState(s,level)):[];
    c.stats={moves:0,hints:0,retries:0,...c.stats};
    if(!Object.values(c.stats).every(v=>Number.isInteger(v)&&v>=0))throw new Error('游玩统计无效');
  }
  return data;
}

export function readSave() {
  try { const raw=localStorage.getItem(SAVE_KEY);return raw?{data:decode(raw)}:{data:fresh()}; }
  catch(error) { let backup=null;try {const raw=localStorage.getItem(BACKUP_KEY);if(raw)backup=decode(raw);}catch{}return {data:fresh(),error:error.message,backup}; }
}
export function encode(data) {
  const payload=JSON.stringify(data);return JSON.stringify({version:1,checksum:checksum(payload),payload});
}
export function writeSave(data) {
  const raw=encode(data);
  try {
    const old=localStorage.getItem(SAVE_KEY);
    if(old) {try{decode(old);localStorage.setItem(BACKUP_KEY,old);}catch{}}
    localStorage.setItem(SAVE_KEY,raw);return true;
  } catch {return false;}
}
