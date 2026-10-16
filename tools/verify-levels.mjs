import fs from 'node:fs';
import { levels } from '../src/levels.js';
import { solve, act, createState } from '../src/engine.js';

const solutions=[];
for(const level of levels) {
  const started=performance.now();
  const actions=solve(level);
  if(!actions)throw new Error(`${level.number} ${level.name} 无解`);
  let state=createState(level);
  for(const action of actions) {const result=act(level,state,action);if(!result.ok)throw new Error('验证序列非法');state=result.state;}
  if(!state.won)throw new Error('验证序列未完成');
  solutions.push({level:level.id,name:level.name,actions});
  console.log(`${level.number.toString().padStart(2,'0')} ${level.name}：${actions.length} 步，${Math.round(performance.now()-started)}ms`);
}
fs.mkdirSync('tests',{recursive:true});fs.writeFileSync('tests/solutions.json',JSON.stringify(solutions,null,2));
console.log('18 关合法解题序列已保存到 tests/solutions.json（不在游戏界面提供）。');
