#!/usr/bin/env node
'use strict';
// YuriiKasten 同期サーバー（ラズパイ用。依存なし・Node.js 18 以上）
//   vault（平らなフォルダ）の「正」の置き場。PC とスマホが、ここと同期する
//   起動: YURIIKASTEN_DATA=~/YuriiKasten-vault YURIIKASTEN_TOKEN=... node server.js
//   つなぎ方: http://<ラズパイ>:8787 ＋ 合言葉（Authorization: Bearer <token>）
//   API:
//     GET    /api/files            [{name, hash, mtime, size}]
//     GET    /api/file/<name>      中身
//     PUT    /api/file/<name>      中身を置く。ヘッダ X-Base-Hash（相手が最後に見た版の hash）。食い違えば競合
//     DELETE /api/file/<name>      .trash へ（X-Base-Hash つき）
//     GET    /api/events           変更の通知（SSE）
//   競合: 新しいほうが本体。古いほうは「競合」のコピーとして、未整理（D_u…）のノートに残す
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');

const DATA = path.resolve((process.env.YURIIKASTEN_DATA || path.join(os.homedir(), 'YuriiKasten-vault')).replace(/^~/, os.homedir()));
const PORT = +process.env.YURIIKASTEN_PORT || 8787;
const HOST = process.env.YURIIKASTEN_HOST || '0.0.0.0';
const TOKEN_FILE = path.join(DATA, '..', '.yuriikasten-token');
fs.mkdirSync(DATA, { recursive: true });
let TOKEN = process.env.YURIIKASTEN_TOKEN;
if (!TOKEN) {
  try { TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { }
  if (!TOKEN) { TOKEN = crypto.randomBytes(24).toString('base64url'); fs.writeFileSync(TOKEN_FILE, TOKEN + '\n', { mode: 0o600 }); }
}

const hashOf = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 20);
// 同期する名前: 平らなフォルダのファイルだけ（サブフォルダ・隠しファイル・一時ファイルは対象外）
const okName = n => n && n === path.basename(n) && !n.startsWith('.') && !n.endsWith('.tmp') && !n.includes('\0') && n.length < 200;
const abs = n => path.join(DATA, n);
const list = () => fs.readdirSync(DATA, { withFileTypes: true }).filter(d => d.isFile() && okName(d.name)).map(d => {
  const b = fs.readFileSync(abs(d.name)), st = fs.statSync(abs(d.name));
  return { name: d.name, hash: hashOf(b), mtime: Math.round(st.mtimeMs), size: b.length };
});
const trash = n => { fs.mkdirSync(abs('.trash'), { recursive: true }); fs.renameSync(abs(n), abs(`.trash/${Date.now()}-${n}`)); };

const clients = new Set();
const notify = (name, op) => { const msg = `data: ${JSON.stringify({ name, op, t: Date.now() })}\n\n`; for (const c of clients) c.write(msg); };

// 競合のコピー: 未整理のノートとして残す（D_u<日時>.md）
function keepConflict(name, buf, why) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const stem = `u${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  let n = `D_${stem}.md`, i = 1; while (fs.existsSync(abs(n))) n = `D_${stem}-${i++}.md`;
  const created = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  const body = `競合: ${name}（${why}）\n\n---\n\n${buf.toString('utf8')}`;
  fs.writeFileSync(abs(n), `<!-- pkm ${JSON.stringify({ created, keywords: [], kind: 'text', title: `競合 ${name}` })} -->\n# 競合 ${name}\n\n<!-- body -->\n${body}\n<!-- nav -->\n`);
  notify(n, 'put'); return n;
}

const readBody = req => new Promise((ok, ng) => { const a = []; let n = 0; req.on('data', c => { n += c.length; if (n > 200 * 1024 * 1024) { ng(new Error('too large')); req.destroy(); } else a.push(c); }); req.on('end', () => ok(Buffer.concat(a))); req.on('error', ng); });
const send = (res, code, obj) => { const b = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)); res.writeHead(code, { 'Content-Type': typeof obj === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Length': b.length }); res.end(b); };

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/' || u.pathname === '/health') return send(res, 200, 'YuriiKasten sync server');
    const tk = (req.headers.authorization || '').replace(/^Bearer /, '') || u.searchParams.get('token');
    const a = Buffer.from(tk || ''), b = Buffer.from(TOKEN);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 401, '合言葉が違います');
    if (u.pathname === '/api/files' && req.method === 'GET') return send(res, 200, list());
    if (u.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n'); clients.add(res); const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); }); return;
    }
    const m = u.pathname.match(/^\/api\/file\/(.+)$/);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (!okName(name)) return send(res, 400, '名前が使えません');
      const base = req.headers['x-base-hash'] || '';
      const cur = fs.existsSync(abs(name)) ? fs.readFileSync(abs(name)) : null, curHash = cur ? hashOf(cur) : '';
      if (req.method === 'GET') return cur ? (res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': cur.length, 'X-Hash': curHash }), res.end(cur)) : send(res, 404, 'ありません');
      if (req.method === 'PUT') {
        const body = await readBody(req), h = hashOf(body);
        if (cur && curHash !== base && curHash !== h) { // 食い違い: 新しいほう（いま届いたほう）を本体に。古いほうは競合のコピーへ
          const c = keepConflict(name, cur, 'サーバーにあった古い版'); fs.writeFileSync(abs(name), body); notify(name, 'put');
          return send(res, 200, { hash: h, conflict: c });
        }
        const tmp = abs(name + '.tmp'); fs.writeFileSync(tmp, body); fs.renameSync(tmp, abs(name)); notify(name, 'put');
        return send(res, 200, { hash: h });
      }
      if (req.method === 'DELETE') {
        if (!cur) return send(res, 200, { ok: true });
        if (curHash !== base) return send(res, 409, { conflict: true, hash: curHash }); // 相手が知らない版に変わっている: 消さない
        trash(name); notify(name, 'delete'); return send(res, 200, { ok: true });
      }
    }
    send(res, 404, 'ない');
  } catch (e) { send(res, 500, String(e.message || e)); }
});
server.listen(PORT, HOST, () => console.log(`YuriiKasten 同期サーバー http://${HOST}:${PORT}  データ: ${DATA}\n合言葉: ${TOKEN_FILE}（または環境変数）`));
