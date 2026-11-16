// 3D 장면 공용 도구: 이징, 고정 시드 난수, 트윈(엔진의 매 프레임 갱신에 얹힌다)
export const clamp01 = (t) => Math.min(1, Math.max(0, t))
export const lerp = (a, b, t) => a + (b - a) * t
export const smooth = (a, b, t) => {
  const x = clamp01((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}
export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
}

export function rng(seed = 1) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

// 진행 중인 트윈 목록. engine 이 매 프레임 stepTweens(dt) 를 부른다.
const tweens = new Set()
export function tween({ dur = 1, delay = 0, easing = ease.inOut, update, done }) {
  let resolve
  const p = new Promise((r) => (resolve = r))
  const tw = { t: -delay, dur: Math.max(dur, 1e-4), easing, update, done, resolve, dead: false }
  tweens.add(tw)
  p.cancel = () => {
    tw.dead = true
    tweens.delete(tw)
  }
  return p
}
export function stepTweens(dt) {
  for (const tw of tweens) {
    if (tw.dead) continue
    tw.t += dt
    if (tw.t < 0) continue
    const k = clamp01(tw.t / tw.dur)
    tw.update?.(tw.easing(k), k)
    if (k >= 1) {
      tweens.delete(tw)
      tw.done?.()
      tw.resolve()
    }
  }
}
export function clearTweens() {
  tweens.clear()
}

// GLSL 공용 조각
export const GLSL_NOISE = /* glsl */ `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5; float s = 0.0; for(int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`

// 지평선 안개색(하늘 돔의 지평선 색과 맞춘다)
export const HORIZON = [0.035, 0.06, 0.16]
