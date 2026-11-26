/**
 * 表情工作台（?char=<id>&studio）：给人挑选性格方案用。
 * - 人设卡：显示 characters/<id>/persona.md
 * - 方案：列出 characters/<id>/proposals/*.js，点选即时切换（表情表 + 反应节奏 + 彩蛋），
 *   "演示"按钮自动做一遍戳 / 拉 / 捧，方便并排比较
 * - 表情图鉴：模型里每个语义表情单独显示一下
 * 选定后，把 personality.js 里的 import 改成对应的方案文件（见 skills/port-character/SKILL.md）。
 */
import * as THREE from 'three';
import { DEFAULT_BEHAVIOR } from '../characters/index.js';
import { prepareSymbols } from '../expression/face.js';
import './studio.css';

const PROPOSALS = import.meta.glob('../characters/*/proposals/*.js');
const PERSONAS = import.meta.glob('../characters/*/persona.md', { query: '?raw', import: 'default' });

export async function openStudio(ctx) {
  const { cfg, mesh, s, debug, symbols, stage, model } = ctx;
  const id = cfg.id;
  const original = { expressions: cfg.personality.expressions, behavior: s.behavior, eggs: cfg.personality.eggs };

  const panel = document.createElement('aside');
  panel.className = 'studio';
  panel.innerHTML = `
    <header><b>表情工作台</b><button type="button" data-act="fold" title="收起">－</button></header>
    <div class="studio-body">
      <details class="studio-persona"><summary>人设卡</summary><pre></pre></details>
      <section><h4>方案</h4><div class="studio-proposals"></div></section>
      <section><h4>演示</h4><div class="studio-demos">
        <button type="button" data-demo="poke">戳</button><button type="button" data-demo="single">单手拉</button>
        <button type="button" data-demo="double">双手拉</button><button type="button" data-demo="cup">捧</button>
        <button type="button" data-demo="all">全部</button>
      </div><p class="studio-status"></p></section>
      <details><summary>表情图鉴</summary><div class="studio-morphs"></div></details>
    </div>`;
  document.querySelector('#app').append(panel);
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  const $ = (sel) => panel.querySelector(sel);
  $('[data-act=fold]').onclick = () => panel.classList.toggle('folded');

  // --- 人设卡 ---
  const personaLoader = PERSONAS[`../characters/${id}/persona.md`];
  if (personaLoader) $('.studio-persona pre').textContent = await personaLoader();
  else $('.studio-persona').hidden = true;

  // --- 方案 ---
  const list = $('.studio-proposals');
  const entries = [['当前配置', async () => ({ default: { title: '当前配置', summary: '角色 personality.js 里正在用的', ...original } })]];
  for (const [path, load] of Object.entries(PROPOSALS)) {
    if (path.startsWith(`../characters/${id}/proposals/`)) entries.push([path.split('/').pop().replace(/\.js$/, ''), load]);
  }
  const buttons = [];
  for (const [name, load] of entries) {
    const prop = (await load()).default;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `<b>${name === '当前配置' ? '' : `${name} · `}${prop.title ?? name}</b><small>${prop.summary ?? ''}</small>`;
    btn.onclick = () => {
      cfg.personality.expressions = prop.expressions ?? (() => {});
      s.behavior = { ...DEFAULT_BEHAVIOR, ...prop.behavior };
      const eggs = { chance: 0, list: [], tint: [0.24, 0.5, 0.84], ...prop.eggs };
      Object.assign(symbols, prepareSymbols(mesh, cfg.model.materials.symbol, eggs));
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    };
    buttons.push(btn);
    list.append(btn);
  }
  buttons[0].setAttribute('aria-pressed', 'true');
  if (entries.length === 1) list.insertAdjacentHTML('beforeend', '<p class="studio-empty">还没有方案（proposals/ 目录为空）</p>');

  // --- 演示：在脸颊点上合成指针事件 ---
  const el = stage.stageEl;
  const status = $('.studio-status');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const _v = new THREE.Vector3();
  function cheekPx() {
    _v.copy(model.rhythmPoint()).project(stage.camera);
    const r = el.getBoundingClientRect();
    return { x: r.left + ((_v.x + 1) / 2) * r.width - 6, y: r.top + ((1 - _v.y) / 2) * r.height };
  }
  const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 99, isPrimary: true, button: 0, pointerType: 'mouse', bubbles: true }));
  async function act(mode, holdMs, moveX = 0) {
    s.mode = mode;
    const { x, y } = cheekPx();
    fire('pointerdown', x, y);
    for (let i = 1; i <= 12 && moveX; i++) { fire('pointermove', x + (moveX * i) / 12, y); await wait(25); }
    await wait(holdMs);
    fire('pointerup', x + moveX, y);
  }
  const DEMOS = {
    poke: async () => { await act('poke', 0); await wait(600); await act('poke', 0); await wait(1400); },
    single: async () => { await act('single', 1800, 70); await wait(2600); },
    double: async () => { await act('double', 1800, 70); await wait(2600); },
    cup: async () => { await act('cup', 3600); await wait(1600); },
  };
  let busy = false;
  $('.studio-demos').onclick = async (e) => {
    const name = e.target.closest('button')?.dataset.demo;
    if (!name || busy) return;
    busy = true;
    const before = s.mode;
    for (const d of name === 'all' ? ['poke', 'single', 'cup'] : [name]) { status.textContent = `演示：${d}…`; await DEMOS[d](); }
    s.mode = before;
    status.textContent = '';
    busy = false;
  };

  // --- 表情图鉴 ---
  const morphBox = $('.studio-morphs');
  for (const [key, name] of Object.entries(cfg.model.morphs ?? {})) {
    if (!name) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${key}<small>${name}</small>`;
    b.onmouseenter = b.onfocus = () => { debug.morphs = { [key]: 1 }; };
    b.onmouseleave = b.onblur = () => { debug.morphs = null; };
    b.onclick = () => { debug.morphs = { [key]: 1 }; setTimeout(() => { debug.morphs = null; }, 1500); };
    morphBox.append(b);
  }
}
