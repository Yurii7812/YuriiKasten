#!/bin/sh
# YuriiKasten 導入（Linux / macOS）。1行で、最新版を取ってきて入れる
#   curl -fsSL https://raw.githubusercontent.com/Yurii7812/YuriiKasten/main/install/bootstrap.sh | sh
set -e
REPO=Yurii7812/YuriiKasten
OS=$(uname -s); ARCH=$(uname -m)
case "$OS" in
  Linux)  PAT='AppImage' ;;
  Darwin) if [ "$ARCH" = arm64 ]; then PAT='arm64.*\.dmg'; else PAT='\.dmg'; fi ;;
  *) echo "このOSには対応していません: $OS"; exit 1 ;;
esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "最新版を探しています…"
URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep browser_download_url | grep -E "$PAT" | head -1 | cut -d '"' -f 4)
[ -n "$URL" ] || { echo "ダウンロードできるファイルが見つかりません（まだリリースが無いかもしれません）"; exit 1; }
FILE="$TMP/$(basename "$URL")"
echo "ダウンロード: $URL"
curl -fL --progress-bar -o "$FILE" "$URL"
if [ "$OS" = Linux ]; then
  chmod +x "$FILE"
  "$FILE" --install     # ~/.local/share/YuriiKasten に入れ、ショートカットと YuriiKasten コマンドを作る
  echo "入れました。アプリ一覧の YuriiKasten か、ターミナルで YuriiKasten と打つと開きます。更新は YuriiKasten --update"
else
  open "$FILE"; echo "開いた画面で YuriiKasten を「アプリケーション」へドラッグしてください"
fi
