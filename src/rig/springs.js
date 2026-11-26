import * as THREE from 'three';
import { uniforms, POKE_SLOTS } from './uniforms.js';

/* 脸部的几种弹簧：捧脸托起、戳脸冲击场、眨眼节奏（纯 CPU 逻辑，结果写进 uniform 或返回数值） */

/** 捧脸的脸颊挤压弹簧：按住时快速托起（带一点过冲），松手后软软落回 */
export class CheekSpring {
  constructor() { this.value = 0; this.velocity = 0; }
  update(dt, held) {
    const target = held ? 1 : 0;
    const w = held ? 20 : 16, zeta = held ? 0.48 : 0.55;
    const a = zeta * w, wd = w * Math.sqrt(1 - zeta * zeta);
    const x0 = this.value - target;
    const s = Math.sin(wd * dt) / wd, c = Math.cos(wd * dt), e = Math.exp(-a * dt);
    this.value = target + e * (x0 * c + (this.velocity + a * x0) * s);
    this.velocity = e * (this.velocity * c - (w * w * x0 + a * this.velocity) * s);
    if (Math.abs(this.value - target) < 5e-4 && Math.abs(this.velocity) < 0.01) { this.value = target; this.velocity = 0; }
    return this.value;
  }
}

/** 戳脸的弹簧场：每侧 2 个槽位，一次点击 = 给一个冲量，自己弹回去 */
export class PokeField {
  constructor() {
    this.points = uniforms.uPokes.value;
    this.velocity = new Float64Array(POKE_SLOTS);
    this.reactions = [0, 0];
    this.smiles = [0, 0];
    this.smileDrive = [0, 0];
  }

  tap(p, strength = 1) {
    const side = p.x < 0 ? 0 : 1;
    this.smileDrive[side] = Math.min(1, this.smileDrive[side] + 0.85);
    const start = (side * POKE_SLOTS) / 2;
    let nearest = start, best = Infinity, free = -1;
    for (let h = start; h < start + POKE_SLOTS / 2; h++) {
      const u = this.points[h];
      if (!u.w && !this.velocity[h]) { free = h; continue; }
      const d = (u.x - p.x) ** 2 + (u.y - p.y) ** 2 + (u.z - p.z) ** 2;
      if (d < best) { best = d; nearest = h; }
    }
    const slot = best < 0.1 ** 2 || free < 0 ? nearest : free;
    if (slot === free) this.points[slot].set(p.x, p.y, p.z, 0);
    this.velocity[slot] = Math.min(6 * strength, this.velocity[slot] + 4.8 * strength);
  }

  update(dt) {
    const Z = 4.6, W = 22; // 衰减、角频率
    const t = Math.exp(-Z * dt), c = Math.cos(W * dt), s = Math.sin(W * dt) / W;
    this.points.forEach((a, i) => {
      const w = a.w, v = this.velocity[i];
      if (!w && !v) return;
      a.w = t * ((c + Z * s) * w + s * v);
      this.velocity[i] = t * ((c - Z * s) * v - (W * W + Z * Z) * s * w);
      if (Math.abs(a.w) < 25e-5 && Math.abs(this.velocity[i]) < 0.008) { a.w = 0; this.velocity[i] = 0; }
    });
    for (let r = 0; r < 2; r++) {
      const drive = this.smileDrive[r];
      this.smiles[r] += (drive - this.smiles[r]) * (1 - Math.exp(-11 * dt));
      this.smileDrive[r] *= Math.exp(-3.4 * dt);
      if (drive < 0.001 && this.smiles[r] < 0.001) this.smiles[r] = this.smileDrive[r] = 0;
      const o = (r * POKE_SLOTS) / 2;
      const amp = Math.max(Math.abs(this.points[o].w), Math.abs(this.points[o + 1].w));
      const target = Math.min(1, amp * 7);
      const k = target > this.reactions[r] ? 23 : 10;
      this.reactions[r] += (target - this.reactions[r]) * (1 - Math.exp(-k * dt));
      if (!target && this.reactions[r] < 0.001) this.reactions[r] = 0;
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
    // 被捧着连眨两下时，配两声很轻的"眨、眨"（参考站同款）
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
