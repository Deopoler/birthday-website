import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { photos } from '../data/photos'
import './PhotoBoard.css'

const NOTE_COLORS = ['#fff3a8', '#ffd1dc', '#c9f0e1', '#d2e4ff', '#f1d9ff', '#ffe0b8']
const ASPECT = 1.18 // 포스트잇 높이/너비 (원본·확대본 동일해야 FLIP 비율이 맞는다)
const DURATION = 420
const EASE = 'cubic-bezier(0.22, 0.8, 0.25, 1)'

function tilt(i) {
  const v = [-3.2, 2.4, -1.4, 3.1, -2.4, 1.6, -3.6, 2.9]
  return v[(i * 5 + 3) % v.length]
}

function Note({ photo, index, className = '', style, onClick, noteRef }) {
  return (
    <button
      type="button"
      ref={noteRef}
      className={`pb-note ${className}`}
      style={{ '--note': NOTE_COLORS[index % NOTE_COLORS.length], '--tilt': `${tilt(index)}deg`, ...style }}
      onClick={onClick}
      aria-label={`${photo.caption} 크게 보기`}
    >
      <span className="pb-tape" aria-hidden="true" />
      <span
        className="pb-photo"
        style={photo.src ? { backgroundImage: `url(${photo.src})` } : { background: photo.color }}
      />
      <span className="pb-caption">{photo.caption}</span>
    </button>
  )
}

function finalBox() {
  const w = Math.min(window.innerWidth * 0.82, 380, (window.innerHeight * 0.8) / ASPECT)
  const h = w * ASPECT
  return { left: (window.innerWidth - w) / 2, top: (window.innerHeight - h) / 2, width: w, height: h }
}

function flip(from, to) {
  const t = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`
  return [{ transform: t }, { transform: 'translate(0,0) scale(1)' }]
}

export default function PhotoBoard() {
  const [active, setActive] = useState(null) // { index, from: DOMRect, to }
  const [closing, setClosing] = useState(false)
  const refs = useRef({})
  const cardRef = useRef(null)
  const backdropRef = useRef(null)

  const open = (i) => {
    if (active) return
    setActive({ index: i, from: refs.current[i].getBoundingClientRect(), to: finalBox() })
  }

  // 열기: 원래 위치 → 중앙 (FLIP)
  useLayoutEffect(() => {
    if (!active) return
    cardRef.current.animate(flip(active.from, active.to), { duration: DURATION, easing: EASE })
    backdropRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: 'ease' })
  }, [active])

  const close = useCallback(() => {
    if (!active || closing) return
    setClosing(true)
    const el = refs.current[active.index]
    const from = el ? el.getBoundingClientRect() : active.from
    const opts = { duration: DURATION, easing: EASE, fill: 'forwards' }
    cardRef.current.animate(flip(from, active.to).reverse(), opts)
    const b = backdropRef.current.animate([{ opacity: 1 }, { opacity: 0 }], opts)
    b.onfinish = () => {
      setActive(null)
      setClosing(false)
    }
  }, [active, closing])

  useEffect(() => {
    if (!active) return
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [active, close])

  return (
    <section className="PhotoBoard">
      <div className="pb-fade" aria-hidden="true" />
      <h2 className="pb-title">우리의 추억</h2>
      <p className="pb-sub">사진을 눌러 크게 보세요</p>
      <div className="pb-grid">
        {photos.map((p, i) => (
          <div className="pb-cell" key={p.id}>
            <Note
              photo={p}
              index={i}
              noteRef={(el) => (refs.current[i] = el)}
              style={active && active.index === i ? { visibility: 'hidden' } : undefined}
              onClick={() => open(i)}
            />
          </div>
        ))}
      </div>

      {active && (
        <div className="pb-overlay" role="dialog" aria-modal="true">
          <div className="pb-backdrop" ref={backdropRef} onClick={close} />
          <div
            className="pb-zoom"
            ref={cardRef}
            style={{ left: active.to.left, top: active.to.top, width: active.to.width, height: active.to.height }}
            onClick={close}
          >
            <Note photo={photos[active.index]} index={active.index} className="pb-big" style={{ '--tilt': '0deg' }} />
          </div>
        </div>
      )}
    </section>
  )
}
