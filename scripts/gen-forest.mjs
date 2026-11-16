// 사용법: node scripts/gen-forest.mjs src/assets/forest.svg
// 인트로 그림: 달이 뜬 밤 들판에 큰 나무 한 그루, 그 아래 풀밭(봉투가 놓이는 자리). 시드 고정이라 항상 같은 그림이 나온다.
// 좌표는 '첫 화면(390 x 844)' 기준으로 짜고, 위쪽 656px는 하늘이 이어지는 여백(투명하게 사라짐)이라 전체 390 x 1500.
//   - 봉투가 놓이는 자리: 화면 (95~295, 705~805)  → 이 안은 풀/낙엽을 비워 둔다
//   - 제목이 들어가는 자리: 화면 위쪽 (y 40~130)    → 달과 별만 있고 나무는 y 190부터
import { writeFileSync } from 'node:fs'

const W = 390
const TOP = 656 // 첫 화면 위쪽 여백(투명 하늘)
const H = 844 + TOP
let seed = 20261117
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const R = (a, b) => a + (b - a) * rnd()
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const f = (n) => +n.toFixed(1)
const out = []
const add = (s) => out.push(s)

function taper(pts, w0, w1) {
  const L = [], Rr = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    let dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    dx /= len; dy /= len
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2
    L.push([p[0] - dy * w, p[1] + dx * w]); Rr.push([p[0] + dy * w, p[1] - dx * w])
  }
  return 'M' + [...L, ...Rr.reverse()].map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z'
}
function curve(ctrl, steps = 24) {
  const out2 = [], n = ctrl.length - 1
  for (let s = 0; s <= steps; s++) {
    const u = (s / steps) * n, i = Math.min(n - 1, Math.floor(u)), t = u - i
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n, i + 2)]
    const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t)
    out2.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])])
  }
  return out2
}
const leafPath = (x, y, len, wid, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot)
  const P = (u, v) => `${f(x + u * c - v * s)} ${f(y + u * s + v * c)}`
  return `M${P(-len / 2, 0)}Q${P(-len * 0.1, -wid)} ${P(len / 2, 0)}Q${P(-len * 0.1, wid)} ${P(-len / 2, 0)}Z`
}
function blade(x, y, h, lean, w, fill, op = 1) {
  const tipX = x + lean, tipY = y - h
  const cX = x + lean * 0.3 + R(-2, 2), cY = y - h * 0.55
  return `<path d="M${f(x - w)} ${f(y)} Q${f(cX - w * 0.3)} ${f(cY)} ${f(tipX)} ${f(tipY)} Q${f(cX + w * 0.4)} ${f(cY + 2)} ${f(x + w)} ${f(y)}Z" fill="${fill}" opacity="${op}"/>`
}
const inEnvelopeZone = (x, y) => x > 85 && x < 305 && y > 700 && y < 812

add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">`)
add(`<defs>
<linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="-100" x2="0" y2="640">
  <stop offset="0" stop-color="#070b24" stop-opacity="0"/><stop offset=".135" stop-color="#070b24"/><stop offset=".55" stop-color="#141b4a"/><stop offset=".86" stop-color="#2f2866"/><stop offset="1" stop-color="#5b4379"/>
</linearGradient>
<radialGradient id="moonGlow"><stop offset="0" stop-color="#e8eeff" stop-opacity=".55"/><stop offset=".35" stop-color="#9db4ff" stop-opacity=".18"/><stop offset="1" stop-color="#9db4ff" stop-opacity="0"/></radialGradient>
<linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22373a"/><stop offset=".35" stop-color="#17272a"/><stop offset="1" stop-color="#0a1214"/></linearGradient>
<linearGradient id="bark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#150f0d"/><stop offset=".5" stop-color="#2b2019"/><stop offset=".82" stop-color="#47392e"/><stop offset="1" stop-color="#7a6a58"/></linearGradient>
<radialGradient id="vig" cx=".5" cy=".5" r=".72"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8c8ff" stop-opacity="0"/><stop offset=".5" stop-color="#b8c8ff" stop-opacity=".16"/><stop offset="1" stop-color="#b8c8ff" stop-opacity="0"/></linearGradient>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .75  0 0 0 0 .82  0 0 0 0 .7  0 0 0 .5 0"/></filter>
<filter id="barkn" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05 .55" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 .05  0 0 0 0 .03  0 0 0 0 .02  0 0 0 1.1 -.25"/></filter>
<filter id="b10"><feGaussianBlur stdDeviation="10"/></filter>
<filter id="b6"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="b3"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="b1"><feGaussianBlur stdDeviation="1.2"/></filter>
</defs>`)

// 모든 좌표를 '첫 화면 기준(0~844)'으로 쓰고, 위쪽 여백(TOP)만큼 내려서 그린다
add(`<g transform="translate(0 ${TOP})">`)

// ───── 하늘 ─────
add(`<rect x="0" y="-100" width="${W}" height="745" fill="url(#sky)"/>`)
// 별
for (let i = 0; i < 90; i++) {
  const x = R(0, W), y = R(-60, 430)
  const bright = rnd() < 0.12
  add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(bright ? R(1.2, 1.8) : R(0.4, 0.95))}" fill="#e8eeff" opacity="${f(bright ? R(0.8, 1) : R(0.25, 0.75))}"/>`)
  if (bright) add(`<circle cx="${f(x)}" cy="${f(y)}" r="4.5" fill="#cfdcff" opacity=".18" filter="url(#b1)"/>`)
}
// 달 (오른쪽 위) — 제목(화면 위쪽 가운데)과 겹치지 않게 모서리에
add(`<circle cx="322" cy="64" r="92" fill="url(#moonGlow)"/>`)
add(`<circle cx="322" cy="64" r="27" fill="#f3f1e6"/>`)
add(`<circle cx="332" cy="58" r="27" fill="#d9d8cc" opacity=".35"/>`)
for (const [cx, cy, r] of [[312, 56, 4.5], [330, 74, 3.4], [318, 76, 2.4], [334, 52, 2.8]]) add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#bdbcae" opacity=".55"/>`)
// 얇은 구름 (달빛을 받음)
for (const [cx, cy, rx, ry, op] of [[280, 140, 90, 9, 0.22], [120, 200, 120, 8, 0.16], [330, 250, 70, 7, 0.14]]) {
  add(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#8f9fd6" opacity="${op}" filter="url(#b6)"/>`)
}
// 지평선 노을기 + 안개
add(`<ellipse cx="195" cy="618" rx="260" ry="36" fill="#a07aa0" opacity=".28" filter="url(#b10)"/>`)

// ───── 먼 언덕과 숲 실루엣 ─────
function ridge(yBase, amp, color, opacity, trees) {
  let d = `M-10 ${yBase + 60}`
  const pts = []
  for (let x = -10; x <= W + 10; x += 12) pts.push([x, yBase + Math.sin(x * 0.018 + yBase) * amp + Math.sin(x * 0.047) * amp * 0.4])
  d += pts.map(([x, y]) => `L${x} ${f(y)}`).join('') + `L${W + 10} ${yBase + 60}Z`
  add(`<path d="${d}" fill="${color}" opacity="${opacity}"/>`)
  for (let i = 0; i < trees; i++) {
    const [x, y] = pts[Math.floor(R(1, pts.length - 1))]
    const h = R(14, 30), w = h * R(0.28, 0.42)
    add(`<path d="M${f(x)} ${f(y - h)} L${f(x - w)} ${f(y + 2)} L${f(x + w)} ${f(y + 2)}Z" fill="${color}" opacity="${opacity}"/>`)
  }
}
ridge(588, 10, '#1f2753', 0.9, 14)
add(`<rect x="0" y="590" width="${W}" height="44" fill="url(#mist)"/>`)
ridge(610, 8, '#141b3d', 0.95, 20)
add(`<rect x="0" y="612" width="${W}" height="36" fill="url(#mist)" opacity=".8"/>`)
ridge(632, 6, '#0d1430', 1, 12)

// ───── 풀밭 ─────
add(`<rect x="0" y="640" width="${W}" height="${844 - 640}" fill="url(#meadow)"/>`)
add(`<rect x="0" y="640" width="${W}" height="${844 - 640}" filter="url(#grain)" opacity=".5"/>`)
// 달빛이 드는 풀밭 얼룩 / 그림자 / 이끼
add(`<ellipse cx="200" cy="740" rx="180" ry="38" fill="#cfe2ff" opacity=".07" filter="url(#b10)"/>`)
add(`<ellipse cx="135" cy="706" rx="150" ry="22" fill="#02060a" opacity=".55" filter="url(#b6)"/>`) // 나무 그림자(달이 오른쪽이라 왼쪽으로)
for (let i = 0; i < 18; i++) add(`<ellipse cx="${f(R(0, W))}" cy="${f(R(660, 844))}" rx="${f(R(24, 70))}" ry="${f(R(6, 18))}" fill="${pick(['#27452f', '#1f3a2b', '#2d4a3a'])}" opacity="${f(R(0.18, 0.4))}" filter="url(#b10)"/>`)

// ───── 풀 (멀리, 작게) ─────
const greens = ['#17261d', '#1d3326', '#244033', '#2d4d38', '#1a2c22', '#33563f']
for (let i = 0; i < 360; i++) {
  const y = R(650, 836), x = R(-4, W + 4)
  if (inEnvelopeZone(x, y) && rnd() < 0.92) continue
  const depth = (y - 640) / 204 // 0 멀리 ~ 1 가까이
  add(blade(x, y, R(5, 10) + depth * R(6, 16), R(-6, 6), 0.7 + depth * 0.9, pick(greens), R(0.6, 1)))
}
// 풀꽃 (달빛에 희미하게 빛남)
for (let i = 0; i < 46; i++) {
  const x = R(6, W - 6), y = R(668, 832)
  if (inEnvelopeZone(x, y)) continue
  const col = pick(['#f4f1d0', '#e9d9ff', '#ffe3c8', '#fff7bd'])
  const s = 1.2 + ((y - 640) / 204) * 1.8
  add(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(x)}" y2="${f(y + s * 4)}" stroke="#1d3326" stroke-width=".8"/>`)
  add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 1.9)}" fill="${col}" opacity=".18" filter="url(#b1)"/>`)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    add(`<circle cx="${f(x + Math.cos(a) * s)}" cy="${f(y + Math.sin(a) * s)}" r="${f(s * 0.62)}" fill="${col}" opacity=".85"/>`)
  }
  add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.5)}" fill="#e0b84a"/>`)
}
// 조약돌
for (let i = 0; i < 18; i++) {
  const x = R(8, W - 8), y = R(700, 838)
  if (inEnvelopeZone(x, y)) continue
  const rx = R(2.5, 7), ry = rx * R(0.55, 0.8)
  add(`<ellipse cx="${f(x + 1.4)}" cy="${f(y + 1.8)}" rx="${f(rx)}" ry="${f(ry)}" fill="#04080a" opacity=".5"/>`)
  add(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${pick(['#4a5250', '#3d4644', '#555c58'])}"/>`)
  add(`<ellipse cx="${f(x - rx * 0.25)}" cy="${f(y - ry * 0.3)}" rx="${f(rx * 0.55)}" ry="${f(ry * 0.4)}" fill="#8b958f" opacity=".45"/>`)
}

// ───── 나무 한 그루 ─────
const TX = 205, GY = 700 // 줄기 아랫부분(땅에 닿는 곳)
// 줄기 + 뿌리
const trunkC = [[TX, GY + 8], [TX - 3, 640], [TX + 4, 580], [TX, 520], [TX - 4, 470]]
const trunkPts = curve(trunkC, 30)
const trunkD = taper(trunkPts, 88, 50)
add(`<ellipse cx="${TX - 6}" cy="${GY + 6}" rx="92" ry="12" fill="#02060a" opacity=".6" filter="url(#b3)"/>`)
const roots = [
  { c: [[TX - 20, GY - 22], [TX - 42, GY - 4], [TX - 74, GY + 8], [TX - 104, GY + 14]], w0: 30, w1: 3 },
  { c: [[TX + 22, GY - 22], [TX + 44, GY - 4], [TX + 78, GY + 10], [TX + 112, GY + 12]], w0: 30, w1: 3 },
  { c: [[TX - 8, GY - 12], [TX - 22, GY + 6], [TX - 38, GY + 22], [TX - 50, GY + 34]], w0: 22, w1: 2 },
  { c: [[TX + 10, GY - 12], [TX + 26, GY + 8], [TX + 44, GY + 20], [TX + 58, GY + 30]], w0: 22, w1: 2 },
]
for (const r of roots) add(`<path d="${taper(curve(r.c, 12), r.w0, r.w1)}" fill="url(#bark)"/>`)
add(`<path d="${taper(curve([[TX, GY + 10], [TX, GY - 28], [TX, GY - 62]], 8), 134, 90)}" fill="url(#bark)"/>`)
add(`<path d="${trunkD}" fill="url(#bark)"/>`)
add(`<clipPath id="tc"><path d="${trunkD}"/></clipPath>`)
add(`<g clip-path="url(#tc)">`)
add(`<rect x="${TX - 60}" y="440" width="120" height="270" filter="url(#barkn)" opacity=".85"/>`)
for (let i = 0; i < 50; i++) {
  const t0 = R(0, 0.9), idx = Math.floor(t0 * (trunkPts.length - 1))
  const wHere = 88 + (50 - 88) * (idx / (trunkPts.length - 1))
  const ox = R(-0.46, 0.46) * wHere, len = Math.floor(R(3, 8))
  let d = ''
  for (let k = 0; k <= len && idx + k < trunkPts.length; k++) { const p = trunkPts[idx + k]; d += (k ? 'L' : 'M') + `${f(p[0] + ox + R(-1.6, 1.6))} ${f(p[1])}` }
  const lit = ox > 0.15 * wHere
  add(`<path d="${d}" stroke="${lit ? '#8a7a67' : '#0a0705'}" stroke-width="${f(R(0.7, 2.2))}" opacity="${lit ? f(R(0.2, 0.4)) : f(R(0.35, 0.7))}" fill="none" stroke-linecap="round"/>`)
}
add(`<ellipse cx="${TX - 14}" cy="590" rx="6" ry="9" fill="#080504"/><ellipse cx="${TX - 14}" cy="590" rx="9" ry="12" fill="none" stroke="#2c2018" stroke-width="2" opacity=".7"/>`)
add(`<path d="${taper(trunkPts, 88, 50)}" fill="none" stroke="#a5bddc" stroke-width="3" opacity=".2"/>`) // 달빛 테두리
add(`</g>`)
add(`<ellipse cx="${TX}" cy="${GY + 6}" rx="84" ry="10" fill="#2f5236" opacity=".42" filter="url(#b3)"/>`)
add(`<ellipse cx="${TX}" cy="${GY + 10}" rx="96" ry="9" fill="#050a0b" opacity=".5" filter="url(#b3)"/>`)
for (let i = 0; i < 34; i++) {
  const x = R(TX - 82, TX + 82), y = GY + R(2, 16)
  add(blade(x, y, R(8, 22), R(-6, 6), R(0.9, 1.7), pick(['#0f1d16', '#142619', '#1a3023']), 1))
}

// 가지 (잎 사이로 일부만 보임)
const branches = [
  { c: [[TX, 500], [TX + 34, 462], [TX + 76, 420], [TX + 120, 366], [TX + 150, 320]], w0: 26, w1: 3 },
  { c: [[TX - 2, 490], [TX - 40, 450], [TX - 84, 410], [TX - 124, 352], [TX - 152, 312]], w0: 24, w1: 3 },
  { c: [[TX - 2, 470], [TX + 10, 410], [TX + 2, 350], [TX + 18, 290], [TX + 8, 236]], w0: 22, w1: 3 },
  { c: [[TX + 2, 480], [TX + 52, 440], [TX + 84, 380], [TX + 70, 320], [TX + 92, 268]], w0: 16, w1: 2 },
  { c: [[TX - 2, 480], [TX - 54, 436], [TX - 80, 374], [TX - 62, 318], [TX - 84, 270]], w0: 16, w1: 2 },
]
for (const b of branches) add(`<path d="${taper(curve(b.c, 16), b.w0, b.w1)}" fill="#0d0907"/>`)

// 잎 지붕: 울퉁불퉁한 덩어리 안에 잎을 겹겹이. 달이 오른쪽 위라 그쪽 잎은 밝게.
const CX = TX + 2, CY = 340
const blobR = (th) => 1 + 0.1 * Math.sin(3 * th + 0.8) + 0.07 * Math.sin(5 * th + 2.1) + 0.05 * Math.sin(8 * th)
function leafInBlob(rx, ry, jitter = 1) {
  for (;;) {
    const x = R(-1, 1), y = R(-1, 1)
    const r = Math.hypot(x, y)
    const th = Math.atan2(y, x)
    if (r <= blobR(th) * jitter) return [CX + x * rx, CY + y * ry]
  }
}
const dark = ['#050c09', '#07110d', '#0a1712'], mid = ['#0f2319', '#13291e', '#183225'], light = ['#1f3f30', '#285040', '#2f5d4a'], rim = ['#5f8f7b', '#7aa892', '#8fbba5']
function layer(count, size, palette, rx, ry, op = 1) {
  for (let i = 0; i < count; i++) {
    const [x, y] = leafInBlob(rx, ry)
    const len = R(...size), wid = len * R(0.28, 0.42), rot = R(0, Math.PI)
    add(`<path d="${leafPath(x, y, len, wid, rot)}" fill="${pick(palette)}" opacity="${op}"/>`)
  }
}
layer(300, [30, 52], dark, 160, 130)
layer(260, [26, 44], mid, 152, 124)
layer(180, [22, 38], dark, 140, 110) // 아래/안쪽 그늘
// 달빛을 받는 오른쪽 위 잎
for (let i = 0; i < 230; i++) {
  const [x, y] = leafInBlob(150, 118, 0.98)
  const lit = ((x - CX) / 160) * 0.7 - ((y - CY) / 126) * 0.9 // 오른쪽·위쪽일수록 큼
  if (lit < -0.1 && rnd() < 0.85) continue
  const len = R(18, 36), wid = len * R(0.3, 0.42), rot = R(0, Math.PI)
  add(`<path d="${leafPath(x, y, len, wid, rot)}" fill="${pick(lit > 0.35 ? light : mid)}"/>`)
  if (lit > 0.3 && rnd() < 0.55) add(`<path d="${leafPath(x + 0.8, y - 1.2, len * 0.75, wid * 0.5, rot)}" fill="${pick(rim)}" opacity="${f(R(0.25, 0.6))}"/>`)
}
// 가장자리 잎 (윤곽을 들쭉날쭉하게)
for (let i = 0; i < 120; i++) {
  const th = R(0, Math.PI * 2), rr = blobR(th) * R(0.9, 1.06)
  const x = CX + Math.cos(th) * 158 * rr, y = CY + Math.sin(th) * 128 * rr
  const len = R(16, 30), wid = len * R(0.3, 0.42)
  const lit = Math.cos(th) * 0.6 - Math.sin(th) * 0.9 > 0.2
  add(`<path d="${leafPath(x, y, len, wid, th + R(-0.9, 0.9))}" fill="${pick(lit ? mid : dark)}"/>`)
  if (lit && rnd() < 0.5) add(`<path d="${leafPath(x + 0.8, y - 1, len * 0.7, wid * 0.5, th)}" fill="${pick(rim)}" opacity="${f(R(0.3, 0.6))}"/>`)
}
// 잎 사이로 비치는 하늘의 틈 (작은 별빛)
for (let i = 0; i < 9; i++) { const [x, y] = leafInBlob(120, 90); add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(R(0.9, 1.7))}" fill="#dfe8ff" opacity=".75"/>`) }

// ───── 낙엽 (나무 아래) ─────
const leafCols = ['#7a4f24', '#8b5a2a', '#9a6b30', '#5e3a1e', '#6b4a22', '#4d5a2c', '#6a6b30', '#7d3f23']
for (let i = 0; i < 46; i++) {
  const near = rnd() < 0.7
  const x = near ? R(60, 350) : R(0, W), y = near ? R(690, 790) : R(670, 836)
  if (inEnvelopeZone(x, y)) continue
  const size = R(8, 17), rot = R(0, Math.PI * 2), wid = size * R(0.32, 0.45), col = pick(leafCols)
  add(`<path d="${leafPath(x + 1.6, y + 2.2, size, wid, rot)}" fill="#030505" opacity=".55" filter="url(#b1)"/>`)
  add(`<path d="${leafPath(x, y, size, wid, rot)}" fill="${col}"/>`)
  add(`<path d="${leafPath(x - 0.4, y - 0.6, size * 0.7, wid * 0.45, rot)}" fill="#fff" opacity=".07"/>`)
}

// ───── 가까운 풀 (큼, 어두움, 가장자리에 틀) ─────
for (let i = 0; i < 100; i++) {
  const side = rnd()
  const x = side < 0.4 ? R(-6, 64) : side < 0.8 ? R(326, W + 6) : R(40, 350)
  const y = side < 0.8 ? R(770, 850) : R(824, 852)
  if (inEnvelopeZone(x, y)) continue
  add(blade(x, y, R(28, 80), R(-12, 12), R(1.4, 3), pick(['#0d1a13', '#101f17', '#142619', '#0a140f']), 1))
}
add(`</g>`)
// 비네트(첫 화면 영역만)
add(`<rect x="0" y="${TOP}" width="${W}" height="844" fill="url(#vig)"/>`)
add(`</svg>`)

writeFileSync(process.argv[2], out.join('\n'))
console.log('wrote', process.argv[2], (out.join('\n').length / 1024).toFixed(0) + 'KB')
