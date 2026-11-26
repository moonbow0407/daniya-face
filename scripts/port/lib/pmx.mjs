// 读取 PMX 模型，整理成移植工具需要的结构（坐标与 MMDLoader 加载后一致：右手系，+z 朝向镜头）
import { readFileSync } from 'node:fs';
import { MMDParser } from '../../../node_modules/three/examples/jsm/libs/mmdparser.module.js';

export function loadPmx(file) {
  const buf = readFileSync(file);
  const pmx = new MMDParser.Parser().parsePmx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), true);

  const positions = pmx.vertices.map((v) => v.position);
  const vertexMaterial = new Int32Array(positions.length).fill(-1);
  const materials = [];
  let face = 0;
  pmx.materials.forEach((m, mi) => {
    const set = new Set();
    for (let i = 0; i < m.faceCount; i++, face++) for (const k of pmx.faces[face].indices) { set.add(k); vertexMaterial[k] = mi; }
    materials.push({ index: mi, name: m.name, vertices: [...set], ...bounds(positions, set) });
  });

  return {
    name: pmx.metadata.modelName,
    positions,
    vertexMaterial,
    materials,
    material: (name) => materials.find((m) => m.name === name),
    bones: Object.fromEntries(pmx.bones.map((b) => [b.name, b.position])),
    vertexMorphs: pmx.morphs.filter((m) => m.type === 1).map((m) => m.name),
    /** 每个顶点表情改动了哪些顶点（用来判断表情落在哪个材质上，比如眼部贴片、漫画符号） */
    vertexMorphVerts: Object.fromEntries(pmx.morphs.filter((m) => m.type === 1).map((m) => [m.name, m.elements.map((e) => e.index)])),
    textures: pmx.textures,
    uvMorphs: pmx.morphs.filter((m) => m.type === 3).map((m) => ({ name: m.name, vertices: m.elements.map((e) => e.index) })),
  };
}

function bounds(positions, set) {
  if (!set.size) return { count: 0, min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0] };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], sum = [0, 0, 0];
  for (const k of set) {
    const p = positions[k];
    for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], p[j]); max[j] = Math.max(max[j], p[j]); sum[j] += p[j]; }
  }
  return { count: set.size, min, max, center: sum.map((v) => v / set.size) };
}

export const round = (v, d = 3) => (Array.isArray(v) ? v.map((x) => round(x, d)) : +v.toFixed(d));
