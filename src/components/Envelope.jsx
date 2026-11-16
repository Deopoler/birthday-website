import { useEffect, useRef, useState } from 'react'
import cake from '../assets/cake.svg'
import './Envelope.css'

const TITLE = '이하진 순장님의 생일을 축하합니다!'

// 단계: closed → opening(뚜껑 열림 + 편지 살짝 올라옴) → leaving(편지가 위로 떠오르며 시선 이동, 장면은 제자리에서 흐려짐, 하늘은 초점이 맞춰짐) → 언마운트
export default function Envelope() {
  const [phase, setPhase] = useState('closed')
  const timers = useRef([])

  // 봉투가 떠 있는 동안 body 스크롤 잠금. 이 컴포넌트는 끝나도 null만 반환하며 언마운트되지 않으므로
  // phase가 'done'이 되는 시점(또는 언마운트)에 해제한다.
  const done = phase === 'done'
  useEffect(() => {
    if (done) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      document.documentElement.classList.remove('env-reveal')
    }
  }, [done])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const open = () => {
    if (phase !== 'closed') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const openMs = reduce ? 0 : 1500
    const leaveMs = reduce ? 500 : 1600
    setPhase('opening')
    timers.current.push(
      setTimeout(() => {
        document.documentElement.classList.add('env-reveal')
        setPhase('leaving')
      }, openMs),
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
            <img className="Envelope__cake" src={cake} alt="생일 케이크" draggable="false" />
          </span>
          <span className="Envelope__front" />
          <span className="Envelope__flap" />
        </span>
        <span className="Envelope__hint">봉투를 탭해 열어보세요</span>
      </button>
    </section>
  )
}
