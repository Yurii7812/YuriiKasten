#!/bin/sh
# 開発用の起動: ビルドして開く（ふつうの使い方は、インストーラーでインストールした YuriiKasten）
cd "$(dirname "$(readlink -f "$0")")" && npx esbuild src/app.js --bundle --outfile=dist/app.js --format=iife --log-level=warning && exec npx electron . "$@"
