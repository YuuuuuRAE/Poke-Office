# Poke Office

Claude Code가 지금 무슨 일을 하는지 포켓몬 사무실로 보여주는 로컬 대시보드.

툴을 쓸 때마다 트레이너가 몬스터볼을 던지고, 담당 포켓몬이 자기 방으로 가서 일합니다. 파일을 읽으면 리서치실, 코드를 고치면 개발실, 테스트를 돌리면 테스트실로 갑니다.

<p align="center"><img src="docs/demo.gif" alt="Poke Office" width="720"></p>

> README 이미지의 몬스터는 직접 그린 오리지널 픽셀 아트입니다. 설치하면 원하는 포켓몬으로 바꿀 수 있습니다.

| 데스크톱 | 모바일 |
| --- | --- |
| <img src="docs/screenshot-full.png" alt="데스크톱" width="560"> | <img src="docs/mobile.png" alt="모바일" width="200"> |

## 설치

Node.js 18 이상과 git이 필요합니다.

```bash
git clone https://github.com/YuuuuuRAE/poke-office.git
cd poke-office
npm run install:all
```

스프라이트 다운로드, Claude Code 훅 연결, 바탕화면 아이콘 생성까지 한 번에 끝납니다. Windows는 `install.cmd`를 더블클릭해도 됩니다.

이후에는 바탕화면의 **Poke Office** 아이콘으로 켜면 됩니다. 켤 때마다 새 버전이 있으면 먼저 받아옵니다. macOS에서는 `Poke Office.command` 파일이 만들어집니다.

<details><summary>하나씩 설치하기</summary>

```bash
npm install          # 스프라이트 다운로드 (약 10MB)
npm run hooks        # Claude Code 훅 연결
npm run shortcut     # 바탕화면 아이콘 (지우기: npm run shortcut:remove)
npm start            # http://127.0.0.1:4321
```
</details>

브라우저에서 http://127.0.0.1:4321 을 열어 두고 Claude Code를 쓰면 됩니다. 이미 켜져 있던 Claude Code는 다시 실행해야 훅이 적용됩니다.

Windows PowerShell에서 `npm` 실행이 막혀 있다면(스크립트를 실행할 수 없다는 오류) 명령 프롬프트(cmd)에서 실행하거나 `install.cmd`를 쓰면 됩니다.

## 방 구성

```
┌ 리서치실 ┬ 개발실 ┬ 테스트실 ┐
├──────────── 복도 ────────────┤
│ 기획실 │ 입구 │ 터미널실 │ 휴게실 │
```

| 방 | 하는 일 | 툴 |
| --- | --- | --- |
| 리서치실 | 파일을 읽고 코드를 찾아보는 곳 | `Read` `Grep` `Glob` `LSP`, 읽기 전용 Bash (`rg` `find` `cat` `git diff` …) |
| 개발실 | 파일을 고치거나 새로 쓰는 곳 | `Edit` `Write` `NotebookEdit` |
| 테스트실 | 테스트 / 린트 / 빌드로 검증하는 곳 | 테스트, 린트, 타입 검사, 빌드 명령. 벽 보드에 마지막 결과 표시 |
| 터미널실 | 명령 실행과 외부 도구를 쓰는 곳 | 그 밖의 Bash, `WebSearch` `WebFetch`, MCP 도구 |
| 기획실 | 할 일 정리와 서브에이전트 | `TodoWrite` `Agent` `Skill` `ExitPlanMode`, 트레이너 자리 |
| 휴게실 | 답변이 끝나고 쉬는 곳 | `Stop` 이후 다음 지시를 기다림 |

Bash는 명령 내용을 보고 방을 나눕니다. macOS/Linux의 Claude Code는 검색을 Bash로 하는 경우가 많기 때문입니다.

## 기능

### 사무실

- Claude Code 세션 하나가 트레이너 한 명입니다. 프로젝트 폴더마다 사무실이 따로 생기고, 위쪽 탭으로 바꿔 봅니다.
- 툴이 동시에 실행되면 포켓몬도 여러 마리 나옵니다. 실패하면 시무룩해지고, 서브에이전트는 조수 포켓몬이 사무실을 돌며 조사합니다.
- 권한 요청이나 질문이 오면 트레이너 머리 위에 `!` `?`가 뜨고 화면 위에 알림이 나옵니다. 승인은 터미널에서 합니다.
- 자리를 비운 사이 Claude Code가 남긴 recap은 트레이너 머리 위 초록 느낌표로 표시되고, 누르면 내용이 보입니다.
- Claude Code를 종료하면 트레이너가 퇴근합니다. 창을 그냥 닫아서 종료 신호가 안 와도 30분 동안 소식이 없으면 퇴근합니다. 모두 퇴근하면 탭도 닫힙니다.
- 다른 탭에 있다가 돌아와도 밀린 동작이 한꺼번에 재생되지 않습니다.

### 조작

- 방, 캐릭터, 목록에 마우스를 올리면 설명이 뜹니다. 방을 누르면 지금 그 방에서 하는 일을 보여줍니다.
- 트레이너나 포켓몬은 꾹 눌러 잡을 수 있습니다.
  - 휙 던지면 날아가고, 벽에 부딪히면 "쿵!" 하고 어지러워합니다.
  - 오래 잡고 있으면 화를 냅니다. 포켓몬은 몬스터볼에 들어갔다 나오고, 트레이너는 "놔 주세요!"라고 합니다.
  - 다른 방에 놓으면 "여기 아닌데…?", 휴게실에 놓으면 잠깐 쉬다 갑니다.
  - 다른 포켓몬 옆에 놓으면 인사하고, 자기 트레이너 옆에 놓으면 쓰다듬어 줍니다.
  - 화면 연출일 뿐 Claude Code 작업에는 영향이 없습니다.
- 탭이나 트레이너를 우클릭하면 이름 수정, 삭제, 토큰 분석 메뉴가 나옵니다. 이름과 삭제는 이 화면에만 적용되고, 삭제한 세션에 새 프롬프트를 보내면 다시 나타납니다.

### 오른쪽 패널

- **사용 한도**: 5시간 / 주간 한도의 남은 양을 HP 바로 보여줍니다. 따로 설정해야 나옵니다. [사용 한도 HP 바 켜기](#사용-한도-hp-바-켜기) 참고.
- **작업 목록**: 지금 일하는 포켓몬, 처리 중인 파일이나 명령, 경과 시간
- **세션**: 트레이너별 상태와 마지막 프롬프트. **세션 찾기**는 최근 1시간 안에 쓴 세션을 대화 기록에서 찾아 불러옵니다. 서버를 켜기 전부터 열려 있던 창도 찾습니다.
- **내 파티**: 역할별 포켓몬과 일한 횟수
- **활동 기록**: 프롬프트, 툴 실행, Claude가 터미널에 쓴 말, recap. 전체 기록에서는 태그별로 걸러 볼 수 있습니다.
- **연결**: 서버와 훅 연결 상태

잘린 글은 오른쪽 ▾ 버튼을 누르면 전체가 보입니다.

### 작업 타임라인

- **요청별** (기본): 프롬프트 하나부터 답변이 끝날 때까지를 카드 한 장으로 보여줍니다. 걸린 시간, 결과, 툴 개수, 수정한 파일, 토큰을 담고 있습니다. 색 막대는 시간 분배로, 방별 작업 시간과 승인 대기, 생각하는 시간을 나눠 보여줍니다. 카드를 누르면 실행 순서까지 자세히 나옵니다.
- **시간별**: 툴 실행을 시간순 블록으로 보여줍니다. 1분 / 5분 / 15분 / 1시간 범위를 고를 수 있습니다.

### 토큰 분석

에이전트 루프나 하네스를 다듬을 때 어디서 토큰이 새는지 찾는 용도입니다. 타임라인의 **토큰 분석** 버튼이나 트레이너 우클릭으로 엽니다.

- 지금 컨텍스트가 무엇으로 채워져 있는지 (툴 결과, Claude 출력, 주입된 리마인더 / 훅 등)
- 매 응답마다 깔리는 기본 컨텍스트 (시스템 프롬프트, 기본 툴 정의, MCP 서버별 툴 정의, CLAUDE.md / 메모리)
- 많이 쓴 곳 TOP 10: 들어온 크기와 이후 다시 읽힌 양. 큰 툴 결과는 이후 응답마다 다시 읽히기 때문에 실제 비용은 이쪽이 더 큽니다.
- 같은 입력으로 반복된 툴 호출, 캐시를 다시 만든 시점, 서브에이전트별 사용량, 툴 정의 크기
- 위 결과로 만든 줄일 수 있는 곳 제안

대화 기록(`~/.claude/projects`)에 남은 응답별 컨텍스트 크기를 읽어서, 늘어난 양을 그 사이에 들어온 내용에 나눠 붙입니다. 근사치이지만 어떤 작업이 컨텍스트를 키웠는지 찾기에는 충분합니다.

## 포켓몬 바꾸기

처음에는 추천 포켓몬으로 시작합니다. **내 파티**에서 **변경**을 누르면 도감이 열리고, 이름(한국어 / 영어)이나 번호로 검색해서 고를 수 있습니다. 이로치도 됩니다. 고른 포켓몬은 브라우저에 저장되고, **오리지널 몬스터로 바꾸기**로 기본 몬스터로 돌아갈 수 있습니다.

| 역할 | 방 | 추천 |
| --- | --- | --- |
| Read | 리서치실 | 후딘 #65 |
| Grep / Glob | 리서치실 | 디그다 #50 |
| Edit / Write | 개발실 | 루브도 #235 |
| 테스트 / 빌드 | 테스트실 | 코일 #81 |
| Bash | 터미널실 | 폴리곤 #137 |
| WebSearch / WebFetch | 터미널실 | 딜리버드 #225 |
| MCP 도구 | 터미널실 | 로토무 #479 |
| 서브에이전트 | 기획실 | 메타몽 #132 |

## Claude Code 연결

`npm run hooks`가 `~/.claude/settings.json`에 훅 9개를 추가합니다. 기존 설정은 그대로 두고 합치며, 바꾸기 전에 백업을 만듭니다. 폴더를 옮겼다면 다시 실행하고, 빼려면 `npm run hooks:remove`를 실행합니다.

훅은 이벤트를 서버로 보내고 바로 끝납니다. 서버가 꺼져 있어도 Claude Code는 평소대로 동작합니다. Esc 중단, recap, 토큰 사용량처럼 훅으로 오지 않는 정보는 서버가 대화 기록 파일에서 읽습니다.

<details><summary>직접 설정하기</summary>

`/절대경로/poke-office`를 실제 경로로 바꿔서 `~/.claude/settings.json`에 넣습니다.

```json
{
  "hooks": {
    "SessionStart":       [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "UserPromptSubmit":   [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "PreToolUse":         [{ "matcher": "", "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "PostToolUse":        [{ "matcher": "", "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "PostToolUseFailure": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "Notification":       [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "SubagentStop":       [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "Stop":               [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }],
    "SessionEnd":         [{ "hooks": [{ "type": "command", "command": "node /절대경로/poke-office/hook.mjs" }] }]
  }
}
```
</details>

## 사용 한도 HP 바 켜기

오른쪽 위 HP 바는 Claude Code가 상태줄(statusLine)에만 넘겨주는 사용량 정보를 씁니다. 그래서 상태줄 설정을 한 번 해 줘야 보입니다. Pro / Max 구독에서만 나오는 정보이고, 세션에서 첫 응답을 받은 뒤부터 채워집니다.

**상태줄을 따로 쓰고 있지 않다면** `~/.claude/settings.json`에 아래를 추가합니다. 상태줄에는 모델 이름과 남은 사용량이 짧게 나옵니다.

```json
"statusLine": {
  "type": "command",
  "command": "node /절대경로/poke-office/scripts/statusline.mjs"
}
```

**이미 쓰는 상태줄 스크립트가 있다면** 그 스크립트가 받은 입력을 `--save-only`로 넘겨 주기만 하면 됩니다. 아무것도 출력하지 않아서 기존 상태줄은 그대로입니다.

```bash
# bash
input=$(cat)
echo "$input" | node /절대경로/poke-office/scripts/statusline.mjs --save-only
```

```powershell
# PowerShell
$raw = [Console]::In.ReadToEnd()
$raw | node /절대경로/poke-office/scripts/statusline.mjs --save-only
```

설정 후 Claude Code를 다시 실행하고 한 번 대화하면 HP 바가 나타납니다. 값은 `~/.claude/statusline-cache.json`에 저장됩니다.

## 문제 해결

```bash
npm run doctor
```

Node, git, 스프라이트, 서버, 훅 연결을 차례로 확인하고 고치는 방법을 알려줍니다.

- **변경 버튼이 회색**: `http://127.0.0.1:4321`로 열어야 합니다. `index.html`을 파일로 직접 열면 포켓몬을 바꿀 수 없습니다.
- **HP 바가 안 보임**: 상태줄 설정이 필요합니다. 설정했다면 Claude Code에서 한 번 대화한 뒤 `~/.claude/statusline-cache.json`이 생겼는지 확인합니다.
- **스프라이트가 없음**: `npm run setup`으로 다시 받습니다. macOS에서 git이 없다면 `xcode-select --install`을 먼저 실행합니다.

## 구조

```
index.html                    화면 (Canvas, 의존성 없음)
server.mjs                    로컬 서버, 대화 기록 감시, API
tokens.mjs                    토큰 분석
hook.mjs                      Claude Code 훅 → 서버로 이벤트 전송
scripts/setup-sprites.mjs     PokeAPI 스프라이트 다운로드
scripts/install-hooks.mjs     훅 추가 / 제거
scripts/doctor.mjs            설치 / 연결 진단
scripts/install-shortcut.mjs  바탕화면 아이콘
scripts/statusline.mjs        상태줄 스크립트 (HP 바용 사용량 저장)
scripts/start.cmd             아이콘 실행 파일 (업데이트 → 서버 → 브라우저)
install.cmd                   Windows 설치
vendor/                       받은 스프라이트 (git 제외)
```

서버는 `127.0.0.1`에서만 열립니다. 포트는 `POKE_OFFICE_PORT`로 바꿀 수 있습니다.

## 저작권

- 포켓몬 스프라이트와 이름의 권리는 Nintendo / Game Freak / The Pokémon Company에 있습니다. 이 저장소에는 포켓몬 이미지가 없고, 설치할 때 [PokeAPI/sprites](https://github.com/PokeAPI/sprites)에서 각자의 PC로 받습니다.
- 개인 용도로만 쓰고, 포켓몬 스프라이트가 나오는 화면을 녹화해 공개하거나 재배포하지 마세요.
- 이 프로젝트는 Nintendo, Game Freak, The Pokémon Company와 관계가 없습니다.
- 기본 몬스터, 트레이너, 사무실 그림과 코드는 MIT License입니다.

## 참고

- [pixel-agents](https://github.com/pablodelucca/pixel-agents): Claude Code 에이전트를 픽셀 오피스로 보여주는 VS Code 확장. 이 프로젝트의 출발점입니다.
- [Claude Code hooks 문서](https://code.claude.com/docs/en/hooks)
