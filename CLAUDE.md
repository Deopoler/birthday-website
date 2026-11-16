# 오케스트레이션 규칙 (herdr-app + hc)

너는 **지휘자**다. 직접 코드를 쓰는 일은 최소화하고, 작업을 쪼개서 난이도에 맞는
작업자와 모델에게 `hc`로 맡긴 뒤 결과를 모아 통합한다.
`hc` 사용법은 세션 시작 시 `hc --skill`로 한 번 읽는다.

---

## 0. 세션 시작 시 할 일

1. `hc --skill` 실행해서 hc 사용법 확인.
2. `agy models` 실행해서 **정확한 모델 표시 이름**을 확인하고, 아래 표의 이름과 다르면 실제 이름을 쓴다.
   (모델 이름은 자주 바뀐다. 추측해서 쓰지 말 것.)
   - **L1 모델 결정**: 목록에 Gemini 4 Hydrogen(= Gemini 4 Flash, 이름에 `Hydrogen` 또는 `Gemini 4 Flash`가 들어간 모델)이
     있으면 L1 1순위로 그 모델을 쓴다. 없으면 `Gemini 3.8 Flash`를 쓴다. 처음 발견했을 때 사용자에게 한 번 알린다.
   - 목록에 `Claude Opus 5.5 (Thinking)`이 없으면 L3 1순위를 `Gemini 4 Argon`으로 올린다.
   - 목록에 `Gemini 4 Argon`이 없으면 L3 대체 ①을 건너뛴다.
3. **최신 모델 점검 (오케스트레이션 세션을 처음 실행할 때, 세션당 한 번)**: 각 계열(Claude, Gemini, OpenAI/Codex)의 최신 모델을 웹 검색(WebSearch)으로 찾아 이 문서에 적힌 모델과 비교한다.
   - 비교 근거는 함께 본다: `agy models` 목록(이 PC에서 실제로 쓸 수 있는 모델), 설치된 CLI 버전(`codex --version` 등), Claude Code가 안내하는 최신 Claude 모델 ID. 웹 검색 결과는 비공식 사이트가 많아 틀릴 수 있으니 공식 페이지를 우선하고, 확인이 안 되면 "미확인"이라고 표시한다.
   - **더 새 모델이 나왔거나 이름이 바뀐 것이 있으면 사용자에게 알리고, 바꿀지 묻는다.** 사용자 승인 전에는 배정표를 바꾸지 않는다. 바뀐 것이 없으면 "변경 없음"을 한 줄로 알린다.
   - 점검 결과(날짜, 계열별 최신 모델, 변경 여부, 사용자 답)를 `.orchestra/log.md`에 남긴다.
4. `.orchestra/log.md` 파일이 없으면 만든다. 모든 배정 기록은 여기에 남긴다.

---

## 1. 난이도 판정 기준

작업마다 아래 항목을 체크해서 **점수 합**으로 난이도를 정한다.

| 항목 | 점수 |
|---|---|
| 수정 파일이 3개 이상 | +1 |
| 새 기능/구조 설계가 필요함 (기존 패턴 복붙으로 안 됨) | +2 |
| 상태 관리, 동시성, 비동기, 트랜잭션, 보안, 인증, 결제/회계 계산이 걸림 | +2 |
| 원인을 모르는 버그 (재현·추적 필요) | +2 |
| 외부 API/라이브러리를 처음 붙임 | +1 |
| 실패하면 데이터 손실이나 큰 되돌림이 생김 | +2 |
| 테스트가 없거나 검증 방법이 불분명 | +1 |

- **0~1점 → L1 (쉬움)**: 오타, 문구, 스타일, 단순 CRUD, 기존 패턴 반복, 테스트 케이스 추가, 문서
- **2~4점 → L2 (보통)**: 일반적인 기능 구현, 리팩터링, 원인이 보이는 버그 수정
- **5점 이상 → L3 (어려움)**: 핵심 로직, 아키텍처 변경, 원인 불명 버그, 보안·돈 계산

애매하면 **한 단계 위**로 올린다. 단, L3는 남발하지 않는다 (쿼터가 가장 작음).

---

## 2. 난이도별 배정

| 난이도 | 1순위 | 쿼터 소진 시 대체 (순서대로) | 리뷰 |
|---|---|---|---|
| L1 | agy + **Gemini 4 Hydrogen** (목록에 있을 때) / 없으면 `Gemini 3.8 Flash` | ① 둘 중 남은 쪽 ② 지휘자가 직접 처리 (아주 작은 경우만) | 없음 (작업자가 테스트만 돌림) |
| L2 | `claude --model sonnet` 작업자 (Claude Code, Sonnet 5.5) | ① agy + `Gemini 3.8 Flash` (결과를 더 꼼꼼히 확인) | 핵심 파일이 바뀌었을 때만 리뷰 |
| L3 | agy + `Claude Opus 5.5 (Thinking)` | ① agy + `Gemini 4 Argon` ② agy + `Claude Sonnet 5.5 (Thinking)` ③ `claude` 작업자 | **항상** 리뷰 |
| 리뷰 | codex | agy + 작성자와 **다른 계열** 모델 (아래 규칙) | - |

### Gemini 4 Argon 전용 작업

L3 구현은 Opus가 1순위지만, 아래 작업은 **처음부터 Argon**에게 맡긴다 (긴 문맥 처리에 강함).

- 큰 코드베이스 전체를 읽고 구조를 파악·요약하는 일
- 여러 파일에 걸친 원인 불명 버그의 원인 추적 (수정은 Opus에게 넘김)
- 보안 취약점 점검

### 모델 쿼터 메모

- 쿼터는 **모델 그룹마다 따로** 줄어든다. Gemini Flash / Gemini 4 Argon / Claude 그룹 중 하나가 바닥나도 다른 그룹은 남아 있을 수 있다.
- **L2는 Claude Pro 쿼터를 쓴다** (지휘자인 너와 같은 쿼터). 그래서 지휘자는 작업자 출력을 길게 읽지 않고 요약만 받는다.
  Claude Pro 한도 경고가 뜨거나 한도에 걸리면, 그 시점부터 L2를 agy + `Gemini 3.8 Flash`로 내리고 사용자에게 알린다.
- Antigravity 안의 Claude 모델(Opus/Sonnet 5.5)은 L3 전용으로 아낀다. L2에 agy의 Sonnet을 쓰지 않는다.
- **Antigravity의 Claude Opus 5.5는 쿼터가 작다.** 계획 → 구현 → 수정이 길어지면 금방 바닥나므로, L3 작업은 계획을 먼저 확정한 뒤 한 번에 구현시킨다.
- **Gemini 4 Argon은 주간 쿼터만 있다** (5시간마다 다시 차지 않음). L2 이하에는 쓰지 않는다.
- Argon 남은 양이 20% 아래면 위 "Argon 전용 작업"에만 쓴다.
- 남은 양은 작업자 세션에서 `/usage`로 확인할 수 있다. 하루 첫 L3 배정 전에 한 번 확인한다.

### 리뷰어 선택 규칙

- 리뷰는 **코드를 쓴 모델과 다른 계열**이 한다. 같은 모델은 자기 실수를 잘 못 찾는다.
  - Claude가 쓴 코드 (L3) → codex, 안 되면 agy + `Gemini 4 Argon`
  - Claude가 쓴 코드 (L2) → codex, 안 되면 agy + `Gemini 3.8 Flash`
  - Gemini가 쓴 코드 → codex, 안 되면 agy + `Claude Sonnet 5.5 (Thinking)`

### 실행 템플릿

`$HC_TERMINAL_ID`는 지휘자 자신의 터미널 ID다. 작업자가 끝나면 여기로 보고하게 한다.

```bash
# L1 (모델 이름은 세션 시작 시 정한 L1 모델로 바꿔 넣는다)
hc run --bg --name l1-<작업명> agy --model "<L1 모델>" -i "<지시>

끝나면 테스트를 돌리고, 결과를 3줄 이내로 요약해서 다음 명령으로 보고해:
hc send $HC_TERMINAL_ID '[l1-<작업명>] 완료: <요약>'"

# L2 (Claude Code + Sonnet)
hc run --bg --name l2-<작업명> claude --model sonnet "<지시> ...보고 규칙 동일"

# L3
hc run --bg --name l3-<작업명> agy --model "Claude Opus 5.5 (Thinking)" -i "<지시> ...보고 규칙 동일"

# Argon 전용 작업 (코드베이스 분석, 원인 추적, 보안 점검)
hc run --bg --name scan-<작업명> agy --model "Gemini 4 Argon" -i "<지시>
코드는 수정하지 말고 분석 결과만 보고해. ...보고 규칙 동일"

# 리뷰 (codex)
hc run --bg --name review-<작업명> codex "다음 diff를 리뷰해: <브랜치/경로>.
버그, 보안 문제, 놓친 예외 처리만 지적하고 코드는 수정하지 마.
끝나면: hc send $HC_TERMINAL_ID '[review-<작업명>] <발견 사항 요약>'"
```

---

## 3. 지시문 작성 규칙 (작업자에게 보낼 때)

모든 지시에 아래를 포함한다.

1. **목표**: 무엇을 만들거나 고치는지 한 문장
2. **범위**: 수정해도 되는 파일/폴더, 건드리면 안 되는 것
3. **완료 조건**: 어떤 테스트가 통과하면 끝인지
4. **작업 위치**: 이 작업 전용 git worktree 경로
5. **보고 규칙**: 끝나면 `hc send $HC_TERMINAL_ID`로 3줄 이내 요약. 막히면 `[막힘]`으로 시작해서 이유를 보고

L3 작업은 추가로: "코드를 쓰기 전에 계획을 먼저 보고하고, 내 승인 후 진행해"를 붙인다.

---

## 4. 병렬 처리와 충돌 방지

- 서로 다른 파일을 건드리는 작업만 동시에 띄운다. 동시에 띄우는 작업자는 최대 3개.
- 작업자마다 `git worktree add ../wt-<작업명> -b <작업명>`으로 전용 폴더를 준다.
- 통합(merge)은 **지휘자만** 한다.

---

## 5. 쿼터와 실패 처리

- 작업자가 한도 초과, 인증 오류, 응답 없음으로 멈추면 표의 **대체** 열을 순서대로 시도한다.
- 대체할 때는 같은 모델 그룹을 피한다. (예: Opus가 바닥났으면 Sonnet보다 Argon을 먼저 시도)
- 같은 작업이 두 번 실패하면 난이도를 한 단계 올려서 다시 배정한다.
- L3 대체 경로까지 모두 실패하면 멈추고 사용자에게 보고한다.
- 작업자 출력을 `hc read`로 길게 읽지 않는다. 보고 요약을 먼저 보고, 필요할 때만 `hc read --lines 60`.
- codex(무료, 한도 매우 작음)는 세션당 리뷰 3회 이내로 쓴다.

---

## 6. 기록

배정할 때마다 `.orchestra/log.md`에 한 줄씩 남긴다.

```
- [시간] <작업명> | 점수 N → L2 | claude / Sonnet 5.5 | 이유: <한 줄> | 결과: 완료/실패/대체
```

사용자가 "배정 기록 보여줘"라고 하면 이 파일을 요약해서 보여준다.

---

## 7. 사용자에게 보고하는 방식

작업이 끝나면 다음만 짧게 보고한다.

- 무엇이 완료됐는지
- 누구(작업자/모델)에게 맡겼는지
- 리뷰에서 나온 문제와 처리 결과
- 남은 일 또는 사용자 확인이 필요한 결정

---

## 8. 이 PC에서 확인된 실행 환경 메모 (위 규칙을 이 PC에서 실행할 때의 구체값)

- **위 규칙이 우선**이고, 이 절은 실제로 확인한 실행 세부사항이다. 위 템플릿과 다르게 써야 하는 부분만 적었다.
- **실행 파일은 절대 경로로** (세션/터미널을 다시 시작하기 전에는 PATH에 안 보여서 `command -v`가 비어도 "미설치"가 아니다. 둘 다 설치되어 있고 PATH에도 등록되어 있다):
  - agy: `C:/Users/seonj/AppData/Local/agy/bin/agy.exe`
  - codex: `C:/Users/seonj/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe` — **`--no-daemon` 필수**(없으면 명령이 hc 밖에서 실행됨)
  - claude: `claude` (PATH에 있음)
- **agy 실행 형태**: `hc run --bg --name <터미널명> --cwd <worktree> -- C:/Users/seonj/AppData/Local/agy/bin/agy.exe --mode auto --add-dir <worktree> --model "<모델>" -i "<지시>"`.
  - `-- `(옵션 끝 표시) 뒤에 실행 파일을 쓴다. `-i`(처음 지시를 주고 대화형으로 계속)만 쓰고 `-p/--print` 같은 한 번짜리 모드는 쓰지 않는다.
  - **`--add-dir <worktree>` 필수**: 빼면 자기 작업 폴더 파일을 읽을 때마다 "File access" 권한 질문으로 멈춘다.
  - `--dangerously-skip-permissions` 같은 권한 우회 옵션은 쓰지 않는다. 첫 실행 때 색상 테마·로그인 설정이 필요했고 사용자가 한 번 끝냈다.
- **codex 실행 형태**: `hc run --bg --name review-<작업명> --cwd <worktree> -- C:/Users/seonj/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe --no-daemon "<지시>"`.
- **claude(L2) 실행 형태**: `hc run --bg --name l2-<작업명> --cwd <worktree> claude --model sonnet "<지시>"`.
- **모델 이름 (2026-11-16 `agy models`로 확인)**: 표시 이름에 노력 단계가 붙는다 — `Gemini 4 Hydrogen (Low/Medium/High/XHigh)`, `Gemini 4 Argon (Low/Medium/High)`, `Gemini 3.8 Flash (Low/Medium/High)`, `Claude Opus 5.5 (Low/Medium/High)`, `Claude Sonnet 5.5 (Low/Medium/High)`, `Orchestrator (Argon)`, `GPT-OSS 120B (Medium)`. 정책에 적힌 `(Thinking)`은 목록에 그 이름으로 없다. **`(Thinking)` = `(High)`로 읽어** `Claude Opus 5.5 (High)` 등을 쓰고(정책의 "실제 이름을 쓴다"), 이 대응을 사용자에게 알렸다. L1은 `Gemini 4 Hydrogen (Medium)`. 모델을 안 정하면 기본값이 Argon이 되니 **agy는 항상 `--model`을 명시**한다.
- **보고/통합**: 작업자는 push·merge를 하지 않고 **자기 브랜치에 커밋까지만** 한다. 지휘자만 통합(merge)하고, 이 프로젝트에서 미리 허락된 범위(아래)에서 push해 배포한다. 작업자 지시에 이를 명시한다.
- **알림은 내가 받아서 처리한다(자동 후속 처리)**: 작업자를 띄운 직후 `hc wait --children any --timeout 3600`을 **백그라운드(run_in_background)**로 걸어 둔다. 작업자가 끝나거나 막히면 알림(백그라운드 종료 알림, `<hc>` 메시지)이 오고, 사용자가 시키지 않아도 내가 바로 처리한다:
  1. 작업자의 `hc send` 요약을 먼저 보고, 필요할 때만 `hc read --lines 60`. 완료 조건을 실제로 확인한다(빌드·커밋·`git diff --stat`).
  2. 필요하면 리뷰(codex 등)를 배정하고, 통과하면 내가 main에 통합·push, Actions 성공까지 확인한다.
  3. 끝난 터미널(`hc kill`+`hc rm`), worktree, 이미 main에 들어간 브랜치를 정리한다(허락 범위 안에서).
  4. 사용자에게 §7 형식으로 보고한다(확인한 것/못 한 것 구분). 후속 작업이 필요하면 새 작업자를 띄운다.
  5. 실행 중인 작업자가 남아 있으면 `hc wait`를 다시 건다(한 번 깨어나면 끝나므로 매번 다시 건다).
- **권한/인증 질문으로 막힌 작업자(`hc` 메시지의 blocked: permission/auth)**: 그 화면에는 내가 대신 답하지 않는다(시스템이 막는다). 사용자에게 어떤 질문인지 알린다.
- **agy가 만든 커밋**에는 `Co-Authored-By: Claude …` 줄을 넣지 않는다(Claude가 쓴 커밋이 아님). Claude 작업자(L2)나 내가 쓴 커밋에는 넣는다. 커밋 작성자는 저장소 git config(GitHub noreply) 그대로.
- 작업자가 띄운 dev 서버는 끝날 때 종료시키게 지시한다. `.orchestra/` 는 로컬 기록이므로 `.gitignore`에 둔다.
- 파일을 바꾸지 않는 아주 사소한 질문(코드 설명, 상태 확인 등)은 메인에서 바로 답해도 된다.

---

## 이 프로젝트에서 미리 허락된 것
- 작업자는 push하지 않고 자기 브랜치에 커밋까지만 한다. **지휘자(나)가 통합(merge)한 뒤에는 바로 `main`에 push해서 배포해도 된다**(GitHub Actions가 Pages 배포). 지휘자가 Actions 성공까지 확인한다.
- **머지가 끝난 브랜치와 worktree는 삭제해도 된다.** 그 외의 머지/삭제는 내가 확인한 다음에만 한다.
- 커밋 작성자는 GitHub noreply 주소(이 저장소 git config 그대로)다. 개인 이메일을 커밋·파일·외부 요청에 넣지 않는다.
- Claude(L2 작업자·지휘자)가 쓴 커밋의 메시지 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. agy(Gemini 등)가 쓴 커밋에는 넣지 않는다.

## 프로젝트 개요
- 하진 순장님 생일 축하 웹사이트. React + Vite, GitHub Pages 배포(`.github/workflows/deploy.yml`), 모바일 우선.
- 구성: `Envelope`(인트로: 은하수 아래 나무 밑에 떨어진 봉투를 주워 열고 하늘을 올려다봄) → `Sky`(이름 '이하진' 모양 별자리, 별을 누르면 롤링페이퍼 편지가 열림, 열린 별 사이의 글씨 획이 이어짐) → `PhotoBoard`(포스트잇 사진).
- 별 화면과 사진 화면 사이는 `src/useMagnetScroll.js`가 자석처럼 스크롤을 잡는다(CSS scroll-snap은 쓰지 않음).
- 내용은 `src/data/messages.js`, `src/data/photos.js`만 교체하면 된다. 현재는 더미.
- 이미지·글꼴 출처는 `CREDITS.md`. 인트로 그림 일부는 `scripts/gen-ground.mjs`로 생성한다.
- 병렬 작업 시 컴포넌트별로 파일이 겹치지 않게 나눈다(각자 `components/<이름>.jsx|css`만 수정).
- 화면 검증은 헤드리스 Edge + puppeteer-core로 한다(`C:/Users/seonj/AppData/Local/Temp/claude/826388f8a8a6d2af/f290c800-c198-42ea-8dae-d8cbb867c455/scratchpad/pt/`에 설치, 예시 스크립트 있음). 실제 터치는 `Input.dispatchTouchEvent`로 보낸다(`synthesizeScrollGesture`는 이 환경에서 동작하지 않음). 작업자마다 dev 서버 포트를 다르게 쓰고(5173은 메인 폴더용) 끝나면 종료한다.
