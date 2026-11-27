import * as THREE from 'three';
import { uniforms, hairAvoid } from '../rig/uniforms.js';
import { frame, fleshMask } from '../rig/faceFrame.js';
import { kelvinlet, KERNELS } from '../rig/kelvinlet.js';
import { springStep, springStepVec } from '../rig/springs.js';

const { smoothstep, damp } = THREE.MathUtils;

// 幅度都在脸部坐标里（半脸宽 = 1）；拉扯上限在角色配置 personality.actions 里（s.limits）
export const RHYTHM_HOLD = 0.82; // 音游长按不拖动时，自动拉开到上限的这个比例

export function pullLimit(s, rhythmActive) {
  return s.pullSides === 2 ? s.limits.double : rhythmActive ? s.limits.rhythm : s.limits.single;
}

const ZERO = new THREE.Vector3();
const _v = new THREE.Vector3();
const _r = new THREE.Vector3();
const _d = new THREE.Vector3();
const wobble = [0, 0], wobbleV = [0, 0];

/**
 * 每帧：拉扯位移的弹簧（按住跟手、松手欠阻尼弹回）、弹回时脸颊肉的余振、捧脸托起与揉脸、
 * 前发避让、拉久了脸红。返回本帧的拉扯程度 r（0..1）。
 */
export function updatePull(s, { dt, now, rhythmActive, sfx }) {
  const { delta, vel, target, grab } = s;
  const holding = s.holdId !== null;
  const e = Math.min(dt, 0.033);
  const out = _v.set(Math.sign(grab.x) || 1, 0, 0); // 被拉那侧的"往外"

  if (holding) springStepVec(delta, vel, target, 40, 0.9, e); // 跟手：硬、几乎不过冲
  else if (s.pullSides) {
    const before = delta.dot(out);
    springStepVec(delta, vel, ZERO, 20, 0.2, e); // 松手：像橡皮筋一样弹回，冲过头再晃几下
    // 弹回中心的一瞬间，被拉的肉团"啵"地抖一下（速度越快抖得越厉害）
    if (before > 0 && delta.dot(out) <= 0) {
      const kick = Math.min(1.2, 0.32 * vel.length());
      for (const side of [0, 1]) if (s.pullSides === 2 || (grab.x < 0 ? 0 : 1) === side) wobbleV[side] -= kick;
    }
    // 脸颊往里有骨头挡着：往里冲过头的那部分按一半弹回来
    if (s.pullSides && delta.dot(out) < -0.02) {
      const over = delta.dot(out) + 0.02;
      delta.addScaledVector(out, -over * 1.5);
      const vin = vel.dot(out);
      if (vin < 0) vel.addScaledVector(out, -1.5 * vin);
    }
  } else springStepVec(delta, vel, target, 18, 0.5, e); // 捧着时推一推
  delta.clampLength(0, s.pullSides === 0 ? s.limits.cup : pullLimit(s, rhythmActive));

  for (const side of [0, 1]) [wobble[side], wobbleV[side]] = springStep(wobble[side], wobbleV[side], 0, 34, 0.16, e);
  uniforms.uWobble.value.set(wobble[0], wobble[1]);

  writeField(s);
  updateHair();
  updateCup(s, { dt, e, now, sfx });

  // 拉扯程度 → 表情强度
  const limit = pullLimit(s, rhythmActive);
  const r = holding && s.pullSides ? smoothstep(delta.length(), 0.008, limit) : 0;
  if (holding && s.pullSides && !rhythmActive) sfx.pullMove(r, target.y / limit, dt); // 竖直位置用手的目标位置（不等弹簧），和原版一致
  updateBlush(s, { dt, now, r });
  s.pullAmount = damp(s.pullAmount, r, holding ? (rhythmActive ? 28 : 22) : 14, dt);
  return r;
}

/** 交互状态 → 着色器：单手只动一侧，双手两侧镜像，捧脸时是"推一推" */
function writeField(s) {
  const [g0, g1] = uniforms.uGrab.value, [p0, p1] = uniforms.uPull.value;
  p0.set(0, 0, 0); p1.set(0, 0, 0); uniforms.uPush.value.set(0, 0, 0);
  if (s.pullSides === 0) { uniforms.uPushAt.value.copy(s.grab); uniforms.uPush.value.copy(s.delta); return; }
  // 捏起来的肉会离开脸面一点：拉得越开，越往前提
  _d.copy(s.delta); _d.z += 0.2 * Math.hypot(s.delta.x, s.delta.y);
  const right = s.grab.x >= 0;
  const [g, p] = right ? [g1, p1] : [g0, p0];
  g.copy(s.grab); p.copy(_d);
  if (s.pullSides === 2) {
    const [gm, pm] = right ? [g0, p0] : [g1, p1];
    gm.set(-s.grab.x, s.grab.y, s.grab.z); pm.set(-_d.x, _d.y, _d.z);
  }
}

/*
 * 前发避让：在前发贴着脸颊的那一点，用和着色器同一个公式算出脸颊被顶出去多少。
 * 发丝和脸颊之间本来有一点空隙：没超过这段余量（slack）时发丝不动，超过后经过一段柔和的过渡（knee），
 * 只跟随超出的部分。只横向 + 往前，不上下拉长发丝。
 */
function updateHair() {
  const { slack, knee, follow } = hairAvoid;
  for (const side of [0, 1]) {
    const sx = side ? 1 : -1;
    const h = _r.set(sx * frame.hair.x, frame.hair.y, frame.hair.z);
    const m = fleshMask(h);
    const disp = kelvinlet(_r.sub(uniforms.uGrab.value[side]), uniforms.uPull.value[side], ...KERNELS.pull, _d).multiplyScalar(m);
    disp.y = 0;
    const push = Math.max(0, disp.x * sx * 0.85 + disp.z * 0.5);
    const t = push - slack, k = Math.max(knee, 1e-4);
    const excess = t <= -k ? 0 : t >= k ? t : ((t + k) * (t + k)) / (4 * k);
    const hair = uniforms.uHair.value[side];
    if (excess <= 0 || push <= 0) hair.set(0, 0, 0);
    else hair.copy(disp).multiplyScalar((follow * excess) / push);
  }
}

/** 拉住超过 0.75 秒，被拉的那侧慢慢红起来；松手后 1.4 秒才开始褪 */
function updateBlush(s, { dt, now, r }) {
  const holding = s.holdId !== null;
  const active = holding && s.pullSides && r > 0.035;
  if (active) s.holdStart ??= now; else s.holdStart = null;
  const warm = s.holdStart === null ? 0 : smoothstep(now - s.holdStart, 750, 1650) * smoothstep(r, 0.035, 0.55);
  const pulledSide = s.grab.x < 0 ? 'x' : 'y';
  for (const side of ['x', 'y']) {
    const on = active && (s.pullSides === 2 || side === pulledSide);
    const cur = uniforms.uPullBlush.value[side];
    if (on && warm > 0) s.blushHold[side] = now + 1400;
    if (on && warm > cur) { uniforms.uBlushY.value[side] = s.grab.y; uniforms.uPullBlush.value[side] = damp(cur, warm, 9, dt); }
    else if (now >= s.blushHold[side]) uniforms.uPullBlush.value[side] = damp(cur, 0, 0.9, dt);
  }
}

/** 捧脸：手掌托起的弹簧；按住画圈是揉脸，揉够了会晕 */
function updateCup(s, { dt, e, now, sfx }) {
  uniforms.uSquash.value = s.cheekSpring.update(e, s.cupHeld);
  s.cupAmount = damp(s.cupAmount, s.cupHeld ? 1 : 0, s.cupHeld ? 12 : 10, dt);
  if (s.cupHeld) s.cupTime += dt;
  const rubSpeed = s.rubInput / Math.max(dt, 1e-3); // 像素/秒
  s.rubInput = 0;
  s.rubLevel = damp(s.rubLevel, s.cupHeld ? THREE.MathUtils.clamp(rubSpeed / 600, 0, 1) : 0, rubSpeed > 0 ? 10 : 5, dt);
  if (s.cupHeld) s.rubEnergy = Math.max(0, s.rubEnergy + (s.rubLevel > 0.25 ? s.rubLevel : -0.6) * dt);
  const dizzyAt = s.behavior.dizzy && s.behavior.dizzy.energy;
  if (dizzyAt && s.cupHeld && s.rubEnergy > dizzyAt && s.dizzyUntil < now) { s.dizzyUntil = Infinity; sfx.dizzy(); }
  sfx.cupRub(s.cupHeld ? s.rubLevel : 0);
  s.afterglow = Math.max(0, s.afterglow - dt / 1.2);
}
