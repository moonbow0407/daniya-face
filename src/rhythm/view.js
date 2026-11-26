/**
 * 音游界面：轨道、音符、判定文字、HUD、加载提示、结算卡片。
 * 只负责 DOM，不做判定；判定逻辑在 index.js。
 */
const TRAVEL_BEATS = 4; // 轨道全长固定展示 4 拍，速度恒定易读

export function createRhythmView({ root, finaleImage, finaleAlt, hintText }) {
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

  const hint = el('div', 'rhythm-hint');
  hint.textContent = hintText ?? '点按 / 空格 = 戳脸 · 长按 = 拉脸';
  lane.append(hint);

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
      <img src="${finaleImage}" alt="${finaleAlt}" width="850" height="850" />
      <div class="rhythm-finale-stats"></div>
      <div class="rhythm-finale-actions">
        <button type="button" data-act="again">再来一次</button>
        <button type="button" data-act="exit">退出音游</button>
      </div>
    </div>`;
  const statsEl = finale.querySelector('.rhythm-finale-stats');
  root.append(lane, hud, launch, finale);

  let W = 0;
  new ResizeObserver(([e]) => { W = e.contentRect.width; }).observe(lane);
  let judgeAnim = null;

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

  return {
    hud, finale, retryBtn,

    renderSync(ms) { syncValEl.textContent = `${ms > 0 ? '+' : ''}${ms}ms`; },
    renderHud(acc, streak) {
      hudAcc.textContent = `${acc.toFixed(1)}%`;
      hudCombo.textContent = `${streak} 连击`;
      streakEl.textContent = streak >= 2 ? `×${streak}` : '';
    },

    showJudge(grade) {
      judgeEl.textContent = grade === 'perfect' ? 'PERFECT' : grade === 'good' ? 'GOOD' : 'MISS';
      judgeEl.dataset.grade = grade;
      judgeAnim?.cancel();
      judgeAnim = judgeEl.animate([
        { opacity: 0, transform: 'translate(-50%, 4px) scale(.84)' },
        { opacity: 1, transform: 'translate(-50%, -2px) scale(1.06)', offset: 0.2 },
        { opacity: 1, transform: 'translate(-50%, -5px) scale(1)', offset: 0.7 },
        { opacity: 0, transform: 'translate(-50%, -10px) scale(.96)' },
      ], { duration: 420, easing: 'ease-out', fill: 'forwards' });
    },

    burst(kind, perfect) {
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
    },

    /** 长按中：判定圈跟随、触屏显示手指圆点 */
    setFollowing(on, e) {
      targetRing.classList.toggle('following', on);
      if (!on) dot.hidden = true;
      else if (e?.pointerType === 'touch') { this.moveDot(e); dot.hidden = false; }
    },
    moveDot(e) { dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; },
    get dotVisible() { return !dot.hidden; },

    pulseBeat() {
      targetRing.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 150, easing: 'ease-out' });
    },

    reset() {
      judgeAnim?.cancel();
      judgeEl.textContent = '';
      progressFill.style.transform = 'scaleX(0)';
      for (const n of notes) n.hidden = true;
      for (const tk of ticks) tk.hidden = true;
      targetRing.classList.remove('following');
      dot.hidden = true;
    },

    /** 显示哪一屏：'off' | 'loading' | 'error' | 'playing' | 'finale' */
    screen(name) {
      lane.hidden = name !== 'playing';
      hud.hidden = name !== 'playing';
      launch.hidden = name !== 'loading' && name !== 'error';
      bufferBox.hidden = name !== 'loading';
      retryBtn.hidden = name !== 'error';
      message.textContent = name === 'error' ? '音乐加载失败' : '';
      finale.hidden = name !== 'finale';
      if (name === 'playing') hint.hidden = false;
    },
    loadProgress(p) { bufferBar.value = p; bufferPct.textContent = ` ${Math.round(p * 100)}%`; },

    showFinale({ rank, ap, fc, acc, stats, total, credit }) {
      statsEl.innerHTML = `
        <div class="rhythm-rank">评价 <b>${rank}</b>${ap ? ' · ALL PERFECT!' : fc ? ' · FULL COMBO!' : ''}</div>
        <div>准确度 <b>${acc.toFixed(1)}%</b> · 最高连击 <b>${stats.best}</b></div>
        <div class="rhythm-breakdown">PERFECT <b>${stats.perfect}</b> · GOOD <b>${stats.good}</b> · MISS <b>${stats.miss}</b> / ${total}</div>
        <div class="rhythm-credit">${credit}</div>`;
      this.screen('finale');
    },

    /**
     * 每帧摆放轨道：起点在脸颊点 anchor，音符从右往左滑向判定圈。
     * now = 当前歌曲时刻；next = 下一个待判音符；holding = 正在长按 next
     */
    renderTrack({ now, anchor, song, next, holding }) {
      const { notes: chart, beatSec, beatOffset, end } = song;
      hint.hidden = now > 0.25;
      progressFill.style.transform = `scaleX(${Math.max(0, Math.min(1, now / end))})`;

      const x0 = anchor.x, maxLen = Math.max(120, Math.min(340, W - x0 - 20));
      track.style.transform = `translate(${x0}px, ${anchor.y}px)`;
      track.style.width = `${maxLen}px`;
      const visibleSec = TRAVEL_BEATS * beatSec;
      const speed = maxLen / visibleSec;
      const horizon = now + visibleSec;

      // 每 2 拍（强拍/次强拍）在轨道上绘制淡淡节拍刻度
      const firstTickBeat = Math.max(0, Math.ceil((now - beatOffset) / (beatSec * 2)) * 2);
      let ti = 0;
      for (let b = firstTickBeat; ; b += 2) {
        const bt = beatOffset + b * beatSec;
        if (bt > horizon) break;
        const tk = tickEl(ti++);
        tk.hidden = false;
        tk.className = b % 4 === 0 ? 'rhythm-beat-tick bar' : 'rhythm-beat-tick';
        tk.style.transform = `translateX(${(bt - now) * speed}px)`;
      }
      for (let k = ti; k < ticks.length; k++) ticks[k].hidden = true;

      // 视野内的音符
      let last = next;
      while (last < chart.length && chart[last].at <= horizon) last++;
      for (let k = last - next; k < notes.length; k++) notes[k].hidden = true;
      for (let i = next; i < last; i++) {
        const node = noteEl(i - next);
        const n = chart[i];
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
        const approach = Math.max(0, Math.min(1, (n.at - now) / (beatSec * 1.5)));
        ring.style.setProperty('--approach-scale', String(1 + 0.78 * approach));
        ring.style.setProperty('--approach-opacity', String(i === next ? 0.75 * (1 - approach) : 0));
      }
    },
  };
}

function el(tag, cls) {
  const n = document.createElement(tag);
  n.className = cls;
  return n;
}
