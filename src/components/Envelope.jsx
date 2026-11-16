import { useEffect, useRef, useState } from 'react'
import cake from '../assets/cake.svg'
import forest from '../assets/forest.svg'
import './Envelope.css'

const TITLE = '이하진 순장님의 생일을 축하합니다!'

// 연출: 달밤 들판의 나무 밑에 떨어진 봉투를 주워(lift) → 열어보고(opening) → 고개를 들어 하늘을 올려다봄(leaving)
//  closed  : 나무 밑 풀밭에 봉투가 비스듬히 떨어져 있음
//  lift    : 봉투를 주워 눈높이로 들어 올려 정면으로 폄
//  opening : 뚜껑이 열리고 편지(케이크)가 봉투에서 미끄러져 나옴
//  leaving : 편지가 위로 떠오르고, 나무가 아래로 밀려 내려가며(= 시선이 줄기·잎 지붕을 지나 올라감) 밤하늘이 드러남
//  done    : 언마운트
const T = { lift: 1000, open: 1500, leave: 3000 }
const T_REDUCED = { lift: 0, open: 0, leave: 500 }

// 나무에서 천천히 떨어지는 낙엽(왼쪽 %, 시작 높이 svh, 크기 px, 떨어지는 시간 s / 지연 s, 좌우 흔들림 px)
const FALLING = [
  [28, 50, 9, 13, 0, 26], [44, 54, 8, 16, 5, -30], [60, 48, 10, 14, 2, 22], [72, 52, 7, 18, 9, -24], [38, 46, 8, 15, 11, 28],
]
// 반딧불이(왼쪽 %, 바닥에서 높이 svh, 크기 px, 이동 주기 s / 지연 s)
const FIREFLIES = [
  [14, 14, 4, 11, 0], [30, 24, 3, 9, 2], [72, 18, 4, 13, 1], [84, 30, 3, 10, 3.5],
  [22, 36, 3, 12, 0.5], [62, 38, 4, 9.5, 4.2], [48, 8, 3, 14, 2.6], [90, 10, 3, 8.5, 1.2], [8, 28, 3, 10.5, 5], [76, 44, 3, 12, 6],
]

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
    const t = reduce ? T_REDUCED : T
    setPhase('lift')
    timers.current.push(
      setTimeout(() => setPhase('opening'), t.lift),
      setTimeout(() => {
        document.documentElement.classList.add('env-reveal')
        setPhase('leaving')
      }, t.lift + t.open),
      setTimeout(() => setPhase('done'), t.lift + t.open + t.leave),
    )
  }

  if (phase === 'done') return null

  return (
    <section className={`Envelope Envelope--${phase}`} aria-label="생일 초대장">
      {/* 달밤의 들판과 나무 한 그루. 끝에서 아래로 밀려 내려가며(= 시선이 줄기를 타고 올라가며) 하늘이 드러난다 */}
      <div className="Envelope__world" aria-hidden="true">
        <img className="Envelope__scene" src={forest} alt="" draggable="false" />
        <div className="Envelope__moon" />
        {FALLING.map(([x, y, size, dur, delay, sway], i) => (
          <i
            key={`l${i}`}
            className="Envelope__fall"
            style={{ left: `${x}%`, bottom: `${y}svh`, '--sz': `${size}px`, '--dur': `${dur}s`, '--delay': `${delay}s`, '--sway': `${sway}px` }}
          />
        ))}
        {FIREFLIES.map(([x, y, size, dur, delay], i) => (
          <i
            key={`f${i}`}
            className="Envelope__firefly"
            style={{ left: `${x}%`, bottom: `${y}svh`, '--sz': `${size}px`, '--dur': `${dur}s`, '--delay': `${delay}s`, '--dx': `${i % 2 ? 22 : -26}px`, '--dy': `${i % 3 ? -30 : 24}px` }}
          />
        ))}
      </div>

      <h1 className="Envelope__title">{TITLE}</h1>

      <button
        type="button"
        className="Envelope__stage"
        onClick={open}
        disabled={phase !== 'closed'}
        aria-label="봉투 줍기"
      >
        <span className="Envelope__body">
          <span className="Envelope__letter">
            <img className="Envelope__cake" src={cake} alt="생일 케이크" draggable="false" />
          </span>
          <span className="Envelope__front" />
          <span className="Envelope__flap" />
          {/* 봉투 모서리에 얹힌 낙엽: 주워 올리면 미끄러져 떨어진다 */}
          <svg className="Envelope__leaf" viewBox="0 0 60 36" aria-hidden="true">
            <path d="M2 18 Q22 -2 58 18 Q22 38 2 18Z" fill="#8b5a2a" />
            <path d="M6 18 Q24 6 50 18 Q24 28 6 18Z" fill="#fff" opacity=".08" />
            <path d="M2 18 L58 18" stroke="#2a1809" strokeWidth="1" opacity=".7" />
          </svg>
        </span>
        <span className="Envelope__hint">바닥의 봉투를 주워 보세요</span>
      </button>
    </section>
  )
}
