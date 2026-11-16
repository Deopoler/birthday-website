import * as THREE from 'three'
import { createEngine } from './engine'
import { createSky } from './sky'
import { createGround, groundH, ENVELOPE_POS, MOON_DIR, TREE_POS } from './ground'
import { createTree } from './tree'
import { createEnvelope, ENV_W, ENV_H } from './envelope'
import { createConstellation } from './constellation'
import { createFireworks } from './fireworks'
import { createPhotos } from './photos'
import { tween, ease, smooth, lerp, rng } from './util'
import { MAX_GRID_WIDTH } from '../photoLayout'
import { portraitLayout, landscapeLayout } from '../data/constellation'

// 하나로 이어진 3D 세계와 카메라 연출.
//  풀밭(봉투) ──고개를 든다──▶ 별자리 하늘 ──앞으로 날아간다──▶ 별 사이의 사진들 ──벽을 따라 내려간다──▶
const DC = 40 // 카메라 → 별자리 평면 거리
const FLY = 70 // 별자리 화면에서 사진 화면까지 날아가는 거리
const DW = 12 // 카메라 → 사진 평면 거리
export const GRID_TOP = 150 // 사진 구역 맨 위에서 첫 사진까지(px)
export const LANDSCAPE_Q = '(orientation: landscape) and (max-height: 500px)'

const EYE = new THREE.Vector3(0, 1.55, 1.6)
const ELEV = THREE.MathUtils.degToRad(73)
// 살짝 오른쪽 하늘을 올려다본다: 나무가 화면 왼쪽 아래 구석에만 걸려 글자 뒤를 가리지 않는다
const YAW = THREE.MathUtils.degToRad(15)
const SKY_DIR = new THREE.Vector3(Math.sin(YAW) * Math.cos(ELEV), Math.sin(ELEV), -Math.cos(YAW) * Math.cos(ELEV))

function createDeepField(n) {
  // 별자리와 사진 사이 공간에 흩어진 가까운 별들: 날아갈 때 곁을 스쳐 지나간다
  const r = rng(8)
  const pos = new Float32Array(n * 3)
  const ph = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    pos.set([(r() - 0.5) * 90, (r() - 0.5) * 120, -6 - r() * 120], i * 3)
    ph[i] = r() * 6.283
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1))
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uFade: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aPh; uniform float uTime, uPx; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = max(0.5, -mv.z);
        gl_PointSize = clamp(uPx * 46.0 / d, 1.0, 26.0 * uPx);
        vA = smoothstep(0.6, 4.0, d) * (0.6 + 0.4 * sin(uTime * 1.6 + aPh)) * (0.5 + 0.5 * fract(aPh * 7.0));
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; uniform float uFade; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(0.8, 0.87, 1.0) * exp(-r * r * 6.0) * vA * uFade, 1.0); }`,
  })
  const p = new THREE.Points(g, m)
  p.frustumCulled = false
  return p
}

function createSparkles() {
  // 봉투 위에서 반짝이는 가루: '여기를 봐' 하는 표시
  const r = rng(31)
  const n = 14
  const pos = new Float32Array(n * 3)
  const ph = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    pos.set([(r() - 0.5) * 0.9, 0.1 + r() * 0.7, (r() - 0.5) * 0.6], i * 3)
    ph[i] = r() * 6.283
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1))
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aPh; uniform float uTime, uPx; varying float vA;
      void main(){
        vec3 p = position; p.y += 0.12 * sin(uTime * 0.6 + aPh);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = pow(max(0.0, sin(uTime * 1.9 + aPh * 3.0)), 6.0);
        gl_PointSize = uPx * 70.0 / max(1.0, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; uniform float uFade; varying float vA;
      void main(){
        vec2 p = gl_PointCoord - 0.5; float r = length(p) * 2.0;
        float sp = exp(-abs(p.x) * 50.0) * exp(-abs(p.y) * 7.0) + exp(-abs(p.y) * 50.0) * exp(-abs(p.x) * 7.0);
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.7) * (exp(-r * r * 30.0) * 2.0 + sp) * vA * uFade, 1.0);
      }`,
  })
  const p = new THREE.Points(g, m)
  p.frustumCulled = false
  return p
}

export function createWorld(canvas, { photos, starCount, onLayout, onFrame }) {
  const engine = createEngine(canvas)
  const { scene, camera } = engine

  // ── 조명: 차가운 달빛 + 옅은 하늘빛 + 봉투를 들었을 때 앞을 비추는 따뜻한 빛 ──
  const moonLight = new THREE.DirectionalLight(0x9fb6ff, 1.5)
  moonLight.position.copy(MOON_DIR).multiplyScalar(10)
  const hemi = new THREE.HemisphereLight(0x2a3a6a, 0x05080a, 1.2)
  const lantern = new THREE.PointLight(0xffe2b8, 0, 3, 1.6)
  scene.add(moonLight, hemi, lantern)

  const sky = createSky(engine)
  const ground = createGround(engine)
  const tree = createTree(engine)
  tree.group.position.set(TREE_POS.x, groundH(TREE_POS.x, TREE_POS.z), TREE_POS.z)
  sky.group.add(ground.moon)
  const env = createEnvelope()
  const sparkles = createSparkles()
  const cons = createConstellation(engine)
  const fw = createFireworks(engine)
  cons.group.add(fw.points)
  const deep = createDeepField(engine.state.coarse ? 500 : 900)
  const wall = createPhotos(engine, photos)
  wall.group.visible = false
  scene.add(sky.group, ground.group, tree.group, env.group, sparkles, cons.group, deep, wall.group)

  // ── 카메라 자세 ──
  const qGround = new THREE.Quaternion()
  const qSky = new THREE.Quaternion()
  {
    const m = new THREE.Matrix4()
    m.lookAt(EYE, new THREE.Vector3(-0.5, 2.25, -8), new THREE.Vector3(0, 1, 0))
    qGround.setFromRotationMatrix(m)
    m.lookAt(EYE, EYE.clone().add(SKY_DIR), new THREE.Vector3(0, 1, 0))
    qSky.setFromRotationMatrix(m)
  }
  const upS = new THREE.Vector3(0, 1, 0).applyQuaternion(qSky)
  cons.group.quaternion.copy(qSky)
  cons.group.position.copy(EYE).addScaledVector(SKY_DIR, DC)
  wall.group.quaternion.copy(qSky)
  wall.group.position.copy(EYE).addScaledVector(SKY_DIR, FLY + DW)
  deep.quaternion.copy(qSky)
  deep.position.copy(EYE)
  cons.shared.uFade.value = 0
  sky.setFocus(SKY_DIR, 0)
  tree.setView(EYE, SKY_DIR)

  // 봉투가 풀밭에 떨어져 있는 자세
  const envGroundPos = new THREE.Vector3(ENVELOPE_POS.x, groundH(ENVELOPE_POS.x, ENVELOPE_POS.z) + 0.11, ENVELOPE_POS.z)
  const envGroundQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.02, 0.1, 0.34, 'YXZ'))
  const ENV_GROUND_SCALE = 1.7
  env.group.position.copy(envGroundPos)
  env.group.quaternion.copy(envGroundQ)
  env.group.scale.setScalar(ENV_GROUND_SCALE)
  sparkles.position.copy(envGroundPos)

  const S = {
    phase: 'closed', // closed | lift | opening | leaving | sky
    look: 0, // 0 = 풀밭을 봄, 1 = 하늘을 올려다봄
    lift: 0, // 봉투가 손에 들린 정도
    envDrop: 0, // 편지를 꺼낸 뒤 봉투가 아래로 내려간 정도
    fly: 0, // 별자리 → 사진으로 날아간 정도(스크롤)
    pan: 0, // 사진 벽을 따라 내려간 거리(px)
    intro: 0, // 별자리가 나타난 정도
    px: 0, py: 0, tx: 0, ty: 0, // 시차(손가락·기울기)
    focus: new THREE.Vector3(), focusK: 0, focusT: 0, // 열린 별 쪽으로 다가간 정도(focusT 를 부드럽게 따라간다)
    wppC: 0.05, wppW: 0.02, vw: 1, vh: 1,
    disposed: false,
  }
  const tmpQ = new THREE.Quaternion()
  const tmpV = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const fwd = new THREE.Vector3()

  // 봉투를 눈앞에 들었을 때의 자리: 화면 폭의 약 76%를 차지하는 거리
  function envFront(outPos, outQ) {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const dist = Math.max(ENV_W / (0.76 * 2 * tanH * camera.aspect), ENV_H / (0.42 * 2 * tanH))
    outPos.set(0, -0.02, -dist).applyQuaternion(camera.quaternion).add(camera.position)
    outQ.copy(camera.quaternion)
    return dist
  }

  function relayout() {
    const { w: vw, h: vh } = engine.state
    S.vw = vw
    S.vh = vh
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    S.wppC = (2 * DC * tanH) / vh
    S.wppW = (2 * DW * tanH) / vh
    const landscape = window.matchMedia(LANDSCAPE_Q).matches
    const fieldW = landscape ? Math.min(vw, vh * 2.1) : Math.min(vw, 480)
    cons.group.scale.setScalar(S.wppC)
    cons.setLayout(landscape ? landscapeLayout : portraitLayout, starCount, fieldW, vh)
    wall.group.scale.setScalar(S.wppW)
    const gridW = Math.min(MAX_GRID_WIDTH, Math.max(200, vw - 32))
    const masonry = wall.layout(vw, vh, gridW, GRID_TOP, DW / S.wppW)
    onLayout?.({ vw, vh, fieldW, landscape, gridW, masonry })
  }
  engine.onResize(relayout)

  engine.onUpdate((dt, time) => {
    // 시차: 목표로 부드럽게 따라간다
    S.px += (S.tx - S.px) * Math.min(1, dt * 3)
    S.py += (S.ty - S.py) * Math.min(1, dt * 3)

    camera.quaternion.slerpQuaternions(qGround, qSky, S.look)
    camera.position.copy(EYE).addScaledVector(SKY_DIR, FLY * S.fly).addScaledVector(upS, -S.pan * S.wppW)
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion)
    const amp = lerp(0.1, 1.1, S.look) * lerp(1, 0.22, S.fly)
    camera.position.addScaledVector(right, S.px * amp).addScaledVector(up, S.py * amp)
    S.focusK += (S.focusT - S.focusK) * Math.min(1, dt * 3.5)
    camera.position.addScaledVector(S.focus, S.focusK)
    camera.updateMatrixWorld()

    // 봉투: 풀밭 자세 ↔ 눈앞 자세
    if (env.group.visible) {
      envFront(tmpV, tmpQ)
      const k = S.lift
      env.group.position.lerpVectors(envGroundPos, tmpV, k)
      env.group.position.y += Math.sin(k * Math.PI) * 0.18 // 살짝 호를 그리며 올라온다
      env.group.quaternion.slerpQuaternions(envGroundQ, tmpQ, k)
      env.group.scale.setScalar(lerp(ENV_GROUND_SCALE, 1, k))
      if (S.envDrop > 0) {
        env.group.position.addScaledVector(up, -0.55 * S.envDrop * S.envDrop)
        env.group.rotateX(0.5 * S.envDrop)
      }
      lantern.position.copy(camera.position).addScaledVector(fwd, 0.15).addScaledVector(up, 0.25)
      lantern.intensity = 0.3 * k
      env.setShellGlow(lerp(0.42, 0.22, k))
      ground.setGlow(env.group.position, env.glow.intensity * 0.7)
    }
    sparkles.material.uniforms.uTime.value = time
    sparkles.material.uniforms.uPx.value = engine.state.dpr
    sparkles.material.uniforms.uFade.value = 1 - smooth(0, 0.3, S.lift)

    const consFade = S.intro * (1 - smooth(0.04, 0.42, S.fly))
    cons.shared.uFade.value = consFade
    cons.group.visible = consFade > 0.001
    sky.setFocus(SKY_DIR, S.intro * (1 - smooth(0.1, 0.6, S.fly)) * 0.9 + smooth(0.5, 1, S.fly) * 0.55)
    deep.material.uniforms.uTime.value = time
    deep.material.uniforms.uPx.value = engine.state.dpr
    deep.material.uniforms.uFade.value = S.look * 0.9
    wall.group.visible = S.fly > 0.02
    wall.setArrive(S.fly)
    wall.setCamY(S.pan)
    tree.group.visible = S.fly < 0.35
    tree.setDim(S.look)

    sky.aim = fwd
    sky.update(dt, time, camera)
    ground.update(dt, time)
    tree.update(dt, time)
    cons.update(dt, time)
    fw.update(dt, time)
    wall.update(dt, time)

    onFrame?.({
      starDx: (-S.px * amp) / S.wppC, starDy: (S.py * amp) / S.wppC,
      wallDx: (-S.px * amp) / S.wppW, wallDy: (S.py * amp) / S.wppW,
    })
  })

  function enterSky() {
    S.phase = 'sky'
    env.group.visible = false
    sparkles.visible = false
    ground.group.visible = false // 하늘을 보는 동안 풀밭은 화면 밖이라 그리지 않는다
    lantern.intensity = 0
  }

  const api = {
    engine,
    state: S,
    start() { engine.start() },

    // 봉투를 줍는다 → 연다 → 편지가 하늘로 올라가 별자리가 된다. onPhase 로 단계마다 알린다
    async pickUp(onPhase) {
      if (S.phase !== 'closed') return
      S.phase = 'lift'
      onPhase?.('lift')
      await tween({ dur: 1.15, easing: ease.inOut, update: (k) => (S.lift = k) })
      if (S.disposed) return

      S.phase = 'opening'
      onPhase?.('opening')
      const L = env.letter
      // 1) 뚜껑이 위로 젖혀져 봉투 뒤쪽으로 넘어간다(편지가 나올 길을 가리지 않게)
      await tween({ dur: 0.8, easing: ease.inOut, update: (k) => { env.flapPivot.rotation.x = -3.42 * k; env.glow.intensity = 0.07 * k } })
      // 2) 편지가 주머니에서 위로 완전히 빠져나온다(주머니 앞판 뒤, 뒷판·뚜껑 앞).
      //    아랫부분이 주머니 안에 남은 채로 앞으로 나오면 앞판을 뚫고 지나가 겹쳐 보이므로, 끝까지 뽑은 뒤에 움직인다
      await tween({ dur: 1.0, easing: ease.inOut, update: (k) => { L.position.y = ENV_H * 1.02 * k } })
      if (S.disposed) return
      // 3) 편지만 눈앞으로 다가오고, 봉투는 손에서 아래로 내려가며 사라진다(반투명하게 겹쳐 보이지 않게 따로 움직인다)
      scene.attach(L)
      const p0 = L.position.clone()
      const q0 = L.quaternion.clone()
      const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const dL = Math.max((ENV_W * 0.9) / (0.86 * 2 * tanH * camera.aspect), (ENV_H * 0.9) / (0.5 * 2 * tanH))
      const p1 = new THREE.Vector3(0, 0.02, -dL).applyQuaternion(camera.quaternion).add(camera.position)
      const q1 = camera.quaternion.clone()
      await tween({
        dur: 0.9, easing: ease.inOut,
        update: (k) => {
          L.position.lerpVectors(p0, p1, k)
          L.quaternion.slerpQuaternions(q0, q1, k)
          L.material.emissiveIntensity = lerp(0.42, 0.62, k)
          S.envDrop = k
          env.setShellOpacity(1 - smooth(0.35, 1, k))
          env.glow.intensity = 0.07 * (1 - k)
        },
        done: () => (env.group.visible = false),
      })
      await tween({ dur: 1.0, update: () => {} }) // 편지를 읽을 틈
      if (S.disposed) return

      S.phase = 'leaving'
      onPhase?.('leaving')
      // 편지는 별자리가 놓일 하늘로 날아가며 빛으로 변한다
      const from = L.position.clone()
      const fromQ = L.quaternion.clone()
      const to = cons.group.position.clone()
      const s0 = L.scale.x
      tween({
        dur: 2.5, easing: ease.in,
        update: (k) => {
          L.position.lerpVectors(from, to, k)
          L.position.y += Math.sin(k * Math.PI) * 1.5
          L.quaternion.copy(fromQ).multiply(tmpQ.setFromEuler(new THREE.Euler(k * 2.2, k * 5.5, k * 1.2)))
          L.scale.setScalar(lerp(s0, 2.2, k))
          L.material.emissiveIntensity = 0.62 + 2.2 * k * k * k
        },
        done: () => {
          L.visible = false
          cons.burstAt(new THREE.Vector3(0, 0, 0), true)
        },
      })
      tween({ dur: 1.3, delay: 2.2, easing: ease.out, update: (k) => (S.intro = k) })
      await tween({ dur: 3.2, easing: ease.inOut, update: (k) => (S.look = k) })
      if (S.disposed) return
      enterSky()
      onPhase?.('sky')
    },

    // 인트로를 건너뛰고 바로 별자리 화면으로(개발·검증용)
    skipIntro() {
      S.look = 1
      S.intro = 1
      S.lift = 1
      env.letter.visible = false
      enterSky()
    },

    setScroll(y, skyH) {
      if (S.phase !== 'sky' || !skyH) return
      S.fly = Math.min(1, Math.max(0, y / skyH))
      S.pan = Math.max(0, y - skyH)
    },
    setPointer(x, y) {
      S.tx = Math.max(-1, Math.min(1, x))
      S.ty = Math.max(-1, Math.min(1, y))
    },

    openStar(i) {
      cons.open(i)
      cons.setActive(i)
      cons.burst(i)
      // 별 쪽으로 살짝 다가간다
      S.focus.copy(cons.worldPos(i)).sub(camera.position).multiplyScalar(0.07)
      S.focusT = 1
    },
    closeStar(i) {
      cons.setActive(null)
      cons.burst(i)
      S.focusT = 0
    },
    // 모두 열었을 때: 별자리가 일렁이고, 불꽃이 터지고, 별똥별이 쏟아진다
    finale() {
      cons.celebrate()
      sky.shower(9)
      const r = rng(Date.now() % 1000)
      for (let i = 0; i < 14; i++) {
        tween({
          dur: 0.01, delay: 0.3 + i * 0.42 + r() * 0.2,
          done: () => fw.launch(new THREE.Vector3((r() - 0.5) * S.vw * 0.8, (r() - 0.3) * S.vh * 0.6, -200 - r() * 300), 300 + r() * 220),
        })
      }
    },
    openPhoto: (i) => wall.open(i),
    closePhoto: () => wall.close(),

    dispose() {
      S.disposed = true
      engine.dispose()
    },
  }
  return api
}
