import * as THREE from 'three'
import { GLSL_NOISE, HORIZON, rng } from './util'

// 은하수가 흐르는 방향: 지평선(왼쪽 앞)에서 떠올라 머리 위 오른쪽으로 넘어간다
const BAND_A = new THREE.Vector3(-0.55, 0.05, -1).normalize()
const BAND_B = new THREE.Vector3(0.75, 1, 0.1).normalize()
export const BAND_N = new THREE.Vector3().crossVectors(BAND_A, BAND_B).normalize()

// 하늘 돔: 방향만으로 색을 계산하는 절차적 밤하늘(대기 그라데이션 + 은하수 구름 + 먼지 띠)
function createDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uBandN: { value: BAND_N },
      uCore: { value: BAND_A.clone().lerp(BAND_B, 0.32).normalize() },
      uHorizon: { value: new THREE.Vector3(...HORIZON) },
      uFocus: { value: new THREE.Vector3(0, 1, 0) }, // 별자리가 놓이는 방향: 그 주변 하늘을 살짝 어둡게 눌러 글씨가 또렷하게
      uFocusAmt: { value: 0 },
      uMoon: { value: new THREE.Vector3(0.15, 0.36, -0.92).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vDir;
      uniform vec3 uBandN, uCore, uHorizon, uFocus, uMoon;
      uniform float uFocusAmt;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float up = d.y;
        // 대기: 지평선은 푸르스름하게 밝고 천정은 깊은 남색
        vec3 zen = vec3(0.004, 0.007, 0.028);
        vec3 col = mix(uHorizon, zen, pow(clamp(up, 0.0, 1.0), 0.42));
        col += vec3(0.030, 0.020, 0.022) * pow(clamp(1.0 - abs(up), 0.0, 1.0), 10.0); // 지평선의 옅은 노을 잔광

        // 은하수
        float bd = dot(d, uBandN);
        float coreK = pow(clamp(dot(d, uCore) * 0.5 + 0.5, 0.0, 1.0), 2.5);
        float w = mix(0.10, 0.21, coreK);
        float band = exp(-bd * bd / (w * w));
        float n1 = fbm(d * 3.2 + 4.0);
        float n2 = fbm(d * 8.5 + vec3(2.0, 9.0, 4.0));
        float n3 = fbm(d * 21.0 + vec3(5.0, 3.0, 8.0));
        float cloud = band * (0.25 + 1.05 * n1) * (0.45 + 0.75 * n2) * (0.62 + 0.76 * n3);
        cloud = pow(cloud, 1.45);
        // 먼지 띠: 중심선을 따라 어둡게 파인다
        float lane = smoothstep(0.42, 0.66, fbm(d * 5.5 + vec3(7.0, 1.0, 3.0)) + 0.18 * exp(-bd * bd / 0.004));
        cloud *= mix(1.0, 0.12, lane * exp(-bd * bd / 0.014));
        vec3 warm = vec3(1.0, 0.80, 0.62);
        vec3 cool = vec3(0.42, 0.52, 1.0);
        vec3 mag = vec3(0.85, 0.35, 0.75);
        vec3 mw = mix(cool, warm, coreK * (0.5 + 0.5 * n1));
        mw = mix(mw, mag, 0.22 * smoothstep(0.5, 0.8, n2) * band);
        col += mw * cloud * (0.13 + 0.50 * coreK);
        // 은하수 양옆으로 번지는 옅은 푸른 성운
        col += vec3(0.10, 0.16, 0.34) * exp(-bd * bd / 0.16) * (0.3 + 0.7 * n1) * 0.05;
        // 은하수 안의 낱알 같은 별 무리

        // 달 주변 빛무리
        float md = max(dot(d, uMoon), 0.0);
        col += vec3(0.30, 0.38, 0.55) * (pow(md, 90.0) * 0.35 + pow(md, 10.0) * 0.04);

        // 별자리 뒤 하늘 누르기
        float f = smoothstep(0.55, 0.98, dot(d, uFocus));
        col *= 1.0 - 0.62 * f * uFocusAmt;

        // 지평선은 땅의 안개색과 똑같이 맞춰 경계선이 보이지 않게 한다
        col = mix(uHorizon * 0.95 + vec3(0.012, 0.008, 0.009), col, smoothstep(-0.01, 0.10, up));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 32), mat)
  mesh.renderOrder = -10
  mesh.frustumCulled = false
  return mesh
}

function createStars(count) {
  const r = rng(11)
  const pos = new Float32Array(count * 3)
  const aSize = new Float32Array(count)
  const aPhase = new Float32Array(count)
  const aCol = new Float32Array(count * 3)
  const t1 = new THREE.Vector3().crossVectors(BAND_N, new THREE.Vector3(0, 1, 0)).normalize()
  const t2 = new THREE.Vector3().crossVectors(BAND_N, t1).normalize()
  const v = new THREE.Vector3()
  const gauss = () => (r() + r() + r() + r() - 2) / 2
  for (let i = 0; i < count; i++) {
    if (r() < 0.5) {
      // 은하수 띠 주변에 몰린 별
      const a = r() * Math.PI * 2
      v.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).addScaledVector(BAND_N, gauss() * 0.42).normalize()
    } else {
      const u = r() * 2 - 1
      const a = r() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      v.set(s * Math.cos(a), u, s * Math.sin(a))
    }
    if (v.y < -0.12) v.y = -v.y
    pos.set([v.x * 500, v.y * 500, v.z * 500], i * 3)
    const m = Math.pow(r(), 4.2) // 대부분은 흐리고 몇 개만 밝다
    aSize[i] = 1.25 + m * 5.6
    aPhase[i] = r() * 6.283
    const tcol = r()
    const c = tcol < 0.18 ? [1.0, 0.82, 0.62] : tcol < 0.5 ? [0.72, 0.82, 1.0] : [1, 1, 1]
    const b = 0.6 + 0.6 * r() + m * 1.6
    aCol.set([c[0] * b, c[1] * b, c[2] * b], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1))
  geo.setAttribute('aCol', new THREE.BufferAttribute(aCol, 3))
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize, aPhase; attribute vec3 aCol;
      uniform float uTime, uPx;
      varying vec3 vCol; varying float vTw;
      void main(){
        float tw = 0.72 + 0.28 * sin(uTime * (0.8 + fract(aPhase * 3.7) * 2.2) + aPhase);
        tw *= 0.9 + 0.1 * sin(uTime * 7.0 + aPhase * 5.0);
        vTw = tw; vCol = aCol;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uPx * (0.85 + 0.15 * tw));
        // 지평선 가까이는 대기에 묻혀 흐려진다
        vCol *= smoothstep(-0.02, 0.22, normalize(position).y);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uFade;
      varying vec3 vCol; varying float vTw;
      void main(){
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p) * 2.0;
        float a = exp(-r * r * 5.0);
        gl_FragColor = vec4(vCol * vTw * a * uFade, 1.0);
      }`,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  pts.renderOrder = -9
  return pts
}

// 별똥별: 카메라를 향해 눕힌 길쭉한 빛줄기
function createMeteor() {
  const geo = new THREE.PlaneGeometry(1, 1)
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float; varying vec2 vUv; uniform float uA;
      void main(){
        float head = pow(vUv.x, 3.0);
        float y = (vUv.y - 0.5) * 2.0;
        float w = exp(-y * y * mix(40.0, 6.0, vUv.x));
        gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * head * w * uA * 2.2, 1.0);
      }`,
  })
  const m = new THREE.Mesh(geo, mat)
  m.frustumCulled = false
  m.renderOrder = -8
  m.visible = false
  return m
}

export function createSky(engine) {
  const group = new THREE.Group()
  const dome = createDome()
  const stars = createStars(engine.state.coarse ? 5200 : 8000)
  group.add(dome, stars)

  const r = rng(5)
  const meteors = [0, 1, 2].map((i) => {
    const mesh = createMeteor()
    group.add(mesh)
    return { mesh, next: 2.5 + i * 4.1, t0: 0, dur: 0.9, from: new THREE.Vector3(), to: new THREE.Vector3(), active: false }
  })
  const X = new THREE.Vector3()
  const Y = new THREE.Vector3()
  const Z = new THREE.Vector3()
  const P = new THREE.Vector3()
  const M = new THREE.Matrix4()
  let burst = 0 // 피날레: 별똥별이 쏟아지는 시간(초)

  function launch(m, time, around) {
    // around(방향) 근처 하늘에서 비스듬히 떨어진다
    const base = around ? around.clone() : new THREE.Vector3(r() * 1.6 - 0.8, 0.35 + r() * 0.5, -1).normalize()
    m.from.copy(base).add(new THREE.Vector3((r() - 0.5) * 0.9, (r() - 0.2) * 0.5, (r() - 0.5) * 0.3)).normalize().multiplyScalar(300)
    m.to.copy(m.from).add(new THREE.Vector3((r() < 0.5 ? -1 : 1) * (50 + r() * 60), -(35 + r() * 45), (r() - 0.5) * 20))
    m.t0 = time
    m.dur = 0.7 + r() * 0.6
    m.active = true
    m.mesh.visible = true
  }

  return {
    group, dome, stars,
    setFocus(dir, amt) {
      dome.material.uniforms.uFocus.value.copy(dir)
      dome.material.uniforms.uFocusAmt.value = amt
    },
    shower(seconds) { burst = seconds },
    aim: null, // 별똥별이 떨어질 방향(카메라가 보는 쪽). 세계 쪽에서 채운다
    update(dt, time, camera) {
      group.position.copy(camera.position) // 하늘은 카메라를 따라다닌다(무한히 먼 것처럼)
      stars.material.uniforms.uTime.value = time
      stars.material.uniforms.uPx.value = engine.state.dpr * Math.max(0.8, engine.state.h / 820)
      burst = Math.max(0, burst - dt)
      for (const m of meteors) {
        if (!m.active) {
          if (time > m.next) launch(m, time, this.aim)
          continue
        }
        const k = (time - m.t0) / m.dur
        if (k >= 1) {
          m.active = false
          m.mesh.visible = false
          m.next = time + (burst > 0 ? 0.15 + r() * 0.5 : 5 + r() * 9)
          continue
        }
        P.lerpVectors(m.from, m.to, k)
        X.subVectors(m.to, m.from).normalize()
        Z.copy(P).negate().normalize()
        Y.crossVectors(Z, X).normalize()
        Z.crossVectors(X, Y)
        M.makeBasis(X, Y, Z)
        m.mesh.quaternion.setFromRotationMatrix(M)
        m.mesh.position.copy(P).addScaledVector(X, -22)
        m.mesh.scale.set(44, 2.2, 1)
        m.mesh.material.uniforms.uA.value = Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.7
      }
    },
  }
}
