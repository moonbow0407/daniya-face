// 贴图路径核对：PMX 里写的贴图路径大小写、斜杠常常和磁盘不一致；服务器（Vite、Cloudflare）区分大小写，
// 对不上时开发服务器会返回 index.html，模型只剩描边、控制台没有报错。这里按引擎的改写规则逐张核对。
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const parts = (p) => p.replace(/\\/g, '/').split('/').filter((x) => x && x !== '.');

/** 模型目录下真实的贴图子目录名（PMX 里写的可能是 TEX / Tex，磁盘上是 tex） */
export function detectTexDir(modelFile, textures) {
  const dirs = readdirSync(dirname(modelFile), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const counts = new Map();
  for (const t of textures) {
    const [first, ...rest] = parts(t);
    const real = rest.length && dirs.find((d) => d.toLowerCase() === first.toLowerCase());
    if (real) counts.set(real, (counts.get(real) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'tex';
}

/** 按 src/core/loading.js 的改写规则解析每张贴图，返回磁盘上找不到（含大小写不一致）的 */
export function missingTextures(modelFile, textures, texDir = 'tex') {
  const base = dirname(modelFile);
  const missing = [];
  for (const t of new Set(textures)) {
    const p = parts(t).map((seg) => (seg.toLowerCase() === texDir.toLowerCase() ? texDir : seg));
    if (!existsExact(base, p)) missing.push(t);
  }
  return missing;
}

/** 逐级按目录列表比较，大小写必须完全一致（Windows 的文件系统本身不区分大小写） */
function existsExact(dir, segs) {
  let cur = dir;
  for (const seg of segs) {
    if (seg === '..') { cur = dirname(cur); continue; }
    let names;
    try { names = readdirSync(cur); } catch { return false; }
    if (!names.includes(seg)) return false;
    cur = join(cur, seg);
  }
  return true;
}
