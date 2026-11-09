#!/usr/bin/env node
// バージョン（1.x.y）を 1 つ上げる。使い方: node scripts/bump-version.js [patch|minor]（省略は patch）
//  - minor: 新しい機能の追加など、大きな変更があったとき。x を 1 つ上げて y を 0 に戻す（1.0.1 → 1.1.0）
//  - patch: 機能ではない小さな更新（直し・見た目や文言の調整）。y を 1 つ上げる（1.0.0 → 1.0.1）
//  - package.json が、PC とスマホ（Gradle が versionName/versionCode を作る）の唯一の元
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const jsonPath = path.join(root, 'package.json'), lockPath = path.join(root, 'package-lock.json');
const kind = process.argv[2] || 'patch';
if (!['patch', 'minor'].includes(kind)) throw new Error('patch か minor を指定してください');
const pkg = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!m) throw new Error('バージョンは 数字.数字.数字 の形にしてください');
const next = kind === 'minor' ? `${m[1]}.${Number(m[2]) + 1}.0` : `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version)
  throw new Error('package-lock.json のバージョンが package.json と違います。先に揃えてください');
const previous = pkg.version;
pkg.version = next; lock.version = next; lock.packages[''].version = next;
fs.writeFileSync(jsonPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(`${previous} -> ${next}`);
