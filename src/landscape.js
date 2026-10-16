import { icon } from './icons.js';

// Screen orientation is a capability request. Only an actual landscape viewport releases the gate.
export class LandscapeController {
  constructor(onChange) {
    this.onChange=onChange;this.blocked=false;this.busy=false;this.message='';
    this.layer=document.createElement('div');this.layer.id='landscape-layer';document.body.append(this.layer);
    this.layer.addEventListener('click',event=>{if(event.target.closest('[data-landscape-start]'))this.requestLandscape();});
    this.update=this.update.bind(this);
    window.addEventListener('resize',this.update);window.addEventListener('orientationchange',this.update);
    globalThis.screen.orientation?.addEventListener('change',this.update);
    document.addEventListener('fullscreenchange',this.update);document.addEventListener('webkitfullscreenchange',this.update);
    this.update();
  }
  isTouchDevice() {
    const mobileUA=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    return matchMedia('(pointer: coarse)').matches || mobileUA || Boolean(navigator.userAgentData?.mobile);
  }
  update() {
    this.touch=this.isTouchDevice();const blocked=this.touch&&window.innerHeight>window.innerWidth;
    document.body.dataset.touch=String(this.touch);
    if(blocked!==this.blocked) {
      this.blocked=blocked;document.querySelector('#app').inert=blocked;
      document.querySelector('#world').style.pointerEvents=blocked?'none':'';
      if(blocked)this.previousFocus=document.activeElement;
      this.onChange?.(blocked);
      this.render();
      if(blocked)requestAnimationFrame(()=>this.layer.querySelector('button')?.focus({preventScroll:true}));
      else if(this.previousFocus?.isConnected)this.previousFocus.focus({preventScroll:true});
    } else this.render();
  }
  render() {
    this.layer.hidden=!this.blocked;if(!this.blocked){this.layer.innerHTML='';return;}
    const existing=this.layer.querySelector('.landscape-panel');
    if(existing) {
      const button=existing.querySelector('button');button.disabled=this.busy;button.querySelector('span').textContent=this.busy?'正在切换…':'横屏游玩';
      existing.querySelector('[role=status]').textContent=this.message;return;
    }
    this.layer.innerHTML=`<section class="landscape-panel" role="dialog" aria-modal="true" aria-labelledby="landscape-title" aria-describedby="landscape-description">
      <img class="landscape-emblem" src="/icons/game-icon.svg" alt="" width="64" height="64">
      <div class="rotate-device" aria-hidden="true">${icon('landscape')}</div>
      <h1 id="landscape-title">请横屏游玩</h1><p id="landscape-description">把屏幕横过来，<br>让整座机关城在眼前展开。</p>
      <button class="btn primary" data-landscape-start ${this.busy?'disabled':''}>${icon('fullscreen')}<span>${this.busy?'正在切换…':'横屏游玩'}</span></button>
      <p class="landscape-status" role="status" aria-live="polite">${this.message}</p>
      <p class="landscape-note">竖屏时游戏已暂停。旋转后会继续当前旅程。</p>
    </section>`;
  }
  async requestLandscape() {
    if(this.busy)return;this.busy=true;this.message='正在尝试全屏和横屏…';this.render();
    const root=document.documentElement;
    const fullscreen=root.requestFullscreen||root.webkitRequestFullscreen;
    const attempt=async task=>{
      let timer;try {await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),2500);})]);return true;}
      catch{return false;}finally{clearTimeout(timer);}
    };
    try {
      if(fullscreen&&!document.fullscreenElement&&!document.webkitFullscreenElement)await attempt(Promise.resolve(fullscreen.call(root)));
      if(typeof globalThis.screen.orientation?.lock==='function')await attempt(globalThis.screen.orientation.lock('landscape'));
    } catch { /* Some mobile browsers throw synchronously rather than rejecting the capability request. */ }
    finally {
      this.busy=false;
      this.message=window.innerHeight>window.innerWidth?'请手动将设备横过来；若没有旋转，请开启设备的自动旋转功能。':'';
      this.update();
    }
  }
}
