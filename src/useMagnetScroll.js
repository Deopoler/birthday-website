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
const DURATION = 680 // 이동 시간(ms)
const COOLDOWN = 380 // 이동 직후 관성 스크롤(트랙패드)이 다음 화면을 또 건드리지 않게 무시하는 시간(ms)
const TOUCH_SLOP = 6 // 터치로 이만큼(px) 끌면 의도로 본다
const SETTLE_MS = 140

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
      if (busy()) {
        // 이동 중에는 어느 방향이든 기본 스크롤을 막아 화면이 흔들리지 않게 한다(경계 안에 있을 때만)
        const y = window.scrollY
        if (y <= skyH() + 2) e.preventDefault()
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
    }
    const onTouchMove = (e) => {
      if (!touch || touch.ignore || locked()) return
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
    const onTouchEnd = () => { touch = null }

    // ── 키보드 ──
    const onKey = (e) => {
      if (locked() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return
      let dir = 0
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) dir = 1
      else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) dir = -1
      if (!dir) return
      if (busy()) { if (window.scrollY <= skyH() + 2) e.preventDefault(); return }
      const target = targetFor(dir)
      if (target === null) return
      e.preventDefault()
      animateTo(target)
    }

    // ── 안전망: 스크롤바 드래그 등으로 두 화면 '사이'에 멈춘 경우 가까운 쪽으로 붙인다 ──
    const onScroll = () => {
      if (animating) return
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        if (animating || locked() || touch) return
        const H = skyH()
        const y = window.scrollY
        if (!H || y <= 1 || y >= H - 1) return
        animateTo(y < H / 2 ? 0 : H)
      }, SETTLE_MS)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
      clearTimeout(settleTimer)
    }
  }, [skySelector])
}
