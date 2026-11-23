// '하진' 글씨를 획(polyline)으로 정의하고, 그 위에 별을 배치한다. (좌표 정규화 0~1, x: 가로, y: 세로)
// - constellation: 클릭 가능한 메시지 별 17개 (획 위 주요 지점)
// - strokeSegments: 별-별 또는 별-교차점(junction) 사이의 선 구간 (segmentOn / activeSegments 규칙으로 표시)
// - decorStars: 획을 따라 촘촘히 배치한 장식 별 (near = 가장 가까운 메시지 별 index)
// 배치는 두 가지: 세로 화면용(글자 2개를 세로로 쌓음)과, 가로로 누운 짧은 화면용(글자 2개를 가로로 나란히).
// 두 배치는 같은 획·같은 별 순서를 쓰고 글자 칸의 위치만 다르므로, 별 index 가 같아 열린 별 상태가 그대로 유지된다.
export const CONSTELLATION_TEXT = '하진'

const ellipse = (cx, cy, rx, ry, n = 48) =>
  Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
  })

// pts: 획의 점들(글자 칸 안 0~1), n: 그 획 위 메시지 별 개수, closed: 닫힌 획(원). 메시지 별 합계 = 17
// 같은 자리에 별이 겹치지 않도록 ㅎ 꼭지+가로획, ㅏ, ㅅ, ㄴ 은 획을 이어 그리거나 꺾임 구간으로 묶었다.
// 원은 칸의 가로/세로 픽셀이 거의 같으므로 rx : ry = 1 : 1.05 정도로 맞춘다.
const GLYPHS = [
  // 하: ㅎ 꼭지+가로획(3) + ㅎ 원(3) + ㅏ(3) = 9
  [
    { pts: [[0.04, 0.28], [0.32, 0.28], [0.32, 0.0], [0.32, 0.28], [0.60, 0.28]], n: 3 },
    { pts: ellipse(0.32, 0.71, 0.20, 0.21), n: 3, closed: true },
    { pts: [[0.80, 0.0], [0.80, 0.5], [1.0, 0.5], [0.80, 0.5], [0.80, 1.0]], n: 3 },
  ],
  // 진: ㅈ 가로획(2) + ㅅ(2) + ㅣ(2) + ㄴ(2) = 8
  [
    { pts: [[0.04, 0.02], [0.60, 0.02]], n: 2 },
    { pts: [[0.04, 0.50], [0.32, 0.02], [0.60, 0.50]], n: 2 },
    { pts: [[0.86, 0.0], [0.86, 0.52]], n: 2 },
    { pts: [[0.20, 0.72], [0.20, 1.0], [0.90, 1.0]], n: 2 },
  ],
]

// 세로 화면: 글자 2개를 세로 중앙에 배치한다(폰 390x844 기준 한 칸 약 265 x 262px, 두 글자 사이 간격 약 84px).
// 칸은 화면의 (x0, 너비 w) x (y0[i], 높이 h) 영역.
const PORTRAIT = {
  yk: 2.1, // 별 영역 높이/너비(거리 계산용)
  decorStep: 0.026, // 장식 별 간격(너비 대비 ≈ 10px)
  decorSkip: 0.018,
  cell: (idx) => ({ x0: 0.171, w: 0.658, y0: [0.1, 0.49][idx], h: 0.3 }),
}

// 가로 화면(짧은 높이: 844x390, 932x430, 667x375 …): 별 영역이 높이의 약 2.1배 폭으로 고정(Sky.css)되어 있다고 보고,
// 글자 칸이 약 0.60 x 0.60 화면 높이의 정사각형이 되게 2개를 가로 중앙에 나란히 둔다(칸 폭 0.286 x 영역 폭 ≈ 0.60 높이).
const LANDSCAPE = {
  yk: 1 / 2.1,
  decorStep: 0.0125, // ≈ 10px
  decorSkip: 0.0086, // ≈ 7px
  cell: (idx) => ({ x0: [0.1865, 0.5465][idx], w: 0.267, y0: 0.13, h: 0.56 }),
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

  const stars = []
  const segments = []
  const decor = []
  let junctionCount = 0

  const EPS = 1e-6
  const edgeKey = (u, v) => (u < v ? `${u}:${v}` : `${v}:${u}`)

  for (let gi = 0; gi < GLYPHS.length; gi++) {
    const c = cell(gi)
    const glyphStarBase = stars.length
    const starCoords = []
    const rawPolys = []

    for (const st of GLYPHS[gi]) {
      const mapped = st.pts.map(([x, y]) => [c.x0 + x * c.w, c.y0 + y * c.h])
      // 닫힌 획은 시작점으로 되돌아오도록 첫 점을 끝에 추가
      const pts = st.closed ? [...mapped, mapped[0]] : mapped
      const cum = lengths(pts)
      const total = cum[cum.length - 1]
      const ds = Array.from({ length: st.n }, (_, i) =>
        st.closed ? (i / st.n) * total : st.n <= 1 ? total : (i / (st.n - 1)) * total,
      )
      const base = stars.length
      ds.forEach((d) => {
        const [x, y] = pointAt(pts, cum, d)
        stars.push({ x: +x.toFixed(4), y: +y.toFixed(4) })
        starCoords.push([x, y])
      })
      for (let k = 0; k < st.n - 1; k++) rawPolys.push(slice(pts, cum, ds[k], ds[k + 1]))
      if (st.closed) rawPolys.push(slice(pts, cum, ds[st.n - 1], total))
      const steps = Math.max(1, Math.round(total / decorStep))
      const upto = st.closed ? steps - 1 : steps
      for (let i = 0; i <= upto; i++) {
        const p = pointAt(pts, cum, (i / steps) * total)
        if (!decor.some((q) => dist(p, [q.x, q.y]) < decorStep * 0.45)) decor.push({ x: p[0], y: p[1], base, n: st.n })
      }
    }

    // 글자 하나를 그래프(별 + 교차점 노드)로 분해: 겹친 소구간을 합치고 선분 위의 다른 꼭짓점에서 분할한다.
    const verts = starCoords.map(([x, y], k) => ({ id: k, x, y, star: glyphStarBase + k, jId: null, isNode: true }))
    const intern = ([x, y]) => {
      for (const v of verts) if (Math.hypot(x - v.x, y - v.y) < EPS) return v.id
      const id = verts.length
      verts.push({ id, x, y, star: -1, jId: null, isNode: false })
      return id
    }

    const elemSet = new Set()
    const elemEdges = []
    for (const poly of rawPolys) {
      for (let i = 1; i < poly.length; i++) {
        const u = intern(poly[i - 1])
        const v = intern(poly[i])
        if (u === v) continue
        const k = edgeKey(u, v)
        if (elemSet.has(k)) continue
        elemSet.add(k)
        elemEdges.push([u, v])
      }
    }

    const splitSet = new Set()
    const adj = Array.from({ length: verts.length }, () => [])
    const addSplitEdge = (u, v) => {
      if (u === v) return
      const k = edgeKey(u, v)
      if (splitSet.has(k)) return
      splitSet.add(k)
      adj[u].push(v)
      adj[v].push(u)
    }

    for (const [u, v] of elemEdges) {
      const pu = verts[u]
      const pv = verts[v]
      const dx = pv.x - pu.x
      const dy = pv.y - pu.y
      const len2 = dx * dx + dy * dy
      const hits = []
      for (const w of verts) {
        if (w.id === u || w.id === v) continue
        if (Math.hypot(w.x - pu.x, w.y - pu.y) <= EPS || Math.hypot(w.x - pv.x, w.y - pv.y) <= EPS) continue
        const t = ((w.x - pu.x) * dx + (w.y - pu.y) * dy) / len2
        if (t <= 0 || t >= 1) continue
        if (Math.hypot(w.x - (pu.x + t * dx), w.y - (pu.y + t * dy)) < EPS) hits.push({ id: w.id, t })
      }
      hits.sort((a, b) => a.t - b.t)
      let prev = u
      for (const h of hits) {
        addSplitEdge(prev, h.id)
        prev = h.id
      }
      addSplitEdge(prev, v)
    }

    // 3갈래 이상 모이는 비-별 꼭짓점이 교차점(junction). 차수 2 꼭짓점은 선 안의 꺾임이다.
    for (const v of verts) {
      if (v.star < 0 && adj[v.id].length >= 3) {
        v.isNode = true
        v.jId = junctionCount++
      }
    }

    const visited = new Set()
    const glyphEdges = []
    for (const v of verts) {
      if (!v.isNode) continue
      for (const next of adj[v.id]) {
        const k0 = edgeKey(v.id, next)
        if (visited.has(k0)) continue
        const chain = [v.id, next]
        visited.add(k0)
        let prev = v.id
        let cur = next
        while (!verts[cur].isNode) {
          const nbrs = adj[cur]
          const nxt = nbrs[0] === prev ? nbrs[1] : nbrs[0]
          if (nxt == null) break
          visited.add(edgeKey(cur, nxt))
          chain.push(nxt)
          prev = cur
          cur = nxt
        }
        glyphEdges.push(chain)
      }
    }

    const jPeers = new Map()
    for (const chain of glyphEdges) {
      const u = verts[chain[0]]
      const w = verts[chain[chain.length - 1]]
      if (u.star >= 0 && w.jId != null) {
        if (!jPeers.has(w.jId)) jPeers.set(w.jId, new Set())
        jPeers.get(w.jId).add(u.star)
      } else if (w.star >= 0 && u.jId != null) {
        if (!jPeers.has(u.jId)) jPeers.set(u.jId, new Set())
        jPeers.get(u.jId).add(w.star)
      }
    }

    for (const rawChain of glyphEdges) {
      let chain = rawChain
      let u = verts[chain[0]]
      let w = verts[chain[chain.length - 1]]
      // 별-교차점 간선은 별 쪽에서 교차점 쪽으로 향하도록 정렬(3D 선 그리기 방향)
      if (u.jId != null && w.star >= 0) {
        chain = [...chain].reverse()
        u = verts[chain[0]]
        w = verts[chain[chain.length - 1]]
      }
      const pts = chain.map((id) => [verts[id].x, verts[id].y])
      if (u.star >= 0 && w.star >= 0) {
        segments.push({ id: `${u.star}-${w.star}`, a: u.star, b: w.star, pts })
      } else if (u.star >= 0 && w.jId != null) {
        const peers = [...jPeers.get(w.jId)].sort((x, y) => x - y)
        segments.push({ id: `${u.star}-j${w.jId}`, a: u.star, j: w.jId, peers, pts })
      }
    }
  }

  return {
    constellation: stars,
    strokeSegments: segments.map(({ pts, ...rest }) => ({
      ...rest,
      d: 'M' + pts.map(([x, y]) => `${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`).join('L'),
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

// 별-별 간선: 두 끝 별이 모두 연결됐을 때. 별-교차점 간선: 그 별이 연결됐고 같은 교차점에 닿은 별이 2개 이상 연결됐을 때.
export function segmentOn(seg, isLinked) {
  if (!isLinked(seg.a)) return false
  if (seg.b != null) return isLinked(seg.b)
  let n = 0
  for (const p of seg.peers) if (isLinked(p)) n++
  return n >= 2
}

export function activeSegments(layout, linked, count = layout.constellation.length) {
  const has = typeof linked === 'function' ? linked : (i) => linked.has(i)
  const isLinked = (i) => i < count && has(i)
  return layout.strokeSegments.filter((s) => segmentOn(s, isLinked))
}

export const portraitLayout = build(PORTRAIT)
export const landscapeLayout = build(LANDSCAPE)

// 기존 이름(세로 배치)은 그대로 내보낸다.
export const { constellation, strokeSegments, decorStars } = portraitLayout
