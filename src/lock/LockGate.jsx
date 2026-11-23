import { useEffect, useRef, useState } from 'react'
import { ENCRYPTED_MANIFEST, LOCK_MODE, LOCK_WRAP } from 'virtual:site-lock'
import { setUnlockedMessages } from '../data/messages'
import { setUnlockedPhotos } from '../data/photos'
import {
  createRekeyLockCode,
  decryptManifest,
  importContentKey,
  KEY_BYTES,
  normalizePassword,
  randomBytes,
  unwrapKey,
  wrapKey,
} from './crypto'
import {
  clearLocalLockCode,
  decryptAllPhotos,
  readLocalLockCode,
  readLocalRekeyCode,
  writeLocalLockCode,
  writeLocalRekeyCode,
} from './storage'
import './LockGate.css'

const WRONG_PASSWORD_MSG = '비밀번호가 맞지 않아요'
const MIN_PASSWORD_LEN = 8

const nextTick = () => new Promise((r) => setTimeout(r, 20))

async function tryUnlockWithWrap(wrapCode, password) {
  let rawK = null
  try {
    rawK = await unwrapKey(wrapCode, password)
    const aesKey = await importContentKey(rawK)
    const manifest = await decryptManifest(aesKey, ENCRYPTED_MANIFEST)
    return { rawK, aesKey, manifest }
  } catch {
    if (rawK) rawK.fill(0)
    return null
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 폴백으로 진행
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export default function LockGate({ children }) {
  // lock | reset | code | unlocked
  const [stage, setStage] = useState('lock')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState('')
  const [lockCode, setLockCode] = useState('')
  const [copied, setCopied] = useState(false)

  // 초기 비밀번호 재설정 동안에만 메모리에 보관(저장소에 절대 기록하지 않음)
  const resetSecretRef = useRef(null)
  const blobUrlsRef = useRef([])

  useEffect(() => {
    const cleanup = () => {
      if (resetSecretRef.current?.rawK) {
        resetSecretRef.current.rawK.fill(0)
      }
      resetSecretRef.current = null
      for (const u of blobUrlsRef.current) URL.revokeObjectURL(u)
      blobUrlsRef.current = []
    }
    const onPageHide = (e) => {
      // bfcache 복원 시 blob URL과 재설정 상태를 유지한다
      if (e.persisted) return
      cleanup()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      cleanup()
    }
  }, [])

  const handleUnlock = async (e) => {
    e.preventDefault()
    if (busy) return
    const attemptPw = normalizePassword(password)
    if (!attemptPw) {
      setError(WRONG_PASSWORD_MSG)
      return
    }

    setBusy(true)
    setError('')
    setStatusText('확인하고 있어요…')
    await nextTick()

    let unlocked = null
    let usedLocalCode = false

    try {
      if (LOCK_MODE === 'initial') {
        const localCode = readLocalLockCode()
        if (localCode) {
          unlocked = await tryUnlockWithWrap(localCode, attemptPw)
          if (unlocked) usedLocalCode = true
        }
        if (!unlocked) {
          unlocked = await tryUnlockWithWrap(LOCK_WRAP, attemptPw)
        }
      } else {
        unlocked = await tryUnlockWithWrap(LOCK_WRAP, attemptPw)
      }

      if (!unlocked) {
        setError(WRONG_PASSWORD_MSG)
        setBusy(false)
        setStatusText('')
        return
      }

      const { rawK, aesKey, manifest } = unlocked
      const manifestMessages = Array.isArray(manifest?.messages) ? manifest.messages : []
      const manifestPhotos = Array.isArray(manifest?.photos) ? manifest.photos : []

      if (manifestPhotos.length > 0) {
        setStatusText(`사진을 여는 중… (0/${manifestPhotos.length})`)
      } else {
        setStatusText('콘텐츠를 여는 중…')
      }

      const { photos: decryptedPhotos, urls } = await decryptAllPhotos(
        aesKey,
        manifestPhotos,
        (done, total) => setStatusText(`사진을 여는 중… (${done}/${total})`),
      )

      // 이전 URL이 있다면 정리하고 새 URL 보관
      for (const u of blobUrlsRef.current) URL.revokeObjectURL(u)
      blobUrlsRef.current = urls

      setUnlockedMessages(manifestMessages)
      setUnlockedPhotos(decryptedPhotos)
      setPassword('')

      if (LOCK_MODE === 'final') {
        clearLocalLockCode()
      }

      if (LOCK_MODE === 'initial' && !usedLocalCode) {
        resetSecretRef.current = { rawK, aesKey, initialPassword: attemptPw }
        setStage('reset')
      } else {
        rawK.fill(0)
        const savedRekey = LOCK_MODE === 'initial' ? readLocalRekeyCode() : null
        if (savedRekey) {
          setLockCode(savedRekey)
          setCopied(false)
          setStage('code')
        } else {
          setStage('unlocked')
        }
      }
    } catch {
      if (unlocked?.rawK) unlocked.rawK.fill(0)
      setError('콘텐츠를 여는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
      setStatusText('')
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (busy) return
    const secret = resetSecretRef.current
    if (!secret) return

    const normNew = normalizePassword(newPassword)
    const normConfirm = normalizePassword(confirmPassword)

    if ([...normNew].length < MIN_PASSWORD_LEN) {
      setError(`비밀번호는 ${MIN_PASSWORD_LEN}자 이상으로 정해 주세요.`)
      return
    }
    if (normNew !== normConfirm) {
      setError('새 비밀번호가 서로 맞지 않아요.')
      return
    }
    if (normNew === secret.initialPassword) {
      setError('처음 비밀번호와 다른 비밀번호로 정해 주세요.')
      return
    }

    setBusy(true)
    setError('')
    setStatusText('잠금 코드를 만들고 있어요…')
    await nextTick()

    let rawK2 = null
    try {
      rawK2 = randomBytes(KEY_BYTES)
      // 1) 재배포 후 최종 모드용: 새 콘텐츠 키 K2를 새 비밀번호로 감싸고(wrapK2), K2 자체는 K로 암호화(encK2)한 HJ2. 코드
      // 2) 재배포 전 이 기기용: 현재 사이트의 키 K를 새 비밀번호로 감싼 HJ1. 로컬 코드(localStorage 1개만 유지)
      const [rekeyCode, localWrapK] = await Promise.all([
        createRekeyLockCode(secret.aesKey, rawK2, normNew),
        wrapKey(secret.rawK, normNew),
      ])
      writeLocalLockCode(localWrapK)
      writeLocalRekeyCode(rekeyCode)
      secret.rawK.fill(0)
      resetSecretRef.current = null
      setNewPassword('')
      setConfirmPassword('')
      setLockCode(rekeyCode)
      setCopied(false)
      setStage('code')
    } catch {
      setError('잠금 코드를 만드는 중 문제가 생겼어요. 다시 시도해 주세요.')
    } finally {
      if (rawK2) rawK2.fill(0)
      setBusy(false)
      setStatusText('')
    }
  }

  const handleCopy = async () => {
    if (!lockCode) return
    const ok = await copyText(lockCode)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  if (stage === 'unlocked') {
    return children
  }

  return (
    <div className="Lock">
      <div className="Lock-stars" aria-hidden="true" />
      <main className="Lock-card">
        <div className="Lock-moon" aria-hidden="true">
          🌙
        </div>

        {stage === 'lock' && (
          <>
            <h1 className="Lock-title">하진 순장님의 생일 축하가 끝났어요</h1>
            <p className="Lock-desc">하진 순장님만 볼 수 있도록 잠가 두었어요.</p>
            <form className="Lock-form" onSubmit={handleUnlock} noValidate>
              <label className="Lock-label" htmlFor="lock-pw">
                비밀번호
              </label>
              <input
                id="lock-pw"
                className="Lock-input"
                type="password"
                autoComplete="current-password"
                placeholder="비밀번호를 입력해 주세요"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
                disabled={busy}
                autoFocus
              />
              {error && (
                <p className="Lock-error" role="alert">
                  {error}
                </p>
              )}
              <button className="Lock-btn" type="submit" disabled={busy}>
                {busy ? (
                  <span className="Lock-loading">
                    <span className="Lock-spinner" aria-hidden="true" />
                    <span>{statusText || '확인하고 있어요…'}</span>
                  </span>
                ) : (
                  '열기'
                )}
              </button>
            </form>
          </>
        )}

        {stage === 'reset' && (
          <>
            <h1 className="Lock-title">처음 들어오셨네요. 앞으로 쓸 새 비밀번호를 정해 주세요.</h1>
            <p className="Lock-desc">8자 이상, 처음 비밀번호와 다른 비밀번호로 입력해 주세요.</p>
            <form className="Lock-form" onSubmit={handleReset} noValidate>
              <label className="Lock-label" htmlFor="reset-pw-1">
                새 비밀번호
              </label>
              <input
                id="reset-pw-1"
                className="Lock-input"
                type="password"
                autoComplete="new-password"
                placeholder="새 비밀번호 (8자 이상)"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  if (error) setError('')
                }}
                disabled={busy}
                autoFocus
              />
              <label className="Lock-label" htmlFor="reset-pw-2">
                새 비밀번호 확인
              </label>
              <input
                id="reset-pw-2"
                className="Lock-input"
                type="password"
                autoComplete="new-password"
                placeholder="새 비밀번호를 한 번 더 입력해 주세요"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (error) setError('')
                }}
                disabled={busy}
              />
              {error && (
                <p className="Lock-error" role="alert">
                  {error}
                </p>
              )}
              <button className="Lock-btn" type="submit" disabled={busy}>
                {busy ? (
                  <span className="Lock-loading">
                    <span className="Lock-spinner" aria-hidden="true" />
                    <span>{statusText || '잠금 코드를 만들고 있어요…'}</span>
                  </span>
                ) : (
                  '새 비밀번호 정하기'
                )}
              </button>
            </form>
          </>
        )}

        {stage === 'code' && (
          <>
            <h1 className="Lock-title">새 비밀번호가 정해졌어요</h1>
            <p className="Lock-desc">
              아래 잠금 코드를 사이트를 만든 분께 보내 주세요. 반영되면 모든 기기에서 새 비밀번호로만 열리고, 처음
              비밀번호는 더 이상 쓸 수 없어요.
            </p>
            <p className="Lock-note">
              다른 기기에서 다시 정하면 코드가 바뀌어요. 마지막에 보낸 코드 하나만 반영돼요.
            </p>
            <div className="Lock-codeBox">
              <code className="Lock-code" data-testid="lock-code">
                {lockCode}
              </code>
              <button type="button" className="Lock-copyBtn" onClick={handleCopy}>
                {copied ? '복사됐어요 ✓' : '잠금 코드 복사'}
              </button>
            </div>
            <button type="button" className="Lock-btn" onClick={() => setStage('unlocked')}>
              사이트 보기
            </button>
          </>
        )}
      </main>
    </div>
  )
}
