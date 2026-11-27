import * as THREE from 'three';
import { frame, configureFrame, toFrame, fleshMask, pokeMask, cupMask } from './faceFrame.js';

/*
 * 脸颊形变用到的所有 uniform（GPU 端共享）。坐标、位移都在脸部坐标里（见 faceFrame.js）。
 * 交互逻辑每帧改这里的值，着色器（cheekShaders.js）读取。下标 0 = x<0 那侧，1 = x>0 那侧。
 */
export const POKE_SLOTS = 4;
const v3 = () => new THREE.Vector3();

export const uniforms = {
  // 戳：xyz = 落点，w = 按进去的深度（负数 = 回弹鼓出来）；uPokeN = 落点的表面法线
  uPokes: { value: Array.from({ length: POKE_SLOTS }, () => new THREE.Vector4()) },
  uPokeN: { value: Array.from({ length: POKE_SLOTS }, () => new THREE.Vector3(0, 0, 1)) },
  // 拉：每侧一个抓取点和它被拖开的位移
  uGrab: { value: [v3(), v3()] },
  uPull: { value: [v3(), v3()] },
  // 捧：手掌托起的程度（弹簧，带过冲）；按住时推一推 = 在 uPushAt 加位移 uPush
  uSquash: { value: 0 },
  uPushAt: { value: v3() },
  uPush: { value: v3() },
  // 松手后脸颊肉的余振（每侧一个，−1..1）
  uWobble: { value: new THREE.Vector2() },
  // 前发被推开的位移（每侧一个，CPU 算好）
  uHair: { value: [v3(), v3()] },
  // 泛红：拉久了被拉的那侧（强度、高度），捧脸 / 拉扯时颧骨
  uPullBlush: { value: new THREE.Vector2() },
  uBlushY: { value: new THREE.Vector2() },
  uCup: { value: 0 },
  // 标志点（脸部坐标）
  uCheek: { value: frame.cheek },
};

/** 前发避让：往外拉超过 slack（脸部坐标）才推发丝，knee 是起步的柔和过渡，follow 是跟随比例 */
export const hairAvoid = { slack: 0.105, knee: 0.029, follow: 0.8 };

/** 按角色配置初始化形变：脸部坐标系 + 前发避让参数。必须在给材质打补丁之前调用 */
export function configureRig({ face, hairAvoid: h }) {
  configureFrame(face);
  if (h) Object.assign(hairAvoid, h);
}

/** 每个顶点的软组织权重 aSoft = (拉, 戳, 捧)，CPU 上算一次存成顶点属性（遮罩见 faceFrame.js） */
export function addSoftWeights(geometry) {
  const pos = geometry.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    toFrame(p.fromBufferAttribute(pos, i), p);
    out[i * 3] = fleshMask(p);
    out[i * 3 + 1] = pokeMask(p);
    out[i * 3 + 2] = cupMask(p);
  }
  geometry.setAttribute('aSoft', new THREE.BufferAttribute(out, 3));
}
