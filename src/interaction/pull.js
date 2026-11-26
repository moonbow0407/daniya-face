import * as THREE from 'three';
import { calib } from '../rig/calibration.js';
import { uniforms } from '../rig/uniforms.js';

const { clamp, smoothstep, damp } = THREE.MathUtils;

// 拉扯上限在角色配置 personality.actions 里（s.limits）
export const RHYTHM_HOLD_RAW = 0.115; // 音游长按不拖动时的基础拉力（经橡皮筋映射后约 82% 上限）

export function pullLimit(s, rhythmActive) {
  return s.pullSides === 2 ? s.limits.double : rhythmActive ? s.limits.rhythm : s.limits.single;
}

const _prev = new THREE.Vector3();

/**
 * 每帧：拉扯位移的弹簧（按住跟手、松手带过冲弹回）、回弹抖动、捧脸托起与揉脸、
 * 拉久了脸红。返回本帧的拉扯程度 r（0..1）。
 */
export function updatePull(s, { dt, now, rhythmActive, sfx }) {
  const PT = calib.faceWidth;
  const { delta, vel, target, grab, jiggle } = s;
  const holding = s.holdId !== null;
  const e = Math.min(dt, 0.033);

  if (!holding && s.pullSides) {
    const W = 21, Z = 6.2;
    const R = Math.exp(-Z * e), C = Math.cos(W * e), S = Math.sin(W * e) / W;
    _prev.copy(delta);
    delta.multiplyScalar(R * (C + Z * S)).addScaledVector(vel, R * S);
    vel.multiplyScalar(R * (C - Z * S)).addScaledVector(_prev, -R * (W * W + Z * Z) * S);
    if (jiggle.armed && delta.dot(s.releaseDir) <= 0) {
      // 弹回中心的一瞬间，脸颊肉再"啵"地抖一下
      jiggle.armed = false;
      jiggle.left = s.pullSides === 2 || grab.x < 0;
      jiggle.right = s.pullSides === 2 || grab.x > 0;
      jiggle.amp = Math.min(1, vel.length() / (PT * 0.85));
      jiggle.t = 0;
    }
  } else {
    const k = holding ? 180 : 65;
    vel.addScaledVector(_prev.copy(target).sub(delta), k * e).multiplyScalar(Math.exp(-(holding ? 20 : 10) * e));
    delta.addScaledVector(vel, e);
  }
  if (s.pullSides) {
    const f = holding ? 0 : -0.56;
    if (delta.x * grab.x < 0) { delta.x *= f; vel.x *= f; }
    if (delta.z < 0) { delta.z *= f; vel.z *= f; }
  }
  const limit = pullLimit(s, rhythmActive);
  delta.clampLength(0, PT * (s.pullSides === 0 ? s.limits.cup : limit));
  uniforms.uPullSides.value = s.pullSides;

  updateCup(s, { dt, e, now, sfx });

  jiggle.t += dt;
  const w = jiggle.t < 1 ? jiggle.amp * Math.exp(-5.6 * jiggle.t) * Math.sin(24 * jiggle.t) : 0;
  uniforms.uCheekJiggle.value.set(jiggle.left ? w : 0, jiggle.right ? w : 0);

  // 拉扯程度 → 表情强度
  const r = holding && s.pullSides ? smoothstep(delta.length() / PT, 0.004, limit) : 0;
  // 拉住超过 0.75 秒，被拉的那侧慢慢红起来；松手后 1.4 秒才开始褪
  const active = holding && s.pullSides && r > 0.035;
  if (active) s.holdStart ??= now; else s.holdStart = null;
  if (holding && s.pullSides && !rhythmActive) sfx.pullMove(r, target.y / (PT * limit), dt);
  const warm = s.holdStart === null ? 0 : smoothstep(now - s.holdStart, 750, 1650) * smoothstep(r, 0.035, 0.55);
  const pulledSide = grab.x < 0 ? 'x' : 'y';
  for (const side of ['x', 'y']) {
    const on = active && (s.pullSides === 2 || side === pulledSide);
    const cur = uniforms.uPullBlush.value[side];
    if (on && warm > 0) s.blushHold[side] = now + 1400;
    if (on && warm > cur) { uniforms.uBlushHeight.value[side] = grab.y; uniforms.uPullBlush.value[side] = damp(cur, warm, 9, dt); }
    else if (now >= s.blushHold[side]) uniforms.uPullBlush.value[side] = damp(cur, 0, 0.9, dt);
  }
  s.pullAmount = damp(s.pullAmount, r, holding ? (rhythmActive ? 28 : 22) : 14, dt);
  return r;
}

/** 捧脸：脸颊被托起的弹簧；按住画圈是揉脸，揉够了会晕 */
function updateCup(s, { dt, e, now, sfx }) {
  uniforms.uCheekSpring.value = s.cheekSpring.update(e, s.cupHeld);
  s.cupAmount = damp(s.cupAmount, s.cupHeld ? 1 : 0, s.cupHeld ? 12 : 10, dt);
  if (s.cupHeld) s.cupTime += dt;
  const rubSpeed = s.rubInput / Math.max(dt, 1e-3); // 像素/秒
  s.rubInput = 0;
  s.rubLevel = damp(s.rubLevel, s.cupHeld ? clamp(rubSpeed / 600, 0, 1) : 0, rubSpeed > 0 ? 10 : 5, dt);
  if (s.cupHeld) s.rubEnergy = Math.max(0, s.rubEnergy + (s.rubLevel > 0.25 ? s.rubLevel : -0.6) * dt);
  const dizzyAt = s.behavior.dizzy && s.behavior.dizzy.energy;
  if (dizzyAt && s.cupHeld && s.rubEnergy > dizzyAt && s.dizzyUntil < now) { s.dizzyUntil = Infinity; sfx.dizzy(); }
  sfx.cupRub(s.cupHeld ? s.rubLevel : 0);
  s.afterglow = Math.max(0, s.afterglow - dt / 1.2);
}
