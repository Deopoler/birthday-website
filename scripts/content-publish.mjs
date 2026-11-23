#!/usr/bin/env node
// npm run content:publish — content/ 의 사진·메시지 변경을 비공개 저장소에 올리고 사이트를 다시 배포한다.
// --dry-run: 검사는 하고, 커밋·push·배포는 하지 않고 하려는 일만 보여 준다.
import fs from 'node:fs'
import path from 'node:path'
import { loadMessagesFile, MessagesError, STAR_COUNT } from './content-messages.mjs'
import {
  act,
  capture,
  CONTENT_DIR,
  CONTENT_REPO,
  DRY,
  fail,
  isContentRemote,
  requireGh,
  requireGhLogin,
  sleep,
  SITE_REPO,
  SITE_URL,
} from './content-cli.mjs'

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.heic', '.heif'])
const GITHUB_FILE_LIMIT = 100 * 1024 * 1024

console.log(`🚀 사진·메시지 반영${DRY ? '  [드라이런: 커밋·push·배포는 하지 않아요]' : ''}`)

// 1) content/ 가 비공개 저장소 복사본인지 (공개 저장소로 잘못 올리는 일 방지)
if (!fs.existsSync(path.join(CONTENT_DIR, '.git'))) {
  fail('content/ 폴더(비공개 저장소 복사본)가 없어요. 먼저 "npm run content:init" 을 한 번 실행하세요.')
}
const origin = capture('git', ['-C', CONTENT_DIR, 'remote', 'get-url', 'origin'])
if (!origin.ok || !isContentRemote(origin.out)) {
  fail(
    `content/ 의 연결 저장소가 ${CONTENT_REPO} 가 아니에요(${origin.out || '알 수 없음'}).\n` +
      '   사진이 다른(공개) 저장소로 올라가지 않도록 멈췄어요. content/ 를 옮긴 뒤 "npm run content:init" 으로 다시 받으세요.',
  )
}

// 2) 메시지·사진 검사 (잘못된 내용이 올라가 배포가 실패하지 않게 미리)
try {
  const { exists, messages, warnings } = loadMessagesFile(path.join(CONTENT_DIR, 'messages.json'))
  for (const w of warnings) console.warn(`  ⚠️ ${w}`)
  console.log(
    exists && messages.length > 0
      ? `  메시지 ${messages.length}개 확인 (별 ${STAR_COUNT}개${messages.length < STAR_COUNT ? `, ${messages.length}개만 켜져요` : ''})`
      : '  메시지 파일이 없거나 비어 있어요 → 사이트에는 더미 메시지가 보여요.',
  )
} catch (err) {
  if (err instanceof MessagesError) fail(`메시지 파일에 문제가 있어 올리지 않았어요.\n${err.message}`)
  throw err
}

const photosDir = path.join(CONTENT_DIR, 'photos')
const photos = fs.existsSync(photosDir)
  ? fs.readdirSync(photosDir, { withFileTypes: true }).filter((d) => d.isFile() && PHOTO_EXTS.has(path.extname(d.name).toLowerCase()))
  : []
const tooBig = photos.filter((d) => fs.statSync(path.join(photosDir, d.name)).size >= GITHUB_FILE_LIMIT)
if (tooBig.length > 0) {
  fail(`GitHub 은 100MB 이상 파일을 받지 않아요: ${tooBig.map((d) => d.name).join(', ')}\n   크기를 줄이거나 빼고 다시 하세요.`)
}
console.log(`  사진 ${photos.length}장 확인`)

const email = capture('git', ['-C', CONTENT_DIR, 'config', 'user.email'])
if (!email.out.endsWith('@users.noreply.github.com')) {
  console.warn('  ⚠️ content/ 의 커밋 이메일이 GitHub 비공개 주소가 아니에요. "npm run content:init" 을 다시 실행하면 맞춰져요.')
}

// 3) 바뀐 것이 있는지
const status = capture('git', ['-C', CONTENT_DIR, 'status', '--porcelain'])
if (!status.ok) fail(`content/ 상태를 확인하지 못했어요.\n${status.err}`)
const changes = status.out ? status.out.split(/\r?\n/) : []
const ahead = capture('git', ['-C', CONTENT_DIR, 'rev-list', '--count', '@{u}..HEAD'])
const aheadCount = ahead.ok ? Number(ahead.out) || 0 : 0

if (changes.length === 0 && aheadCount === 0) {
  console.log('\n✅ 바뀐 것이 없어요. 올릴 내용이 없어서 아무것도 하지 않았어요.')
  console.log(`   (그냥 다시 배포만 하려면 GitHub 의 Actions → "Deploy to GitHub Pages" → Run workflow)`)
  process.exit(0)
}
console.log(`  바뀐 파일 ${changes.length}개${aheadCount ? `, 아직 안 올린 커밋 ${aheadCount}개` : ''}`)
for (const line of changes.slice(0, 20)) console.log(`    ${line}`)
if (changes.length > 20) console.log(`    ... 외 ${changes.length - 20}개`)

requireGh()
requireGhLogin()

// 4) 비공개 저장소에 커밋·push
if (changes.length > 0) {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const msg = `content: update ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  if (!act('git', ['-C', CONTENT_DIR, 'add', '-A']).ok) fail('git add 에 실패했어요.')
  if (!act('git', ['-C', CONTENT_DIR, 'commit', '-m', msg]).ok) fail('커밋에 실패했어요.')
}
if (!act('git', ['-C', CONTENT_DIR, 'pull', '--rebase']).ok) {
  fail('비공개 저장소의 최신 내용을 받아 오지 못했어요(다른 곳에서 같은 파일을 고쳤을 수 있어요). 화면의 git 안내를 확인하세요.')
}
if (!act('git', ['-C', CONTENT_DIR, 'push']).ok) fail('비공개 저장소에 올리지(push) 못했어요. 인터넷 연결과 로그인을 확인하세요.')

// 5) 사이트 다시 배포
const started = Date.now()
if (!act('gh', ['workflow', 'run', 'deploy.yml', '--repo', SITE_REPO, '--ref', 'main']).ok) {
  fail(`배포를 시작하지 못했어요. GitHub 의 ${SITE_REPO} → Actions 에서 "Run workflow" 를 눌러 주세요.`)
}

let runId = null
if (DRY) {
  console.log(`  [드라이런] gh run list --repo ${SITE_REPO} --workflow deploy.yml --event workflow_dispatch   (방금 시작한 배포 찾기)`)
  console.log(`  [드라이런] gh run watch <배포 번호> --repo ${SITE_REPO} --exit-status   (끝날 때까지 표시)`)
} else {
  console.log('  배포 작업을 찾는 중...')
  for (let i = 0; i < 20 && !runId; i++) {
    sleep(3000)
    const list = capture('gh', [
      'run', 'list', '--repo', SITE_REPO, '--workflow', 'deploy.yml', '--event', 'workflow_dispatch',
      '--limit', '5', '--json', 'databaseId,createdAt',
    ])
    if (!list.ok) continue
    try {
      const runs = JSON.parse(list.out)
      const hit = runs.find((r) => Date.parse(r.createdAt) >= started - 60_000)
      if (hit) runId = String(hit.databaseId)
    } catch {
      // 다시 시도
    }
  }
  if (!runId) {
    console.warn(`  ⚠️ 배포 작업을 찾지 못했어요. https://github.com/${SITE_REPO}/actions 에서 확인하세요.`)
    process.exit(0)
  }
  const watch = act('gh', ['run', 'watch', runId, '--repo', SITE_REPO, '--exit-status', '--interval', '5'])
  if (!watch.ok) {
    fail(
      `배포가 실패했어요. https://github.com/${SITE_REPO}/actions/runs/${runId} 에서 빨간 단계를 눌러 이유를 보세요.\n` +
        '   (사이트는 이전 상태 그대로예요.)',
    )
  }
}

console.log(`\n🎉 ${DRY ? '드라이런 끝(실제로는 아무것도 올리지 않았어요).' : `반영 끝! ${SITE_URL} 를 새로고침하세요.`}`)
