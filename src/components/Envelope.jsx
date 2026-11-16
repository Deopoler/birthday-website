import { useEffect, useRef, useState } from 'react'
import cake from '../assets/cake.webp'
import treeNight from '../assets/tree-night.webp'
import ground from '../assets/ground.svg'
import './Envelope.css'

const TITLE = '이하진 순장님의 생일을 축하합니다!'

// 연출: 은하수 아래 나무 밑에 떨어진 봉투를 주워(lift) → 열어보고(opening) → 고개를 들어 하늘을 올려다봄(leaving)
//  closed  : 나무 밑 풀밭에 봉투가 비스듬히 떨어져 있음
//  lift    : 봉투를 주워 눈높이로 들어 올려 정면으로 폄
//  opening : 뚜껑이 열리고 편지(케이크)가 봉투에서 미끄러져 나옴
//  leaving : 편지가 위로 떠오르고, 나무와 은하수 사진이 아래로 밀려 내려가며(= 시선이 위로 올라감) 별자리 하늘이 드러남
//  done    : 언마운트
const T = { lift: 1000, open: 1500, leave: 3000 }
const T_REDUCED = { lift: 0, open: 0, leave: 500 }

// 가끔 하늘을 가르는 별똥별(왼쪽 %, 위에서부터 높이 svh, 길이 px, 주기 s / 지연 s)
const SHOOTING = [
  [14, 10, 90, 9, 1.5], [58, 19, 70, 13, 6.5],
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
      {/* 은하수 아래 언덕 위의 나무 한 그루(사진) + 어두운 풀밭. 끝에서 아래로 밀려 내려가며(= 시선이 나무를 타고 올라가며) 별자리 하늘이 드러난다 */}
      <div className="Envelope__world" aria-hidden="true">
        <img className="Envelope__photo" src={treeNight} alt="" draggable="false" />
        <div className="Envelope__ground" />
        <img className="Envelope__grass" src={ground} alt="" draggable="false" />
        <div className="Envelope__moon" />
        {SHOOTING.map(([x, y, len, dur, delay], i) => (
          <i
            key={`s${i}`}
            className="Envelope__shoot"
            style={{ left: `${x}%`, bottom: `${100 - y}svh`, '--len': `${len}px`, '--dur': `${dur}s`, '--delay': `${delay}s` }}
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
          <span className="Envelope__front">
            <span className="Envelope__to">To. 하진 순장님께</span>
          </span>
          <span className="Envelope__flap" />
          <span className="Envelope__seal" />
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
