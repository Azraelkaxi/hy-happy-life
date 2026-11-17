import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DUE_RE = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE = 240;
const MAX_NOTE = 4000;

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

const nowIso = () => new Date().toISOString();

function normalizeTask(input, done) {
  if (!input || typeof input !== 'object' || typeof input.id !== 'string') return null;
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, MAX_TITLE) : '';
  if (!title) return null;
  return {
    id: input.id,
    title,
    note: typeof input.note === 'string' ? input.note.slice(0, MAX_NOTE) : '',
    due: typeof input.due === 'string' && DUE_RE.test(input.due) ? input.due : null,
    done: Boolean(done),
    doneAt: done && typeof input.doneAt === 'string' ? input.doneAt : null,
    prevIndex: Number.isInteger(input.prevIndex) ? input.prevIndex : 0,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : nowIso(),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : nowIso(),
  };
}

function validateDue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !DUE_RE.test(value)) {
    throw new AppError(400, '时间格式不对哦');
  }
  const date = value.slice(0, 10);
  const [y, m, d] = date.split('-').map(Number);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    throw new AppError(400, '这个日期不存在呢');
  }
  return value;
}

function validateAnniversary(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new AppError(400, '纪念日格式不对哦');
  }
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    throw new AppError(400, '这个日期不存在呢');
  }
  return value;
}

function cleanTitle(value) {
  const title = String(value ?? '').trim();
  if (!title) throw new AppError(400, '写点什么再记下吧');
  if (Array.from(title).length > MAX_TITLE) {
    throw new AppError(400, `标题最多 ${MAX_TITLE} 个字`);
  }
  return title;
}

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'tasks.json');
    this.writeChain = Promise.resolve();
    this.state = {
      version: 1,
      tasks: [],
      completed: [],
      meta: {
        anniversary: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    };
  }

  async init() {
    await fsp.mkdir(this.dir, { recursive: true });

    let raw = null;
    try {
      raw = await fsp.readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        this.state = this.normalizeState(parsed);
      } catch (err) {
        const broken = `${this.file}.broken-${Date.now()}`;
        await fsp.copyFile(this.file, broken).catch(() => {});
        console.error('[store] tasks.json 读取失败，已备份到', broken, err.message);
      }
    }

    if (!raw) await this.writeNow();
    await this.backupIfNeeded();
  }

  normalizeState(parsed) {
    const meta = parsed && parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const tasks = Array.isArray(parsed?.tasks)
      ? parsed.tasks.map((t) => normalizeTask(t, false)).filter(Boolean)
      : [];
    const completed = Array.isArray(parsed?.completed)
      ? parsed.completed.map((t) => normalizeTask(t, true)).filter(Boolean)
      : [];

    return {
      version: 1,
      tasks,
      completed,
      meta: {
        anniversary: typeof meta.anniversary === 'string' && DATE_RE.test(meta.anniversary)
          ? meta.anniversary
          : null,
        createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : nowIso(),
        updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : nowIso(),
      },
    };
  }

  snapshot() {
    return {
      tasks: this.state.tasks,
      completed: this.state.completed,
      meta: this.state.meta,
    };
  }

  find(id) {
    return (
      this.state.tasks.find((task) => task.id === id) ||
      this.state.completed.find((task) => task.id === id) ||
      null
    );
  }

  async create({ title, due, note }) {
    const task = {
      id: crypto.randomUUID(),
      title: cleanTitle(title),
      note: typeof note === 'string' ? note.slice(0, MAX_NOTE) : '',
      due: validateDue(due),
      done: false,
      doneAt: null,
      prevIndex: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    this.state.tasks.push(task);
    this.touch();
    await this.persistNow();
    return task;
  }

  async update(id, patch) {
    const task = this.find(id);
    if (!task) throw new AppError(404, '这件小事已经不在啦');

    const activeIndex = this.state.tasks.findIndex((t) => t.id === id);
    const inCompleted = activeIndex === -1;

    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      task.title = cleanTitle(patch.title);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'note')) {
      task.note = String(patch.note ?? '').slice(0, MAX_NOTE);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'due')) {
      task.due = validateDue(patch.due);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'done')) {
      const nextDone = Boolean(patch.done);
      if (nextDone && !inCompleted) {
        this.state.tasks.splice(activeIndex, 1);
        task.prevIndex = activeIndex;
        task.done = true;
        task.doneAt = nowIso();
        task.updatedAt = nowIso();
        this.state.completed.unshift(task);
      } else if (!nextDone && inCompleted) {
        this.state.completed = this.state.completed.filter((t) => t.id !== id);
        task.done = false;
        task.doneAt = null;
        task.updatedAt = nowIso();
        const index = Math.max(0, Math.min(task.prevIndex ?? 0, this.state.tasks.length));
        this.state.tasks.splice(index, 0, task);
      }
    }

    task.updatedAt = nowIso();
    this.touch();
    await this.persistNow();
    const index = this.state.tasks.findIndex((t) => t.id === id);
    return { task, index };
  }

  async remove(id) {
    const task = this.find(id);
    if (!task) throw new AppError(404, '这件小事已经不在啦');
    this.state.tasks = this.state.tasks.filter((t) => t.id !== id);
    this.state.completed = this.state.completed.filter((t) => t.id !== id);
    this.touch();
    await this.persistNow();
    return task;
  }

  async reorder(ids) {
    if (!Array.isArray(ids)) throw new AppError(400, '排序数据不对');

    const current = new Map(this.state.tasks.map((task) => [task.id, task]));
    if (ids.length !== current.size) throw new AppError(400, '排序数据不完整');

    const seen = new Set();
    const next = [];
    for (const id of ids) {
      if (typeof id !== 'string' || !current.has(id) || seen.has(id)) {
        throw new AppError(400, '排序数据不对');
      }
      seen.add(id);
      next.push(current.get(id));
    }

    this.state.tasks = next;
    this.touch();
    await this.persistNow();
    return next;
  }

  async clearCompleted() {
    const count = this.state.completed.length;
    this.state.completed = [];
    this.touch();
    await this.persistNow();
    return count;
  }

  async updateMeta(patch) {
    if (!patch || typeof patch !== 'object') throw new AppError(400, '数据不对');
    if (Object.prototype.hasOwnProperty.call(patch, 'anniversary')) {
      this.state.meta.anniversary = validateAnniversary(patch.anniversary);
    }
    this.touch();
    await this.persistNow();
    return this.state.meta;
  }

  touch() {
    this.state.meta.updatedAt = nowIso();
  }

  async persistNow() {
    this.writeChain = this.writeChain
      .then(() => this.writeNow())
      .catch((err) => {
        console.error('[store] 写入失败:', err.message);
      });
    return this.writeChain;
  }

  async writeNow() {
    const tmp = `${this.file}.tmp`;
    const body = JSON.stringify(this.state, null, 2);
    await fsp.writeFile(tmp, body, 'utf8');
    try {
      await fsp.rename(tmp, this.file);
    } catch (err) {
      if (['EEXIST', 'EPERM', 'EACCES'].includes(err.code)) {
        await fsp.rm(this.file, { force: true });
        await fsp.rename(tmp, this.file);
      } else {
        throw err;
      }
    }
  }

  async flush() {
    await this.writeChain;
  }

  async backupIfNeeded() {
    try {
      const dir = path.join(this.dir, 'backups');
      await fsp.mkdir(dir, { recursive: true });
      const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json')).sort();

      if (files.length) {
        const newest = path.join(dir, files[files.length - 1]);
        const stat = await fsp.stat(newest);
        if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) return;
      }

      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      await fsp.copyFile(this.file, path.join(dir, `tasks-${stamp}.json`));

      const all = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
      for (const file of all.slice(0, Math.max(0, all.length - 14))) {
        await fsp.rm(path.join(dir, file), { force: true });
      }
    } catch (err) {
      console.error('[store] 备份失败:', err.message);
    }
  }
}
