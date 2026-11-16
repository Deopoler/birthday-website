// 사진 포스트잇 배치 계산(2D PhotoBoard 와 3D 사진 벽이 함께 쓴다)
import { dummyPhotos } from './data/dummyPhotos'

export const NOTE_COLORS = ['#fff3a8', '#ffd1dc', '#c9f0e1', '#d2e4ff', '#f1d9ff', '#ffe0b8']

// 극단적인 파노라마(3:1 등)나 아주 긴 세로(1:3 등)도 레이아웃이 깨지지 않도록
// 사진 영역의 가로/세로 비율을 0.6 ~ 1.8 범위로 완만하게 제한한다.
const MIN_PHOTO_ASPECT = 0.6
const MAX_PHOTO_ASPECT = 1.8

// 포스트잇 테두리 여백(카드 가로 폭 대비 비율): 좌우 7.5%, 위 7.5%, 아래 13.5%
// → 내부 사진 가로 폭 = 85% (INNER_W = 0.85), 상하 여백 합 = 21% (PAD_Y = 0.21)
// → 카드 세로/가로 비율(noteHOverW) = 0.21 + 0.85 / photoAspect (크기와 무관하게 일정)
export const INNER_W = 0.85
export const PAD_Y = 0.21

export const MAX_GRID_WIDTH = 720
export const WIDE_BREAKPOINT = 700

export function tilt(i) {
  const v = [-3.2, 2.4, -1.4, 3.1, -2.4, 1.6, -3.6, 2.9]
  return v[(i * 5 + 3) % v.length]
}

export function getPhotoAspect(photo, index = 0) {
  const fallback = dummyPhotos[index % dummyPhotos.length]
  const w = Number(photo?.width) || fallback.width
  const h = Number(photo?.height) || fallback.height
  const raw = w > 0 && h > 0 ? w / h : 1
  return Math.min(MAX_PHOTO_ASPECT, Math.max(MIN_PHOTO_ASPECT, raw))
}

export function noteHOverW(photoAspect) {
  return PAD_Y + INNER_W / photoAspect
}

export function measureViewport() {
  if (typeof window === 'undefined') {
    return { vw: 390, vh: 844, gridW: 358 }
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gridW = Math.min(MAX_GRID_WIDTH, Math.max(200, vw - 32))
  return { vw, vh, gridW }
}

export function computeMasonry(list, gridW, vw) {
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

export function finalBox(photo, index) {
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
