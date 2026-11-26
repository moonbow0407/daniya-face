// 探测模型：按模之屋常见命名猜材质分工、估坐标校准、找挡脸颊的前发、匹配表情名
import { round } from './pmx.mjs';

/*
 * 校准锚点：达妮娅（人工调好的校准）在模型里的地标。新模型的校准 = 达妮娅校准 + 地标差。
 * 地标都是材质中心：嘴 kou1、鼻尖 nose1、眼 MI_Eye1、睫毛外缘 jie1 的最大 x。
 */
const ANCHOR = {
  mouthY: 16.485, noseY: 16.74, eyeY: 17.019, eyeZ: 0.315, lashX: 0.755,
  calibration: { sx: 0.89, dy: -0.49, dz: 0.02, faceWidth: 2.142 },
  camera: { wideY: 16.45, wideYPortrait: 16.2, closeY: 16.78, wideHeight: 6.4, wideWidth: 4.6, wideWidthPortrait: 3.1, closeHeight: 1.9, closeWidth: 1.7 },
};

const ROLES = {
  eye: /^MI_Eye\d*$|^eye\d*$|瞳|^目$|eyeball/i,
  lash: /^jie\d*|睫|lash/i,
  nose: /^nose\d*|鼻/i,
  mouth: /^kou\d*|^口|mouth|^she\d*|舌|tongue|teeth|歯|牙/i,
  skin: /^face\d*|顔|颜|面部|^脸/i,
  cheek: /^cheek|頬|腮/i,
  hair: /发|髪|hair/i,
  emo: /^emo\d*/i,
};
const NOT_LIP = /she|舌|tongue|teeth|歯|牙/i;

/** 语义表情 → 常见的 MMD 表情名（按优先级） */
export const MORPH_ALIASES = {
  blink: ['まばたき', '瞬き', 'blink'],
  browDown: ['下', '眉下'],
  browUp: ['上', '眉上'],
  browTrouble: ['困る', '困り'],
  browTroubleL: ['左困る', '困る左'],
  browTroubleR: ['右困る', '困る右'],
  eyeSurprise: ['びっくり', '驚き'],
  eyeHalf: ['じと目', 'ジト目', '半目'],
  eyeSmile: ['笑い', '笑顔'],
  eyeRelaxL: ['なごみL', 'なごみ左', 'なごみ'],
  eyeRelaxR: ['なごみR', 'なごみ右', 'なごみ'],
  wink: ['ウィンク', 'ウインク', 'ウィンク２', 'wink'],
  mouthNarrow: ['口横狭め', '口すぼめ'],
  mouthCornerDown: ['口角下げ'],
  mouthCornerUp: ['口角上げ'],
  mouthCornerUpL: ['左口角上げ', '口角上げ左'],
  mouthCornerUpR: ['右口角上げ', '口角上げ右'],
  mouthWideL: ['左口横広げ', '口横広げ左'],
  mouthWideR: ['右口横広げ', '口横広げ右'],
  mouthForward: ['口前', 'ω'],
  mouthWedge: ['∧'],
  mouthTriangle: ['▲'],
  tongue: ['ぺろっ', 'てへぺろ', '舌出し'],
  grin: ['hehe', 'にやり'],
  smileSoft: ['にこり', 'にっこり'],
  shy: ['照れ', '赤面'],
  pout: ['(○｀ε´○)', 'ぷくー', 'むー'],
  serious: ['真面目', '真剣'],
};

export function survey(model) {
  const notes = []; // 需要人看的地方
  const byRole = (re, filter = () => true) => model.materials.filter((m) => m.count && re.test(m.name) && filter(m));

  // --- 地标 → 校准 ---
  const eye = byRole(ROLES.eye)[0];
  const lash = byRole(ROLES.lash)[0];
  const nose = byRole(ROLES.nose)[0];
  const lip = byRole(ROLES.mouth, (m) => !NOT_LIP.test(m.name))[0];
  const marks = {};
  if (eye) { marks.eyeY = eye.center[1]; marks.eyeZ = eye.center[2]; }
  else if (model.bones['右目']) { marks.eyeY = model.bones['右目'][1] + 0.034; notes.push('没找到眼睛材质，眼睛高度按 右目 骨骼估算（低可信度）'); }
  if (nose) marks.noseY = nose.center[1];
  if (lip) marks.mouthY = lip.center[1];
  if (lash) marks.lashX = lash.max[0];
  else if (eye) { marks.lashX = eye.max[0] * (ANCHOR.lashX / 0.531); notes.push('没找到睫毛材质，脸宽按眼睛材质估算（低可信度）'); }

  const dys = ['mouthY', 'noseY', 'eyeY'].filter((k) => marks[k] !== undefined).map((k) => marks[k] - ANCHOR[k]);
  if (dys.length < 2) notes.push(`只找到 ${dys.length} 个高度地标（嘴/鼻/眼），dy 不可靠，必须目测微调`);
  const dyShift = dys.length ? dys.reduce((a, b) => a + b, 0) / dys.length : 0;
  const ratio = marks.lashX ? marks.lashX / ANCHOR.lashX : 1;
  if (!marks.lashX) notes.push('没有脸宽地标，sx 沿用达妮娅的值，必须目测微调');
  const calibration = {
    sx: round(ANCHOR.calibration.sx * ratio),
    dy: round(ANCHOR.calibration.dy + dyShift),
    dz: round(ANCHOR.calibration.dz + (marks.eyeZ !== undefined ? marks.eyeZ - ANCHOR.eyeZ : 0)),
    faceWidth: ANCHOR.calibration.faceWidth,
  };

  // --- 材质分工 ---
  const skinMats = [...byRole(ROLES.skin), ...byRole(ROLES.cheek)];
  const mouthMats = byRole(ROLES.mouth);
  const emoMats = byRole(ROLES.emo);
  const hitTest = skinMats.filter((m) => m.center[2] > 0).map((m) => m.name);
  if (!skinMats.length) notes.push('没找到脸部皮肤材质（face/顔），必须手动填 materials.skin 和 hitTest');
  if (!mouthMats.length) notes.push('没找到口腔/舌头材质，戳脸时嘴里可能穿模');

  // 漫画符号：UV 表情改动的顶点集中在哪个材质
  const counts = new Map();
  for (const u of model.uvMorphs) for (const v of u.vertices) {
    const name = model.materials[model.vertexMaterial[v]]?.name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const symbol = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const symbolSpots = symbol ? model.vertexMorphs.filter((n) => n.startsWith(symbol) && n !== symbol) : [];
  if (!symbol) notes.push('模型没有 UV 表情做的漫画符号：personality.eggs 里的符号不可用，可以只保留表情或删掉彩蛋');

  // 挡在脸颊前的前发：拉扯软垫场在发丝顶点上的最大权重
  const hairWeights = byRole(ROLES.hair).map((m) => ({ name: m.name, weight: round(maxPadWeight(model, m, calibration), 2) }));
  const hairOnCheek = hairWeights.filter((h) => h.weight > 0.5).map((h) => h.name);

  // --- 表情名 ---
  const have = new Set(model.vertexMorphs);
  const morphs = {}, missing = [];
  for (const [key, names] of Object.entries(MORPH_ALIASES)) {
    const hit = names.find((n) => have.has(n));
    if (hit) morphs[key] = hit; else missing.push(key);
  }
  if (missing.length) notes.push(`这些语义表情在模型里没找到对应：${missing.join(', ')}（表情表里用到它们的地方会被跳过；可在模型表情列表里人工找替代）`);

  // --- 骨骼 ---
  const bones = { head: '頭', neck: '首', eyes: ['右目', '左目'].filter((n) => model.bones[n]) };
  for (const n of ['頭', '首']) if (!model.bones[n]) notes.push(`缺少骨骼 ${n}，头部动作和拖动换算会出错，必须手动指定`);
  const restPose = [['左腕', 0, 0, -0.62], ['右腕', 0, 0, 0.62], ['左ひじ', 0, -0.25, 0], ['右ひじ', 0, 0.25, 0]].filter(([n]) => model.bones[n]);

  // --- 取景：按眼睛高度平移、按脸宽缩放 ---
  const eyeShift = (marks.eyeY ?? ANCHOR.eyeY) - ANCHOR.eyeY;
  const c = ANCHOR.camera;
  const camera = {
    wideY: round(c.wideY + eyeShift), wideYPortrait: round(c.wideYPortrait + eyeShift), closeY: round(c.closeY + eyeShift),
    wideHeight: round(c.wideHeight * ratio, 2), wideWidth: round(c.wideWidth * ratio, 2), wideWidthPortrait: round(c.wideWidthPortrait * ratio, 2),
    closeHeight: round(c.closeHeight * ratio, 2), closeWidth: round(c.closeWidth * ratio, 2),
  };

  return {
    marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, round(v)])),
    calibration,
    camera,
    materials: {
      skin: skinMats.map((m) => m.name),
      hitTest,
      mouth: mouthMats.map((m) => m.name),
      hairOnCheek,
      symbol,
      noOutline: [...new Set([...skinMats, ...mouthMats, ...emoMats].map((m) => m.name))],
    },
    hairWeights,
    bones: { ...bones, restPose },
    morphs,
    missingMorphs: missing,
    symbolSpots,
    uvSymbols: model.uvMorphs.map((u) => u.name),
    notes,
  };
}

/** 与着色器 PULL 里软垫场同样的公式（单侧抓在 ±0.55, 16.95, 0.24），取材质顶点上的最大值 */
function maxPadWeight(model, mat, cal) {
  const ss = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let best = 0;
  for (const k of mat.vertices) {
    const [x, y, z] = model.positions[k];
    const rx = x / cal.sx, ry = y - cal.dy, rz = z - cal.dz;
    const lat = Math.abs(rx);
    const cz = 0.24 - 0.39 * ss(lat, 0.42, 0.82);
    const r2 = ((lat - 0.55) / 0.44) ** 2 + ((ry - 16.95) / 0.32) ** 2 + ((rz - cz) / 0.51) ** 2;
    const pad = (1 + 0.65 * r2) * Math.exp(-r2) * ss(lat, 0.16, 0.43) * ss(ry, 16.62, 16.91) * (1 - ss(ry, 17.14, 17.43));
    if (pad > best) best = pad;
  }
  return best;
}
