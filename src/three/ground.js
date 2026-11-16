import * as THREE from 'three'
import { GLSL_NOISE, HORIZON, rng } from './util'

export const MOON_DIR = new THREE.Vector3(0.15, 0.36, -0.92).normalize()
export const TREE_POS = new THREE.Vector3(-2.6, 0, -8.5)
export const ENVELOPE_POS = new THREE.Vector3(0.45, 0, -2.3)

// 지형 높이: 나무가 선 완만한 언덕 + 잔물결
export function groundH(x, z) {
  const dx = x - TREE_POS.x
  const dz = z - TREE_POS.z
  return 1.1 * Math.exp(-(dx * dx + dz * dz) / 70) + 0.08 * Math.sin(x * 0.7 + 1.3) * Math.cos(z * 0.5) - 0.02 * z * 0.2
}

const FOG = /* glsl */ `
  uniform vec3 uHorizon;
  vec3 applyFog(vec3 c, float dist){ return mix(c, uHorizon * 0.95 + vec3(0.012, 0.008, 0.009), 1.0 - exp(-pow(dist / 30.0, 1.5))); }
`

function createTerrain() {
  const geo = new THREE.PlaneGeometry(160, 120, 96, 72)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, 0, -45)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)))
  geo.computeVertexNormals()
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHorizon: { value: new THREE.Vector3(...HORIZON) }, uMoon: { value: MOON_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN;
      void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vW; varying vec3 vN; uniform vec3 uMoon;
      ${GLSL_NOISE} ${FOG}
      void main(){
        float n = fbm(vec3(vW.xz * 0.9, 1.0));
        vec3 c = mix(vec3(0.004, 0.012, 0.010), vec3(0.012, 0.030, 0.024), n);
        c *= 0.5 + 0.9 * max(dot(normalize(vN), uMoon), 0.0);
        gl_FragColor = vec4(applyFog(c, distance(vW, cameraPosition)), 1.0);
      }`,
  })
  return new THREE.Mesh(geo, mat)
}

function createGrass(count) {
  // 풀잎 하나: 위로 갈수록 좁아지는 5단 띠
  const SEG = 4
  const verts = []
  const idx = []
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const w = (1 - t * t) * 0.5
    verts.push(-w, t, 0, w, t, 0)
    if (i < SEG) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(idx)
  const r = rng(3)
  const off = new Float32Array(count * 3)
  const par = new Float32Array(count * 4) // 회전, 키, 폭, 난수
  for (let i = 0; i < count; i++) {
    // 카메라 가까이 촘촘하게, 멀수록 듬성듬성
    const z = 2.2 - 34 * Math.pow(r(), 1.7)
    const spread = 5 + (2.2 - z) * 0.75
    const x = (r() * 2 - 1) * spread
    let h = 0.2 + r() * 0.34 + (r() < 0.06 ? 0.25 : 0)
    // 봉투 주변은 풀을 낮게 눌러 봉투가 보이게
    const de = Math.hypot(x - ENVELOPE_POS.x, z - ENVELOPE_POS.z)
    if (de < 0.95) h *= 0.12 + 0.88 * Math.pow(de / 0.95, 2)
    const far = Math.max(0, -z) / 34
    off.set([x, groundH(x, z), z], i * 3)
    par.set([r() * Math.PI, h * (1 + far * 0.6), 0.022 + r() * 0.02 + far * 0.05, r()], i * 4)
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3))
  geo.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 4))
  geo.instanceCount = count
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uHorizon: { value: new THREE.Vector3(...HORIZON) }, uMoon: { value: MOON_DIR },
      uGlow: { value: new THREE.Vector4(0, -99, 0, 0) }, // xyz 위치, w 세기: 봉투가 열릴 때 풀에 비치는 따뜻한 빛
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOff; attribute vec4 aPar;
      uniform float uTime;
      varying float vT; varying vec3 vW; varying float vR;
      void main(){
        float t = position.y; vT = t; vR = aPar.w;
        float c = cos(aPar.x), s = sin(aPar.x);
        vec3 p = vec3(position.x * aPar.z, t * aPar.y, 0.0);
        p = vec3(p.x * c, p.y, p.x * s);
        // 바람: 큰 물결이 들판을 훑고 지나가고, 잎마다 잔떨림이 얹힌다
        float gust = sin(uTime * 1.1 + aOff.x * 0.55 + aOff.z * 0.35) * 0.5 + sin(uTime * 0.47 + aOff.x * 0.21 - aOff.z * 0.6) * 0.5;
        float flutter = sin(uTime * 3.4 + aPar.w * 40.0) * 0.25;
        float bend = (0.10 + 0.16 * gust + 0.04 * flutter) * t * t * aPar.y;
        vec2 lean = vec2(cos(aPar.w * 6.283), sin(aPar.w * 6.283)) * 0.10 * t * t * aPar.y;
        p.x += bend * 1.0 + lean.x; p.z += bend * 0.45 + lean.y;
        p.y -= bend * bend * 0.6;
        vW = aOff + p;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying float vT; varying vec3 vW; varying float vR;
      uniform vec4 uGlow;
      ${FOG}
      void main(){
        vec3 base = vec3(0.003, 0.010, 0.009);
        vec3 tip = mix(vec3(0.012, 0.040, 0.034), vec3(0.030, 0.062, 0.072), vR);
        vec3 c = mix(base, tip, pow(vT, 1.6));
        c += vec3(0.10, 0.14, 0.20) * pow(vT, 7.0) * 0.28 * (0.3 + vR); // 달빛을 받은 잎끝
        float gd = distance(vW, uGlow.xyz);
        c += vec3(1.0, 0.72, 0.35) * uGlow.w * (0.25 + vT) / (1.0 + gd * gd * gd * 9.0);
        gl_FragColor = vec4(applyFog(c, distance(vW, cameraPosition)), 1.0);
      }`,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  return mesh
}

function createFireflies(count) {
  const r = rng(21)
  const pos = new Float32Array(count * 3)
  const par = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const z = 0.5 - r() * 14
    const x = (r() * 2 - 1) * (3 + -z * 0.5)
    pos.set([x, groundH(x, z) + 0.25 + r() * 1.6, z], i * 3)
    par.set([r() * 6.283, 0.5 + r(), r()], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aPar', new THREE.BufferAttribute(par, 3))
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aPar; uniform float uTime, uPx; varying float vA;
      void main(){
        float t = uTime * 0.35 * aPar.y + aPar.x;
        vec3 p = position + vec3(sin(t) * 0.7 + sin(t * 2.3) * 0.2, sin(t * 1.3 + aPar.x) * 0.35, cos(t * 0.8) * 0.6);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float blink = smoothstep(0.15, 0.9, sin(uTime * (0.9 + aPar.z) + aPar.x * 3.0) * 0.5 + 0.5);
        vA = blink;
        gl_PointSize = uPx * (26.0 + 22.0 * aPar.z) / max(1.0, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; varying float vA;
      void main(){
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-r * r * 7.0) + 0.25 * exp(-r * r * 1.6);
        gl_FragColor = vec4(vec3(0.95, 1.0, 0.35) * a * vA * 1.6, 1.0);
      }`,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}

function createMoon() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float; varying vec2 vUv;
      ${GLSL_NOISE}
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float disc = smoothstep(1.0, 0.94, r);
        // 초승달: 옆으로 밀린 원을 빼낸다
        float cut = smoothstep(0.98, 1.06, length(p - vec2(0.42, 0.16)) / 0.98);
        float sea = fbm(vec3(p * 2.4, 3.0));
        vec3 c = vec3(1.0, 0.96, 0.84) * (0.75 + 0.35 * sea) * 2.4;
        float a = disc * cut;
        gl_FragColor = vec4(c * a, a);
      }`,
  })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat)
  m.position.copy(MOON_DIR).multiplyScalar(480)
  m.lookAt(0, 0, 0)
  m.renderOrder = -7
  m.frustumCulled = false
  return m
}

export function createGround(engine) {
  const group = new THREE.Group()
  const terrain = createTerrain()
  const grass = createGrass(engine.state.coarse ? 26000 : 52000)
  const flies = createFireflies(46)
  group.add(terrain, grass, flies)
  const moon = createMoon()
  return {
    group, moon, grass,
    setGlow(pos, w) {
      const g = grass.material.uniforms.uGlow.value
      g.set(pos.x, pos.y, pos.z, w)
    },
    update(dt, time) {
      if (!group.visible) return
      grass.material.uniforms.uTime.value = time
      flies.material.uniforms.uTime.value = time
      flies.material.uniforms.uPx.value = engine.state.dpr * engine.state.h / 820
    },
  }
}
