/*
 * 呈现层：文案、图片、配色。和模型、性格无关，换皮只改这里。
 * theme 的每个键对应 src/ui/style.css 里的一个 CSS 变量（驼峰 → --kebab-case）。
 * 颜色写 '#rrggbb'；写成 [r, g, b] 的是带透明度用的底色（CSS 里 rgba(var(--x), a)）。
 */
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

  /** 粉紫配色：取自达妮娅的发色（粉）与饰品（蓝紫） */
  theme: {
    // 背景与界面
    bgTop: '#f3e9ee',
    bgBottom: '#d9cfe2',
    ink: '#4a3b52',
    accent: '#6b3f5e', // 选中的工具、强调文字
    accentInk: '#fff4f7',
    shade: [80, 50, 90], // 阴影、描线的底色
    // 加载条 / 音游进度条的渐变
    gradient1: '#f3a6c4',
    gradient2: '#b98be0',
    gradient3: '#7fa4f0',
    // 音游
    noteTap: '#ee9fbc',
    noteHold: '#a88bc4',
    noteHoldBody: '#9379ab',
    noteHoldTail: '#bda5ce',
    noteHoldHeld: '#8564a3',
    burstTap: '#ffd3e2',
    burstHold: '#ecdcff',
    judgePerfect: '#ffe79a',
    judgeGood: '#e9d9ff',
    judgeMiss: '#ffb3c4',
    glow: [91, 61, 89], // 音游文字阴影、轨道
  },
  /** 模型描边颜色（线性 RGB 0..1） */
  outline: [0.22, 0.12, 0.14],
};
