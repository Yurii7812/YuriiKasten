const test = require('node:test'), assert = require('node:assert'), http = require('http');
const { fetchTitle, titleOf } = require('../urltitle'), UrlLinks = require('../url-links');

test('題の取り出し: <title>・og:title・実体参照・空白・角かっこ', () => {
  assert.strictEqual(titleOf('<html><head><title>  みなさん\n こんにちは &amp; &#12354; </title></head>'), 'みなさん こんにちは & あ');
  assert.strictEqual(titleOf('<meta property="og:title" content="OG の題"><title>別の題</title>'), 'OG の題');
  assert.strictEqual(titleOf('<title>[重要] 記事</title>'), '（重要） 記事');   // Markdown のリンクを壊さない
  assert.strictEqual(titleOf('<p>題なし</p>'), '');
});

test('fetchTitle: 本物の応答から取る・HTML 以外/エラー/家の中のアドレスは取らない', async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === '/ok') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<html><head><title>テストのページ</title></head><body>本文</body></html>'); }
    else if (req.url === '/json') { res.setHeader('content-type', 'application/json'); res.end('{"title":"x"}'); }
    else if (req.url === '/slow') { setTimeout(() => res.end('<title>遅い</title>'), 800); }
    else { res.statusCode = 404; res.end('<title>無い</title>'); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    assert.strictEqual(await fetchTitle(base + '/ok', { allowPrivate: true }), 'テストのページ');
    assert.strictEqual(await fetchTitle(base + '/json', { allowPrivate: true }), '');
    assert.strictEqual(await fetchTitle(base + '/none', { allowPrivate: true }), '');
    assert.strictEqual(await fetchTitle(base + '/slow', { allowPrivate: true, timeout: 100 }), '');   // 時間切れ
    assert.strictEqual(await fetchTitle(base + '/ok'), '');                                          // 既定では、自分の PC・家の中は取らない
    assert.strictEqual(await fetchTitle('http://192.168.0.1/'), '');
    assert.strictEqual(await fetchTitle('javascript:alert(1)'), '');
    assert.strictEqual(await fetchTitle('file:///etc/passwd'), '');
  } finally { srv.close(); }
});

test('withUrlTitles: 裸の URL だけを [題](URL) に。リンク・コード・取れなかったものはそのまま', async () => {
  const titles = { 'https://a.example/x': 'A のページ', 'https://b.example/(1)': 'B (特別)' };
  const f = async u => titles[u] || '';
  const text = '見て https://a.example/x と、[自分で付けた](https://c.example/) と、`https://d.example/` と、https://z.example/ と https://b.example/(1)\n```\nhttps://a.example/x\n```';
  const out = await UrlLinks.withUrlTitles(text, f);
  assert.match(out, /^見て \[A のページ\]\(https:\/\/a\.example\/x\) と、\[自分で付けた\]\(https:\/\/c\.example\/\) と、`https:\/\/d\.example\/` と、https:\/\/z\.example\/ と \[B \(特別\)\]\(https:\/\/b\.example\/%281%29\)\n```\nhttps:\/\/a\.example\/x\n```$/);
  assert.strictEqual(await UrlLinks.withUrlTitles('URL なし', f), 'URL なし');
  assert.strictEqual(await UrlLinks.withUrlTitles('https://a.example/x', async () => { throw new Error('x'); }), 'https://a.example/x');   // 失敗しても、本文は変えない
});

test('fetchTitle: 先頭に長い script があるページ（YouTube など）でも、題を取る', async () => {
  const pad = '<script>' + 'x'.repeat(900000) + '</script>';
  const srv = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<html><head>' + pad + '<title>長い頭のページ - サイト</title><meta property="og:title" content="長い頭のページ"></head><body>x</body></html>'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try { assert.strictEqual(await fetchTitle('http://127.0.0.1:' + srv.address().port + '/', { allowPrivate: true }), '長い頭のページ'); }
  finally { srv.close(); }
});

test('fetchTitle: YouTube は oEmbed で取る（失敗したらページから）', async () => {
  const calls = [];
  const fakeFetch = async (u) => { calls.push(String(u)); return { ok: true, json: async () => ({ title: '動画の題 [公式]' }), headers: { get: () => 'application/json' } }; };
  assert.strictEqual(await fetchTitle('https://youtu.be/abc123', { fetchImpl: fakeFetch }), '動画の題 （公式）');
  assert.match(calls[0], /^https:\/\/www\.youtube\.com\/oembed\?format=json&url=https%3A%2F%2Fyoutu\.be%2Fabc123$/);
});
