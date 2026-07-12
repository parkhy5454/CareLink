import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { pool } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me'

const router = Router()

const staffLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: '로그인 시도가 너무 많아요. 10분 후 다시 시도해주세요' },
  handler: (req, res, _next, options) => res.status(429).json(options.message)
})

function issueStaffToken(staff) {
  return jwt.sign(
    { staffId: staff.id, role: staff.role, facilityCode: staff.facility_code },
    JWT_SECRET,
    { expiresIn: '30d' }
  )
}

router.post('/staff/login', staffLoginLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '')

    const { rows } = await pool.query('SELECT * FROM staff_accounts WHERE username = $1', [username])
    if (rows.length === 0) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않아요' })
    }

    const staff = rows[0]
    const ok = await bcrypt.compare(password, staff.password_hash)
    if (!ok) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않아요' })
    }

    res.json({
      token: issueStaffToken(staff),
      staff: {
        id: staff.id,
        role: staff.role,
        facilityCode: staff.facility_code,
        facilityName: staff.facility_name,
        name: staff.name
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '로그인 처리 중 문제가 발생했어요' })
  }
})

// role을 지정하면 해당 역할(hospital/pharmacy)만 통과시키는 미들웨어를 만들어줍니다
export function staffAuthMiddleware(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: '로그인이 필요해요' })
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ error: '권한이 없어요' })
      }
      req.staffId = payload.staffId
      req.staffRole = payload.role
      req.facilityCode = payload.facilityCode
      next()
    } catch {
      res.status(401).json({ error: '세션이 만료됐어요, 다시 로그인해주세요' })
    }
  }
}

router.get('/staff/me', staffAuthMiddleware(), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM staff_accounts WHERE id = $1', [req.staffId])
    if (rows.length === 0) return res.status(404).json({ error: '계정을 찾을 수 없어요' })
    const staff = rows[0]
    res.json({
      staff: {
        id: staff.id,
        role: staff.role,
        facilityCode: staff.facility_code,
        facilityName: staff.facility_name,
        name: staff.name
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '계정 정보를 불러오는 중 문제가 발생했어요' })
  }
})

export default router
