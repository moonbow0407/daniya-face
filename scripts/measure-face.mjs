// 量脸部各材质的包围盒与中心（坐标同 MMDLoader 加载后：z 取反）
import { readFileSync } from 'node:fs';
import { MMDParser } from '../node_modules/three/examples/jsm/libs/mmdparser.module.js';
const buf = readFileSync(process.argv[2] ?? 'public/models/daniya_red/daniya_red.pmx');
const pmx = new MMDParser.Parser().parsePmx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), true);
let start = 0;
for (const m of pmx.materials) {
  const n = m.faceCount;
  if (/^(face1|nose1|kou1|she1|MI_Eye1|mei1|jie1|bai11|Cheek|emo1)$/.test(m.name)) {
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9], sum = [0, 0, 0];
    for (let t = start; t < start + n; t++) for (let j = 0; j < 3; j++) {
      const p = pmx.vertices[pmx.faces[t].indices[j]].position;
      const q = [p[0], p[1], -p[2]];
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); sum[k] += q[k]; }
    }
    const f = (a) => a.map((x) => x.toFixed(3)).join(',');
    console.log(m.name.padEnd(8), f(min), '|', f(max), '| c', f(sum.map((x) => x / (n * 3))));
  }
  start += n;
}
