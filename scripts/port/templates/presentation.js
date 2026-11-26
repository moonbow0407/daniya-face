/*
 * 呈现层：名字与配色。加载界面、提示文字用引擎的通用默认值；
 * 需要定制时可加 text: { title, loading, ... } 和 images: { loading, finale, finaleAlt }（图片放在 public/）。
 */
import theme from './theme.js';

export default {
  name: '__NAME__',
  theme: theme.css,
  outline: theme.outline,
};
