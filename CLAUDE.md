# 하진 순장님 생일 축하 웹사이트

오케스트레이션 규칙은 전역 `~/.claude/CLAUDE.md`를 따른다.

## 이 프로젝트에서 미리 허락된 것
- 작업자는 push하지 않고 자기 브랜치에 커밋까지만 한다. **지휘자(나)가 통합(merge)한 뒤에는 바로 `main`에 push해서 배포해도 된다**(GitHub Actions가 Pages 배포). 지휘자가 Actions 성공까지 확인한다.
- **머지가 끝난 브랜치와 worktree는 삭제해도 된다.** 그 외의 머지/삭제는 내가 확인한 다음에만 한다.
- 커밋 작성자는 GitHub noreply 주소(이 저장소 git config 그대로)다. 개인 이메일을 커밋·파일·외부 요청에 넣지 않는다.
- Claude(L2 작업자·지휘자)가 쓴 커밋의 메시지 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. agy(Gemini 등)가 쓴 커밋에는 넣지 않는다.

## 프로젝트 개요
- 하진 순장님 생일 축하 웹사이트. React + Vite, GitHub Pages 배포(`.github/workflows/deploy.yml`), 모바일 우선.
- 구성: `Envelope`(인트로: 은하수 아래 나무 밑에 떨어진 봉투를 주워 열고 하늘을 올려다봄) → `Sky`(이름 '이하진' 모양 별자리, 별을 누르면 롤링페이퍼 편지가 열림, 열린 별 사이의 글씨 획이 이어짐) → `PhotoBoard`(포스트잇 사진).
- 별 화면과 사진 화면 사이는 `src/useMagnetScroll.js`가 자석처럼 스크롤을 잡는다(CSS scroll-snap은 쓰지 않음).
- 사진·메시지는 비공개 저장소 `Deopoler/birthday-content`(로컬 `content/`, git 무시)에서 빌드 때 가져온다. 비어 있으면 더미(`src/data/dummyPhotos.js`, `messages.js`)로 대체된다.
- **3D 버전이 기본**(`src/main.jsx`). 주소에 `?3d=0`을 붙이면 기존 2D 버전. `src/three/`에 있고 three.js로 그린다: `world.js`(카메라 연출: 풀밭 → 하늘 → 사진), `sky/ground/tree/envelope/constellation/photos/fireworks.js`(장면), `App3D.jsx`(글자·버튼·편지만 DOM). WebGL 불가·움직임 줄이기 설정이면 2D로 대체. `?skip`은 인트로 건너뛰기(검증용). 셰이더에서 음수를 `pow` 하지 말 것(NaN이 빛 번짐을 타고 화면 전체가 검어짐).
- 이미지·글꼴 출처는 `CREDITS.md`. 인트로 그림 일부는 `scripts/gen-ground.mjs`로 생성한다.
- 병렬 작업 시 컴포넌트별로 파일이 겹치지 않게 나눈다(각자 `components/<이름>.jsx|css`만 수정).
- 화면 검증은 헤드리스 Edge + puppeteer-core로 한다(`C:/Users/seonj/AppData/Local/Temp/claude/826388f8a8a6d2af/f290c800-c198-42ea-8dae-d8cbb867c455/scratchpad/pt/`에 설치, 예시 스크립트 있음). 실제 터치는 `Input.dispatchTouchEvent`로 보낸다(`synthesizeScrollGesture`는 이 환경에서 동작하지 않음). 작업자마다 dev 서버 포트를 다르게 쓰고(5173은 메인 폴더용) 끝나면 종료한다.
