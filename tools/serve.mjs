import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicDir=path.join(root,'dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.ico':'image/x-icon','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Bad URL');return;}
  if(pathname==='/__lostcity') {res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({game:'lost-clockwork-city',root,version:'1.0.0'}));return;}
  const requested=path.resolve(publicDir,'.'+pathname);
  if(requested!==publicDir&&!requested.startsWith(publicDir+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  const filename=pathname==='/'?path.join(publicDir,'index.html'):requested;
  fs.stat(filename,(error,stat)=>{
    if(error||!stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('找不到本地资源：'+pathname);return;}
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(filename).pipe(res);
  });
});
let port=Number(process.env.PORT)||5180;
server.on('error',error=>{if(error.code==='EADDRINUSE'&&port<5280){port++;start();}else{console.error(error);process.exit(1);}});
server.on('listening',()=>{
  const local=`http://localhost:${port}`;
  const lan=Object.values(os.networkInterfaces()).flat().filter(n=>n&&n.family==='IPv4'&&!n.internal&&!n.address.startsWith('169.254.')).map(n=>`http://${n.address}:${port}`);
  fs.writeFileSync(path.join(root,'.runtime.json'),JSON.stringify({pid:process.pid,port,local,lan},null,2));
  console.log(`失落机关城已启动\n电脑：${local}\n局域网：${lan.join('\n局域网：')||'未检测到可用地址'}`);
});
async function occupied(candidate) {
  return new Promise(resolve=>{
    const socket=net.createConnection({host:'127.0.0.1',port:candidate});let settled=false;
    const finish=value=>{if(settled)return;settled=true;socket.destroy();resolve(value);};
    socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(500,()=>finish(true));
  });
}
async function start() {
  while(port<5280&&await occupied(port))port++;
  server.listen(port,'0.0.0.0');
}
start();
