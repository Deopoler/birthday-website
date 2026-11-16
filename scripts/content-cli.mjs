// content:init / content:publish 공용 도우미 (Node 내장 모듈만 사용, Windows/Linux 공통)
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CONTENT_REPO = 'Deopoler/birthday-content'
export const SITE_REPO = 'Deopoler/birthday-website'
export const SITE_URL = 'https://deopoler.github.io/birthday-website/'
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CONTENT_DIR = path.join(ROOT, 'content')
export const DRY = process.argv.includes('--dry-run')

const q = (a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)
export const fmt = (cmd, args) => [cmd, ...args].map(q).join(' ')

/** 결과를 받아 오는 실행(읽기 전용 확인용). 실패해도 예외 없이 결과 반환. */
export function capture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts })
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    out: (res.stdout || '').trim(),
    err: (res.stderr || '').trim(),
    missing: res.error && res.error.code === 'ENOENT',
  }
}

/** 부작용이 있는 실행. --dry-run 이면 출력만 하고 성공으로 친다. */
export function act(cmd, args, opts = {}) {
  if (DRY) {
    console.log(`  [드라이런] ${fmt(cmd, args)}`)
    return { ok: true, status: 0, dry: true }
  }
  console.log(`  → ${fmt(cmd, args)}`)
  const res = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true, ...opts })
  return { ok: !res.error && res.status === 0, status: res.status, missing: res.error && res.error.code === 'ENOENT' }
}

export function fail(msg) {
  console.error(`\n❌ ${msg}`)
  process.exit(1)
}

export function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function requireGh() {
  const v = capture('gh', ['--version'])
  if (v.ok) return true
  const msg =
    'GitHub CLI(gh) 를 찾을 수 없어요. https://cli.github.com 에서 설치한 뒤 터미널을 새로 열고\n' +
    '   "gh auth login" 으로 로그인하세요.'
  if (DRY) {
    console.warn(`  ⚠️ (드라이런이라 계속) ${msg}`)
    return false
  }
  fail(msg)
}

export function requireGhLogin() {
  if (DRY) {
    console.log('  [드라이런] gh auth status   (GitHub 로그인 확인)')
    return
  }
  const s = capture('gh', ['auth', 'status'])
  if (!s.ok) {
    fail('GitHub 에 로그인돼 있지 않아요. 터미널에서 "gh auth login" 을 실행해 로그인한 뒤 다시 해 주세요.')
  }
}

export function isContentRemote(url) {
  // 호스트까지 github.com 으로 고정한다(다른 서버의 같은 이름 경로를 막기 위해).
  return /^(?:(?:https?|ssh|git):\/\/(?:[^@/\s]+@)?|[^@/\s]+@)github\.com[:/]Deopoler\/birthday-content(?:\.git)?\/?$/i.test(url.trim())
}
