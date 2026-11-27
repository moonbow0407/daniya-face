import * as THREE from 'three';
import { frame, toFrame, vecToFrame, clickMask } from '../rig/faceFrame.js';
import { ZOOM_MIN, ZOOM_MAX } from '../core/stage.js';
import { RHYTHM_HOLD, pullLimit } from './pull.js';

const { clamp, smoothstep } = THREE.MathUtils;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const RHYTHM_KEYS = new Set(['Space', 'KeyD', 'KeyF', 'KeyJ', 'KeyK']);

/**
 * 指针 / 键盘 / 双指缩放输入 → 交互状态。
 * ctx: { app, stage, model, pose, s, pokes, sfx, symbols, rhythm }；rhythm 在创建后才赋值，用时再取。
 */
export function createInput(ctx) {
  const { app, stage, model, pose, s, pokes, sfx, symbols } = ctx;
  const { stageEl, renderer, camera, zoom } = stage;
  const rhythm = () => ctx.rhythm;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function rayFrom(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }

  function hitFace(e) {
    const hit = model.faceHit.raycast(rayFrom(e));
    if (!hit) return null;
    const ref = toFrame(hit.local);
    // 只接受软组织上（和形变用同一个遮罩），太靠边、太靠眼睛的地方不算
    if (clickMask(ref) < 0.3) return null;
    return { ...hit, ref };
  }

  /** 戳一下：沿落点的表面法线按进去；点在眼睛附近时，落点挪到下眼睑下方的脸颊上 */
  function poke({ ref, normal }, strength) {
    const top = frame.pokeFade[0] + 0.04;
    if (ref.y > top) ref = ref.clone().setY(top);
    const now = performance.now();
    s.pokeCombo = now - s.lastPokeAt < 700 ? s.pokeCombo + 1 : 1;
    s.lastPokeAt = now;
    s.roll = Math.random();
    s.pokeUntil = now + 550;
    pokes.tap(ref, normal ?? Z_AXIS, strength);
  }
  /** 拉脸：手指捏住的是一团肉，抓取点往脸颊肉最厚的地方靠 */
  const grabCheek = ({ x, y, z }) => {
    const c = frame.cheek, sx = x < 0 ? -1 : 1;
    s.grab.set(sx * (0.6 * c.x + 0.4 * Math.abs(x)), clamp(0.6 * c.y + 0.4 * y, c.y - 0.12, c.y + 0.1), 0.6 * c.z + 0.4 * z);
  };
  const rhythmHoldTarget = () => s.target.set(Math.sign(s.grab.x) * s.limits.rhythm * RHYTHM_HOLD, 0, 0);

  /** 音游点按的动作（角色配置 actions.rhythm.tap）：'poke' 戳（默认）/ 'single' 单手捏一下；长按总是单手拉住 */
  const rhythmCfg = ctx.cfg.personality.actions.rhythm ?? {};
  const rhythmAct = (act) => (act === 'poke' && rhythmCfg.tap === 'single' ? 'pinch' : act);

  /**
   * 捏一下：不按住，给被捏的一侧一个向外的速度，靠松手的弹簧自己弹回；表情借用戳的短反应（音游里交互音效静音，只有打击音）。
   * 峰值约 0.07 半脸宽：前发那里被顶出去的量不超过 hairAvoid.slack，前发就不会跟着一进一出地闪
   */
  function pinchTap(ref) {
    if (s.holdId !== null) return;
    s.pullSides = 1;
    grabCheek(ref);
    const sx = Math.sign(s.grab.x);
    s.delta.set(0, 0, 0);
    s.vel.set(sx * 1.75, 0, 0);
    s.pokeUntil = performance.now() + 550;
    s.roll = Math.random();
  }

  // 双指捏合缩放（手机）
  const touches = new Map();
  let pinchStart = null;
  const pinchDistance = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  stageEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && s.holdId === null) { pinchStart = { d: pinchDistance(), z: zoom.target }; return; }
    }
    if (!e.isPrimary || e.button !== 0 || s.holdId !== null || pinchStart) return;
    sfx.unlock();
    const rh = rhythm();
    // 音游中不看点在哪，统一作用在音游的脸颊点（右脸）
    const hit = rh.active ? model.rhythmHit() : hitFace(e);
    if (!hit) return;
    e.preventDefault();
    const { x, y, z } = hit.ref;

    let act = s.mode;
    if (rh.active) {
      // 音游：按下是否对上音符，决定这一下是"戳"还是"拉住"；没对上就只轻轻碰一下
      if (!rh.playing) return;
      act = rh.press(e);
      if (act !== 'single') touchRing(e);
      if (!act) { poke(hit, 0.5); return; }
      act = rhythmAct(act);
      if (act === 'pinch') { pinchTap(hit.ref); return; }
    }

    if (act === 'poke') {
      poke(hit, rh.active ? 1.4 : 1);
      sfx.poke(x < 0 ? -1 : 1); // x<0 是角色右脸 = 画面左侧
      return;
    }
    if (act !== 'single' && act !== 'double' && act !== 'cup') return;

    s.holdId = e.pointerId;
    s.roll = Math.random();
    s.pullSides = act === 'cup' ? 0 : act === 'single' ? 1 : 2;
    s.cupHeld = act === 'cup';
    if (s.cupHeld) { sfx.cupPress(); s.cupTime = 0; s.rubEnergy = 0; s.rubLevel = 0; s.lastRubPx.set(e.clientX, e.clientY); }
    // 音游里的长按：一按下就算在拉（不等拖动），也不出彩蛋；清掉上一记戳脸的残留表情
    s.pulling = rh.active; s.egg = null;
    if (rh.active) s.pokeUntil = -Infinity;
    try { stageEl.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
    s.pressPx.set(e.clientX, e.clientY);
    // 捧脸：就在按下的位置轻推
    if (s.cupHeld) s.grab.set(x, y, z); else grabCheek(hit.ref);
    if (!rh.active) { s.delta.set(0, 0, 0); s.vel.set(0, 0, 0); }
    // 音游长按即使原地按住不拖动，也自动向外拉开脸颊，触发表情与回弹
    if (rh.active) rhythmHoldTarget(); else s.target.set(0, 0, 0);
    camera.getWorldDirection(s.dragPlane.normal);
    s.dragPlane.setFromNormalAndCoplanarPoint(s.dragPlane.normal, hit.point);
    s.dragStart.copy(hit.point);
    // 音游里手指不在脸上：拖动从手指按下的位置算起
    if (rh.active) rayFrom(e).intersectPlane(s.dragPlane, s.dragStart);
    stageEl.dataset.cursor = 'grabbing';
  });

  const _p = new THREE.Vector3();
  stageEl.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchStart && touches.size === 2) {
        zoom.target = clamp(pinchStart.z + Math.log2(pinchDistance() / pinchStart.d) * 0.7, ZOOM_MIN, ZOOM_MAX);
        return;
      }
    }
    if (e.pointerType === 'mouse') s.hoverEvent = e;
    if (e.pointerId !== s.holdId) return;
    const rh = rhythm();
    if (rh.active) rh.drag(e);
    if (!rayFrom(e).intersectPlane(s.dragPlane, _p)) return;
    const { target, grab } = s;
    vecToFrame(pose.worldDeltaToBind(_p.sub(s.dragStart)), target);
    if (s.cupHeld) {
      // 捧着脸时拖动 = 揉脸：脸颊跟着手轻轻推，揉得越快越"揉"
      s.rubInput += Math.hypot(e.clientX - s.lastRubPx.x, e.clientY - s.lastRubPx.y);
      s.lastRubPx.set(e.clientX, e.clientY);
      target.y *= 0.55;
      const a = target.length(), limit = s.limits.cup;
      if (a > 0) target.multiplyScalar((limit * Math.tanh(a / (2.5 * limit))) / a);
      return;
    }
    const px = Math.hypot(e.clientX - s.pressPx.x, e.clientY - s.pressPx.y);
    const sx = Math.sign(grab.x);
    if (rh.active) target.x = sx * Math.abs(target.x); // 音游里往哪边拖都算拉开
    const out = sx * target.x;
    if (out < -Math.abs(target.y)) { target.set(0, 0, 0); return; } // 往里推不算
    target.x = sx * Math.max(0, out);
    target.z = Math.max(0, target.z);
    target.y *= rh.active ? 1.12 : 0.65;
    if (rh.active) target.x += sx * Math.abs(target.y) * 0.36;
    target.multiplyScalar(smoothstep(px, 3, 8)); // 几像素的死区，防手抖
    if (rh.active) target.x += sx * 0.7 * s.limits.rhythm; // 音游长按叠加基础自动拉力，避免微抖把目标清零
    const a = target.length();
    const limit = pullLimit(s, rh.active);
    if (a > 1e-4 && !s.pulling) {
      s.pulling = true;
      const { list, chance } = symbols;
      s.egg = list.length && Math.random() < chance ? list[Math.floor(Math.random() * list.length)] : null;
      if (s.egg) sfx.drip(0.16);
    }
    if (a > 0) target.multiplyScalar((limit * Math.tanh(a / ((rh.active ? 0.85 : 1.5) * limit))) / a); // 橡皮筋：越拉越紧，到上限为止
  });

  /** 结束按住（松手，或音游里长按被判失败时强制结束）。ok = 正常抬起 */
  function endHold(ok, ts = performance.now()) {
    if (s.holdId === null) return;
    const id = s.holdId;
    s.holdId = null;
    s.keyHoldCode = null;
    if (rhythm()?.active) rhythm().release(ok, ts);
    try { if (stageEl.hasPointerCapture(id)) stageEl.releasePointerCapture(id); } catch { /* 合成事件 */ }
    if (s.cupHeld) {
      if (ok) sfx.cupRelease();
      sfx.cupRub(0);
      // 捧了一会儿再松手：嘿嘿地笑一下
      const ag = s.behavior.afterglow;
      if (ag && s.cupTime > ag.minHold && s.dizzyUntil < performance.now()) s.afterglow = 1;
      if (s.dizzyUntil > performance.now()) s.dizzyUntil = performance.now() + 1100;
    }
    s.cupHeld = false;
    stageEl.dataset.cursor = '';
    if (s.pullSides) sfx.pullRelease(ok);
    if (ok && s.pulling && s.pullSides) {
      // 轻轻一拉就松手：弹簧本身弹得很小，额外给一点往回的速度，也能"啵"一下
      const d = s.delta.length();
      const n = smoothstep(d, 0, 0.02) * (1 - smoothstep(d, 0.04, 0.1));
      if (n > 0) s.vel.addScaledVector(_p.copy(s.delta).normalize(), -1.6 * n);
    }
    s.holdStart = null; s.pulling = false; s.egg = null;
    s.target.set(0, 0, 0);
  }

  function release(e) {
    if (touches.delete(e.pointerId) && touches.size < 2) pinchStart = null;
    if (e.pointerId !== s.holdId) return;
    endHold(e.type === 'pointerup', e.timeStamp);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stageEl.addEventListener(type, release);

  /** 音游点击时的小圆圈反馈 */
  function touchRing(e) {
    const ring = document.createElement('i');
    ring.className = 'rhythm-touch';
    ring.style.left = `${e.clientX}px`;
    ring.style.top = `${e.clientY}px`;
    app.append(ring);
    ring.animate([{ opacity: 0.9, transform: 'scale(.55)' }, { opacity: 0, transform: 'scale(1.55)' }], { duration: 210, easing: 'ease-out' }).onfinish = () => ring.remove();
  }

  // 音游键盘支持：空格 / D / F / J / K 均可点按与长按
  window.addEventListener('keydown', (e) => {
    const rh = rhythm();
    if (!rh.active || !rh.playing || e.repeat || !RHYTHM_KEYS.has(e.code)) return;
    if (s.holdId !== null) return;
    e.preventDefault();
    sfx.ensureContext();
    const hit = model.rhythmHit();
    const pressed = rh.press(e);
    if (!pressed) { poke(hit, 0.5); return; }
    const act = rhythmAct(pressed);
    if (act === 'poke') { poke(hit, 1.4); return; }
    if (act === 'pinch') { pinchTap(hit.ref); return; }
    s.keyHoldCode = e.code;
    s.holdId = 'key';
    s.pullSides = 1;
    s.cupHeld = false;
    s.pulling = true; s.egg = null;
    s.pokeUntil = -Infinity;
    grabCheek(hit.ref);
    rhythmHoldTarget();
  });
  window.addEventListener('keyup', (e) => {
    if (s.keyHoldCode && e.code === s.keyHoldCode) {
      s.keyHoldCode = null;
      if (s.holdId === 'key') endHold(true, e.timeStamp);
    }
  });

  return {
    endHold,
    hitFace,
    /** 每帧：鼠标悬停在脸上时换光标 */
    updateHoverCursor() {
      if (!s.hoverEvent || s.holdId !== null) return;
      const hit = hitFace(s.hoverEvent);
      stageEl.dataset.cursor = rhythm().active ? 'poke' : hit ? (s.mode === 'poke' ? 'poke' : 'grab') : '';
      s.hoverEvent = null;
    },
  };
}
