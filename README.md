# 捏捏达妮娅

《鸣潮》达妮娅的捏脸小网页：戳脸、单手 / 双手拉脸、捧脸，还有一首歌的音游。
玩法和动效参考了 [菲比捏脸模拟器](https://phoebe-face-lab.vercel.app/)，在线体验：<https://daniya-face.pages.dev>

## 玩法

| 工具 | 操作 |
| --- | --- |
| 戳脸 | 点脸颊，软软弹一下、笑一下；连戳音高会往上走 |
| 单手 / 双手拉脸 | 按住脸颊往外拖；拉久了会脸红，松手后有点生闷气；偶尔冒汗滴 |
| 捧脸 | 按住：先惊讶地嘟嘴 → 害羞地躲开视线 → 眯眼往手心里蹭；按住画圈是揉脸，揉久了会晕；松手"嘿嘿"一笑 |
| 音游 | 《しゅわしゅわハニーレモン350ml》：圆音符点一下（戳），长条按住（Wink 拉脸）到尾巴松手；支持空格 / D / F / J / K，打完弹出结算 |

滚轮 / 双指捏合缩放。左上角可以开关音效。

## 技术

- Vite + three.js 0.170（MMDLoader 读 PMX 模型，OutlineEffect 描边）
- 脸颊形变全在 GPU 着色器里（`src/cheekRig.js`）：戳的冲击场、拉扯的软垫场、回弹弹簧，只作用在脸部皮肤，不带动头发
- 表情 = 模型自带的表情 morph 组合；漫画符号是 UV 表情（MMDLoader 不支持，`src/emotes.js` 自己实现）
- 头发的静止姿势是离线跑一次物理烘焙出来的（`src/hairRest.json`），运行时不开物理，不穿模、不飘
- 音效：拉脸用采样，其它用 Web Audio 现场合成（`src/sfx.js`）
- 音游：`src/rhythm.js`，谱面 `src/rhythmChart.js`

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

换模型或换形态后，用 `http://localhost:5173/?bake` 打开页面，控制台里复制 `window.__bakedHairRest` 存为 `src/hairRest.json`（头发的静止姿势）。

部署：`./deploy.ps1`（Cloudflare Pages，本地构建后上传，模型等素材随 `dist` 一起上传）。

## 致谢与版权

- 玩法、脸部形变公式、音游谱面与拉脸音效参考 / 来自 [phoebe-face-lab](https://phoebe-face-lab.vercel.app/)
- 角色与模型版权归库洛游戏及模型作者所有，本项目仅为同人爱好，不作商用
- 音游 BGM：《しゅわしゅわハニーレモン350ml》© しゃろう（[OpenTracks / DOVA-SYNDROME](https://opentracks.com/bgm/detail/14621) 免费素材）
