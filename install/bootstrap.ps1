# YuriiNote 導入（Windows）。リリースは使わず、GitHub から取ってきて、その場で組み立てる
#   irm https://raw.githubusercontent.com/Yurii7812/YuriiKasten/master/install/bootstrap.ps1 | iex
# やること: git と Node.js が無ければ winget で入れる → 取得 → npm install → ビルド → デスクトップとスタートメニューにショートカット
# もう一度実行すると、最新に更新します
$ErrorActionPreference = 'Stop'
$repo = 'https://github.com/Yurii7812/YuriiKasten.git'
$src = Join-Path $env:LOCALAPPDATA 'YuriiKasten-src'
function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Refresh { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }

if (-not (Have winget) -and (-not (Have git) -or -not (Have node))) { throw 'winget が無いので、Git と Node.js（18以上）を自分で入れてから、もう一度実行してください。' }
if (-not (Have git)) { Write-Host 'git を入れます…'; winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements; Refresh }
$nodeOk = $false
if (Have node) { $nodeOk = ([int](node -p 'process.versions.node.split(".")[0]')) -ge 18 }
if (-not $nodeOk) { Write-Host 'Node.js を入れます…'; winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements; Refresh }
if (-not (Have git) -or -not (Have node)) { throw 'git か Node.js が見つかりません。PowerShell を開き直して、もう一度実行してください。' }

if (Test-Path (Join-Path $src '.git')) { Write-Host "更新します: $src"; git -C $src pull --ff-only }
else { Write-Host "取得します: $src"; git clone $repo $src }
Set-Location $src
Write-Host '部品を入れています（初回は数分かかります）…'
npm install --no-audit --no-fund
npm run build

# 起動用の cmd（YuriiNote / YuriiNote --update。昔の YuriiKasten も残す）
$bin = Join-Path $env:LOCALAPPDATA 'YuriiKasten-bin'; New-Item -ItemType Directory -Force $bin | Out-Null
Set-Content (Join-Path $bin 'YuriiNote.cmd') -Encoding ASCII -Value @"
@echo off
cd /d "$src"
if "%1"=="--update" (node update.js --update & goto :eof)
if "%1"=="--check" (node update.js --check & goto :eof)
if "%1"=="--version" (node update.js --version & goto :eof)
call npm run build >nul
start "" "$src\node_modules\electron\dist\electron.exe" .
"@
$userPath = [Environment]::GetEnvironmentVariable('Path','User')
if ($userPath -notlike "*$bin*") { [Environment]::SetEnvironmentVariable('Path', "$userPath;$bin", 'User') }

# ショートカット（デスクトップ・スタートメニュー）
$ws = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
  $l = $ws.CreateShortcut((Join-Path $dir 'YuriiNote.lnk'))
  $l.TargetPath = Join-Path $src 'node_modules\electron\dist\electron.exe'; $l.Arguments = '.'; $l.WorkingDirectory = $src
  if (Test-Path (Join-Path $src 'build\icon.ico')) { $l.IconLocation = (Join-Path $src 'build\icon.ico') + ',0' }; $l.Save()
}
Write-Host '入れました。デスクトップの YuriiNote から開きます。更新は、この1行をもう一度実行するか、新しい PowerShell で YuriiKasten --update'
