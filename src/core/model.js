import * as THREE from 'three';
import { frame, toFrame, fromFrame } from '../rig/faceFrame.js';
import { addSoftWeights } from '../rig/uniforms.js';
import { patchMaterial, patchOutlineMaterial } from '../rig/cheekShaders.js';
import { FaceHit } from '../rig/faceHit.js';
import { makeMorphsRelative, UvMorphs, setupSymbol } from '../rig/symbols.js';


/**
 * 加载完模型后的准备：表情转相对偏移、UV 表情、给各材质打形变补丁、点击检测、音游脸颊点。
 * 材质名全部来自角色配置 materials。
 */
export function prepareModel({ mesh, uvMorphData, scene, materials }) {
  scene.add(mesh);
  mesh.frustumCulled = false;
  const geo = mesh.geometry;
  makeMorphsRelative(geo);
  const uvMorphs = new UvMorphs(geo, uvMorphData);

  // 漫画符号（汗滴等）贴片：淡入淡出
  const symbolMat = mesh.material.find((m) => m.name === materials.symbol);
  if (symbolMat) setupSymbol(symbolMat);

  const has = (list, name) => list?.includes(name);
  addSoftWeights(geo);
  for (const m of mesh.material) {
    if (has(materials.skin, m.name)) patchMaterial(m, 'face');
    // 口腔，以及眼睛、睫毛这类独立材质：跟皮肤用同一个形变场，免得被戳凹、拉开时从皮肤后面露出来
    else if (has(materials.mouth, m.name) || has(materials.followPoke, m.name)) patchMaterial(m, 'follow');
    else if (has(materials.hairOnCheek, m.name)) patchMaterial(m, 'hair');
    // 描边走的是独立着色器，不会跟着脸颊变形 → 脸部和贴纸不画描边
    if (has(materials.noOutline, m.name) && m.userData.outlineParameters) m.userData.outlineParameters.visible = false;
  }
  patchHairOutlines(scene, mesh, materials.hairOnCheek ?? []);

  const faceHit = new FaceHit(mesh, materials.hitTest);
  // 音游的"脸颊点"：右脸颊肉最鼓处。音游轨道从这里出发，音游中点哪里都当成点在这
  const rhythmVertex = nearestVertex(mesh, materials.hitTest[0], fromFrame(frame.cheek));
  const _rv = new THREE.Vector3();

  return {
    uvMorphs,
    symbolMat,
    faceHit,
    /** 脸颊点当前的世界坐标（含骨骼、表情） */
    rhythmPoint() {
      return mesh.localToWorld(mesh.getVertexPosition(rhythmVertex, _rv));
    },
    /** 音游里的"命中"：不看点在哪，统一当作点在脸颊点 */
    rhythmHit() {
      const local = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, rhythmVertex);
      const normal = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, rhythmVertex);
      return { point: this.rhythmPoint().clone(), local, normal, ref: toFrame(local) };
    },
  };
}

/*
 * 前发的描边：OutlineEffect 每帧把 mesh.material 换成自己的描边材质再画。
 * scene.onBeforeRender 时已经换好了，趁这时给这些描边材质也打上同样的位移。
 */
function patchHairOutlines(scene, mesh, names) {
  const slots = mesh.material.flatMap((m, i) => (names.includes(m.name) ? [i] : []));
  if (!slots.length) return;
  const patched = new WeakSet();
  scene.onBeforeRender = () => {
    for (const i of slots) {
      const m = mesh.material[i];
      if (m.type !== 'OutlineEffect' || patched.has(m)) continue;
      patched.add(m);
      patchOutlineMaterial(m);
    }
  };
}

/** 某材质上离 want（模型坐标）最近、且在角色右脸（x>0）的顶点 */
function nearestVertex(mesh, materialName, want) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const mi = mesh.material.findIndex((m) => m.name === materialName);
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
}
