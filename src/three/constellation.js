import * as THREE from 'three'
import { tween, ease } from './util'

// '이하진' 별자리. 그룹의 지역 좌표 단위는 '화면 픽셀'(가운데가 원점, y는 위쪽)이고,
// 세계 쪽에서 그룹 scale 을 (세계 길이/픽셀)로 맞춰 2D 배치와 똑같은 자리에 보이게 한다.
const parsePath = (d) => d.slice(1).split('L').map((s) => s.split(' ').map(Number))

const STAR_VS = /* glsl */ `
  attribute vec4 aS; // x: 열림(0~1), y: 숨김(0~1), z: 위상, w: 크기 배율
  uniform float uTime, uPx, uCele;
  varying vec4 vS; varying float vPulse;
  void main(){
    vS = aS;
    float pulse = 0.5 + 0.5 * sin(uTime * 2.2 + aS.z);
    vPulse = pulse;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    float size = mix(34.0 + 8.0 * pulse, 46.0, aS.x) * aS.w * (1.0 + 0.25 * uCele * sin(uTime * 5.0 + aS.z * 3.0));
    gl_PointSize = size * uPx * (1.0 - aS.y);
  }`
const STAR_FS = /* glsl */ `
  precision highp float;
  uniform float uFade;
  varying vec4 vS; varying float vPulse;
  void main(){
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    float core = exp(-r * r * 55.0);
    float halo = exp(-r * r * 7.0) * 0.38;
    float sp = exp(-abs(p.x) * 70.0) * exp(-abs(p.y) * 9.0) + exp(-abs(p.y) * 70.0) * exp(-abs(p.x) * 9.0);
    vec3 cold = vec3(0.72, 0.82, 1.0);
    vec3 gold = vec3(1.0, 0.80, 0.36);
    vec3 col = mix(cold, gold, vS.x);
    float a = core * 2.6 + halo * mix(0.55 + 0.6 * vPulse, 1.25, vS.x) + sp * mix(0.35 + 0.35 * vPulse, 0.8, vS.x);
    a *= smoothstep(1.0, 0.7, r);
    gl_FragColor = vec4((col * a + vec3(1.0) * core * 1.5) * uFade * (1.0 - vS.y), 1.0);
  }`

const DECOR_VS = /* glsl */ `
  attribute float aLit; attribute float aPh;
  uniform float uTime, uPx;
  varying float vLit; varying float vTw;
  void main(){
    vLit = aLit; vTw = 0.7 + 0.3 * sin(uTime * 1.7 + aPh);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = mix(5.0, 9.0, aLit) * uPx;
  }`
const DECOR_FS = /* glsl */ `
  precision highp float; uniform float uFade; varying float vLit; varying float vTw;
  void main(){
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-r * r * 9.0);
    vec3 col = mix(vec3(0.55, 0.64, 0.95) * 0.5, vec3(1.0, 0.84, 0.46) * 1.5, vLit);
    gl_FragColor = vec4(col * a * vTw * uFade, 1.0);
  }`

const LINE_VS = /* glsl */ `
  attribute float aLen; attribute float aSide;
  varying float vLen; varying float vSide;
  void main(){ vLen = aLen; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const LINE_FS = /* glsl */ `
  precision highp float;
  uniform float uProg, uFade, uTime, uCele;
  varying float vLen; varying float vSide;
  void main(){
    float vis = smoothstep(uProg + 0.001, uProg - 0.04, vLen);
    float hd = (vLen - uProg) * 9.0;
    float head = exp(-hd * hd) * step(uProg, 0.999) * step(0.001, uProg);
    float d = abs(vSide);
    float core = exp(-d * d * 60.0);
    float glow = exp(-d * d * 5.0) * 0.32;
    float shimmer = 1.0 + uCele * 0.6 * sin(uTime * 4.0 - vLen * 9.0);
    vec3 col = vec3(1.0, 0.84, 0.48) * (core * 1.5 + glow) * vis * shimmer + vec3(1.0, 0.95, 0.8) * head * (core + glow) * 2.5;
    gl_FragColor = vec4(col * uFade, 1.0);
  }`

const RING_FS = /* glsl */ `
  precision highp float; varying vec2 vUv; uniform float uK;
  void main(){
    vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
    float rd = (r - uK * 0.92) * 22.0; // 음수를 pow 하면 NaN 이 되어 빛 번짐이 화면 전체를 검게 만든다 → 직접 제곱
    float ring = exp(-rd * rd) * (1.0 - uK) * 0.7;
    float flare = exp(-r * r * mix(3.0, 30.0, uK)) * (1.0 - uK) * 1.6;
    float rays = pow(abs(cos(atan(p.y, p.x) * 6.0)), 24.0) * exp(-r * 3.0) * (1.0 - uK);
    gl_FragColor = vec4(vec3(1.0, 0.88, 0.6) * (ring + flare + rays * 0.8), 1.0);
  }`

export function createConstellation(engine) {
  const group = new THREE.Group()
  const shared = { uTime: { value: 0 }, uPx: { value: 1 }, uFade: { value: 1 }, uCele: { value: 0 } }
  const add = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }

  const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ ...add, uniforms: shared, vertexShader: STAR_VS, fragmentShader: STAR_FS }))
  const decor = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ ...add, uniforms: shared, vertexShader: DECOR_VS, fragmentShader: DECOR_FS }))
  const lines = new THREE.Group()
  stars.frustumCulled = decor.frustumCulled = false
  stars.renderOrder = 3
  lines.renderOrder = 2
  group.add(decor, lines, stars)

  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({ ...add, uniforms: { uK: { value: 1 } }, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: RING_FS }),
  )
  ring.visible = false
  ring.renderOrder = 4
  group.add(ring)

  let data = null // 현재 배치(세로/가로)
  let count = 0
  let dims = { fw: 1, vh: 1 }
  let starS = null // Float32Array(count*4)
  let litNow = null
  let segs = [] // { a, b, mesh, prog, on }
  const opened = new Set()
  let active = -1
  const local = (x, y) => [(x - 0.5) * dims.fw, (0.5 - y) * dims.vh, 0]

  function buildLine(d) {
    const pts = parsePath(d).map(([x, y]) => local(x / 100, y / 100))
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    const total = cum[cum.length - 1] || 1
    const HW = 9 // 띠의 반폭(px): 가운데 심 + 빛 번짐
    const pos = []
    const len = []
    const side = []
    const idx = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(pts.length - 1, i + 1)]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const l = Math.hypot(dx, dy) || 1
      const nx = -dy / l
      const ny = dx / l
      pos.push(pts[i][0] + nx * HW, pts[i][1] + ny * HW, 0, pts[i][0] - nx * HW, pts[i][1] - ny * HW, 0)
      len.push(cum[i] / total, cum[i] / total)
      side.push(1, -1)
      if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aLen', new THREE.Float32BufferAttribute(len, 1))
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
    g.setIndex(idx)
    return g
  }

  function rebuild() {
    if (!data) return
    const sp = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) sp.set(local(data.constellation[i].x, data.constellation[i].y), i * 3)
    if (!starS || starS.length !== count * 4) {
      starS = new Float32Array(count * 4)
      for (let i = 0; i < count; i++) starS.set([opened.has(i) ? 1 : 0, 0, i * 1.7, 1], i * 4)
    }
    stars.geometry.dispose()
    stars.geometry = new THREE.BufferGeometry()
    stars.geometry.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    stars.geometry.setAttribute('aS', new THREE.BufferAttribute(starS, 4))

    const ds = data.decorStars
    const dp = new Float32Array(ds.length * 3)
    const ph = new Float32Array(ds.length)
    if (!litNow || litNow.length !== ds.length) litNow = new Float32Array(ds.length)
    ds.forEach((s, i) => { dp.set(local(s.x, s.y), i * 3); ph[i] = i * 2.4 })
    decor.geometry.dispose()
    decor.geometry = new THREE.BufferGeometry()
    decor.geometry.setAttribute('position', new THREE.BufferAttribute(dp, 3))
    decor.geometry.setAttribute('aLit', new THREE.BufferAttribute(litNow, 1))
    decor.geometry.setAttribute('aPh', new THREE.BufferAttribute(ph, 1))

    const old = segs
    for (const s of old) { s.mesh.geometry.dispose(); lines.remove(s.mesh) }
    segs = data.strokeSegments.filter((s) => s.a < count && s.b < count).map((s, i) => {
      const prev = old[i]
      const mat = prev?.mesh.material ?? new THREE.ShaderMaterial({ ...add, uniforms: { ...shared, uProg: { value: 0 } }, vertexShader: LINE_VS, fragmentShader: LINE_FS })
      const mesh = new THREE.Mesh(buildLine(s.d), mat)
      mesh.frustumCulled = false
      lines.add(mesh)
      return { a: s.a, b: s.b, mesh, on: prev?.on ?? false }
    })
  }

  function syncSegs(animate) {
    for (const s of segs) {
      const want = opened.has(s.a) && opened.has(s.b)
      if (want === s.on) continue
      s.on = want
      const u = s.mesh.material.uniforms.uProg
      if (want && animate) tween({ dur: 0.95, delay: 0.25, easing: ease.inOut, update: (k) => (u.value = k) })
      else u.value = want ? 1 : 0
    }
  }

  return {
    group, shared,
    setLayout(layoutData, n, fw, vh) {
      data = layoutData
      count = n
      dims = { fw, vh }
      rebuild()
      syncSegs(false)
    },
    localPos(i) {
      const [x, y] = local(data.constellation[i].x, data.constellation[i].y)
      return new THREE.Vector3(x, y, 0)
    },
    worldPos(i) { return group.localToWorld(this.localPos(i)) },
    open(i) {
      opened.add(i)
      syncSegs(true)
    },
    setActive(i) { active = i ?? -1 },
    // 별이 터지며 빛의 고리가 퍼진다
    burst(i, big = false) { return this.burstAt(this.localPos(i), big) },
    burstAt(p, big = false) {
      ring.position.copy(p)
      ring.visible = true
      const u = ring.material.uniforms.uK
      const size = big ? 520 : 300
      return tween({ dur: big ? 1.1 : 0.8, easing: ease.out, update: (k) => { u.value = k; ring.scale.setScalar(size * (0.35 + 0.65 * k)) }, done: () => (ring.visible = false) })
    },
    celebrate() {
      tween({ dur: 1.2, update: (k) => (shared.uCele.value = k) })
    },
    update(dt, time) {
      shared.uTime.value = time
      shared.uPx.value = engine.state.dpr
      if (!data || !starS) return
      const k = Math.min(1, dt * 5)
      for (let i = 0; i < count; i++) {
        const o = i * 4
        starS[o] += ((opened.has(i) ? 1 : 0) - starS[o]) * k
        starS[o + 1] += ((active === i ? 1 : 0) - starS[o + 1]) * Math.min(1, dt * 9)
      }
      stars.geometry.attributes.aS.needsUpdate = true
      const ds = data.decorStars
      for (let i = 0; i < ds.length; i++) litNow[i] += ((opened.has(ds[i].near) ? 1 : 0) - litNow[i]) * Math.min(1, dt * 2.5)
      decor.geometry.attributes.aLit.needsUpdate = true
    },
  }
}
