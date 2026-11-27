# 捏捏达妮娅

《鸣潮》达妮娅的捏脸小网页：戳脸、单手 / 双手拉脸、捧脸，还有一首歌的音游。
three.js + MMD（PMX）模型，Vite 构建，Cloudflare Pages 部署。

在线玩：[daniya-face.pages.dev](https://daniya-face.pages.dev)

和 [捏捏莉莉](https://github.com/moonbow0407/lily-face) 是同一套引擎的姊妹项目，两个仓库各自独立维护。
玩法和动效参考了 [菲比捏脸模拟器](https://phoebe-face-lab.vercel.app/)。

## 玩法

| 工具 | 操作 |
| --- | --- |
| 戳脸 | 点脸颊，软软弹一下、笑一下；连戳音高会往上走 |
| 单手 / 双手拉脸 | 按住脸颊往外拖；拉久了会脸红，松手后有点生闷气；偶尔冒汗滴 |
| 捧脸 | 按住：先惊讶地嘟嘴 → 害羞地躲开视线 → 眯眼往手心里蹭；按住画圈是揉脸，揉久了会晕；松手"嘿嘿"一笑 |
| 音游 | 《しゅわしゅわハニーレモン350ml》：圆音符点一下（戳），长条按住（Wink 拉脸）到尾巴松手；支持空格 / D / F / J / K，打完弹出结算 |

滚轮 / 双指捏合缩放。左上角可以开关音效。

## 本地运行

素材有版权，**不在仓库里**，需要自己准备好放到对应位置：

| 文件 | 说明 |
| --- | --- |
| `public/models/daniya_red/daniya_red.pmx`（及贴图） | 达妮娅红色一形态 MMD 模型（修模绑骨版） |
| `public/music/honey-lemon-350ml.mp3` | 音游免费 BGM《しゅわしゅわハニーレモン350ml》（しゃろう / DOVA-SYNDROME） |
| `public/sfx/pull-tension.wav`、`pull-rub.wav`、`pull-release.wav` | 拉脸音效采样；缺了拉脸就不出声，其它不受影响 |
| `public/loading.jpg`、`public/finale.jpg` | 加载图、音游结算图 |

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

换模型或换形态后，在 `npm run dev` 下打开 `http://localhost:5173/?bake`，烘焙完会自动写入 `src/characters/daniya/hairRest.json`（头发的静止姿势）。

部署：`./deploy.ps1`（预览）或 `./deploy.ps1 -Prod`（正式）。本地构建后上传到 Cloudflare Pages，模型等素材随 `dist` 一起上传；项目名取 `site.json`。

## 技术

- Vite + three.js 0.170（MMDLoader 读 PMX 模型，OutlineEffect 描边）
- 脸颊形变全在 GPU 着色器里（`src/rig/`）：戳、拉、捧都是同一个弹性位移场（双尺度正则化 Kelvinlet）的叠加，乘上软组织遮罩（鼻梁、眼睛、耳前钉住）；松手和回弹是 CPU 上的阻尼弹簧。垂在脸颊前的前发在脸颊快顶到时整段让开
- 所有形变、点击区域都在"脸部坐标系"里算：由角色自己的几个标志点（嘴角、眼睛、鼻尖、半脸宽、脸颊、前发位置，见 `model.face`）定义，换模型只需重新量这几个点
- 表情 = 模型自带的表情 morph 组合：引擎算通用的情绪信号（`src/expression/signals.js`），达妮娅的表情表（`src/characters/daniya/expressions.js`）把信号换成表情；漫画符号是 UV 表情（MMDLoader 不支持，`src/rig/symbols.js` 自己实现）
- 开放哪些动作、界面配色都由角色配置决定：工具栏按 `personality.actions` 生成，配色是 `presentation.theme` 写入的 CSS 变量
- 头发的静止姿势是离线跑一次物理烘焙出来的（`hairRest.json`），运行时不开物理，不穿模、不飘
- 音效：拉脸用采样，其它用 Web Audio 现场合成（`src/audio/sfx.js`）
- 音游：`src/rhythm/`，谱面在 `src/rhythm/charts/`

### 目录结构

```
src/
  main.js            入口：加载 → 装配 → 主循环
  characters/daniya/ 达妮娅的配置：model 模型层 / personality + expressions 性格层 / presentation + theme 呈现层
  core/              渲染舞台与镜头、加载界面与模型加载、模型准备、骨骼姿势
  rig/               脸部坐标系、弹性位移场（Kelvinlet）、形变 uniform、着色器、弹簧、点击检测、漫画符号
  interaction/       指针 / 键盘输入、交互状态、拉扯物理
  expression/        情绪信号、表情驱动（语义名 → morph）、头部动作与眨眼
  rhythm/            音游判定、界面、播放器、charts/ 谱面
  audio/  ui/        音效；工具栏（按配置生成）、主题与样式
```

站点级设置（左上角链接、部署项目名、统计）在 `site.json`。

## 致谢与版权

- 玩法创意与音游界面布局参考 [phoebe-face-lab](https://phoebe-face-lab.vercel.app/)，拉脸音效采样来自该站；脸部形变与谱面为本项目自己实现
- 脸部形变基于 de Goes & James 2017,《Regularized Kelvinlets: Sculpting Brushes based on Fundamental Solutions of Elasticity》
- 角色与模型版权归库洛游戏及模型作者所有，本项目仅为同人爱好，不作商用
- 音游 BGM：《しゅわしゅわハニーレモン350ml》© しゃろう（[OpenTracks / DOVA-SYNDROME](https://opentracks.com/bgm/detail/14621) 免费素材）
