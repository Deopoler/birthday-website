import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { hashBuffer, listPhotoFiles, naturalCompare } from './photos-utils.mjs'

// 사진 원본은 공개 저장소가 아니라 content/photos/(비공개 저장소의 로컬 복사본, gitignored)에 둔다.
// 여기서 자동 회전·메타데이터(EXIF/GPS) 제거·WebP 축소한 사본만 사이트(dist)에 들어간다.

const VIRTUAL_ID = 'virtual:photos'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID
const CACHE_SALT = 'photos-pipeline-v1'
const MAX_SRC_BYTES = 400 * 1024
const MAX_THUMB_BYTES = 160 * 1024

const norm = (p) => {
  const r = path.resolve(p)
  return process.platform === 'win32' ? r.toLowerCase() : r
}

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
      return { hash, meta, srcPath, thumbPath }
    } catch {
      // 캐시가 깨졌으면 다시 만든다
    }
  }

  // sharp 는 withMetadata() 를 부르지 않으면 출력에서 EXIF·GPS·XMP 등 메타데이터를 모두 뺀다.
  // rotate() 는 EXIF 방향값대로 픽셀을 돌려 둔다(메타데이터가 빠져도 방향이 맞게).
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
    srcSize: srcRes.data.length,
    thumbSize: thumbRes.data.length,
  }

  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(srcPath, srcRes.data)
  fs.writeFileSync(thumbPath, thumbRes.data)
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))

  return { hash, meta, srcPath, thumbPath }
}

export default function photosPlugin(options = {}) {
  let rootDir = process.cwd()
  let isBuild = false
  let photosDir = ''
  let legacyDir = ''
  let cacheDir = ''
  let label = 'content/photos'

  return {
    name: 'vite-plugin-photos',

    configResolved(config) {
      rootDir = config.root
      isBuild = config.command === 'build'
      label = options.photosDir || 'content/photos'
      photosDir = path.resolve(rootDir, label)
      legacyDir = path.resolve(rootDir, 'photos')
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

      // 예전 방식(저장소 맨 위 photos/)에 사진이 남아 있으면 옮기라고 알린다(읽거나 올리지는 않음).
      const legacy = listPhotoFiles(legacyDir)
      const legacyCount = legacy.supported.length + legacy.heic.length
      if (legacyCount > 0) {
        console.warn(
          `\n[photos] ⚠️ 저장소 맨 위 photos/ 폴더에 사진 ${legacyCount}장이 있어요. 이 폴더는 더 이상 쓰지 않아요.\n` +
            `  → 사진을 content/photos/ 로 옮기세요(공개 저장소에는 사진을 올리지 않아요. README 참고).\n`,
        )
      }

      const { supported, heic } = listPhotoFiles(photosDir)
      const candidates = [...supported]

      for (const heicFile of heic) {
        const fullPath = path.join(photosDir, heicFile)
        try {
          await sharp(fullPath).metadata()
          candidates.push(heicFile)
        } catch {
          console.warn(
            `\n[photos] ⚠️ 경고: "${label}/${heicFile}" 파일은 HEIC/HEIF 형식이라 읽을 수 없어 건너뛰었습니다.\n` +
              `  → 윈도우 '사진' 앱 등에서 열기 → '다른 이름으로 저장'으로 JPG(.jpg) 형식으로 바꿔 넣어 주세요.\n`,
          )
        }
      }

      candidates.sort(naturalCompare)

      const items = []

      for (const fileName of candidates) {
        const fullPath = path.join(photosDir, fileName)
        let processed
        try {
          processed = await processPhotoFile(fullPath, cacheDir)
        } catch (err) {
          console.warn(
            `\n[photos] ⚠️ 경고: "${label}/${fileName}" 파일을 처리할 수 없어 건너뛰었습니다 (${err.message}).\n`,
          )
          continue
        }

        const { hash, meta, srcPath, thumbPath } = processed
        const srcAssetName = `assets/photo-${hash}-src.webp`
        const thumbAssetName = `assets/photo-${hash}-thumb.webp`

        if (isBuild) {
          this.emitFile({ type: 'asset', fileName: srcAssetName, source: fs.readFileSync(srcPath) })
          this.emitFile({ type: 'asset', fileName: thumbAssetName, source: fs.readFileSync(thumbPath) })
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

      if (isBuild) {
        console.log(
          items.length > 0
            ? `[photos] ${label}/ 의 사진 ${items.length}장을 줄여서 넣었어요.`
            : `[photos] ${label}/ 에 사진이 없어 더미 사진을 보여 줘요.`,
        )
      }

      return `export const photos = ${JSON.stringify(items, null, 2)};\n`
    },

    configureServer(server) {
      // content/ 는 만들지 않는다(content:init 의 clone 이 빈 폴더가 아니면 실패하므로). 없어도 감시는 걸 수 있다.
      const contentDir = path.dirname(photosDir)
      const syncWatch = () => {
        server.watcher.add([contentDir, photosDir, legacyDir])
      }
      syncWatch()
      const target = norm(photosDir)
      const legacy = norm(legacyDir)

      const onChange = (filePath) => {
        const p = norm(filePath)
        const dir = norm(path.dirname(filePath))
        const relevant =
          dir === target ||
          dir === legacy ||
          p === target ||
          p === legacy ||
          target.startsWith(p + path.sep) // content/ 자체가 생기거나 지워짐
        if (!relevant) return
        syncWatch()
        if (path.basename(filePath).startsWith('.') && p !== target && !target.startsWith(p + path.sep)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
        }
        server.ws.send({ type: 'full-reload', path: '*' })
      }

      for (const ev of ['add', 'unlink', 'change', 'addDir', 'unlinkDir']) {
        server.watcher.on(ev, onChange)
      }

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
