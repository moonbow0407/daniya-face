/**
 * 音游引擎（标准音游时钟 + 简单易上手手感）：
 * - 使用 Web Audio API 解码并按 AudioContext 时钟精确调度播放（自动补偿 outputLatency），
 *   彻底解决 HTMLAudioElement 起播延迟与 currentTime 跳变导致的"没卡上点"问题。
 * - 判定分级：PERFECT（±80ms）/ GOOD（±175ms）/ MISS，长按松手窗口更宽松（±110ms / ±250ms）。
 * - 视觉卡点增强：判定圈随 160 BPM 节拍脉动、轨道上显示每 2 拍节拍刻度、实时弹出判定文字与准确度，
 *   并提供 ±150ms 音频延迟微调（适配蓝牙耳机等高延迟设备）。
 */
import { CHART, SONG_URL, SONG_CREDIT, BEAT_OFFSET, BEAT_SEC, SONG_END } from './rhythmChart.js';

const PERFECT_WINDOW = 0.080;
const GOOD_WINDOW = 0.175;
const EARLY_IGNORE = 0.250;     // 超过 250ms 提前按不算错，仅轻戳脸颊
const RELEASE_PERFECT = 0.110;
const RELEASE_GOOD = 0.250;
const LEAD_IN = 2.0;            // 2 秒预备滑动，让第一拍从容进场
const TRAVEL_BEATS = 4;         // 轨道全长固定展示 4 拍（1.5 秒 = 1 小节），速度恒定易读
const SYNC_KEY = 'daniya.rhythm-sync-ms';

/** 基于 Web Audio API 的高精度播放器，支持流式加载进度和解码缓存 */
class WebAudioSongPlayer {
  constructor(url, getCtx) {
    this.url = url;
    this.getCtx = getCtx;
    this.buffer = null;
    this.source = null;
    this.gain = null;
    this.abort = null;
    this.startCtxTime = 0;
    this.ended = false;
    this.onEnded = null;
  }

  async load({ onProgress, onReady, onEnded, onError }) {
    this.stop();
    this.onEnded = onEnded;
    this.ended = false;
    const ctx = this.getCtx();
    if (!ctx) { onError?.(); return; }

    if (this.buffer) {
      onProgress?.(1);
      onReady?.();
      return;
    }

    const ctrl = new AbortController();
    this.abort = ctrl;
    try {
      const res = await fetch(this.url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      let raw;
      if (res.body && total > 0) {
        const reader = res.body.getReader();
        const chunks = [];
        let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          onProgress?.(Math.min(0.92, (loaded / total) * 0.92));
        }
        const merged = new Uint8Array(loaded);
        let offset = 0;
        for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
        raw = merged.buffer;
      } else {
        onProgress?.(0.5);
        raw = await res.arrayBuffer();
      }
      if (ctrl.signal.aborted) return;
      onProgress?.(0.96);
      this.buffer = await ctx.decodeAudioData(raw);
      if (ctrl.signal.aborted) return;
      onProgress?.(1);
      onReady?.();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error('[rhythm] audio load failed:', err);
      onError?.();
    } finally {
      if (this.abort === ctrl) this.abort = null;
    }
  }

  /** 按 AudioContext 绝对时钟预约在 LEAD_IN 秒后从 0.000s 精准起播 */
  begin() {
    this.stopSource();
    const ctx = this.getCtx();
    if (!ctx || !this.buffer) return;
    if (ctx.state === 'suspended') ctx.resume();

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.82;
    src.connect(gain).connect(ctx.destination);

    this.startCtxTime = ctx.currentTime + LEAD_IN;
    this.ended = false;
    src.onended = () => {
      if (this.source !== src) return;
      this.ended = true;
      this.onEnded?.();
    };
    src.start(this.startCtxTime, 0);
    this.source = src;
    this.gain = gain;
  }

  /** 当前听觉时刻（秒），已扣除硬件输出延迟与事件排队延迟 */
  time(ts = performance.now()) {
    const ctx = this.getCtx();
    if (!ctx || !this.source) return -LEAD_IN;
    const lag = Math.min(0.05, Math.max(0, (performance.now() - ts) / 1000));
    const hwLatency = Math.min(0.15, Math.max(0, (ctx.outputLatency || 0) || (ctx.baseLatency || 0)));
    return ctx.currentTime - hwLatency - this.startCtxTime - lag;
  }

  get duration() { return this.buffer ? this.buffer.duration : SONG_END; }

  stopSource() {
    if (this.source) {
      const src = this.source;
      this.source = null;
      src.onended = null;
      try { src.stop(); } catch { /* 已停 */ }
      try { src.disconnect(); } catch { /* ignore */ }
    }
    if (this.gain) {
      try { this.gain.disconnect(); } catch { /* ignore */ }
      this.gain = null;
    }
  }

  stop() {
    if (this.abort) { this.abort.abort(); this.abort = null; }
    this.stopSource();
    this.onEnded = null;
  }
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root
 * @param {HTMLButtonElement} o.button
 * @param {() => {x:number,y:number}} o.anchor 右脸颊在屏幕上的位置（CSS 像素）
 * @param {import('./sfx.js').Sfx} o.sfx
 * @param {(active:boolean) => void} o.onToggle 进入/退出音游
 * @param {() => void} o.onHoldBroken 长按音符被判失败时强制松手
 */
export function createRhythm({ root, button, anchor, sfx, onToggle, onHoldBroken }) {
  const lane = el('div', 'rhythm-lane');
  const track = el('div', 'rhythm-track');
  const targetRing = el('div', 'rhythm-target');
  const judgeEl = el('div', 'rhythm-judge');
  const streakEl = el('div', 'rhythm-streak');
  track.append(targetRing, judgeEl, streakEl);
  lane.append(track);

  const progressBar = el('div', 'rhythm-progress');
  const progressFill = document.createElement('i');
  progressBar.append(progressFill);
  lane.append(progressBar);

  const hintEl = el('div', 'rhythm-hint');
  hintEl.textContent = '点按 / 空格 = 戳脸 · 长按 = Wink 拉脸';
  lane.append(hintEl);

  lane.hidden = true;
  const dot = el('i', 'rhythm-pointer-dot');
  dot.hidden = true;
  lane.append(dot);

  // 顶部简洁 HUD（准确度 + 连击 + 延迟微调）
  const hud = el('div', 'rhythm-hud');
  hud.innerHTML = `
    <span class="rhythm-hud-acc">100.0%</span>
    <span class="rhythm-hud-sep">·</span>
    <span class="rhythm-hud-combo">0 连击</span>
    <span class="rhythm-hud-sep">·</span>
    <span class="rhythm-sync" title="音频延迟微调（蓝牙耳机可调）">
      <button type="button" data-sync="-10" aria-label="提前 10ms">−</button>
      <em class="rhythm-sync-val">0ms</em>
      <button type="button" data-sync="10" aria-label="延后 10ms">+</button>
    </span>`;
  hud.hidden = true;
  const hudAcc = hud.querySelector('.rhythm-hud-acc');
  const hudCombo = hud.querySelector('.rhythm-hud-combo');
  const syncValEl = hud.querySelector('.rhythm-sync-val');

  const launch = el('div', 'rhythm-launch');
  launch.innerHTML = `
    <div class="rhythm-buffer"><span>音乐解码中</span><span class="rhythm-buffer-pct"></span><progress max="1"></progress></div>
    <button type="button" class="rhythm-retry" hidden>重新加载音乐</button>
    <div class="rhythm-message"></div>`;
  launch.hidden = true;
  const bufferBox = launch.querySelector('.rhythm-buffer');
  const bufferBar = launch.querySelector('progress');
  const bufferPct = launch.querySelector('.rhythm-buffer-pct');
  const retryBtn = launch.querySelector('.rhythm-retry');
  const message = launch.querySelector('.rhythm-message');

  const finale = el('div', 'rhythm-finale');
  finale.hidden = true;
  finale.innerHTML = `
    <div class="rhythm-finale-card" role="dialog" aria-label="音游结算">
      <img src="/finale.jpg" alt="我就说你是很椰的椰果" width="850" height="850" />
      <div class="rhythm-finale-stats"></div>
      <div class="rhythm-finale-actions">
        <button type="button" data-act="again">再来一次</button>
        <button type="button" data-act="exit">退出音游</button>
      </div>
    </div>`;
  const statsEl = finale.querySelector('.rhythm-finale-stats');
  root.append(lane, hud, launch, finale);

  const song = new WebAudioSongPlayer(SONG_URL, () => sfx.ensureContext());
  let sync = 0;
  try {
    const v = Number(localStorage.getItem(SYNC_KEY));
    if (Number.isFinite(v)) sync = Math.max(-150, Math.min(150, v));
  } catch { /* ignore */ }
  function renderSync() { syncValEl.textContent = `${sync > 0 ? '+' : ''}${sync}ms`; }
  renderSync();
  hud.addEventListener('pointerdown', (e) => e.stopPropagation());
  hud.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sync]');
    if (!btn) return;
    e.stopPropagation();
    sync = Math.max(-150, Math.min(150, sync + Number(btn.dataset.sync)));
    try { localStorage.setItem(SYNC_KEY, String(sync)); } catch { /* ignore */ }
    renderSync();
    sfx.tick();
  });

  const T = (ts) => song.time(ts) - sync / 1000;

  let active = false, playing = false;
  let next = 0;
  let holding = false;
  let pressGrade = 'perfect';
  let streak = 0;
  const stats = { perfect: 0, good: 0, miss: 0, best: 0 };
  let W = 0, H = 0;
  let judgeAnim = null;
  let lastBeatIdx = -999;
  new ResizeObserver(([e]) => { W = e.contentRect.width; H = e.contentRect.height; }).observe(lane);

  const notes = [];
  function noteEl(i) {
    if (notes[i]) return notes[i];
    const n = el('div', 'rhythm-note');
    n.append(document.createElement('span'));
    track.append(n);
    notes.push(n);
    return n;
  }

  const ticks = [];
  function tickEl(i) {
    if (ticks[i]) return ticks[i];
    const t = el('i', 'rhythm-beat-tick');
    track.insertBefore(t, targetRing);
    ticks.push(t);
    return t;
  }

  function accuracy() {
    const total = stats.perfect + stats.good + stats.miss;
    if (!total) return 100;
    return ((stats.perfect + stats.good * 0.7) / total) * 100;
  }

  function updateHud() {
    hudAcc.textContent = `${accuracy().toFixed(1)}%`;
    hudCombo.textContent = `${streak} 连击`;
    streakEl.textContent = streak >= 2 ? `×${streak}` : '';
  }

  function showJudge(grade) {
    judgeEl.textContent = grade === 'perfect' ? 'PERFECT' : grade === 'good' ? 'GOOD' : 'MISS';
    judgeEl.dataset.grade = grade;
    judgeAnim?.cancel();
    judgeAnim = judgeEl.animate([
      { opacity: 0, transform: 'translate(-50%, 4px) scale(.84)' },
      { opacity: 1, transform: 'translate(-50%, -2px) scale(1.06)', offset: 0.2 },
      { opacity: 1, transform: 'translate(-50%, -5px) scale(1)', offset: 0.7 },
      { opacity: 0, transform: 'translate(-50%, -10px) scale(.96)' },
    ], { duration: 420, easing: 'ease-out', fill: 'forwards' });
  }

  function burst(kind, perfect) {
    const b = el('i', 'rhythm-burst');
    b.dataset.kind = kind;
    b.dataset.precise = String(perfect);
    track.append(b);
    const s = kind === 'hold' ? 1.38 : kind === 'release' ? 2.0 : 1.75;
    b.animate([
      { transform: 'scale(.72)', opacity: 1 },
      { transform: 'scale(1.14)', opacity: 1, offset: 0.25 },
      { transform: `scale(${s})`, opacity: 0 },
    ], { duration: kind === 'hold' ? 180 : 300, easing: 'ease-out' }).onfinish = () => b.remove();
  }

  /** 结算当前音符：grade = 'perfect' | 'good' | 'miss' */
  function judge(grade, kind = 'tap') {
    if (grade === 'miss') {
      streak = 0;
      stats.miss++;
      sfx.rhythmHit('miss');
    } else {
      streak++;
      stats[grade]++;
      stats.best = Math.max(stats.best, streak);
      burst(kind, grade === 'perfect');
      sfx.rhythmHit(kind, grade);
    }
    showJudge(grade);
    updateHud();
    targetRing.classList.remove('following');
    dot.hidden = true;
    next++;
    holding = false;
  }

  function resetRun() {
    next = 0; streak = 0; holding = false; lastBeatIdx = -999;
    Object.assign(stats, { perfect: 0, good: 0, miss: 0, best: 0 });
    judgeAnim?.cancel();
    judgeEl.textContent = '';
    progressFill.style.transform = 'scaleX(0)';
    updateHud();
    for (const n of notes) n.hidden = true;
    for (const tk of ticks) tk.hidden = true;
    targetRing.classList.remove('following');
    dot.hidden = true;
  }

  function startSong() {
    resetRun();
    finale.hidden = true;
    hud.hidden = true;
    launch.hidden = false;
    bufferBox.hidden = false;
    retryBtn.hidden = true;
    message.textContent = '';
    bufferBar.value = 0;
    bufferPct.textContent = ' 0%';
    song.load({
      onProgress: (p) => { bufferBar.value = p; bufferPct.textContent = ` ${Math.round(p * 100)}%`; },
      onReady: () => {
        if (!active) return;
        launch.hidden = true;
        lane.hidden = false;
        hud.hidden = false;
        hintEl.hidden = false;
        playing = true;
        song.begin();
      },
      onEnded: () => finish(),
      onError: () => {
        song.stop();
        playing = false;
        lane.hidden = true;
        hud.hidden = true;
        launch.hidden = false;
        bufferBox.hidden = true;
        retryBtn.hidden = false;
        message.textContent = '音乐加载失败';
        if (holding) onHoldBroken();
        resetRun();
      },
    });
  }

  function finish() {
    if (!active) return;
    playing = false;
    song.stop();
    if (holding) onHoldBroken();
    while (next < CHART.length) judge('miss');
    lane.hidden = true;
    hud.hidden = true;
    const total = CHART.length;
    const acc = accuracy();
    const ap = stats.miss === 0 && stats.good === 0;
    const fc = stats.miss === 0;
    const rank = ap || (fc && acc >= 98) ? 'S+' : acc >= 95 ? 'S' : acc >= 88 ? 'A' : acc >= 75 ? 'B' : 'C';
    statsEl.innerHTML = `
      <div class="rhythm-rank">评价 <b>${rank}</b>${ap ? ' · ALL PERFECT!' : fc ? ' · FULL COMBO!' : ''}</div>
      <div>准确度 <b>${acc.toFixed(1)}%</b> · 最高连击 <b>${stats.best}</b></div>
      <div class="rhythm-breakdown">PERFECT <b>${stats.perfect}</b> · GOOD <b>${stats.good}</b> · MISS <b>${stats.miss}</b> / ${total}</div>
      <div class="rhythm-credit">${SONG_CREDIT}</div>`;
    finale.hidden = false;
  }

  function stop() {
    if (holding) onHoldBroken();
    active = false; playing = false; holding = false;
    song.stop();
    lane.hidden = true; hud.hidden = true; launch.hidden = true; finale.hidden = true;
    resetRun();
    button.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('rhythm-playing');
    onToggle(false);
  }

  button.addEventListener('click', () => {
    if (active) { stop(); return; }
    sfx.ensureContext();
    active = true;
    button.setAttribute('aria-pressed', 'true');
    document.body.classList.add('rhythm-playing');
    onToggle(true);
    startSong();
  });
  retryBtn.addEventListener('click', startSong);
  finale.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'again') startSong();
    else if (act === 'exit') stop();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && active && playing) stop(); });

  return {
    get active() { return active; },
    get playing() { return playing; },

    /** 每帧：自动判漏、节拍脉动、摆放轨道刻度与音符 */
    tick() {
      if (!playing) return;
      const now = T();
      if (now >= Math.min(SONG_END, song.duration - 0.1)) { finish(); return; }
      hintEl.hidden = now > 0.25;
      progressFill.style.transform = `scaleX(${Math.max(0, Math.min(1, now / SONG_END))})`;

      // 判定超时漏掉的音符
      while (next < CHART.length) {
        const n = CHART[next];
        const due = holding ? n.until + RELEASE_GOOD : n.at + GOOD_WINDOW;
        if (now <= due) break;
        const wasHolding = holding;
        judge('miss');
        if (wasHolding) onHoldBroken();
      }

      // 160 BPM 判定圈节拍脉动，增强音乐卡点直觉
      const beatIdx = Math.floor((now - BEAT_OFFSET) / BEAT_SEC);
      if (beatIdx >= 0 && beatIdx !== lastBeatIdx) {
        lastBeatIdx = beatIdx;
        if (!holding) {
          targetRing.animate([
            { transform: 'scale(1.14)' },
            { transform: 'scale(1)' },
          ], { duration: 150, easing: 'ease-out' });
        }
      }

      const a = anchor();
      const x0 = a.x, maxLen = Math.max(120, Math.min(340, W - x0 - 20));
      track.style.transform = `translate(${x0}px, ${a.y}px)`;
      track.style.width = `${maxLen}px`;
      const visibleSec = TRAVEL_BEATS * BEAT_SEC; // 固定 4 拍 = 1.5 秒
      const speed = maxLen / visibleSec;
      const horizon = now + visibleSec;

      // 每 2 拍（强拍/次强拍）在轨道上绘制淡淡节拍刻度
      const firstTickBeat = Math.max(0, Math.ceil((now - BEAT_OFFSET) / (BEAT_SEC * 2)) * 2);
      let ti = 0;
      for (let b = firstTickBeat; ; b += 2) {
        const bt = BEAT_OFFSET + b * BEAT_SEC;
        if (bt > horizon) break;
        const tk = tickEl(ti++);
        tk.hidden = false;
        tk.className = b % 4 === 0 ? 'rhythm-beat-tick bar' : 'rhythm-beat-tick';
        tk.style.transform = `translateX(${(bt - now) * speed}px)`;
      }
      for (let k = ti; k < ticks.length; k++) ticks[k].hidden = true;

      // 渲染视野内的音符
      let last = next;
      while (last < CHART.length && CHART[last].at <= horizon) last++;
      for (let k = last - next; k < notes.length; k++) notes[k].hidden = true;
      for (let i = next; i < last; i++) {
        const node = noteEl(i - next);
        const n = CHART[i];
        const held = holding && i === next;
        const cls = `rhythm-note ${n.move}${held ? ' held' : ''}`;
        if (node.className !== cls) node.className = cls;
        const head = (n.at - now) * speed;
        const shown = Math.max(0, head);
        node.hidden = false;
        node.style.transform = `translateX(${shown - 18}px)`;
        node.style.width = `${36 + Math.max(0, head + ((n.until ?? n.at) - n.at) * speed - shown)}px`;
        node.style.opacity = String(Math.min(1, Math.max(0, (horizon - n.at) / 0.14)));
        const ring = node.lastElementChild;
        const approach = Math.max(0, Math.min(1, (n.at - now) / (BEAT_SEC * 1.5)));
        ring.style.setProperty('--approach-scale', String(1 + 0.78 * approach));
        ring.style.setProperty('--approach-opacity', String(i === next ? 0.75 * (1 - approach) : 0));
      }
    },

    /** 按下：返回 'poke' / 'single'（命中的音符类型），没对上返回 null */
    press(e) {
      if (!playing || holding) return null;
      const t = T(e?.timeStamp ?? performance.now());
      while (next < CHART.length && t > CHART[next].at + GOOD_WINDOW) judge('miss');
      const n = CHART[next];
      if (!n) return null;
      const err = t - n.at;
      const absErr = Math.abs(err);
      if (absErr > EARLY_IGNORE) return null;
      if (absErr > GOOD_WINDOW) return null; // 太早不扣连击，轻戳一下
      const grade = absErr <= PERFECT_WINDOW ? 'perfect' : 'good';
      if (n.move === 'poke') {
        judge(grade, 'tap');
        return 'poke';
      }
      holding = true;
      pressGrade = grade;
      targetRing.classList.add('following');
      burst('hold', grade === 'perfect');
      sfx.rhythmHit('hold', grade);
      if (e?.pointerType === 'touch') { moveDot(e); dot.hidden = false; }
      return 'single';
    },

    drag(e) { if (holding && !dot.hidden) moveDot(e); },

    /** 松手：ok = 正常抬起（不是被打断） */
    release(ok, ts = performance.now()) {
      if (!active || !holding) return;
      const n = CHART[next];
      if (!n) { holding = false; return; }
      const err = T(ts) - n.until;
      const absErr = Math.abs(err);
      if (!ok || absErr > RELEASE_GOOD) {
        judge('miss');
        return;
      }
      const relGrade = absErr <= RELEASE_PERFECT ? 'perfect' : 'good';
      const finalGrade = pressGrade === 'perfect' && relGrade === 'perfect' ? 'perfect' : 'good';
      judge(finalGrade, 'release');
    },

    exit: stop,
    get debug() { return { time: T(), next, stats: { ...stats }, streak, sync, chart: CHART, finish }; },
  };

  function moveDot(e) { dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }
}

function el(tag, cls) {
  const n = document.createElement(tag);
  n.className = cls;
  return n;
}
