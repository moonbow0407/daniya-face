/**
 * 音游的歌曲播放器：Web Audio 解码后按 AudioContext 时钟精确起播（自动补偿 outputLatency），
 * 避免 HTMLAudioElement 起播延迟与 currentTime 跳变导致的"没卡上点"。
 */
export const LEAD_IN = 2.0; // 2 秒预备滑动，让第一拍从容进场

/** 基于 Web Audio API 的高精度播放器，支持流式加载进度和解码缓存 */
export class WebAudioSongPlayer {
  constructor(url, getCtx, fallbackDuration = 0) {
    this.url = url;
    this.fallbackDuration = fallbackDuration;
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

  get duration() { return this.buffer ? this.buffer.duration : this.fallbackDuration; }

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
