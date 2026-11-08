'use strict';
// 同期（アプリ側）。ラズパイの同期サーバー（server/server.js）と、vault の平らなフォルダを突き合わせる
//   base（最後に同期したときの hash）と、手元・サーバーの現在の hash を比べて、取る・置く・消す・競合を決める
//   競合（両方が変わった）: 新しいほうが本体。古いほうは「競合」のコピーとして、未整理のノート（D_u…）に残す
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const hashOf = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 20);
const okName = n => n && n === path.basename(n) && !n.startsWith('.') && !n.endsWith('.tmp') && !n.includes('\0') && n.length < 200;
const STATE = '.pkm-sync.json';

function scan(dir) {
  const out = new Map();
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isFile() || !okName(d.name)) continue;
    const b = fs.readFileSync(path.join(dir, d.name)), st = fs.statSync(path.join(dir, d.name));
    out.set(d.name, { hash: hashOf(b), mtime: Math.round(st.mtimeMs) });
  }
  return out;
}
const trash = (dir, n) => { fs.mkdirSync(path.join(dir, '.trash'), { recursive: true }); fs.renameSync(path.join(dir, n), path.join(dir, `.trash/${Date.now()}-${n}`)); };

// 競合のコピーを、未整理のノートとして手元に作る
function conflictCopy(dir, name, buf, why) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const stamp = x => `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}${p(x.getHours())}${p(x.getMinutes())}${p(x.getSeconds())}`;
  let t = d.getTime(), n = `${stamp(new Date(t))}.md`; while (fs.existsSync(path.join(dir, n))) n = `${stamp(new Date(t += 1000))}.md`;
  const created = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  fs.writeFileSync(path.join(dir, n), `---\nsource: "digital"\ncreated: "${created}"\nupdated: "${created}"\ntitle: ${JSON.stringify('競合 ' + name)}\n---\n# 競合 ${name}\n\n<!-- body -->\n競合: ${name}（${why}）\n\n---\n\n${buf.toString('utf8')}\n<!-- nav -->\n`);
  return n;
}

function create({ dir, url, token }) {
  url = url.replace(/\/+$/, '');
  const hdr = extra => ({ Authorization: 'Bearer ' + token, ...(extra || {}) });
  const api = (p, o = {}) => fetch(url + p, { ...o, headers: hdr(o.headers) });
  const loadBase = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, STATE), 'utf8')).base || {}; } catch { return {}; } };
  const saveBase = base => fs.writeFileSync(path.join(dir, STATE), JSON.stringify({ base }));
  let running = null;

  async function syncOnce() {
    const r = await api('/api/files'); if (!r.ok) throw new Error(r.status === 401 ? '合言葉が違います' : `サーバーに入れません (${r.status})`);
    const remote = new Map((await r.json()).map(f => [f.name, f])), local = scan(dir), base = loadBase();
    const res = { pulled: [], pushed: [], deleted: [], conflicts: [] };
    const pull = async n => {
      const g = await api('/api/file/' + encodeURIComponent(n)); if (!g.ok) return;
      const buf = Buffer.from(await g.arrayBuffer()), tmp = path.join(dir, n + '.tmp');
      fs.writeFileSync(tmp, buf); fs.renameSync(tmp, path.join(dir, n)); base[n] = hashOf(buf); res.pulled.push(n);
    };
    const push = async (n, b) => {
      const buf = fs.readFileSync(path.join(dir, n));
      const p = await api('/api/file/' + encodeURIComponent(n), { method: 'PUT', body: buf, headers: { 'X-Base-Hash': b || '' } });
      if (!p.ok) throw new Error(`${n} を送れません (${p.status})`);
      const j = await p.json(); base[n] = j.hash; res.pushed.push(n); if (j.conflict) res.conflicts.push(j.conflict);
    };
    for (const n of new Set([...local.keys(), ...remote.keys(), ...Object.keys(base)])) {
      const L = local.get(n), R = remote.get(n), B = base[n];
      if (L && R) {
        if (L.hash === R.hash) base[n] = L.hash;
        else if (L.hash === B) await pull(n);                         // 手元は変えていない → 取る
        else if (R.hash === B) await push(n, R.hash);                 // サーバーは変わっていない → 置く
        else if (L.mtime >= R.mtime) await push(n, B || '');          // 両方変わった: 手元が新しい → 手元が本体（古い版はサーバーが競合コピーに）
        else { res.conflicts.push(conflictCopy(dir, n, fs.readFileSync(path.join(dir, n)), '手元にあった古い版')); await pull(n); }
      } else if (L && !R) {
        if (B && B === L.hash) { trash(dir, n); delete base[n]; res.deleted.push(n); }   // サーバーで消された（手元は変えていない）
        else await push(n, '');                                       // 新しい、または消された後に手元で変えた → 置く
      } else if (!L && R) {
        if (B && B === R.hash) {                                      // 手元で消した → サーバーでも消す
          const d = await api('/api/file/' + encodeURIComponent(n), { method: 'DELETE', headers: { 'X-Base-Hash': B } });
          if (d.ok) { delete base[n]; res.deleted.push(n); } else await pull(n);
        } else await pull(n);
      } else delete base[n];
    }
    saveBase(base); return res;
  }
  // 同時に2つ走らせない
  const run = () => running || (running = syncOnce().finally(() => { running = null; }));
  // サーバーからの変更の通知（SSE）。切れたら、少し待ってつなぎ直す
  function watch(onEvent) {
    let stop = false, ctl = null;
    (async function loop() {
      while (!stop) {
        try {
          ctl = new AbortController();
          const r = await fetch(url + '/api/events', { headers: hdr(), signal: ctl.signal }); const rd = r.body.getReader(), dec = new TextDecoder();
          while (!stop) { const { value, done } = await rd.read(); if (done) break; if (/data:/.test(dec.decode(value))) onEvent(); }
        } catch { }
        if (!stop) await new Promise(ok => setTimeout(ok, 4000));
      }
    })();
    return () => { stop = true; try { ctl && ctl.abort(); } catch { } };
  }
  return { sync: run, watch };
}
module.exports = { create, scan, hashOf, okName };
