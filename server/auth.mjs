import crypto from 'node:crypto';

const SCRYPT_RE = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([0-9a-f]+)\$([0-9a-f]+)$/i;
const MAXMEM = 64 * 1024 * 1024;

export function hashPassword(password, { N = 16384, r = 8, p = 1, keylen = 32 } = {}) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, keylen, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const match = SCRYPT_RE.exec(String(stored || ''));
  if (!match) return false;

  const [, n, r, p, saltHex, hashHex] = match;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length < 8 || expected.length < 16) return false;

  let actual;
  try {
    actual = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createSessionToken(user, secret, ttlMs) {
  const payload = Buffer.from(
    JSON.stringify({ u: user, exp: Date.now() + ttlMs }),
    'utf8',
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token, secret) {
  if (typeof token !== 'string' || token.length > 4096) return null;

  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data.u !== 'string') return null;
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
