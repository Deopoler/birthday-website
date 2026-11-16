import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { hasExifGps, listPhotoFiles } from './photos-utils.mjs'

const ROOT_DIR = process.cwd()
const PHOTOS_DIR = path.resolve(ROOT_DIR, 'photos')
const ORIGINALS_DIR = path.resolve(ROOT_DIR, 'photos-originals')

const MAX_DIM = 2000
const MAX_BYTES = Math.round(1.5 * 1024 * 1024) // 1.5 MB

function formatKB(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  return `${(bytes / 1024).toFixed(1)} KB`
}

async function shrinkBufferToJpeg(inputBuf) {
  const qualities = [85, 76, 68, 58, 48, 38]
  let last = null
  for (const quality of qualities) {
    const res = await sharp(inputBuf, { animated: false, failOn: 'none' })
      .rotate()
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    last = res
    if (res.data.length <= MAX_BYTES) {
      return res
    }
  }
  return last
}

async function main() {
  const { supported, heic } = listPhotoFiles(PHOTOS_DIR)

  for (const heicFile of heic) {
    console.warn(
      `[photos:shrink] ⚠️ 경고: "photos/${heicFile}" 파일은 HEIC/HEIF 형식입니다. 윈도우 '사진' 앱 등에서 JPG(.jpg)로 변환해 넣어 주세요.`,
    )
  }

  if (supported.length === 0) {
    console.log('[photos:shrink] photos/ 폴더에 처리할 사진 파일이 없습니다.')
    return
  }

  const rows = []
  let shrunkCount = 0
  let skippedCount = 0

  for (const fileName of supported) {
    const filePath = path.join(PHOTOS_DIR, fileName)
    const inputBuf = fs.readFileSync(filePath)
    const origSize = inputBuf.length

    let meta
    try {
      meta = await sharp(inputBuf, { animated: false, failOn: 'none' }).metadata()
    } catch (err) {
      console.warn(`[photos:shrink] ⚠️ "${fileName}" 읽기 실패 (${err.message}) — 건너뜀`)
      continue
    }

    const width = meta.width || 0
    const height = meta.height || 0
    const longSide = Math.max(width, height)
    const gps = hasExifGps(meta)

    const needsShrink = longSide > MAX_DIM || origSize > MAX_BYTES || gps

    if (!needsShrink) {
      skippedCount++
      rows.push({
        파일명: fileName,
        '처리 전 크기': `${width}x${height} (${formatKB(origSize)})`,
        '처리 후 크기': `${width}x${height} (${formatKB(origSize)})`,
        상태: '건너뜀 (이미 작고 GPS 없음)',
      })
      continue
    }

    const reasons = []
    if (longSide > MAX_DIM) reasons.push(`해상도 ${width}x${height}`)
    if (origSize > MAX_BYTES) reasons.push(`용량 ${formatKB(origSize)}`)
    if (gps) reasons.push('GPS 제거')

    // 원본을 photos-originals/ 로 백업 이동
    fs.mkdirSync(ORIGINALS_DIR, { recursive: true })
    let backupPath = path.join(ORIGINALS_DIR, fileName)
    if (fs.existsSync(backupPath)) {
      const ext = path.extname(fileName)
      const stem = path.basename(fileName, ext)
      backupPath = path.join(ORIGINALS_DIR, `${stem}-${Date.now()}${ext}`)
    }
    fs.renameSync(filePath, backupPath)

    // 줄인 파일(JPEG q85, 긴 변 <= 2000px, 자동 회전, EXIF 모두 제거)을 같은 파일명으로 저장
    const shrunk = await shrinkBufferToJpeg(inputBuf)
    fs.writeFileSync(filePath, shrunk.data)
    shrunkCount++

    rows.push({
      파일명: fileName,
      '처리 전 크기': `${width}x${height} (${formatKB(origSize)})`,
      '처리 후 크기': `${shrunk.info.width}x${shrunk.info.height} (${formatKB(shrunk.data.length)})`,
      상태: `축소 완료 (${reasons.join(', ')})`,
    })
  }

  console.table(rows)
  console.log(
    `[photos:shrink] 완료: 총 ${rows.length}장 중 ${shrunkCount}장 축소(원본은 photos-originals/ 에 보관), ${skippedCount}장 건너뜀.`,
  )
}

main().catch((err) => {
  console.error('[photos:shrink] 오류:', err)
  process.exit(1)
})
