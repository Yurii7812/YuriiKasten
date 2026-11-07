// 保存フォルダの読み書き。Brave の Markdown Viewer でもたどれる .md を書き出す
//   Index.md            … グローバルIndex（キーワード → ID）
//   デジタル.md / 紙.md  … 先頭の ID だけの一覧
//   digital/<ID>.md, paper/<ID>.md(+<ID>.jpg), topic/<名前>.md
// ノートの下に 前・次・上・分岐・トピックIndex のリンクがあるので、リンクだけで全部に届く
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const DIR = { d: 'digital', p: 'paper' };
const LIST = { d: 'デジタル.md', p: '紙.md' };
const SP = { d: 'デジタル', p: '紙' };
const IMG = ['.jpg', '.jpeg', '.png', '.webp'];
const validId = s => L.isId(s) && !/^\d{8,}$/.test(s); // 日時名のファイルは除外
const enc = s => encodeURIComponent(s);
const esc = s => String(s).replace(/([\\`*_[\]<>|#])/g, '\\$1'); // Markdown の中
const h = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); // HTML の中
const a = (href, text) => `<a href="${href}">${text}</a>`;
const J = o => JSON.stringify(o).replace(/--/g, '-\\u002d');
const meta = (text, tag) => { const m = text.match(new RegExp(`^<!-- ${tag} (.*) -->`, 'm')); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };
const BODY = '<!-- body -->\n', NAV = '\n<!-- nav -->';
const SUB = 'style="color:#888;font-size:.9em"';
const sep = '　｜　';

function openVault(vault) {
  const notes = new Map(), topics = new Map(), cache = new Map();
  let readings = {}; // キーワード → 読み（Index の並び）
  const key = (s, id) => s + ':' + id;
  const get = (s, id) => notes.get(key(s, id));
  const abs = p => path.join(vault, p);
  const notePath = (s, id) => `${DIR[s]}/${id}.md`;
  const topicPath = name => `topic/${L.fileName(name)}.md`;
  const topicHref = (name, up) => up + 'topic/' + enc(L.fileName(name)) + '.md';

  // ===== 読み込み =====
  for (const d of Object.values(DIR).concat('topic')) fs.mkdirSync(abs(d), { recursive: true });
  migrate();
  for (const s of ['d', 'p']) {
    for (const f of fs.readdirSync(abs(DIR[s]))) {
      const e = path.extname(f).toLowerCase(), id = path.basename(f, path.extname(f));
      if (!validId(id)) continue;
      const n = get(s, id) || { s, id, created: '', keywords: [], body: '', img: null };
      notes.set(key(s, id), n);
      if (e === '.md') {
        const text = fs.readFileSync(abs(`${DIR[s]}/${f}`), 'utf8'); cache.set(`${DIR[s]}/${f}`, text);
        const m = meta(text, 'pkm') || {};
        n.created = m.created || n.created; n.keywords = m.keywords || [];
        const i = text.indexOf(BODY), j = text.indexOf(NAV);
        n.body = L.mdToBody(i >= 0 ? text.slice(i + BODY.length, j > i ? j : undefined) : text);
      } else if (IMG.includes(e)) n.img = f;
    }
  }
  for (const n of notes.values()) if (n.s === 'd' && !n.created) {
    const p = abs(notePath('d', n.id));
    n.created = L.now(fs.existsSync(p) ? fs.statSync(p).mtime : new Date());
  }
  for (const f of fs.readdirSync(abs('topic'))) {
    if (!f.endsWith('.md')) continue;
    const text = fs.readFileSync(abs('topic/' + f), 'utf8'); cache.set('topic/' + f, text);
    const t = meta(text, 'pkm-topic');
    if (t && t.name) topics.set(t.name, { name: t.name, entry: t.entry || (t.anchors || [])[0] || null, keyword: t.keyword || '', d: t.d || '', p: t.p || '' });
  }

  if (fs.existsSync(abs('Index.md'))) {
    const text = fs.readFileSync(abs('Index.md'), 'utf8'); cache.set('Index.md', text);
    readings = (meta(text, 'pkm-index') || {}).readings || {};
  }

  // 前の版（フォルダ直下に <ID>.md / <ID>.jpg）を移す
  function migrate() {
    for (const f of fs.readdirSync(vault)) {
      const e = path.extname(f).toLowerCase(), id = path.basename(f, path.extname(f));
      if (!validId(id) || !(e === '.md' || IMG.includes(e))) continue;
      const hasImg = IMG.some(x => fs.existsSync(abs(id + x)));
      const s = hasImg ? 'p' : 'd';
      if (e === '.md') {
        const text = fs.readFileSync(abs(f), 'utf8');
        const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/), fm = {};
        if (m) m[1].split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) fm[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
        const date = (fm.date || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
        notes.set(key(s, id), {
          s, id, keywords: L.splitKw(fm.keywords), body: (m ? m[2] : text).replace(/\n$/, ''), img: null,
          created: s === 'd' ? (date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')} 00:00` : L.now(fs.statSync(abs(f)).mtime)) : ''
        });
        fs.renameSync(abs(f), abs(`${DIR[s]}/${f}.old`));
      } else fs.renameSync(abs(f), abs(`${DIR.p}/${f}`));
    }
  }

  // ===== 書き出し =====
  const ids = s => [...notes.values()].filter(n => n.s === s).map(n => n.id).sort(L.cmpId);
  const topicOf = (s, id) => [...topics.values()].find(t => t.entry && t.entry.s === s && t.entry.id === id);
  const label = (s, id) => (s === 'p' ? '紙' : '') + id;

  function noteMd(n) {
    const list = ids(n.s), has = x => !!get(n.s, x), i = list.indexOf(n.id);
    const parent = L.parentIn(n.id, has), kids = list.filter(x => L.parentIn(x, has) === n.id);
    const go = x => `${enc(x)}.md`, t = topicOf(n.s, n.id);
    const sub = [n.s === 'd' && h(n.created), n.keywords.length && '索引 ' + n.keywords.map(k => a(`../Index.md#${L.kwAnchor(k)}`, h(k))).join('・')].filter(Boolean).join('　');
    const nav1 = [
      i > 0 && a(go(list[i - 1]), '← ' + list[i - 1]),
      parent && a(go(parent), '↑ ' + parent),
      kids.length && '分岐 ' + kids.map(k => a(go(k), k)).join(' '),
      i < list.length - 1 && a(go(list[i + 1]), list[i + 1] + ' →')
    ].filter(Boolean).join(sep);
    const nav2 = [t && a(topicHref(t.name, '../'), 'トピックIndex ' + h(t.name)), a('../Index.md', 'Index'), a('../' + enc(LIST[n.s]), SP[n.s] + '一覧')].filter(Boolean).join(sep);
    return [
      `<!-- pkm ${J(n.s === 'd' ? { created: n.created, keywords: n.keywords } : { keywords: n.keywords })} -->`,
      `# ${n.s === 'p' ? '紙 ' : ''}${n.id}`, '',
      sub ? `<p ${SUB}>${sub}</p>\n` : null,
      n.img ? `![${n.id}](${enc(n.img)})\n` : null,
      BODY + L.bodyToMd(n.body, x => enc(x) + '.md') + '\n' + NAV,
      '<hr>', '', `<p ${SUB}>${nav1 ? nav1 + '<br>' : ''}${nav2}</p>`, ''
    ].filter(x => x !== null).join('\n');
  }

  // 一覧: 先頭の ID（祖先の無いもの）だけ
  function listMd(s) {
    const has = x => !!get(s, x), o = s === 'd' ? 'p' : 'd';
    const roots = ids(s).filter(id => !L.parentIn(id, has));
    return [`# ${SP[s]}`, '', `<p ${SUB}>${a('Index.md', 'Index')}${sep}${a(enc(LIST[o]), SP[o] + '一覧')}</p>`, '',
      roots.map(id => `[${id}](${DIR[s]}/${enc(id)}.md)`).join('　') || '（まだありません）', ''].join('\n');
  }

  function globalIndex() {
    const m = new Map();
    for (const n of notes.values()) for (const k of n.keywords) {
      if (!m.has(k)) m.set(k, { d: [], p: [] });
      m.get(k)[n.s].push(n.id);
    }
    const rd = k => readings[k];
    return [...m].sort((x, y) => L.byReading(rd)(x[0], y[0]));
  }
  const idLinks = (s, list, up) => list.slice().sort(L.cmpId).map(x => `[${label(s, x)}](${up}${DIR[s]}/${enc(x)}.md)`).join(' ');
  const cell = v => [idLinks('d', v.d, ''), idLinks('p', v.p, '')].filter(Boolean).join(' ');

  // 読みのあいうえお順。行（あ・か・さ…）ごとに分ける
  // そのキーワードのトピックIndex があるキーワードには赤い点（押すとそのトピックIndex へ）
  const dot = k => { const t = [...topics.values()].find(x => x.keyword === k); return t ? `<a href="${topicHref(t.name, '')}" title="トピックIndex ${h(t.name)}" style="color:#c0392b;text-decoration:none">●</a> ` : ''; };
  function indexMd() {
    const out = [`<!-- pkm-index ${J({ readings: { ...readings } })} -->`, '# Index', '',
      `<p ${SUB}>${a(enc(LIST.d), 'デジタル一覧')}${sep}${a(enc(LIST.p), '紙一覧')}</p>`, ''];
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
      for (const [k, v] of list) out.push(`| <a id="${L.kwAnchor(k)}"></a>${dot(k)}${esc(k)}${readings[k] && readings[k] !== k ? ` <small style="color:#888">${h(readings[k])}</small>` : ''} | ${cell(v)} |`);
      out.push('');
    });
    return out.join('\n');
  }

  function topicMd(t) {
    const { rows, stars } = L.mergeTopic(t), e = t.entry;
    const out = [
      `<!-- pkm-topic ${J(t)} -->`, `# ${esc(t.name)}`, '',
      `<p ${SUB}>入口 ${e ? a(`../${DIR[e.s]}/${enc(e.id)}.md`, label(e.s, e.id)) : 'なし'}${t.keyword ? `　キーワード ${a(`../Index.md#${L.kwAnchor(t.keyword)}`, h(t.keyword))}` : ''}</p>`, ''
    ];
    if (rows.length) {
      out.push('| キーワード | ID |', '|---|---|');
      for (const r of rows) out.push(`| ${esc(r.kw)} | ${[idLinks('d', r.d, '../'), idLinks('p', r.p, '../')].filter(Boolean).join(' ')} |`);
    }
    if (stars.length) out.push('', ...stars.map(s => `★ [${esc(s)}](${enc(L.fileName(s))}.md)  `));
    out.push('', '<hr>', '', `<p ${SUB}>${a('../Index.md', 'Index')}</p>`);
    return out.join('\n') + '\n';
  }

  function rebuild() {
    const files = new Map([['Index.md', indexMd()], [LIST.d, listMd('d')], [LIST.p, listMd('p')]]);
    for (const n of notes.values()) files.set(notePath(n.s, n.id), noteMd(n));
    for (const t of topics.values()) files.set(topicPath(t.name), topicMd(t));
    for (const [p, c] of files) if (cache.get(p) !== c) { fs.writeFileSync(abs(p), c); cache.set(p, c); }
  }
  function removeFile(p) { // 消すときはゴミ箱へ
    if (!fs.existsSync(abs(p))) return;
    fs.mkdirSync(abs('.trash'), { recursive: true });
    fs.renameSync(abs(p), abs(`.trash/${Date.now()}-${path.basename(p)}`));
    cache.delete(p);
  }

  // ===== 画面とのやりとり =====
  const url = n => n.img ? 'file://' + abs(`${DIR[n.s]}/${n.img}`).split('/').map(enc).join('/') + '?' + fs.statSync(abs(`${DIR[n.s]}/${n.img}`)).mtimeMs : null;
  const pub = n => ({ s: n.s, id: n.id, created: n.created, keywords: n.keywords, body: n.body, image: url(n) });

  rebuild();
  return {
    vault,
    state: () => ({ vault, notes: [...notes.values()].map(pub), topics: [...topics.values()], readings: { ...readings } }),
    setReading(k, r) { if (r) readings[k] = r; else delete readings[k]; rebuild(); return true; },
    saveNote(x) {
      const n = get(x.s, x.id) || { s: x.s, id: x.id, created: x.s === 'd' ? (x.created || L.now()) : '', img: null };
      n.keywords = x.keywords || []; n.body = x.body || '';
      notes.set(key(x.s, x.id), n); rebuild(); return pub(n);
    },
    rename(s, from, to) {
      const n = get(s, from);
      if (!n || !validId(to) || get(s, to)) return false;
      notes.delete(key(s, from)); n.id = to; notes.set(key(s, to), n);
      if (n.img) { const img = to + path.extname(n.img); fs.renameSync(abs(`${DIR[s]}/${n.img}`), abs(`${DIR[s]}/${img}`)); n.img = img; }
      if (fs.existsSync(abs(notePath(s, from)))) fs.unlinkSync(abs(notePath(s, from)));
      cache.delete(notePath(s, from));
      for (const t of topics.values()) if (t.entry && t.entry.s === s && t.entry.id === from) t.entry.id = to;
      rebuild(); return pub(n);
    },
    saveImage(s, id, buf) {
      const n = get(s, id) || { s, id, created: s === 'd' ? L.now() : '', keywords: [], body: '', img: null };
      for (const e of IMG) { const p = abs(`${DIR[s]}/${id}${e}`); if (fs.existsSync(p)) fs.unlinkSync(p); }
      n.img = id + '.jpg'; fs.writeFileSync(abs(`${DIR[s]}/${n.img}`), buf);
      notes.set(key(s, id), n); rebuild(); return pub(n);
    },
    // oldName があれば名前の変更
    saveTopic(t, oldName) {
      if (t.entry && [...topics.values()].some(o => o.name !== (oldName || t.name) && o.entry && o.entry.s === t.entry.s && o.entry.id === t.entry.id)) return false;
      if (oldName && oldName !== t.name) {
        topics.delete(oldName);
        if (topicPath(oldName) !== topicPath(t.name)) { if (fs.existsSync(abs(topicPath(oldName)))) fs.unlinkSync(abs(topicPath(oldName))); cache.delete(topicPath(oldName)); }
      }
      topics.set(t.name, { name: t.name, entry: t.entry || null, keyword: t.keyword || '', d: t.d || '', p: t.p || '' });
      rebuild(); return true;
    },
    // ノートを消す（ファイルは .trash へ）。入口だった索引は入口なしに、索引の行からも ID を外す
    deleteNotes(items) {
      for (const { s, id } of items) {
        const n = get(s, id); if (!n) continue;
        removeFile(notePath(s, id));
        if (n.img) removeFile(`${DIR[s]}/${n.img}`);
        notes.delete(key(s, id));
      }
      for (const t of topics.values()) {
        if (t.entry && items.some(x => x.s === t.entry.s && x.id === t.entry.id)) t.entry = null;
        for (const sp of ['d', 'p']) t[sp] = L.removeFromTopic(t[sp], items.filter(x => x.s === sp).map(x => x.id));
      }
      rebuild(); return this.state();
    },
    deleteTopic(name) { topics.delete(name); removeFile(topicPath(name)); rebuild(); return true; }
  };
}

module.exports = { openVault };
