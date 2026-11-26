// 配色：从图片（立绘、加载图、模型贴图）取主色，或直接给颜色，派生出整套界面主题
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/** 读取 PNG / JPG 的像素 → [[r,g,b], ...]（抽样，跳过透明、接近纯白/纯黑的像素） */
export function samplePixels(file, maxSamples = 40000) {
  const buf = readFileSync(file);
  const img = /\.png$/i.test(file) ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024 });
  const { width, height, data } = img;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / maxSamples)));
  const out = [];
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 200) continue;
    const [, s, l] = rgbToHsl([data[i], data[i + 1], data[i + 2]]);
    if (l > 0.88 || l < 0.12 || s < 0.15) continue; // 背景白、皮肤高光、描线黑、灰色不算角色配色
    out.push([data[i], data[i + 1], data[i + 2]]);
  }
  return out;
}

/** k-means 取主色，按占比从高到低；相近色相合并，返回 [{ rgb, hex, share }] */
export function palette(pixels, k = 7) {
  if (!pixels.length) return [];
  let centers = Array.from({ length: k }, (_, i) => pixels[Math.floor(((i + 0.5) / k) * pixels.length)].slice());
  let assign = new Int32Array(pixels.length);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    pixels.forEach((p, n) => {
      let best = 0, bd = Infinity;
      centers.forEach((c, i) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = i; } });
      assign[n] = best;
      const s = sums[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    centers = sums.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[i]));
  }
  const counts = centers.map((_, i) => assign.filter((a) => a === i).length);
  const sorted = centers.map((c, i) => ({ rgb: c.map(Math.round), share: counts[i] / pixels.length })).sort((a, b) => b.share - a.share);
  const merged = [];
  for (const c of sorted) {
    const h = rgbToHsl(c.rgb)[0];
    const near = merged.find((m) => hueDist(rgbToHsl(m.rgb)[0], h) < 0.04);
    if (near) near.share += c.share; else merged.push({ ...c });
  }
  // 排序看"占比 × 饱和度"：大片的淡肤色、背景不该压过发色和服装色
  const score = (c) => c.share * rgbToHsl(c.rgb)[1];
  return merged.sort((a, b) => score(b) - score(a)).map((c) => ({ ...c, hex: hex(c.rgb), share: +c.share.toFixed(3) }));
}

/**
 * 从 3 个颜色（主色、辅色、点缀色）派生整套主题。主色一般取发色，背景走主色的极浅一档，
 * 强调色是主色的深一档，音游的长按音符用辅色。
 */
export function deriveTheme([main, second = main, third = second]) {
  const [h1, s1] = rgbToHsl(main), [h2, s2] = rgbToHsl(second), [h3, s3] = rgbToHsl(third);
  const c = (h, s, l) => hex(hslToRgb([h, s, l]));
  const rgb = (h, s, l) => hslToRgb([h, s, l]).map(Math.round);
  const cap = (s, a, b) => Math.min(b, Math.max(a, s));
  const css = {
    bgTop: c(h1, cap(s1, 0.2, 0.35), 0.94),
    bgBottom: c(h2, cap(s2, 0.15, 0.25), 0.86),
    ink: c(h1, 0.17, 0.28),
    accent: c(h1, cap(s1, 0.25, 0.4), 0.33),
    accentInk: c(h1, 0.6, 0.97),
    shade: rgb(h1, 0.3, 0.27),
    gradient1: c(h1, cap(s1, 0.6, 0.8), 0.8),
    gradient2: c(h2, cap(s2, 0.45, 0.6), 0.71),
    gradient3: c(h3, cap(s3, 0.6, 0.8), 0.72),
    noteTap: c(h1, cap(s1, 0.6, 0.75), 0.78),
    noteHold: c(h2, 0.32, 0.66),
    noteHoldBody: c(h2, 0.23, 0.57),
    noteHoldTail: c(h2, 0.3, 0.73),
    noteHoldHeld: c(h2, 0.27, 0.51),
    burstTap: c(h1, 0.9, 0.91),
    burstHold: c(h2, 0.9, 0.93),
    judgePerfect: '#ffe79a',
    judgeGood: c(h2, 0.9, 0.92),
    judgeMiss: c(h1, 0.9, 0.85),
    glow: rgb(h1, 0.2, 0.3),
  };
  const outline = hslToRgb([h1, 0.3, 0.16]).map((v) => +(v / 255).toFixed(2));
  return { css, outline };
}

export function themeJs({ id, source, colors, theme }) {
  return `/*
 * 配色（由 \`npm run port -- theme ${id}\` 生成，可以手改）
 * 取色来源：${source}
 * 主色 / 辅色 / 点缀色：${colors.join(' / ')}
 * css 的每个键对应 src/ui/style.css 里的一个 CSS 变量（驼峰 → --kebab-case）；[r, g, b] 是带透明度用的底色。
 */
export default {
  css: {
${Object.entries(theme.css).map(([k, v]) => `    ${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : `'${v}'`},`).join('\n')}
  },
  /** 模型描边颜色（0..1） */
  outline: ${JSON.stringify(theme.outline)},
};
`;
}

// ---------- 颜色工具 ----------
export const parseHex = (s) => { const m = s.replace('#', ''); return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)); };
export const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const hueDist = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb([h, s, l]) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
