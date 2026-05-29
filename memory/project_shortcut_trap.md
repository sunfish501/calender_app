---
name: project-shortcut-trap
description: 달력 앱 단축키가 옛 OneDrive 경로를 가리키던 함정 — 변경이 사용자에게 안 보이면 단축키 타겟부터 확인
metadata:
  type: project
---

User's 바탕화면 `달력.lnk` (3개: OneDrive Desktop, Desktop, Start Menu) 이 한때 모두
`C:\Users\euiky\OneDrive\Desktop\역사에 남을 그 폴더\launch.vbs` 를 가리키고 있었다.
프로젝트가 `c:\my_code\CAL\` 로 옮겨진 뒤에도 단축키만 옛 경로를 유지해서,
새 폴더에서 calendar.html 을 아무리 수정해도 사용자 눈에는 옛 버전이 그대로 보였다.

**Why:** install-app.ps1 이 옛 경로 기준으로 단축키를 생성했고 폴더 이동 후 갱신 안 됨.
OneDrive Desktop 의 .lnk 가 다른 PC 에도 동기화돼 있을 가능성도 있음.

**How to apply:**
- 사용자가 "수정이 반영 안 됨" 이라고 보고할 때 가장 먼저:
  1. server.ps1 + msedge --app 프로세스의 CommandLine 을 확인해 어느 경로의 파일을 띄우는지 본다.
  2. 바탕화면/시작메뉴 `달력.lnk` 의 TargetPath / Arguments / WorkingDirectory / IconLocation 확인.
- 2026-05-29 에 3개 단축키 모두 `c:\my_code\CAL\launch.vbs` 로 갱신했고
  옛 폴더의 `browser-profile` (450MB, localStorage·로그인 세션) 을 새 폴더로 robocopy 복사함.
  origin 이 동일(`http://localhost:8765`) 하므로 사용자 데이터(일정/테마/모토) 그대로 유지.
- 옛 폴더는 보존(롤백용). install-app.ps1 을 다시 돌리지 말 것 — 옛 경로 단축키 다시 만든다.

**추가 (2026-05-29 14:42):** 단축키만 갱신했더니 로그인 후에도 변경이 안 보였다.
근본 원인은 Edge `--app=` 모드의 **disk cache**: server.ps1 이 no-store 를 보내도
cache hit 으로 옛 HTML 을 그대로 서빙. 7중 차단으로 해결:
1) launch.ps1 의 URL 에 `?cb=<ms>` 쿼리스트링 (매번 다름)
2) auth-ui.js 의 reload 를 `window.location.replace(url + 새 cb)` 로 교체
3) server.ps1 에 매번 다른 GUID ETag + Pragma/Expires/Vary
4) calendar.html `<head>` 에 캐시 금지 meta 3개
5) 외부 JS 도 `?v=Date.now()` cache-bust
6) 새 browser-profile 의 disk cache 디렉토리 (`Cache`, `Code Cache`, `GPUCache`, `ShaderCache` 등) 삭제
7) `--disable-features=BackForwardCache --disk-cache-size=1` 플래그 추가

userDataSync.js 의 KEYS 에 `calendar-theme-filter-v1`, `calendar-cell-design-v1`,
`calendar-motto-v1` 추가 (멀티 PC 사용 대비). 옛 키 `calendar-postits-v1` 는
deprecated 지만 호환성 위해 유지.
