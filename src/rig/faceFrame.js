import * as THREE from 'three';

/*
 * 脸部坐标系（形变、点击、命中区域都在这里算）
 * 由角色自己的几个脸部标志点定义，换模型只需重新量这几个点（见角色配置 model.face）：
 *   原点 = (0, 嘴角高度, 鼻尖深度)，单位 = 脸颊高度处的头部半宽 S，三个轴同一比例（形变保持各向同性）
 *   frame = (x / S, (y - mouthY) / S, (z - noseZ) / S)
 * 模型坐标都是绑定姿态（未蒙皮、未加表情）。
 */
export const frame = {
  S: 1,
  origin: new THREE.Vector3(),
  /** 眼线高度、下眼睑高度（frame.y） */
  eyeY: 0.57,
  lidY: 0.46,
  /** 脸颊肉最鼓处（右脸 x>0，左右对称） */
  cheek: new THREE.Vector3(0.48, 0.16, -0.29),
  /** 前发贴着脸颊的地方：这里被顶出去多少，前发就让开多少 */
  hair: new THREE.Vector3(0.69, 0.33, -0.46),
  /** 戳凹在眼睛下方淡出的高度 [开始, 完全消失]（frame.y） */
  pokeFade: [0.34, 0.52],
};

/** 按角色的脸部标志点建立坐标系。必须在给材质打补丁之前调用 */
export function configureFrame(face) {
  const S = face.halfWidth;
  frame.S = S;
  frame.origin.set(0, face.mouthY, face.noseZ);
  const y = (v) => (v - face.mouthY) / S;
  frame.eyeY = y(face.eyeY);
  frame.lidY = y(face.lidY);
  toFrame(new THREE.Vector3(...face.cheek), frame.cheek);
  toFrame(new THREE.Vector3(...face.hair), frame.hair);
  frame.cheek.x = Math.abs(frame.cheek.x);
  frame.hair.x = Math.abs(frame.hair.x);
  if (face.pokeFade) frame.pokeFade = face.pokeFade.map(y);
}

/** 模型坐标 → 脸部坐标 */
export const toFrame = (v, out = new THREE.Vector3()) => out.copy(v).sub(frame.origin).divideScalar(frame.S);
/** 脸部坐标 → 模型坐标 */
export const fromFrame = (v, out = new THREE.Vector3()) => out.copy(v).multiplyScalar(frame.S).add(frame.origin);
/** 位移向量 → 脸部坐标 */
export const vecToFrame = (v, out = new THREE.Vector3()) => out.copy(v).divideScalar(frame.S);

const ss = THREE.MathUtils.smoothstep;

/*
 * 软组织遮罩（0 = 钉住，1 = 完全能动），都是脸部坐标的光滑函数。
 * 所有材质（皮肤、口腔、眼睛、睫毛）用同一个函数，相邻的面就会一起动，不会互相穿过去。
 */
function common(p) {
  const ax = Math.abs(p.x);
  return ss(p.y, -0.5, -0.2) // 下巴往下不动
    * (1 - ss(ax, 0.8, 0.98)) // 耳前不动
    * ss(p.z, -0.85, -0.5); // 脸侧、后脑不动
}

/** 拉、捧用的脸颊肉：鼻梁和人中钉住，下眼睑往上钉住 */
export function fleshMask(p) {
  return common(p) * ss(Math.abs(p.x), 0.06, 0.3) * (1 - ss(p.y, frame.lidY - 0.24, frame.lidY));
}

/** 能点的范围：软组织上、下眼睑以下（点在眼睛附近时，戳的落点会再往下挪到脸颊上） */
export function clickMask(p) {
  return common(p) * ss(Math.abs(p.x), 0.04, 0.22) * (1 - ss(p.y, frame.lidY - 0.05, frame.lidY + 0.02));
}

/** 戳用的遮罩：比脸颊肉宽一点（鼻翼、嘴角也能戳出小坑），眼睛下方淡出 */
export function pokeMask(p) {
  const [a, b] = frame.pokeFade;
  return common(p) * ss(Math.abs(p.x), 0.04, 0.22) * (1 - ss(p.y, a, b));
}
