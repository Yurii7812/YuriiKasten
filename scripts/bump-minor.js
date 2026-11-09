#!/usr/bin/env node
// Bump x in 1.x.y for a coherent new feature or a new use case.
// Bug fixes and small UI/copy improvements use bump-version.js patch.
// Bump exactly once when preparing a user-facing update.
// package.json is the single version source for Electron and Android Gradle.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const jsonPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const pkg = JSON.parse(fs.readFileSync(jsonPath,'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!match) throw new Error('Expected numeric major.minor.patch version');
const next = `${match[1]}.${Number(match[2])+1}.0`;
const lock = JSON.parse(fs.readFileSync(lockPath,'utf8'));
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version)
  throw new Error('package-lock.json version does not match package.json; resolve before bumping');
const previous = pkg.version;
pkg.version = next;
lock.version = next;
lock.packages[''].version = next;
fs.writeFileSync(jsonPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(`Release: ${previous} -> ${next} (Android versionName/code derived by Gradle)`);
