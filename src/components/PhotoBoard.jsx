import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dummyPhotos } from '../data/dummyPhotos'
import { photos } from '../data/photos'
import './PhotoBoard.css'

const NOTE_COLORS = ['#fff3a8', '#ffd1dc', '#c9f0e1', '#d2e4ff', '#f1d9ff', '#ffe0b8']
const DURATION = 420
const EASE = 'cubic-bezier(0.22, 0.8, 0.25, 1)'

// 극단적인 파노라마(3:1 등)나 아주 긴 세로(1:3 등)도 레이아웃이 깨지지 않도록
// 사진 영역의 가로/세로 비율을 0.6 ~ 1.8 범위로 완만하게 제한한다.
const MIN_PHOTO_ASPECT = 0.6
const MAX_PHOTO_ASPECT = 1.8

// 포스트잇 테두리 여백(카드 가로 폭 대비 비율): 좌우 7.5%, 위 7.5%, 아래 13.5%
// → 내부 사진 가로 폭 = 85% (INNER_W = 0.85), 상하 여백 합 = 21% (PAD_Y = 0.21)
// → 카드 세로/가로 비율(noteHOverW) = 0.21 + 0.85 / photoAspect (크기와 무관하게 일정)
const INNER_W = 0.85
const PAD_Y = 0.21

const MAX_GRID_WIDTH = 720
const WIDE_BREAKPOINT = 700

function tilt(i) {
  const v = [-3.2, 2.4, -1.4, 3.1, -2.4, 1.6, -3.6, 2.9]
  return v[(i * 5 + 3) % v.length]
}

function getPhotoAspect(photo, index = 0) {
  const fallback = dummyPhotos[index % dummyPhotos.length]
  const w = Number(photo?.width) || fallback.width
  const h = Number(photo?.height) || fallback.height
  const raw = w > 0 && h > 0 ? w / h : 1
  return Math.min(MAX_PHOTO_ASPECT, Math.max(MIN_PHOTO_ASPECT, raw))
}

function noteHOverW(photoAspect) {
  return PAD_Y + INNER_W / photoAspect
}

function measureViewport() {
  if (typeof window === 'undefined') {
    return { vw: 390, vh: 844, gridW: 358 }
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gridW = Math.min(MAX_GRID_WIDTH, Math.max(200, vw - 32))
  return { vw, vh, gridW }
}

function computeMasonry(list, gridW, vw) {
  const count = list.length
  if (count === 0) return { items: [], totalHeight: 0 }

  const isWide = vw >= WIDE_BREAKPOINT
  const baseCols = isWide ? 3 : 2
  const cols = Math.max(1, Math.min(baseCols, count))
  const gapX = isWide ? 24 : 16
  const gapY = isWide ? 28 : 22
  const colW = (gridW - gapX * (cols - 1)) / cols

  // 열마다 시작 높이에 살짝 차이를 두어 포스트잇이 자연스럽게 엇갈려 보이게 한다
  const baseOffsets = cols === 3 ? [0, 28, 12] : cols === 2 ? [0, 28] : [0]
  const colHeights = baseOffsets.slice(0, cols)

  const items = list.map((photo, i) => {
    let col = i < cols ? i : 0
    if (i >= cols) {
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[col]) col = c
      }
    }
    const aspect = getPhotoAspect(photo, i)
    const hOverW = noteHOverW(aspect)
    const width = colW
    const height = colW * hOverW
    const left = col * (colW + gapX)
    const top = colHeights[col]
    colHeights[col] = top + height + gapY
    return { left, top, width, height, aspect }
  })

  const totalHeight = Math.max(...colHeights) - gapY
  return { items, totalHeight }
}

function finalBox(photo, index) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const aspect = getPhotoAspect(photo, index)
  const hOverW = noteHOverW(aspect)

  const maxW = Math.min(vw * 0.88, 520)
  const maxH = Math.min(vh * 0.8, 640)
  const w = Math.min(maxW, maxH / hOverW)
  const h = w * hOverW
  return {
    left: (vw - w) / 2,
    top: (vh - h) / 2,
    width: w,
    height: h,
  }
}

function flip(from, to) {
  const sx = from.width / to.width
  const sy = from.height / to.height
  const t = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`
  return [{ transform: t }, { transform: 'translate(0, 0) scale(1, 1)' }]
}

function Note({ photo, index, isBig = false, className = '', style, onClick, noteRef }) {
  const thumbSrc = photo.thumb || photo.src || null
  const fullSrc = isBig ? photo.src || photo.thumb || null : null
  const needsUpgrade = Boolean(isBig && fullSrc && thumbSrc && fullSrc !== thumbSrc)
  const [loadedSrc, setLoadedSrc] = useState(null)
  const fullLoaded = needsUpgrade && loadedSrc === fullSrc

  return (
    <button
      type="button"
      ref={noteRef}
      className={`pb-note ${className}`}
      style={{
        '--note': NOTE_COLORS[index % NOTE_COLORS.length],
        '--tilt': `${tilt(index)}deg`,
        ...style,
      }}
      onClick={onClick}
      aria-label={`사진 ${index + 1} 크게 보기`}
    >
      <span className="pb-tape" aria-hidden="true" />
      <span className="pb-photo" style={{ backgroundColor: photo.color }}>
        {thumbSrc && (
          <img
            className="pb-img pb-img-base"
            src={thumbSrc}
            width={photo.width || undefined}
            height={photo.height || undefined}
            loading={isBig ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            alt=""
          />
        )}
        {needsUpgrade && (
          <img
            ref={(img) => {
              if (img && img.complete && img.naturalWidth > 0 && loadedSrc !== fullSrc) {
                setLoadedSrc(fullSrc)
              }
            }}
            className={`pb-img pb-img-full ${fullLoaded ? 'is-loaded' : ''}`}
            src={fullSrc}
            width={photo.width || undefined}
            height={photo.height || undefined}
            decoding="async"
            draggable={false}
            alt=""
            onLoad={() => setLoadedSrc(fullSrc)}
          />
        )}
      </span>
    </button>
  )
}

export default function PhotoBoard() {
  const [active, setActive] = useState(null) // { index, from: DOMRect, to }
  const [closing, setClosing] = useState(false)
  const [viewport, setViewport] = useState(measureViewport)
  const gridRef = useRef(null)
  const refs = useRef({})
  const cardRef = useRef(null)
  const backdropRef = useRef(null)
  const overlayRef = useRef(null)
  const returnFocusRef = useRef(null)

  useLayoutEffect(() => {
    const updateSize = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const gridW = gridRef.current?.clientWidth || Math.min(MAX_GRID_WIDTH, Math.max(200, vw - 32))
      setViewport((prev) => (prev.vw === vw && prev.vh === vh && prev.gridW === gridW ? prev : { vw, vh, gridW }))
      setActive((prev) => (prev ? { ...prev, to: finalBox(photos[prev.index], prev.index) } : null))
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    let ro
    if (typeof ResizeObserver !== 'undefined' && gridRef.current) {
      ro = new ResizeObserver(updateSize)
      ro.observe(gridRef.current)
    }
    return () => {
      window.removeEventListener('resize', updateSize)
      ro?.disconnect()
    }
  }, [])

  const layout = useMemo(
    () => computeMasonry(photos, viewport.gridW, viewport.vw),
    [viewport.gridW, viewport.vw],
  )

  const open = (i) => {
    if (active) return
    const el = refs.current[i]
    if (!el) return
    returnFocusRef.current = i
    setActive({ index: i, from: el.getBoundingClientRect(), to: finalBox(photos[i], i) })
  }

  // 열기: 원래 위치 → 중앙 (FLIP)
  useLayoutEffect(() => {
    if (!active) return
    overlayRef.current?.focus({ preventScroll: true })
    cardRef.current?.animate(flip(active.from, active.to), { duration: DURATION, easing: EASE })
    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: 'ease' })
  }, [active])

  const close = useCallback(() => {
    if (!active || closing) return
    setClosing(true)
    const el = refs.current[active.index]
    const from = el ? el.getBoundingClientRect() : active.from
    const opts = { duration: DURATION, easing: EASE, fill: 'forwards' }
    cardRef.current?.animate(flip(from, active.to).reverse(), opts)
    const b = backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], opts)
    if (b) {
      b.onfinish = () => {
        setActive(null)
        setClosing(false)
      }
    } else {
      setActive(null)
      setClosing(false)
    }
  }, [active, closing])

  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'Tab') {
        // 모달 안에서 이동할 곳이 없으므로 포커스를 모달에 고정
        e.preventDefault()
        overlayRef.current?.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [active, close])

  // 닫힌 뒤 포커스를 연 사진으로 되돌린다
  useEffect(() => {
    if (active || returnFocusRef.current == null) return
    refs.current[returnFocusRef.current]?.focus({ preventScroll: true })
    returnFocusRef.current = null
  }, [active])

  return (
    <section className="PhotoBoard">
      <div className="pb-fade" aria-hidden="true" />
      <p className="pb-sub" inert={!!active}>사진을 눌러 크게 보세요</p>
      <div
        className="pb-grid"
        ref={gridRef}
        style={{ height: layout.totalHeight }}
        inert={!!active}
      >
        {photos.map((p, i) => {
          const box = layout.items[i]
          return (
            <div
              className="pb-cell"
              key={p.id ?? i}
              style={
                box
                  ? {
                      left: `${box.left}px`,
                      top: `${box.top}px`,
                      width: `${box.width}px`,
                      height: `${box.height}px`,
                    }
                  : undefined
              }
            >
              <Note
                photo={p}
                index={i}
                noteRef={(el) => (refs.current[i] = el)}
                style={active && active.index === i ? { visibility: 'hidden' } : undefined}
                onClick={() => open(i)}
              />
            </div>
          )
        })}
      </div>

      {active && (
        <div
          className="pb-overlay"
          ref={overlayRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`사진 ${active.index + 1} 크게 보기`}
        >
          <div className="pb-backdrop" ref={backdropRef} onClick={close} />
          <div
            className="pb-zoom"
            ref={cardRef}
            style={{
              left: active.to.left,
              top: active.to.top,
              width: active.to.width,
              height: active.to.height,
            }}
            onClick={close}
          >
            <Note
              photo={photos[active.index]}
              index={active.index}
              isBig
              className="pb-big"
              style={{ '--tilt': '0deg' }}
            />
          </div>
        </div>
      )}
    </section>
  )
}
