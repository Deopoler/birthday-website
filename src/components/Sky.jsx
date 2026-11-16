import { useEffect, useMemo, useRef, useState } from 'react'
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

const ZOOM_MS = 520

export default function Sky() {
  const bgStars = useMemo(() => makeBgStars(60), [])
  const [opened, setOpened] = useState([])
  const [active, setActive] = useState(null) // 확대 중인 별
  const [showLetter, setShowLetter] = useState(false)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })
  const skyRef = useRef(null)
  const timer = useRef(0)

  const count = Math.min(messages.length, constellation.length)
  const openSet = new Set(opened)
  const segs = strokeSegments.filter((s) => openSet.has(s.a) && openSet.has(s.b))

  const open = (i, e) => {
    const sky = skyRef.current.getBoundingClientRect()
    const r = e.currentTarget.getBoundingClientRect()
    setOrigin({ x: r.left + r.width / 2 - sky.left, y: r.top + r.height / 2 - sky.top })
    setOpened((o) => (o.includes(i) ? o : [...o, i]))
    setActive(i)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShowLetter(true), ZOOM_MS)
  }

  const close = () => {
    clearTimeout(timer.current)
    setShowLetter(false)
    setActive(null)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  // 확대/모달이 열려 있는 동안만 페이지 스크롤 잠금
  useEffect(() => {
    if (active == null) return undefined
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      html.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [active])

  const msg = active != null && showLetter ? messages[active] : null

  return (
    <section ref={skyRef} className="Sky" aria-label={`${CONSTELLATION_TEXT} 별자리`}>
      <div
        className={`Sky-world${active != null ? ' is-zoomed' : ''}`}
        style={{ transformOrigin: `${origin.x}px ${origin.y}px` }}
      >
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
              className={`Sky-star${openSet.has(i) ? ' is-open' : ''}${active === i ? ' is-active' : ''}`}
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
        <div className="Sky-overlay" onClick={close} role="presentation">
          <div className="Sky-letter" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="Sky-close" onClick={close} aria-label="닫기">
              ×
            </button>
            <p className="Sky-text">{msg.text}</p>
            <p className="Sky-from">— {msg.from}</p>
          </div>
        </div>
      )}
    </section>
  )
}
