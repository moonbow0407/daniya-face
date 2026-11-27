/*
 * 脸颊形变（GPU 着色器）
 * 所有形变都是弹性位移场（双尺度正则化 Kelvinlet，见 kelvinlet.js）的叠加，再乘软组织遮罩 aSoft
 * （拉 / 戳 / 捧 三个通道，见 faceFrame.js）。坐标和位移都在脸部坐标里（半脸宽 = 1）。
 * 下面 SHAPE 里的数值是对照上一版的形变逐顶点拟合出来的：每个动作的范围、方向、幅度都和原来一致。
 *
 * 材质分三类：
 *   face   = 脸部皮肤：全部形变 + 泛红
 *   follow = 口腔、舌头、眼睛、睫毛、眉毛等贴在脸上的独立材质：同样的形变、不泛红
 *            （和皮肤用同一个场，皮肤动了它们就跟着动，不会从皮肤后面露出来）
 *   hair   = 垂在脸颊前的前发：整段平移让开（位移由 CPU 算好，见 uHair）
 * 描边是 OutlineEffect 的独立着色器，前发描边也要跟着发丝一起动。
 */
import { frame } from './faceFrame.js';
import { uniforms, POKE_SLOTS } from './uniforms.js';
import { KELVINLET_GLSL, squishNorm } from './kelvinlet.js';

const f = (x) => (+x).toFixed(5);
const v = (a) => `vec3(${a.map(f).join(',')})`;

export const SHAPE = {
  // 戳：坑（A = 深度系数，有饱和）+ 沿脸面摊开（B）+ 回弹时落点外侧鼓起（D，偏移 o，方向 b）；side = 只作用于同侧
  poke: { A: 1.1403, k: [0.4437, 0.4937], B: 0.1573, s: [0.5079, 0.5478], D: 0.7849, o: [0.1024, 0.019, -0.2658], b: [1.1038, 0.0278, 0.8231], kb: [0.5522, 0.7955], side: [0.0971, 0.2654] },
  // 拉：场源和增益在 interaction/pull.js（FIELD），这里是尺度和"只动同侧"
  pull: { k: [1.0344, 1.0845], side: [0.1052, 0.1195] },
  // 捧：两只手掌（相对脸颊点高度 / 深度的偏移 p、往里 / 往上 / 往前推 i）；推一推（增益 g、尺度 kq）
  cup: { p: [0.5118, 0.0307, -0.4178], i: [0.0381, 0.0869, 0.1177], k: [1.4697, 3.4543], g: 0.9472, kq: [0.2691, 0.3223] },
  // 余振：场源离脸很远（偏移 p），等效于一整团肉往外、往中间收的抖动
  wobble: { p: [1.4539, -1.2025, 1.5166], v: [-3.0364, -9.1988, 3.224], k: [0.5949, 0.6514] },
};
const P = SHAPE;
const kv = (k) => `${f(k[0])},${f(k[1])}`;
const QN = squishNorm(...P.poke.s);

const HEAD = /* glsl */ `
uniform vec4 uPokes[${POKE_SLOTS}];
uniform vec3 uPokeN[${POKE_SLOTS}];
uniform vec3 uGrab[2], uPull[2], uHair[2];
uniform vec3 uPushAt, uPush, uCheek;
uniform float uSquash;
uniform vec2 uWobble;
attribute vec3 aSoft;
${KELVINLET_GLSL}
`;

// 戳：w>0 按进去（坑有饱和、只按六成），周围的肉沿脸面摊开；w<0 回弹，坑变成包，肉收回，落点外侧再鼓起一团
const POKE = /* glsl */ `
{
 vec3 dp=vec3(0.0);
 for(int i=0;i<${POKE_SLOTS};i++){
  float w=uPokes[i].w;
  if(w==0.0)continue;
  vec3 c=uPokes[i].xyz, n=uPokeN[i], r=fp-c;
  float sx=c.x<0.0?-1.0:1.0;
  float sat=w/(1.0+2.8*abs(w)), dent=sat>0.0?sat*.6:sat;
  vec3 t=kelvinlet(r,-dent*${f(P.poke.A)}*n,${kv(P.poke.k)});
  t+=squish(r-dot(r,n)*n,w*${f(P.poke.B)},${kv(P.poke.s)},${f(QN)});
  if(w<0.0){
   float b=-w, full=b/(1.0+2.0*b);
   vec3 o=${v(P.poke.o)}; o.x*=sx;
   vec3 d=${v(P.poke.b)}*full*${f(P.poke.D)}; d.x*=sx;
   t+=kelvinlet(r-o,d,${kv(P.poke.kb)});
  }
  dp+=t*smoothstep(${f(P.poke.side[0])},${f(P.poke.side[1])},sx*fp.x);
 }
 rd+=dp*aSoft.y;
}
`;

// 拉、余振（拉的遮罩）+ 捧（捧的遮罩）
const FLESH = /* glsl */ `
{
 vec3 df=vec3(0.0), dc=vec3(0.0);
 for(int s=0;s<2;s++){
  float sx=float(s)*2.0-1.0;
  if(dot(uPull[s],uPull[s])>0.0)
   df+=kelvinlet(fp-uGrab[s],uPull[s],${kv(P.pull.k)})*smoothstep(${f(P.pull.side[0])},${f(P.pull.side[1])},sx*fp.x);
  float hs=smoothstep(-.05,.05,sx*fp.x);
  vec3 base=vec3(0.0,uCheek.y,uCheek.z);
  float wb=s==0?uWobble.x:uWobble.y;
  if(wb!=0.0){
   vec3 o=${v(P.wobble.p)}, d=${v(P.wobble.v)}*wb; o.x*=sx; d.x*=sx;
   df+=kelvinlet(fp-base-o,d,${kv(P.wobble.k)})*hs;
  }
  if(uSquash!=0.0){
   // 手掌托住脸颊外下侧，往里、往上、往前推
   vec3 o=${v(P.cup.p)}, d=${v(P.cup.i)}*uSquash; o.x*=sx; d.x*=-sx;
   dc+=kelvinlet(fp-base-o,d,${kv(P.cup.k)})*hs;
  }
 }
 if(dot(uPush,uPush)>0.0)dc+=kelvinlet(fp-uPushAt,uPush*${f(P.cup.g)},${kv(P.cup.kq)});
 rd+=df*aSoft.x+dc*aSoft.z;
}
`;

// 前发：只取脸颊侧边那一段，往上过渡到发根不动、往下到发梢全动；整段平移（不在发丝上鼓包）
const HAIR = /* glsl */ `
{
 float band=smoothstep(.2105,.4402,abs(fp.x))*(1.0-smoothstep(.1828,.7204,fp.y))
  *smoothstep(-1.3763,-.5699,fp.y)*smoothstep(-1.1333,-.7785,fp.z);
 rd+=(fp.x<0.0?uHair[0]:uHair[1])*band;
}
`;

// 泛红（只在脸部皮肤）：拉久了被拉的那侧（高度跟着抓取点）；捧脸 / 拉扯时颧骨一带
const BLUSH = /* glsl */ `
{
 float lat=abs(vFacePos.x), side=step(0.0,vFacePos.x);
 float depth=-.3914-.4194*smoothstep(.402,.785,lat);
 vec3 o=(vec3(lat,vFacePos.y,vFacePos.z)-vec3(.5455,mix(uBlushY.x,uBlushY.y,side),depth))/vec3(.2775,.1935,.4516);
 float warmth=exp(-dot(o,o))*mix(uPullBlush.x,uPullBlush.y,side);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.0,.70,.72),.55*warmth);
 vec2 c=vec2((lat-.5168)/.3254,(vFacePos.y-.2903)/.1613);
 float tint=exp(-dot(c,c))*uCup*smoothstep(-.5957,-.3269,vFacePos.z);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.0,.72,.74),.55*tint);
}
`;

const vertexBody = (kind) => `
vec3 fp=(position-vec3(0.0,${f(frame.origin.y)},${f(frame.origin.z)}))/${f(frame.S)};
${kind === 'face' ? 'vFacePos=fp;' : ''}
vec3 rd=vec3(0.0);
${kind === 'hair' ? HAIR : FLESH + POKE}
transformed+=rd*${f(frame.S)};
`;

const injectVertex = (shader, kind) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = HEAD + (kind === 'face' ? 'varying vec3 vFacePos;\n' : '')
    + shader.vertexShader.replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>\n${vertexBody(kind)}`);
};

/** kind: 'face' / 'follow' / 'hair'（见文件开头） */
export function patchMaterial(material, kind) {
  material.onBeforeCompile = (shader) => {
    injectVertex(shader, kind);
    if (kind !== 'face') return;
    shader.fragmentShader = 'uniform vec2 uPullBlush, uBlushY;\nuniform float uCup;\nvarying vec3 vFacePos;\n'
      + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${BLUSH}`);
  };
  material.customProgramCacheKey = () => `cheek3-${kind}`;
  material.needsUpdate = true;
}

/** OutlineEffect 的描边材质用的是独立着色器，头发描边也要跟着发丝一起位移 */
export function patchOutlineMaterial(material) {
  material.onBeforeCompile = (shader) => injectVertex(shader, 'hair');
  material.customProgramCacheKey = () => 'cheek3-hair-outline';
  material.needsUpdate = true;
}
