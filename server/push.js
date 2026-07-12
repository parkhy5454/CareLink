import { Router } from 'express'
import webpush from 'web-push'
import { pool } from './db.js'
import { authMiddleware } from './auth.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'

const isConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)

if (isConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
} else {
  console.warn(
    '[경고] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY가 설정되어 있지 않아 웹 푸시가 비활성화돼요. ' +
    'node server/generate-vapid-keys.js 로 키를 만들어 Secrets에 추가해주세요.'
  )
}

// 이 사용자가 구독해둔 모든 브라우저(기기)에 푸시를 보냅니다. 만료된 구독은 자동으로 정리해요.
// 반환값: { attempted, sent, failed } — 실제 발송 성공/실패 건수를 그대로 알려줘서 호출한 쪽에서 정확히 로그를 남길 수 있게 해요.
export async function sendPushToUser(userId, { title, body }) {
  if (!isConfigured || !userId) return { attempted: 0, sent: 0, failed: 0 }

  try {
    const { rows } = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId])
    if (rows.length === 0) return { attempted: 0, sent: 0, failed: 0 }

    const payload = JSON.stringify({ title, body })
    let sent = 0
    let failed = 0

    await Promise.all(
      rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          sent += 1
        } catch (err) {
          failed += 1
          // 구독이 만료/취소된 경우(410 Gone, 404) DB에서 정리
          if (err.statusCode === 410 || err.statusCode === 404) {
            await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id])
          } else {
            console.error('[push] 발송 실패', err.statusCode, err.body)
          }
        }
      })
    )

    return { attempted: rows.length, sent, failed }
  } catch (err) {
    console.error('[push] 처리 중 오류', err)
    return { attempted: 0, sent: 0, failed: 0, error: err.message }
  }
}

const router = Router()

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: isConfigured ? VAPID_PUBLIC_KEY : null })
})

router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body.subscription || req.body
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: '구독 정보가 올바르지 않아요' })
    }

    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.userId, endpoint, keys.p256dh, keys.auth]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '구독 정보를 저장하는 중 문제가 발생했어요' })
  }
})

router.post('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body
    if (!endpoint) return res.status(400).json({ error: 'endpoint가 필요해요' })
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.userId])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: '구독 해지 중 문제가 발생했어요' })
  }
})

export default router
