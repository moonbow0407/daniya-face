/**
 * 音游：玩法照参考站。
 * 一条轨道从右脸颊往画面右侧延伸，音符从右往左滑到脸颊上的圆圈：
 *   - 圆音符 = 点按（戳脸）
 *   - 长条音符 = 按住（单手拉住脸），到尾巴时松手
 * 判定窗口：按下 ±0.22s，松手 ±0.29s；±0.09s 内算"精准"（爆开时多一圈小点）。
 * 曲子放完，弹出结算卡片。
 */
import { CHART, SONG_URL } from './rhythmChart.js';

const PRESS_WINDOW = 0.22;
const RELEASE_WINDOW = 0.29;
const PRECISE = 0.09;
const LEAD_IN = 2.0;        // 开场先让音符滑一会儿再放歌，第一个音符在 0.5s，太赶
const SYNC_KEY = 'daniya.rhythm-sync-ms';

class SongPlayer {
  constructor(url) { this.url = url; this.audio = null; this.leadStart = 0; this.started = false; }
  load({ onProgress, onReady, onEnded, onError }) {
    this.stop();
    const a = new Audio();
    this.audio = a;
    a.preload = 'auto';
    const progress = () => {
      if (!a.duration) return onProgress(0);
      let end = 0;
      for (let i = 0; i < a.buffered.length; i++) end = Math.max(end, a.buffered.end(i));
      onProgress(Math.min(1, end / a.duration));
    };
    a.onprogress = progress;
    a.oncanplaythrough = () => { a.oncanplaythrough = null; progress(); onReady(); };
    a.onended = onEnded;
    a.onerror = onError;
    a.src = this.url;
    a.load();
  }
  /** 开始倒计时：LEAD_IN 秒后真正放歌 */
  begin() {
    this.leadStart = performance.now();
    this.started = false;
  }
  update() {
    const a = this.audio;
    if (!a || this.started) return;
    if (performance.now() - this.leadStart >= LEAD_IN * 1000) {
      this.started = true;
      a.currentTime = 0;
      a.play().catch(() => a.onerror?.());
    }
  }
  /** 歌曲时间（秒）。ts = 事件的时间戳，用来扣掉事件到处理之间的延迟 */
  time(ts = performance.now()) {
    const a = this.audio;
    if (!a) return 0;
    const lag = Math.max(0, performance.now() - ts) / 1000;
    if (!this.started || (a.currentTime === 0 && a.paused)) {
      return Math.min(0, (ts - this.leadStart) / 1000 - LEAD_IN);
    }
    return a.currentTime - lag;
  }
  stop() {
    const a = this.audio;
    if (!a) return;
    this.audio = null;
    a.onprogress = a.oncanplaythrough = a.onended = a.onerror = null;
    a.pause();
    a.removeAttribute('src');
    a.load();
  }
}

/**
 * @param {object} o
 * @param {() => {x:number,y:number}} o.anchor 右脸颊在屏幕上的位置（CSS 像素）
 * @param {(active:boolean) => void} o.onToggle 进入/退出音游
 * @param {() => void} o.onHoldBroken 长按音符被判失败（时间到了还没松手等），需要强制松手
 */
export function createRhythm({ root, button, anchor, onToggle, onHoldBroken }) {
  const lane = el('div', 'rhythm-lane');
  const track = el('div', 'rhythm-track');
  const targetRing = el('div', 'rhythm-target');
  const streakEl = el('div', 'rhythm-streak');
  track.append(targetRing, streakEl);
  lane.append(track);
  lane.hidden = true;
  const dot = el('i', 'rhythm-pointer-dot');
  dot.hidden = true;
  lane.append(dot);

  const launch = el('div', 'rhythm-launch');
  launch.innerHTML = `
    <div class="rhythm-buffer"><span>音乐加载中</span><span class="rhythm-buffer-pct"></span><progress max="1"></progress></div>
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
  root.append(lane, launch, finale);

  const song = new SongPlayer(SONG_URL);
  let sync = 0;
  try { const v = Number(localStorage.getItem(SYNC_KEY)); if (Number.isFinite(v)) sync = Math.max(-250, Math.min(250, v)); } catch { /* 无 */ }
  const T = (ts) => song.time(ts) - sync / 1000;

  let active = false, playing = false;
  let next = 0;          // 下一个待判定的音符
  let holding = false;   // 正按住一个长条
  let pressError = 0;
  let streak = 0;
  const stats = { hit: 0, precise: 0, miss: 0, best: 0 };
  let W = 0, H = 0;
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

  function burst(kind, precise) {
    const b = el('i', 'rhythm-burst');
    b.dataset.kind = kind;
    b.dataset.precise = String(precise);
    track.append(b);
    const s = kind === 'hold' ? 1.32 : kind === 'release' ? 1.95 : 1.7;
    b.animate([
      { transform: 'scale(.72)', opacity: 1 },
      { transform: 'scale(1.12)', opacity: 1, offset: 0.25 },
      { transform: `scale(${s})`, opacity: 0 },
    ], { duration: kind === 'hold' ? 160 : 300, easing: 'ease-out' }).onfinish = () => b.remove();
  }

  /** 结算当前音符 */
  function judge(ok, err = 0) {
    if (ok) {
      streak++;
      stats.hit++;
      if (Math.abs(err) < PRECISE) stats.precise++;
      stats.best = Math.max(stats.best, streak);
      burst(holding ? 'release' : 'tap', Math.abs(err) < PRECISE);
    } else {
      streak = 0;
      stats.miss++;
    }
    streakEl.textContent = streak >= 2 ? `×${streak}` : '';
    targetRing.classList.remove('following');
    dot.hidden = true;
    next++;
    holding = false;
  }

  function resetRun() {
    next = 0; streak = 0; holding = false;
    Object.assign(stats, { hit: 0, precise: 0, miss: 0, best: 0 });
    streakEl.textContent = '';
    for (const n of notes) n.hidden = true;
    targetRing.classList.remove('following');
    dot.hidden = true;
  }

  function startSong() {
    resetRun();
    finale.hidden = true;
    launch.hidden = false;
    bufferBox.hidden = false;
    retryBtn.hidden = true;
    message.textContent = '';
    bufferBar.removeAttribute('value');
    bufferPct.textContent = '';
    song.load({
      onProgress: (p) => { bufferBar.value = p; bufferPct.textContent = ` ${Math.round(p * 100)}%`; },
      onReady: () => {
        if (!active) return;
        launch.hidden = true;
        lane.hidden = false;
        playing = true;
        song.begin();
      },
      onEnded: () => finish(),
      onError: () => {
        song.stop();
        playing = false;
        lane.hidden = true;
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
    // 没判定完的音符（理论上不会有）都算漏掉
    while (next < CHART.length) judge(false);
    lane.hidden = true;
    const total = CHART.length;
    const full = stats.miss === 0;
    statsEl.innerHTML = `
      ${full ? '<div class="rhythm-fc">全连！</div>' : ''}
      <div><b>${stats.hit}</b> / ${total} 命中 · 精准 <b>${stats.precise}</b></div>
      <div>最高连击 <b>${stats.best}</b></div>`;
    finale.hidden = false;
  }

  function stop() {
    if (holding) onHoldBroken();
    active = false; playing = false; holding = false;
    song.stop();
    lane.hidden = true; launch.hidden = true; finale.hidden = true;
    resetRun();
    button.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('rhythm-playing');
    onToggle(false);
  }

  button.addEventListener('click', () => {
    if (active) { stop(); return; }
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

    /** 每帧：自动判漏、摆放轨道和音符 */
    tick() {
      if (!playing) return;
      song.update();
      const now = T();
      while (next < CHART.length) {
        const n = CHART[next];
        const due = holding ? n.until + RELEASE_WINDOW : n.at + PRESS_WINDOW;
        if (now <= due) break;
        const wasHolding = holding;
        judge(false);
        if (wasHolding) onHoldBroken();
      }
      const a = anchor();
      const x0 = a.x, maxLen = Math.max(1, Math.min(300, W - x0 - 20));
      track.style.transform = `translate(${x0}px, ${a.y}px)`;
      track.style.width = `${maxLen}px`;
      const speed = Math.max(176, maxLen / 1.65); // 像素/秒：音符提前约 1.65 秒出现
      const horizon = now + maxLen / speed;
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
        node.style.opacity = String(Math.min(1, Math.max(0, (horizon - n.at) / 0.15)));
        const ring = node.lastElementChild;
        const approach = Math.max(0, Math.min(1, (n.at - now) / 0.65));
        ring.style.setProperty('--approach-scale', String(1 + 0.8 * approach));
        ring.style.setProperty('--approach-opacity', String(i === next ? 0.75 * (1 - approach) : 0));
      }
    },

    /** 按下：返回 'poke' / 'single'（命中的音符类型），没对上返回 null */
    press(e) {
      if (!playing || holding) return null;
      const t = T(e.timeStamp);
      while (next < CHART.length && t > CHART[next].at + PRESS_WINDOW) judge(false);
      const n = CHART[next];
      if (!n) return null;
      pressError = t - n.at;
      if (Math.abs(pressError) > PRESS_WINDOW) return null;
      if (n.move === 'poke') { judge(true, pressError); return 'poke'; }
      holding = true;
      targetRing.classList.add('following');
      burst('hold', false);
      if (e.pointerType === 'touch') { moveDot(e); dot.hidden = false; }
      return 'single';
    },

    drag(e) { if (holding && !dot.hidden) moveDot(e); },

    /** 松手：ok = 正常抬起（不是被打断） */
    release(ok, ts) {
      if (!active || !holding) return;
      const n = CHART[next];
      const err = T(ts) - n.until;
      const good = ok && Math.abs(err) <= RELEASE_WINDOW;
      judge(good, Math.abs(err) > Math.abs(pressError) ? err : pressError);
    },

    exit: stop,
    /** 调试用 */
    get debug() { return { time: T(), next, stats: { ...stats }, streak, chart: CHART, finish }; },
  };

  function moveDot(e) { dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }
}

function el(tag, cls) {
  const n = document.createElement(tag);
  n.className = cls;
  return n;
}
