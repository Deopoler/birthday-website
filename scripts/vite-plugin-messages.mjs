import path from 'node:path'
import { loadMessagesFile, MessagesError } from './content-messages.mjs'

// content/messages.json(비공개 저장소의 로컬 복사본, gitignored)을 가상 모듈 virtual:messages 로 내보낸다.
// 파일이 없거나 비어 있으면 빈 목록 → src/data/messages.js 가 더미 메시지로 대신한다.

const VIRTUAL_ID = 'virtual:messages'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID

const norm = (p) => {
  const r = path.resolve(p)
  return process.platform === 'win32' ? r.toLowerCase() : r
}

export default function messagesPlugin(options = {}) {
  let filePath = ''
  let label = 'content/messages.json'
  let isBuild = false

  return {
    name: 'vite-plugin-messages',

    configResolved(config) {
      label = options.file || 'content/messages.json'
      filePath = path.resolve(config.root, label)
      isBuild = config.command === 'build'
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null
      if (process.env.SITE_LOCK === '1') {
        return 'export const messages = [];\n'
      }
      let result
      try {
        result = loadMessagesFile(filePath, label)
      } catch (err) {
        if (err instanceof MessagesError) {
          // 빌드는 실패하고(잘못된 내용이 배포되지 않게), 개발 서버는 화면에 오류를 띄운다.
          this.error({
            message: `[messages] ${err.message}`,
            id: filePath,
            loc: err.line ? { file: filePath, line: err.line, column: err.column - 1 } : undefined,
          })
        }
        throw err
      }
      for (const w of result.warnings) console.warn(`[messages] ⚠️ ${w}`)
      if (isBuild) {
        console.log(
          result.messages.length > 0
            ? `[messages] ${label} 의 메시지 ${result.messages.length}개를 넣었어요.`
            : `[messages] ${label} 이 없거나 비어 있어 더미 메시지를 보여 줘요.`,
        )
      }
      return `export const messages = ${JSON.stringify(result.messages, null, 2)};\n`
    },

    configureServer(server) {
      if (process.env.SITE_LOCK === '1') return
      const contentDir = path.dirname(filePath)
      const syncWatch = () => {
        server.watcher.add([contentDir, filePath])
      }
      syncWatch()
      const target = norm(filePath)
      const onChange = (p) => {
        const n = norm(p)
        if (n !== target && !target.startsWith(n + path.sep)) return
        syncWatch()
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload', path: '*' })
      }
      for (const ev of ['add', 'unlink', 'change', 'addDir', 'unlinkDir']) server.watcher.on(ev, onChange)
    },
  }
}
