// 保存フォルダの読み書き。Brave の Markdown Viewer でもたどれる .md を書き出す
//   Index.md       … 入口。グローバルIndex（キーワード → ID）とトピックIndexの一覧
//   デジタル.md / 紙.md … ID の木の一覧
//   digital/<ID>.md, paper/<ID>.md(+<ID>.jpg), topic/<名前>.md
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const DIR = { d: 'digital', p: 'paper' };
const LIST = { d: 'デジタル.md', p: '紙.md' };
const SP = { d: 'デジタル', p: '紙' };
const IMG = ['.jpg', '.jpeg', '.png', '.webp'];
const validId = s => L.isId(s) && !/^\d{8,}$/.test(s); // 日時名のファイルは除外
const enc = s => encodeURIComponent(s);
const esc = s => String(s).replace(/([\\`*_[\]<>|#])/g, '\\$1');
const J = o => JSON.stringify(o).replace(/--/g, '-\\u002d');
const meta = (text, tag) => { const m = text.match(new RegExp(`^<!-- ${tag} (.*) -->`, 'm')); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };
const BODY = '<!-- body -->\n';

function openVault(vault) {
  const notes = new Map(), topics = new Map(), cache = new Map();
  const key = (s, id) => s + ':' + id;
  const get = (s, id) => notes.get(key(s, id));
  const abs = p => path.join(vault, p);
  const notePath = (s, id) => `${DIR[s]}/${id}.md`;
  const topicPath = name => `topic/${L.fileName(name)}.md`;

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
        const i = text.indexOf(BODY);
        n.body = L.mdToBody(i >= 0 ? text.slice(i + BODY.length) : text);
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
    if (t && t.name) topics.set(t.name, { name: t.name, anchors: t.anchors || [], d: t.d || '', p: t.p || '' });
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
  const topicsOf = (s, id) => [...topics.values()].filter(t => t.anchors.some(a => a.s === s && a.id === id));
  const summary = n => { const l = (n.body.split('\n').find(x => x.trim()) || '').trim(); return esc(l.length > 40 ? l.slice(0, 40) + '…' : l); };
  const kwLinks = (kws, up) => kws.map(k => `[${esc(k)}](${up}Index.md#${L.kwAnchor(k)})`).join(' ');

  function noteMd(n) {
    const list = ids(n.s), has = x => !!get(n.s, x), i = list.indexOf(n.id);
    const parent = L.parentIn(n.id, has), kids = list.filter(x => L.parentIn(x, has) === n.id);
    const link = x => `[${x}](${enc(x)}.md)`;
    const nav = [
      '[Index](../Index.md)',
      n.s === 'd' ? '[デジタル一覧](../デジタル.md)' : `[紙一覧](../紙.md#n${L.root(n.id)})`,
      parent && '上 ' + link(parent),
      i > 0 && '前 ' + link(list[i - 1]),
      i < list.length - 1 && '次 ' + link(list[i + 1]),
      kids.length && '下 ' + kids.map(link).join(' '),
      ...topicsOf(n.s, n.id).map(t => `トピックIndex [${esc(t.name)}](../${topicPath(t.name).split('/').map(enc).join('/')})`)
    ].filter(Boolean).join(' · ');
    const info = [n.s === 'd' && n.created, n.keywords.length && 'キーワード: ' + kwLinks(n.keywords, '../')].filter(Boolean).join(' · ');
    return [
      `<!-- pkm ${J(n.s === 'd' ? { created: n.created, keywords: n.keywords } : { keywords: n.keywords })} -->`,
      `# ${n.s === 'p' ? '紙 ' : ''}${n.id}`, '',
      info && info + '  ', nav, '',
      n.img ? `![${n.id}](${enc(n.img)})\n` : null,
      BODY + L.bodyToMd(n.body, x => enc(x) + '.md'), ''
    ].filter(x => x !== null && x !== 0 && x !== false).join('\n');
  }

  function treeLines(s, dir) {
    const list = ids(s), has = x => !!get(s, x), depth = {};
    return list.map(id => {
      const p = L.parentIn(id, has); depth[id] = p ? depth[p] + 1 : 0;
      const n = get(s, id);
      const extra = [s === 'd' && n.created.slice(0, 10), n.img && '📷', summary(n), n.keywords.length && '— ' + n.keywords.map(esc).join('、')].filter(Boolean).join(' ');
      return `${'  '.repeat(depth[id])}- [${id}](${dir}/${enc(id)}.md) ${extra}`;
    });
  }

  function listMd(s) {
    const nav = `[Index](Index.md) · [${SP[s === 'd' ? 'p' : 'd']}一覧](${LIST[s === 'd' ? 'p' : 'd']})`;
    if (s === 'd') return [`# デジタル`, '', nav, '', ...treeLines('d', 'digital'), ''].join('\n');
    // 紙は先頭の番号ごとに分ける
    const groups = new Map();
    for (const line of treeLines('p', 'paper')) {
      const id = line.match(/\[([^\]]+)\]/)[1], r = L.root(id);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(line);
    }
    const out = ['# 紙', '', nav, '', [...groups.keys()].map(r => `[${r}](#n${r})`).join(' · '), ''];
    for (const [r, lines] of groups) out.push(`## <a id="n${r}"></a>${r}`, '', ...lines, '');
    return out.join('\n');
  }

  function globalIndex() {
    const m = new Map();
    for (const n of notes.values()) for (const k of n.keywords) {
      if (!m.has(k)) m.set(k, { d: [], p: [] });
      m.get(k)[n.s].push(n.id);
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0], 'ja'));
  }
  const idLinks = (s, list, up) => list.slice().sort(L.cmpId).map(x => `[${s === 'p' ? '紙' : ''}${x}](${up}${DIR[s]}/${enc(x)}.md)`).join(' ');

  function indexMd() {
    const out = ['# Index', '', '[デジタル一覧](デジタル.md) · [紙一覧](紙.md) · [トピックIndex](#topics)', '', '## キーワード', ''];
    for (const [k, v] of globalIndex()) out.push(`- <a id="${L.kwAnchor(k)}"></a>**${esc(k)}**　${[idLinks('d', v.d, ''), idLinks('p', v.p, '')].filter(Boolean).join(' · ')}`);
    out.push('', '## <a id="topics"></a>トピックIndex', '');
    for (const t of [...topics.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'))) {
      const anch = t.anchors.map(a => idLinks(a.s, [a.id], '')).join(' ');
      out.push(`- [${esc(t.name)}](${topicPath(t.name).split('/').map(enc).join('/')})${anch ? ' — 入口 ' + anch : ''}`);
    }
    return out.join('\n') + '\n';
  }

  function topicMd(t) {
    const { rows, stars } = L.mergeTopic(t);
    const anch = t.anchors.map(a => idLinks(a.s, [a.id], '../')).join(' ');
    const out = [
      `<!-- pkm-topic ${J(t)} -->`, `# ${esc(t.name)}`, '',
      `[Index](../Index.md#topics)${anch ? ' · 入口 ' + anch : ''}`, '',
      '| キーワード | ID |', '|---|---|'
    ];
    for (const r of rows) out.push(`| ${esc(r.kw)} | ${[idLinks('d', r.d, '../'), idLinks('p', r.p, '../')].filter(Boolean).join(' · ')} |`);
    if (stars.length) out.push('', ...stars.map(s => `★ [${esc(s)}](${enc(L.fileName(s))}.md)  `));
    return out.join('\n') + '\n';
  }

  function rebuild() {
    const files = new Map([['Index.md', indexMd()], [LIST.d, listMd('d')], [LIST.p, listMd('p')]]);
    for (const n of notes.values()) files.set(notePath(n.s, n.id), noteMd(n));
    for (const t of topics.values()) files.set(topicPath(t.name), topicMd(t));
    for (const [p, c] of files) if (cache.get(p) !== c) { fs.writeFileSync(abs(p), c); cache.set(p, c); }
  }

  // ===== 画面とのやりとり =====
  const url = n => n.img ? 'file://' + abs(`${DIR[n.s]}/${n.img}`).split('/').map(enc).join('/') + '?' + fs.statSync(abs(`${DIR[n.s]}/${n.img}`)).mtimeMs : null;
  const pub = n => ({ s: n.s, id: n.id, created: n.created, keywords: n.keywords, body: n.body, image: url(n) });

  rebuild();
  return {
    vault,
    state: () => ({ vault, notes: [...notes.values()].map(pub), topics: [...topics.values()] }),
    saveNote(x) {
      const n = get(x.s, x.id) || { s: x.s, id: x.id, created: x.s === 'd' ? (x.created || L.now()) : '', img: null };
      n.keywords = x.keywords || []; n.body = x.body || '';
      notes.set(key(x.s, x.id), n); rebuild(); return pub(n);
    },
    rename(s, a, b) {
      const n = get(s, a);
      if (!n || !validId(b) || get(s, b)) return false;
      notes.delete(key(s, a)); n.id = b; notes.set(key(s, b), n);
      if (n.img) { const img = b + path.extname(n.img); fs.renameSync(abs(`${DIR[s]}/${n.img}`), abs(`${DIR[s]}/${img}`)); n.img = img; }
      if (fs.existsSync(abs(notePath(s, a)))) fs.unlinkSync(abs(notePath(s, a)));
      cache.delete(notePath(s, a));
      for (const t of topics.values()) for (const x of t.anchors) if (x.s === s && x.id === a) x.id = b;
      rebuild(); return pub(n);
    },
    saveImage(s, id, buf) {
      const n = get(s, id) || { s, id, created: s === 'd' ? L.now() : '', keywords: [], body: '', img: null };
      for (const e of IMG) { const p = abs(`${DIR[s]}/${id}${e}`); if (fs.existsSync(p)) fs.unlinkSync(p); }
      n.img = id + '.jpg'; fs.writeFileSync(abs(`${DIR[s]}/${n.img}`), buf);
      notes.set(key(s, id), n); rebuild(); return pub(n);
    },
    saveTopic(t) {
      topics.set(t.name, { name: t.name, anchors: t.anchors || [], d: t.d || '', p: t.p || '' });
      rebuild(); return true;
    }
  };
}

module.exports = { openVault };
