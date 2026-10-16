const regions = [
  { name: '水息工坊', subtitle: '沉睡的水流，仍记得归途', color: '#ddb16b', chapter: '第一章', emblem: 'water', story: '小探险者拾起一颗微光。很久以前，这里的水车让整座城市呼吸。如今，只剩铜管里细小的回声。' },
  { name: '镜光庭院', subtitle: '让一束光，找到它的方向', color: '#8bcfdb', chapter: '第二章', emblem: 'light', story: '水流唤醒了高处的庭院。古老的镜面蒙着薄尘，星光在断裂的回廊间徘徊。把光送回它应去的地方。' },
  { name: '星陨核心', subtitle: '重新排列，城市的心跳', color: '#c7ace7', chapter: '第三章', emblem: 'gravity', story: '城市最深处，重力像钟摆一样停住了。那些悬浮的机关正在等待新的方向。最后一颗星，就藏在核心里。' }
];
export { regions };

function make(name, region, map, options = {}) {
  const level = { name, region, map: map.trim().split('\n').map(s => s.trim()), crates: [], plates: [], doors: [], controls: [], mirrors: [], sources: [], receivers: [], track: [], ...options };
  level.height = level.map.length; level.width = level.map[0].length;
  if (level.map.some(row => row.length !== level.width)) throw new Error(`关卡 ${name} 宽度不一致`);
  const nums = {};
  const id = type => `${type}${nums[type] = (nums[type] || 0) + 1}`;
  level.map = level.map.map((row, z) => [...row].map((symbol, x) => {
    const p = { x, z };
    if (symbol === '@') level.start = p;
    if (symbol === 'E') level.exit = p;
    if ('CF'.includes(symbol)) level.crates.push({ ...p, id: id('crate'), buoyant: symbol === 'F' });
    if (symbol === 'G') { level.crates.push({ ...p, id: id('crate'), gravity: true }); level.track.push(p); }
    if ('oq'.includes(symbol)) level.plates.push({ ...p, id: id('plate'), kind: symbol === 'q' ? 'any' : 'crate' });
    if (symbol === 'D') level.doors.push({ ...p, id: id('door'), ...options.gate });
    if (symbol === 'V') level.controls.push({ ...p, id: id('valve'), type: 'valve' });
    if (symbol === 'T') level.controls.push({ ...p, id: id('gravity'), type: 'gravity' });
    if ('/\\'.includes(symbol)) level.mirrors.push({ ...p, id: id('mirror'), angle: symbol === '/' ? 0 : 1 });
    if (symbol === 'S') level.sources.push({ ...p, id: id('source'), energy: 'amber', dir: 'right' });
    if (symbol === 'R') level.receivers.push({ ...p, id: id('receiver'), energy: 'amber' });
    if (symbol === 'g') level.track.push(p);
    return '#~bg'.includes(symbol) ? symbol : '.';
  }).join(''));
  if (options.extraTrack) level.track.push(...options.extraTrack);
  if (options.sourceDirs) level.sources.forEach((s, i) => { s.dir = options.sourceDirs[i] || 'right'; });
  if (options.energies) { level.sources.forEach((s, i) => s.energy = options.energies[i] || 'amber'); level.receivers.forEach((r, i) => r.energy = options.energies[i] || 'amber'); }
  if (options.mirrorAngles) level.mirrors.forEach((m, i) => m.angle = options.mirrorAngles[i] ?? m.angle);
  if (options.cratePositions) level.crates.forEach((c, i) => Object.assign(c, options.cratePositions[i]));
  return level;
}

export const levels = [
  make('第一声回响', 0, String.raw`
    #########
    #......##
    #.@C.oDE#
    #.....###
    #..#..###
    #.....###
    #########`, {
    goal: '把机关箱推上铜色压力板，开启工坊入口。',
    hints: ['铜色圆盘与闸门之间，埋着一条传动管。', '压力板需要箱体持续压住；推动箱体后，闸门会立刻响应。', '从箱体左侧向右推动两次，再穿过开启的闸门。']
  }),
  make('绕过旧齿轮', 0, String.raw`
    #########
    #...#...#
    #.@.#.o.#
    #..C....#
    #...#...#
    #...##D##
    #.....E##
    #########`, {
    goal: '绕过立柱，将机关箱送到另一侧的压力板。',
    hints: ['立柱把房间分成两侧，但中间的回廊仍然相通。', '推箱之前，先留出可以站到它另一侧的空间。', '把箱体沿中央回廊推到右侧，再绕到下方向上推到圆盘。']
  }),
  make('两座沉默的闸门', 0, String.raw`
    ##########
    #........#
    #.@C..o..#
    #..#.....#
    #..C..o..#
    #........#
    ######D###
    ######E###
    ##########`, {
    goal: '让两块压力板同时被箱体压住。',
    hints: ['出口连接两条管道，只唤醒其中一条还不够。', '两块压力板都需要箱体；探险者的重量无法维持它们。', '分别站在两个箱体左边，将它们向右推到同一列的圆盘。']
  }),
  make('浮起的桥', 0, String.raw`
    #########
    #...#...#
    #.@V#...#
    #...~...#
    #...b.DE#
    #...~...#
    #...#...#
    #########`, {
    goalWater: 1, gate: { water: 1 },
    goal: '转动岸边阀门，升起浮台并穿过水渠。',
    hints: ['水渠中央的铜木浮台可以随着水面升起。', '低水位时可走干燥渠床；高水位时只能沿浮台过河。', '在阀门旁操作一次，让浮台升起，再从浮台所在的横向步道通过。']
  }),
  make('给水流一块踏脚石', 0, String.raw`
    ##########
    #....#...#
    #.@F.~...#
    #....#...#
    #..V.#.DE#
    #....#...#
    ##########`, {
    goalWater: 1, gate: { water: 1 },
    goal: '先把浮箱推入缺口，再升高水位接通桥面。',
    hints: ['水渠只有一个缺口，木制浮箱能填上这段通路。', '浮箱在低水位时可以推动，升水后则成为可站立的踏脚石。', '先向右推箱两次，把它送到水渠中；回到阀门旁升水，再从浮箱上过河。']
  }),
  make('工坊重新呼吸', 0, String.raw`
    ###########
    #....#....#
    #.@F.~....#
    #....#....#
    #..V.#.C.o#
    #....#....#
    #....#..D##
    #....#..E##
    ###########`, {
    goalWater: 1, gate: { water: 1 },
    goal: '搭好浮桥，压住远岸圆盘，让水力核心运转。',
    hints: ['出口需要高水位，也需要远岸的压力板。', '先准备浮桥再升水；过桥后，远岸仍有一只需要推动的机关箱。', '浮箱向右推两格后升水。过桥绕到远岸箱体左侧，向右推两格。']
  }),
  make('一束迟到的光', 1, String.raw`
    #########
    #...R...#
    #.......#
    #S..\...#
    #.@.....#
    #.......#
    ####D####
    ####E####
    #########`, {
    goal: '转动镜面，让琥珀光抵达菱形接收器。',
    hints: ['发射器的光束在镜面处改变方向。', '斜镜有两种朝向：“／”把向右的光转向上方，“＼”把它转向下方。', '站到中央镜面旁，转动一次，让光束转向上方的接收器。']
  }),
  make('回廊里的折线', 1, String.raw`
    ##########
    #......R.#
    #........#
    #....#...#
    #S..\..\.#
    #.@......#
    #........#
    #......D##
    #######E##
    ##########`, {
    goal: '用两面镜子，把光送到回廊尽头。',
    hints: ['光要先向下绕开立柱，再向右，再向上。', '这里的第一面镜子位置可引导光；光路不能穿过墙体。', '检查两面镜子的实际光路。第二面镜子必须把从左侧来的光转向上方。'],
    mirrorAngles: [1,1]
  }),
  make('挪开阴影', 1, String.raw`
    ##########
    #.....R..#
    #........#
    #S.C..\..#
    #.@......#
    #...#....#
    ######D###
    ######E###
    ##########`, {
    goal: '移开遮光箱，再调整镜面接通能源。',
    hints: ['发射器亮着，但光束在木箱前停住了。', '箱体会遮挡光线；镜面只能反射真正抵达它的光。', '走到箱体下方，向上把它推出光路；再把右侧镜面转成“／”。']
  }),
  make('彼此照亮', 1, String.raw`
    ###########
    #..R...R..#
    #.........#
    #S.\......#
    #.........#
    #S.....\..#
    #.@.......#
    #######D###
    #######E###
    ###########`, {
    energies: ['amber','azure'],
    goal: '让菱形琥珀光与三角青蓝光各自抵达接收器。',
    hints: ['两种能源各有自己的符号：琥珀菱形与青蓝三角。', '接收器只接受同符号的光；另一束光经过时不会点亮它。', '先转动左侧镜面，唤醒近处菱形；再转动右侧镜面，唤醒远处三角。']
  }),
  make('闸门背后的星光', 1, String.raw`
    ###########
    #......R..#
    #.........#
    #S..D..\..#
    #.........#
    #.@C.o....#
    #.........#
    #######D###
    #######E###
    ###########`, {
    goal: '保持压力板，打开遮光闸，再反射能源。',
    hints: ['一扇闸挡住光路，另一扇闸守着出口。', '遮光闸由压力板控制；出口还需要接收器点亮。', '把箱体推到同一行的圆盘上，再绕到右侧镜面旁旋转一次。']
  }),
  make('庭院的两次日出', 1, String.raw`
    ############
    #...R....R.#
    #..........#
    #S.C\......#
    #..........#
    #S.......\.#
    #.@..C.o...#
    #..........#
    #########D##
    #########E##
    ############`, {
    energies: ['amber','azure'],
    goal: '清除阴影，压住传动盘，唤醒两束光。',
    hints: ['一只箱体遮住上方光路，另一只靠近传动盘。', '两束光与压力板必须同时满足，出口才会开启。', '先把遮光箱向上移开，再把下方箱体向右推到圆盘，最后调整两面镜子。']
  }),
  make('重新认识方向', 2, String.raw`
    ##########
    #........#
    #.@T.....#
    #........#
    #.Ggggo..#
    #........#
    ######D###
    ######E###
    ##########`, {
    extraTrack: [{ x: 6, z: 4 }],
    goal: '在罗盘旁把重力转向右，让星陨箱抵达圆盘。',
    hints: ['紫色轨道标出星陨箱的全部活动范围。', '重力箱沿指定方向滑到轨道尽头，被墙体、箱体或探险者挡住时会停下。', '站在重力罗盘旁，选择向右。箱体将停在轨道尽头的圆盘上。']
  }),
  make('拐角的落点', 2, String.raw`
    ##########
    #........#
    #.@T.....#
    #........#
    #.Ggggg..#
    #.....g..#
    #.....o..#
    #........#
    ######D###
    ######E###
    ##########`, {
    extraTrack: [{ x: 6, z: 6 }],
    goal: '让星陨箱沿折角轨道落到终点。',
    hints: ['轨道在右侧转弯，箱体不会自动拐弯。', '同一次重力只沿一个方向移动；需要在拐点再改一次方向。', '先向右，再向下。每次切换都在罗盘旁完成。']
  }),
  make('恰好的阻挡', 2, String.raw`
    ###########
    #.........#
    #.@T......#
    #.........#
    #.GggogC..#
    #.........#
    #...#.....#
    #####D#####
    #####E#####
    ###########`, {
    extraTrack: [{ x: 5, z: 4 }, { x: 7, z: 4 }],
    goal: '用木箱设定止挡，让星陨箱停在轨道中段。',
    hints: ['圆盘没有放在尽头，向右的重力会让箱体滑过它。', '木箱可以挡住星陨箱。止挡需要位于目标的下一格。', '绕到木箱右边，把木箱向左推一格；再回到罗盘，选择向右。']
  }),
  make('被星光托起的水', 2, String.raw`
    ###########
    #....#....#
    #.@F.~....#
    #....#....#
    #..V.#T...#
    #....#....#
    #....#Gggo#
    #....#....#
    #....#..D##
    #....#..E##
    ###########`, {
    extraTrack: [{ x: 9, z: 6 }], goalWater: 1, gate: { water: 1 },
    goal: '搭起浮桥，再用重力接通远岸传动盘。',
    hints: ['通往重力罗盘的道路被水渠隔开。', '水力与重力需要同时维持正确状态，不能只完成其中一个。', '把浮箱向右推到渠中再升水。过桥到罗盘旁，选择向右。']
  }),
  make('星轨与光轨', 2, String.raw`
    ############
    #.......R..#
    #..........#
    #S..Gggg\..#
    #...g......#
    #.@Tg......#
    #...o......#
    #..........#
    ########D###
    ########E###
    ############`, {
    extraTrack: [{ x: 4, z: 6 }],
    goal: '让重力箱退出光路并压住圆盘，再调整镜面。',
    hints: ['星陨箱刚好挡在发射器的光路上。', '向下的轨道既能让出光路，也能把箱体送到压力板。', '在罗盘旁选择向下，然后到右侧镜面旁把它转成“／”。']
  }),
  make('让城市重新呼吸', 2, String.raw`
    #############
    #....#....R.#
    #.@F.~......#
    #....#......#
    #..V.#S.Gg\.#
    #....#..g...#
    #....#T.g...#
    #....#..o...#
    #....#......#
    #....#####D##
    #....#####E##
    #############`, {
    extraTrack: [{ x: 8, z: 7 }], goalWater: 1, gate: { water: 1 },
    goal: '接通水流、星轨与光束，修复城市最后的心脏。',
    hints: ['核心同时等待高水位、轨道圆盘和琥珀接收器。', '重力箱既挡着光，又需要落在下方圆盘；浮桥必须在升水前准备。', '先把浮箱推入水渠并升水。过桥，在罗盘旁选择向下。最后调整右侧镜面，并走向点亮的核心出口。']
  })
];

// Optical shutter in chapter 2 follows the pressure plate only; exit follows both conditions.
levels[10].doors[0].receivers = [];

// The second mirror in level 8 is below the first: a genuine three-turn corridor.
levels[7].mirrors[1].z = 6;
levels[7].mirrors[1].x = 7;
levels[7].mirrors.push({ id: 'mirror3', x: 4, z: 6, angle: 0 });
levels[7].hints = ['立柱使直达接收器的道路被截断，下方回廊能绕过它。', '光需要经过三面镜子：向下、向右、再向上。每面镜子都有明确的斜向。', '第一面保持“＼”；下方左镜转成“＼”；下方右镜转成“／”。'];
levels[7].goal = '用三面镜子，把光绕过回廊立柱。';

levels.forEach((level, index) => { level.id = index; level.number = index + 1; level.localNumber = index % 6 + 1; });
