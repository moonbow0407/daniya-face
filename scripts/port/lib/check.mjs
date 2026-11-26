// 静态检查角色配置：名字都能在模型里找到、文件和贴图都在、格式对；表情表试跑一遍，并看各动作的表情有没有拉开差别
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPmx } from './pmx.mjs';
import { missingTextures } from './textures.mjs';

const ACTIONS = ['poke', 'single', 'double', 'cup', 'rhythm'];
const BEHAVIORS = ['cup', 'dizzy', 'afterglow', 'sulk'];

export async function check({ id, root, loadModule }) {
  const errors = [], warnings = [], ok = [];
  const dir = join(root, 'src/characters', id);
  const pub = (p) => join(root, 'public', p.replace(/^\//, ''));
  if (!existsSync(join(dir, 'index.js'))) return { errors: [`没有 src/characters/${id}/index.js（先运行 npm run port -- new ${id} ...）`], warnings, ok };

  let cfg;
  try { cfg = (await loadModule(`/src/characters/${id}/index.js`)).default; }
  catch (e) { return { errors: [`配置加载失败：${e.message}`], warnings, ok }; }
  const reg = readFileSync(join(root, 'src/characters/index.js'), 'utf8');
  if (!new RegExp(`CHARACTERS = \\{[^}]*\\b${id}\\b`).test(reg)) errors.push(`没有在 src/characters/index.js 的 CHARACTERS 里注册 ${id}`);
  if (cfg.id !== id) errors.push(`index.js 里的 id 是 "${cfg.id}"，应与目录名 "${id}" 一致`);
  const { model: m = {}, personality: p = {}, presentation: v = {} } = cfg;

  // ---------- 模型层 ----------
  let pmx = null;
  if (!m.file || !existsSync(pub(m.file))) errors.push(`model.file 指向的模型不存在：public${m.file}`);
  else {
    pmx = loadPmx(pub(m.file)); ok.push(`模型 ${m.file}（${pmx.name}）`);
    const lost = missingTextures(pub(m.file), pmx.textures, m.texDir ?? 'tex');
    if (lost.length) errors.push(`${lost.length} 张贴图在磁盘上找不到或大小写不一致（服务器区分大小写，找不到时模型只剩描边）：${lost.slice(0, 5).join('、')}${lost.length > 5 ? ' …' : ''}。核对 public${m.file.replace(/[^/]+$/, '')} 下的目录名和 model.texDir`);
    else ok.push(`贴图 ${new Set(pmx.textures).size} 张都在（目录 ${m.texDir ?? 'tex'}/）`);
  }
  for (const k of ['sx', 'dy', 'dz', 'faceWidth']) if (typeof m.calibration?.[k] !== 'number') errors.push(`model.calibration.${k} 缺失或不是数字`);
  if (pmx) {
    const mats = new Set(pmx.materials.map((x) => x.name));
    const mt = m.materials ?? {};
    for (const key of ['skin', 'hitTest', 'mouth', 'followPoke', 'hairOnCheek', 'noOutline']) {
      for (const n of mt[key] ?? []) if (!mats.has(n)) errors.push(`model.materials.${key} 里的材质 "${n}" 在模型里不存在`);
    }
    if (!mt.skin?.length) errors.push('model.materials.skin 为空：至少要有脸部皮肤材质');
    if (!mt.hitTest?.length) errors.push('model.materials.hitTest 为空：点击检测需要脸部皮肤材质');
    if (mt.symbol && !mats.has(mt.symbol)) errors.push(`model.materials.symbol "${mt.symbol}" 在模型里不存在`);
    const vs = m.vertexSymbols;
    if (vs) {
      if (!mats.has(vs.material)) errors.push(`model.vertexSymbols.material "${vs.material}" 在模型里不存在`);
      for (const [k, o] of Object.entries(vs.list ?? {})) {
        if (!m.morphs?.[k]) errors.push(`model.vertexSymbols.list.${k} 没有在 model.morphs 里映射`);
        if (!Array.isArray(o.at) || o.at.length !== 3) errors.push(`model.vertexSymbols.list.${k}.at 应为 [x, y, z]`);
      }
    }
    const b = m.bones ?? {};
    for (const n of [b.head, b.neck, ...(b.eyes ?? []), ...(b.restPose ?? []).map((r) => r[0])]) {
      if (!n || !pmx.bones[n]) errors.push(`model.bones 里的骨骼 "${n}" 在模型里不存在`);
    }
    const morphNames = new Set(pmx.vertexMorphs);
    for (const [k, n] of Object.entries(m.morphs ?? {})) if (n && !morphNames.has(n)) errors.push(`model.morphs.${k} = "${n}" 在模型的顶点表情里不存在`);
    for (const n of m.symbolSpots ?? []) if (!morphNames.has(n)) errors.push(`model.symbolSpots 里的 "${n}" 在模型的顶点表情里不存在`);
  }
  if (typeof m.hairRest === 'string') errors.push('hairRest.json 是一个字符串（从控制台复制时多包了一层引号），引擎读不到；重新烘焙：npm run dev 下打开 /?char=' + id + '&bake');
  else if (!m.hairRest || !Object.keys(m.hairRest).length) warnings.push(`hairRest.json 为空：还没烘焙头发静止姿势（npm run dev 下打开 /?char=${id}&bake，会自动写入）`);

  // ---------- 性格层 ----------
  const actions = Object.keys(p.actions ?? {});
  if (!actions.length) errors.push('personality.actions 为空：至少开放一个动作');
  for (const a of actions) if (!ACTIONS.includes(a)) errors.push(`personality.actions.${a} 不是已知动作（可用：${ACTIONS.join(' / ')}）`);
  if (p.defaultAction && !actions.includes(p.defaultAction)) errors.push(`personality.defaultAction "${p.defaultAction}" 没有在 actions 里开放`);
  const song = p.actions?.rhythm?.song;
  if (p.actions?.rhythm) {
    if (!song?.notes?.length) errors.push('personality.actions.rhythm.song 缺失或没有谱面（从 src/rhythm/charts/ 里 import 一首）');
    const { tap = 'poke' } = p.actions.rhythm;
    if (!['poke', 'single'].includes(tap)) errors.push(`personality.actions.rhythm.tap 只能是 'poke' 或 'single'（现在是 ${JSON.stringify(tap)}）`);
    else if (!existsSync(pub(song.url))) warnings.push(`音游歌曲文件不存在：public${song.url}（音游会提示"音乐加载失败"）`);
  }
  const uv = new Set(pmx?.uvMorphs.map((u) => u.name) ?? []);
  const sheetCtx = { m, pmx, uv, errors, warnings, ok };
  checkSheet('personality', p, sheetCtx);

  checkContrast(p, { m, warnings, ok });

  // ---------- 呈现层 ----------
  for (const k of ['loading', 'finale']) if (v.images?.[k] && !existsSync(pub(v.images[k]))) warnings.push(`图片不存在：public${v.images[k]}`);
  const cssVars = new Set([...readFileSync(join(root, 'src/ui/style.css'), 'utf8').matchAll(/--([a-z0-9-]+):/g)].map((x) => x[1]));
  for (const [k, val] of Object.entries(v.theme ?? {})) {
    const name = k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/(\D)(\d)/g, '$1-$2');
    if (!cssVars.has(name)) errors.push(`presentation.theme.${k} 对应的 CSS 变量 --${name} 不存在`);
    else if (!(Array.isArray(val) ? val.length === 3 : /^#[0-9a-f]{6}$/i.test(val))) errors.push(`presentation.theme.${k} 格式不对（应为 '#rrggbb' 或 [r, g, b]）：${JSON.stringify(val)}`);
  }

  return { errors, warnings, ok };
}

/** 检查表情表能跑、用到的名字存在、彩蛋合法 */
function checkSheet(label, sheet, { m, pmx, uv, errors, warnings, ok }) {
  if (typeof sheet.expressions !== 'function') { errors.push(`${label}.expressions 不是函数`); return; }
  const semantic = new Set(Object.keys(m.morphs ?? {}).filter((k) => m.morphs[k]));
  const used = new Set();
  for (const sig of fakeSignals(sheet.eggs)) {
    try { sheet.expressions(sig, (k, val) => { used.add(k); if (!Number.isFinite(val)) throw new Error(`add('${k}', ${val}) 的值不是有限数字`); }); }
    catch (e) { errors.push(`${label} 的表情表运行出错：${e.message}`); return; }
  }
  const unknown = [...used].filter((k) => !semantic.has(k));
  if (unknown.length) warnings.push(`${label} 的表情表用到了 model.morphs 里没有的语义名（会被跳过）：${unknown.join(', ')}`);
  for (const k of Object.keys(sheet.behavior ?? {})) if (!BEHAVIORS.includes(k)) errors.push(`${label}.behavior.${k} 不是已知的反应（可用：${BEHAVIORS.join(' / ')}）`);
  const eggs = [...(sheet.eggs?.list ?? []).map((e, i) => [`list[${i}]`, e]), ...(sheet.eggs?.dizzy ? [['dizzy', sheet.eggs.dizzy]] : [])];
  for (const [i, egg] of eggs) {
    if (!egg.symbol) { if (!egg.morphs) errors.push(`${label}.eggs.${i} 既没有 symbol 也没有 morphs`); continue; } // 只有表情的彩蛋
    if (pmx && !uv.has(egg.symbol)) errors.push(`${label}.eggs.${i}.symbol "${egg.symbol}" 不是模型里的 UV 表情（模型没有 UV 符号就只写 morphs）`);
    if (!(m.symbolSpots ?? []).includes(egg.spot)) errors.push(`${label}.eggs.${i}.spot "${egg.spot}" 不在 model.symbolSpots 里`);
    if (!Array.isArray(egg.at) || egg.at.length !== 3) errors.push(`${label}.eggs.${i}.at 应为 [x, y, z]`);
  }
  ok.push(`${label}：表情表用到 ${used.size} 个语义表情`);
}

/** 几组典型的信号，用来试跑表情表 */
function fakeSignals(eggs) {
  const base = {
    blink: 0, open: 1, h: 0, rh: 0, rhythmActive: false, pullSides: 1, left: 0, right: 0,
    es: { mouth: 0, surprise: 0 }, shy: 0, enjoy: 0, rub: 0, dizzy: 0, afterglow: 0, sulk: 0,
    pokeFace: 0, pokeRaw: 0, pokeAfter: 0, combo: 0, roll: 0, egg: null, eggFade: 0, pokes: { reactions: [0, 0], smiles: [0, 0] },
  };
  const all = { ...base, blink: 1, open: 0, h: 1, rh: 1, rhythmActive: true, pullSides: 2, left: 1, right: 1, es: { mouth: 1, surprise: 1 }, shy: 1, enjoy: 1, rub: 1, dizzy: 1, afterglow: 1, sulk: 1, pokeFace: 1, pokeAfter: 1, pokes: { reactions: [1, 1], smiles: [1, 1] } };
  const egg = eggs?.list?.[0] ?? eggs?.dizzy;
  return [base, all, { ...all, roll: 0.99, combo: 5 }, { ...all, rhythmActive: false, rh: 0 }, ...(egg ? [{ ...all, egg, eggFade: 1 }] : [])];
}

/*
 * 区分度：每个动作在"招牌"（roll = 0）和"变体"（roll = 0.99，或拉脸时的彩蛋）下各跑一遍表情表，
 * 去掉物理上必然的嘴型，比较剩下的表情。两个动作几乎一样、或者动作没有变体，都提醒。
 */
const PHYSICAL = new Set(['blink', 'browDown', 'mouthWideL', 'mouthWideR', 'mouthNarrow', 'mouthForward']);
const NEUTRAL = {
  blink: 0, open: 1, h: 0, rh: 0, rhythmActive: false, pullSides: 1, left: 0, right: 0,
  es: { mouth: 0, surprise: 0 }, shy: 0, enjoy: 0, rub: 0, dizzy: 0, afterglow: 0, sulk: 0,
  pokeFace: 0, pokeRaw: 0, pokeAfter: 0, combo: 0, roll: 0, egg: null, eggFade: 0, pokes: { reactions: [0, 0], smiles: [0, 0] },
};
const ACTION_SIGNALS = {
  poke: { pokeFace: 1, pokeRaw: 1, pokeAfter: 1, combo: 1, pokes: { reactions: [0.6, 0], smiles: [0.3, 0] } },
  single: { h: 1, pullSides: 1, right: 1, es: { mouth: 1, surprise: 1 } },
  double: { h: 1, pullSides: 2, left: 1, right: 1, es: { mouth: 1, surprise: 1 } },
  cup: { pullSides: 0, es: { mouth: 0.55, surprise: 0.2 }, shy: 0.3, enjoy: 1 },
};
const NAMES = { poke: '戳', single: '单手拉', double: '双手拉', cup: '捧' };

function checkContrast(p, { m, warnings, ok }) {
  if (typeof p.expressions !== 'function') return;
  const known = new Set(Object.keys(m.morphs ?? {}).filter((k) => m.morphs[k]));
  const run = (sig) => {
    const v = {};
    try { p.expressions({ ...NEUTRAL, ...sig }, (k, x) => { if (!PHYSICAL.has(k) && known.has(k)) v[k] = (v[k] ?? 0) + x; }); } catch { return {}; }
    return v;
  };
  const egg = p.eggs?.list?.[0];
  const acts = Object.keys(p.actions ?? {}).filter((a) => ACTION_SIGNALS[a]);
  const vec = {};
  for (const a of acts) {
    const sig = ACTION_SIGNALS[a];
    vec[a] = run(sig);
    const variant = a === 'poke' ? run({ ...sig, roll: 0.99, combo: 4 })
      : run({ ...sig, roll: 0.99, ...((a === 'single' || a === 'double') && egg && egg.morphs ? { egg, eggFade: 1 } : {}) });
    const peak = Math.max(0, ...Object.values(vec[a]));
    if (peak < 0.4) warnings.push(`${NAMES[a]}：最强的表情只有 ${peak.toFixed(2)}，可能看不出反应（招牌表情给到 0.6~1）`);
    if (cosine(vec[a], variant) > 0.95) warnings.push(`${NAMES[a]}：没有变体（表情表没用 p.roll${a === 'poke' ? ' / p.combo' : '，也没有彩蛋'}），每次都一样`);
  }
  for (let i = 0; i < acts.length; i++) for (let j = i + 1; j < acts.length; j++) {
    const c = cosine(vec[acts[i]], vec[acts[j]]);
    if (c > 0.85) warnings.push(`${NAMES[acts[i]]} 和 ${NAMES[acts[j]]} 的表情几乎一样（相似度 ${c.toFixed(2)}），给它们各自的招牌表情`);
  }
  if (acts.length) ok.push(`区分度：比较了 ${acts.map((a) => NAMES[a]).join(' / ')} 的招牌与变体`);
}

function cosine(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let ab = 0, aa = 0, bb = 0;
  for (const k of keys) { const x = a[k] ?? 0, y = b[k] ?? 0; ab += x * y; aa += x * x; bb += y * y; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : aa === bb ? 1 : 0;
}
