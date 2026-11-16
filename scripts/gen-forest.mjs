// 사용법: node scripts/gen-forest.mjs src/assets/forest.svg
// 인트로의 '나무 밑 밤 숲' 그림(src/assets/forest.svg)을 만들어 내는 스크립트. 시드 고정이라 항상 같은 그림이 나온다.
// 나무/낙엽/풀 모양을 바꾸고 싶으면 아래 숫자나 색을 고친 뒤 다시 실행한다.
// 나무 밑 밤 숲 장면 SVG 생성기 (시드 고정 난수 → 항상 같은 그림)
// 좌표: 390 x 1860. 아래쪽 844는 처음 보이는 땅, 그 위로 줄기 → 가지 → 나뭇잎 지붕이 이어진다.
import { writeFileSync } from 'node:fs'

const W = 390
const H = 1860
let seed = 20261116
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const R = (a, b) => a + (b - a) * rnd()
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const f = (n) => +n.toFixed(1)

// 중심선(점 배열)을 폭 w0→w1로 점점 가늘어지는 다각형 경로로
function taper(pts, w0, w1, closeEnd = true) {
  const L = [], Rr = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    let dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    dx /= len; dy /= len
    const t = i / (pts.length - 1)
    const w = (w0 + (w1 - w0) * t) / 2
    L.push([p[0] - dy * w, p[1] + dx * w])
    Rr.push([p[0] + dy * w, p[1] - dx * w])
  }
  const all = [...L, ...Rr.reverse()]
  return 'M' + all.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + (closeEnd ? 'Z' : '')
}
// 부드러운 곡선 중심선 만들기: 제어점 → 샘플링(Catmull-Rom 근사)
function curve(ctrl, steps = 24) {
  const out = []
  const n = ctrl.length - 1
  for (let s = 0; s <= steps; s++) {
    const u = (s / steps) * n
    const i = Math.min(n - 1, Math.floor(u)), t = u - i
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n, i + 2)]
    const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t)
    out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])])
  }
  return out
}

const out = []
const add = (s) => out.push(s)

add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">`)
add(`<defs>
<linearGradient id="soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2925"/><stop offset=".45" stop-color="#16201d"/><stop offset="1" stop-color="#0b1113"/></linearGradient>
<linearGradient id="bark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#17110e"/><stop offset=".45" stop-color="#2a1f18"/><stop offset=".8" stop-color="#43352a"/><stop offset="1" stop-color="#6a5a49"/></linearGradient>
<linearGradient id="barkv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
<radialGradient id="vig" cx=".5" cy=".62" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>
<linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".14" stop-color="#fff" stop-opacity=".85"/><stop offset=".22" stop-color="#fff"/></linearGradient>
<mask id="soilMask"><rect x="0" y="880" width="${W}" height="${H - 880}" fill="url(#fadeTop)"/></mask>
<linearGradient id="gTrunkFade" gradientUnits="userSpaceOnUse" x1="0" y1="1075" x2="0" y2="1175"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="trunkFade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#gTrunkFade)"/></mask>
<linearGradient id="gRootFade" gradientUnits="userSpaceOnUse" x1="0" y1="1030" x2="0" y2="1125"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
<mask id="rootFade" maskUnits="userSpaceOnUse" x="-20" y="0" width="${W + 40}" height="${H}"><rect x="-20" y="0" width="${W + 40}" height="${H}" fill="url(#gRootFade)"/></mask>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .75  0 0 0 0 .82  0 0 0 0 .7  0 0 0 .5 0"/></filter>
<filter id="barkn" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035 .5" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 .05  0 0 0 0 .03  0 0 0 0 .02  0 0 0 1.1 -.25"/></filter>
<filter id="b8"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="b3"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="b1"><feGaussianBlur stdDeviation="1.2"/></filter>
</defs>`)

// ───── 땅 ─────
add(`<g mask="url(#soilMask)">`)
add(`<rect x="0" y="880" width="${W}" height="${H - 880}" fill="url(#soil)"/>`)
add(`<rect x="0" y="880" width="${W}" height="${H - 880}" filter="url(#grain)" opacity=".55"/>`)
add(`</g>`)

// 이끼 얼룩
for (let i = 0; i < 26; i++) {
  const nearTrunk = rnd() < 0.55
  const x = nearTrunk ? R(60, 340) : R(0, W)
  const y = nearTrunk ? R(1060, 1330) : R(1100, H)
  add(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(R(18, 60))}" ry="${f(R(8, 22))}" fill="${pick(['#27452f', '#1f3a2b', '#2f4d33'])}" opacity="${f(R(0.25, 0.55))}" filter="url(#b8)"/>`)
}
// 젖은 흙 어두운 얼룩
for (let i = 0; i < 16; i++) {
  add(`<ellipse cx="${f(R(0, W))}" cy="${f(R(1050, H))}" rx="${f(R(20, 70))}" ry="${f(R(8, 24))}" fill="#06090a" opacity="${f(R(0.2, 0.45))}" filter="url(#b8)"/>`)
}
// 조약돌
for (let i = 0; i < 34; i++) {
  const x = R(5, W - 5), y = R(1180, H - 10), rx = R(2.5, 8), ry = rx * R(0.55, 0.8)
  add(`<ellipse cx="${f(x + 1.5)}" cy="${f(y + 2)}" rx="${f(rx)}" ry="${f(ry)}" fill="#050808" opacity=".5"/>`)
  add(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${pick(['#4a5250', '#3d4644', '#555c58'])}"/>`)
  add(`<ellipse cx="${f(x - rx * 0.25)}" cy="${f(y - ry * 0.3)}" rx="${f(rx * 0.55)}" ry="${f(ry * 0.4)}" fill="#8b958f" opacity=".45"/>`)
}

// ───── 풀 (뒤쪽, 키 작은 것) ─────
function blade(x, y, h, lean, w, fill, op = 1) {
  const tipX = x + lean, tipY = y - h
  const cX = x + lean * 0.3 + R(-2, 2), cY = y - h * 0.55
  return `<path d="M${f(x - w)} ${f(y)} Q${f(cX - w * 0.3)} ${f(cY)} ${f(tipX)} ${f(tipY)} Q${f(cX + w * 0.4)} ${f(cY + 2)} ${f(x + w)} ${f(y)}Z" fill="${fill}" opacity="${op}"/>`
}
const greens = ['#17261d', '#1d3326', '#244033', '#2d4d38', '#1a2c22', '#33563f']
for (let i = 0; i < 170; i++) {
  const x = R(-4, W + 4), y = R(1080, H - 120)
  const clear = x > 80 && x < 320 && y > 1380 && y < 1760 // 봉투 놓일 자리는 비워 둔다
  if (clear && rnd() < 0.9) continue
  add(blade(x, y, R(10, 30), R(-8, 8), R(0.9, 1.8), pick(greens), R(0.65, 1)))
}

const barkFill = 'url(#bark)'
// ───── 줄기 ─────
const trunkC = [[205, 1130], [201, 1000], [208, 860], [203, 720], [198, 580], [200, 450], [196, 330]]
const trunkPts = curve(trunkC, 40)
const trunkD = taper(trunkPts, 214, 122)
add(`<g mask="url(#trunkFade)">`)
add(`<path d="${trunkD}" fill="#050807" opacity=".5" transform="translate(6 10)" filter="url(#b3)"/>`)
add(`<clipPath id="tc"><path d="${trunkD}"/></clipPath>`)
add(`<path d="${trunkD}" fill="${barkFill}"/>`)
add(`<g clip-path="url(#tc)">`)
add(`<rect x="0" y="300" width="${W}" height="850" filter="url(#barkn)" opacity=".85"/>`)
// 껍질 결
for (let i = 0; i < 90; i++) {
  const t0 = R(0.02, 0.95)
  const idx = Math.floor(t0 * (trunkPts.length - 1))
  const wHere = 214 + (122 - 214) * (idx / (trunkPts.length - 1))
  const ox = R(-0.48, 0.48) * wHere
  const len = Math.floor(R(3, 9))
  let d = ''
  for (let k = 0; k <= len && idx + k < trunkPts.length; k++) {
    const p = trunkPts[idx + k]
    d += (k ? 'L' : 'M') + `${f(p[0] + ox + R(-2.2, 2.2))} ${f(p[1])}`
  }
  const lit = ox > 0.2 * wHere
  add(`<path d="${d}" stroke="${lit ? '#7b6a57' : '#0a0705'}" stroke-width="${f(R(0.8, 2.6))}" opacity="${lit ? f(R(0.18, 0.38)) : f(R(0.35, 0.7))}" fill="none" stroke-linecap="round"/>`)
}
// 옹이
for (const [kx, ky, kr] of [[182, 880, 14], [226, 700, 10], [194, 560, 9]]) {
  add(`<ellipse cx="${kx}" cy="${ky}" rx="${kr * 0.7}" ry="${kr}" fill="#080504"/>`)
  add(`<ellipse cx="${kx}" cy="${ky}" rx="${kr * 0.7 + 3}" ry="${kr + 3}" fill="none" stroke="#2c2018" stroke-width="2.5" opacity=".7"/>`)
}
// 밑동 이끼 + 위로 갈수록 어두워짐
add(`<ellipse cx="190" cy="1110" rx="110" ry="46" fill="#2f5236" opacity=".42" filter="url(#b8)"/>`)
add(`<rect x="0" y="300" width="${W}" height="850" fill="url(#barkv)" opacity=".0"/>`)
// 오른쪽 달빛 테두리
add(`<path d="${taper(trunkPts, 214, 122, false)}" fill="none" stroke="#9bb4cf" stroke-width="3" opacity=".16" transform="translate(0 0)"/>`)
add(`</g>`)
add(`</g>`)

// 밑동: 줄기는 아래로 서서히 사라지고(trunkFade) 뿌리는 위에서 서서히 나타나(rootFade) 매끄럽게 이어진다
add(`<ellipse cx="205" cy="1160" rx="112" ry="22" fill="#030505" opacity=".35" filter="url(#b8)"/>`)
// ───── 뿌리 (줄기 위에 겹쳐 그려 밑동이 자연스럽게 퍼지게) ─────
function drawRoots() {
add(`<g mask="url(#rootFade)">`)
const roots = [
  { c: [[182, 1050], [150, 1150], [95, 1215], [34, 1262], [-12, 1282]], w0: 74, w1: 5 },
  { c: [[192, 1060], [172, 1175], [140, 1255], [118, 1335], [104, 1392]], w0: 56, w1: 4 },
  { c: [[222, 1060], [240, 1170], [262, 1235], [300, 1290], [352, 1318]], w0: 62, w1: 5 },
  { c: [[234, 1050], [268, 1130], [320, 1165], [372, 1175], [404, 1190]], w0: 58, w1: 5 },
  { c: [[205, 1070], [208, 1185], [214, 1255], [210, 1318], [216, 1362]], w0: 40, w1: 3 },
]
for (const r of roots) {
  const pts = curve(r.c)
  add(`<path d="${taper(pts, r.w0, r.w1)}" fill="#050807" opacity=".5" transform="translate(5 9)" filter="url(#b3)"/>`)
  add(`<path d="${taper(pts, r.w0, r.w1)}" fill="${barkFill}"/>`)
  // 뿌리 위 어두운 결
  for (let k = 0; k < 6; k++) {
    const t0 = R(0, 0.6), idx = Math.floor(t0 * (pts.length - 1)), idx2 = Math.min(pts.length - 1, idx + Math.floor(R(4, 9)))
    const off = R(-0.25, 0.25) * (r.w0 * (1 - t0) + 3)
    const a = pts[idx], b = pts[idx2]
    add(`<path d="M${f(a[0] + off)} ${f(a[1])} L${f(b[0] + off)} ${f(b[1])}" stroke="#0c0806" stroke-width="${f(R(0.6, 1.6))}" opacity=".55" fill="none" stroke-linecap="round"/>`)
  }
  // 이끼
  add(`<path d="${taper(pts.slice(0, 11), r.w0 * 0.9, r.w0 * 0.3)}" fill="#2c4a31" opacity=".32" filter="url(#b3)"/>`)
}
add(`</g>`)
}
drawRoots()

// ───── 가지 ─────
const branches = [
  { c: [[212, 800], [250, 760], [300, 735], [352, 690], [392, 655]], w0: 46, w1: 4 },
  { c: [[196, 700], [150, 660], [100, 632], [48, 590], [-10, 560]], w0: 42, w1: 4 },
  { c: [[205, 600], [240, 540], [262, 470], [296, 405], [326, 330]], w0: 34, w1: 3 },
  { c: [[198, 520], [168, 450], [130, 395], [96, 320], [60, 240]], w0: 32, w1: 3 },
  { c: [[200, 420], [210, 340], [196, 250], [212, 150], [204, 60]], w0: 28, w1: 3 },
]
for (const b of branches) {
  const pts = curve(b.c)
  add(`<path d="${taper(pts, b.w0, b.w1)}" fill="#0b0807"/>`)
  add(`<path d="${taper(pts, b.w0 * 0.55, b.w1 * 0.6)}" transform="translate(${b.c[4][0] > 200 ? 3 : -3} -1)" fill="#2a2018" opacity=".55"/>`)
  // 잔가지
  for (let k = 0; k < 5; k++) {
    const idx = Math.floor(R(0.3, 0.9) * (pts.length - 1))
    const p = pts[idx]
    const dir = b.c[4][0] > 200 ? 1 : -1
    const e = [p[0] + dir * R(26, 60) + R(-8, 8), p[1] - R(14, 50)]
    const mid = [(p[0] + e[0]) / 2 + R(-6, 6), (p[1] + e[1]) / 2 - R(2, 12)]
    add(`<path d="${taper(curve([p, mid, e], 8), R(5, 9), 1)}" fill="#0b0807"/>`)
  }
}

// ───── 잎 지붕 (위쪽) ─────
const leafPath = (x, y, len, wid, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot)
  const P = (u, v) => `${f(x + u * c - v * s)} ${f(y + u * s + v * c)}`
  return `M${P(-len / 2, 0)}Q${P(-len * 0.1, -wid)} ${P(len / 2, 0)}Q${P(-len * 0.1, wid)} ${P(-len / 2, 0)}Z`
}
const canopyDark = ['#050c09', '#07110d', '#0a1712', '#0d1c16']
const canopyMid = ['#10241b', '#142a1f', '#183225']
const canopyEdge = ['#2d5240', '#3a6350', '#4a7560']
function canopyLayer(count, yMax, fills, sizeRange, edgeProb) {
  for (let i = 0; i < count; i++) {
    const x = R(-20, W + 20)
    const y = R(-30, yMax)
    // 가운데 위쪽에 하늘이 비치는 틈을 남긴다
    const gap = Math.hypot((x - 205) / 70, (y - 150) / 120)
    if (gap < 1 && rnd() < 0.82) continue
    // 아래로 갈수록 성기게
    if (rnd() < (y / yMax) * 0.7) continue
    const len = R(...sizeRange), wid = len * R(0.28, 0.42), rot = R(0, Math.PI)
    add(`<path d="${leafPath(x, y, len, wid, rot)}" fill="${pick(fills)}"/>`)
    if (rnd() < edgeProb) {
      add(`<path d="${leafPath(x + 1, y - 1.5, len * 0.8, wid * 0.55, rot)}" fill="${pick(canopyEdge)}" opacity="${f(R(0.18, 0.5))}"/>`)
    }
  }
}
canopyLayer(520, 640, canopyDark, [34, 70], 0)
canopyLayer(430, 560, canopyMid, [28, 54], 0.12)
canopyLayer(260, 480, canopyDark, [24, 44], 0.18)
canopyLayer(120, 380, canopyMid, [20, 36], 0.4)

// ───── 낙엽 (땅 위) ─────
const leafCols = ['#7a4f24', '#8b5a2a', '#9a6b30', '#5e3a1e', '#6b4a22', '#4d5a2c', '#6a6b30', '#7d3f23']
function fallenLeaf(x, y, size, rot) {
  const wid = size * R(0.32, 0.45)
  const col = pick(leafCols)
  add(`<path d="${leafPath(x + 2, y + 3, size, wid, rot)}" fill="#030505" opacity=".55" filter="url(#b1)"/>`)
  add(`<path d="${leafPath(x, y, size, wid, rot)}" fill="${col}"/>`)
  add(`<path d="${leafPath(x - 0.5, y - 0.8, size * 0.7, wid * 0.45, rot)}" fill="#ffffff" opacity=".07"/>`)
  const c = Math.cos(rot), s = Math.sin(rot)
  add(`<path d="M${f(x - (size / 2) * c)} ${f(y - (size / 2) * s)} L${f(x + (size / 2) * c)} ${f(y + (size / 2) * s)}" stroke="#2a1809" stroke-width=".7" opacity=".7"/>`)
}
for (let i = 0; i < 70; i++) {
  const nearTrunk = rnd() < 0.5
  const x = nearTrunk ? R(30, 360) : R(0, W)
  const y = nearTrunk ? R(1120, 1500) : R(1150, H - 20)
  if (x > 95 && x < 300 && y > 1420 && y < 1700) continue // 봉투 자리
  fallenLeaf(x, y, R(11, 24), R(0, Math.PI * 2))
}

// ───── 앞쪽 풀 (크고 어두움, 가장자리에 틀을 만든다) ─────
for (let i = 0; i < 90; i++) {
  const side = rnd()
  const x = side < 0.42 ? R(-6, 70) : side < 0.84 ? R(320, W + 6) : R(60, 330)
  const y = side < 0.84 ? R(1560, H + 4) : R(H - 40, H + 4)
  add(blade(x, y, R(34, 92), R(-14, 14), R(1.6, 3.2), pick(['#0d1a13', '#101f17', '#142619', '#0a140f']), 1))
}

// ───── 비네트 ─────
add(`<rect x="0" y="930" width="${W}" height="${H - 930}" fill="url(#vig)"/>`)
add(`</svg>`)

writeFileSync(process.argv[2], out.join('\n'))
console.log('wrote', process.argv[2], (out.join('\n').length / 1024).toFixed(0) + 'KB')
