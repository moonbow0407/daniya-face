import * as THREE from 'three';

/*
 * 双尺度正则化 Kelvinlet（de Goes & James 2017, "Regularized Kelvinlets"）
 * 无限大弹性体里一点受力时的位移场，再正则化（ε）去掉中心的奇点。
 * 用来做"抓住一点往外拖"：拖动点位移 = d，周围的肉按弹性力学自然地跟着走，
 * 而且会横向收窄（泊松效应），比手调的高斯鼓包更像真的软组织。
 * 两个尺度 ε1 < ε2 相减：远处的 1/r 长尾抵消成 1/r³，影响范围收得住，不会带动整个头。
 * 另有同一篇论文里的"缩放"笔刷（squish）：以一点为中心往四周推开，戳脸时用它把肉挤向两边。
 *
 *   A(r) = (1-b)/rε + ε²/(2rε³)，B(r) = b/rε³，rε = √(r²+ε²)
 *   u(r) = [ (A₁-A₂) d + (B₁-B₂)(r·d) r ] / ((1.5-b)(1/ε₁ - 1/ε₂))
 *   b = 1 / (4(1-ν))，ν 是泊松比（0.5 = 不可压缩；软组织取 0.45）
 */
export const POISSON = 0.45;

/** 各种形变的尺度 [ε1, ε2]（脸部坐标，半脸宽 = 1） */
export const KERNELS = {
  poke: [0.16, 0.45], // 指尖按出的坑（软组织会带着周围一起陷下去）
  squish: [0.2, 0.6], // 戳下去时，周围的肉沿着脸面被挤开（脸颊轮廓往外鼓）
  pull: [0.26, 0.75], // 手指捏住的一团肉（要大到能带动脸的轮廓）
  palm: [0.24, 0.66], // 手掌托住的面积
};
const B_ = 1 / (4 * (1 - POISSON));

// 缩放笔刷的径向强度 g(r)：u(r) = s·g(r)·r（双尺度相减）。归一化到最大位移 = s
const squishG = (r2, e) => (1 + (1.5 * e * e) / (r2 + e * e)) / (r2 + e * e) ** 1.5;
const [Q1, Q2] = KERNELS.squish;
let QN = 0;
for (let r = 0.001; r < 2; r += 0.001) QN = Math.max(QN, (squishG(r * r, Q1) - squishG(r * r, Q2)) * r);

export const KELVINLET_GLSL = /* glsl */ `
vec3 kelvinlet(vec3 r, vec3 d, float e1, float e2){
 float r2=dot(r,r);
 float s1=inversesqrt(r2+e1*e1), s2=inversesqrt(r2+e2*e2);
 float c1=s1*s1*s1, c2=s2*s2*s2;
 float A=${(1 - B_).toFixed(5)}*(s1-s2)+.5*(e1*e1*c1-e2*e2*c2);
 float B=${B_.toFixed(5)}*(c1-c2);
 return (A*d+B*dot(r,d)*r)/(${(1.5 - B_).toFixed(5)}*(1.0/e1-1.0/e2));
}
vec3 squish(vec3 r, float s){
 float r2=dot(r,r), a1=r2+${Q1 * Q1}, a2=r2+${Q2 * Q2};
 float g=(1.0+${1.5 * Q1 * Q1}/a1)*inversesqrt(a1*a1*a1)-(1.0+${1.5 * Q2 * Q2}/a2)*inversesqrt(a2*a2*a2);
 return s*g*r/${QN.toFixed(5)};
}
`;

/** 和着色器同一个公式的 CPU 版（前发避让要知道脸颊在某一点被顶出去多少） */
export function kelvinlet(r, d, e1, e2, out = new THREE.Vector3()) {
  const r2 = r.lengthSq();
  const s1 = 1 / Math.sqrt(r2 + e1 * e1), s2 = 1 / Math.sqrt(r2 + e2 * e2);
  const c1 = s1 ** 3, c2 = s2 ** 3;
  const A = (1 - B_) * (s1 - s2) + 0.5 * (e1 * e1 * c1 - e2 * e2 * c2);
  const B = B_ * (c1 - c2);
  const n = (1.5 - B_) * (1 / e1 - 1 / e2);
  return out.copy(d).multiplyScalar(A / n).addScaledVector(r, (B * r.dot(d)) / n);
}
