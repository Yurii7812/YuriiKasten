const test = require('node:test');
const assert = require('node:assert/strict');
const { SaveQueue, RecoveryJournal, reconcile } = require('../persistence');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const queue = () => new SaveQueue({ delay: 10000, retryDelay: 10000 });

test('flush waits for a write whose debounce already fired', async () => {
  const q = queue(), disk = deferred();
  q.later('note', () => disk.promise);
  const write = q.run(q.jobs.get('note'));
  let finished = false; const flushing = q.flush().then(() => { finished = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(finished, false); assert.equal(q.has('note'), true);
  disk.resolve(true); await write; await flushing;
  assert.equal(q.has('note'), false);
});

test('rapid switching and editing during a slow save writes the newest snapshot last', async () => {
  const q = queue(), first = deferred(), writes = [];
  q.later('A', async () => { await first.promise; writes.push('A-old'); });
  const running = q.run(q.jobs.get('A')); await Promise.resolve();
  q.later('B', async () => { writes.push('B'); });
  q.later('A', async () => { writes.push('A-new'); });
  const flushing = q.flush(); first.resolve(); await running; await flushing;
  assert.equal(writes.at(-1), 'A-new'); assert.ok(writes.includes('B'));
  assert.equal(q.jobs.size, 0);
});

test('failed/false writes remain retryable; other writes finish before flush rejects', async () => {
  const q = queue(), other = deferred(); let works = false;
  q.later('A', async () => works);
  q.later('B', () => other.promise);
  let failed = false; const flushing = q.flush().catch(() => { failed = true; });
  await Promise.resolve(); await Promise.resolve(); assert.equal(failed, false);
  other.resolve(true); await flushing;
  assert.equal(failed, true); assert.equal(q.has('A'), true);
  works = true; await q.flush(); assert.equal(q.jobs.size, 0);
});

test('flush drains secondary saves enqueued by diary/chat synchronization', async () => {
  const q = queue(); let saved = false;
  q.later('diary', () => { q.later('chat', async () => { saved = true; }); });
  await q.flush(); assert.equal(saved, true); assert.equal(q.jobs.size, 0);
});

function storage() {
  const data = new Map();
  return { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
test('restart recovers unsaved Japanese text, scoped to vault; older acknowledgements cannot discard a new edit', () => {
  const s = storage(), a = new RecoveryJournal(s, '/A'), b = new RecoveryJournal(s, '/B');
  const old = a.record('nd1', 'note', { body: '最初の文章' });
  const latest = a.record('nd1', 'note', { body: '日本語の続き\n消えない文章' });
  a.acknowledge('nd1', old);
  assert.equal(new RecoveryJournal(s, '/A').entries()[0].payload.body, '日本語の続き\n消えない文章');
  assert.deepEqual(b.entries(), []);
  a.acknowledge('nd1', latest); assert.deepEqual(a.entries(), []);
});

test('state refresh keeps the mounted editor object and protects pending or newer edits', async () => {
  const q = queue(), live = { id: 'A', body: '入力した文章' }, since = q.revision;
  const editorChange = text => { live.body = text; q.later('A', async () => true); };
  editorChange('保存中の文章');
  let list = reconcile([live], [{ id: 'A', body: '古い文章' }], n => n.id, k => q.has(k));
  assert.equal(list[0], live); assert.equal(list[0].body, '保存中の文章');
  await q.flush();
  list = reconcile(list, [{ id: 'A', body: '遅れて届いた文章' }], n => n.id, k => q.changedSince(k, since));
  assert.equal(list[0].body, '保存中の文章');
  list = reconcile(list, [{ id: 'A', body: '保存先の最新文章' }], n => n.id);
  assert.equal(list[0], live);
  editorChange('再読み込み後も編集できる');
  assert.equal(list[0].body, '再読み込み後も編集できる'); await q.flush();
});
