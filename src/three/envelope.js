import * as THREE from 'three'

export const ENV_W = 0.46
export const ENV_H = 0.31
const FLAP_H = ENV_H * 0.62

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const redraw = () => {
    draw(c.getContext('2d'), w, h)
    tex.needsUpdate = true
  }
  redraw()
  return { tex, redraw }
}

function paper(g, w, h, base) {
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  // 종이 결: 옅은 얼룩과 섬유
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${i % 2 ? 120 : 255}, ${i % 2 ? 90 : 250}, ${i % 2 ? 50 : 235}, ${0.025 + (i % 5) * 0.006})`
    const x = (i * 97.13) % w
    const y = (i * 53.71) % h
    g.fillRect(x, y, 1 + (i % 7) * 3, 1)
  }
}

// 케이크 그림(이모지는 기기마다 모양·색이 달라서 직접 그린다). (cx, by) = 접시 가운데 바닥, s = 크기
function drawCake(g, cx, by, s) {
  const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill() }
  g.save()
  g.beginPath(); g.ellipse(cx, by, s * 0.78, s * 0.09, 0, 0, Math.PI * 2); g.fillStyle = '#e9dcc3'; g.fill()
  rr(cx - s * 0.6, by - s * 0.5, s * 1.2, s * 0.5, s * 0.07, '#f3a9bd') // 아래 단
  rr(cx - s * 0.42, by - s * 0.88, s * 0.84, s * 0.4, s * 0.07, '#ffd98c') // 위 단
  // 흘러내린 크림
  const drip = (x0, x1, y, n, fill) => {
    g.fillStyle = fill
    g.beginPath(); g.moveTo(x0, y)
    const step = (x1 - x0) / n
    for (let i = 0; i < n; i++) g.quadraticCurveTo(x0 + step * (i + 0.5), y + s * (i % 2 ? 0.2 : 0.13), x0 + step * (i + 1), y)
    g.lineTo(x1, y - s * 0.07); g.quadraticCurveTo(cx, y - s * 0.13, x0, y - s * 0.07); g.closePath(); g.fill()
  }
  drip(cx - s * 0.6, cx + s * 0.6, by - s * 0.46, 6, '#fff7ee')
  drip(cx - s * 0.42, cx + s * 0.42, by - s * 0.84, 4, '#fff7ee')
  // 초와 불꽃
  for (const dx of [-0.22, 0, 0.22]) {
    rr(cx + s * dx - s * 0.025, by - s * 1.18, s * 0.05, s * 0.26, s * 0.02, dx ? '#8ec5ff' : '#ff9db0')
    const fy = by - s * 1.27
    const grd = g.createRadialGradient(cx + s * dx, fy, 0, cx + s * dx, fy, s * 0.16)
    grd.addColorStop(0, 'rgba(255, 200, 90, 0.75)'); grd.addColorStop(1, 'rgba(255, 200, 90, 0)')
    g.fillStyle = grd; g.fillRect(cx + s * dx - s * 0.2, fy - s * 0.2, s * 0.4, s * 0.4)
    g.beginPath(); g.ellipse(cx + s * dx, fy, s * 0.035, s * 0.075, 0, 0, Math.PI * 2); g.fillStyle = '#ffb02e'; g.fill()
    g.beginPath(); g.ellipse(cx + s * dx, fy + s * 0.02, s * 0.016, s * 0.035, 0, 0, Math.PI * 2); g.fillStyle = '#fff3c0'; g.fill()
  }
  // 딸기 점
  for (const dx of [-0.4, -0.13, 0.13, 0.4]) { g.beginPath(); g.arc(cx + s * dx, by - s * 0.18, s * 0.04, 0, Math.PI * 2); g.fillStyle = '#e2536f'; g.fill() }
  g.restore()
}

// 모양(Shape) 좌표를 0~1 UV로 바꾼다
function shapeGeo(pts, x0, y0, w, h) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const g = new THREE.ShapeGeometry(s)
  const uv = g.attributes.uv
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x0) / w, (p.getY(i) - y0) / h)
  return g
}

// 실제 봉투처럼 뒷판 + 주머니(앞판) + 경첩으로 열리는 뚜껑 + 밀랍 봉인 + 안에 든 편지로 만든다
export function createEnvelope() {
  const W = ENV_W
  const H = ENV_H
  const group = new THREE.Group()
  // 종이는 스스로 은은히 빛난다(달을 등지고 놓여 있어도 풀밭에서 눈에 띄게)
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide, emissive: 0xfff1d6, emissiveMap: o.map, emissiveIntensity: 0.3, ...o })

  const backT = canvasTex(256, 256, (g, w, h) => paper(g, w, h, '#e6d6b4'))
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), std({ map: backT.tex }))

  const pocketT = canvasTex(1024, 690, (g, w, h) => {
    paper(g, w, h, '#f6ecd4')
    // 접힌 선: 아래 두 모서리에서 가운데로 모이는 옅은 그림자
    g.strokeStyle = 'rgba(120, 90, 50, 0.22)'
    g.lineWidth = 3
    g.beginPath(); g.moveTo(0, h); g.lineTo(w / 2, h * 0.42); g.lineTo(w, h); g.stroke()
    g.fillStyle = '#5a3d22'
    g.textAlign = 'center'
    g.font = `${h * 0.17}px "Nanum Pen Script", cursive`
    g.fillText('To. 하진 순장님께', w / 2, h * 0.84)
  })
  const notch = -H * 0.06
  const pocket = new THREE.Mesh(
    shapeGeo([[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [0, notch], [-W / 2, H / 2]], -W / 2, -H / 2, W, H),
    std({ map: pocketT.tex }),
  )
  pocket.position.z = 0.004

  const flapT = canvasTex(512, 320, (g, w, h) => {
    paper(g, w, h, '#efe2c4')
    const grd = g.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, 'rgba(255,255,255,0.25)')
    grd.addColorStop(1, 'rgba(110,80,40,0.18)')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
  })
  const flapPivot = new THREE.Group()
  flapPivot.position.set(0, H / 2, 0.006)
  const flap = new THREE.Mesh(shapeGeo([[-W / 2, 0], [W / 2, 0], [0, -FLAP_H]], -W / 2, -FLAP_H, W, FLAP_H), std({ map: flapT.tex }))
  flapPivot.add(flap)

  // 밀랍 봉인: 납작한 원반 + 도톰한 테두리
  const wax = new THREE.MeshStandardMaterial({ color: 0x9b1b22, roughness: 0.38, metalness: 0.05, emissive: 0x7a1016, emissiveIntensity: 0.35 })
  const seal = new THREE.Group()
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.008, 28), wax)
  disc.rotation.x = Math.PI / 2
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.006, 8, 28), wax)
  rim.position.z = 0.004
  const heart = new THREE.Shape()
  heart.moveTo(0, -0.014)
  heart.bezierCurveTo(-0.03, 0.006, -0.012, 0.024, 0, 0.01)
  heart.bezierCurveTo(0.012, 0.024, 0.03, 0.006, 0, -0.014)
  const hm = new THREE.Mesh(new THREE.ExtrudeGeometry(heart, { depth: 0.004, bevelEnabled: false }), wax)
  hm.position.z = 0.003
  seal.add(disc, rim, hm)
  seal.position.set(0, -FLAP_H + 0.012, 0.005)
  flapPivot.add(seal)

  const letterT = canvasTex(1024, 700, (g, w, h) => {
    paper(g, w, h, '#fffaf0')
    g.strokeStyle = 'rgba(190, 150, 90, 0.55)'
    g.lineWidth = 5
    g.strokeRect(28, 28, w - 56, h - 56)
    g.lineWidth = 1.5
    g.strokeRect(42, 42, w - 84, h - 84)
    drawCake(g, w / 2, h * 0.5, h * 0.3)
    g.textAlign = 'center'
    g.fillStyle = '#c0556f'
    // 글꼴에 따라 폭이 달라지므로 편지 폭의 78%에 맞춘다
    let fs = h * 0.135
    g.font = `${fs}px "Pacifico", cursive`
    fs *= Math.min(1, (w * 0.78) / g.measureText('HAPPY BIRTHDAY!').width)
    g.font = `${fs}px "Pacifico", cursive`
    g.fillText('HAPPY BIRTHDAY!', w / 2, h * 0.82)
  })
  const letter = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.9, H * 0.9),
    new THREE.MeshStandardMaterial({ map: letterT.tex, roughness: 0.85, side: THREE.DoubleSide, emissive: 0xfff0d0, emissiveMap: letterT.tex, emissiveIntensity: 0.42 }),
  )
  letter.position.z = 0.002

  // 열릴 때 안에서 새어 나오는 따뜻한 빛
  const glow = new THREE.PointLight(0xffc27a, 0, 2.2, 2)
  glow.position.set(0, 0.06, 0.3)

  group.add(back, letter, pocket, flapPivot, glow)

  // 글꼴이 늦게 도착하면 글씨를 다시 그린다
  const fonts = document.fonts
  if (fonts?.load) {
    Promise.all([fonts.load('40px "Nanum Pen Script"', 'To. 하진 순장님께'), fonts.load('40px "Pacifico"', 'HAPPY BIRTHDAY!')])
      .then(() => { pocketT.redraw(); letterT.redraw() })
      .catch(() => {})
  }

  const shell = [back.material, pocket.material, flap.material, wax]
  return {
    group, flapPivot, letter, glow,
    // 사라질 때만 반투명으로 바꾼다(평소에 반투명이면 겹친 종이끼리 그리는 순서가 뒤섞여 보인다)
    setShellOpacity(a) {
      for (const m of shell) {
        const t = a < 1
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true }
        m.opacity = a
      }
    },
    setShellGlow(v) { for (const m of shell) m.emissiveIntensity = v },
  }
}
