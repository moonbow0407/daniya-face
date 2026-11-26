# 移植新角色

引擎代码不认识任何角色专属的名字。一个角色由三层配置组成，来源和决定者不同：

| 层 | 文件 | 内容 | 来源 | 谁决定 |
| --- | --- | --- | --- | --- |
| 模型层 | `model.js` | 材质、骨骼、表情名、坐标校准、前发避让、取景 | 模型文件 | 脚本探测，人确认 |
| 性格层 | `personality.js` + `expressions.js` | 开放的动作、反应节奏、表情表、彩蛋 | 角色设定 | **熟悉角色的人拍板** |
| 呈现层 | `presentation.js` | 文案、图片、配色 | 角色配色、立绘 | 取色后微调 |

下文以 `src/characters/daniya/` 为模板，`<id>` 代表新角色的英文 id。

## 1. 准备素材（不进仓库）

| 素材 | 放在 | 配置字段 |
| --- | --- | --- |
| PMX 模型及贴图（模之屋） | `public/models/<模型目录>/` | `model.file`、`model.bytes` |
| 加载图、音游结算图 | `public/` | `presentation.images` |

要求模型：脸部皮肤是独立材质；有常见的 MMD 表情 morph（まばたき、笑い 等）；有 `頭`、`首` 骨骼。

## 2. 查看模型

```bash
node scripts/inspect-pmx.mjs public/models/<模型目录>/<模型>.pmx   # 材质、骨骼、表情列表 → scripts/model-report.json
node scripts/measure-face.mjs public/models/<模型目录>/<模型>.pmx  # 脸部各材质的包围盒与中心
```

`measure-face.mjs` 里用正则筛材质名，换模型时按新模型的名字改一下。

## 3. 写角色配置

复制 `src/characters/daniya/` 为 `src/characters/<id>/`，改 `index.js` 里的 `id`，在 `src/characters/index.js` 里注册。

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

### 3.2 性格层 `personality.js` + `expressions.js`

这一层决定"像不像她"。**依据角色在游戏里的立绘、剧情演出、语音和官方表情包来定，不要照搬达妮娅的**，否则就会 OOC。

| 字段 | 说明 |
| --- | --- |
| `actions` | 开放的动作，按顺序出现在右侧工具栏：`cup` 捧脸、`poke` 戳脸、`single` 单手拉脸、`double` 双手拉脸、`rhythm` 音游。不写就不出现，比如只做捏脸就只写 `poke`。`label` 是按钮文字，`limit` / `push` 是幅度上限，`rhythm` 还要 `song`（`rhythm/charts/` 里的歌）和 `hint` |
| `defaultAction` | 进页面时选中的工具 |
| `behavior` | 反应节奏：`cup.shy` / `cup.enjoy` 捧住多少秒后开始害羞 / 享受；`dizzy.energy` 揉多久会晕；`afterglow.minHold` 捧够多久松手才笑；`sulk` 拉久了会不会生闷气。设为 `false` 就没有这种反应 |
| `expressions` | 表情表：一个函数 `(p, add) => {...}`，把引擎给的情绪信号 `p` 换成语义表情，`add('eyeSmile', 0.9 * p.enjoy)`。信号列表见 `daniya/expressions.js` 开头的注释和 `src/expression/signals.js` |
| `eggs` | 拉脸时偶尔冒出的漫画符号 + 表情（`chance`、`list`），揉晕时的符号（`dizzy`）。模型没有符号贴片就删掉 |

写表情表的建议：先列出这个角色对每种动作的"一句话反应"（比如"被戳会嫌弃地皱眉"），和用户确认，再翻译成 `add(...)`。
用 `__face.debug.morphs = { 语义名: 1 }` 逐个看模型表情的实际效果。

### 3.3 呈现层 `presentation.js`

| 字段 | 说明 |
| --- | --- |
| `name`、`text` | 角色名、标题和加载提示 |
| `images` | 加载图、音游结算图及其 alt |
| `theme` | 界面配色，每个键对应 `src/ui/style.css` 里的一个 CSS 变量（驼峰 → `--kebab-case`）。至少给 `bgTop`、`bgBottom`、`ink`、`accent`、`accentInk`、`shade`；其余（加载条渐变、音游音符等）不写就用默认的粉紫。建议从角色的发色、瞳色、服装主色里取，背景用最浅的那一档 |
| `outline` | 模型描边颜色（线性 RGB 0..1），偏向发色的深色更协调 |

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
