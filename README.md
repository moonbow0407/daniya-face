# MMD 捏脸模板

给 MMD（PMX）角色做捏脸小网页的模板：戳脸、单手 / 双手拉脸、捧脸，还有一首歌的音游。
引擎和角色分离：换一个模之屋模型，写一份角色配置，就是另一个角色的捏脸站。

示例站：[捏捏达妮娅](https://daniya-face.pages.dev)（《鸣潮》达妮娅，本仓库自带的示例角色）。
玩法和动效参考了 [菲比捏脸模拟器](https://phoebe-face-lab.vercel.app/)。

## 做你自己的角色

1. 在 GitHub 上点 **Use this template** 新建仓库（或 `git clone` 本仓库），`npm install`
2. 把角色的 PMX 模型（含贴图）放进 `public/models/<目录>/`，立绘放进 `public/`
3. 让 AI agent 按 [skills/port-character/SKILL.md](skills/port-character/SKILL.md) 做（Claude Code、Codex、Cursor、OpenCode 等都会从 [AGENTS.md](AGENTS.md) 找到它），
   或者自己按 [docs/PORTING.md](docs/PORTING.md) 一步步来：

```bash
npm run port -- new <id> --model public/models/<目录>/<模型>.pmx --name <角色名>   # 探测模型、生成配置
npm run port -- palette <id> --image public/<立绘>                                  # 取色
npm run port -- theme <id> --colors '#主色,#辅色,#点缀色'                            # 生成配色
npm run port -- check <id>                                                         # 检查
npm run port -- default <id>                                                       # 设为网站默认角色
npm run dev                                                                        # 打开 ?char=<id>&studio 看全部表情、演示各动作
```

4. 改 [site.json](site.json)：左上角链接、Cloudflare Pages 项目名、统计 token（**不要沿用本仓库的**）
5. `./deploy.ps1 -Prod` 部署到 Cloudflare Pages

模型、音乐、图片有版权，不要提交到仓库（`.gitignore` 已排除），也请遵守模型作者的使用条款。

## 玩法（以示例角色达妮娅为例）

| 工具 | 操作 |
| --- | --- |
| 戳脸 | 点脸颊，软软弹一下、笑一下；连戳音高会往上走 |
| 单手 / 双手拉脸 | 按住脸颊往外拖；拉久了会脸红，松手后有点生闷气；偶尔冒汗滴 |
| 捧脸 | 按住：先惊讶地嘟嘴 → 害羞地躲开视线 → 眯眼往手心里蹭；按住画圈是揉脸，揉久了会晕；松手"嘿嘿"一笑 |
| 音游 | 《しゅわしゅわハニーレモン350ml》：圆音符点一下（戳），长条按住（Wink 拉脸）到尾巴松手；支持空格 / D / F / J / K，打完弹出结算 |

滚轮 / 双指捏合缩放。左上角可以开关音效。

## 技术

- Vite + three.js 0.170（MMDLoader 读 PMX 模型，OutlineEffect 描边）
- 脸颊形变全在 GPU 着色器里（`src/rig/`）：戳的冲击场、拉扯的软垫场、回弹弹簧，只作用在脸部皮肤；垂在脸颊前的前发只在快穿模时被推开
- 表情 = 模型自带的表情 morph 组合：引擎只算通用的情绪信号（`src/expression/signals.js`），每个角色用自己的表情表把信号换成表情（`src/characters/<角色>/expressions.js`：每个动作一个招牌表情 + 变体，`?studio` 工作台里看效果）；漫画符号是 UV 表情（MMDLoader 不支持，`src/rig/symbols.js` 自己实现）
- 开放哪些动作、界面配色都由角色配置决定：工具栏按 `personality.actions` 生成，配色是 `presentation.theme` 写入的 CSS 变量
- 头发的静止姿势是离线跑一次物理烘焙出来的（角色目录下的 `hairRest.json`），运行时不开物理，不穿模、不飘
- 音效：拉脸用采样，其它用 Web Audio 现场合成（`src/audio/sfx.js`）
- 音游：`src/rhythm/`，谱面在 `src/rhythm/charts/`

### 目录结构

```
src/
  main.js            入口：选角色 → 加载 → 装配 → 主循环
  characters/        角色配置，每个角色一个目录：model 模型层 / personality 性格层 / presentation 呈现层；
                     index.js 是注册表，?char=<id> 切换
  core/              渲染舞台与镜头、加载界面与模型加载、模型准备、骨骼姿势
  rig/               参考坐标校准、形变 uniform、着色器、弹簧、点击检测、漫画符号
  interaction/       指针 / 键盘输入、交互状态、拉扯物理
  expression/        情绪信号、表情驱动（语义名 → morph）、头部动作与眨眼
  rhythm/            音游判定、界面、播放器、charts/ 谱面
  audio/  ui/        音效；工具栏（按配置生成）、主题与样式
```

站点级设置（默认角色、左上角链接、部署项目名、统计）在 `site.json`；移植工具在 `scripts/port/`。

## 本地运行示例角色

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

换模型或换形态后，在 `npm run dev` 下打开 `http://localhost:5173/?char=<角色>&bake`，烘焙完会自动写入 `src/characters/<角色>/hairRest.json`（头发的静止姿势）。

部署：`./deploy.ps1`（Cloudflare Pages，本地构建后上传，模型等素材随 `dist` 一起上传；项目名取 `site.json`）。

## 致谢与版权

- 玩法、脸部形变公式、音游谱面与拉脸音效参考 / 来自 [phoebe-face-lab](https://phoebe-face-lab.vercel.app/)
- 角色与模型版权归库洛游戏及模型作者所有，本项目仅为同人爱好，不作商用
- 音游 BGM：《しゅわしゅわハニーレモン350ml》© しゃろう（[OpenTracks / DOVA-SYNDROME](https://opentracks.com/bgm/detail/14621) 免费素材）
