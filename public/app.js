const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const els = {
  bootScreen: $('#bootScreen'),
  loginView: $('#loginView'),
  loginCard: $('#loginCard'),
  loginForm: $('#loginForm'),
  loginUser: $('#loginUser'),
  loginPass: $('#loginPass'),
  loginBtn: $('#loginBtn'),
  loginError: $('#loginError'),
  togglePass: $('#togglePass'),
  loginHearts: $('#loginHearts'),
  appView: $('#appView'),
  dateLine: $('#dateLine'),
  greeting: $('#greeting'),
  helloSub: $('#helloSub'),
  heroQuote: $('#heroQuote'),
  progressRing: $('#progressRing'),
  progressValue: $('#progressValue'),
  progressLabel: $('#progressLabel'),
  composer: $('#composer'),
  taskInput: $('#taskInput'),
  composeDueBtn: $('#composeDueBtn'),
  composeDueText: $('#composeDueText'),
  composeHint: $('#composeHint'),
  addBtn: $('#addBtn'),
  searchInput: $('#searchInput'),
  listTitle: $('#listTitle'),
  listCount: $('#listCount'),
  listSub: $('#listSub'),
  taskList: $('#taskList'),
  doneSection: $('#doneSection'),
  doneToggle: $('#doneToggle'),
  doneCount: $('#doneCount'),
  doneList: $('#doneList'),
  clearDoneBtn: $('#clearDoneBtn'),
  anniversaryBtn: $('#anniversaryBtn'),
  anniversaryDays: $('#anniversaryDays'),
  anniversaryUnit: $('#anniversaryUnit'),
  anniversaryLabel: $('#anniversaryLabel'),
  dailyQuote: $('#dailyQuote'),
  settingsBtn: $('#settingsBtn'),
  logoutBtn: $('#logoutBtn'),
  fabAdd: $('#fabAdd'),
  duePopover: $('#duePopover'),
  dueClose: $('#dueClose'),
  dueDate: $('#dueDate'),
  dueTime: $('#dueTime'),
  dueSave: $('#dueSave'),
  dueClear: $('#dueClear'),
  noteModal: $('#noteModal'),
  noteTaskTitle: $('#noteTaskTitle'),
  noteInput: $('#noteInput'),
  noteSave: $('#noteSave'),
  settingsModal: $('#settingsModal'),
  anniversaryInput: $('#anniversaryInput'),
  settingsSave: $('#settingsSave'),
  settingsLogout: $('#settingsLogout'),
  confirmModal: $('#confirmModal'),
  confirmTitle: $('#confirmTitle'),
  confirmText: $('#confirmText'),
  confirmCancel: $('#confirmCancel'),
  confirmOk: $('#confirmOk'),
  toastHost: $('#toastHost'),
};

const QUOTES = [
  '和你在一起，普通的日子也会发光。',
  '把喜欢的事，慢慢做成我们的日常。',
  '今天也要牵着手，把小事做成纪念。',
  '日子很普通，但有你就不普通。',
  '一屋两人，三餐四季。',
  '想和你一起，把清单一条条变成回忆。',
  '慢慢来，反正我们有一辈子。',
  '爱不是轰轰烈烈，是每一件被记住的小事。',
  '和你分享的每一顿饭，都值得记下来。',
  '以后还有很多个今天，想和你一起过。',
  '把平淡的日子，过成我们喜欢的样子。',
  '只要最后是你，晚一点也没关系。',
];

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const FILTER_META = {
  today: { title: '今天', sub: '越靠上越重要 · 按住左侧拖动调整优先级' },
  planned: { title: '计划', sub: '有期待的日子，才值得过 · 拖动可以调整优先级' },
  all: { title: '全部', sub: '我们的幸福清单 · 越靠上越重要' },
  done: { title: '已完成', sub: '这些小事，都已经变成回忆啦' },
};

const state = {
  user: null,
  tasks: [],
  completed: [],
  meta: {},
  filter: 'all',
  query: '',
  composeDue: null,
  doneOpen: false,
  dueTarget: null,
  noteTarget: null,
  confirmResolve: null,
  lastLoad: 0,
  hydrated: false,
};

let suppressClickUntil = 0;
let toastTimer = 0;

/* --------------------------------- 工具 --------------------------------- */

const pad2 = (n) => String(n).padStart(2, '0');

function dateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayKey(offset = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return dateKey(d);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function getTask(id) {
  return state.tasks.find((t) => t.id === id) || state.completed.find((t) => t.id === id) || null;
}

function removeLocal(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  state.completed = state.completed.filter((t) => t.id !== id);
}

function dueInfo(due) {
  if (!due) return null;

  const date = due.slice(0, 10);
  const time = due.length > 10 ? due.slice(11, 16) : '';
  const today = todayKey();
  const target = new Date(`${date}T00:00:00`);
  const base = new Date(`${today}T00:00:00`);
  const diff = Math.round((target - base) / 86400000);

  let label;
  if (diff === 0) label = '今天';
  else if (diff === 1) label = '明天';
  else if (diff === 2) label = '后天';
  else if (diff === -1) label = '昨天';
  else if (diff === -2) label = '前天';
  else if (diff > 2 && diff < 7) label = `周${WEEK[target.getDay()]}`;
  else if (diff > 7 && diff < 14) label = `下周${WEEK[target.getDay()]}`;
  else if (target.getFullYear() === new Date().getFullYear()) {
    label = `${target.getMonth() + 1}月${target.getDate()}日`;
  } else {
    label = `${target.getFullYear()}年${target.getMonth() + 1}月${target.getDate()}日`;
  }

  let overdue = false;
  if (date < today) {
    overdue = true;
  } else if (date === today && time) {
    overdue = new Date(`${date}T${time}:00`).getTime() < Date.now();
  }

  return {
    date,
    time,
    label,
    text: time ? `${label} ${time}` : label,
    overdue,
    isToday: date === today,
  };
}

function fullDue(due) {
  if (!due) return '';
  const info = dueInfo(due);
  const date = due.slice(0, 10);
  const time = due.length > 10 ? due.slice(11, 16) : '';
  return `${date.replace(/-/g, '/')}${time ? ` ${time}` : ''}（${info?.text || ''}）`;
}

function formatDoneAt(iso) {
  if (!iso) return '已完成';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '已完成';
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (dateKey(d) === todayKey()) return `今天 ${time} 完成`;
  if (dateKey(d) === todayKey(-1)) return `昨天 ${time} 完成`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time} 完成`;
}

function greetingFor(hour) {
  if (hour < 5) return { hello: '夜深了', sub: '把心事轻轻放下，明天再一起完成。' };
  if (hour < 9) return { hello: '早上好', sub: '新的一天，从一件甜甜的小事开始。' };
  if (hour < 12) return { hello: '上午好', sub: '今天也要把小日子过得甜甜的。' };
  if (hour < 14) return { hello: '中午好', sub: '记得好好吃饭，再一起做点小事。' };
  if (hour < 18) return { hello: '下午好', sub: '忙里偷闲，也想和你完成一件小事。' };
  if (hour < 23) return { hello: '晚上好', sub: '今天想和小王一起做点什么？' };
  return { hello: '夜深了', sub: '把想做的事写下来，明天继续。' };
}

function seedForToday() {
  return Number(String(todayKey()).replace(/-/g, ''));
}

/* ---------------------------------- API --------------------------------- */

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (res.status === 401) {
    handleSessionExpired();
    const err = new Error('登录状态过期啦');
    err.silent = true;
    throw err;
  }

  if (!res.ok) {
    throw new Error(data.error || '网络开小差了，稍后再试');
  }

  return data;
}

async function loadTasks() {
  const data = await api('/api/tasks');
  state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
  state.completed = Array.isArray(data.completed) ? data.completed : [];
  state.meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
  state.lastLoad = Date.now();
  state.hydrated = true;
}

/* -------------------------------- 登录流程 ------------------------------- */

function showLoginError(message) {
  els.loginError.textContent = message || '';
  els.loginError.classList.toggle('show', Boolean(message));
}

function makeLoginHearts() {
  if (!els.loginHearts || els.loginHearts.childElementCount) return;
  const count = window.innerWidth < 700 ? 9 : 15;
  for (let i = 0; i < count; i += 1) {
    const heart = document.createElement('span');
    heart.className = 'float-heart';
    heart.textContent = '♡';
    const size = 11 + Math.random() * 18;
    heart.style.left = `${Math.random() * 100}%`;
    heart.style.fontSize = `${size}px`;
    heart.style.animationDuration = `${16 + Math.random() * 14}s`;
    heart.style.animationDelay = `${-Math.random() * 30}s`;
    heart.style.opacity = `${0.35 + Math.random() * 0.45}`;
    els.loginHearts.appendChild(heart);
  }
}

function hideBoot() {
  document.body.classList.remove('booting');
  els.bootScreen.classList.add('is-gone');
  window.setTimeout(() => {
    els.bootScreen.hidden = true;
  }, 420);
}

function showLogin(message = '') {
  els.appView.hidden = true;
  els.loginView.hidden = false;
  els.loginPass.value = '';
  showLoginError(message);
  makeLoginHearts();
}

function showApp() {
  els.loginView.hidden = true;
  els.appView.hidden = false;
  renderAll();
}

function handleSessionExpired() {
  state.user = null;
  state.hydrated = false;
  state.tasks = [];
  state.completed = [];
  showLogin('登录状态过期啦，再进来一次吧');
}

async function enterApp() {
  showApp();
  await loadTasks();
  renderAll();
}

function bindLogin() {
  els.togglePass.addEventListener('click', () => {
    const showing = els.loginPass.type === 'text';
    els.loginPass.type = showing ? 'password' : 'text';
    els.togglePass.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
    const use = els.togglePass.querySelector('use');
    use?.setAttribute('href', showing ? '#i-eye' : '#i-eye-off');
    els.loginPass.focus();
  });

  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showLoginError('');

    const username = els.loginUser.value.trim();
    const password = els.loginPass.value;
    if (!username || !password) {
      showLoginError('账号和密码都要写哦');
      els.loginCard.classList.remove('shake');
      void els.loginCard.offsetWidth;
      els.loginCard.classList.add('shake');
      return;
    }

    const original = els.loginBtn.innerHTML;
    els.loginBtn.disabled = true;
    els.loginBtn.innerHTML = '<span>正在进门…</span>';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '进不来呢，再试一次');

      state.user = data.user || username;
      await loadTasks();
      showApp();
      toast('欢迎回来，小吴 & 小王 ♡');
    } catch (error) {
      showLoginError(error.message || '进不来呢，再试一次');
      els.loginCard.classList.remove('shake');
      void els.loginCard.offsetWidth;
      els.loginCard.classList.add('shake');
      els.loginPass.select();
    } finally {
      els.loginBtn.disabled = false;
      els.loginBtn.innerHTML = original;
    }
  });
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    /* 忽略网络错误，本地照样退出 */
  }
  state.user = null;
  state.hydrated = false;
  state.tasks = [];
  state.completed = [];
  state.query = '';
  els.searchInput.value = '';
  els.taskInput.value = '';
  state.composeDue = null;
  closeAllModals();
  closeDue();
  showLogin();
}

/* --------------------------------- 渲染 --------------------------------- */

function visibleTasks() {
  const today = todayKey();
  let list = state.tasks.slice();

  if (state.filter === 'today') {
    list = list.filter((task) => !task.due || task.due.slice(0, 10) <= today);
  } else if (state.filter === 'planned') {
    list = list.filter((task) => Boolean(task.due));
  }

  const query = state.query.trim().toLowerCase();
  if (query) {
    list = list.filter((task) => {
      return `${task.title} ${task.note || ''}`.toLowerCase().includes(query);
    });
  }

  return list;
}

function visibleCompleted() {
  const query = state.query.trim().toLowerCase();
  if (!query) return state.completed.slice();
  return state.completed.filter((task) => {
    return `${task.title} ${task.note || ''}`.toLowerCase().includes(query);
  });
}

function renderAll() {
  renderChrome();
  renderNavCounts();
  renderProgress();
  renderFilterState();
  renderList();
  renderDoneSection();
  renderAnniversary();
  renderComposeDue();
}

function renderChrome() {
  const now = new Date();
  els.dateLine.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${WEEK[now.getDay()]}`;

  const greeting = greetingFor(now.getHours());
  els.greeting.textContent = greeting.hello;
  els.helloSub.textContent = greeting.sub;

  const seed = seedForToday();
  els.heroQuote.textContent = QUOTES[seed % QUOTES.length];
  els.dailyQuote.textContent = QUOTES[(seed + 4) % QUOTES.length];
}

function renderNavCounts() {
  const today = todayKey();
  const counts = {
    today: state.tasks.filter((t) => !t.due || t.due.slice(0, 10) <= today).length,
    planned: state.tasks.filter((t) => Boolean(t.due)).length,
    all: state.tasks.length,
    done: state.completed.length,
  };

  $$('[data-count]').forEach((node) => {
    node.textContent = String(counts[node.dataset.count] || 0);
  });
}

function renderProgress() {
  const today = todayKey();
  const dueItems = [...state.tasks, ...state.completed].filter(
    (task) => task.due && task.due.slice(0, 10) <= today,
  );
  const total = dueItems.length;
  const done = state.completed.filter(
    (task) => task.due && task.due.slice(0, 10) <= today,
  ).length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  els.progressRing.style.setProperty('--p', String(percent));
  els.progressValue.textContent = `${percent}%`;
  els.progressLabel.textContent = total ? `${done} / ${total}` : '慢慢来';
}

function renderFilterState() {
  $$('[data-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === state.filter);
  });
}

function renderList() {
  const meta = FILTER_META[state.filter] || FILTER_META.today;
  els.listTitle.textContent = meta.title;
  els.listSub.textContent = meta.sub;
  els.taskList.innerHTML = '';

  if (state.filter === 'done') {
    const list = visibleCompleted();
    els.listCount.textContent = list.length ? `${list.length} 件` : '';
    if (!list.length) {
      els.taskList.append(emptyState(state.query ? 'search' : 'done'));
      return;
    }
    list.forEach((task, index) => {
      els.taskList.append(taskItem(task, index, { done: true }));
    });
    return;
  }

  const list = visibleTasks();
  els.listCount.textContent = list.length ? `${list.length} 件` : '';

  if (!list.length) {
    els.taskList.append(emptyState(state.query ? 'search' : state.filter));
    return;
  }

  list.forEach((task, index) => {
    els.taskList.append(taskItem(task, index));
  });
}

function taskItem(task, index, { done = false } = {}) {
  const li = document.createElement('li');
  li.className = `task${index < 3 && !done ? ` top-${index + 1}` : ''}${done ? ' is-done' : ''}`;
  li.dataset.id = task.id;
  li.style.setProperty('--i', String(Math.min(index, 12)));

  const info = dueInfo(task.due);
  const dueTone = info?.overdue ? 'is-overdue' : info?.isToday ? 'is-today' : '';
  const dueChip = info
    ? `<button type="button" class="due-chip ${dueTone}" data-action="due" title="${escapeHtml(fullDue(task.due))}">
         <svg aria-hidden="true"><use href="#i-calendar"></use></svg>
         <span>${escapeHtml(info.text)}</span>
       </button>`
    : `<button type="button" class="due-chip no-due" data-action="due" title="安排时间">
         <svg aria-hidden="true"><use href="#i-calendar"></use></svg>
         <span>安排时间</span>
       </button>`;

  const note = task.note
    ? `<p class="task-note">${escapeHtml(task.note)}</p>`
    : '';

  const dragHandle = done
    ? ''
    : `<button type="button" class="drag-handle" aria-label="拖动调整优先级" title="拖动调整优先级">
         <svg aria-hidden="true"><use href="#i-grip"></use></svg>
       </button>`;

  const check = done
    ? `<span class="check checked" aria-hidden="true"><svg><use href="#i-check"></use></svg></span>`
    : `<button type="button" class="check" data-action="check" aria-label="标记完成">
         <svg aria-hidden="true"><use href="#i-check"></use></svg>
       </button>`;

  const actions = done
    ? `<div class="task-actions">
         <button type="button" class="restore-btn" data-action="restore">恢复</button>
         <button type="button" class="icon-btn danger" data-action="delete" title="删除" aria-label="删除">
           <svg aria-hidden="true"><use href="#i-trash"></use></svg>
         </button>
       </div>`
    : `<div class="task-actions">
         <button type="button" class="icon-btn" data-action="note" title="备注" aria-label="备注">
           <svg aria-hidden="true"><use href="#i-note"></use></svg>
         </button>
         <button type="button" class="icon-btn danger" data-action="delete" title="删除" aria-label="删除">
           <svg aria-hidden="true"><use href="#i-trash"></use></svg>
         </button>
       </div>`;

  const metaRow = done
    ? `<div class="task-meta">
         <span class="due-chip is-done-time">
           <svg aria-hidden="true"><use href="#i-clock"></use></svg>
           <span>${escapeHtml(formatDoneAt(task.doneAt))}</span>
         </span>
       </div>`
    : `<div class="task-meta">${dueChip}</div>`;

  li.innerHTML = `
    ${dragHandle}
    ${check}
    <div class="task-body">
      <div class="task-title" role="button" tabindex="${done ? -1 : 0}">${escapeHtml(task.title)}</div>
      ${note}
      ${metaRow}
    </div>
    ${actions}
  `;

  return li;
}

function doneItem(task) {
  const li = document.createElement('li');
  li.className = 'done-item';
  li.dataset.id = task.id;
  li.innerHTML = `
    <span class="check checked" aria-hidden="true"><svg><use href="#i-check"></use></svg></span>
    <div class="task-body">
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="done-time">${escapeHtml(formatDoneAt(task.doneAt))}</span>
    </div>
    <div class="done-actions">
      <button type="button" class="icon-btn" data-action="restore" title="放回清单" aria-label="放回清单">
        <svg aria-hidden="true"><use href="#i-repeat"></use></svg>
      </button>
      <button type="button" class="icon-btn danger" data-action="delete" title="删除" aria-label="删除">
        <svg aria-hidden="true"><use href="#i-trash"></use></svg>
      </button>
    </div>
  `;
  return li;
}

function emptyState(kind) {
  const li = document.createElement('li');
  li.className = 'empty';

  const configs = {
    today: {
      icon: 'i-sun',
      title: '今天还没有安排',
      text: '空空的也很好。想做什么，就写下来吧。',
      action: '添加一件小事',
    },
    planned: {
      icon: 'i-calendar',
      title: '还没有安排时间',
      text: '给想做的事定个日子，期待就会开始。',
      action: '去添加',
    },
    all: {
      icon: 'i-heart',
      title: '我们的清单还是空的',
      text: '从一件很小很小的事开始，比如一起散步。',
      action: '写下第一件小事',
    },
    done: {
      icon: 'i-check-circle',
      title: '还没有完成记录',
      text: '完成一件小事，它就会在这里变成回忆。',
      action: '去看看今天',
    },
    search: {
      icon: 'i-search',
      title: state.query ? `没有找到「${state.query}」` : '没有找到',
      text: '换个词试试，或者把它加进我们的清单。',
      action: '添加这件事',
    },
  };

  const config = configs[kind] || configs.today;
  li.innerHTML = `
    <span class="empty-art"><svg aria-hidden="true"><use href="#${config.icon}"></use></svg></span>
    <h4>${escapeHtml(config.title)}</h4>
    <p>${escapeHtml(config.text)}</p>
    <button type="button" class="btn btn-primary">${escapeHtml(config.action)}</button>
  `;

  li.querySelector('button').addEventListener('click', () => {
    if (kind === 'done') {
      setFilter('today');
      return;
    }
    if (kind === 'search' && state.query.trim()) {
      els.taskInput.value = state.query.trim();
      state.query = '';
      els.searchInput.value = '';
      renderList();
      renderDoneSection();
    }
    focusComposer();
  });

  return li;
}

function renderDoneSection() {
  if (state.filter === 'done') {
    els.doneSection.hidden = true;
    return;
  }

  const list = state.completed;
  if (!list.length) {
    els.doneSection.hidden = true;
    els.doneList.innerHTML = '';
    els.doneCount.textContent = '0';
    return;
  }

  els.doneSection.hidden = false;
  els.doneCount.textContent = String(list.length);
  els.doneToggle.classList.toggle('open', state.doneOpen);
  els.doneToggle.setAttribute('aria-expanded', state.doneOpen ? 'true' : 'false');
  els.doneList.hidden = !state.doneOpen;
  els.doneList.innerHTML = '';

  const visible = visibleCompleted();
  if (!visible.length && state.query.trim()) {
    els.doneSection.hidden = true;
    return;
  }

  visible.forEach((task) => {
    els.doneList.append(doneItem(task));
  });
}

function renderAnniversary() {
  const anniversary = state.meta.anniversary;

  if (!anniversary) {
    els.anniversaryDays.textContent = '＋';
    els.anniversaryUnit.textContent = '设置';
    els.anniversaryLabel.textContent = '我们的纪念日';
    return;
  }

  const diff = Math.round(
    (startOfDay(new Date()) - new Date(`${anniversary}T00:00:00`)) / 86400000,
  );
  if (diff >= 0) {
    els.anniversaryDays.textContent = String(diff + 1);
    els.anniversaryUnit.textContent = '天';
    els.anniversaryLabel.textContent = '我们已经在一起';
  } else {
    els.anniversaryDays.textContent = String(Math.abs(diff) + 1);
    els.anniversaryUnit.textContent = '天后';
    els.anniversaryLabel.textContent = '距离我们的纪念日';
  }
}

function renderComposeDue() {
  const info = dueInfo(state.composeDue);
  if (info) {
    els.composeDueText.textContent = info.text;
    els.composeDueBtn.classList.add('has-due');
  } else {
    els.composeDueText.textContent = '时间';
    els.composeDueBtn.classList.remove('has-due');
  }
}

function focusComposer() {
  els.taskInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => els.taskInput.focus({ preventScroll: true }), 260);
}

function setFilter(filter) {
  if (state.filter === filter) return;
  state.filter = filter;
  closeDue();
  renderAll();
  if (window.innerWidth <= 860) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* -------------------------------- 交互：任务 ------------------------------ */

async function addTask(raw) {
  const original = String(raw || '').trim();
  if (!original) {
    els.composer.classList.remove('shake');
    void els.composer.offsetWidth;
    els.composer.classList.add('shake');
    els.taskInput.focus();
    toast('先写一件想做的小事吧');
    return;
  }

  const parsed = parseNatural(original);
  const title = (parsed.title || original).trim();
  const due = state.composeDue || parsed.due || null;

  els.addBtn.disabled = true;
  try {
    const data = await api('/api/tasks', {
      method: 'POST',
      body: { title, due },
    });

    state.tasks.push(data.task);
    els.taskInput.value = '';
    state.composeDue = null;
    els.composeHint.textContent = '';
    els.composeHint.classList.remove('show');
    renderAll();

    if (state.filter === 'done') {
      setFilter('today');
    } else {
      const visible = visibleTasks().some((t) => t.id === data.task.id);
      if (!visible) {
        if (data.task.due && state.filter === 'today') setFilter('planned');
        else setFilter('all');
      }
    }

    window.requestAnimationFrame(() => {
      const li = els.taskList.querySelector(`[data-id="${data.task.id}"]`);
      if (!li) return;
      li.classList.add('just-added');
      li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    toast('记下啦，等我们一起完成 ♡');
  } catch (error) {
    if (!error.silent) toast(error.message, 'error');
  } finally {
    els.addBtn.disabled = false;
  }
}

async function toggleDone(id) {
  const task = getTask(id);
  if (!task) return;

  const li = els.taskList.querySelector(`.task[data-id="${id}"]`);
  li?.classList.add('is-completing');

  try {
    const data = await api(`/api/tasks/${id}`, { method: 'PATCH', body: { done: true } });
    state.tasks = state.tasks.filter((t) => t.id !== id);
    state.completed = [data.task, ...state.completed.filter((t) => t.id !== id)];
    renderAll();
    toast('又完成一件幸福的小事 ♡', {
      actionLabel: '撤销',
      onAction: () => restoreTask(id),
    });
  } catch (error) {
    li?.classList.remove('is-completing');
    if (!error.silent) toast(error.message, 'error');
  }
}

async function restoreTask(id) {
  try {
    const data = await api(`/api/tasks/${id}`, { method: 'PATCH', body: { done: false } });
    state.completed = state.completed.filter((t) => t.id !== id);
    const index = Math.max(0, Math.min(data.index ?? state.tasks.length, state.tasks.length));
    state.tasks.splice(index, 0, data.task);
    renderAll();
    toast('已经放回清单啦');
  } catch (error) {
    if (!error.silent) toast(error.message, 'error');
  }
}

async function deleteTask(id) {
  const task = getTask(id);
  if (!task) return;

  const ok = await confirmDialog({
    title: '删掉这件小事？',
    text: `「${task.title}」会从清单里消失，删除后不能恢复。`,
    okText: '删除',
  });
  if (!ok) return;

  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    removeLocal(id);
    renderAll();
    toast('已经删掉啦');
  } catch (error) {
    if (!error.silent) toast(error.message, 'error');
  }
}

function startInlineEdit(li, task) {
  if (!li || li.classList.contains('is-done') || li.classList.contains('editing')) return;
  const titleEl = li.querySelector('.task-title');
  if (!titleEl) return;

  li.classList.add('editing');
  const input = document.createElement('input');
  input.className = 'title-edit';
  input.value = task.title;
  input.maxLength = 240;
  input.setAttribute('aria-label', '修改任务标题');
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;

  const finish = async (save) => {
    if (finished) return;
    finished = true;
    const value = input.value.trim();

    if (save && value && value !== task.title) {
      try {
        const data = await api(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: { title: value },
        });
        Object.assign(task, data.task);
        toast('改好啦');
      } catch (error) {
        if (!error.silent) toast(error.message, 'error');
      }
    }

    renderList();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finished = true;
      renderList();
    }
  });
}

function openNote(task) {
  state.noteTarget = task.id;
  els.noteTaskTitle.textContent = task.title;
  els.noteInput.value = task.note || '';
  openModal(els.noteModal);
  window.setTimeout(() => els.noteInput.focus(), 80);
}

async function saveNote() {
  const id = state.noteTarget;
  const task = id ? getTask(id) : null;
  if (!task) {
    closeModal(els.noteModal);
    return;
  }

  try {
    const data = await api(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: { note: els.noteInput.value },
    });
    Object.assign(task, data.task);
    closeModal(els.noteModal);
    state.noteTarget = null;
    renderAll();
    toast('备注收好啦');
  } catch (error) {
    if (!error.silent) toast(error.message, 'error');
  }
}

async function clearCompleted() {
  if (!state.completed.length) return;
  const ok = await confirmDialog({
    title: '清除完成记录？',
    text: `这 ${state.completed.length} 件已完成的小事会从记录里消失，确定要清理吗？`,
    okText: '清除',
  });
  if (!ok) return;

  try {
    await api('/api/tasks/clear-completed', { method: 'POST' });
    state.completed = [];
    renderAll();
    toast('完成记录已经清理干净');
  } catch (error) {
    if (!error.silent) toast(error.message, 'error');
  }
}

/* ------------------------------- 时间选择器 ------------------------------ */

function openDue(target, anchor) {
  state.dueTarget = target;
  const due = target.compose ? state.composeDue : getTask(target.id)?.due;
  const date = due ? due.slice(0, 10) : '';
  const time = due && due.length > 10 ? due.slice(11, 16) : '';

  els.dueDate.value = date;
  els.dueTime.value = time;
  els.duePopover.hidden = false;
  els.duePopover.style.left = '';
  els.duePopover.style.top = '';

  if (window.innerWidth > 720 && anchor) {
    const rect = anchor.getBoundingClientRect();
    const pop = els.duePopover;
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;

    let left = rect.left;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (left < 12) left = 12;

    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 12) {
      top = Math.max(12, rect.top - height - 8);
    }

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
}

function closeDue() {
  if (els.duePopover.hidden) {
    state.dueTarget = null;
    return;
  }
  els.duePopover.hidden = true;
  els.duePopover.style.left = '';
  els.duePopover.style.top = '';
  state.dueTarget = null;
}

function quickDate(kind) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);

  if (kind === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (kind === 'after') d.setDate(d.getDate() + 2);
  else if (kind === 'weekend') {
    const left = (6 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + left);
  } else if (kind === 'nextweek') {
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    const toMonday = (8 - dow) % 7 || 7;
    d.setDate(d.getDate() + toMonday);
  }

  return dateKey(d);
}

async function applyDue(due) {
  const target = state.dueTarget;
  if (!target) return;

  if (target.compose) {
    state.composeDue = due;
    renderComposeDue();
    closeDue();
    const info = dueInfo(due);
    if (due && info) toast(`安排在 ${info.text}`);
    els.taskInput.focus();
    return;
  }

  const task = getTask(target.id);
  if (!task) {
    closeDue();
    return;
  }

  try {
    const data = await api(`/api/tasks/${target.id}`, {
      method: 'PATCH',
      body: { due },
    });
    Object.assign(task, data.task);
    closeDue();
    renderAll();
    const info = dueInfo(due);
    toast(due && info ? `时间改成 ${info.text} 啦` : '已清除时间');
  } catch (error) {
    if (!error.silent) toast(error.message, 'error');
  }
}

function saveDueFromInputs() {
  const date = els.dueDate.value;
  const time = els.dueTime.value;
  if (!date) {
    toast('先选一个日期吧');
    return;
  }
  applyDue(time ? `${date}T${time}` : date);
}

/* -------------------------------- 智能解析 ------------------------------- */

function parseNatural(raw) {
  const original = String(raw || '').trim();
  if (!original) return { title: '', due: null };

  const now = new Date();
  const year = now.getFullYear();
  let dateStr = null;
  let timeStr = null;
  let text = original;

  const setDate = (y, m, d) => {
    const probe = new Date(y, m - 1, d);
    if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
      return false;
    }
    dateStr = `${y}-${pad2(m)}-${pad2(d)}`;
    return true;
  };

  const full = text.match(/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/);
  if (full && setDate(Number(full[1]), Number(full[2]), Number(full[3]))) {
    text = text.replace(full[0], ' ');
  }

  if (!dateStr) {
    const md = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
    if (md && setDate(year, Number(md[1]), Number(md[2]))) {
      text = text.replace(md[0], ' ');
    }
  }

  if (!dateStr) {
    const rel = text.match(/大后天|今晚|明晚|后晚|今天|明天|后天/);
    if (rel) {
      const map = { 今天: 0, 明天: 1, 后天: 2, 大后天: 3, 今晚: 0, 明晚: 1, 后晚: 2 };
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + map[rel[0]]);
      dateStr = dateKey(d);
      if (rel[0].endsWith('晚') && !timeStr) timeStr = '19:00';
      text = text.replace(rel[0], ' ');
    }
  }

  if (!dateStr) {
    const weekend = text.match(/(下下|下|这)?\s*(?:个)?\s*周末/);
    if (weekend) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      const left = (6 - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + left + (weekend[1] === '下' ? 7 : weekend[1] === '下下' ? 14 : 0));
      dateStr = dateKey(d);
      text = text.replace(weekend[0], ' ');
    }
  }

  if (!dateStr) {
    const wd = text.match(/(下下|下)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
    if (wd) {
      const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
      const target = map[wd[2]];
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      const current = d.getDay();
      let delta;

      if (wd[1]) {
        const currentMon = current === 0 ? 7 : current;
        const toNextMonday = 8 - currentMon;
        const offset = target === 0 ? 6 : target - 1;
        delta = toNextMonday + offset + (wd[1] === '下下' ? 7 : 0);
      } else {
        delta = (target - current + 7) % 7;
      }

      d.setDate(d.getDate() + delta);
      dateStr = dateKey(d);
      text = text.replace(wd[0], ' ');
    }
  }

  const timeMatch = text.match(
    /(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})\s*(?:[:：]\s*(\d{2})|点\s*(半|\d{1,2})?|时\s*(半|\d{1,2})?)/,
  );

  if (timeMatch) {
    let hour = Number(timeMatch[2]);
    let minute = 0;
    if (timeMatch[3] !== undefined) minute = Number(timeMatch[3]);
    else if (timeMatch[4] === '半') minute = 30;
    else if (timeMatch[4] !== undefined) minute = Number(timeMatch[4]);

    const period = timeMatch[1];
    if (period === '下午' || period === '傍晚' || period === '晚上') {
      if (hour < 12) hour += 12;
    } else if (period === '中午') {
      if (hour < 11) hour += 12;
    } else if (period === '凌晨') {
      if (hour === 12) hour = 0;
    }

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      timeStr = `${pad2(hour)}:${pad2(minute)}`;
      text = text.replace(timeMatch[0], ' ');
    }
  }

  if (!dateStr && timeStr) dateStr = todayKey();

  text = text
    .replace(/^[\s,，。.、;；:：~～\-—·]+|[\s,，。.、;；:：~～\-—·]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const title = text || original;

  return {
    title,
    due: dateStr ? `${dateStr}${timeStr ? `T${timeStr}` : ''}` : null,
  };
}

/* --------------------------------- 拖拽 --------------------------------- */

let dragState = null;

function startDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const handle = event.target.closest('.drag-handle');
  if (!handle) return;
  const li = handle.closest('.task');
  if (!li || state.filter === 'done') return;

  event.preventDefault();

  const rect = li.getBoundingClientRect();
  const ghost = li.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.appendChild(ghost);

  li.classList.add('drag-origin');
  document.body.classList.add('is-dragging');

  dragState = {
    li,
    ghost,
    pointerId: event.pointerId,
    offsetY: event.clientY - rect.top,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };

  try {
    handle.setPointerCapture(event.pointerId);
  } catch {
    /* 某些浏览器不支持，无妨 */
  }

  window.addEventListener('pointermove', moveDrag, { passive: false });
  window.addEventListener('pointerup', endDrag, { once: true });
  window.addEventListener('pointercancel', endDrag, { once: true });
}

function moveDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  event.preventDefault();

  const st = dragState;
  if (Math.abs(event.clientY - st.startY) > 3) st.moved = true;

  st.ghost.style.top = `${event.clientY - st.offsetY}px`;
  const tilt = Math.max(-2.5, Math.min(2.5, (event.clientX - st.startX) * 0.06));
  st.ghost.style.transform = `rotate(1.5deg) scale(1.015) translateX(${tilt}px)`;

  const items = $$('.task:not(.drag-origin)', els.taskList);
  let before = null;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) {
      before = item;
      break;
    }
  }

  if (before) els.taskList.insertBefore(st.li, before);
  else els.taskList.appendChild(st.li);

  const edge = 90;
  if (event.clientY < edge) window.scrollBy(0, -14);
  else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 14);
}

async function endDrag() {
  if (!dragState) return;
  const st = dragState;
  dragState = null;

  window.removeEventListener('pointermove', moveDrag);
  st.ghost.remove();
  st.li.classList.remove('drag-origin');
  document.body.classList.remove('is-dragging');

  suppressClickUntil = Date.now() + 280;
  if (!st.moved) return;

  const visibleIds = $$('.task', els.taskList)
    .map((li) => li.dataset.id)
    .filter(Boolean);

  const visibleSet = new Set(visibleIds);
  const allIds = state.tasks.map((task) => task.id);
  let pointer = 0;
  const merged = allIds.map((id) => (visibleSet.has(id) ? visibleIds[pointer++] : id));
  const map = new Map(state.tasks.map((task) => [task.id, task]));
  state.tasks = merged.map((id) => map.get(id)).filter(Boolean);

  try {
    await api('/api/tasks/reorder', { method: 'POST', body: { ids: merged } });
    renderList();
    toast('优先级更新啦');
  } catch (error) {
    if (!error.silent) toast(error.message || '排序没保存上', 'error');
    await loadTasks().catch(() => {});
    renderAll();
  }
}

/* --------------------------------- 弹窗 --------------------------------- */

function openModal(modal) {
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeModal(modal) {
  modal.hidden = true;
  if ([els.noteModal, els.settingsModal, els.confirmModal].every((m) => m.hidden)) {
    document.body.classList.remove('modal-open');
  }
  if (modal === els.confirmModal) settleConfirm(false);
}

function closeAllModals() {
  [els.noteModal, els.settingsModal, els.confirmModal].forEach((modal) => {
    modal.hidden = true;
  });
  document.body.classList.remove('modal-open');
  if (state.confirmResolve) {
    state.confirmResolve(false);
    state.confirmResolve = null;
  }
}

function confirmDialog({ title, text, okText = '确定' }) {
  els.confirmTitle.textContent = title;
  els.confirmText.textContent = text;
  els.confirmOk.textContent = okText;
  openModal(els.confirmModal);

  return new Promise((resolve) => {
    state.confirmResolve = resolve;
  });
}

function settleConfirm(value) {
  els.confirmModal.hidden = true;
  document.body.classList.remove('modal-open');
  const resolve = state.confirmResolve;
  state.confirmResolve = null;
  if (resolve) resolve(value);
}

function openSettings() {
  els.anniversaryInput.value = state.meta.anniversary || '';
  openModal(els.settingsModal);
}

async function saveSettings() {
  const value = els.anniversaryInput.value || null;
  try {
    const data = await api('/api/meta', { method: 'PATCH', body: { anniversary: value } });
    state.meta = data.meta || { ...state.meta, anniversary: value };
    closeModal(els.settingsModal);
    renderAnniversary();
    toast('纪念日收好啦 ♡');
  } catch (error) {
    if (!error.silent) toast(error.message, 'error');
  }
}

/* --------------------------------- Toast -------------------------------- */

function toast(message, options = {}) {
  const { actionLabel, onAction, tone, duration = 3600 } = options;

  els.toastHost.innerHTML = '';
  const el = document.createElement('div');
  el.className = `toast${tone === 'error' ? ' error' : ''}`;

  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);

  if (actionLabel && onAction) {
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = actionLabel;
    action.addEventListener('click', async () => {
      el.remove();
      try {
        await onAction();
      } catch (error) {
        if (!error.silent) toast(error.message, 'error');
      }
    });
    el.appendChild(action);
  }

  els.toastHost.appendChild(el);
  window.requestAnimationFrame(() => el.classList.add('show'));

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 260);
  }, duration);
}

/* --------------------------------- 事件绑定 ------------------------------- */

function bindApp() {
  $$('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => setFilter(button.dataset.filter));
  });

  els.composer.addEventListener('submit', (event) => {
    event.preventDefault();
    addTask(els.taskInput.value);
  });

  els.taskInput.addEventListener('input', () => {
    const raw = els.taskInput.value;
    if (!raw.trim()) {
      els.composeHint.classList.remove('show');
      return;
    }

    const parsed = parseNatural(raw);
    if (parsed.due && parsed.title !== raw.trim()) {
      const info = dueInfo(parsed.due);
      els.composeHint.textContent = `已识别时间：${info?.text || ''} · 标题「${parsed.title}」`;
      els.composeHint.classList.add('show');
    } else {
      els.composeHint.classList.remove('show');
    }
  });

  els.composeDueBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openDue({ compose: true }, els.composeDueBtn);
  });

  els.searchInput.addEventListener('input', () => {
    state.query = els.searchInput.value;
    renderList();
    renderDoneSection();
  });

  els.taskList.addEventListener('click', (event) => {
    if (Date.now() < suppressClickUntil) return;

    const li = event.target.closest('.task');
    if (!li) return;
    const id = li.dataset.id;
    const task = getTask(id);
    if (!task) return;

    const actionEl = event.target.closest('[data-action]');
    const action = actionEl?.dataset.action;

    if (action === 'check') {
      event.stopPropagation();
      toggleDone(id);
      return;
    }

    if (action === 'due') {
      event.stopPropagation();
      openDue({ id }, actionEl);
      return;
    }

    if (action === 'note') {
      event.stopPropagation();
      openNote(task);
      return;
    }

    if (action === 'delete') {
      event.stopPropagation();
      deleteTask(id);
      return;
    }

    if (action === 'restore') {
      event.stopPropagation();
      restoreTask(id);
      return;
    }

    if (event.target.closest('.task-title') && !li.classList.contains('is-done')) {
      startInlineEdit(li, task);
    }
  });

  els.taskList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const title = event.target.closest('.task-title');
    if (!title) return;
    const li = title.closest('.task');
    const task = li ? getTask(li.dataset.id) : null;
    if (!li || !task) return;
    event.preventDefault();
    startInlineEdit(li, task);
  });

  els.taskList.addEventListener('pointerdown', startDrag);

  els.doneList.addEventListener('click', (event) => {
    const li = event.target.closest('.done-item');
    if (!li) return;
    const id = li.dataset.id;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'restore') restoreTask(id);
    else if (action === 'delete') deleteTask(id);
  });

  els.doneToggle.addEventListener('click', () => {
    state.doneOpen = !state.doneOpen;
    renderDoneSection();
  });

  els.clearDoneBtn.addEventListener('click', clearCompleted);

  els.anniversaryBtn.addEventListener('click', openSettings);
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsSave.addEventListener('click', saveSettings);
  els.settingsLogout.addEventListener('click', logout);
  els.logoutBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '要暂时离开吗？',
      text: '退出后需要重新输入账号密码才能回来。',
      okText: '退出登录',
    });
    if (ok) logout();
  });

  els.fabAdd.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => els.taskInput.focus({ preventScroll: true }), 320);
  });

  els.dueClose.addEventListener('click', closeDue);
  els.dueSave.addEventListener('click', saveDueFromInputs);
  els.dueClear.addEventListener('click', () => applyDue(null));

  $$('#duePopover [data-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      applyDue(quickDate(button.dataset.quick));
    });
  });

  els.noteSave.addEventListener('click', saveNote);

  [els.noteModal, els.settingsModal, els.confirmModal].forEach((modal) => {
    $$('[data-close]', modal).forEach((node) => {
      node.addEventListener('click', () => {
        if (modal === els.confirmModal) {
          settleConfirm(false);
          return;
        }
        closeModal(modal);
        if (modal === els.noteModal) state.noteTarget = null;
      });
    });
  });

  els.confirmCancel.addEventListener('click', () => settleConfirm(false));
  els.confirmOk.addEventListener('click', () => settleConfirm(true));

  document.addEventListener('pointerdown', (event) => {
    if (els.duePopover.hidden) return;
    if (event.target.closest('#duePopover')) return;
    if (event.target.closest('.due-chip, #composeDueBtn')) return;
    closeDue();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!els.confirmModal.hidden) {
        settleConfirm(false);
        return;
      }
      if (!els.noteModal.hidden) {
        closeModal(els.noteModal);
        state.noteTarget = null;
        return;
      }
      if (!els.settingsModal.hidden) {
        closeModal(els.settingsModal);
        return;
      }
      if (!els.duePopover.hidden) {
        closeDue();
        return;
      }
      if (document.activeElement === els.searchInput) {
        els.searchInput.value = '';
        state.query = '';
        renderList();
        renderDoneSection();
      }
      return;
    }

    if (event.key === '/' && !isTyping(event.target) && !els.appView.hidden) {
      event.preventDefault();
      els.taskInput.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (!els.duePopover.hidden) closeDue();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (els.appView.hidden || !state.hydrated) return;
    if (Date.now() - state.lastLoad < 90 * 1000) return;
    if (dragState || document.body.classList.contains('modal-open')) return;
    if (isTyping(document.activeElement)) return;

    loadTasks()
      .then(renderAll)
      .catch(() => {});
  });
}

/* --------------------------------- 启动 --------------------------------- */

async function boot() {
  makeLoginHearts();
  bindLogin();
  bindApp();

  const seed = seedForToday();
  els.heroQuote.textContent = QUOTES[seed % QUOTES.length];
  els.dailyQuote.textContent = QUOTES[(seed + 4) % QUOTES.length];

  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.authenticated) {
      state.user = data.user;
      await loadTasks();
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin('暂时连不上服务器，稍后再试试');
  }

  hideBoot();
}

boot();
