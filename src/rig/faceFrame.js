import * as THREE from 'three';

/*
 * 脸部坐标系（形变、点击、命中区域都在这里算）
 * 由角色自己的几个脸部标志点定义（见角色配置 model.face）：
 *   原点 = (0, 嘴角高度, 鼻尖深度)，单位 = 脸颊高度处的头部半宽 S，三个轴同一比例（形变保持各向同性）
 *   frame = (x / S, (y - mouthY) / S, (z - noseZ) / S)
 * 模型坐标都是绑定姿态（未蒙皮、未加表情）。
 */
export const frame = {
  S: 1,
  origin: new THREE.Vector3(),
  /** 脸颊点（右脸 x>0，左右对称）：音游轨道从这里出发，捧脸、余振以它为参照 */
  cheek: new THREE.Vector3(0.45, 0.18, -0.28),
};

/** 按角色的脸部标志点建立坐标系。必须在给材质打补丁之前调用 */
export function configureFrame(face) {
  frame.S = face.halfWidth;
  frame.origin.set(0, face.mouthY, face.noseZ);
  toFrame(new THREE.Vector3(...face.cheek), frame.cheek);
  frame.cheek.x = Math.abs(frame.cheek.x);
}

/** 模型坐标 → 脸部坐标 */
export const toFrame = (v, out = new THREE.Vector3()) => out.copy(v).sub(frame.origin).divideScalar(frame.S);
/** 脸部坐标 → 模型坐标 */
export const fromFrame = (v, out = new THREE.Vector3()) => out.copy(v).multiplyScalar(frame.S).add(frame.origin);
/** 位移向量 → 脸部坐标 */
export const vecToFrame = (v, out = new THREE.Vector3()) => out.copy(v).divideScalar(frame.S);

const ss = THREE.MathUtils.smoothstep;

/*
 * 软组织遮罩（0 = 钉住，1 = 完全能动），都是脸部坐标的光滑函数，五段边界：
 *   内侧（离鼻梁多远开始能动）、下沿、上沿（眼睛下方）、外侧（耳前）、后方（脸侧往后）。
 * 所有材质（皮肤、口腔、眼睛、睫毛）用同一套遮罩，相邻的面就会一起动，不会互相穿过去。
 * 数值是对照上一版的形变逐顶点拟合出来的（每个动作的范围、幅度和原来一致）。
 */
const band = (p, m) => {
  const ax = Math.abs(p.x);
  return ss(ax, m.inner[0], m.inner[1]) * ss(p.y, m.low[0], m.low[1]) * (1 - ss(p.y, m.up[0], m.up[1]))
    * (1 - ss(ax, m.outer[0], m.outer[1])) * ss(p.z, m.back[0], m.back[1]);
};
const MASKS = {
  // 拉、余振：脸颊外侧到下颌的一整团肉
  flesh: { inner: [0.158, 0.417], low: [-0.367, -0.034], up: [0.141, 0.471], outer: [1.118, 1.587], back: [-0.996, -0.817] },
  // 戳：脸颊中段，越往外越弱，眼睛下方淡出
  poke: { inner: [0.118, 0.404], low: [-9, -8], up: [0.336, 0.512], outer: [0.426, 1.458], back: [-1.048, -0.536] },
  // 捧：手掌托住的脸颊外下侧
  cup: { inner: [0.308, 0.474], low: [-0.193, 0.06], up: [0.199, 0.432], outer: [0.76, 1.486], back: [-0.672, -0.404] },
};
export const fleshMask = (p) => band(p, MASKS.flesh);
export const pokeMask = (p) => band(p, MASKS.poke);
export const cupMask = (p) => band(p, MASKS.cup);
