import * as THREE from 'three';

/*
 * 参考坐标系
 * 脸颊形变、命中区域、彩蛋位置等数值都写在"参考坐标"里（最初按参考站菲比模型调好）。
 * 每个角色只需一组线性换算就能共用这些数值：
 *   model.x = ref.x * sx,  model.y = ref.y + dy,  model.z = ref.z + dz
 * 换算参数放在角色配置的 calibration 里，启动时调用 configureCalibration 写入。
 */
export const calib = {
  sx: 1,
  dy: 0,
  dz: 0,
  /** 参考模型脸宽，拉扯幅度都按它的比例计算 */
  faceWidth: 2.142,
};

export function configureCalibration({ sx, dy, dz, faceWidth }) {
  Object.assign(calib, { sx, dy, dz });
  if (faceWidth) calib.faceWidth = faceWidth;
}

/** 模型坐标 → 参考坐标 */
export const toRef = (v, out = new THREE.Vector3()) => out.set(v.x / calib.sx, v.y - calib.dy, v.z - calib.dz);
/** 参考坐标 → 模型坐标 */
export const fromRef = (v, out = new THREE.Vector3()) => out.set(v.x * calib.sx, v.y + calib.dy, v.z + calib.dz);
/** 位移向量（不含平移）→ 参考坐标 */
export const vecToRef = (v, out = new THREE.Vector3()) => out.set(v.x / calib.sx, v.y, v.z);
