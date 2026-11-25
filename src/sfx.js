/**
 * 音效。
 * - 拉脸：照参考站的做法，用三段采样（抓紧 / 揉动循环 / 松手回弹），跟着手的动作控制音量和播放速度。
 *   采样文件放在 public/sfx/（不进仓库）；缺文件时拉脸就不出声，其它音效不受影响。
 * - 其它（戳、捧、脸红、汗滴、鼓腮、眨眼）：Web Audio 现场合成，风格是软、圆、短。
 */
const STORE_KEY = 'daniya.sound';
const SAMPLES = { tension: '/sfx/pull-tension.wav', release: '/sfx/pull-release.wav', rub: '/sfx/pull-rub.wav' };

function loadEnabled() {
  try { return localStorage.getItem(STORE_KEY) !== 'off'; } catch { return true; }
}

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16]; // 连戳时音高沿五声音阶往上走

export class Sfx {
  constructor() {
    this.enabled = loadEnabled();
    this.quiet = false;      // 音游进行中：只听音乐，不出交互音效
    this.ctx = null;
    this.buf = {};
    this.combo = 0;
    this.lastPoke = -Infinity;
    // 拉脸采样的状态（ready → tighten → rub）
    this.pull = { state: 'ready', voice: null, lastR: 0, lastY: 0, startY: 0 };
    this.rubVoice = null;
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 隐私模式 */ }
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
    if (!on) { this.pullRelease(false); this.cupRub(0); }
  }

  /** 必须在用户手势里调用一次，浏览器才允许出声 */
  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3;
      comp.attack.value = 0.003; comp.release.value = 0.15;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      // 和参考站一样，高频稍微提亮一点，听着更"脆"
      const shelf = ctx.createBiquadFilter();
      shelf.type = 'highshelf'; shelf.frequency.value = 2400; shelf.gain.value = 2;
      this.master.connect(shelf).connect(comp).connect(ctx.destination);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      for (const [k, url] of Object.entries(SAMPLES)) {
        fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
          .then((a) => ctx.decodeAudioData(a)).then((b) => { this.buf[k] = b; }).catch(() => {});
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() { return this.enabled && !this.quiet && this.ctx && this.ctx.state === 'running' && !document.hidden; }

  // ---------- 底层积木 ----------
  out(pan = 0) {
    const ctx = this.ctx;
    if (!pan || !ctx.createStereoPanner) return this.master;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.master);
    return p;
  }

  env(at, peak, attack, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    return g;
  }

  tone({ type = 'sine', f0, f1 = f0, glide = 0.08, at = 0, attack = 0.004, dur = 0.15, gain = 0.3, pan = 0, dest }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    const g = this.env(t, gain, attack, dur);
    o.connect(g).connect(dest ?? this.out(pan));
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }

  noise({ type = 'lowpass', f0, f1 = f0, q = 0.8, at = 0, attack = 0.003, dur = 0.05, gain = 0.1, pan = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.env(t, gain, attack, dur);
    s.connect(f).connect(g).connect(this.out(pan));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  sample(name, { gain = 0.2, rate = 1, loop = false, offset = 0, duration } = {}) {
    const b = this.buf[name];
    if (!b) return null;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = b; source.loop = loop; source.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    source.connect(g).connect(this.master);
    source.onended = () => { source.disconnect(); g.disconnect(); };
    if (duration) source.start(ctx.currentTime, offset, duration); else source.start(ctx.currentTime, offset);
    return { source, gain: g };
  }

  stopVoice(v, fade = 0.012) {
    if (!v) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, fade);
    try { v.source.stop(t + 0.06); } catch { /* 已停 */ }
  }

  // ---------- 拉脸（参考站同款） ----------
  /**
   * 每帧调用。r: 拉扯程度 0..1；y: 竖直方向的拉扯位置（归一化）。
   * 刚拉开时放"抓紧"那一下；之后手上下揉动，才切到"揉"的循环声，音量跟着动作快慢走，手停就静。
   */
  pullMove(r, y, dt) {
    const p = this.pull;
    const move = Math.max(0, r - p.lastR, Math.abs(y - p.lastY));
    p.lastR = r; p.lastY = y;
    if (r < 0.025 || move < 1.5e-4 || !this.ready || !this.buf.tension) return;
    const t = this.ctx.currentTime;
    if (p.state === 'ready') {
      p.state = 'tighten'; p.startY = y;
      const v = this.sample('tension', { gain: 0.24, offset: 0, duration: 0.48 });
      v.gain.gain.setTargetAtTime(0, t + 0.4, 0.018);
      p.voice = v;
      return;
    }
    if (p.state === 'tighten') {
      if (Math.abs(y - p.startY) < 0.035 || !this.buf.rub) return;
      this.stopVoice(p.voice);
      p.state = 'rub';
      p.voice = this.sample('rub', { gain: 0, loop: true });
    }
    if (!p.voice) return;
    const speed = Math.min(1, move / Math.max(0.001, dt));
    const g = p.voice.gain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.09 + 0.15 * Math.sqrt(speed), t, 0.035);
    g.setTargetAtTime(0, t + 0.095, 0.065);
  }

  /** 松手：停掉揉动声；play 时放回弹声，拉得越开越响、越"紧" */
  pullRelease(play) {
    const p = this.pull;
    const r = p.lastR;
    p.lastR = 0; p.lastY = 0; p.state = 'ready';
    if (!this.ctx) return;
    this.stopVoice(p.voice); p.voice = null;
    if (!play || r < 0.035 || !this.ready) return;
    this.sample('release', { gain: 0.105 + 0.115 * r, rate: 0.95 + 0.05 * r });
    vibrate(10);
  }

  // ---------- 合成音效 ----------
  /** 戳：软软的"啵"。side: -1 画面左 / 1 画面右；连戳音高往上走 */
  poke(side = 0) {
    if (!this.ready) return;
    const now = performance.now();
    this.combo = now - this.lastPoke < 420 ? Math.min(this.combo + 1, PENTA.length - 1) : 0;
    this.lastPoke = now;
    const k = 2 ** (PENTA[this.combo] / 12) * (0.97 + Math.random() * 0.06);
    const pan = side * 0.28;
    this.tone({ f0: 520 * k, f1: 250 * k, glide: 0.07, dur: 0.16, gain: 0.42, pan });
    this.tone({ f0: 1040 * k, f1: 520 * k, glide: 0.05, dur: 0.06, gain: 0.07, pan });
    this.noise({ type: 'bandpass', f0: 2400, f1: 900, q: 1.1, dur: 0.03, gain: 0.12, pan });
    vibrate(6);
  }

  /** 捧住：低低的"姆~"，像麻薯被压扁 */
  cupPress() {
    if (!this.ready) return;
    this.tone({ f0: 250, f1: 185, glide: 0.14, attack: 0.012, dur: 0.22, gain: 0.3 });
    this.noise({ f0: 900, f1: 260, q: 0.7, attack: 0.01, dur: 0.16, gain: 0.07 });
    vibrate(8);
  }

  /** 松开捧脸：轻轻"噗" */
  cupRelease() {
    if (!this.ready) return;
    this.tone({ f0: 330, f1: 420, glide: 0.06, dur: 0.1, gain: 0.12 });
  }

  /** 捧着揉脸：借"揉"的循环采样，level 0..1 跟着揉的快慢 */
  cupRub(level) {
    if (!this.ctx) return;
    if (level <= 0.01 || !this.ready || !this.buf.rub) {
      if (this.rubVoice) { this.stopVoice(this.rubVoice, 0.05); this.rubVoice = null; }
      return;
    }
    this.rubVoice ??= this.sample('rub', { gain: 0, loop: true, rate: 0.9 });
    this.rubVoice.gain.gain.setTargetAtTime(0.16 * Math.sqrt(level), this.ctx.currentTime, 0.05);
  }

  /** 揉晕了：两声往下打转的"呜~呜~" */
  dizzy() {
    if (!this.ready) return;
    for (let i = 0; i < 2; i++) {
      this.tone({ type: 'triangle', f0: 620 - i * 80, f1: 380 - i * 60, glide: 0.22, at: i * 0.2, attack: 0.02, dur: 0.24, gain: 0.08, pan: i ? 0.25 : -0.25 });
    }
  }

  /** 被捧着眨眼（参考站同款）："眨、眨" */
  blinkTick(second) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, d = second ? 0.067 : 0.093, k = 0.985 + Math.random() * 0.03;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime((second ? 825 : 590) * k, t);
    o.frequency.exponentialRampToValueAtTime((second ? 875 : 805) * k, t + 0.023);
    o.frequency.exponentialRampToValueAtTime((second ? 665 : 755) * k, t + d);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(second ? 0.05 : 0.065, t + 0.012);
    g.gain.exponentialRampToValueAtTime(1e-4, t + d);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + d);
  }

  /** 脸红：两声很轻的高音"叮~" */
  blush() {
    if (!this.ready) return;
    this.bell(1318.5, { gain: 0.05, dur: 0.7, pan: -0.15 });
    this.bell(1975.5, { at: 0.08, gain: 0.04, dur: 0.8, pan: 0.15 });
  }

  bell(freq, { at = 0, gain = 0.12, dur = 0.9, pan = 0 } = {}) {
    const dest = this.out(pan);
    this.tone({ f0: freq, at, attack: 0.002, dur, gain, dest });
    this.tone({ f0: freq * 2.0, at, attack: 0.002, dur: dur * 0.45, gain: gain * 0.28, dest });
  }

  /** 冒汗滴：水滴"嘀" */
  drip(at = 0) {
    if (!this.ready) return;
    this.tone({ f0: 650, f1: 1700, glide: 0.045, at, attack: 0.002, dur: 0.09, gain: 0.16, pan: 0.3 });
  }

  /** 生闷气鼓腮：小小一口气 "噗~" */
  puff() {
    if (!this.ready) return;
    this.noise({ f0: 700, f1: 320, q: 0.6, attack: 0.03, dur: 0.24, gain: 0.08 });
    this.tone({ type: 'triangle', f0: 200, f1: 165, glide: 0.2, attack: 0.03, dur: 0.24, gain: 0.07 });
  }

  /** 切换工具 */
  tick() {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    this.tone({ f0: 1500, f1: 1200, glide: 0.02, dur: 0.035, gain: 0.05 });
  }

  /** 音游打击反馈：轻脆、不盖过人声，增强卡点手感（不受 quiet 限制，仍受全局音效开关控制） */
  rhythmHit(kind, grade = 'perfect') {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running' || document.hidden) return;
    if (kind === 'miss') {
      this.tone({ type: 'triangle', f0: 175, f1: 110, glide: 0.07, attack: 0.003, dur: 0.09, gain: 0.07 });
      return;
    }
    if (kind === 'tap') {
      const hi = grade === 'perfect';
      this.tone({ type: 'triangle', f0: hi ? 920 : 760, f1: hi ? 540 : 450, glide: 0.035, attack: 0.002, dur: 0.065, gain: hi ? 0.16 : 0.12 });
      this.noise({ type: 'bandpass', f0: hi ? 3200 : 2400, q: 1.5, attack: 0.001, dur: 0.018, gain: hi ? 0.07 : 0.05 });
      vibrate(5);
      return;
    }
    if (kind === 'hold') {
      this.tone({ type: 'sine', f0: 587, f1: 784, glide: 0.05, attack: 0.003, dur: 0.085, gain: 0.14 });
      vibrate(6);
      return;
    }
    if (kind === 'release') {
      const hi = grade === 'perfect';
      this.tone({ type: 'sine', f0: hi ? 1046.5 : 880, attack: 0.002, dur: 0.11, gain: 0.13 });
      this.tone({ type: 'sine', f0: hi ? 1568 : 1318.5, at: 0.02, attack: 0.002, dur: 0.11, gain: 0.08 });
      vibrate(5);
    }
  }

  /** 确保并获取共享 AudioContext（供音游高精度音频时钟使用） */
  ensureContext() {
    if (!this.ctx) {
      const wasEnabled = this.enabled;
      this.enabled = true;
      this.unlock();
      this.enabled = wasEnabled;
      if (!wasEnabled && this.master) this.master.gain.value = 0;
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }
}

function vibrate(ms) {
  try { navigator.vibrate?.(ms); } catch { /* 不支持 */ }
}
