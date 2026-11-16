import { useEffect, useRef, useState } from 'react'
import './Envelope.css'

const TITLE = '이하진 순장님의 생일을 축하합니다!'

// 단계: closed → opening(뚜껑 열림 + 편지 올라옴) → leaving(오버레이 아래로 빠짐) → 언마운트
export default function Envelope() {
  const [phase, setPhase] = useState('closed')
  const timers = useRef([])

  // 열려 있는 동안 body 스크롤 잠금, 언마운트 시 해제
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const open = () => {
    if (phase !== 'closed') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const openMs = reduce ? 400 : 1900
    const leaveMs = reduce ? 400 : 1100
    setPhase('opening')
    timers.current.push(
      setTimeout(() => setPhase('leaving'), openMs),
      setTimeout(() => setPhase('done'), openMs + leaveMs),
    )
  }

  if (phase === 'done') return null

  return (
    <section className={`Envelope Envelope--${phase}`} aria-label="생일 초대장">
      <h1 className="Envelope__title">{TITLE}</h1>

      <button
        type="button"
        className="Envelope__stage"
        onClick={open}
        disabled={phase !== 'closed'}
        aria-label="봉투 열기"
      >
        <span className="Envelope__body">
          <span className="Envelope__letter">
            <span className="Envelope__letterText">🎂 Happy Birthday</span>
          </span>
          <span className="Envelope__front" />
          <span className="Envelope__flap" />
        </span>
        <span className="Envelope__hint">봉투를 탭해 열어보세요</span>
      </button>
    </section>
  )
}
