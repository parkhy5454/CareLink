import crypto from 'crypto'
import { pool } from './db.js'
import { sendPushToUser } from './push.js'

// 카카오 알림톡은 카카오 비즈니스 채널 + 발신프로필 + 메시지 템플릿 사전 승인이 필요해서,
// 이 프로토타입에서는 솔라피(Solapi, https://solapi.com) API를 통해 연동하도록 만들어뒀어요.
// 환경변수가 없으면 실제 발송 대신 콘솔에 로그만 남기고 notification_log 테이블에 기록합니다.
const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET
const KAKAO_SENDER_KEY = process.env.KAKAO_SENDER_KEY // 카카오 비즈니스에서 발급받은 발신프로필 키
const KAKAO_SENDER_PHONE = process.env.KAKAO_SENDER_PHONE // 알림톡 실패 시 대체 발송할 SMS 발신번호

const EVENT_TITLES = {
  booking_confirmed: '예약이 확정됐어요',
  booking_rejected: '예약이 거절됐어요',
  prescription_accepted: '약국이 처방전을 수락했어요',
  prescription_rejected: '약국이 처방전을 거절했어요',
  prescription_ready: '조제가 완료됐어요'
}

function isConfigured() {
  return Boolean(SOLAPI_API_KEY && SOLAPI_API_SECRET && KAKAO_SENDER_KEY)
}

// 솔라피 API는 HMAC 서명 인증 방식을 사용합니다.
function buildAuthHeader() {
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(16).toString('hex')
  const signature = crypto
    .createHmac('sha256', SOLAPI_API_SECRET)
    .update(date + salt)
    .digest('hex')
  return `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`
}

async function logNotification({ userId, channel, event, message, success, error }) {
  try {
    await pool.query(
      `INSERT INTO notification_log (user_id, channel, event, message, success, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, channel, event, message, success, error || null]
    )
  } catch (e) {
    console.error('[notify] 로그 저장 실패', e)
  }
}

// event: 'booking_confirmed' | 'booking_rejected' | 'prescription_accepted' | 'prescription_rejected' | 'prescription_ready'
export async function notifyUser({ userId, phone, event, message, templateId }) {
  // 브라우저 웹 푸시는 전화번호와 무관하게, 구독해둔 사용자에게 항상 시도합니다.
  sendPushToUser(userId, { title: EVENT_TITLES[event] || '내건강 알림', body: message })
    .then((result) => {
      if (result.attempted === 0) return // 구독이 없으면 로그를 남기지 않음
      logNotification({
        userId, channel: 'push', event, message,
        success: result.sent > 0,
        error: result.sent === 0 ? `구독 ${result.attempted}건 모두 발송 실패` : null
      })
    })
    .catch((err) => logNotification({ userId, channel: 'push', event, message, success: false, error: err.message }))

  if (!phone) {
    await logNotification({ userId, channel: 'console', event, message, success: false, error: '연락처 없음' })
    return
  }

  if (!isConfigured()) {
    console.log(`[알림 시뮬레이션 → ${phone}] ${message}`)
    await logNotification({ userId, channel: 'console', event, message, success: true })
    return
  }

  try {
    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthHeader()
      },
      body: JSON.stringify({
        message: {
          to: phone.replace(/[^0-9]/g, ''),
          from: KAKAO_SENDER_PHONE,
          kakaoOptions: {
            pfId: KAKAO_SENDER_KEY,
            templateId: templateId || undefined,
            disableSms: false // 알림톡 실패 시 자동으로 SMS로 대체 발송
          },
          text: message
        }
      })
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[notify] 솔라피 발송 실패', data)
      await logNotification({ userId, channel: 'kakao', event, message, success: false, error: JSON.stringify(data).slice(0, 500) })
      return
    }

    await logNotification({ userId, channel: 'kakao', event, message, success: true })
  } catch (err) {
    console.error('[notify] 발송 중 오류', err)
    await logNotification({ userId, channel: 'kakao', event, message, success: false, error: err.message })
  }
}
