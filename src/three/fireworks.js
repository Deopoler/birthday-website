import * as THREE from 'three'
import { rng } from './util'

// 피날레 불꽃: 터진 위치·속도·태어난 시각만 넣어 두고 움직임은 셰이더가 계산한다
const SLOTS = 10
const PER = 240
const COLORS = [[1, 0.78, 0.35], [1, 0.45, 0.6], [0.55, 0.75, 1], [0.7, 1, 0.75], [0.95, 0.6, 1], [1, 0.95, 0.8]]

export function createFireworks(engine) {
  const n = SLOTS * PER
  const origin = new Float32Array(n * 3)
  const vel = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const birth = new Float32Array(n).fill(-100)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(origin, 3))
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3))
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1))
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uDown: { value: new THREE.Vector3(0, -1, 0) } },
    vertexShader: /* glsl */ `
      attribute vec3 aVel, aCol; attribute float aBirth;
      uniform float uTime, uPx; uniform vec3 uDown;
      varying vec3 vCol; varying float vA;
      void main(){
        float t = uTime - aBirth;
        float life = 2.4;
        float k = clamp(t / life, 0.0, 1.0);
        // 공기 저항으로 금방 느려지고, 천천히 아래로 처진다
        vec3 p = position + aVel * (1.0 - exp(-t * 1.9)) / 1.9 + uDown * t * t * 14.0;
        vA = (t < 0.0 || t > life) ? 0.0 : pow(1.0 - k, 1.6) * (0.7 + 0.3 * sin(t * 30.0 + aVel.x)) * smoothstep(0.0, 0.22, t); // 터지는 순간엔 한 점에 겹쳐 있어 과하게 번지므로 서서히 밝힌다
        vCol = aCol;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uPx * mix(9.0, 4.0, k);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; varying vec3 vCol; varying float vA;
      void main(){
        float r = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(vCol * exp(-r * r * 5.0) * vA * 2.2, 1.0);
      }`,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 5
  const r = rng(99)
  let slot = 0
  let now = 0
  return {
    points,
    // p: 그룹 지역 좌표(px), speed: 퍼지는 속도(px/s)
    launch(p, speed = 420) {
      const s = slot++ % SLOTS
      const c = COLORS[Math.floor(r() * COLORS.length)]
      for (let i = 0; i < PER; i++) {
        const o = (s * PER + i) * 3
        const u = r() * 2 - 1
        const a = r() * Math.PI * 2
        const q = Math.sqrt(1 - u * u)
        const sp = speed * (0.55 + 0.45 * Math.cbrt(r()))
        origin.set([p.x, p.y, p.z], o)
        vel.set([q * Math.cos(a) * sp, u * sp, q * Math.sin(a) * sp * 0.6], o)
        const w = r() < 0.15 ? 1 : 0
        col.set([c[0] + (1 - c[0]) * w, c[1] + (1 - c[1]) * w, c[2] + (1 - c[2]) * w], o)
        birth[s * PER + i] = now + r() * 0.05
      }
      for (const k of ['position', 'aVel', 'aCol', 'aBirth']) geo.attributes[k].needsUpdate = true
    },
    update(dt, time) {
      now = time
      mat.uniforms.uTime.value = time
      mat.uniforms.uPx.value = engine.state.dpr
    },
  }
}
