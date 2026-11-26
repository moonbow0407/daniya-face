import * as THREE from 'three';

/*
 * 脸颊形变（GPU）
 * 公式移植自参考站（以菲比模型坐标调好的数值）。达妮娅与菲比的脸部比例很接近，
 * 只需一组线性换算即可共用：
 *   model.x = ref.x * REF_SX,  model.y = ref.y + REF_DY,  model.z = ref.z + REF_DZ
 * 依据：嘴 16.99→16.49、鼻尖 17.26→16.74、眼 17.51→17.02、睫毛外缘 0.813→0.755
 */
export const REF_SX = 0.89;
export const REF_DY = -0.49;
export const REF_DZ = 0.02;
/** 参考模型脸宽，拉扯幅度都按它的比例计算 */
export const PT = 2.142;

export const toRef = (v, out = new THREE.Vector3()) => out.set(v.x / REF_SX, v.y - REF_DY, v.z - REF_DZ);
/** 位移向量（不含平移） */
export const vecToRef = (v, out = new THREE.Vector3()) => out.set(v.x / REF_SX, v.y, v.z);

const POKE_SLOTS = 4;

export const uniforms = {
  uPokes: { value: Array.from({ length: POKE_SLOTS }, () => new THREE.Vector4()) },
  uGrab: { value: new THREE.Vector3() },
  uDelta: { value: new THREE.Vector3() },
  uPullSides: { value: 0 },
  uCheekJiggle: { value: new THREE.Vector2() },
  uPullBlush: { value: new THREE.Vector2() },
  uBlushHeight: { value: new THREE.Vector2(16.96, 16.96) },
  // 捧脸
  uCheekSpring: { value: 0 },
  uRadius: { value: PT * 0.2 },
  uCup: { value: 0 },
  // 前发避让：拉扯量（参考坐标）超过 slack 才开始推发丝，knee 是起步的柔和过渡，follow 是跟随比例
  // 实测不推发丝时，拉到约 0.12 脸颊开始碰到发丝（单手上限 ≈0.16，音游 ≈0.26）
  uHairSlack: { value: 0.11 },
  uHairKnee: { value: 0.03 },
  uHairFollow: { value: 0.8 },
};

const HEAD = /* glsl */ `
uniform vec4 uPokes[${POKE_SLOTS}];
uniform vec3 uGrab, uDelta;
uniform float uPullSides, uCheekSpring, uRadius, uHairSlack, uHairKnee, uHairFollow;
uniform vec2 uCheekJiggle;
attribute float aCheekMobility;
attribute float aCheekWeight;
`;

// 戳：凹陷 → 回弹时脸颊鼓起，并向四周摊开
const POKE = /* glsl */ `
{
 float indentation=0.0;
 float cheekBulge=0.0;
 vec2 spread=vec2(0.0);
 for(int i=0;i<${POKE_SLOTS};i++){
  if(uPokes[i].w==0.0)continue;
  vec3 offset=(rp-uPokes[i].xyz)/vec3(.38,.32,.46);
  float r2=dot(offset,offset);
  spread+=uPokes[i].w*offset.xy*exp(-.95*r2);
  float side=sign(uPokes[i].x);
  vec3 padCenter=uPokes[i].xyz+vec3(side*.22,-.035,-.09);
  vec3 padOffset=(rp-padCenter)/vec3(.46,.36,.53);
  cheekBulge+=max(-uPokes[i].w,0.0)*exp(-dot(padOffset,padOffset));
  indentation+=uPokes[i].w*(1.0-.43*r2)*exp(-r2);
 }
 float lipBand=1.0-smoothstep(.08,.19,abs(rp.y-16.985));
 float cheekSide=smoothstep(mix(.12,.27,lipBand),mix(.36,.50,lipBand),abs(rp.x));
 float poke=indentation/(1.0+2.8*abs(indentation))*aCheekMobility
  *cheekSide*smoothstep(16.66,16.88,rp.y)*(1.0-smoothstep(17.30,17.46,rp.y));
 poke-=.40*max(poke,0.0);
 float padMask=aCheekMobility*cheekSide*smoothstep(16.59,16.84,rp.y)*(1.0-smoothstep(17.24,17.45,rp.y));
 float fullness=cheekBulge/(1.0+2.0*abs(cheekBulge));
 rd+=vec3(sign(rp.x)*.76,.17,.58)*fullness*padMask;
 rd.xy+=spread*.60*padMask;
 rd-=poke*normalize(vec3(rp.x*1.65,-.38,1.0));
}
`;

// 拉：抓住脸颊肉往外扯（单手只动一侧，双手两侧对称），松手后沿轮廓抖一下
const PULL = /* glsl */ `
// 捧脸：双手托住，脸颊肉被往上、往前挤；按住时还能轻轻推一推
rd+=vec3(-sign(rp.x)*.036,.073,.102)*uCheekSpring*aCheekWeight;
if(uPullSides<.5){
 float influence=1.0-smoothstep(0.0,uRadius,distance(rp,uGrab));
 rd+=uDelta*influence*influence*aCheekWeight;
}else{
 float sameSide=sign(rp.x)*sign(uGrab.x);
 float lateral=abs(rp.x);
 float sideArc=smoothstep(.42,.82,lateral);
 float centerZ=uGrab.z-.39*sideArc;
 vec3 offset=vec3((lateral-abs(uGrab.x))/.44,(rp.y-uGrab.y)/.32,(rp.z-centerZ)/.51);
 float r2=dot(offset,offset);
 float pad=aCheekMobility*(1.0+.65*r2)*exp(-r2)*smoothstep(.16,.43,lateral)
  *smoothstep(16.62,16.91,rp.y)*(1.0-smoothstep(17.14,17.43,rp.y));
 if(sameSide>0.0 || uPullSides>1.5){
  float rim=smoothstep(.64,.98,lateral);
  float lateralTravel=uDelta.x*sameSide*(1.0-.28*rim);
  float outward=uDelta.x*sign(uGrab.x);
  float down=max(-uDelta.y,0.0);
  float softPad=smoothstep(16.68,16.96,rp.y)*(1.0-.72*rim);
  float verticalTravel=max(uDelta.y,0.0)*(1.0-.5*rim)-down*.86*softPad;
  // 脸颊外缘（被发丝盖住的那圈）少往前顶，免得从发丝里拱出来
  rd+=vec3(lateralTravel,verticalTravel,uDelta.z+.32*outward*(1.0-.55*rim)+.30*down*softPad)*pad;
 }
}
{
 float cheekX=abs(rp.x);
 float jiggleWeight=smoothstep(.18,.48,cheekX)*smoothstep(16.60,16.91,rp.y)
  *(1.0-smoothstep(17.12,17.43,rp.y))*smoothstep(-.56,-.12,rp.z)*aCheekMobility;
 float jiggle=mix(uCheekJiggle.x,uCheekJiggle.y,step(0.0,rp.x))*jiggleWeight;
 rd+=vec3(sign(rp.x)*.078,-(rp.y-17.02)*.27,.074)*jiggle;
}
`;

// 前发：只在脸颊快要顶穿发丝时才被推开。
// 发丝和脸颊之间本来有一点空隙：拉扯量没超过这段余量（uHairSlack）时发丝完全不动，
// 超过后经过一段柔和的过渡（uHairKnee）才开始跟随，而且只跟随超出的那部分。
// 整段平移（不用皮肤那种局部高斯，否则发丝上会鼓出一个包），往上过渡到发根不动；
// 只横向 + 略往前，不上下拉长发丝
const HAIR_PULL = /* glsl */ `
{
 float lateral=abs(rp.x);
 float band=smoothstep(.22,.46,lateral)*(1.0-smoothstep(17.15,17.65,rp.y))
  *smoothstep(15.7,16.45,rp.y)*smoothstep(-.45,-.12,rp.z);
 float sameSide=sign(rp.x)*sign(uGrab.x);
 if(uPullSides>.5 && (sameSide>0.0 || uPullSides>1.5)){
  float outward=max(uDelta.x*sign(uGrab.x),0.0);
  float t=outward-uHairSlack;
  float k=max(uHairKnee,1e-4);
  float excess=t<=-k?0.0:t>=k?t:(t+k)*(t+k)/(4.0*k);
  rd+=vec3(sign(rp.x)*excess*uHairFollow,0.0,excess*.3)*band;
 }
}
`;

// 拉久了脸颊泛红（只在脸部材质上）
const BLUSH = /* glsl */ `
{
 float side=step(0.0,vRefPos.x);
 float height=mix(uBlushHeight.x,uBlushHeight.y,side);
 float lateral=abs(vRefPos.x);
 float padDepth=.24-.39*smoothstep(.42,.82,lateral);
 vec3 padOffset=(vec3(lateral,vRefPos.y,vRefPos.z)-vec3(.57,height,padDepth))/vec3(.29,.18,.42);
 float warmth=exp(-dot(padOffset,padOffset))*mix(uPullBlush.x,uPullBlush.y,side);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.0,.70,.72),.55*warmth);
 // 捧脸/拉扯时颧骨一带微微泛红
 vec2 cheekCoord=vec2((abs(vRefPos.x)-.54)/.34,(vRefPos.y-17.25)/.15);
 float cheekTint=exp(-dot(cheekCoord,cheekCoord))*uCup*smoothstep(.05,.30,vRefPos.z);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.0,.72,.74),.55*cheekTint);
}
`;

const vertexBody = (kind) => `
vec3 rp=vec3(position.x/${REF_SX.toFixed(4)},position.y-(${REF_DY.toFixed(4)}),position.z-(${REF_DZ.toFixed(4)}));
${kind === 'hair' ? '' : 'vRefPos=rp;'}
vec3 rd=vec3(0.0);
${kind === 'face' ? PULL : kind === 'hair' ? HAIR_PULL : ''}
${kind === 'hair' ? '' : POKE}
transformed+=vec3(rd.x*${REF_SX.toFixed(4)},rd.y,rd.z);
`;

const injectVertex = (shader, kind) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = HEAD + (kind === 'hair' ? '' : 'varying vec3 vRefPos;\n')
    + shader.vertexShader.replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>\n${vertexBody(kind)}`);
};

/**
 * kind: 'face' = 拉 + 戳 + 泛红；'mouth' = 只跟随戳（口腔、舌头，避免穿模）；
 * 'hair' = 只跟随拉（垂在脸颊前的发丝随脸颊一起被拉开，避免脸颊从头发里穿出来）
 */
export function patchMaterial(material, kind) {
  material.onBeforeCompile = (shader) => {
    injectVertex(shader, kind);
    if (kind === 'hair') return;
    let frag = `uniform vec2 uPullBlush, uBlushHeight;\nuniform float uCup;\nvarying vec3 vRefPos;\n` + shader.fragmentShader;
    if (kind === 'face') frag = frag.replace('#include <color_fragment>', `#include <color_fragment>\n${BLUSH}`);
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => `cheek-${kind}`;
  material.needsUpdate = true;
}

/** OutlineEffect 的描边材质用的是独立着色器，头发描边也要跟着发丝一起位移 */
export function patchOutlineMaterial(material) {
  material.onBeforeCompile = (shader) => injectVertex(shader, 'hair');
  material.customProgramCacheKey = () => 'cheek-hair-outline';
  material.needsUpdate = true;
}

/** 脸颊可动度：耳前/侧后方的一块不动，避免撕裂（参考站同款遮罩） */
export function addCheekMobility(geometry) {
  const pos = geometry.attributes.position;
  const out = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  const ss = THREE.MathUtils.smoothstep;
  const weight = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    toRef(p.fromBufferAttribute(pos, i), p);
    const b = ss(Math.abs(p.x), 0.47, 0.64) * ss(p.y, 16.92, 17.08) * (1 - ss(p.z, -0.22, 0.015));
    out[i] = 1 - b;
    // 捧脸时被手掌托住的那块脸颊肉
    const ax = Math.abs(p.x);
    weight[i] = out[i] * ss(ax, 0.32, 0.5) * (1 - ss(ax, 0.89, 1.05))
      * ss(p.y, 16.8, 17.04) * (1 - ss(p.y, 17.17, 17.38)) * ss(p.z, -0.02, 0.22);
  }
  geometry.setAttribute('aCheekMobility', new THREE.BufferAttribute(out, 1));
  geometry.setAttribute('aCheekWeight', new THREE.BufferAttribute(weight, 1));
}

/** 捧脸的脸颊挤压弹簧：按住时快速托起（带一点过冲），松手后软软落回 */
export class CheekSpring {
  constructor() { this.value = 0; this.velocity = 0; }
  update(dt, held) {
    const target = held ? 1 : 0;
    const w = held ? 20 : 16, zeta = held ? 0.48 : 0.55;
    const a = zeta * w, wd = w * Math.sqrt(1 - zeta * zeta);
    const x0 = this.value - target;
    const s = Math.sin(wd * dt) / wd, c = Math.cos(wd * dt), e = Math.exp(-a * dt);
    this.value = target + e * (x0 * c + (this.velocity + a * x0) * s);
    this.velocity = e * (this.velocity * c - (w * w * x0 + a * this.velocity) * s);
    if (Math.abs(this.value - target) < 5e-4 && Math.abs(this.velocity) < 0.01) { this.value = target; this.velocity = 0; }
    return this.value;
  }
}

/** 戳脸的弹簧场：每侧 2 个槽位，一次点击 = 给一个冲量，自己弹回去 */
export class PokeField {
  constructor() {
    this.points = uniforms.uPokes.value;
    this.velocity = new Float64Array(POKE_SLOTS);
    this.reactions = [0, 0];
    this.smiles = [0, 0];
    this.smileDrive = [0, 0];
  }

  tap(p, strength = 1) {
    const side = p.x < 0 ? 0 : 1;
    this.smileDrive[side] = Math.min(1, this.smileDrive[side] + 0.85);
    const start = (side * POKE_SLOTS) / 2;
    let nearest = start, best = Infinity, free = -1;
    for (let h = start; h < start + POKE_SLOTS / 2; h++) {
      const u = this.points[h];
      if (!u.w && !this.velocity[h]) { free = h; continue; }
      const d = (u.x - p.x) ** 2 + (u.y - p.y) ** 2 + (u.z - p.z) ** 2;
      if (d < best) { best = d; nearest = h; }
    }
    const slot = best < 0.1 ** 2 || free < 0 ? nearest : free;
    if (slot === free) this.points[slot].set(p.x, p.y, p.z, 0);
    this.velocity[slot] = Math.min(6 * strength, this.velocity[slot] + 4.8 * strength);
  }

  update(dt) {
    const Z = 4.6, W = 22; // 衰减、角频率
    const t = Math.exp(-Z * dt), c = Math.cos(W * dt), s = Math.sin(W * dt) / W;
    this.points.forEach((a, i) => {
      const w = a.w, v = this.velocity[i];
      if (!w && !v) return;
      a.w = t * ((c + Z * s) * w + s * v);
      this.velocity[i] = t * ((c - Z * s) * v - (W * W + Z * Z) * s * w);
      if (Math.abs(a.w) < 25e-5 && Math.abs(this.velocity[i]) < 0.008) { a.w = 0; this.velocity[i] = 0; }
    });
    for (let r = 0; r < 2; r++) {
      const drive = this.smileDrive[r];
      this.smiles[r] += (drive - this.smiles[r]) * (1 - Math.exp(-11 * dt));
      this.smileDrive[r] *= Math.exp(-3.4 * dt);
      if (drive < 0.001 && this.smiles[r] < 0.001) this.smiles[r] = this.smileDrive[r] = 0;
      const o = (r * POKE_SLOTS) / 2;
      const amp = Math.max(Math.abs(this.points[o].w), Math.abs(this.points[o + 1].w));
      const target = Math.min(1, amp * 7);
      const k = target > this.reactions[r] ? 23 : 10;
      this.reactions[r] += (target - this.reactions[r]) * (1 - Math.exp(-k * dt));
      if (!target && this.reactions[r] < 0.001) this.reactions[r] = 0;
    }
  }
}

/** 眨眼节奏：间隔不规则，偶尔连眨两下；被拉住时眨得更勤 */
const BLINK_GAPS = [3.6, 4.8, 3.1, 5.2, 4.1, 3.9];
const BLINK_LEAD = 0.75;
const ease = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const blinkCurve = (t) => (t < 0 || t >= 0.29 ? 0 : t < 0.08 ? ease(t / 0.08) : t < 0.115 ? 1 : 1 - ease((t - 0.115) / 0.175));

export class BlinkRhythm {
  constructor() {
    this.holding = false;
    this.elapsed = -3.6;
    this.paired = false;
    this.waitingAfterActiveBlink = false;
    this.group = 0;
    this.onTick = null;
  }
  update(dt, holding, suppress) {
    if (suppress) {
      this.holding = true; this.elapsed = -BLINK_LEAD; this.paired = false;
      this.waitingAfterActiveBlink = false; this.group = 0;
      return 0;
    }
    if (holding !== this.holding) {
      this.holding = holding; this.group = 0;
      this.waitingAfterActiveBlink = holding && this.elapsed >= 0;
      if (this.elapsed < 0) this.elapsed = holding ? -BLINK_LEAD : -3.6;
    }
    const prev = this.elapsed;
    this.elapsed += dt;
    if (prev < 0 && this.elapsed >= 0) this.paired = holding || this.group === 3;
    const gap2 = 0.36;
    // 被捧着连眨两下时，配两声很轻的"眨、眨"（参考站同款）
    const lead = 0.045;
    if (holding && this.paired && !this.waitingAfterActiveBlink && this.onTick) {
      if (prev < lead && this.elapsed >= lead) this.onTick(false);
      if (prev < gap2 + lead && this.elapsed >= gap2 + lead) this.onTick(true);
    }
    const end = this.paired ? gap2 + 0.29 : 0.29;
    if (this.elapsed >= end) {
      this.group = (this.group + 1) % BLINK_GAPS.length;
      const next = holding ? 1.8 + 0.15 * (this.group % 4) : BLINK_GAPS[this.group];
      if (this.waitingAfterActiveBlink) { this.elapsed -= end + BLINK_LEAD; this.waitingAfterActiveBlink = false; } else this.elapsed -= next;
    }
    return blinkCurve(this.elapsed) + (this.paired ? blinkCurve(this.elapsed - gap2) : 0);
  }
}
