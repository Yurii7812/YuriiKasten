#!/bin/sh
# 古い起動ショートカットの互換性のみ。新しい名称は YuriiNote。
exec "$(dirname "$0")/yuriinote.sh" "$@"
