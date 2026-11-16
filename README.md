# 하진 순장님 생일 축하 사이트 🎂

봉투를 열면 밤하늘에 '이하진' 모양 별자리가 나타나고, 별을 누르면 친구들의 롤링페이퍼 편지가 열려요. 아래로 내리면 포스트잇 사진판이 나와요. 휴대폰 화면에 맞춰 만들었어요.

- 주소: https://deopoler.github.io/birthday-website/
- 내용(메시지·사진)은 아래 두 파일만 바꾸면 돼요. 지금은 더미(가짜) 내용이에요.

## 1. 메시지 바꾸기 — `src/data/messages.js`

파일 전체를 아래처럼 바꿔 쓰세요. `id`는 0부터 차례로, `from`은 보내는 사람, `text`는 편지 내용이에요.

```js
export const messages = [
  { id: 0, from: '민수', text: '순장님, 생일 축하드려요! 항상 감사해요.' },
  { id: 1, from: '지연', text: '오늘 하루 제일 행복하세요 🎂' },
  // ... 같은 모양으로 계속
]
```

**메시지는 정확히 30개**로 맞추세요. 이름 '이하진' 모양 별이 30개예요.

- 30개 미만: 메시지 수만큼만 별이 켜져요. 나머지 자리는 비고 글씨 획 일부가 완성되지 않으며, 카운터가 `★ 0 / 25`처럼 그 개수로 보여요.
- 30개 초과: 31번째부터는 화면에 나오지 않아요(무시돼요).

## 2. 사진 바꾸기 — `public/photos/` + `src/data/photos.js`

1. 사진을 `public/photos/` 폴더에 넣어요(폴더는 이미 만들어져 있어요). 파일명은 영문·숫자만, 예: `01.jpg`, `02.jpg`.
2. `src/data/photos.js`를 아래처럼 바꿔요. `src`는 `./photos/파일명`, `color`는 사진이 뜨기 전 잠깐 보이는 배경색이에요.

```js
export const photos = [
  { id: 0, src: './photos/01.jpg', color: '#f9c6d0' },
  { id: 1, src: './photos/02.jpg', color: '#c6e2f9' },
]
```

사진 개수 제한은 없어요(지금 더미는 12장).

**사진은 긴 변 1200px 이하, 500KB 이하로 줄여서 넣으세요.** 줄이지 않으면 사진판이 열릴 때 원본 크기 그대로 전부 내려받아 휴대폰에서 느려져요. 줄이는 쉬운 방법: 윈도우 '사진' 앱에서 열기 → 크기 조정, 또는 [Squoosh](https://squoosh.app) 같은 온라인 도구.

## 3. 반영하기

- 내 컴퓨터에서 미리보기: `npm install` 한 번 → `npm run dev` → 터미널에 나온 주소 열기.
- 사이트에 올리기: 파일을 고치고 `git add .` → `git commit -m "내용 교체"` → `git push` (`main` 브랜치). GitHub Actions가 자동으로 배포하고 1~2분 뒤 주소에 반영돼요.

## 4. 주의: 메시지가 소스에 그대로 보여요

저장소가 public이라 `messages.js`의 메시지를 누구나 볼 수 있어요. 생일 당일까지 숨기려면 더미로 두었다가 **당일에 진짜 내용으로 바꿔서 push**하는 게 가장 간단해요.

## 5. 링크 공유 미리보기·출처

- 카카오톡 등에 링크를 보냈을 때 뜨는 제목·설명은 `index.html`의 `<meta>` 태그(`og:title`, `og:description`, `description`)에서, 이미지는 `public/og-image.jpg`(1200x630, 300KB 이하 권장)에서 바꿔요. 바꾼 뒤에도 카카오톡은 예전 미리보기를 기억하니 [카카오 공유 디버거](https://developers.kakao.com/tool/clear/og)에서 캐시를 초기화하세요.
- 탭 아이콘은 `public/favicon.svg`, `public/apple-touch-icon.png`.
- 이미지·글꼴 출처는 [CREDITS.md](CREDITS.md).
