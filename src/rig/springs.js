import * as THREE from 'three';
import { uniforms, POKE_SLOTS } from './uniforms.js';

/* 脸部的几种弹簧：捧脸托起、戳脸、眨眼节奏（纯 CPU 逻辑，结果写进 uniform 或返回数值） */

const SUB = 1 / 240; // 积分步长：固定小步长，帧率高低手感一致

/** 阻尼弹簧（半隐式欧拉，固定小步长）。w = 角频率，z = 阻尼比（<1 会过冲、来回晃） */
export function springStep(x, v, target, w, z, dt) {
  const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n;
  for (let i = 0; i < n; i++) {
    v += (w * w * (target - x) - 2 * z * w * v) * h;
    x += v * h;
  }
  return [x, v];
}

/** 同上，三维向量版（原地修改 x、v） */
export function springStepVec(x, v, target, w, z, dt) {
  const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n;
  for (let i = 0; i < n; i++) {
    v.x += (w * w * (target.x - x.x) - 2 * z * w * v.x) * h;
    v.y += (w * w * (target.y - x.y) - 2 * z * w * v.y) * h;
    v.z += (w * w * (target.z - x.z) - 2 * z * w * v.z) * h;
    x.addScaledVector(v, h);
  }
}

/** 捧脸的托起弹簧：按住时快速托起（略过冲），松手后软软落回 */
export class CheekSpring {
  constructor() { this.value = 0; this.velocity = 0; }
  update(dt, held) {
    const target = held ? 1 : 0;
    [this.value, this.velocity] = springStep(this.value, this.velocity, target, held ? 19 : 14, held ? 0.45 : 0.42, dt);
    if (Math.abs(this.value - target) < 5e-4 && Math.abs(this.velocity) < 0.01) { this.value = target; this.velocity = 0; }
    return this.value;
  }
}

/*
 * 戳脸：每侧 2 个槽位。一次点击 = 指尖按住约 70ms（硬弹簧跟到目标深度），
 * 松开后换成软弹簧弹回——欠阻尼，会冲过头往外鼓一下再落定。深度单位是半脸宽。
 */
const PRESS_TIME = 0.07;
const DEPTH = 0.065, DEPTH_MAX = 0.11;

export class PokeField {
  constructor() {
    this.points = uniforms.uPokes.value;
    this.normals = uniforms.uPokeN.value;
    this.velocity = new Float64Array(POKE_SLOTS);
    this.target = new Float64Array(POKE_SLOTS);
    this.press = new Float64Array(POKE_SLOTS);
    this.reactions = [0, 0]; // 被戳的一侧"吃痛"程度（跟着坑的深度走）
    this.smiles = [0, 0]; // 戳完之后那侧嘴角上扬
    this.smileDrive = [0, 0];
  }

  /** p = 落点，n = 表面法线（都在脸部坐标）；strength 1 = 普通一戳 */
  tap(p, n, strength = 1) {
    const side = p.x < 0 ? 0 : 1;
    this.smileDrive[side] = Math.min(1, this.smileDrive[side] + 0.85);
    // 同一侧：落点很近就叠在同一个坑上，否则用空槽，没有空槽就挤掉较浅的那个
    const a = side * (POKE_SLOTS / 2), b = a + 1;
    const near = (i) => this.points[i].w !== 0 && (this.points[i].x - p.x) ** 2 + (this.points[i].y - p.y) ** 2 < 0.12 ** 2;
    const free = (i) => this.points[i].w === 0 && this.velocity[i] === 0;
    const slot = near(a) ? a : near(b) ? b : free(a) ? a : free(b) ? b : Math.abs(this.points[a].w) < Math.abs(this.points[b].w) ? a : b;
    const pt = this.points[slot];
    if (!near(slot)) { pt.set(p.x, p.y, p.z, 0); this.velocity[slot] = 0; }
    this.normals[slot].copy(n).normalize();
    this.target[slot] = Math.min(DEPTH_MAX, Math.max(0, pt.w) * 0.5 + DEPTH * strength);
    this.press[slot] = PRESS_TIME;
  }

  update(dt) {
    for (let i = 0; i < POKE_SLOTS; i++) {
      const pt = this.points[i];
      if (!pt.w && !this.velocity[i] && this.press[i] <= 0) continue;
      const pressing = this.press[i] > 0;
      this.press[i] -= dt;
      [pt.w, this.velocity[i]] = pressing
        ? springStep(pt.w, this.velocity[i], this.target[i], 70, 0.85, dt)
        : springStep(pt.w, this.velocity[i], 0, 24, 0.24, dt);
      if (!pressing && Math.abs(pt.w) < 2e-4 && Math.abs(this.velocity[i]) < 0.004) { pt.w = 0; this.velocity[i] = 0; }
    }
    for (let side = 0; side < 2; side++) {
      const drive = this.smileDrive[side];
      this.smiles[side] += (drive - this.smiles[side]) * (1 - Math.exp(-11 * dt));
      this.smileDrive[side] *= Math.exp(-3.4 * dt);
      if (drive < 0.001 && this.smiles[side] < 0.001) this.smiles[side] = this.smileDrive[side] = 0;
      const o = side * (POKE_SLOTS / 2);
      const depth = Math.max(Math.abs(this.points[o].w), Math.abs(this.points[o + 1].w));
      const target = Math.min(1, depth / (0.6 * DEPTH));
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
