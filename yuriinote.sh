#!/bin/sh
# 起動（git のフォルダ）。bootstrap.sh で入れたときも、これで開く
#   YuriiNote              ビルドして開く
#   YuriiNote --update     git pull して更新（--check は確認だけ、--version は番号）。画面は開かない
cd "$(dirname "$(readlink -f "$0")")" || exit 1
[ -x "$HOME/.local/share/YuriiNote-node/bin/node" ] && PATH="$HOME/.local/share/YuriiNote-node/bin:$PATH"
case "$1" in
  --update|--check|--version) exec node update.js "$@" ;;
esac
NS=""; [ "$(uname -s)" = Linux ] && NS="--no-sandbox"
[ -f dist/app.js ] && [ -z "$(find src index.html -newer dist/app.js 2>/dev/null | head -1)" ] || npx esbuild src/app.js --bundle --outfile=dist/app.js --format=iife --log-level=warning || exit 1
exec npx electron $NS . "$@"
