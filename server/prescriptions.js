import { Router } from 'express'
import { pool } from './db.js'
import { authMiddleware } from './auth.js'

const router = Router()

// 처방전 전송 (OCR 화면에서 "전송하기" 클릭 시 호출)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { bookingId, pharmacyCode, imageBase64, imageMimeType, dosageTotalDays, dosageTimesPerDay } = req.body
    if (!pharmacyCode) {
      return res.status(400).json({ error: '전송할 약국을 선택해주세요' })
    }

    const { rows: pharmacyRows } = await pool.query('SELECT * FROM pharmacies WHERE code = $1', [pharmacyCode])
    if (pharmacyRows.length === 0) {
      return res.status(404).json({ error: '약국 정보를 찾을 수 없어요' })
    }
    const pharmacy = pharmacyRows[0]

    const { rows } = await pool.query(
      `INSERT INTO prescriptions
         (booking_id, user_id, pharmacy_code, pharmacy_name, image_base64, image_mime_type, dosage_total_days, dosage_times_per_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, booking_id, user_id, pharmacy_code, pharmacy_name, status, reject_reason,
                 dosage_total_days, dosage_times_per_day, created_at, updated_at`,
      [
        bookingId || null, req.userId, pharmacy.code, pharmacy.name, imageBase64 || null, imageMimeType || null,
        Number.isInteger(dosageTotalDays) ? dosageTotalDays : null,
        Number.isInteger(dosageTimesPerDay) ? dosageTimesPerDay : null
      ]
    )

    res.json({ prescription: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '처방전을 전송하는 중 문제가 발생했어요' })
  }
})

// 가장 최근 처방전 상태 조회 (조제 현황 화면에서 폴링) — 이미지는 용량이 커서 목록/상태 조회에는 포함하지 않아요
router.get('/latest', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, booking_id, user_id, pharmacy_code, pharmacy_name, status, reject_reason,
              dosage_total_days, dosage_times_per_day, created_at, updated_at
       FROM prescriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.userId]
    )
    res.json({ prescription: rows[0] || null })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '처방전 정보를 불러오는 중 문제가 발생했어요' })
  }
})

// 약국이 거절한 처방전을 다른 약국으로 다시 보내기 (사진을 다시 찍을 필요 없이, 저장된 사진을 그대로 사용)
router.post('/:id/resend', authMiddleware, async (req, res) => {
  try {
    const { pharmacyCode } = req.body
    if (!pharmacyCode) {
      return res.status(400).json({ error: '전송할 약국을 선택해주세요' })
    }

    const { rows: originalRows } = await pool.query(
      `SELECT * FROM prescriptions WHERE id = $1 AND user_id = $2 AND status = 'rejected'`,
      [req.params.id, req.userId]
    )
    if (originalRows.length === 0) {
      return res.status(400).json({ error: '거절된 처방전만 다시 보낼 수 있어요' })
    }
    const original = originalRows[0]

    const { rows: pharmacyRows } = await pool.query('SELECT * FROM pharmacies WHERE code = $1', [pharmacyCode])
    if (pharmacyRows.length === 0) {
      return res.status(404).json({ error: '약국 정보를 찾을 수 없어요' })
    }
    const pharmacy = pharmacyRows[0]

    const { rows } = await pool.query(
      `INSERT INTO prescriptions
         (booking_id, user_id, pharmacy_code, pharmacy_name, image_base64, image_mime_type, dosage_total_days, dosage_times_per_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, booking_id, user_id, pharmacy_code, pharmacy_name, status, reject_reason,
                 dosage_total_days, dosage_times_per_day, created_at, updated_at`,
      [
        original.booking_id, req.userId, pharmacy.code, pharmacy.name, original.image_base64, original.image_mime_type,
        original.dosage_total_days, original.dosage_times_per_day
      ]
    )

    res.json({ prescription: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '다시 보내는 중 문제가 발생했어요' })
  }
})

export default router
