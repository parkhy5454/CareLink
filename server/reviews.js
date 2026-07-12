import { Router } from 'express'
import { pool } from './db.js'
import { authMiddleware } from './auth.js'

const router = Router()

// ── 병원 리뷰 ──

router.get('/hospitals/:code/reviews', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.name AS author_name
       FROM hospital_reviews r JOIN users u ON u.id = r.user_id
       WHERE r.hospital_code = $1
       ORDER BY r.created_at DESC LIMIT 50`,
      [req.params.code]
    )
    const { rows: avgRows } = await pool.query(
      `SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS count
       FROM hospital_reviews WHERE hospital_code = $1`,
      [req.params.code]
    )
    res.json({
      reviews: rows,
      averageRating: avgRows[0].avg_rating ? Number(avgRows[0].avg_rating) : null,
      count: Number(avgRows[0].count)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '리뷰를 불러오는 중 문제가 발생했어요' })
  }
})

// 확정된 예약이 있어야 리뷰를 남길 수 있어요 (실제로 방문한 사람만 리뷰를 쓰게)
router.post('/hospitals/:code/reviews', authMiddleware, async (req, res) => {
  try {
    const rating = parseInt(req.body.rating)
    const comment = String(req.body.comment || '').trim().slice(0, 500)
    const bookingId = req.body.bookingId ? parseInt(req.body.bookingId) : null

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: '별점은 1~5 사이여야 해요' })
    }

    if (bookingId) {
      const { rows: bookingRows } = await pool.query(
        `SELECT id FROM bookings WHERE id = $1 AND user_id = $2 AND hospital_code = $3 AND status = 'confirmed'`,
        [bookingId, req.userId, req.params.code]
      )
      if (bookingRows.length === 0) {
        return res.status(400).json({ error: '확정된 예약에 대해서만 리뷰를 남길 수 있어요' })
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO hospital_reviews (hospital_code, user_id, booking_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.code, req.userId, bookingId, rating, comment || null]
    )
    res.json({ review: rows[0] })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: '이미 이 예약에 대한 리뷰를 남기셨어요' })
    }
    console.error(err)
    res.status(500).json({ error: '리뷰를 저장하는 중 문제가 발생했어요' })
  }
})

// ── 약국 리뷰 ──

router.get('/pharmacies/:code/reviews', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.name AS author_name
       FROM pharmacy_reviews r JOIN users u ON u.id = r.user_id
       WHERE r.pharmacy_code = $1
       ORDER BY r.created_at DESC LIMIT 50`,
      [req.params.code]
    )
    const { rows: avgRows } = await pool.query(
      `SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS count
       FROM pharmacy_reviews WHERE pharmacy_code = $1`,
      [req.params.code]
    )
    res.json({
      reviews: rows,
      averageRating: avgRows[0].avg_rating ? Number(avgRows[0].avg_rating) : null,
      count: Number(avgRows[0].count)
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '리뷰를 불러오는 중 문제가 발생했어요' })
  }
})

// 조제 완료(ready)된 처방전이 있어야 리뷰를 남길 수 있어요
router.post('/pharmacies/:code/reviews', authMiddleware, async (req, res) => {
  try {
    const rating = parseInt(req.body.rating)
    const comment = String(req.body.comment || '').trim().slice(0, 500)
    const prescriptionId = req.body.prescriptionId ? parseInt(req.body.prescriptionId) : null

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: '별점은 1~5 사이여야 해요' })
    }

    if (prescriptionId) {
      const { rows: rxRows } = await pool.query(
        `SELECT id FROM prescriptions WHERE id = $1 AND user_id = $2 AND pharmacy_code = $3 AND status = 'ready'`,
        [prescriptionId, req.userId, req.params.code]
      )
      if (rxRows.length === 0) {
        return res.status(400).json({ error: '조제 완료된 처방전에 대해서만 리뷰를 남길 수 있어요' })
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO pharmacy_reviews (pharmacy_code, user_id, prescription_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.code, req.userId, prescriptionId, rating, comment || null]
    )
    res.json({ review: rows[0] })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: '이미 이 처방전에 대한 리뷰를 남기셨어요' })
    }
    console.error(err)
    res.status(500).json({ error: '리뷰를 저장하는 중 문제가 발생했어요' })
  }
})

export default router
