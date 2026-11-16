import { useMemo, useState } from 'react'
import { messages } from '../data/messages'
import { constellation, CONSTELLATION_TEXT } from '../data/constellation'
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

export default function Sky() {
  const bgStars = useMemo(() => makeBgStars(70), [])
  const [opened, setOpened] = useState([]) // 연 순서대로의 별 index
  const [active, setActive] = useState(null)

  const count = Math.min(messages.length, constellation.length)
  const stars = constellation.slice(0, count)

  const open = (i) => {
    setOpened((o) => (o.includes(i) ? o : [...o, i]))
    setActive(i)
  }

  const lines = opened.slice(1).map((id, k) => [opened[k], id])
  const msg = active != null ? messages[active] : null

  return (
    <section className="Sky" aria-label={`${CONSTELLATION_TEXT} 별자리`}>
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
        <svg className="Sky-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {lines.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              className="Sky-line"
              x1={stars[a].x * 100}
              y1={stars[a].y * 100}
              x2={stars[b].x * 100}
              y2={stars[b].y * 100}
              pathLength="1"
            />
          ))}
        </svg>

        {stars.map((p, i) => (
          <button
            key={i}
            type="button"
            className={`Sky-star${opened.includes(i) ? ' is-open' : ''}${active === i ? ' is-active' : ''}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, animationDelay: `${(i % 7) * 0.4}s` }}
            onClick={() => open(i)}
            aria-label={`${i + 1}번째 별, ${messages[i].from}의 메시지`}
          />
        ))}
      </div>

      <div className="Sky-counter" aria-live="polite">
        ★ {opened.length} / {count}
      </div>
      {opened.length === 0 && <p className="Sky-hint">별을 눌러 메시지를 열어보세요</p>}

      {msg && (
        <div className="Sky-overlay" onClick={() => setActive(null)} role="presentation">
          <div
            className="Sky-letter"
            role="dialog"
            aria-modal="true"
            style={{ transformOrigin: `${stars[active].x * 100}% ${stars[active].y * 100}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="Sky-close" onClick={() => setActive(null)} aria-label="닫기">
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
