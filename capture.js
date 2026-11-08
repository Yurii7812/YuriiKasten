'use strict';
// スマホのメモ（USB で読んだもの）を vault に取り込む。Gnosis の \M と同じ決まり
//   日記トピック → その日の「日記」に、時刻つきで入る
//   時系列記録のトピック（夢など）→ その種類の、その日のノートに、時刻つきで入る
//   「1つのノートにまとめる」トピック → そのトピックのノート（IDなし）に追記
//   ふつうのトピック・未所属 → 1 件 = 1 つの「未整理」（IDなし）ノート。トピック名はキーワードに。分岐元・文脈は先頭にリンクの行
//   紙のスキャン（番号つき）→ その番号の紙のノートの画像。番号の無いものは、スマホで番号を付けてから
// 取り込み先は .pkm-import.json に覚える（同じメモを二度取り込まない。取り込み済みの印をスマホへ返すのに使う）
const fs = require('fs'), path = require('path');
const L = require('./lib');
const pad = x => String(x).padStart(2, '0');
const hm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const MEMO_LINK = /\[([^\]\n]*)\]\(memo:([^)\s]+)\)/g;

const stateFile = v => path.join(v.vault, '.pkm-import.json');
function loadState(v) { try { return { ids: {}, scans: [], topicNotes: {}, ...JSON.parse(fs.readFileSync(stateFile(v), 'utf8')) }; } catch { return { ids: {}, scans: [], topicNotes: {} }; } }
const saveState = (v, st) => fs.writeFileSync(stateFile(v), JSON.stringify(st, null, 1));

function importCapture(v, data) {
  const st = loadState(v), sum = { notes: 0, days: 0, appended: 0, scans: 0, blankScans: 0, already: 0 };
  const names = new Map();   // スマホの写真の名前 → vault に入れた名前
  const saveImages = list => (list || []).filter(n => data.images[n]).map(n => {
    if (!names.has(n)) names.set(n, v.addFiles([{ name: n, bytes: [...data.images[n]] }])[0]);
    return names.get(n);
  });
  const stemOfEntry = id => { const t = st.ids[id]; return t && t.dest && /^\d{14}/.test(t.dest) ? t.dest : null; };
  const noteByStem = stem => v.state().notes.find(n => n.stem === stem);
  const entries = [...data.entries].sort((a, b) => a.created - b.created), modes = data.topicModes || {};
  for (const e of entries) {
    if (st.ids[e.id]) { sum.already++; continue; }
    const topic = e.topic === 'メモ' ? '' : (e.topic || ''), at = L.now(new Date(e.created)), date = L.dayOf(at), mode = modes[topic] || {};
    const imgs = saveImages(e.images).map(n => `![](${n})`);
    const text = (e.text || '').replace(MEMO_LINK, (_a, label, id) => { const s = stemOfEntry(id); return s ? `[${label}](${s}.md)` : label; }).trim();
    const stamp = e.notime ? '' : hm(e.created) + ' ';
    const line = [stamp + text, ...imgs].filter(x => x.trim()).join('\n');
    if (topic === '日記' || (mode.record && topic)) { // 日記・時系列記録: その日のノートに
      const kind = topic === '日記' ? '日記' : topic;
      if (!v.records().some(r => r.name === kind)) v.addRecord(kind);
      v.appendToDay(kind, date, line); st.ids[e.id] = { dest: `record:${kind}:${date}`, snap: e }; sum.days++;
    } else if (mode.single && topic) { // 1 つのノートにまとめる
      let n = st.topicNotes[topic] && noteByStem(st.topicNotes[topic]);
      if (!n) { const c = v.createNote({ kind: 'text', title: topic, created: at, body: '', keywords: [] }); st.topicNotes[topic] = c.stem; n = c; }
      const head = mode.stamp !== false && !(n.body || '').includes(`## ${date}`) ? `## ${date}\n\n` : '';
      v.saveNote({ s: 'd', id: n.id, keywords: n.keywords, body: ((n.body || '').trim() ? n.body.replace(/\s+$/, '') + '\n\n' : '') + head + line, title: n.title, created: n.created });
      st.ids[e.id] = { dest: n.stem, snap: e }; sum.appended++;
    } else { // 1 件 = 1 ノート（IDなし）
      const heads = [];
      const par = e.parent && stemOfEntry(e.parent); if (par) heads.push(`[分岐元](${par}.md)`);
      for (const c of e.contexts || []) { const s = stemOfEntry(c); if (s) heads.push(`[文脈](${s}.md)`); }
      const body = [heads.join('\n'), text, imgs.join('\n')].filter(x => x.trim()).join('\n\n');
      const n = v.createNote({ kind: 'text', created: at, body, keywords: topic && topic !== '日記' ? [topic] : [] });
      st.ids[e.id] = { dest: n.stem, snap: e }; sum.notes++;
    }
  }
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
  const st = loadState(v), s = v.state(), has = dest => {
    if (dest.startsWith('record:')) { const [, kind, date] = dest.split(':'); return s.diaries.some(d => d.kind === kind && d.date === date); }
    return s.notes.some(n => n.stem === dest);
  };
  return Object.values(st.ids).filter(x => has(x.dest)).map(x => x.snap);
}
function summaryText(sum) {
  const parts = [];
  if (sum.notes) parts.push(`未整理のノート ${sum.notes} 件`); if (sum.days) parts.push(`日記・記録に ${sum.days} 件`); if (sum.appended) parts.push(`まとめのノートに ${sum.appended} 件`);
  if (sum.scans) parts.push(`紙のスキャン ${sum.scans} 枚`);
  let t = parts.length ? '取り込みました: ' + parts.join('、') + '。' : '新しく取り込むものはありませんでした。';
  if (sum.blankScans) t += `\n番号の無いスキャン ${sum.blankScans} 枚は、スマホで番号を付けてから取り込めます。`;
  return t;
}
module.exports = { importCapture, importedEntries, summaryText, loadState };
