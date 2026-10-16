const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=p=>p*p*(3-2*p);
export const LEG_LENGTH=.265;
export const HIP_HEIGHT=.51;
export const ANKLE_HEIGHT=.075;

// Four alternating steps cover a tile. Stance feet remain anchored in world space.
export function sampleWalk(progress,distance=1.2,lead=0,pushing=false) {
  const p=clamp(progress,0,1),travel=smooth(p),root=travel*distance;
  const phase=travel*4,step=Math.min(3,Math.floor(phase));
  const bob=Math.sin(phase*Math.PI)**2*.013;
  const targets=[.28,.56,1,1];
  const feet=[0,1].map(side=>{
    let anchor=0,height=0,swing=false;
    for(let i=0;i<4;i++) {
      if((i+lead)%2!==side)continue;
      const local=clamp(phase-i,0,1),target=targets[i]*distance;
      if(phase>=i+1)anchor=target;
      else if(phase>=i) {
        anchor+=(target-anchor)*smooth(local);
        height=Math.sin(local*Math.PI)**1.3*(pushing?.075:.105);
        swing=local>0&&local<1;break;
      }
    }
    return {z:anchor-root,y:ANKLE_HEIGHT+height-bob,worldZ:anchor,lift:height,swing};
  });
  return {root,bob,feet,contacts:Math.min(4,Math.floor(phase)),sway:Math.sin(phase*Math.PI)*.012,lean:pushing?.12:.025,step};
}

export function solveLeg(footZ,footY) {
  const dy=HIP_HEIGHT-footY,d=clamp(Math.hypot(dy,footZ),.04,LEG_LENGTH*2-.0001);
  const bend=Math.acos(clamp(d/(2*LEG_LENGTH),-1,1));
  const hip=Math.atan2(-footZ,dy)-bend,knee=bend*2;
  return {hip,knee,ankle:-hip-knee};
}
