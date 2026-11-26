/**
 * 基础方案：只有"物理上必然"的反应（被拉一侧嘴角被扯开、被托住时嘴被挤），没有性格。
 * 新方案复制这个文件改：proposals/<英文名>.js，写上 title / summary。
 *
 * 表情表 expressions(p, add)：引擎算出的情绪信号 p → add(语义名, 数值)。
 * 语义名见 model.js 的 morphs（工作台"表情图鉴"可逐个预览）；模型里没有的会被跳过。
 * 信号 p（都在 0..1；完整示例见 src/characters/daniya/expressions.js）：
 *   blink, open        眨眼程度 / 睁眼程度（眼部表情乘 open，避免和眨眼叠加）
 *   h                  拉扯程度；left / right 左右脸各被拉多少；pullSides 0 捧 / 1 单手 / 2 双手
 *   es.mouth / es.surprise  脸被托住（捧或拉）时的嘴型 / 惊讶程度
 *   shy, enjoy, dizzy, afterglow  捧脸各阶段（需在 behavior 里开启）
 *   pokeFace           刚被戳（戳完约 0.5 秒内）
 *   pokes.reactions / pokes.smiles  戳后左右脸的余韵 [右脸, 左脸]
 *   sulk               拉久了松手后生闷气（需 behavior.sulk）
 *   rh, rhythmActive   音游长按程度 / 是否在音游中
 *   egg, eggFade       当前彩蛋及其淡入程度
 */
export default {
  title: '基础（无性格）',
  summary: '只有物理反应，作为写方案的起点',

  /*
   * 反应节奏，设为 false 就没有这种反应：
   * cup.shy / cup.enjoy 捧住多少秒后开始害羞 / 享受（[开始, 完全]）；dizzy.energy 揉多久会晕；
   * afterglow.minHold 捧够多少秒松手才笑；sulk 拉久了松手会不会生闷气
   */
  behavior: {
    cup: { shy: [0.5, 1.6], enjoy: [2.0, 3.2] },
    dizzy: false,
    afterglow: false,
    sulk: false,
  },

  expressions(p, add) {
    add('browDown', p.blink * 0.14);
    add('mouthWideL', p.left * 0.54 * (1 - p.rh));
    add('mouthWideR', p.right * 0.54 * (1 - p.rh));
    add('mouthNarrow', 0.5 * p.es.mouth * (1 - 0.72 * p.h));
    if (p.egg) for (const [k, v] of Object.entries(p.egg.morphs)) add(k, v * p.eggFade);
  },

  /*
   * 彩蛋（可选）：拉脸时偶尔冒出的漫画符号 + 表情。symbol 从 SURVEY.md 的"可用的漫画符号"里选，
   * spot 从 model.symbolSpots 里选，at / scale 是贴片的位置和大小（模型坐标）。
   */
  eggs: { chance: 0, list: [], dizzy: null },
};
