# AGENTS.md

给编码 agent 的项目说明（任何模型、任何工具通用）。

## 项目

MMD 捏脸模板：three.js + MMD（PMX）模型，戳脸、拉脸、捧脸、音游。Vite 构建，Cloudflare Pages 部署。
引擎与角色分离，换模型 + 写角色配置就是另一个角色的站；示例角色是达妮娅。
模型、音乐、图片等素材有版权，不在仓库里（见 README 的"本地运行"）。

## 常用命令

```bash
npm install
npm run dev                      # 开发服务器 http://localhost:5173（?char=<id> 切换角色）
npm run build                    # 构建到 dist/
npm run port -- check <id>       # 检查角色配置
```

## 目录

- `src/characters/<id>/`：角色配置（模型层 / 性格层 / 呈现层），每个角色一个目录
- `src/` 其它目录是引擎（与角色无关），结构见 README 的"目录结构"
- `site.json`：站点设置（默认角色、左上角链接、部署项目名、统计 token）
- `scripts/port/`：移植新角色的命令行工具
- `docs/PORTING.md`：移植流程的完整说明（给人看）

## 任务手册（skills）

遇到下列任务，先读对应文件并按步骤做：

| 任务 | 手册 |
| --- | --- |
| 做一个角色的捏脸站、加新角色、换角色、调整角色的表情 / 动作 / 配色 | `skills/port-character/SKILL.md` |

## 约定

- 代码注释和文档用中文。
- 单个源文件尽量不超过 ~300 行；角色专属的名字（材质、骨骼、表情名）只能出现在 `src/characters/` 里。
- 改完角色配置运行 `npm run port -- check <id>`；改引擎后运行 `npm run build`，并在浏览器里确认达妮娅（默认角色）表现不变。
- 提交、推送、部署只在用户要求时做。
