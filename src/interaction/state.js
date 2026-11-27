import * as THREE from 'three';
import { CheekSpring } from '../rig/springs.js';

/**
 * 交互共享状态：输入（input.js）写，拉扯物理（pull.js）和表情（expression/）读。
 * 坐标、位移都在脸部坐标里（见 rig/faceFrame.js，半脸宽 = 1）。
 */
export function createInteractionState({ actions, defaultAction, behavior }) {
  const mode = defaultAction ?? 'off';
  return {
    mode, // 当前工具：poke / single / double / cup / off（音游中或没有可用工具）
    modeBeforeRhythm: mode,
    behavior, // 角色的反应节奏（personality.behavior）
    // 幅度上限（半脸宽的倍数），来自角色配置 personality.actions
    limits: {
      single: actions.single?.limit ?? 0.154,
      double: actions.double?.limit ?? 0.098,
      cup: actions.cup?.push ?? 0.072,
      rhythm: actions.rhythm?.limit ?? 0.246,
    },

    // --- 拉扯 / 捧脸 ---
    grab: new THREE.Vector3(), // 抓取中心（捧脸时是按下的位置）
    delta: new THREE.Vector3(), // 当前拉扯位移
    target: new THREE.Vector3(), // 指针对应的目标位移
    vel: new THREE.Vector3(),
    pullSides: 0, // 0 捧脸 / 1 单手 / 2 双手（松手后保留，用于回弹）
    holdId: null, // 正在按住的指针（键盘长按为 'key'）
    keyHoldCode: null,
    pulling: false, // 已经真正拉动过
    holdStart: null, // 拉开超过阈值的时刻（脸红计时）
    pullAmount: 0, // 平滑后的拉扯程度 0..1
    egg: null, // 本次拉扯触发的彩蛋（见角色配置 symbols）
    roll: 0, // 每次动作开始（戳一下 / 按下拉或捧）掷一次的随机数 0..1，表情表据此选招牌表情或变体

    // 拖动
    pressPx: new THREE.Vector2(),
    dragPlane: new THREE.Plane(),
    dragStart: new THREE.Vector3(),

    blushHold: { x: 0, y: 0 },

    // 回弹后的脸颊抖动
    jiggle: { armed: false, amp: 0, t: Infinity, left: false, right: false },
    releaseDir: new THREE.Vector3(),

    // --- 戳 ---
    pokeUntil: -Infinity, // 戳完 550ms 内是"被戳"表情
    pokeCombo: 0, // 连戳次数（两次间隔 < 0.7 秒算连戳）
    lastPokeAt: -Infinity,

    // --- 捧脸 ---
    cupHeld: false,
    cupAmount: 0, // 捧脸程度 0..1（平滑）
    cheekSpring: new CheekSpring(),
    cupTime: 0, // 本次已经捧了多久（秒）
    rubInput: 0, // 这一帧揉脸移动的像素
    rubLevel: 0, // 揉脸的快慢 0..1（平滑）
    rubEnergy: 0, // 揉脸累积，攒满就晕
    lastRubPx: new THREE.Vector2(),
    dizzyUntil: -Infinity, // 揉晕的表情持续到
    afterglow: 0, // 捧完松手后"嘿嘿"笑的余韵 0..1

    hoverEvent: null, // 鼠标悬停（每帧更新光标）
  };
}
