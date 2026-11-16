import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { messages } from '../data/messages'
import { constellation, strokeSegments, decorStars, CONSTELLATION_TEXT } from '../data/constellation'
import './Sky.css'

// 배경 작은 별: 고정 시드 의사난수로 리렌더에도 동일하게 유지
function makeBgStars(n) {
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: rnd() * 100,
    y: rnd() * 100,
    size: 1 + rnd() * 1.8,
    delay: rnd() * 4,
    dur: 2 + rnd() * 3,
  }))
}

const OPEN_MS = 760
const CLOSE_MS = 560
const OPEN_EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)' // ease-out
const CLOSE_EASE = 'cubic-bezier(0.6, 0, 0.8, 0.4)' // ease-in

const rectStyle = (r) => ({
  left: `${r.left}px`,
  top: `${r.top}px`,
  width: `${r.width}px`,
  height: `${r.height}px`,
})

const lerp = (a, b, t) => a + (b - a) * t

// 별(점) → 가로로 퍼진 띠 → 편지지 카드. FLIP: 별의 rect에서 카드 최종 rect까지 보간
function morphFrames(from, to) {
  const cx = from.left + from.width / 2
  const cy = from.top + from.height / 2
  const tx = to.left + to.width / 2
  const ty = to.top + to.height / 2
  const bandH = 6
  const band = {
    left: lerp(cx, tx, 0.4) - to.width / 2,
    top: lerp(cy, ty, 0.4) - bandH / 2,
    width: to.width,
    height: bandH,
  }
  return [
    {
      offset: 0,
      transform: 'none',
      ...rectStyle(from),
      borderRadius: '50%',
      backgroundColor: '#fffbe0',
      boxShadow: '0 0 14px 5px rgba(255, 200, 80, 0.8)',
    },
    {
      offset: 0.38,
      transform: 'none',
      ...rectStyle(band),
      borderRadius: '6px',
      backgroundColor: '#fff3c4',
      boxShadow: '0 0 16px 4px rgba(255, 215, 120, 0.7)',
    },
    {
      offset: 1,
      transform: 'none',
      ...rectStyle(to),
      borderRadius: '6px',
      backgroundColor: '#fff8e6',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5), inset 0 0 30px rgba(200, 160, 100, 0.2)',
    },
  ]
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Sky() {
  const bgStars = useMemo(() => makeBgStars(60), [])
  const [opened, setOpened] = useState([])
  const [active, setActive] = useState(null) // 카드로 변해 있는 별
  const [phase, setPhase] = useState('idle') // idle | opening | open | closing
  const [reborn, setReborn] = useState(null) // 닫힌 뒤 다시 반짝일 별
  const skyRef = useRef(null)
  const cardRef = useRef(null)
  const starRect = useRef(null)
  const anim = useRef(null)
  const phaseRef = useRef('idle')

  const count = Math.min(messages.length, constellation.length)
  const openSet = new Set(opened)
  const segs = strokeSegments.filter((s) => openSet.has(s.a) && openSet.has(s.b))

  const go = (p) => {
    phaseRef.current = p
    setPhase(p)
  }

  const open = (i, e) => {
    if (phaseRef.current !== 'idle') return
    starRect.current = e.currentTarget.getBoundingClientRect()
    setOpened((o) => (o.includes(i) ? o : [...o, i]))
    setReborn(null)
    setActive(i)
    go('opening')
  }

  // 카드가 DOM에 생긴 직후(paint 전) 최종 rect를 재고 모프 시작
  useLayoutEffect(() => {
    if (active == null || phaseRef.current !== 'opening') return
    const card = cardRef.current
    const to = card.getBoundingClientRect()
    anim.current?.cancel()
    const a = reducedMotion()
      ? card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' })
      : card.animate(morphFrames(starRect.current, to), { duration: OPEN_MS, easing: OPEN_EASE })
    anim.current = a
    a.onfinish = () => {
      a.cancel() // 이후는 CSS 중앙 정렬이 이어받음(리사이즈 대응)
      anim.current = null
      go('open')
    }
  }, [active])

  const close = () => {
    if (phaseRef.current !== 'open') return
    const card = cardRef.current
    const star = skyRef.current.querySelector(`[data-star="${active}"]`)
    const idx = active
    go('closing')
    let a
    if (reducedMotion()) {
      a = card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
    } else {
      a = card.animate(morphFrames(star.getBoundingClientRect(), card.getBoundingClientRect()), {
        duration: CLOSE_MS,
        easing: CLOSE_EASE,
        direction: 'reverse',
        fill: 'forwards',
      })
    }
    anim.current = a
    a.onfinish = () => {
      anim.current = null
      setActive(null)
      setReborn(idx)
      go('idle')
    }
  }

  useEffect(() => () => anim.current?.cancel(), [])

  // 모달이 열려 있는 동안만 스크롤 잠금: active가 null이 되면 cleanup으로 반드시 해제
  useEffect(() => {
    if (active == null) return undefined
    const html = document.documentElement
    const prevHtml = html.style.overflow
    const prevBody = document.body.style.overflow
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      html.style.overflow = prevHtml
      document.body.style.overflow = prevBody
      window.removeEventListener('keydown', onKey)
    }
  }, [active])

  const msg = active != null ? messages[active] : null

  return (
    <section ref={skyRef} className="Sky" aria-label={`${CONSTELLATION_TEXT} 별자리`}>
      <div className="Sky-world">
        <div className="Sky-bg">
          {bgStars.map((b) => (
            <span
              key={b.id}
              className="Sky-bgstar"
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: b.size,
                height: b.size,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.dur}s`,
              }}
            />
          ))}
        </div>

        <div className="Sky-field">
          {decorStars.map((d) => (
            <span
              key={d.id}
              className={`Sky-decor${openSet.has(d.near) ? ' is-lit' : ''}`}
              style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
            />
          ))}

          <svg className="Sky-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {segs.map((s) => (
              <path key={`${s.a}-${s.b}`} className="Sky-line" d={s.d} pathLength="1" fill="none" />
            ))}
          </svg>

          {constellation.slice(0, count).map((p, i) => (
            <button
              key={i}
              type="button"
              data-star={i}
              className={`Sky-star${openSet.has(i) ? ' is-open' : ''}${active === i ? ' is-active' : ''}${reborn === i ? ' is-reborn' : ''}`}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, animationDelay: `${(i % 7) * 0.4}s` }}
              onClick={(e) => open(i, e)}
              aria-label={`${i + 1}번째 별, ${messages[i].from}의 메시지`}
            />
          ))}
        </div>
      </div>

      <div className="Sky-counter" aria-live="polite">
        ★ {opened.length} / {count}
      </div>
      {opened.length === 0 && <p className="Sky-hint">별을 눌러 메시지를 열어보세요</p>}

      {msg && (
        <>
          <div className={`Sky-overlay is-${phase}`} onClick={close} role="presentation" />
          <div ref={cardRef} className={`Sky-letter is-${phase}`} role="dialog" aria-modal="true">
            <button type="button" className="Sky-close" onClick={close} aria-label="닫기">
              ×
            </button>
            <div className="Sky-content">
              <p className="Sky-text">{msg.text}</p>
              <p className="Sky-from">— {msg.from}</p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
