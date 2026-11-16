import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])
export const HEIC_EXTS = new Set(['.heic', '.heif'])

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function naturalCompare(a, b) {
  return collator.compare(a, b) || a.localeCompare(b)
}

/**
 * Inspects sharp metadata (meta.exif / meta.xmp) to detect whether GPS coordinates
 * or GPS IFD tags are present.
 */
export function hasExifGps(meta) {
  if (!meta) return false

  if (meta.xmp) {
    const xmpStr = Buffer.isBuffer(meta.xmp) ? meta.xmp.toString('utf8') : String(meta.xmp)
    if (/exif:GPS|GPSLatitude|GPSLongitude/i.test(xmpStr)) {
      return true
    }
  }

  const buf = meta.exif
  if (!Buffer.isBuffer(buf) || buf.length < 14) return false

  try {
    let tiffOffset = 0
    if (buf.subarray(0, 6).toString('ascii') === 'Exif\0\0') {
      tiffOffset = 6
    }
    if (buf.length < tiffOffset + 8) return false

    const byteOrder = buf.subarray(tiffOffset, tiffOffset + 2).toString('ascii')
    const le = byteOrder === 'II'
    const be = byteOrder === 'MM'
    if (!le && !be) return false

    const readU16 = (off) => (le ? buf.readUInt16LE(off) : buf.readUInt16BE(off))
    const readU32 = (off) => (le ? buf.readUInt32LE(off) : buf.readUInt32BE(off))

    const magic = readU16(tiffOffset + 2)
    if (magic !== 0x002a) return false

    const ifd0Rel = readU32(tiffOffset + 4)
    const ifd0Off = tiffOffset + ifd0Rel
    if (ifd0Off + 2 > buf.length) return false

    const numEntries = readU16(ifd0Off)
    for (let i = 0; i < numEntries; i++) {
      const entryOff = ifd0Off + 2 + i * 12
      if (entryOff + 12 > buf.length) break
      const tag = readU16(entryOff)
      // 0x8825 = GPSInfoIFDPointer
      if (tag === 0x8825) {
        const gpsIfdRel = readU32(entryOff + 8)
        const gpsIfdOff = tiffOffset + gpsIfdRel
        if (gpsIfdOff + 2 <= buf.length) {
          const gpsEntries = readU16(gpsIfdOff)
          if (gpsEntries > 0) return true
        } else {
          return true
        }
      }
    }
  } catch {
    // Fallback string scan if TIFF header is non-standard
  }

  return false
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
