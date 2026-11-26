/*
 * 性格层：开放的动作、反应节奏、表情表、彩蛋。
 * 表情表在 expressions.js：每个动作一个招牌表情 + 一个变体，写完在 ?char=__ID__&studio 里看效果。
 */
import expressions from './expressions.js';
// import honeyLemon from '../../rhythm/charts/honeyLemon.js'; // 开放音游时取消注释

export default {
  /*
   * 开放的动作，按顺序出现在右侧工具栏，不写就不出现。
   * cup 捧脸 / poke 戳脸 / single 单手拉脸 / double 双手拉脸 / rhythm 音游
   * limit / push 是相对脸宽的幅度上限，一般不用改。
   */
  actions: {
    poke: { label: '戳脸' },
    single: { label: '单手拉脸', limit: 0.075 },
    double: { label: '双手拉脸', limit: 0.048 },
    cup: { label: '捧脸', push: 0.035 },
    // rhythm: { label: '音游', song: honeyLemon, limit: 0.12, hint: '点按 / 空格 = 戳脸 · 长按 = 拉脸' },
  },
  defaultAction: 'poke',

  /*
   * 反应节奏，设为 false 就没有这种反应：
   * cup.shy / cup.enjoy 捧住多少秒后开始害羞 / 享受（[开始, 完全]）；dizzy.energy 揉多久会晕；
   * afterglow.minHold 捧够多少秒松手才有余韵；sulk 拉久了松手会不会生闷气
   */
  behavior: {
    cup: { shy: [0.5, 1.6], enjoy: [2.0, 3.2] },
    dizzy: { energy: 1.2 },
    afterglow: { minHold: 0.6 },
    sulk: false,
  },

  expressions,

  /*
   * 彩蛋：拉脸时以 chance 的概率换成另一套表情（拉脸的变体也可以直接在表情表里用 p.roll 写）。
   * morphs 用语义名；模型有 UV 漫画符号贴片时还可以加 symbol / spot / at / scale（见 SURVEY.md）。
   */
  eggs: { chance: 0, list: [] },
};
