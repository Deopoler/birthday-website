## Herdr 병렬 작업 규칙
- 처음 한 번 `herdr-app --skill`, `hc run --help`, `hc wait --help`를 읽고
  정확한 옵션을 확인한 뒤 사용한다.
- 서로 독립적인 하위 작업이 2개 이상이면:
  1. 작업마다 `git worktree add ../<repo>-<작업명> -b <작업명>`으로 폴더를 나눈다.
  2. `hc run`으로 그 폴더에서 `claude "<구체적인 지시>"`를 실행한다.
     지시에는 목표, 건드릴 파일 범위, 완료 조건을 꼭 넣는다.
  3. `hc label`로 작업명을 붙인다.
  4. `hc wait --children any`로 기다리고, 끝난 터미널은 `hc read`로 결과를 읽는다.
  5. 막혀 있으면 `hc send`로 답하되, 판단이 필요한 질문은 나에게 넘긴다.
- 동시에 띄우는 Claude는 최대 3개.
- 결과는 작업별로 요약해서 보고하고, 머지와 worktree 삭제는 내가 확인한 다음에만 한다.
- 끝난 터미널은 `hc rm`으로 정리한다.

## 프로젝트 개요
- 하진 순장님 생일 축하 웹사이트. React + Vite, GitHub Pages 배포(`.github/workflows/deploy.yml`), 모바일 우선.
- 구성: `Envelope`(초대장) → `Sky`(별 롤링페이퍼, 연 순서대로 선 연결) → `PhotoBoard`(포스트잇 사진).
- 내용은 `src/data/messages.js`, `src/data/photos.js`만 교체하면 된다. 현재는 더미.
- 병렬 작업 시 컴포넌트별로 파일이 겹치지 않게 나눈다(각자 `components/<이름>.jsx|css`만 수정).
