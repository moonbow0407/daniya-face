/*
 * 脸颊形变（GPU 着色器）
 * 所有形变都是同一个弹性位移场（双尺度正则化 Kelvinlet，见 kelvinlet.js）的叠加，
 * 再乘软组织遮罩 aSoft（钉住鼻梁、眼睛、耳前），坐标和位移都在脸部坐标里（见 faceFrame.js）：
 *   戳 = 沿表面法线往里按一点（周围一圈被挤得微微鼓起）
 *   拉 = 抓住一点往外拖；捧 = 两只手掌从脸颊外侧往里、往上托，脸颊肉被挤得往前鼓
 * 材质分三类：
 *   face   = 脸部皮肤：全部形变 + 泛红
 *   follow = 口腔、舌头、眼睛等：同样的形变、不泛红（和皮肤用同一个场，就不会互相穿过去）
 *   hair   = 垂在脸颊前的前发：整段平移让开（位移由 CPU 算好，见 uHair）
 * 描边是 OutlineEffect 的独立着色器，前发描边也要跟着发丝一起动。
 */
import { frame } from './faceFrame.js';
import { uniforms, POKE_SLOTS } from './uniforms.js';
import { KELVINLET_GLSL, KERNELS as K } from './kelvinlet.js';

const f = (x) => x.toFixed(5);

const kv = (name) => `${f(K[name][0])},${f(K[name][1])}`;

const HEAD = /* glsl */ `
uniform vec4 uPokes[${POKE_SLOTS}];
uniform vec3 uPokeN[${POKE_SLOTS}];
uniform vec3 uGrab[2], uPull[2], uHair[2];
uniform vec3 uPushAt, uPush, uCheek;
uniform float uSquash;
uniform vec2 uWobble;
attribute vec2 aSoft;
${KELVINLET_GLSL}
`;

// 戳：沿表面法线按出一个坑，同时周围的肉沿着脸面被挤开（脸颊轮廓往外鼓，正面也看得出来）；
// 回弹时 w<0：坑变成往外鼓的包，肉照样往四周摊开——一按一弹，脸颊轮廓鼓两下
// （着色器不改法线，卡通着色下只有轮廓和贴图的移动看得见，所以挤开的那部分是主力）
const POKE = /* glsl */ `
{
 vec3 dp=vec3(0.0);
 for(int i=0;i<${POKE_SLOTS};i++){
  float w=uPokes[i].w;
  if(w==0.0)continue;
  vec3 n=uPokeN[i], r=fp-uPokes[i].xyz;
  dp+=kelvinlet(r,-w*n,${kv('poke')});
  dp+=squish(r-dot(r,n)*n,w>0.0?w*1.3:-w*.5);
 }
 rd+=dp*aSoft.y;
}
`;

// 拉 + 捧 + 余振：都作用在脸颊肉上
const FLESH = /* glsl */ `
{
 vec3 df=vec3(0.0);
 for(int s=0;s<2;s++){
  if(dot(uPull[s],uPull[s])>0.0)df+=kelvinlet(fp-uGrab[s],uPull[s],${kv('pull')});
  float sx=float(s)*2.0-1.0;
  vec3 pad=vec3(sx*uCheek.x,uCheek.y,uCheek.z);
  if(uSquash!=0.0){
   // 手掌贴在脸颊外侧，往里、往上推；被夹住的肉往前鼓
   df+=kelvinlet(fp-vec3(sx*.8,uCheek.y-.03,uCheek.z-.3),uSquash*vec3(-sx*.08,.055,.012),${kv('palm')});
   df+=kelvinlet(fp-pad,uSquash*vec3(sx*.008,.015,.05),${kv('pull')});
  }
  float wb=s==0?uWobble.x:uWobble.y;
  if(wb!=0.0)df+=kelvinlet(fp-pad,wb*vec3(sx*.4,-.15,1.0),${kv('pull')});
 }
 if(dot(uPush,uPush)>0.0)df+=kelvinlet(fp-uPushAt,uPush,${kv('palm')});
 rd+=df*aSoft.x;
}
`;

// 前发：只取脸颊侧边、眼睛以下那一段，往上过渡到发根不动；整段平移（不在发丝上鼓包）
const HAIR = /* glsl */ `
{
 float band=smoothstep(.2,.45,abs(fp.x))*(1.0-smoothstep(${f(frame.eyeY - 0.12)},${f(frame.eyeY + 0.4)},fp.y))
  *smoothstep(-1.13,-.78,fp.z);
 rd+=(fp.x<0.0?uHair[0]:uHair[1])*band;
}
`;

// 泛红（只在脸部皮肤）：拉久了被拉的那侧；捧脸 / 拉扯时颧骨一带
const BLUSH = /* glsl */ `
{
 vec3 q=vec3(abs(vFacePos.x),vFacePos.y,vFacePos.z);
 float side=step(0.0,vFacePos.x);
 vec3 o=(q-vec3(uCheek.x+.06,mix(uBlushY.x,uBlushY.y,side),uCheek.z+.03))/vec3(.32,.2,.45);
 float warmth=exp(-dot(o,o))*mix(uPullBlush.x,uPullBlush.y,side);
 vec3 c=(q-vec3(uCheek.x+.1,uCheek.y+.15,uCheek.z+.06))/vec3(.34,.15,.4);
 warmth=max(warmth,exp(-dot(c,c))*uCup);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.0,.71,.73),.55*clamp(warmth,0.0,1.0));
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
    shader.fragmentShader = 'uniform vec2 uPullBlush, uBlushY;\nuniform float uCup;\nuniform vec3 uCheek;\nvarying vec3 vFacePos;\n'
      + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${BLUSH}`);
  };
  material.customProgramCacheKey = () => `cheek2-${kind}`;
  material.needsUpdate = true;
}

/** OutlineEffect 的描边材质用的是独立着色器，头发描边也要跟着发丝一起位移 */
export function patchOutlineMaterial(material) {
  material.onBeforeCompile = (shader) => injectVertex(shader, 'hair');
  material.customProgramCacheKey = () => 'cheek2-hair-outline';
  material.needsUpdate = true;
}
