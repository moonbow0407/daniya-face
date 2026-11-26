/*
 * 达妮娅的配色（手调）：粉取自发色，蓝紫取自饰品。
 * css 的每个键对应 src/ui/style.css 里的一个 CSS 变量（驼峰 → --kebab-case）；[r, g, b] 是带透明度用的底色。
 */
export default {
  css: {
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
  /** 模型描边颜色（0..1） */
  outline: [0.22, 0.12, 0.14],
};
