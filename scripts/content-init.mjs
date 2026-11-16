#!/usr/bin/env node
// npm run content:init  — 처음 한 번: 비공개 저장소(사진·메시지)를 content/ 로 받아 온다.
// --dry-run: 실제로 받지 않고 하려는 일만 보여 준다.
import fs from 'node:fs'
import path from 'node:path'
import { act, capture, CONTENT_DIR, CONTENT_REPO, DRY, fail, requireGh, requireGhLogin } from './content-cli.mjs'

console.log(`📦 비공개 콘텐츠 준비 (${CONTENT_REPO} → content/)${DRY ? '  [드라이런: 실제로 바꾸지 않아요]' : ''}`)

function ensureNoreplyEmail() {
  const cur = capture('git', ['-C', CONTENT_DIR, 'config', '--local', '--get', 'user.email'])
  if (cur.ok && cur.out) {
    console.log(`  커밋 이메일: ${cur.out.endsWith('@users.noreply.github.com') ? cur.out : '(설정돼 있음)'}`)
    return
  }
  if (DRY) {
    console.log('  [드라이런] gh api user   (GitHub id·login 확인)')
    console.log('  [드라이런] git -C content config user.email "<id>+<login>@users.noreply.github.com"')
    console.log('  [드라이런] git -C content config user.name "<login>"')
    return
  }
  const u = capture('gh', ['api', 'user', '--jq', '.id, .login'])
  const [id, login] = u.out.split(/\r?\n/).map((s) => s.trim())
  if (!u.ok || !/^\d+$/.test(id || '') || !login) {
    console.warn('  ⚠️ GitHub 계정 정보를 못 가져와 커밋 이메일을 설정하지 못했어요(나중에 다시 실행해도 돼요).')
    return
  }
  const email = `${id}+${login}@users.noreply.github.com`
  act('git', ['-C', CONTENT_DIR, 'config', 'user.email', email])
  act('git', ['-C', CONTENT_DIR, 'config', 'user.name', login])
  console.log(`  커밋 이메일을 GitHub 비공개 주소로 설정했어요: ${email}`)
}

requireGh()

if (fs.existsSync(path.join(CONTENT_DIR, '.git'))) {
  const url = capture('git', ['-C', CONTENT_DIR, 'remote', 'get-url', 'origin'])
  console.log(`✅ content/ 가 이미 있어요${url.ok ? ` (${url.out})` : ''}. 다시 받을 필요 없어요.`)
  ensureNoreplyEmail()
  console.log('   사진은 content/photos/, 메시지는 content/messages.json 에 넣고 "npm run content:publish" 로 올려요.')
  process.exit(0)
}

if (fs.existsSync(CONTENT_DIR) && fs.readdirSync(CONTENT_DIR).length > 0) {
  fail(
    'content/ 폴더가 이미 있는데 비공개 저장소 복사본이 아니에요(안에 파일이 있음).\n' +
      '   지우지 않도록 멈췄어요. 폴더 이름을 바꾸거나(예: content-old) 옮긴 뒤 다시 실행하세요.',
  )
}

requireGhLogin()

const clone = act('gh', ['repo', 'clone', CONTENT_REPO, CONTENT_DIR])
if (!clone.ok) {
  fail(`${CONTENT_REPO} 를 받아 오지 못했어요. 인터넷 연결과 저장소 접근 권한(gh auth status)을 확인하세요.`)
}
ensureNoreplyEmail()

console.log(
  `\n🎉 준비 끝! ${DRY ? '(드라이런이라 실제로는 받지 않았어요) ' : ''}\n` +
    '   - 사진: content/photos/ 에 넣기\n' +
    '   - 메시지: content/messages.json\n' +
    '   - 미리 보기: npm run dev   /   사이트에 반영: npm run content:publish',
)
