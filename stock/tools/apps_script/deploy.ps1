# Seok's Stock 계정 저장소 배포 스크립트 (Windows PowerShell)
# 사용: 이 폴더에서  powershell -ExecutionPolicy Bypass -File .\deploy.ps1
# 하는 일: clasp(구글 Apps Script 명령줄 도구) 설치 → 구글 로그인 → 프로젝트 만들기 → 코드 올리기 → 웹 앱 배포 → 주소 복사
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
function Say($m) { Write-Host "`n>> $m" -ForegroundColor Cyan }

Say "1/6 Node.js 확인"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js가 없어요. 열리는 페이지에서 LTS를 설치한 뒤 PowerShell을 새로 열고 다시 실행하세요." -ForegroundColor Yellow
  Start-Process "https://nodejs.org/ko/download"; exit 1
}
node --version

Say "2/6 clasp 설치(이미 있으면 건너뜀)"
if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) { npm install -g @google/clasp | Out-Host }
clasp --version

Say "3/6 Apps Script API 켜기"
Write-Host "열리는 페이지에서 'Google Apps Script API'를 [사용]으로 바꾸세요(처음 한 번만)."
Start-Process "https://script.google.com/home/usersettings"
Read-Host "켰으면 Enter"

Say "4/6 구글 로그인 - 브라우저에서 hangseokemail@gmail.com 으로 [허용]"
clasp login | Out-Host

Say "5/6 프로젝트 만들기 → 코드 올리기 → 웹 앱 배포"
if (-not (Test-Path .clasp.json)) {
  clasp create --type standalone --title "Seok's Stock 계정 저장소" --rootDir . | Out-Host
}
Copy-Item .\appsscript.template.json .\appsscript.json -Force   # create가 덮어쓴 설정을 되돌림(웹 앱: 나로 실행, 모든 사용자)
clasp push -f | Out-Host
$out = (clasp deploy --description "seoks-stock" 2>&1 | Out-String)
Write-Host $out
$id = [regex]::Match($out, 'AKfyc[\w-]+').Value
if (-not $id) { Write-Host "배포 ID를 찾지 못했어요. 위 메시지를 Claude에게 그대로 보여 주세요." -ForegroundColor Yellow; exit 1 }
$url = "https://script.google.com/macros/s/$id/exec"
Set-Clipboard -Value $url

Say "6/6 권한 허용"
Write-Host "브라우저에 주소가 열리면 [권한 검토] → 계정 선택 → '확인되지 않은 앱' 화면이면 [고급] → [Seok's Stock 계정 저장소(으)로 이동] → [허용]."
Write-Host "'계정 저장소가 동작 중이에요 ✓' 화면이 나오면 끝이에요."
Start-Process $url
Write-Host "`n웹 앱 주소(클립보드에 복사됨):" -ForegroundColor Green
Write-Host $url -ForegroundColor Green
Write-Host "이 주소를 Claude 채팅에 붙여 주세요."
