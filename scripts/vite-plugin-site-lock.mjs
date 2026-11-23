import fs from 'node:fs'
import path from 'node:path'
import {
  encryptBytes,
  encryptManifest,
  importContentKey,
  normalizePassword,
  parseContentKey,
  parseRekeyLockCode,
  randomHex,
  unwrapRekeyLockCode,
  wrapKey,
} from '../src/lock/crypto.js'
import { loadMessagesFile, MessagesError } from './content-messages.mjs'
import { collectAndProcessPhotos } from './vite-plugin-photos.mjs'

// SITE_LOCK=1 일 때만 동작하는 잠금 빌드 플러그인.
// - initial 모드: SITE_CONTENT_KEY(K)로 콘텐츠를 암호화하고, SITE_PASSWORD로 감싼 K(HJ1.)를 넣는다.
// - final 모드(SITE_LOCK_CODE=HJ2....): K로 새 키 K2를 복호화해 모든 콘텐츠를 K2로 암호화하고,
//   새 비밀번호로 감싼 K2(HJ1.)만 넣는다(encK2나 K로 암호화한 데이터는 넣지 않아 초기 비밀번호를 완전히 무효화).
// - SITE_LOCK 이 꺼져 있으면 virtual:site-lock 에 LOCKED=false 만 내보내고 아무것도 바꾸지 않는다.

const VIRTUAL_ID = 'virtual:site-lock'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID
const LOCKED_DESC = '하진 순장님의 생일 축하가 끝났어요. 함께 축하해 주셔서 고마워요 ✨'

const isLockEnabled = () => process.env.SITE_LOCK === '1'

function replaceMetaContent(html, attrName, attrValue, newContent) {
  const re = new RegExp(`(<meta\\s+[^>]*${attrName}="${attrValue}"[^>]*content=")[^"]*("[^>]*>)`, 'i')
  if (re.test(html)) {
    return html.replace(re, `$1${newContent}$2`)
  }
  const reRev = new RegExp(`(<meta\\s+[^>]*content=")[^"]*("[^>]*${attrName}="${attrValue}"[^>]*>)`, 'i')
  return html.replace(reRev, `$1${newContent}$2`)
}

export default function siteLockPlugin(options = {}) {
  let rootDir = process.cwd()
  let isBuild = false
  let lockConfig = null
  const devAssets = new Map()

  async function resolveLockConfig() {
    if (lockConfig) return lockConfig
    const rawKeyEnv = process.env.SITE_CONTENT_KEY
    const lockCodeEnv = (process.env.SITE_LOCK_CODE || '').trim()
    const passwordEnv = normalizePassword(process.env.SITE_PASSWORD || '')

    let rawK
    try {
      rawK = parseContentKey(rawKeyEnv)
    } catch (err) {
      throw new Error(`[site-lock] ${err.message} (SITE_LOCK=1 에는 32바이트 base64 SITE_CONTENT_KEY 가 필요해요.)`)
    }

    let mode
    let lockWrap
    let contentAesKey
    try {
      if (lockCodeEnv) {
        try {
          parseRekeyLockCode(lockCodeEnv)
        } catch (err) {
          throw new Error(`[site-lock] SITE_LOCK_CODE 형식이 올바르지 않아요: ${err.message}`)
        }
        const aesKeyK = await importContentKey(rawK)
        let rawK2 = null
        try {
          const res = await unwrapRekeyLockCode(lockCodeEnv, aesKeyK)
          rawK2 = res.rawK2
          lockWrap = res.wrapK2Code
          contentAesKey = await importContentKey(rawK2)
        } catch {
          throw new Error(
            '[site-lock] SITE_LOCK_CODE의 새 콘텐츠 키를 SITE_CONTENT_KEY로 복호화하지 못했어요. 키와 잠금 코드가 일치하는지 확인해 주세요.',
          )
        } finally {
          if (rawK2) rawK2.fill(0)
        }
        mode = 'final'
      } else if (passwordEnv) {
        mode = 'initial'
        lockWrap = await wrapKey(rawK, passwordEnv)
        contentAesKey = await importContentKey(rawK)
      } else {
        throw new Error(
          '[site-lock] SITE_LOCK=1 에는 SITE_PASSWORD 또는 SITE_LOCK_CODE 중 하나가 반드시 필요해요.',
        )
      }
    } finally {
      rawK.fill(0)
    }

    lockConfig = { mode, lockWrap, aesKey: contentAesKey }
    return lockConfig
  }

  return {
    name: 'vite-plugin-site-lock',

    configResolved(config) {
      rootDir = config.root
      isBuild = config.command === 'build'
      lockConfig = null
    },

    async buildStart() {
      if (!isLockEnabled()) return
      // 환경변수 누락·형식 오류·키 불일치를 번들 시작 시점에 즉시 실패(fail-closed)
      await resolveLockConfig()
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
      return null
    },

    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null

      if (!isLockEnabled()) {
        return [
          'export const LOCKED = false;',
          'export const LOCK_MODE = null;',
          'export const LOCK_WRAP = null;',
          'export const ENCRYPTED_MANIFEST = null;',
          '',
        ].join('\n')
      }

      const { mode, lockWrap, aesKey } = await resolveLockConfig()

      // 1) 메시지 읽기(잠금 빌드에서는 누락·비어 있음 모두 fail-closed)
      const msgLabel = options.messagesFile || 'content/messages.json'
      const msgPath = path.resolve(rootDir, msgLabel)
      let msgResult
      try {
        msgResult = loadMessagesFile(msgPath, msgLabel)
      } catch (err) {
        if (err instanceof MessagesError) {
          this.error({
            message: `[site-lock] ${err.message}`,
            id: msgPath,
            loc: err.line ? { file: msgPath, line: err.line, column: err.column - 1 } : undefined,
          })
        }
        throw err
      }
      if (!msgResult.exists) {
        this.error(
          `[site-lock] ${msgLabel} 파일이 없어요. 잠금 빌드는 실제 메시지가 필요하므로 빈 사이트로 덮어쓰지 않고 중단해요.`,
        )
      }
      if (msgResult.messages.length === 0) {
        this.error(
          `[site-lock] ${msgLabel} 에 메시지가 비어 있어요. 잠금 빌드는 실제 메시지가 필요하므로 중단해요.`,
        )
      }
      for (const w of msgResult.warnings) {
        if (!w.includes('더미 메시지')) console.warn(`[site-lock] ⚠️ ${w}`)
      }

      // 2) 사진 처리(WebP 변환·메타 제거) 후 파일별로 새 IV로 암호화해 불투명 .bin 으로 방출
      const photosLabel = options.photosDir || 'content/photos'
      const photosDir = path.resolve(rootDir, photosLabel)
      const legacyDir = path.resolve(rootDir, 'photos')
      const cacheDir = path.resolve(rootDir, 'node_modules/.cache/photos-pipeline')

      const processedList = await collectAndProcessPhotos({
        photosDir,
        legacyDir,
        cacheDir,
        label: photosLabel,
      })
      if (processedList.length === 0) {
        this.error(
          `[site-lock] ${photosLabel}/ 에 처리할 사진이 없어요. 잠금 빌드는 실제 사진이 필요하므로 중단해요.`,
        )
      }

      devAssets.clear()
      const usedNames = new Set()
      const allocAssetName = () => {
        let name
        do {
          name = `assets/c-${randomHex(8)}.bin`
        } while (usedNames.has(name))
        usedNames.add(name)
        return name
      }

      const encryptedPhotos = []
      for (let i = 0; i < processedList.length; i++) {
        const { meta, srcPath, thumbPath } = processedList[i]
        const srcAssetName = allocAssetName()
        const thumbAssetName = allocAssetName()

        const srcPlain = new Uint8Array(fs.readFileSync(srcPath))
        const thumbPlain = new Uint8Array(fs.readFileSync(thumbPath))

        const [srcEnc, thumbEnc] = await Promise.all([
          encryptBytes(aesKey, srcPlain, `HJ1-asset:${srcAssetName}`),
          encryptBytes(aesKey, thumbPlain, `HJ1-asset:${thumbAssetName}`),
        ])

        if (isBuild) {
          this.emitFile({ type: 'asset', fileName: srcAssetName, source: Buffer.from(srcEnc) })
          this.emitFile({ type: 'asset', fileName: thumbAssetName, source: Buffer.from(thumbEnc) })
        } else {
          devAssets.set(srcAssetName, Buffer.from(srcEnc))
          devAssets.set(thumbAssetName, Buffer.from(thumbEnc))
        }

        encryptedPhotos.push({
          id: i,
          src: srcAssetName,
          thumb: thumbAssetName,
          width: meta.width,
          height: meta.height,
          color: meta.color,
        })
      }

      const manifest = {
        v: 1,
        messages: msgResult.messages.map((m, i) => ({ id: i, from: m.from, text: m.text })),
        photos: encryptedPhotos,
      }
      const encryptedManifest = await encryptManifest(aesKey, manifest)

      if (isBuild) {
        console.log(
          `[site-lock] 잠금 빌드(${mode}): 메시지 ${manifest.messages.length}개, 사진 ${encryptedPhotos.length}장(암호화 에셋 ${encryptedPhotos.length * 2}개)을 암호화해 넣었어요.`,
        )
      }

      return [
        'export const LOCKED = true;',
        `export const LOCK_MODE = ${JSON.stringify(mode)};`,
        `export const LOCK_WRAP = ${JSON.stringify(lockWrap)};`,
        `export const ENCRYPTED_MANIFEST = ${JSON.stringify(encryptedManifest)};`,
        '',
      ].join('\n')
    },

    transformIndexHtml(html) {
      if (!isLockEnabled()) return html
      let out = html
      out = replaceMetaContent(out, 'name', 'description', LOCKED_DESC)
      out = replaceMetaContent(out, 'property', 'og:description', LOCKED_DESC)
      out = replaceMetaContent(out, 'name', 'twitter:description', LOCKED_DESC)
      if (!/<meta\s+[^>]*name="robots"/i.test(out)) {
        out = out.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>')
      }
      return out
    },

    configureServer(server) {
      if (!isLockEnabled()) return
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        const match = req.url.match(/\/(assets\/c-[a-f0-9]+\.bin)(?:\?.*)?$/)
        if (!match) return next()
        const buf = devAssets.get(match[1])
        if (!buf) return next()
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Length', buf.length)
        res.setHeader('Cache-Control', 'no-cache')
        res.end(buf)
      })
    },
  }
}
