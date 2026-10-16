# 本地素材来源与许可

本项目没有下载或使用第三方角色、贴图、场景、音频、字体或完整游戏模板。运行时不加载外链素材。

| 素材 | 本地来源 | 许可 |
| --- | --- | --- |
| 机械探险者：头盔、眼灯、关节、背包、扳手 | `src/scene.js` 的原创程序化模型；可复用文件 `public/models/explorer.json` | 项目 MIT |
| 机关箱、浮箱、星陨箱 | `src/scene.js`，`public/models/*Crate.json` | 项目 MIT |
| 工坊、镜光庭院、重力核心建筑、齿轮、管道、植物 | `src/scene.js` 原创几何体与材质 | 项目 MIT |
| 阀门、镜面、发射器、接收器、闸门、浮台 | `src/scene.js` 原创程序化模型 | 项目 MIT |
| 实体界面图标 | `src/icons.js` 原创 SVG | 项目 MIT |
| 游戏图标、网站图标与应用清单图标 | `public/icons/game-icon.svg` 与本地 PNG / ICO；由 `tools/create-icon.mjs` 生成 | 项目 MIT |
| 三章环境音乐、全部机关音效与结束旋律 | `src/audio.js` 原创 Web Audio 本地合成；无需音频文件或接口 | 项目 MIT |
| 简体中文与数字字体 | 用户操作系统自带字体栈；没有附带字体文件 | 按用户系统原有许可 |

原生 Three.js 模型 JSON 包含几何体、材质与对象层级，可通过 `THREE.ObjectLoader` 加载。
游戏使用同一份本地模型工厂生成对象，避免重复下载导出的备用模型文件。
运行 `node tools/export-models.mjs` 可重新导出并验证模型。

通用依赖：Three.js（MIT）、Vite（MIT）、Playwright（Apache-2.0，仅测试）。完整许可见 `public/licenses/`。这些库均安装在本地，由生产构建打包。
