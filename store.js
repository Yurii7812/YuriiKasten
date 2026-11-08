// 保存フォルダの読み書き。全部を1つのフォルダに平らに置く（サブフォルダは .trash だけ）
//   20261108073511.md  ノート（デジタルも紙も。名前は作った日時 YYYYMMDDHHmmss。同じ秒ならずらす）
//                      先頭の YAML（---）に folgezettel（ID。無ければIDなし）・source・created・updated・keywords・kind・title
//   20261108073511.jpg 紙のノートのスキャン画像（ノートと同じ名前）
//   T_<名前>.md        トピックIndex
//   D_2026-11-07-タイトル.md   日記（タイトルは任意）  P_2026-11-07.jpg / P_2026-11-07_2.jpg  紙の日記
//   C_ K_ *.json   チャットメモ・役のライブラリ（なりきり・キャンバスはノートの一種で、データはノートの中）
//   Index.md / デジタル.md / 紙.md / 日記.md   グローバルIndex と、一覧
//   <日時>.<拡張子>    添付（画像・html・csv など。タイトルと元の名前は K_files.json）
// ノートの下に 前・次・上・分岐・トピックIndex のリンクがあるので、リンクだけで全部に届く
// .md は Brave の Markdown Viewer でも開ける（リンクはすべて同じフォルダの中）
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const PRE = { d: 'D_', p: 'P_' };
const LIST = { d: 'デジタル.md', p: '紙.md' };
const UNSORTED = '未整理.md', KEYWORDS = 'キーワード.md';
const DIARY_LIST = '日記.md';
const DOC_PRE = /^(C|K)_.+\.json$/; // チャットメモ・役のライブラリ（JSON）。なりきり・キャンバスは今はノート
const SP = { d: 'デジタル', p: '紙' };
const IMG = ['.jpg', '.jpeg', '.png', '.webp'];
const validId = s => L.isId(s) && !/^\d{8,}$/.test(s); // 日時名のファイルは除外
const isStem = s => validId(s) || L.isNoid(s); // ノートのファイル名（IDか、IDなしの日時名）
const enc = s => encodeURIComponent(s);
const esc = s => String(s).replace(/([\\`*_[\]<>|#])/g, '\\$1'); // Markdown の中
const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); // HTML の中
const a = (href, text) => `<a href="${href}">${text}</a>`;
const J = o => JSON.stringify(o).replace(/--/g, '-\\u002d');
const meta = (text, tag) => { const m = text.match(new RegExp(`^<!-- ${tag} (.*) -->`, 'm')); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };
const BODY = '<!-- body -->\n', NAV = '\n<!-- nav -->';
const SUB = 'style="color:#888;font-size:.9em"';
const sep = '　｜　';
const MARK = '.pkm-layout'; // 平らな置き方になったことの印（昔の置き方を二度読まないため）

// 添付の名前。D_ P_ T_ で始まる名前や、Index などとぶつかるときは F_ を付け、同名があれば -1, -2 …
const RESERVED = /^(D_|P_|T_|C_|R_|K_|V_)|^(Index|デジタル|紙|日記|未整理|キーワード)\.md$|^\./;
function uniqueName(dir, name) {
  let base = path.basename(name).replace(/[\\/:*?"<>|]/g, '_') || 'file';
  if (RESERVED.test(base)) base = 'F_' + base.replace(/^\.+/, '');
  const ext = path.extname(base), stem = path.basename(base, ext);
  let f = base, i = 0;
  while (fs.existsSync(path.join(dir, f))) f = `${stem}-${++i}${ext}`;
  return f;
}
const encRel = n => encodeURIComponent(n).replace(/[()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// ===== 昔の置き方を平らに移す =====
// v1: 直下に <ID>.md / <ID>.jpg（frontmatter つき）  v2: digital/ paper/ topic/ files/
function flatten(vault) {
  const p = (...x) => path.join(vault, ...x);
  const move = (from, to) => { if (fs.existsSync(to)) to = p(uniqueName(vault, path.basename(to))); fs.renameSync(from, to); return path.basename(to); };
  const linkMap = { d: {}, p: {} };
  // v2 のフォルダ
  for (const [s, dir] of [['d', 'digital'], ['p', 'paper']]) {
    if (!fs.existsSync(p(dir))) continue;
    for (const f of fs.readdirSync(p(dir))) {
      const full = p(dir, f); if (fs.statSync(full).isDirectory()) continue;
      const e = path.extname(f).toLowerCase(), id = path.basename(f, e);
      if (validId(id) && (e === '.md' || IMG.includes(e))) move(full, p(PRE[s] + id + e));
      else move(full, p(f.endsWith('.old') ? PRE[s] + f : f)); // 昔の読み捨て（.old）など
    }
    const files = p(dir, 'files');
    if (fs.existsSync(files)) {
      for (const f of fs.readdirSync(files)) {
        const full = path.join(files, f);
        if (fs.statSync(full).isDirectory()) { // files/<ID>/名前
          for (const g of fs.readdirSync(full)) linkMap[s][`files/${encRel(f)}/${encRel(g)}`] = encRel(move(path.join(full, g), p(uniqueName(vault, g))));
          try { fs.rmdirSync(full); } catch { }
        } else linkMap[s][`files/${encRel(f)}`] = encRel(move(full, p(uniqueName(vault, f))));
      }
      try { fs.rmdirSync(files); } catch { }
    }
    try { fs.rmdirSync(p(dir)); } catch { }
  }
  if (fs.existsSync(p('topic'))) {
    for (const f of fs.readdirSync(p('topic'))) move(p('topic', f), p(f.endsWith('.md') ? 'T_' + f : f));
    try { fs.rmdirSync(p('topic')); } catch { }
  }
  // 本文の添付リンクを書き換える
  for (const s of ['d', 'p']) {
    if (!Object.keys(linkMap[s]).length) continue;
    for (const f of fs.readdirSync(vault)) {
      if (!f.startsWith(PRE[s]) || !f.endsWith('.md')) continue;
      const text = fs.readFileSync(p(f), 'utf8'); let out = text;
      for (const [x, y] of Object.entries(linkMap[s])) out = out.split(`](${x})`).join(`](${y})`);
      if (out !== text) fs.writeFileSync(p(f), out);
    }
  }
  // v1: 直下の <ID>.md / <ID>.jpg
  const legacy = [];
  for (const f of fs.readdirSync(vault)) {
    const e = path.extname(f).toLowerCase(), id = path.basename(f, e);
    if (validId(id) && (e === '.md' || IMG.includes(e)) && fs.statSync(p(f)).isFile()) legacy.push([f, e, id]);
  }
  for (const [f, e, id] of legacy) {
    const hasImg = IMG.some(x => fs.existsSync(p(id + x)));
    const s = hasImg ? 'p' : 'd';
    if (e !== '.md') { move(p(f), p(PRE.p + id + e)); continue; }
    const text = fs.readFileSync(p(f), 'utf8');
    const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/), fm = {};
    if (m) m[1].split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) fm[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    const date = (fm.date || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    const created = s === 'd' ? (date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')} 00:00` : L.now(fs.statSync(p(f)).mtime)) : '';
    const body = (m ? m[2] : text).replace(/\n$/, '');
    fs.writeFileSync(p(PRE[s] + id + '.md'), `<!-- pkm ${J(s === 'd' ? { created, keywords: L.splitKw(fm.keywords) } : { keywords: L.splitKw(fm.keywords) })} -->\n# ${id}\n\n${BODY}${body}\n${NAV}\n`);
    fs.renameSync(p(f), p(f + '.old'));
  }
}


// ===== 昔の名前（D_<ID>.md / P_<ID>.md / D_u….md）を、日時の名前に移す =====
// 初回は vault 全体を .backup-<日時> に複製してから。ID・作成時刻は YAML に書き写す。ほかのファイルの中のリンク・ID も直す
const free14 = (used, date) => { for (let i = 0; ; i++) { const st = L.noidStem(new Date(date.getTime() + i * 1000)); if (!used.has(st)) { used.add(st); return st; } } };
function migrateStems(vault) {
  const p = (...x) => path.join(vault, ...x);
  const files = fs.readdirSync(vault, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name);
  const legacy = files.filter(f => { const m = f.match(/^[DP]_(.+)\.md$/); return m && isStem(m[1]); }).sort();
  if (!legacy.length) return;
  const stamp = L.noidStem(), first = !fs.readdirSync(vault).some(f => f.startsWith('.backup-'));
  const bk = p('.backup-' + stamp); fs.mkdirSync(bk, { recursive: true });
  for (const f of first ? files : legacy.concat(files.filter(x => /^[DP]_.+\.(jpe?g|png|webp)$/i.test(x)))) fs.copyFileSync(p(f), path.join(bk, f));
  const used = new Set(files.map(f => f.match(/^(\d{14})(?:\.|$)/)).filter(Boolean).map(m => m[1]));
  const fileMap = new Map(), idMap = new Map();
  // 同じ ID（同じ source）の新しい形式のノートが、もうあるとき: 昔の形式のほうは、新しく作らず（複製を増やさない）、バックアップに残して消す
  const have = new Set();
  for (const f of files) { const m = f.match(/^\d{14}(?:-\d+)?\.md$/); if (!m) continue; const y = L.fmParse(fs.readFileSync(p(f), 'utf8')).meta; if (y && y.folgezettel !== undefined) have.add((y.source === 'paper' ? 'P_' : 'D_') + y.folgezettel); }
  for (const f of legacy) {
    const [, pre, id] = f.match(/^([DP])_(.+)\.md$/), s = pre.toLowerCase();
    if (have.has(pre + '_' + id)) { fs.unlinkSync(p(f)); continue; }
    have.add(pre + '_' + id);
    const text = fs.readFileSync(p(f), 'utf8');
    const md = meta(text, 'pkm') || {}, data = meta(text, 'pkm-data'), mt = fs.statSync(p(f)).mtime;
    const created = (md.created || (s === 'p' ? '' : L.now(mt))).replace(/^(\d{4}-\d\d-\d\d \d\d:\d\d)$/, '$1:00'), c = created ? L.parseTime(created) : mt;
    const stem = free14(used, c || mt), noid = L.isNoid(id);
    const i = text.indexOf(BODY), j = text.indexOf(NAV), body = i >= 0 ? text.slice(i + BODY.length, j > i ? j : undefined) : text;
    const y = { folgezettel: noid ? undefined : id, source: s === 'p' ? 'paper' : 'digital', created: created || L.now(c || mt), updated: L.now(mt), kind: md.kind && md.kind !== 'text' ? md.kind : undefined, title: md.title || undefined, keywords: (md.keywords || []).length ? md.keywords : undefined };
    fs.writeFileSync(p(stem + '.md'), L.fmDump(y) + (data ? `<!-- pkm-data ${J(data)} -->\n` : '') + BODY + body.replace(/\n+$/, '') + '\n' + NAV + '\n');
    fs.unlinkSync(p(f)); fileMap.set(f, stem + '.md'); if (noid) idMap.set(id, stem);
    for (const e of IMG) if (fs.existsSync(p(`${pre}_${id}${e}`))) { fs.renameSync(p(`${pre}_${id}${e}`), p(stem + e)); fileMap.set(`${pre}_${id}${e}`, stem + e); }
  }
  // ほかのファイルの中のリンクと、IDなしのノートの ID を直す
  for (const f of fs.readdirSync(vault, { withFileTypes: true }).filter(d => d.isFile() && /\.(md|json)$/.test(d.name)).map(d => d.name)) {
    const text = fs.readFileSync(p(f), 'utf8'); let out = text;
    for (const [from, to] of fileMap) { const ef = enc(from).replace(/%5F/g, '_'); for (const x of new Set([from, ef])) for (const q of ['(', '"']) out = out.split(q + x).join(q + to); }
    for (const [from, to] of idMap) out = out.split(`"${from}"`).join(`"${to}"`);
    if (out !== text) fs.writeFileSync(p(f), out);
  }
}

// ===== 昔の日記（D_2026-11-08.md / D_2026-11-08-タイトル.md）を、日時の名前＋YAML（record: 日記）に移す =====
function migrateDiaries(vault) {
  const p = (...x) => path.join(vault, ...x);
  const files = fs.readdirSync(vault, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name);
  const legacy = files.filter(f => /^D_\d{4}-\d{2}-\d{2}(?:-.*)?\.md$/.test(f)).sort();
  if (!legacy.length) return;
  const bk = p('.backup-' + L.noidStem()); fs.mkdirSync(bk, { recursive: true });
  for (const f of legacy) fs.copyFileSync(p(f), path.join(bk, f));
  const used = new Set(files.map(f => f.match(/^(\d{14})(?:\.|$)/)).filter(Boolean).map(m => m[1]));
  const have = new Set();   // 同じ日の「日記」が、もう新しい形式である
  for (const f of files) { if (!/^\d{14}(-\d+)?\.md$/.test(f)) continue; const y = L.fmParse(fs.readFileSync(p(f), 'utf8')).meta; if (y && y.record !== undefined && y.date) have.add(y.record + '\n' + y.date); }
  const fileMap = new Map();
  for (const f of legacy) {
    const [, date, name] = f.match(/^D_(\d{4}-\d{2}-\d{2})(?:-(.*))?\.md$/), text = fs.readFileSync(p(f), 'utf8');
    if (have.has('日記\n' + date)) { fs.unlinkSync(p(f)); continue; }   // 重ねない（バックアップに残してある）
    have.add('日記\n' + date);
    const md = meta(text, 'pkm-diary') || {}, i = text.indexOf(BODY), j = text.indexOf(NAV), body = i >= 0 ? text.slice(i + BODY.length, j > i ? j : undefined) : text;
    const at = L.parseTime(date + ' 05:00:00') || new Date(), stem = free14(used, at), mt = fs.statSync(p(f)).mtime;
    const y = { record: '日記', date, title: (md.title !== undefined ? md.title : name) || undefined, created: L.now(at), updated: L.now(mt) };
    fs.writeFileSync(p(stem + '.md'), L.fmDump(y) + BODY + body.replace(/\n+$/, '') + '\n' + NAV + '\n');
    fs.unlinkSync(p(f)); fileMap.set(f, stem + '.md');
  }
  for (const f of fs.readdirSync(vault, { withFileTypes: true }).filter(d => d.isFile() && /\.(md|json)$/.test(d.name)).map(d => d.name)) {
    const text = fs.readFileSync(p(f), 'utf8'); let out = text;
    for (const [from, to] of fileMap) { const ef = enc(from).replace(/%5F/g, '_'); for (const x of new Set([from, ef])) for (const q of ['(', '"']) out = out.split(q + x).join(q + to); }
    if (out !== text) fs.writeFileSync(p(f), out);
  }
}

function openVault(vault) {
  const notes = new Map(), topics = new Map(), cache = new Map(), diaries = new Map(), pages = new Map(), docs = new Map();
  let readings = {}; // キーワード → 読み（Index の並び）
  const key = (s, id) => s + ':' + id;
  const get = (s, id) => notes.get(key(s, id));
  const abs = f => path.join(vault, f);
  const stemOf = (s, id) => { const n = get(s, id); return n ? n.stem : null; };
  const noteFile = (s, id) => `${stemOf(s, id) || (PRE[s] + id)}.md`;
  const used = new Set(fs.readdirSync(vault).map(f => (f.match(/^(\d{14})(?:\.|$)/) || [])[1]).filter(Boolean));
  const topicFile = name => `T_${L.fileName(name)}.md`;
  const topicHref = name => enc(topicFile(name));
  const noteHref = (s, id) => stemOf(s, id) ? enc(noteFile(s, id)) : '#';
  // ノートの名前（日時 YYYYMMDDHHmmss。同じ秒なら1秒ずつずらす）
  const freeStem = (date = new Date()) => free14(used, date);
  const fmOf = n => L.fmDump({ folgezettel: L.isNoid(n.id) ? undefined : n.id, source: n.s === 'p' ? 'paper' : 'digital', created: n.created, updated: n.updated || n.created, kind: n.kind && n.kind !== 'text' ? n.kind : undefined, title: n.title || undefined, keywords: n.keywords && n.keywords.length ? n.keywords : undefined, pinned: n.pinned ? true : undefined, color: n.color || undefined, archived: n.archived ? true : undefined });
  const DIARY = '日記', dk = (kind, date) => kind + '\n' + date;
  const diaryFile = d => `${d.stem}.md`;
  const diaryHref = d => enc(diaryFile(d));
  // 記録の種類（日記・夢・ビジネス…）。K_records.json = { kinds: [{ name, parent }] }（parent は、新しく作る日の上位の初期値）
  const recDoc = () => docs.get('K_records') || { kinds: [] };
  const kindParent = k => (recDoc().kinds.find(x => x.name === k) || {}).parent || '';
  const kindNames = () => { const out = [DIARY]; for (const k of recDoc().kinds.map(x => x.name).concat([...diaries.values()].map(d => d.kind))) if (k && !out.includes(k)) out.push(k); return out; };
  const saveRecDoc = d => { docs.set('K_records', d); fs.writeFileSync(abs('K_records.json'), JSON.stringify(d, null, 1)); };
  // その日の上位: 日ごとの parent。その種類のその日のノートが無ければ、種類の上位をたどる（その日に無い中間は飛ばす）
  const effParent = day => { let p = day.parent || '', seen = new Set(); while (p && !diaries.has(dk(p, day.date)) && !seen.has(p)) { seen.add(p); p = kindParent(p); } return p && diaries.has(dk(p, day.date)) ? p : ''; };
  // この日のノートの下に並べる、下位の記録。日記には最上位の記録、各記録にはその日にある直接の下位
  const lowerOf = day => [...diaries.values()].filter(o => o.date === day.date && o.kind !== day.kind && (day.kind === DIARY ? (effParent(o) === '' || effParent(o) === DIARY) : effParent(o) === day.kind)).sort((x, y) => x.kind.localeCompare(y.kind, 'ja'));

  // ===== 読み込み =====
  fs.mkdirSync(vault, { recursive: true });
  if (!fs.existsSync(abs(MARK))) { flatten(vault); fs.writeFileSync(abs(MARK), 'flat1\n'); }
  migrateStems(vault); migrateDiaries(vault);
  const recs = new Map();
  for (const f of fs.readdirSync(vault)) {
    let dm;
    if ((dm = f.match(/^P_(\d{4}-\d{2}-\d{2})(?:_(\d+))?\.(jpe?g|png|webp)$/i))) { // 紙の日記のページ
      if (!pages.has(dm[1])) pages.set(dm[1], []);
      pages.get(dm[1]).push(f); continue;
    }
    if ((dm = f.match(/^([RV])_.+\.json$/))) { // 昔の なりきり・キャンバス（ファイル）→ IDなしのノート
      try {
        const d = JSON.parse(fs.readFileSync(abs(f), 'utf8')), kind = dm[1] === 'R' ? 'rp' : 'canvas', stem = freeStem(new Date(d.created || Date.now()));
        const created = L.now(new Date(d.created || Date.now())); notes.set(key('d', stem), { s: 'd', id: stem, stem, created, updated: created, keywords: [], kind, title: d.title || '', data: d, body: L.deriveBody(kind, d), img: null });
        removeFile(f);
      } catch { }
      continue;
    }
    if (DOC_PRE.test(f)) { try { docs.set(f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(abs(f), 'utf8'))); } catch { } continue; }
    const m = f.match(/^(\d{14}(?:-\d+)?)(\.[^.]+)$/);
    if (m) {
      const stem = m[1], e = m[2].toLowerCase(), r = recs.get(stem) || { stem, img: null, fm: null };
      recs.set(stem, r);
      if (e === '.md') { const text = fs.readFileSync(abs(f), 'utf8'); cache.set(f, text); r.text = text; r.fm = L.fmParse(text).meta; r.mtime = fs.statSync(abs(f)).mtime; }
      else if (IMG.includes(e)) r.img = f;
    } else if (/^T_.+\.md$/.test(f)) {
      const text = fs.readFileSync(abs(f), 'utf8'); cache.set(f, text);
      const t = meta(text, 'pkm-topic');
      if (t && t.name) topics.set(t.name, { name: t.name, entry: t.entry || (t.anchors || [])[0] || null, keyword: t.keyword || '', d: t.d || '', p: t.p || '' });
    }
  }
  for (const r of [...recs.values()].sort((x, y) => x.stem < y.stem ? -1 : 1)) {
    if (!r.fm) continue;
    if (r.fm.record !== undefined && r.fm.date) { // 記録（日記・夢…）の、その日のノート
      const text = r.text, i = text.indexOf(BODY), j = text.indexOf(NAV), kind = String(r.fm.record) || DIARY;
      diaries.set(dk(kind, String(r.fm.date)), { kind, date: String(r.fm.date), title: r.fm.title || '', parent: r.fm.parent_record || '', stem: r.stem, created: r.fm.created || '', updated: r.fm.updated || r.fm.created || '', body: L.mdToBody(i >= 0 ? text.slice(i + BODY.length, j > i ? j : undefined) : L.fmParse(text).rest) });
      continue;
    }
    const y = r.fm, sp = y.source === 'paper' ? 'p' : 'd', fz = y.folgezettel !== undefined ? String(y.folgezettel) : '';
    const id = validId(fz) && !get(sp, fz) ? fz : r.stem;   // IDが無い・重なったものは IDなし として残す（消えない）
    const text = r.text, i = text.indexOf(BODY), j = text.indexOf(NAV), kind = y.kind || 'text';
    const created = y.created || L.now(r.mtime || new Date()), n = { s: sp, id, stem: r.stem, created, updated: y.updated || created, keywords: Array.isArray(y.keywords) ? y.keywords : [], kind, title: y.title || '', body: '', img: r.img, data: null, pinned: !!y.pinned, color: y.color || '', archived: !!y.archived };
    if (kind !== 'text') { n.data = meta(text, 'pkm-data') || {}; if (!n.title) n.title = n.data.title || ''; n.data.title = n.title; n.body = L.deriveBody(kind, n.data); }
    else n.body = L.mdToBody(i >= 0 ? text.slice(i + BODY.length, j > i ? j : undefined) : L.fmParse(text).rest);
    notes.set(key(sp, id), n);
  }
  for (const l of pages.values()) l.sort((x, y) => (+((x.match(/_(\d+)\./) || [])[1]) || 1) - (+((y.match(/_(\d+)\./) || [])[1]) || 1));
  for (const f of [KEYWORDS, 'Index.md']) if (fs.existsSync(abs(f))) {   // 読みは キーワード.md に（昔は Index.md）
    const text = fs.readFileSync(abs(f), 'utf8'); cache.set(f, text); const r = (meta(text, 'pkm-index') || {}).readings;
    if (r) { readings = r; break; }
  }

  const FILES = 'K_files';   // 添付の情報: { files: { <保存名>: { orig, title, desc, added } } }
  const blank = (s, id, created) => { const at = created || L.now(); return { s, id, stem: freeStem(L.parseTime(at) || new Date()), created: at, updated: at, keywords: [], body: '', img: null, kind: 'text', data: null }; };

  // ===== 書き出し =====
  const ids = s => [...notes.values()].filter(n => n.s === s && !L.isNoid(n.id)).map(n => n.id).sort(L.cmpId);
  const noidNotes = () => [...notes.values()].filter(n => n.s === 'd' && L.isNoid(n.id)).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  const topicOf = (s, id) => [...topics.values()].find(t => t.entry && t.entry.s === s && t.entry.id === id);
  const label = (s, id) => (s === 'p' ? '紙' : '') + id;

  const titleOfNote = n => n.title ? n.title : n.kind && n.kind !== 'text' ? ((n.data && n.data.title) || (n.kind === 'rp' ? '会話' : 'キャンバス')) : (n.body.split('\n').find(x => x.trim()) || '').replace(/^#+\s*/, '').slice(0, 30);
  // ノートの md（Gnosis 風）:  YAML ／ # 題 ／ ParentBranch: TopicBranch: Topic: ／ 本文 ／ ChildBranch:   空の行は出さない。前・次・一覧へのリンクは Index.md にだけ
  //   ParentBranch ＝ 親（番号の1つ上）　TopicBranch ＝ このノートが入口のトピックIndex　Topic ＝ このノートが載っているトピックIndex　ChildBranch ＝ 分岐（子）
  const ml = (href, text) => `[${esc(text)}](${href})`;
  const lk = (s_, id) => { const m = get(s_, id); return ml(noteHref(s_, id), `${label(s_, id)}${m && m.title ? ' ' + m.title : ''}`); };
  function noteMd(n) {
    const head = `# ${n.title ? esc(n.title) : L.isNoid(n.id) ? '未整理 ' + n.created : (n.s === 'p' ? '紙 ' : '') + n.id}`;
    const body = BODY + L.bodyToMd(n.body, x => noteHref(n.s, x)) + '\n' + NAV;
    if (L.isNoid(n.id)) return [fmOf(n).replace(/\n$/, ''), n.data ? `<!-- pkm-data ${J(n.data)} -->` : null, head, '', body, ''].filter(x => x !== null).join('\n');
    const has = x => !!get(n.s, x), parent = L.parentIn(n.id, has), kids = ids(n.s).filter(x => L.parentIn(x, has) === n.id), t = topicOf(n.s, n.id);
    const listed = [...topics.values()].filter(o => L.mergeTopic(o).rows.some(r => r[n.s].some(x => L.splitAnchor(x).id === n.id)));
    const line = (k, items) => items.length ? `${k}: ${items.join('　')}` : null;
    const top = [line('ParentBranch', parent ? [lk(n.s, parent)] : []), line('TopicBranch', t ? [ml(topicHref(t.name), t.name)] : []), line('Topic', listed.map(o => ml(topicHref(o.name), o.name)))].filter(Boolean);
    return [fmOf(n).replace(/\n$/, ''), n.data ? `<!-- pkm-data ${J(n.data)} -->` : null, head, '',
      top.length ? top.join('  \n') + '\n' : null,
      n.img ? `![${n.id}](${enc(n.img)})\n` : null,
      body, kids.length ? '\n' + line('ChildBranch', kids.map(k => lk(n.s, k))) : null, ''].filter(x => x !== null).join('\n');
  }

  // 一覧: 先頭の ID（祖先の無いもの）だけ
  // デジタル・紙の一覧: いちばん上の番号（1・2・3 …）だけ。入口になっているトピックIndex があればそこへ、無ければノートへ
  const tops = sp => { const has = x => !!get(sp, x); return ids(sp).filter(id => !L.parentIn(id, has)).map(id => { const n = get(sp, id), t = topicOf(sp, id); return `[${label(sp, id)}${n.title ? ' ' + esc(n.title) : ''}](${t ? topicHref(t.name) : noteHref(sp, id)})`; }).join('　') || '（まだありません）'; };
  const listMd = sp => [`# ${SP[sp]}`, '', tops(sp), ''].join('\n');
  const unsortedMd = () => ['# 未整理', '', ...(noidNotes().map(n => `- [${esc(titleOfNote(n) || n.created)}](${noteHref('d', n.id)}) <small>${n.created}</small>`)), ...(noidNotes().length ? [] : ['（ありません）']), ''].join('\n');
  // Index.md: 入口。ここにだけ、一覧へのリンクを縦に並べる
  const indexMd = () => ['# Index', '', ...[[LIST.d, 'デジタル'], [LIST.p, '紙'], [UNSORTED, '未整理'], [KEYWORDS, 'Index（キーワード）'], [DIARY_LIST, '日記']].map(([f, t]) => `- [${t}](${enc(f)})`), ''].join('\n');

  const sameKind = d => [...diaries.values()].filter(x => x.kind === d.kind).sort((x, y) => x.date < y.date ? -1 : 1);
  function diaryMd(d) {
    const low = lowerOf(d), head = `${d.date}${d.kind !== DIARY ? '（' + esc(d.kind) + '）' : ''}${d.title ? '-' + esc(d.title) : ''}`;
    return [L.fmDump({ record: d.kind, date: d.date, parent_record: d.parent || undefined, title: d.title || undefined, created: d.created || undefined, updated: d.updated || d.created || undefined }).replace(/\n$/, ''), `# ${head}`, '',
      low.length ? `DailyNotes: ${low.map(o => `[${esc(o.kind)}](${diaryHref(o)})`).join('　')}\n` : null,
      BODY + L.bodyToMd(d.body, x => noteHref('d', x)) + '\n' + NAV, ''].filter(x => x !== null).join('\n');
  }
  // 日記の一覧: 種類ごとに。月はいつも、年は2つ以上の年にまたがってから（Gnosis 同様）
  function diaryListMd() {
    const label = d => `${d.date}（${L.weekday(d.date)}）${d.title ? ' ' + esc(d.title) : ''}`;
    const out = ['# 日記', ''];
    const kinds = kindNames().filter(k => k === DIARY || [...diaries.values()].some(d => d.kind === k));
    for (const k of kinds) {
      const mine = new Map([...diaries.values()].filter(d => d.kind === k).map(d => [d.date, d]));
      const days = ds => ds.map(x => `- [${label(mine.get(x))}](${diaryHref(mine.get(x))})`), tree = L.diaryTree([...mine.keys()]);
      if (kinds.length > 1) out.push(`## ${esc(k)}`, '');
      const lv = kinds.length > 1 ? '###' : '##', lv2 = kinds.length > 1 ? '####' : '###';
      if (!tree.length) out.push('（まだありません）', '');
      for (const g of tree) {
        out.push(`${lv} ${g.label}`, '');
        if (g.months) for (const m of g.months) out.push(`${lv2} ${m.label}`, '', ...days(m.days), '');
        else out.push(...days(g.days), '');
      }
    }
    return out.join('\n') + '\n';
  }

  function globalIndex() {
    const m = new Map();
    for (const n of notes.values()) if (!L.isNoid(n.id)) for (const k of n.keywords) {
      if (!m.has(k)) m.set(k, { d: [], p: [] });
      m.get(k)[n.s].push(n.id);
    }
    const rd = k => readings[k];
    return [...m].sort((x, y) => L.byReading(rd)(x[0], y[0]));
  }
  const idLinks = (s, list) => list.slice().sort((a, b) => L.cmpId(L.splitAnchor(a).id, L.splitAnchor(b).id)).map(x => { const { id, n } = L.splitAnchor(x); return `[${label(s, id)}${n ? `(${n})` : ''}](${noteHref(s, id)}${n ? '#c' + n : ''})`; }).join(' ');
  // k のトピックIndex があれば、その入口のIDの真上に赤い点（Index.md 用）
  const cell = (v, k) => {
    const t = k && [...topics.values()].find(x => x.keyword === k && x.entry);
    const one = (sp, x) => {
      const link = `<a href="${noteHref(sp, x)}">${label(sp, x)}</a>`;
      return t && t.entry.s === sp && t.entry.id === x
        ? `<span style="display:inline-block;text-align:center;line-height:1.15"><a href="${topicHref(t.name)}" title="トピックIndex ${h(t.name)}" style="color:#c0392b;font-size:.7em;text-decoration:none">●</a><br>${link}</span>`
        : link;
    };
    return [['d', v.d], ['p', v.p]].flatMap(([sp, l]) => l.slice().sort(L.cmpId).map(x => one(sp, x))).join(' ');
  };

  // 読みのあいうえお順。行（あ・か・さ…）ごとに分ける
  // キーワードの一覧（Index）。読みのあいうえお順。行（あ・か・さ…）ごとに分ける。キーワードの読みも、ここに持つ
  function keywordsMd() {
    const out = [`<!-- pkm-index ${J({ readings: { ...readings } })} -->`, '# Index（キーワード）', ''];
    const groups = new Map();
    for (const [k, v] of globalIndex()) {
      const r = L.kanaRow(readings[k] || k);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push([k, v]);
    }
    if (!groups.size) { out.push('（キーワードはまだありません）'); return out.join('\n') + '\n'; }
    out.push([...groups.keys()].map((r, i) => `[${r}](#row${i})`).join('　'), '');
    [...groups].forEach(([r, list], i) => {
      out.push(`### <a id="row${i}"></a>${r}`, '', '| キーワード | ID |', '|---|---|');
      for (const [k, v] of list) out.push(`| <a id="${L.kwAnchor(k)}"></a>${esc(k)}${readings[k] && readings[k] !== k ? ` <small style="color:#888">${h(readings[k])}</small>` : ''} | ${cell(v, k)} |`);
      out.push('');
    });
    return out.join('\n');
  }

  function topicMd(t) {
    const { rows, stars, refs } = L.mergeTopic(t), e = t.entry;
    const out = [
      `<!-- pkm-topic ${J(t)} -->`, `# ${esc(t.name)}`, '',
      `<p ${SUB}>入口 ${e ? a(noteHref(e.s, e.id), label(e.s, e.id)) : 'なし'}${t.keyword ? `　キーワード ${a(`${enc(KEYWORDS)}#${L.kwAnchor(t.keyword)}`, h(t.keyword))}` : ''}</p>`, ''
    ];
    if (rows.length) {
      out.push('| キーワード | ID |', '|---|---|');
      for (const r of rows) { // * の印のIDには、上に赤い点（そのIDが入口のトピックIndex があればそこへのリンク）
        const dotted = (s, list) => list.slice().sort((x, y) => L.cmpId(L.splitAnchor(x).id, L.splitAnchor(y).id)).map(raw => {
          const { id: x, n } = L.splitAnchor(raw), href = noteHref(s, x) + (n ? '#c' + n : ''), text = label(s, x) + (n ? `(${n})` : '');
          const link = `[${text}](${href})`, tp = r.dot && r.dot.s === s && r.dot.id === x;
          if (!tp) return link;
          const to = topicOf(s, x);
          return `<span style="display:inline-block;text-align:center;line-height:1.15">${to ? `<a href="${topicHref(to.name)}" style="color:#c0392b;font-size:.7em;text-decoration:none">●</a>` : '<span style="color:#c0392b;font-size:.7em">●</span>'}<br><a href="${href}">${text}</a></span>`;
        }).join(' ');
        out.push(`| ${esc(r.kw)} | ${[dotted('d', r.d), dotted('p', r.p)].filter(Boolean).join(' ')} |`);
      }
    }
    if (stars.length) out.push('', ...stars.map(s => `★ [${esc(s)}](${topicHref(s)})  `));
    if (refs.length) out.push('', ...refs.map(r => `★ ${esc(r.label)} [${label(r.s, r.id)}](${noteHref(r.s, r.id)})  `));
    return out.join('\n') + '\n';
  }

  // 紙のIndex: K_paperindex.json = { entries: [{ kw, reading, ids:[まだ紙のノートが無いID] }] }
  // その ID の紙のノートができたら、ノートのキーワードにして（本 Index に出る）、この表から外す
  const PIDX = 'K_paperindex';
  function mergePaperIndex() {
    const d = docs.get(PIDX); if (!d || !d.entries) return;
    let changed = false;
    for (const e of d.entries) {
      e.ids = e.ids.filter(id => {
        const n = get('p', L.splitAnchor(id).id); if (!n) return true;
        if (!n.keywords.includes(e.kw)) n.keywords.push(e.kw);
        if (e.reading && !readings[e.kw]) readings[e.kw] = e.reading;
        changed = true; return false;
      });
    }
    const keep = d.entries.filter(e => e.ids.length);
    if (keep.length !== d.entries.length) changed = true;
    d.entries = keep;
    if (changed) fs.writeFileSync(abs(PIDX + '.json'), JSON.stringify(d, null, 1));
  }
  // 日記の「今日のノート」から、もう無いノートへのリンクを外す
  function pruneDiaryLinks() {
    const exists = id => notes.has(key('d', id));
    for (const d of diaries.values()) {
      if (d.kind !== DIARY) continue;
      const lines = d.body.split('\n'); let inSec = false, changed = false;
      const out = lines.filter(l => {
        if (/^##\s/.test(l)) inSec = l.trim() === '## 今日のノート';
        if (!inSec) return true;
        const m = l.match(/^\s*-\s+:(\S+)\s*$/), f = l.match(/^\s*-\s+\[[^\]]*\]\(D_([^)\s]+)\.md\)\s*$/), g = l.match(/^\s*-\s+\[[^\]]*\]\((\d{14}(?:-\d+)?)\.md\)\s*$/);
        const id = m ? m[1] : f ? decodeURIComponent(f[1]) : null;
        if (id && !exists(id)) { changed = true; return false; }
        if (g && ![...notes.values()].some(n => n.stem === g[1])) { changed = true; return false; }   // IDなしのノート（日時の名前）へのリンク。ノートが無ければ外す
        return true;
      });
      if (changed) {
        let body = out.join('\n').replace(/## 今日のノート\n+(?=##\s|$)/g, '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
        d.body = body;
      }
    }
  }
  function rebuild() {
    mergePaperIndex(); pruneDiaryLinks();
    const files = new Map([['Index.md', indexMd()], [KEYWORDS, keywordsMd()], [UNSORTED, unsortedMd()], [LIST.d, listMd('d')], [LIST.p, listMd('p')], [DIARY_LIST, diaryListMd()]]);
    for (const d of diaries.values()) files.set(diaryFile(d), diaryMd(d));
    for (const n of notes.values()) files.set(noteFile(n.s, n.id), noteMd(n));
    for (const t of topics.values()) files.set(topicFile(t.name), topicMd(t));
    for (const [f, c] of files) if (cache.get(f) !== c) { fs.writeFileSync(abs(f), c); cache.set(f, c); }
  }
  function removeFile(f) { // 消すときはゴミ箱へ
    if (!fs.existsSync(abs(f))) return;
    fs.mkdirSync(abs('.trash'), { recursive: true });
    fs.renameSync(abs(f), abs(`.trash/${Date.now()}-${path.basename(f)}`));
    cache.delete(f);
  }

  // ===== 画面とのやりとり =====
  const url = n => n.img ? 'file://' + abs(n.img).split('/').map(enc).join('/') + '?' + fs.statSync(abs(n.img)).mtimeMs : null;
  const pub = n => ({ pinned: !!n.pinned, color: n.color || '', archived: !!n.archived, s: n.s, id: n.id, stem: n.stem, created: n.created, updated: n.updated || n.created, keywords: n.keywords, body: n.body, image: url(n), kind: n.kind || 'text', data: n.data || null, noid: L.isNoid(n.id), title: n.title || '' });

  const pubDiary = d => ({ kind: d.kind, date: d.date, title: d.title, body: d.body, parent: d.parent || '', stem: d.stem, pages: d.kind === DIARY ? pages.get(d.date) || [] : [], lower: lowerOf(d).map(o => o.kind) });
  const ensureDiary = (date, kind = DIARY) => {
    if (!diaries.has(dk(kind, date))) diaries.set(dk(kind, date), { kind, date, title: '', body: '', parent: kind === DIARY ? '' : kindParent(kind), stem: freeStem(), created: L.now() });
    return diaries.get(dk(kind, date));
  };
  // その日に作ったデジタルノートへのリンクを、日記の「今日のノート」に足す（無ければ日記も作る）
  const isBlank = n => (!n.kind || n.kind === 'text') && !(n.body || '').trim() && !(n.title || '').trim();
  const linkNote = n => {
    if (isBlank(n)) { n.pending = true; return; }                  // まだ何も書いていないノートは、日記に載せない（書いたら載る）
    n.pending = false;
    const date = L.dayOf(n.created); if (!date) return;
    const d = ensureDiary(date, DIARY);
    if (L.isNoid(n.id)) { // IDなしは :ID で書けないので、ファイルへのリンクにする（ID を付けたとき :ID に直す）
      if (!d.body.includes(`](${noteHref('d', n.id)})`)) d.body = L.addToSection(d.body, '今日のノート', `- [未整理 ${n.created.slice(11)}](${noteHref('d', n.id)})`);
      return;
    }
    const has = L.tokens(d.body).some(t => t.k === 'ref' && t.id === n.id && !t.n);
    if (!has) d.body = L.addToSection(d.body, '今日のノート', `- :${n.id}`);
  };
  rebuild();
  return {
    vault,
    state() { return { vault, notes: [...notes.values()].map(pub), topics: [...topics.values()], readings: { ...readings },
      diaries: [...diaries.values()].map(pubDiary), records: this.records(), docs: Object.fromEntries(docs) }; },
    diaryState: () => [...diaries.values()].map(pubDiary),
    // ===== 日記（と、夢・ビジネスなどの記録）=====
    // kind の date のノートを作る（無ければ）。日記なら、その日に作ったノートで、まだ入っていないものも足す
    openDiary(date, kind = DIARY) {
      if (!L.isDate(date)) return false;
      const d = ensureDiary(date, kind);
      if (kind === DIARY) for (const n of notes.values()) if (n.s === 'd' && L.dayOf(n.created) === date) linkNote(n);
      rebuild(); return pubDiary(d);
    },
    saveDiary({ date, kind = DIARY, title, body, parent }) {
      const d = ensureDiary(date, kind);
      if (body !== undefined) d.body = body;
      if (title !== undefined) d.title = title.trim();
      if (parent !== undefined && kind !== DIARY) { const np = parent || ''; if (np !== kind && !this.recordCycle(kind, np)) d.parent = np; }
      d.updated = L.now(); rebuild(); return pubDiary(d);
    },
    deleteDiary(date, kind = DIARY) { const d = diaries.get(dk(kind, date)); if (!d) return false; removeFile(diaryFile(d)); diaries.delete(dk(kind, date)); rebuild(); return true; },
    // その日のノートに 1 段落を足す（USB で取り込んだスマホのメモなど）。無ければ作る
    appendToDay(kind, date, text) {
      const d = ensureDiary(date, kind || DIARY); d.body = d.body.trim() ? d.body.replace(/\s+$/, '') + '\n\n' + text : text; d.updated = L.now();
      rebuild(); return pubDiary(d);
    },
    // 紙の日記（「日記」だけ）: スキャン画像を P_<日付>.jpg（2枚目以降 _2 _3 …）に保存し、日記の最後の「紙の日記」に挿入する
    addDiaryScan(date, buf) {
      if (!L.isDate(date)) return false;
      const d = ensureDiary(date, DIARY), list = pages.get(date) || [];
      const name = list.length ? `P_${date}_${list.length + 1}.jpg` : `P_${date}.jpg`;
      fs.writeFileSync(abs(name), buf); pages.set(date, [...list, name]);
      d.body = L.addToSection(d.body, '紙の日記', `![](${name})`);
      rebuild(); return pubDiary(d);
    },
    // ----- 記録の種類 -----
    records: () => kindNames().map(k => ({ name: k, parent: k === DIARY ? '' : kindParent(k) })),
    // child の上位を up にすると、輪になるか（up の上位をたどって child に着く）
    recordCycle(child, up) { let p = up, n = 0; while (p && n++ < 50) { if (p === child) return true; p = kindParent(p); } return false; },
    addRecord(name, parent = '') {
      name = (name || '').trim(); if (!name || name === DIARY || /[\\/:*?"<>|#%\n]/.test(name) || kindNames().includes(name)) return false;
      if (parent && !kindNames().includes(parent)) return false;
      const d = recDoc(); d.kinds = [...d.kinds, { name, parent }]; saveRecDoc(d); rebuild(); return this.records();
    },
    // 種類の上位（これから作る日の初期値。もう作った日は変えない）
    setRecordParent(name, parent = '') {
      if (name === DIARY || !kindNames().includes(name) || (parent && (!kindNames().includes(parent) || parent === name || this.recordCycle(name, parent)))) return false;
      const d = recDoc(); d.kinds = kindNames().filter(k => k !== DIARY).map(k => ({ name: k, parent: k === name ? parent : kindParent(k) })); saveRecDoc(d); rebuild(); return this.records();
    },
    // その日だけ上位を変える
    setDayParent(kind, date, parent = '') {
      const d = diaries.get(dk(kind, date)); if (!d || kind === DIARY || parent === kind || (parent && (!kindNames().includes(parent) || this.recordCycle(kind, parent)))) return false;
      d.parent = parent; d.updated = L.now(); rebuild(); return pubDiary(d);
    },
    renameRecord(from, to) {
      to = (to || '').trim(); if (from === DIARY || !to || to === DIARY || /[\\/:*?"<>|#%\n]/.test(to) || kindNames().includes(to) || !kindNames().includes(from)) return false;
      for (const d of [...diaries.values()]) { if (d.kind === from) { diaries.delete(dk(from, d.date)); d.kind = to; diaries.set(dk(to, d.date), d); } if (d.parent === from) d.parent = to; }
      const doc = recDoc(); doc.kinds = kindNames().filter(k => k !== DIARY).map(k => ({ name: k === from ? to : k, parent: kindParent(k) === from ? to : kindParent(k) })); saveRecDoc(doc);
      rebuild(); return this.records();
    },
    // 種類を消す（その種類の日のノートは .trash へ。下位だった種類は上位なしに）
    deleteRecord(name) {
      if (name === DIARY || !kindNames().includes(name)) return false;
      for (const d of [...diaries.values()]) { if (d.kind === name) { removeFile(diaryFile(d)); diaries.delete(dk(name, d.date)); } else if (d.parent === name) d.parent = kindParent(name); }
      const doc = recDoc(); doc.kinds = kindNames().filter(k => k !== DIARY && k !== name).map(k => ({ name: k, parent: kindParent(k) === name ? kindParent(name) : kindParent(k) })); saveRecDoc(doc);
      rebuild(); return this.records();
    },
    // from を into にまとめる（表記揺れの統合）。同じ日は段落を時刻（行頭の 時:分）の順にまぜる。無い日は移す
    mergeRecords(from, into) {
      if (from === DIARY || from === into || !kindNames().includes(from) || !kindNames().includes(into)) return false;
      const paras = t => (t || '').split(/\n{2,}/).map(x => x.trim()).filter(Boolean), tm = x => (x.match(/^(\d{1,2}):(\d{2})/) || [])[0] || '';
      for (const d of [...diaries.values()].filter(x => x.kind === from)) {
        const o = diaries.get(dk(into, d.date));
        if (!o) { diaries.delete(dk(from, d.date)); d.kind = into; diaries.set(dk(into, d.date), d); }
        else {
          const all = [...paras(o.body).map((x, i) => [tm(x), 0, i, x]), ...paras(d.body).map((x, i) => [tm(x), 1, i, x])];
          const timed = all.filter(x => x[0]).sort((a, b) => a[0].padStart(5, '0') < b[0].padStart(5, '0') ? -1 : a[0].padStart(5, '0') > b[0].padStart(5, '0') ? 1 : a[1] - b[1] || a[2] - b[2]), plain = all.filter(x => !x[0]);
          o.body = [...plain, ...timed].map(x => x[3]).join('\n\n'); o.updated = L.now();
          removeFile(diaryFile(d)); diaries.delete(dk(from, d.date));
        }
      }
      for (const d of diaries.values()) if (d.parent === from) d.parent = into;
      const doc = recDoc(); doc.kinds = kindNames().filter(k => k !== DIARY && k !== from).map(k => ({ name: k, parent: kindParent(k) === from ? into : kindParent(k) })); saveRecDoc(doc);
      rebuild(); return this.records();
    },
    // ===== JSON の文書（チャット・なりきり・役・キャンバス）=====
    saveDoc(name, obj) {
      if (!/^(C|K)_[^\\/]+$/.test(name)) return false;
      docs.set(name, obj); fs.writeFileSync(abs(name + '.json'), JSON.stringify(obj, null, 1)); return true;
    },
    deleteDoc(name) { if (!docs.has(name)) return false; docs.delete(name); removeFile(name + '.json'); return true; },
    setReading(k, r) { if (r) readings[k] = r; else delete readings[k]; rebuild(); return true; },
    saveNote(x) {
      const n = get(x.s, x.id) || blank(x.s, x.id, x.created);
      const fresh = !get(x.s, x.id), before = JSON.stringify([n.keywords, n.body, n.title, n.data, n.kind, n.pinned, n.color, n.archived]);
      if (x.pinned !== undefined) n.pinned = !!x.pinned; if (x.color !== undefined) n.color = x.color || ''; if (x.archived !== undefined) n.archived = !!x.archived;
      n.keywords = x.keywords || []; n.body = x.body || '';
      if (x.kind) n.kind = x.kind;
      if (x.data !== undefined) n.data = x.data;
      if (x.title !== undefined) n.title = (x.title || '').trim();
      if (n.kind && n.kind !== 'text') { if (n.data) n.data.title = n.title || n.data.title; n.body = L.deriveBody(n.kind, n.data); }
      if (before !== JSON.stringify([n.keywords, n.body, n.title, n.data, n.kind, n.pinned, n.color, n.archived])) n.updated = L.now();
      notes.set(key(x.s, x.id), n);
      if (n.s === 'd' && (fresh || n.pending)) linkNote(n); // 作った日の日記に載る（空のノートは、書いてから）
      rebuild(); return pub(n);
    },
    // IDなしのノートを作る（kind: text / rp / canvas）。ID を渡せば、その ID で作る
    createNote({ kind = 'text', id, data = null, body = '', created, title = '', keywords = [] } = {}) {
      const at = created || L.now(), stem = freeStem(L.parseTime(at) || new Date()), nid = id || stem, n = { s: 'd', id: nid, stem, created: at, updated: at, keywords: keywords || [], kind, title, data, img: null, body: kind === 'text' ? body : L.deriveBody(kind, data) };
      notes.set(key('d', nid), n); linkNote(n); rebuild(); return pub(n);
    },
    // IDを消して、IDなしにする（デジタルのみ）。このノートを指していた :ID は、ファイルへのリンクに直す。
    // 子のノートのIDはそのまま。トピックIndex の入口だった場合は、入口なしになる
    clearId(s, id) {
      const n = get('d', id); if (s !== 'd' || !n || L.isNoid(id)) return false;
      const stem = n.stem, href = noteHref('d', id);
      notes.delete(key('d', id)); n.id = stem; notes.set(key('d', stem), n); n.updated = L.now();
      for (const t of topics.values()) { // 入口と、索引の行から外す
        if (t.entry && t.entry.s === 'd' && t.entry.id === id) t.entry = null;
        t.d = L.removeFromTopic(t.d, [id]);
      }
      const label = (n.title || (n.body.split('\n').find(x => x.trim()) || '').replace(/^#+\s*/, '').slice(0, 24) || 'ノート').replace(/[\[\]]/g, '');
      const fix = body => { // :1a  1a:  1a(1)  などを、リンクに置き換える
        let out = '', last = 0;
        for (const t of L.tokens(body)) { if (t.k !== 'ref' || t.id !== id) continue; out += body.slice(last, t.from) + `[${label}](${href})`; last = t.to; }
        return out + body.slice(last);
      };
      for (const m of notes.values()) if (m !== n && (!m.kind || m.kind === 'text')) m.body = fix(m.body);
      for (const d of diaries.values()) d.body = fix(d.body);
      for (const m of notes.values()) if (m.kind && m.kind !== 'text' && m.data) { const j = JSON.stringify(m.data); if (j.includes(`"nid":"${id}"`)) { for (const c of m.data.nodes || []) if (c.type === 'note' && c.s === 'd' && c.nid === id) c.nid = stem; m.body = L.deriveBody(m.kind, m.data); } }
      rebuild(); return this.state();
    },
    // IDを付け替える。ファイル名は日時のままなので、ファイルも他のノートのファイルへのリンクも動かない
    rename(s, from, to) {
      const n = get(s, from);
      if (!n || !validId(to) || get(s, to)) return false;
      const was = noteHref(s, from);
      notes.delete(key(s, from)); n.id = to; notes.set(key(s, to), n); n.updated = L.now();
      for (const t of topics.values()) if (t.entry && t.entry.s === s && t.entry.id === from) t.entry.id = to;
      if (s === 'd') for (const d of diaries.values()) d.body = d.body.split('\n').map(l => l.trim().match(/^- \[[^\]]*\]\(/) && l.includes(`](${was})`) ? `- :${to}` : l).join('\n'); // 日記の「今日のノート」は :ID に
      rebuild(); return pub(n);
    },
    saveImage(s, id, buf) {
      const n = get(s, id) || blank(s, id);
      for (const e of IMG) { const f = abs(n.stem + e); if (fs.existsSync(f)) fs.unlinkSync(f); }
      n.img = `${n.stem}.jpg`; fs.writeFileSync(abs(n.img), buf); n.updated = L.now();
      notes.set(key(s, id), n); rebuild(); return pub(n);
    },
    // 添付（画像・html・csv など）をコピーする。名前は日時（同じ秒はずらす）。元の名前は K_files.json に残す（タイトルはあとから付ける）
    // 返す名前は保存した名前。orig は元の名前（リンクの表示に使う）
    addFiles(list) {
      const d = docs.get(FILES) || { files: {} }, t = new Date();
      const out = list.map(({ name, bytes }, i) => {
        const ext = path.extname(path.basename(name)).toLowerCase().replace(/[^.\w]/g, ''), stem = freeStem(new Date(t.getTime())), f = stem + ext;
        fs.writeFileSync(abs(f), Buffer.from(bytes));
        d.files[f] = { orig: path.basename(name), title: '', desc: '', added: L.now() };
        return f;
      });
      docs.set(FILES, d); fs.writeFileSync(abs(FILES + '.json'), JSON.stringify(d, null, 1));
      return out;
    },
    // 取り込んだファイル（画像・html・csv など）の一覧。タイトル・説明・元の名前つき。ノートや Index などは含めない
    filesInfo() {
      const meta = (docs.get(FILES) || { files: {} }).files, imgs = new Set([...notes.values()].map(n => n.img).filter(Boolean));
      const sys = /^(D_|P_|T_|C_|K_|R_|V_)|^(Index|デジタル|紙|日記|未整理|キーワード)\.md$|^\./;
      return fs.readdirSync(vault, { withFileTypes: true }).filter(d => d.isFile() && !sys.test(d.name) && !imgs.has(d.name) && !(/^\d{14}(-\d+)?\.md$/.test(d.name))).map(d => {
        const st = fs.statSync(abs(d.name)), m = meta[d.name] || {};
        return { name: d.name, orig: m.orig || d.name, title: m.title || '', desc: m.desc || '', added: m.added || L.now(st.mtime), size: st.size, ext: path.extname(d.name).toLowerCase() };
      }).sort((a, b) => b.added.localeCompare(a.added));
    },
    setFileInfo(name, { title, desc }) {
      if (!fs.existsSync(abs(name)) || path.basename(name) !== name) return false;
      const d = docs.get(FILES) || { files: {} }; d.files[name] = { orig: name, added: L.now(), ...(d.files[name] || {}), title: (title || '').trim(), desc: (desc || '').trim() };
      docs.set(FILES, d); fs.writeFileSync(abs(FILES + '.json'), JSON.stringify(d, null, 1)); return true;
    },
    // ごみ箱（.trash）のノート。戻す: ファイルを vault に戻す（同じ名前があれば、新しい日時の名前で）
    trashList() {
      const dir = abs('.trash'); if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).map(f => { const m = f.match(/^(\d+)-(\d{14}(?:-\d+)?)\.md$/); if (!m) return null;
        const text = fs.readFileSync(path.join(dir, f), 'utf8'), fm = L.fmParse(text), y = fm.meta || {}; if (y.record !== undefined) return null;
        const i = text.indexOf(BODY), j = text.indexOf(NAV), body = L.mdToBody(i >= 0 ? text.slice(i + BODY.length, j > i ? j : undefined) : fm.rest);
        return { file: f, deleted: L.now(new Date(+m[1])), title: y.title || '', id: y.folgezettel !== undefined ? String(y.folgezettel) : '', body: body.slice(0, 600), keywords: Array.isArray(y.keywords) ? y.keywords : [] };
      }).filter(Boolean).sort((a, b) => b.file.localeCompare(a.file, 'en', { numeric: true }));
    },
    trashRestore(file) {
      const from = path.join(abs('.trash'), path.basename(file)), m = path.basename(file).match(/^\d+-(\d{14}(?:-\d+)?)\.md$/); if (!m || !fs.existsSync(from)) return false;
      let stem = m[1]; if (fs.existsSync(abs(stem + '.md')) || used.has(stem)) stem = freeStem();
      fs.renameSync(from, abs(stem + '.md')); return true;
    },
    // oldName があれば名前の変更
    saveTopic(t, oldName) {
      if (t.entry && [...topics.values()].some(o => o.name !== (oldName || t.name) && o.entry && o.entry.s === t.entry.s && o.entry.id === t.entry.id)) return false;
      if (oldName && oldName !== t.name) {
        topics.delete(oldName);
        if (topicFile(oldName) !== topicFile(t.name)) { if (fs.existsSync(abs(topicFile(oldName)))) fs.unlinkSync(abs(topicFile(oldName))); cache.delete(topicFile(oldName)); }
      }
      topics.set(t.name, { name: t.name, entry: t.entry || null, keyword: t.keyword || '', d: t.d || '', p: t.p || '' });
      const en = t.keyword && t.entry && get(t.entry.s, t.entry.id); // 点を付けるIDは、そのキーワードの並びに入る
      if (en && !en.keywords.includes(t.keyword)) en.keywords.push(t.keyword);
      rebuild(); return true;
    },
    // ノートを消す（ファイルは .trash へ。添付は残す）。入口だった索引は入口なしに、索引の行からも ID を外す
    deleteNotes(items) {
      for (const { s, id } of items) {
        const n = get(s, id); if (!n) continue;
        removeFile(n.stem + '.md');
        if (n.img) removeFile(n.img);
        notes.delete(key(s, id));
      }
      for (const t of topics.values()) {
        if (t.entry && items.some(x => x.s === t.entry.s && x.id === t.entry.id)) t.entry = null;
        for (const sp of ['d', 'p']) t[sp] = L.removeFromTopic(t[sp], items.filter(x => x.s === sp).map(x => x.id));
      }
      rebuild(); return this.state();
    },
    // 紙のIndexに足す。ID はまだ取り込んでいない紙のものでもよい（取り込まれたら自動でマージ）
    addPaperIndex({ kw, reading, ids }) {
      kw = (kw || '').trim(); if (!kw) return false;
      const d = docs.get(PIDX) || { entries: [] };
      let e = d.entries.find(x => x.kw === kw);
      if (!e) { e = { kw, reading: '', ids: [] }; d.entries.push(e); }
      if (reading) { e.reading = reading; readings[kw] = reading; }
      for (const id of ids || []) if (validId(L.splitAnchor(id).id) && !e.ids.includes(id)) e.ids.push(id);   // 3a(1) のように (番号) もつけられる
      docs.set(PIDX, d); fs.writeFileSync(abs(PIDX + '.json'), JSON.stringify(d, null, 1));
      rebuild(); return this.state();
    },
    // 紙のIndexから外す（まだ紙のノートが無いIDは表から、ノートがあるIDはノートのキーワードから）
    removePaperIndex({ kw, id }) {
      const d = docs.get(PIDX), e = d && d.entries.find(x => x.kw === kw);
      if (e && e.ids.includes(id)) { e.ids = e.ids.filter(x => x !== id); d.entries = d.entries.filter(x => x.ids.length); fs.writeFileSync(abs(PIDX + '.json'), JSON.stringify(d, null, 1)); }
      const n = get('p', L.splitAnchor(id).id); if (n) n.keywords = n.keywords.filter(k => k !== kw);
      rebuild(); return this.state();
    },
    deleteTopic(name) { topics.delete(name); removeFile(topicFile(name)); rebuild(); return true; }
  };
}

module.exports = { openVault };
