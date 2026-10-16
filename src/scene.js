import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { regions } from './levels.js';
import { cell } from './engine.js';
import {sampleWalk,solveLeg,LEG_LENGTH,HIP_HEIGHT} from './locomotion.js';

const S = 1.2;
const palettes = [
  { stone: '#7f9188', stone2: '#71867e', dark: '#294c48', metal: '#b7774d', gold: '#d9b57a', green: '#648d64', water: '#358f98', light: '#c5f5c8', fog: '#254447' },
  { stone: '#76919b', stone2: '#627e8c', dark: '#284250', metal: '#7d9fa9', gold: '#d0c0a0', green: '#718a8b', water: '#397da0', light: '#9ee8ed', fog: '#233d50' },
  { stone: '#686981', stone2: '#54566f', dark: '#30334e', metal: '#a398b8', gold: '#bca78b', green: '#78819b', water: '#656fa9', light: '#d2b7f8', fog: '#282b46' }
];
const rand = (x, z, salt = 0) => { const n = Math.sin(x * 127.1 + z * 311.7 + salt * 57.3) * 43758.5453; return n - Math.floor(n); };

export class World {
  constructor(canvas, onPick) {
    this.canvas = canvas; this.onPick = onPick; this.settings = { quality: 'high', motion: true }; this.time = 0;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-10, 10, 8, -8, .1, 120);
    this.target = new THREE.Vector3(); this.pan = new THREE.Vector2(); this.zoom = 1; this.angle = Math.PI / 4;
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.pointers = new Map();
    this.scene.add(new THREE.HemisphereLight('#e3f2e2', '#355563', 2.5));
    this.sun = new THREE.DirectionalLight('#ffe2ba', 3.4); this.sun.position.set(-7, 18, 7); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: .1, far: 55 });
    this.sun.shadow.bias = -.0008; this.sun.shadow.normalBias = .025; this.scene.add(this.sun);
    this.fill = new THREE.DirectionalLight('#8fd2dc', 1.5); this.fill.position.set(8, 5, -10); this.scene.add(this.fill);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.bindPointer(); this.resize(); window.addEventListener('resize', () => this.resize());
  }

  mat(color, options = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .12, ...options }); }
  mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  box(parent, w, h, d, material, x = 0, y = 0, z = 0, radius = .045) {
    return this.mesh(radius ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w,h,d), material, parent, x,y,z);
  }
  cylinder(parent, r, h, material, x = 0, y = 0, z = 0, r2 = r, segments = 16) { return this.mesh(new THREE.CylinderGeometry(r, r2, h, segments), material, parent, x, y, z); }
  sphere(parent, r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = this.mesh(new THREE.SphereGeometry(r, 20, 14), material, parent, x,y,z); m.scale.set(sx, sy, sz); return m;
  }
  torus(parent, r, tube, material, x = 0, y = 0, z = 0) { return this.mesh(new THREE.TorusGeometry(r, tube, 8, 32), material, parent, x,y,z); }
  gear(parent, r, material, x = 0, y = 0, z = 0, teeth = 12) {
    const g = new THREE.Group(); g.position.set(x,y,z); parent.add(g);
    const ring = this.torus(g, r * .74, r * .16, material); ring.rotation.x = Math.PI / 2;
    this.cylinder(g, r * .25, .14, material);
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * Math.PI * 2;
      const m = this.box(g, r * .27, .16, r * .23, material, Math.cos(a) * r * .92, 0, Math.sin(a) * r * .92, .018); m.rotation.y = -a;
    }
    for (let i = 0; i < 4; i++) { const m = this.box(g, r * 1.35, .09, r * .12, material, 0,0,0,.01); m.rotation.y = Math.PI / 4 * i; }
    return g;
  }

  clear() {
    this.transition = null;
    const geometries = new Set(), materials = new Set();
    this.root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>materials.add(m)); });
    geometries.forEach(g=>g.dispose()); materials.forEach(m=>{ m.map?.dispose(); m.dispose(); }); this.root.clear();
  }

  coords(x, z) { return new THREE.Vector3((x - (this.level.width - 1) / 2) * S, 0, (z - (this.level.height - 1) / 2) * S); }
  place(group, o, y = 0) { group.position.copy(this.coords(o.x, o.z)); group.position.y = y; return group; }

  load(level, state, menu = false) {
    this.clear(); this.level = level; this.state = state; this.menu = menu; this.p = palettes[level.region]; this.pan.set(0,0); this.zoom = 1; this.angle = Math.PI / 4; this.sun.intensity=3.4;this.restart=null;
    this.m = { stone: this.mat(this.p.stone), stone2: this.mat(this.p.stone2), dark: this.mat(this.p.dark), copper: this.mat(this.p.metal, { metalness: .6, roughness: .38 }), gold: this.mat(this.p.gold, { metalness: .55, roughness: .35 }), moss: this.mat(this.p.green), wood: this.mat('#826e50'), blue: this.mat('#638484'), glow: this.mat(this.p.light, { emissive: this.p.light, emissiveIntensity: .9, roughness: .35 }), off: this.mat('#5a6c65'), water: this.mat(this.p.water, { transparent: true, opacity: .7, metalness: .25, roughness: .25 }) };
    this.objects = new Map(); this.tiles = []; this.water = []; this.floaters = []; this.gears = []; this.mirrorMeshes = new Map(); this.gateMeshes = new Map(); this.crateMeshes = new Map(); this.plateMeshes = new Map(); this.receiverMeshes = new Map(); this.pickables = [];this.gravityArrows=[];this.connections=[];
    document.body.dataset.region = String(level.region);
    this.scene.fog = new THREE.FogExp2(this.p.fog, .016);
    const w = (level.width - 1) * S, d = (level.height - 1) * S;
    const base = new THREE.Group(); this.root.add(base);
    this.box(base, w + .7, .65, d + .7, this.m.dark, 0,-.72,0,.12);
    this.box(base, w + .85, .18, d + .85, this.m.copper, 0,-.95,0,.035);
    this.box(base, w + .6, .28, d + .6, this.m.stone2, 0,-1.14,0,.055);
    this.box(base, w + .9, .12, d + .9, this.m.gold, 0,-1.31,0,.025);
    this.box(base, w + .2, .8, d + .2, this.m.dark, 0,-1.72,0,.08);
    // Brick courses and rivets around the exposed diorama plinth.
    for (let i = 0; i < level.width; i++) {
      const x = (i - (level.width - 1) / 2) * S;
      this.box(base, S - .045, .3, .22, i%2 ? this.m.stone : this.m.stone2,x,-.67,d/2+.28,.025);
      this.sphere(base,.045,this.m.gold,x,-.97,d/2+.43);
      if (i % 3 === 0) {
        this.cylinder(base,.09,.9,this.m.copper,x,-1.75,d/2-.05);
        const bend = this.torus(base,.2,.09,this.m.copper,x,-2.12,d/2-.25); bend.rotation.y=Math.PI/2;
      }
    }
    for (let z = 0; z < level.height; z++) {
      for (let x = 0; x < level.width; x++) {
        const c = cell(level,x,z), pos = this.coords(x,z), tile = new THREE.Group(); tile.position.copy(pos); this.root.add(tile);
        if (c === '~' || c === 'b') {
          this.box(tile, S-.025,.18,S-.025,this.m.dark,0,-.44,0);
          const water = this.box(tile, S-.03,.035,S-.03,this.m.water,0,-.15,0,.012); this.water.push(water);
          if (c === 'b') {
            const floater = this.makeCrate({ buoyant: true, platform: true }); tile.add(floater); floater.scale.set(1.12,.3,1.12); this.floaters.push(floater);
          }
        } else {
          this.box(tile,S-.018,.25,S-.018,(x+z)%3 ? this.m.stone:this.m.stone2,0,-.17,0,.04);
          if (c !== '#' && rand(x,z,4) > .4) {
            const slab = this.box(tile,S-.12,.025,S-.12,this.m.stone2,0,-.027,0,.035); slab.material = slab.material.clone(); slab.material.color.offsetHSL(0,0,rand(x,z)*.045);
          }
          if (c === '#') this.makeWall(tile,x,z);
        }
        if (c !== '#') {
          const picker = this.mesh(new THREE.PlaneGeometry(S,S), new THREE.MeshBasicMaterial({ visible: false }), tile,0,.04,0); picker.rotation.x=-Math.PI/2; picker.userData={tile:{x,z}}; this.pickables.push(picker);
          this.tiles.push(tile);
        }
      }
    }
    this.makePipes();
    for (const track of level.track) {
      const g = new THREE.Group(); this.place(g,track,.014); this.root.add(g);
      for (const side of [-1,1]) this.box(g,.055,.028,.89,this.m.copper,side*.32,0,0,.01);
      for (const a of [-.25,0,.25]) this.box(g,.7,.025,.055,this.m.dark,0,-.005,a,.01);
      const glow = this.box(g,.08,.035,.13,this.m.glow,0,.002,0,.01); glow.castShadow=false;
    }
    for (const plate of level.plates) {
      const g = new THREE.Group(); this.place(g,plate,.04); this.root.add(g);
      this.cylinder(g,.4,.09,this.m.copper);
      const pad=this.cylinder(g,.3,.04,this.m.off,0,.065,0); this.plateMeshes.set(plate.id,pad);
      const ring=this.torus(g,.34,.022,this.m.gold,0,.06,0); ring.rotation.x=Math.PI/2;
      for (const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]) this.sphere(g,.032,this.m.gold,Math.cos(a)*.35,.075,Math.sin(a)*.35);
    }
    for (const crate of state.crates) {
      const g=this.makeCrate(crate); this.place(g,crate,.05); this.root.add(g); this.crateMeshes.set(crate.id,g); this.setObject(g,{...crate,type:'crate'});
    }
    for (const door of level.doors) {
      const g=new THREE.Group(); this.place(g,door); this.root.add(g);
      for(const side of [-1,1]) { this.box(g,.18,1.5,.38,this.m.stone2,side*.49,.7,0,.035); this.box(g,.22,.12,.45,this.m.gold,side*.49,.1,0); this.sphere(g,.07,this.m.glow,side*.49,1.3,.22); }
      this.box(g,1.2,.21,.46,this.m.copper,0,1.46,0); this.gears.push(this.gear(g,.22,this.m.gold,0,1.61,0,10));
      const gate=new THREE.Group(); g.add(gate);
      for(const x of [-.32,-.16,0,.16,.32]) this.box(gate,.085,1.18,.13,this.m.copper,x,.63,0,.02);
      this.box(gate,.85,.14,.19,this.m.gold,0,.16,0); this.box(gate,.85,.14,.19,this.m.gold,0,1.18,0);
      this.gateMeshes.set(door.id,gate);
      this.setObject(g,{...door,type:'door'});
    }
    for(const control of level.controls) {
      const g=new THREE.Group(); this.place(g,control); this.root.add(g);
      this.cylinder(g,.3,.3,this.m.stone2,0,.15,0);
      this.cylinder(g,.19,.42,this.m.copper,0,.43,0);
      if(control.type==='valve') {
        const ring=this.torus(g,.32,.045,this.m.gold,0,.72,0); ring.rotation.x=-Math.PI/3;
        for(let i=0;i<3;i++) { const spoke=this.box(g,.6,.045,.045,this.m.copper,0,.72,0,.01); spoke.rotation.y=i*Math.PI/3; spoke.rotation.x=-Math.PI/3; }
        this.sphere(g,.085,this.m.glow,0,.78,0); this.box(g,.08,.4,.12,this.m.gold,.33,.32,0);
      } else {
        const dial=this.cylinder(g,.38,.1,this.m.dark,0,.62,0); dial.rotation.x=.25;
        const ring=this.torus(g,.34,.035,this.m.gold,0,.7,0); ring.rotation.x=Math.PI/2;
        for(let i=0;i<4;i++) { const a=i*Math.PI/2; const arrow=this.mesh(new THREE.ConeGeometry(.08,.17,3),this.m.glow,g,Math.sin(a)*.24,.75,Math.cos(a)*.24); arrow.rotation.z=Math.PI/2; arrow.rotation.y=a; }
        const gem=this.mesh(new THREE.OctahedronGeometry(.12),this.m.glow,g,0,.8,0); this.gravityGem=gem;
        const arrow=new THREE.Group();g.add(arrow);arrow.position.y=.78;
        this.box(arrow,.05,.035,.19,this.m.gold,0,0,.14,.01);
        const tip=this.mesh(new THREE.ConeGeometry(.07,.13,3),this.m.glow,arrow,0,0,.26);tip.rotation.x=Math.PI/2;
        this.gravityArrows.push(arrow);
      }
      this.setObject(g,control);
    }
    for(const mirror of state.mirrors) {
      const g=new THREE.Group(); this.place(g,mirror); this.root.add(g);
      this.cylinder(g,.29,.12,this.m.copper,0,.1,0); this.cylinder(g,.08,.48,this.m.gold,0,.38,0);
      const pivot=new THREE.Group(); pivot.position.y=.77; g.add(pivot);
      this.box(pivot,.79,.62,.12,this.m.gold);
      this.box(pivot,.65,.48,.145,this.mat('#d8f2ef',{metalness:.9,roughness:.16,emissive:'#3b6b76',emissiveIntensity:.23}));
      this.sphere(pivot,.045,this.m.copper,-.34,.25,.08); this.sphere(pivot,.045,this.m.copper,.34,-.25,.08);
      this.mirrorMeshes.set(mirror.id,pivot); this.setObject(g,{...mirror,type:'mirror'});
      // Top-down diagonal direction mark exactly matches logical slash / backslash.
      const arrow=this.box(g,.67,.028,.045,this.m.glow,0,.175,0,.01); arrow.rotation.y=mirror.angle===0?Math.PI/4:-Math.PI/4;
      g.userData.orientationMark=arrow;
    }
    for(const source of level.sources) {
      const g=this.makeEmitter(source,false); this.place(g,source); this.root.add(g); this.setObject(g,{...source,type:'source'});
    }
    for(const receiver of level.receivers) {
      const g=this.makeEmitter(receiver,true); this.place(g,receiver); this.root.add(g); this.receiverMeshes.set(receiver.id,g.userData.crystal); this.setObject(g,{...receiver,type:'receiver'});
    }
    this.exit=new THREE.Group(); this.place(this.exit,level.exit,.025); this.root.add(this.exit);
    this.cylinder(this.exit,.43,.1,this.m.copper,0,.05,0);
    this.exitRing=this.torus(this.exit,.36,.045,this.m.off,0,.13,0); this.exitRing.rotation.x=Math.PI/2;
    this.exitCrystal=this.mesh(new THREE.OctahedronGeometry(.17),this.m.glow,this.exit,0,.48,0); this.exitCrystal.material=this.exitCrystal.material.clone();
    this.setObject(this.exit,{...level.exit,id:'exit',type:'exit'});
    this.robot=this.makeRobot(); this.root.add(this.robot); this.place(this.robot,state.player,.03);
    this.selection=new THREE.Group(); this.root.add(this.selection);
    const ring=this.torus(this.selection,.49,.028,this.m.glow,0,.055,0); ring.rotation.x=Math.PI/2; this.selection.visible=false;
    this.beamRoot=new THREE.Group(); this.root.add(this.beamRoot);
    this.makeParticles(); this.makeControlLinks(); this.sync(state,true); this.batchStatic(); this.resize();
  }

  setObject(group, object) {
    group.userData.object=object; this.objects.set(object.id,group);
    group.traverse(o=>{ if(o.isMesh) { o.userData.object=object; this.pickables.push(o); } });
  }

  makeWall(tile,x,z) {
    const edge=x===0||z===0||x===this.level.width-1||z===this.level.height-1;
    const height=edge ? .26 : .68;
    this.box(tile,S-.04,height,S-.04,this.m.stone2,0,height/2-.025,0,.07);
    this.box(tile,S+.005,.09,S+.005,this.m.stone,0,height+.01,0,.035);
    if(!edge) {
      this.box(tile,S-.1,.032,.045,this.m.copper,0,height+.075,0,.01);
      this.box(tile,.045,.032,S-.1,this.m.copper,0,height+.075,0,.01);
    }
    const r=rand(x,z);
    if(edge && r>.45) this.plant(tile,0,height+.05,0,.6+r*.45);
    if(!edge && r>.7) this.plant(tile,.28,height+.05,-.25,.5);
    if(edge && r>.84) {
      this.cylinder(tile,.18,.8,this.m.stone,0,height+.4,0,.21);
      this.cylinder(tile,.24,.13,this.m.gold,0,height+.85,0);
      const dome=this.sphere(tile,.18,this.m.glow,0,height+.96,0,1,.8,1); dome.castShadow=false;
    }
    if(edge && r<.1) {
      this.cylinder(tile,.2,.8,this.m.stone2,0,height+.4,0,.28); this.box(tile,.55,.11,.55,this.m.stone,0,height+.81,0);
    }
  }

  plant(parent,x,y,z,scale=1) {
    const plant=new THREE.Group(); plant.position.set(x,y,z); plant.scale.setScalar(scale); parent.add(plant);
    for(let i=0;i<5;i++) {
      const a=i*2.4;
      const leaf=this.sphere(plant,.2,this.m.moss,Math.sin(a)*.13,.16+Math.cos(i)*.045,Math.cos(a)*.13,.55,1.6,.28); leaf.rotation.z=Math.sin(a)*.7; leaf.rotation.x=Math.cos(a)*.7;
    }
  }

  makeCrate(crate) {
    const g=new THREE.Group(), material=crate.gravity?this.m.dark:this.m.wood;
    this.box(g,.8,.66,.8,material,0,.33,0,.07);
    for(const x of [-.28,0,.28]) this.box(g,.018,.52,.825,this.m.dark,x,.33,0,.008);
    for(const z of [-.28,0,.28]) this.box(g,.825,.52,.018,this.m.dark,0,.33,z,.008);
    for(const y of [.1,.57]) {
      this.box(g,.87,.075,.87,crate.gravity?this.m.copper:this.m.gold,0,y,0,.025);
      for(const x of [-.38,.38]) for(const z of [-.38,.38]) this.sphere(g,.033,this.m.copper,x,y+.04,z);
    }
    if(crate.gravity) {
      const gem=this.mesh(new THREE.OctahedronGeometry(.17),this.m.glow,g,0,.71,0); gem.scale.y=.7;
      for(const z of [-.42,.42]) this.box(g,.2,.2,.03,this.m.glow,0,.34,z,.025);
    } else if(crate.buoyant) {
      for(const z of [-.43,.43]) this.cylinder(g,.1,.76,this.m.copper,0,.18,z).rotation.z=Math.PI/2;
      this.box(g,.3,.025,.3,this.m.blue,0,.68,0,.015);
    } else {
      for(const z of [-.42,.42]) this.box(g,.24,.06,.065,this.m.copper,0,.4,z,.018);
      this.box(g,.15,.025,.24,this.m.gold,0,.68,0,.02);
    }
    return g;
  }

  makeEmitter(o,receiver) {
    const g=new THREE.Group(); this.cylinder(g,.29,.15,this.m.copper,0,.1,0);
    this.cylinder(g,.16,.56,this.m.stone2,0,.42,0);
    const energy=o.energy==='azure'?'#8be8ec':'#ffe3a5';
    const material=this.mat(energy,{emissive:energy,emissiveIntensity:receiver?.08:1.6,metalness:.3,roughness:.2});
    const crystal=this.mesh(o.energy==='azure'?new THREE.ConeGeometry(.22,.38,3):new THREE.OctahedronGeometry(.23),material,g,0,.88,0);
    crystal.rotation.y=Math.PI/4; g.userData.crystal=crystal;
    const ring=this.torus(g,.32,.037,this.m.gold,0,.8,0); ring.rotation.x=Math.PI/2;
    if(!receiver) {
      const nozzle=this.cylinder(g,.13,.3,this.m.gold,0,.78,0); nozzle.rotation.z=Math.PI/2;
      const a={right:0,down:-Math.PI/2,left:Math.PI,up:Math.PI/2}[o.dir]; g.rotation.y=a;
      this.sphere(g,.09,material,.29,.78,0);
    }
    return g;
  }

  makeRobot() {
    const g=new THREE.Group();
    const enamel=this.mat('#d8cda5',{roughness:.48,metalness:.28}), brass=this.m.gold, rubber=this.mat('#304645'), eyes=this.mat('#c4f4ce',{emissive:'#c4f4ce',emissiveIntensity:1.7});
    const body=new THREE.Group(); body.position.y=.18;g.add(body); g.userData.body=body;
    this.sphere(body,.28,enamel,0,.56,0,1,1.12,.85);
    this.cylinder(body,.25,.08,brass,0,.39,0);
    this.box(body,.19,.17,.04,rubber,0,.61,.245,.028);
    this.sphere(body,.046,eyes,0,.64,.269);
    this.cylinder(body,.085,.12,brass,0,.86,0);
    const head=new THREE.Group(); head.position.y=.99; body.add(head); g.userData.head=head;
    this.sphere(head,.31,enamel,0,0,0,1,.77,.92);
    this.box(head,.49,.19,.07,rubber,0,-.015,.246,.07);
    for(const x of [-.12,.12]) { this.sphere(head,.057,eyes,x,-.01,.29,1,1.15,.45); this.sphere(head,.068,brass,x*.0 + Math.sign(x)*.32,-.01,0); }
    const hat=this.sphere(head,.325,this.m.copper,0,.12,-.025,1,.53,1); hat.rotation.z=-.12;
    this.torus(head,.31,.025,brass,0,.095,0).rotation.x=Math.PI/2;
    this.cylinder(head,.025,.17,brass,.16,.29,-.07); this.sphere(head,.045,eyes,.16,.38,-.07);
    this.box(body,.36,.4,.19,this.m.copper,0,.62,-.28,.055);
    this.cylinder(body,.085,.4,brass,.2,.63,-.3); this.cylinder(body,.085,.4,brass,-.2,.63,-.3);
    this.sphere(body,.075,eyes,0,.81,-.35);
    const arms=[],legs=[];
    for(const side of [-1,1]) {
      const arm=new THREE.Group(); arm.position.set(side*.32,.75,0); body.add(arm);
      this.sphere(arm,.075,brass); this.cylinder(arm,.062,.27,enamel,0,-.14,0);
      this.sphere(arm,.07,rubber,0,-.28,0); this.cylinder(arm,.057,.2,brass,0,-.39,0);
      this.sphere(arm,.075,enamel,0,-.5,0,1,.8,1); arm.rotation.z=side*.13; arms.push(arm);
      const hip=new THREE.Group();hip.position.set(side*.14,HIP_HEIGHT,0);g.add(hip);
      this.sphere(hip,.073,rubber);this.cylinder(hip,.059,LEG_LENGTH,brass,0,-LEG_LENGTH/2,0);
      const knee=new THREE.Group();knee.position.y=-LEG_LENGTH;hip.add(knee);
      this.sphere(knee,.075,brass);this.cylinder(knee,.054,LEG_LENGTH,enamel,0,-LEG_LENGTH/2,0);
      this.box(knee,.05,.13,.065,rubber,side*.044,-LEG_LENGTH/2,.045,.012);
      const ankle=new THREE.Group();ankle.position.y=-LEG_LENGTH;knee.add(ankle);
      this.sphere(ankle,.057,rubber);
      this.box(ankle,.18,.13,.28,enamel,0,0,.045,.035);
      this.box(ankle,.19,.025,.29,rubber,0,-.064,.045,.012);
      this.box(ankle,.16,.05,.07,brass,0,.025,.166,.015);
      legs.push({hip,knee,ankle});
    }
    // The explorer carries a miniature wrench beside the backpack.
    this.box(body,.04,.42,.04,brass,.28,.58,-.2,.01);
    this.torus(body,.062,.025,brass,.28,.81,-.2);
    g.userData.arms=arms; g.userData.legs=legs;g.userData.lead=0;
    for(const leg of legs){const pose=solveLeg(0,.075);leg.hip.rotation.x=pose.hip;leg.knee.rotation.x=pose.knee;leg.ankle.rotation.x=pose.ankle;}
    return g;
  }

  makePipes() {
    const w=(this.level.width-1)*S/2,d=(this.level.height-1)*S/2;
    for(const x of [-w+.4,w-.4]) {
      const pipe=this.cylinder(this.root,.08,d*1.8,this.m.copper,x,-.35,0); pipe.rotation.x=Math.PI/2;
      for(let z=-d+.6;z<d;z+=1.8) { const collar=this.torus(this.root,.1,.035,this.m.gold,x,-.35,z); }
    }
    const wheel=new THREE.Group(); wheel.position.set(w+.27,-.1,-.4); wheel.rotation.z=Math.PI/2; this.root.add(wheel);
    this.gears.push(this.gear(wheel,.9,this.m.copper,0,0,0,16));
    this.cylinder(wheel,.17,.75,this.m.gold);
    this.cylinder(this.root,.13,1.2,this.m.copper,w+.25,-1.1,-.4);
    if(this.menu) {
      // An old tower, brass chimney and a windmill are part of the menu diorama.
      const tower=new THREE.Group(); tower.position.set(-w+.3,.4,-d+.3); this.root.add(tower);
      this.cylinder(tower,.65,1.8,this.m.stone2,0,.9,0,.76);
      this.cylinder(tower,.79,.16,this.m.gold,0,1.8,0);
      this.mesh(new THREE.ConeGeometry(.95,.9,6),this.m.copper,tower,0,2.35,0);
      for(const x of [-.3,.3]) this.box(tower,.2,.45,.1,this.m.glow,x,1.05,.62,.04);
      const windmill=new THREE.Group(); windmill.position.set(0,1.8,.75); tower.add(windmill);
      for(let i=0;i<4;i++) { const arm=this.box(windmill,.12,.9,.08,this.m.gold,0,.45,0,.025); arm.rotation.z=i*Math.PI/2; arm.position.set(Math.sin(i*Math.PI/2)*.45,Math.cos(i*Math.PI/2)*.45,0); }
      this.windmill=windmill;
    } else this.windmill=null;
  }

  makeParticles() {
    const count=75, points=new Float32Array(count*3);
    for(let i=0;i<count;i++) { points[i*3]=(rand(i,1)-.5)*this.level.width*S; points[i*3+1]=rand(i,2)*4+.3; points[i*3+2]=(rand(i,3)-.5)*this.level.height*S; }
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
    this.particles=new THREE.Points(geometry,new THREE.PointsMaterial({color:this.p.light,size:.028,transparent:true,opacity:.45,depthWrite:false})); this.root.add(this.particles);
  }

  drawBeams(state) {
    this.beamRoot.traverse(o=>{ o.geometry?.dispose(); o.material?.dispose(); }); this.beamRoot.clear();
    for(const b of state.beams) {
      const a=this.coords(b.x1,b.z1), c=this.coords(b.x2,b.z2); a.y=.78; c.y=.78;
      const diff=c.clone().sub(a), length=diff.length(); if(length<.01) continue;
      const color=b.energy==='azure'?'#78e7f1':'#ffe1a0';
      for(const [radius,opacity] of [[.023,.95],[.075,.14]]) {
        const m=this.mesh(new THREE.CylinderGeometry(radius,radius,length,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false}),this.beamRoot);
        m.position.copy(a).add(c).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize()); m.castShadow=false;
      }
      this.sphere(this.beamRoot,.05,this.mat(color,{emissive:color,emissiveIntensity:2}),c.x,c.y,c.z);
    }
  }

  values(state) {
    const values=[];
    const pos=this.coords(state.player.x,state.player.z);
    pos.y=this.heightAt(state,state.player)+.03;
    values.push({object:this.robot,pos,rotation:{up:Math.PI,right:Math.PI/2,down:0,left:-Math.PI/2}[state.player.dir]});
    for(const c of state.crates) { const p=this.coords(c.x,c.z); p.y=cell(this.level,c.x,c.z)==='~'?(state.water?.035:-.32):.05; values.push({object:this.crateMeshes.get(c.id),pos:p}); }
    for(const [id,g] of this.gateMeshes) { const p=g.position.clone(); p.y=state.doors.includes(id)?1.28:0; values.push({object:g,pos:p}); }
    for(const m of state.mirrors) values.push({object:this.mirrorMeshes.get(m.id),rotation:m.angle===0?Math.PI/4:-Math.PI/4});
    for(const water of this.water) { const p=water.position.clone(); p.y=state.water?-.05:-.35; values.push({object:water,pos:p}); }
    for(const floater of this.floaters) { const p=floater.position.clone(); p.y=state.water?-.09:-.49; values.push({object:floater,pos:p}); }
    return values;
  }
  heightAt(state,p) { if(cell(this.level,p.x,p.z)==='~') return state.water?.68:-.28; if(cell(this.level,p.x,p.z)==='b') return .17; return 0; }

  sync(state,instant=false,sound='step') {
    this.state=state;
    // Keep the current rendered position when a new direction interrupts a
    // walk, discard only the old pose, then interpolate from that point.
    if(!instant&&this.transition){this.transition=null;this.resetPose();}
    const values=this.values(state);
    for(const v of values) { v.from=v.object.position.clone(); v.fromRot=v.object.rotation.y; }
    if(instant) {
      for(const v of values) { if(v.pos) v.object.position.copy(v.pos); if(v.rotation!==undefined)v.object.rotation.y=v.rotation; }
      this.resetPose();
      this.transition=null;
    } else {
      const walking=sound==='step'||sound==='push',robot=values[0];
      const delta=Math.atan2(Math.sin(robot.rotation-robot.fromRot),Math.cos(robot.rotation-robot.fromRot));
      const turn=walking?Math.abs(delta)/Math.PI*.18:0;
      const duration=walking?(sound==='push'?.86:.68):this.settings.motion?(sound==='gravity'?.62:sound==='water'?.7:.32):.12;
      this.transition={values,time:0,duration:duration+turn,travelDuration:duration,turn,sound,walking,lead:this.robot.userData.lead,contacts:0};
      if(walking)this.robot.userData.lead=1-this.robot.userData.lead;
    }
    for(const [id,m] of this.plateMeshes) { const active=state.plates.includes(id); m.material=active?this.m.glow:this.m.off; m.position.y=active?.037:.065; }
    for(const [id,m] of this.receiverMeshes) m.material.emissiveIntensity=state.received.includes(id)?2:.08;
    for(const mirror of state.mirrors) { const mark=this.objects.get(mirror.id)?.userData.orientationMark; if(mark)mark.rotation.y=mirror.angle===0?Math.PI/4:-Math.PI/4; }
    for(const arrow of this.gravityArrows){arrow.visible=Boolean(state.gravity);arrow.rotation.y={up:Math.PI,right:Math.PI/2,down:0,left:-Math.PI/2}[state.gravity]||0;}
    for(const link of this.connections){const active=state.plates.includes(link.plate);link.material.color.set(active?this.p.light:this.p.gold);link.material.opacity=active?.7:.27;}
    this.exitRing.material=state.ready?this.m.glow:this.m.off; this.exitCrystal.material.emissiveIntensity=state.ready?1.5:.05;
    this.drawBeams(state);
    this.beamRoot.visible=instant||!['push','mirror','gravity','water'].includes(sound);
  }

  select(object) {
    this.selection.visible=Boolean(object); if(!object)return;
    this.selection.position.copy(this.coords(object.x,object.z)); this.selection.position.y=.04;
  }

  tick(dt,paused=false) {
    if(!paused) {
      this.time+=dt;
      if(this.transition) {
        const t=this.transition; t.time+=dt;
        const p=Math.min(Math.max(0,t.time-t.turn)/t.travelDuration,1), ease=p*p*(3-2*p);
        for(const v of t.values) {
          if(v.pos)v.object.position.lerpVectors(v.from,v.pos,ease);
          if(v.rotation!==undefined) {
            const delta=Math.atan2(Math.sin(v.rotation-v.fromRot),Math.cos(v.rotation-v.fromRot));
            const rotationProgress=t.walking?(t.turn?Math.min(t.time/t.turn,1):1):ease;
            v.object.rotation.y=v.fromRot+delta*rotationProgress;
          }
        }
        if(t.walking) {
          const {from,pos}=t.values[0];
          const distance=Math.hypot(pos.x-from.x,pos.z-from.z);
          const walk=sampleWalk(p,distance,t.lead,t.sound==='push');
          this.robot.position.y+=walk.bob;
          this.robot.userData.legs.forEach((leg,i)=>{
            const pose=solveLeg(walk.feet[i].z,walk.feet[i].y);
            leg.hip.rotation.x=pose.hip;leg.knee.rotation.x=pose.knee;leg.ankle.rotation.x=pose.ankle;
          });
          const body=this.robot.userData.body;body.position.x=walk.sway;body.rotation.x=walk.lean*Math.sin(p*Math.PI);body.rotation.z=walk.sway*.6;
          this.robot.userData.arms.forEach((arm,i)=>{
            const envelope=Math.sin(p*Math.PI);
            arm.rotation.x=t.sound==='push'?-1.1*envelope:Math.sin(ease*Math.PI*4+i*Math.PI)*.36*envelope;
            arm.rotation.z=(i?1:-1)*(t.sound==='push'?.1:.13);
          });
          if(walk.contacts>t.contacts){this.onFootstep?.();t.contacts=walk.contacts;}
        }
        if(p===1) {this.robot.position.copy(t.values[0].pos);this.transition=null;this.beamRoot.visible=true;this.resetPose();}
      }
      if(this.settings.motion) {
        this.gears.forEach((g,i)=>g.rotation.y+=(this.state.water||this.menu ? .25 : .03)*dt*(i%2?-1:1));
        if(this.windmill)this.windmill.rotation.z+=dt*.13;
        this.exitCrystal.rotation.y+=dt*.35; this.exitCrystal.position.y=.48+Math.sin(this.time*1.7)*.045;
        if(this.gravityGem)this.gravityGem.rotation.y+=dt*.45;
        if(this.particles)this.particles.rotation.y=Math.sin(this.time*.05)*.04;
        this.water.forEach((w,i)=>w.material.opacity=.67+Math.sin(this.time*1.3+i)*.025);
        this.robot.userData.head.rotation.z=Math.sin(this.time*1.4)*.025;
      }
    }
    this.renderer.render(this.scene,this.camera);
  }

  resize() {
    const width=window.innerWidth,height=window.innerHeight; this.renderer.setSize(width,height);
    const budget=this.settings.quality==='high'?2:this.settings.quality==='medium'?1.4:1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,budget,Math.sqrt(3200000/(width*height))));
    if(!this.level)return;
    const aspect=width/height;
    const extent=Math.max(this.level.width,this.level.height)*S;
    let size=extent*.59;
    if(aspect<1)size=Math.max(size,extent*.77/aspect);
    if(this.menu && aspect>1.2)size*=1.05;
    const vertical=size/this.zoom;
    this.camera.left=-vertical*aspect; this.camera.right=vertical*aspect; this.camera.top=vertical; this.camera.bottom=-vertical;
    const offset=this.menu&&aspect>1.2?new THREE.Vector3(-extent*.22,0,extent*.22):new THREE.Vector3(0,0,0);
    this.target.set(offset.x+this.pan.x,.15,offset.z+this.pan.y);
    const distance=24; this.camera.position.set(this.target.x+Math.sin(this.angle)*distance,this.target.y+23,this.target.z+Math.cos(this.angle)*distance);
    this.camera.lookAt(this.target); this.camera.updateProjectionMatrix();
  }

  setQuality(settings) {
    this.settings=settings; this.renderer.shadowMap.enabled=settings.quality!=='low';
    this.renderer.toneMappingExposure=1.25*(settings.brightness||1);
    const shadowSize=settings.quality==='high'?2048:1024;
    if(this.sun.shadow.mapSize.x!==shadowSize){this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.mapSize.set(shadowSize,shadowSize);}
    if(this.particles)this.particles.visible=settings.quality!=='low'&&settings.motion;
    this.resize();
  }
  resetPose() {
    const data=this.robot.userData;
    for(const leg of data.legs){const pose=solveLeg(0,.075);leg.hip.rotation.x=pose.hip;leg.knee.rotation.x=pose.knee;leg.ankle.rotation.x=pose.ankle;}
    data.arms.forEach(arm=>arm.rotation.x=0);data.body.position.set(0,.18,0);data.body.rotation.set(0,0,0);
  }
  batchStatic() {
    // Keep all interactive and animated groups intact; merge only immutable architecture by material.
    const dynamic = new Set([this.robot,this.selection,this.beamRoot,this.particles,this.windmill,this.gravityGem,
      ...this.objects.values(),...this.gears,...this.water,...this.floaters]);
    const batches=new Map(),remove=[];
    this.root.updateMatrixWorld(true);
    this.root.traverse(object=>{
      if(!object.isMesh||object.material.visible===false)return;
      for(let parent=object;parent;parent=parent.parent)if(dynamic.has(parent))return;
      const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      if(!batches.has(object.material))batches.set(object.material,[]);
      batches.get(object.material).push(geometry);remove.push(object);
    });
    for(const object of remove){object.removeFromParent();object.geometry.dispose();}
    for(const [material,geometries] of batches){
      const geometry=mergeGeometries(geometries,false);
      if(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);}
      geometries.forEach(g=>g.dispose());
    }
  }

  makeControlLinks() {
    for(const plate of this.level.plates)for(const door of this.level.doors) {
      const start=this.coords(plate.x,plate.z),end=this.coords(door.x,door.z);
      start.y=.012;end.y=.012;
      const bend=start.clone();bend.x=end.x;
      const material=new THREE.LineBasicMaterial({color:this.p.gold,transparent:true,opacity:.27});
      const geometry=new THREE.BufferGeometry().setFromPoints([start,bend,end]);
      this.root.add(new THREE.Line(geometry,material));this.connections.push({plate:plate.id,material});
    }
  }

  startRestart() {
    this.restart=new THREE.Group();this.root.add(this.restart);this.cityWindows=[];
    const extent=Math.max(this.level.width,this.level.height)*S/2;
    for(let i=0;i<10;i++) {
      const tower=new THREE.Group();
      const a=Math.PI*.78+i/9*Math.PI*.9;
      const radius=extent+1.6+(i%3)*.35;
      tower.position.set(Math.sin(a)*radius,-.4,Math.cos(a)*radius);this.restart.add(tower);
      const height=1.2+(i%4)*.7,width=.65+(i%3)*.13;
      this.box(tower,width+.45,.25,width+.45,this.m.dark,0,-.18,0,.07);
      this.box(tower,width+.55,.08,width+.55,this.m.gold,0,-.36,0,.02);
      this.mesh(new THREE.ConeGeometry(width*.7,.8,5),this.m.stone2,tower,0,-.78,0).rotation.z=Math.PI;
      this.box(tower,width,height,width,this.m.stone2,0,height/2,0,.06);
      this.box(tower,width+.12,.12,width+.12,this.m.copper,0,height,0,.03);
      this.mesh(new THREE.ConeGeometry(width*.82,.7,4),this.m.copper,tower,0,height+.4,0).rotation.y=Math.PI/4;
      for(let row=.4;row<height-.1;row+=.55)for(const side of [-1,1]) {
        const material=this.mat('#ffe4b5',{emissive:'#ffd28a',emissiveIntensity:0});
        const window=this.box(tower,.16,.24,.025,material,side*.16,row,width/2+.015,.035);
        this.cityWindows.push({material,index:i});
      }
      this.cylinder(tower,.055,height+.7,this.m.gold,width*.36,(height+.7)/2,0);
    }
    const core=this.place(new THREE.Group(),this.level.exit);this.restart.add(core);
    this.coreRings=[];
    for(let i=0;i<3;i++) {
      const ring=this.torus(core,.55+i*.22,.028,this.m.glow,0,.8+i*.25,0);ring.rotation.x=Math.PI/2+i*.4;this.coreRings.push(ring);
    }
    this.zoom=.72;this.pan.set(0,0);this.resize();
  }

  restartAt(time,dt) {
    if(!this.restart)return;
    this.cityWindows.forEach(window=>window.material.emissiveIntensity=Math.max(0,Math.min(1.8,(time-1.3-window.index*.28)*2)));
    this.coreRings.forEach((ring,i)=>{ring.rotation.z+=dt*(i+1)*.3;ring.rotation.y+=dt*.22;ring.scale.setScalar(Math.min(1,time*.7));});
    this.gears.forEach(gear=>gear.rotation.y+=dt*.8);
    this.sun.intensity=3.4+Math.min(time/3,1)*1.2;
  }
  resetCamera() { this.pan.set(0,0); this.zoom=1; this.angle=Math.PI/4; this.resize(); }
  rotateCamera() { this.angle+=Math.PI/2; this.resize(); }

  pick(clientX,clientY) {
    const rect=this.canvas.getBoundingClientRect(); this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObjects(this.pickables,false);
    if(!hits.length)return;
    const object=hits.find(hit=>hit.object.userData.object);
    if(object && (!hits[0].object.userData.tile || object.distance<hits[0].distance+.6)) return {object:object.object.userData.object};
    const tile=hits.find(hit=>hit.object.userData.tile); return tile?{tile:tile.object.userData.tile}:null;
  }

  bindPointer() {
    this.canvas.addEventListener('pointerdown',event=>{
      this.canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});
      if(this.pointers.size>1)this.multiGesture=true;
      else {this.moved=false;this.multiGesture=false;}
    });
    this.canvas.addEventListener('pointermove',event=>{
      const pointer=this.pointers.get(event.pointerId); if(!pointer)return;
      const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
      if(Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)>7)this.moved=true;
      if(this.pointers.size===2) {
        const other=[...this.pointers.entries()].find(([id])=>id!==event.pointerId)[1];
        const before=Math.hypot(pointer.x-other.x,pointer.y-other.y),after=Math.hypot(event.clientX-other.x,event.clientY-other.y);
        this.zoom=THREE.MathUtils.clamp(this.zoom*Math.pow(after/Math.max(before,1),this.settings.cameraSensitivity||1),.65,1.65); this.resize();
      } else if(this.moved) {
        const scale=(this.camera.top-this.camera.bottom)/window.innerHeight*(this.settings.cameraSensitivity||1);
        this.pan.x=THREE.MathUtils.clamp(this.pan.x-dx*scale*.7-dy*scale*.5,-4,4);
        this.pan.y=THREE.MathUtils.clamp(this.pan.y+dx*scale*.7-dy*scale*.5,-4,4); this.resize();
      }
      pointer.x=event.clientX;pointer.y=event.clientY;
    });
    const end=event=>{
      const pointer=this.pointers.get(event.pointerId); if(!pointer)return;
      const click=!this.moved&&!this.multiGesture;
      this.pointers.delete(event.pointerId);
      if(click && event.type!=='pointercancel') {const picked=this.pick(event.clientX,event.clientY);if(picked)this.onPick(picked);}
    };
    this.canvas.addEventListener('pointerup',end);this.canvas.addEventListener('pointercancel',end);
    this.canvas.addEventListener('wheel',event=>{event.preventDefault();this.zoom=THREE.MathUtils.clamp(this.zoom*Math.exp(-event.deltaY*.001*(this.settings.cameraSensitivity||1)),.65,1.65);this.resize();},{passive:false});
  }

  screenPoint(x,z,y=.2) {
    const p=this.coords(x,z);p.y=y;p.project(this.camera);return{x:(p.x+1)/2*window.innerWidth,y:(1-p.y)/2*window.innerHeight};
  }
}
