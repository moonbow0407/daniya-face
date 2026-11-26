/**
 * 工具栏：左上角音效开关；右侧动作工具按角色配置 personality.actions 生成。
 * 动作的图标是引擎自带的（ACTION_ICONS），文字来自配置的 label。
 */
const ICON = (body) => `<svg viewBox="0 0 28 24" width="26" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ACTION_ICONS = {
  cup: ICON('<path d="M4 8q-1 9 10 12Q25 17 24 8"/><path d="M9 9q5 4 10 0"/>'),
  poke: ICON('<path d="M11 21V8a2 2 0 0 1 4 0v6l5 1q3 1 2 4l-1 2"/><path d="M5 5l2 2M13 1v3M21 5l-2 2"/>'),
  single: ICON('<path d="M15 5a7 7 0 1 0 0 14M13 12h12m-4-4 4 4-4 4"/>'),
  double: ICON('<path d="M10 6q4-3 8 0m-8 12q4 3 8 0M2 12h8m-5-3-3 3 3 3m13-3h8m-3-3 3 3-3 3"/>'),
  rhythm: ICON('<path d="M10 18V5l12-2v13"/><circle cx="7" cy="18" r="3"/><circle cx="19" cy="16" r="3"/>'),
};

/** 生成右侧动作按钮；返回音游按钮（没开放音游时为 null） */
export function setupToolbar({ sfx, s, actions }) {
  setupSoundButton(sfx);

  const bar = document.querySelector('.toolbar.right');
  let rhythmButton = null;
  const toolButtons = [];
  for (const [id, a] of Object.entries(actions)) {
    if (!ACTION_ICONS[id]) { console.warn(`[toolbar] 未知动作 ${id}`); continue; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `${ACTION_ICONS[id]}<span>${a.label ?? id}</span>`;
    if (id === 'rhythm') {
      btn.id = 'rhythm-tool';
      btn.title = '开始或退出音游';
      btn.setAttribute('aria-pressed', 'false');
      rhythmButton = btn;
    } else {
      btn.dataset.mode = id;
      btn.title = a.label ?? id;
      btn.setAttribute('aria-pressed', String(s.mode === id));
      toolButtons.push(btn);
    }
    bar.append(btn);
  }

  for (const btn of toolButtons) {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      sfx.unlock();
      if (s.mode !== btn.dataset.mode) sfx.tick();
      s.mode = btn.dataset.mode;
      toolButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  }
  return { rhythmButton };
}

function setupSoundButton(sfx) {
  const soundBtn = document.getElementById('sound-tool');
  function sync() {
    soundBtn.setAttribute('aria-pressed', String(sfx.enabled));
    soundBtn.title = sfx.enabled ? '关闭音效' : '打开音效';
    soundBtn.querySelector('.wave').style.display = sfx.enabled ? '' : 'none';
    soundBtn.querySelector('.mute').style.display = sfx.enabled ? 'none' : '';
  }
  soundBtn.addEventListener('click', () => {
    sfx.setEnabled(!sfx.enabled);
    sfx.unlock();
    sfx.tick();
    sync();
  });
  sync();
}
