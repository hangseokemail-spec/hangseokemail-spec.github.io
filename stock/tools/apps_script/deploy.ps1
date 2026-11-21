# Seok's Stock 계정 저장소 배포 스크립트 (Windows PowerShell)
# 쉬운 사용: 같은 폴더의 '배포하기.cmd'를 두 번 클릭
# 직접 실행: powershell -ExecutionPolicy Bypass -File "<이 폴더>\deploy.ps1"  (어느 위치에서 실행해도 됨)
# 하는 일: clasp 설치 → 구글 로그인 → 프로젝트 만들기 → 코드 올리기 → 웹 앱 배포
#          → 주소를 webapp_url.txt에 저장하고 클립보드에 복사
# 진행 기록은 deploy_log.txt에 단계마다 남는다(막히면 Claude가 이 파일을 읽는다). 비밀번호·토큰은 기록되지 않는다.
# clasp 3.4.1 기준으로 명령·옵션을 확인했다(create / push -f / deploy -d, -i).
$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$log = Join-Path $PSScriptRoot 'deploy_log.txt'
$urlFile = Join-Path $PSScriptRoot 'webapp_url.txt'
function Log($m) { try { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 } catch {} }
try { Set-Content -Path $log -Value ("시작 " + (Get-Date)) -Encoding UTF8 } catch {}

function Say($m) { Write-Host "`n>> $m" -ForegroundColor Cyan; Log $m }
function Fail($m) {
  Write-Host "`n$m" -ForegroundColor Yellow
  Write-Host "Claude 채팅에 '배포 막혔어'라고만 보내 주세요. 기록(deploy_log.txt)은 Claude가 직접 읽어요." -ForegroundColor Yellow
  Log ("실패: " + $m)
  exit 1
}
# 네이티브 명령의 표준오류를 cmd 안에서 합친다(PowerShell 5.1이 표준오류를 오류로 바꿔 멈추는 것을 막고, 기록에도 남긴다).
function Run($cmdline) {
  $o = (cmd /c "$cmdline 2>&1" | Out-String)
  $code = $LASTEXITCODE
  Write-Host $o
  Log ("$cmdline (종료 코드 $code)`n$o")
  return @{ out = $o; code = $code }
}

Say "1/6 Apps Script API 켜기(처음 한 번만)"
Write-Host "열리는 페이지에서 'Google Apps Script API'를 [사용]으로 바꾸세요. 이미 켜져 있으면 그대로 두면 돼요."
Start-Process "https://script.google.com/home/usersettings"
Read-Host "켰으면 이 창으로 돌아와 Enter"

Say "2/6 Node.js 확인"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Start-Process "https://nodejs.org/ko/download"
  Fail "Node.js가 없어요. 열린 페이지에서 LTS를 설치한 뒤 '배포하기.cmd'를 다시 두 번 클릭하세요."
}
$nv = (node --version); Write-Host $nv; Log ("node " + $nv)

Say "3/6 clasp 설치(이미 있으면 건너뜀, 처음이면 1~2분)"
if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) {
  npm install -g @google/clasp | Out-Host
  Log ("npm 종료 코드 " + $LASTEXITCODE)
  $prefix = (cmd /c "npm prefix -g" | Out-String).Trim()
  if ($prefix) { $env:Path = "$prefix;$env:Path" }
}
if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) { Fail "clasp 설치에 실패했어요." }
$cv = (cmd /c "clasp --version" | Out-String).Trim(); Write-Host $cv; Log ("clasp " + $cv)

Say "4/6 구글 로그인 - 열리는 브라우저에서 hangseokemail@gmail.com 선택 → [허용]"
clasp login
Log ("login 종료 코드 " + $LASTEXITCODE)
if ($LASTEXITCODE -ne 0) { Fail "구글 로그인이 끝나지 않았어요." }

Say "5/6 프로젝트 만들기 → 코드 올리기 → 웹 앱 배포"
if (-not (Test-Path .clasp.json)) {
  clasp create --type standalone --title "Seok's Stock 계정 저장소" --rootDir . | Out-Host
  if (-not (Test-Path .clasp.json)) { Fail "프로젝트를 만들지 못했어요. Apps Script API를 방금 켰다면 2~3분 뒤 다시 실행하세요." }
}
# create가 내려받은 기본 설정을 웹 앱 설정(나로 실행, 모든 사용자)으로 되돌린다. 기본 Code.js는 .claspignore가 막는다.
Copy-Item .\appsscript.template.json .\appsscript.json -Force
$r = Run "clasp push -f"
if ($r.code -ne 0) { Fail "코드를 올리지 못했어요." }

# 전에 배포한 주소가 있으면 같은 주소로 다시 배포한다(주소가 바뀌지 않게).
$oldId = ''
if (Test-Path $urlFile) { $oldId = [regex]::Match((Get-Content $urlFile -Raw), 'AKfyc[\w-]+').Value }
if ($oldId) { $r = Run "clasp deploy -i $oldId -d seoks-stock" } else { $r = Run "clasp deploy -d seoks-stock" }
$id = [regex]::Match($r.out, 'AKfyc[\w-]+').Value
if (-not $id) { Fail "배포 ID를 찾지 못했어요." }
$url = "https://script.google.com/macros/s/$id/exec"
Set-Content -Path $urlFile -Value $url -Encoding ASCII
Set-Clipboard -Value $url
Log ("주소 " + $url)

Say "6/6 권한 허용"
Write-Host "브라우저에 주소가 열리면 [권한 검토] → 계정 선택 → '확인되지 않은 앱' 화면이면 [고급] → [Seok's Stock 계정 저장소(으)로 이동] → [허용]."
Write-Host "'계정 저장소가 동작 중이에요 ✓' 화면이 나오면 끝이에요."
Start-Process $url
Write-Host "`n웹 앱 주소(webapp_url.txt에 저장, 클립보드에도 복사됨):" -ForegroundColor Green
Write-Host $url -ForegroundColor Green
Write-Host "Claude 채팅에 '배포 끝'이라고만 보내면 Claude가 이 주소를 직접 읽어 연결해요."
Log "끝"

