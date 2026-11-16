#!/usr/bin/env node
// 공개 저장소 보호 장치: git 이 추적(--tracked)하거나 스테이징(--staged)한 파일 중
// 허용 목록(scripts/allowed-images.txt)에 없는 이미지가 있으면 종료 코드 1 로 막는다.
//
// - 이미지 판정: 확장자(대소문자 무시) 또는 파일 내용 앞부분의 매직 바이트(확장자를 바꿔도 잡음).
// - 내용은 작업 폴더가 아니라 git 인덱스에 올라간 그대로(blob)를 읽는다(커밋될 내용 기준).
// - fail-closed: git 호출 실패, 허용 목록 없음, 예상 못 한 오류는 모두 "실패"(통과시키지 않음).
// - 외부 의존성 없음(node:fs, node:child_process 만).
//
// 사용: node scripts/check-no-photos.mjs --staged    (pre-commit 훅)
//       node scripts/check-no-photos.mjs --tracked   (빌드 전·GitHub Actions)

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const TAG = '[사진 보호]'
// 프로세스가 바로 끝나도 안내문이 잘리지 않게 동기식으로 쓴다.
const errOut = (s) => fs.writeSync(2, s + '\n')
const out = (s) => fs.writeSync(1, s + '\n')

function die(msg, code = 1) {
  errOut(`${TAG} ${msg}`)
  process.exit(code)
}

function crash(err) {
  try {
    errOut(`${TAG} 예상하지 못한 오류로 검사를 끝내지 못했어요. 안전을 위해 실패로 처리합니다.`)
    errOut(String(err && err.stack ? err.stack : err))
  } finally {
    process.exit(1)
  }
}
process.on('uncaughtException', crash)
process.on('unhandledRejection', crash)

export const IMAGE_EXTS = new Set(
  [
    'jpg', 'jpeg', 'jpe', 'jfif', 'png', 'apng', 'webp', 'avif', 'gif', 'heic', 'heif',
    'tif', 'tiff', 'bmp', 'dib', 'ico', 'jxl',
    // 카메라 RAW
    'dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2',
  ].map((e) => '.' + e),
)

const ISO_IMAGE_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs',
  'mif1', 'mif2', 'msf1', 'avif', 'avis', 'avio', 'crx ',
])

const startsWith = (buf, bytes, at = 0) =>
  buf.length >= at + bytes.length && bytes.every((b, i) => buf[at + i] === b)
const ascii = (buf, a, b) => (buf.length >= b ? buf.toString('latin1', a, b) : '')

/** 파일 앞부분(최소 64바이트 권장)으로 이미지 형식을 판정. 아니면 null. */
export function sniffImage(buf) {
  if (!buf || buf.length < 2) return null
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'JPEG'
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'PNG'
  const g = ascii(buf, 0, 6)
  if (g === 'GIF87a' || g === 'GIF89a') return 'GIF'
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'WebP'
  if (
    startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a]) ||
    startsWith(buf, [0x49, 0x49, 0x2b, 0x00]) ||
    startsWith(buf, [0x4d, 0x4d, 0x00, 0x2b]) ||
    startsWith(buf, [0x49, 0x49, 0x52, 0x4f]) || // Olympus ORF
    startsWith(buf, [0x49, 0x49, 0x55, 0x00]) // Panasonic RW2
  ) {
    return 'TIFF/RAW'
  }
  if (ascii(buf, 0, 2) === 'BM' && buf.length >= 18) {
    const dib = buf.readUInt32LE(14)
    if ([12, 16, 40, 52, 56, 64, 108, 124].includes(dib)) return 'BMP'
  }
  if (ascii(buf, 4, 8) === 'ftyp') {
    const boxSize = buf.readUInt32BE(0)
    const end = Math.min(buf.length, boxSize >= 16 ? boxSize : 16)
    const brands = [ascii(buf, 8, 12)]
    for (let o = 16; o + 4 <= end; o += 4) brands.push(ascii(buf, o, o + 4))
    if (brands.some((b) => ISO_IMAGE_BRANDS.has(b))) return 'HEIC/AVIF'
  }
  if (startsWith(buf, [0xff, 0x0a])) return 'JPEG XL'
  if (startsWith(buf, [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])) return 'JPEG XL'
  return null
}

function git(args, { cwd, input } = {}) {
  const res = spawnSync('git', args, { cwd, input, maxBuffer: 1024 * 1024 * 1024, windowsHide: true })
  if (res.error) {
    die(`git 을 실행할 수 없어요(${res.error.code || res.error.message}). git 이 설치돼 있는지 확인하세요. 안전을 위해 막았어요.`)
  }
  if (res.status !== 0) {
    die(`git ${args.join(' ')} 이(가) 실패했어요(종료 코드 ${res.status}). 안전을 위해 막았어요.\n${res.stderr.toString('utf8').trim()}`)
  }
  return res.stdout
}

const splitNul = (buf) =>
  buf
    .toString('utf8')
    .split('\0')
    .filter((s) => s !== '')

function readAllowList(root) {
  const file = path.join(root, 'scripts', 'allowed-images.txt')
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    die(`허용 목록 scripts/allowed-images.txt 를 읽을 수 없어요(${err.code || err.message}). 안전을 위해 막았어요.`)
  }
  const set = new Set()
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    set.add(line.replace(/\\/g, '/').replace(/^\.\//, ''))
  }
  return set
}

/** git ls-files --stage → [{mode, sha, path}] */
function indexEntries(root) {
  const out = []
  for (const rec of splitNul(git(['ls-files', '-z', '--stage'], { cwd: root }))) {
    const tab = rec.indexOf('\t')
    if (tab < 0) die(`git ls-files 출력 형식을 알 수 없어요: ${JSON.stringify(rec)}. 안전을 위해 막았어요.`)
    const [mode, sha] = rec.slice(0, tab).split(' ')
    out.push({ mode, sha, path: rec.slice(tab + 1) })
  }
  return out
}

/** git cat-file --batch 로 blob 앞부분(64바이트)을 읽는다. */
function blobHeads(root, shas) {
  const heads = new Map()
  if (shas.length === 0) return heads
  const outBuf = git(['cat-file', '--batch'], { cwd: root, input: shas.join('\n') + '\n' })
  let pos = 0
  for (const sha of shas) {
    const nl = outBuf.indexOf(0x0a, pos)
    if (nl < 0) die('git cat-file 출력이 예상보다 짧아요. 안전을 위해 막았어요.')
    const header = outBuf.toString('utf8', pos, nl).split(' ')
    if (header[0] !== sha || header[1] === 'missing' || header.length < 3) {
      die(`git 저장소에서 파일 내용을 읽지 못했어요(${header.join(' ')}). 안전을 위해 막았어요.`)
    }
    const size = Number(header[2])
    const start = nl + 1
    heads.set(sha, outBuf.subarray(start, start + Math.min(size, 64)))
    pos = start + size + 1 // 내용 뒤 줄바꿈 1바이트
  }
  return heads
}

function main() {
  const args = process.argv.slice(2)
  const staged = args.includes('--staged')
  const tracked = args.includes('--tracked')
  if (staged === tracked) {
    die('사용법: node scripts/check-no-photos.mjs --staged | --tracked (둘 중 하나만)')
  }

  const root = git(['rev-parse', '--show-toplevel']).toString('utf8').trim()
  if (!root) die('git 저장소 위치를 알 수 없어요. 안전을 위해 막았어요.')
  const allowed = readAllowList(root)

  let entries = indexEntries(root)
  if (staged) {
    // 스테이징된 변경 중 삭제를 뺀 것(이름 변경은 새 경로로 추가된 것처럼 잡힘).
    const changed = new Set(
      splitNul(git(['diff', '--cached', '--name-only', '-z', '--no-renames', '--diff-filter=d'], { cwd: root })),
    )
    entries = entries.filter((e) => changed.has(e.path))
  }

  // 확장자만으로 이미 이미지인 것은 내용을 읽지 않아도 된다. 하위 모듈(160000)은 내용이 없다.
  const needSniff = entries.filter((e) => e.mode !== '160000' && !IMAGE_EXTS.has(path.extname(e.path).toLowerCase()))
  const heads = blobHeads(root, [...new Set(needSniff.map((e) => e.sha))])

  const blocked = []
  let allowedSeen = 0
  const seen = new Set()
  for (const e of entries) {
    const key = `${e.path}\0${e.sha}`
    if (seen.has(key)) continue
    seen.add(key)
    const ext = path.extname(e.path).toLowerCase()
    let reason = null
    if (IMAGE_EXTS.has(ext)) reason = `확장자 ${path.extname(e.path)}`
    else if (heads.has(e.sha)) {
      const kind = sniffImage(heads.get(e.sha))
      if (kind) reason = `확장자는 ${ext || '(없음)'} 이지만 내용이 ${kind} 이미지`
    }
    if (!reason) continue
    if (allowed.has(e.path)) {
      allowedSeen++
      continue
    }
    blocked.push({ path: e.path, reason })
  }

  const scope = staged ? '스테이징된 파일' : 'git 이 추적 중인 파일'
  if (blocked.length === 0) {
    out(`${TAG} 통과: ${scope} ${entries.length}개 검사, 허용 목록의 이미지 ${allowedSeen}개.`)
    return
  }

  const list = blocked.map((b) => `  - ${b.path}  (${b.reason})`).join('\n')
  const first = blocked[0].path
  errOut(
    `\n${TAG} 공개 저장소에 올리면 안 되는 이미지가 있어 막았어요 (${scope} 검사).\n${list}\n\n` +
      `사진·메시지는 content/ 폴더(비공개 저장소)에 넣고 "npm run content:publish" 로 올려요. 공개 저장소에는 넣지 않아요.\n` +
      `해결 방법:\n` +
      (staged
        ? `  1) 커밋에서 빼기(파일은 그대로 남아요): git restore --staged -- "${first}"\n`
        : `  1) 저장소 추적에서 빼기(파일은 그대로 남아요): git rm --cached -- "${first}" 후 커밋\n` +
          `     ⚠️ 이미 GitHub 에 push 했다면 git 기록에 남아 있어요. 기록에서 지우는 작업이 따로 필요하니 바로 알려 주세요.\n`) +
      `  2) 사진이면 content/photos/ 로 옮기세요.\n` +
      `  3) 사이트 디자인용 그림처럼 공개해도 되는 이미지라면 scripts/allowed-images.txt 에 경로를 한 줄 추가해 함께 커밋하세요.\n`,
  )
  process.exit(1)
}

main()
