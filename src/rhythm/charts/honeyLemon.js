/*
 * 音游谱面（Easy 简单模式）：《しゅわしゅわハニーレモン350ml》
 * 作曲：しゃろう（Sharou） / 来源：DOVA-SYNDROME（OpenTracks）免费可商用 BGM
 * 经本地音源实测对齐：BPM = 125.000（1 拍 = 0.480s，1 小节 4 拍 = 1.920s），首拍 = 0.980s，全长约 97 秒。
 * 所有音符严格落在 125 BPM 强拍/正拍网格上，长按统一 2~3 拍且尾部至少留 1 拍换气，轻松卡点不手忙脚乱。
 */
const SONG_URL = '/music/honey-lemon-350ml.mp3';
const SONG_TITLE = 'しゅわしゅわハニーレモン350ml';
const SONG_CREDIT = 'BGM：しゅわしゅわハニーレモン350ml / しゃろう（DOVA-SYNDROME）';
const BPM = 125;
const BEAT_SEC = 60 / BPM; // 0.480s
const BEAT_OFFSET = 0.980; // Bar 0 第 1 拍底鼓精确落点（秒）
const SONG_END = 96.2;     // 尾音自然淡出后的结算时机（秒）

const raw = [];
const tap = (bar, beat) => raw.push([bar * 4 + beat, null]);
const hold = (bar, beat, durBeats) => raw.push([bar * 4 + beat, durBeats]);

// Bars 0-1 (0.980s - 4.820s): 开场气泡进鼓
tap(0, 0); tap(0, 2);
hold(1, 0, 2);

// Bars 2-7 (4.820s - 16.340s): 轻快主歌 A
for (let bar = 2; bar <= 7; bar++) {
  if (bar === 3 || bar === 5) hold(bar, 0, 2);
  else if (bar === 7) { tap(bar, 0); tap(bar, 1); tap(bar, 2); } // 3 连轻敲进副歌
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 8-16 (16.340s - 33.620s): Kawaii Future Bass 副歌 1
for (let bar = 8; bar <= 16; bar++) {
  if (bar === 9 || bar === 11 || bar === 13 || bar === 15) hold(bar, 0, 2);
  else if (bar === 10 || bar === 14) { tap(bar, 0); tap(bar, 1); tap(bar, 2); }
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 17-22 (33.620s - 45.140s): 甜美旋律间奏
for (let bar = 17; bar <= 22; bar++) {
  if (bar % 2 === 0) hold(bar, 0, 2);
  else { tap(bar, 0); tap(bar, 2); }
}

// Bar 23 (45.140s - 47.060s): 鼓点过渡（军鼓起拍）
tap(23, 0); tap(23, 2); tap(23, 3);

// Bars 24-30 (47.060s - 60.500s): 脆爽拍手推进段
for (let bar = 24; bar <= 30; bar++) {
  if (bar === 25 || bar === 27 || bar === 29) hold(bar, 0, 2);
  else if (bar === 30) { tap(bar, 0); tap(bar, 1); tap(bar, 2); } // 蓄力进大副歌
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 31-40 (60.500s - 79.700s): 最终大副歌
for (let bar = 31; bar <= 40; bar++) {
  if (bar === 32 || bar === 34 || bar === 36 || bar === 38 || bar === 40) hold(bar, 0, 2);
  else if (bar === 33 || bar === 37) { tap(bar, 0); tap(bar, 1); tap(bar, 2); }
  else { tap(bar, 0); tap(bar, 2); }
}

// Bars 41-47 (79.700s - 93.140s): 柔缓闪耀尾奏
for (let bar = 41; bar <= 47; bar++) {
  if (bar === 41 || bar === 43 || bar === 45) hold(bar, 0, 2);
  else { tap(bar, 0); tap(bar, 2); }
}

// Bar 48 (93.140s - 95.060s): 终曲长音收尾
hold(48, 0, 3);

const CHART = raw.map(([beat, dur]) => {
  const at = +(BEAT_OFFSET + beat * BEAT_SEC).toFixed(4);
  return dur === null
    ? { at, move: 'poke' }
    : { at, until: +(at + dur * BEAT_SEC).toFixed(4), move: 'single' };
});

/** 一首歌 = 音频 + 节拍网格 + 谱面。音游引擎只认这个结构，换歌换谱只需新写一个文件 */
export default {
  url: SONG_URL,
  title: SONG_TITLE,
  credit: SONG_CREDIT,
  beatSec: BEAT_SEC,
  beatOffset: BEAT_OFFSET,
  end: SONG_END,
  notes: CHART,
};
