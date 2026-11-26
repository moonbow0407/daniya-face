/*
 * 角色：达妮娅（《鸣潮》，模之屋红色一形态 MMD 模型）
 * 一个角色 = 三层配置，来源和决定者不同：
 *   model.js         模型层：材质、骨骼、表情名、坐标校准
 *   personality.js   性格层：开放的动作、反应节奏、表情表、彩蛋（熟悉角色的人拍板）
 *   presentation.js  呈现层：文案、图片、配色（取色后微调）
 */
import model from './model.js';
import personality from './personality.js';
import presentation from './presentation.js';

export default { id: 'daniya', model, personality, presentation };
