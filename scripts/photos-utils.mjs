import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])
export const HEIC_EXTS = new Set(['.heic', '.heif'])

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function naturalCompare(a, b) {
  return collator.compare(a, b) || a.localeCompare(b)
}

export function hashBuffer(buf, salt = 'v1') {
  return crypto.createHash('sha256').update(buf).update(salt).digest('hex').slice(0, 12)
}

export function listPhotoFiles(photosDir) {
  if (!fs.existsSync(photosDir)) return { supported: [], heic: [] }
  const entries = fs.readdirSync(photosDir, { withFileTypes: true })
  const supported = []
  const heic = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name.startsWith('.')) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (SUPPORTED_EXTS.has(ext)) {
      supported.push(entry.name)
    } else if (HEIC_EXTS.has(ext)) {
      heic.push(entry.name)
    }
  }

  supported.sort(naturalCompare)
  heic.sort(naturalCompare)
  return { supported, heic }
}
