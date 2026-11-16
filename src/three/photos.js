import * as THREE from 'three'
import { NOTE_COLORS, INNER_W, tilt, computeMasonry, finalBox } from '../photoLayout'
import { tween, ease, rng, smooth } from './util'

// 별 사이에 떠 있는 포스트잇 사진들. 그룹 지역 좌표 단위는 '화면 픽셀'이고, 원점은 사진 구역 맨 위가 화면 맨 위에 닿았을 때의 화면 가운데.
const NOTE_VS = /* glsl */ `
  uniform float uCurl, uTime, uPhase;
  varying vec2 vUv; varying float vLift;
  void main(){
    vUv = uv;
    vec3 p = position;
    // 종이 말림: 아래쪽 모서리가 앞으로 들리고, 바람에 살짝 팔랑인다
    float low = pow(1.0 - uv.y, 2.2);
    float lift = uCurl * low * (0.55 + 0.9 * pow(abs(uv.x - 0.5) * 2.0, 1.5)) * (1.0 + 0.25 * sin(uTime * 1.3 + uPhase + uv.x * 2.0));
    p.z += lift * 0.085;
    vLift = lift;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`
const NOTE_FS = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex; uniform float uHasTex, uTexAspect, uHW, uDim, uFade;
  uniform vec3 uPaper, uPhoto;
  varying vec2 vUv; varying float vLift;
  void main(){
    // 여백: 좌우·위 7.5%, 아래 13.5% (카드 폭 기준)
    float padX = 0.075;
    float padT = 0.075 / uHW;
    float padB = 0.135 / uHW;
    vec2 q = vec2((vUv.x - padX) / (1.0 - 2.0 * padX), (vUv.y - padB) / (1.0 - padT - padB));
    vec3 paper = uPaper * (0.80 + 0.14 * vUv.y + 0.06 * vUv.x);
    paper *= 1.0 - 0.10 * vLift;
    vec3 col = paper;
    if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
      vec3 ph = uPhoto;
      if (uHasTex > 0.5) {
        // cover: 사진 영역 비율에 맞춰 가운데를 잘라 채운다
        float area = ${INNER_W.toFixed(3)} / (uHW - 0.21);
        vec2 s = uTexAspect > area ? vec2(area / uTexAspect, 1.0) : vec2(1.0, uTexAspect / area);
        ph = texture2D(uTex, (q - 0.5) * s + 0.5).rgb;
      }
      // 사진 가장자리의 얕은 안쪽 그림자
      float e = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
      col = ph * (0.88 + 0.12 * smoothstep(0.0, 0.03, e)) * 1.3;
    }
    // 테이프
    float tape = step(abs(vUv.x - 0.5), 0.16) * step(1.0 - 0.07 / uHW, vUv.y);
    col = mix(col, vec3(0.95, 0.92, 0.80), tape * 0.55);
    gl_FragColor = vec4(col * 0.72 * (1.0 - uDim), uFade); // 종이는 빛 번짐 문턱 아래로, 사진은 원래 밝기에 가깝게
  }`

export function createPhotos(engine, photos) {
  const group = new THREE.Group()
  const geo = new THREE.PlaneGeometry(1, 1, 12, 12)
  const loader = new THREE.TextureLoader()
  const r = rng(77)
  const blank = new THREE.Texture()
  const loadTex = (url, cb) =>
    loader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = Math.min(8, engine.renderer.capabilities.getMaxAnisotropy())
      cb(t)
    })

  const notes = photos.map((photo, i) => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTex: { value: blank }, uHasTex: { value: 0 }, uTexAspect: { value: (photo.width || 1) / (photo.height || 1) },
        uHW: { value: 1 }, uDim: { value: 0 }, uFade: { value: 1 }, uCurl: { value: 1 }, uTime: { value: 0 }, uPhase: { value: i * 1.9 },
        uPaper: { value: new THREE.Color(NOTE_COLORS[i % NOTE_COLORS.length]) },
        uPhoto: { value: new THREE.Color(photo.color || '#888888') },
      },
      vertexShader: NOTE_VS,
      fragmentShader: NOTE_FS,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    group.add(mesh)
    const thumb = photo.thumb || photo.src
    if (thumb) loadTex(thumb, (t) => { if (!n.full) { mat.uniforms.uTex.value = t; mat.uniforms.uHasTex.value = 1 } n.thumbTex = t })
    const n = {
      mesh, mat, photo, i,
      home: new THREE.Vector3(), w: 1, h: 1,
      depth: (r() - 0.5) * 50, // 앞뒤로 조금씩 다른 깊이(시차)
      from: new THREE.Vector3((r() - 0.5) * 1400, (r() - 0.5) * 1800, -900 - r() * 900), // 모여들기 전 흩어진 자리
      spin: (r() - 0.5) * 5,
      zoom: 0, zoomTo: null, full: false, thumbTex: null,
    }
    return n
  })

  // 확대할 때 뒤를 덮는 어두운 막
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x02030c, transparent: true, opacity: 0, depthWrite: false }))
  veil.scale.set(9000, 9000, 1)
  veil.position.z = 60
  veil.visible = false
  group.add(veil)

  let dims = { vw: 1, vh: 1, gridW: 1, gridTop: 0, dpx: 1000 }
  let arrive = 0
  let active = null
  let camY = 0 // 카메라가 벽을 따라 내려간 거리(px)

  function layout(vw, vh, gridW, gridTop, dpx) {
    dims = { vw, vh, gridW, gridTop, dpx }
    const m = computeMasonry(photos, gridW, vw)
    notes.forEach((n, i) => {
      const b = m.items[i]
      n.w = b.width
      n.h = b.height
      n.home.set(b.left + b.width / 2 - gridW / 2, vh / 2 - (gridTop + b.top + b.height / 2), n.depth)
      n.mat.uniforms.uHW.value = b.height / b.width
    })
    if (active) active.zoomTo = zoomTarget(active)
    return m
  }

  // 화면 가운데에 finalBox 크기로 보이게 하는 자리와 크기(원근 보정 포함)
  function zoomTarget(n) {
    const box = finalBox(n.photo, n.i)
    const z = 120
    const k = (dims.dpx - z) / dims.dpx
    return { pos: new THREE.Vector3(0, -camY, z), w: box.width * k, h: box.height * k }
  }

  return {
    group, notes,
    layout,
    setArrive(p) { arrive = p },
    setCamY(y) { camY = y },
    open(i) {
      const n = notes[i]
      if (active || !n) return null
      active = n
      n.zoomTo = zoomTarget(n)
      n.mesh.renderOrder = 10
      veil.visible = true
      // 원본 해상도 사진은 확대할 때 불러온다
      if (!n.full && n.photo.src && n.photo.src !== n.photo.thumb) {
        n.full = true
        loadTex(n.photo.src, (t) => { n.mat.uniforms.uTex.value = t; n.mat.uniforms.uHasTex.value = 1; n.thumbTex?.dispose() })
      }
      return tween({ dur: 0.62, easing: ease.out, update: (k) => { n.zoom = k; veil.material.opacity = 0.86 * k } })
    },
    close() {
      const n = active
      if (!n) return null
      return tween({
        dur: 0.5, easing: ease.inOut,
        update: (k) => { n.zoom = 1 - k; veil.material.opacity = 0.86 * (1 - k) },
        done: () => { active = null; n.mesh.renderOrder = 0; veil.visible = false },
      })
    },
    update(dt, time) {
      if (!group.visible) return
      veil.position.y = -camY
      for (const n of notes) {
        // 별가루처럼 흩어져 있다가 차례로 날아와 제자리에 붙는다
        const a = ease.out(smooth(0.25 + (n.i % 9) * 0.045, 0.72 + (n.i % 9) * 0.03, arrive))
        const bob = Math.sin(time * 0.7 + n.i * 1.3) * 3
        const m = n.mesh
        m.position.lerpVectors(n.from, n.home, a)
        m.position.y += bob * a
        let w = n.w
        let h = n.h
        let rz = THREE.MathUtils.degToRad(tilt(n.i)) + Math.sin(time * 0.55 + n.i * 2.1) * 0.012 + (1 - a) * n.spin
        let ry = (1 - a) * n.spin * 0.7 + Math.sin(time * 0.4 + n.i) * 0.03
        const u = n.mat.uniforms
        if (n.zoom > 0 && n.zoomTo) {
          const z = n.zoom
          m.position.lerp(n.zoomTo.pos, z)
          w += (n.zoomTo.w - w) * z
          h += (n.zoomTo.h - h) * z
          rz *= 1 - z
          ry = ry * (1 - z) + Math.sin(z * Math.PI) * 0.5 // 날아오며 한 번 살짝 돌아선다
        }
        m.scale.set(w, h, w)
        m.rotation.set(0, ry, rz)
        u.uCurl.value = 1 - n.zoom
        u.uTime.value = time
        u.uFade.value = smooth(0, 0.25, a)
      }
    },
  }
}
