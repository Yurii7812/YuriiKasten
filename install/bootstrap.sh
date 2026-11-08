#!/bin/sh
# YuriiNote 導入（Linux / macOS）。リリースは使わず、GitHub から取ってきて、その場で組み立てる
#   curl -fsSL https://raw.githubusercontent.com/Yurii7812/YuriiNote/master/install/bootstrap.sh | sh
# やること: git と Node.js が無ければ用意 → ~/.local/share/YuriiKasten-src に取得 → npm install → ビルド → ショートカットと YuriiKasten コマンド
# もう一度実行すると、最新に更新します（YuriiNote --update でも同じ）
set -e
REPO="${YURIIKASTEN_REPO:-https://github.com/Yurii7812/YuriiNote.git}"
SRC="${YURIIKASTEN_SRC:-$HOME/.local/share/YuriiKasten-src}"
NODEDIR="$HOME/.local/share/YuriiKasten-node"
say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
SUDO=""; [ "$(id -u)" = 0 ] || { have sudo && SUDO=sudo; }
OS=$(uname -s); ARCH=$(uname -m)

# ---- git
if ! have git; then
  say "git が見つかりません。入れます。"
  if have apt-get; then $SUDO apt-get update && $SUDO apt-get install -y git ca-certificates curl
  elif have dnf; then $SUDO dnf install -y git
  elif have pacman; then $SUDO pacman -S --noconfirm git
  elif have zypper; then $SUDO zypper install -y git
  elif have brew; then brew install git
  elif [ "$OS" = Darwin ]; then xcode-select --install || true; say "導入画面が終わってから、同じ1行をもう一度実行してください。"; exit 1
  else say "git を自分で入れてから、もう一度実行してください。"; exit 1; fi
fi

# ---- Node.js（18 以上。無ければ公式の配布物を ~/.local/share に置く。システムは触らない）
nodeok() { have node && have npm && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
if ! nodeok; then
  if [ -x "$NODEDIR/bin/node" ]; then PATH="$NODEDIR/bin:$PATH"; fi
fi
if ! nodeok; then
  say "Node.js を用意します（$NODEDIR）"
  case "$OS-$ARCH" in
    Linux-x86_64) P=linux-x64 ;; Linux-aarch64|Linux-arm64) P=linux-arm64 ;;
    Darwin-arm64) P=darwin-arm64 ;; Darwin-x86_64) P=darwin-x64 ;;
    *) say "このPC（$OS $ARCH）には対応していません。Node.js 18 以上を自分で入れてください。"; exit 1 ;;
  esac
  V=https://nodejs.org/dist/latest-v22.x
  F=$(curl -fsSL "$V/SHASUMS256.txt" | grep "node-v.*-$P.tar.gz" | head -1 | awk '{print $2}')
  [ -n "$F" ] || { say "Node.js の取得先が見つかりません"; exit 1; }
  T=$(mktemp -d); curl -fL --progress-bar -o "$T/n.tgz" "$V/$F"
  rm -rf "$NODEDIR"; mkdir -p "$NODEDIR"; tar -xzf "$T/n.tgz" -C "$NODEDIR" --strip-components=1; rm -rf "$T"
  PATH="$NODEDIR/bin:$PATH"
fi
export PATH

# ---- 取得（あれば更新）
if [ -d "$SRC/.git" ]; then say "更新します: $SRC"; git -C "$SRC" pull --ff-only
else say "取得します: $SRC"; mkdir -p "$(dirname "$SRC")"; git clone "$REPO" "$SRC"; fi
cd "$SRC"
say "部品を入れています（初回は数分かかります）…"
npm install --no-audit --no-fund
npm run build
chmod +x yuriikasten.sh

# ---- ショートカットと YuriiNote コマンド
if [ "$OS" = Linux ]; then
  ./yuriikasten.sh --install-shortcuts
else
  mkdir -p "$HOME/.local/bin"
  printf '#!/bin/sh\nexec "%s/yuriikasten.sh" "$@"\n' "$SRC" > "$HOME/.local/bin/YuriiNote"; chmod +x "$HOME/.local/bin/YuriiNote"; cp "$HOME/.local/bin/YuriiNote" "$HOME/.local/bin/YuriiKasten"   # 昔のコマンドも残す
  printf '#!/bin/sh\nexec "%s/yuriikasten.sh"\n' "$SRC" > "$HOME/Desktop/YuriiNote.command"; chmod +x "$HOME/Desktop/YuriiNote.command"
  say "デスクトップに YuriiNote.command を作りました（ダブルクリックで開きます）"
fi
say "入れました。ターミナルで YuriiNote と打つと開きます。更新は YuriiNote --update"
