import { Router } from 'express'
import crypto from 'crypto'
import { pool } from './db.js'
import { authMiddleware } from './auth.js'
import { allSlotLabels } from './slots.js'

const router = Router()
const VALID_SLOTS = new Set(allSlotLabels())

// 로그인한 사용자의 가장 최근 예약을 반환 (없으면 null)
router.get('/latest', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, h.sido, h.sigungu, h.address
       FROM bookings b
       LEFT JOIN hospitals h ON h.code = b.hospital_code
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC LIMIT 1`,
      [req.userId]
    )
    res.json({ booking: rows[0] || null })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '예약 정보를 불러오는 중 문제가 발생했어요' })
  }
})

// 예약 생성: 환자가 병원의 예약 가능 시간표(/api/hospitals/:code/slots)에서 고른
// 특정 시간(appointmentLabel)으로만 예약할 수 있습니다. 이미 다른 환자가 잡은 시간이면 거부돼요.
// patientId는 이 계정에 등록된 가족 구성원(본인 포함) 중 하나여야 합니다.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { hospitalCode, appointmentLabel, patientId } = req.body
    if (!hospitalCode) {
      return res.status(400).json({ error: '예약할 병원을 선택해주세요' })
    }
    if (!appointmentLabel || !VALID_SLOTS.has(appointmentLabel)) {
      return res.status(400).json({ error: '예약 가능한 시간 중에서 선택해주세요' })
    }
    if (!patientId) {
      return res.status(400).json({ error: '예약할 가족 구성원을 선택해주세요' })
    }

    const { rows: memberRows } = await pool.query(
      'SELECT * FROM family_members WHERE id = $1 AND user_id = $2',
      [patientId, req.userId]
    )
    if (memberRows.length === 0) {
      return res.status(400).json({ error: '내 계정에 등록된 가족 구성원만 예약할 수 있어요' })
    }
    const patient = memberRows[0]

    const { rows: hospitalRows } = await pool.query('SELECT * FROM hospitals WHERE code = $1', [hospitalCode])
    if (hospitalRows.length === 0) {
      return res.status(404).json({ error: '병원 정보를 찾을 수 없어요' })
    }
    const hospital = hospitalRows[0]

    const { rows: disabledRows } = await pool.query(
      'SELECT 1 FROM hospital_schedule_exceptions WHERE hospital_code = $1 AND slot_label = $2',
      [hospitalCode, appointmentLabel]
    )
    if (disabledRows.length > 0) {
      return res.status(400).json({ error: '이 병원은 해당 시간에 진료하지 않아요' })
    }

    const { rows: clashRows } = await pool.query(
      `SELECT id FROM bookings WHERE hospital_code = $1 AND appointment_label = $2 AND status IN ('pending', 'confirmed')`,
      [hospitalCode, appointmentLabel]
    )
    if (clashRows.length > 0) {
      return res.status(409).json({ error: '이미 다른 환자가 예약한 시간이에요. 다른 시간을 선택해주세요' })
    }

    const bookingCode = 'A-' + String(crypto.randomInt(1000, 9999))

    const { rows } = await pool.query(
      `INSERT INTO bookings (user_id, hospital_code, hospital_name, appointment_label, booking_code, patient_id, patient_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, hospital.code, hospital.name, appointmentLabel, bookingCode, patient.id, patient.name]
    )

    res.json({ booking: { ...rows[0], sido: hospital.sido, sigungu: hospital.sigungu, address: hospital.address } })
  } catch (err) {
    if (err.code === '23505') {
      // 동시에 같은 시간을 예약하려던 경쟁 상황 (DB 유니크 제약으로 최종 방어)
      return res.status(409).json({ error: '이미 다른 환자가 예약한 시간이에요. 다른 시간을 선택해주세요' })
    }
    console.error(err)
    res.status(500).json({ error: '예약을 저장하는 중 문제가 발생했어요' })
  }
})

// 환자가 스스로 예약을 취소 (대기중/확정 상태만 취소 가능, 취소되면 그 시간은 다시 열림)
router.post('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE bookings SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'confirmed')
       RETURNING *`,
      [req.params.id, req.userId]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: '취소할 수 있는 예약을 찾을 수 없어요' })
    }
    res.json({ booking: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '예약을 취소하는 중 문제가 발생했어요' })
  }
})

export default router
