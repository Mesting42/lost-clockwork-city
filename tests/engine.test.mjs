import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {levels} from '../src/levels.js';
import {act,createState,copy,derive,plateActive,traceLight,pathTo} from '../src/engine.js';

const solutions=JSON.parse(fs.readFileSync(new URL('./solutions.json',import.meta.url),'utf8'));
for(const entry of solutions)test(`第 ${entry.level+1} 关完整合法回放：${entry.name}`,()=>{
  const level=levels[entry.level];let state=createState(level);
  for(const action of entry.actions){const r=act(level,state,action);assert.equal(r.ok,true,JSON.stringify(action));state=r.state;}
  assert.equal(state.won,true);assert.equal(state.ready,true);assert.equal(state.steps,entry.actions.length);
});

test('有效的绕行解法不会被预设步骤顺序拒绝',()=>{
  for(const entry of solutions) {
    const level=levels[entry.level];let state=createState(level);let detour=false;
    for(const dir of ['down','up','left','right']) {
      const opposite={up:'down',down:'up',left:'right',right:'left'}[dir];
      const first=act(level,state,{type:'move',dir});if(!first.ok)continue;
      const second=act(level,first.state,{type:'move',dir:opposite});
      if(second.ok&&JSON.stringify(second.state.crates)===JSON.stringify(state.crates)) {state=second.state;detour=true;break;}
    }
    assert.ok(detour,`第 ${level.number} 关缺少验证绕行`);
    for(const action of entry.actions){const r=act(level,state,action);assert.ok(r.ok);state=r.state;}
    assert.ok(state.won);
  }
});

test('无效移动不修改输入状态，也不消耗操作',()=>{
  const l=levels[0],s=createState(l);s.player={x:1,z:1,dir:'left'};const before=copy(s);
  assert.equal(act(l,s,{type:'move',dir:'left'}).ok,false);assert.deepEqual(s,before);
});

test('压力板区分人物与箱体，离开即恢复',()=>{
  const l=levels[0],s=createState(l),plate=l.plates[0];s.player={...plate,dir:'up'};
  assert.equal(plateActive(s,plate),false);
  assert.equal(plateActive(s,{...plate,kind:'any'}),true);
  s.crates[0].x=plate.x;s.crates[0].z=plate.z;s.player={...l.start,dir:'up'};
  derive(l,s);assert.equal(s.doors.length,1);
  s.crates[0].x--;derive(l,s);assert.equal(s.doors.length,0);
});

test('门关闭时不嵌入角色或箱体，离开后关闭',()=>{
  const l=levels[0],s=createState(l),door=l.doors[0];
  s.player={...door,dir:'up'};derive(l,s);assert.ok(s.doors.includes(door.id));
  s.player={...l.start,dir:'down'};derive(l,s);assert.ok(!s.doors.includes(door.id));
  s.crates[0].x=door.x;s.crates[0].z=door.z;derive(l,s);assert.ok(s.doors.includes(door.id));
});

test('水位实际改变渠床与浮桥通行，不能隔空操作',()=>{
  const l=levels[4],s=createState(l);
  assert.equal(act(l,s,{type:'interact',id:'valve1'}).ok,false);
  s.player={x:4,z:2,dir:'right'};s.water=1;derive(l,s);
  assert.equal(act(l,s,{type:'move',dir:'right'}).ok,false);
  s.crates[0].x=5;s.crates[0].z=2;derive(l,s);
  const result=act(l,s,{type:'move',dir:'right'});assert.equal(result.ok,true);
  assert.equal(result.state.player.x,5);assert.equal(result.state.crates[0].x,5);
});

test('渠床上的角色不能升水失去支撑',()=>{
  const level=copy(levels[3]);level.controls=[{id:'valve1',type:'valve',x:3,z:3}];
  const state=createState(level);state.player={x:4,z:3,dir:'left'};derive(level,state);
  assert.equal(act(level,state,{type:'interact',id:'valve1'}).ok,false);
});

test('箱体遮挡真实光路，镜面转向后接收器真实点亮',()=>{
  const l=levels[8],s=createState(l);s.mirrors[0].angle=0;derive(l,s);assert.equal(s.received.length,0);
  s.crates[0].z=2;derive(l,s);assert.equal(s.received.length,1);
  assert.ok(s.beams.some(b=>b.x2===l.receivers[0].x&&b.z2===l.receivers[0].z));
});

test('错误能源符号不能激活接收器',()=>{
  const l=copy(levels[6]),s=createState(l);s.mirrors[0].angle=0;l.receivers[0].energy='azure';derive(l,s);assert.equal(s.received.length,0);
});

test('光束反射循环受方向访问集合约束',()=>{
  const level=copy(levels[6]);level.map=['#########','#.......#','#.......#','#.......#','#.......#','#.......#','#.......#','#.......#','#########'];
  level.sources=[{id:'source1',x:2,z:3,dir:'right',energy:'amber'}];level.receivers=[];level.doors=[];
  const state=createState(level);state.crates=[];state.mirrors=[{id:'a',x:5,z:3,angle:1},{id:'b',x:5,z:5,angle:0},{id:'c',x:1,z:5,angle:1},{id:'d',x:1,z:3,angle:0}];
  const light=traceLight(level,state);assert.ok(light.segments.length<=level.width*level.height*4);assert.ok(light.segments.length>4);
});

test('重力停止于木箱前而不穿透障碍，改变方向确定可复现',()=>{
  const l=levels[14],s=createState(l);s.crates.find(c=>!c.gravity).x=6;s.player={x:2,z:2,dir:'right'};
  const action={type:'gravity',id:'gravity1',dir:'right'};
  const a=act(l,s,action),b=act(l,s,action);assert.ok(a.ok);assert.deepEqual(a.state,b.state);
  assert.equal(a.state.crates.find(c=>c.gravity).x,5);assert.equal(a.state.ready,true);
});

test('完整状态快照可撤销水位、光路、重力、门和箱体，撤销后可建新分支',()=>{
  for(const entry of solutions) {
    const l=levels[entry.level];let s=createState(l);const history=[];
    for(const action of entry.actions) {
      const before=copy(s),r=act(l,s,action);assert.ok(r.ok);history.push(before);s=r.state;
      const restored=copy(history.at(-1));assert.deepEqual(derive(l,restored),before);
    }
    s=history.pop();assert.equal(s.won,false);
    const branch=act(l,s,entry.actions.at(-1));assert.ok(branch.ok);assert.ok(branch.state.won);
  }
});

test('点选寻路不会推动箱体或穿越未开启的门',()=>{
  const l=levels[0],s=createState(l);assert.equal(pathTo(l,s,{x:3,z:2}),null);assert.equal(pathTo(l,s,l.exit),null);
});
