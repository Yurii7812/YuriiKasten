'use strict';
// スマホのメモ（USB で読んだもの）を vault に取り込む
//   すべてのメモは、PC の「チャットメモ」に入る（トピックは、スマホと同じ名前。ノートにはならない。ノートにするのは、あとで選んだものだけ）
//   さらに: 日記トピック → その日の「日記」に、時刻つきの行でも／時系列記録のトピック（夢など）→ その種類の、その日のノートにも／
//           「1つのノートにまとめる」トピック → そのトピックのノート（IDなし）にも追記
//   分岐元・文脈は、チャットメモでは使わない（返信の @ に直す）。紙のスキャン（番号つき）→ その番号の紙のノートの画像。番号の無いものは、スマホで番号を付けてから
// 取り込み先は .pkm-import.json に覚える（同じメモを二度取り込まない。取り込み済みの印をスマホへ返すのに使う）
const fs = require('fs'), path = require('path');
const L = require('./lib');
const pad = x => String(x).padStart(2, '0');
const hm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const MEMO_LINK = /\[([^\]\n]*)\]\(memo:([^)\s]+)\)/g;

const stateFile = v => path.join(v.vault, '.pkm-import.json');
function loadState(v) { try { return { ids: {}, scans: [], topicNotes: {}, ...JSON.parse(fs.readFileSync(stateFile(v), 'utf8')) }; } catch { return { ids: {}, scans: [], topicNotes: {} }; } }
const saveState = (v, st) => fs.writeFileSync(stateFile(v), JSON.stringify(st, null, 1));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function importCapture(v, data) {
  const st = loadState(v), sum = { notes: 0, chats: 0, days: 0, appended: 0, scans: 0, blankScans: 0, already: 0, updated: 0, removed: 0 };
  const names = new Map();   // スマホの写真の名前 → vault に入れた名前
  const saveImages = list => (list || []).filter(n => data.images[n]).map(n => {
    if (!names.has(n)) names.set(n, v.addFiles([{ name: n, bytes: [...data.images[n]] }])[0]);
    return names.get(n);
  });
  const attachmentMd = n => /\.(?:jpe?g|png|gif|webp|bmp|avif|svg)$/i.test(n) ? `![](${n})` : `[${n}](${n})`;
  const chat = JSON.parse(JSON.stringify((v.state().docs || {})['C_チャット'] || {})); chat.topics = chat.topics || []; chat.messages = chat.messages || []; chat.noted = chat.noted || {}; chat.trash = chat.trash || []; chat.converted = chat.converted || {};
  const memoOf = id => st.ids[id] && st.ids[id].memo;     // スマホのメモ id → チャットメモの id
  const noteByStem = stem => v.state().notes.find(n => n.stem === stem);
  const entries = [...data.entries].sort((a, b) => a.created - b.created), modes = data.topicModes || {};
  let chatTouched = false;
  const chatMsg = id => chat.messages.find(x => x.id === id);
  // スマホで消した PC のメモ → PC でも（ごみ箱へ）
  for (const pid of data.pcDeleted || []) { const m = chatMsg(pid); if (m) { chat.messages = chat.messages.filter(x => x !== m); chat.trash.push({ ...m, deleted: Date.now() }); chatTouched = true; sum.removed++; } }
  for (const e of entries) {
    if (e.pcId) {   // PC から来たメモ: スマホで直したもの（新しい方が勝つ）だけ PC に反映
      const m = chatMsg(e.pcId); if (m && (e.edited || 0) > (m.edited || 0)) { m.text = e.text; m.topic = e.topic === 'メモ' ? '' : (e.topic || ''); if (e.ups && e.ups.length) m.ups = [...e.ups]; else delete m.ups; m.edited = e.edited; chatTouched = true; sum.updated++; }
      continue;
    }
    if (st.ids[e.id]) {   // 取り込み済みのメモを、スマホで直した（新しい方が勝つ）→ チャットメモの本文も。日の・まとめのノートには、手を入れない
      const rec = st.ids[e.id], snapEdited = (rec.snap && rec.snap.edited) || 0, m = chatMsg(rec.memo);
      if (m && (e.edited || 0) > snapEdited && (e.text || '') !== ((rec.snap && rec.snap.text) || '')) {
        const keep = (m.text.match(/^(\[@[^\]]*\]\(memo:[^)]+\)\s*)+/) || [''])[0], imgs = m.text.match(/\n?!\[\]\([^)]*\)/g) || [];
        m.text = (keep + (e.text || '').replace(MEMO_LINK, (_a, label) => label).trim() + imgs.join('')).trim(); m.edited = e.edited; chatTouched = true; sum.updated++;
        rec.snap = e;
      }
      sum.already++; continue;
    }
    const topic = e.topic === 'メモ' ? '' : (e.topic || ''), at = L.now(new Date(e.created)), date = L.dayOf(at), mode = modes[topic] || {};
    const imgs = saveImages(e.images).map(attachmentMd);
    const mention = id => { const m = memoOf(id); const o = m && chat.messages.find(x => x.id === m); return o ? `[@${(o.text || '').split('\n')[0].replace(/[\[\]()]/g, '').slice(0, 14)}](memo:${o.id})` : ''; };
    const repl = [...new Set([e.parent, ...(e.contexts || [])].filter(Boolean).map(memoOf).filter(Boolean))];   // 昔の分岐元・文脈・今の返信先 → 返信（リプライ）
    const text = (e.text || '').replace(MEMO_LINK, (_a, label, id) => mention(id) || label).trim();
    const memoText = [text, ...imgs].filter(x => x.trim()).join('\n').trim();
    // 1. チャットメモに
    if (topic && topic !== '日記' && !chat.topics.some(t => t.name === topic)) chat.topics.push({ name: topic, type: 'bubble', stamp: true, entry: null });
    const memo = { id: uid(), topic, t: e.created, text: memoText, src: 'phone:' + e.id };
    if (repl.length) memo.replies = repl;
    if (e.ups && e.ups.length) memo.ups = [...e.ups];
    chat.messages.push(memo); chatTouched = true; sum.chats++;
    st.ids[e.id] = { dest: `chat:${memo.id}`, memo: memo.id, snap: e };
    // 2. 日記・記録・まとめのノートにも
    const stamp = e.notime ? '' : hm(e.created) + ' ';
    const line = [stamp + text, ...imgs].filter(x => x.trim()).join('\n');
    if (topic === '日記' || (mode.record && topic)) {
      const kind = topic === '日記' ? '日記' : topic;
      if (!v.records().some(r => r.name === kind)) v.addRecord(kind);
      v.appendToDay(kind, date, line); sum.days++;
    } else if (mode.single && topic) {
      let n = st.topicNotes[topic] && noteByStem(st.topicNotes[topic]);
      if (!n) { const c = v.createNote({ kind: 'text', title: topic, created: at, body: '', keywords: [] }); st.topicNotes[topic] = c.stem; n = c; }
      const head = mode.stamp !== false && !(n.body || '').includes(`## ${date}`) ? `## ${date}\n\n` : '';
      v.saveNote({ s: 'd', id: n.id, keywords: n.keywords, body: ((n.body || '').trim() ? n.body.replace(/\s+$/, '') + '\n\n' : '') + head + line, title: n.title, created: n.created });
      sum.appended++;
    }
  }
  if (chatTouched) v.saveDoc('C_チャット', chat);
  // 紙のスキャン（番号つき）
  const done = [];
  for (const sc of (data.scans && data.scans.index) || []) {
    if (sc.imported || st.scans.includes(sc.name)) continue;
    if (!sc.id) { sum.blankScans++; continue; }
    const buf = data.scans.files[sc.name]; if (!buf) continue;
    v.saveImage('p', sc.id, Buffer.from(buf)); st.scans.push(sc.name); done.push(sc.name); sum.scans++;
  }
  saveState(v, st);
  return { sum, state: st, scansDone: st.scans.filter(n => ((data.scans && data.scans.index) || []).some(x => x.name === n)) };
}
// スマホへ返す「取り込み済み」: 取り込み先がまだ vault にあるものだけ（消したノートは、取り込み済みにしない）
function importedEntries(v) {
  const st = loadState(v), s = v.state(), chat = (s.docs || {})['C_チャット'] || {}, has = dest => {
    if (dest.startsWith('chat:')) { const id = dest.slice(5); return (chat.messages || []).some(m => m.id === id) || (chat.trash || []).some(m => m.id === id); }
    if (dest.startsWith('record:')) { const [, kind, date] = dest.split(':'); return s.diaries.some(d => d.kind === kind && d.date === date); }
    return s.notes.some(n => n.stem === dest);
  };
  return Object.values(st.ids).filter(x => has(x.dest)).map(x => x.snap);
}
function summaryText(sum) {
  const parts = [];
  if (sum.chats) parts.push(`チャットメモに ${sum.chats} 件`); if (sum.days) parts.push(`日記・記録にも ${sum.days} 件`); if (sum.appended) parts.push(`まとめのノートにも ${sum.appended} 件`);
  if (sum.scans) parts.push(`紙のスキャン ${sum.scans} 枚`); if (sum.updated) parts.push(`直したメモ ${sum.updated} 件`); if (sum.removed) parts.push(`消したメモ ${sum.removed} 件`);
  let t = parts.length ? '取り込みました: ' + parts.join('、') + '。' : '新しく取り込むものはありませんでした。';
  if (sum.blankScans) t += `\n番号の無いスキャン ${sum.blankScans} 枚は、スマホで番号を付けてから取り込めます。`;
  return t;
}
// スマホへ渡す、PC のメモ全部と日のノート（スマホで見られる・直せる。スマホからこの PC のメモに戻った分は、取り込むときに反映）
function pcMemos(v) {
  const s = v.state(), chat = (s.docs || {})['C_チャット'] || {};
  const alive = new Set((chat.messages || []).map(m => m.id)), st = loadState(v);
  const removed = Object.entries(st.ids).filter(([, rec]) => rec && rec.memo && !alive.has(rec.memo)).map(([eid]) => eid);   // PC で消したメモ（スマホで書いたもの）。スマホからも消す
  return {
    version: 2, removed,
    memos: (chat.messages || []).filter(m => !String(m.src || '').startsWith('phone:')).map(m => { const os = (m.replies || (m.reply ? [m.reply] : [])).map(id => (chat.messages || []).find(x => x.id === id)).filter(Boolean); return { id: m.id, topic: m.topic || '', ups: m.ups || [], t: m.t, text: os.map(o => '↩ ' + String(o.text || '').split('\n')[0].slice(0, 40) + '\n').join('') + (m.text || ''), edited: m.edited || 0 }; }),
    days: (s.diaries || []).map(d => ({ kind: d.kind || '日記', date: d.date, body: d.body || '' })),
  };
}
module.exports = { pcMemos, importCapture, importedEntries, summaryText, loadState };
