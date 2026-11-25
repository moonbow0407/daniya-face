import * as THREE from 'three';
import { MMDLoader } from 'three/examples/jsm/loaders/MMDLoader.js';
import { MMDAnimationHelper } from 'three/examples/jsm/animation/MMDAnimationHelper.js';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { PT, toRef, vecToRef, uniforms, patchMaterial, addCheekMobility, PokeField, BlinkRhythm, CheekSpring } from './cheekRig.js';
import { FaceHit } from './faceHit.js';
import { Sfx } from './sfx.js';
import { createRhythm } from './rhythm.js';
import { makeMorphsRelative, UvMorphs, setupSymbol, symbolUniforms, symbolCenter } from './emotes.js';

import hairRest from './hairRest.json';

const MODEL_URL = '/models/daniya_red/daniya_red.pmx';
const BAKE = new URLSearchParams(location.search).has('bake');
const { clamp, smoothstep, damp, lerp } = THREE.MathUtils;

// 拉扯上限（相对脸宽），与参考站一致
const PULL_SINGLE = 0.075;
const PULL_DOUBLE = 0.048;
const CUP_PUSH = 0.035;
const PULL_RHYTHM = 0.12; // 音游里的长按拉得开一些，参考站同款
const RHYTHM_HOLD_RAW = 0.115; // 音游长按不拖动时的基础拉力（经橡皮筋映射后约 82% 上限）

// ---------- 加载界面 ----------
const app = document.querySelector('#app');
const loaderEl = document.querySelector('#loader');
const loaderFill = document.querySelector('#loader-fill');
const loaderPct = document.querySelector('#loader-pct');
const loaderLabel = document.querySelector('#loader-label');
const progress = { pmx: 0, tex: 0, prep: 0, shown: 0 };
function progressTarget() {
  return progress.pmx * 0.55 + progress.tex * 0.35 + progress.prep * 0.1;
}
// 进度条只往前走、平滑追赶，不会一顿一顿地跳
(function tickLoader() {
  if (app.dataset.state === 'ready') return;
  progress.shown += (progressTarget() - progress.shown) * 0.12;
  const p = Math.min(progress.shown, 0.999);
  loaderFill.style.transform = `scaleX(${p})`;
  loaderPct.textContent = `${Math.floor(p * 100)}%`;
  requestAnimationFrame(tickLoader);
})();

// ---------- 渲染器 / 场景 ----------
const stage = document.querySelector('#stage');
const maxDpr = () => (window.innerWidth < 768 ? 1.5 : 2);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr()));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  console.warn('[webgl] context lost');
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(22, 1, 0.5, 200);

scene.add(new THREE.AmbientLight(0xffffff, 1.55));
const key = new THREE.DirectionalLight(0xfff4f0, 2.3);
key.position.set(-3, 8, 10);
scene.add(key);

const outline = new OutlineEffect(renderer, { defaultThickness: 0.0028, defaultColor: [0.22, 0.12, 0.14], defaultAlpha: 0.9 });

// ---------- 镜头与缩放 ----------
// zoom: 0 = 半身全景，1 = 脸部特写；默认稍微靠近上半身
const zoom = { target: 0.32, current: 0.32 };
const ZOOM_MIN = 0, ZOOM_MAX = 1;
const framing = { wide: { d: 17, y: 16.45 }, close: { d: 5.4, y: 16.78 } };

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr())); // 拖到另一块屏幕时 DPR 会变
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const portrait = camera.aspect < 0.8;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // 全景：横屏保证胸口到头顶，竖屏保证脸和肩宽；特写：脸占满画面
  const needH = 6.4, needW = portrait ? 3.1 : 4.6;
  const dH = needH / 2 / tanV;
  const dW = needW / 2 / (tanV * camera.aspect);
  framing.wide.d = portrait ? dW : Math.max(dH, dW);
  framing.wide.y = portrait ? 16.2 : 16.45;
  framing.close.d = Math.max(1.9 / 2 / tanV, 1.7 / 2 / (tanV * camera.aspect));
  camera.updateProjectionMatrix();
  applyCamera();
}
function applyCamera() {
  const t = smoothstep(zoom.current, 0, 1);
  const d = lerp(framing.wide.d, framing.close.d, t);
  const y = lerp(framing.wide.y, framing.close.y, t);
  camera.position.set(0, y + 0.25 * (1 - t) + 0.05 * t, d);
  camera.lookAt(0, y, 0);
  camera.updateMatrixWorld();
}
window.addEventListener('resize', resize);
resize();

// 滚轮 / 触控板双指（ctrl+wheel）缩放
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = e.ctrlKey ? 0.012 : 0.0016;
  zoom.target = clamp(zoom.target - e.deltaY * k, ZOOM_MIN, ZOOM_MAX);
}, { passive: false });

// ---------- 加载模型 ----------
const manager = new THREE.LoadingManager();
// 模型里贴图路径大小写、斜杠混用（TEX/Tex/tex、反斜杠），统一成 tex/
manager.setURLModifier((url) => url.replace(/\\/g, '/').replace(/\/(TEX|Tex)\//, '/tex/'));
manager.onProgress = (url, loaded, total) => { if (!url.endsWith('.pmx')) progress.tex = loaded / total; };
const texturesReady = new Promise((resolve) => { manager.onLoad = resolve; });

// 物理引擎只在加载时用一次（给头发"预烘焙"自然垂落的姿势），动态加载、与模型并行
function loadAmmo() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/ammo/ammo.wasm.js';
    s.onload = () => window.Ammo().then((lib) => { window.Ammo = lib; resolve(); }, reject);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// 只保留实际用到的顶点表情，过滤掉 ~175 个冗余 morph，可将移动端 WebGL 显存与内存占用降低约 85%（~330MB → ~49MB）
const USED_MORPHS = new Set([
  'まばたき', '下', '上', '口横狭め', '口角下げ', '口前', '∧', 'びっくり',
  '困る', 'じと目', '笑い', '口角上げ', 'hehe', '左口横広げ', '右口横広げ',
  'ウィンク', 'ぺろっ', 'にこり', '照れ', 'なごみR', 'なごみL',
  '右口角上げ', '左口角上げ', '左困る', '右困る', '(○｀ε´○)', '真面目', '▲',
  'emo3右', 'emo3左', 'emo3上',
]);

function loadModel() {
  return new Promise((resolve, reject) => {
    const loader = new MMDLoader(manager);
    // 自己拿到解析数据：UV 表情（漫画符号）需要它，MMDLoader 本身不支持
    loader.loadPMX(MODEL_URL, (data) => {
      try {
        const uvMorphData = data.morphs.filter((m) => m.type === 3);
        data.morphs = data.morphs.filter((m) => m.type === 1 && USED_MORPHS.has(m.name));
        data.metadata.morphCount = data.morphs.length;
        const mesh = loader.meshBuilder.setCrossOrigin(loader.crossOrigin).build(data, THREE.LoaderUtils.extractUrlBase(MODEL_URL));
        resolve({ mesh, uvMorphData });
      } catch (err) { reject(err); }
    }, (e) => { progress.pmx = Math.min(1, e.loaded / (e.total || 12_400_000)); }, reject);
  });
}

let mesh, uvMorphData;
try {
  [{ mesh, uvMorphData }] = await Promise.all([loadModel(), BAKE ? loadAmmo() : null]);
  progress.pmx = 1;
  loaderLabel.textContent = '正在铺贴图…';
  await texturesReady;
  progress.tex = 1;
} catch (err) {
  console.error(err);
  loaderLabel.textContent = '加载失败，请刷新重试';
  throw err;
}
loaderLabel.textContent = '达妮娅整理发型中…';

scene.add(mesh);
mesh.frustumCulled = false;

const geo = mesh.geometry;
makeMorphsRelative(geo);
const uvMorphs = new UvMorphs(geo, uvMorphData);

// 漫画符号（汗滴等）贴片：淡入淡出
const symbolMat = mesh.material.find((m) => m.name === 'emo3');
setupSymbol(symbolMat);

// 脸部皮肤：拉 + 戳 + 泛红；口腔/舌头：只跟随戳。其它（眼睛、头发）一律不动
addCheekMobility(geo);
for (const m of mesh.material) {
  if (m.name === 'face1' || m.name === 'Cheek') patchMaterial(m, 'face');
  else if (m.name === 'kou1' || m.name === 'she1') patchMaterial(m, 'mouth');
  // 描边走的是独立着色器，不会跟着脸颊变形 → 脸部和贴纸不画描边
  if (['face1', 'Cheek', 'kou1', 'she1', 'emo1', 'emo3'].includes(m.name) && m.userData.outlineParameters) m.userData.outlineParameters.visible = false;
}
const faceHit = new FaceHit(mesh, ['face1']);

/*
 * 音游的"脸颊点"（参考站同款）：右脸颊上离 (0.47, 17.15, 0.34)（参考坐标）最近的皮肤顶点。
 * 音游轨道从这里出发；音游中点屏幕任何位置，都当成戳/拉这个点——不用瞄准脸。
 */
const rhythmVertex = (() => {
  const pos = geo.attributes.position;
  const mi = mesh.material.findIndex((m) => m.name === 'face1');
  const want = new THREE.Vector3(0.47 * 0.89, 17.15 - 0.49, 0.34 + 0.02);
  const v = new THREE.Vector3();
  let best = -1, bestD = Infinity;
  for (const g of geo.groups) {
    if (g.materialIndex !== mi) continue;
    for (let i = g.start; i < g.start + g.count; i++) {
      const k = geo.index.getX(i);
      v.fromBufferAttribute(pos, k);
      if (v.x <= 0) continue;
      const d = v.distanceToSquared(want);
      if (d < bestD) { bestD = d; best = k; }
    }
  }
  return best;
})();
const _rv = new THREE.Vector3();
/** 脸颊点当前的世界坐标（含骨骼、表情） */
function rhythmPoint() {
  return mesh.localToWorld(mesh.getVertexPosition(rhythmVertex, _rv));
}
function rhythmHit() {
  const local = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, rhythmVertex);
  return { point: rhythmPoint().clone(), local, ref: toRef(local) };
}

// ---------- 骨骼与基础姿势 ----------
const bone = Object.fromEntries(mesh.skeleton.bones.map((b) => [b.name, b]));
const rot = (name, x, y, z) => {
  const b = bone[name];
  if (b) b.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ')));
};
// 模型是 A 字型，改成双臂自然下垂
rot('左腕', 0, 0, -0.62);
rot('右腕', 0, 0, 0.62);
rot('左ひじ', 0, -0.25, 0);
rot('右ひじ', 0, 0.25, 0);
mesh.updateMatrixWorld(true);

let rest = mesh.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
function resetPose() {
  const bs = mesh.skeleton.bones;
  for (let i = 0; i < bs.length; i++) { bs[i].position.copy(rest[i].p); bs[i].quaternion.copy(rest[i].q); }
}
const headBone = bone['頭'], neckBone = bone['首'];
const restHeadWorld = headBone.getWorldQuaternion(new THREE.Quaternion());

/*
 * 头发静止姿势：模型原始姿势里有几缕发梢插在脸颊里，本来靠物理碰撞推出去。
 * 开发时用 ?bake 跑一次物理，让头发、袖子在重力和碰撞下自然落定，导出成 hairRest.json；
 * 正式页面直接套用这份姿势、不开物理——不穿模、不会自己飘，也不用下载物理引擎。
 * helper 只负责 IK 与付与骨（眼睛、肩膀等联动）。
 */
const helper = new MMDAnimationHelper();
if (BAKE) {
  helper.add(mesh, { physics: true, warmup: 0, unitStep: 1 / 65, maxStepNum: 3 });
  const before = mesh.skeleton.bones.map((b) => b.quaternion.clone());
  for (let i = 0; i < 240; i++) {
    resetPose();
    helper.update(1 / 60);
    if (i % 20 === 19) { progress.prep = (0.6 * (i + 1)) / 240; await new Promise((r) => requestAnimationFrame(r)); }
  }
  const out = {};
  mesh.skeleton.bones.forEach((b, i) => {
    if (b.quaternion.angleTo(before[i]) < 1e-4) return;
    out[b.name] = [...b.quaternion.toArray(), ...b.position.toArray()].map((v) => +v.toFixed(6));
  });
  window.__bakedHairRest = JSON.stringify(out);
  console.info(`[bake] ${Object.keys(out).length} 根骨骼，复制 window.__bakedHairRest 存为 src/hairRest.json`);
  helper.enable('physics', false);
} else {
  helper.add(mesh, { physics: false });
  for (const [name, v] of Object.entries(hairRest)) {
    const b = bone[name];
    if (!b) continue;
    b.quaternion.fromArray(v, 0);
    b.position.fromArray(v, 4);
  }
}
rest = mesh.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));

// ---------- 表情：目标值 → 平滑跟随 ----------
const dict = mesh.morphTargetDictionary;
const infl = mesh.morphTargetInfluences;
const shown = new Map();
function applyMorphs(targets, dt) {
  for (const k of Object.keys(targets)) if (!shown.has(k)) shown.set(k, 0);
  for (const [k, v] of shown) {
    if (!(k in dict)) continue;
    const t = clamp(targets[k] ?? 0, 0, 1.25);
    // 眨眼直接用曲线；其它表情 ~60ms 跟随，避免跳变
    const next = k === 'まばたき' ? t : damp(v, t, t > v ? 22 : 14, dt);
    shown.set(k, next);
    infl[dict[k]] = next;
  }
}

// ---------- 交互状态 ----------
let mode = 'poke';
const sfx = new Sfx();
const soundBtn = document.getElementById('sound-tool');
function syncSoundBtn() {
  soundBtn.setAttribute('aria-pressed', String(sfx.enabled));
  soundBtn.title = sfx.enabled ? '关闭音效' : '打开音效';
  soundBtn.querySelector('.wave').style.display = sfx.enabled ? '' : 'none';
  soundBtn.querySelector('.mute').style.display = sfx.enabled ? 'none' : '';
}
soundBtn.addEventListener('click', () => {
  sfx.setEnabled(!sfx.enabled);
  sfx.unlock();
  sfx.tick();
  syncSoundBtn();
});
syncSoundBtn();
const toolButtons = [...document.querySelectorAll('.toolbar.right button[data-mode]')];
let modeBeforeRhythm = 'poke';
for (const btn of toolButtons) {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    sfx.unlock();
    if (mode !== btn.dataset.mode) sfx.tick();
    mode = btn.dataset.mode;
    toolButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });
}

const pokes = new PokeField();
const blink = new BlinkRhythm();
blink.onTick = (second) => sfx.blinkTick(second);

// ---------- 音游 ----------
// 轨道起点：右脸颊外侧（画面右侧）。绑定姿态坐标 → 跟着头动 → 投影到屏幕
mesh.updateMatrixWorld(true);
const _anchor = new THREE.Vector3();
const rhythm = createRhythm({
  root: app,
  button: document.getElementById('rhythm-tool'),
  anchor() {
    _anchor.copy(rhythmPoint()).project(camera);
    const r = stage.getBoundingClientRect();
    return { x: r.left + ((_anchor.x + 1) / 2) * r.width, y: r.top + ((1 - _anchor.y) / 2) * r.height };
  },
  sfx,
  onToggle(on) {
    endHold(false);
    sfx.quiet = on; // 音游进行中关闭常规揉捏音效，改由音游打击反馈出声
    if (on) { modeBeforeRhythm = mode; mode = 'off'; } else mode = modeBeforeRhythm;
  },
  onHoldBroken() { endHold(false); },
});

const grab = uniforms.uGrab.value;   // 抓取中心（参考坐标）
const delta = uniforms.uDelta.value; // 当前拉扯位移（参考坐标）
const target = new THREE.Vector3();  // 指针对应的目标位移
const vel = new THREE.Vector3();
let pullSides = 0;                   // 1 单手 / 2 双手（松手后保留，用于回弹）
let holdId = null;                   // 正在拉的指针
let pulling = false;                 // 已经真正拉动过
let egg = null;                      // 本次拉扯是否触发彩蛋表情
let holdStart = null;
const pressPx = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const dragStart = new THREE.Vector3();

// 回弹后的脸颊抖动
let jiggleArmed = false, jiggleAmp = 0, jiggleT = Infinity, jiggleL = false, jiggleR = false;
const releaseDir = new THREE.Vector3();

// 表情状态
let pullAmount = 0;          // 平滑后的拉扯程度 0..1
let pokeUntil = -Infinity;   // 戳完 550ms 内是"被戳"表情
let cupHeld = false;         // 正在捧脸
let cupAmount = 0;           // 捧脸程度 0..1（平滑）
const cheekSpring = new CheekSpring();
let cupTime = 0;             // 本次捧脸已经捧了多久（秒）
let rubInput = 0;            // 这一帧揉脸移动的像素
let rubLevel = 0;            // 揉脸的快慢 0..1（平滑）
let rubEnergy = 0;           // 揉脸累积，攒满就晕
let dizzyUntil = -Infinity;  // 揉晕的表情持续到
let afterglow = 0;           // 捧完松手后"嘿嘿"笑的余韵 0..1
const lastRubPx = new THREE.Vector2();
let sulkPuffed = false;      // 本次生闷气已经"噗"过
let pokeFace = 0;            // 被戳表情的进度
let sulkGate = 0;            // 松手后才允许生闷气
const blushHold = { x: 0, y: 0 };
let pullLean = 0, motionTime = 0;
let shyAmt = 0, enjoyAmt = 0, dizzyAmt = 0;
const debug = { morphs: null, egg: null }; // 调试：直接指定表情/符号

/*
 * 拉脸彩蛋：大多数时候是弯眼笑；偶尔（EGG_CHANCE）换成"无奈苦笑 + 汗滴"。
 * 想加别的彩蛋，往 EGGS 里加一项即可：symbol = UV 表情名，morphs = 叠加的表情，
 * spot = 符号用哪个预设位置（emo3右 = 画面左侧，emo3左 = 头右侧发饰旁，emo3上 = 头顶），
 * at / scale = 再挪到哪里、缩放多少（绑定姿态坐标；脸颊外缘约 x=±0.62, y=16.6）。
 */
const EGG_CHANCE = 0.3;
const SYM_BLUE = [0.24, 0.50, 0.84];
const EGGS = [
  {
    symbol: 'handi', spot: 'emo3右', at: [0.8, 16.82, 0.72], scale: 0.52,
    morphs: { 困る: 0.75, じと目: 0.45, 口角下げ: 0.15 },
  },
];
for (const e of EGGS) e.from = symbolCenter(mesh, 'emo3', e.spot);
const SYMBOL_SPOTS = ['emo3右', 'emo3左', 'emo3上'];
// 揉脸揉晕了：乱线 + 晕乎乎的表情
const DIZZY = {
  symbol: 'luanma', spot: 'emo3右', at: [0.82, 16.86, 0.72], scale: 0.5, tint: [0.42, 0.38, 0.55],
  morphs: { 困る: 0.8, 笑い: 0.55, '▲': 0.6 },
};
DIZZY.from = symbolCenter(mesh, 'emo3', DIZZY.spot);
const eyeBones = [bone['右目'], bone['左目']].filter(Boolean);
let eggFade = 0;             // 彩蛋表情的进度 0..1
let shownEgg = null;         // 正在显示（含淡出）的彩蛋

// ---------- 指针 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function rayFrom(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}

const _q = new THREE.Quaternion();
/** 世界中的位移 → 绑定姿态（去掉头部当前的旋转） */
function worldDeltaToBind(v) {
  headBone.getWorldQuaternion(_q).invert().premultiply(restHeadWorld);
  return v.applyQuaternion(_q);
}

function hitFace(e) {
  const hit = faceHit.raycast(rayFrom(e));
  if (!hit) return null;
  const ref = toRef(hit.local);
  // 只接受脸颊附近（参考站的有效区域）
  if (Math.abs(ref.x) > 1.13 || ref.y < 16.65 || ref.y > 17.46 || ref.z < -0.09) return null;
  return { ...hit, ref };
}

// 双指捏合缩放（手机）
const touches = new Map();
let pinchStart = null;
function pinchDistance() {
  const [a, b] = [...touches.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

stage.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2 && holdId === null) { pinchStart = { d: pinchDistance(), z: zoom.target }; return; }
  }
  if (!e.isPrimary || e.button !== 0 || holdId !== null || pinchStart) return;
  sfx.unlock();
  // 音游中不看点在哪，统一作用在右脸颊（参考站同款）
  const hit = rhythm.active ? rhythmHit() : hitFace(e);
  if (!hit) return;
  e.preventDefault();
  const { x, y, z } = hit.ref;

  let act = mode;
  if (rhythm.active) {
    // 音游：按下是否对上音符，决定这一下是"戳"还是"拉住"；没对上就只轻轻碰一下
    if (!rhythm.playing) return;
    act = rhythm.press(e);
    if (act !== 'single') touchRing(e);
    if (!act) { pokes.tap(hit.ref.clone(), 0.55); return; }
  }

  if (act === 'poke') {
    if (Math.abs(x) < 0.16 && !rhythm.active) return; // 鼻梁正中不算
    pokeUntil = performance.now() + 550;
    pokes.tap(new THREE.Vector3((Math.sign(x) || 1) * clamp(Math.abs(x), 0.3, 0.82), clamp(y, 16.87, 17.3), z), rhythm.active ? 1.5 : 1);
    sfx.poke(x < 0 ? -1 : 1); // x<0 是角色右脸 = 画面左侧
    return;
  }
  if (act !== 'single' && act !== 'double' && act !== 'cup') return;

  holdId = e.pointerId;
  pullSides = act === 'cup' ? 0 : act === 'single' ? 1 : 2;
  cupHeld = act === 'cup';
  if (cupHeld) { sfx.cupPress(); cupTime = 0; rubEnergy = 0; rubLevel = 0; lastRubPx.set(e.clientX, e.clientY); }
  jiggleArmed = false;
  // 音游里的长按：一按下就算在拉（不等拖动），也不出彩蛋；清掉上一记戳脸的残留表情
  pulling = rhythm.active; egg = null;
  if (rhythm.active) pokeUntil = -Infinity;
  try { stage.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
  pressPx.set(e.clientX, e.clientY);
  // 拉脸：抓取点固定在脸颊肉上，只取高度；捧脸：就在按下的位置轻推
  if (cupHeld) grab.set(x, y, z);
  else grab.set(x < 0 ? -0.55 : 0.55, clamp(y, 16.88, 17), 0.24);
  if (!rhythm.active) { delta.set(0, 0, 0); vel.set(0, 0, 0); }
  // 音游长按即使原地按住不拖动，也自动向外拉开脸颊，触发表情与回弹
  if (rhythm.active) target.set(Math.sign(grab.x) * PT * PULL_RHYTHM * Math.tanh(RHYTHM_HOLD_RAW / 0.1), 0, 0);
  else target.set(0, 0, 0);
  camera.getWorldDirection(dragPlane.normal);
  dragPlane.setFromNormalAndCoplanarPoint(dragPlane.normal, hit.point);
  dragStart.copy(hit.point);
  // 音游里手指不在脸上：拖动从手指按下的位置算起（参考站同款）
  if (rhythm.active) rayFrom(e).intersectPlane(dragPlane, dragStart);
  stage.dataset.cursor = 'grabbing';
});

const _p = new THREE.Vector3();
stage.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchStart && touches.size === 2) {
      zoom.target = clamp(pinchStart.z + Math.log2(pinchDistance() / pinchStart.d) * 0.7, ZOOM_MIN, ZOOM_MAX);
      return;
    }
  }
  if (e.pointerType === 'mouse') hoverEvent = e;
  if (e.pointerId !== holdId) return;
  if (rhythm.active) rhythm.drag(e);
  if (!rayFrom(e).intersectPlane(dragPlane, _p)) return;
  vecToRef(worldDeltaToBind(_p.sub(dragStart)), target);
  if (cupHeld) {
    // 捧着脸时拖动 = 揉脸：脸颊跟着手轻轻推，揉得越快越"揉"
    const moved = Math.hypot(e.clientX - lastRubPx.x, e.clientY - lastRubPx.y);
    lastRubPx.set(e.clientX, e.clientY);
    rubInput += moved;
    target.y *= 0.55;
    const a = target.length(), limit = PT * CUP_PUSH;
    if (a > 0) target.multiplyScalar((limit * Math.tanh(a / (PT * 0.14))) / a);
    return;
  }
  const px = Math.hypot(e.clientX - pressPx.x, e.clientY - pressPx.y);
  const s = Math.sign(grab.x);
  if (rhythm.active) target.x = s * Math.abs(target.x); // 音游里往哪边拖都算拉开
  const out = s * target.x;
  if (out < -Math.abs(target.y)) { target.set(0, 0, 0); return; } // 往里推不算
  target.x = s * Math.max(0, out);
  target.z = Math.max(0, target.z);
  target.y *= rhythm.active ? 1.12 : 0.65;
  if (rhythm.active) target.x += s * Math.abs(target.y) * 0.36;
  target.multiplyScalar(smoothstep(px, 3, 8)); // 几像素的死区，防手抖
  if (rhythm.active) target.x += s * PT * RHYTHM_HOLD_RAW; // 音游长按叠加基础自动拉力，避免微抖把目标清零
  const a = target.length();
  const limit = PT * pullLimit();
  if (a > 1e-4 && !pulling) {
    pulling = true;
    egg = Math.random() < EGG_CHANCE ? EGGS[Math.floor(Math.random() * EGGS.length)] : null;
    if (egg) sfx.drip(0.16);
  }
  if (a > 0) target.multiplyScalar((limit * Math.tanh(a / (PT * (rhythm.active ? 0.1 : 0.115)))) / a); // 橡皮筋
});

function pullLimit() {
  return pullSides === 2 ? PULL_DOUBLE : rhythm.active ? PULL_RHYTHM : PULL_SINGLE;
}

/** 结束按住（松手，或音游里长按被判失败时强制结束）。ok = 正常抬起 */
function endHold(ok, ts = performance.now()) {
  if (holdId === null) return;
  const id = holdId;
  holdId = null;
  keyHoldCode = null;
  if (rhythm.active) rhythm.release(ok, ts);
  try { if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id); } catch { /* 合成事件 */ }
  if (cupHeld) {
    if (ok) sfx.cupRelease();
    sfx.cupRub(0);
    // 捧了一会儿再松手：嘿嘿地笑一下
    if (cupTime > 0.6 && dizzyUntil < performance.now()) afterglow = 1;
    if (dizzyUntil > performance.now()) dizzyUntil = performance.now() + 1100;
  }
  cupHeld = false;
  stage.dataset.cursor = '';
  if (pullSides) sfx.pullRelease(ok);
  if (ok && pulling && pullSides) {
    // 准备松手后的抖动；轻轻一拉就松手时，额外给一个"弹"的冲量
    const v = delta.lengthSq() > target.lengthSq() ? delta : target;
    const t = v.length() / PT;
    jiggleArmed = t > 0.002;
    releaseDir.copy(v).normalize();
    const n = smoothstep(t, 0, 0.009) * (1 - smoothstep(t, 0.016, 0.052));
    if (n > 0) {
      const r = 0.72 * PT * n;
      vel.addScaledVector(releaseDir, Math.min(0, -r - vel.dot(releaseDir)));
    }
  }
  holdStart = null; pulling = false; egg = null;
  target.set(0, 0, 0);
}

function release(e) {
  if (touches.delete(e.pointerId) && touches.size < 2) pinchStart = null;
  if (e.pointerId !== holdId) return;
  endHold(e.type === 'pointerup', e.timeStamp);
}

/** 音游点击时的小圆圈反馈 */
function touchRing(e) {
  const ring = document.createElement('i');
  ring.className = 'rhythm-touch';
  ring.style.left = `${e.clientX}px`;
  ring.style.top = `${e.clientY}px`;
  app.append(ring);
  ring.animate([{ opacity: 0.9, transform: 'scale(.55)' }, { opacity: 0, transform: 'scale(1.55)' }], { duration: 210, easing: 'ease-out' }).onfinish = () => ring.remove();
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, release);

// 音游键盘支持：空格 / D / F / J / K 均可点按与长按
const RHYTHM_KEYS = new Set(['Space', 'KeyD', 'KeyF', 'KeyJ', 'KeyK']);
let keyHoldCode = null;
window.addEventListener('keydown', (e) => {
  if (!rhythm.active || !rhythm.playing || e.repeat || !RHYTHM_KEYS.has(e.code)) return;
  if (holdId !== null) return;
  e.preventDefault();
  sfx.ensureContext();
  const hit = rhythmHit();
  const { x, y, z } = hit.ref;
  const act = rhythm.press(e);
  if (!act) { pokes.tap(hit.ref.clone(), 0.55); return; }
  if (act === 'poke') {
    pokeUntil = performance.now() + 550;
    pokes.tap(new THREE.Vector3((Math.sign(x) || 1) * clamp(Math.abs(x), 0.3, 0.82), clamp(y, 16.87, 17.3), z), 1.5);
    return;
  }
  keyHoldCode = e.code;
  holdId = 'key';
  pullSides = 1;
  cupHeld = false;
  jiggleArmed = false;
  pulling = true; egg = null;
  pokeUntil = -Infinity;
  grab.set(x < 0 ? -0.55 : 0.55, clamp(y, 16.88, 17), 0.24);
  target.set(Math.sign(grab.x) * PT * PULL_RHYTHM * Math.tanh(RHYTHM_HOLD_RAW / 0.1), 0, 0);
});
window.addEventListener('keyup', (e) => {
  if (keyHoldCode && e.code === keyHoldCode) {
    keyHoldCode = null;
    if (holdId === 'key') endHold(true, e.timeStamp);
  }
});

let hoverEvent = null;
function updateHoverCursor() {
  if (!hoverEvent || holdId !== null) return;
  const hit = hitFace(hoverEvent);
  stage.dataset.cursor = rhythm.active ? 'poke' : hit ? (mode === 'poke' ? 'poke' : 'grab') : '';
  hoverEvent = null;
}

// ---------- 每帧 ----------
const _e = new THREE.Euler();
const _rq = new THREE.Quaternion();
const _prev = new THREE.Vector3();

function updatePull(dt, now) {
  const holding = holdId !== null;
  const e = Math.min(dt, 0.033);

  // 拉扯位移的弹簧：按住时跟手，松手后带过冲地弹回
  if (!holding && pullSides) {
    const W = 21, Z = 6.2;
    const R = Math.exp(-Z * e), C = Math.cos(W * e), S = Math.sin(W * e) / W;
    _prev.copy(delta);
    delta.multiplyScalar(R * (C + Z * S)).addScaledVector(vel, R * S);
    vel.multiplyScalar(R * (C - Z * S)).addScaledVector(_prev, -R * (W * W + Z * Z) * S);
    if (jiggleArmed && delta.dot(releaseDir) <= 0) {
      // 弹回中心的一瞬间，脸颊肉再"啵"地抖一下
      jiggleArmed = false;
      jiggleL = pullSides === 2 || grab.x < 0;
      jiggleR = pullSides === 2 || grab.x > 0;
      jiggleAmp = Math.min(1, vel.length() / (PT * 0.85));
      jiggleT = 0;
    }
  } else {
    const k = holding ? 180 : 65;
    vel.addScaledVector(_prev.copy(target).sub(delta), k * e).multiplyScalar(Math.exp(-(holding ? 20 : 10) * e));
    delta.addScaledVector(vel, e);
  }
  if (pullSides) {
    const f = holding ? 0 : -0.56;
    if (delta.x * grab.x < 0) { delta.x *= f; vel.x *= f; }
    if (delta.z < 0) { delta.z *= f; vel.z *= f; }
  }
  delta.clampLength(0, PT * (pullSides === 0 ? CUP_PUSH : pullLimit()));
  uniforms.uPullSides.value = pullSides;
  // 捧脸：脸颊被托起的弹簧 + 整体程度
  uniforms.uCheekSpring.value = cheekSpring.update(e, cupHeld);
  cupAmount = damp(cupAmount, cupHeld ? 1 : 0, cupHeld ? 12 : 10, dt);
  // 捧脸的阶段：刚捧住（惊讶）→ 害羞 → 享受；按住画圈揉，揉够了会晕
  if (cupHeld) cupTime += dt;
  const rubSpeed = rubInput / Math.max(dt, 1e-3); // 像素/秒
  rubInput = 0;
  rubLevel = damp(rubLevel, cupHeld ? clamp(rubSpeed / 600, 0, 1) : 0, rubSpeed > 0 ? 10 : 5, dt);
  if (cupHeld) rubEnergy = Math.max(0, rubEnergy + (rubLevel > 0.25 ? rubLevel : -0.6) * dt);
  if (cupHeld && rubEnergy > 1.2 && dizzyUntil < now) { dizzyUntil = Infinity; sfx.dizzy(); }
  sfx.cupRub(cupHeld ? rubLevel : 0);
  afterglow = Math.max(0, afterglow - dt / 1.2);

  jiggleT += dt;
  const w = jiggleT < 1 ? jiggleAmp * Math.exp(-5.6 * jiggleT) * Math.sin(24 * jiggleT) : 0;
  uniforms.uCheekJiggle.value.set(jiggleL ? w : 0, jiggleR ? w : 0);

  // 拉扯程度 → 表情强度
  const limit = pullLimit();
  const r = holding && pullSides ? smoothstep(delta.length() / PT, 0.004, limit) : 0;
  // 拉住超过 0.75 秒，被拉的那侧慢慢红起来；松手后 1.4 秒才开始褪
  const active = holding && pullSides && r > 0.035;
  if (active) holdStart ??= now; else holdStart = null;
  if (holding && pullSides && !rhythm.active) sfx.pullMove(r, target.y / (PT * limit), dt);
  const warm = holdStart === null ? 0 : smoothstep(now - holdStart, 750, 1650) * smoothstep(r, 0.035, 0.55);
  const pulledSide = grab.x < 0 ? 'x' : 'y';
  for (const s of ['x', 'y']) {
    const on = active && (pullSides === 2 || s === pulledSide);
    const cur = uniforms.uPullBlush.value[s];
    if (on && warm > 0) blushHold[s] = now + 1400;
    if (on && warm > cur) { uniforms.uBlushHeight.value[s] = grab.y; uniforms.uPullBlush.value[s] = damp(cur, warm, 9, dt); }
    else if (now >= blushHold[s]) uniforms.uPullBlush.value[s] = damp(cur, 0, 0.9, dt);
  }
  pullAmount = damp(pullAmount, r, holding ? (rhythm.active ? 28 : 22) : 14, dt);
  return r;
}

function updateFace(dt, now, r) {
  const holding = holdId !== null;
  const h = pullAmount;
  const poked = now < pokeUntil;
  pokeFace = clamp(pokeFace + ((poked ? 1 : -1) * dt) / (poked ? 0.09 : 0.3), 0, 1);
  const pf = smoothstep(pokeFace, 0, 1);
  sulkGate = damp(sulkGate, holding || poked ? 0 : 1, 15, dt);
  const blushLevel = Math.max(uniforms.uPullBlush.value.x, uniforms.uPullBlush.value.y);
  // 拉久了松手：脸还红着，就有点生闷气
  const sulk = sulkGate * smoothstep(blushLevel, 0.015, 0.7) * (1 - h) * (1 - pokeFace);
  if (sulk > 0.8 && !sulkPuffed) { sulkPuffed = true; sfx.puff(); }
  else if (sulk < 0.08) sulkPuffed = false;
  // 揉晕：松手后还晕一小会儿
  if (dizzyUntil > now) egg = DIZZY; else if (egg === DIZZY) egg = null;
  // 彩蛋：拉的时候淡入，松手后淡出
  if (egg) shownEgg = egg;
  if (debug.egg) { debug.egg.from ??= symbolCenter(mesh, 'emo3', debug.egg.spot); egg = shownEgg = debug.egg; }
  eggFade = damp(eggFade, egg && (h > 0.015 || debug.egg || egg === DIZZY) ? 1 : 0, egg ? 12 : 7, dt);
  if (!egg && eggFade < 0.005) shownEgg = null;
  const ef = shownEgg ? eggFade : 0;

  // 捧脸各阶段的程度（平滑过渡）
  shyAmt = damp(shyAmt, cupHeld ? smoothstep(cupTime, 0.5, 1.6) : 0, 6, dt);
  enjoyAmt = damp(enjoyAmt, cupHeld ? smoothstep(cupTime, 2.0, 3.2) : 0, cupHeld ? 3 : 8, dt);
  dizzyAmt = damp(dizzyAmt, dizzyUntil > now ? 1 : 0, 6, dt);
  const calm = (1 - enjoyAmt) * (1 - dizzyAmt);
  const ag = smoothstep(afterglow, 0, 0.45);

  // 音游长按：采用设计图验证的"眨眼吐舌"（ウィンク + ぺろっ + にこり）+ 淡淡脸红 + 微微歪头
  const rh = rhythm.active ? h : 0;

  // 捧脸 / 拉脸共用的"脸被托住"程度；害羞时更红
  const Es = Math.max(cupAmount, h);
  uniforms.uCup.value = Es * (1 + 0.6 * shyAmt);
  const EsSurprise = Math.max(cupAmount * (1 - 0.75 * shyAmt) * calm, h * (1 - rh)); // 惊讶慢慢褪掉
  const EsMouth = Math.max(cupAmount * (1 - 0.45 * enjoyAmt), h * (1 - rh)); // 音游长按让出嘴型给 ぺろっ，避免挤坏舌头

  // --- 头颈：待机轻微摇摆；被捧着、被拉时低头，单手拉时往被拉的一侧歪一点 ---
  const lean = Math.max(cupAmount, h * 0.55) + 0.2 * sulk;
  const pullLeanTarget = pullSides === 1 ? -Math.sign(grab.x) * r * (rhythm.active ? 1.45 : 1) : 0;
  if (!pulling && !cupHeld) motionTime += dt;
  const u = motionTime;
  pullLean = damp(pullLean, pullLeanTarget, 9, dt);
  const f = 1 - lean;
  // 享受：往手心里靠、轻轻蹭；晕：脑袋小幅画圈
  const ct = now / 1000;
  _e.set(
    (Math.sin(u * 0.63) * 0.022 + Math.sin(u * 0.23) * 0.006) * f - 0.17 * lean + 0.035 * dizzyAmt * Math.sin(now * 0.0052),
    Math.sin(u * 0.39) * 0.043 * f + 0.14 * sulk + 0.035 * enjoyAmt * Math.sin(ct * 0.9),
    Math.sin(u * 0.47 + 0.5) * 0.026 * f + 0.06 * pullLean + enjoyAmt * (0.07 + 0.045 * Math.sin(ct * 1.8)) + 0.045 * dizzyAmt * Math.cos(now * 0.0052),
  );
  headBone.quaternion.multiply(_rq.setFromEuler(_e));
  _e.set(
    Math.sin(u * 0.63 - 0.3) * 0.009 * f - 0.085 * lean,
    Math.sin(u * 0.39 - 0.4) * 0.012 * f,
    Math.sin(u * 0.47) * 0.01 * f + 0.027 * pullLean,
  );
  neckBone.quaternion.multiply(_rq.setFromEuler(_e));

  // --- 眨眼 ---
  const suppressBlink = pulling || rh > 0.05 || pokeFace > 0.02 || enjoyAmt > 0.3 || ag > 0.05;
  let blinkValue;
  if (suppressBlink) { blink.update(dt, false, true); blinkValue = damp(shown.get('まばたき') ?? 0, 0, 40, dt); }
  else blinkValue = blink.update(dt, cupHeld, false); // 被捧着时眨眼更勤、偶尔连眨
  const open = 1 - blinkValue;

  // --- 彩蛋的漫画符号：位置直接到位，靠透明度淡入淡出 ---
  symbolMat.opacity = ef;
  for (const n of uvMorphs.names) uvMorphs.set(n, shownEgg?.symbol === n ? 1 : 0);
  uvMorphs.update();
  for (const s of SYMBOL_SPOTS) infl[dict[s]] = shownEgg?.spot === s ? 1 : 0;
  if (shownEgg) {
    // 出现时从稍高处轻轻滑下来
    symbolUniforms.uSymFrom.value.copy(shownEgg.from);
    symbolUniforms.uSymTo.value.set(shownEgg.at[0], shownEgg.at[1] + 0.07 * (1 - ef), shownEgg.at[2]);
    symbolUniforms.uSymScale.value = shownEgg.scale;
    symbolUniforms.uSymTint.value.set(...(shownEgg.tint ?? SYM_BLUE));
  }

  // --- 表情目标（参考站的配方，换成达妮娅对应的表情名）---
  const m = {};
  const add = (k, v) => { m[k] = (m[k] ?? 0) + v; };
  m['まばたき'] = blinkValue;
  add('下', blinkValue * 0.14);
  // 被托住：嘴被挤成小小的"嘟"，眼睛微微睁大、眉毛轻抬；拉扯时嘴型再被扯开一些
  // （参考站菲比用 1.25 / .65 / .88；达妮娅的嘴型幅度更大，超过 ~0.85 牙齿会从嘴角露出来）
  add('口横狭め', 0.8 * EsMouth * (1 - 0.72 * h));
  add('口角下げ', 0.45 * EsMouth * (1 - 0.93 * h) * (1 - enjoyAmt));
  add('口前', 0.5 * EsMouth * (1 - 0.5 * h));
  add('∧', 0.3 * EsSurprise * (1 - h));
  add('びっくり', 0.57 * EsSurprise * (1 - h));
  add('上', 0.1 * EsSurprise * (1 - h));
  // 害羞：眉毛微微皱起、眼皮垂一点、眼神躲开；享受：眯眼笑；松手后：嘿嘿
  const shyFace = shyAmt * calm;
  add('困る', 0.3 * shyFace);
  add('じと目', 0.2 * shyFace * open);
  add('笑い', 0.9 * enjoyAmt * (1 - dizzyAmt) + ag);
  add('口角上げ', 0.35 * enjoyAmt + 0.3 * ag);
  add('hehe', 0.85 * ag);
  _rq.setFromEuler(_e.set(0.08 * shyFace, -0.22 * shyFace, 0)); // 眼神往旁边、往下躲
  for (const b of eyeBones) b.quaternion.multiply(_rq);
  const left = pullSides === 2 || grab.x >= 0 ? h : 0;
  const right = pullSides === 2 || grab.x < 0 ? h : 0;
  // 音游长按使用干净的"眨眼吐舌"（不叠加口横広げ，避免舌头错位）
  add('左口横広げ', left * 0.54 * (1 - rh));
  add('右口横広げ', right * 0.54 * (1 - rh));
  if (rhythm.active) {
    add('ウィンク', rh * 0.95);
    add('ぺろっ', rh * 0.9);
    add('にこり', rh * 0.45);
    add('照れ', rh * 0.45);
  } else {
    add('笑い', h * (pullSides === 2 ? 1 : 0.9) * (1 - ef));
  }
  if (shownEgg) for (const [k, v] of Object.entries(shownEgg.morphs)) add(k, v * ef);
  // 戳：弯眼笑一下，之后被戳的一侧放松、嘴角上扬
  const [reactR, reactL] = pokes.reactions; // 槽位 0 = x<0 = 右脸
  add('笑い', 0.85 * pf * (1 - rh));
  add('なごみR', reactR * 0.28 * open * (1 - pf) * (1 - rh));
  add('なごみL', reactL * 0.28 * open * (1 - pf) * (1 - rh));
  const [smileR, smileL] = pokes.smiles;
  const smile = Math.max(smileR, smileL);
  add('右口角上げ', (smile * 0.62 + smileR * 0.58 + 0.25 * pf) * (1 - rh));
  add('左口角上げ', (smile * 0.62 + smileL * 0.58 + 0.25 * pf) * (1 - rh));
  const Z = Math.min(1, 0.65 * Math.max(reactR, reactL) + 0.85 * smile);
  add('左困る', left * h * 0.045 + (0.34 * Z + 0.27 * reactL) * 0.35);
  add('右困る', right * h * 0.045 + (0.34 * Z + 0.27 * reactR) * 0.35);
  // 生闷气
  add('口前', 0.65 * sulk);
  add('口角下げ', 0.28 * sulk);
  add('(○｀ε´○)', 0.95 * sulk);
  add('真面目', 0.56 * sulk);
  add('じと目', 0.38 * sulk * open);
  if (debug.morphs) Object.assign(m, debug.morphs);
  applyMorphs(m, dt);
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();
function step(dt) {
  const now = performance.now();
  zoom.current = damp(zoom.current, zoom.target, 9, dt);
  applyCamera();
  pokes.update(dt);
  const r = updatePull(dt, now);
  resetPose();
  updateFace(dt, now, r);
  helper.update(Math.min(dt, 1 / 20));
  rhythm.tick();
}

// 预热：编译着色器、让物理（头发、袖子）稳定下来，再淡入，避免用户看到"搭骨架"的过程
try { await renderer.compileAsync(scene, camera); } catch (err) { console.warn('[webgl] compileAsync fallback:', err); }
for (let i = 0; i < 20; i++) {
  step(1 / 60);
  if (i % 5 === 0) { progress.prep = 0.6 + (0.4 * i) / 20; await new Promise((r) => requestAnimationFrame(r)); }
}
outline.render(scene, camera);
progress.prep = 1;
progress.shown = 1;
loaderFill.style.transform = 'scaleX(1)';
loaderPct.textContent = '100%';
await new Promise((r) => setTimeout(r, 180));
app.dataset.state = 'ready';
clock.getDelta();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  step(dt);
  updateHoverCursor();
  outline.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试用
Object.assign(window, { __daniya: { mesh, camera, uniforms, pokes, bone, zoom, uvMorphs, sfx, debug, renderer, outline, scene, rhythm, hitFace, get state() { return { holdId, pullSides, pulling, mode, delta: delta.length(), target: target.length() / PT }; } } });
