import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import messagesPlugin from './scripts/vite-plugin-messages.mjs'
import photosPlugin from './scripts/vite-plugin-photos.mjs'
import siteLockPlugin from './scripts/vite-plugin-site-lock.mjs'

// GitHub Pages: 상대 경로로 빌드해서 저장소 이름과 무관하게 동작
export default defineConfig({
  base: './',
  plugins: [react(), siteLockPlugin(), photosPlugin(), messagesPlugin()],
})
