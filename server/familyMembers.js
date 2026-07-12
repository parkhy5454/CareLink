import { Router } from 'express'
import { pool } from './db.js'
import { authMiddleware } from './auth.js'

const router = Router()

// 이 계정에 '본인' 프로필이 없으면 만들어줍니다 (예: 이전 단계에서 이미 가입한 계정)
export async function ensureSelfMember(userId, fallbackName) {
  const { rows } = await pool.query(
    `SELECT * FROM family_members WHERE user_id = $1 AND relationship = '본인' LIMIT 1`,
    [userId]
  )
  if (rows.length > 0) return rows[0]

  const { rows: userRows } = await pool.query('SELECT name FROM users WHERE id = $1', [userId])
  const name = userRows[0]?.name || fallbackName || '회원'

  const { rows: inserted } = await pool.query(
    `INSERT INTO family_members (user_id, name, relationship) VALUES ($1, $2, '본인') RETURNING *`,
    [userId, name]
  )
  return inserted[0]
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    await ensureSelfMember(req.userId)
    const { rows } = await pool.query(
      `SELECT * FROM family_members WHERE user_id = $1
       ORDER BY (relationship = '본인') DESC, created_at ASC`,
      [req.userId]
    )
    res.json({ members: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '가족 구성원 목록을 불러오는 중 문제가 발생했어요' })
  }
})

router.post('/', authMiddleware, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim()
    const relationship = String(req.body.relationship || '').trim()
    const birthYear = req.body.birthYear ? parseInt(req.body.birthYear) : null

    if (!name) return res.status(400).json({ error: '이름을 입력해주세요' })
    if (!relationship) return res.status(400).json({ error: '관계를 선택해주세요' })

    const { rows } = await pool.query(
      `INSERT INTO family_members (user_id, name, relationship, birth_year)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.userId, name, relationship, birthYear]
    )
    res.json({ member: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '가족 구성원을 추가하는 중 문제가 발생했어요' })
  }
})

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const name = req.body.name !== undefined ? String(req.body.name).trim() : null
    const relationship = req.body.relationship !== undefined ? String(req.body.relationship).trim() : null
    const birthYear = req.body.birthYear !== undefined
      ? (req.body.birthYear ? parseInt(req.body.birthYear) : null)
      : undefined

    const { rows: existingRows } = await pool.query(
      'SELECT * FROM family_members WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    )
    if (existingRows.length === 0) {
      return res.status(404).json({ error: '가족 구성원을 찾을 수 없어요' })
    }
    const existing = existingRows[0]

    // '본인' 프로필은 관계를 바꿀 수 없게 보호 (계정 소유자 표시가 사라지면 안 되니까)
    const nextName = name || existing.name
    const nextRelationship = existing.relationship === '본인' ? '본인' : (relationship || existing.relationship)
    const nextBirthYear = birthYear === undefined ? existing.birth_year : birthYear

    const { rows } = await pool.query(
      `UPDATE family_members SET name = $1, relationship = $2, birth_year = $3 WHERE id = $4 RETURNING *`,
      [nextName, nextRelationship, nextBirthYear, req.params.id]
    )
    res.json({ member: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '가족 구성원을 수정하는 중 문제가 발생했어요' })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM family_members WHERE id = $1 AND user_id = $2 AND relationship <> '본인' RETURNING *`,
      [req.params.id, req.userId]
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: '삭제할 수 없어요 (본인 프로필은 삭제할 수 없어요)' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '가족 구성원을 삭제하는 중 문제가 발생했어요' })
  }
})

export default router
