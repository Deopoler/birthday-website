import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HORIZON, rng } from './util'
import { MOON_DIR } from './ground'

// 절차적으로 자라는 나무: 가지를 재귀로 뻗고, 가지 끝마다 잎 무리를 단다. 밤이라 대부분 실루엣이고 달 쪽 면만 은은히 빛난다.
export function createTree(engine) {
  const r = rng(42)
  const segs = []
  const tips = []
  const Y = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion()
  const m = new THREE.Matrix4()

  function limb(start, dir, len, rad, depth) {
    // 가지 하나를 2마디로 나눠 살짝 휘게 한다
    let p = start.clone()
    let d = dir.clone()
    const parts = depth === 0 ? 3 : 2
    for (let i = 0; i < parts; i++) {
      const l = len / parts
      const r0 = rad * (1 - (i / parts) * 0.3)
      const r1 = rad * (1 - ((i + 1) / parts) * 0.3)
      const g = new THREE.CylinderGeometry(r1, r0, l, depth < 2 ? 8 : 5, 1, true)
      g.translate(0, l / 2, 0)
      q.setFromUnitVectors(Y, d)
      m.compose(p, q, new THREE.Vector3(1, 1, 1))
      g.applyMatrix4(m)
      segs.push(g)
      p = p.clone().addScaledVector(d, l)
      d = d.clone().add(new THREE.Vector3((r() - 0.5) * 0.28, (r() - 0.35) * 0.2, (r() - 0.5) * 0.28)).normalize()
    }
    if (depth >= 2) tips.push({ p: p.clone(), s: depth >= 4 ? 1 : 0.75 })
    if (depth >= 6) return
    const n = depth === 0 ? 4 : r() < 0.45 ? 3 : 2
    const base = r() * Math.PI * 2
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.6
      const spread = (depth === 0 ? 0.55 : 0.42) + r() * 0.3
      // d 에 수직인 방향으로 벌린다
      const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
      side.addScaledVector(d, -side.dot(d)).normalize()
      const nd = d.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread))
      nd.y += 0.12 // 위로 자라려는 성질
      nd.normalize()
      limb(p, nd, len * (0.68 + r() * 0.14), r1Of(rad, n), depth + 1)
    }
  }
  const r1Of = (rad, n) => rad * 0.7 * (n > 2 ? 0.82 : 0.9)

  limb(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.06, 1, 0.02).normalize(), 2.9, 0.34, 0)

  const uni = { uHorizon: { value: new THREE.Vector3(...HORIZON) }, uMoon: { value: MOON_DIR }, uTime: { value: 0 } }
  const FOG = `uniform vec3 uHorizon; vec3 applyFog(vec3 c, float dist){ return mix(c, uHorizon * 0.95 + vec3(0.012, 0.008, 0.009), 1.0 - exp(-pow(dist / 30.0, 1.5))); }`

  const wood = new THREE.Mesh(
    mergeGeometries(segs),
    new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vW;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec3 vN; varying vec3 vW; uniform vec3 uMoon;
        ${FOG}
        void main(){
          float l = max(dot(normalize(vN), uMoon), 0.0);
          float bark = 0.7 + 0.3 * sin(vW.y * 38.0 + sin(vW.x * 21.0) * 2.0);
          vec3 c = vec3(0.004, 0.004, 0.005) + vec3(0.040, 0.050, 0.075) * pow(l, 1.5) * bark;
          gl_FragColor = vec4(applyFog(c, distance(vW, cameraPosition)), 1.0);
        }`,
    }),
  )
  segs.forEach((g) => g.dispose())

  // 잎: 가지 끝 주변에 흩뿌린 작은 마름모들
  const per = engine.state.coarse ? 40 : 64
  const count = tips.length * per
  const leaf = new THREE.InstancedBufferGeometry()
  leaf.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.34, 0.45, 0.1, 0, 1, 0, -0.34, 0.45, 0.1], 3))
  leaf.setIndex([0, 1, 2, 0, 2, 3])
  const off = new Float32Array(count * 3)
  const par = new Float32Array(count * 4)
  let k = 0
  const center = new THREE.Vector3(0, 5.2, 0)
  for (const t of tips) {
    for (let i = 0; i < per; i++) {
      const u = r() * 2 - 1
      const a = r() * Math.PI * 2
      const rr = Math.cbrt(r()) * 0.95 * t.s
      const s = Math.sqrt(1 - u * u)
      off.set([t.p.x + s * Math.cos(a) * rr, t.p.y + u * rr * 0.7 + 0.1, t.p.z + s * Math.sin(a) * rr], k * 3)
      par.set([r() * 6.283, r() * 6.283, 0.13 + r() * 0.12, r()], k * 4)
      k++
    }
  }
  leaf.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3))
  leaf.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 4))
  leaf.instanceCount = count
  const leaves = new THREE.Mesh(
    leaf,
    new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...uni, uCenter: { value: center } },
      vertexShader: /* glsl */ `
        attribute vec3 aOff; attribute vec4 aPar;
        uniform float uTime; uniform vec3 uCenter;
        varying vec3 vW; varying vec3 vOut; varying float vR;
        void main(){
          float ca = cos(aPar.x), sa = sin(aPar.x), cb = cos(aPar.y), sb = sin(aPar.y);
          vec3 p = position * aPar.z;
          p = vec3(p.x, p.y * cb - p.z * sb, p.y * sb + p.z * cb);
          p = vec3(p.x * ca + p.z * sa, p.y, -p.x * sa + p.z * ca);
          vec3 o = aOff;
          // 바람: 수관 전체가 느리게 일렁이고 잎은 파르르 떤다
          float g = sin(uTime * 0.9 + o.x * 0.5 + o.y * 0.3) * 0.5 + sin(uTime * 0.41 + o.z * 0.7) * 0.5;
          o.x += g * 0.07 * (o.y - 1.0) * 0.3;
          p += vec3(sin(uTime * 3.1 + aPar.w * 50.0), cos(uTime * 2.6 + aPar.w * 31.0), 0.0) * 0.022;
          vec4 w = modelMatrix * vec4(o + p, 1.0);
          vW = w.xyz; vR = aPar.w;
          vOut = normalize(mat3(modelMatrix) * (aOff - uCenter));
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec3 vW; varying vec3 vOut; varying float vR; uniform vec3 uMoon;
        ${FOG}
        void main(){
          float l = max(dot(normalize(vOut), uMoon) * 0.6 + 0.4, 0.0);
          vec3 c = vec3(0.002, 0.006, 0.006) + vec3(0.018, 0.040, 0.046) * pow(l, 2.6) * (0.3 + vR);
          gl_FragColor = vec4(applyFog(c, distance(vW, cameraPosition)), 1.0);
        }`,
    }),
  )
  leaves.frustumCulled = false

  const group = new THREE.Group()
  group.add(wood, leaves)
  return { group, update(dt, time) { uni.uTime.value = time } }
}
