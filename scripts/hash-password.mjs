import crypto from 'node:crypto';

const password = process.argv[2];

if (!password) {
  console.error('用法: npm run hash-password -- "你的密码"');
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });

console.log(`scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`);
