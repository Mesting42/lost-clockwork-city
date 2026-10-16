import http from 'node:http';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const runtimePath=new URL('../.runtime.json',import.meta.url),original=fs.existsSync(runtimePath)?fs.readFileSync(runtimePath):null;
const report={checks:[],started:new Date().toISOString()};let blocker,child;
try {
  for(let port=5190;port<5210;port++) {
    const candidate=http.createServer((req,res)=>res.end('unrelated-test-service'));
    const bound=await new Promise(resolve=>{candidate.once('error',()=>resolve(false));candidate.listen(port,'127.0.0.1',()=>resolve(true));});
    if(bound){blocker=candidate;report.occupiedPort=port;break;}
  }
  assert.ok(blocker,'找不到用于验证的空闲端口');
  child=spawn(process.execPath,['tools/serve.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(report.occupiedPort)},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=chunk);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('服务超时')),10000);child.stdout.on('data',()=>{if(output.includes('电脑：')){clearTimeout(timer);resolve();}});child.on('error',reject);});
  const runtime=JSON.parse(fs.readFileSync(runtimePath));report.selectedPort=runtime.port;assert.ok(runtime.port>report.occupiedPort);
  assert.equal(await(await fetch(`http://127.0.0.1:${report.occupiedPort}`)).text(),'unrelated-test-service');
  report.checks.push('Occupied port is skipped; unrelated service stays running');
  const base=`http://127.0.0.1:${runtime.port}`;
  const health=await(await fetch(base+'/__lostcity')).json();assert.equal(health.game,'lost-clockwork-city');assert.ok(health.root);
  const index=await fetch(base);assert.equal(index.status,200);assert.ok(index.headers.get('content-type').startsWith('text/html'));
  const missing=await fetch(base+'/nonexistent-asset.png');assert.equal(missing.status,404);
  const traversal=await fetch(base+'/%2e%2e%2fpackage.json');assert.equal(traversal.status,403);
  report.checks.push('Health identity, static production serving, missing resources and path confinement');report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{
  if(child&&!child.killed){child.kill();await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,1000);});}
  if(blocker)await new Promise(resolve=>blocker.close(resolve));
  if(original)fs.writeFileSync(runtimePath,original);
  report.finished=new Date().toISOString();fs.writeFileSync('artifacts/server-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
