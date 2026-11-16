import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { hasExifGps, hashBuffer, listPhotoFiles, naturalCompare } from './photos-utils.mjs'

const VIRTUAL_ID = 'virtual:photos'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID
const CACHE_SALT = 'photos-pipeline-v1'
const MAX_SRC_BYTES = 400 * 1024
const MAX_THUMB_BYTES = 160 * 1024
const WARN_ORIG_BYTES = 5 * 1024 * 1024

async function encodeWebpUnderLimit(pipelineFactory, maxDim, startQuality, maxBytes, minQuality = 5) {
  const qualities = []
  for (let q = startQuality; q >= minQuality; q -= 10) {
    qualities.push(q)
  }
  if (qualities[qualities.length - 1] !== minQuality) {
    qualities.push(minQuality)
  }

  let lastResult = null
  for (const quality of qualities) {
    const res = await pipelineFactory()
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    lastResult = res
    if (res.data.length <= maxBytes) {
      return res
    }
  }
  return lastResult
}

async function processPhotoFile(filePath, cacheDir) {
  const inputBuf = fs.readFileSync(filePath)
  const hash = hashBuffer(inputBuf, CACHE_SALT)

  const metaPath = path.join(cacheDir, `${hash}-meta.json`)
  const srcPath = path.join(cacheDir, `${hash}-src.webp`)
  const thumbPath = path.join(cacheDir, `${hash}-thumb.webp`)

  if (fs.existsSync(metaPath) && fs.existsSync(srcPath) && fs.existsSync(thumbPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      return {
        hash,
        meta,
        srcPath,
        thumbPath,
        origSize: inputBuf.length,
        cached: true,
      }
    } catch {
      // Recompute if cache file is corrupted
    }
  }

  const inputMeta = await sharp(inputBuf, { animated: false, failOn: 'none' }).metadata()
  const hasGps = hasExifGps(inputMeta)

  const makePipeline = () => sharp(inputBuf, { animated: false, failOn: 'none' }).rotate()

  const srcRes = await encodeWebpUnderLimit(makePipeline, 1200, 82, MAX_SRC_BYTES, 4)
  const thumbRes = await encodeWebpUnderLimit(makePipeline, 640, 78, MAX_THUMB_BYTES, 10)

  const stats = await sharp(srcRes.data).stats()
  const [r, g, b] = stats.channels
    .slice(0, 3)
    .map((c) => Math.max(0, Math.min(255, Math.round(c.mean))))
  const color = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

  const meta = {
    width: srcRes.info.width,
    height: srcRes.info.height,
    color,
    hasGps,
    origSize: inputBuf.length,
    srcSize: srcRes.data.length,
    thumbSize: thumbRes.data.length,
  }

  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(srcPath, srcRes.data)
  fs.writeFileSync(thumbPath, thumbRes.data)
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))

  return {
    hash,
    meta,
    srcPath,
    thumbPath,
    origSize: inputBuf.length,
    cached: false,
  }
}

export default function photosPlugin(options = {}) {
  let rootDir = process.cwd()
  let isBuild = false
  let photosDir = ''
  let cacheDir = ''

  return {
    name: 'vite-plugin-photos',

    configResolved(config) {
      rootDir = config.root
      isBuild = config.command === 'build'
      photosDir = path.resolve(rootDir, options.photosDir || 'photos')
      cacheDir = path.resolve(rootDir, 'node_modules/.cache/photos-pipeline')
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID
      }
      return null
    },

    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null

      const { supported, heic } = listPhotoFiles(photosDir)
      const candidates = [...supported]

      for (const heicFile of heic) {
        const fullPath = path.join(photosDir, heicFile)
        try {
          await sharp(fullPath).metadata()
          candidates.push(heicFile)
        } catch {
          console.warn(
            `\n[photos] ⚠️ 경고: "photos/${heicFile}" 파일은 HEIC/HEIF 형식이라 읽을 수 없어 건너뛰었습니다.\n` +
              `  → 윈도우 '사진' 앱 등에서 열기 → '다른 이름으로 저장'으로 JPG(.jpg) 형식으로 바꿔 넣어 주세요.\n`,
          )
        }
      }

      candidates.sort(naturalCompare)

      const items = []
      const shrinkWarnings = []

      for (const fileName of candidates) {
        const fullPath = path.join(photosDir, fileName)
        let processed
        try {
          processed = await processPhotoFile(fullPath, cacheDir)
        } catch (err) {
          console.warn(
            `\n[photos] ⚠️ 경고: "photos/${fileName}" 파일을 처리할 수 없어 건너뛰었습니다 (${err.message}).\n`,
          )
          continue
        }

        const { hash, meta, srcPath, thumbPath, origSize } = processed
        const srcAssetName = `assets/photo-${hash}-src.webp`
        const thumbAssetName = `assets/photo-${hash}-thumb.webp`

        if (isBuild) {
          this.emitFile({
            type: 'asset',
            fileName: srcAssetName,
            source: fs.readFileSync(srcPath),
          })
          this.emitFile({
            type: 'asset',
            fileName: thumbAssetName,
            source: fs.readFileSync(thumbPath),
          })
        }

        if (meta.hasGps || origSize > WARN_ORIG_BYTES) {
          const reasons = []
          if (meta.hasGps) reasons.push('EXIF GPS 위치 정보 포함')
          if (origSize > WARN_ORIG_BYTES) {
            reasons.push(`용량 ${(origSize / (1024 * 1024)).toFixed(2)}MB > 5MB`)
          }
          shrinkWarnings.push(`  - photos/${fileName} (${reasons.join(', ')})`)
        }

        items.push({
          id: items.length,
          src: `./${srcAssetName}`,
          thumb: `./${thumbAssetName}`,
          width: meta.width,
          height: meta.height,
          color: meta.color,
        })
      }

      if (shrinkWarnings.length > 0) {
        console.warn(
          `\n[photos] ⚠️ 주의: 원본 사진에 위치 정보(EXIF GPS)가 있거나 5MB를 넘는 파일이 있습니다:\n` +
            `${shrinkWarnings.join('\n')}\n` +
            `  → 공개 저장소에 원본이 그대로 올라가지 않도록 "npm run photos:shrink"를 실행하세요!\n`,
        )
      }

      return `export const photos = ${JSON.stringify(items, null, 2)};\n`
    },

    configureServer(server) {
      fs.mkdirSync(photosDir, { recursive: true })
      server.watcher.add(photosDir)

      const onPhotoChange = (filePath) => {
        if (path.resolve(path.dirname(filePath)) !== photosDir) return
        if ( path.basename(filePath).startsWith('.') ) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
        }
        server.ws.send({ type: 'full-reload', path: '*' })
      }

      server.watcher.on('add', onPhotoChange)
      server.watcher.on('unlink', onPhotoChange)
      server.watcher.on('change', onPhotoChange)

      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        const match = req.url.match(/\/assets\/photo-([a-f0-9]+)-(src|thumb)\.webp(?:\?.*)?$/)
        if (!match) return next()

        const [, hash, kind] = match
        const filePath = path.join(cacheDir, `${hash}-${kind}.webp`)
        if (!fs.existsSync(filePath)) return next()

        const buf = fs.readFileSync(filePath)
        res.statusCode = 200
        res.setHeader('Content-Type', 'image/webp')
        res.setHeader('Content-Length', buf.length)
        res.setHeader('Cache-Control', 'no-cache')
        res.end(buf)
      })
    },
  }
}
