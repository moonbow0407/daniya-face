import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';

const { clamp, smoothstep, damp, lerp } = THREE.MathUtils;
export const ZOOM_MIN = 0;
export const ZOOM_MAX = 1;

/**
 * 渲染器、场景、灯光、描边、镜头取景与缩放。
 * zoom: 0 = 半身全景，1 = 脸部特写；取景高度来自角色配置 camera。
 */
export function createStage(stageEl, cam, outlineColor = [0.22, 0.12, 0.14]) {
  const maxDpr = () => (window.innerWidth < 768 ? 1.5 : 2);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr()));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stageEl.appendChild(renderer.domElement);
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

  const outline = new OutlineEffect(renderer, { defaultThickness: 0.0028, defaultColor: outlineColor, defaultAlpha: 0.9 });

  // 默认稍微靠近上半身
  const zoom = { target: 0.32, current: 0.32 };
  const framing = { wide: { d: 17, y: cam.wideY }, close: { d: 5.4, y: cam.closeY } };

  function applyCamera() {
    const t = smoothstep(zoom.current, 0, 1);
    const d = lerp(framing.wide.d, framing.close.d, t);
    const y = lerp(framing.wide.y, framing.close.y, t);
    camera.position.set(0, y + 0.25 * (1 - t) + 0.05 * t, d);
    camera.lookAt(0, y, 0);
    camera.updateMatrixWorld();
  }

  function resize() {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr())); // 拖到另一块屏幕时 DPR 会变
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const portrait = camera.aspect < 0.8;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // 全景：横屏保证胸口到头顶，竖屏保证脸和肩宽；特写：脸占满画面
    const needW = portrait ? cam.wideWidthPortrait : cam.wideWidth;
    const dH = cam.wideHeight / 2 / tanV;
    const dW = needW / 2 / (tanV * camera.aspect);
    framing.wide.d = portrait ? dW : Math.max(dH, dW);
    framing.wide.y = portrait ? cam.wideYPortrait : cam.wideY;
    framing.close.d = Math.max(cam.closeHeight / 2 / tanV, cam.closeWidth / 2 / (tanV * camera.aspect));
    camera.updateProjectionMatrix();
    applyCamera();
  }
  window.addEventListener('resize', resize);
  resize();

  // 滚轮 / 触控板双指（ctrl+wheel）缩放；手机双指捏合在 interaction/input.js
  stageEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.ctrlKey ? 0.012 : 0.0016;
    zoom.target = clamp(zoom.target - e.deltaY * k, ZOOM_MIN, ZOOM_MAX);
  }, { passive: false });

  return {
    stageEl, renderer, scene, camera, outline, zoom,
    /** 每帧：镜头平滑追赶缩放目标 */
    update(dt) {
      zoom.current = damp(zoom.current, zoom.target, 9, dt);
      applyCamera();
    },
    render() { outline.render(scene, camera); },
  };
}
