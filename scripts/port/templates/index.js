/*
 * 角色：__NAME__（由 npm run port -- new 生成）
 *   model.js         模型层：脚本探测生成（SURVEY.md 是探测报告）
 *   expressions.js   表情表：每个动作的招牌表情 + 变体，在 ?studio 工作台里看效果
 *   personality.js   开放的动作、反应节奏、彩蛋
 *   presentation.js  名字与配色（theme.js 由 npm run port -- theme 生成）
 */
import model from './model.js';
import personality from './personality.js';
import presentation from './presentation.js';

export default { id: '__ID__', model, personality, presentation };
