/*
 * 性格层：开放哪些动作、各阶段的节奏、表情表、彩蛋。
 * 这一层决定"像不像她"，应该由熟悉角色的人拍板，不能只靠模型自动生成。
 */
import expressions from './expressions.js';
import honeyLemon from '../../rhythm/charts/honeyLemon.js';

export default {
  /*
   * 开放的动作，按这里的顺序出现在右侧工具栏；不写的动作不出现。
   * limit / push 是幅度上限，单位是半脸宽（model.face.halfWidth）。
   */
  actions: {
    cup: { label: '捧脸', push: 0.09 },
    poke: { label: '戳脸' },
    single: { label: '单手拉脸', limit: 0.2 },
    double: { label: '双手拉脸', limit: 0.13 },
    rhythm: { label: '音游', song: honeyLemon, limit: 0.28, hint: '点按 / 空格 = 戳脸 · 长按 = Wink 拉脸' },
  },
  defaultAction: 'poke',

  /** 各种反应的节奏；某项设为 false 就没有这种反应 */
  behavior: {
    cup: { shy: [0.5, 1.6], enjoy: [2.0, 3.2] }, // 捧住多少秒后开始害羞 / 享受
    dizzy: { energy: 1.2 }, // 揉脸攒够多少就晕
    afterglow: { minHold: 0.6 }, // 捧够多少秒再松手才"嘿嘿"
    sulk: true, // 拉久了松手会生闷气
  },

  expressions,

  /*
   * 彩蛋：拉脸时偶尔冒出的漫画符号 + 表情。symbol = 模型里的 UV 表情名，
   * spot = 预设位置（model.symbolSpots），at / scale = 再挪到哪里、缩放多少（模型绑定姿态坐标；
   * 达妮娅脸颊外缘约 x=±0.62, y=16.6）。morphs 用语义名。
   */
  eggs: {
    chance: 0.3,
    tint: [0.24, 0.5, 0.84],
    list: [
      {
        symbol: 'handi', spot: 'emo3右', at: [0.8, 16.82, 0.72], scale: 0.52,
        morphs: { browTrouble: 0.75, eyeHalf: 0.45, mouthCornerDown: 0.15 },
      },
    ],
    /** 揉脸揉晕了：乱线 + 晕乎乎的表情 */
    dizzy: {
      symbol: 'luanma', spot: 'emo3右', at: [0.82, 16.86, 0.72], scale: 0.5, tint: [0.42, 0.38, 0.55],
      morphs: { browTrouble: 0.8, eyeSmile: 0.55, mouthTriangle: 0.6 },
    },
  },
};
