import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _bary = new THREE.Vector3();
const _tri = new THREE.Triangle();

/**
 * 只对指定材质（脸部皮肤）做射线检测；考虑蒙皮与表情。
 * 返回世界坐标命中点 + 绑定姿态（未蒙皮）下的对应点。
 */
export class FaceHit {
  constructor(mesh, materialNames) {
    this.mesh = mesh;
    const geo = mesh.geometry;
    const index = geo.index.array;
    const tris = [];
    for (const g of geo.groups) {
      if (!materialNames.includes(mesh.material[g.materialIndex].name)) continue;
      for (let i = g.start; i < g.start + g.count; i += 3) tris.push(index[i], index[i + 1], index[i + 2]);
    }
    this.tris = Uint32Array.from(tris);
    this.base = geo.attributes.position;
  }

  raycast(ray) {
    const { mesh, tris } = this;
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < tris.length; i += 3) {
      mesh.getVertexPosition(tris[i], _a).applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(tris[i + 1], _b).applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(tris[i + 2], _c).applyMatrix4(mesh.matrixWorld);
      const p = ray.intersectTriangle(_a, _b, _c, false, _hit);
      if (!p) continue;
      const d = ray.origin.distanceToSquared(p);
      if (d >= bestD) continue;
      bestD = d;
      _tri.set(_a, _b, _c).getBarycoord(p, _bary);
      best = { point: p.clone(), tri: [tris[i], tris[i + 1], tris[i + 2]], bary: _bary.clone() };
    }
    if (!best) return null;
    const local = new THREE.Vector3();
    const w = [best.bary.x, best.bary.y, best.bary.z];
    best.tri.forEach((v, k) => local.addScaledVector(_a.fromBufferAttribute(this.base, v), w[k]));
    best.local = local;
    return best;
  }
}
