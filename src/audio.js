export class AudioEngine {
  constructor() { this.region=0; this.index=0; this.next=0; this.active=false; this.settings={music:.35,sfx:.65,muted:false}; }
  async unlock() {
    try {
      if(this.active) {if(this.ctx.state==='suspended')await this.ctx.resume();return;}
      if(!this.ctx) {
        this.ctx=new (window.AudioContext||window.webkitAudioContext)();
        this.music=this.ctx.createGain();this.sfx=this.ctx.createGain();
        this.music.connect(this.ctx.destination);this.sfx.connect(this.ctx.destination);
      }
      if(this.ctx.state==='suspended')await this.ctx.resume();
      this.apply(this.settings);this.active=true;this.next=this.ctx.currentTime+.15;
    } catch { /* Audio is optional when a browser declines an audio context. */ }
  }
  apply(settings) {
    this.settings=settings;
    if(!this.ctx)return;
    this.music.gain.setTargetAtTime(settings.muted?0:settings.music*.24,this.ctx.currentTime,.08);
    this.sfx.gain.setTargetAtTime(settings.muted?0:settings.sfx*.3,this.ctx.currentTime,.025);
    if(this.previewGain)this.previewGain.gain.setTargetAtTime(settings.muted?0:this.previewKind==='music'?settings.music*.24:settings.sfx*.3,this.ctx.currentTime,.025);
  }
  preview(kind) {
    if(!this.ctx||this.settings.muted)return false;
    this.stopPreview();
    this.previewKind=kind;this.previewGain=this.ctx.createGain();this.previewGain.connect(this.ctx.destination);
    this.previewGain.gain.value=kind==='music'?this.settings.music*.24:this.settings.sfx*.3;
    this.previewVoices=[];const now=this.ctx.currentTime;
    const notes=kind==='music'?[[220,0,1.4,.23],[329.63,.2,1.4,.2],[440,.4,1.5,.18]]:[[150,0,.16,.18],[220,.08,.22,.12],[740,.3,.3,.18],[1109,.38,.4,.13]];
    for(const [frequency,offset,length,gain] of notes)this.previewVoices.push(this.note(frequency,now+offset,length,gain,'sine',this.previewGain));
    this.previewTimer=setTimeout(()=>this.stopPreview(),2200);return true;
  }
  stopPreview() {
    clearTimeout(this.previewTimer);for(const voice of this.previewVoices||[]){try{voice.stop();}catch{}}
    this.previewVoices=[];this.previewGain?.disconnect();this.previewGain=null;
  }
  regionTo(region) { this.region=region;this.index=0;if(this.ctx)this.next=this.ctx.currentTime+.2; }
  note(freq,start,length,gain=.3,type='sine',bus=this.music) {
    if(!this.ctx)return;
    const osc=this.ctx.createOscillator(),env=this.ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,start);
    env.gain.setValueAtTime(.0001,start);env.gain.exponentialRampToValueAtTime(Math.max(.001,gain),start+.025);
    env.gain.exponentialRampToValueAtTime(.0001,start+length);
    osc.connect(env);env.connect(bus);osc.start(start);osc.stop(start+length+.05);
    osc.onended=()=>{osc.disconnect();env.disconnect();};
    return osc;
  }
  tick(paused) {
    if(!this.ctx||!this.active)return;
    const time=this.ctx.currentTime;
    if(paused||document.hidden) { this.next=time+.3;return; }
    const sequences=[ [0,7,12,4,9,7,4,2,0,7,12,16,14,9,7,4], [0,7,14,10,5,12,17,14,7,10,14,19,17,12,10,5], [0,7,3,10,12,15,10,7,0,3,7,14,12,10,7,3] ];
    while(this.next<time+.15) {
      const base=[146.832,164.814,130.813][this.region],step=sequences[this.region][this.index%16];
      this.note(base*2**(step/12),this.next,2.4,.28,'sine');
      this.note(base*2**(step/12)*2,this.next+.012,1.4,.08,'triangle');
      if(this.index%4===0) { this.note(base/2,this.next,3.1,.26,'sine');this.note(base*1.5,this.next,2.8,.12,'sine'); }
      this.next+=this.region===2?.78:.65;this.index++;
    }
  }
  pause(paused) {
    if(!this.ctx)return;
    this.music.gain.setTargetAtTime(paused?0:this.settings.muted?0:this.settings.music*.24,this.ctx.currentTime,.12);
    if(paused)this.sfx.gain.setTargetAtTime(0,this.ctx.currentTime,.02);
    else this.apply(this.settings);
  }
  play(name) {
    if(!this.ctx||!this.active||this.settings.muted)return;
    const t=this.ctx.currentTime;
    const patterns={
      step:[[160,0,.06,.08],[240,.03,.04,.04]],push:[[90,0,.17,.16],[130,.07,.16,.08]],
      mirror:[[880,0,.17,.23],[1320,.045,.27,.1]],interact:[[440,0,.14,.16],[660,.08,.2,.12]],
      water:[[170,0,.4,.12],[220,.1,.55,.1],[330,.2,.6,.08]],gravity:[[98,0,.3,.18],[196,.09,.5,.18],[392,.19,.6,.13]],
      error:[[145,0,.13,.1],[120,.09,.16,.07]],hint:[[523,0,.14,.13],[659,.08,.22,.12]],undo:[[560,0,.1,.12],[420,.06,.15,.1]],
      reset:[[330,0,.18,.12],[440,.12,.2,.12]],door:[[150,0,.18,.15],[220,.06,.22,.1]],light:[[740,0,.3,.18],[1109,.08,.45,.13]],
      complete:[[523,0,.5,.2],[659,.14,.6,.2],[784,.28,.7,.2],[1046,.45,1.2,.18]],ending:[[262,0,2,.25],[330,.3,2,.2],[392,.6,2,.2],[523,.9,3,.25]]
    };
    for(const [f,offset,length,gain] of patterns[name]||patterns.interact)this.note(f,t+offset,length,gain,name==='push'?'triangle':'sine',this.sfx);
  }
}
