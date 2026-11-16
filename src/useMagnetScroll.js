import { useEffect } from 'react'

// 별 화면(Sky) ↔ 사진 화면(PhotoBoard) 자석 스크롤.
// CSS scroll-snap(mandatory)은 화면 절반 이상 스크롤해야 넘어가서, 휠 한 칸/짧은 스와이프가 원위치로 되돌아간다.
// 그래서 스크롤이 멈춘 뒤 '어느 방향으로 얼마나 움직였는지'를 보고 직접 붙인다.
//  - 별 화면에서 THRESHOLD(기본 8%)만 내려도 사진 화면 맨 위로 붙음
//  - 사진 화면 맨 위 근처에서 THRESHOLD만 올려도 별 화면으로 붙음
//  - 사진 화면 안쪽(맨 위보다 아래)은 자유 스크롤
const THRESHOLD = 0.08
const SETTLE_MS = 90

export default function useMagnetScroll(skySelector = '.Sky') {
  useEffect(() => {
    const sky = () => document.querySelector(skySelector)
    let anchor = 0 // 마지막으로 붙은 위치(0 = 별 화면, H = 사진 화면 맨 위)
    let timer = 0
    let busy = false
    let busyTimer = 0

    const goTo = (top) => {
      busy = true
      clearTimeout(busyTimer)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' })
      // 스무스 스크롤이 끝났다고 볼 때까지 중간 스크롤 이벤트를 무시
      busyTimer = setTimeout(() => {
        busy = false
        anchor = top
      }, reduce ? 50 : 700)
    }

    const settle = () => {
      if (busy || document.body.style.overflow === 'hidden') return
      const el = sky()
      if (!el) return
      const H = el.offsetHeight
      const y = window.scrollY
      const dead = H * THRESHOLD

      if (y >= H) { anchor = H; return } // 사진 화면 안쪽: 자유 스크롤
      if (anchor === 0) {
        if (y > dead) goTo(H)
        else if (y > 1) goTo(0)
      } else {
        // 사진 화면 맨 위에서 위로 올리는 중
        if (y < H - dead) goTo(0)
        else goTo(H)
      }
    }

    const onScroll = () => {
      if (busy) return
      clearTimeout(timer)
      timer = setTimeout(settle, SETTLE_MS)
    }
    // 화면 크기 변화로 기준이 틀어지지 않게 다시 맞춤
    const onResize = () => { anchor = window.scrollY >= (sky()?.offsetHeight ?? 0) ? sky().offsetHeight : 0 }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      clearTimeout(timer)
      clearTimeout(busyTimer)
    }
  }, [skySelector])
}
