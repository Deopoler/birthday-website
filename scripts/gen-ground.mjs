// 사용법: node scripts/gen-ground.mjs src/assets/ground.svg
// 인트로 사진(tree-night.webp) 아래쪽에 얹는 '별빛 아래 어두운 풀밭' 전경 그림(배경 투명, 풀/풀꽃/낙엽/조약돌만).
// 좌표는 390 x 300 = 화면 y 544~844 영역. 사진의 언덕 아랫단이 화면 y 690 이므로 SVG y 146 아래가 순수 땅이다.
//   - 봉투가 놓이는 자리: 화면 (85~305, 705~812) → SVG (85~305, 161~268)  → 이 안은 풀을 비워 둔다
import { writeFileSync } from 'node:fs'

const W = 390
const H = 300
let seed = 20261118
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
const zone = (x, y) => x > 80 && x < 310 && y > 156 && y < 274

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

add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">`)
add(`<defs><filter id="b1"><feGaussianBlur stdDeviation="1.2"/></filter><filter id="b6"><feGaussianBlur stdDeviation="6"/></filter></defs>`)

// 별빛이 은은하게 내려앉은 풀밭 얼룩
for (let i = 0; i < 8; i++) add(`<ellipse cx="${f(R(20, 370))}" cy="${f(R(170, 290))}" rx="${f(R(30, 80))}" ry="${f(R(6, 16))}" fill="#5b6fd0" opacity="${f(R(0.05, 0.1))}" filter="url(#b6)"/>`)

// 뒤쪽 풀(작고 어두움, 끝이 별빛을 받아 살짝 푸름)
const dark = ['#04060f', '#060a16', '#080d1c', '#050812']
for (let i = 0; i < 330; i++) {
  const x = R(-4, W + 4), y = R(150, 290)
  if (zone(x, y) && rnd() < 0.94) continue
  const depth = (y - 140) / 160
  const h = R(5, 10) + depth * R(6, 18)
  add(blade(x, y, h, R(-6, 6), 0.7 + depth * 0.9, pick(dark), R(0.8, 1)))
  if (rnd() < 0.22) add(`<circle cx="${f(x)}" cy="${f(y - h)}" r="0.9" fill="#7f95ff" opacity="${f(R(0.25, 0.6))}"/>`)
}

// 풀꽃: 별빛에 희미하게 빛나는 점
for (let i = 0; i < 40; i++) {
  const x = R(6, W - 6), y = R(160, 288)
  if (zone(x, y)) continue
  const s = 1 + ((y - 140) / 160) * 1.6
  const col = pick(['#dfe6ff', '#cfd9ff', '#f0ecff', '#ffe9c9'])
  add(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(x)}" y2="${f(y + s * 4)}" stroke="#070b18" stroke-width=".9"/>`)
  add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 2.2)}" fill="${col}" opacity=".16" filter="url(#b1)"/>`)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    add(`<circle cx="${f(x + Math.cos(a) * s)}" cy="${f(y + Math.sin(a) * s)}" r="${f(s * 0.6)}" fill="${col}" opacity=".8"/>`)
  }
  add(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.45)}" fill="#e8c76a"/>`)
}

// 낙엽(어둡게, 테두리에만 별빛)
const leafCols = ['#2a1f19', '#33241a', '#3b2a1c', '#241b16', '#2c2a18']
for (let i = 0; i < 26; i++) {
  const x = R(20, 372), y = R(158, 288)
  if (zone(x, y)) continue
  const size = R(7, 15), rot = R(0, Math.PI * 2), wid = size * R(0.32, 0.45)
  add(`<path d="${leafPath(x + 1.4, y + 2, size, wid, rot)}" fill="#02030a" opacity=".6" filter="url(#b1)"/>`)
  add(`<path d="${leafPath(x, y, size, wid, rot)}" fill="${pick(leafCols)}"/>`)
  add(`<path d="${leafPath(x - 0.4, y - 0.7, size * 0.7, wid * 0.4, rot)}" fill="#7f95ff" opacity=".12"/>`)
}
// 조약돌
for (let i = 0; i < 14; i++) {
  const x = R(8, W - 8), y = R(165, 290)
  if (zone(x, y)) continue
  const rx = R(2.5, 6), ry = rx * R(0.55, 0.8)
  add(`<ellipse cx="${f(x + 1.2)}" cy="${f(y + 1.6)}" rx="${f(rx)}" ry="${f(ry)}" fill="#02030a" opacity=".55"/>`)
  add(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${pick(['#171c33', '#1c2240', '#141a30'])}"/>`)
  add(`<ellipse cx="${f(x - rx * 0.25)}" cy="${f(y - ry * 0.3)}" rx="${f(rx * 0.5)}" ry="${f(ry * 0.35)}" fill="#7f95ff" opacity=".3"/>`)
}

// 가까운 풀(크고 아주 어두움: 화면 가장자리에 틀을 만든다)
for (let i = 0; i < 90; i++) {
  const side = rnd()
  const x = side < 0.4 ? R(-6, 64) : side < 0.8 ? R(326, W + 6) : R(40, 350)
  const y = side < 0.8 ? R(240, 306) : R(286, 308)
  if (zone(x, y)) continue
  add(blade(x, y, R(28, 78), R(-12, 12), R(1.4, 3), pick(['#010208', '#02030a', '#03050d']), 1))
}
add(`</svg>`)

writeFileSync(process.argv[2], out.join('\n'))
console.log('wrote', process.argv[2], (out.join('\n').length / 1024).toFixed(0) + 'KB')
