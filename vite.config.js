import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import photosPlugin from './scripts/vite-plugin-photos.mjs'

// GitHub Pages: 상대 경로로 빌드해서 저장소 이름과 무관하게 동작
export default defineConfig({
  base: './',
  plugins: [react(), photosPlugin()],
})
