# YuriiKasten 導入（Windows）。PowerShell に次の1行を貼る
#   irm https://raw.githubusercontent.com/Yurii7812/YuriiKasten/main/install/bootstrap.ps1 | iex
$ErrorActionPreference = 'Stop'
$repo = 'Yurii7812/YuriiKasten'
Write-Host '最新版を探しています…'
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'YuriiKasten-installer' }
$a = $rel.assets | Where-Object { $_.name -like '*.exe' } | Select-Object -First 1
if (-not $a) { throw 'ダウンロードできる exe が見つかりません（まだリリースが無いかもしれません）' }
$out = Join-Path $env:TEMP $a.name
Write-Host "ダウンロード: $($a.name)"
Invoke-WebRequest $a.browser_download_url -OutFile $out -UseBasicParsing
Start-Process $out -Wait
Write-Host '入れました。デスクトップとスタートメニューの YuriiKasten から開きます。'
