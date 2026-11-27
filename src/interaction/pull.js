import * as THREE from 'three';
import { uniforms, hairAvoid } from '../rig/uniforms.js';
import { oscStep } from '../rig/springs.js';

const { smoothstep, damp } = THREE.MathUtils;

/*
 * 幅度都在脸部坐标里（半脸宽 = 1）；拉扯上限在角色配置 personality.actions 里（s.limits）。
 * FACE = 整张脸宽（拉扯程度、余振强度按它的比例算）
 */
export const FACE = 2.05;
export const RHYTHM_HOLD = Math.tanh(1.15); // 音游长按不拖动时，自动拉开到上限的这个比例

export function pullLimit(s, rhythmActive) {
  return s.pullSides === 2 ? s.limits.double : rhythmActive ? s.limits.rhythm : s.limits.single;
}

/*
 * 拉扯位移 → 着色器里的弹性场。场源比手指捏住的地方更深、更靠下颌（这样带动的是脸颊外侧一整团肉，
 * 而不是表面一小块）；捏起来的肉还会往前提。这几个数是对照旧版手感拟合出来的。
 */
const FIELD = { x: 0.3928, y: -0.0099, z: -0.4724, gain: 1.0395, lift: 0.3905 };
const GRAB_TOP = 0.0215; // 抓取高度的上限（和 input.js 的 grabCheek 一致），场源跟着抓取高度上下移

const _p = new THREE.Vector3();

/**
 * 每帧：拉扯位移的弹簧（按住跟手、松手带过冲弹回）、弹回时脸颊肉的余振、捧脸托起与揉脸、
 * 前发避让、拉久了脸红。返回本帧的拉扯程度 r（0..1）。
 */
export function updatePull(s, { dt, now, rhythmActive, sfx }) {
  const { delta, vel, target, grab, jiggle } = s;
  const holding = s.holdId !== null;
  const e = Math.min(dt, 0.033);

  if (!holding && s.pullSides) {
    // 松手：欠阻尼弹回（衰减 6.2/s，21 rad/s）
    const before = _p.copy(delta);
    for (const k of ['x', 'y', 'z']) [delta[k], vel[k]] = oscStep(before[k], vel[k], 6.2, 21, e);
    if (jiggle.armed && delta.dot(s.releaseDir) <= 0) {
      // 弹回中心的一瞬间，脸颊肉再"啵"地抖一下（速度越快抖得越厉害）
      jiggle.armed = false;
      jiggle.left = s.pullSides === 2 || grab.x < 0;
      jiggle.right = s.pullSides === 2 || grab.x > 0;
      jiggle.amp = Math.min(1, vel.length() / (FACE * 0.85));
      jiggle.t = 0;
    }
  } else {
    // 按住（以及捧脸推一推）：跟手的弹簧
    const k = holding ? 180 : 65;
    vel.addScaledVector(_p.copy(target).sub(delta), k * e).multiplyScalar(Math.exp(-(holding ? 20 : 10) * e));
    delta.addScaledVector(vel, e);
  }
  if (s.pullSides) {
    // 脸颊往里有骨头挡着：冲过中心就反弹回来（损失一半）
    const f = holding ? 0 : -0.56;
    if (delta.x * grab.x < 0) { delta.x *= f; vel.x *= f; }
    if (delta.z < 0) { delta.z *= f; vel.z *= f; }
  }
  const limit = pullLimit(s, rhythmActive);
  delta.clampLength(0, s.pullSides === 0 ? s.limits.cup : limit);

  jiggle.t += dt;
  const w = jiggle.t < 1 ? jiggle.amp * Math.exp(-5.6 * jiggle.t) * Math.sin(24 * jiggle.t) : 0;
  uniforms.uWobble.value.set(jiggle.left ? w : 0, jiggle.right ? w : 0);

  writeField(s);
  updateHair(s);
  updateCup(s, { dt, e, now, sfx });

  // 拉扯程度 → 表情强度
  const r = holding && s.pullSides ? smoothstep(delta.length() / FACE, 0.004, limit / FACE) : 0;
  if (holding && s.pullSides && !rhythmActive) sfx.pullMove(r, target.y / limit, dt);
  updateBlush(s, { dt, now, r });
  s.pullAmount = damp(s.pullAmount, r, holding ? (rhythmActive ? 28 : 22) : 14, dt);
  return r;
}

/** 交互状态 → 着色器：单手只动一侧，双手两侧镜像，捧脸时是"推一推" */
function writeField(s) {
  const [g0, g1] = uniforms.uGrab.value, [p0, p1] = uniforms.uPull.value;
  p0.set(0, 0, 0); p1.set(0, 0, 0); uniforms.uPush.value.set(0, 0, 0);
  if (s.pullSides === 0) { uniforms.uPushAt.value.copy(s.grab); uniforms.uPush.value.copy(s.delta); return; }
  const sx = s.grab.x >= 0 ? 1 : -1, d = s.delta;
  const gy = FIELD.y + Math.min(0, s.grab.y - GRAB_TOP);
  const set = (side, mirror) => {
    const g = side ? g1 : g0, p = side ? p1 : p0;
    const m = mirror ? -1 : 1;
    g.set((side ? 1 : -1) * FIELD.x, gy, FIELD.z);
    p.set(m * d.x * FIELD.gain, d.y * FIELD.gain, d.z * FIELD.gain + FIELD.lift * Math.max(0, d.x * sx));
  };
  set(sx > 0 ? 1 : 0, false);
  if (s.pullSides === 2) set(sx > 0 ? 0 : 1, true);
}

/*
 * 前发避让：发丝和脸颊之间本来有一点空隙。往外拉的量没超过这段余量（slack）时发丝不动，
 * 超过后经过一段柔和的过渡（knee）才开始跟随，而且只跟随超出的部分；只横向 + 略往前，不上下拉长发丝。
 */
function updateHair(s) {
  const { slack, knee, follow } = hairAvoid;
  const sx = s.grab.x >= 0 ? 1 : -1;
  for (const side of [0, 1]) {
    const hair = uniforms.uHair.value[side];
    const on = s.pullSides === 2 || (s.pullSides === 1 && (side ? 1 : -1) === sx);
    const t = (on ? Math.max(0, s.delta.x * sx) : 0) - slack, k = Math.max(knee, 1e-4);
    const ex = t <= -k ? 0 : t >= k ? t : ((t + k) * (t + k)) / (4 * k);
    hair.set((side ? 1 : -1) * ex * follow, 0, ex * 0.337);
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
