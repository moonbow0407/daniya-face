/*
 * 角色：__NAME__（由 npm run port -- new 生成）
 *   model.js         模型层：脚本探测生成
 *   persona.md       人设卡：agent 根据角色设定写，作为性格方案的依据
 *   proposals/*.js   性格方案（表情表 + 反应节奏 + 彩蛋），在 ?studio 工作台里对比挑选
 *   personality.js   开放的动作 + 选定的方案
 *   presentation.js  名字与配色（theme.js 由 npm run port -- theme 生成）
 */
import model from './model.js';
import personality from './personality.js';
import presentation from './presentation.js';

export default { id: '__ID__', model, personality, presentation };
