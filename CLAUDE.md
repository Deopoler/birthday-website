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
- 작업자 명령(`agy`, `codex`)이 이 PC에 없으면(`command -v <이름>`으로 확인) 설치되어 있지 않은 것이다. 그때는 `claude`로 띄운 Claude 작업자가 대신하고, 나에게 어떤 작업자가 없어서 대체했는지 알린다.
- 절차:
  1. 작업마다 `git worktree add ../<repo>-<작업명> -b <작업명>`으로 폴더를 나눈다.
  2. `hc run --bg --name <작업명> --cwd <그 폴더> <작업자 명령> "<구체적인 지시>"`를 실행한다. 긴 지시는 파일에 쓰고 `"$(cat 지시.txt)"`로 넘긴다.
     지시에는 목표, 건드릴 파일 범위, 완료 조건, 검증 방법, push/배포 여부를 넣고, 끝에 항상 "끝나면 hc send $HC_TERMINAL_ID '<요약>'"을 붙인다.
  3. `hc label`로 작업명을 붙인다.
  4. `hc wait --children any`로 기다리고, 끝난 터미널은 `hc read`로 결과를 읽는다.
  5. 막혀 있으면 `hc send`로 답하되, 판단이 필요한 질문은 나에게 넘긴다. 작업자의 권한 질문 화면에는 대신 답하지 않고 나에게 알린다.
  6. 끝난 터미널은 `hc kill` 후 `hc rm`으로 정리한다.
- 모든 작업(요청)은 위 방식으로 작업자에게 맡기고, 메인은 곧바로 다음 요청을 받을 수 있게 비워 둔다. 파일을 바꾸지 않는 아주 사소한 질문은 메인에서 바로 답해도 된다.
- 동시에 띄우는 작업자는 최대 3개. 같은 파일을 만지는 요청은 앞 작업이 끝난 뒤에 시작하거나 같은 작업자에 `hc send`로 이어서 시킨다.
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
