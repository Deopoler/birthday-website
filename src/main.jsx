import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 3D 버전은 완성 전까지 주소에 ?3d=1 을 붙였을 때만 켠다.
// WebGL 을 못 쓰는 기기이거나 '움직임 줄이기'를 켠 경우에는 기존 2D 버전을 그대로 보여 준다.
function wants3D() {
  if (new URLSearchParams(window.location.search).get('3d') !== '1') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

const App3D = lazy(() => import('./three/App3D.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {wants3D() ? (
      <Suspense fallback={null}>
        <App3D />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
