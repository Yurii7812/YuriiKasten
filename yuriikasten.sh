#!/bin/sh
# 開発用の起動（git のフォルダ）。ふつうの使い方は、インストーラーでインストールした YuriiKasten
#   YuriiKasten            ビルドして開く
#   YuriiKasten --update   git pull して更新（--check は確認だけ、--version は番号）。画面は開かない
cd "$(dirname "$(readlink -f "$0")")" || exit 1
case "$1" in
  --update|--check|--version) exec node update.js "$@" ;;
esac
npx esbuild src/app.js --bundle --outfile=dist/app.js --format=iife --log-level=warning && exec npx electron . "$@"
