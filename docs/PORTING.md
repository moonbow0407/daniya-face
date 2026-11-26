# 移植新角色

引擎代码不认识任何角色专属的名字。一个角色由三层配置组成，来源和决定者不同：

| 层 | 文件 | 内容 | 来源 | 谁决定 |
| --- | --- | --- | --- | --- |
| 模型层 | `model.js` | 材质、骨骼、表情名、坐标校准、前发避让、取景 | 模型文件 | 脚本探测，人确认 |
| 性格层 | `persona.md` + `proposals/*.js` + `personality.js` | 人设卡、2~3 套性格方案（反应节奏、表情表、彩蛋）、开放的动作 | 角色设定 | agent 写方案，用户在工作台挑选 |
| 呈现层 | `presentation.js` + `theme.js` | 名字、配色（文案和加载图用通用默认，可选定制） | 立绘 | 脚本取色，agent 选色 |

下文以 `src/characters/daniya/` 为模板，`<id>` 代表新角色的英文 id。

## 1. 准备素材（不进仓库）

| 素材 | 放在 | 配置字段 |
| --- | --- | --- |
| PMX 模型及贴图（模之屋） | `public/models/<模型目录>/` | `model.file`、`model.bytes` |
| 立绘（取色用；也可选作加载图） | `public/` | `presentation.images`（可选） |

要求模型：脸部皮肤是独立材质；有常见的 MMD 表情 morph（まばたき、笑い 等）；有 `頭`、`首` 骨骼。

## 2. 生成角色目录

```bash
npm run port -- new <id> --model public/models/<模型目录>/<模型>.pmx --name <中文名>
```

这一步会：按模板建 `src/characters/<id>/`，探测模型写出 `model.js`（材质分工、校准估算、前发、表情名映射）
和 `SURVEY.md`（探测报告：地标、前发候选、可用的漫画符号、全部表情和材质、需要人确认的地方），并在 `src/characters/index.js` 里注册。

校准是用嘴、鼻尖、眼睛高度和睫毛外缘宽度，对齐达妮娅的人工校准换算出来的（对达妮娅自己能完全复现），
仍需第 5 步目测确认。改过 `model.js` 后想重新探测：`npm run port -- survey <id> --force`（会覆盖手改）。

人设卡与性格方案：agent 写 `persona.md`，再写 2~3 套 `proposals/<名字>.js`；打开 `?char=<id>&studio` 工作台对比挑选，选中后把 `personality.js` 的 import 指向它。

配色：`npm run port -- palette <id> --image public/<立绘>` 打印候选颜色，选 3 个后 `npm run port -- theme <id> --colors '#主色,#辅色,#点缀色'` 写出 `theme.js`。

每次改完配置：`npm run port -- check <id>`，检查名字是否都能在模型里找到、文件是否齐全、每套方案能否运行，人设卡和方案是否齐全。

给 agent 的分步手册见 `skills/port-character/SKILL.md`。

## 3. 写角色配置

下面是三层配置各字段的说明。模型层由脚本生成；性格层由 agent 写方案、用户挑选；呈现层只需名字和配色。

### 3.1 模型层 `model.js`

| 字段 | 怎么定 |
| --- | --- |
| `calibration` | **最关键**。形变公式、点击区域、抓取点都写在"参考坐标"里。量出新模型的嘴、鼻尖、眼睛高度和睫毛外缘 x，与参考值（嘴 16.99、鼻尖 17.26、眼 17.51、睫毛外缘 0.813）对齐：`dy` ≈ 模型高度 − 参考高度（三处取平均；达妮娅约 −0.50，最终用 −0.49）；`sx` 先用睫毛外缘 x 之比估初值（达妮娅估出约 0.93），再看戳、拉的位置是否落在脸颊肉上微调（达妮娅最终 0.89）；`dz` 先填 0，看戳脸凹陷深浅再微调 |
| `camera` | 全景 / 特写的取景高度（模型坐标），一般在脸部中心附近 |
| `materials` | `skin` 脸部皮肤，`hitTest` 点击检测用的皮肤，`mouth` 口腔舌头，`hairOnCheek` 垂在脸颊前的前发，`symbol` 漫画符号贴片，`noOutline` 不画描边的材质 |
| `bones` | `head`、`neck`、`eyes`；`restPose` 把 A 字型手臂放下 |
| `morphs` | 语义名 → 模型表情名。模型里没有的删掉即可，表情表里用到它的地方会被跳过 |
| `symbolSpots` | 漫画符号的预设位置表情；模型没有符号贴片就删掉 |
| `hairAvoid` | 前发避让，见第 5 步 |

### 3.2 性格层 `persona.md` + `proposals/*.js` + `personality.js`

这一层决定"像不像她"。先写人设卡 `persona.md`（依据游戏设定、剧情、语音、官方表情包），再据此写 2~3 套方案。
每套方案是 `proposals/<名字>.js`：`{ title, summary, behavior, expressions, eggs }`，模板见 `proposals/base.js`。
`personality.js` 只放开放的动作，并 import 选定的方案。达妮娅是手写的，直接把 `behavior`、`expressions`、`eggs` 写在 `personality.js` 里，两种写法都支持。

| 字段 | 说明 |
| --- | --- |
| `actions` | 开放的动作，按顺序出现在右侧工具栏：`cup` 捧脸、`poke` 戳脸、`single` 单手拉脸、`double` 双手拉脸、`rhythm` 音游。不写就不出现，比如只做捏脸就只写 `poke`。`label` 是按钮文字，`limit` / `push` 是幅度上限，`rhythm` 还要 `song`（`rhythm/charts/` 里的歌）和 `hint` |
| `defaultAction` | 进页面时选中的工具 |
| `behavior` | 反应节奏：`cup.shy` / `cup.enjoy` 捧住多少秒后开始害羞 / 享受；`dizzy.energy` 揉多久会晕；`afterglow.minHold` 捧够多久松手才笑；`sulk` 拉久了会不会生闷气。设为 `false` 就没有这种反应 |
| `expressions` | 表情表：一个函数 `(p, add) => {...}`，把引擎给的情绪信号 `p` 换成语义表情，`add('eyeSmile', 0.9 * p.enjoy)`。信号列表见 `daniya/expressions.js` 开头的注释和 `src/expression/signals.js` |
| `eggs` | 拉脸时偶尔冒出的漫画符号 + 表情（`chance`、`list`），揉晕时的符号（`dizzy`）。模型没有符号贴片就删掉 |

挑选方案用工作台 `?char=<id>&studio`：人设卡、方案列表（点选即时切换）、自动演示戳 / 拉 / 捧、表情图鉴（悬停预览单个表情）。

### 3.3 呈现层 `presentation.js`

| 字段 | 说明 |
| --- | --- |
| `name` | 角色名（默认也作为网页标题） |
| `text`（可选） | 定制标题和加载提示：`title`、`loading`、`textures`、`preparing`、`failed`；不写用通用文案 |
| `images`（可选） | 加载图、音游结算图及其 alt；不写就只显示进度条、结算不带图 |
| `theme`（在 `theme.js` 的 `css`） | 界面配色，由 `palette` + `theme` 命令生成，每个键对应 `src/ui/style.css` 里的一个 CSS 变量（驼峰 → `--kebab-case`）。至少给 `bgTop`、`bgBottom`、`ink`、`accent`、`accentInk`、`shade`；其余（加载条渐变、音游音符等）不写就用默认的粉紫。建议从角色的发色、瞳色、服装主色里取，背景用最浅的那一档 |
| `outline`（在 `theme.js`） | 模型描边颜色（RGB 0..1），偏向发色的深色更协调 |

## 4. 烘焙头发静止姿势

打开 `http://localhost:5173/?char=<id>&bake`，等页面就绪后，在控制台复制 `window.__bakedHairRest`，
存为 `src/characters/<id>/hairRest.json`。不烘焙也能跑，但有些发梢可能插在脸里。

## 5. 逐项检查

打开 `http://localhost:5173/?char=<id>`，控制台里 `window.__face` 是调试入口。
页面在后台标签页时浏览器会暂停动画帧，检查会卡住或数值偏小；可以用 `__face.step(n)` 手动推进 n 帧。

| 检查 | 做法 | 不对时调什么 |
| --- | --- | --- |
| 点击区域 | 鼠标悬停脸颊，光标变成手 | `calibration`、`materials.hitTest` |
| 戳脸 | 两侧脸颊各戳几下：凹陷位置在脸颊肉上，弹回自然 | `calibration` |
| 单手 / 双手拉脸 | 拉到最大：被拉的是脸颊肉，不撕裂耳前；松手有回弹抖动 | `calibration` |
| 前发穿模 | 见下 | `hairAvoid` |
| 捧脸 | 按住后各阶段的反应符合角色 | `behavior`、`expressions` |
| 表情 | `__face.debug.morphs = { eyeSmile: 1 }` 逐个看语义表情是否对应 | `model.morphs` |
| 配色 | 背景、工具栏、加载条、音游和角色协调 | `presentation.theme` |
| 彩蛋符号 | `__face.debug.egg = { ...__face.cfg.personality.eggs.list[0] }`，符号位置合适 | `personality.eggs.list[].at / scale` |
| 音游 | 轨道从右脸颊外侧出发；长按的表情符合角色 | `expressions`（`p.rh`） |

**前发穿模的检查方法**：在控制台锁住一个拉扯状态，逐级加大，放大镜头看脸颊边缘。

```js
const T = __face.uniforms;
T.uHairFollow.value = 0;                       // 先关掉发丝避让
Object.defineProperty(T.uPullSides, 'value', { get: () => 1, set() {} });
T.uGrab.value = T.uGrab.value.clone().set(0.55, 16.95, 0.24);   // 左右都要看：x 取 ±0.55
T.uDelta.value = T.uDelta.value.clone().set(0.08, 0, 0);       // 依次 0.08 / 0.12 / 0.16 / 0.257
```

找到脸颊开始碰到发丝的拉扯量，`hairAvoid.slack` 设得比它略小；再打开避让（`follow` 0.8），
确认单手上限 0.16、音游上限 0.257 时两侧都不穿模。检查完刷新页面恢复。

## 6. 部署

`./deploy.ps1` 部署预览版；`./deploy.ps1 -Prod` 部署正式版。一个 Pages 项目对应一个角色时，
在 `src/characters/index.js` 里把 `DEFAULT_CHARACTER` 改成该角色，或者给 `deploy.ps1` 换 `-Project`。
