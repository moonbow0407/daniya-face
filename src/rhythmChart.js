/*
 * 音游谱面（Easy 简单模式）：《可愛くてごめん》（HoneyWorks feat. 早見沙織）
 * 经本地音源实测对齐：BPM = 160.000（1 拍 = 0.375s，1 小节 4 拍 = 1.500s），首拍 = 0.515s。
 * 所有音符严格落在 160 BPM 强拍/正拍网格上，无复杂切分，长按均为 2~3 拍且尾部至少留 1 拍换气，
 * 既严格卡点，又轻松好上手，同时给达妮娅留足展示长按表情的时间。
 */
export const SONG_URL = '/music/kawaikute-gomen.mp3';
export const BPM = 160;
export const BEAT_SEC = 60 / BPM; // 0.375s
export const BEAT_OFFSET = 0.515; // 第一小节第 1 拍精确时间（秒）
export const SONG_END = 216.6;    // 尾音自然淡出后的结算时机（秒）

const raw = [];
const tap = (bar, beat) => raw.push([bar * 4 + beat, null]);
const hold = (bar, beat, durBeats) => raw.push([bar * 4 + beat, durBeats]);

// Bars 0-5 (0.515s - 9.515s): 开场前奏 Hook
for (let bar = 0; bar < 6; bar++) {
  if (bar === 2 || bar === 5) hold(bar, 0, 2);
  else { tap(bar, 0); tap(bar, 2); }
}

// Bar 6 (9.515s): 前奏停顿过渡
hold(6, 0, 2);

// Bars 7-15 (11.015s - 24.515s): 全乐队进鼓律动
for (let bar = 7; bar < 16; bar++) {
  if (bar === 10 || bar === 14) hold(bar, 0, 2);
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 16-22 (24.515s - 35.015s): 主歌 A1
for (let bar = 16; bar < 23; bar++) {
  if (bar === 17 || bar === 19 || bar === 21) hold(bar, 0, 2);
  else if (bar === 22) { tap(bar, 0); tap(bar, 2); tap(bar, 3); }
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 23-30 (35.015s - 47.015s): 导歌 B1
for (let bar = 23; bar < 31; bar++) {
  if (bar === 25 || bar === 29) hold(bar, 0, 2);
  else if (bar === 30) hold(bar, 0, 3); // 3 拍蓄力进副歌
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 31-43 (47.015s - 66.515s): 副歌 1（Chu! 可愛くてごめん）
for (let bar = 31; bar < 44; bar++) {
  const rel = bar - 31;
  if (rel === 1 || rel === 5 || rel === 9 || rel === 12) hold(bar, 0, 2);
  else if (rel === 3 || rel === 7 || rel === 11) { tap(bar, 0); tap(bar, 1); tap(bar, 2); }
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 44-45 (66.515s - 69.515s): 副歌尾奏过渡（45 第 4 拍静默）
hold(44, 0, 2);
hold(45, 0, 2);

// Bars 46-53 (69.515s - 81.515s): 间奏 1
for (let bar = 46; bar < 54; bar++) {
  if (bar === 47 || bar === 51 || bar === 53) hold(bar, 0, 2);
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 54-61 (81.515s - 93.515s): 主歌 A2
for (let bar = 54; bar < 62; bar++) {
  if (bar === 55 || bar === 57 || bar === 59) hold(bar, 0, 2);
  else if (bar === 61) { tap(bar, 0); tap(bar, 2); tap(bar, 3); }
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 62-69 (93.515s - 105.515s): 导歌 B2
for (let bar = 62; bar < 70; bar++) {
  if (bar === 64 || bar === 68) hold(bar, 0, 2);
  else if (bar === 69) hold(bar, 0, 3);
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 70-89 (105.515s - 135.515s): 副歌 2
for (let bar = 70; bar < 90; bar++) {
  const rel = bar - 70;
  if (rel === 1 || rel === 5 || rel === 9 || rel === 13 || rel === 17 || rel === 19) hold(bar, 0, 2);
  else if (rel === 3 || rel === 7 || rel === 11 || rel === 15) { tap(bar, 0); tap(bar, 1); tap(bar, 2); }
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 90-91 (135.515s - 138.515s): 过渡段落 2
hold(90, 0, 2);
hold(91, 0, 2);

// Bars 92-115 (138.515s - 174.515s): 器乐间奏与推进段
for (let bar = 92; bar < 116; bar++) {
  const rel = bar - 92;
  if (rel % 4 === 3) hold(bar, 0, 2);
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 116-124 (174.515s - 188.015s): 柔缓桥段（Bar 122 留白呼吸）
hold(116, 0, 2);
hold(117, 0, 2);
hold(118, 0, 2);
hold(119, 0, 2);
hold(120, 0, 2);
hold(121, 0, 3);
// Bar 122 静默留白
tap(123, 2);
hold(124, 0, 2);

// Bars 125-133 (188.015s - 201.515s): 最终大副歌
for (let bar = 125; bar < 134; bar++) {
  const rel = bar - 125;
  if (rel === 1 || rel === 5 || rel === 8) hold(bar, 0, 2);
  else if (rel === 3 || rel === 7) { tap(bar, 0); tap(bar, 1); tap(bar, 2); }
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 134-135 (201.515s - 204.515s): 尾奏前停顿与重拍落点
hold(134, 0, 2);
tap(135, 0);
tap(135, 2);

// Bars 136-142 (204.515s - 215.015s): 尾奏律动
for (let bar = 136; bar < 143; bar++) {
  if (bar === 138 || bar === 141) hold(bar, 0, 2);
  else if (bar === 142) { tap(bar, 0); tap(bar, 1); tap(bar, 2); }
  else { tap(bar, 0); tap(bar, 2); }
}

// Bar 143 (215.015s): 结束收尾音符
hold(143, 0, 2);

export const CHART = raw.map(([beat, dur]) => {
  const at = +(BEAT_OFFSET + beat * BEAT_SEC).toFixed(4);
  return dur === null
    ? { at, move: 'poke' }
    : { at, until: +(at + dur * BEAT_SEC).toFixed(4), move: 'single' };
});
