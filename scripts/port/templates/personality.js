/*
 * 性格层：开放的动作 + 选定的性格方案。
 * 选定方案：把下面的 import 改成 './proposals/<方案>.js'（方案在 ?char=__ID__&studio 里对比）。
 */
import chosen from './proposals/base.js';
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

  behavior: chosen.behavior,
  expressions: chosen.expressions,
  eggs: chosen.eggs,
};
