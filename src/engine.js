export const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
export const copy = (value) => JSON.parse(JSON.stringify(value));
export const key = (x, z) => `${x},${z}`;
export const at = (a, b) => a.x === b.x && a.z === b.z;
export const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) <= 1;

export function createState(level) {
  const state = { player: { ...level.start, dir: 'down' }, crates: copy(level.crates), mirrors: copy(level.mirrors), water: level.initialWater || 0, gravity: null, steps: 0, won: false };
  return derive(level, state);
}

export function cell(level, x, z) {
  return level.map[z]?.[x] ?? '#';
}

export function traceLight(level, state, gatePower = []) {
  const segments = [], received = new Set();
  for (const source of level.sources) {
    let { x, z, dir, energy } = source;
    const visited = new Set();
    for (let step = 0; step < level.width * level.height * 4; step++) {
      const visit = `${x},${z},${dir}`;
      if (visited.has(visit)) break;
      visited.add(visit);
      const [dx, dz] = DIRS[dir], nx = x + dx, nz = z + dz;
      const tile = cell(level, nx, nz);
      const wall = tile === '#';
      segments.push({ x1: x, z1: z, x2: wall ? x + dx * .47 : nx, z2: wall ? z + dz * .47 : nz, energy });
      if (wall || state.crates.some(c => c.x === nx && c.z === nz)) break;
      const gate = level.doors.find(d => d.x === nx && d.z === nz);
      if (gate && !gateCondition(level, state, gate, gatePower) && !at(state.player, gate) && !state.crates.some(c => at(c, gate))) break;
      const receiver = level.receivers.find(r => r.x === nx && r.z === nz);
      if (receiver) { if (receiver.energy === energy) received.add(receiver.id); break; }
      const mirror = state.mirrors.find(m => m.x === nx && m.z === nz);
      if (mirror) {
        dir = mirror.angle === 0
          ? { right: 'up', up: 'right', left: 'down', down: 'left' }[dir]
          : { right: 'down', down: 'right', left: 'up', up: 'left' }[dir];
      } else if (level.sources.some(s => s.x === nx && s.z === nz) || level.controls.some(c => c.x === nx && c.z === nz)) break;
      x = nx; z = nz;
    }
  }
  return { segments, received: [...received] };
}

export function plateActive(state, plate) {
  const crate = state.crates.some(c => at(c, plate));
  return plate.kind === 'crate' ? crate : crate || at(state.player, plate);
}

export function gateCondition(level, state, door, received = state.received || []) {
  const has = id => received instanceof Set ? received.has(id) : received.includes(id);
  const plates = door.plates ?? level.plates.map(p => p.id);
  const receivers = door.receivers ?? level.receivers.map(r => r.id);
  return plates.every(id => plateActive(state, level.plates.find(p => p.id === id)))
    && receivers.every(has)
    && (door.water === undefined || state.water === door.water);
}

export function derive(level, state) {
  // Compute the least powered state: a dark gate cannot power itself through a circular light path.
  let light = traceLight(level, state);
  for (let i = 0; i < level.doors.length; i++) {
    const next = traceLight(level, state, light.received);
    if (next.received.join(',') === light.received.join(',')) { light = next; break; }
    light = next;
  }
  state.received = light.received;
  state.beams = light.segments;
  state.plates = level.plates.filter(p => plateActive(state, p)).map(p => p.id);
  state.doors = level.doors.filter(d => gateCondition(level, state, d) || at(state.player, d) || state.crates.some(c => at(c, d))).map(d => d.id);
  state.ready = level.plates.every(p => plateActive(state, p))
    && level.receivers.every(r => state.received.includes(r.id))
    && (level.goalWater === undefined || state.water === level.goalWater);
  state.won = Boolean(state.ready && at(state.player, level.exit));
  return state;
}

export function isSolid(level, state, x, z) {
  const tile = cell(level, x, z);
  if (tile === '#') return '这里是墙体，试试从另一侧绕行。';
  const door = level.doors.find(d => d.x === x && d.z === z);
  if (door && !state.doors.includes(door.id)) return '闸门尚未开启，请先接通它的机关。';
  if ([...state.mirrors, ...level.controls, ...level.sources, ...level.receivers].some(o => o.x === x && o.z === z)) return '这是固定机关，站在旁边即可操作。';
  return null;
}

export function waterPassable(level, state, x, z) {
  const tile = cell(level, x, z);
  if (tile === 'b') return state.water === 1;
  if (tile !== '~' || !state.water) return true;
  return state.crates.some(c => c.buoyant && c.x === x && c.z === z);
}

export function nearby(level, state) {
  return [...state.mirrors.map(m => ({ ...m, type: 'mirror' })), ...level.controls].filter(o => adjacent(state.player, o));
}

function settleGravity(level, state) {
  if (!state.gravity) return;
  const [dx, dz] = DIRS[state.gravity];
  const track = new Set(level.track.map(p => key(p.x, p.z)));
  const crates = state.crates.filter(c => c.gravity).sort((a, b) => (b.x * dx + b.z * dz) - (a.x * dx + a.z * dz));
  for (const c of crates) {
    for (let i = 0; i < level.width * level.height; i++) {
      const nx = c.x + dx, nz = c.z + dz;
      if (!track.has(key(nx, nz)) || isSolid(level, state, nx, nz) || at(state.player, { x: nx, z: nz })
        || state.crates.some(other => other !== c && other.x === nx && other.z === nz)) break;
      c.x = nx; c.z = nz;
    }
  }
}

export function act(level, oldState, action) {
  if (oldState.won) return { ok: false, reason: '本关已经完成。' };
  const state = copy(oldState);
  let sound = 'step';
  if (action.type === 'move') {
    const d = DIRS[action.dir];
    if (!d) return { ok: false, reason: '无效方向。' };
    const nx = state.player.x + d[0], nz = state.player.z + d[1];
    const solid = isSolid(level, state, nx, nz);
    if (solid) return { ok: false, reason: solid };
    const crate = state.crates.find(c => c.x === nx && c.z === nz);
    const bridge = crate?.buoyant && state.water && cell(level, nx, nz) === '~';
    if (crate && !bridge) {
      if (crate.gravity) return { ok: false, reason: '重力箱沿轨道移动，需要操作重力罗盘。' };
      const cx = nx + d[0], cz = nz + d[1];
      if (isSolid(level, state, cx, cz) || state.crates.some(c => c.x === cx && c.z === cz)) return { ok: false, reason: '箱体前方被挡住，试试从另一侧推动。' };
      if (!waterPassable(level, state, cx, cz) || cell(level, cx, cz) === 'b') return { ok: false, reason: '箱体不能推入深水或抬起的浮台。先降低水位。' };
      crate.x = cx; crate.z = cz; sound = 'push';
    }
    if (!waterPassable(level, state, nx, nz)) return { ok: false, reason: cell(level, nx, nz) === 'b' ? '浮台还在低处。升高水位后，它就能接通步道。' : '水位太高，只有浮台与浮箱可以安全通行。' };
    state.player = { x: nx, z: nz, dir: action.dir };
  } else {
    const object = [...state.mirrors.map(m => ({ ...m, type: 'mirror' })), ...level.controls].find(o => o.id === action.id);
    if (!object || !adjacent(state.player, object)) return { ok: false, reason: '先走到机关旁边，再进行操作。' };
    if (object.type === 'mirror' && action.type === 'interact') {
      const m = state.mirrors.find(m => m.id === object.id); m.angle = 1 - m.angle; sound = 'mirror';
    } else if (object.type === 'valve' && action.type === 'interact') {
      const future = copy(state); future.water = 1 - state.water;
      if (!waterPassable(level, future, state.player.x, state.player.z)) return { ok: false, reason: '站在干燥岸边再改变水位，以免失去脚下的通路。' };
      state.water = future.water; sound = 'water';
    } else if (object.type === 'gravity' && action.type === 'gravity' && DIRS[action.dir]) {
      if (state.gravity === action.dir) return { ok: false, reason: '重力已经朝向这个方向。' };
      state.gravity = action.dir; sound = 'gravity';
    } else return { ok: false, reason: '请选择这个机关可用的操作。' };
  }
  derive(level, state);
  settleGravity(level, state);
  derive(level, state);
  state.steps++;
  return { ok: true, state, sound };
}

export function pathTo(level, state, target) {
  // Only walkable squares: click navigation never pushes crates or operates an unseen device.
  const queue = [{ ...state.player, path: [] }], seen = new Set([key(state.player.x, state.player.z)]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (at(p, target)) return p.path;
    for (const [dir, [dx, dz]] of Object.entries(DIRS)) {
      const x = p.x + dx, z = p.z + dz, k = key(x, z);
      if (seen.has(k) || isSolid(level, state, x, z) || !waterPassable(level, state, x, z)) continue;
      if (state.crates.some(c => c.x === x && c.z === z && !(c.buoyant && state.water && cell(level, x, z) === '~'))) continue;
      seen.add(k); queue.push({ x, z, path: [...p.path, dir] });
    }
  }
  return null;
}

export function stateKey(state) {
  return JSON.stringify([state.player.x, state.player.z, state.crates.map(c => [c.x, c.z]), state.mirrors.map(m => m.angle), state.water, state.gravity]);
}

export function legalActions(level, state) {
  const actions = Object.keys(DIRS).map(dir => ({ type: 'move', dir }));
  for (const o of nearby(level, state)) {
    if (o.type === 'gravity') for (const dir of Object.keys(DIRS)) actions.push({ type: 'gravity', id: o.id, dir });
    else actions.push({ type: 'interact', id: o.id });
  }
  return actions;
}

export function solve(level, initial = createState(level), limit = 250000) {
  if (initial.won) return [];
  const states = [initial], links = [[-1, null]], seen = new Set([stateKey(initial)]);
  for (let i = 0; i < states.length && i < limit; i++) {
    for (const action of legalActions(level, states[i])) {
      const result = act(level, states[i], action);
      if (!result.ok) continue;
      const k = stateKey(result.state);
      if (seen.has(k)) continue;
      seen.add(k); states.push(result.state); links.push([i, action]);
      if (result.state.won) {
        let j = links.length - 1, solution = [];
        while (links[j][0] !== -1) { solution.push(links[j][1]); j = links[j][0]; }
        return solution.reverse();
      }
    }
  }
  return null;
}
