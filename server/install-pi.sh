#!/bin/sh
# ラズパイ（Linux）に YuriiKasten の同期サーバーを入れる。home の下だけを使い、システムには触らない
#   使い方: このフォルダ（server.js のある所）で  sh install-pi.sh
#   やること: Node.js 22 を ~/.local/share/YuriiKasten-node に用意 → ~/yuriikasten-sync に server.js → systemd の user サービスで常駐
#   データ: ~/YuriiKasten-vault   合言葉: ~/.yuriikasten-token   ポート: 8787（YURIIKASTEN_PORT で変えられる）
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
APP="$HOME/yuriikasten-sync"; NODEDIR="$HOME/.local/share/YuriiKasten-node"; PORT="${YURIIKASTEN_PORT:-8787}"
say() { printf '%s\n' "$*"; }
ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":$PORT\$" && ! systemctl --user is-active --quiet yuriikasten-sync && { say "ポート $PORT は、ほかが使っています。YURIIKASTEN_PORT=… で別の番号にしてください。"; exit 1; }
# ---- Node.js
nodeok() { [ -x "$NODEDIR/bin/node" ] && [ "$("$NODEDIR/bin/node" -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
if ! nodeok; then
  case "$(uname -m)" in aarch64|arm64) P=linux-arm64 ;; x86_64) P=linux-x64 ;; armv7l) P=linux-armv7l ;; *) say "未対応の機種: $(uname -m)"; exit 1 ;; esac
  V=https://nodejs.org/dist/latest-v22.x
  F=$(curl -fsSL "$V/SHASUMS256.txt" | grep "node-v.*-$P.tar.gz" | head -1 | awk '{print $2}')
  [ -n "$F" ] || { say "Node.js の取得先が見つかりません"; exit 1; }
  T=$(mktemp -d); say "Node.js を取得: $F"; curl -fL --progress-bar -o "$T/n.tgz" "$V/$F"
  rm -rf "$NODEDIR"; mkdir -p "$NODEDIR"; tar -xzf "$T/n.tgz" -C "$NODEDIR" --strip-components=1; rm -rf "$T"
fi
# ---- サーバー本体
mkdir -p "$APP" "$HOME/YuriiKasten-vault"; cp "$HERE/server.js" "$APP/server.js"
# ---- 常駐（systemd の user サービス）
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/yuriikasten-sync.service" <<UNIT
[Unit]
Description=YuriiKasten 同期サーバー
After=network-online.target

[Service]
Environment=YURIIKASTEN_DATA=$HOME/YuriiKasten-vault
Environment=YURIIKASTEN_PORT=$PORT
ExecStart=$NODEDIR/bin/node $APP/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now yuriikasten-sync.service
sleep 2
systemctl --user is-active yuriikasten-sync.service
say "入れました。アドレス: http://$(hostname).local:$PORT"
say "合言葉:   $(cat "$HOME/.yuriikasten-token" 2>/dev/null)"
