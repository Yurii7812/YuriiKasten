#!/bin/sh
# スマホ用アプリ（APK）を作って、downloads/YuriiNote-memo.apk に置く（アプリの「スマホにアプリを入れる」が、これを使う）
#   要: JDK 17（JAVA_HOME）と Android SDK（ANDROID_HOME）。例: JAVA_HOME=$HOME/Android/jdk ANDROID_HOME=$HOME/Android/Sdk sh android/build-apk.sh
set -e
cd "$(dirname "$0")"
[ -f local.properties ] || printf 'sdk.dir=%s\n' "$ANDROID_HOME" > local.properties
./gradlew --offline assembleFast || ./gradlew assembleFast
mkdir -p ../downloads && cp app/build/outputs/apk/fast/app-fast.apk ../downloads/YuriiNote-memo.apk
echo "できました: downloads/YuriiNote-memo.apk"
