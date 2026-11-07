const test = require('node:test');
const assert = require('node:assert');
const { newer, pickAsset } = require('../update');

test('バージョンの比較', () => {
  assert.ok(newer('0.5.0', '0.4.9') && newer('1.0.0', '0.99.9') && newer('v0.4.1', '0.4.0'));
  assert.ok(!newer('0.4.0', '0.4.0') && !newer('0.3.9', '0.4.0') && !newer('', '0.1.0'));
});
test('この OS 向けのファイルを選ぶ', () => {
  const rel = { assets: [
    { name: 'YuriiKasten-0.5.0-win-x64.exe' }, { name: 'YuriiKasten-0.5.0-mac-arm64.dmg' }, { name: 'YuriiKasten-0.5.0-mac-x64.dmg' },
    { name: 'YuriiKasten-0.5.0-linux-x86_64.AppImage' }, { name: 'latest.yml' }] };
  assert.strictEqual(pickAsset(rel, 'win32', 'x64').name, 'YuriiKasten-0.5.0-win-x64.exe');
  assert.strictEqual(pickAsset(rel, 'darwin', 'arm64').name, 'YuriiKasten-0.5.0-mac-arm64.dmg');
  assert.strictEqual(pickAsset(rel, 'darwin', 'x64').name, 'YuriiKasten-0.5.0-mac-x64.dmg');
  assert.ok(/AppImage$/.test(pickAsset(rel, 'linux', 'x64').name));
  assert.strictEqual(pickAsset({ assets: [] }, 'linux', 'x64'), null);
});
