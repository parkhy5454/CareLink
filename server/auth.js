import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import { pool } from './db.js'
import { sendResetEmail } from './mailer.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me'
if (!process.env.JWT_SECRET) {
  console.warn('[경고] JWT_SECRET이 설정되어 있지 않아 개발용 기본값을 사용해요. Replit Secrets에 추가하는 걸 권장해요.')
}

const CODE_TTL_MS = 5 * 60 * 1000 // 인증번호/재설정 코드 유효시간 5분

const router = Router()

// ───────────────────────── 로그인 시도 제한 ─────────────────────────
// 무차별 대입 공격 방지용. IP 기준으로 짧은 시간에 너무 많이 시도하면 막습니다.
function makeLimiter(max, windowMinutes, message) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: message },
    handler: (req, res, _next, options) => res.status(429).json(options.message)
  })
}

const otpRequestLimiter = makeLimiter(5, 10, '인증번호 요청이 너무 많아요. 10분 후 다시 시도해주세요')
const otpVerifyLimiter = makeLimiter(10, 10, '인증 시도가 너무 많아요. 10분 후 다시 시도해주세요')
const emailLoginLimiter = makeLimiter(8, 10, '로그인 시도가 너무 많아요. 10분 후 다시 시도해주세요')
const passwordResetLimiter = makeLimiter(5, 30, '요청이 너무 많아요. 30분 후 다시 시도해주세요')

function normalizePhone(raw) {
  return String(raw || '').replace(/[^0-9]/g, '')
}

function issueToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' })
}

function publicUser(user) {
  return { id: user.id, name: user.name, phone: user.phone, email: user.email }
}

// 새 계정이 생기면 '본인' 가족 구성원 프로필을 함께 만들어둡니다 (예약 시 예약 대상으로 사용)
async function createSelfFamilyMember(userId, name) {
  await pool.query(
    `INSERT INTO family_members (user_id, name, relationship) VALUES ($1, $2, '본인')`,
    [userId, name]
  )
}

// 이용약관/개인정보 처리방침은 필수 동의, 마케팅 수신은 선택
function checkRequiredConsent(body) {
  if (!body.agreeTerms || !body.agreePrivacy) {
    return '이용약관과 개인정보 처리방침에 동의해주세요'
  }
  return null
}

async function recordConsent(userId, body) {
  await pool.query(
    `UPDATE users SET
       agreed_terms_at = now(),
       agreed_privacy_at = now(),
       agreed_marketing_at = CASE WHEN $2 THEN now() ELSE agreed_marketing_at END
     WHERE id = $1`,
    [userId, Boolean(body.agreeMarketing)]
  )
}

// ───────────────────────── 전화번호 + 모의 인증번호 ─────────────────────────

// 실제 SMS 발송 없이, 데모 목적으로 코드를 응답에 그대로 담아 화면에 보여줍니다.
router.post('/request-code', otpRequestLimiter, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone)
    if (phone.length < 9) {
      return res.status(400).json({ error: '올바른 전화번호를 입력해주세요' })
    }

    const code = String(crypto.randomInt(100000, 999999))
    const expiresAt = new Date(Date.now() + CODE_TTL_MS)

    await pool.query(
      'INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)',
      [phone, code, expiresAt]
    )

    res.json({ phone, code, expiresInSec: CODE_TTL_MS / 1000 })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '인증번호를 만드는 중 문제가 발생했어요' })
  }
})

router.post('/verify', otpVerifyLimiter, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone)
    const code = String(req.body.code || '').trim()

    if (!phone || !code) {
      return res.status(400).json({ error: '전화번호와 인증번호를 입력해주세요' })
    }

    const { rows: codeRows } = await pool.query(
      `SELECT * FROM otp_codes
       WHERE phone = $1 AND code = $2 AND consumed = false AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code]
    )

    if (codeRows.length === 0) {
      return res.status(400).json({ error: '인증번호가 올바르지 않거나 만료됐어요' })
    }

    await pool.query('UPDATE otp_codes SET consumed = true WHERE id = $1', [codeRows[0].id])

    const { rows: userRows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone])

    let user
    if (userRows.length === 0) {
      // 신규 가입일 때만 약관 동의가 필요해요 (이미 있는 계정으로 다시 로그인할 때는 필요 없음)
      const consentError = checkRequiredConsent(req.body)
      if (consentError) {
        return res.status(400).json({ error: consentError })
      }

      const displayName = `회원${phone.slice(-4)}`
      const { rows: inserted } = await pool.query(
        'INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING *',
        [phone, displayName]
      )
      user = inserted[0]
      await createSelfFamilyMember(user.id, user.name)
      await recordConsent(user.id, req.body)
    } else {
      user = userRows[0]
    }

    res.json({ token: issueToken(user), user: publicUser(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '인증 처리 중 문제가 발생했어요' })
  }
})

// ───────────────────────── 이메일 + 비밀번호 ─────────────────────────

router.post('/email/signup', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')
    const name = String(req.body.name || '').trim() || email.split('@')[0]

    if (!email.includes('@') || password.length < 6) {
      return res.status(400).json({ error: '올바른 이메일과 6자 이상의 비밀번호를 입력해주세요' })
    }

    const consentError = checkRequiredConsent(req.body)
    if (consentError) {
      return res.status(400).json({ error: consentError })
    }

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.length > 0) {
      return res.status(409).json({ error: '이미 가입된 이메일이에요. 로그인해주세요' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *',
      [email, passwordHash, name]
    )
    const user = rows[0]
    await createSelfFamilyMember(user.id, user.name)
    await recordConsent(user.id, req.body)

    res.json({ token: issueToken(user), user: publicUser(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '가입 처리 중 문제가 발생했어요' })
  }
})

router.post('/email/login', emailLoginLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (rows.length === 0 || !rows[0].password_hash) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않아요' })
    }

    const user = rows[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않아요' })
    }

    res.json({ token: issueToken(user), user: publicUser(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '로그인 처리 중 문제가 발생했어요' })
  }
})

// ───────────────────────── 비밀번호 재설정 ─────────────────────────
// 실제 발송은 server/mailer.js 참고 (설정 안 하면 콘솔에 코드가 출력돼요)

router.post('/email/forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    if (!email.includes('@')) {
      return res.status(400).json({ error: '올바른 이메일을 입력해주세요' })
    }

    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    // 계정이 없어도 있다고 알려주지 않습니다 (이메일 존재 여부 유출 방지). 항상 200으로 응답.
    if (rows.length > 0) {
      const code = String(crypto.randomInt(100000, 999999))
      const expiresAt = new Date(Date.now() + CODE_TTL_MS)
      await pool.query(
        'INSERT INTO password_reset_codes (email, code, expires_at) VALUES ($1, $2, $3)',
        [email, code, expiresAt]
      )
      const result = await sendResetEmail(email, code)
      return res.json({
        ok: true,
        // 데모 모드(이메일 미설정)일 때만 코드를 화면에 보여주기 위해 함께 반환
        ...(result.simulated ? { demoCode: code } : {})
      })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '요청 처리 중 문제가 발생했어요' })
  }
})

router.post('/email/reset-password', passwordResetLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const code = String(req.body.code || '').trim()
    const newPassword = String(req.body.newPassword || '')

    if (!email || !code || newPassword.length < 6) {
      return res.status(400).json({ error: '이메일, 인증코드, 6자 이상의 새 비밀번호를 입력해주세요' })
    }

    const { rows: codeRows } = await pool.query(
      `SELECT * FROM password_reset_codes
       WHERE email = $1 AND code = $2 AND consumed = false AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [email, code]
    )
    if (codeRows.length === 0) {
      return res.status(400).json({ error: '인증코드가 올바르지 않거나 만료됐어요' })
    }

    await pool.query('UPDATE password_reset_codes SET consumed = true WHERE id = $1', [codeRows[0].id])

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [passwordHash, email])

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '비밀번호를 변경하는 중 문제가 발생했어요' })
  }
})

// ───────────────────────── 세션(JWT) 공용 ─────────────────────────

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: '로그인이 필요해요' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ error: '세션이 만료됐어요, 다시 로그인해주세요' })
  }
}

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId])
    if (rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없어요' })
    }
    res.json({ user: publicUser(rows[0]) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '사용자 정보를 불러오는 중 문제가 발생했어요' })
  }
})

// ───────────────────────── 회원 탈퇴 ─────────────────────────
// 예약/처방/가족구성원 등 연관 데이터는 users 삭제 시 ON DELETE CASCADE로 함께 삭제됩니다.
router.delete('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId])
    if (rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없어요' })
    }
    const user = rows[0]

    // 이메일 계정은 비밀번호 확인 후 탈퇴 (본인 확인)
    if (user.password_hash) {
      const password = String(req.body.password || '')
      const ok = await bcrypt.compare(password, user.password_hash)
      if (!ok) {
        return res.status(401).json({ error: '비밀번호가 올바르지 않아요' })
      }
    }

    await pool.query('DELETE FROM users WHERE id = $1', [req.userId])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '탈퇴 처리 중 문제가 발생했어요' })
  }
})

export { issueToken, publicUser, createSelfFamilyMember, recordConsent }
export default router
