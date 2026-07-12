import { Router } from 'express'
import { pool } from './db.js'
import { authMiddleware } from './auth.js'

const router = Router()

// 로그인한 계정의 모든 진료 예약 + 처방전 기록을 시간순으로 합쳐서 반환합니다.
// patientId를 주면 그 가족 구성원의 기록만, 안 주면 본인+가족 전체 기록을 보여줘요.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const patientId = req.query.patientId ? parseInt(req.query.patientId) : null
    const params = [req.userId]
    let patientFilter = ''
    if (patientId) {
      params.push(patientId)
      patientFilter = ` AND b.patient_id = $2`
    }

    const { rows } = await pool.query(
      `
      SELECT 'visit' AS record_type, b.id, b.patient_id, b.patient_name,
             b.hospital_name AS facility_name, b.hospital_code AS facility_code,
             b.appointment_label AS detail,
             b.status, NULL AS reject_reason, b.created_at
      FROM bookings b
      WHERE b.user_id = $1 ${patientFilter}

      UNION ALL

      SELECT 'prescription' AS record_type, p.id, b.patient_id, COALESCE(b.patient_name, u.name) AS patient_name,
             p.pharmacy_name AS facility_name, p.pharmacy_code AS facility_code,
             b.hospital_name AS detail,
             p.status, p.reject_reason, p.created_at
      FROM prescriptions p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN bookings b ON b.id = p.booking_id
      WHERE p.user_id = $1 ${patientFilter}

      ORDER BY created_at DESC
      `,
      params
    )

    res.json({ records: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '진료/처방 기록을 불러오는 중 문제가 발생했어요' })
  }
})

export default router
