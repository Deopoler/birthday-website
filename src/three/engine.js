import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { stepTweens, clearTweens } from './util'

// 렌더러 + 후처리(빛 번짐) + 프레임 루프 + 기기 성능에 따른 품질 자동 조절.
// 품질 단계: 2(높음) → 1(중간: 해상도 낮춤) → 0(낮음: 빛 번짐 끔, 해상도 1배)
export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.setClearColor(0x02030a, 1)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.12, 1200)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.7, 0.72)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  const coarse = window.matchMedia('(pointer: coarse)').matches
  const state = { tier: 2, w: 1, h: 1, dpr: 1, time: 0, running: false, coarse }
  const maxDpr = () => [1, 1.5, coarse ? 2 : 1.75][state.tier]
  const resizeFns = new Set()
  const updateFns = new Set()

  function resize() {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    state.w = w
    state.h = h
    state.dpr = Math.min(window.devicePixelRatio || 1, maxDpr())
    renderer.setPixelRatio(state.dpr)
    renderer.setSize(w, h, false)
    composer.setPixelRatio(state.dpr)
    composer.setSize(w, h)
    bloom.enabled = state.tier > 0
    camera.aspect = w / h
    // 세로 화면은 위아래로 넓게(60°), 가로 화면은 좌우가 너무 넓어지지 않게 조금 좁힌다
    camera.fov = w / h < 1 ? 62 : 50
    camera.updateProjectionMatrix()
    for (const f of resizeFns) f(state)
  }

  // 프레임 시간 이동 평균으로 품질을 내린다(올리지는 않는다: 오르내림 반복 방지)
  let acc = 0
  let frames = 0
  let warm = 0
  function probe(dt) {
    if (warm < 40) { warm++; return } // 셰이더 컴파일·텍스처 업로드가 끝난 뒤부터 잰다
    acc += dt
    frames++
    if (frames < 50) return
    const avg = acc / frames
    acc = 0
    frames = 0
    if (avg > 1 / 38 && state.tier > 0) {
      state.tier--
      warm = 0
      resize()
    }
  }

  let raf = 0
  let last = 0
  function frame(now) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
    last = now
    if (document.hidden) return
    state.time += dt
    stepTweens(dt)
    for (const f of updateFns) f(dt, state.time)
    composer.render(dt) // 빛 번짐을 꺼도 색 변환(OutputPass)은 같은 경로로 한다
    probe(dt)
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  window.addEventListener('orientationchange', resize)

  return {
    renderer, scene, camera, bloom, state,
    onResize: (f) => { resizeFns.add(f); return () => resizeFns.delete(f) },
    onUpdate: (f) => { updateFns.add(f); return () => updateFns.delete(f) },
    start() {
      if (state.running) return
      state.running = true
      resize()
      last = performance.now()
      raf = requestAnimationFrame(frame)
    },
    dispose() {
      state.running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('orientationchange', resize)
      clearTweens()
      scene.traverse((o) => {
        o.geometry?.dispose?.()
        const m = o.material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else if (m) {
          for (const k in m.uniforms || {}) m.uniforms[k]?.value?.dispose?.()
          m.map?.dispose?.()
          m.dispose()
        }
      })
      composer.dispose()
      renderer.dispose()
    },
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
