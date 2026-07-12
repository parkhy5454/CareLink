import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from './db.js'
import { staffAuthMiddleware } from './staffAuth.js'

const router = Router()
const requireAdmin = staffAuthMiddleware('admin')

// 전체 현황 요약
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [users, hospitals, pharmacies, bookings, prescriptions, staff] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM hospitals'),
      pool.query('SELECT COUNT(*) FROM pharmacies'),
      pool.query(`SELECT status, COUNT(*) FROM bookings GROUP BY status`),
      pool.query(`SELECT status, COUNT(*) FROM prescriptions GROUP BY status`),
      pool.query(`SELECT role, COUNT(*) FROM staff_accounts GROUP BY role`)
    ])

    const toMap = (rows, key) => rows.reduce((acc, r) => ({ ...acc, [r[key]]: Number(r.count) }), {})

    res.json({
      totalUsers: Number(users.rows[0].count),
      totalHospitals: Number(hospitals.rows[0].count),
      totalPharmacies: Number(pharmacies.rows[0].count),
      bookingsByStatus: toMap(bookings.rows, 'status'),
      prescriptionsByStatus: toMap(prescriptions.rows, 'status'),
      staffByRole: toMap(staff.rows, 'role')
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '현황을 불러오는 중 문제가 발생했어요' })
  }
})

// 최근 N일간 일별 예약/처방전 건수 추이 (그래프용)
router.get('/stats/timeseries', requireAdmin, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 14, 90)

    const [bookingsByDay, prescriptionsByDay] = await Promise.all([
      pool.query(
        `SELECT to_char(created_at::date, 'MM-DD') AS day, COUNT(*) AS count
         FROM bookings
         WHERE created_at >= now() - ($1 || ' days')::interval
         GROUP BY created_at::date
         ORDER BY created_at::date`,
        [days]
      ),
      pool.query(
        `SELECT to_char(created_at::date, 'MM-DD') AS day, COUNT(*) AS count
         FROM prescriptions
         WHERE created_at >= now() - ($1 || ' days')::interval
         GROUP BY created_at::date
         ORDER BY created_at::date`,
        [days]
      )
    ])

    // 데이터가 없는 날도 0으로 채워서 그래프가 끊기지 않게 합니다
    const dayLabels = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      dayLabels.push(d.toISOString().slice(5, 10))
    }
    const bookingMap = Object.fromEntries(bookingsByDay.rows.map((r) => [r.day, Number(r.count)]))
    const prescriptionMap = Object.fromEntries(prescriptionsByDay.rows.map((r) => [r.day, Number(r.count)]))

    const series = dayLabels.map((day) => ({
      day,
      bookings: bookingMap[day] || 0,
      prescriptions: prescriptionMap[day] || 0
    }))

    res.json({ series })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '추이 데이터를 불러오는 중 문제가 발생했어요' })
  }
})

// 담당자 계정 목록
router.get('/staff-accounts', requireAdmin, async (req, res) => {
  try {
    const role = req.query.role
    const params = []
    let where = ''
    if (role) {
      params.push(role)
      where = 'WHERE role = $1'
    }
    const { rows } = await pool.query(
      `SELECT id, role, facility_code, facility_name, username, name, created_at
       FROM staff_accounts ${where} ORDER BY created_at DESC`,
      params
    )
    res.json({ staff: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '담당자 목록을 불러오는 중 문제가 발생했어요' })
  }
})

// 담당자 계정 생성 (병원/약국은 시설 코드 필요, 관리자는 필요 없음)
router.post('/staff-accounts', requireAdmin, async (req, res) => {
  try {
    const role = String(req.body.role || '').trim()
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '')
    const name = String(req.body.name || '').trim() || null
    const facilityCode = String(req.body.facilityCode || '').trim() || null

    if (!['hospital', 'pharmacy', 'admin'].includes(role)) {
      return res.status(400).json({ error: '역할은 hospital, pharmacy, admin 중 하나여야 해요' })
    }
    if (!username || password.length < 6) {
      return res.status(400).json({ error: '아이디와 6자 이상의 비밀번호를 입력해주세요' })
    }
    if (role !== 'admin' && !facilityCode) {
      return res.status(400).json({ error: '병원/약국 계정은 시설 코드가 필요해요' })
    }

    let facilityName = null
    if (facilityCode) {
      const table = role === 'hospital' ? 'hospitals' : 'pharmacies'
      const { rows: facilityRows } = await pool.query(`SELECT name FROM ${table} WHERE code = $1`, [facilityCode])
      if (facilityRows.length === 0) {
        return res.status(404).json({ error: '해당 시설 코드를 찾을 수 없어요' })
      }
      facilityName = facilityRows[0].name
    }

    const { rows: existing } = await pool.query('SELECT id FROM staff_accounts WHERE username = $1', [username])
    if (existing.length > 0) {
      return res.status(409).json({ error: '이미 사용 중인 아이디예요' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      `INSERT INTO staff_accounts (role, facility_code, facility_name, username, password_hash, name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, role, facility_code, facility_name, username, name, created_at`,
      [role, facilityCode, facilityName, username, passwordHash, name]
    )
    res.json({ staff: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '계정을 만드는 중 문제가 발생했어요' })
  }
})

router.delete('/staff-accounts/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM staff_accounts WHERE id = $1 RETURNING id', [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: '계정을 찾을 수 없어요' })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '계정을 삭제하는 중 문제가 발생했어요' })
  }
})

// 전체 예약/처방전 최근 내역 (모니터링용)
router.get('/bookings', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const { rows } = await pool.query(
      `SELECT b.*, u.name AS account_name
       FROM bookings b JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at DESC LIMIT $1`,
      [limit]
    )
    res.json({ bookings: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '예약 목록을 불러오는 중 문제가 발생했어요' })
  }
})

router.get('/prescriptions', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS account_name
       FROM prescriptions p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT $1`,
      [limit]
    )
    res.json({ prescriptions: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '처방전 목록을 불러오는 중 문제가 발생했어요' })
  }
})

// 알림 발송 이력 (카카오 알림톡/SMS/콘솔 로그)
router.get('/notifications', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const { rows } = await pool.query(
      `SELECT n.*, u.name AS user_name
       FROM notification_log n LEFT JOIN users u ON u.id = n.user_id
       ORDER BY n.created_at DESC LIMIT $1`,
      [limit]
    )
    res.json({ notifications: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '알림 이력을 불러오는 중 문제가 발생했어요' })
  }
})

// 병원/약국 자체 입점 신청 목록 (기본: 대기중부터)
router.get('/applications', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status
    const params = []
    let where = ''
    if (status) {
      params.push(status)
      where = 'WHERE status = $1'
    }
    const { rows } = await pool.query(
      `SELECT * FROM facility_applications ${where}
       ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`,
      params
    )
    res.json({ applications: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '입점 신청 목록을 불러오는 중 문제가 발생했어요' })
  }
})

// 신청 승인 → 실제 담당자 계정을 함께 만들어줍니다
router.post('/applications/:id/approve', requireAdmin, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '')
    if (!username || password.length < 6) {
      return res.status(400).json({ error: '발급할 아이디와 6자 이상의 비밀번호를 입력해주세요' })
    }

    const { rows: appRows } = await pool.query(
      `SELECT * FROM facility_applications WHERE id = $1 AND status = 'pending'`,
      [req.params.id]
    )
    if (appRows.length === 0) {
      return res.status(404).json({ error: '대기중인 신청을 찾을 수 없어요' })
    }
    const application = appRows[0]

    const { rows: existing } = await pool.query('SELECT id FROM staff_accounts WHERE username = $1', [username])
    if (existing.length > 0) {
      return res.status(409).json({ error: '이미 사용 중인 아이디예요' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await pool.query(
      `INSERT INTO staff_accounts (role, facility_code, facility_name, username, password_hash, name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [application.role, application.facility_code, application.facility_name, username, passwordHash, application.contact_name]
    )

    const { rows } = await pool.query(
      `UPDATE facility_applications SET status = 'approved', reviewed_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    res.json({ application: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '승인 처리 중 문제가 발생했어요' })
  }
})

router.post('/applications/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE facility_applications SET status = 'rejected', reviewed_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: '대기중인 신청을 찾을 수 없어요' })
    res.json({ application: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '거절 처리 중 문제가 발생했어요' })
  }
})

export default router
