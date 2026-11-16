# 오케스트레이션 규칙 (전역 규칙 `~/.claude/CLAUDE.md`와 동일)
너는 지휘자다. 직접 코딩은 최소화하고, hc로 작업자를 띄워 맡긴다.
(hc 사용법은 `hc --skill`로 확인)

## 작업자와 선택 기준
- agy (Antigravity, Google AI Pro): 기본 작업자. 구현, 리팩터링, 테스트 작성 등 양이 많은 일.
- codex (ChatGPT Free, 한도 매우 작음): 최종 diff 리뷰, 버그 원인 추적 같은
  "짧지만 중요한" 일에만. 한 세션에 1~2번 이내.
- 너 자신 (Claude Pro): 계획, 작업 분배, 결과 통합, 아주 작은 수정만.

## 진행 규칙
- 독립적인 작업은 병렬로 띄우되, 작업자마다 git worktree를 따로 준다.
- 작업 지시 끝에 항상 붙인다: "끝나면 hc send $HC_TERMINAL_ID '<요약>'"
- 작업자가 한도 초과/에러로 멈추면 다른 작업자에게 넘기고 나에게 알린다.
- 어떤 작업을 누구에게 왜 맡겼는지 한 줄씩 기록한다.

## 실행 방법 (Herdr)
- 작업자는 **Herdr의 `hc run`**으로 띄운다. Claude Code의 Agent 도구(서브에이전트)로 대신하지 않는다.
- 처음 한 번 `herdr-app --skill`, `hc --skill`, `hc run --help`, `hc wait --help`를 읽고 작업자별 정확한 실행 명령·옵션을 확인한 뒤 사용한다.
- **작업자 실행 명령 (이 PC, 설치 확인됨)** — 터미널/세션을 다시 시작하기 전에는 PATH에 안 보일 수 있으니(`command -v`가 비어도 "없음"이 아님) **절대 경로**로 실행한다. 새 PATH가 필요하면 `[Environment]::GetEnvironmentVariable('Path','User'/'Machine')`로 확인한다.
  - agy: `hc run --bg --name <작업명> --cwd <worktree> -- C:/Users/seonj/AppData/Local/agy/bin/agy.exe --mode auto -i "<지시>"` (`-i` = 처음 지시를 주고 대화형으로 계속. `-p`/`--print` 같은 한 번짜리 모드는 쓰지 않는다.)
  - codex: `hc run --bg --name <작업명> --cwd <worktree> -- C:/Users/seonj/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe --no-daemon "<지시>"` (`--no-daemon` 필수: 없으면 명령이 hc 밖에서 실행됨.)
  - claude: `hc run --bg --name <작업명> --cwd <worktree> claude "<지시>"` (계획·통합용이 아니라 agy/codex가 한도·에러로 못 할 때의 대체 작업자.)
  - `--dangerously-skip-permissions` 같은 권한 우회 옵션은 쓰지 않는다. 권한 질문으로 막히면 사용자에게 알린다.
- **작업자 고르는 법 (지시를 만들기 전에 이 표를 다시 본다)**
  - 구현·리팩터링·테스트 작성·문서 정리처럼 **양이 많은 일 → agy** (기본값).
  - **최종 diff 리뷰, 버그 원인 추적**처럼 짧지만 중요한 일 → codex. 한도가 매우 작으니 한 세션에 1~2번. 구현 작업이 끝나 push하기 전/후의 마지막 점검에 쓰는 것이 기본 용도다.
  - 계획, 작업 분배, 결과 통합, 아주 작은 수정 → 나(메인).
  - agy/codex가 한도 초과·에러로 멈추면 다른 작업자(claude 포함)에게 넘기고 사용자에게 알린다.
  - 작업을 띄울 때마다 "무엇을 / 누구에게 / 왜" 한 줄을 사용자에게 알린다.
- agy가 만든 커밋에는 `Co-Authored-By: Claude …` 줄을 넣지 않는다(Claude가 쓴 커밋이 아니므로). 커밋 작성자는 저장소 git config(GitHub noreply) 그대로.
- 절차:
  1. 작업마다 `git worktree add ../<repo>-<작업명> -b <작업명>`으로 폴더를 나눈다.
  2. `hc run --bg --name <작업명> --cwd <그 폴더> <작업자 명령> "<구체적인 지시>"`를 실행한다. 긴 지시는 파일에 쓰고 `"$(cat 지시.txt)"`로 넘긴다.
     지시에는 목표, 건드릴 파일 범위, 완료 조건, 검증 방법, push/배포 여부를 넣고, 끝에 항상 "끝나면 hc send $HC_TERMINAL_ID '<요약>'"을 붙인다.
  3. `hc label`로 작업명을 붙인다.
  4. `hc wait --children any`로 기다리고, 끝난 터미널은 `hc read`로 결과를 읽는다.
  5. 막혀 있으면 `hc send`로 답하되, 판단이 필요한 질문은 나에게 넘긴다. 작업자의 권한 질문 화면에는 대신 답하지 않고 나에게 알린다.
  6. 끝난 터미널은 `hc kill` 후 `hc rm`으로 정리한다.
- 모든 작업(요청)은 위 방식으로 작업자에게 맡기고, 메인은 곧바로 다음 요청을 받을 수 있게 비워 둔다. 파일을 바꾸지 않는 아주 사소한 질문은 메인에서 바로 답해도 된다.
- **알림 받아서 내가 처리한다(자동 후속 처리)**: 작업자를 띄운 직후 `hc wait --children any --timeout 3600`을 **백그라운드(run_in_background)**로 걸어 둔다. 작업자가 끝나거나 막히면 그 알림(백그라운드 종료 알림, 또는 `<hc>` 메시지)이 내게 오므로, 사용자가 시키지 않아도 내가 바로 처리한다:
  1. `hc read`로 최종 보고를 읽고, 지시한 완료 조건을 실제로 확인한다(배포했다면 `gh run list`로 Actions 성공, `git log`로 커밋 확인).
  2. 이미 main에 들어간 작업자의 터미널(`hc kill`+`hc rm`), worktree, 브랜치는 정리한다(머지 후 삭제 허락 범위 안에서).
  3. 작업별로 요약해서 사용자에게 보고한다(확인한 것/못 한 것 구분). 사용자가 정해야 할 것은 질문으로 모은다.
  4. 후속 작업이 필요하면(실패, 추가 수정, 의존 작업) 새 작업자를 띄운다. 막힘(blocked)이 권한 질문이면 대신 답하지 않고 사용자에게 알린다.
  5. 아직 실행 중인 작업자가 남아 있으면 `hc wait`를 다시 걸어 둔다(한 번 깨어나면 끝나므로 매번 다시 건다).
- 동시에 띄우는 작업자는 최대 6개(3개에서 늘림). 같은 파일을 만지는 요청은 앞 작업이 끝난 뒤에 시작하거나 같은 작업자에 `hc send`로 이어서 시킨다.
- 결과는 작업별로 요약해서 보고한다(확인한 것과 못 한 것을 구분).

## 이 프로젝트에서 미리 허락된 것
- 수정이 끝나면 **바로 push해서 배포해도 된다**(`main`에 push → GitHub Actions가 Pages 배포). agent는 Actions 성공까지 확인한다.
- **머지가 끝난 브랜치와 worktree는 삭제해도 된다.** 그 외의 머지/삭제는 내가 확인한 다음에만 한다.
- 커밋 작성자는 GitHub noreply 주소(이 저장소 git config 그대로)다. 개인 이메일을 커밋·파일·외부 요청에 넣지 않는다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## 프로젝트 개요
- 하진 순장님 생일 축하 웹사이트. React + Vite, GitHub Pages 배포(`.github/workflows/deploy.yml`), 모바일 우선.
- 구성: `Envelope`(인트로: 은하수 아래 나무 밑에 떨어진 봉투를 주워 열고 하늘을 올려다봄) → `Sky`(이름 '이하진' 모양 별자리, 별을 누르면 롤링페이퍼 편지가 열림, 열린 별 사이의 글씨 획이 이어짐) → `PhotoBoard`(포스트잇 사진).
- 별 화면과 사진 화면 사이는 `src/useMagnetScroll.js`가 자석처럼 스크롤을 잡는다(CSS scroll-snap은 쓰지 않음).
- 내용은 `src/data/messages.js`, `src/data/photos.js`만 교체하면 된다. 현재는 더미.
- 이미지·글꼴 출처는 `CREDITS.md`. 인트로 그림 일부는 `scripts/gen-ground.mjs`로 생성한다.
- 병렬 작업 시 컴포넌트별로 파일이 겹치지 않게 나눈다(각자 `components/<이름>.jsx|css`만 수정).
- 화면 검증은 헤드리스 Edge + puppeteer-core로 한다(`C:/Users/seonj/AppData/Local/Temp/claude/826388f8a8a6d2af/f290c800-c198-42ea-8dae-d8cbb867c455/scratchpad/pt/`에 설치, 예시 스크립트 있음). 실제 터치는 `Input.dispatchTouchEvent`로 보낸다(`synthesizeScrollGesture`는 이 환경에서 동작하지 않음). agent마다 dev 서버 포트를 다르게 쓰고 끝나면 종료한다.
