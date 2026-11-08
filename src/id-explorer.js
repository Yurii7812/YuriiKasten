// Folgezettel IDを決めるための探索画面。本文、Global Index、Topic Indexを往復しながら選ぶ。
import X from '../id-explorer-core.js';

const esc = value => String(value == null ? '' : value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const titleOf = n => n.title || (n.body || '').split('\n').find(x => x.trim()) || (n.noid ? 'IDなし' : '（無題）');
const idLabel = n => (n.s === 'p' ? '紙 ' : '') + (n.noid ? 'IDなし' : n.id);
const limit = (text, max) => String(text || '').length > max ? String(text).slice(0, max) + '…' : String(text || '');
const nkey = n => X.key(n);
const route = (kind, key, title, desc) => '<button type="button" class="idex-link" data-ix-kind="' + esc(kind) + '" data-ix-key="' + esc(key) + '">' +
  '<strong>' + esc(title) + '</strong>' + (desc ? '<small>' + esc(desc) + '</small>' : '') + '</button>';
const caption = (head, content) => content ? '<div class="idex-section"><h4>' + esc(head) + '</h4>' + content + '</div>' : '';
const noteLink = (n, label) => route('note', nkey(n), label || (idLabel(n) + ' — ' + titleOf(n)), limit(n.body, 90));
const kwLink = name => route('keyword', name, name, 'グローバルインデックス');
const topicLink = t => route('topic', t.name, t.name, 'トピックインデックス');

export function open({ notes, topics, readings = {}, paperEntries = [], subject = null, onChoose }) {
  document.querySelector('.idex-cover')?.remove();
  const root = document.createElement('div');
  root.className = 'idex-cover';
  root.innerHTML = '<section class="idex-dialog" role="dialog" aria-modal="true" aria-label="IDを探して付ける">' +
    '<header class="idex-head"><div><h2>IDを探して付ける</h2><small>索引をたどって本文を確認し、関連・発展させる位置を決めます</small></div>' +
    '<button type="button" data-ix-close aria-label="閉じる">×</button></header>' +
    '<div class="idex-main"><aside class="idex-sidebar">' +
    '<input id="idex-query" type="search" placeholder="本文・ID・Index・トピックIndexを検索" aria-label="知識を検索">' +
    '<div class="idex-scopes"><button data-ix-scope="all" class="on">全部</button><button data-ix-scope="keywords">Index</button><button data-ix-scope="topics">Topic</button><button data-ix-scope="notes">ノート</button></div>' +
    '<div class="idex-results"></div></aside>' +
    '<div class="idex-detail"><div class="idex-trail"><button type="button" data-ix-back disabled>← 戻る</button><span class="idex-path">検索結果から選択</span></div>' +
    '<div class="idex-preview"></div></div></div>' +
    '<footer class="idex-footer"><div class="idex-method"><button type="button" data-ix-method="child">分岐（子）</button><button type="button" data-ix-method="sibling">並列</button><button type="button" data-ix-method="direct" class="on">直接指定</button></div>' +
    '<div class="idex-decision"><label>付けるID <input id="idex-candidate" autocapitalize="off" spellcheck="false" autocomplete="off"></label>' +
    '<span id="idex-status"></span><button type="button" data-ix-confirm class="idex-primary">このIDに決定</button><button type="button" data-ix-close>やめる</button></div></footer></section>';
  document.body.append(root);
  const $ = sel => root.querySelector(sel);
  const byNote = new Map(notes.map(n => [nkey(n), n]));
  const byTopic = new Map(topics.map(t => [t.name, t]));
  const byKeyword = new Map(X.keywords(notes, readings, paperEntries).map(x => [x.name, x]));
  const st = { view: null, history: [], query: '', scope: 'all', mode: 'direct', typed: X.nextRoot(notes), busy: false };
  const close = () => { root.remove(); window.removeEventListener('keydown', guardKeys, true); };
  // windowのキャプチャ段階で、探索中のCtrl+Nなどが背後のエディタに届くことを防ぐ。
  const guardKeys = e => {
    if (!root.isConnected) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    const writing = e.target && e.target.closest && e.target.closest('.idex-dialog input, .idex-dialog textarea, .idex-dialog select');
    if (!writing || e.ctrlKey || e.metaKey || e.altKey) e.stopPropagation();
  };
  window.addEventListener('keydown', guardKeys, true);

  function drawResults() {
    const hits = X.search(notes, topics, readings, st.query, paperEntries), scope = st.scope;
    const section = (kind, heading, list, draw) => {
      if (scope !== 'all' && scope !== kind) return '';
      const cap = list.length > 100 ? '（先頭100件／全' + list.length + '件。検索で絞り込めます）' : '（' + list.length + '）';
      return '<section class="idex-result-section"><h3>' + heading + ' ' + cap + '</h3>' +
        (list.length ? list.slice(0, 100).map(draw).join('') : '<p class="idex-empty">該当なし</p>') + '</section>';
    };
    $('.idex-results').innerHTML =
      section('keywords', 'グローバルIndex', hits.keywords, k => route('keyword', k.name, k.name, (k.reading ? k.reading + ' · ' : '') + (k.notes.length + k.pending.length) + '件')) +
      section('topics', 'トピックIndex', hits.topics, t => route('topic', t.name, t.name, t.keyword ? '● ' + t.keyword : Labeled(t))) +
      section('notes', 'ノート本文・タイトル', hits.notes, n => noteLink(n));
    root.querySelectorAll('[data-ix-scope]').forEach(b => b.classList.toggle('on', b.dataset.ixScope === scope));
  }
  function Labeled(t) {
    return t.entry ? '入口 ' + (t.entry.s === 'p' ? '紙 ' : '') + t.entry.id : '索引';
  }
  function displayView(view) {
    if (!view) return '<div class="idex-welcome"><h3>知識を探索してIDを決定する</h3>' +
      '<p>左でキーワード、索引、ノート本文を検索します。Index → トピックIndex → ノートと進み、本文や関連ノートを見ながら位置を決められます。</p>' +
      '<p>関連するノートが決まったら「分岐（子）」または「並列」を選びます。新しい系統なら「直接指定」を使います。</p>' +
      '<p>探索中は元のノートを移動・編集しません。</p></div>';
    if (view.kind === 'keyword') {
      const k = byKeyword.get(view.key);
      if (!k) return '<p>このキーワードは見つかりません</p>';
      const related = topics.filter(t => t.keyword === k.name || LTopicRows(t).includes(k.name));
      return '<h2>Index：' + esc(k.name) + '</h2>' + (k.reading ? '<p>よみ：' + esc(k.reading) + '</p>' : '') +
        caption('対応するトピックIndex（さらに開く）', related.map(topicLink).join('')) +
        caption('このキーワードに登録されたノート', k.notes.map(noteLink).join('')) +
        caption('紙のIndex（未取り込み）', k.pending.map(id => '<span class="idex-missing">紙 ' + esc(id) + ' — まだノートがありません</span>').join(''));
    }
    if (view.kind === 'topic') {
      const t = byTopic.get(view.key);
      if (!t) return '<p>このトピックIndexは見つかりません</p>';
      const entries = X.topicEntries(t, notes);
      const rows = entries.rows.map(r => '<div class="idex-index-row"><div class="idex-index-key">' + esc(r.keyword) + '</div><div>' +
        r.notes.map(x => x.note ? noteLink(x.note, (x.s === 'p' ? '紙 ' : '') + x.id + (x.anchor ? '(' + x.anchor + ')' : '') + ' — ' + titleOf(x.note)) :
        '<span class="idex-missing">' + esc((x.s === 'p' ? '紙 ' : '') + x.id) + '（未登録）</span>').join('') + '</div></div>').join('');
      return '<h2>トピックIndex：' + esc(t.name) + '</h2>' +
        caption('入口ノート', entries.entry ? noteLink(entries.entry) : (t.entry ? '<span class="idex-missing">まだ取り込まれていません</span>' : '入口なし')) +
        caption('索引の行', rows || '<p>索引は空です</p>') +
        caption('関連するトピックIndex', entries.stars.filter(name => byTopic.has(name)).map(name => topicLink(byTopic.get(name))).join('')) +
        caption('索引で参照しているノート', entries.refs.map(x => byNote.get(x.s + ':' + x.id)).filter(Boolean).map(noteLink).join(''));
    }
    if (view.kind === 'note') {
      const n = byNote.get(view.key);
      if (!n) return '<p>このノートは見つかりません</p>';
      const rel = X.noteRelations(n, notes, topics);
      const body = limit(n.body || '', 16000);
      return '<h2>' + esc(idLabel(n)) + ' — ' + esc(titleOf(n)) + '</h2>' +
        '<p class="idex-note-meta">' + esc(n.kind === 'memo-group' ? 'ノート化されたチャットメモ' : n.kind === 'rp' ? '会話ノート' : n.s === 'p' ? '紙のノート' : 'ノート') +
        (n.created ? ' · ' + esc(n.created) : '') + '</p>' +
        caption('本文プレビュー', '<div class="idex-note-body">' + esc(body || '（本文なし）') + '</div>') +
        caption('キーワード・Global Index', (n.keywords || []).map(kwLink).join('')) +
        caption('自トピックIndex', rel.owned.map(topicLink).join('')) +
        caption('索引されているトピックIndex', rel.indexed.map(topicLink).join('')) +
        caption('親ノート', rel.parent ? noteLink(rel.parent) : '') +
        caption('子ノート', rel.children.map(noteLink).join('')) +
        caption('バックリンク（ノート）', rel.backlinks.map(noteLink).join(''));
    }
    return '';
  }
  function LTopicRows(t) { return X.topicEntries(t, notes).rows.map(r => r.keyword); }
  function drawPreview() {
    $('.idex-preview').innerHTML = displayView(st.view);
    $('.idex-path').textContent = !st.view ? '検索結果から選択' :
      st.view.kind === 'keyword' ? 'グローバルIndex › ' + st.view.key :
      st.view.kind === 'topic' ? 'トピックIndex › ' + st.view.key :
      'ノート › ' + st.view.key;
    $('[data-ix-back]').disabled = !st.history.length;
  }
  function navigate(kind, key) {
    if (!['keyword','topic','note'].includes(kind)) return;
    if (kind === 'note' && !byNote.has(key) || kind === 'topic' && !byTopic.has(key) ||
        kind === 'keyword' && !byKeyword.has(key)) return;
    if (st.view && st.view.kind === kind && st.view.key === key) return;
    if (st.view) st.history.push(st.view);
    st.view = { kind, key };
    if (kind === 'note' && byNote.get(key).s === 'd' && X.isAssigned(byNote.get(key))) setMethod('child');
    else if (st.mode !== 'direct') setMethod('direct');
    drawPreview(); drawFooter();
    $('.idex-preview').scrollTop = 0;
  }
  function selectedBase() {
    return st.view && st.view.kind === 'note' ? byNote.get(st.view.key) : null;
  }
  function setMethod(method) {
    st.mode = method;
    if (method === 'direct') st.typed = X.nextRoot(notes);
    else st.typed = X.suggest(notes, selectedBase(), method) || '';
  }
  function valid() {
    const id = st.typed.trim().toLowerCase();
    if (!id) return { ok:false, text:'IDを入力してください' };
    if (subject && subject.s === 'd' && subject.id === id) return {ok:false,text:'現在と同じIDです'};
    if (!X.available(notes, id, subject)) return {ok:false,text:'IDの形式が無効か、すでに使われています'};
    return {ok:true,text:'使用可能なID'};
  }
  function updateStatus() {
    const result = valid();
    $('#idex-status').textContent = result.text;
    $('#idex-status').className = result.ok ? 'good' : 'bad';
    $('[data-ix-confirm]').disabled = st.busy || !result.ok;
  }
  function drawFooter() {
    root.querySelectorAll('[data-ix-method]').forEach(button => {
      button.classList.toggle('on', button.dataset.ixMethod === st.mode);
      button.disabled = button.dataset.ixMethod !== 'direct' && (!selectedBase() || selectedBase().s !== 'd' || !X.isAssigned(selectedBase()));
    });
    $('#idex-candidate').value = st.typed;
    updateStatus();
  }
  root.addEventListener('click', async e => {
    const closeButton = e.target.closest('[data-ix-close]');
    if (closeButton) { close(); return; }
    const scope = e.target.closest('[data-ix-scope]');
    if (scope) { st.scope = scope.dataset.ixScope; drawResults(); return; }
    const go = e.target.closest('[data-ix-kind]');
    if (go) { navigate(go.dataset.ixKind, go.dataset.ixKey); return; }
    if (e.target.closest('[data-ix-back]')) {
      st.view = st.history.pop() || null;
      const previous = selectedBase();
      if (previous && previous.s === 'd' && X.isAssigned(previous)) setMethod('child');
      else setMethod('direct');
      drawPreview(); drawFooter(); return;
    }
    const method = e.target.closest('[data-ix-method]');
    if (method && !method.disabled) { setMethod(method.dataset.ixMethod); drawFooter(); $('#idex-candidate').focus(); return; }
    if (e.target.closest('[data-ix-confirm]')) {
      if (st.busy || !valid().ok) return;
      st.busy = true; updateStatus();
      try {
        const success = await onChoose(st.typed.trim().toLowerCase());
        if (success !== false) close();
        else { $('#idex-status').textContent = 'IDを変更できませんでした'; st.busy = false; updateStatus(); }
      } catch (err) {
        st.busy = false; updateStatus();
        $('#idex-status').textContent = err && err.message ? err.message : 'IDを決定できませんでした';
      }
    }
  });
  $('#idex-query').addEventListener('input', e => { st.query = e.target.value; drawResults(); });
  $('#idex-query').addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('.idex-results [data-ix-kind]'); if (first) { e.preventDefault(); first.click(); } } });
  $('#idex-candidate').addEventListener('input', e => { st.typed = e.target.value.trim().toLowerCase(); updateStatus(); });
  $('#idex-candidate').addEventListener('keydown', e => { if (e.key === 'Enter' && valid().ok) { e.preventDefault(); $('[data-ix-confirm]').click(); } });
  root.addEventListener('mousedown', e => { if (e.target === root) close(); });
  drawResults(); drawPreview(); drawFooter(); $('#idex-query').focus();
  return close;
}
