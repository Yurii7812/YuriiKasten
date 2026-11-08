'use strict';
// 更新。自動では何もしない（確認も更新も、ユーザーが「更新」を押したときや `YuriiNote --update` を実行したときだけ）
//  - Linux（AppImage）: GitHub の最新リリースの AppImage を、いまのファイルに置き換える
//  - 開発用（git のフォルダ）: git pull して、必要なら npm install とビルド
//  - Windows / Mac: 最新のインストーラーのページを開く（インストーラーを実行すると更新される）
// このファイルは、アプリの中からも、`YuriiNote --update`（ELECTRON_RUN_AS_NODE / node で直接）からも使う
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const REPO = 'Yurii7812/YuriiNote';
const PAGE = `https://github.com/${REPO}/releases/latest`;

const num = v => String(v || '').replace(/^v/, '').split('.').map(x => parseInt(x, 10) || 0);
function newer(a, b) { // a が b より新しいか
  const x = num(a), y = num(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
async function latestRelease() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'YuriiNote', Accept: 'application/vnd.github+json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub から読めませんでした（${r.status}）`);
  return r.json();
}
// リリースの中から、この OS 向けのファイルを選ぶ
function pickAsset(rel, platform, arch) {
  const as = (rel && rel.assets) || [], a = arch === 'arm64' ? 'arm64' : 'x64';
  const ext = platform === 'linux' ? /\.AppImage$/i : platform === 'win32' ? /\.exe$/i : /\.dmg$/i;
  const list = as.filter(x => ext.test(x.name));
  return list.find(x => x.name.includes(a)) || list[0] || null;
}
async function download(url, dest, say) {
  const r = await fetch(url, { headers: { 'User-Agent': 'YuriiNote' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`ダウンロードできませんでした（${r.status}）`);
  const total = +r.headers.get('content-length') || 0, out = fs.createWriteStream(dest);
  let got = 0, last = 0;
  for await (const chunk of r.body) {
    out.write(chunk); got += chunk.length;
    if (say && total && Date.now() - last > 700) { last = Date.now(); say(`ダウンロード中 ${Math.round(got / total * 100)}%`); }
  }
  await new Promise((ok, ng) => out.end(e => e ? ng(e) : ok()));
}
const git = (dir, ...args) => cp.execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// info: { version, appImage?, devDir?, platform, arch }
async function check(info) {
  if (info.devDir) { // git のフォルダ: 取ってきて、新しい変更があるか
    try { git(info.devDir, 'fetch', '--quiet'); } catch (e) { throw new Error('git fetch に失敗しました: ' + String(e.stderr || e.message).trim()); }
    const behind = +git(info.devDir, 'rev-list', '--count', 'HEAD..@{u}');
    return { kind: 'git', current: info.version, behind, newer: behind > 0, latest: behind ? `${behind} 件の新しい変更` : info.version };
  }
  const rel = await latestRelease();
  if (!rel) return { kind: 'release', current: info.version, latest: null, newer: false, none: true };
  const latest = String(rel.tag_name).replace(/^v/, '');
  return { kind: 'release', current: info.version, latest, newer: newer(latest, info.version), release: rel, asset: pickAsset(rel, info.platform, info.arch), url: rel.html_url || PAGE };
}
// 更新する。戻り値: { done, manual?, url?, message }
async function apply(info, c, say = () => { }) {
  if (info.devDir) {
    say('git pull…'); const before = git(info.devDir, 'rev-parse', 'HEAD:package.json');
    git(info.devDir, 'pull', '--ff-only', '--quiet');
    if (before !== git(info.devDir, 'rev-parse', 'HEAD:package.json')) { say('npm install…'); cp.execSync('npm install --no-audit --no-fund', { cwd: info.devDir, stdio: 'ignore' }); }
    say('ビルド…'); cp.execSync('npm run build', { cwd: info.devDir, stdio: 'ignore' });
    return { done: true, message: '更新しました。アプリを開き直してください' };
  }
  if (info.appImage && info.platform === 'linux') {
    if (!c.asset) return { done: false, manual: true, url: c.url || PAGE, message: 'このパソコン向けのファイルがリリースにありません' };
    const tmp = info.appImage + '.new';
    say(`${c.latest} をダウンロード中…`); await download(c.asset.browser_download_url, tmp, say);
    fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, info.appImage); // 動いている最中でも、置き換えられる
    try { const f = path.join(path.dirname(info.appImage), 'install.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.version = c.latest; fs.writeFileSync(f, JSON.stringify(j)); } catch { }
    return { done: true, message: `${c.latest} に更新しました。アプリを開き直してください` };
  }
  return { done: false, manual: true, url: (c.asset && c.asset.browser_download_url) || c.url || PAGE, message: '最新のインストーラーのページを開きます。ダウンロードして実行すると更新されます' };
}

// ===== `YuriiNote --update`（ELECTRON_RUN_AS_NODE や node で直接）=====
function readInstall() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'install.json'), 'utf8')); } catch { return null; }
}
async function cli(argv) {
  const say = s => console.log(s), flags = new Set(argv);
  const inst = readInstall();
  let info;
  if (inst) info = { version: inst.version, appImage: inst.appImage, platform: process.platform, arch: process.arch };
  else if (fs.existsSync(path.join(__dirname, '.git'))) info = { version: require('./package.json').version, devDir: __dirname, platform: process.platform, arch: process.arch };
  else { console.error('インストールの情報が見つかりません（アプリの「更新を確認」から更新してください）'); process.exit(1); }
  if (flags.has('--version')) return say(`YuriiNote ${info.version}`);
  const c = await check(info);
  if (c.none) return say('まだ公開されたバージョンがありません。');
  if (!c.newer) return say(`最新です（${c.current}）`);
  say(info.devDir ? `新しい変更があります（${c.latest}）` : `新しいバージョンがあります: ${c.current} → ${c.latest}`);
  if (flags.has('--check')) return say('更新するには: YuriiNote --update');
  const r = await apply(info, c, say);
  say(r.message); if (r.manual) say(r.url);
}
if (require.main === module) cli(process.argv.slice(2)).catch(e => { console.error('更新できませんでした: ' + e.message); process.exit(1); });

module.exports = { newer, pickAsset, check, apply, latestRelease, PAGE, REPO };
