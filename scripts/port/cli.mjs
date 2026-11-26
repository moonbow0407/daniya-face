#!/usr/bin/env node
/*
 * 移植新角色的命令行工具（流程见 skills/port-character/SKILL.md 与 docs/PORTING.md）
 *
 *   npm run port -- new <id> --model <模型.pmx> --name <中文名>   新建角色目录：模板 + 探测模型 + 注册
 *   npm run port -- survey <id> [--model <模型.pmx>] [--force]     重新探测模型，重写 model.js 与 SURVEY.md
 *   npm run port -- palette <id> --image <图片> [--image ...]       从图片取色，只打印候选颜色
 *   npm run port -- theme <id> --colors '#主色,#辅色,#点缀色'       用选定的 3 个颜色写 theme.js
 *   npm run port -- theme <id> --image <图片>                       偷懒版：直接用取色的前三个写 theme.js
 *   npm run port -- check <id>                                     检查配置；有错误时退出码为 1
 *   npm run port -- default <id>                                   设为网站默认角色（写 site.json）
 *   npm run port -- remove <id> --yes                              删除角色（如模板自带的示例 daniya）
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPmx } from './lib/pmx.mjs';
import { survey } from './lib/survey.mjs';
import { modelJs, surveyMd } from './lib/write-model.mjs';
import { samplePixels, palette, deriveTheme, themeJs, parseHex } from './lib/theme.mjs';
import { check } from './lib/check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [cmd, id, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const opts = (name) => rest.flatMap((a, i) => (a === `--${name}` ? [rest[i + 1]] : []));
const flag = (name) => rest.includes(`--${name}`);
const charDir = () => join(ROOT, 'src/characters', id);
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
const wrote = (f) => console.log(`  写入 ${relative(ROOT, f).replace(/\\/g, '/')}`);

if (!cmd || !id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  fail('用法：npm run port -- <new|survey|palette|theme|check|default|remove> <id> ...（id 用小写英文，如 phoebe）');
}

/** 模型路径：接受 public/models/... 或 /models/...，返回 { abs, url } */
function modelPath(p) {
  if (!p) fail('需要 --model <模型.pmx>（放在 public/models/ 下）');
  const url = `/${p.replace(/\\/g, '/').replace(/^\.?\/?(public\/)?/, '')}`;
  const abs = join(ROOT, 'public', url);
  if (!existsSync(abs)) fail(`模型不存在：public${url}`);
  return { abs, url };
}

function runSurvey(model) {
  const pmx = loadPmx(model.abs);
  const r = survey(pmx);
  writeFileSync(join(charDir(), 'model.js'), modelJs({ file: model.url, bytes: statSync(model.abs).size, r })); wrote(join(charDir(), 'model.js'));
  writeFileSync(join(charDir(), 'SURVEY.md'), surveyMd({ id, file: model.url, model: pmx, r })); wrote(join(charDir(), 'SURVEY.md'));
  console.log(`\n校准估算 ${JSON.stringify(r.calibration)}`);
  console.log(`前发候选 ${r.materials.hairOnCheek.join(', ') || '（无）'}；匹配到表情 ${Object.keys(r.morphs).length} 个，缺 ${r.missingMorphs.length} 个`);
  if (r.notes.length) console.log(`\n需要人确认：\n${r.notes.map((n) => `  - ${n}`).join('\n')}`);
}

function writeTheme(colors, source) {
  const theme = deriveTheme(colors.map(parseHex));
  writeFileSync(join(charDir(), 'theme.js'), themeJs({ id, source, colors, theme })); wrote(join(charDir(), 'theme.js'));
}

function register() {
  const f = join(ROOT, 'src/characters/index.js');
  let s = readFileSync(f, 'utf8');
  const ident = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  if (new RegExp(`from './${id}/index.js'`).test(s)) return;
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const before = s;
  s = s.replace(/(import [^\r\n]+ from '\.\/[^']+\/index\.js';\r?\n)(?!import)/, `$1import ${ident} from './${id}/index.js';${eol}`);
  if (s === before) fail('没能在 src/characters/index.js 里插入 import，请手动注册');
  s = s.replace(/export const CHARACTERS = \{([^}]*)\}/, (_, body) => `export const CHARACTERS = {${body.trim() ? ` ${body.trim()}, ` : ' '}${ident === id ? id : `'${id}': ${ident}`} }`);
  writeFileSync(f, s); wrote(f);
}

function unregister() {
  const f = join(ROOT, 'src/characters/index.js');
  const ident = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  let s = readFileSync(f, 'utf8');
  s = s.replace(new RegExp(`import ${ident} from '\\./${id}/index\\.js';\\r?\\n`), '');
  s = s.replace(/export const CHARACTERS = \{([^}]*)\}/, (_, body) => {
    const items = body.split(',').map((x) => x.trim()).filter((x) => x && x !== id && x !== `'${id}': ${ident}`);
    return `export const CHARACTERS = { ${items.join(', ')} }`;
  });
  writeFileSync(f, s); wrote(f);
}

const SITE = join(ROOT, 'site.json');
const readSite = () => JSON.parse(readFileSync(SITE, 'utf8'));

switch (cmd) {
  case 'default': {
    if (!existsSync(join(charDir(), 'index.js'))) fail(`src/characters/${id}/ 不存在`);
    const site = readSite();
    site.defaultCharacter = id;
    writeFileSync(SITE, `${JSON.stringify(site, null, 2)}\n`); wrote(SITE);
    console.log(`默认角色改为 ${id}（不带 ?char= 打开网站时显示它）`);
    break;
  }
  case 'remove': {
    if (!existsSync(charDir())) fail(`src/characters/${id}/ 不存在`);
    if (readSite().defaultCharacter === id) fail(`${id} 是默认角色，先用 npm run port -- default <其它角色> 换掉`);
    if (!flag('yes')) fail(`会删除整个 src/characters/${id}/ 目录（包括手改的配置），确认请加 --yes`);
    rmSync(charDir(), { recursive: true });
    console.log(`  删除 src/characters/${id}/`);
    unregister();
    break;
  }
  case 'new': {
    if (existsSync(charDir())) fail(`src/characters/${id}/ 已存在；重新探测请用 survey`);
    const name = opt('name') ?? fail('需要 --name <角色中文名>');
    const model = modelPath(opt('model'));
    mkdirSync(charDir(), { recursive: true });
    const tplDir = join(ROOT, 'scripts/port/templates');
    for (const t of readdirSync(tplDir, { recursive: true })) {
      const src = join(tplDir, t), out = join(charDir(), t);
      if (statSync(src).isDirectory()) { mkdirSync(out, { recursive: true }); continue; }
      writeFileSync(out, readFileSync(src, 'utf8').replaceAll('__ID__', id).replaceAll('__NAME__', name)); wrote(out);
    }
    writeFileSync(join(charDir(), 'hairRest.json'), '{}\n'); wrote(join(charDir(), 'hairRest.json'));
    writeTheme(['#f3a6c4', '#b98be0', '#7fa4f0'], '默认粉紫（还没取色，运行 theme 命令替换）');
    runSurvey(model);
    register();
    console.log(`\n下一步：写 persona.md 和 proposals/；配色 npm run port -- palette ${id} --image <立绘>；最后 npm run port -- check ${id}`);
    break;
  }
  case 'survey': {
    if (!existsSync(charDir())) fail(`src/characters/${id}/ 不存在；先用 new`);
    if (existsSync(join(charDir(), 'model.js')) && !flag('force')) fail('model.js 已存在，会被覆盖（手改的内容会丢）；确认要重写请加 --force');
    const cur = existsSync(join(charDir(), 'model.js')) && readFileSync(join(charDir(), 'model.js'), 'utf8').match(/file: "([^"]+)"/)?.[1];
    runSurvey(modelPath(opt('model') ?? cur));
    break;
  }
  case 'palette': {
    const images = opts('image');
    if (!images.length) fail('需要 --image <图片>（可多个：立绘、模型贴图）');
    const pal = palette(images.flatMap((f) => samplePixels(resolve(f))));
    if (!pal.length) fail('图片里没有取到有效颜色（全是白/黑/灰？）换一张立绘试试');
    console.log('取到的颜色（按 占比×饱和度 排序；占比是像素比例）：');
    for (const c of pal) console.log(`  ${c.hex}  ${(c.share * 100).toFixed(1)}%`);
    console.log(`\n选 3 个最能代表角色的颜色（主色通常是发色，辅色是瞳色或服装主色，点缀色是饰品色），然后：`);
    console.log(`  npm run port -- theme ${id} --colors '#主色,#辅色,#点缀色'`);
    break;
  }
  case 'theme': {
    if (!existsSync(charDir())) fail(`src/characters/${id}/ 不存在；先用 new`);
    const images = opts('image');
    let colors = opt('colors')?.split(',').map((c) => c.trim());
    if (!colors) {
      if (!images.length) fail('需要 --image <图片>（可多个）或 --colors \'#主色,#辅色,#点缀色\'');
      const pixels = images.flatMap((f) => samplePixels(resolve(f)));
      const pal = palette(pixels);
      if (!pal.length) fail('图片里没有取到有效颜色（全是白/黑/灰？）换一张立绘试试');
      console.log('取到的主色（按 占比×饱和度 排序）：');
      for (const c of pal) console.log(`  ${c.hex}  ${(c.share * 100).toFixed(1)}%`);
      colors = pal.slice(0, 3).map((c) => c.hex);
      while (colors.length < 3) colors.push(colors[colors.length - 1]);
      console.log(`\n用前三个作为 主色 / 辅色 / 点缀色：${colors.join(' / ')}`);
      console.log(`不合适就挑别的：npm run port -- theme ${id} --colors '#..,#..,#..'（主色通常取发色）`);
    }
    if (colors.some((c) => !/^#[0-9a-f]{6}$/i.test(c))) fail(`颜色格式应为 #rrggbb：${colors.join(', ')}`);
    writeTheme(colors, images.length ? images.map((f) => relative(ROOT, resolve(f)).replace(/\\/g, '/')).join(', ') : '手动指定');
    break;
  }
  case 'check': {
    const { createServer } = await import('vite');
    const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
    let res;
    try { res = await check({ id, root: ROOT, loadModule: (p) => server.ssrLoadModule(p) }); }
    finally { await server.close(); }
    for (const o of res.ok) console.log(`✓ ${o}`);
    for (const w of res.warnings) console.log(`! ${w}`);
    for (const e of res.errors) console.log(`✗ ${e}`);
    console.log(`\n${res.errors.length} 个错误，${res.warnings.length} 个提醒${res.errors.length ? '' : '。没有错误'}`);
    process.exit(res.errors.length ? 1 : 0);
  }
  default:
    fail(`未知命令 ${cmd}`);
}
