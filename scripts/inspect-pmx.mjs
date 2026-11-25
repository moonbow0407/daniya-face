// 解析 PMX，输出骨骼 / 表情变形 / 材质 / 刚体概况，帮助确定交互用到哪些部件
// 用法: node scripts/inspect-pmx.mjs public/models/daniya_red/daniya_red.pmx [--full]
import { readFileSync, writeFileSync } from 'node:fs';
import { MMDParser } from '../node_modules/three/examples/jsm/libs/mmdparser.module.js';

const file = process.argv[2] ?? 'public/models/daniya_red/daniya_red.pmx';
const buf = readFileSync(file);
const pmx = new MMDParser.Parser().parsePmx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), true);

const v = pmx.vertices;
let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const p of v) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p.position[i]); max[i] = Math.max(max[i], p.position[i]); }

const morphTypes = ['group', 'vertex', 'bone', 'uv', 'uv1', 'uv2', 'uv3', 'uv4', 'material'];
const out = {
  name: pmx.metadata.modelName,
  vertices: v.length,
  faces: pmx.metadata.faceCount,
  bbox: { min, max },
  materials: pmx.materials.map((m, i) => ({
    i, name: m.name, faces: m.faceCount / 3,
    tex: pmx.textures[m.textureIndex] ?? null,
    toon: m.toonFlag ? `shared${m.toonIndex}` : pmx.textures[m.toonIndex] ?? null,
    diffuse: m.diffuse.map(x => +x.toFixed(2)), flag: m.flag, edge: +m.edgeSize.toFixed(2),
  })),
  bones: pmx.bones.map((b, i) => ({ i, name: b.name, parent: b.parentIndex, pos: b.position.map(x => +x.toFixed(2)), ik: !!b.ik })),
  morphs: pmx.morphs.map((m, i) => ({ i, name: m.name, panel: m.panel, type: morphTypes[m.type], n: m.elementCount })),
  rigidBodies: pmx.rigidBodies.length,
  constraints: pmx.constraints.length,
};
writeFileSync('scripts/model-report.json', JSON.stringify(out, null, 1));
console.log(`模型: ${out.name}  顶点 ${out.vertices}  面 ${out.faces / 3}  材质 ${out.materials.length}  骨骼 ${out.bones.length}  表情 ${out.morphs.length}  刚体 ${out.rigidBodies}  关节 ${out.constraints}`);
console.log('包围盒', out.bbox);
console.log('\n材质:'); for (const m of out.materials) console.log(` ${m.i} ${m.name}  faces=${m.faces}  tex=${m.tex}  toon=${m.toon} edge=${m.edge}`);
console.log('\n表情(按面板):'); for (const m of out.morphs) process.stdout.write(`${m.i}:${m.name}[${m.type}/p${m.panel}]  `);
console.log('\n\n头部附近骨骼:');
for (const b of out.bones) if (b.pos[1] > 14 || /頭|首|目|頬|ほほ|顎|舌|口|眉/.test(b.name)) process.stdout.write(`${b.i}:${b.name}(${b.pos.join(',')}) `);
console.log();
