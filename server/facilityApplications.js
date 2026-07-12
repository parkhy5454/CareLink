import { Router } from 'express'
import { pool } from './db.js'
import rateLimit from 'express-rate-limit'

const router = Router()

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: '신청이 너무 많아요. 나중에 다시 시도해주세요' },
  handler: (req, res, _next, options) => res.status(429).json(options.message)
})

// 병원/약국 담당자가 스스로 입점(계정 발급) 신청 — 로그인 없이 제출, 관리자가 검토
router.post('/', submitLimiter, async (req, res) => {
  try {
    const role = String(req.body.role || '').trim()
    const facilityCode = String(req.body.facilityCode || '').trim()
    const contactName = String(req.body.contactName || '').trim()
    const contactPhone = String(req.body.contactPhone || '').trim()
    const contactEmail = String(req.body.contactEmail || '').trim() || null
    const note = String(req.body.note || '').trim().slice(0, 500) || null

    if (!['hospital', 'pharmacy'].includes(role)) {
      return res.status(400).json({ error: '병원 또는 약국을 선택해주세요' })
    }
    if (!facilityCode || !contactName || !contactPhone) {
      return res.status(400).json({ error: '시설, 담당자 이름, 연락처를 입력해주세요' })
    }

    const table = role === 'hospital' ? 'hospitals' : 'pharmacies'
    const { rows: facilityRows } = await pool.query(`SELECT name FROM ${table} WHERE code = $1`, [facilityCode])
    if (facilityRows.length === 0) {
      return res.status(404).json({ error: '선택한 시설을 찾을 수 없어요' })
    }

    const { rows } = await pool.query(
      `INSERT INTO facility_applications (role, facility_code, facility_name, contact_name, contact_phone, contact_email, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [role, facilityCode, facilityRows[0].name, contactName, contactPhone, contactEmail, note]
    )

    res.json({ application: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '신청을 접수하는 중 문제가 발생했어요' })
  }
})

export default router
