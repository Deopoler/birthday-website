// Node(빌드)와 브라우저(런타임)에서 동일하게 쓰는 WebCrypto 암호화·잠금 코드 모듈.
// 외부 의존성과 Node 전용 API(Buffer 등)를 쓰지 않아 양쪽에서 같은 바이트 형식을 보장한다.

export const LOCK_CODE_PREFIX = 'HJ1.'
export const LOCK_CODE_VERSION = 1
export const REKEY_CODE_PREFIX = 'HJ2.'
export const REKEY_CODE_VERSION = 2
export const REKEY_AAD = 'HJ2-rekey'
export const PBKDF2_ITERATIONS = 600000
export const KEY_BYTES = 32
export const SALT_BYTES = 16
export const IV_BYTES = 12
export const GCM_TAG_BYTES = 16

const HEADER_BYTES = 1 + 4 + SALT_BYTES + IV_BYTES // 33
const WRAP_CT_BYTES = KEY_BYTES + GCM_TAG_BYTES // 48
const WRAP_TOTAL_BYTES = HEADER_BYTES + WRAP_CT_BYTES // 81
const WRAP_B64URL_LEN = 108 // ceil(81 * 4 / 3) without padding

const ENC_KEY_BYTES = IV_BYTES + KEY_BYTES + GCM_TAG_BYTES // 60
const REKEY_TOTAL_BYTES = 1 + WRAP_TOTAL_BYTES + ENC_KEY_BYTES // 142
const REKEY_B64URL_LEN = 190 // ceil(142 * 4 / 3) without padding

const te = new TextEncoder()
const td = new TextDecoder()

function getCrypto() {
  const c = globalThis.crypto
  if (!c || !c.subtle || !c.getRandomValues) {
    throw new Error('WebCrypto API를 사용할 수 없는 환경입니다.')
  }
  return c
}

export function normalizePassword(password) {
  if (typeof password !== 'string') return ''
  return password.normalize('NFC')
}

export function randomBytes(len) {
  const out = new Uint8Array(len)
  getCrypto().getRandomValues(out)
  return out
}

export function randomHex(byteLen) {
  const bytes = randomBytes(byteLen)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function base64ToBytes(str) {
  if (typeof str !== 'string') throw new Error('base64 문자열이 아닙니다.')
  const cleaned = str.trim()
  if (!cleaned || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    throw new Error('올바른 base64 형식이 아닙니다.')
  }
  const padded = cleaned.length % 4 === 0 ? cleaned : cleaned + '='.repeat(4 - (cleaned.length % 4))
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

export function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str) || str.length % 4 === 1) {
    throw new Error('올바른 base64url 형식이 아닙니다.')
  }
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = base64ToBytes(b64)
  // canonical 검증: 남는 패딩 비트가 0인지 확인
  if (bytesToBase64Url(bytes) !== str) {
    throw new Error('올바르지 않은 base64url 인코딩입니다.')
  }
  return bytes
}

export function parseContentKey(base64Str) {
  if (typeof base64Str !== 'string' || !base64Str.trim()) {
    throw new Error('SITE_CONTENT_KEY가 비어 있습니다.')
  }
  let raw
  try {
    raw = base64ToBytes(base64Str)
  } catch {
    throw new Error('SITE_CONTENT_KEY는 올바른 base64 문자열이어야 합니다.')
  }
  if (raw.length !== KEY_BYTES) {
    throw new Error(`SITE_CONTENT_KEY는 정확히 ${KEY_BYTES}바이트여야 합니다(현재 ${raw.length}바이트).`)
  }
  return raw
}

function parseWrapBytes(raw) {
  if (!(raw instanceof Uint8Array) || raw.length !== WRAP_TOTAL_BYTES) {
    throw new Error('잠금 래핑 크기가 올바르지 않습니다.')
  }
  const version = raw[0]
  if (version !== LOCK_CODE_VERSION) {
    throw new Error(`지원하지 않는 잠금 래핑 버전입니다(${version}).`)
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const iterations = view.getUint32(1, false)
  if (iterations !== PBKDF2_ITERATIONS) {
    throw new Error(`잠금 래핑의 PBKDF2 반복 횟수가 올바르지 않습니다(${iterations}).`)
  }
  const header = raw.subarray(0, HEADER_BYTES)
  const salt = raw.subarray(5, 5 + SALT_BYTES)
  const iv = raw.subarray(5 + SALT_BYTES, HEADER_BYTES)
  const ciphertext = raw.subarray(HEADER_BYTES)
  return { raw, header, salt, iv, ciphertext, iterations }
}

export function parseLockCode(code) {
  if (typeof code !== 'string') {
    throw new Error('잠금 코드는 문자열이어야 합니다.')
  }
  const trimmed = code.trim()
  if (!trimmed.startsWith(LOCK_CODE_PREFIX)) {
    throw new Error(`잠금 코드는 "${LOCK_CODE_PREFIX}"로 시작해야 합니다.`)
  }
  const body = trimmed.slice(LOCK_CODE_PREFIX.length)
  if (body.length !== WRAP_B64URL_LEN) {
    throw new Error('잠금 코드 길이가 올바르지 않습니다.')
  }
  const raw = base64UrlToBytes(body)
  return parseWrapBytes(raw)
}

export function isValidLockCode(code) {
  try {
    parseLockCode(code)
    return true
  } catch {
    return false
  }
}

export function parseRekeyLockCode(code) {
  if (typeof code !== 'string') {
    throw new Error('잠금 코드는 문자열이어야 합니다.')
  }
  const trimmed = code.trim()
  if (!trimmed.startsWith(REKEY_CODE_PREFIX)) {
    throw new Error(`잠금 코드는 "${REKEY_CODE_PREFIX}"로 시작해야 합니다.`)
  }
  const body = trimmed.slice(REKEY_CODE_PREFIX.length)
  if (body.length !== REKEY_B64URL_LEN) {
    throw new Error('잠금 코드 길이가 올바르지 않습니다.')
  }
  const raw = base64UrlToBytes(body)
  if (raw.length !== REKEY_TOTAL_BYTES) {
    throw new Error('잠금 코드 크기가 올바르지 않습니다.')
  }
  if (raw[0] !== REKEY_CODE_VERSION) {
    throw new Error(`지원하지 않는 잠금 코드 버전입니다(${raw[0]}).`)
  }
  const wrapK2Bytes = raw.subarray(1, 1 + WRAP_TOTAL_BYTES)
  parseWrapBytes(wrapK2Bytes)
  const encK2Bytes = raw.subarray(1 + WRAP_TOTAL_BYTES)
  if (encK2Bytes.length !== ENC_KEY_BYTES) {
    throw new Error('암호화된 새 키 크기가 올바르지 않습니다.')
  }
  const wrapK2Code = LOCK_CODE_PREFIX + bytesToBase64Url(wrapK2Bytes)
  return { raw, wrapK2Bytes, wrapK2Code, encK2Bytes }
}

export function isValidRekeyLockCode(code) {
  try {
    parseRekeyLockCode(code)
    return true
  } catch {
    return false
  }
}

async function deriveWrapKey(password, salt, iterations, usages) {
  const { subtle } = getCrypto()
  const norm = normalizePassword(password)
  const baseKey = await subtle.importKey('raw', te.encode(norm), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}

async function wrapKeyBytes(rawKey, password) {
  if (!(rawKey instanceof Uint8Array) || rawKey.length !== KEY_BYTES) {
    throw new Error('콘텐츠 키가 올바르지 않습니다.')
  }
  const norm = normalizePassword(password)
  if (norm.length === 0) {
    throw new Error('비밀번호가 비어 있습니다.')
  }
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const header = new Uint8Array(HEADER_BYTES)
  header[0] = LOCK_CODE_VERSION
  new DataView(header.buffer).setUint32(1, PBKDF2_ITERATIONS, false)
  header.set(salt, 5)
  header.set(iv, 5 + SALT_BYTES)

  const kek = await deriveWrapKey(norm, salt, PBKDF2_ITERATIONS, ['encrypt'])
  const ctBuf = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: header },
    kek,
    rawKey,
  )
  const ct = new Uint8Array(ctBuf)
  const packed = new Uint8Array(WRAP_TOTAL_BYTES)
  packed.set(header, 0)
  packed.set(ct, HEADER_BYTES)
  return packed
}

export async function wrapKey(rawK, password) {
  const packed = await wrapKeyBytes(rawK, password)
  return LOCK_CODE_PREFIX + bytesToBase64Url(packed)
}

export async function unwrapKey(lockCode, password) {
  const norm = normalizePassword(password)
  if (norm.length === 0) {
    throw new Error('비밀번호가 비어 있습니다.')
  }
  const { header, salt, iv, ciphertext, iterations } = parseLockCode(lockCode)
  const kek = await deriveWrapKey(norm, salt, iterations, ['decrypt'])
  const plainBuf = await getCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: header },
    kek,
    ciphertext,
  )
  const rawK = new Uint8Array(plainBuf)
  if (rawK.length !== KEY_BYTES) {
    throw new Error('복호화된 키 길이가 올바르지 않습니다.')
  }
  return rawK
}

export async function createRekeyLockCode(aesKeyK, rawK2, newPassword) {
  if (!(rawK2 instanceof Uint8Array) || rawK2.length !== KEY_BYTES) {
    throw new Error('새 콘텐츠 키가 올바르지 않습니다.')
  }
  const [wrapK2Bytes, encK2Bytes] = await Promise.all([
    wrapKeyBytes(rawK2, newPassword),
    encryptBytes(aesKeyK, rawK2, REKEY_AAD),
  ])
  const packed = new Uint8Array(REKEY_TOTAL_BYTES)
  packed[0] = REKEY_CODE_VERSION
  packed.set(wrapK2Bytes, 1)
  packed.set(encK2Bytes, 1 + WRAP_TOTAL_BYTES)
  return REKEY_CODE_PREFIX + bytesToBase64Url(packed)
}

export async function unwrapRekeyLockCode(rekeyCode, aesKeyK) {
  const { wrapK2Code, encK2Bytes } = parseRekeyLockCode(rekeyCode)
  const rawK2 = await decryptBytes(aesKeyK, encK2Bytes, REKEY_AAD)
  if (rawK2.length !== KEY_BYTES) {
    rawK2.fill(0)
    throw new Error('복호화된 새 콘텐츠 키 길이가 올바르지 않습니다.')
  }
  return { rawK2, wrapK2Code }
}

export async function importContentKey(rawK) {
  return getCrypto().subtle.importKey('raw', rawK, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptBytes(aesKey, plainBytes, aadText) {
  const iv = randomBytes(IV_BYTES)
  const params = { name: 'AES-GCM', iv }
  if (aadText != null) params.additionalData = te.encode(aadText)
  const ctBuf = await getCrypto().subtle.encrypt(params, aesKey, plainBytes)
  const ct = new Uint8Array(ctBuf)
  const out = new Uint8Array(IV_BYTES + ct.length)
  out.set(iv, 0)
  out.set(ct, IV_BYTES)
  return out
}

export async function decryptBytes(aesKey, packedBytes, aadText) {
  const u8 = packedBytes instanceof Uint8Array ? packedBytes : new Uint8Array(packedBytes)
  if (u8.length < IV_BYTES + GCM_TAG_BYTES) {
    throw new Error('암호화된 데이터가 너무 짧습니다.')
  }
  const iv = u8.subarray(0, IV_BYTES)
  const ct = u8.subarray(IV_BYTES)
  const params = { name: 'AES-GCM', iv }
  if (aadText != null) params.additionalData = te.encode(aadText)
  const plainBuf = await getCrypto().subtle.decrypt(params, aesKey, ct)
  return new Uint8Array(plainBuf)
}

export async function encryptManifest(aesKey, manifestObj) {
  const bytes = te.encode(JSON.stringify(manifestObj))
  const packed = await encryptBytes(aesKey, bytes, 'HJ1-manifest')
  return bytesToBase64(packed)
}

export async function decryptManifest(aesKey, manifestB64) {
  const packed = base64ToBytes(manifestB64)
  const plain = await decryptBytes(aesKey, packed, 'HJ1-manifest')
  return JSON.parse(td.decode(plain))
}
