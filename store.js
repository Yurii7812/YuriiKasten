// 保存フォルダの読み書き。全部を1つのフォルダに平らに置く（サブフォルダは .trash だけ）
//   D_<ID>.md          デジタルのノート
//   P_<ID>.md          紙のノート（スキャン画像は P_<ID>.jpg）
//   T_<名前>.md        トピックIndex
//   D_2026-11-07-タイトル.md   日記（タイトルは任意）  P_2026-11-07.jpg / P_2026-11-07_2.jpg  紙の日記
//   D_u20261107-143521.md   IDなしのノート（あとでIDを付ける）
//   C_ K_ *.json   チャットメモ・役のライブラリ（なりきり・キャンバスはノートの一種で、データはノートの中）
//   Index.md / デジタル.md / 紙.md / 日記.md   グローバルIndex と、一覧
//   <名前>             添付（元の名前のまま。上の名前とぶつかるときだけ F_ を付ける）
// ノートの下に 前・次・上・分岐・トピックIndex のリンクがあるので、リンクだけで全部に届く
// .md は Brave の Markdown Viewer でも開ける（リンクはすべて同じフォルダの中）
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const PRE = { d: 'D_', p: 'P_' };
const LIST = { d: 'デジタル.md', p: '紙.md' };
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
const RESERVED = /^(D_|P_|T_|C_|R_|K_|V_)|^(Index|デジタル|紙|日記)\.md$|^\./;
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

function openVault(vault) {
  const notes = new Map(), topics = new Map(), cache = new Map(), diaries = new Map(), pages = new Map(), docs = new Map();
  let readings = {}; // キーワード → 読み（Index の並び）
  const key = (s, id) => s + ':' + id;
  const get = (s, id) => notes.get(key(s, id));
  const abs = f => path.join(vault, f);
  const noteFile = (s, id) => `${PRE[s]}${id}.md`;
  const topicFile = name => `T_${L.fileName(name)}.md`;
  const topicHref = name => enc(topicFile(name));
  const noteHref = (s, id) => enc(noteFile(s, id));
  // IDなしのノートの名前（日時。同じ秒なら -1, -2）
  const freeStem = (date = new Date()) => { let st = L.noidStem(date), x = st, i = 0; while (get('d', x) || fs.existsSync(abs(`D_${x}.md`))) x = `${st}-${++i}`; return x; };
  const diaryFile = d => `D_${d.date}${d.title ? '-' + L.fileName(d.title) : ''}.md`;
  const diaryHref = d => enc(diaryFile(d));

  // ===== 読み込み =====
  fs.mkdirSync(vault, { recursive: true });
  if (!fs.existsSync(abs(MARK))) { flatten(vault); fs.writeFileSync(abs(MARK), 'flat1\n'); }
  for (const f of fs.readdirSync(vault)) {
    let dm;
    if ((dm = f.match(/^D_(\d{4}-\d{2}-\d{2})(?:-(.*))?\.md$/))) { // 日記
      const text = fs.readFileSync(abs(f), 'utf8'); cache.set(f, text);
      const md = meta(text, 'pkm-diary') || {}, i = text.indexOf(BODY), j = text.indexOf(NAV);
      diaries.set(dm[1], { date: dm[1], title: md.title !== undefined ? md.title : (dm[2] || ''), body: L.mdToBody(i >= 0 ? text.slice(i + BODY.length, j > i ? j : undefined) : text) });
      continue;
    }
    if ((dm = f.match(/^P_(\d{4}-\d{2}-\d{2})(?:_(\d+))?\.(jpe?g|png|webp)$/i))) { // 紙の日記のページ
      if (!pages.has(dm[1])) pages.set(dm[1], []);
      pages.get(dm[1]).push(f); continue;
    }
    if ((dm = f.match(/^([RV])_.+\.json$/))) { // 昔の なりきり・キャンバス（ファイル）→ IDなしのノート
      try {
        const d = JSON.parse(fs.readFileSync(abs(f), 'utf8')), kind = dm[1] === 'R' ? 'rp' : 'canvas', stem = freeStem(new Date(d.created || Date.now()));
        notes.set(key('d', stem), { s: 'd', id: stem, created: L.now(new Date(d.created || Date.now())), keywords: [], kind, title: d.title || '', data: d, body: L.deriveBody(kind, d), img: null });
        removeFile(f);
      } catch { }
      continue;
    }
    if (DOC_PRE.test(f)) { try { docs.set(f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(abs(f), 'utf8'))); } catch { } continue; }
    const m = f.match(/^([DP])_(.+?)(\.[^.]+)$/);
    if (m) {
      const s = m[1].toLowerCase(), id = m[2], e = m[3].toLowerCase();
      if (!isStem(id)) continue;
      const n = get(s, id) || { s, id, created: '', keywords: [], body: '', img: null, kind: 'text', data: null };
      notes.set(key(s, id), n);
      if (e === '.md') {
        const text = fs.readFileSync(abs(f), 'utf8'); cache.set(f, text);
        const md = meta(text, 'pkm') || {};
        n.created = md.created || n.created; n.keywords = md.keywords || []; n.kind = md.kind || 'text'; n.title = md.title || '';
        const i = text.indexOf(BODY), j = text.indexOf(NAV);
        if (n.kind && n.kind !== 'text') { n.data = meta(text, 'pkm-data') || {}; if (!n.title) n.title = n.data.title || ''; n.data.title = n.title; n.body = L.deriveBody(n.kind, n.data); }
        else n.body = L.mdToBody(i >= 0 ? text.slice(i + BODY.length, j > i ? j : undefined) : text);
      } else if (IMG.includes(e)) n.img = f;
    } else if (/^T_.+\.md$/.test(f)) {
      const text = fs.readFileSync(abs(f), 'utf8'); cache.set(f, text);
      const t = meta(text, 'pkm-topic');
      if (t && t.name) topics.set(t.name, { name: t.name, entry: t.entry || (t.anchors || [])[0] || null, keyword: t.keyword || '', d: t.d || '', p: t.p || '' });
    }
  }
  for (const l of pages.values()) l.sort((x, y) => (+((x.match(/_(\d+)\./) || [])[1]) || 1) - (+((y.match(/_(\d+)\./) || [])[1]) || 1));
  for (const n of notes.values()) if (n.s === 'd' && !n.created) {
    const f = abs(noteFile('d', n.id));
    n.created = L.now(fs.existsSync(f) ? fs.statSync(f).mtime : new Date());
  }
  if (fs.existsSync(abs('Index.md'))) {
    const text = fs.readFileSync(abs('Index.md'), 'utf8'); cache.set('Index.md', text);
    readings = (meta(text, 'pkm-index') || {}).readings || {};
  }

  // ===== 書き出し =====
  const ids = s => [...notes.values()].filter(n => n.s === s && !L.isNoid(n.id)).map(n => n.id).sort(L.cmpId);
  const noidNotes = () => [...notes.values()].filter(n => n.s === 'd' && L.isNoid(n.id)).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  const topicOf = (s, id) => [...topics.values()].find(t => t.entry && t.entry.s === s && t.entry.id === id);
  const label = (s, id) => (s === 'p' ? '紙' : '') + id;

  const titleOfNote = n => n.title ? n.title : n.kind && n.kind !== 'text' ? ((n.data && n.data.title) || (n.kind === 'rp' ? '会話' : 'キャンバス')) : (n.body.split('\n').find(x => x.trim()) || '').replace(/^#+\s*/, '').slice(0, 30);
  function noteMd(n) {
    if (L.isNoid(n.id)) { // IDなし: 前後・上下は無い
      return [`<!-- pkm ${J({ created: n.created, keywords: [], kind: n.kind, title: n.title || '' })} -->`, n.data ? `<!-- pkm-data ${J(n.data)} -->` : null,
        `# ${n.title ? esc(n.title) : '未整理 ' + n.created}`, n.title ? `\n<p ${SUB}>未整理 ${n.created}</p>` : '', '', BODY + L.bodyToMd(n.body, x => noteHref(n.s, x)) + '\n' + NAV, '<hr>', '',
        `<p ${SUB}>${[a('Index.md', 'Index'), a(enc(LIST.d), 'デジタル一覧'), a(enc(DIARY_LIST), '日記一覧')].join(sep)}</p>`, ''].filter(x => x !== null).join('\n');
    }
    const list = ids(n.s), has = x => !!get(n.s, x), i = list.indexOf(n.id);
    const parent = L.parentIn(n.id, has), kids = list.filter(x => L.parentIn(x, has) === n.id);
    const go = x => noteHref(n.s, x), t = topicOf(n.s, n.id);
    const sub = [n.s === 'd' && h(n.created), n.keywords.length && '索引 ' + n.keywords.map(k => a(`Index.md#${L.kwAnchor(k)}`, h(k))).join('・')].filter(Boolean).join('　');
    const nav1 = [
      i > 0 && a(go(list[i - 1]), '← ' + list[i - 1]),
      parent && a(go(parent), '↑ ' + parent),
      kids.length && '分岐 ' + kids.map(k => a(go(k), k)).join(' '),
      i < list.length - 1 && a(go(list[i + 1]), list[i + 1] + ' →')
    ].filter(Boolean).join(sep);
    const nav2 = [t && a(topicHref(t.name), 'トピックIndex ' + h(t.name)), a('Index.md', 'Index'), a(enc(LIST[n.s]), SP[n.s] + '一覧')].filter(Boolean).join(sep);
    return [
      `<!-- pkm ${J(n.s === 'd' ? { created: n.created, keywords: n.keywords, kind: n.kind, title: n.title || '' } : { keywords: n.keywords, title: n.title || '' })} -->`,
      n.data ? `<!-- pkm-data ${J(n.data)} -->` : null,
      `# ${n.title ? esc(n.title) : (n.s === 'p' ? '紙 ' : '') + n.id}`, n.title ? `\n<p ${SUB}>${n.s === 'p' ? '紙 ' : ''}${n.id}</p>` : '', '',
      sub ? `<p ${SUB}>${sub}</p>\n` : null,
      n.img ? `![${n.id}](${enc(n.img)})\n` : null,
      BODY + L.bodyToMd(n.body, x => noteHref(n.s, x)) + '\n' + NAV,
      '<hr>', '', `<p ${SUB}>${nav1 ? nav1 + '<br>' : ''}${nav2}</p>`, ''
    ].filter(x => x !== null).join('\n');
  }

  // 一覧: 先頭の ID（祖先の無いもの）だけ
  function listMd(s) {
    const has = x => !!get(s, x), o = s === 'd' ? 'p' : 'd';
    const roots = ids(s).filter(id => !L.parentIn(id, has));
    const un = s === 'd' ? noidNotes() : [];
    return [`# ${SP[s]}`, '', `<p ${SUB}>${a('Index.md', 'Index')}${sep}${a(enc(LIST[o]), SP[o] + '一覧')}</p>`, '',
      roots.map(id => `[${id}${get(s, id).title ? ' ' + esc(get(s, id).title) : ''}](${noteHref(s, id)})`).join('　') || '（まだありません）', '',
      ...(un.length ? ['## 未整理（IDなし）', '', ...un.map(n => `- [${esc(titleOfNote(n) || n.created)}](${noteHref('d', n.id)}) <small>${n.created}</small>`), ''] : [])].join('\n');
  }

  function diaryMd(d) {
    const dates = [...diaries.keys()].sort(), i = dates.indexOf(d.date);
    const prev = diaries.get(dates[i - 1]), next = diaries.get(dates[i + 1]);
    const nav = [prev && a(diaryHref(prev), '← ' + prev.date), next && a(diaryHref(next), next.date + ' →'), a('Index.md', 'Index'), a(enc(DIARY_LIST), '日記一覧')].filter(Boolean).join(sep);
    return [`<!-- pkm-diary ${J({ title: d.title })} -->`, `# ${d.date}${d.title ? '-' + esc(d.title) : ''}`, '',
      BODY + L.bodyToMd(d.body, x => noteHref('d', x)) + '\n' + NAV, '<hr>', '', `<p ${SUB}>${nav}</p>`, ''].join('\n');
  }
  // 日記の一覧: 月はいつも、年は2つ以上の年にまたがってから（Gnosis 同様）
  function diaryListMd() {
    const label = d => `${d.date}（${L.weekday(d.date)}）${d.title ? ' ' + esc(d.title) : ''}`;
    const days = ds => ds.map(x => `- [${label(diaries.get(x))}](${diaryHref(diaries.get(x))})`);
    const out = ['# 日記', '', `<p ${SUB}>${a('Index.md', 'Index')}${sep}${a(enc(LIST.d), 'デジタル一覧')}${sep}${a(enc(LIST.p), '紙一覧')}</p>`, ''];
    const tree = L.diaryTree([...diaries.keys()]);
    if (!tree.length) out.push('（まだありません）');
    for (const g of tree) {
      out.push(`## ${g.label}`, '');
      if (g.months) for (const m of g.months) out.push(`### ${m.label}`, '', ...days(m.days), '');
      else out.push(...days(g.days), '');
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
  const idLinks = (s, list) => list.slice().sort(L.cmpId).map(x => `[${label(s, x)}](${noteHref(s, x)})`).join(' ');
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
  function indexMd() {
    const out = [`<!-- pkm-index ${J({ readings: { ...readings } })} -->`, '# Index', '',
      `<p ${SUB}>${a(enc(LIST.d), 'デジタル一覧')}${sep}${a(enc(LIST.p), '紙一覧')}${sep}${a(enc(DIARY_LIST), '日記一覧')}</p>`, ''];
    const groups = new Map();
    for (const [k, v] of globalIndex()) {
      const r = L.kanaRow(readings[k] || k);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push([k, v]);
    }
    if (!groups.size) { out.push('（キーワードはまだありません）'); return out.join('\n') + '\n'; }
    out.push([...groups.keys()].map((r, i) => `[${r}](#row${i})`).join('　'), '');
    [...groups].forEach(([r, list], i) => {
      out.push(`## <a id="row${i}"></a>${r}`, '', '| キーワード | ID |', '|---|---|');
      for (const [k, v] of list) out.push(`| <a id="${L.kwAnchor(k)}"></a>${esc(k)}${readings[k] && readings[k] !== k ? ` <small style="color:#888">${h(readings[k])}</small>` : ''} | ${cell(v, k)} |`);
      out.push('');
    });
    return out.join('\n');
  }

  function topicMd(t) {
    const { rows, stars } = L.mergeTopic(t), e = t.entry;
    const out = [
      `<!-- pkm-topic ${J(t)} -->`, `# ${esc(t.name)}`, '',
      `<p ${SUB}>入口 ${e ? a(noteHref(e.s, e.id), label(e.s, e.id)) : 'なし'}${t.keyword ? `　キーワード ${a(`Index.md#${L.kwAnchor(t.keyword)}`, h(t.keyword))}` : ''}</p>`, ''
    ];
    if (rows.length) {
      out.push('| キーワード | ID |', '|---|---|');
      for (const r of rows) out.push(`| ${esc(r.kw)} | ${[idLinks('d', r.d), idLinks('p', r.p)].filter(Boolean).join(' ')} |`);
    }
    if (stars.length) out.push('', ...stars.map(s => `★ [${esc(s)}](${topicHref(s)})  `));
    out.push('', '<hr>', '', `<p ${SUB}>${a('Index.md', 'Index')}</p>`);
    return out.join('\n') + '\n';
  }

  function rebuild() {
    const files = new Map([['Index.md', indexMd()], [LIST.d, listMd('d')], [LIST.p, listMd('p')], [DIARY_LIST, diaryListMd()]]);
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
  const pub = n => ({ s: n.s, id: n.id, created: n.created, keywords: n.keywords, body: n.body, image: url(n), kind: n.kind || 'text', data: n.data || null, noid: L.isNoid(n.id), title: n.title || '' });

  const pubDiary = d => ({ date: d.date, title: d.title, body: d.body, pages: pages.get(d.date) || [] });
  const ensureDiary = date => { if (!diaries.has(date)) diaries.set(date, { date, title: '', body: '' }); return diaries.get(date); };
  // その日に作ったデジタルノートへのリンクを、日記の「今日のノート」に足す（無ければ日記も作る）
  const linkNote = n => {
    const date = L.dayOf(n.created); if (!date) return;
    const d = ensureDiary(date);
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
    state: () => ({ vault, notes: [...notes.values()].map(pub), topics: [...topics.values()], readings: { ...readings },
      diaries: [...diaries.values()].map(pubDiary), docs: Object.fromEntries(docs) }),
    diaryState: () => [...diaries.values()].map(pubDiary),
    // ===== 日記 =====
    // date の日記を作る（無ければ）。その日に作ったノートで、まだ入っていないものも足す
    openDiary(date) {
      if (!L.isDate(date)) return false;
      const d = ensureDiary(date);
      for (const n of notes.values()) if (n.s === 'd' && L.dayOf(n.created) === date) linkNote(n);
      rebuild(); return pubDiary(d);
    },
    saveDiary({ date, title, body }, oldTitle) {
      const d = ensureDiary(date), old = diaryFile(d);
      d.body = body !== undefined ? body : d.body;
      if (title !== undefined) d.title = title.trim();
      if (diaryFile(d) !== old && fs.existsSync(abs(old))) { fs.unlinkSync(abs(old)); cache.delete(old); }
      rebuild(); return pubDiary(d);
    },
    deleteDiary(date) { const d = diaries.get(date); if (!d) return false; removeFile(diaryFile(d)); diaries.delete(date); rebuild(); return true; },
    // 紙の日記: スキャン画像を P_<日付>.jpg（2枚目以降 _2 _3 …）に保存し、日記の最後の「紙の日記」に挿入する
    addDiaryScan(date, buf) {
      if (!L.isDate(date)) return false;
      const d = ensureDiary(date), list = pages.get(date) || [];
      const name = list.length ? `P_${date}_${list.length + 1}.jpg` : `P_${date}.jpg`;
      fs.writeFileSync(abs(name), buf); pages.set(date, [...list, name]);
      d.body = L.addToSection(d.body, '紙の日記', `![](${name})`);
      rebuild(); return pubDiary(d);
    },
    // ===== JSON の文書（チャット・なりきり・役・キャンバス）=====
    saveDoc(name, obj) {
      if (!/^(C|K)_[^\\/]+$/.test(name)) return false;
      docs.set(name, obj); fs.writeFileSync(abs(name + '.json'), JSON.stringify(obj, null, 1)); return true;
    },
    deleteDoc(name) { if (!docs.has(name)) return false; docs.delete(name); removeFile(name + '.json'); return true; },
    setReading(k, r) { if (r) readings[k] = r; else delete readings[k]; rebuild(); return true; },
    saveNote(x) {
      const n = get(x.s, x.id) || { s: x.s, id: x.id, created: x.s === 'd' ? (x.created || L.now()) : '', img: null, kind: 'text', data: null };
      const fresh = !get(x.s, x.id);
      n.keywords = x.keywords || []; n.body = x.body || '';
      if (x.kind) n.kind = x.kind;
      if (x.data !== undefined) n.data = x.data;
      if (x.title !== undefined) n.title = (x.title || '').trim();
      if (n.kind && n.kind !== 'text') { if (n.data) n.data.title = n.title || n.data.title; n.body = L.deriveBody(n.kind, n.data); }
      notes.set(key(x.s, x.id), n);
      if (fresh && n.s === 'd') linkNote(n); // 作った日の日記に載る
      rebuild(); return pub(n);
    },
    // IDなしのノートを作る（kind: text / rp / canvas）。ID を渡せば、その ID で作る
    createNote({ kind = 'text', id, data = null, body = '', created, title = '' } = {}) {
      const stem = id || freeStem(), n = { s: 'd', id: stem, created: created || L.now(), keywords: [], kind, title, data, img: null, body: kind === 'text' ? body : L.deriveBody(kind, data) };
      notes.set(key('d', stem), n); linkNote(n); rebuild(); return pub(n);
    },
    // IDを消して、IDなしにする（デジタルのみ）。このノートを指していた :ID は、ファイルへのリンクに直す。
    // 子のノートのIDはそのまま。トピックIndex の入口だった場合は、入口なしになる
    clearId(s, id) {
      const n = get('d', id); if (s !== 'd' || !n || L.isNoid(id)) return false;
      const stem = freeStem();
      notes.delete(key('d', id)); n.id = stem; notes.set(key('d', stem), n);
      if (fs.existsSync(abs(noteFile('d', id)))) fs.unlinkSync(abs(noteFile('d', id)));
      cache.delete(noteFile('d', id));
      for (const t of topics.values()) { // 入口と、索引の行から外す
        if (t.entry && t.entry.s === 'd' && t.entry.id === id) t.entry = null;
        t.d = L.removeFromTopic(t.d, [id]);
      }
      const label = (n.title || (n.body.split('\n').find(x => x.trim()) || '').replace(/^#+\s*/, '').slice(0, 24) || 'ノート').replace(/[\[\]]/g, ''), href = noteHref('d', stem);
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
    rename(s, from, to) {
      const n = get(s, from);
      if (!n || !isStem(to) || get(s, to)) return false;
      notes.delete(key(s, from)); n.id = to; notes.set(key(s, to), n);
      if (n.img) { const img = PRE[s] + to + path.extname(n.img); fs.renameSync(abs(n.img), abs(img)); n.img = img; }
      if (fs.existsSync(abs(noteFile(s, from)))) fs.unlinkSync(abs(noteFile(s, from)));
      cache.delete(noteFile(s, from));
      for (const t of topics.values()) if (t.entry && t.entry.s === s && t.entry.id === from) t.entry.id = to;
      if (s === 'd') { // この名前へのリンクを書き換える（日記の「今日のノート」は :ID に、ほかは D_<名前>.md のまま新しい名前に）
        const was = noteHref('d', from), now = noteHref('d', to);
        for (const d of diaries.values()) d.body = d.body.split('\n').map(l => l.trim().match(/^- \[[^\]]*\]\(/) && l.includes(`](${was})`) && !L.isNoid(to) ? `- :${to}` : l).join('\n');
        for (const m of notes.values()) if (m.kind === 'text' && m.body.includes(`](${was}`)) m.body = m.body.split(`](${was}`).join(`](${now}`);
      }
      rebuild(); return pub(n);
    },
    saveImage(s, id, buf) {
      const n = get(s, id) || { s, id, created: s === 'd' ? L.now() : '', keywords: [], body: '', img: null, kind: 'text', data: null };
      for (const e of IMG) { const f = abs(`${PRE[s]}${id}${e}`); if (fs.existsSync(f)) fs.unlinkSync(f); }
      n.img = `${PRE[s]}${id}.jpg`; fs.writeFileSync(abs(n.img), buf);
      notes.set(key(s, id), n); rebuild(); return pub(n);
    },
    // 添付をコピーする。保存した名前を返す。リンクは本文に入れる（画面側）
    addFiles(list) {
      return list.map(({ name, bytes }) => {
        const f = uniqueName(vault, name);
        fs.writeFileSync(abs(f), Buffer.from(bytes));
        return f;
      });
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
        removeFile(noteFile(s, id));
        if (n.img) removeFile(n.img);
        notes.delete(key(s, id));
      }
      for (const t of topics.values()) {
        if (t.entry && items.some(x => x.s === t.entry.s && x.id === t.entry.id)) t.entry = null;
        for (const sp of ['d', 'p']) t[sp] = L.removeFromTopic(t[sp], items.filter(x => x.s === sp).map(x => x.id));
      }
      rebuild(); return this.state();
    },
    deleteTopic(name) { topics.delete(name); removeFile(topicFile(name)); rebuild(); return true; }
  };
}

module.exports = { openVault };
