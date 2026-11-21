Seok's Stock 계정 저장소 배포 키트

방법 1(명령 한 줄, 추천)
  1) 이 폴더에서 PowerShell 열기(폴더 빈 곳 Shift+우클릭 → 'PowerShell 창 열기' 또는 터미널에서 cd)
  2) powershell -ExecutionPolicy Bypass -File .\deploy.ps1
  3) 안내대로: Apps Script API 켜기 → 구글 로그인 허용 → 브라우저에서 권한 허용
  4) 마지막에 나온 웹 앱 주소(클립보드에 복사됨)를 Claude에게 붙여 주기

방법 2(손으로)
  1) https://script.google.com → 새 프로젝트 → Code.gs 내용을 통째로 붙여 넣기 → 저장
  2) 편집기에서 함수 'setup' 선택 → 실행 → 권한 허용
  3) 배포 → 새 배포 → 웹 앱(실행: 나, 액세스: 모든 사용자) → 배포 → 주소 복사 → Claude에게

무엇이 만들어지나
  - 내 드라이브: 'Seok's Stock 계정' 시트(아이디·이메일·가입일, 비밀번호는 검증값만), 'Seok's Stock 개인 데이터(암호화)' 폴더
  - 다른 사람은 계정 시트를 볼 수 없고, 개인 데이터는 브라우저에서 암호화된 채 올라와 운영자도 내용을 못 봄
