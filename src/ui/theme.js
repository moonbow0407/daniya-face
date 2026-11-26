/**
 * 主题：把角色配置 presentation.theme 写成 CSS 变量（驼峰 → --kebab-case），
 * 并按主色生成"戳"的手指光标（data URI 里用不了 CSS 变量）。
 */
export function applyTheme(theme = {}) {
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(theme)) {
    const name = `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/(\D)(\d)/g, '$1-$2')}`;
    root.setProperty(name, Array.isArray(value) ? value.join(', ') : value);
  }
  if (theme.accent) root.setProperty('--cursor-poke', pokeCursor(theme.accent));
}

function pokeCursor(stroke) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M9 2.5a2.5 2.5 0 0 1 5 0V13l7 1.4c2.6.5 3.9 2.6 3.2 5.2L22.6 26H11.4L6.3 18.6c-1-1.5-.5-3.2 1.2-3.6l1.5-.3z' fill='#fff6f8' stroke='${stroke}' stroke-width='1.6' stroke-linejoin='round'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 11 1, pointer`;
}
