import fs from 'node:fs';
import {chromium} from 'playwright';

fs.mkdirSync('public/icons',{recursive:true});
const points=[];
for(let i=0;i<16;i++)for(const [fraction,radius] of [[0,163],[.18,184],[.68,184],[.86,163]]){
  const angle=(i+fraction)/16*Math.PI*2-Math.PI/2;
  points.push(`${(256+Math.cos(angle)*radius).toFixed(2)},${(256+Math.sin(angle)*radius).toFixed(2)}`);
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="失落机关城图标">
  <defs><linearGradient id="background" x2=".7" y2="1"><stop stop-color="#315958"/><stop offset="1" stop-color="#172f34"/></linearGradient><linearGradient id="brass" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="#f1d49b"/><stop offset=".48" stop-color="#d1a769"/><stop offset="1" stop-color="#97704c"/></linearGradient><linearGradient id="core" x2=".4" y2="1"><stop stop-color="#efffe1"/><stop offset="1" stop-color="#8dcfb6"/></linearGradient></defs>
  <rect width="512" height="512" rx="112" fill="url(#background)"/>
  <rect x="18" y="18" width="476" height="476" rx="98" fill="none" stroke="#8fa894" stroke-opacity=".22" stroke-width="3"/>
  <polygon points="${points.join(' ')}" fill="#102d30" transform="translate(0 7)"/>
  <polygon points="${points.join(' ')}" fill="url(#brass)"/>
  <circle cx="256" cy="256" r="140" fill="#254746"/>
  <circle cx="256" cy="256" r="129" fill="none" stroke="#f0d299" stroke-opacity=".55" stroke-width="3"/>
  <path d="M173 350V237a83 83 0 0 1 166 0v113h-33V237a50 50 0 0 0-100 0v113Z" fill="url(#brass)"/>
  <path d="M169 338h42v20h-42zm132 0h42v20h-42Z" fill="#f1d49b"/>
  <path d="m256 211 37 54-37 53-37-53Z" fill="url(#core)"/>
  <path d="m256 211 0 107-37-53Z" fill="#d7f4cb"/>
  <path d="m256 265 37 0-37 53Z" fill="#7abfa7"/>
  <circle cx="256" cy="116" r="9" fill="#f8e3b7"/><circle cx="116" cy="256" r="7" fill="#f8e3b7"/><circle cx="396" cy="256" r="7" fill="#f8e3b7"/>
</svg>`;
fs.writeFileSync('public/icons/game-icon.svg',svg);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
for(const size of [32,48,180,192,256,512]) {
  await page.setViewportSize({width:size,height:size});
  await page.screenshot({path:`public/icons/icon-${size}.png`,omitBackground:true});
}
await browser.close();
const sizes=[32,48,256],images=sizes.map(size=>fs.readFileSync(`public/icons/icon-${size}.png`));
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
sizes.forEach((size,index)=>{
  const entry=6+index*16;header[entry]=size===256?0:size;header[entry+1]=size===256?0:size;
  header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(images[index].length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=images[index].length;
});
fs.writeFileSync('public/favicon.ico',Buffer.concat([header,...images]));
fs.writeFileSync('public/site.webmanifest',JSON.stringify({id:'/',name:'失落机关城',short_name:'机关城',lang:'zh-CN',start_url:'/',scope:'/',display:'standalone',orientation:'landscape',theme_color:'#182b2d',background_color:'#182b2d',icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]},null,2));
console.log('本地图标已生成：SVG、32/48/180/192/256/512 PNG、三尺寸 ICO 和横屏 manifest。');
