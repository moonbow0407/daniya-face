/*
 * 角色注册表。新增角色：在 characters/<id>/ 写三层配置（见 daniya/），然后加到下面。
 * 通过 ?char=<id> 选择角色，默认 DEFAULT_CHARACTER。
 */
import daniya from './daniya/index.js';

export const CHARACTERS = { daniya };
export const DEFAULT_CHARACTER = 'daniya';

/** 引擎默认值：角色配置里没写的项用这些（都是"没有这种反应"的保守值） */
const DEFAULT_BEHAVIOR = { cup: { shy: [0.5, 1.6], enjoy: [2.0, 3.2] }, dizzy: false, afterglow: false, sulk: false };

export function pickCharacter(search = location.search) {
  const id = new URLSearchParams(search).get('char');
  const c = CHARACTERS[id] ?? CHARACTERS[DEFAULT_CHARACTER];
  const p = c.personality;
  const actionIds = Object.keys(p.actions ?? {});
  return {
    ...c,
    personality: {
      ...p,
      actions: p.actions ?? {},
      defaultAction: actionIds.includes(p.defaultAction) ? p.defaultAction : actionIds.find((a) => a !== 'rhythm') ?? null,
      behavior: { ...DEFAULT_BEHAVIOR, ...p.behavior },
      expressions: p.expressions ?? (() => {}),
      eggs: { chance: 0, list: [], tint: [0.24, 0.5, 0.84], ...p.eggs },
    },
  };
}
