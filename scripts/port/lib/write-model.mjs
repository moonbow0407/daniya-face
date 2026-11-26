// 把探测结果写成角色目录下的 model.js（模型层配置）和 SURVEY.md（探测报告，列出需要人确认的地方）
const j = (v) => JSON.stringify(v);

export function modelJs({ file, bytes, texDir, r }) {
  const morphLines = Object.entries(r.morphs).map(([k, v]) => `    ${k}: ${j(v)},`);
  const missing = r.missingMorphs.map((k) => `    // ${k}: '',  // 模型里没找到，表情表里用到它的地方会被跳过`);
  return `/*
 * 模型层（由 \`npm run port -- survey\` 生成，可以手改；重新生成会覆盖，需要加 --force）
 * 模型文件本身决定的东西：材质、骨骼、表情名、坐标校准。探测报告见同目录 SURVEY.md。
 */
import hairRest from './hairRest.json';

export default {
  file: ${j(file)},
  bytes: ${bytes}, // 服务器不给 content-length 时，用它估算加载进度
  texDir: ${j(texDir)}, // 贴图目录在磁盘上的真实名字（区分大小写；check 会逐张核对）

  /*
   * 模型坐标 ↔ 参考坐标：model.x = ref.x * sx, model.y = ref.y + dy, model.z = ref.z + dz
   * 按地标（嘴、鼻尖、眼睛高度，睫毛外缘宽度）对齐达妮娅的人工校准估算：${j(r.marks)}
   */
  calibration: ${j(r.calibration)},

  /** 前发避让：沿用达妮娅的值，必须按 docs/PORTING.md 第 5 步目测调整 */
  hairAvoid: { slack: 0.11, knee: 0.03, follow: 0.8 },

  /** 镜头取景（模型坐标），按眼睛高度和脸宽从达妮娅的取景换算 */
  camera: ${j(r.camera)},

  materials: {
    skin: ${j(r.materials.skin)}, // 拉 + 戳 + 泛红
    hitTest: ${j(r.materials.hitTest)}, // 点击检测只看这些材质
    mouth: ${j(r.materials.mouth)}, // 口腔、舌头：只跟随戳
    followPoke: ${j(r.materials.followPoke)}, // 眼睛、睫毛等：只跟随戳（戳脸颊时不从皮肤后面露出来）
    hairOnCheek: ${j(r.materials.hairOnCheek)}, // 垂在脸颊前的发丝：快穿模时被推开
    symbol: ${j(r.materials.symbol)}, // 漫画符号贴片
    noOutline: ${j(r.materials.noOutline)}, // 会变形或是贴纸的材质不画描边
  },

  bones: {
    head: ${j(r.bones.head)},
    neck: ${j(r.bones.neck)},
    eyes: ${j(r.bones.eyes)},
    /** 手臂放下：[骨骼名, x, y, z]（弧度，YXZ 顺序）。默认按 A 字型模型，姿势不对就调 */
    restPose: ${j(r.bones.restPose)},
  },

  /** 头发静止姿势（打开 ?char=<id>&bake 烘焙得到） */
  hairRest,

  /** 表情：语义名 → 模型里的顶点表情名 */
  morphs: {
${[...morphLines, ...missing].join('\n')}
  },

  /** 漫画符号的预设位置（位置表情名） */
  symbolSpots: ${j(r.symbolSpots)},
};
`;
}

export function surveyMd({ id, file, model, r }) {
  const list = (a) => (a.length ? a.map((x) => `- ${x}`).join('\n') : '- （无）');
  return `# 探测报告：${id}

模型：\`${file}\`（${model.name}），顶点 ${model.positions.length}，材质 ${model.materials.length}，顶点表情 ${model.vertexMorphs.length}。
此文件由 \`npm run port -- survey ${id}\` 生成。

## 需要人确认

${list(r.notes)}
- 校准（calibration）与前发避让（hairAvoid）是估算值，必须按 docs/PORTING.md 第 5 步在浏览器里目测确认

## 地标

${Object.entries(r.marks).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- （无）'}

## 前发候选（软垫场最大权重，> 0.5 判为挡脸颊）

${r.hairWeights.map((h) => `- ${h.name}: ${h.weight}`).join('\n') || '- （无头发材质）'}

## UV 漫画符号（填到 eggs 的 symbol；没有就只用顶点表情）

${r.uvSymbols.join('、') || '（无）'}

## 顶点表情按材质分组（长什么样在工作台"全部表情"里看缩略图）

眼部贴片（><、X_X、漩涡、爱心）和漫画符号通常在单独的小材质上，比嘴型明显得多，优先考虑。

${Object.entries(r.morphsByMaterial).map(([mat, names]) => `- **${mat}**：${names.join('、')}`).join('\n')}

## 全部材质

${model.materials.map((m) => `- ${m.name}（${m.count} 顶点，中心 ${m.center.map((v) => v.toFixed(2)).join(', ')}）`).join('\n')}
`;
}
