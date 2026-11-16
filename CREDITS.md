# 이미지·글꼴 출처

| 파일 | 설명 | 출처 / 라이선스 |
|---|---|---|
| `src/assets/tree-night.webp` | 인트로 배경: 은하수 아래 언덕 위의 나무 (1546 x 2628, WebP q82) | 사진 "Milky Way with a lone tree silhouette" — Johannes Plenio, [Pexels](https://www.pexels.com/photo/3262249) (Pexels License: 무료 사용, 출처 표기 불필요). 원본(5840 x 3285)에서 휴대폰 세로 비율로 잘랐고(원본 해상도의 80%), 나무에 기대어 선 사람 실루엣은 지웠다. |
| `src/assets/sky-night.webp` | 별자리 하늘 배경 (1546 x 2319, WebP q82) | 위 인트로 사진과 **같은 사진**(Pexels, Johannes Plenio)에서 나무가 없는 하늘 부분만 잘라 위아래를 뒤집어 썼다. 그래서 인트로의 나무 사진과 별자리 하늘이 끊김 없이 이어진다. |
| `public/og-image.jpg` | 링크 공유 미리보기 이미지 (1200 x 630) | 위 `sky-night.webp`(Pexels, Johannes Plenio)를 어둡게 깔고 제목 글씨를 얹어 직접 만듦. 같은 모양의 `public/favicon.svg`, `public/apple-touch-icon.png`(별 아이콘)도 직접 만듦. |
| `src/assets/ground.svg` | 인트로 전경(풀/풀꽃/낙엽) | 직접 만듦 — `scripts/gen-ground.mjs` 로 생성 |
| (CSS) 봉투 | 종이·왁스 봉인·안감 무늬 | 직접 만듦 — `src/components/Envelope.css` |
| 손글씨 "To. 하진 순장님께" | 봉투 앞면 글씨 | [Nanum Pen Script](https://fonts.google.com/specimen/Nanum+Pen+Script) (SIL Open Font License) — Google Fonts에서 필요한 글자만 내려받는다(`index.html`). 글꼴이 안 불러와지면 기본 필기체로 보인다. |
| "HAPPY BIRTHDAY!" 글씨 | 편지 속 축하 문구 | [Pacifico](https://fonts.google.com/specimen/Pacifico) (SIL Open Font License) — 같은 방식으로 필요한 글자만 내려받는다. 케이크는 이모지(🎂)라 기기마다 모양이 조금 다르다. |

사진을 바꾸려면 같은 이름으로 덮어쓰면 된다.
- 인트로 사진: 세로가 긴 비율(약 1000 x 1700)을 권장하고, 사진 맨 아랫줄은 어두운 색이어야 아래 풀밭과 자연스럽게 이어진다.
- 하늘 사진: 세로가 긴 비율(약 1000 x 1500), 가장 어두운 쪽이 아래(첫 화면 사진과 맞닿는 쪽)에 오게 한다.
