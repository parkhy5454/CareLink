import { Router } from 'express'
import { pool } from './db.js'
import { staffAuthMiddleware } from './staffAuth.js'
import { notifyUser } from './notify.js'
import { DAY_LABELS, TIME_LABELS, allSlotLabels } from './slots.js'

const router = Router()
const requireHospitalStaff = staffAuthMiddleware('hospital')

// 우리 병원으로 들어온 예약 목록 (기본: 대기중인 것부터)
router.get('/bookings', requireHospitalStaff, async (req, res) => {
  try {
    const status = req.query.status // 없으면 전체
    const params = [req.facilityCode]
    let where = 'WHERE b.hospital_code = $1'
    if (status) {
      params.push(status)
      where += ` AND b.status = $${params.length}`
    }

    const { rows } = await pool.query(
      `SELECT b.*, u.name AS account_name, u.phone AS patient_phone, u.email AS patient_email
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       ${where}
       ORDER BY
         CASE b.status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,
         b.created_at DESC`,
      params
    )
    res.json({ bookings: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '예약 목록을 불러오는 중 문제가 발생했어요' })
  }
})

async function updateBookingStatus(req, res, nextStatus) {
  try {
    const { rows } = await pool.query(
      `UPDATE bookings SET status = $1, updated_at = now()
       WHERE id = $2 AND hospital_code = $3
       RETURNING *`,
      [nextStatus, req.params.id, req.facilityCode]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: '예약을 찾을 수 없어요' })
    }
    const booking = rows[0]

    const { rows: userRows } = await pool.query('SELECT phone FROM users WHERE id = $1', [booking.user_id])
    const phone = userRows[0]?.phone
    const message = nextStatus === 'confirmed'
      ? `[내건강] ${booking.patient_name || ''}님, ${booking.hospital_name} 예약(${booking.appointment_label})이 확정됐어요.`
      : `[내건강] ${booking.patient_name || ''}님, ${booking.hospital_name} 예약(${booking.appointment_label})이 거절됐어요. 다른 시간을 찾아보세요.`
    notifyUser({
      userId: booking.user_id,
      phone,
      event: nextStatus === 'confirmed' ? 'booking_confirmed' : 'booking_rejected',
      message
    })

    res.json({ booking })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '예약 상태를 변경하는 중 문제가 발생했어요' })
  }
}

router.post('/bookings/:id/confirm', requireHospitalStaff, (req, res) => updateBookingStatus(req, res, 'confirmed'))
router.post('/bookings/:id/reject', requireHospitalStaff, (req, res) => updateBookingStatus(req, res, 'rejected'))

// ── 진료시간(예약 가능 시간) 설정 ──
// 기본적으로 전체 슬롯이 열려있고, 여기서 끈 슬롯만 hospital_schedule_exceptions에 저장됩니다.
router.get('/schedule', requireHospitalStaff, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slot_label FROM hospital_schedule_exceptions WHERE hospital_code = $1',
      [req.facilityCode]
    )
    const disabled = new Set(rows.map((r) => r.slot_label))

    const days = DAY_LABELS.map((day) => ({
      day,
      times: TIME_LABELS.map((time) => {
        const label = `${day} ${time}`
        return { time, label, enabled: !disabled.has(label) }
      })
    }))

    res.json({ days })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '진료시간 설정을 불러오는 중 문제가 발생했어요' })
  }
})

router.post('/schedule', requireHospitalStaff, async (req, res) => {
  try {
    const disabledLabels = Array.isArray(req.body.disabledLabels) ? req.body.disabledLabels : []
    const validLabels = new Set(allSlotLabels())
    const cleaned = disabledLabels.filter((l) => validLabels.has(l))

    await pool.query('DELETE FROM hospital_schedule_exceptions WHERE hospital_code = $1', [req.facilityCode])
    if (cleaned.length > 0) {
      const values = []
      const params = []
      cleaned.forEach((label, idx) => {
        values.push(`($${idx * 2 + 1}, $${idx * 2 + 2})`)
        params.push(req.facilityCode, label)
      })
      await pool.query(
        `INSERT INTO hospital_schedule_exceptions (hospital_code, slot_label) VALUES ${values.join(',')}`,
        params
      )
    }

    res.json({ ok: true, disabledCount: cleaned.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '진료시간 설정을 저장하는 중 문제가 발생했어요' })
  }
})

export default router
