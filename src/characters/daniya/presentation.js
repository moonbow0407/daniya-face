/*
 * 呈现层：文案、图片、配色。和模型、性格无关，换皮只改这里。配色在 theme.js。
 */
import theme from './theme.js';

export default {
  name: '达妮娅',
  text: {
    title: '捏捏达妮娅',
    loading: '正在召唤达妮娅…',
    textures: '正在铺贴图…',
    preparing: '达妮娅整理发型中…',
    failed: '加载失败，请刷新重试',
  },
  images: {
    loading: '/loading.jpg',
    finale: '/finale.jpg',
    finaleAlt: '我就说你是很椰的椰果',
  },

  theme: theme.css,
  outline: theme.outline,
};
