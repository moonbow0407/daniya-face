/**
 * __NAME__ 的表情表：每个动作一个招牌表情 + 一个变体。
 *
 * 写之前先打开 /?char=__ID__&studio，在"全部表情"里把模型的表情逐个看一遍（缩略图）：
 * 同名表情在不同模型里观感可能完全不同，嘴型开到 1 也常常看不出来；
 * 眼部贴片（><、X_X、漩涡、爱心）和漫画符号（💢、汗滴、竖线）最明显。要用的表情先映射进 model.js 的 morphs。
 *
 * 引擎每帧给出信号 p（都在 0..1），这里 add(语义名, 数值) 叠加表情：
 *   blink, open        眨眼 / 睁眼程度（眼部表情乘 open，免得和眨眼叠在一起变形）
 *   roll               本次动作开始时掷的随机数：roll < 0.7 用招牌，否则用变体（工作台可固定看招牌或变体）
 *   pokeFace, combo    刚被戳（约 0.5 秒）/ 连戳次数（间隔 < 0.7 秒）
 *   pokeAfter          戳完的余韵（戳时为 1，约 2~3 秒淡完）：想让笑容、生气停留久一点就用它
 *   pokes.reactions / pokes.smiles  戳完的余韵 [右脸, 左脸]
 *   h, left, right     拉扯程度、左右脸各被拉多少；pullSides 0 捧 / 1 单手 / 2 双手
 *   es.mouth / es.surprise  脸被托住（捧或拉）时的嘴型 / 惊讶
 *   shy, enjoy         捧住后的害羞 / 享受；rub 正在揉（揉得多快）；dizzy 揉晕；afterglow 捧完松手；sulk 拉久了松手生闷气
 *   rh, rhythmActive   音游长按程度 / 是否在音游中
 *   egg, eggFade       拉脸彩蛋（personality.eggs）及其淡入程度
 * 数值一般 0.3~1：招牌表情要给足（0.6~1），叠得越多每个越小。完整写法参考 src/characters/daniya/expressions.js。
 */
export default function expressions(p, add) {
  const { h, rh, open } = p;
  const variant = p.roll >= 0.7;

  // ---- 物理反应（保留）：眨眼带眉、被拉一侧嘴角拉开、被托住嘴被挤 ----
  add('browDown', p.blink * 0.14);
  add('mouthWideL', p.left * 0.54 * (1 - rh));
  add('mouthWideR', p.right * 0.54 * (1 - rh));
  add('mouthNarrow', 0.5 * p.es.mouth * (1 - 0.72 * h));

  // ---- 戳：招牌 / 变体（连戳） ----
  const pf = p.pokeFace;
  if (p.combo >= 3 || variant) {
    // add('eyeSurprise', 0.8 * pf * open);
  } else {
    add('eyeSmile', 0.8 * pf);
  }

  // ---- 单手拉 ----
  const single = p.pullSides === 1 ? h * (1 - rh) : 0;
  add('eyeSmile', 0.8 * single);

  // ---- 双手拉 ----
  const double = p.pullSides === 2 ? h : 0;
  add('browTrouble', 0.7 * double);

  // ---- 捧：刚捧住 → 害羞 → 享受；揉晕；松手 ----
  add('shy', 0.6 * p.shy);
  add('eyeSmile', 0.6 * p.enjoy * (1 - p.dizzy));

  if (p.egg) for (const [k, v] of Object.entries(p.egg.morphs ?? {})) add(k, v * p.eggFade);
}
