// '이하진' 글씨를 획(polyline)으로 정의하고, 그 위에 별을 배치한다. (좌표 정규화 0~1, x: 가로, y: 세로)
// - constellation: 클릭 가능한 메시지 별 30개 (획 위 주요 지점)
// - strokeSegments: 같은 획에서 인접한 두 메시지 별 사이의 선 구간 (둘 다 열리면 그려짐)
// - decorStars: 획을 따라 촘촘히 배치한 장식 별 (near = 가장 가까운 메시지 별 index)
// 배치는 두 가지: 세로 화면용(글자 3개를 세로로 쌓음)과, 가로로 누운 짧은 화면용(글자 3개를 가로로 나란히).
// 두 배치는 같은 획·같은 별 순서를 쓰고 글자 칸의 위치만 다르므로, 별 index 가 같아 열린 별 상태가 그대로 유지된다.
export const CONSTELLATION_TEXT = '이하진'

const ellipse = (cx, cy, rx, ry, n = 48) =>
  Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
  })

// pts: 획의 점들(글자 칸 안 0~1), n: 그 획 위 메시지 별 개수, closed: 닫힌 획(원). 메시지 별 합계 = 30
// 같은 자리에 별이 겹치지 않도록(ㅏ의 중간 별, ㅎ 꼭지/가로획 등) 획마다 별 위치를 정했다.
// 원은 칸의 가로/세로 픽셀이 거의 같으므로 rx : ry = 1 : 1.07 정도로 맞춘다.
const GLYPHS = [
  // 이: ㅇ(5) + ㅣ(3) = 8
  [
    { pts: ellipse(0.32, 0.5, 0.25, 0.27), n: 5, closed: true },
    { pts: [[0.82, 0.0], [0.82, 1.0]], n: 3 },
  ],
  // 하: ㅎ 꼭지(2) + 가로획(2) + 원(4) + ㅏ 세로(2) + ㅏ 짧은 획(2, 시작점이 세로획 중간 별) = 12
  [
    { pts: [[0.32, 0.0], [0.32, 0.18]], n: 2 },
    { pts: [[0.04, 0.32], [0.6, 0.32]], n: 2 },
    { pts: ellipse(0.32, 0.76, 0.18, 0.19), n: 4, closed: true },
    { pts: [[0.8, 0.0], [0.8, 1.0]], n: 2 },
    { pts: [[0.8, 0.5], [1.0, 0.5]], n: 2 },
  ],
  // 진: ㅈ 가로획(2) + ㅅ(3, 꼭지가 가로획 가운데) + ㅣ(2) + ㄴ(3) = 10
  [
    { pts: [[0.04, 0.0], [0.6, 0.0]], n: 2 },
    { pts: [[0.04, 0.5], [0.32, 0.0], [0.6, 0.5]], n: 3 },
    { pts: [[0.86, 0.0], [0.86, 0.5]], n: 2 },
    { pts: [[0.2, 0.74], [0.2, 1.0], [0.9, 1.0]], n: 3 },
  ],
]

// 세로 화면: 글자 칸을 정사각형에 가깝게(폰 390x844 기준 약 218 x 203px) 두고, 글자 사이에 획이 이어져 보이지 않을 만큼(약 67px) 간격을 둔다.
// 칸은 화면의 (X0, 너비 W) x (TOP[i], 높이 LH) 영역.
const PORTRAIT = {
  yk: 2.1, // 별 영역 높이/너비(거리 계산용)
  decorStep: 0.026, // 장식 별 간격(너비 대비 ≈ 10px)
  decorSkip: 0.018,
  cell: (idx) => ({ x0: 0.22, w: 0.56, y0: [0.075, 0.395, 0.715][idx], h: 0.24 }),
}

// 가로 화면(짧은 높이: 844x390, 932x430, 667x375 …): 별 영역이 높이의 약 2.1배 폭으로 고정(Sky.css)되어 있다고 보고,
// 글자 칸이 약 0.55 x 0.55 화면 높이의 정사각형이 되게 3개를 가로로 나란히 둔다(칸 폭 0.262 x 영역 폭 ≈ 0.55 높이).
// 위쪽은 카운터·안내문 자리를 비우고 약간 아래로 내린다.
const LANDSCAPE = {
  yk: 1 / 2.1,
  decorStep: 0.0125, // ≈ 10px
  decorSkip: 0.0086, // ≈ 7px
  cell: (idx) => ({ x0: [0.045, 0.369, 0.693][idx], w: 0.262, y0: 0.27, h: 0.55 }),
}

function build(layout) {
  const { yk, decorStep, decorSkip, cell } = layout
  const dist = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * yk)

  const lengths = (pts) => {
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]))
    return cum
  }

  const pointAt = (pts, cum, d) => {
    for (let i = 1; i < pts.length; i++) {
      if (d <= cum[i] || i === pts.length - 1) {
        const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]
      }
    }
    return pts[0]
  }

  // 거리 d0~d1 구간의 하위 polyline
  const slice = (pts, cum, d0, d1) => {
    const out = [pointAt(pts, cum, d0)]
    for (let i = 1; i < pts.length - 1; i++) if (cum[i] > d0 && cum[i] < d1) out.push(pts[i])
    out.push(pointAt(pts, cum, d1))
    return out
  }

  const strokes = GLYPHS.flatMap((g, idx) => {
    const c = cell(idx)
    return g.map((st) => ({ ...st, pts: st.pts.map(([x, y]) => [c.x0 + x * c.w, c.y0 + y * c.h]) }))
  })

  const stars = []
  const segments = []
  const decor = []

  for (const s of strokes) {
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
    const steps = Math.max(1, Math.round(total / decorStep))
    const upto = s.closed ? steps - 1 : steps
    for (let i = 0; i <= upto; i++) {
      const p = pointAt(pts, cum, (i / steps) * total)
      decor.push({ x: p[0], y: p[1], base, n: s.n })
    }
  }

  return {
    constellation: stars,
    strokeSegments: segments.map((sg) => ({
      a: sg.a,
      b: sg.b,
      d: 'M' + sg.pts.map(([x, y]) => `${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`).join('L'),
    })),
    decorStars: decor
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
        return { id, x: +p.x.toFixed(4), y: +p.y.toFixed(4), near, skip: min < decorSkip }
      })
      .filter((p) => !p.skip),
  }
}

export const portraitLayout = build(PORTRAIT)
export const landscapeLayout = build(LANDSCAPE)

// 기존 이름(세로 배치)은 그대로 내보낸다.
export const { constellation, strokeSegments, decorStars } = portraitLayout
