import { decryptBytes, isValidLockCode, isValidRekeyLockCode } from './crypto'

const STORAGE_KEY = 'hj_site_lock_code_v1'
const REKEY_STORAGE_KEY = 'hj_site_rekey_code_v2'

export function readLocalLockCode() {
  try {
    const val = window.localStorage.getItem(STORAGE_KEY)
    if (val && isValidLockCode(val)) return val.trim()
    return null
  } catch {
    return null
  }
}

export function writeLocalLockCode(code) {
  try {
    window.localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // 사생활 보호 모드 등 localStorage 접근 불가 시 무시
  }
}

export function readLocalRekeyCode() {
  try {
    const val = window.localStorage.getItem(REKEY_STORAGE_KEY)
    if (val && isValidRekeyLockCode(val)) return val.trim()
    return null
  } catch {
    return null
  }
}

export function writeLocalRekeyCode(code) {
  try {
    window.localStorage.setItem(REKEY_STORAGE_KEY, code)
  } catch {
    // 사생활 보호 모드 등 localStorage 접근 불가 시 무시
  }
}

export function clearLocalLockCode() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(REKEY_STORAGE_KEY)
  } catch {
    // 무시
  }
}

async function fetchAndDecryptAsset(aesKey, assetPath) {
  const res = await fetch(`./${assetPath}`)
  if (!res.ok) {
    throw new Error(`에셋을 불러오지 못했습니다(${res.status}).`)
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  const plain = await decryptBytes(aesKey, buf, `HJ1-asset:${assetPath}`)
  const blob = new Blob([plain], { type: 'image/webp' })
  return URL.createObjectURL(blob)
}

export async function decryptAllPhotos(aesKey, manifestPhotos, onProgress) {
  const total = manifestPhotos.length
  if (total === 0) return { photos: [], urls: [] }

  const results = new Array(total)
  const urls = []
  let done = 0
  let cursor = 0
  const CONCURRENCY = Math.min(4, total)

  async function worker() {
    while (cursor < total) {
      const idx = cursor++
      const p = manifestPhotos[idx]
      const [thumbUrl, srcUrl] = await Promise.all([
        fetchAndDecryptAsset(aesKey, p.thumb),
        fetchAndDecryptAsset(aesKey, p.src),
      ])
      urls.push(thumbUrl, srcUrl)
      results[idx] = {
        id: p.id ?? idx,
        src: srcUrl,
        thumb: thumbUrl,
        width: p.width,
        height: p.height,
        color: p.color,
      }
      done++
      onProgress?.(done, total)
    }
  }

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    return { photos: results, urls }
  } catch (err) {
    for (const url of urls) URL.revokeObjectURL(url)
    throw err
  }
}
