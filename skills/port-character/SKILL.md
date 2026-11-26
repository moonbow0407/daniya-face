---
name: port-character
description: 用 MMD 捏脸模板给一个角色（模之屋 PMX 模型）做捏脸网站，或往已有的站里加角色：从模板建项目、脚本探测模型、agent 写人设卡和 2~3 套性格方案供用户在工作台挑选、脚本取色后 agent 选配色、检查、验收、部署。用户说"做一个 XX 的捏脸""加一个角色""换成 XX""移植 XX"，或者给了新的 .pmx 模型时使用。也用于给已有角色重写性格方案、换配色。
---

# 用捏脸模板做一个角色

写给任何编码 agent（不依赖特定模型或工具）。需要能读写文件、运行命令；能看图、能开浏览器更好，但不是必须。
本手册随引擎模板仓库一起分发：手册里的命令、目录、工作台都是模板自带的。

分工：**算得出来的交给脚本**（`npm run port`）；**需要理解角色的交给你**（人设、性格方案、配色选择），放手去写；**最终挑选和观感由用户核验**。

## 规则

1. 只改 `src/characters/<id>/` 里的文件和 `site.json`（`npm run port` 会自动改 `src/characters/index.js`）。引擎代码不动；觉得引擎缺功能，告诉用户。
2. 模型里的名字（材质、骨骼、表情、漫画符号）只能用 `SURVEY.md` 和 `model.js` 里出现过的，不要编。
3. 每次改完运行 `npm run port -- check <id>`，修到 0 个 `✗` 错误为止。
4. 性格方案由用户挑选：写好方案后请用户在工作台里比较，再按用户的选择切换。

## 流程

| 步骤 | 谁 | 产出 |
| --- | --- | --- |
| 0 建项目 | 你 + 用户 | 用户自己的仓库、`site.json` |
| 1 导入 | 脚本 | 角色目录、`model.js`、`SURVEY.md` |
| 2 人设卡 | 你 | `persona.md` |
| 3 性格方案 | 你 | `proposals/*.js`（2~3 套） |
| 4 挑选 | 用户（工作台） | `personality.js` 指向选中的方案 |
| 5 配色 | 脚本取色 → 你选 | `theme.js` |
| 6 检查 | 脚本 | `check` 0 错误 |
| 7 验收 | 脚本烘焙 + 用户看 | `hairRest.json`；没有穿模、位置对 |
| 8 上线 | 脚本 + 用户 | 设为默认角色、部署 |

### 0. 建项目（已经在模板项目里就跳过）

判断：当前目录有 `site.json` 和 `scripts/port/` 就是模板项目，直接到第 1 步。否则请用户从模板建自己的仓库：

- GitHub 网页上打开模板仓库，点 **Use this template**；或者用 GitHub CLI：
  `gh repo create <新仓库名> --template <模板仓库> --public --clone`（模板仓库地址问用户，默认 `moonbow0407/daniya-face`）
- 进入目录，`npm install`

然后改 `site.json`（问用户要值，不要沿用模板作者的）：
- `links`：左上角链接按钮。"源码"改成用户自己的仓库地址；"原站"是玩法出处的致谢，建议保留
- `cloudflare.pagesProject`：用户自己的 Cloudflare Pages 项目名
- `cloudflare.analyticsToken`：用户自己的统计 token，没有就**清空**（留着会把访问量统计到模板作者的账号）

模板自带示例角色 `daniya`（素材不在仓库里，打不开是正常的）。等用户自己的角色做好后，问用户要不要删掉示例（第 8 步）。

### 1. 导入

需要：角色中文名、英文 id（小写，如 `phoebe`）、模型 `.pmx` 路径（放在 `public/models/<目录>/`，贴图同目录）。缺什么问用户。

```bash
npm run port -- new <id> --model public/models/<目录>/<模型>.pmx --name <中文名>
```

输出里有"校准估算""前发候选""匹配到表情 N 个"和"需要人确认"。把"需要人确认"的条目转告用户。
读一遍 `src/characters/<id>/SURVEY.md`：模型有哪些表情、哪些漫画符号，写方案时要用。

### 2. 人设卡

按模板填 `src/characters/<id>/persona.md`：出处、性格关键词、神态与小动作、对被戳 / 捏 / 捧脸会怎么反应、打算写哪几套方案。
依据角色在游戏里的设定、剧情、语音、官方表情包（能查资料就查）；用户给了设定就以用户的为准。推测的内容标"推测"，写明来源。

### 3. 性格方案（2~3 套）

每套方案一个文件：复制 `proposals/base.js` 为 `proposals/<英文名>.js`（如 `cool.js`、`shy.js`），写：

- `title` / `summary`：一句话说清这套的性格侧重（工作台里显示）
- `behavior`：反应节奏。不符合角色的反应设为 `false`（如高冷角色可能不会"捧久了享受"）
- `expressions(p, add)`：情绪信号 → 表情。信号含义见 `base.js` 顶部注释；完整的参考写法见 `src/characters/daniya/expressions.js`
- `eggs`（可选）：拉脸时偶尔冒的漫画符号 + 表情，符号从 `SURVEY.md` 里选

方案之间要有明显差别（比如"嘴硬傲娇 / 慌乱害羞 / 从容调侃"），都要贴合人设卡。写完运行 `check`，每个方案都会被试跑。

写表情的要点：
- 每个动作对应信号：戳 `p.pokeFace`（之后的余韵 `p.pokes`），拉 `p.h`，捧 `p.es` → `p.shy` → `p.enjoy`，拉久松手 `p.sulk`，捧完松手 `p.afterglow`，揉晕 `p.dizzy`，音游长按 `p.rh`
- 眼部表情（`eyeHalf`、`eyeRelaxL/R` 等）乘 `p.open`，否则和眨眼叠在一起会变形
- 数值一般 0.2~0.9；同时叠的表情越多，每个越小
- 保留 `base.js` 里的物理反应（被拉一侧嘴角拉开、被托住嘴被挤）
- 不知道某个表情长什么样：在工作台的"表情图鉴"里看（见第 4 步），或者对照 `daniya/expressions.js` 的用法

常用搭配（参考，不必照搬）：开心 `eyeSmile` + `mouthCornerUp`；害羞 `shy` + `browTrouble` + `eyeHalf`；嫌弃 `eyeHalf` + `serious` + `mouthCornerDown`；吃惊 `eyeSurprise` + `browUp` + `mouthWedge`；生闷气 `pout` + `serious` + `mouthForward`；坏笑 `grin` + `mouthCornerUp`；俏皮 `wink` + `tongue`。

### 4. 挑选（工作台）

```bash
npm run dev
```

请用户打开 `http://localhost:5173/?char=<id>&studio`。左下角工作台里有：人设卡、方案列表（点选即时切换）、演示按钮（自动做一遍戳 / 拉 / 捧）、表情图鉴（悬停预览单个表情）。
你能开浏览器的话，可以先自己截图看一遍，把明显不好的方案改掉再给用户。

用户选定后，把 `personality.js` 里的 `import chosen from './proposals/base.js'` 改成选中的方案文件。
用户想混搭（"A 的戳 + B 的捧"）或微调，就新建或修改方案文件，再请用户看。
`personality.js` 的 `actions` 决定开放哪些动作（默认戳、单手拉、双手拉、捧），用户有要求再改。

### 5. 配色

```bash
npm run port -- palette <id> --image public/<立绘或加载图>
```

输出按"占比 × 饱和度"排序的候选颜色。结合立绘（能看图就看）选 3 个：**主色**（通常是发色）、**辅色**（瞳色或服装主色）、**点缀色**（饰品色），然后：

```bash
npm run port -- theme <id> --colors '#主色,#辅色,#点缀色'
```

没有立绘时，可以用模型贴图（`public/models/<目录>/tex/` 下的头发、服装贴图）取色。界面的其它文案和加载图用通用默认，用户提出要定制再加（见 `presentation.js` 注释）。

### 6. 检查

```bash
npm run port -- check <id>
```

0 个 `✗` 错误才算过。`!` 提醒：人设卡没写、方案不足 2 套、还在用 base 方案、头发没烘焙、图片缺失。

### 7. 验收

1. **烘焙头发**：打开 `http://localhost:5173/?char=<id>&bake`，等加载完，在浏览器控制台运行 `copy(window.__bakedHairRest)`，粘贴保存为 `src/characters/<id>/hairRest.json`。不能操作浏览器就请用户做。
2. **请用户看**：
   - 戳、拉的位置在脸颊肉上。偏了就调 `model.js` 的 `calibration`：上下偏调 `dy`，内外偏调 `sx`，每次 0.01~0.02
   - 拉到最大时脸颊不从头发里穿出来。穿了就调小 `hairAvoid.slack`（发丝更早让开）
   - 表情、配色符合角色。不对就回第 3 / 5 步
3. 自己能开浏览器时：页面在后台标签页会暂停动画，可在控制台用 `__face.step(60)` 手动推进帧。完整检查清单见 `docs/PORTING.md` 第 5 节。

### 8. 上线

- 设为网站默认角色（不带 `?char=` 打开时显示它）：`npm run port -- default <id>`
- 用户不需要示例角色了：`npm run port -- remove daniya --yes`
- 部署：`./deploy.ps1`（预览）或 `./deploy.ps1 -Prod`（正式），项目名取 `site.json`。第一次会打开浏览器登录 Cloudflare，请用户自己完成登录
- 素材（模型、图片、音乐）不进 git，`.gitignore` 已排除；提醒用户遵守模型作者的使用条款

## 完成时汇报

新增了哪些文件、用户选了哪套方案、配色用了哪三个颜色、`check` 结果、哪些还没在浏览器里验收。提交、推送、部署只在用户要求时做。
