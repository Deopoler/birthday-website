import Envelope from './components/Envelope'
import Sky from './components/Sky'
import PhotoBoard from './components/PhotoBoard'
import useMagnetScroll from './useMagnetScroll'
import './App.css'

// 구성: 초대장(Envelope, 전체화면 오버레이) → 밤하늘(Sky) → 스크롤하면 사진 보드(PhotoBoard)
export default function App() {
  useMagnetScroll()
  return (
    <>
      <Envelope />
      <main>
        <Sky />
        <PhotoBoard />
      </main>
    </>
  )
}
