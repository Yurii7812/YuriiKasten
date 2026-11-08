// Obsidian 風の整形（書いたその場で）。見出し・太字・斜体・コード・チェックボックス・箇条書き・アウトライン・表
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap } from '@codemirror/view';
import { Prec, RangeSetBuilder, StateField, StateEffect } from '@codemirror/state';
import { foldService, foldGutter, foldKeymap, codeFolding, foldEffect, unfoldEffect, foldedRanges } from '@codemirror/language';
import { indentLess } from '@codemirror/commands';

const INDENT = '  ';
const BULLET = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/;
const indentOf = s => (s.match(/^[\t ]*/)[0].replace(/\t/g, INDENT)).length;

// ===== 行ごとの整形（見出し・箇条書き・チェックボックス・引用・太字など）=====
class CheckWidget extends WidgetType {
  constructor(on, from) { super(); this.on = on; this.from = from; }
  eq(o) { return o.on === this.on && o.from === this.from; }
  toDOM(view) {
    const b = document.createElement('input'); b.type = 'checkbox'; b.checked = this.on; b.className = 'cm-check';
    b.onmousedown = e => e.preventDefault();
    b.onclick = e => { // [ ] ⇄ [x]
      e.preventDefault();
      const pos = view.posAtDOM(b), line = view.state.doc.lineAt(pos), m = line.text.match(BULLET);
      if (!m || !m[4]) return;
      const at = line.from + m[1].length + m[2].length + m[3].length + 1;
      view.dispatch({ changes: { from: at, to: at + 1, insert: this.on ? ' ' : 'x' } });
    };
    return b;
  }
  ignoreEvent() { return true; }
}
class HrWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const e = document.createElement('span'); e.className = 'md-hr-w'; return e; }
}
class BulletWidget extends WidgetType {
  constructor(text) { super(); this.text = text; }
  eq(o) { return o.text === this.text; }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-bullet'; s.textContent = this.text; return s; }
}

function lines(view) {
  const b = [], sel = view.state.selection.main, doc = view.state.doc;
  const push = (f, t, d) => b.push(d.range(f, t));
  let inCode = false;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = doc.lineAt(pos); pos = line.to + 1;
      const text = line.text, onLine = sel.from <= line.to && sel.to >= line.from;
      if (/^\s*(```|~~~)/.test(text)) { // ``` の行: カーソルが外にあるときは記号を隠す（コードの枠だけ見せる）
        inCode = !inCode; push(line.from, line.from, Decoration.line({ class: 'md-code-line md-fence' + (inCode ? ' md-fence-top' : ' md-fence-end') }));
        if (!onLine && line.to > line.from) push(line.from, line.to, Decoration.replace({}));
        continue;
      }
      if (inCode) { push(line.from, line.from, Decoration.line({ class: 'md-code-line' })); continue; }
      let m;
      if ((m = text.match(/^(#{1,6})\s+/))) {
        push(line.from, line.from, Decoration.line({ class: 'md-h md-h' + m[1].length }));
        if (!onLine) push(line.from, line.from + m[0].length, Decoration.replace({}));
        else push(line.from, line.from + m[0].length, Decoration.mark({ class: 'md-dim' }));
      } else if ((m = text.match(BULLET))) {
        const ind = indentOf(m[1]);
        push(line.from, line.from, Decoration.line({ class: 'md-li', attributes: { style: `padding-left:${8 + ind * 9}px;text-indent:-14px` } }));
        const s = line.from + m[1].length, e = s + m[2].length;
        if (m[4]) { // チェックボックス: 印の部分を置き換える
          const cf = line.from + m[1].length + m[2].length + m[3].length;
          push(s, cf + m[4].length, Decoration.replace({ widget: new CheckWidget(/[xX]/.test(m[4]), cf) }));
          if (/[xX]/.test(m[4])) push(cf + m[4].length, line.to, Decoration.mark({ class: 'md-done' }));
        } else if (/[-*+]/.test(m[2])) push(s, e, Decoration.replace({ widget: new BulletWidget(ind >= 4 ? '◦' : '•') }));
        else push(s, e, Decoration.mark({ class: 'md-num' }));
      } else if ((m = text.match(/^(?:>[ \t]?)+/))) { // 引用: カーソルが外にあるとき > を隠す
        push(line.from, line.from, Decoration.line({ class: 'md-quote' }));
        if (!onLine) push(line.from, line.from + m[0].length, Decoration.replace({}));
        else push(line.from, line.from + m[0].length, Decoration.mark({ class: 'md-dim' }));
      } else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(text)) {
        if (!onLine && line.to > line.from) { push(line.from, line.from, Decoration.line({ class: 'md-hr-line' })); push(line.from, line.to, Decoration.replace({ widget: new HrWidget() })); } // 記述は隠して、線だけ（行の高さのまま、真ん中に線）
        else push(line.from, line.from, Decoration.line({ class: 'md-dim' }));
      }
      // 行の中: **太字** *斜体* `コード` ~~取り消し~~
      for (const r of text.matchAll(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1|(?<![*\w])\*(?=\S)([^*]+?)(?<=\S)\*(?![*\w])|(`{2}|`)(?=[^`\n])([^\n]+?)\4|~~(?=\S)(.+?)(?<=\S)~~/g)) {
        const f = line.from + r.index, t = f + r[0].length;
        const cls = r[1] ? 'md-b' : r[3] !== undefined ? 'md-i' : r[4] !== undefined ? 'md-c' : 'md-s';
        const k = r[1] ? 2 : r[3] !== undefined ? 1 : r[4] !== undefined ? r[4].length : 2;
        const near = sel.from <= t && sel.to >= f;
        push(f, t, Decoration.mark({ class: cls }));
        if (!near) { push(f, f + k, Decoration.replace({})); push(t - k, t, Decoration.replace({})); }
      }
    }
  }
  return Decoration.set(b, true);
}
// 日本語の入力（変換中）のあいだは、飾りを作り直さない（作り直すと、変換中の文字や画面の位置が揺れる）。確定したら作り直す
const linePlugin = ViewPlugin.fromClass(class {
  constructor(v) { this.decorations = lines(v); this.pending = false; }
  update(u) {
    if (u.view.composing) { if (u.docChanged) this.decorations = this.decorations.map(u.changes); this.pending = true; return; }
    if (u.docChanged || u.viewportChanged || u.selectionSet || this.pending) { this.decorations = lines(u.view); this.pending = false; }
  }
}, { decorations: v => v.decorations, eventHandlers: { compositionend(_e, view) { setTimeout(() => view.dispatch({}), 0); } } });

// ===== 表（カーソルが外にあるとき、整形して表示）=====
const splitRow = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
const isSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
class TableWidget extends WidgetType {
  constructor(rows, align, from) { super(); this.rows = rows; this.align = align; this.from = from; }
  eq(o) { return JSON.stringify(o.rows) === JSON.stringify(this.rows) && o.from === this.from; }
  toDOM(view) {
    const t = document.createElement('table'); t.className = 'md-table';
    this.rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      r.forEach((c, j) => { const td = document.createElement(i ? 'td' : 'th'); td.textContent = c; if (this.align[j]) td.style.textAlign = this.align[j]; tr.append(td); });
      t.append(tr);
    });
    t.onmousedown = e => { e.preventDefault(); view.dispatch({ selection: { anchor: this.from } }); view.focus(); }; // 押すと、元の記述を編集できる
    return t;
  }
  ignoreEvent() { return true; }
}
function tables(state) {
  const b = new RangeSetBuilder(), doc = state.doc, sel = state.selection.main;
  for (let n = 1; n < doc.lines;) {
    const h = doc.line(n), s = doc.line(n + 1);
    if (h.text.includes('|') && isSep(s.text) && splitRow(h.text).length === splitRow(s.text).length) {
      let end = n + 1;
      while (end + 1 <= doc.lines && doc.line(end + 1).text.includes('|') && doc.line(end + 1).text.trim()) end++;
      const from = h.from, to = doc.line(end).to;
      if (!(sel.from <= to && sel.to >= from)) {
        const rows = [splitRow(h.text)]; for (let k = n + 2; k <= end; k++) rows.push(splitRow(doc.line(k).text));
        const align = splitRow(s.text).map(c => /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : '');
        b.add(from, to, Decoration.replace({ widget: new TableWidget(rows, align, from), block: true }));
      }
      n = end + 1;
    } else n++;
  }
  return b.finish();
}
const tableField = StateField.define({
  create: tables, update: (v, tr) => (tr.docChanged || tr.selection) ? tables(tr.state) : v,
  provide: f => EditorView.decorations.from(f)
});

// ===== アウトライン（箇条書き・見出しの折りたたみ）=====
const outlineFold = foldService.of((state, from) => {
  const line = state.doc.lineAt(from), text = line.text;
  let level, isHead = false;
  const h = text.match(/^(#{1,6})\s/);
  if (h) { level = h[1].length; isHead = true; }
  else if (BULLET.test(text)) level = indentOf(text);
  else return null;
  let end = line.number;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const t = state.doc.line(n).text;
    if (!t.trim()) { end = n; continue; }
    if (isHead) { const hm = t.match(/^(#{1,6})\s/); if (hm && hm[1].length <= level) break; }
    else if (indentOf(t) <= level) break;
    end = n;
  }
  while (end > line.number && !state.doc.line(end).text.trim()) end--;
  return end > line.number ? { from: line.to, to: state.doc.line(end).to } : null;
});

// ===== キー操作（Enter で箇条書きを続ける・Tab で字下げ）=====
function continueList(view) {
  const { state } = view, sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head), m = line.text.match(BULLET);
  if (!m || sel.head < line.from + m[0].length) return false;
  if (line.text.slice(m[0].length).trim() === '') { // 空の項目で Enter → 箇条書きを終える（ひとつ上の階層へ）
    const ind = m[1].length;
    if (ind >= INDENT.length) { view.dispatch({ changes: { from: line.from, to: line.from + INDENT.length, insert: '' } }); return true; }
    view.dispatch({ changes: { from: line.from, to: line.to, insert: '' } }); return true;
  }
  let mark = m[2];
  const num = mark.match(/^(\d+)([.)])$/); if (num) mark = (+num[1] + 1) + num[2];
  const ins = '\n' + m[1] + mark + m[3] + (m[4] ? '[ ] ' : '');
  view.dispatch({ changes: { from: sel.head, insert: ins }, selection: { anchor: sel.head + ins.length } });
  return true;
}
function shift(view, dir) {
  const { state } = view, ch = [];
  const seen = new Set();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (seen.has(n)) continue; seen.add(n);
      const line = state.doc.line(n);
      if (dir > 0) { if (BULLET.test(line.text) || state.selection.ranges.length || r.from !== r.to) ch.push({ from: line.from, insert: INDENT }); }
      else { const sp = line.text.match(/^( {1,2}|\t)/); if (sp) ch.push({ from: line.from, to: line.from + sp[0].length, insert: '' }); }
    }
  }
  if (!ch.length) return dir > 0 ? false : true;
  view.dispatch({ changes: ch }); return true;
}
const listKeys = Prec.high(keymap.of([
  { key: 'Enter', run: continueList },
  { key: 'Tab', run: v => { // 箇条書きの行と複数行の選択は字下げ。ふつうの行は Tab 文字そのものを入れる
    const sel = v.state.selection.main, l = v.state.doc.lineAt(sel.head);
    const multi = v.state.doc.lineAt(sel.from).number !== v.state.doc.lineAt(sel.to).number;
    if (BULLET.test(l.text) || multi) return shift(v, 1);
    v.dispatch(v.state.replaceSelection('\t'), { scrollIntoView: true, userEvent: 'input' }); return true;
  } },
  { key: 'Shift-Tab', run: v => shift(v, -1) },
  { key: 'Mod-Enter', run: v => { // チェックボックスの切り替え
    const l = v.state.doc.lineAt(v.state.selection.main.head), m = l.text.match(BULLET);
    if (!m) return false;
    if (!m[4]) { const at = l.from + m[1].length + m[2].length + m[3].length; v.dispatch({ changes: { from: at, insert: '[ ] ' } }); return true; }
    const at = l.from + m[1].length + m[2].length + m[3].length + 1;
    v.dispatch({ changes: { from: at, to: at + 1, insert: /[xX]/.test(m[4]) ? ' ' : 'x' } }); return true;
  } },
  { key: 'Alt-ArrowUp', run: v => moveLines(v, -1) },
  { key: 'Alt-ArrowDown', run: v => moveLines(v, 1) }
]));
// 箇条書きの行を、子ごと上下に動かす（アウトラインの並べ替え）
function moveLines(view, dir) {
  const { state } = view, doc = state.doc, n = doc.lineAt(state.selection.main.head).number, line = doc.line(n);
  if (!BULLET.test(line.text)) return false;
  const level = indentOf(line.text), block = (k) => { // k 行目の項目と、その子の最後の行
    let e = k; for (let i = k + 1; i <= doc.lines; i++) { const t = doc.line(i).text; if (t.trim() && indentOf(t) <= indentOf(doc.line(k).text)) break; if (t.trim()) e = i; }
    return e;
  };
  const end = block(n);
  if (dir < 0) {
    let p = n - 1; while (p >= 1 && !(BULLET.test(doc.line(p).text) && indentOf(doc.line(p).text) === level)) { if (p < n - 1 && indentOf(doc.line(p).text) < level && doc.line(p).text.trim()) return true; p--; }
    if (p < 1) return true;
    const a = doc.line(p).from, mid = line.from, to = doc.line(end).to;
    view.dispatch({ changes: { from: a, to, insert: doc.sliceString(mid, to) + '\n' + doc.sliceString(a, mid - 1) }, selection: { anchor: a + (state.selection.main.head - line.from) } });
  } else {
    const nx = end + 1; if (nx > doc.lines || !BULLET.test(doc.line(nx).text) || indentOf(doc.line(nx).text) !== level) return true;
    const ne = block(nx), a = line.from, to = doc.line(ne).to, mid = doc.line(nx).from;
    view.dispatch({ changes: { from: a, to, insert: doc.sliceString(mid, to) + '\n' + doc.sliceString(a, mid - 1) }, selection: { anchor: a + (mid - a) + (state.selection.main.head - line.from) } });
  }
  return true;
}

// ===== 最後の行より下をクリックしたら、最後の行の最後にカーソル（Obsidian 同様）=====
const clickBelow = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (e.button !== 0 || view.contentDOM.contains(e.target) || e.target.closest('.cm-gutters')) return false;
    if (!view.scrollDOM.contains(e.target)) return false;
    const end = view.state.doc.length, bottom = view.contentDOM.getBoundingClientRect().bottom;
    const pos = e.clientY > bottom ? end : (view.posAtCoords({ x: e.clientX, y: e.clientY }, false) ?? end);
    e.preventDefault();
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true }); view.focus();
    return true;
  }
});

// カーソルが画面の端に着く前にスクロールする（端に張り付かない）
const margins = EditorView.scrollMargins.of(() => ({ top: 90, bottom: 190 }));
// 行の頭で \`\`\` を書いたら、下にも同じもの（閉じ）を入れる。カーソルは、1 行目の最後（言語名を書ける）。もう囲みの中にいるときは、入れない
const fenceClose = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '`' || from !== to) return false;
  const line = view.state.doc.lineAt(from), before = line.text.slice(0, from - line.from);
  if (!/^\s*``$/.test(before) || line.text.slice(from - line.from).trim() !== '') return false;
  let open = 0; for (let n = 1; n < line.number; n++) if (/^\s*(```|~~~)/.test(view.state.doc.line(n).text)) open++;
  if (open % 2 === 1) return false;
  const indent = before.match(/^\s*/)[0];
  view.dispatch({ changes: { from, insert: '`\n' + indent + '\n' + indent + '```' }, selection: { anchor: from + 1 }, userEvent: 'input' });
  return true;
});
const noMiddlePaste = EditorView.domEventHandlers({
  mousedown(e) { if (e.button === 1) { e.preventDefault(); return true; } },
  auxclick(e) { if (e.button === 1) { e.preventDefault(); return true; } },
  paste(e) { return false; }
});
export const mdExtensions = [noMiddlePaste, margins, 
  linePlugin, tableField, codeFolding(),
  foldGutter({ markerDOM: open => { const s = document.createElement('span'); s.className = 'cm-fold-mark'; s.textContent = open ? '▾' : '▸'; return s; } }),
  outlineFold, listKeys, clickBelow, fenceClose, keymap.of(foldKeymap)
];
// 表のひな形
export const tableTemplate = '| 見出し1 | 見出し2 | 見出し3 |\n| --- | --- | --- |\n|  |  |  |\n';

// ===== 検索した語の印（開いたノートの本文の中）=====
export const setSearch = StateEffect.define();
export const searchExt = StateField.define({
  create: () => ({ q: '', deco: Decoration.none }),
  update(v, tr) {
    let q = v.q, changed = tr.docChanged;
    for (const e of tr.effects) if (e.is(setSearch)) { q = e.value; changed = true; }
    if (!changed) return v;
    if (!q) return { q, deco: Decoration.none };
    const text = tr.state.doc.toString().toLowerCase(), needle = q.toLowerCase(), r = [];
    for (let i = text.indexOf(needle); i >= 0 && r.length < 500; i = text.indexOf(needle, i + needle.length)) r.push(Decoration.mark({ class: 'hl' }).range(i, i + needle.length));
    return { q, deco: Decoration.set(r, true) };
  },
  provide: f => EditorView.decorations.from(f, v => v.deco)
});
