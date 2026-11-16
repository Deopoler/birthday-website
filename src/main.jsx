import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// 기본은 3D 버전. 아래 경우에는 기존 2D 버전을 보여 준다.
//  - 주소에 ?3d=0 을 붙였을 때(직접 고르기)
//  - '움직임 줄이기'를 켠 기기
//  - WebGL 을 못 쓰는 기기
function wants3D() {
  if (new URLSearchParams(window.location.search).get('3d') === '0') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

// 쓰는 쪽만 내려받는다
const Root = wants3D() ? lazy(() => import('./three/App3D.jsx')) : lazy(() => import('./App.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
)
