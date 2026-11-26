/**
 * 表情工作台（?char=<id>&studio）：写表情表之前看模型，写完之后看效果。
 * - 演示：自动做一遍戳 / 连戳 / 拉 / 捧 / 揉；可以固定看"招牌"或"变体"（表情表里的 p.roll）
 * - 全部表情：模型里每个顶点表情的缩略图（加载时不过滤 morph），标出已映射的语义名和"几乎看不出"的表情
 * - 材质：逐个隐藏材质，确认哪层头发挡在脸颊前（model.materials.hairOnCheek）
 * agent 没法看页面时可以在控制台读 window.__studio.morphs（每个表情的可见度）。
 */
import * as THREE from 'three';
import './studio.css';

export async function openStudio(ctx) {
  const { cfg, mesh, s, debug, stage, model } = ctx;
  const panel = document.createElement('aside');
  panel.className = 'studio';
  panel.innerHTML = `
    <header><b>表情工作台</b><button type="button" data-act="fold" title="收起">－</button></header>
    <div class="studio-body">
      <section><h4>演示</h4>
        <div class="studio-row studio-roll" role="radiogroup">
          <button type="button" data-roll="" aria-pressed="true">随机</button>
          <button type="button" data-roll="0">招牌</button><button type="button" data-roll="0.99">变体</button>
        </div>
        <div class="studio-row studio-demos">
          <button type="button" data-demo="poke">戳</button><button type="button" data-demo="combo">连戳</button>
          <button type="button" data-demo="single">单手拉</button><button type="button" data-demo="double">双手拉</button>
          <button type="button" data-demo="cup">捧</button><button type="button" data-demo="rub">揉</button>
          <button type="button" data-demo="all">全部</button>
        </div><p class="studio-status"></p>
      </section>
      <details class="studio-gallery"><summary>全部表情</summary>
        <input type="search" placeholder="筛选名字…" class="studio-filter">
        <label class="studio-check"><input type="checkbox" class="studio-hide-faint"> 隐藏几乎看不出的</label>
        <div class="studio-morphs"></div>
      </details>
      <details><summary>材质</summary><div class="studio-mats"></div></details>
    </div>`;
  document.querySelector('#app').append(panel);
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  const $ = (sel) => panel.querySelector(sel);
  $('[data-act=fold]').onclick = () => panel.classList.toggle('folded');

  // --- 招牌 / 变体 ---
  $('.studio-roll').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    debug.roll = b.dataset.roll === '' ? null : Number(b.dataset.roll);
    panel.querySelectorAll('[data-roll]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };

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
  async function act(mode, holdMs, moveX = 0, rub = false) {
    s.mode = mode;
    const { x, y } = cheekPx();
    fire('pointerdown', x, y);
    for (let i = 1; i <= 12 && moveX; i++) { fire('pointermove', x + (moveX * i) / 12, y); await wait(25); }
    if (rub) for (let t = 0; t < holdMs; t += 40) { fire('pointermove', x + (t % 80 ? 40 : -40), y + (t % 120 ? 8 : -8)); await wait(40); }
    else await wait(holdMs);
    fire('pointerup', x + moveX, y);
  }
  const DEMOS = {
    poke: async () => { await act('poke', 0); await wait(1600); },
    combo: async () => { for (let i = 0; i < 5; i++) { await act('poke', 0); await wait(220); } await wait(1600); },
    single: async () => { await act('single', 1800, 70); await wait(2600); },
    double: async () => { await act('double', 1800, 70); await wait(2600); },
    cup: async () => { await act('cup', 3600); await wait(1600); },
    rub: async () => { await act('cup', 3000, 0, true); await wait(2000); },
  };
  let busy = false;
  $('.studio-demos').onclick = async (e) => {
    const name = e.target.closest('button')?.dataset.demo;
    if (!name || busy) return;
    busy = true;
    const before = s.mode;
    for (const d of name === 'all' ? ['poke', 'combo', 'single', 'double', 'cup'] : [name]) {
      if (!cfg.personality.actions[d === 'combo' ? 'poke' : d === 'rub' ? 'cup' : d]) continue;
      status.textContent = `演示：${d}…`;
      await DEMOS[d]();
    }
    s.mode = before;
    status.textContent = '';
    busy = false;
  };

  // --- 材质开关 ---
  const roles = Object.entries(cfg.model.materials ?? {});
  for (const m of mesh.material) {
    const role = roles.filter(([, v]) => (Array.isArray(v) ? v.includes(m.name) : v === m.name)).map(([k]) => k);
    const label = document.createElement('label');
    label.className = 'studio-check';
    label.innerHTML = `<input type="checkbox" checked> ${m.name}${role.length ? ` <small>${role.join(' / ')}</small>` : ''}`;
    label.querySelector('input').onchange = (e) => { m.visible = e.target.checked; };
    $('.studio-mats').append(label);
  }

  // --- 全部表情：缩略图 ---
  const semanticOf = new Map(Object.entries(cfg.model.morphs ?? {}).filter(([, v]) => v).map(([k, v]) => [v, k]));
  const morphs = []; // { name, semantic, score }
  window.__studio = { morphs, openGallery: () => buildGallery() };
  let built = false;
  $('.studio-gallery').addEventListener('toggle', (e) => { if (e.target.open) buildGallery(); });
  const filter = () => {
    const q = $('.studio-filter').value.trim().toLowerCase();
    const hideFaint = $('.studio-hide-faint').checked;
    for (const tile of $('.studio-morphs').children) {
      const hit = !q || tile.dataset.search.includes(q);
      tile.hidden = !hit || (hideFaint && tile.classList.contains('faint'));
    }
  };
  $('.studio-filter').oninput = filter;
  $('.studio-hide-faint').onchange = filter;

  async function buildGallery() {
    if (built) return;
    built = true;
    const box = $('.studio-morphs');
    box.textContent = '生成缩略图中…';
    const shoot = thumbnailer(ctx);
    box.textContent = '';
    const names = Object.keys(mesh.morphTargetDictionary);
    let base;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (i % 12 === 0) base = shoot(null); // 头在待机摇摆：每批重新拍一张无表情的作对比
      const { canvas, score } = shoot(name, base);
      const semantic = semanticOf.get(name) ?? '';
      morphs.push({ name, semantic, score: +score.toFixed(4) });
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = `studio-tile${score < 0.0015 ? ' faint' : ''}${semantic ? ' mapped' : ''}`;
      tile.dataset.search = `${name} ${semantic}`.toLowerCase();
      tile.title = `${name}${semantic ? `（${semantic}）` : ''}\n可见度 ${(score * 1000).toFixed(1)}‰`;
      tile.append(canvas);
      tile.insertAdjacentHTML('beforeend', `<span>${name}</span>${semantic ? `<small>${semantic}</small>` : ''}`);
      tile.onmouseenter = tile.onfocus = () => { debug.raw = name; };
      tile.onmouseleave = tile.onblur = () => { debug.raw = null; mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]] = 0; };
      tile.onclick = () => navigator.clipboard?.writeText(name).catch(() => {});
      box.append(tile);
      if (i % 12 === 11) await new Promise((r) => setTimeout(r));
    }
    filter();
  }
}

/**
 * 缩略图：在当前姿势上把某个表情开到 1，画一帧，裁出头部（往上多留一些，漫画符号常在头顶）。
 * score = 与无表情时的平均像素差，用来标出"开到 1 也几乎看不出"的表情。
 */
function thumbnailer({ mesh, stage, cfg }) {
  const W = 132, cv = stage.renderer.domElement;
  // 用皮肤顶点算出脸在屏幕上的范围
  const skin = new Set(cfg.model.materials.skin ?? []);
  const idx = mesh.geometry.index.array;
  const verts = new Set();
  for (const g of mesh.geometry.groups) {
    if (!skin.has(mesh.material[g.materialIndex].name)) continue;
    for (let i = g.start; i < g.start + g.count; i += 9) verts.add(idx[i]);
  }
  const v = new THREE.Vector3(), lo = new THREE.Vector2(Infinity, Infinity), hi = new THREE.Vector2(-Infinity, -Infinity);
  for (const k of verts) {
    mesh.getVertexPosition(k, v).applyMatrix4(mesh.matrixWorld).project(stage.camera);
    lo.min(v); hi.max(v);
  }
  const fw = (hi.x - lo.x) * 0.5 * cv.width, fh = (hi.y - lo.y) * 0.5 * cv.height;
  const cx = ((lo.x + hi.x) / 2 + 1) * 0.5 * cv.width, top = (1 - hi.y) * 0.5 * cv.height;
  const sw = fw * 1.9, sx = cx - sw / 2, sy = top - fh * 0.9, sh = fh * 2.0;
  const H = Math.round((W * sh) / sw);
  const infl = mesh.morphTargetInfluences;

  return function shoot(name, base) {
    const saved = infl.slice();
    if (name) infl[mesh.morphTargetDictionary[name]] = 1;
    stage.render();
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(cv, sx, sy, sw, sh, 0, 0, W, H);
    for (let i = 0; i < saved.length; i++) infl[i] = saved[i];
    const data = g.getImageData(0, 0, W, H).data;
    // 可见度 = 明显变了色的像素占比（只看平均差会被大片头发稀释，眼部的小变化显示不出来）
    let score = 0;
    if (base) {
      for (let i = 0; i < data.length; i += 4) {
        const d = Math.abs(data[i] - base.data[i]) + Math.abs(data[i + 1] - base.data[i + 1]) + Math.abs(data[i + 2] - base.data[i + 2]);
        if (d > 60) score++;
      }
      score /= data.length / 4;
    }
    return { canvas, score, data };
  };
}
