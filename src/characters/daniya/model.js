/*
 * 模型层：模型文件本身决定的东西（材质名、骨骼、有哪些表情、坐标校准）。
 * 换模型时由探测脚本生成草稿，人确认。和性格、配色无关。
 */
import hairRest from './hairRest.json';

export default {
  file: '/models/daniya_red/daniya_red.pmx',
  bytes: 12_400_000, // 服务器不给 content-length 时，用它估算加载进度

  /*
   * 脸部标志点（模型绑定姿态坐标），形变、点击区域都按它们建立的脸部坐标系来算（见 src/rig/faceFrame.js）。
   * 量法：脸部皮肤材质的顶点里，鼻尖 = x≈0 处 z 最大的点；半宽 = 脸颊高度处 |x| 最大值；
   * 下眼睑 = 眼白材质的最低处；脸颊 = 嘴角和下眼睑之间、肉最鼓的地方；前发 = 前发材质贴近脸颊的位置
   */
  face: {
    halfWidth: 0.93,
    mouthY: 16.49,
    eyeY: 17.02,
    lidY: 16.92,
    noseZ: 0.624,
    cheek: [0.45, 16.64, 0.35],
    hair: [0.64, 16.7, 0.2],
    pokeFade: [16.7, 16.88], // 戳凹在这段高度里淡出，到下眼睑之前就停（眼周皮肤基本不动）
  },

  /** 前发避让：脸颊在前发处被顶出去超过 slack（半脸宽）才推开发丝 */
  hairAvoid: { slack: 0.01, knee: 0.015, follow: 1.1 },

  /** 镜头取景（模型坐标）：wide = 半身全景，close = 脸部特写 */
  camera: {
    wideY: 16.45,
    wideYPortrait: 16.2,
    closeY: 16.78,
    wideHeight: 6.4, // 全景要装下的高度（胸口到头顶）
    wideWidth: 4.6, // 横屏全景宽度
    wideWidthPortrait: 3.1, // 竖屏全景宽度（脸和肩宽）
    closeHeight: 1.9,
    closeWidth: 1.7,
  },

  materials: {
    skin: ['face1', 'Cheek'], // 拉 + 戳 + 泛红
    hitTest: ['face1'], // 点击检测只看这些材质
    mouth: ['kou1', 'she1'], // 口腔、舌头：跟皮肤一起形变
    // 贴在脸上的独立材质（眼白、瞳孔、睫毛、眉毛、鼻子、脸上的线条）：跟皮肤用同一个形变场，免得皮肤动了它们露出来
    followPoke: ['Eye1-bai', 'MI_Eye1', 'MI_Eye1+hi2', 'MI_Eye1+hi2+', 'bai11', 'jie1', 'mei1', 'zhou1', 'nose1', 'emo1'],
    hairOnCheek: ['前发', '前发+'], // 垂在脸颊前的发丝：快穿模时被推开
    symbol: 'emo3', // 漫画符号贴片（汗滴、乱线）
    noOutline: ['face1', 'Cheek', 'kou1', 'she1', 'emo1', 'emo3'], // 会变形或是贴纸的材质不画描边
  },

  bones: {
    head: '頭',
    neck: '首',
    eyes: ['右目', '左目'],
    /** 模型是 A 字型，改成双臂自然下垂：[骨骼名, x, y, z]（弧度，YXZ 顺序） */
    restPose: [
      ['左腕', 0, 0, -0.62],
      ['右腕', 0, 0, 0.62],
      ['左ひじ', 0, -0.25, 0],
      ['右ひじ', 0, 0.25, 0],
    ],
  },

  /** 头发静止姿势（?bake 烘焙得到） */
  hairRest,

  /*
   * 表情：语义名 → 模型里的顶点表情名。表情表（personality.expressions）只用语义名。
   * 模型里没有的表情留空或删掉即可，会自动跳过。
   */
  morphs: {
    blink: 'まばたき',
    browDown: '下',
    browUp: '上',
    browTrouble: '困る',
    browTroubleL: '左困る',
    browTroubleR: '右困る',
    eyeSurprise: 'びっくり',
    eyeHalf: 'じと目',
    eyeSmile: '笑い',
    eyeRelaxL: 'なごみL',
    eyeRelaxR: 'なごみR',
    wink: 'ウィンク',
    mouthNarrow: '口横狭め',
    mouthCornerDown: '口角下げ',
    mouthCornerUp: '口角上げ',
    mouthCornerUpL: '左口角上げ',
    mouthCornerUpR: '右口角上げ',
    mouthWideL: '左口横広げ',
    mouthWideR: '右口横広げ',
    mouthForward: '口前',
    mouthWedge: '∧',
    mouthTriangle: '▲',
    tongue: 'ぺろっ',
    grin: 'hehe',
    smileSoft: 'にこり',
    shy: '照れ',
    pout: '(○｀ε´○)',
    serious: '真面目',
  },

  /** 漫画符号的预设位置（位置表情名）。图案是 UV 表情，在 personality.eggs 里按名字选 */
  symbolSpots: ['emo3右', 'emo3左', 'emo3上'],
};
