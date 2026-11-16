import { useEffect } from 'react'

// 별 화면(Sky) ↔ 사진 화면(PhotoBoard) 자석 스크롤.
//
// 이전 방식은 스크롤이 '멈춘 뒤'에 붙여서, 손/휠을 움직이는 동안은 화면이 제멋대로 흘러가다가 나중에 끌려가는 느낌이었다.
// 지금은 '스크롤 의도'(휠 한 칸, 터치로 몇 px 끌기, 방향키)를 감지하는 즉시 다음 화면으로 한 번에 부드럽게 이동한다.
//  - 별 화면에서 아래로 → 사진 화면 맨 위로 (바로 출발)
//  - 사진 화면 맨 위에서 위로 → 별 화면으로
//  - 사진 화면 안쪽(맨 위보다 아래)은 평소처럼 자유 스크롤. 위로 올리다 맨 위에 닿으면 이어서 별 화면으로 넘어간다
//  - 모달/사진 확대/인트로처럼 body 스크롤을 잠근 동안에는 관여하지 않는다
// 마지막 안전망: 스크롤바 드래그처럼 가로챌 수 없는 경우엔 멈춘 뒤 가까운 쪽으로 붙인다.
const DURATION = 560 // 이동 시간(ms)
const COOLDOWN = 380 // 이동 직후 관성 스크롤(트랙패드)이 다음 화면을 또 건드리지 않게 무시하는 시간(ms)
const TOUCH_SLOP = 3 // 터치로 이만큼(px) 끌면 의도로 본다
// 실제 휴대폰에서는 터치가 이미 기본 스크롤로 시작돼 막을 수 없는 경우가 있다(touchmove가 cancelable이 아님).
// 그때는 기본 스크롤이 이만큼(px)만 움직여도 바로 이어받아 다음 화면으로 보낸다(예전: 화면 절반을 넘겨야 붙음).
const NATIVE_TAKEOVER = 10
const SETTLE_MS = 140

// ── 사진 → 별 화면으로 올라갈 때의 '걸림' ──
// 사진 화면 안쪽에서 시작한 한 번의 스크롤 동작(휠 연속/손가락 한 번 끌기/키 누르고 있기)은 사진 화면 맨 위(= Sky 높이)에서 멈추고,
// 별 화면으로 넘어가려면 '새 동작'을 한 번 더 해야 한다. 사진 맨 위에서 시작한 동작은 걸림 없이 바로 별 화면으로 간다.
const EDGE = 2 // 사진 맨 위로 보는 오차(px). 이 안에서 시작한 동작은 '맨 위에서 시작'
const WHEEL_GAP = 220 // 마지막 휠 이벤트 후 이만큼(ms) 쉬면 새 동작(트랙패드 관성 이벤트는 간격이 짧아 같은 동작으로 묶인다)
const MOMENTUM_GUARD = 450 // 손가락을 뗀 뒤 이만큼(ms) 동안은 남은 관성 스크롤이 걸림 선을 넘지 못하게 되돌린다
const KEY_TAIL = 150 // 키를 뗀 뒤 이만큼(ms)까지 브라우저의 부드러운 스크롤 꼬리를 같은 동작으로 본다
const NUDGE_PX = 3 // 걸리는 순간 사진 화면이 살짝 눌렸다 돌아오는 정도(px)
const NUDGE_MS = 240

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export default function useMagnetScroll(skySelector = '.Sky') {
  useEffect(() => {
    const skyH = () => document.querySelector(skySelector)?.offsetHeight ?? 0
    const locked = () => document.body.style.overflow === 'hidden'
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    let animating = false
    let cooldownUntil = 0
    let settleTimer = 0
    // 현재 스크롤 동작: src = wheel|touch|key, inside = 사진 안쪽에서 시작, snagged = 맨 위에 걸린 상태, liveUntil = 이 시각까지 같은 동작
    let g = { src: null, inside: false, snagged: false, liveUntil: 0 }
    const beginGesture = (src) => {
      g = { src, inside: window.scrollY > skyH() + EDGE, snagged: false, liveUntil: 0 }
    }
    const live = () => performance.now() < g.liveUntil
    const nudge = () => {
      if (reduced()) return
      document.querySelector('.PhotoBoard')?.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(${NUDGE_PX}px)`, offset: 0.35 }, { transform: 'translateY(0)' }],
        { duration: NUDGE_MS, easing: 'ease-out' },
      )
    }
    // 사진 안쪽에서 시작한 동작이 맨 위(H)에 닿았거나 넘으면 H에 붙이고 걸림 상태로 만든다
    const snagAt = (H) => {
      if (!g.snagged) nudge()
      g.snagged = true
      window.scrollTo(0, H)
    }
    let anchor = 0 // 마지막으로 머문 곳: 0 = 별 화면, 1 = 사진 화면(맨 위 포함)
    const syncAnchor = () => {
      const H = skyH()
      anchor = H && window.scrollY >= H - 1 ? 1 : 0
    }
    const releaseRoot = () => { document.documentElement.style.overflowY = '' }

    // dir: +1(아래로) / -1(위로). 가로채야 하면 이동할 목표 y를, 아니면 null을 돌려준다.
    const targetFor = (dir) => {
      const H = skyH()
      const y = window.scrollY
      if (!H) return null
      if (dir > 0 && y < H - 1) return H // 별 화면(또는 그 사이)에서 아래로 → 사진 화면 맨 위
      if (dir < 0 && y > 0.5 && y <= H + 2) return 0 // 사진 화면 맨 위(또는 그 사이)에서 위로 → 별 화면
      return null
    }

    const animateTo = (target) => {
      cancelAnimationFrame(raf)
      const from = window.scrollY
      if (Math.abs(target - from) < 1) return
      if (reduced()) {
        window.scrollTo(0, target)
        cooldownUntil = performance.now() + COOLDOWN
        syncAnchor()
        releaseRoot()
        return
      }
      animating = true
      const t0 = performance.now()
      const step = (now) => {
        const p = Math.min(1, (now - t0) / DURATION)
        window.scrollTo(0, from + (target - from) * easeInOutCubic(p))
        if (p < 1) {
          raf = requestAnimationFrame(step)
        } else {
          window.scrollTo(0, target)
          animating = false
          cooldownUntil = performance.now() + COOLDOWN
          syncAnchor()
          releaseRoot()
        }
      }
      raf = requestAnimationFrame(step)
    }

    // 이동 중이거나 직후(관성)에는 입력을 삼켜서 중간에 어긋나지 않게 한다
    const busy = () => animating || performance.now() < cooldownUntil

    // ── 휠 ──
    const onWheel = (e) => {
      if (locked() || e.ctrlKey) return // ctrl+휠은 확대/축소
      const dir = Math.sign(e.deltaY)
      if (!dir || Math.abs(e.deltaY) < 1) return
      const now = performance.now()
      if (g.src !== 'wheel' || now >= g.liveUntil) beginGesture('wheel')
      g.liveUntil = now + WHEEL_GAP
      if (busy()) {
        // 이동 중에는 어느 방향이든 기본 스크롤을 막아 화면이 흔들리지 않게 한다(경계 안에 있을 때만)
        const y = window.scrollY
        if (y <= skyH() + 2) e.preventDefault()
        return
      }
      if (dir < 0 && g.inside) {
        // 사진 안쪽에서 시작한 동작: 이번 휠로 맨 위(H)에 닿거나 넘으면 H에서 멈추고 나머지(관성 포함)는 삼킨다
        const H = skyH()
        const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY
        if (window.scrollY + px <= H + EDGE) {
          e.preventDefault()
          snagAt(H)
        }
        return
      }
      const target = targetFor(dir)
      if (target === null) return
      e.preventDefault()
      animateTo(target)
    }

    // ── 터치 ──
    let touch = null
    const onTouchStart = (e) => {
      if (e.touches.length !== 1) { touch = null; return }
      touch = { y: e.touches[0].clientY, taken: false, ignore: false }
      beginGesture('touch')
      g.liveUntil = Infinity
    }
    const onTouchMove = (e) => {
      if (!touch || locked()) return
      if (g.src === 'touch' && g.snagged) { if (e.cancelable) e.preventDefault(); return } // 걸린 동안엔 이 손가락의 스크롤을 막는다
      if (touch.ignore) return
      const dy = touch.y - e.touches[0].clientY // 양수 = 손가락을 위로 = 화면은 아래로
      if (!touch.taken) {
        if (Math.abs(dy) < TOUCH_SLOP) return
        if (busy()) { touch.taken = true } // 이동 중이면 그냥 삼킨다
        else {
          const target = targetFor(Math.sign(dy))
          if (target === null) { touch.ignore = true; return } // 자유 스크롤 구간: 브라우저에 맡김
          if (!e.cancelable) { touch.ignore = true; return } // 이미 네이티브 스크롤이 시작됨 → 안전망이 처리
          touch.taken = true
          animateTo(target)
        }
      }
      if (touch.taken && e.cancelable) e.preventDefault()
    }
    const onTouchEnd = () => {
      touch = null
      if (g.src === 'touch') g.liveUntil = performance.now() + MOMENTUM_GUARD
      if (!animating) releaseRoot()
    }

    // ── 키보드 ──
    const onKey = (e) => {
      if (locked() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return
      let dir = 0
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) dir = 1
      else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) dir = -1
      if (!dir) return
      if (!e.repeat || g.src !== 'key') beginGesture('key')
      g.liveUntil = Infinity // 키를 뗄 때까지(onKeyUp) 같은 동작
      if (busy()) { if (window.scrollY <= skyH() + 2) e.preventDefault(); return }
      if (dir < 0 && g.inside) {
        // 사진 안쪽에서 시작한 동작: 걸린 뒤의 반복 입력은 막고, 아직이면 브라우저 스크롤이 H를 넘는 순간 onScroll 이 붙잡는다
        if (g.snagged) e.preventDefault()
        return
      }
      const target = targetFor(dir)
      if (target === null) return
      e.preventDefault()
      animateTo(target)
    }

    const onKeyUp = () => {
      if (g.src === 'key') g.liveUntil = performance.now() + KEY_TAIL
    }

    // ── 안전망: 스크롤바 드래그 등으로 두 화면 '사이'에 멈춘 경우 가까운 쪽으로 붙인다 ──
    const takeOver = (target) => {
      // 손가락이 아직 닿아 있으면 기본 스크롤과 위치를 두고 싸우지 않도록 잠시 잠근다(프로그램 스크롤은 그대로 동작)
      if (touch) document.documentElement.style.overflowY = 'hidden'
      animateTo(target)
    }
    const onScroll = () => {
      if (animating || locked()) return
      const H = skyH()
      const y = window.scrollY
      // 사진 안쪽에서 시작한 동작이 맨 위(H)에 닿거나 넘었으면 거기서 붙잡는다(터치·키처럼 기본 스크롤을 못 막는 경우의 경로)
      if (H && g.inside && live() && y <= H + 0.5) {
        if (g.src === 'touch' && touch) document.documentElement.style.overflowY = 'hidden' // 손가락이 닿은 동안 기본 스크롤·관성을 끊는다(뗄 때 해제)
        snagAt(H)
        return
      }
      if (H) {
        if (y <= 1) anchor = 0
        else if (y >= H - 1) anchor = 1
        else if (anchor === 0 && y >= NATIVE_TAKEOVER) { takeOver(H); return } // 별 화면에서 조금만 내려도 사진 화면으로
        else if (anchor === 1 && y <= H - NATIVE_TAKEOVER && !(g.inside && live())) { takeOver(0); return } // 사진 맨 위에서 조금만 올려도 별 화면으로
      }
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        if (animating || locked() || touch) return
        const H = skyH()
        const y = window.scrollY
        if (!H || y <= 1 || y >= H - 1) return
        animateTo(y < H / 2 ? 0 : H)
      }, SETTLE_MS)
    }

    syncAnchor()
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
      clearTimeout(settleTimer)
      releaseRoot()
    }
  }, [skySelector])
}
