// content/messages.json(롤링페이퍼 메시지)을 읽고 검사한다.
// 빌드(vite-plugin-messages)와 npm run content:publish 가 같이 쓴다. 외부 의존성 없음.
import fs from 'node:fs'

export const MAX_FROM = 40
export const MAX_TEXT = 500
export const STAR_COUNT = 30

export class MessagesError extends Error {
  constructor(message, { file, line, column } = {}) {
    super(message)
    this.name = 'MessagesError'
    this.file = file
    this.line = line
    this.column = column
  }
}

const chars = (s) => [...s].length

function lineCol(src, offset) {
  let line = 1
  let col = 1
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') {
      line++
      col = 1
    } else {
      col++
    }
  }
  return { line, column: col }
}

// 맨 바깥 배열의 각 항목이 시작하는 위치(문자 offset)를 찾는다(오류에 줄 번호를 붙이려고).
function topLevelItemOffsets(src) {
  const out = []
  let depth = 0
  let inStr = false
  let esc = false
  let expectItem = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (expectItem && depth === 1 && !/\s/.test(c) && c !== ']') {
      out.push(i)
      expectItem = false
    }
    if (c === '"') inStr = true
    else if (c === '[' || c === '{') {
      depth++
      if (depth === 1 && c === '[') expectItem = true
    } else if (c === ']' || c === '}') depth--
    else if (c === ',' && depth === 1) expectItem = true
  }
  return out
}

/**
 * @returns {{ exists: boolean, messages: {from: string, text: string}[], warnings: string[] }}
 * @throws {MessagesError} JSON 문법 오류·형식 오류(파일 이름과 줄:열 포함)
 */
export function loadMessagesFile(filePath, label = 'content/messages.json') {
  if (!fs.existsSync(filePath)) return { exists: false, messages: [], warnings: [] }

  let src = fs.readFileSync(filePath, 'utf8')
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1) // 메모장이 붙이는 BOM 제거
  const warnings = []

  if (src.trim() === '') {
    warnings.push(`${label} 가 비어 있어 더미 메시지를 보여 줘요.`)
    return { exists: true, messages: [], warnings }
  }

  let data
  try {
    data = JSON.parse(src)
  } catch (err) {
    const m = /position (\d+)/.exec(err.message)
    const offset = m ? Number(m[1]) : src.length
    const { line, column } = lineCol(src, offset)
    throw new MessagesError(
      `${label}:${line}:${column} JSON 형식 오류 — ${line}번째 줄 ${column}번째 글자 근처를 확인하세요.\n` +
        `  (흔한 원인: 항목 사이 쉼표(,) 빠짐, 마지막 항목 뒤에 쉼표가 남음, 따옴표(") 짝이 안 맞음, 글 안의 " 는 \\" 로 써야 함)\n` +
        `  원래 오류: ${err.message}`,
      { file: filePath, line, column },
    )
  }

  if (!Array.isArray(data)) {
    throw new MessagesError(
      `${label}:1:1 형식 오류 — 파일 전체가 [ ... ] 로 감싼 목록이어야 해요. (예: [ { "from": "민수", "text": "생일 축하해요!" } ])`,
      { file: filePath, line: 1, column: 1 },
    )
  }

  const offsets = topLevelItemOffsets(src)
  const errors = []
  const messages = []

  data.forEach((item, i) => {
    const pos = offsets[i] != null ? lineCol(src, offsets[i]) : null
    const where = `${label}${pos ? `:${pos.line}` : ''} ${i + 1}번째 메시지`
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${where}: { "from": "...", "text": "..." } 모양이어야 해요.`)
      return
    }
    const bad = []
    for (const [key, max] of [
      ['from', MAX_FROM],
      ['text', MAX_TEXT],
    ]) {
      const v = item[key]
      if (v === undefined) bad.push(`"${key}" 가 없어요`)
      else if (typeof v !== 'string') bad.push(`"${key}" 는 따옴표로 감싼 글자여야 해요`)
      else if (v.trim() === '') bad.push(`"${key}" 가 비어 있어요`)
      else if (chars(v.trim()) > max) bad.push(`"${key}" 가 너무 길어요(${chars(v.trim())}자, 최대 ${max}자)`)
    }
    const extra = Object.keys(item).filter((k) => k !== 'from' && k !== 'text')
    if (extra.length > 0) warnings.push(`${where}: 쓰지 않는 칸(${extra.join(', ')})은 무시해요.`)
    if (bad.length > 0) {
      errors.push(`${where}: ${bad.join(', ')}`)
      return
    }
    messages.push({ from: item.from.trim(), text: item.text.trim() })
  })

  if (errors.length > 0) {
    const shown = errors.slice(0, 20)
    if (errors.length > shown.length) shown.push(`... 외 ${errors.length - shown.length}건`)
    const first = offsets.length > 0 ? lineCol(src, offsets[0]) : { line: 1, column: 1 }
    throw new MessagesError(`${label} 형식 오류 ${errors.length}건:\n  - ${shown.join('\n  - ')}`, {
      file: filePath,
      line: first.line,
      column: first.column,
    })
  }

  if (messages.length > STAR_COUNT) {
    warnings.push(
      `메시지가 ${messages.length}개예요. 별은 ${STAR_COUNT}개라 ${STAR_COUNT + 1}번째부터는 화면에 나오지 않아요.`,
    )
  }

  return { exists: true, messages, warnings }
}
