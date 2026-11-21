// Apps Script 계정 저장소 흉내(로컬 시험용): Code.gs와 같은 동작. 실행: node tools/apps_script/mock_server.mjs → 앱 설정(마스터)에서 계정 저장소 주소를 http://localhost:8766 으로
import http from 'node:http';
const accs = new Map(), vaults = new Map();
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Headers': 'content-type' }); return res.end(); }
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    let q = {}; try { q = JSON.parse(b); } catch {}
    const out = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (q.action === 'ping') return out({ ok: true, app: 'seoks-stock' });
    const a = accs.get(q.h);
    if (q.action === 'salt') return out(a ? { ok: true, salt: a.salt, iter: a.iter } : { ok: false, error: 'none' });
    if (q.action === 'register') { if (a) return out({ ok: false, error: 'dup' }); accs.set(q.h, { ...q }); return out({ ok: true, role: 'member', name: q.name }); }
    if (!a) return out({ ok: false, error: 'none' });
    if (q.ver !== a.ver) return out({ ok: false, error: 'wrong' });
    if (q.action === 'login') return out({ ok: true, name: a.name, role: 'member', box: vaults.get(q.h) || null });
    if (q.action === 'push') { vaults.set(q.h, q.box); console.log('push', q.h.slice(0, 8), JSON.stringify(q.box).length); return out({ ok: true }); }
    out({ ok: false, error: 'unknown' });
  });
}).listen(8766, () => console.log('mock on 8766'));
