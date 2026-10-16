import fs from 'node:fs';
import * as THREE from 'three';
import {World} from '../src/scene.js';

// Original models are exported as native Three.js JSON for reuse without network access.
const factory=Object.create(World.prototype);
factory.m={
  gold:factory.mat('#d9b57a',{metalness:.55,roughness:.35}),
  copper:factory.mat('#b7774d',{metalness:.6,roughness:.38}),
  dark:factory.mat('#294c48'),wood:factory.mat('#826e50'),blue:factory.mat('#638484'),
  glow:factory.mat('#c5f5c8',{emissive:'#c5f5c8',emissiveIntensity:.9}),stone2:factory.mat('#71867e')
};
fs.mkdirSync('public/models',{recursive:true});
const models={explorer:factory.makeRobot(),mechanismCrate:factory.makeCrate({}),floatingCrate:factory.makeCrate({buoyant:true}),gravityCrate:factory.makeCrate({gravity:true})};
for(const [name,model] of Object.entries(models)) {
  model.name=name;
  model.traverse(object=>{if(object.geometry?.type==='RoundedBoxGeometry')object.geometry=new THREE.BufferGeometry().copy(object.geometry);});
  const json=model.toJSON();
  new THREE.ObjectLoader().parse(json);
  fs.writeFileSync(`public/models/${name}.json`,JSON.stringify(json));
  console.log(`本地模型已导出并重新解析：${name}`);
}
