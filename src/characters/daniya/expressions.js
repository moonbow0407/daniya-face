/**
 * 达妮娅的表情表（性格层）：引擎算出的情绪信号 → 语义表情。
 * 同样的信号，换个角色可以完全不同的反应——这份文件就是"她会怎么反应"。
 * 语义名在 model.js 的 morphs 里映射到模型表情；眨眼本身由引擎处理。
 *
 * 信号 p（见 src/expression/signals.js）：
 *   blink, open        眨眼程度 / 睁眼程度
 *   h                  拉扯程度（平滑）；left / right 左右脸各被拉多少
 *   es.mouth / es.surprise  脸被托住时的嘴型 / 惊讶程度
 *   shy, enjoy, dizzy, afterglow  捧脸各阶段（害羞、享受、揉晕、松手余韵）
 *   rh, rhythmActive   音游长按程度 / 是否在音游中
 *   pullSides          0 捧 / 1 单手 / 2 双手
 *   egg, eggFade       彩蛋及其淡入程度
 *   pokes.reactions / pokes.smiles, pokeFace  戳脸反应（[右脸, 左脸]）
 *   sulk               生闷气程度
 *   combo, mad         连戳次数 / 连戳生气程度（生气的表情在 personality.eggs.angry）
 */
export default function daniyaExpressions(p, add) {
  const { h, rh, open } = p;

  add('browDown', p.blink * 0.14); // 眨眼时眉毛跟着压一点

  // 被托住：嘴被挤成小小的"嘟"，眼睛微微睁大、眉毛轻抬；拉扯时嘴型再被扯开一些
  // （达妮娅的嘴型幅度大，mouthNarrow 超过 ~0.85 牙齿会从嘴角露出来）
  add('mouthNarrow', 0.8 * p.es.mouth * (1 - 0.72 * h));
  add('mouthCornerDown', 0.45 * p.es.mouth * (1 - 0.93 * h) * (1 - p.enjoy));
  add('mouthForward', 0.5 * p.es.mouth * (1 - 0.5 * h));
  add('mouthWedge', 0.3 * p.es.surprise * (1 - h));
  add('eyeSurprise', 0.57 * p.es.surprise * (1 - h));
  add('browUp', 0.1 * p.es.surprise * (1 - h));

  // 害羞：眉毛微微皱起、眼皮垂一点；享受：眯眼笑；松手后：嘿嘿
  add('browTrouble', 0.3 * p.shy);
  add('eyeHalf', 0.2 * p.shy * open);
  add('eyeSmile', 0.9 * p.enjoy * (1 - p.dizzy) + p.afterglow);
  add('mouthCornerUp', 0.35 * p.enjoy + 0.3 * p.afterglow);
  add('grin', 0.85 * p.afterglow);

  // 拉扯：被拉的一侧嘴角扯开；音游长按改用干净的"眨眼吐舌"（不叠加口横広げ，避免舌头错位）
  add('mouthWideL', p.left * 0.54 * (1 - rh));
  add('mouthWideR', p.right * 0.54 * (1 - rh));
  if (p.rhythmActive) {
    add('wink', rh * 0.95);
    add('tongue', rh * 0.9);
    add('smileSoft', rh * 0.45);
    add('shy', rh * 0.45);
  } else {
    add('eyeSmile', h * (p.pullSides === 2 ? 1 : 0.9) * (1 - p.eggFade));
  }
  if (p.egg) for (const [k, v] of Object.entries(p.egg.morphs)) add(k, v * p.eggFade);

  // 戳：弯眼笑一下，之后被戳的一侧放松、嘴角上扬；连戳时眉头渐渐为难，戳多了生气（笑容收起来）
  const [reactR, reactL] = p.pokes.reactions; // 槽位 0 = x<0 = 右脸
  const pf = p.pokeFace;
  const calmPoke = (1 - rh) * (1 - p.mad);
  add('eyeSmile', 0.85 * pf * calmPoke);
  add('eyeRelaxR', reactR * 0.28 * open * (1 - pf) * calmPoke);
  add('eyeRelaxL', reactL * 0.28 * open * (1 - pf) * calmPoke);
  const [smileR, smileL] = p.pokes.smiles;
  const smile = Math.max(smileR, smileL);
  add('mouthCornerUpR', (smile * 0.62 + smileR * 0.58 + 0.25 * pf) * calmPoke);
  add('mouthCornerUpL', (smile * 0.62 + smileL * 0.58 + 0.25 * pf) * calmPoke);
  const fret = p.rhythmActive ? 0 : Math.min(1, Math.max(0, p.combo - 1) / 3); // 连戳 2~4 下
  add('browTrouble', 0.45 * fret * Math.max(pf, p.pokeAfter) * (1 - p.mad));
  const Z = Math.min(1, 0.65 * Math.max(reactR, reactL) + 0.85 * smile);
  add('browTroubleL', p.left * h * 0.045 + (0.34 * Z + 0.27 * reactL) * 0.35);
  add('browTroubleR', p.right * h * 0.045 + (0.34 * Z + 0.27 * reactR) * 0.35);

  // 生闷气
  add('mouthForward', 0.65 * p.sulk);
  add('mouthCornerDown', 0.28 * p.sulk);
  add('pout', 0.95 * p.sulk);
  add('serious', 0.56 * p.sulk);
  add('eyeHalf', 0.38 * p.sulk * open);
}
