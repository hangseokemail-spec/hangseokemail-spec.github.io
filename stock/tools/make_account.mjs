// 계정 항목 만들기: node tools/make_account.mjs <아이디> <비밀번호> [role] [이름]
// 비밀번호와 아이디 원문은 파일에 남기지 않고, 해시·검증값만 config/accounts.json에 넣는다.
import { webcrypto as C } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const [id, pw, role = 'member', name = ''] = process.argv.slice(2);
if (!id || !pw) { console.error('usage: make_account.mjs id pw [role] [name]'); process.exit(1); }
const enc = new TextEncoder();
const b64 = (u8) => Buffer.from(u8).toString('base64');
const h = Buffer.from(await C.subtle.digest('SHA-256', enc.encode(`ss-acct:${id.toLowerCase()}`))).toString('hex');
const salt = C.getRandomValues(new Uint8Array(16));
const iter = 310000;
const key = await C.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
const bits = new Uint8Array(await C.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array([...salt, ...enc.encode(id.toLowerCase())]), iterations: iter }, key, 512));
const ver = b64(bits.slice(0, 32));
const path = new URL('../config/accounts.json', import.meta.url);
let j = { version: 1, accounts: [] };
try { j = JSON.parse(await readFile(path, 'utf8')); } catch { /* new */ }
j.accounts = j.accounts.filter((a) => a.h !== h);
j.accounts.push({ h, salt: b64(salt), iter, ver, role, name: name || (role === 'master' ? '마스터' : '사용자') });
await writeFile(path, JSON.stringify(j, null, 1) + '\n');
console.log('saved', h.slice(0, 8), role);
