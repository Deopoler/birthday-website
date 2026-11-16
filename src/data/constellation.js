// '이하진' 글씨를 획(polyline)으로 정의하고, 그 위에 별을 배치한다. (좌표 정규화 0~1, x: 가로, y: 세로)
// - constellation: 클릭 가능한 메시지 별 30개 (획 위 주요 지점)
// - strokeSegments: 같은 획에서 인접한 두 메시지 별 사이의 선 구간 (둘 다 열리면 그려짐)
// - decorStars: 획을 따라 촘촘히 배치한 장식 별 (near = 가장 가까운 메시지 별 index)
export const CONSTELLATION_TEXT = '이하진'

const YK = 2.1 // 세로 화면 비율 보정(거리 계산용: 높이/너비)
const DECOR_STEP = 0.026

const ellipse = (cx, cy, rx, ry, n = 48) =>
  Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
  })

// 글자 3개를 세로로 쌓되, 글자 사이에 넉넉한 간격을 둔다(획이 이어져 보이지 않게).
// 각 글자는 0~1 단위 칸에 그리고, 칸은 화면의 (X0, 너비 W) x (TOP[i], 높이 LH) 영역이다.
// 폰(390x844) 기준 칸이 약 312 x 186px 이라 원은 rx:ry = 0.17:0.29 처럼 비율을 맞춘다.
const X0 = 0.1
const W = 0.8
const LH = 0.22
const TOP = [0.08, 0.41, 0.74] // 글자 사이 간격 0.11(약 93px)
const glyph = (idx, strokes) =>
  strokes.map((st) => ({
    ...st,
    pts: st.pts.map(([x, y]) => [X0 + x * W, TOP[idx] + y * LH]),
  }))

// pts: 획의 점들, n: 그 획 위 메시지 별 개수, closed: 닫힌 획(원). 메시지 별 합계 = 30
// 같은 자리에 별이 겹치지 않도록(ㅏ의 중간 별, ㅎ 꼭지/가로획 등) 획마다 별 위치를 정했다.
const STROKES = [
  // 이: ㅇ(5) + ㅣ(3) = 8
  ...glyph(0, [
    { pts: ellipse(0.32, 0.5, 0.17, 0.29), n: 5, closed: true },
    { pts: [[0.84, 0.0], [0.84, 1.0]], n: 3 },
  ]),
  // 하: ㅎ 꼭지(2) + 가로획(2) + 원(4) + ㅏ 세로(2) + ㅏ 짧은 획(2, 시작점이 세로획 중간 별) = 12
  ...glyph(1, [
    { pts: [[0.33, 0.0], [0.33, 0.16]], n: 2 },
    { pts: [[0.04, 0.3], [0.62, 0.3]], n: 2 },
    { pts: ellipse(0.33, 0.72, 0.14, 0.22), n: 4, closed: true },
    { pts: [[0.84, 0.0], [0.84, 1.0]], n: 2 },
    { pts: [[0.84, 0.5], [0.99, 0.5]], n: 2 },
  ]),
  // 진: ㅈ 가로획(2) + ㅅ(3, 꼭지가 가로획 가운데) + ㅣ(2) + ㄴ(3) = 10
  ...glyph(2, [
    { pts: [[0.04, 0.0], [0.6, 0.0]], n: 2 },
    { pts: [[0.04, 0.5], [0.32, 0.0], [0.6, 0.5]], n: 3 },
    { pts: [[0.84, 0.0], [0.84, 0.5]], n: 2 },
    { pts: [[0.2, 0.72], [0.2, 1.0], [0.88, 1.0]], n: 3 },
  ]),
]

const dist = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * YK)

function lengths(pts) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]))
  return cum
}

function pointAt(pts, cum, d) {
  for (let i = 1; i < pts.length; i++) {
    if (d <= cum[i] || i === pts.length - 1) {
      const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]
    }
  }
  return pts[0]
}

// 거리 d0~d1 구간의 하위 polyline
function slice(pts, cum, d0, d1) {
  const out = [pointAt(pts, cum, d0)]
  for (let i = 1; i < pts.length - 1; i++) if (cum[i] > d0 && cum[i] < d1) out.push(pts[i])
  out.push(pointAt(pts, cum, d1))
  return out
}

const stars = []
const segments = []
const decor = []

for (const s of STROKES) {
  // 닫힌 획은 시작점으로 되돌아오도록 첫 점을 끝에 추가
  const pts = s.closed ? [...s.pts, s.pts[0]] : s.pts
  const cum = lengths(pts)
  const total = cum[cum.length - 1]
  const ds = Array.from({ length: s.n }, (_, i) => (s.closed ? (i / s.n) * total : (i / (s.n - 1)) * total))
  const base = stars.length
  ds.forEach((d) => {
    const [x, y] = pointAt(pts, cum, d)
    stars.push({ x: +x.toFixed(4), y: +y.toFixed(4) })
  })
  for (let k = 0; k < s.n - 1; k++) segments.push({ a: base + k, b: base + k + 1, pts: slice(pts, cum, ds[k], ds[k + 1]) })
  if (s.closed) {
    const last = ds[s.n - 1]
    segments.push({ a: base + s.n - 1, b: base, pts: slice(pts, cum, last, total) })
  }
  const steps = Math.max(1, Math.round(total / DECOR_STEP))
  const upto = s.closed ? steps - 1 : steps
  for (let i = 0; i <= upto; i++) {
    const p = pointAt(pts, cum, (i / steps) * total)
    decor.push({ x: p[0], y: p[1], base, n: s.n })
  }
}

export const constellation = stars

export const strokeSegments = segments.map((sg) => ({
  a: sg.a,
  b: sg.b,
  d: 'M' + sg.pts.map(([x, y]) => `${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`).join('L'),
}))

export const decorStars = decor
  .map((p, id) => {
    let near = p.base
    let min = Infinity
    for (let k = 0; k < stars.length; k++) {
      const d = dist([p.x, p.y], [stars[k].x, stars[k].y])
      if (d < min) {
        min = d
        near = k
      }
    }
    return { id, x: +p.x.toFixed(4), y: +p.y.toFixed(4), near, skip: min < 0.018 }
  })
  .filter((p) => !p.skip)
