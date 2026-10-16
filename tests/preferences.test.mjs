import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings,defaultSettings} from '../src/settings.js';
import {sampleWalk,solveLeg,HIP_HEIGHT,LEG_LENGTH} from '../src/locomotion.js';
import {fresh,encode,decode} from '../src/storage.js';
import {createState} from '../src/engine.js';
import {levels} from '../src/levels.js';

test('legacy saves acquire new preferences without losing progress or undo',()=>{
  const data=fresh();data.settings={quality:'low',music:.2,sfx:.8,muted:true,motion:false};
  data.current={level:0,state:createState(levels[0]),history:[createState(levels[0])],stats:{moves:2,hints:0,retries:0}};
  const restored=decode(encode(data));
  assert.deepEqual(restored.current,data.current);
  assert.equal(restored.settings.quality,'low');assert.equal(restored.settings.music,.2);
  assert.equal(restored.settings.controlSize,'normal');assert.equal(restored.settings.tapToMove,true);
});
test('invalid preference values stay within playable limits',()=>{
  const s=normalizeSettings({music:99,sfx:-2,brightness:NaN,cameraSensitivity:Infinity,quality:'unknown',motion:'false',controlSide:'right'});
  assert.equal(s.music,1);assert.equal(s.sfx,0);assert.equal(s.brightness,1);assert.equal(s.cameraSensitivity,1);
  assert.equal(s.quality,'high');assert.equal(s.motion,defaultSettings.motion);assert.equal(s.controlSide,'right');
  assert.deepEqual(normalizeSettings(null),defaultSettings);
});
test('exported save is compatible and corrupted payload is rejected',()=>{
  const data=fresh();data.settings.controlSize='large';assert.deepEqual(decode(encode(data)),data);
  const raw=JSON.parse(encode(data));raw.payload=raw.payload.replace('large','normal');
  assert.throws(()=>decode(JSON.stringify(raw)),/校验/);
});
test('walk has four alternating footfalls, grounded support and exact neutral endpoints',()=>{
  for(const lead of [0,1])for(const pushing of [false,true]) {
    const previous=[null,null];let maxLift=0;
    for(let i=0;i<=400;i++) {
      const walk=sampleWalk(i/400,1.2,lead,pushing);
      for(let side=0;side<2;side++) {
        const foot=walk.feet[side];maxLift=Math.max(maxLift,foot.lift);
        const pose=solveLeg(foot.z,foot.y);
        const actualZ=-LEG_LENGTH*Math.sin(pose.hip)-LEG_LENGTH*Math.sin(pose.hip+pose.knee);
        const actualY=HIP_HEIGHT-LEG_LENGTH*Math.cos(pose.hip)-LEG_LENGTH*Math.cos(pose.hip+pose.knee);
        assert.ok(Math.abs(actualZ-foot.z)<1e-6,'foot target reachable without sliding');
        assert.ok(Math.abs(actualY-foot.y)<1e-6,'foot target reachable without clipping');
        assert.ok(Math.abs(pose.hip+pose.knee+pose.ankle)<1e-10,'sole stays level');
        if(!foot.swing&&previous[side]?.stance)assert.ok(Math.abs(foot.worldZ-previous[side].z)<1e-10,'support foot fixed in world space');
        previous[side]={stance:!foot.swing,z:foot.worldZ};
      }
    }
    assert.ok(maxLift>.07);assert.equal(sampleWalk(1,1.2,lead,pushing).contacts,4);
    for(const p of [0,1])for(const foot of sampleWalk(p,1.2,lead,pushing).feet)assert.ok(Math.abs(foot.z)<1e-10);
  }
});
