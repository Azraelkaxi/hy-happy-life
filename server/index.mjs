import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadEnv } from './env.mjs';
import { AppError, Store } from './store.mjs';
import {
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from './auth.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const USER = process.env.AUTH_USER || 'hy';
const PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH || '';
const SESSION_DAYS = Math.min(365, Math.max(1, Number(process.env.SESSION_DAYS || 30)));
const SESSION_TTL = SESSION_DAYS * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'hy_session';
const COOKIE_SECURE_SETTING = (process.env.COOKIE_SECURE || 'auto').toLowerCase();

if (!PASSWORD_HASH || !PASSWORD_HASH.startsWith('scrypt$')) {
  console.error('[boot] 缺少 AUTH_PASSWORD_HASH。先运行: npm run hash-password -- "你的密码"');
  process.exit(1);
}

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('[boot] 未设置 SESSION_SECRET，本次运行使用临时密钥，重启后需要重新登录。');
}
if (SECRET.length < 16) {
  console.error('[boot] SESSION_SECRET 太短，至少 16 个字符。');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const store = new Store(DATA_DIR);

/* ---------------------------------- 小工具 --------------------------------- */

function json(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

async function readJson(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) {
    throw new AppError(415, '请求格式不对');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new AppError(413, '内容太长啦');
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, '内容格式不对');
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function requestIsSecure(req) {
  if (COOKIE_SECURE_SETTING === 'true') return true;
  if (COOKIE_SECURE_SETTING === 'false') return false;
  return (
    Boolean(req.socket.encrypted) ||
    String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
  );
}

function sessionCookie(value, req) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL / 1000)}`,
  ];
  if (requestIsSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie(req) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (requestIsSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const session = verifySessionToken(token, SECRET);
  if (!session || session.u !== USER) return null;
  return USER;
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function checkOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    if (parsed.host !== req.headers.host) throw new Error('origin mismatch');
  } catch {
    throw new AppError(403, '来源不被允许');
  }
}

/* -------------------------------- 登录限流 --------------------------------- */

const loginGuard = new Map();

function guardWait(ip) {
  const entry = loginGuard.get(ip);
  if (!entry) return 0;
  if (entry.blockedUntil && entry.blockedUntil > Date.now()) {
    return Math.ceil((entry.blockedUntil - Date.now()) / 1000);
  }
  return 0;
}

function guardFail(ip) {
  const now = Date.now();
  let entry = loginGuard.get(ip);
  if (!entry || now - entry.firstAt > 15 * 60 * 1000) {
    entry = { count: 0, firstAt: now, blockedUntil: 0 };
  }
  entry.count += 1;
  if (entry.count >= 5) {
    const extra = Math.min(300, 30 * 2 ** (entry.count - 5));
    entry.blockedUntil = now + extra * 1000;
  }
  loginGuard.set(ip, entry);
}

function guardReset(ip) {
  loginGuard.delete(ip);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginGuard) {
    if (now - entry.firstAt > 30 * 60 * 1000 && (!entry.blockedUntil || entry.blockedUntil < now)) {
      loginGuard.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref();

/* ---------------------------------- 接口 ---------------------------------- */

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method || 'GET';

  checkOrigin(req);

  if (pathname === '/api/session' && method === 'GET') {
    return json(res, 200, {
      authenticated: Boolean(currentUser(req)),
      user: USER,
      serverTime: new Date().toISOString(),
    });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const ip = clientIp(req);
    const wait = guardWait(ip);
    if (wait > 0) {
      throw new AppError(429, `试错太多啦，请 ${wait} 秒后再试`);
    }

    const body = await readJson(req);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    const passwordOk = verifyPassword(password, PASSWORD_HASH);
    const userOk = username === USER;

    if (!userOk || !passwordOk) {
      guardFail(ip);
      throw new AppError(401, '账号或密码不对哦');
    }

    guardReset(ip);
    const token = createSessionToken(USER, SECRET, SESSION_TTL);
    return json(
      res,
      200,
      { ok: true, user: USER },
      { 'Set-Cookie': sessionCookie(token, req) },
    );
  }

  const user = currentUser(req);

  if (pathname === '/api/auth/logout' && method === 'POST') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(req) });
  }

  if (!user) {
    throw new AppError(401, '先登录再进来哦');
  }

  if (pathname === '/api/tasks' && method === 'GET') {
    return json(res, 200, {
      ...store.snapshot(),
      serverTime: new Date().toISOString(),
    });
  }

  if (pathname === '/api/tasks' && method === 'POST') {
    const body = await readJson(req);
    const task = await store.create({
      title: body.title,
      due: body.due,
      note: body.note,
    });
    return json(res, 201, { task });
  }

  if (pathname === '/api/tasks/reorder' && method === 'POST') {
    const body = await readJson(req);
    await store.reorder(body.ids);
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/tasks/clear-completed' && method === 'POST') {
    const count = await store.clearCompleted();
    return json(res, 200, { ok: true, count });
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([0-9a-f-]{36})$/i);
  if (taskMatch && method === 'PATCH') {
    const body = await readJson(req);
    const patch = {};
    for (const key of ['title', 'note', 'due', 'done']) {
      if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key];
    }
    const result = await store.update(taskMatch[1], patch);
    return json(res, 200, result);
  }

  if (taskMatch && method === 'DELETE') {
    const task = await store.remove(taskMatch[1]);
    return json(res, 200, { ok: true, task });
  }

  if (pathname === '/api/meta' && method === 'PATCH') {
    const body = await readJson(req);
    const meta = await store.updateMeta({ anniversary: body.anniversary });
    return json(res, 200, { meta });
  }

  throw new AppError(404, '没有这个接口');
}

/* --------------------------------- 静态资源 -------------------------------- */

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new AppError(405, '不支持这个请求');
  }

  if (url.pathname === '/healthz') {
    return json(res, 200, {
      ok: true,
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  }

  if (url.pathname === '/favicon.ico') {
    res.writeHead(204, SECURITY_HEADERS);
    return res.end();
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new AppError(400, '地址不对');
  }

  let file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    throw new AppError(404, '没有找到');
  }

  let stat = null;
  try {
    stat = await fsp.stat(file);
  } catch {
    stat = null;
  }

  if (!stat || stat.isDirectory()) {
    if (path.extname(pathname) !== '') throw new AppError(404, '没有找到');
    file = path.join(PUBLIC_DIR, 'index.html');
    stat = await fsp.stat(file);
  }

  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const isFresh = ext === '.html' || ext === '.js' || ext === '.css' || ext === '.webmanifest';
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': isFresh ? 'no-cache' : 'public, max-age=3600',
    ETag: etag,
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ---------------------------------- 服务器 --------------------------------- */

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let pathname = '/';

  res.on('finish', () => {
    if (!pathname.startsWith('/api/')) return;
    const ms = Date.now() - started;
    console.log(
      `${new Date().toISOString()} ${req.method} ${pathname} ${res.statusCode} ${ms}ms`,
    );
  });

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, SECURITY_HEADERS);
      return res.end();
    }

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (status >= 500) console.error('[server]', err);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    json(res, status, {
      error: status >= 500 ? '服务开小差了，稍后再试' : err.message,
    });
  }
});

await store.init();

server.listen(PORT, HOST, () => {
  console.log(`[boot] 小吴小王的幸福生活已启动 http://${HOST}:${PORT}`);
  console.log(`[boot] 数据目录 ${DATA_DIR}`);
});

server.on('error', (err) => {
  console.error('[server]', err.message);
  process.exit(1);
});

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log(`[boot] 收到 ${signal}，正在保存数据…`);
    server.close(async () => {
      await store.flush();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
