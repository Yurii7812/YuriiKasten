const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pkm-phone-'));
// 本物の adb の代わりに、呼ばれ方を記録するだけの adb
function fakeAdb(dir, devices, installOut = 'Performing Streamed Install\nSuccess') {
  const f = path.join(dir, 'adb');
  fs.writeFileSync(f, `#!/bin/sh
echo "$@" >> "${dir}/calls.log"
case "$*" in
  devices) printf 'List of devices attached\\n${devices}\\n' ;;
  *install*) echo '${installOut}' ;;
  *"cat files/settings.json"*) echo '{"alarmOn":true}' ;;
  *"cat > files/settings.json"*) cat > "${dir}/settings.out" ;;
esac
exit 0
`, { mode: 0o755 });
  return f;
}
const load = () => { delete require.cache[require.resolve('../phone')]; return require('../phone'); };

test('adb devices の出力を読む', () => {
  const P = load();
  assert.deepStrictEqual(P.parseDevices('List of devices attached\nABC123\tdevice\nXYZ\tunauthorized\n\n'), [{ serial: 'ABC123', state: 'device' }, { serial: 'XYZ', state: 'unauthorized' }]);
  assert.deepStrictEqual(P.parseDevices('List of devices attached\n\n'), []);
});

test('スマホが無い・許可待ちのときは、やることを案内する', async () => {
  const d = tmp(); process.env.ADB = fakeAdb(d, ''); let r = await load().install({}, () => { });
  assert.ok(!r.ok && /USBデバッグ/.test(r.message));
  process.env.ADB = fakeAdb(d, 'XYZ\\tunauthorized'); r = await load().install({}, () => { });
  assert.ok(!r.ok && /許可/.test(r.message));
});

test('入れて、同期の設定も渡す（既存の設定は壊さない）', async () => {
  const d = tmp(); process.env.ADB = fakeAdb(d, 'ABC123\\tdevice');
  const r = await load().install({ sync: { url: 'http://raspberrypi.local:8787', token: 'tk' } }, () => { });
  assert.ok(r.ok, r.message); assert.match(r.message, /同期の設定/);
  const calls = fs.readFileSync(path.join(d, 'calls.log'), 'utf8');
  assert.match(calls, /-s ABC123 install -r .*YuriiKasten-memo\.apk/);
  const o = JSON.parse(fs.readFileSync(path.join(d, 'settings.out'), 'utf8'));
  assert.deepStrictEqual([o.alarmOn, o.serverUrl, o.serverToken], [true, 'http://raspberrypi.local:8787', 'tk']);
});

test('入れるのに失敗したら、理由を返す', async () => {
  const d = tmp(); process.env.ADB = fakeAdb(d, 'ABC123\\tdevice', 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]');
  const r = await load().install({}, () => { }); assert.ok(!r.ok && /INSTALL_FAILED/.test(r.message));
});
