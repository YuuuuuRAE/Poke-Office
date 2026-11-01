# 포켓 오피스 — Claude Code가 일하는 모습을 포켓몬 사무실로

터미널 글자만 보고 Claude Code가 지금 뭘 하는지 한눈에 보기 어려우셨죠?
**포켓 오피스**는 Claude Code의 작업을 포켓몬들이 일하는 픽셀 사무실로 보여줘요!

<p align="center"><img src="docs/demo.gif" alt="포켓 오피스 데모" width="720"></p>

- 파일을 읽으면 **리서치실**에서, 코드를 고치면 **개발실**에서, 명령어를 실행하면 **터미널실**에서 담당 포켓몬이 일해요.
- 작업이 끝나면 다 같이 **휴게실**에서 쉬어요.
- Claude Code 세션 하나가 트레이너 한 명이에요. 트레이너는 **기획실** 원탁에 앉아 지시를 내려요.
- 프로젝트 폴더마다 사무실이 따로 생겨요.
- 사무실은 상단탭에서 변경할 수 있어요.

> 위 이미지의 몬스터는 이 프로젝트용 오리지널 픽셀 아트입니다. 본 레포를 설치하면 원하는 포켓몬으로 바꿀 수 있어요(아래 [포켓몬 바꾸기](#포켓몬-바꾸기)).

## 미리보기

| 데스크톱 | 모바일 |
| --- | --- |
| <img src="docs/screenshot-full.png" alt="데스크톱 화면" width="560"> | <img src="docs/mobile.png" alt="모바일 화면" width="200"> |

## 동작 방식

| Claude Code | 사무실에서 |
| --- | --- |
| 세션 시작 / 종료 | 트레이너가 입구로 출근해 기획실 원탁에 앉음 / 퇴근 |
| 프롬프트 입력 | 트레이너 말풍선 |
| `Read` · `Grep` · `Glob` · `WebSearch` · `WebFetch` | 리서치실 포켓몬이 책장·테이블에서 일함 |
| `Edit` · `Write` | 개발실 책상에서 코드를 고침 |
| `Bash` · MCP 도구 | 터미널실 콘솔·서버랙 앞에서 실행 |
| `TodoWrite` | 기획실 화이트보드에 할 일이 적힘 |
| 서브에이전트(`Task`) | 조수 포켓몬이 사무실을 돌며 조사하고 보고 |
| 툴 동시 호출 | 여러 포켓몬이 동시에 일함. 일이 겹치면 같은 포켓몬이 한 마리 더 출근 |
| 툴 실패 | 포켓몬이 시무룩해짐 |
| 권한 요청 (`Notification`) | 트레이너 머리 위 "!" + 화면 상단 알림 |
| 턴 종료 (`Stop`) | 다 같이 휴게실로 |

일할수록 사무실이 꾸며져요. 테스트가 통과하면 기획실 선반에 트로피가, 수정이 5번 쌓일 때마다 복도에 화분이 늘어요.

## 설치

필요한 것: **Node.js 18 이상**, **git**

```bash
git clone https://github.com/YuuuuuRAE/poke-office.git
cd poke-office
npm install    # 포켓몬 스프라이트를 자동으로 받아요 (약 10MB, 몇 초)
npm start      # http://127.0.0.1:4321
```

브라우저에서 **http://127.0.0.1:4321** 을 열면 데모가 돌아가요.
스프라이트 받기가 실패했다면 `npm run setup` 으로 다시 받을 수 있어요.

## 포켓몬 바꾸기

1. 화면 오른쪽 **스프라이트** 탭을 열어요.
2. 바꾸고 싶은 역할 옆 **변경**을 눌러요.
3. 이름(한국어/영어)이나 도감 번호로 검색해서 고르면 바로 바뀌어요. **이로치**도 고를 수 있어요.

고른 포켓몬은 브라우저에 저장돼요. **기본 몬스터로 초기화**를 누르면 되돌아가요.

| 역할 | 방 | 예시 |
| --- | --- | --- |
| Read | 리서치실 | 후딘 #65 |
| Grep / Glob | 리서치실 | 디그다 #50 |
| WebSearch / WebFetch | 리서치실 | 딜리버드 #225 |
| Edit / Write | 개발실 | 루브도 #235 |
| Bash | 터미널실 | 폴리곤 #137 |
| MCP 도구 | 터미널실 | 로토무 #479 |
| 서브에이전트 | 기획실 | 메타몽 #132 |

## Claude Code 연결

`~/.claude/settings.json`(윈도우: `C:\Users\<이름>\.claude\settings.json`)에 아래를 넣으세요.
`/절대경로/poke-office` 는 이 폴더의 실제 경로로 바꾸세요.

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "PreToolUse":       [{ "matcher": "", "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "PostToolUse":      [{ "matcher": "", "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "SubagentStop":     [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }]
  }
}
```

`npm start` 로 서버를 켜둔 채 Claude Code를 쓰면 화면이 **LIVE** 로 바뀌고 실제 작업을 따라 움직여요.

- 훅은 이벤트를 서버로 보내기만 하고 바로 끝나요. 서버가 꺼져 있어도 Claude Code는 평소처럼 동작해요.
- 권한 요청 알림은 화면에 표시만 돼요. 승인은 터미널에서 해주세요.
- Claude가 툴 없이 글만 쓰는 동안은 훅이 오지 않아서 트레이너가 "…" 말풍선만 보여요.

## 화면 조작

- **1x / 2x / 4x**: 속도 · **PAUSE**: 일시정지 · **🔍 확대**: 모바일에서 크게 보기
- **의뢰 보내기** 버튼: 훅 이벤트를 흉내 내서 직접 테스트
- 포켓몬·트레이너를 탭하면 정보가 보여요

## 구조

```
index.html                  화면 (Canvas, 의존성 없음)
server.mjs                  로컬 서버: 화면, /sprites, /api/names, POST /events, GET /stream (SSE)
hook.mjs                    Claude Code 훅 입력 → OfficeEvent 로 변환해 서버로 전송
scripts/setup-sprites.mjs   PokeAPI 스프라이트·이름 데이터 sparse checkout
docs/                       README 이미지
vendor/                     (자동 생성, git 제외) 받은 스프라이트와 names.json
```

서버는 `127.0.0.1` 에서만 열려요. 포트는 `POKE_OFFICE_PORT` 환경 변수로 바꿀 수 있어요.

## 저작권 안내

- 포켓몬 스프라이트와 이름의 권리는 Nintendo / Game Freak / The Pokémon Company에 있어요. 이 저장소에는 포켓몬 이미지가 들어 있지 않고, `npm install` 때 [PokeAPI/sprites](https://github.com/PokeAPI/sprites)에서 각자의 PC로 받아져요(`vendor/`, git 제외).
- 개인적으로만 쓰고, 포켓몬 스프라이트가 나온 화면을 녹화해 공개하거나 재배포하지 마세요.
- 이 프로젝트는 Nintendo, Game Freak, The Pokémon Company와 관계가 없어요.
- 기본 몬스터·트레이너·사무실 그림과 코드는 이 프로젝트에서 직접 만든 것이에요 (MIT License).

## 참고

- [pixel-agents](https://github.com/pablodelucca/pixel-agents): Claude Code 에이전트를 픽셀 오피스 캐릭터로 보여주는 VS Code 확장. 이 프로젝트의 출발점이 된 아이디어예요.
- [Claude Code hooks 문서](https://code.claude.com/docs/en/hooks)
