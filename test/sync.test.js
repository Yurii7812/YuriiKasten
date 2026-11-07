const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const Sync = require('../sync');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-sync-'));
async function withServer(fn) {
  const root = tmp(), data = path.join(root, 'vault'), port = 20000 + Math.floor(Math.random() * 20000);
  const p = cp.spawn(process.execPath, [path.join(__dirname, '../server/server.js')], { env: { ...process.env, YURIIKASTEN_DATA: data, YURIIKASTEN_PORT: String(port), YURIIKASTEN_TOKEN: 'tk', YURIIKASTEN_HOST: '127.0.0.1' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/health`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    await fn({ data, url: `http://127.0.0.1:${port}`, port });
  } finally { p.kill(); }
}
const mk = (srv, token = 'tk') => { const dir = tmp(); return { dir, c: Sync.create({ dir, url: srv.url, token }) }; };
const w = (d, n, t) => fs.writeFileSync(path.join(d, n), t), r = (d, n) => fs.readFileSync(path.join(d, n), 'utf8');

test('同期: 置く・取る・消す', async () => {
  await withServer(async srv => {
    const a = mk(srv), b = mk(srv);
    w(a.dir, 'D_1.md', 'あ'); w(a.dir, 'D_2.md', 'い');
    assert.deepStrictEqual((await a.c.sync()).pushed.sort(), ['D_1.md', 'D_2.md']);
    assert.deepStrictEqual((await b.c.sync()).pulled.sort(), ['D_1.md', 'D_2.md']);
    assert.strictEqual(r(b.dir, 'D_1.md'), 'あ');
    w(b.dir, 'D_1.md', 'あ2'); await b.c.sync(); await a.c.sync();
    assert.strictEqual(r(a.dir, 'D_1.md'), 'あ2');
    fs.rmSync(path.join(a.dir, 'D_2.md')); await a.c.sync(); await b.c.sync();
    assert.ok(!fs.existsSync(path.join(b.dir, 'D_2.md')));               // 消したのが伝わる（.trash へ）
    assert.ok(fs.readdirSync(path.join(b.dir, '.trash')).some(f => f.endsWith('D_2.md')));
    assert.ok(!fs.existsSync(path.join(srv.data, 'D_2.md')));
  });
});

test('同期: 両方が変えたら、新しいほうが本体で、古いほうは競合コピー（未整理）に残る', async () => {
  await withServer(async srv => {
    const a = mk(srv), b = mk(srv);
    w(a.dir, 'D_1.md', '元'); await a.c.sync(); await b.c.sync();
    w(a.dir, 'D_1.md', 'Aの版'); await a.c.sync();
    w(b.dir, 'D_1.md', 'Bの版');                                         // B は A の変更を知らないまま書き換え（B のほうが新しい）
    fs.utimesSync(path.join(b.dir, 'D_1.md'), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    const res = await b.c.sync();
    assert.strictEqual(res.conflicts.length, 1);
    assert.strictEqual(fs.readFileSync(path.join(srv.data, 'D_1.md'), 'utf8'), 'Bの版');
    const cc = fs.readdirSync(srv.data).filter(f => /^D_u/.test(f));
    assert.ok(cc.length === 1 && fs.readFileSync(path.join(srv.data, cc[0]), 'utf8').includes('Aの版'));
    await a.c.sync(); assert.strictEqual(r(a.dir, 'D_1.md'), 'Bの版');
    assert.ok(fs.readdirSync(a.dir).some(f => /^D_u/.test(f)));        // 競合コピーも A に届く
  });
});

test('同期: 合言葉が違えば入れない', async () => {
  await withServer(async srv => { await assert.rejects(mk(srv, 'xx').c.sync(), /合言葉/); });
});
