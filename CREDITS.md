# 이미지·글꼴 출처

| 파일 | 설명 | 출처 / 라이선스 |
|---|---|---|
| `src/assets/tree-night.webp` | 인트로 배경: 은하수 아래 언덕 위의 나무 | 사진 "Milky Way with a lone tree silhouette" — Johannes Plenio, [Pexels](https://www.pexels.com/photo/3262249) (Pexels License: 무료 사용, 출처 표기 불필요). 휴대폰 세로 비율로 잘랐고, 나무에 기대어 선 사람 실루엣은 지웠다. |
| `src/assets/cake.webp` | 편지 안의 케이크 사진 | 사진 "Lighted Candles on an Elegant Looking Cake" — Marina Utrabo, [Pexels](https://www.pexels.com/photo/lighted-candles-on-an-elegant-looking-cake-1729808/) (Pexels License). 크기만 줄였다(900 x 600). |
| `src/assets/ground.svg` | 인트로 전경(풀/풀꽃/낙엽) | 직접 만듦 — `scripts/gen-ground.mjs` 로 생성 |
| (CSS) 봉투 | 종이·왁스 봉인·안감 무늬 | 직접 만듦 — `src/components/Envelope.css` |
| 손글씨 "To. 하진 순장님께" | 봉투 앞면 글씨 | [Nanum Pen Script](https://fonts.google.com/specimen/Nanum+Pen+Script) (SIL Open Font License) — Google Fonts에서 필요한 글자만 내려받는다(`index.html`). 글꼴이 안 불러와지면 기본 필기체로 보인다. |

사진을 바꾸려면 같은 이름으로 덮어쓰면 된다.
- 인트로 사진: 세로가 긴 비율(약 1000 x 1700)을 권장하고, 사진 맨 아랫줄은 어두운 색이어야 아래 풀밭과 자연스럽게 이어진다.
- 케이크 사진: 가로 3:2 비율이 편지 칸과 맞는다.
