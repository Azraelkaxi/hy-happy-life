const BASE = process.env.BASE || 'http://127.0.0.1:3210';
const USER = process.env.SMOKE_USER || 'hy';
const PASS = process.env.SMOKE_PASS || 'wjh&wjy1314520';

let cookie = '';

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: res.status, data, headers: res.headers };
}

const results = [];
function check(name, condition, extra = '') {
  results.push({ name, ok: Boolean(condition), extra });
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
}

const sessionBefore = await request('/api/session');
check('session before login', sessionBefore.status === 200 && sessionBefore.data.authenticated === false);

const wrong = await request('/api/auth/login', {
  method: 'POST',
  body: { username: USER, password: 'wrong-password' },
  auth: false,
});
check('wrong password rejected', wrong.status === 401, String(wrong.status));

const login = await request('/api/auth/login', {
  method: 'POST',
  body: { username: USER, password: PASS },
  auth: false,
});
check('login', login.status === 200 && login.data.ok === true, String(login.status));
check('session cookie set', Boolean(cookie));

const created = await request('/api/tasks', {
  method: 'POST',
  body: { title: 'smoke test · 一起吃火锅', due: '2030-01-01T19:00', note: '测试备注' },
});
check('create task', created.status === 201 && created.data.task?.id, String(created.status));
const id = created.data.task?.id;

const patched = await request(`/api/tasks/${id}`, {
  method: 'PATCH',
  body: { title: 'smoke test · 改好标题', due: '2030-01-02' },
});
check('patch task', patched.status === 200 && patched.data.task.title.includes('改好标题'));

const listed = await request('/api/tasks');
check('list tasks', listed.status === 200 && listed.data.tasks.some((t) => t.id === id));

const done = await request(`/api/tasks/${id}`, { method: 'PATCH', body: { done: true } });
check('complete task', done.status === 200 && done.data.task.done === true);

const restored = await request(`/api/tasks/${id}`, { method: 'PATCH', body: { done: false } });
check('restore task', restored.status === 200 && restored.data.task.done === false);

const meta = await request('/api/meta', {
  method: 'PATCH',
  body: { anniversary: '2024-05-20' },
});
check('update meta', meta.status === 200 && meta.data.meta.anniversary === '2024-05-20');

const reorder = await request('/api/tasks/reorder', {
  method: 'POST',
  body: { ids: (await request('/api/tasks')).data.tasks.map((t) => t.id) },
});
check('reorder', reorder.status === 200);

const removed = await request(`/api/tasks/${id}`, { method: 'DELETE' });
check('delete task', removed.status === 200);

const resetMeta = await request('/api/meta', { method: 'PATCH', body: { anniversary: null } });
check('reset meta', resetMeta.status === 200);

const logout = await request('/api/auth/logout', { method: 'POST' });
check('logout', logout.status === 200);

const sessionAfter = await request('/api/session');
check('session after logout', sessionAfter.data.authenticated === false);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
