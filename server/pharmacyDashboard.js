import { Router } from 'express'
import { pool } from './db.js'
import { staffAuthMiddleware } from './staffAuth.js'
import { notifyUser } from './notify.js'
import { scheduleRemindersForPrescription } from './reminders.js'

const router = Router()
const requirePharmacyStaff = staffAuthMiddleware('pharmacy')

// 우리 약국으로 들어온 처방전 목록 (사진은 용량이 커서 목록에는 포함하지 않고, has_image로만 표시)
router.get('/prescriptions', requirePharmacyStaff, async (req, res) => {
  try {
    const status = req.query.status
    const params = [req.facilityCode]
    let where = 'WHERE p.pharmacy_code = $1'
    if (status) {
      params.push(status)
      where += ` AND p.status = $${params.length}`
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.booking_id, p.user_id, p.pharmacy_code, p.pharmacy_name, p.status, p.reject_reason,
              p.created_at, p.updated_at, (p.image_base64 IS NOT NULL) AS has_image,
              u.name AS account_name, u.phone AS patient_phone,
              COALESCE(b.patient_name, u.name) AS patient_name,
              b.hospital_name, b.appointment_label
       FROM prescriptions p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN bookings b ON b.id = p.booking_id
       ${where}
       ORDER BY
         CASE p.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END,
         p.created_at DESC`,
      params
    )
    res.json({ prescriptions: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '처방전 목록을 불러오는 중 문제가 발생했어요' })
  }
})

// 처방전 사진 조회 (필요할 때만 따로 불러오기)
router.get('/prescriptions/:id/image', requirePharmacyStaff, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT image_base64, image_mime_type FROM prescriptions WHERE id = $1 AND pharmacy_code = $2',
      [req.params.id, req.facilityCode]
    )
    if (rows.length === 0 || !rows[0].image_base64) {
      return res.status(404).json({ error: '저장된 사진이 없어요' })
    }
    res.json({ imageBase64: rows[0].image_base64, mimeType: rows[0].image_mime_type })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '사진을 불러오는 중 문제가 발생했어요' })
  }
})

async function notifyPrescriptionChange(prescription, event, message) {
  const { rows: userRows } = await pool.query('SELECT phone FROM users WHERE id = $1', [prescription.user_id])
  notifyUser({ userId: prescription.user_id, phone: userRows[0]?.phone, event, message })
}

router.post('/prescriptions/:id/accept', requirePharmacyStaff, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE prescriptions SET status = 'accepted', reject_reason = NULL, updated_at = now()
       WHERE id = $1 AND pharmacy_code = $2
       RETURNING *`,
      [req.params.id, req.facilityCode]
    )
    if (rows.length === 0) return res.status(404).json({ error: '처방전을 찾을 수 없어요' })
    const prescription = rows[0]
    notifyPrescriptionChange(
      prescription, 'prescription_accepted',
      `[내건강] ${prescription.pharmacy_name}에서 처방전을 수락했어요. 조제가 시작됩니다.`
    )
    res.json({ prescription })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '처리 중 문제가 발생했어요' })
  }
})

router.post('/prescriptions/:id/reject', requirePharmacyStaff, async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim() || '재고가 없어요'
    const { rows } = await pool.query(
      `UPDATE prescriptions SET status = 'rejected', reject_reason = $1, updated_at = now()
       WHERE id = $2 AND pharmacy_code = $3
       RETURNING *`,
      [reason, req.params.id, req.facilityCode]
    )
    if (rows.length === 0) return res.status(404).json({ error: '처방전을 찾을 수 없어요' })
    const prescription = rows[0]
    notifyPrescriptionChange(
      prescription, 'prescription_rejected',
      `[내건강] ${prescription.pharmacy_name}에서 처방전을 받지 못했어요 (사유: ${reason}). 다른 약국을 찾아보세요.`
    )
    res.json({ prescription })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '처리 중 문제가 발생했어요' })
  }
})

// 조제 완료 처리
router.post('/prescriptions/:id/ready', requirePharmacyStaff, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE prescriptions SET status = 'ready', updated_at = now()
       WHERE id = $1 AND pharmacy_code = $2 AND status = 'accepted'
       RETURNING *`,
      [req.params.id, req.facilityCode]
    )
    if (rows.length === 0) return res.status(404).json({ error: '수락된 처방전만 조제 완료로 바꿀 수 있어요' })
    const prescription = rows[0]
    notifyPrescriptionChange(
      prescription, 'prescription_ready',
      `[내건강] ${prescription.pharmacy_name} 조제가 완료됐어요. 방문해서 수령해주세요.`
    )
    // 처방전에 복용일수/횟수 정보가 있으면(Gemini 분석 결과), 그 기간만큼 복약 알림을 예약해둡니다
    scheduleRemindersForPrescription(prescription).catch((err) => console.error('[reminders] 예약 생성 실패', err))
    res.json({ prescription })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '처리 중 문제가 발생했어요' })
  }
})

export default router
