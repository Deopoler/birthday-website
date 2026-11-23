// 롤링페이퍼 메시지. 이 파일을 직접 고칠 필요는 없어요.
// 진짜 메시지는 content/messages.json(비공개 저장소, 공개 저장소에는 올리지 않음)에 넣어요. README.md 참고.
// 그 파일이 없거나 비어 있으면 아래 더미 17개를 대신 보여 줘요.
// 별은 17개: 메시지 i번째가 별 i번째에 붙고, 17개보다 적으면 그만큼만 별이 켜지며 18번째부터는 무시돼요.
import { messages as realMessages } from 'virtual:messages'

const dummyMessages = Array.from({ length: 17 }, (_, i) => ({
  from: `친구 ${i + 1}`,
  text: `하진 순장님, 생일 진심으로 축하드려요! 더미 메시지 ${i + 1}번입니다. 실제 메시지로 교체해 주세요.`,
}))

export const messages = (realMessages.length > 0 ? realMessages : dummyMessages).map((m, i) => ({
  id: i,
  from: m.from,
  text: m.text,
}))
