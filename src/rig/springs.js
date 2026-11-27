import * as THREE from 'three';
import { uniforms, POKE_SLOTS } from './uniforms.js';

/* 脸部的几种弹簧：捧脸托起、戳脸、眨眼节奏（纯 CPU 逻辑，结果写进 uniform 或返回数值） */

/**
 * 欠阻尼振子精确推进一步（围绕 0 振荡）：a = 衰减率，wd = 振荡角频率。
 * 用解析解而不是数值积分，帧率高低结果都一样。返回 [位移, 速度]
 */
export function oscStep(x0, v0, a, wd, dt) {
  const e = Math.exp(-a * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt) / wd;
  return [e * ((c + a * s) * x0 + s * v0), e * ((c - a * s) * v0 - (wd * wd + a * a) * s * x0)];
}

/** 捧脸的托起弹簧：按住时快速托起（带一点过冲），松手后软软落回 */
export class CheekSpring {
  constructor() { this.value = 0; this.velocity = 0; }
  update(dt, held) {
    const target = held ? 1 : 0;
    const w = held ? 20 : 16, zeta = held ? 0.48 : 0.55;
    const [x, v] = oscStep(this.value - target, this.velocity, zeta * w, w * Math.sqrt(1 - zeta * zeta), dt);
    this.value = target + x; this.velocity = v;
    if (Math.abs(this.value - target) < 5e-4 && Math.abs(this.velocity) < 0.01) { this.value = target; this.velocity = 0; }
    return this.value;
  }
}

/*
 * 戳脸：每侧 2 个槽位。一次点击 = 给落点一个冲量，之后自由振荡回去：
 * 先按进去，再冲过头往外鼓，来回几下停住。w 是"按进去的程度"（冲量单位，着色器里再换成位移）
 */
const KICK = 4.8, KICK_MAX = 6; // 每次点击的冲量、单个坑的速度上限（× strength）
const DECAY = 4.6, FREQ = 22; // 衰减率、振荡角频率
const SAME_SPOT = 0.1; // 落点离已有的坑这么近（脸部坐标）就叠在同一个坑上

export class PokeField {
  constructor() {
    this.points = uniforms.uPokes.value;
    this.normals = uniforms.uPokeN.value;
    this.velocity = new Float64Array(POKE_SLOTS);
    this.reactions = [0, 0]; // 被戳的一侧"吃痛"程度（跟着坑的深浅走）
    this.smiles = [0, 0]; // 戳完之后那侧嘴角上扬
    this.smileDrive = [0, 0];
  }

  /** p = 落点，n = 表面法线（都在脸部坐标）；strength 1 = 普通一戳 */
  tap(p, n, strength = 1) {
    const side = p.x < 0 ? 0 : 1;
    this.smileDrive[side] = Math.min(1, this.smileDrive[side] + 0.85);
    const start = side * (POKE_SLOTS / 2);
    let nearest = start, best = Infinity, free = -1;
    for (let h = start; h < start + POKE_SLOTS / 2; h++) {
      const u = this.points[h];
      if (!u.w && !this.velocity[h]) { free = h; continue; }
      const d = (u.x - p.x) ** 2 + (u.y - p.y) ** 2 + (u.z - p.z) ** 2;
      if (d < best) { best = d; nearest = h; }
    }
    const slot = best < SAME_SPOT ** 2 || free < 0 ? nearest : free;
    if (slot === free) { this.points[slot].set(p.x, p.y, p.z, 0); this.normals[slot].copy(n).normalize(); }
    this.velocity[slot] = Math.min(KICK_MAX * strength, this.velocity[slot] + KICK * strength);
  }

  update(dt) {
    this.points.forEach((a, i) => {
      if (!a.w && !this.velocity[i]) return;
      [a.w, this.velocity[i]] = oscStep(a.w, this.velocity[i], DECAY, FREQ, dt);
      if (Math.abs(a.w) < 25e-5 && Math.abs(this.velocity[i]) < 0.008) { a.w = 0; this.velocity[i] = 0; }
    });
    for (let side = 0; side < 2; side++) {
      const drive = this.smileDrive[side];
      this.smiles[side] += (drive - this.smiles[side]) * (1 - Math.exp(-11 * dt));
      this.smileDrive[side] *= Math.exp(-3.4 * dt);
      if (drive < 0.001 && this.smiles[side] < 0.001) this.smiles[side] = this.smileDrive[side] = 0;
      const o = side * (POKE_SLOTS / 2);
      const amp = Math.max(Math.abs(this.points[o].w), Math.abs(this.points[o + 1].w));
      const target = Math.min(1, amp * 7);
      this.reactions[side] += (target - this.reactions[side]) * (1 - Math.exp(-(target > this.reactions[side] ? 23 : 10) * dt));
      if (!target && this.reactions[side] < 0.001) this.reactions[side] = 0;
    }
  }
}

/** 眨眼节奏：间隔不规则，偶尔连眨两下；被拉住时眨得更勤 */
const BLINK_GAPS = [3.6, 4.8, 3.1, 5.2, 4.1, 3.9];
const BLINK_LEAD = 0.75;
const ease = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const blinkCurve = (t) => (t < 0 || t >= 0.29 ? 0 : t < 0.08 ? ease(t / 0.08) : t < 0.115 ? 1 : 1 - ease((t - 0.115) / 0.175));

export class BlinkRhythm {
  constructor() {
    this.holding = false;
    this.elapsed = -3.6;
    this.paired = false;
    this.waitingAfterActiveBlink = false;
    this.group = 0;
    this.onTick = null;
  }
  update(dt, holding, suppress) {
    if (suppress) {
      this.holding = true; this.elapsed = -BLINK_LEAD; this.paired = false;
      this.waitingAfterActiveBlink = false; this.group = 0;
      return 0;
    }
    if (holding !== this.holding) {
      this.holding = holding; this.group = 0;
      this.waitingAfterActiveBlink = holding && this.elapsed >= 0;
      if (this.elapsed < 0) this.elapsed = holding ? -BLINK_LEAD : -3.6;
    }
    const prev = this.elapsed;
    this.elapsed += dt;
    if (prev < 0 && this.elapsed >= 0) this.paired = holding || this.group === 3;
    const gap2 = 0.36;
    // 被捧着连眨两下时，配两声很轻的"眨、眨"（音效见 sfx.blinkTick）
    const lead = 0.045;
    if (holding && this.paired && !this.waitingAfterActiveBlink && this.onTick) {
      if (prev < lead && this.elapsed >= lead) this.onTick(false);
      if (prev < gap2 + lead && this.elapsed >= gap2 + lead) this.onTick(true);
    }
    const end = this.paired ? gap2 + 0.29 : 0.29;
    if (this.elapsed >= end) {
      this.group = (this.group + 1) % BLINK_GAPS.length;
      const next = holding ? 1.8 + 0.15 * (this.group % 4) : BLINK_GAPS[this.group];
      if (this.waitingAfterActiveBlink) { this.elapsed -= end + BLINK_LEAD; this.waitingAfterActiveBlink = false; } else this.elapsed -= next;
    }
    return blinkCurve(this.elapsed) + (this.paired ? blinkCurve(this.elapsed - gap2) : 0);
  }
}
