// 静态检查角色配置：名字都能在模型里找到、文件都在、格式对；每套性格方案都试跑一遍；提醒人设卡和方案是否齐全
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadPmx } from './pmx.mjs';

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
  else { pmx = loadPmx(pub(m.file)); ok.push(`模型 ${m.file}（${pmx.name}）`); }
  for (const k of ['sx', 'dy', 'dz', 'faceWidth']) if (typeof m.calibration?.[k] !== 'number') errors.push(`model.calibration.${k} 缺失或不是数字`);
  if (pmx) {
    const mats = new Set(pmx.materials.map((x) => x.name));
    const mt = m.materials ?? {};
    for (const key of ['skin', 'hitTest', 'mouth', 'hairOnCheek', 'noOutline']) {
      for (const n of mt[key] ?? []) if (!mats.has(n)) errors.push(`model.materials.${key} 里的材质 "${n}" 在模型里不存在`);
    }
    if (!mt.skin?.length) errors.push('model.materials.skin 为空：至少要有脸部皮肤材质');
    if (!mt.hitTest?.length) errors.push('model.materials.hitTest 为空：点击检测需要脸部皮肤材质');
    if (mt.symbol && !mats.has(mt.symbol)) errors.push(`model.materials.symbol "${mt.symbol}" 在模型里不存在`);
    const b = m.bones ?? {};
    for (const n of [b.head, b.neck, ...(b.eyes ?? []), ...(b.restPose ?? []).map((r) => r[0])]) {
      if (!n || !pmx.bones[n]) errors.push(`model.bones 里的骨骼 "${n}" 在模型里不存在`);
    }
    const morphNames = new Set(pmx.vertexMorphs);
    for (const [k, n] of Object.entries(m.morphs ?? {})) if (n && !morphNames.has(n)) errors.push(`model.morphs.${k} = "${n}" 在模型的顶点表情里不存在`);
    for (const n of m.symbolSpots ?? []) if (!morphNames.has(n)) errors.push(`model.symbolSpots 里的 "${n}" 在模型的顶点表情里不存在`);
  }
  if (!m.hairRest || !Object.keys(m.hairRest).length) warnings.push(`hairRest.json 为空：还没烘焙头发静止姿势（打开 /?char=${id}&bake，见 docs/PORTING.md 第 4 步）`);

  // ---------- 性格层 ----------
  const actions = Object.keys(p.actions ?? {});
  if (!actions.length) errors.push('personality.actions 为空：至少开放一个动作');
  for (const a of actions) if (!ACTIONS.includes(a)) errors.push(`personality.actions.${a} 不是已知动作（可用：${ACTIONS.join(' / ')}）`);
  if (p.defaultAction && !actions.includes(p.defaultAction)) errors.push(`personality.defaultAction "${p.defaultAction}" 没有在 actions 里开放`);
  const song = p.actions?.rhythm?.song;
  if (p.actions?.rhythm) {
    if (!song?.notes?.length) errors.push('personality.actions.rhythm.song 缺失或没有谱面（从 src/rhythm/charts/ 里 import 一首）');
    else if (!existsSync(pub(song.url))) warnings.push(`音游歌曲文件不存在：public${song.url}（音游会提示"音乐加载失败"）`);
  }
  const uv = new Set(pmx?.uvMorphs.map((u) => u.name) ?? []);
  const sheetCtx = { m, pmx, uv, errors, warnings, ok };
  checkSheet('personality', p, sheetCtx);

  // ---------- 人设卡与方案 ----------
  const propDir = join(dir, 'proposals');
  if (existsSync(propDir)) {
    const persona = existsSync(join(dir, 'persona.md')) ? readFileSync(join(dir, 'persona.md'), 'utf8') : '';
    if (!/## 性格关键词\s*\r?\n-[ \t]*\S/.test(persona)) warnings.push('persona.md 还没写（性格关键词为空）：先写人设卡，再据此写方案');
    const files = readdirSync(propDir).filter((f) => f.endsWith('.js'));
    for (const f of files) {
      try { checkSheet(`proposals/${f}`, (await loadModule(`/src/characters/${id}/proposals/${f}`)).default ?? {}, sheetCtx); }
      catch (e) { errors.push(`proposals/${f} 加载失败：${e.message}`); }
    }
    const real = files.filter((f) => f !== 'base.js');
    if (real.length < 2) warnings.push(`proposals/ 里只有 ${real.length} 套性格方案（不算 base.js），建议 2~3 套供用户在 ?char=${id}&studio 里挑选`);
    const chosen = readFileSync(join(dir, 'personality.js'), 'utf8').match(/from '\.\/proposals\/([^']+)\.js'/)?.[1];
    if (chosen === 'base') warnings.push('personality.js 还在用 base 方案（没有性格）：用户选定后把 import 改成选中的方案');
    else if (chosen) ok.push(`选定方案 proposals/${chosen}.js`);
  }

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

/** 检查一套性格（personality 本身或一个方案文件）：表情表能跑、用到的名字存在、彩蛋合法 */
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
    if (pmx && !uv.has(egg.symbol)) errors.push(`${label}.eggs.${i}.symbol "${egg.symbol}" 不是模型里的 UV 表情`);
    if (!(m.symbolSpots ?? []).includes(egg.spot)) errors.push(`${label}.eggs.${i}.spot "${egg.spot}" 不在 model.symbolSpots 里`);
    if (!Array.isArray(egg.at) || egg.at.length !== 3) errors.push(`${label}.eggs.${i}.at 应为 [x, y, z]`);
  }
  ok.push(`${label}：表情表用到 ${used.size} 个语义表情`);
}

/** 几组典型的信号，用来试跑表情表 */
function fakeSignals(eggs) {
  const base = {
    blink: 0, open: 1, h: 0, rh: 0, rhythmActive: false, pullSides: 1, left: 0, right: 0,
    es: { mouth: 0, surprise: 0 }, shy: 0, enjoy: 0, dizzy: 0, afterglow: 0, sulk: 0,
    pokeFace: 0, pokeRaw: 0, egg: null, eggFade: 0, pokes: { reactions: [0, 0], smiles: [0, 0] },
  };
  const all = { ...base, blink: 1, open: 0, h: 1, rh: 1, rhythmActive: true, pullSides: 2, left: 1, right: 1, es: { mouth: 1, surprise: 1 }, shy: 1, enjoy: 1, dizzy: 1, afterglow: 1, sulk: 1, pokeFace: 1, pokes: { reactions: [1, 1], smiles: [1, 1] } };
  const egg = eggs?.list?.[0] ?? eggs?.dizzy;
  return [base, all, { ...all, rhythmActive: false, rh: 0 }, ...(egg ? [{ ...all, egg, eggFade: 1 }] : [])];
}
