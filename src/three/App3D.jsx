import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { messages } from '../data/messages'
import { photos } from '../data/photos'
import { portraitLayout, landscapeLayout, CONSTELLATION_TEXT } from '../data/constellation'
import useMagnetScroll from '../useMagnetScroll'
import { createWorld, GRID_TOP } from './world'
import '../App.css' // 전역 기본 스타일(버튼 초기화 등)
import '../components/Sky.css' // 편지 카드·카운터·안내문 모양은 2D 버전과 같은 것을 쓴다
import './App3D.css'

// 3D 버전의 화면 껍데기. 그림은 전부 뒤의 WebGL 캔버스가 그리고,
// 여기서는 글자와 '누를 수 있는 것'(봉투·별·사진 버튼, 편지 대화상자)만 DOM 으로 얹는다 → 글씨가 선명하고 키보드·스크린리더가 그대로 동작한다.
const TITLE = '이하진 순장님의 생일을 축하합니다!'
const OPEN_MS = 820
const CLOSE_MS = 560
const params = new URLSearchParams(window.location.search)
const SKIP = params.has('skip') // 개발·검증용: 인트로 건너뛰기

const lerp = (a, b, t) => a + (b - a) * t
// 별(점) → 가로로 퍼진 빛의 띠 → 접힌 종이가 펴지듯 세워지는 편지 (transform 만 보간)
function morphFrames(from, to) {
  const cx = from.left + from.width / 2
  const cy = from.top + from.height / 2
  const tx = to.left + to.width / 2
  const ty = to.top + to.height / 2
  const at = (x, y, w, h, rx) =>
    `perspective(900px) translate(-50%, -50%) translate(${(x - tx).toFixed(2)}px, ${(y - ty).toFixed(2)}px) rotateX(${rx}deg) scale(${(w / to.width).toFixed(4)}, ${(h / to.height).toFixed(4)})`
  return [
    { offset: 0, transform: at(cx, cy, from.width, from.height, 0), borderRadius: '50%', backgroundColor: '#fffbe0' },
    { offset: 0.34, transform: at(lerp(cx, tx, 0.45), lerp(cy, ty, 0.45), to.width, 6, 0), borderRadius: '6px', backgroundColor: '#fff3c4' },
    { offset: 0.72, transform: at(tx, ty, to.width, to.height * 0.8, -38), borderRadius: '6px', backgroundColor: '#fff6d8' },
    { offset: 1, transform: at(tx, ty, to.width, to.height, 0), borderRadius: '6px', backgroundColor: '#fff8e6' },
  ]
}

function Letter({ msg, starRect, onClosing, onClosed }) {
  const [phase, setPhase] = useState('opening')
  const cardRef = useRef(null)
  const closeRef = useRef(null)
  const phaseRef = useRef('opening')
  const go = (p) => { phaseRef.current = p; setPhase(p) }

  useLayoutEffect(() => {
    const card = cardRef.current
    closeRef.current?.focus({ preventScroll: true })
    const a = card.animate(morphFrames(starRect(), card.getBoundingClientRect()), { duration: OPEN_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' })
    a.onfinish = () => go('open')
    return () => a.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback(() => {
    if (phaseRef.current !== 'open') return
    go('closing')
    onClosing()
    const card = cardRef.current
    const a = card.animate(morphFrames(starRect(), card.getBoundingClientRect()), {
      duration: CLOSE_MS, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)', direction: 'reverse', fill: 'forwards',
    })
    a.onfinish = onClosed
  }, [onClosing, onClosed, starRect])

  useEffect(() => {
    const html = document.documentElement
    const prev = [html.style.overflow, document.body.style.overflow]
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus({ preventScroll: true }) }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      html.style.overflow = prev[0]
      document.body.style.overflow = prev[1]
      window.removeEventListener('keydown', onKey)
    }
  }, [close])

  return (
    <>
      <div className={`W3-veil is-${phase}`} onClick={close} role="presentation" />
      <div ref={cardRef} className={`Sky-letter is-${phase}`} role="dialog" aria-modal="true" aria-label={`${msg.from}의 메시지`}>
        <button ref={closeRef} type="button" className="Sky-close" onClick={close} aria-label="닫기">×</button>
        <div className="Sky-content">
          <p className="Sky-text">{msg.text}</p>
          <p className="Sky-from">— {msg.from}</p>
        </div>
      </div>
    </>
  )
}

export default function App3D() {
  const canvasRef = useRef(null)
  const worldRef = useRef(null)
  const skyRef = useRef(null)
  const fieldRef = useRef(null)
  const gridRef = useRef(null)
  const photoOverlayRef = useRef(null)
  const returnFocus = useRef(null)
  const [phase, setPhase] = useState(SKIP ? 'sky' : 'closed')
  const [lay, setLay] = useState(null)
  const [opened, setOpened] = useState([])
  const [active, setActive] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [finale, setFinale] = useState('no') // no | show | done

  const count = Math.min(messages.length, portraitLayout.constellation.length)
  useMagnetScroll('.W3-sky')

  useEffect(() => {
    const world = createWorld(canvasRef.current, {
      photos,
      starCount: count,
      onLayout: setLay,
      onFrame: (f) => {
        if (fieldRef.current) fieldRef.current.style.transform = `translate(${f.starDx.toFixed(1)}px, ${f.starDy.toFixed(1)}px)`
        if (gridRef.current) gridRef.current.style.transform = `translate(${f.wallDx.toFixed(1)}px, ${f.wallDy.toFixed(1)}px)`
      },
    })
    worldRef.current = world
    window.__world = world
    if (SKIP) world.skipIntro()
    world.start()
    return () => {
      world.dispose()
      worldRef.current = null
    }
  }, [count])

  // 인트로 동안 스크롤 잠금
  useEffect(() => {
    if (phase === 'sky') return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.scrollTo(0, 0)
    return () => { document.body.style.overflow = prev }
  }, [phase])

  // 스크롤 → 카메라(별자리에서 사진으로 날아가고, 사진 벽을 따라 내려간다)
  useEffect(() => {
    if (phase !== 'sky') return undefined
    const sync = () => worldRef.current?.setScroll(window.scrollY, skyRef.current?.offsetHeight ?? 0)
    sync()
    window.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [phase])

  // 시차: 마우스 위치 / 휴대폰 기울기
  useEffect(() => {
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return
      worldRef.current?.setPointer((e.clientX / window.innerWidth - 0.5) * 2, -(e.clientY / window.innerHeight - 0.5) * 2)
    }
    let base = null
    const onTilt = (e) => {
      if (e.beta == null || e.gamma == null) return
      if (base == null) base = e.beta
      base += (e.beta - base) * 0.02 // 쥐는 각도가 바뀌면 천천히 기준을 옮긴다
      worldRef.current?.setPointer(e.gamma / 28, (e.beta - base) / 28)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('deviceorientation', onTilt, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('deviceorientation', onTilt)
    }
  }, [])

  const pick = () => {
    if (phase !== 'closed') return
    worldRef.current?.pickUp(setPhase)
  }

  // ── 별 ──
  const starBtn = (i) => fieldRef.current?.querySelector(`[data-star="${i}"]`)
  const starRect = useCallback(() => {
    const r = starBtn(active)?.getBoundingClientRect()
    return r ?? { left: window.innerWidth / 2 - 7, top: window.innerHeight / 2 - 7, width: 14, height: 14 }
  }, [active])
  const openStar = (i) => {
    if (active != null) return
    returnFocus.current = i
    setOpened((o) => (o.includes(i) ? o : [...o, i]))
    setActive(i)
    worldRef.current?.openStar(i)
  }
  const onClosing = useCallback(() => worldRef.current?.closeStar(active), [active])
  const onClosed = useCallback(() => setActive(null), [])
  useEffect(() => {
    if (active != null || returnFocus.current == null) return
    starBtn(returnFocus.current)?.focus({ preventScroll: true })
    returnFocus.current = null
  }, [active])

  // 모두 열고 마지막 편지를 닫으면 피날레
  useEffect(() => {
    if (finale !== 'no' || active != null || count === 0 || opened.length < count) return undefined
    worldRef.current?.finale()
    setFinale('show')
    const t = setTimeout(() => setFinale('done'), 9000)
    return () => clearTimeout(t)
  }, [opened, active, count, finale])

  // ── 사진 ──
  const openPhoto = (i) => {
    if (photo != null) return
    const p = worldRef.current?.openPhoto(i)
    if (p) setPhoto(i)
  }
  const closePhoto = useCallback(() => {
    const p = worldRef.current?.closePhoto()
    if (!p) return
    p.then(() => {
      setPhoto((cur) => {
        gridRef.current?.querySelector(`[data-photo="${cur}"]`)?.focus({ preventScroll: true })
        return null
      })
    })
  }, [])
  useEffect(() => {
    if (photo == null) return undefined
    photoOverlayRef.current?.focus({ preventScroll: true })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') closePhoto()
      else if (e.key === 'Tab') e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [photo, closePhoto])

  const layout = lay?.landscape ? landscapeLayout : portraitLayout
  const modal = active != null
  const inSky = phase === 'sky'
  const sectionH = lay ? Math.max(lay.vh, GRID_TOP + lay.masonry.totalHeight + 110) : 0

  return (
    <>
      <canvas ref={canvasRef} className="W3-canvas" aria-hidden="true" />

      {!inSky && (
        <section className={`W3-intro is-${phase}`} aria-label="생일 초대장">
          <h1 className="W3-title">{TITLE}</h1>
          <button type="button" className="W3-pick" onClick={pick} disabled={phase !== 'closed'} aria-label="봉투 줍기">
            <span className="W3-hint">바닥의 봉투를 주워 보세요</span>
          </button>
        </section>
      )}

      <main className={inSky ? '' : 'W3-hidden'} inert={!inSky}>
        <section ref={skyRef} className="W3-sky" aria-label={`${CONSTELLATION_TEXT} 별자리`}>
          {lay && (
            <div ref={fieldRef} className="W3-field" style={{ left: (lay.vw - lay.fieldW) / 2, width: lay.fieldW }} inert={modal}>
              {layout.constellation.slice(0, count).map((p, i) => (
                <button
                  key={i}
                  type="button"
                  data-star={i}
                  className="W3-star"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  onClick={() => openStar(i)}
                  aria-label={`${i + 1}번째 별, ${messages[i].from}의 메시지${opened.includes(i) ? ' (열어 봄)' : ''}`}
                />
              ))}
            </div>
          )}
          <div className="Sky-counter" aria-live="polite" inert={modal}>★ {opened.length} / {count}</div>
          {opened.length === 0 && <p className="Sky-hint" inert={modal}>별을 눌러 메시지를 열어보세요</p>}
          <p className="Sky-scroll">아래로 스크롤해 보세요<span aria-hidden="true">⌄</span></p>
        </section>

        <section className="W3-photos" style={{ height: sectionH || undefined }} aria-label="사진">
          <p className="W3-sub" inert={photo != null}>사진을 눌러 크게 보세요</p>
          {lay && (
            <div ref={gridRef} className="W3-grid" style={{ top: GRID_TOP, left: (lay.vw - lay.gridW) / 2, width: lay.gridW }} inert={photo != null}>
              {photos.map((p, i) => {
                const b = lay.masonry.items[i]
                return (
                  <button
                    key={p.id ?? i}
                    type="button"
                    data-photo={i}
                    className="W3-note"
                    style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
                    onClick={() => openPhoto(i)}
                    aria-label={`사진 ${i + 1} 크게 보기`}
                  />
                )
              })}
            </div>
          )}
        </section>
      </main>

      {modal && <Letter key={active} msg={messages[active]} starRect={starRect} onClosing={onClosing} onClosed={onClosed} />}

      {photo != null && (
        <div
          ref={photoOverlayRef}
          className="W3-photo-overlay"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`사진 ${photo + 1} 크게 보기`}
          onClick={closePhoto}
        />
      )}

      {finale === 'show' && (
        <p className="W3-finale" role="status">
          <span>생일 축하해요</span>
          <strong>하진 순장님</strong>
        </p>
      )}
    </>
  )
}
