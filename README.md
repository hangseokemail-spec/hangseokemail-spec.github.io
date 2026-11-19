# 석스 가판대

https://hangseokemail-spec.github.io/ — 석스가 만든 것들을 한 화면에 모아 보는 페이지입니다.

- `index.html` 화면과 디자인
- `hub.js` 각 프로그램의 발행 기록을 읽어 최신 호 표지를 그리는 코드
- `projects.json` **프로그램 목록. 새로 만든 것은 여기에만 추가하면 됩니다.**
- `assets/` 발행 기록이 없는 것(게임)의 표지 그림

## 어떻게 바로 반영되나

이 페이지는 열릴 때마다 각 프로그램의 목록 파일(`/news/data/index.json`, `/bios/issues/index.json` …)을 직접 읽습니다.
새 호가 올라가면 그 목록이 바뀌므로 가판대는 따로 고칠 필요가 없습니다. GitHub Pages 캐시 때문에 최대 10분쯤 늦을 수 있고, 켜 둔 화면은 20분마다 다시 읽습니다.

## 읽음 표시

카드를 누르면 그 기기 브라우저에 "어느 호까지 눌러 봤는지"를 적어 둡니다(localStorage, 서버로 보내지 않음).
더 새로운 호가 나오면 파란 점과 주황색 "새로 나왔어요 / 아직 안 봤어요"가 다시 켜집니다.
휴대폰과 PC는 따로 기억하고, 가판대를 거치지 않고 각 사이트를 직접 열면 기록되지 않습니다.

## 새 프로그램 추가하기

`projects.json`의 `projects`에 한 덩어리를 더합니다. `group`은 `daily`·`weekly`·`irregular`·`always` 중 하나(새 칸이 필요하면 `groups`에 추가).

### 1) 목록 JSON이 이미 있는 경우 — `index`

```json
{
  "id": "새이름",
  "name": "보일 이름",
  "kind": "종류(예: 주간 매거진)",
  "desc": "한 줄 소개",
  "group": "weekly",
  "url": "/새이름/",
  "schedule": { "days": [5], "time": "19:00" },
  "accent": "#3b82f6",
  "source": {
    "type": "index",
    "index": "/새이름/data/index.json",
    "list": "issues",
    "label": "제{no}호",
    "title": "{title}",
    "cover": "/새이름/img/{date}/cover.jpg"
  },
  "cover": { "style": "plain" }
}
```

- `schedule.days`: 0=일 … 6=토, `time`: 한국 시각. 다음 호 안내와 "예정보다 늦어지고 있어요" 표시에 씁니다. 비정기면 빼고 `statusText`를 씁니다.
- `list`: 목록 배열이 있는 자리(배열이 파일 맨 위면 `""`). 각 항목에 `date`(YYYY-MM-DD)가 있어야 합니다.
- `label`·`title`·`cover`·`link`: `{필드}` 자리에 그 호의 값이 들어갑니다. `{no|pad2}`는 두 자리(01)로 채웁니다.
- `publishAt`: 미리 올려 두고 정해진 시각에 공개하는 경우 그 필드 이름.
- `detail`: 표지 정보가 호별 파일 안에 있을 때 그 파일 주소. 그 안의 값은 `{d.필드}`로 씁니다.
- `cover.style`: `plain`(표지 그림 그대로) · `overlay`(그림 위에 `mast` 제호와 제목) · `paper`(종이 신문, SVG 그림) · `type`(글자만) · `wind`(풍향계 전용).

### 2) 새로 만드는 프로그램 — `hub.json` 하나만 두기

저장소에 아래 파일을 두고 발행할 때마다 갱신하면, `"source": { "type": "hub", "feed": "/새이름/hub.json" }`로 연결됩니다.

```json
{ "date": "2026-11-20", "label": "제3호", "title": "이번 호 제목", "cover": "img/2026-11-20/cover.jpg", "publishedAt": "2026-11-20T19:00:00+09:00" }
```

`cover`·`link`는 hub.json 위치 기준 상대 주소도 됩니다.

### 3) 발행이 없는 것(게임·도구) — `static`

표지 그림을 `assets/`에 넣고 `"source": { "type": "static", "label": "…", "title": "…", "cover": "assets/그림.jpg" }`.

## 예전 주소

예전처럼 `https://hangseokemail-spec.github.io/?tab=wind`로 들어오면 증시현황판(`/seoks/`)으로 넘어갑니다.
