#!/usr/bin/env node
// npm install 때(prepare) git 훅 폴더를 .githooks 로 연결한다.
// - core.hooksPath 가 비어 있으면 .githooks 로 설정
// - 이미 .githooks 면 그대로
// - 다른 값이면 덮어쓰지 않고 경고만(다른 도구의 훅을 망가뜨리지 않게)
// git 저장소가 아니거나(zip 다운로드), git 이 없거나, CI 여도 npm install 을 실패시키지 않는다(항상 종료 코드 0).
import { spawnSync } from 'node:child_process'

const WANT = '.githooks'
const TAG = '[git 훅]'

function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8', windowsHide: true })
  return { ok: !res.error && res.status === 0, status: res.status, out: (res.stdout || '').trim(), error: res.error }
}

try {
  const inside = git(['rev-parse', '--is-inside-work-tree'])
  if (!inside.ok || inside.out !== 'true') {
    console.log(`${TAG} git 저장소가 아니라 훅 설정을 건너뛰어요.`)
  } else {
    const cur = git(['config', '--get', 'core.hooksPath'])
    // status 1 = 설정 없음. 그 밖의 실패는 알 수 없으니 건드리지 않는다.
    if (!cur.ok && cur.status !== 1) {
      console.warn(`${TAG} ⚠️ core.hooksPath 를 읽지 못해 훅을 설정하지 않았어요. 직접: git config core.hooksPath ${WANT}`)
    } else if (cur.out === '') {
      const set = git(['config', 'core.hooksPath', WANT])
      if (set.ok) console.log(`${TAG} 사진 보호 훅을 켰어요 (core.hooksPath=${WANT}).`)
      else console.warn(`${TAG} ⚠️ 훅 설정에 실패했어요. 직접: git config core.hooksPath ${WANT}`)
    } else if (cur.out.replace(/[\\/]+$/, '') === WANT || cur.out.replace(/[\\/]+$/, '') === `./${WANT}`) {
      console.log(`${TAG} 사진 보호 훅이 이미 켜져 있어요 (core.hooksPath=${cur.out}).`)
    } else {
      console.warn(
        `${TAG} ⚠️ core.hooksPath 가 이미 "${cur.out}" 로 설정돼 있어 바꾸지 않았어요.\n` +
          `  사진 보호 훅(.githooks/pre-commit)이 실행되지 않아요. 그 폴더의 pre-commit 에서\n` +
          `  "node scripts/check-no-photos.mjs --staged" 를 실행하게 하거나, 문제없다면: git config core.hooksPath ${WANT}\n` +
          `  (훅이 없어도 npm run build 와 GitHub Actions 가 같은 검사를 해요.)`,
      )
    }
  }
} catch (err) {
  console.warn(`${TAG} ⚠️ 훅 설정 중 오류(무시하고 계속): ${err && err.message}`)
}
process.exit(0)
